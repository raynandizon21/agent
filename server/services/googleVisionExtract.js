// Google Cloud Vision fallback for Infinity Cage's bulk daily-report
// screenshot — same problem visionExtract.js (Claude) solves, different
// provider. Unlike Claude, this is still character-level OCR (no semantic
// understanding of the table), just far more accurate than tesseract.js on
// dense/bordered layouts — its DOCUMENT_TEXT_DETECTION feature is built for
// exactly this kind of packed text. Returns plain text (like tesseract), so
// the caller still runs it through settlementParse.js's regex-based
// parseInfinityBulkReport() — this does NOT bypass parsing the way Claude's
// structured-JSON path does.
//
// The character recognition itself is excellent — verified against a real
// bulk-report photo, every digit came back correct where tesseract had
// dropped/misread them. But `fullTextAnnotation.text`'s reading order is
// block/paragraph-based, not row-based: on this image it grouped ALL the
// GAME START timestamps together, then ALL the ACCT/name cells, then ALL
// the amount cells — completely scrambling which numbers belong to which
// row. reconstructRowOrder() below rebuilds row-major order itself from
// each word's bounding box (cluster by Y into rows, sort each row by X)
// instead of trusting Google's block ordering.
const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

function reconstructRowOrder(fullTextAnnotation) {
  const words = [];
  for (const page of fullTextAnnotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const text = (word.symbols || []).map((s) => s.text).join('');
          const verts = word.boundingBox?.vertices || word.boundingBox?.normalizedVertices || [];
          if (!text || verts.length === 0) continue;
          const xs = verts.map((v) => v.x ?? 0);
          const ys = verts.map((v) => v.y ?? 0);
          words.push({
            text,
            x: Math.min(...xs),
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            height: Math.max(...ys) - Math.min(...ys) || 1,
          });
        }
      }
    }
  }
  if (!words.length) return '';

  const avgHeight = words.reduce((sum, w) => sum + w.height, 0) / words.length;
  const tolerance = avgHeight * 0.6;

  words.sort((a, b) => a.y - b.y);
  const rows = [];
  let current = [];
  let currentY = null;
  for (const w of words) {
    if (currentY == null || Math.abs(w.y - currentY) <= tolerance) {
      current.push(w);
      currentY = current.reduce((sum, x) => sum + x.y, 0) / current.length;
    } else {
      rows.push(current);
      current = [w];
      currentY = w.y;
    }
  }
  if (current.length) rows.push(current);

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(' ')
    )
    .join('\n');
}

// Returns row-reconstructed OCR text, or null if no API key is configured,
// the request fails, or the response has no usable word-level data —
// callers fall back to whatever OCR text they already have.
export async function extractText(imageBuffer) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBuffer.toString('base64') },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[googleVisionExtract] HTTP', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const result = data.responses?.[0];
    if (result?.error) {
      console.error('[googleVisionExtract] API error', result.error.message);
      return null;
    }

    const reconstructed = reconstructRowOrder(result?.fullTextAnnotation);
    if (reconstructed) return reconstructed;

    // No word-level boxes for some reason — fall back to Google's own
    // (possibly scrambled) reading order rather than losing the text entirely.
    const text = result?.fullTextAnnotation?.text || '';
    return text.trim() || null;
  } catch (err) {
    console.error('[googleVisionExtract] request failed', err.message || err);
    return null;
  }
}
