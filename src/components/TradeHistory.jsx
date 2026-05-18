/* ═══ TradeHistory — Expanded History Table ═══ */
import { useEffect, useState } from 'react';
import useTradeStore from '../store/useTradeStore';
import { MARKET_LABELS } from '../lib/marketScanner';
import { Trash2 } from 'lucide-react';

function formatTimeElapsed(ms) {
  if (ms < 1000) return 'Just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function TradeHistory({ limit = 10, fullHeight = false }) {
  const history = useTradeStore(s => s.history);
  const stats = useTradeStore(s => s.sessionStats);
  const trades = limit ? history.slice(0, limit) : history;
  const [now, setNow] = useState(Date.now());

  // Update time elapsed every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Calculate session max stats dynamically
  let maxStake = 0;
  let maxCashout = 0;
  history.forEach(t => {
    if (t.stake > maxStake) maxStake = t.stake;
    const payout = t.won ? (t.stake + t.profit) : 0;
    if (payout > maxCashout) maxCashout = payout;
  });

  return (
    <div className="glass flex flex-col h-full" style={{ padding: '14px 20px', overflow: 'hidden' }}>
      
      {/* Header & Stats Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Trade History
        </div>
        <div className="flex gap-6 items-center">
          <div className="flex flex-col items-end">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trades</span>
            <span className="font-data" style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700 }}>
              {stats.trades}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Session P&L</span>
            <span className="font-data" style={{ fontSize: 14, color: stats.pnl >= 0 ? 'var(--cyan)' : 'var(--crimson)', fontWeight: 700 }}>
              {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Stake</span>
            <span className="font-data" style={{ fontSize: 14, color: 'var(--amber)', fontWeight: 700 }}>${maxStake.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Payout</span>
            <span className="font-data" style={{ fontSize: 14, color: 'var(--cyan)', fontWeight: 700 }}>${maxCashout.toFixed(2)}</span>
          </div>
          <button 
            onClick={() => useTradeStore.getState().resetSession()}
            style={{
              background: 'rgba(255, 68, 79, 0.1)', border: '1px solid var(--crimson)',
              color: 'var(--crimson)', padding: '6px', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Reset History"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          No trades yet in this session.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto" style={{ margin: '0 -12px', padding: '0 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Market', 'Type', 'Stake', 'P&L', 'Digit'].map((h, i) => (
                  <th key={h} style={{
                    padding: '12px 6px', textAlign: i >= 3 ? 'right' : 'left',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }} className="hover:bg-white/5 transition-colors">
                  <td className="font-data" style={{ padding: '12px 6px', color: 'var(--text-secondary)' }}>
                    <div className="flex flex-col">
                      <span style={{ fontSize: 13 }}>{new Date(t.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTimeElapsed(now - t.time)}</span>
                    </div>
                  </td>
                  <td className="font-data" style={{ padding: '12px 6px', color: 'var(--amber)', fontWeight: 600 }}>
                    {MARKET_LABELS[t.market] || t.market}
                  </td>
                  <td className="font-data" style={{ padding: '12px 6px', color: 'var(--text-primary)' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 11,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)'
                    }}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="font-data text-right" style={{ padding: '12px 6px', color: 'var(--text-primary)' }}>
                    ${t.stake.toFixed(2)}
                  </td>
                  <td className="font-data text-right" style={{
                    padding: '12px 6px', fontSize: 13, fontWeight: 700,
                    color: t.won ? 'var(--cyan)' : 'var(--crimson)',
                  }}>
                    {t.won ? '+' : ''}{t.profit.toFixed(2)}
                  </td>
                  <td className="font-data text-right" style={{
                    padding: '12px 6px', fontSize: 14, fontWeight: 800,
                    color: t.won ? 'var(--cyan)' : 'var(--crimson)',
                  }}>
                    {t.exitTick ? String(t.exitTick).slice(-1) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
