/* ═══ Scanner Page — Full market analysis ═══ */
import { useState, useEffect } from 'react';
import scanner, { MARKETS, MARKET_LABELS } from '../lib/marketScanner';
import useConfigStore from '../store/useConfigStore';
import useConnectionStore from '../store/useConnectionStore';
import tradeEngine from '../lib/enhancedTradeEngine';

export default function Scanner() {
  const [scores, setScores] = useState({});
  const [tab, setTab] = useState('ou'); // 'ou' or 'eo'
  const activeMarket = useConnectionStore(s => s.activeMarket);
  const setActiveMarket = useConnectionStore(s => s.setActiveMarket);

  const handleSwitch = (sym) => {
    setActiveMarket(sym);
    if (tradeEngine.running) {
      tradeEngine.activeMarket = sym;
      if (tradeEngine.onMarketSwitch) tradeEngine.onMarketSwitch(sym);
    }
  };

  useEffect(() => {
    const prev = scanner.onUpdate;
    scanner.onUpdate = (sym, allScores) => {
      if (prev) prev(sym, allScores);
      setScores({ ...allScores });
    };
    return () => { scanner.onUpdate = prev; };
  }, []);

  const tabs = [
    { key: 'ou', label: 'Over/Under 5' },
    { key: 'eo', label: 'Even/Odd' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div>
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Market Scanner
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Real-time digit analysis across all markets
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: tab === t.key ? 'rgba(0,229,255,0.12)' : 'transparent',
            color: tab === t.key ? 'var(--cyan)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Market Table */}
      <div className="glass" style={{ padding: '16px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Market', 'Ticks', tab === 'ou' ? 'Over' : 'Even', tab === 'ou' ? 'Under' : 'Odd', tab === 'ou' ? 'D5%' : 'Balance', 'Streak', 'Conf', 'Score', 'Action'].map(h => (
                <th key={h} style={{
                  padding: '8px 10px', textAlign: h === 'Action' ? 'right' : 'left', fontSize: 10,
                  color: 'var(--text-muted)', fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...MARKETS]
              .map(sym => ({ sym, s: scores[sym] || {} }))
              .sort((a, b) => {
                if (tab === 'ou') {
                  // Sort by highest Over% first (most digits >5)
                  return (parseFloat(b.s.overPct) || 0) - (parseFloat(a.s.overPct) || 0);
                } else {
                  // Sort by most balanced even/odd (smallest difference between even and odd)
                  const diffA = Math.abs((parseFloat(a.s.evenPct) || 50) - (parseFloat(a.s.oddPct) || 50));
                  const diffB = Math.abs((parseFloat(b.s.evenPct) || 50) - (parseFloat(b.s.oddPct) || 50));
                  return diffA - diffB; // smallest diff first = most balanced
                }
              })
              .map(({ sym }) => {
              const s = scores[sym] || {};
              const isActive = sym === activeMarket;
              const score = tab === 'ou' ? (s.overUnderScore || 0) : (s.evenOddScore || 0);

              return (
                <tr key={sym} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: isActive ? 'rgba(0,229,255,0.04)' : 'transparent',
                }}>
                  <td className="font-data" style={{
                    padding: '8px 10px', fontSize: 12, fontWeight: 600,
                    color: isActive ? 'var(--cyan)' : 'var(--text-primary)',
                  }}>
                    {MARKET_LABELS[sym]}
                    {isActive && <span style={{ fontSize: 9, marginLeft: 6, color: 'var(--emerald)' }}>ACTIVE</span>}
                  </td>
                  <td className="font-data" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.tickCount || 0}
                  </td>
                  <td className="font-data" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--emerald)' }}>
                    {tab === 'ou' ? `${s.overPct || 0}%` : `${s.evenPct || 0}%`}
                  </td>
                  <td className="font-data" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--crimson)' }}>
                    {tab === 'ou' ? `${s.underPct || 0}%` : `${s.oddPct || 0}%`}
                  </td>
                  <td className="font-data" style={{
                    padding: '8px 10px', fontSize: 11,
                    color: tab === 'ou'
                      ? (parseFloat(s.d5Pct) > 15 ? 'var(--crimson)' : 'var(--text-muted)')
                      : 'var(--text-muted)',
                  }}>
                    {tab === 'ou' ? `${s.d5Pct || 0}%` : `${s.evenOddScore || 0}`}
                  </td>
                  <td className="font-data" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--amber)' }}>
                    {s.streak || 0} {s.streakType ? `(${s.streakType})` : ''}
                  </td>
                  <td className="font-data" style={{
                    padding: '8px 10px', fontSize: 11,
                    color: (s.confidence || 50) > 55 ? 'var(--emerald)' : 'var(--text-muted)',
                  }}>
                    {s.confidence || 50}%
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{
                        width: 50, height: 5, borderRadius: 3,
                        background: 'rgba(255,255,255,0.05)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(score, 100)}%`,
                          height: '100%', borderRadius: 3,
                          background: score > 60 ? 'var(--emerald)' : score > 40 ? 'var(--amber)' : 'var(--crimson)',
                        }} />
                      </div>
                      <span className="font-data" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {score}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    {isActive ? (
                      <span style={{ fontSize: 10, color: 'var(--emerald)', fontWeight: 700, padding: '4px 8px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 4 }}>ACTIVE</span>
                    ) : (
                      <button onClick={() => handleSwitch(sym)} className="hover:bg-white/10 transition-colors" style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer'
                      }}>SWITCH</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Digit Frequency Grid */}
      <div className="glass" style={{ padding: '16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Digit Frequency — {MARKET_LABELS[activeMarket] || 'No market'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(scores[activeMarket]?.freq || Array(10).fill(0)).map((count, digit) => {
            const max = Math.max(...(scores[activeMarket]?.freq || [1]));
            const pct = max > 0 ? (count / max) * 100 : 0;
            const isEven = digit % 2 === 0;
            return (
              <div key={digit} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}>
                <div style={{
                  width: '100%', height: 60, borderRadius: 4,
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex', alignItems: 'flex-end',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: '100%', height: `${pct}%`,
                    background: isEven ? 'var(--cyan)' : 'var(--amber)',
                    opacity: 0.6, borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                  }} />
                </div>
                <span className="font-data" style={{
                  fontSize: 12, fontWeight: 600,
                  color: isEven ? 'var(--cyan)' : 'var(--amber)',
                }}>
                  {digit}
                </span>
                <span className="font-data" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
