// ============================================================================
// pdfTextExtractor.js — Table-aware PDF text extraction
// ----------------------------------------------------------------------------
// Universal Sompo intimation sheets are not prose. They are four-column grids
// (label | value | label | value) rendered from an HTML table, and cell text
// wraps freely inside a cell. Reading them as baseline-grouped text lines —
// which is what a naive extractor does — tears every wrapped label away from
// its value, because a two-line label straddles the single-line value sitting
// beside it:
//
//        x=281.2 y=412.3   "Child Claim"     <- label, line 1
//        x=133.7 y=406.7   "CL26140317"      <- the NEIGHBOURING cell's value
//        x=281.2 y=400.9   "No"              <- label, line 2
//
// Flattened by baseline that becomes three unrelated lines and the pairing is
// lost. Measured against the real sample sheets, the flat reading produced a
// claim narrative of "confirmation ,DL and RC also Towing Date", an insured
// address that was actually an email address, and the intimation date in place
// of the accident date.
//
// This module reconstructs the grid instead:
//   1. runs are grouped into ROW BANDS by vertical projection, so every line
//      of a wrapped cell stays with its row;
//   2. COLUMN positions are recovered by clustering glyph-run left edges;
//   3. each (band, column) cell is rebuilt top-to-bottom into one value;
//   4. the band is emitted as "cell  |  cell  |  cell  |  cell", empty cells
//      preserved, which is exactly the shape the fact extractor parses.
//
// Documents with no detectable column structure (FIR narratives, letters) fall
// back to ordinary line reconstruction.
// ============================================================================

const DEFAULT_MAX_PAGES = 60;
const DEFAULT_TIMEOUT_MS = 120000;

// Column clustering tolerance in PDF points. Glyph runs that start within this
// distance of each other belong to the same column.
const COLUMN_TOLERANCE = 3.0;

// A column must be used by at least this many distinct text lines before it is
// believed. Two coincidental left edges do not make a table.
const MIN_COLUMN_SUPPORT = 3;

// Vertical whitespace, as a fraction of body text height, that separates two
// table ROWS rather than two wrapped lines inside one cell.
//
// The two are only a couple of points apart and the value is therefore
// measured, not guessed. On real USGI intimation sheets a wrapped cell is set
// with 11.4 pt leading on 9.9 pt text, leaving 1.0 pt of clear space, while
// the covering e-mail above the table is set with 13.2 pt leading, leaving
// 2.8 pt. A threshold of 0.25 x 9.9 = 2.5 pt sits between the two with margin
// on both sides. CONTINUATION_GAP_RATIO below is the safety net for documents
// whose cells are set with more generous leading than that.
const BAND_GAP_RATIO = 0.25;

// A line that occupies a single column, directly under a band already using
// that column, is a wrapped continuation of that cell however generous its
// leading — up to this multiple of the body height, beyond which it is a
// genuinely new row.
//
// This has to stay well under a real row gap. On the sample sheets a wrapped
// line leaves 1.0 pt of clear space and a new table row leaves 10.8 pt, so
// 0.55 x 9.9 = 5.4 pt tolerates leading half again as loose as the samples use
// without ever swallowing the row below. Set to 1.6 it swallowed three rows at
// a time, because a two-line label such as "Accident / Date & Time" puts a
// single-column line at the top of every row.
const CONTINUATION_GAP_RATIO = 0.55;

export class PdfExtractionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PdfExtractionError';
    this.code = code || 'PDF_ERROR';
  }
}

// pdf.js v4 uses Promise.withResolvers, which is missing on Chrome < 119,
// Firefox < 121 and Safari < 17.4 — still common on managed corporate desktops.
// Without this shim the library throws on import and every upload "fails" with
// an unrelated message.
function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === 'function') return;
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// pdf.js is ~800 kB. Load it on first use rather than on every page load, so
// investigators who only run keyword searches never download it.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      ensurePromiseWithResolvers();
      const lib = await import('pdfjs-dist');
      // A missing or blocked worker must degrade to main-thread parsing rather
      // than failing the upload outright: some corporate proxies rewrite or
      // strip the worker asset.
      try {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        lib.GlobalWorkerOptions.workerSrc = worker.default;
      } catch {
        lib.GlobalWorkerOptions.workerSrc = '';
      }
      return lib;
    })().catch((err) => {
      pdfjsPromise = null; // allow a retry on the next upload
      throw new PdfExtractionError(
        `The PDF engine could not be loaded (${err?.message || err}). Reload the page and try again.`,
        'ENGINE_LOAD_FAILED'
      );
    });
  }
  return pdfjsPromise;
}

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new PdfExtractionError(`${label} timed out after ${Math.round(ms / 1000)}s.`, 'TIMEOUT')),
        ms
      );
    })
  ]);
}

/**
 * Extract text from a PDF, preserving the table structure the claim fields
 * depend on.
 *
 * @param {ArrayBuffer|Uint8Array} data
 * @param {object} options { maxPages, onProgress, password, timeoutMs }
 * @returns {Promise<object>} { text, pages, pageCount, pagesRead, truncated,
 *                              hasTextLayer, charCount, pageErrors, structured }
 */
export async function extractPdfText(data, options = {}) {
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const source = data instanceof Uint8Array ? data : new Uint8Array(data || []);
  if (!source.length) {
    throw new PdfExtractionError('The file is empty (0 bytes).', 'EMPTY_FILE');
  }
  if (!looksLikePdf(source)) {
    throw new PdfExtractionError(
      'This file is not a PDF (the %PDF header is missing). It may have been renamed from another format.',
      'NOT_A_PDF'
    );
  }
  // pdf.js takes ownership of the buffer and may detach it. Copying keeps the
  // caller's bytes reusable — the ZIP path parses several PDFs out of one
  // archive buffer and would otherwise hit a detached ArrayBuffer.
  const bytes = source.slice();

  const pdfjsLib = await loadPdfjs();

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    password: options.password || undefined,
    // Character maps and standard font data are required to decode CID-keyed
    // and Devanagari fonts. Without them a Hindi FIR copy extracts as blank or
    // as replacement characters. Served from /pdfjs by the Vite config.
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    // Intimation sheets are plain text documents; skipping font rendering
    // assets keeps a 50-file batch from exhausting browser memory.
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false
  });

  let pdf;
  try {
    pdf = await withTimeout(loadingTask.promise, timeoutMs, 'Opening the PDF');
  } catch (err) {
    try { await loadingTask.destroy(); } catch { /* already torn down */ }
    throw toFriendlyError(err);
  }

  const pageCount = pdf.numPages;
  const limit = Math.min(pageCount, maxPages);
  const pages = [];
  const pageErrors = [];
  const structured = [];

  try {
    for (let i = 1; i <= limit; i += 1) {
      let page = null;
      try {
        page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const layout = reconstructPageText(content.items);
        pages.push(layout.text);
        structured.push({ page: i, columns: layout.columns, rows: layout.rows, mode: layout.mode });
      } catch (err) {
        // One damaged page must not discard the rest of the document — the
        // claim header is usually on page 1 and the damage usually is not.
        pages.push('');
        pageErrors.push({ page: i, message: String(err?.message || err) });
      } finally {
        try { page?.cleanup(); } catch { /* page already released */ }
      }
      if (options.onProgress) options.onProgress(i, limit);
    }
  } finally {
    try { await pdf.destroy(); } catch { /* already destroyed */ }
  }

  const text = pages.filter(Boolean).join('\n\n');
  const charCount = text.replace(/\s/g, '').length;

  return {
    text,
    pages,
    pageCount,
    pagesRead: limit,
    truncated: pageCount > limit,
    charCount,
    pageErrors,
    structured,
    // A scanned sheet has no text layer at all — the caller must tell the user
    // rather than silently producing an empty claim record. Requiring letters
    // as well as characters rejects a page carrying only page numbers.
    hasTextLayer: charCount > 40 && (text.match(/[A-Za-zऀ-ॿ]/g) || []).length > 20
  };
}

/** Convenience wrapper for a File/Blob. */
export async function extractPdfTextFromFile(file, options = {}) {
  const buffer = await file.arrayBuffer();
  return extractPdfText(buffer, options);
}

function looksLikePdf(bytes) {
  // The header is allowed to sit anywhere within the first kilobyte.
  const probe = bytes.subarray(0, 1024);
  for (let i = 0; i + 4 < probe.length; i += 1) {
    if (probe[i] === 0x25 && probe[i + 1] === 0x50 && probe[i + 2] === 0x44
      && probe[i + 3] === 0x46 && probe[i + 4] === 0x2d) return true;
  }
  return false;
}

function toFriendlyError(err) {
  if (err instanceof PdfExtractionError) return err;
  const name = err?.name || '';
  const message = String(err?.message || err);
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new PdfExtractionError(
      'This PDF is password protected. Remove the password before the claim facts can be read.',
      'PASSWORD_REQUIRED'
    );
  }
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) {
    return new PdfExtractionError('This PDF is corrupt or incomplete and cannot be opened.', 'CORRUPT_PDF');
  }
  return new PdfExtractionError(`The PDF could not be read: ${message}`, 'PDF_ERROR');
}

// ---------------------------------------------------------------------------
// Layout engine — pure, and exported so it can be tested without a browser.
// ---------------------------------------------------------------------------

/**
 * Rebuild one page's text from positioned glyph runs.
 *
 * @param {Array} items pdf.js TextContent items
 * @returns {{text:string, columns:number, rows:number, mode:string}}
 */
export function reconstructPageText(items, options = {}) {
  const glyphs = normaliseItems(items);
  if (!glyphs.length) return { text: '', columns: 0, rows: 0, mode: 'empty' };

  const bodyHeight = median(glyphs.map((g) => g.h)) || 10;
  const textLines = buildTextLines(glyphs, bodyHeight);
  const centers = detectColumns(textLines, options.columnTolerance ?? COLUMN_TOLERANCE);

  // Fewer than two believed columns means there is no table to rebuild; a
  // letter or an FIR narrative reads correctly as plain lines.
  if (centers.length < 2) {
    return {
      text: textLines.map((line) => joinRun(line.items)).filter(Boolean).join('\n'),
      columns: centers.length,
      rows: textLines.length,
      mode: 'prose'
    };
  }

  const bands = groupLinesIntoBands(textLines, centers, bodyHeight);

  const lines = bands.map((band) => {
    const buckets = centers.map(() => []);
    band.forEach((g) => { buckets[assignColumn(g.x, centers)].push(g); });

    const cells = buckets.map((bucket) => cellText(bucket, bodyHeight));

    // Trim empty cells at both ends so a row that starts in column 2 does not
    // emit a leading separator, while interior gaps are preserved — "Name of
    // IV Driver |  | DL Number | RJ08…" must not collapse into "Name of IV
    // Driver | DL Number", which would read the next label as the value.
    let start = 0;
    let end = cells.length - 1;
    while (start <= end && !cells[start]) start += 1;
    while (end >= start && !cells[end]) end -= 1;
    if (start > end) return '';

    // A bare page number is not a field; dropping it stops "2" being read as
    // the value of whatever label shares its column.
    if (start === end && /^\d{1,3}$/.test(cells[start])) return '';

    const row = cells.slice(start, end + 1);
    return row.length === 1 ? row[0] : row.join('  |  ');
  });

  return {
    text: lines.filter(Boolean).join('\n'),
    columns: centers.length,
    rows: bands.length,
    mode: 'table'
  };
}

function normaliseItems(items) {
  const out = [];
  (items || []).forEach((item) => {
    const str = typeof item?.str === 'string' ? item.str : '';
    if (!str.trim()) return;
    const t = item.transform || [1, 0, 0, 1, 0, 0];

    // Rotated or sheared text cannot be placed on a horizontal grid. Skipping
    // it is safer than letting a diagonal watermark drag unrelated rows
    // together into one band.
    if (Math.abs(t[1]) > 0.35 || Math.abs(t[2]) > 0.35) return;

    const h = Math.abs(item.height) > 0.5 ? Math.abs(item.height) : (Math.abs(t[3]) || 10);
    const w = Number.isFinite(item.width) && item.width > 0 ? item.width : str.length * h * 0.5;
    out.push({ x: t[4], y: t[5], w, h, str });
  });
  return out;
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Group glyph runs into single-baseline text lines.
 */
function buildTextLines(glyphs, bodyHeight) {
  const tolerance = Math.max(1.0, bodyHeight * 0.35);
  const lines = [];
  [...glyphs].sort((a, b) => b.y - a.y).forEach((g) => {
    const line = lines.find((l) => Math.abs(l.y - g.y) <= tolerance);
    if (line) {
      line.items.push(g);
      line.top = Math.max(line.top, g.y + g.h * 0.8);
      line.bottom = Math.min(line.bottom, g.y - g.h * 0.25);
    } else {
      lines.push({ y: g.y, top: g.y + g.h * 0.8, bottom: g.y - g.h * 0.25, items: [g] });
    }
  });
  lines.sort((a, b) => b.top - a.top);
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return lines;
}

/**
 * Merge text lines into table ROW BANDS.
 *
 * A band absorbs the next line while the clear space between them is smaller
 * than BAND_GAP_RATIO of the body height, which is how a two-line label stays
 * attached to the single-line value beside it.
 *
 * The second rule is the safety net: a line living in exactly one column,
 * under a band already using that column, is a wrapped continuation of that
 * cell no matter how loosely it is set. Without it a five-line insured address
 * typeset with generous leading would break into five bands, and the "Insured
 * Address" label would keep only its first line.
 */
function groupLinesIntoBands(textLines, centers, bodyHeight) {
  const gapThreshold = Math.max(1.0, bodyHeight * BAND_GAP_RATIO);
  const continuationLimit = bodyHeight * CONTINUATION_GAP_RATIO;

  const bands = [];
  let current = null;
  let floor = Infinity;
  let columnsUsed = new Set();

  textLines.forEach((line) => {
    const gap = floor - line.top;
    const lineColumns = new Set(line.items.map((g) => assignColumn(g.x, centers)));

    const continuation = lineColumns.size === 1
      && columnsUsed.has([...lineColumns][0])
      && gap <= continuationLimit;

    if (!current || (gap > gapThreshold && !continuation)) {
      current = [];
      bands.push(current);
      floor = line.bottom;
      columnsUsed = new Set(lineColumns);
    } else {
      floor = Math.min(floor, line.bottom);
      lineColumns.forEach((c) => columnsUsed.add(c));
    }
    current.push(...line.items);
  });

  return bands;
}

/**
 * Recover column positions by clustering glyph-run left edges.
 *
 * Left edges are used rather than whitespace corridors because full-width
 * prose (the covering email above the table) spans every column and would
 * close any corridor a projection-based method looks for.
 */
function detectColumns(textLines, tolerance) {
  const clusters = [];

  textLines.forEach((line) => {
    const seen = new Set();
    line.items.forEach((g) => {
      let hit = clusters.find((c) => Math.abs(c.x - g.x) <= tolerance);
      if (!hit) {
        hit = { x: g.x, sum: 0, count: 0, rows: 0 };
        clusters.push(hit);
      }
      hit.sum += g.x;
      hit.count += 1;
      hit.x = hit.sum / hit.count;
      // Support is counted once per line, so a single row of many short runs
      // cannot invent a column on its own.
      if (!seen.has(hit)) { hit.rows += 1; seen.add(hit); }
    });
  });

  return clusters
    .filter((c) => c.rows >= MIN_COLUMN_SUPPORT)
    .map((c) => c.x)
    .sort((a, b) => a - b);
}

/**
 * Place a glyph run in a column: the right-most column starting at or before
 * it. A run wider than its column (a full-width paragraph) therefore lands in
 * the first column rather than being split across several.
 */
function assignColumn(x, centers) {
  let index = 0;
  for (let i = 0; i < centers.length; i += 1) {
    if (centers[i] <= x + COLUMN_TOLERANCE) index = i;
    else break;
  }
  return index;
}

/** Order the runs inside one cell: top line first, then left to right. */
function cellText(bucket, bodyHeight) {
  if (!bucket.length) return '';
  return groupByBaseline(bucket, bodyHeight)
    .map((line) => joinRun(line))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupByBaseline(bucket, bodyHeight) {
  const tolerance = Math.max(1.5, bodyHeight * 0.4);
  const lines = [];
  [...bucket].sort((a, b) => b.y - a.y).forEach((g) => {
    const line = lines.find((l) => Math.abs(l.y - g.y) <= tolerance);
    if (line) line.items.push(g);
    else lines.push({ y: g.y, items: [g] });
  });
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return lines.map((l) => l.items);
}

/** Join runs on one baseline, inserting a space only where one was rendered. */
function joinRun(runs) {
  let out = '';
  let prevEnd = null;
  runs.forEach((g) => {
    if (prevEnd !== null) {
      const gap = g.x - prevEnd;
      if (gap > 0.6 && !/\s$/.test(out) && !/^\s/.test(g.str)) out += ' ';
    }
    out += g.str;
    prevEnd = g.x + g.w;
  });
  return out.replace(/\s+/g, ' ').trim();
}
