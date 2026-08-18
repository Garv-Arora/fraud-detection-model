import React from 'react';
import { 
  Sparkles, Shield, AlertTriangle, CheckCircle, MapPin, 
  Search, ExternalLink, Globe, Car, Zap, HeartPulse, Scale,
  FileText, Check, Copy, ArrowUpRight, Calendar, Clock, Hash
} from 'lucide-react';

export default function GeminiAiSummaryCard({ summaryText, onCopy = null, copied = false }) {
  if (!summaryText || typeof summaryText !== 'string' || !summaryText.trim()) {
    return (
      <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px', textAlign: 'center' }}>
        <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>No AI Summary text available.</p>
      </div>
    );
  }

  // Helper to get icon for specific highlight headers
  const getHighlightIcon = (label) => {
    if (!label) return <Sparkles size={15} style={{ color: '#9B72CF' }} />;
    const l = label.toLowerCase();
    if (l.includes('date') || l.includes('time') || l.includes('when')) return <Calendar size={15} style={{ color: '#2563EB' }} />;
    if (l.includes('location') || l.includes('corridor') || l.includes('spot') || l.includes('where') || l.includes('city')) return <MapPin size={15} style={{ color: '#059669' }} />;
    if (l.includes('dynamic') || l.includes('collision') || l.includes('speed') || l.includes('impact') || l.includes('force')) return <Zap size={15} style={{ color: '#D97706' }} />;
    if (l.includes('vehicle') || l.includes('party') || l.includes('car') || l.includes('truck') || l.includes('driver')) return <Car size={15} style={{ color: '#4F46E5' }} />;
    if (l.includes('casualty') || l.includes('medical') || l.includes('victim') || l.includes('hospital') || l.includes('injury') || l.includes('death')) return <HeartPulse size={15} style={{ color: '#DC2626' }} />;
    if (l.includes('police') || l.includes('legal') || l.includes('action') || l.includes('fir') || l.includes('station') || l.includes('ipc')) return <Scale size={15} style={{ color: '#7C3AED' }} />;
    return <Sparkles size={15} style={{ color: '#9B72CF' }} />;
  };

  // Split by markdown headers (### or ##)
  let rawSections = summaryText.split(/(?:^|\n)#{2,3}\s+/).filter(s => s.trim().length > 0);
  
  // If no markdown headers were found, treat the entire text as one section
  if (rawSections.length === 0) {
    rawSections = [summaryText];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {rawSections.map((section, idx) => {
        const lines = section.trim().split('\n');
        let header = lines[0].replace(/[*#]/g, '').trim();
        let contentLines = lines.slice(1).join('\n').trim();

        // If there's only 1 line or the first line was not a header
        if (rawSections.length === 1 && (!contentLines || lines.length <= 2)) {
          header = 'Executive AI Overview';
          contentLines = section.trim();
        } else if (!contentLines) {
          contentLines = header;
          header = `Incident Overview Section ${idx + 1}`;
        }

        const hLower = header.toLowerCase();

        // 1. EXECUTIVE AI OVERVIEW (GEMINI BANNER CARD) - First section or matching overview
        if (idx === 0 || hLower.includes('overview') || hLower.includes('summary') || hLower.includes('observation') || hLower.includes('brief') || hLower.includes('executive')) {
          const isZeroEvidence = contentLines.includes('0 public web pages') || contentLines.includes('0 verified') || contentLines.includes('0 case-specific') || contentLines.includes('0 online records');
          const paragraphs = contentLines.split('\n\n').filter(p => p.trim());

          return (
            <div key={idx} className="card" style={{ 
              background: '#FFFFFF', 
              border: '1px solid #E2E8F0', 
              borderTop: '5px solid transparent',
              borderImage: 'linear-gradient(90deg, #4285F4 0%, #9B72CF 50%, #D96570 100%) 1',
              padding: '26px 30px', 
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
              borderRadius: '14px'
            }}>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    background: 'linear-gradient(135deg, #4285F4 0%, #9B72CF 50%, #D96570 100%)', 
                    color: '#FFFFFF', 
                    padding: '5px 11px', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 3px 10px rgba(155, 114, 207, 0.35)'
                  }}>
                    <Sparkles size={16} />
                    <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.6px' }}>AI OVERVIEW</span>
                  </div>
                  <h4 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.2px' }}>
                    {header.includes('AI') ? header : 'Synthesized Public Evidence & Accident Briefing'}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge" style={{ 
                    background: isZeroEvidence ? '#FEF3C7' : '#DCFCE7', 
                    color: isZeroEvidence ? '#B45309' : '#15803D',
                    fontSize: '11.5px',
                    fontWeight: '700',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${isZeroEvidence ? '#FDE68A' : '#BBF7D0'}`
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
                        padding: '5px 12px',
                        fontSize: '11.5px',
                        fontWeight: '600',
                        color: '#334155',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {copied ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy Summary'}
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {paragraphs.map((para, pIdx) => {
                  const pTrim = para.trim();
                  if (!pTrim) return null;

                  // Check if this block contains key takeaway bullet points
                  const isBulletBlock = pTrim.includes('- 📅') || pTrim.includes('- 📍') || pTrim.includes('- 💥') || pTrim.includes('- 🚗') || pTrim.includes('- 🏥') || pTrim.includes('- ⚖️') || (pTrim.startsWith('- ') && pTrim.includes(':'));
                  
                  if (isBulletBlock) {
                    const bLines = pTrim.split('\n');
                    const headerLine = bLines[0].startsWith('- ') ? null : bLines[0];
                    const bulletLines = bLines[0].startsWith('- ') ? bLines : bLines.slice(1);

                    return (
                      <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px', marginBottom: '6px' }}>
                        {headerLine && (
                          <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                            {headerLine.replace(/[*_#]/g, '')}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                          {bulletLines.map((b, bIdx) => {
                            const clean = b.replace(/^[•*\-\d.]+\s*/, '').trim();
                            if (!clean) return null;
                            
                            const colonIdx = clean.indexOf(':');
                            const label = colonIdx > -1 ? clean.substring(0, colonIdx).replace(/[*_]/g, '').trim() : '';
                            const value = colonIdx > -1 ? clean.substring(colonIdx + 1).trim() : clean;

                            return (
                              <div key={bIdx} style={{ 
                                background: '#F8FAFC', 
                                border: '1px solid #E2E8F0', 
                                borderRadius: '10px', 
                                padding: '12px 16px', 
                                display: 'flex', 
                                gap: '12px', 
                                alignItems: 'flex-start'
                              }}>
                                <div style={{ 
                                  background: '#FFFFFF', 
                                  border: '1px solid #CBD5E1', 
                                  borderRadius: '8px', 
                                  width: '30px', 
                                  height: '30px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginTop: '2px'
                                }}>
                                  {getHighlightIcon(label || clean)}
                                </div>
                                <div style={{ flex: 1, fontSize: '13px', lineHeight: '1.5' }}>
                                  {label && (
                                    <div style={{ fontWeight: '700', color: '#1E293B', marginBottom: '2px' }}>
                                      {label}
                                    </div>
                                  )}
                                  <div 
                                    style={{ color: '#475569' }}
                                    dangerouslySetInnerHTML={{ __html: value.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} 
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Standard Paragraph
                  return (
                    <p 
                      key={pIdx} 
                      style={{ 
                        margin: 0, 
                        fontSize: '14px', 
                        color: '#1E293B', 
                        lineHeight: '1.75',
                        letterSpacing: '-0.1px'
                      }} 
                      dangerouslySetInnerHTML={{ 
                        __html: pTrim.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700; background:rgba(226, 232, 240, 0.45); padding:1px 4px; border-radius:4px;">$1</strong>') 
                      }} 
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        // 2. INCIDENT DYNAMICS & SEQUENCE
        if (hLower.includes('dynamic') || hLower.includes('sequence') || hLower.includes('collision') || hLower.includes('impact') || hLower.includes('crash')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Zap size={18} style={{ color: '#D97706' }} /> {header || 'Incident Dynamics & Collision Sequence'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 18px', fontSize: '13px', color: '#1E293B', lineHeight: '1.6' }}>
                      <span style={{ background: '#FEF3C7', color: '#B45309', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', flexShrink: 0, marginTop: '2px' }}>⚡</span>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 3. VEHICLES & IMPACTED PARTIES
        if (hLower.includes('vehicle') || hLower.includes('part') || hLower.includes('car') || hLower.includes('truck') || hLower.includes('driver')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Car size={18} style={{ color: '#4F46E5' }} /> {header || 'Vehicles & Impacted Parties Identified'}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '13px', color: '#1E293B', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#4F46E5; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 4. LOCATION & CORRIDOR
        if (hLower.includes('location') || hLower.includes('corridor') || hLower.includes('jurisdiction') || hLower.includes('spot') || hLower.includes('map')) {
          let mapsUrl = null;
          contentLines.split('\n').forEach(line => {
            const m = line.match(/\[.*?\]\((https:\/\/www\.google\.com\/maps[^\)]*)\)/);
            if (m) mapsUrl = m[1];
          });

          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <MapPin size={18} style={{ color: '#059669' }} /> {header || 'Location, Corridor & Jurisdiction'}
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
                    <div key={lIdx} style={{ fontSize: '13px', color: '#1E293B', padding: '12px 18px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', lineHeight: '1.5' }}>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\[Open Coordinates in Google Maps\]\(.*?\)/g, '').replace(/\[Open in Google Maps\]\(.*?\)/g, '').replace(/\[Verify on Google Maps\]\(.*?\)/g, '').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 5. CASUALTIES & EMERGENCY / LEGAL STATUS
        if (hLower.includes('casualt') || hLower.includes('emergency') || hLower.includes('medical') || hLower.includes('hospital') || hLower.includes('victim') || hLower.includes('injury') || hLower.includes('legal')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <HeartPulse size={18} style={{ color: '#DC2626' }} /> {header || 'Casualties & Emergency / Legal Status'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentLines.split('\n').map((line, lIdx) => {
                  const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                  if (!clean) return null;
                  return (
                    <div key={lIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 18px', fontSize: '13px', color: '#1E293B', lineHeight: '1.5' }}>
                      <span dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 6. DISCOVERED PUBLIC SOURCES & CITATIONS
        if (hLower.includes('source') || hLower.includes('citation') || hLower.includes('bulletin') || hLower.includes('reference') || hLower.includes('link')) {
          return (
            <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Globe size={18} style={{ color: 'var(--usgi-red)' }} /> {header || 'Discovered Public Sources & Citations'}
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
                    <div key={lIdx} style={{ fontSize: '13px', color: '#475569', padding: '12px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }} dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                  );
                })}
              </div>
            </div>
          );
        }

        // 7. RCU INVESTIGATION RISK HIGHLIGHTS
        if (hLower.includes('risk') || hLower.includes('highlight') || hLower.includes('takeaway') || hLower.includes('flag') || hLower.includes('warning')) {
          return (
            <div key={idx} className="card" style={{ 
              background: '#FFFBEB', 
              border: '1px solid #FCD34D', 
              borderLeft: '5px solid #F59E0B', 
              padding: '24px 28px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
              borderRadius: '12px'
            }}>
              <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#B45309', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} /> {header || 'Investigation Risk Highlights & Protocols'}
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

        // 8. GENERIC FALLBACK SECTION (Ensures NO section is ever lost or hidden)
        return (
          <div key={idx} className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 4px 18px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '15.5px', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <FileText size={18} style={{ color: 'var(--usgi-red)' }} /> {header}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contentLines.split('\n').map((line, lIdx) => {
                const clean = line.replace(/^[•*\-\d.]+\s*/, '').trim();
                if (!clean) return null;
                return (
                  <div key={lIdx} style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.65' }} dangerouslySetInnerHTML={{ __html: clean.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#0F172A; font-weight:700;">$1</strong>') }} />
                );
              })}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '6px', textAlign: 'center' }}>
        *Disclaimer: This AI Overview is synthesized dynamically from scraped public web indexes and media blotters using NLP information extraction.*
      </div>
    </div>
  );
}
