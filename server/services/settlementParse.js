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
  // Accepts an ASCII hyphen or an en dash ("–") as the separator — Demo
  // Cage's account-transaction messages use the latter.
  const [code, ...rest] = line.split(/\s*[-–]\s*/);
  return {
    account_no: code?.trim() || null,
    player_name: rest.join(' - ').trim() || null,
  };
}

/**
 * Demo Cage also sends standalone account-ledger messages ("* 어카운트 입금 *"
 * deposit / "* 어카운트 출금 *" withdrawal) outside of the Game Start -> ...
 * -> Game End step sequence above — no Game #, one message per transaction.
 * Unlike the step sequence, each of these is already a complete, final
 * event, so it's returned without a `step` key: the caller (ingest.js)
 * inserts a new settlements row per message instead of merging into an
 * open game.
 */
function parseDemoCageTransaction(text) {
  const isDeposit = /어카운트\s*입금/.test(text);
  const isWithdrawal = /어카운트\s*출금/.test(text);
  if (!isDeposit && !isWithdrawal) return null;

  const { account_no, player_name } = parseAccountLine(
    firstMatch(text, [/계정\s*[:：]\s*([^\n]+)/i])
  );
  if (!account_no) return null;

  const amount = parseAmount(firstMatch(text, [/금액\s*[:：]\s*([+\-0-9,\s]+)/i]));
  const balance = parseAmount(firstMatch(text, [/잔고\s*[:：]\s*([+\-0-9,\s]+)/i]));
  const date = firstMatch(text, [/날짜\s*[:：]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i]);
  const time = firstMatch(text, [
    /시간\s*[:：]\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  ]);
  const when = date ? new Date(`${date} ${time || ''}`.trim()) : null;
  const settled_at = when && !Number.isNaN(when.getTime()) ? when : null;

  return {
    junket: 'democage',
    account_no,
    account_name: null,
    player_name,
    game_no: null,
    buy_in: isDeposit ? amount : null,
    cashout: isWithdrawal ? amount : null,
    win_loss: null,
    rolling: null,
    commission: null,
    balance,
    settled_at,
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
 * Infinity Cage (gamebook.js). Step-by-step per game, keyed by (account, game #).
 * Labels are Korean-only ("바이인:") or bilingual ("바이인 Buy-in :"), colons may
 * have a leading space, amounts may carry a " - 현금/계좌출금/…" payment-type tag.
 * Split (multi-payment) messages add a 현금/계좌출금/크레딧 breakdown — those are
 * ignored; the running total (바이인 합계 / 총 바이인 / 캐시아웃 합계) is used.
 *
 * Steps: start | addbuyin | cashout | end | delete. Service-payment and
 * balance-check messages have no game # and are left unparsed (logged only).
 */
function infinityStep(text) {
  const h = text.match(/\*([^*\n]{2,80})\*/);
  const head = h ? h[1].trim() : '';
  if (head) {
    if (/게임\s*삭제|Delete\s*Game/i.test(head)) return 'delete';
    if (/게임\s*종료|정산|End\s*Game|Settlement/i.test(head)) return 'end';
    if (/추가\s*바이인|Add\s*Buy-?in/i.test(head)) return 'addbuyin';
    if (/중도\s*캐시\s*아웃|캐시\s*아웃|Cash-?\s*out/i.test(head)) return 'cashout';
    if (/게임\s*시작|Game\s*Start/i.test(head)) return 'start';
    return null; // 서비스 결제 / 잔고 확인 etc. — not a game settlement
  }
  // "Merge settlement" variant: no *header*, but carries the settlement totals.
  if (/바이인\s*합계/.test(text) && /(?:윈\s*\/?\s*로스|Win\s*\/?\s*Loss)/i.test(text)) {
    return 'end';
  }
  return null;
}

function parseInfinityCage(text) {
  if (!/Infinity\s*Cage/i.test(text) && !/계정\s*(?:Account)?\s*[:：]/i.test(text)) {
    return null;
  }

  const step = infinityStep(text);
  if (!step) return null;

  const { account_no, player_name: acctSuffix } = parseAccountLine(
    firstMatch(text, [/계정\s*(?:Account\s*)?[:：]\s*([^\n]+)/i])
  );
  const guest = firstMatch(text, [/게스트\s*(?:Guest\s*)?[:：]\s*([^\n]+)/i]);
  const gameLine = firstMatch(text, [/게임\s*(?:Game\s*)?#\s*[:：]\s*([^\n]+)/i]);
  const game_no = gameLine ? gameLine.split(/\s*-\s*/)[0].trim() : null;
  if (!account_no || !game_no) return null;

  // value after a label, up to " - tag" or end of line
  const num = (labels) =>
    parseAmount(
      firstMatch(
        text,
        labels.map((l) => new RegExp(`${l}\\s*[:：]\\s*(-?[\\d,]+)`, 'i'))
      )
    );

  const date = firstMatch(text, [
    /날짜\s*(?:Date\s*)?[:：]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
  ]);
  const time = firstMatch(text, [
    /시간\s*(?:Time\s*)?[:：]\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:AM|PM)?)/i,
  ]);
  const when = date ? new Date(`${date} ${time || ''}`.trim()) : null;
  const settled_at = when && !Number.isNaN(when.getTime()) ? when : null;

  const totalBuyIn = () =>
    num(['(?:바이인\\s*합계|총\\s*바이인)(?:\\s*Total\\s*Buy-?in)?']);
  const thisBuyIn = () => num(['바이인(?:\\s*Buy-?in)?']);
  const totalCashout = () =>
    num(['(?:캐시\\s*아웃\\s*합계|총\\s*캐시\\s*아웃)(?:\\s*Total\\s*Cashout)?']);
  const thisCashout = () => num(['캐시\\s*아웃(?:\\s*Cash-?\\s*out)?']);
  const balance = () => num(['잔고(?:\\s*Balance)?']);

  const fields = { settled_at };
  if (step === 'start') {
    fields.buy_in = totalBuyIn() ?? thisBuyIn();
    fields.balance = balance();
  } else if (step === 'addbuyin') {
    fields.buy_in = totalBuyIn() ?? thisBuyIn();
    fields.balance = balance();
  } else if (step === 'cashout') {
    fields.cashout = totalCashout() ?? thisCashout();
    fields.balance = balance();
  } else if (step === 'end') {
    fields.buy_in = totalBuyIn();
    fields.cashout = totalCashout();
    fields.win_loss = num(['(?:윈\\s*\\/?\\s*로스)(?:\\s*Win\\s*\\/?\\s*Loss)?']);
    fields.rolling = num(['토탈\\s*롤링(?:\\s*Total\\s*Rolling)?']);
    fields.commission = num(['커미션(?:\\s*Commission)?']);
    fields.balance = balance();
  }
  // step === 'delete' -> no fields; telegram.js removes the row

  return {
    junket: 'infinity',
    account_no,
    player_name: guest || acctSuffix || null,
    game_no,
    step,
    isFinal: step === 'end',
    fields,
  };
}

const CLAUDE_BULK_ROWS_MARKER = '__CLAUDE_BULK_ROWS__';

/**
 * telegram.js's ocrPhoto() tries Claude vision on the bulk report table
 * (see visionExtract.js) before falling back to raw tesseract text, and
 * marks a successful extraction with CLAUDE_BULK_ROWS_MARKER + a JSON array
 * so this layer never re-runs the regex fallback on top of it. Kept
 * independent of visionExtract.js's own copy of the marker string (parse
 * and vision-call concerns don't need to share an import) — if you rename
 * one, rename both.
 */
function parseClaudeBulkRows(text) {
  const idx = text.indexOf(CLAUDE_BULK_ROWS_MARKER);
  if (idx === -1) return null;

  let raw;
  try {
    raw = JSON.parse(text.slice(idx + CLAUDE_BULK_ROWS_MARKER.length));
  } catch {
    return null; // malformed JSON — let the caller fall through
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const parseDate = (s) => {
    if (!s) return null;
    const when = new Date(`${String(s).replace(',', '')} ${new Date().getFullYear()}`);
    return Number.isNaN(when.getTime()) ? null : when;
  };
  const num = (v) => (v == null || v === '' ? null : Number(v));

  const rows = raw
    .filter((r) => r?.account_no)
    .map((r) => ({
      junket: 'infinity',
      account_no: String(r.account_no),
      account_name: null,
      player_name: r.player_name ? String(r.player_name).trim() : null,
      guest: r.guest ? String(r.guest).trim() : null,
      game_no: null,
      buy_in: num(r.buy_in),
      cashout: num(r.cashout),
      rolling: num(r.rolling),
      commission: num(r.commission),
      win_loss: num(r.win_loss),
      balance: null,
      game_start: parseDate(r.game_start),
      settled_at: parseDate(r.game_end) ?? parseDate(r.game_start),
    }));

  return rows.length ? { junket: 'infinity', rows } : null;
}

/**
 * Infinity Cage's bulk daily-report screenshot: one table image covering
 * many already-settled games, columns GAME START | ACCT No | GUEST |
 * BUY-IN | CASH-OUT | ROLLING | RATE | COMMISSION | WIN/LOSS | GAME END.
 * Unlike parseInfinityCage() (one step per message), every row here is
 * already final, so this returns `{ junket, rows: [...] }` — ingest.js
 * inserts one settlements row per entry instead of merging steps.
 * Only reached when Claude vision (parseClaudeBulkRows() above) wasn't
 * available or didn't run — the regex fallback below.
 *
 * Shaped against a REAL captured OCR sample (not just the rendered mockup),
 * which turned out much noisier than a clean table: border "|" characters
 * scattered mid-row, and individual numbers sometimes OCR'd into garbage
 * with no digits at all ("sooo]", "of", "qf", "미 ee]") where tesseract
 * couldn't read them. A single rigid per-row regex breaks the instant one
 * token is garbled, so instead each row is parsed by anchor + region:
 * find the account code, the parenthesized name, and the "N.NN%" rate
 * (the one token that OCR'd cleanly on every row) as fixed points, then
 * pull whatever valid amount-shaped tokens sit in the regions between them
 * (name→rate = buy-in/cash-out/rolling, rate→game-end = commission/win-loss).
 * If a region doesn't yield the expected count, every field in it is left
 * null rather than guessed at a wrong position — a visible gap beats a
 * silently wrong number in settlement data.
 */
function parseInfinityBulkReport(text) {
  if (!/GAME\s*START/i.test(text) || !/GAME\s*END/i.test(text) || !/ROLLING/i.test(text)) {
    return null;
  }

  // \s*,?\s* around the day/comma (not just a trailing ,?) because Google
  // Vision's word tokenizer treats punctuation as its own token — "Sep 21,
  // 22:19" comes back as "Sep 21 , 22:19", with a space *before* the comma
  // too, which a plain `,?` right after \d{1,2} won't match.
  const dateRe = /[A-Za-z]{3}\s*\d{1,2}\s*,?\s*\d{1,2}:\d{2}/g;
  const acctRe = /[A-Z]{2,8}\d{2,}/;
  const rateRe = /\d+(?:\.\d+)?\s*%/;
  // Bare digit runs of any length (not just 3+) — a genuine cash-out of "0"
  // is a single token GCV reads cleanly, not noise the way a stray digit
  // could be from tesseract's per-character garbling. Region boundaries
  // (name→rate, rate→game-end) already keep this from picking up anything
  // outside a validated row.
  const amountRe = /-?\d{1,3}(?:,\d{3})+|-?\d+/g;

  const parseDate = (s) => {
    if (!s) return null;
    const when = new Date(`${s.replace(/\s*,\s*/, ' ')} ${new Date().getFullYear()}`);
    return Number.isNaN(when.getTime()) ? null : when;
  };
  const amountsIn = (slice) => [...slice.matchAll(amountRe)].map((m) => parseAmount(m[0]));

  const rows = [];
  for (const rawLine of text.replace(/\|/g, ' ').split('\n')) {
    const dates = [...rawLine.matchAll(dateRe)];
    const acctMatch = rawLine.match(acctRe);
    const rateMatch = rawLine.match(rateRe);
    if (dates.length < 1 || !acctMatch || !rateMatch) continue; // not a data row

    const nameMatch = rawLine.slice(acctMatch.index).match(/\(([^)]*)\)/);
    const nameEnd = nameMatch
      ? acctMatch.index + nameMatch.index + nameMatch[0].length
      : acctMatch.index + acctMatch[0].length;
    const gameStart = dates[0];
    const gameEnd = dates.length > 1 ? dates[dates.length - 1] : null;

    const midSlice = rawLine.slice(nameEnd, rateMatch.index);
    const midMatches = [...midSlice.matchAll(amountRe)];
    const midAmounts = midMatches.map((m) => parseAmount(m[0]));
    // GUEST is whatever non-numeric text sits between the player's name and
    // the first amount (e.g. "Bae Jongjin") — empty on most rows.
    const guestText = (midMatches.length ? midSlice.slice(0, midMatches[0].index) : midSlice)
      .replace(/\s+/g, ' ')
      .trim();
    const tailAmounts = amountsIn(
      rawLine.slice(rateMatch.index + rateMatch[0].length, gameEnd ? gameEnd.index : rawLine.length)
    );
    const [buy_in, cashout, rolling] = midAmounts.length === 3 ? midAmounts : [null, null, null];
    const [commission, win_loss] = tailAmounts.length === 2 ? tailAmounts : [null, null];

    rows.push({
      junket: 'infinity',
      account_no: acctMatch[0],
      account_name: null,
      player_name: nameMatch ? cleanName(nameMatch[1]) : null,
      guest: guestText || null,
      game_no: null,
      buy_in,
      cashout,
      rolling,
      commission,
      win_loss,
      balance: null,
      game_start: parseDate(gameStart[0]),
      settled_at: parseDate(gameEnd ? gameEnd[0] : gameStart[0]),
    });
  }

  return rows.length ? { junket: 'infinity', rows } : null;
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

  // Checked before every other format: an unambiguous marker, not a guess.
  const claudeBulk = parseClaudeBulkRows(text);
  if (claudeBulk) return claudeBulk;

  const infinity = parseInfinityCage(text);
  if (infinity) return infinity;

  const infinityBulk = parseInfinityBulkReport(text);
  if (infinityBulk) return infinityBulk;

  // Ours but the step header wasn't recognised — don't let Win9 mangle it.
  if (/Infinity\s*Cage/i.test(text)) return null;

  const democageTxn = parseDemoCageTransaction(text);
  if (democageTxn) return democageTxn;

  const democage = parseDemoCage(text);
  if (democage) return democage;

  // Prefer Galaxy when OCR/report markers present
  const galaxy = parseGalaxy(text);
  if (galaxy) return galaxy;

  const win9 = parseWin9(text);
  if (win9) return win9;

  return null;
}
