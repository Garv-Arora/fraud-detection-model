import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Upload, FileText, FileSpreadsheet, Archive, RefreshCw, X, Check,
  AlertTriangle, Search, Loader, Download, ChevronRight, Layers,
  CheckCircle2, XCircle, Clock, Database, Filter, Play, Ban
} from 'lucide-react';

import { BatchEngine, CASE_STATUS } from '../lib/batchEngine';
import ClaimFactMatrix from './ClaimFactMatrix';
import EvidenceResultsPanel from './EvidenceResultsPanel';

const STATUS_META = {
  [CASE_STATUS.QUEUED]: { label: 'Queued', colour: '#64748B', bg: '#F1F5F9', Icon: Clock },
  [CASE_STATUS.PARSING]: { label: 'Parsing', colour: '#B45309', bg: '#FEF3C7', Icon: Loader },
  [CASE_STATUS.PARSED]: { label: 'Parsed', colour: '#4338CA', bg: '#E0E7FF', Icon: FileText },
  [CASE_STATUS.SEARCHING]: { label: 'Searching', colour: '#1D4ED8', bg: '#DBEAFE', Icon: Search },
  [CASE_STATUS.DONE]: { label: 'Complete', colour: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
  [CASE_STATUS.FAILED]: { label: 'Failed', colour: '#B91C1C', bg: '#FEE2E2', Icon: XCircle },
  [CASE_STATUS.SKIPPED]: { label: 'Skipped', colour: '#64748B', bg: '#F1F5F9', Icon: Ban }
};

const SOURCE_ICONS = {
  pdf: FileText,
  excel: FileSpreadsheet,
  zip: Archive,
  text: FileText
};

function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}


function caseLabel(record) {
  const id = record.facts?.claim_id;
  if (id && !/^USGI-[A-Z0-9]+$/.test(id)) return id;
  return record.sourceName;
}


/**
 * Batch ingestion + evidence discovery workspace.
 *
 * Handles the real workload: dozens of PDF intimation sheets at once, or one
 * Excel registry holding many claim rows. Parsing and web search run as two
 * concurrent pools, so searches for early cases are already returning while
 * later documents are still being read.
 */
export default function BatchCaseWorkspace({ onPushCases }) {
  const [files, setFiles] = useState([]);
  const [cases, setCases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [caseFilter, setCaseFilter] = useState('');
  const [autoSearch, setAutoSearch] = useState(true);
  const [searchConcurrency, setSearchConcurrency] = useState(3);
  const [pushed, setPushed] = useState(false);

  const engineRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-select the first case that finishes so the investigator sees results
  // immediately instead of staring at a progress bar.
  useEffect(() => {
    if (selectedId) return;
    const firstDone = cases.find((c) => c.status === CASE_STATUS.DONE && c.search);
    if (firstDone) setSelectedId(firstDone.id);
  }, [cases, selectedId]);

  const addFiles = useCallback((incoming) => {
    const list = Array.from(incoming || []).filter((f) => f && f.size >= 0);
    if (!list.length) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      list.forEach((f) => {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      });
      return merged;
    });
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer?.files);
  }, [addFiles]);

  const start = async () => {
    if (!files.length || running) return;
    setRunning(true);
    setPushed(false);
    setCases([]);
    setSelectedId(null);

    const engine = new BatchEngine({
      parseConcurrency: 4,
      searchConcurrency,
      autoSearch,
      searchOptions: { maxQueries: 6, limit: 40 },
      onUpdate: (nextCases, nextSummary) => {
        setCases(nextCases);
        setSummary(nextSummary);
      }
    });
    engineRef.current = engine;

    try {
      await engine.run(files);
    } finally {
      setRunning(false);
      setSummary(engine.summary);
    }
  };

  const cancel = () => {
    engineRef.current?.cancel();
    setRunning(false);
  };

  const retryCase = async (id) => {
    if (!engineRef.current) return;
    await engineRef.current.researchCase(id);
    setCases([...engineRef.current.cases]);
    setSummary(engineRef.current.summary);
  };

  const selected = useMemo(() => cases.find((c) => c.id === selectedId) || null, [cases, selectedId]);

  const visibleCases = useMemo(() => {
    const q = caseFilter.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.sourceName} ${caseLabel(c)} ${c.facts?.insured_name || ''} ${c.facts?.vehicle_numbers || ''} ${c.facts?.loss_location || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [cases, statusFilter, caseFilter]);

  const exportAll = () => {
    const payload = cases.map((c) => ({
      source: c.sourceName,
      status: c.status,
      claim_id: c.facts?.claim_id || null,
      facts: c.facts,
      parse_quality: c.quality,
      warnings: c.warnings,
      error: c.error,
      evidence_count: c.search?.total_results || 0,
      case_specific_evidence: (c.search?.results || []).filter((r) => r.case_specific).length,
      evidence: (c.search?.results || []).map((r) => ({
        title: r.title, url: r.url, domain: r.domain, relevance: r.relevance_score,
        published: r.publish_date, why: r.match_reasons, case_specific: r.case_specific
      })),
      research_trail: (c.search?.deep_links || []).flatMap((g) => g.links.map((l) => ({ group: g.group, label: l.label, url: l.url }))),
      summary: c.search?.ai_summary || null
    }));
    const blob = new Blob([JSON.stringify({ generated_at: new Date().toISOString(), cases: payload }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usgi_batch_evidence_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const exportCsv = () => {
    const rows = [[
      'Source', 'Claim ID', 'Insured', 'Vehicle', 'Loss date', 'Location',
      'Status', 'Evidence records', 'Case-specific matches', 'Top source', 'Top relevance', 'Top URL'
    ]];
    cases.forEach((c) => {
      const top = (c.search?.results || [])[0];
      rows.push([
        c.sourceName,
        c.facts?.claim_id || '',
        c.facts?.insured_name || '',
        c.facts?.vehicle_numbers || '',
        c.facts?.accident_date_time || '',
        c.facts?.loss_location || c.facts?.district_state || '',
        c.status,
        c.search?.total_results ?? 0,
        (c.search?.results || []).filter((r) => r.case_specific).length,
        top?.domain || '',
        top ? Math.round(top.relevance_score) : '',
        top?.url || ''
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usgi_batch_register_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const pushToPortfolio = () => {
    if (!onPushCases) return;
    const ready = cases.filter((c) => c.facts && c.status === CASE_STATUS.DONE);
    if (!ready.length) return;
    onPushCases(ready);
    setPushed(true);
    setTimeout(() => setPushed(false), 4000);
  };

  const s = summary || { total: 0, settled: 0, progress: 0, byStatus: {}, evidenceRecords: 0, casesWithEvidence: 0, casesWithCaseSpecificEvidence: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* -------------------------------------------------- upload panel --- */}
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--usgi-red)' }} />
              Bulk case ingestion &amp; parallel evidence discovery
            </h3>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, maxWidth: '760px', lineHeight: '1.6' }}>
              Drop up to 50+ PDF intimation sheets, ZIP case archives, or a single Excel registry carrying 50 claim rows.
              Documents are parsed and searched concurrently — evidence for the first cases starts arriving while the
              remaining files are still being read. Select any case on the left to review its own search.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} disabled={running} />
              Search the web while parsing
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
              Parallel searches
              <select
                value={searchConcurrency}
                onChange={(e) => setSearchConcurrency(Number(e.target.value))}
                disabled={running}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              >
                <option value={2}>2 — safest</option>
                <option value={3}>3 — balanced</option>
                <option value={5}>5 — fast</option>
                <option value={8}>8 — aggressive</option>
              </select>
            </label>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !running && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--usgi-red)' : '#CBD5E1'}`,
            background: dragging ? '#FFF5F5' : '#F8FAFC',
            borderRadius: '12px', padding: '30px 20px', textAlign: 'center',
            cursor: running ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease'
          }}
        >
          <Upload size={30} style={{ color: 'var(--usgi-red)', marginBottom: '8px' }} />
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', margin: '0 0 4px 0' }}>
            {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready` : 'Drop files here, or click to browse'}
          </p>
          <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
            PDF · Excel (.xlsx / .xls / .csv) · ZIP case archives · text. Select many at once.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xlsm,.xls,.csv,.zip,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {!!files.length && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '124px', overflowY: 'auto', padding: '2px' }}>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F1F5F9',
                  border: '1px solid #E2E8F0', borderRadius: '20px', padding: '4px 10px', fontSize: '11.5px', color: '#334155'
                }}>
                  <FileText size={12} color="#64748B" />
                  {f.name}
                  <span style={{ color: '#94A3B8' }}>{formatBytes(f.size)}</span>
                  {!running && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setFiles((p) => p.filter((_, j) => j !== i)); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: 0 }}
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={start} disabled={running || !files.length} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                {running ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                {running ? 'Processing…' : `Parse & search ${files.length} file${files.length === 1 ? '' : 's'}`}
              </button>
              {running && (
                <button className="btn btn-secondary" onClick={cancel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Ban size={15} /> Cancel
                </button>
              )}
              {!running && (
                <button className="btn btn-secondary" onClick={() => { setFiles([]); setCases([]); setSummary(null); setSelectedId(null); }}>
                  <X size={15} /> Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ progress --- */}
      {!!cases.length && (
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A' }}>
                {s.settled} of {s.total} cases settled
              </span>
              {running && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--usgi-red)' }} />}
              {!running && s.total > 0 && (
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  finished in {(s.elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" style={{ padding: '5px 11px', fontSize: '11.5px' }} onClick={exportCsv}>
                <Download size={13} /> Register (CSV)
              </button>
              <button className="btn btn-secondary" style={{ padding: '5px 11px', fontSize: '11.5px' }} onClick={exportAll}>
                <Download size={13} /> Full evidence (JSON)
              </button>
              {onPushCases && (
                <button className="btn btn-primary" style={{ padding: '5px 11px', fontSize: '11.5px' }} onClick={pushToPortfolio} disabled={!s.byStatus[CASE_STATUS.DONE]}>
                  {pushed ? <Check size={13} /> : <Database size={13} />}
                  {pushed ? 'Added to portfolio' : `Add ${s.byStatus[CASE_STATUS.DONE] || 0} to portfolio`}
                </button>
              )}
            </div>
          </div>

          <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '20px', overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{
              width: `${s.progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #CC0022 0%, #F43F5E 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Complete', value: s.byStatus[CASE_STATUS.DONE] || 0, colour: '#15803D' },
              { label: 'In flight', value: (s.byStatus[CASE_STATUS.PARSING] || 0) + (s.byStatus[CASE_STATUS.SEARCHING] || 0) + (s.byStatus[CASE_STATUS.PARSED] || 0), colour: '#1D4ED8' },
              { label: 'Failed', value: s.byStatus[CASE_STATUS.FAILED] || 0, colour: '#B91C1C' },
              { label: 'Evidence records', value: s.evidenceRecords, colour: '#7C3AED' },
              { label: 'Cases with a case-specific hit', value: s.casesWithCaseSpecificEvidence, colour: '#CC0022' }
            ].map((stat, i) => (
              <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '10px 13px' }}>
                <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: '19px', fontWeight: '800', color: stat.colour, marginTop: '2px' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------- case picker + result -- */}
      {!!cases.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '18px', alignItems: 'start' }} className="batch-split">
          {/* case list */}
          <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '14px 16px', position: 'sticky', top: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} style={{ color: 'var(--usgi-red)' }} />
              Choose a case to review ({visibleCases.length})
            </div>

            <input
              type="text"
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              placeholder="Filter by claim, insured, vehicle, place…"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12px', borderRadius: '7px', border: '1px solid #CBD5E1', marginBottom: '8px' }}
            />

            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {['ALL', CASE_STATUS.DONE, CASE_STATUS.SEARCHING, CASE_STATUS.FAILED].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '3px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: '700',
                    border: 'none', cursor: 'pointer',
                    background: statusFilter === st ? 'var(--usgi-red)' : '#F1F5F9',
                    color: statusFilter === st ? '#FFFFFF' : '#475569'
                  }}
                >
                  {st === 'ALL' ? 'All' : STATUS_META[st]?.label || st}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '620px', overflowY: 'auto', paddingRight: '3px' }}>
              {visibleCases.map((c) => {
                const meta = STATUS_META[c.status] || STATUS_META[CASE_STATUS.QUEUED];
                const SourceIcon = SOURCE_ICONS[c.sourceType] || FileText;
                const isActive = c.id === selectedId;
                const hits = c.search?.total_results || 0;
                const specific = (c.search?.results || []).filter((r) => r.case_specific).length;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      textAlign: 'left', width: '100%', cursor: 'pointer',
                      background: isActive ? '#FFF5F5' : '#FFFFFF',
                      border: `1px solid ${isActive ? 'var(--usgi-red)' : '#E2E8F0'}`,
                      borderRadius: '9px', padding: '9px 11px',
                      display: 'flex', flexDirection: 'column', gap: '5px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                        <SourceIcon size={12} color="#64748B" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {caseLabel(c)}
                        </span>
                      </span>
                      <span style={{
                        background: meta.bg, color: meta.colour, fontSize: '9.5px', fontWeight: '800',
                        padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0
                      }}>
                        {meta.label}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[c.facts?.insured_name, c.facts?.vehicle_numbers, c.facts?.loss_location || c.facts?.district_state]
                        .filter(Boolean).join(' · ') || c.sourceName}
                    </div>

                    {c.status === CASE_STATUS.DONE && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '10.5px' }}>
                        <span style={{ color: hits ? '#15803D' : '#94A3B8', fontWeight: '700' }}>
                          {hits} record{hits === 1 ? '' : 's'}
                        </span>
                        {specific > 0 && (
                          <span style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: '800', padding: '1px 5px', borderRadius: '3px' }}>
                            {specific} case-specific
                          </span>
                        )}
                      </div>
                    )}

                    {c.error && (
                      <div style={{ fontSize: '10.5px', color: '#B91C1C', display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: '1.4' }}>
                        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: '1px' }} /> {c.error}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* selected case detail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            {!selected ? (
              <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
                <ChevronRight size={30} color="#94A3B8" style={{ margin: '0 auto 10px auto' }} />
                <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>Select a case</h4>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                  Pick any case on the left to see its parsed facts, its evidence records and its own Google research trail.
                </p>
              </div>
            ) : (
              <>
                <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: '0 0 4px 0' }}>
                        {caseLabel(selected)}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                        Parsed from <strong>{selected.sourceName}</strong>
                        {selected.quality && ` · ${selected.quality.criticalFound}/${selected.quality.criticalTotal} critical fields recovered`}
                      </p>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => retryCase(selected.id)}
                      disabled={selected.status === CASE_STATUS.SEARCHING || !selected.facts}
                    >
                      <RefreshCw size={13} className={selected.status === CASE_STATUS.SEARCHING ? 'animate-spin' : ''} />
                      Re-run search
                    </button>
                  </div>

                  {!!(selected.warnings || []).length && (
                    <div style={{ marginTop: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '9px 13px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <AlertTriangle size={13} /> Parse warnings
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: '#78350F', lineHeight: '1.6' }}>
                        {selected.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {selected.facts && (
                    <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '9px' }}>
                      {[
                        ['Insured', selected.facts.insured_name],
                        ['Driver', selected.facts.driver_name],
                        ['Vehicle', selected.facts.vehicle_numbers],
                        ['Loss date', selected.facts.accident_date_time],
                        ['Spot', selected.facts.spot_of_accident || selected.facts.loss_location],
                        ['District / state', selected.facts.district_state],
                        ['Police station', selected.facts.police_station],
                        ['Policy', selected.facts.policy_information]
                      ].filter(([, v]) => v && String(v).trim()).map(([label, value], i) => (
                        <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 11px' }}>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                          <div style={{ fontSize: '12.5px', color: '#0F172A', fontWeight: '700', marginTop: '2px', wordBreak: 'break-word' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selected.facts && (
                    <div style={{ marginTop: '16px' }}>
                      <ClaimFactMatrix facts={selected.facts} confidence={selected.confidence} />
                    </div>
                  )}
                </div>

                {selected.status === CASE_STATUS.SEARCHING && (
                  <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '30px', textAlign: 'center' }}>
                    <RefreshCw size={26} className="animate-spin" style={{ color: 'var(--usgi-red)', marginBottom: '10px' }} />
                    <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                      Searching public sources for this case…
                    </p>
                  </div>
                )}

                {selected.search && (
                  <EvidenceResultsPanel
                    search={selected.search}
                    title={`${selected.search.total_results} public record${selected.search.total_results === 1 ? '' : 's'} for ${caseLabel(selected)}`}
                    subtitle={`${selected.search.query_executed.length} queries dispatched from this case's parsed facts`}
                    compact
                  />
                )}

                {selected.status === CASE_STATUS.FAILED && (
                  <div className="card" style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} style={{ color: '#B91C1C', flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#991B1B', margin: '0 0 4px 0' }}>This case could not be parsed</h4>
                        <p style={{ fontSize: '12.5px', color: '#7F1D1D', margin: 0, lineHeight: '1.6' }}>{selected.error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
