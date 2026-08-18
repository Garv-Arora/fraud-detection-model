import React from 'react';
import { 
  Sparkles, Shield, AlertTriangle, CheckCircle, MapPin, 
  Search, ExternalLink, Globe, Car, Zap, HeartPulse, Scale,
  FileText, Check, Copy, ArrowUpRight
} from 'lucide-react';

export default function GeminiAiSummaryCard({ summaryText, onCopy = null, copied = false }) {
  if (!summaryText) return null;
  const sections = summaryText.split(/###\s+/);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {sections.map((section, idx) => {
        if (!section.trim()) return null;
        const lines = section.trim().split('\n');
        const header = lines[0].replace(/[*#]/g, '').trim();
        const contentLines = lines.slice(1).join('\n').trim();

        // 1. EXECUTIVE AI OVERVIEW (GEMINI BANNER CARD)
        if (header.includes('Executive AI Overview') || header.includes('Executive Web Search Summary') || header.includes('Key Observations')) {
          const isZeroEvidence = contentLines.includes('0 public web pages') || contentLines.includes('0 verified') || contentLines.includes('0 case-specific') || contentLines.includes('0 online records');
          return (
            <div key={idx} className="card" style={{ 
              background: '#FFFFFF', 
              border: '1px solid #E2E8F0', 
              borderTop: '4px solid transparent',
              borderImage: 'linear-gradient(90deg, #4285F4 0%, #9B72CF 50%, #D96570 100%) 1',
              padding: '24px 28px', 
              boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    background: 'linear-gradient(135deg, #4285F4 0%, #9B72CF 50%, #D96570 100%)', 
                    color: '#FFFFFF', 
                    padding: '5px 10px', 
                    borderRadius: '7px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(155, 114, 207, 0.3)'
                  }}>
                    <Sparkles size={16} />
                    <span style={{ fontSize: '11.5px', fontWeight: '800', letterSpacing: '0.5px' }}>AI OVERVIEW</span>
                  </div>
                  <h4 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
                    Synthesized Public Evidence & Accident Briefing
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge" style={{ 
                    background: isZeroEvidence ? '#FEF3C7' : '#D1FAE5', 
                    color: isZeroEvidence ? '#B45309' : '#047857',
                    fontSize: '11.5px',
                    fontWeight: '700',
                    padding: '4px 10px'
                  }}>
                    {isZeroEvidence ? '0 Online Records / Field Check Recommended' : '✓ Real-Time Web Scraped Synthesis'}
                  </span>

                  {onCopy && (
                    <button
                      onClick={onCopy}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '5px 10px',
                        fontSize: '11.5px',
                        fontWeight: '600',
                        color: '#334155',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {copied ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#1E293B', lineHeight: '1.75', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {contentLines.split('\n\n').map((paragraph, pIdx) => {
                  if (!paragraph.trim()) return null;
                  if (paragraph.trim().startsWith('- ') || paragraph.trim().startsWith('• ')) {
                    return (
                      <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {paragraph.split('\n').map((bullet, bIdx) => {
                          const cleanBullet = bullet.replace(/^[•*\-\d.]+\s*/, '').trim();
                          if (!cleanBullet) return null;
                          return (
                            <div key={bIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              <span style={{ color: '#9B72CF', fontWeight: 'bold', fontSize: '16px', lineHeight: '1' }}>•</span>
                              <span style={{ fontSize: '13.5px' }} dangerouslySetInnerHTML={{ __html: cleanBullet.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <p key={pIdx} style={{ margin: 0, fontSize: '14px', lineHeight: '1.75' }} dangerouslySetInnerHTML={{ __html: paragraph.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                  );
                })}
              </div>
            </div>
          );
        }

        // 2. INCIDENT DYNAMICS & SEQUENCE
        if (header.includes('Dynamics') || header.includes('Sequence') || header.includes('Collision')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 26px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Zap size={18} style={{ color: '#F59E0B' }} /> Incident Dynamics & Collision Sequence
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#1E293B', lineHeight: '1.6' }}>
                      <span style={{ background: '#FEF3C7', color: '#B45309', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', flexShrink: 0 }}>⚡</span>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 3. VEHICLES & IMPACTED PARTIES
        if (header.includes('Vehicles') || header.includes('Parties') || header.includes('Objectivity')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 26px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Car size={18} style={{ color: '#2563EB' }} /> Vehicles & Impacted Parties Identified
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '13px', color: '#1E293B', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#2563EB; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 4. LOCATION & CORRIDOR
        if (header.includes('Location') || header.includes('Corridor') || header.includes('Jurisdiction') || header.includes('Feasibility')) {
          let mapsUrl = null;
          contentLines.split('\n').forEach(line => {
            const m = line.match(/\[.*?\]\((https:\/\/www\.google\.com\/maps[^\)]*)\)/);
            if (m) mapsUrl = m[1];
          });

          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 26px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <MapPin size={18} style={{ color: '#10B981' }} /> Location, Corridor & Jurisdiction
                </h4>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px', color: '#2563EB', borderColor: '#BFDBFE', background: '#EFF6FF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} /> Open in Google Maps <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ fontSize: '13px', color: '#1E293B', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', lineHeight: '1.5' }}>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\[Open Coordinates in Google Maps\]\(.*?\)/g, '').replace(/\[Open in Google Maps\]\(.*?\)/g, '').replace(/\[Verify on Google Maps\]\(.*?\)/g, '').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 5. CASUALTIES & EMERGENCY / LEGAL STATUS
        if (header.includes('Casualties') || header.includes('Emergency') || header.includes('Medical')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 26px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <HeartPulse size={18} style={{ color: '#E11D48' }} /> Casualties & Emergency / Legal Status
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#1E293B', lineHeight: '1.5' }}>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 6. DISCOVERED PUBLIC SOURCES & CITATIONS
        if (header.includes('Sources') || header.includes('Citations') || header.includes('Bulletins')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '22px 26px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Globe size={18} style={{ color: 'var(--usgi-red)' }} /> Discovered Public Sources & Citations
                </h4>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Verified live source URLs</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const match = line.match(/\[(.*?)\]\((.*?)\)\s*[-—:]?\s*(.*)/);
                  if (match) {
                    const [, title, url, desc] = match;
                    const cleanDesc = desc.replace(/^[*_]+|[*_]+$/g, '').trim();
                    return (
                      <div key={lIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', transition: 'all 0.15s ease' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '6px', lineHeight: '1.4' }}>
                            {title}
                          </div>
                          {cleanDesc && (
                            <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: '1.5', background: '#FFFFFF', padding: '6px 12px', borderRadius: '6px', borderLeft: '3px solid var(--usgi-red)' }}>
                              {cleanDesc}
                            </div>
                          )}
                        </div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ padding: '7px 16px', fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          View Source <ArrowUpRight size={13} />
                        </a>
                      </div>
                    );
                  }
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ fontSize: '13px', color: '#475569', padding: '12px 16px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }} dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                  );
                })}
              </div>
            </div>
          );
        }

        // 7. RCU INVESTIGATION RISK HIGHLIGHTS
        if (header.includes('Risk') || header.includes('Highlights') || header.includes('Takeaways')) {
          return (
            <div key={idx} className="card" style={{ 
              background: '#FFFBEB', 
              border: '1px solid #FCD34D', 
              borderLeft: '5px solid #F59E0B', 
              padding: '22px 26px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
              borderRadius: '12px'
            }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#B45309', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} /> RCU Investigation Risk Highlights & Protocols
              </h4>
              <div style={{ fontSize: '13.5px', color: '#78350F', lineHeight: '1.65', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean || clean.startsWith('Disclaimer')) return null;
                  return (
                    <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(255,255,255,0.6)', padding: '10px 14px', borderRadius: '8px' }}>
                      <span style={{ color: '#B45309', fontWeight: 'bold' }}>⚠️</span>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#78350F; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        return null;
      })}
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px', textAlign: 'center' }}>
        *Disclaimer: This Gemini AI Overview is synthesized dynamically from scraped public web indexes and regional media blotters using NLP information extraction.*
      </div>
    </div>
  );
}
