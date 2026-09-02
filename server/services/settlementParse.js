/**
 * Normalize junket settlement messages (Win9 text + Galaxy OCR) into shared fields.
 */

function parseAmount(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/,/g, '').replace(/\s/g, '');
  const m = cleaned.match(/([+-]?\d+)/);
  if (!m) return null;
  return Number(m[1]);
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] != null && String(m[1]).trim()) {
      return String(m[1]).trim();
    }
  }
  return null;
}

function countFilled(parsed) {
  return [
    parsed.account_no,
    parsed.account_name,
    parsed.player_name,
    parsed.game_no,
    parsed.buy_in,
    parsed.cashout,
    parsed.win_loss,
    parsed.rolling,
    parsed.commission,
  ].filter((v) => v != null && v !== '').length;
}

function isUseful(parsed) {
  const amounts = [
    parsed.buy_in,
    parsed.cashout,
    parsed.win_loss,
    parsed.rolling,
    parsed.commission,
  ].filter((v) => v != null).length;
  return Boolean(parsed.account_no) && amounts >= 2;
}

function parseWin9Date(text) {
  const date = firstMatch(text, [
    /날짜\s*Date\s*[:：]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
    /Date\s*[:：]?\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
    /날짜\s*[:：]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
  ]);
  const time = firstMatch(text, [
    /시간\s*Time\s*[:：]?\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
    /Time\s*[:：]?\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
    /시간\s*[:：]\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  ]);
  if (!date) return null;
  const when = new Date(`${date} ${time || ''}`.trim());
  return Number.isNaN(when.getTime()) ? null : when;
}

function parseWin9(text) {
  const looksWin9 =
    /어카운트|계정\s*Account|바이인|캐시아웃|윈\s*\/?\s*로스|윈로스|토탈롤링|커미션/i.test(
      text
    ) ||
    // Fully English variant of the same report (no Korean at all). Require
    // several labels together, and no "Game #:" — that's Demo Cage's marker.
    (/Account:/i.test(text) &&
      /Buy-?in:/i.test(text) &&
      /Total\s*Cashout:/i.test(text) &&
      !/Game\s*#:/i.test(text));
  if (!looksWin9) return null;

  const accountLine = firstMatch(text, [
    /계정\s*Account\s*[:：]?\s*([^\n]+)/i,
    /어카운트\s*[:：]?\s*([^\n]+)/i,
    /계정\s*[:：]\s*([^\n]+)/i,
    /Account\s*[:：]\s*([^\n]+)/i,
  ]);

  let account_no = null;
  let account_name = null;
  let player_name = null;

  if (accountLine) {
    const paren = accountLine.match(/\(([^)]+)\)/);
    if (paren) account_name = paren[1].trim();

    // e.g. "WN 480-8  (박은새)  정승식"
    const noParen = accountLine.replace(/\([^)]*\)/g, ' ').trim();
    const tokens = noParen.split(/\s{2,}|\s+(?=[가-힣A-Z])/).filter(Boolean);
    // Prefer token that looks like account code (letters+digits)
    const code = noParen.match(/([A-Za-z]{1,10}\s*\d[\w-]*)/);
    account_no = code ? code[1].replace(/\s+/g, ' ').trim() : tokens[0] || null;

    const afterCode = noParen
      .replace(account_no || '', '')
      .trim()
      .replace(/\s+/g, ' ');
    if (afterCode && !account_name) {
      account_name = afterCode;
    } else if (afterCode && account_name && afterCode !== account_name) {
      player_name = afterCode;
    }
  }

  if (!account_name) {
    account_name = firstMatch(text, [
      /\*\s*종료\s*\/\s*\(([^)]+)\)/,
      /\*\s*게임종료[^*]*\*/,
      /\(([^)]+)\)/,
    ]);
  }

  const buy_in = parseAmount(
    firstMatch(text, [
      /바이인\s*Buy-?in\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /바이인\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /(?<!Total\s)Buy-?in\s*[:：]?\s*([+\-0-9,\s]+)/i,
    ])
  );
  const cashout = parseAmount(
    firstMatch(text, [
      /캐시아웃\s*합계\s*Total\s*Cashout\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /Total\s*Cashout\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /캐시아웃\s*합계\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /캐시아웃\s*[:：]?\s*([+\-0-9,\s]+)/i,
    ])
  );
  const win_loss = parseAmount(
    firstMatch(text, [
      /윈\s*\/\s*로스\s*Win\s*\/\s*Loss\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /Win\s*\/\s*Loss\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /윈\s*\/\s*로스\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /윈로스\s*[:：]?\s*([+\-0-9,\s]+)/i,
    ])
  );
  const rolling = parseAmount(
    firstMatch(text, [
      /토탈롤링\s*Total\s*Rolling\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /Total\s*Rolling\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /토탈롤링\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /(?:^|\n)\s*롤링\s*[:：]?\s*([+\-0-9,\s]+)/im,
    ])
  );
  const commission = parseAmount(
    firstMatch(text, [
      /커미션\s*Commission\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /Commission\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /커미션\s*[:：]?\s*([+\-0-9,\s]+)/i,
    ])
  );
  const balance = parseAmount(
    firstMatch(text, [
      /어카운트\s*잔액\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /잔고\s*[:：]?\s*([+\-0-9,\s]+)/i,
      /Balance\s*[:：]?\s*([+\-0-9,\s]+)/i,
    ])
  );

  const parsed = {
    junket: 'win9',
    account_no,
    account_name,
    player_name,
    game_no: null,
    buy_in,
    cashout,
    win_loss,
    rolling,
    commission,
    balance,
    settled_at: parseWin9Date(text),
  };

  return isUseful(parsed) ? parsed : null;
}

function demoCageStep(text) {
  // Each step header ends in a lone "*", which is what tells it apart from
  // the same word used as a field label (e.g. "Cashout *" vs "Cashout: 200,000").
  if (/Game\s*End\s*\/\s*Settlement\s*\*/i.test(text)) return 'end';
  if (/Additional\s*Buy-?in\s*\*/i.test(text)) return 'addbuyin';
  if (/Cashout\s*\*/i.test(text)) return 'cashout';
  if (/Game\s*Start\s*\*/i.test(text)) return 'start';
  return null;
}

function parseAccountLine(line) {
  if (!line) return { account_no: null, player_name: null };
  const [code, ...rest] = line.split(/\s*-\s*/);
  return {
    account_no: code?.trim() || null,
    player_name: rest.join(' - ').trim() || null,
  };
}

/**
 * Demo Cage sends one message per step of a single game (Game Start ->
 * Additional Buy-in -> Cashout -> Game End/Settlement), each only reporting
 * what changed. Unlike Win9/Galaxy this is not a single final message, so the
 * caller upserts into one row per (account, game #) instead of inserting a
 * new row per message.
 */
function parseDemoCage(text) {
  // Not every step message repeats the "Demo Cage" banner (Game End/Settlement
  // in particular often omits it), so the step header + Account/Game# below is
  // the real marker — the "*" -terminated headers don't appear in Win9/Galaxy.
  const step = demoCageStep(text);
  if (!step) return null;

  const { account_no, player_name } = parseAccountLine(
    firstMatch(text, [/Account:\s*([^\n]+)/i])
  );
  const game_no = firstMatch(text, [/Game\s*#:\s*(\d+)/i]);
  if (!account_no || !game_no) return null;

  const balance = parseAmount(firstMatch(text, [/Balance:\s*([+\-0-9,\s]+)/i]));
  const date = firstMatch(text, [/Date:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i]);
  const time = firstMatch(text, [
    /Time:\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  ]);
  const when = date ? new Date(`${date} ${time || ''}`.trim()) : null;
  const settled_at = when && !Number.isNaN(when.getTime()) ? when : null;

  const fields = { balance, settled_at };

  if (step === 'start') {
    fields.buy_in = parseAmount(
      firstMatch(text, [/(?<!Total\s)Buy-?in:\s*([+\-0-9,\s]+)/i])
    );
  } else if (step === 'addbuyin') {
    fields.buy_in = parseAmount(
      firstMatch(text, [
        /Total\s*Buy-?in:\s*([+\-0-9,\s]+)/i,
        /(?<!Total\s)Buy-?in:\s*([+\-0-9,\s]+)/i,
      ])
    );
  } else if (step === 'cashout') {
    fields.cashout = parseAmount(
      firstMatch(text, [
        /Total\s*Cashout:\s*([+\-0-9,\s]+)/i,
        /(?<!Total\s)Cashout:\s*([+\-0-9,\s]+)/i,
      ])
    );
  } else if (step === 'end') {
    fields.buy_in = parseAmount(firstMatch(text, [/Total\s*Buy-?in:\s*([+\-0-9,\s]+)/i]));
    fields.cashout = parseAmount(
      firstMatch(text, [/Total\s*Cashout:\s*([+\-0-9,\s]+)/i])
    );
    fields.win_loss = parseAmount(firstMatch(text, [/Win\s*\/\s*Loss:\s*([+\-0-9,\s]+)/i]));
    fields.rolling = parseAmount(
      firstMatch(text, [/Total\s*Rolling:\s*([+\-0-9,\s]+)/i])
    );
    fields.commission = parseAmount(
      firstMatch(text, [/Commission:\s*([+\-0-9,\s]+)/i])
    );
  }

  return {
    junket: 'democage',
    account_no,
    player_name,
    game_no,
    step,
    isFinal: step === 'end',
    fields,
  };
}

/**
 * Infinity Cage — step-by-step like Demo Cage, but each label is bilingual
 * (Korean + English, e.g. "계정 Account : ...") and colons have a leading space.
 * Steps: Game Start -> Add Buy-in (repeatable) -> End Game. Sometimes a
 * balance-check message.
 */
function infinityStep(text) {
  const h = text.match(/\*([^*\n]{2,80})\*/);
  const head = h ? h[1] : '';
  if (/게임\s*종료|정산|End\s*Game/i.test(head)) return 'end';
  if (/추가\s*바이인|Add\s*Buy-?in/i.test(head)) return 'addbuyin';
  if (/캐시\s*아웃|Cash\s*-?\s*out/i.test(head)) return 'cashout';
  if (/게임\s*시작|Game\s*Start/i.test(head)) return 'start';
  if (/잔고\s*확인|Balance\s*Check/i.test(head)) return 'balance';
  return null;
}

function parseInfinityCage(text) {
  const marker =
    /Infinity\s*Cage/i.test(text) ||
    /계정\s*Account|게스트\s*Guest/i.test(text);
  if (!marker) return null;

  const step = infinityStep(text);
  if (!step) return null;

  const accountLine = firstMatch(text, [/(?:계정\s*)?Account\s*[:：]\s*([^\n]+)/i]);
  const { account_no, player_name: acctSuffix } = parseAccountLine(accountLine);
  const guest = firstMatch(text, [/(?:게스트\s*)?Guest\s*[:：]\s*([^\n]+)/i]);
  const game_no = firstMatch(text, [/(?:게임\s*)?Game\s*#\s*[:：]?\s*(\d+)/i]);
  if (!account_no || !game_no) return null;

  const num = (patterns) => parseAmount(firstMatch(text, patterns));
  const date = firstMatch(text, [
    /(?:날짜\s*)?Date\s*[:：]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
  ]);
  const time = firstMatch(text, [
    /(?:시간\s*)?Time\s*[:：]\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  ]);
  const when = date ? new Date(`${date} ${time || ''}`.trim()) : null;
  const settled_at = when && !Number.isNaN(when.getTime()) ? when : null;

  const thisBuyIn = () =>
    num([/(?<!Total\s)(?:바이인\s*)?Buy-?in\s*[:：]\s*([+\-0-9,\s]+)/i]);
  const totalBuyIn = () =>
    num([/(?:바이인\s*합계\s*)?Total\s*Buy-?in\s*[:：]\s*([+\-0-9,\s]+)/i]);

  const fields = { settled_at };
  if (step === 'start') {
    fields.buy_in = thisBuyIn();
  } else if (step === 'addbuyin') {
    fields.buy_in = totalBuyIn() ?? thisBuyIn();
  } else if (step === 'cashout') {
    fields.cashout = num([
      /(?:캐시아웃\s*합계\s*)?Total\s*Cashout\s*[:：]\s*([+\-0-9,\s]+)/i,
      /Cashout\s*[:：]\s*([+\-0-9,\s]+)/i,
    ]);
  } else if (step === 'balance') {
    fields.balance = num([
      /(?:잔고\s*)?Balance\s*[:：]\s*([+\-0-9,\s]+)/i,
      /잔고\s*[:：]\s*([+\-0-9,\s]+)/i,
    ]);
  } else if (step === 'end') {
    fields.buy_in = totalBuyIn();
    fields.cashout = num([/Total\s*Cashout\s*[:：]\s*([+\-0-9,\s]+)/i]);
    fields.win_loss = num([/Win\s*\/?\s*Loss\s*[:：]\s*([+\-0-9,\s]+)/i]);
    fields.rolling = num([/Total\s*Rolling\s*[:：]\s*([+\-0-9,\s]+)/i]);
    fields.commission = num([/Commission\s*[:：]\s*([+\-0-9,\s]+)/i]);
  }

  return {
    junket: 'infinitycage',
    account_no,
    player_name: guest || acctSuffix || null,
    game_no,
    step,
    isFinal: step === 'end',
    fields,
  };
}

function cleanName(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/[가-힣]+/g, ' ')
    .replace(/\b(어카운트|번호|에이전트|이름|플레이어|게임)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

/** Find a money amount shortly after a label (OCR-tolerant). */
function amountAfter(text, labelRe, { until = null, window = 80, pick = 'first' } = {}) {
  const m = text.match(labelRe);
  if (!m) return null;
  let slice = text.slice(m.index + m[0].length);
  if (until) {
    const stop = slice.search(until);
    if (stop >= 0) slice = slice.slice(0, stop);
  }
  slice = slice.slice(0, window);
  const hits = [...slice.matchAll(/[+\-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+\-]?\d{4,}/g)];
  if (!hits.length) return null;
  const chosen = pick === 'last' ? hits[hits.length - 1][0] : hits[0][0];
  return parseAmount(chosen);
}

function parseGalaxy(text) {
  const looksGalaxy =
    /ACCOUNT\s*NO|END\s*GAME|TOTAL\s*BUY-?IN|ROLLING\s*COMMI|AGENT\s*NAME|PLAYER\s*NAME/i.test(
      text
    );
  if (!looksGalaxy) return null;

  // Keep newlines as spaces so label/value on separate OCR lines still match
  const flat = text.replace(/\s+/g, ' ').trim();

  const account_no = cleanName(
    firstMatch(flat, [
      /ACCOUNT\s*NO\.?\s*(?:어카운트\s*번호)?\s*(.+?)(?=\s*AGENT\s*NAME)/i,
      /어카운트\s*번호\s*(.+?)(?=\s*AGENT\s*NAME|\s*에이전트)/i,
    ])
  );
  const account_name = cleanName(
    firstMatch(flat, [
      /AGENT\s*NAME\s*(?:에이전트\s*이름)?\s*(.+?)(?=\s*PLAYER\s*NAME)/i,
      /에이전트\s*이름\s*(.+?)(?=\s*PLAYER\s*NAME|\s*플레이어)/i,
    ])
  );
  const player_name = cleanName(
    firstMatch(flat, [
      /PLAYER\s*NAME\s*(.+?)(?=\s*GAME\s*NO)/i,
    ])
  );
  const game_no = firstMatch(flat, [
    /GAME\s*NO\.?\s*(?:게임\s*번호)?\s*(#?\s*\d+)/i,
    /게임\s*번호\s*(#?\s*\d+)/i,
  ]);

  const buy_in = amountAfter(flat, /TOTAL\s*BUY-?IN/i, {
    until: /CHIP\s*RETURN|칩\s*리턴|\bTIP\b|WIN\s*\/?\s*LOSS/i,
    pick: 'first',
  });
  const cashout =
    amountAfter(flat, /\bCO\b/i, {
      until: /\bTIP\b|WIN\s*\/?\s*LOSS|ROLLER/i,
      pick: 'first',
    }) ??
    amountAfter(flat, /CHIP\s*RETURN|칩\s*리턴/i, {
      until: /\bTIP\b|WIN\s*\/?\s*LOSS|롤러/i,
      pick: 'last',
    });
  const win_loss = amountAfter(flat, /WIN\s*\/?\s*LOSS|윈\s*로스|윈로스/i, {
    until: /ROLLING|롤링/i,
    pick: 'first',
  });
  const rolling = amountAfter(flat, /ROLLING(?!\s*COMMI)/i, {
    until: /ROLLING\s*COMMI|FNB|AMOUNT\s*TO\s*PAY/i,
    pick: 'first',
  });
  const commission =
    amountAfter(flat, /ROLLING\s*COMMI/i, {
      until: /FNB|AMOUNT\s*TO\s*PAY|CAGE/i,
      pick: 'first',
    }) ??
    amountAfter(flat, /AMOUNT\s*TO\s*PAY/i, {
      until: /CAGE|담당자/i,
      pick: 'first',
    });

  const date = firstMatch(text, [
    /([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2})/,
  ]);
  let settled_at = null;
  if (date) {
    const when = new Date(date);
    if (!Number.isNaN(when.getTime())) settled_at = when;
  }

  const parsed = {
    junket: 'galaxy',
    account_no,
    account_name,
    player_name,
    game_no: game_no?.replace(/\s+/g, '') || null,
    buy_in,
    cashout,
    win_loss,
    rolling,
    commission,
    settled_at,
  };

  // Galaxy OCR is noisy — accept if we got account + 2 amounts OR 4+ fields
  if (isUseful(parsed) || (countFilled(parsed) >= 4 && amountsOk(parsed))) {
    return parsed;
  }
  return null;
}

function amountsOk(parsed) {
  return (
    [
      parsed.buy_in,
      parsed.cashout,
      parsed.win_loss,
      parsed.rolling,
      parsed.commission,
    ].filter((v) => v != null).length >= 2
  );
}

/**
 * @returns {null | {
 *   junket: string,
 *   account_no: string|null,
 *   account_name: string|null,
 *   player_name: string|null,
 *   game_no: string|null,
 *   buy_in: number|null,
 *   cashout: number|null,
 *   win_loss: number|null,
 *   rolling: number|null,
 *   commission: number|null,
 *   settled_at: Date|null,
 * }}
 */
export function parseSettlement(text) {
  if (!text || !String(text).trim()) return null;

  const infinity = parseInfinityCage(text);
  if (infinity) return infinity;
  // Ours but the step header wasn't recognised — don't let Win9 mangle it.
  if (/Infinity\s*Cage/i.test(text)) return null;

  const democage = parseDemoCage(text);
  if (democage) return democage;

  // Prefer Galaxy when OCR/report markers present
  const galaxy = parseGalaxy(text);
  if (galaxy) return galaxy;

  const win9 = parseWin9(text);
  if (win9) return win9;

  return null;
}
