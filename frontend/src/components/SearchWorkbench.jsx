import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Globe, Shield, Zap, Sparkles, RefreshCw, MapPin, Calendar, Car,
  User, AlertCircle, FileText, Layers, Link2, Wifi, WifiOff, ExternalLink,
  ChevronRight
} from 'lucide-react';

import EvidenceResultsPanel from './EvidenceResultsPanel';
import BatchCaseWorkspace from './BatchCaseWorkspace';
import { runSearch, previewDeepLinks, getTransport } from '../lib/searchService';

// Example queries that demonstrate the query planner's behaviour. These only
// prefill the form — nothing about them is special-cased anywhere in the
// search path, so any query the investigator types behaves identically.
const EXAMPLE_QUERIES = [
  {
    name: 'Plate-anchored search',
    hint: 'Highest precision — searches every written form of the registration',
    query: 'RJ14GH9988 accident',
    vehicle_no: 'RJ-14-GH-9988',
    location: 'Jaipur',
    date_str: '',
    incident_keywords: 'dumper collision'
  },
  {
    name: 'Location + date search',
    hint: 'Finds the district daily report published the morning after',
    query: '',
    vehicle_no: '',
    location: 'Chittorgarh',
    date_str: '18-05-2026',
    incident_keywords: 'trailer overturned highway'
  },
  {
    name: 'Named party search',
    hint: 'Looks for the claimant or driver named in a report or FIR bulletin',
    query: '',
    insured_name: 'Rameshwar Lal Gurjar',
    location: 'Gangrar',
    date_str: '',
    incident_keywords: 'accident FIR'
  },
  {
    name: 'Casualty-count search',
    hint: 'Filters out reports whose death toll contradicts the claim',
    query: '7 killed bus accident Chamba Himachal',
    vehicle_no: '',
    location: 'Chamba',
    date_str: '',
    incident_keywords: 'bus plunged gorge'
  }
];

export default function SearchWorkbench() {
  const [mode, setMode] = useState('keyword'); // 'keyword' | 'batch'
  const [searchMode, setSearchMode] = useState('freeform'); // 'freeform' | 'structured'

  const [freeformQuery, setFreeformQuery] = useState('');
  const [insuredName, setInsuredName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [location, setLocation] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [incidentKeywords, setIncidentKeywords] = useState('');

  const [includeVernacular, setIncludeVernacular] = useState(true);
  const [minScore, setMinScore] = useState(20);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(null);
  const [error, setError] = useState(null);

  // Facts assembled from the structured form; these feed the anchor extractor
  // exactly the same way a parsed Excel row or PDF would.
  const structuredFacts = useMemo(() => ({
    insured_name: insuredName,
    driver_name: insuredName,
    vehicle_numbers: vehicleNo,
    loss_location: location,
    spot_of_accident: location,
    accident_date_time: dateStr,
    FIR_cause_narrative: incidentKeywords
  }), [insuredName, vehicleNo, location, dateStr, incidentKeywords]);

  const activeQuery = searchMode === 'freeform'
    ? freeformQuery
    : [insuredName, vehicleNo, location, incidentKeywords].filter(Boolean).join(' ');

  // Live preview of the manual research trail — updates as the investigator
  // types, before any network call happens.
  const preview = useMemo(() => {
    if (!activeQuery.trim() && !vehicleNo && !location) return null;
    try {
      return previewDeepLinks(
        searchMode === 'freeform' ? freeformQuery : '',
        searchMode === 'freeform' ? {} : structuredFacts
      );
    } catch {
      return null;
    }
  }, [activeQuery, freeformQuery, searchMode, structuredFacts, vehicleNo, location]);

  const canSearch = Boolean(activeQuery.trim() || vehicleNo.trim() || location.trim());

  const execute = useCallback(async (overrides = null) => {
    const params = overrides || {
      query: searchMode === 'freeform' ? freeformQuery : '',
      facts: searchMode === 'freeform' ? {} : structuredFacts
    };
    if (!params.query?.trim() && !Object.values(params.facts || {}).some((v) => v && String(v).trim())) {
      setError('Enter keywords, a registration number, or an accident location to search.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await runSearch({
        query: params.query,
        facts: params.facts,
        options: { maxQueries: 8, limit: 60, minScore, includeVernacular }
      });
      setSearch(result);
      if (result.insufficient_anchors) {
        setError(result.guidance);
      } else if (result.mode !== 'live') {
        setError('Live search engines are not reachable from this deployment right now. The Google Research Trail below is fully functional — every link runs the real search directly.');
      }
    } catch (err) {
      setError(`Search failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [searchMode, freeformQuery, structuredFacts, minScore, includeVernacular]);

  const loadExample = (ex) => {
    setSearchMode(ex.query ? 'freeform' : 'structured');
    setFreeformQuery(ex.query || '');
    setInsuredName(ex.insured_name || '');
    setVehicleNo(ex.vehicle_no || '');
    setLocation(ex.location || '');
    setDateStr(ex.date_str || '');
    setIncidentKeywords(ex.incident_keywords || '');

    execute({
      query: ex.query || '',
      facts: ex.query ? {} : {
        insured_name: ex.insured_name || '',
        driver_name: ex.insured_name || '',
        vehicle_numbers: ex.vehicle_no || '',
        loss_location: ex.location || '',
        spot_of_accident: ex.location || '',
        accident_date_time: ex.date_str || '',
        FIR_cause_narrative: ex.incident_keywords || ''
      }
    });
  };

  const transport = getTransport();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ------------------------------------------------------- banner ---- */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
        color: '#FFFFFF', padding: '24px 30px', border: 'none',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ maxWidth: '820px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--usgi-red)', padding: '6px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={18} color="#FFFFFF" />
                <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.5px' }}>SEARCH LAB</span>
              </div>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>
                Public evidence discovery for RCU claim investigation
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 8px 0', color: '#FFFFFF' }}>
              Universal Sompo public evidence search workbench
            </h2>
            <p style={{ fontSize: '13px', color: '#CBD5E1', margin: 0, lineHeight: '1.6' }}>
              Search live news indexes, regional Hindi dailies, video archives and public registries for a claim — either by
              typing keywords, or by uploading the claim files themselves. Every result carries the reason it ranked where it
              did, and every search also produces the exact Google, ePaper and registry links you would open by hand.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: '700' }}>Engine status</div>
              <div style={{ fontSize: '13.5px', fontWeight: '800', color: transport === 'offline' ? '#FBBF24' : '#34D399', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {transport === 'offline' ? <WifiOff size={14} /> : <Wifi size={14} />}
                {transport === 'function' && 'Live · serverless'}
                {transport === 'legacy' && 'Live · backend'}
                {transport === 'offline' && 'Manual links only'}
                {transport === 'unknown' && 'Ready'}
              </div>
            </div>
            {search && (
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: '700' }}>Last run</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#38BDF8', marginTop: '2px' }}>
                  {search.execution_time_seconds}s · {search.total_results} records
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- mode switch --- */}
      <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '5px', borderRadius: '10px', width: 'fit-content', flexWrap: 'wrap' }}>
        <button
          onClick={() => setMode('keyword')}
          style={{
            padding: '8px 18px', fontSize: '13px', fontWeight: '700', borderRadius: '7px',
            border: 'none', cursor: 'pointer',
            background: mode === 'keyword' ? '#FFFFFF' : 'transparent',
            color: mode === 'keyword' ? 'var(--usgi-red)' : '#64748B',
            boxShadow: mode === 'keyword' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
            display: 'flex', alignItems: 'center', gap: '7px'
          }}
        >
          <Search size={15} /> Keyword search
        </button>
        <button
          onClick={() => setMode('batch')}
          style={{
            padding: '8px 18px', fontSize: '13px', fontWeight: '700', borderRadius: '7px',
            border: 'none', cursor: 'pointer',
            background: mode === 'batch' ? '#FFFFFF' : 'transparent',
            color: mode === 'batch' ? 'var(--usgi-red)' : '#64748B',
            boxShadow: mode === 'batch' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
            display: 'flex', alignItems: 'center', gap: '7px'
          }}
        >
          <Layers size={15} /> Bulk case files (PDF / Excel)
        </button>
      </div>

      {/* ================================================== BATCH MODE ===== */}
      {mode === 'batch' && <BatchCaseWorkspace />}

      {/* ================================================ KEYWORD MODE ===== */}
      {mode === 'keyword' && (
        <>
          {/* examples */}
          <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '16px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '11px' }}>
              <Sparkles size={15} color="var(--usgi-red)" />
              <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Example searches
              </span>
              <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                — these only prefill the form; nothing about them is special-cased
              </span>
            </div>
            <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
              {EXAMPLE_QUERIES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => loadExample(ex)}
                  title={ex.hint}
                  style={{
                    background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px',
                    padding: '8px 13px', fontSize: '12.5px', fontWeight: '600', color: '#1E293B',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--usgi-red)'; e.currentTarget.style.background = '#FFF5F5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#F8FAFC'; }}
                >
                  <Zap size={13} color="var(--usgi-red)" />
                  {ex.name}
                </button>
              ))}
            </div>
          </div>

          {/* search form */}
          <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
                {[['freeform', 'Freeform keywords'], ['structured', 'Claim parameter matrix']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSearchMode(key)}
                    style={{
                      padding: '6px 14px', fontSize: '12px', fontWeight: '700', borderRadius: '6px',
                      border: 'none', cursor: 'pointer',
                      background: searchMode === key ? '#FFFFFF' : 'transparent',
                      color: searchMode === key ? 'var(--usgi-red)' : '#64748B',
                      boxShadow: searchMode === key ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeVernacular} onChange={(e) => setIncludeVernacular(e.target.checked)} />
                  Include Indian-language vernacular queries
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#475569' }}>
                  Relevance floor {minScore}%
                  <input type="range" min="0" max="70" step="5" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={{ width: '110px' }} />
                </label>
              </div>
            </div>

            {searchMode === 'freeform' ? (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '260px' }}>
                  <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: '#94A3B8' }} />
                  <input
                    type="text"
                    value={freeformQuery}
                    onChange={(e) => setFreeformQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canSearch && !loading && execute()}
                    placeholder="Registration number, accident spot, claimant name, or a plain description of the incident…"
                    style={{ width: '100%', padding: '12px 14px 12px 42px', fontSize: '14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontWeight: '500' }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => execute()}
                  disabled={loading || !canSearch}
                  style={{ minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                  {loading ? 'Searching…' : 'Search public sources'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {[
                    { icon: User, label: 'Insured / driver / victim name', value: insuredName, set: setInsuredName, placeholder: 'e.g. Rameshwar Lal Gurjar' },
                    { icon: Car, label: 'Vehicle registration (RTO)', value: vehicleNo, set: setVehicleNo, placeholder: 'e.g. RJ-09-GC-8889' },
                    { icon: MapPin, label: 'Accident spot / city / district', value: location, set: setLocation, placeholder: 'e.g. Gangrar, Chittorgarh' },
                    { icon: Calendar, label: 'Date of accident (DD-MM-YYYY)', value: dateStr, set: setDateStr, placeholder: 'e.g. 18-05-2026' }
                  ].map((field, i) => {
                    const Icon = field.icon;
                    return (
                      <div key={i}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                          <Icon size={13} /> {field.label}
                        </label>
                        <input
                          type="text"
                          value={field.value}
                          onChange={(e) => field.set(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && canSearch && !loading && execute()}
                          placeholder={field.placeholder}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <FileText size={13} /> Incident narrative / vehicle description / collision details
                  </label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={incidentKeywords}
                      onChange={(e) => setIncidentKeywords(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && canSearch && !loading && execute()}
                      placeholder="e.g. trailer overturned NH-79 brake failure"
                      style={{ flex: 1, minWidth: '240px', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => execute()}
                      disabled={loading || !canSearch}
                      style={{ minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                      {loading ? 'Searching…' : 'Run matrix search'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* live anchor + trail preview */}
            {preview && !search && (
              <div style={{ marginTop: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '13px 16px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={13} color="var(--usgi-red)" /> Anchors detected — the search will key on these
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {[
                    ...preview.anchors.plates.map((v) => ['Plate', v]),
                    ...preview.anchors.names.map((v) => ['Name', v]),
                    ...preview.anchors.places.slice(0, 4).map((v) => ['Place', v]),
                    ...preview.anchors.corridors.map((v) => ['Corridor', v]),
                    ...preview.anchors.vehicleTypes.slice(0, 3).map((v) => ['Vehicle', v]),
                    ...(preview.anchors.dateISO ? [['Date', preview.anchors.dateISO]] : []),
                    ...(preview.anchors.casualties ? [['Casualties', String(preview.anchors.casualties)]] : [])
                  ].map(([kind, value], i) => (
                    <span key={i} style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '5px', padding: '3px 8px', fontSize: '11.5px', color: '#334155' }}>
                      <strong style={{ color: '#94A3B8', fontSize: '10px', textTransform: 'uppercase', marginRight: '5px' }}>{kind}</strong>
                      {value}
                    </span>
                  ))}
                  {!preview.anchors.plates.length && !preview.anchors.places.length && !preview.anchors.names.length && (
                    <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                      No strong anchors yet — add a registration number, place or date to sharpen the search.
                    </span>
                  )}
                </div>
                <a
                  href={preview.deepLinks[0]?.links[0]?.url || '#'}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: 'var(--usgi-red)', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  Open this in Google right now <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '13px 18px', color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '12.5px', fontWeight: '600', lineHeight: '1.55' }}>{error}</span>
            </div>
          )}

          {loading && !search && (
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
              <RefreshCw size={30} className="animate-spin" style={{ color: 'var(--usgi-red)', marginBottom: '12px' }} />
              <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0' }}>Querying public sources</h4>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                Fanning out across news indexes, Hindi regional press and video archives…
              </p>
            </div>
          )}

          {search && (
            <EvidenceResultsPanel
              search={search}
              subtitle={`${search.query_executed.length} queries dispatched · ${search.raw_result_count} raw records fetched · ${search.total_results} retained after ranking`}
            />
          )}

          {!search && !loading && (
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '34px', textAlign: 'center' }}>
              <Shield size={32} color="var(--usgi-red)" style={{ margin: '0 auto 12px auto' }} />
              <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '8px' }}>
                Search a claim, or upload the claim files
              </h4>
              <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '620px', margin: '0 auto 16px auto', lineHeight: '1.6' }}>
                Type what you know about the incident above, or switch to <strong>Bulk case files</strong> to drop 50 PDF
                intimation sheets or one Excel registry — every case is parsed and searched in parallel, and you can review
                each one's evidence separately.
              </p>
              <button className="btn btn-secondary" onClick={() => setMode('batch')} style={{ fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} /> Go to bulk case files <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
