import React, { useState } from 'react';
import { 
  Shield, Lock, Mail, Eye, EyeOff, CheckCircle2, 
  ArrowRight, Key, UserCheck, AlertCircle
} from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    role: "Senior Claims Investigator",
    email: "investigator@universalsompo.in",
    password: "Sompo@2026",
    badge: "Primary",
    department: "Motor OD & TP Claims"
  },
  {
    role: "RCU Intelligence Officer",
    email: "rcu.officer@universalsompo.in",
    password: "RCUSecure@2026",
    badge: "Audit",
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

    setTimeout(() => {
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
    }, 400);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F8FAFC',
      padding: '32px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Subtle Utility Note */}
      <div style={{
        marginBottom: '20px',
        fontSize: '11.5px',
        color: '#64748B',
        letterSpacing: '0.3px',
        textAlign: 'center',
        fontWeight: '500'
      }}>
        IRDAI Regn. No. 134 • CIN: U66010MH2007PLC166770
      </div>

      {/* Centered Clean Card */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.05)',
        padding: '36px 32px'
      }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#FFF1F2',
            border: '1px solid #FFE4E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px auto'
          }}>
            <Shield size={24} style={{ color: '#CC0022' }} />
          </div>

          <h2 style={{
            fontSize: '20px',
            fontWeight: '800',
            color: '#0F172A',
            margin: '0 0 4px 0',
            letterSpacing: '-0.3px'
          }}>
            Universal <span style={{ color: '#CC0022' }}>Sompo</span>
          </h2>

          <p style={{
            fontSize: '12.5px',
            color: '#64748B',
            margin: 0,
            fontWeight: '500'
          }}>
            AI Claim Evidence Discovery & Fraud Intelligence
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#991B1B',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '18px'
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#334155',
              marginBottom: '6px'
            }}>
              Work Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@universalsompo.in"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13.5px',
                  color: '#0F172A',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#334155',
                margin: 0
              }}>
                Password
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 38px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13.5px',
                  color: '#0F172A',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: '14px', height: '14px', accentColor: '#CC0022', cursor: 'pointer' }}
            />
            <label htmlFor="rememberMe" style={{ fontSize: '12px', color: '#64748B', cursor: 'pointer', userSelect: 'none' }}>
              Stay signed in on this device
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: '#CC0022',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '11px',
              fontSize: '13.5px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.backgroundColor = '#B3001E'; }}
            onMouseLeave={(e) => { if (!loading) e.target.style.backgroundColor = '#CC0022'; }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Demo Credentials Section */}
        <div style={{
          marginTop: '24px',
          borderTop: '1px solid #F1F5F9',
          paddingTop: '18px'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: '700',
            color: '#64748B',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            marginBottom: '10px'
          }}>
            Quick Login Credentials
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {DEMO_ACCOUNTS.map((acc, idx) => {
              const isSelected = email === acc.email;
              return (
                <div
                  key={idx}
                  onClick={() => handleQuickFill(acc)}
                  style={{
                    backgroundColor: isSelected ? '#F8FAFC' : '#FFFFFF',
                    border: `1px solid ${isSelected ? '#CBD5E1' : '#E2E8F0'}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94A3B8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = isSelected ? '#CBD5E1' : '#E2E8F0'; }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1E293B' }}>
                      {acc.role}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                      {acc.email} • <span style={{ color: '#475569' }}>{acc.password}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: '600',
                    color: isSelected ? '#CC0022' : '#64748B',
                    backgroundColor: isSelected ? '#FFF1F2' : '#F1F5F9',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {isSelected ? 'Active' : 'Select'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Footer Disclaimer */}
      <div style={{
        marginTop: '24px',
        textAlign: 'center',
        fontSize: '11px',
        color: '#94A3B8',
        lineHeight: '1.5',
        maxWidth: '460px'
      }}>
        Joint Venture of Indian Bank, Indian Overseas Bank, Karnataka Bank, Dabur Investments & Sompo Japan
      </div>
    </div>
  );
}
