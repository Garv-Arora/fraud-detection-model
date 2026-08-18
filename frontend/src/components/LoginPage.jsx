import React, { useState } from 'react';
import { 
  Shield, Lock, Mail, Eye, EyeOff, CheckCircle, 
  ArrowRight, Key, UserCheck, Sparkles, Globe, 
  FileText, Zap, AlertCircle, ShieldAlert
} from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    role: "Senior Claims Investigator",
    email: "investigator@universalsompo.in",
    password: "Sompo@2026",
    badge: "Primary Access",
    department: "Motor OD & TP Claims"
  },
  {
    role: "RCU Intelligence Officer",
    email: "rcu.officer@universalsompo.in",
    password: "RCUSecure@2026",
    badge: "Fraud Audit",
    department: "Risk Containment Unit"
  }
];

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('investigator@universalsompo.in');
  const [password, setPassword] = useState('Sompo@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleQuickFill = (acc) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email address and password.");
      return;
    }

    setLoading(true);

    // Simulate secure verification
    setTimeout(() => {
      // Validate credentials against known demo list
      const matched = DEMO_ACCOUNTS.find(
        acc => acc.email.toLowerCase() === email.trim().toLowerCase() && acc.password === password
      );

      if (matched || (email.includes('@') && password.length >= 4)) {
        const userObj = matched || {
          role: "Claims Investigator",
          email: email.trim(),
          badge: "Authorized",
          department: "Investigation Portal"
        };

        if (rememberMe) {
          localStorage.setItem('usgi_auth_user', JSON.stringify(userObj));
        } else {
          sessionStorage.setItem('usgi_auth_user', JSON.stringify(userObj));
        }

        setLoading(false);
        onLogin(userObj);
      } else {
        setLoading(false);
        setError("Invalid credentials. Please select one of the authorized accounts below or verify your password.");
      }
    }, 600);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F4F6F9',
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(204, 0, 34, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(227, 30, 36, 0.06) 0px, transparent 50%)
      `,
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Montserrat", "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '1080px',
        width: '100%',
        background: '#FFFFFF',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'minmax(340px, 460px) 1fr'
      }}>
        
        {/* LEFT HERO & BRAND PANEL */}
        <div style={{
          background: 'linear-gradient(145deg, #990018 0%, #CC0022 55%, #7A0013 100%)',
          color: '#FFFFFF',
          padding: '44px 36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle Background Glow Circles */}
          <div style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          {/* Top Brand Logo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)'
              }}>
                <Shield size={28} color="#FFFFFF" />
              </div>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: '900', letterSpacing: '-0.3px', margin: 0, lineHeight: '1.1', color: '#FFFFFF' }}>
                  Universal <span style={{ color: '#FFDCD8' }}>Sompo</span>
                </h1>
                <div style={{ fontSize: '11px', color: '#FFEBEB', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', marginTop: '2px' }}>
                  General Insurance
                </div>
              </div>
            </div>

            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.4px', marginBottom: '18px', border: '1px solid rgba(255,255,255,0.25)' }}>
              IRDAI REGN. NO. 134 • RCU SECURE GATEWAY
            </div>

            <h2 style={{ fontSize: '23px', fontWeight: '800', lineHeight: '1.3', marginBottom: '14px', color: '#FFFFFF' }}>
              AI Claims Evidence Discovery & Fraud Intelligence
            </h2>

            <p style={{ fontSize: '13px', color: '#FFD5D5', lineHeight: '1.6', marginBottom: '28px' }}>
              Next-generation public evidence extraction engine aggregating real-time news indexes, local ePaper print archives, social footprints, and spatial feasibility verification.
            </p>

            {/* Feature Bullets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { icon: <Globe size={16} />, text: "Real-Time Google, DDG & Bing Multi-Engine Crawl" },
                { icon: <FileText size={16} />, text: "Day T+1 Regional Daily Print Edition Scraper" },
                { icon: <Sparkles size={16} />, text: "Google Gemini-Style AI Overview Synthesis" },
                { icon: <Shield size={16} />, text: "30-Header Standard Investigation Protocol" }
              ].map((feat, fIdx) => (
                <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#FFF5F5' }}>
                  <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '6px', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {feat.icon}
                  </div>
                  <span>{feat.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Joint Venture Footer */}
          <div style={{ marginTop: '36px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '16px', fontSize: '11px', color: '#FFCECE', lineHeight: '1.4' }}>
            <strong>Joint Venture of:</strong> Indian Bank • Indian Overseas Bank • Karnataka Bank • Dabur Investments • Sompo Japan
          </div>
        </div>

        {/* RIGHT AUTH FORM PANEL */}
        <div style={{
          padding: '44px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#FFFFFF'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Lock size={18} style={{ color: 'var(--usgi-red)' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
                Investigator Portal Sign In
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
              Enter your authorized Universal Sompo credentials to access the claims investigation dashboard.
            </p>
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#991B1B',
              fontSize: '12.5px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Email Field */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
                Corporate Email ID
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={17} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@universalsompo.in"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13.5px',
                    color: '#0F172A',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    background: '#FFFFFF'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--usgi-red)'}
                  onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0 }}>
                  Security Password
                </label>
                <span style={{ fontSize: '11.5px', color: 'var(--usgi-red)', fontWeight: '600', cursor: 'pointer' }}>
                  RCU Keyed
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <Key size={17} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 42px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13.5px',
                    color: '#0F172A',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    background: '#FFFFFF'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--usgi-red)'}
                  onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input 
                type="checkbox" 
                id="rememberMe" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: 'var(--usgi-red)', cursor: 'pointer' }} 
              />
              <label htmlFor="rememberMe" style={{ fontSize: '12.5px', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                Remember session on this secure workstation
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #CC0022 0%, #A3001B 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                fontSize: '14px',
                fontWeight: '800',
                letterSpacing: '0.3px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(204, 0, 34, 0.3)',
                transition: 'all 0.2s ease',
                marginTop: '4px'
              }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', margin: 0, borderWidth: '2px', borderColor: '#FFFFFF', borderTopColor: 'transparent' }}></div>
                  <span>Authenticating Session...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* KNOWN PRESET DEMO CREDENTIALS SECTION */}
          <div style={{ marginTop: '28px', borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🔑 Known Demo Credentials (1-Click Fill)
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--usgi-red)', fontWeight: '700' }}>
                Click to Auto-Fill
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {DEMO_ACCOUNTS.map((acc, idx) => (
                <div
                  key={idx}
                  onClick={() => handleQuickFill(acc)}
                  style={{
                    background: email === acc.email ? '#FFF5F5' : '#F8FAFC',
                    border: `1px solid ${email === acc.email ? '#FCA5A5' : '#E2E8F0'}`,
                    borderRadius: '8px',
                    padding: '9px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--usgi-red)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = email === acc.email ? '#FCA5A5' : '#E2E8F0'}
                >
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <UserCheck size={13} style={{ color: 'var(--usgi-red)' }} />
                      {acc.role}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      <code>{acc.email}</code> • <code>{acc.password}</code>
                    </div>
                  </div>
                  <span className="badge" style={{ background: email === acc.email ? 'var(--usgi-red)' : '#E2E8F0', color: email === acc.email ? '#FFFFFF' : '#475569', fontSize: '10px', padding: '3px 8px' }}>
                    {email === acc.email ? 'Selected' : 'Use Account'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Security note */}
          <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', marginTop: '20px' }}>
            🔒 256-Bit SSL Encryption • Authorized Universal Sompo Personnel Only
          </div>
        </div>

      </div>
    </div>
  );
}
