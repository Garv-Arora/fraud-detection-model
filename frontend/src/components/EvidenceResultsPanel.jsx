import React, { useState, useMemo } from 'react';
import {
  Sparkles, Globe, Terminal, ExternalLink, Copy, Check, FileText,
  ChevronDown, ChevronUp, Download, ArrowUpRight, Search, Newspaper,
  MapPin, Video, BookOpen, Shield, AlertTriangle, Link2, Layers
} from 'lucide-react';

import GeminiAiSummaryCard from './GeminiAiSummaryCard';

const GROUP_ICONS = {
  search: Search,
  newspaper: Newspaper,
  book: BookOpen,
  video: Video,
  map: MapPin,
  globe: Globe
};

const CATEGORIES = ['ALL', 'News', 'YouTube', 'Web'];

function categoryOf(record) {
  const url = (record.url || '').toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (record.source === 'News' || record.authoritative) return 'News';
  return 'Web';
}

function relevanceColour(score) {
  if (score >= 75) return { bg: '#DCFCE7', fg: '#15803D', border: '#BBF7D0' };
  if (score >= 50) return { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' };
  return { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' };
}

/**
 * Renders the four investigator-facing views over one search bundle:
 *   Evidence Summary · Discovered Records · Google Research Trail · Query Matrix
 *
 * The Research Trail is the answer to "what would I get if I typed this into
 * Google myself" — deterministic, always available, no network required.
 */
// Confidence bands. The distinction they draw is the one that matters in a
// fraud file: whether a source actually names something from this claim, or
// merely describes an accident in the same place at the same time.
const BAND_STYLE = {
  CONFIRMED: {
    label: 'CONFIRMED', bg: '#FEE2E2', fg: '#B91C1C', rail: 'var(--usgi-red)',
    hint: 'An identifier from this claim — registration plate, claimant or transport operator — appears in the source.'
  },
  STRONG: {
    label: 'STRONG', bg: '#FEF3C7', fg: '#92400E', rail: '#F59E0B',
    hint: 'Location, date and incident all align, but no source names the vehicle or the claimant. Circumstantial only.'
  },
  BACKGROUND: {
    label: 'BACKGROUND', bg: '#F1F5F9', fg: '#475569', rail: '#CBD5E1',
    hint: 'Keyword overlap only. Context, not corroboration.'
  }
};

const BAND_ORDER = ['CONFIRMED', 'STRONG', 'BACKGROUND'];

export default function EvidenceResultsPanel({ search, title, subtitle, compact = false }) {
  const [tab, setTab] = useState('summary');
  const [category, setCategory] = useState('ALL');
  const [band, setBand] = useState('ALL');
  const [expanded, setExpanded] = useState({});
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [minScore, setMinScore] = useState(0);

  // Derived arrays are memoised on the search bundle itself: rebuilding them
  // every render would invalidate every downstream useMemo below.
  const results = useMemo(() => search?.results || [], [search]);
  const deepLinks = useMemo(() => search?.deep_links || [], [search]);
  const plan = useMemo(() => search?.query_plan || [], [search]);

  const filtered = useMemo(() => results.filter((r) => {
    // A CONFIRMED record is never hidden by the relevance slider. An identifier
    // match is the entire object of the search, and a short article can score
    // low while still naming the plate.
    if (r.band !== 'CONFIRMED' && r.relevance_score < minScore) return false;
    if (band !== 'ALL' && (r.band || 'BACKGROUND') !== band) return false;
    if (category === 'ALL') return true;
    return categoryOf(r) === category;
  }), [results, category, minScore, band]);

  const counts = useMemo(() => {
    const out = { ALL: results.length, News: 0, Web: 0, YouTube: 0 };
    results.forEach((r) => { out[categoryOf(r)] += 1; });
    return out;
  }, [results]);

  const bandCounts = useMemo(() => {
    const out = { CONFIRMED: 0, STRONG: 0, BACKGROUND: 0 };
    results.forEach((r) => { out[r.band || 'BACKGROUND'] += 1; });
    return out;
  }, [results]);

  const totalTrailLinks = useMemo(
    () => deepLinks.reduce((n, g) => n + (g.links?.length || 0), 0),
    [deepLinks]
  );

  if (!search) return null;

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 1800);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(search, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usgi_evidence_${(search.anchors?.claimId || 'search').replace(/\W+/g, '_')}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const exportTrailCsv = () => {
    const rows = [['Group', 'Link', 'Query', 'URL', 'Why it matters']];
    deepLinks.forEach((g) => (g.links || []).forEach((l) => {
      rows.push([g.group, l.label, l.sub || '', l.url, l.why || '']);
    }));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usgi_research_trail_${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* ---------------------------------------------------- navigation --- */}
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: compact ? '14px 18px' : '18px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: compact ? '14px' : '16px', fontWeight: '800', color: '#1E293B', margin: 0 }}>
                {title || `${search.total_results} public record${search.total_results === 1 ? '' : 's'} discovered`}
              </h3>
              <span className="badge" style={{ background: '#D1FAE5', color: '#047857', fontSize: '11px', fontWeight: '700' }}>
                {search.execution_time_seconds}s
              </span>
              <span className="badge" style={{
                background: search.mode === 'live' ? '#EFF6FF' : '#FEF3C7',
                color: search.mode === 'live' ? '#1D4ED8' : '#B45309',
                fontSize: '11px', fontWeight: '700'
              }}>
                {search.mode === 'live' ? `Live · ${(search.engines_used || []).length} engines responded` : 'Manual research links only'}
              </span>
              {!!(search.engines_unavailable || []).length && (
                <span
                  className="badge"
                  title={search.engines_unavailable.map((e) => `${e.engine}: ${e.reason}`).join('\n')}
                  style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', fontSize: '11px', fontWeight: '700' }}
                >
                  {search.engines_unavailable.length} engine{search.engines_unavailable.length > 1 ? 's' : ''} unavailable
                </span>
              )}
            </div>
            {subtitle && (
              <p style={{ fontSize: '12px', color: '#64748B', margin: '5px 0 0 0' }}>{subtitle}</p>
            )}
            {!!(search.keywords_extracted || []).length && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '7px', display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: '600' }}>Anchors:</span>
                {search.keywords_extracted.slice(0, 12).map((kw, i) => (
                  <span key={i} style={{ background: '#F1F5F9', color: '#334155', padding: '2px 7px', borderRadius: '4px', fontWeight: '600' }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={exportJSON} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Export JSON
            </button>
          </div>
        </div>

        <div className="tab-container" style={{ marginTop: '14px', marginBottom: 0, borderBottom: '1px solid #E2E8F0', paddingBottom: 0 }}>
          <button className={`tab-btn ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
            <Sparkles size={16} style={{ color: 'var(--usgi-red)' }} /> Evidence Summary
          </button>
          <button className={`tab-btn ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>
            <Globe size={16} /> Discovered Records ({results.length})
          </button>
          <button className={`tab-btn ${tab === 'trail' ? 'active' : ''}`} onClick={() => setTab('trail')}>
            <Link2 size={16} /> Google Research Trail ({totalTrailLinks})
          </button>
          <button className={`tab-btn ${tab === 'queries' ? 'active' : ''}`} onClick={() => setTab('queries')}>
            <Terminal size={16} /> Query Matrix ({plan.length})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------- 1. AI summary --- */}
      {tab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {search.ai_summary && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  navigator.clipboard.writeText(search.ai_summary);
                  setCopiedSummary(true);
                  setTimeout(() => setCopiedSummary(false), 2000);
                }}
              >
                {copiedSummary ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
                {copiedSummary ? 'Copied' : 'Copy summary'}
              </button>
            </div>
          )}
          <GeminiAiSummaryCard summaryText={search.ai_summary} />

          {!!(search.errors || []).length && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>
                <AlertTriangle size={15} /> Engine notices
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#78350F' }}>
                {search.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- 2. Records list ----- */}
      {tab === 'records' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                    border: 'none', cursor: 'pointer',
                    background: category === cat ? 'var(--usgi-red)' : '#E2E8F0',
                    color: category === cat ? '#FFFFFF' : '#475569'
                  }}
                >
                  {cat === 'ALL' ? `All sources (${counts.ALL})` : `${cat} (${counts[cat]})`}
                </button>
              ))}
            </div>

            {/* Band filter. With the net thrown as wide as it now is, an
                investigator needs to isolate the records that actually name
                something from the claim without losing sight of the rest. */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['ALL', ...BAND_ORDER].map((b) => {
                const style = BAND_STYLE[b];
                const n = b === 'ALL' ? results.length : bandCounts[b];
                const active = band === b;
                return (
                  <button
                    key={b}
                    onClick={() => setBand(b)}
                    disabled={b !== 'ALL' && !n}
                    title={style ? style.hint : 'Every record returned, in every band.'}
                    style={{
                      padding: '6px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: '800',
                      border: active ? '2px solid #0F172A' : '1px solid #E2E8F0',
                      cursor: (b !== 'ALL' && !n) ? 'not-allowed' : 'pointer',
                      opacity: (b !== 'ALL' && !n) ? 0.4 : 1,
                      background: style ? style.bg : '#F1F5F9',
                      color: style ? style.fg : '#475569'
                    }}
                  >
                    {b === 'ALL' ? `All bands (${n})` : `${b} (${n})`}
                  </button>
                );
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', fontWeight: '600' }}>
              Minimum relevance: {minScore}%
              <input
                type="range" min="0" max="90" step="5" value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                style={{ width: '130px' }}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '36px', textAlign: 'center' }}>
              <Shield size={34} color="var(--usgi-red)" style={{ margin: '0 auto 12px auto' }} />
              <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '8px' }}>
                {results.length === 0 ? 'No public web records matched these parameters' : 'No records pass the current filter'}
              </h4>
              <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '600px', margin: '0 auto 14px auto', lineHeight: '1.55' }}>
                {results.length === 0
                  ? 'A nil digital footprint is common for minor own-damage losses on district roads and is not by itself a fraud indicator. Use the Google Research Trail to run the manual checks — the date-locked and Hindi-language queries reach reporting the automated engines index poorly.'
                  : 'Lower the minimum relevance threshold or switch category to see more records.'}
              </p>
              {results.length === 0 && (
                <button className="btn btn-primary" style={{ fontSize: '12px' }} onClick={() => setTab('trail')}>
                  <Link2 size={14} /> Open the Google Research Trail
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filtered.map((item, idx) => {
                const colour = relevanceColour(item.relevance_score);
                const isOpen = expanded[item.url];
                return (
                  <div key={item.url || idx} className="card" style={{
                    background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: `4px solid ${(BAND_STYLE[item.band] || BAND_STYLE.BACKGROUND).rail}`,
                    borderRadius: '10px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '9px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: '800' }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Globe size={13} color="#64748B" /> {item.domain || 'web'}
                        </span>
                        {item.engine && (
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>via {item.engine}</span>
                        )}
                        {item.publish_date && (
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>• {String(item.publish_date).slice(0, 25)}</span>
                        )}
                        {(() => {
                          const b = BAND_STYLE[item.band] || BAND_STYLE.BACKGROUND;
                          return (
                            <span className="badge" title={b.hint} style={{ background: b.bg, color: b.fg, fontSize: '10.5px', fontWeight: '800' }}>
                              {b.label}
                            </span>
                          );
                        })()}
                        {item.distinct_incident && (
                          <span className="badge" title="Another result shares this headline but reports a different date or casualty count. They are not the same event." style={{ background: '#FEF3C7', color: '#92400E', fontSize: '10.5px', fontWeight: '800' }}>
                            SEPARATE INCIDENT
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: colour.bg, color: colour.fg, border: `1px solid ${colour.border}`,
                          padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: '800'
                        }}>
                          {Math.round(item.relevance_score)}% relevance
                        </span>
                        <button
                          onClick={() => copy(item.url, item.url)}
                          title="Copy link"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedUrl === item.url ? '#059669' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                        >
                          {copiedUrl === item.url ? <Check size={14} /> : <Copy size={14} />}
                          {copiedUrl === item.url ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0, lineHeight: '1.4' }}>
                      <a
                        href={item.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#0F172A', textDecoration: 'none', display: 'inline-flex', alignItems: 'flex-start', gap: '6px' }}
                      >
                        {item.title || 'Untitled record'}
                        <ArrowUpRight size={15} color="var(--usgi-red)" style={{ flexShrink: 0, marginTop: '3px' }} />
                      </a>
                    </h4>

                    {/* Aggregator redirect URLs are hundreds of characters of
                        opaque base64; show a readable form and keep the full
                        link on the headline and the copy button. */}
                    <div style={{ fontSize: '11.5px', color: 'var(--usgi-red)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                      {item.url.length > 120 ? `${item.url.slice(0, 117)}…` : item.url}
                    </div>

                    {item.snippet && (
                      <p style={{ fontSize: '13px', color: '#334155', lineHeight: '1.55', margin: 0 }}>
                        {item.snippet}
                      </p>
                    )}

                    {!!(item.match_reasons || []).length && (
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '9px 12px' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                          Why this ranked here
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#334155', lineHeight: '1.6' }}>
                          {item.match_reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}

                    {!!(item.matched_keywords || []).length && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Matched:</span>
                        {item.matched_keywords.slice(0, 8).map((kw, i) => (
                          <span key={i} style={{ background: '#FEF3C7', color: '#92400E', fontSize: '10.5px', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}

                    {!!(item.also_reported_by || []).length && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11.5px', color: '#475569' }}>
                        <Layers size={13} color="#64748B" />
                        <span style={{ fontWeight: '700' }}>Also reported by:</span>
                        {item.also_reported_by.slice(0, 5).map((x, i) => (
                          <a key={i} href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: '600' }}>
                            {x.domain}
                          </a>
                        ))}
                      </div>
                    )}

                    {item.full_article_text && (
                      <div>
                        <button
                          onClick={() => setExpanded((p) => ({ ...p, [item.url]: !p[item.url] }))}
                          style={{ background: '#F1F5F9', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '11.5px', fontWeight: '700', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <FileText size={13} />
                          {isOpen ? 'Hide scraped body text' : 'View scraped body text'}
                          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px 14px', fontSize: '12px', color: '#1E293B', lineHeight: '1.6', maxHeight: '300px', overflowY: 'auto' }}>
                            {item.full_article_text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------- 3. Google Research Trail ---- */}
      {tab === 'trail' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', border: '1px solid #E2E8F0', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ maxWidth: '720px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link2 size={17} style={{ color: 'var(--usgi-red)' }} />
                  What you would find by searching these keywords yourself
                </h4>
                <p style={{ fontSize: '12.5px', color: '#475569', margin: 0, lineHeight: '1.6' }}>
                  Every link below is a real, live search URL built from this case's own anchors — registration plate,
                  named parties, accident spot and loss date. Open any of them to land directly on the Google, ePaper,
                  YouTube or registry results page for this claim. These work regardless of whether the automated engines
                  returned anything, which is what makes them the reliable fallback for district-level incidents.
                </p>
              </div>
              <button onClick={exportTrailCsv} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <Download size={14} /> Export trail (CSV)
              </button>
            </div>
          </div>

          {deepLinks.map((group, gi) => {
            const Icon = GROUP_ICONS[group.icon] || Search;
            return (
              <div key={gi} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Icon size={16} style={{ color: 'var(--usgi-red)' }} />
                  <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {group.group}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>({group.links.length})</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '10px' }}>
                  {group.links.map((link, li) => (
                    <div key={li} style={{ border: '1px solid #E2E8F0', borderRadius: '9px', padding: '11px 13px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <a
                          href={link.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          {link.label}
                          <ExternalLink size={12} color="var(--usgi-red)" />
                        </a>
                        <button
                          onClick={() => copy(link.url, link.url)}
                          title="Copy search URL"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedUrl === link.url ? '#059669' : '#94A3B8', display: 'flex', alignItems: 'center' }}
                        >
                          {copiedUrl === link.url ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                      {link.sub && (
                        <code style={{ fontSize: '11px', color: '#334155', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '5px 7px', wordBreak: 'break-word', fontFamily: 'monospace', lineHeight: '1.45' }}>
                          {link.sub}
                        </code>
                      )}
                      {link.why && (
                        <span style={{ fontSize: '11.5px', color: '#64748B', lineHeight: '1.5' }}>{link.why}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------- 4. Query matrix ------- */}
      {tab === 'queries' && (
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#1E293B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={16} color="var(--usgi-red)" />
            Queries dispatched to the live engines ({plan.length})
          </div>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 14px 0', lineHeight: '1.55' }}>
            Queries are generated in precision tiers. Tier&nbsp;1 anchors on a hard identifier (registration plate or a
            distinctive full name), Tier&nbsp;2 on the accident event itself, Tier&nbsp;3 on Hindi vernacular phrasing used
            by regional dailies, and Tier&nbsp;4 on video archives. Every tier is guaranteed a slot, and within a tier each
            query attacks a different angle, so the vernacular pass is never crowded out by a case rich in registration
            matches.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {plan.map((q, i) => (
              <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{
                  background: q.tier === 1 ? '#FEE2E2' : q.tier === 2 ? '#FEF3C7' : q.tier === 3 ? '#E0E7FF' : '#F1F5F9',
                  color: q.tier === 1 ? '#B91C1C' : q.tier === 2 ? '#B45309' : q.tier === 3 ? '#4338CA' : '#475569',
                  fontSize: '10.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '5px', whiteSpace: 'nowrap'
                }}>
                  TIER {q.tier}
                </span>
                <code style={{ fontSize: '12px', color: '#0F172A', fontFamily: 'monospace', flex: 1, minWidth: '200px', wordBreak: 'break-word' }}>
                  {q.query}
                </code>
                <span style={{ fontSize: '11.5px', color: '#64748B', fontStyle: 'italic' }}>{q.intent}</span>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(q.query)}&hl=en&gl=in`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11.5px', color: 'var(--usgi-red)', fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                >
                  Run in Google <ExternalLink size={11} />
                </a>
              </div>
            ))}
          </div>

          {!!(search.engines_used || []).length && (
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#475569' }}>
              <strong>Engines that responded:</strong> {search.engines_used.join(' · ')}
              {search.raw_result_count > 0 && (
                <span> — {search.raw_result_count} raw records fetched, {search.total_results} retained after ranking and de-duplication.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
