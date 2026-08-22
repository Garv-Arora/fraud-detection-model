// ============================================================================
// batchEngine.js — Concurrent multi-case ingestion + evidence search pipeline
// ----------------------------------------------------------------------------
// Designed for the real workload: 50+ PDF intimation sheets dropped at once,
// or a single Excel registry carrying 50 claim rows.
//
// Two independent worker pools run at the same time:
//
//   files ──▶ [ PARSE pool ]  ──▶ parsed case queue ──▶ [ SEARCH pool ] ──▶ done
//              (CPU-bound,                                (network-bound,
//               pdf.js text layer)                         rate-limit aware)
//
// A case that finishes parsing starts searching immediately while later files
// are still being parsed, so wall-clock time is governed by the slower of the
// two stages rather than their sum. Results stream to the UI as they land.
// ============================================================================

import { unzipSync } from 'fflate';
import { extractPdfText } from './pdfTextExtractor.js';
import { extractClaimFacts, classifyDocument, ALL_FIELDS } from './claimFactExtractor.js';
import { parseExcelWorkbookInBrowser } from '../clientExcelParser.js';
import { runSearch } from './searchService.js';

export const CASE_STATUS = {
  QUEUED: 'queued',
  PARSING: 'parsing',
  PARSED: 'parsed',
  SEARCHING: 'searching',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

let sequence = 0;
function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

// Above this a single upload will exhaust browser memory before it finishes.
const MAX_FILE_BYTES = 150 * 1024 * 1024;

// A claim archive holds the intimation sheet, the FIR and the policy. Beyond a
// handful, the extra PDFs are photographs of documents rather than documents.
const MAX_PDFS_PER_ARCHIVE = 6;

const isExcel = (name) => /\.(xlsx|xlsm|xls|csv)$/i.test(name);
const isPdf = (name) => /\.pdf$/i.test(name);
const isZip = (name) => /\.zip$/i.test(name);
const isText = (name) => /\.(txt|md|json|eml)$/i.test(name);

/**
 * Turn an extraction result and a quality report into reviewer-facing warnings.
 *
 * Everything here is something the investigator must know before trusting the
 * record: pages that were not read, pages that failed, fields that could not be
 * recovered, and the difference between a missing plate and a vehicle that has
 * no plate yet.
 */
function buildWarnings(extraction, quality) {
  const warnings = [];
  if (extraction?.truncated) {
    warnings.push(`Only the first ${extraction.pagesRead} of ${extraction.pageCount} pages were read.`);
  }
  (extraction?.pageErrors || []).forEach((e) => {
    warnings.push(`Page ${e.page} could not be read (${e.message}) and was skipped.`);
  });
  (quality?.notes || []).forEach((n) => warnings.push(n));
  if (!quality?.usable) {
    warnings.push(`Only ${quality?.criticalFound ?? 0} of ${quality?.criticalTotal ?? 5} critical fields were recovered — verify manually.`);
  }
  // A vehicle with no plate yet is already explained by its own note above.
  const missing = (quality?.missingCritical || []).filter(
    (f) => !(f === 'vehicle_numbers' && quality?.vehicleUnregistered)
  );
  if (missing.length) warnings.push(`Missing: ${missing.join(', ')}.`);
  return warnings;
}

/**
 * Runs a bounded worker pool over a growing queue.
 * `next()` returns the next item or null; `null` + `done` ends the pool.
 */
async function pump(limit, next, work) {
  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const item = await next();
      if (!item) return;
      await work(item);
    }
  });
  await Promise.all(workers);
}

export class BatchEngine {
  /**
   * @param {object} options
   *   parseConcurrency   Parallel document parses (CPU bound). Default 4.
   *   searchConcurrency  Parallel evidence searches (network bound). Default 3.
   *   autoSearch         Run the web search automatically after parsing.
   *   searchOptions      Passed through to runSearch().
   *   onUpdate           (cases, summary) => void — called on every state change.
   */
  constructor(options = {}) {
    this.parseConcurrency = options.parseConcurrency || 4;
    // Kept deliberately low: the search engines rate-limit aggressively, and a
    // throttled engine returns nothing rather than returning slowly.
    //
    // Each case now fans out into roughly a dozen parallel function
    // invocations to cover every language edition, so the effective request
    // rate is an order of magnitude higher than the number of concurrent cases
    // suggests. Running three cases at once would put ~36 simultaneous
    // requests on the same engines and trip every rate limiter at the same
    // moment, which returns nothing for the whole batch rather than slowly.
    this.searchConcurrency = options.searchConcurrency || 1;
    this.autoSearch = options.autoSearch !== false;
    this.searchOptions = options.searchOptions || {};
    this.onUpdate = options.onUpdate || (() => {});

    this.cases = [];
    this.parseQueue = [];
    this.searchQueue = [];
    this.parsingComplete = false;
    this.cancelled = false;
    this.startedAt = null;
    this.finishedAt = null;
    this._notifyScheduled = false;
  }

  // ------------------------------------------------------------------ state --

  get summary() {
    const byStatus = {};
    Object.values(CASE_STATUS).forEach((s) => { byStatus[s] = 0; });
    this.cases.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

    const total = this.cases.length;
    const settled = byStatus[CASE_STATUS.DONE] + byStatus[CASE_STATUS.FAILED] + byStatus[CASE_STATUS.SKIPPED];
    const evidence = this.cases.reduce((n, c) => n + (c.search?.total_results || 0), 0);
    const withEvidence = this.cases.filter((c) => (c.search?.total_results || 0) > 0).length;
    const caseSpecific = this.cases.filter((c) => (c.search?.results || []).some((r) => r.case_specific)).length;

    return {
      total,
      settled,
      byStatus,
      progress: total ? Math.round((settled / total) * 100) : 0,
      evidenceRecords: evidence,
      casesWithEvidence: withEvidence,
      casesWithCaseSpecificEvidence: caseSpecific,
      running: this.startedAt !== null && this.finishedAt === null,
      elapsedMs: this.startedAt ? (this.finishedAt || Date.now()) - this.startedAt : 0
    };
  }

  // Coalesce notifications; a 50-case batch otherwise triggers hundreds of
  // React re-renders per second.
  //
  // Deliberately a timer, not requestAnimationFrame: rAF does not fire while
  // the tab is backgrounded or otherwise not compositing, which would freeze
  // the progress display for the entire run of a long batch left in a
  // background tab. A timer keeps firing (throttled) and the UI stays honest.
  _notify() {
    if (this._notifyScheduled) return;
    this._notifyScheduled = true;
    setTimeout(() => {
      this._notifyScheduled = false;
      this.onUpdate([...this.cases], this.summary);
    }, 50);
  }

  _addCase(partial) {
    const record = {
      id: nextId('case'),
      status: CASE_STATUS.QUEUED,
      sourceName: '',
      sourceType: 'unknown',
      facts: null,
      confidence: {},
      quality: null,
      documentText: '',
      attachments: [],
      search: null,
      error: null,
      warnings: [],
      parsedAt: null,
      searchedAt: null,
      ...partial
    };
    this.cases.push(record);
    return record;
  }

  _set(record, patch) {
    Object.assign(record, patch);
    this._notify();
  }

  cancel() {
    this.cancelled = true;
    this.cases.forEach((c) => {
      if (c.status === CASE_STATUS.QUEUED || c.status === CASE_STATUS.PARSED) {
        c.status = CASE_STATUS.SKIPPED;
        c.error = 'Cancelled by user';
      }
    });
    this._notify();
  }

  // ------------------------------------------------------------------- run --

  /**
   * @param {File[]} files  Any mix of PDFs, Excel workbooks, ZIPs and text.
   */
  async run(files) {
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.cancelled = false;

    const list = Array.from(files || []);
    if (!list.length) {
      this.finishedAt = Date.now();
      this._notify();
      return this.cases;
    }

    // Seed the parse queue. Excel workbooks expand into one case per row, so
    // they are unpacked first and their rows enter the pipeline immediately.
    list.forEach((file) => {
      this.parseQueue.push({ file });
    });
    this._notify();

    const parseStage = pump(
      this.parseConcurrency,
      async () => (this.cancelled ? null : this.parseQueue.shift() || null),
      async (job) => { await this._parseFile(job.file); }
    ).then(() => { this.parsingComplete = true; });

    const searchStage = this.autoSearch
      ? pump(
        this.searchConcurrency,
        async () => {
          for (;;) {
            if (this.cancelled) return null;
            const item = this.searchQueue.shift();
            if (item) return item;
            if (this.parsingComplete && !this.searchQueue.length) return null;
            await new Promise((r) => setTimeout(r, 60));
          }
        },
        async (record) => { await this._searchCase(record); }
      )
      : Promise.resolve();

    await Promise.all([parseStage, searchStage]);

    this.finishedAt = Date.now();
    this._notify();
    return this.cases;
  }

  // ----------------------------------------------------------------- parse --

  async _parseFile(file) {
    if (this.cancelled) return;
    const name = file?.name || 'document';
    // Remember where this file's cases start, so a late failure marks the
    // record that already exists instead of adding a second, empty one — a
    // failed PDF used to appear twice in the list, once parsing forever.
    const before = this.cases.length;

    try {
      if (file && file.size > MAX_FILE_BYTES) {
        throw new Error(
          `File is ${(file.size / 1048576).toFixed(0)} MB, above the ${MAX_FILE_BYTES / 1048576} MB limit. Split the archive and upload it in parts.`
        );
      }
      if (isExcel(name)) return await this._parseExcel(file);
      if (isPdf(name)) return await this._parsePdf(file, name);
      if (isZip(name)) return await this._parseZip(file);
      if (isText(name)) return await this._parseTextFile(file, name);

      const record = this._addCase({ sourceName: name, sourceType: 'unsupported' });
      this._set(record, {
        status: CASE_STATUS.FAILED,
        error: `Unsupported file type. Upload PDF, Excel (.xlsx/.xls/.csv), ZIP or text.`
      });
    } catch (err) {
      const message = String(err?.message || err);
      const created = this.cases.slice(before);
      if (created.length) {
        created.forEach((record) => {
          if (record.status === CASE_STATUS.QUEUED || record.status === CASE_STATUS.PARSING) {
            this._set(record, { status: CASE_STATUS.FAILED, error: message });
          }
        });
      } else {
        const record = this._addCase({ sourceName: name, sourceType: 'error' });
        this._set(record, { status: CASE_STATUS.FAILED, error: message });
      }
    }
  }

  async _parseExcel(file) {
    const buffer = await file.arrayBuffer();
    const rows = await parseExcelWorkbookInBrowser(buffer);

    if (!rows.length) {
      const record = this._addCase({ sourceName: file.name, sourceType: 'excel' });
      this._set(record, {
        status: CASE_STATUS.FAILED,
        error: 'No recognisable claim headers found in this workbook.'
      });
      return;
    }

    // One Excel workbook carrying 50 claim rows becomes 50 independent cases,
    // each with its own search.
    rows.forEach((row, index) => {
      const record = this._addCase({
        sourceName: `${file.name} · row ${index + 1}${row.sheetName ? ` (${row.sheetName})` : ''}`,
        sourceType: 'excel',
        sourceFile: file.name,
        rowIndex: index + 1
      });
      const facts = row.facts || {};
      const critical = ['claim_id', 'vehicle_numbers', 'accident_date_time', 'loss_location', 'insured_name'];
      const quality = {
        criticalFound: critical.filter((f) => facts[f] && String(facts[f]).trim()).length,
        criticalTotal: critical.length,
        missingCritical: critical.filter((f) => !facts[f] || !String(facts[f]).trim()),
        usable: true,
        vehicleUnregistered: (row.notes || []).some((n) => /number plate/i.test(n)),
        notes: row.notes || [],
        // Counted over the schema, not over every key: facts also carries
        // additional_details, which is an array of captured labels and is not
        // itself a populated field.
        fieldsPopulated: ALL_FIELDS.filter((f) => facts[f] && String(facts[f]).trim()).length,
        source: 'excel'
      };
      this._set(record, {
        status: CASE_STATUS.PARSED,
        facts,
        confidence: row.confidence || {},
        quality,
        warnings: buildWarnings(null, quality),
        parsedAt: Date.now()
      });
      this.searchQueue.push(record);
    });
  }

  async _parsePdf(file, name) {
    const record = this._addCase({ sourceName: name, sourceType: 'pdf', sourceFile: name });
    this._set(record, { status: CASE_STATUS.PARSING });

    const buffer = await file.arrayBuffer();
    const extraction = await extractPdfText(buffer);

    if (!extraction.hasTextLayer) {
      // A scanned sheet has no text layer. Say so instead of emitting an empty
      // claim record that looks like a successful parse.
      this._set(record, {
        status: CASE_STATUS.FAILED,
        error: 'This PDF has no text layer (it is a scan or photo). Optical character recognition is required before the facts can be read.',
        documentText: '',
        quality: { usable: false, criticalFound: 0, criticalTotal: 5, scanned: true }
      });
      return;
    }

    const fallbackId = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9-]/g, '-').slice(0, 40);
    const { facts, confidence, quality } = extractClaimFacts(extraction.text, fallbackId);

    // A policy schedule or wording copy sitting alongside the real claim files
    // is a supporting document, not a claim. Turning it into its own case
    // produces a junk record and wastes a search slot on a document that
    // describes no incident.
    if (quality.documentType === 'policy') {
      this._set(record, {
        status: CASE_STATUS.SKIPPED,
        facts,
        confidence,
        quality,
        documentText: extraction.text,
        error: 'Recognised as a policy schedule / wording, not a claim intimation. Kept as a supporting document — no case created and no search run.',
        parsedAt: Date.now()
      });
      return;
    }

    const warnings = buildWarnings(extraction, quality);

    this._set(record, {
      status: CASE_STATUS.PARSED,
      facts,
      confidence,
      quality,
      documentText: extraction.text,
      warnings,
      parsedAt: Date.now()
    });
    this.searchQueue.push(record);
  }

  async _parseZip(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let entries;
    try {
      entries = unzipSync(buffer);
    } catch (err) {
      const record = this._addCase({ sourceName: file.name, sourceType: 'zip' });
      this._set(record, { status: CASE_STATUS.FAILED, error: `Could not read archive: ${err.message}` });
      return;
    }

    const names = Object.keys(entries).filter((n) => !n.endsWith('/'));
    const pdfNames = names.filter((n) => isPdf(n));
    const imageNames = names.filter((n) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n));

    if (!pdfNames.length) {
      const record = this._addCase({
        sourceName: file.name,
        sourceType: 'zip',
        attachments: imageNames
      });
      this._set(record, {
        status: CASE_STATUS.FAILED,
        error: `Archive contains no PDF document (${imageNames.length} image${imageNames.length === 1 ? '' : 's'} only). Photographs cannot be parsed for claim facts.`
      });
      return;
    }

    // Prefer the intimation sheet; it carries the structured claim header.
    pdfNames.sort((a, b) => {
      const rank = (n) => (/intimation/i.test(n) ? 0 : /claim/i.test(n) ? 1 : /policy/i.test(n) ? 3 : 2);
      return rank(a) - rank(b);
    });

    const record = this._addCase({
      sourceName: `${file.name} · ${pdfNames[0].split('/').pop()}`,
      sourceType: 'zip',
      sourceFile: file.name,
      attachments: imageNames
    });
    this._set(record, { status: CASE_STATUS.PARSING });

    // Read every PDF in the archive, then decide which ones describe the
    // incident. A policy schedule states the policy's own dates, its own
    // registration number and its own addresses; merged into the claim text it
    // overwrites the intimation sheet's facts with the policy's. The archive
    // for CL26148443 is exactly this shape — an intimation sheet plus a
    // certificate cum policy schedule — so the policy is read for the record
    // but kept out of the facts.
    const docs = [];
    const scanned = [];
    const unreadable = [];

    for (const pdfName of pdfNames.slice(0, MAX_PDFS_PER_ARCHIVE)) {
      try {
        const extraction = await extractPdfText(entries[pdfName]);
        if (!extraction.hasTextLayer) { scanned.push(pdfName); continue; }
        docs.push({
          name: pdfName,
          text: extraction.text,
          extraction,
          type: classifyDocument(extraction.text)
        });
      } catch (err) {
        unreadable.push(`${pdfName.split('/').pop()} (${err?.message || err})`);
      }
    }

    if (!docs.length) {
      this._set(record, {
        status: CASE_STATUS.FAILED,
        error: scanned.length
          ? 'Every PDF in this archive is a scan with no text layer. Optical character recognition is required before the facts can be read.'
          : `No PDF in this archive could be read. ${unreadable.join('; ')}`,
        quality: { usable: false, criticalFound: 0, criticalTotal: 5, scanned: scanned.length > 0 }
      });
      return;
    }

    const claimDocs = docs.filter((d) => d.type !== 'policy');
    const used = claimDocs.length ? claimDocs : docs;
    const combined = used.map((d) => d.text).join('\n\n');

    const fallbackId = file.name.replace(/\.[^.]+$/, '');
    const { facts, confidence, quality } = extractClaimFacts(combined, fallbackId);

    // Report against the document that actually supplied the facts.
    const warnings = buildWarnings(used[0]?.extraction, quality);
    if (imageNames.length) {
      warnings.push(`${imageNames.length} image${imageNames.length === 1 ? '' : 's'} in the archive were catalogued but not parsed.`);
    }
    docs.filter((d) => d.type === 'policy' && claimDocs.length).forEach((d) => {
      warnings.push(`${d.name.split('/').pop()} was read as a policy schedule and kept as a supporting document — its details were not merged into the claim.`);
    });
    scanned.forEach((n) => warnings.push(`${n.split('/').pop()} is a scan with no text layer and was skipped.`));
    unreadable.forEach((n) => warnings.push(`Could not read ${n}.`));

    this._set(record, {
      status: CASE_STATUS.PARSED,
      facts,
      confidence,
      quality,
      documentText: combined,
      supportingDocuments: docs.map((d) => ({ name: d.name, type: d.type, used: used.includes(d) })),
      warnings,
      parsedAt: Date.now()
    });
    this.searchQueue.push(record);
  }

  async _parseTextFile(file, name) {
    const record = this._addCase({ sourceName: name, sourceType: 'text', sourceFile: name });
    this._set(record, { status: CASE_STATUS.PARSING });

    const text = await file.text();
    const fallbackId = name.replace(/\.[^.]+$/, '');
    const { facts, confidence, quality } = extractClaimFacts(text, fallbackId);

    this._set(record, {
      status: CASE_STATUS.PARSED,
      facts,
      confidence,
      quality,
      documentText: text,
      parsedAt: Date.now()
    });
    this.searchQueue.push(record);
  }

  // ---------------------------------------------------------------- search --

  async _searchCase(record) {
    if (this.cancelled || !record.facts) return;
    this._set(record, { status: CASE_STATUS.SEARCHING });

    try {
      const search = await runSearch({
        query: '',
        facts: record.facts,
        options: {
          maxQueries: this.searchOptions.maxQueries || 6,
          limit: this.searchOptions.limit || 40,
          minScore: this.searchOptions.minScore ?? 20,
          ...this.searchOptions
        }
      });
      this._set(record, { status: CASE_STATUS.DONE, search, searchedAt: Date.now() });
    } catch (err) {
      // A failed search must not discard a successfully parsed case.
      this._set(record, {
        status: CASE_STATUS.DONE,
        search: null,
        error: `Evidence search failed: ${err.message || err}`,
        searchedAt: Date.now()
      });
    }
  }

  /** Re-run the evidence search for one case (used by the "Retry" action). */
  async researchCase(caseId, overrides = {}) {
    const record = this.cases.find((c) => c.id === caseId);
    if (!record || !record.facts) return null;
    this._set(record, { status: CASE_STATUS.SEARCHING, error: null });
    try {
      const search = await runSearch({
        query: overrides.query || '',
        facts: { ...record.facts, ...(overrides.facts || {}) },
        options: { maxQueries: 8, limit: 60, ...this.searchOptions, ...(overrides.options || {}) }
      });
      this._set(record, { status: CASE_STATUS.DONE, search, searchedAt: Date.now() });
      return search;
    } catch (err) {
      this._set(record, { status: CASE_STATUS.DONE, error: `Evidence search failed: ${err.message || err}` });
      return null;
    }
  }
}

/**
 * Convenience wrapper: process a file list end to end.
 */
export async function processBatch(files, options = {}) {
  const engine = new BatchEngine(options);
  await engine.run(files);
  return engine;
}
