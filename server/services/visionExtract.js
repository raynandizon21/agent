import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from './apiKeys.js';

// Prefix telegram.js puts on the resolved message text when Claude vision
// successfully extracted this report — settlementParse.js checks for it
// before ever trying the regex-based parseInfinityBulkReport() fallback.
export const BULK_ROWS_MARKER = '__CLAUDE_BULK_ROWS__';

// Same "does this look like the bulk report table" check used in both
// telegram.js (decide whether to spend a Claude call) and
// settlementParse.js's regex fallback (decide whether to attempt it at all).
export function looksLikeBulkReport(text) {
  return /GAME\s*START/i.test(text) && /GAME\s*END/i.test(text) && /ROLLING/i.test(text);
}

// Claude vision fallback for Infinity Cage's bulk daily-report screenshot
// (one table image covering many settled games). tesseract.js's
// character-level OCR is unreliable on this specific layout — borders and
// dense columns get misread into garbage ("0" -> "of", stray "|"/"]"/Korean
// characters), silently losing digits mid-number (see settlementParse.js's
// parseInfinityBulkReport() for the regex fallback this replaces when it's
// available). Claude reads the table with actual column/row understanding
// instead of per-character matching, so it's used here as the primary
// extractor for this one report shape; tesseract stays the OCR for every
// other junket format since it already works fine there.
// Re-created when the key changes (edited live on the Settings page).
let client = null;
let clientKey = '';
function getClient() {
  const apiKey = getAnthropicKey();
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

// Telegram photo downloads are JPEG; detect by magic bytes anyway rather
// than assuming, since a wrong media_type is rejected by the API.
function detectMediaType(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  return 'image/jpeg';
}

const PROMPT = `This image is a settlement report table (Infinity Cage). Columns left to right: GAME START (datetime), ACCT No (an account code like INF123 followed by the player's name in parentheses), GUEST (a secondary/referring name, often blank), BUY-IN, CASH-OUT, ROLLING, RATE (a percentage), COMMISSION, WIN/LOSS, GAME END (datetime).

Return ONLY a JSON array, no markdown fences, no prose — one object per table row, with exactly these keys:
- account_no (string)
- player_name (string, from the parentheses after the account code)
- guest (string or null — the GUEST column's value; null when that cell is blank, which is most rows)
- buy_in (number or null)
- cashout (number or null)
- rolling (number or null)
- rate (number or null — e.g. 1.45 for "1.45%")
- commission (number or null)
- win_loss (number or null — negative if the cell shows a minus sign)
- game_start (string, exactly as printed, e.g. "Sep 21, 22:19")
- game_end (string, exactly as printed)

Strip thousands separators from numbers. If a cell is illegible or you are not confident of its value, use null for that field rather than guessing — a missing value is far better than a wrong one in this data.`;

// Returns an array of raw row objects (matching PROMPT's keys) or null if
// vision extraction isn't usable (no API key configured, request failed, or
// the response wasn't valid JSON) — callers fall back to the regex parser.
export async function extractBulkTableRows(imageBuffer) {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: detectMediaType(imageBuffer),
                data: imageBuffer.toString('base64'),
              },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock?.text) return null;

    // Claude sometimes wraps JSON in a fence despite the instruction not to.
    const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const rows = JSON.parse(cleaned);
    return Array.isArray(rows) ? rows : null;
  } catch (err) {
    console.error('[visionExtract] Claude extraction failed', err.message || err);
    return null;
  }
}
