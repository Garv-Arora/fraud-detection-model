import React, { useState } from 'react';
import { 
  Search, Globe, ExternalLink, Shield, Zap, Sparkles, Filter, 
  Copy, Check, FileText, ChevronDown, ChevronUp, Terminal, 
  Share2, RefreshCw, Layers, MapPin, Calendar, Car, User, 
  AlertCircle, Download, CheckCircle2, ArrowUpRight, CheckCircle,
  AlertTriangle, Eye, ClipboardList
} from 'lucide-react';

import GeminiAiSummaryCard from './GeminiAiSummaryCard';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const PRESET_TEST_CASES = [
  {
    name: "Jaipur Harmada Dumper (17 Vehicles Crash)",
    query: "Jaipur Harmada dumper 17 vehicles accident",
    insured_name: "Manoj Kumar Chhajer",
    vehicle_no: "RJ-14-GH-9988",
    location: "Jaipur",
    date_str: "24-06-2026",
    incident_keywords: "dumper 17 vehicles collision mass casualty",
    desc: "Major multi-vehicle collision on Jaipur highway with Times of India & Hindustan Times coverage."
  },
  {
    name: "Gangrar Chittorgarh Highway (RJ-09-GC-8889)",
    query: "RJ-09-GC-8889 Gangrar Chittorgarh trailer accident",
    insured_name: "Rameshwar Lal Gurjar",
    vehicle_no: "RJ-09-GC-8889",
    location: "Gangrar, Chittorgarh",
    date_str: "18-05-2026",
    incident_keywords: "Gangrar highway rollover police blotter",
    desc: "Commercial trailer rollover on NH-79 Chittorgarh highway corridor."
  },
  {
    name: "Barat Bus vs Tanker (CL21246240 Discrepancy)",
    query: "Barat bus tanker collision wedding party casualty",
    insured_name: "Kailash Chand Sharma",
    vehicle_no: "RJ-14-PA-4421",
    location: "Jaipur-Ajmer Expressway",
    date_str: "12-04-2026",
    incident_keywords: "wedding bus accident casualty mismatch",
    desc: "Discrepancy audit: FIR mentions Barat bus with 8 casualties, claim filed as solo private car."
  },
  {
    name: "Lalit Dholpur Driver Implant (CL26140317)",
    query: "Lalit Baretha Dholpur accident FIR",
    insured_name: "Shri Lalit",
    vehicle_no: "RJ-11-GA-3321",
    location: "Baretha, Dholpur",
    date_str: "05-06-2026",
    incident_keywords: "driver substitute police charge sheet",
    desc: "Driver implant fraud detection: Real driver fled scene, substitute driver put forward in claim."
  },
  {
    name: "Pre-Inception Instagram Damage (CL24181742)",
    query: "Vansh Instagram reel accident date",
    insured_name: "Vansh Malhotra",
    vehicle_no: "DL-01-AB-1234",
    location: "Delhi-Noida Direct Flyway",
    date_str: "12-07-2026",
    incident_keywords: "Instagram reel pre inception accident date",
    desc: "Date fraud identified via Instagram reel uploaded prior to policy inception."
  }
];

const renderStructuredWorkbenchSummary = (summaryText, onCopy = null, copied = false) => {
  if (!summaryText) return null;
  return <GeminiAiSummaryCard summaryText={summaryText} onCopy={onCopy} copied={copied} />;
};

export default function SearchWorkbench() {
  const [searchMode, setSearchMode] = useState('freeform'); // 'freeform' or 'structured'
  const [freeformQuery, setFreeformQuery] = useState('Jaipur Harmada dumper 17 vehicles accident');
  
  // Structured parameters
  const [insuredName, setInsuredName] = useState('Manoj Kumar Chhajer');
  const [vehicleNo, setVehicleNo] = useState('');
  const [location, setLocation] = useState('Jaipur');
  const [dateStr, setDateStr] = useState('24-06-2026');
  const [incidentKeywords, setIncidentKeywords] = useState('dumper 17 vehicles collision');
  
  // Settings
  const [strictFilter, setStrictFilter] = useState(false);
  const [deepScrape, setDeepScrape] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL'); // 'ALL', 'News', 'Web', 'Instagram', 'YouTube'
  
  // Results view sub-tab
  const [workbenchTab, setWorkbenchTab] = useState('ai_summary'); // 'ai_summary', 'records', 'telemetry'
  
  // State
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [expandedArticles, setExpandedArticles] = useState({});
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (customParams = null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = customParams || (searchMode === 'freeform' ? {
        query: freeformQuery,
        strict_accident_filter: strictFilter,
        deep_scrape: deepScrape
      } : {
        query: freeformQuery,
        insured_name: insuredName,
        vehicle_no: vehicleNo,
        location: location,
        date_str: dateStr,
        incident_keywords: incidentKeywords,
        strict_accident_filter: strictFilter,
        deep_scrape: deepScrape
      });

      const res = await fetch(`${API_BASE}/search/workbench`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
      if (data.ai_summary) {
        setWorkbenchTab('ai_summary');
      } else {
        setWorkbenchTab('records');
      }
    } catch (err) {
      console.error("Search workbench error:", err);
      setError(err.message || "Failed to execute search across public sources.");
    } finally {
      setLoading(false);
    }
  };

  const loadPreset = (preset) => {
    setFreeformQuery(preset.query);
    setInsuredName(preset.insured_name);
    setVehicleNo(preset.vehicle_no);
    setLocation(preset.location);
    setDateStr(preset.date_str);
    setIncidentKeywords(preset.incident_keywords);
    
    handleSearch({
      query: preset.query,
      insured_name: preset.insured_name,
      vehicle_no: preset.vehicle_no,
      location: preset.location,
      date_str: preset.date_str,
      incident_keywords: preset.incident_keywords,
      strict_accident_filter: strictFilter,
      deep_scrape: deepScrape
    });
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const toggleArticleExpand = (idx) => {
    setExpandedArticles(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const exportResultsJSON = () => {
    if (!response || !response.results) return;
    const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `universal_sompo_search_results_${Date.now()}.json`;
    a.click();
  };

  // Filtered results by active category
  const filteredResults = response?.results?.filter(r => {
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'News') return r.source === 'News' || r.source === 'Google News';
    if (activeCategory === 'Instagram') return r.source === 'Instagram' || (r.url && r.url.includes('instagram.com'));
    if (activeCategory === 'Facebook') return r.source === 'Facebook' || (r.url && (r.url.includes('facebook.com') || r.url.includes('fb.watch')));
    if (activeCategory === 'YouTube') return r.source === 'YouTube' || (r.url && (r.url.includes('youtube.com') || r.url.includes('youtu.be')));
    return r.source === activeCategory;
  }) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="card" style={{ 
        background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', 
        color: '#FFFFFF', 
        padding: '24px 30px', 
        border: 'none',
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ background: 'var(--usgi-red)', padding: '6px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={18} color="#FFFFFF" />
                <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.5px' }}>SEARCH LAB</span>
              </div>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>
                Multi-Engine Real-Time Public Evidence & AI Synthesis Playground
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 6px 0', color: '#FFFFFF' }}>
              Universal Sompo RCU Public Evidence Search Workbench
            </h2>
            <p style={{ fontSize: '13px', color: '#CBD5E1', margin: 0, maxWidth: '750px', lineHeight: '1.5' }}>
              Test and benchmark our real-time accident search engine. Search Google News RSS, DuckDuckGo, Bing, Instagram Reels, YouTube blotters, and regional Hindi daily archives for any specific claim with instant structured AI evidence synthesis.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: '700' }}>Engines Active</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#38BDF8', marginTop: '2px' }}>Google • DDG • Social • ePaper</div>
            </div>
            {response && (
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: '700' }}>Speed</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#34D399', marginTop: '2px' }}>{response.execution_time_seconds}s</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preset Benchmarks Selector */}
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Sparkles size={16} color="var(--usgi-red)" />
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Quick Benchmark Test Presets (One-Click Execution)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {PRESET_TEST_CASES.map((preset, pIdx) => (
            <button
              key={pIdx}
              onClick={() => loadPreset(preset)}
              style={{
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12.5px',
                fontWeight: '600',
                color: '#1E293B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--usgi-red)'; e.currentTarget.style.background = '#FFF5F5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#F8FAFC'; }}
            >
              <Zap size={14} color="var(--usgi-red)" />
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input Matrix Card */}
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setSearchMode('freeform')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: searchMode === 'freeform' ? '#FFFFFF' : 'transparent',
                color: searchMode === 'freeform' ? 'var(--usgi-red)' : '#64748B',
                boxShadow: searchMode === 'freeform' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              🔍 Freeform Keywords Search
            </button>
            <button
              onClick={() => setSearchMode('structured')}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: searchMode === 'structured' ? '#FFFFFF' : 'transparent',
                color: searchMode === 'structured' ? 'var(--usgi-red)' : '#64748B',
                boxShadow: searchMode === 'structured' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              📑 Multi-Parameter Claim Matrix
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={deepScrape} 
                onChange={(e) => setDeepScrape(e.target.checked)} 
              />
              Deep Article Scraping (Full Body Text)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={strictFilter} 
                onChange={(e) => setStrictFilter(e.target.checked)} 
              />
              Enforce Strict Accident Match (Plate/Full Name)
            </label>
          </div>
        </div>

        {searchMode === 'freeform' ? (
          <div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={freeformQuery}
                  onChange={(e) => setFreeformQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter accident keywords, vehicle plate, victim name, or incident location (e.g. 'Jaipur Harmada dumper 17 vehicles accident')..."
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    outline: 'none',
                    fontWeight: '500'
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleSearch()}
                disabled={loading || !freeformQuery.trim()}
                style={{ minWidth: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                {loading ? 'Searching & Synthesizing...' : 'Search & Synthesize'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <User size={13} /> Insured / Driver / Victim Name
                </label>
                <input
                  type="text"
                  value={insuredName}
                  onChange={(e) => setInsuredName(e.target.value)}
                  placeholder="e.g. Manoj Kumar Chhajer"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <Car size={13} /> Vehicle Registration No (RTO)
                </label>
                <input
                  type="text"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="e.g. RJ-09-GC-8889 or UP-85-AT-9988"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <MapPin size={13} /> Accident Spot / City / District
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Jaipur, Harmada or Chittorgarh"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <Calendar size={13} /> Date of Accident (DD-MM-YYYY)
                </label>
                <input
                  type="text"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  placeholder="e.g. 24-06-2026 or 14-06-2026"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <FileText size={13} /> Incident Narrative Keywords / Vehicle Make / Collision Details
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={incidentKeywords}
                  onChange={(e) => setIncidentKeywords(e.target.value)}
                  placeholder="e.g. dumper 17 vehicles collision Innova brake failure"
                  style={{ flex: 1, padding: '9px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleSearch()}
                  disabled={loading}
                  style={{ minWidth: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {loading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                  {loading ? 'Searching & Synthesizing...' : 'Run Matrix Search'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '14px 18px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: '13px', fontWeight: '600' }}>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {response && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Results Navigation Strip */}
          <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1E293B', margin: 0 }}>
                    Search Execution Findings ({response.total_results} Discovered Public Web Records)
                  </h3>
                  <span className="badge" style={{ background: '#D1FAE5', color: '#047857', fontSize: '11px', fontWeight: '700' }}>
                    ⚡ {response.execution_time_seconds}s
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  Keywords Analyzed: {response.keywords_extracted?.map((kw, kIdx) => (
                    <span key={kIdx} style={{ background: '#F1F5F9', color: '#334155', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', fontWeight: '600' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={exportResultsJSON}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} /> Export JSON
                </button>
              </div>
            </div>

            {/* Sub-Tabs: AI Summary vs Raw Records vs Query Matrix */}
            <div className="tab-container" style={{ marginTop: '16px', marginBottom: '0', borderBottom: '1px solid #E2E8F0', paddingBottom: '0' }}>
              <button 
                className={`tab-btn ${workbenchTab === 'ai_summary' ? 'active' : ''}`} 
                onClick={() => setWorkbenchTab('ai_summary')}
              >
                <Sparkles size={16} style={{ color: 'var(--usgi-red)' }} /> Condensed AI Evidence Summary
              </button>
              <button 
                className={`tab-btn ${workbenchTab === 'records' ? 'active' : ''}`} 
                onClick={() => setWorkbenchTab('records')}
              >
                <Globe size={16} /> Discovered Web Records ({response.results?.length || 0})
              </button>
              <button 
                className={`tab-btn ${workbenchTab === 'telemetry' ? 'active' : ''}`} 
                onClick={() => setWorkbenchTab('telemetry')}
              >
                <Terminal size={16} /> Query Fanout Matrix ({response.query_executed?.length || 0})
              </button>
            </div>
          </div>

          {/* VIEW TAB 1: CONDENSED STRUCTURED AI SUMMARY */}
          {workbenchTab === 'ai_summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Sparkles size={18} style={{ color: 'var(--usgi-red)' }} />
                    Live AI Evidence Synthesis & Investigation Breakdown
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                    Synthesized from {response.results?.length || 0} real-time multi-engine search results across Google News, DuckDuckGo, Bing, social media, and ePapers.
                  </p>
                </div>
                {response.ai_summary && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(response.ai_summary);
                      setCopiedSummary(true);
                      setTimeout(() => setCopiedSummary(false), 2000);
                    }}
                    style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedSummary ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
                    {copiedSummary ? 'Summary Copied!' : 'Copy Summary'}
                  </button>
                )}
              </div>

              {response.ai_summary ? (
                renderStructuredWorkbenchSummary(response.ai_summary)
              ) : (
                <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '30px', textAlign: 'center' }}>
                  <Shield size={32} color="var(--usgi-red)" style={{ margin: '0 auto 10px auto' }} />
                  <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#1E293B', marginBottom: '6px' }}>
                    0 Case-Specific Public Web Records Found
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '500px', margin: '0 auto' }}>
                    No public news articles or media footprints were discovered specifically matching this accident. Standard RCU protocol recommends physical spot verification and police station blotter check.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* VIEW TAB 2: DISCOVERED WEB RECORDS LIST */}
          {workbenchTab === 'records' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Category Filter Chips */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['ALL', 'News', 'Web', 'Instagram', 'Facebook', 'YouTube'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '700',
                      border: 'none',
                      cursor: 'pointer',
                      background: activeCategory === cat ? 'var(--usgi-red)' : '#E2E8F0',
                      color: activeCategory === cat ? '#FFFFFF' : '#475569',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {cat === 'ALL' ? `All Sources (${response.results?.length || 0})` : cat}
                  </button>
                ))}
              </div>

              {filteredResults.length === 0 ? (
                <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
                  <Globe size={36} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                  <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#1E293B', marginBottom: '6px' }}>
                    0 Web Records Found for Selected Filter
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '500px', margin: '0 auto' }}>
                    Try switching categories or expanding your search query terms to find related media bulletins.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {filteredResults.map((item, idx) => {
                    const isExpanded = expandedArticles[idx];
                    const isCopied = copiedUrl === item.url;

                    return (
                      <div key={idx} className="card" style={{ 
                        background: '#FFFFFF', 
                        border: '1px solid #E2E8F0', 
                        borderRadius: '10px', 
                        padding: '18px 22px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        {/* Card Header: Source & Domain & Relevance */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="badge" style={{ 
                              background: item.source === 'Instagram' ? '#FDF2F8' : item.source === 'Facebook' ? '#EFF6FF' : item.source === 'YouTube' ? '#FEF2F2' : '#F8FAFC', 
                              color: item.source === 'Instagram' ? '#DB2777' : item.source === 'Facebook' ? '#1D4ED8' : item.source === 'YouTube' ? '#DC2626' : '#2563EB',
                              border: item.source === 'Instagram' ? '1px solid #FBCFE8' : item.source === 'Facebook' ? '1px solid #BFDBFE' : item.source === 'YouTube' ? '1px solid #FECACA' : '1px solid #E2E8F0',
                              fontSize: '11px',
                              fontWeight: '800'
                            }}>
                              {item.source}
                            </span>

                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Globe size={13} color="#64748B" /> {item.domain}
                            </span>

                            {item.publish_date && (
                              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                                • {item.publish_date}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Relevance:</span>
                              <span style={{ fontSize: '11px', fontWeight: '800', color: item.relevance_score > 50 ? '#059669' : '#D97706' }}>
                                {item.relevance_score}%
                              </span>
                            </div>

                            <button
                              onClick={() => copyToClipboard(item.url)}
                              title="Copy Direct Link"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isCopied ? '#059669' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                            >
                              {isCopied ? <Check size={14} /> : <Copy size={14} />}
                              {isCopied ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>

                        {/* Card Title */}
                        <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0, lineHeight: '1.4' }}>
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ color: '#0F172A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--usgi-red)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#0F172A'}
                          >
                            {item.title}
                            <ArrowUpRight size={15} color="var(--usgi-red)" />
                          </a>
                        </h4>

                        {/* URL link */}
                        <div style={{ fontSize: '11.5px', color: 'var(--usgi-red)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {item.url}
                        </div>

                        {/* Snippet */}
                        <p style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5', margin: 0 }}>
                          {item.snippet}
                        </p>

                        {/* Matched keywords pills */}
                        {item.matched_keywords && item.matched_keywords.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>Matched:</span>
                            {item.matched_keywords.map((kw, mIdx) => (
                              <span key={mIdx} style={{ background: '#FEF3C7', color: '#92400E', fontSize: '10.5px', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Deep Scraped Body Expander */}
                        {item.full_article_text && (
                          <div style={{ marginTop: '8px' }}>
                            <button
                              onClick={() => toggleArticleExpand(idx)}
                              style={{
                                background: '#F1F5F9',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '11.5px',
                                fontWeight: '700',
                                color: '#334155',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <FileText size={13} />
                              {isExpanded ? 'Hide Deep Scraped Body Text' : 'View Deep Scraped Full Body Text'}
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>

                            {isExpanded && (
                              <div style={{ 
                                marginTop: '8px', 
                                background: '#F8FAFC', 
                                border: '1px solid #E2E8F0', 
                                borderRadius: '6px', 
                                padding: '12px 14px', 
                                fontSize: '12px', 
                                color: '#1E293B', 
                                lineHeight: '1.6', 
                                maxHeight: '300px', 
                                overflowY: 'auto' 
                              }}>
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

          {/* VIEW TAB 3: QUERY FANOUT TELEMETRY MATRIX */}
          {workbenchTab === 'telemetry' && (
            <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '20px 24px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#1E293B', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={16} color="var(--usgi-red)" />
                Fanned-Out Multi-Engine Queries Executed ({response.query_executed?.length} Parallel Queries):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                {response.query_executed?.map((q, qIdx) => (
                  <div key={qIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--usgi-red)', fontWeight: 'bold', fontSize: '12px' }}>#{qIdx + 1}</span>
                    <span style={{ fontSize: '12px', color: '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
