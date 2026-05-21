/* ═══ Preloader — Disclaimer overlay shown on first visit ═══ */
import { useState, useEffect } from 'react';

const DISCLAIMER_KEY = 'derivprinter_disclaimer_accepted';

export default function Preloader({ onAccept }) {
  const [fadeOut, setFadeOut] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const accepted = localStorage.getItem(DISCLAIMER_KEY);
    if (accepted === 'true') {
      setVisible(false);
      onAccept();
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(DISCLAIMER_KEY, 'true');
    setFadeOut(true);
    setTimeout(() => {
      setVisible(false);
      onAccept();
    }, 500);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'linear-gradient(145deg, #0a0a0a 0%, #141428 50%, #0a0a0a 100%)',
      zIndex: 99999,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 24px',
      overflowY: 'auto',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.5s ease-out'
    }}>
      <style>{`
        @keyframes preloaderPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Logo */}
      <div style={{
        width: 120, height: 120, borderRadius: 24,
        overflow: 'hidden', marginBottom: 24,
        animation: 'preloaderPulse 2s ease-in-out infinite',
        boxShadow: '0 0 60px rgba(255, 68, 79, 0.3)'
      }}>
        <img src="./logo.png" alt="Derivprinter Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>

      {/* Brand Name */}
      <h1 style={{
        fontSize: 36, fontWeight: 800, color: '#fff',
        fontFamily: "'Syne', sans-serif",
        marginBottom: 8, letterSpacing: '-0.5px'
      }}>
        Derivprinter
      </h1>
      <p style={{
        fontSize: 13, color: 'rgba(255,255,255,0.5)',
        marginBottom: 32, letterSpacing: '2px', textTransform: 'uppercase'
      }}>
        Automated Digit Trading Terminal
      </p>

      {/* Disclaimer Box */}
      <div style={{
        maxWidth: 480, width: '100%',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '28px 24px',
        backdropFilter: 'blur(12px)'
      }}>
        <h2 style={{
          fontSize: 16, fontWeight: 700, color: '#ff444f',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          ⚠️ Risk Disclaimer
        </h2>

        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
          <p style={{ marginBottom: 12 }}>
            <strong style={{ color: '#fff' }}>Trading involves significant risk of loss.</strong> The financial products offered on this platform 
            carry a high level of risk and can result in the loss of all your funds. You should never invest money that you cannot afford to lose.
          </p>
          <p style={{ marginBottom: 12 }}>
            Synthetic indices are complex instruments. Past performance is not indicative of future results. 
            The use of automated trading strategies, including Martingale-based systems, can amplify both gains and losses.
          </p>
          <p style={{ marginBottom: 12 }}>
            This software is provided <strong style={{ color: '#fff' }}>"as is"</strong> without warranty of any kind. The developers 
            are not responsible for any financial losses incurred through the use of this application. 
            You are solely responsible for your trading decisions.
          </p>
          <p style={{ marginBottom: 0 }}>
            By proceeding, you confirm that you are of legal age in your jurisdiction, understand the risks involved, 
            and accept full responsibility for your trading activity.
          </p>
        </div>
      </div>

      {/* Accept Button */}
      <button
        onClick={handleAccept}
        style={{
          marginTop: 24,
          background: 'linear-gradient(135deg, #ff444f 0%, #ff6b74 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          padding: '16px 48px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.5px',
          boxShadow: '0 8px 32px rgba(255, 68, 79, 0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(255, 68, 79, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(255, 68, 79, 0.3)';
        }}
      >
        I UNDERSTAND & AGREE
      </button>

      <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
        © {new Date().getFullYear()} Derivprinter. All rights reserved.
      </p>
    </div>
  );
}
