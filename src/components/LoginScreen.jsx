/* ═══ Derivprinter — Login Screen Component ═══ */
import { useState } from 'react';
import { LogIn, Shield, Cpu, Zap } from 'lucide-react';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    // Hardcoded App ID for commissions
    const appId = '33h51PQlu5tsWflEmmoxW';
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${appId}`;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at top right, rgba(0, 167, 158, 0.08), transparent 45%), var(--bg-primary)',
      padding: '24px',
      color: '#fff',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Background glowing effects */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '10%',
        width: '300px',
        height: '300px',
        background: 'var(--cyan)',
        filter: 'blur(150px)',
        opacity: 0.04,
        pointerEvents: 'none'
      }} />

      <div className="glass" style={{
        maxWidth: 420,
        width: '100%',
        padding: '40px 32px',
        borderRadius: 16,
        textAlign: 'center',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        zIndex: 10
      }}>
        {/* Animated Icon Container */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'linear-gradient(135deg, var(--cyan) 0%, rgba(0, 167, 158, 0.1) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          boxShadow: '0 0 20px rgba(0, 167, 158, 0.2)',
        }}>
          <Cpu size={32} color="var(--cyan)" />
        </div>

        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
          Derivprinter
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 32px 0', lineHeight: 1.5 }}>
          High-performance trading automation terminal. Connect your Deriv account to proceed.
        </p>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, var(--cyan) 0%, #00b0ff 100%)',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? 'wait' : 'pointer',
            boxShadow: '0 4px 15px rgba(0, 167, 158, 0.2)',
            transition: 'all 0.2s',
            opacity: loading ? 0.8 : 1
          }}
        >
          <LogIn size={18} />
          {loading ? 'Redirecting to Deriv...' : 'Connect with Deriv'}
        </button>

        {/* Trust Indicators */}
        <div style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <Shield size={16} color="var(--cyan)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Secure OAuth 2.0 Connection</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>The app never accesses or stores your passwords.</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <Zap size={16} color="var(--cyan)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Direct WebSocket execution</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ultra-low latency connection directly to Deriv servers.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
