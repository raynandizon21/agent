// Draws a guest statement (Statements page) or a guest's game records
// table (Guests page) onto a <canvas> and returns it as a PNG Blob.
// Hand-drawn with the 2D canvas API (no html-to-image dependency) so the
// output looks the same on every device.

import { JUNKET_LABELS, formatAmount, formatSigned } from './trips';

const W = 720; // statement width; rendered at SCALE× for sharp text
const SCALE = 2;
const PAD = 32;

const C = {
  bg: '#020617',
  card: '#0f172a',
  cell: '#020617',
  line: '#1e293b',
  muted: '#64748b',
  text: '#cbd5e1',
  strong: '#f1f5f9',
  blue: '#60a5fa',
  amber: '#fbbf24',
  green: '#34d399',
  red: '#fb7185',
};

const SANS = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const wlColor = (v) => (v > 0 ? C.green : v < 0 ? C.red : C.strong);

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function text(ctx, str, x, y, { font = `500 14px ${SANS}`, color = C.text, align = 'left', maxWidth } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  let s = String(str);
  if (maxWidth) {
    while (s.length > 1 && ctx.measureText(s).width > maxWidth) s = s.slice(0, -1);
    if (s !== String(str)) s = `${s.slice(0, -1)}…`;
  }
  ctx.fillText(s, x, y);
}

function fmtWhen(value) {
  const d = new Date(value);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

// Draw once with a fake height to measure, then again at the real height.
function layout(ctx, data, draw) {
  const { guest, periodText, totals, byJunket, rows, includeGames } = data;
  const inner = W - PAD * 2;
  let y = PAD;

  // Header
  if (draw) text(ctx, 'PLAYER STATEMENT', PAD, y + 12, { font: `700 11px ${SANS}`, color: C.muted });
  if (draw) text(ctx, periodText, W - PAD, y + 12, { font: `600 13px ${SANS}`, color: C.text, align: 'right' });
  y += 44;
  if (draw) text(ctx, guest.guest_name, PAD, y, { font: `800 26px ${SANS}`, color: C.strong, maxWidth: inner });
  y += 24;
  const sub = [guest.guest_code, guest.agent_name ? `Agent ${guest.agent_name}` : null].filter(Boolean).join('  ·  ');
  if (sub) {
    if (draw) text(ctx, sub, PAD, y, { font: `600 13px ${SANS}`, color: C.blue });
    y += 20;
  }
  y += 8;
  if (draw) {
    ctx.fillStyle = C.line;
    ctx.fillRect(PAD, y, inner, 1);
  }
  y += 20;

  // Totals: 3 × 2 cells
  const cells = [
    ['GAMES', String(totals.games), C.strong],
    ['BUY-IN', formatAmount(totals.buy_in), C.strong],
    ['CASHOUT', formatAmount(totals.cashout), C.strong],
    ['ROLLING', formatAmount(totals.rolling), C.strong],
    ['COMMISSION', formatAmount(totals.commission), C.amber],
    ['WIN / LOSS', formatSigned(totals.win_loss), wlColor(totals.win_loss)],
  ];
  const gap = 8;
  const cw = (inner - gap * 2) / 3;
  const ch = 62;
  cells.forEach(([label, value, color], i) => {
    const cx = PAD + (i % 3) * (cw + gap);
    const cy = y + Math.floor(i / 3) * (ch + gap);
    if (!draw) return;
    roundRect(ctx, cx, cy, cw, ch, 10, C.cell, C.line);
    text(ctx, label, cx + 14, cy + 22, { font: `700 10px ${SANS}`, color: C.muted });
    text(ctx, value, cx + 14, cy + 47, { font: `700 19px ${MONO}`, color, maxWidth: cw - 28 });
  });
  y += ch * 2 + gap + 24;

  // By account (only when there's more than one)
  if (byJunket.length > 1) {
    if (draw) text(ctx, 'BY ACCOUNT', PAD, y, { font: `700 11px ${SANS}`, color: C.muted });
    y += 12;
    for (const b of byJunket) {
      if (draw) {
        roundRect(ctx, PAD, y, inner, 40, 8, C.cell, C.line);
        text(ctx, `${JUNKET_LABELS[b.junket] || b.junket}  ${b.account_no}`, PAD + 14, y + 25, {
          font: `600 13px ${SANS}`,
          color: C.text,
          maxWidth: inner * 0.38,
        });
        const x3 = W - PAD - 14;
        text(ctx, formatSigned(b.totals.win_loss), x3, y + 25, { font: `600 13px ${MONO}`, color: wlColor(b.totals.win_loss), align: 'right' });
        text(ctx, formatAmount(b.totals.commission), x3 - 120, y + 25, { font: `600 13px ${MONO}`, color: C.amber, align: 'right' });
        text(ctx, formatAmount(b.totals.rolling), x3 - 240, y + 25, { font: `600 13px ${MONO}`, color: C.strong, align: 'right' });
      }
      y += 46;
    }
    y += 14;
  }

  // Games
  if (includeGames) {
    if (draw) text(ctx, 'GAMES', PAD, y, { font: `700 11px ${SANS}`, color: C.muted });
    y += 12;
    if (rows.length === 0) {
      if (draw) {
        roundRect(ctx, PAD, y, inner, 44, 8, C.cell, C.line);
        text(ctx, 'No games in this period.', W / 2, y + 27, { font: `500 13px ${SANS}`, color: C.muted, align: 'center' });
      }
      y += 58;
    } else {
      const rowH = 34;
      const headH = 30;
      const boxH = headH + rows.length * rowH;
      const xW = W - PAD - 14;
      const xC = xW - 120;
      const xR = xC - 120;
      if (draw) {
        roundRect(ctx, PAD, y, inner, boxH, 8, C.cell, C.line);
        const hf = { font: `700 10px ${SANS}`, color: C.muted };
        text(ctx, 'DATE / ACCOUNT', PAD + 14, y + 19, hf);
        text(ctx, 'ROLLING', xR, y + 19, { ...hf, align: 'right' });
        text(ctx, 'COMMISSION', xC, y + 19, { ...hf, align: 'right' });
        text(ctx, 'W/L', xW, y + 19, { ...hf, align: 'right' });
      }
      let ry = y + headH;
      rows.forEach((r) => {
        if (draw) {
          ctx.fillStyle = C.line;
          ctx.fillRect(PAD + 1, ry, inner - 2, 1);
          const wl = Number(r.win_loss) || 0;
          text(ctx, `${fmtWhen(r.created_at)}  ${JUNKET_LABELS[r.junket] || r.junket} ${r.account_no || ''}`, PAD + 14, ry + 22, {
            font: `500 12px ${SANS}`,
            color: C.text,
            maxWidth: xR - 110 - PAD - 14,
          });
          text(ctx, formatAmount(r.eff.rolling), xR, ry + 22, { font: `500 12px ${MONO}`, color: C.strong, align: 'right' });
          text(ctx, formatAmount(r.eff.commission), xC, ry + 22, { font: `500 12px ${MONO}`, color: C.amber, align: 'right' });
          text(ctx, formatSigned(wl), xW, ry + 22, { font: `500 12px ${MONO}`, color: wlColor(wl), align: 'right' });
        }
        ry += rowH;
      });
      y += boxH + 20;
    }
  }

  // Footer
  if (draw) text(ctx, `Generated ${new Date().toLocaleString()}`, PAD, y + 4, { font: `500 11px ${SANS}`, color: C.muted });
  y += 4 + PAD - 8;
  return y;
}

// Measure with a throwaway context, then draw at the real height.
async function render(width, layoutFn, data) {
  // Make sure the web fonts are ready so canvas doesn't fall back mid-draw.
  if (document.fonts?.ready) await document.fonts.ready;

  const measure = document.createElement('canvas').getContext('2d');
  const H = Math.ceil(layoutFn(measure, data, false));

  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, H);
  roundRect(ctx, 8, 8, width - 16, H - 16, 16, C.card, C.line);
  layoutFn(ctx, data, true);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), 'image/png')
  );
}

export function renderStatementImage(data) {
  return render(W, layout, data);
}

// ---- Game Records (Guests page modal) ----
// Same columns as the modal's desktop table minus JUNKET and ACCOUNT NO.:
// DATE · GUEST · BUY-IN · CASHOUT · ROLLING · RATE · COMMISSION · W/L.
// `rows` already carry the numbers as *shown* (display-only custom rates).
const GW = 980;

function recordsLayout(ctx, data, draw) {
  const { guest, subtitle, rows, totals } = data;
  const inner = GW - PAD * 2;
  let y = PAD;

  if (draw) text(ctx, 'GAME RECORDS', PAD, y + 12, { font: `700 11px ${SANS}`, color: C.muted });
  if (draw && subtitle) text(ctx, subtitle, GW - PAD, y + 12, { font: `600 13px ${SANS}`, color: C.text, align: 'right' });
  y += 44;
  if (draw) text(ctx, guest.guest_name, PAD, y, { font: `800 26px ${SANS}`, color: C.strong, maxWidth: inner });
  y += 24;
  const sub = [guest.guest_code, guest.agent_name ? `Agent ${guest.agent_name}` : null].filter(Boolean).join('  ·  ');
  if (sub) {
    if (draw) text(ctx, sub, PAD, y, { font: `600 13px ${SANS}`, color: C.blue });
    y += 20;
  }
  y += 16;

  // Column anchors: text columns are left-aligned, numbers right-aligned.
  const L = PAD + 16;
  const xDate = L;
  const xGuest = L + 140;
  const xWL = GW - PAD - 16;
  const xCom = xWL - 120;
  const xRate = xCom - 110;
  const xRoll = xRate - 80;
  const xCash = xRoll - 120;
  const xBuy = xCash - 110;
  const guestMax = xBuy - 100 - xGuest;

  const headH = 36;
  const rowH = 38;
  const footH = 42;
  const boxH = headH + rows.length * rowH + footH;

  if (draw) {
    roundRect(ctx, PAD, y, inner, boxH, 10, C.cell, C.line);
    const hf = { font: `700 10.5px ${SANS}`, color: C.muted };
    const hy = y + 23;
    text(ctx, 'DATE', xDate, hy, hf);
    text(ctx, 'GUEST', xGuest, hy, hf);
    text(ctx, 'BUY-IN', xBuy, hy, { ...hf, align: 'right' });
    text(ctx, 'CASHOUT', xCash, hy, { ...hf, align: 'right' });
    text(ctx, 'ROLLING', xRoll, hy, { ...hf, align: 'right' });
    text(ctx, 'RATE', xRate, hy, { ...hf, align: 'right' });
    text(ctx, 'COMMISSION', xCom, hy, { ...hf, align: 'right' });
    text(ctx, 'W/L', xWL, hy, { ...hf, align: 'right' });
  }

  let ry = y + headH;
  for (const r of rows) {
    if (draw) {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD + 1, ry, inner - 2, 1);
      const by = ry + 24;
      const wl = Number(r.win_loss) || 0;
      const num = (v, x, color = C.strong) =>
        text(ctx, v, x, by, { font: `600 13px ${MONO}`, color, align: 'right' });
      text(ctx, fmtWhen(r.created_at), xDate, by, { font: `500 12.5px ${MONO}`, color: C.muted });
      text(ctx, r.player_name || '—', xGuest, by, { font: `600 13px ${SANS}`, color: C.text, maxWidth: guestMax });
      num(formatAmount(r.buy_in), xBuy);
      num(formatAmount(r.cashout), xCash);
      num(formatAmount(r.rolling), xRoll);
      num(r.rate == null ? '—' : `${Number(r.rate).toFixed(2)}%`, xRate);
      num(formatAmount(r.commission), xCom, C.amber);
      num(formatAmount(wl), xWL, wlColor(wl));
    }
    ry += rowH;
  }

  if (draw) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(PAD + 1, ry, inner - 2, 1);
    const fy = ry + 27;
    const tf = (v, x, color = C.strong) => text(ctx, v, x, fy, { font: `800 13.5px ${MONO}`, color, align: 'right' });
    text(ctx, 'GRAND TOTAL', xDate, fy, { font: `800 12px ${SANS}`, color: C.muted });
    tf(formatAmount(totals.buy_in), xBuy);
    tf(formatAmount(totals.cashout), xCash);
    tf(formatAmount(totals.rolling), xRoll);
    tf(formatAmount(totals.commission), xCom, C.amber);
    tf(formatAmount(totals.win_loss), xWL, wlColor(totals.win_loss));
  }
  y += boxH + 20;

  if (draw) text(ctx, `Generated ${new Date().toLocaleString()}`, PAD, y + 4, { font: `500 11px ${SANS}`, color: C.muted });
  y += 4 + PAD - 8;
  return y;
}

export function renderGameRecordsImage(data) {
  return render(GW, recordsLayout, data);
}
