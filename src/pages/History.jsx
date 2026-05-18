/* ═══ History Page ═══ */
import { Download, Trash2 } from 'lucide-react';
import TradeHistory from '../components/TradeHistory';
import useTradeStore from '../store/useTradeStore';

export default function History() {
  const history = useTradeStore(s => s.history);
  const stats = useTradeStore(s => s.sessionStats);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `derivprinter_trades_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const winRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Trade History
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {stats.trades} trades • {winRate}% win rate • P&L: ${stats.pnl.toFixed(2)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => useTradeStore.getState().resetSession()} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--crimson)',
            background: 'rgba(255, 68, 79, 0.1)', color: 'var(--crimson)',
            fontSize: 12, cursor: 'pointer',
            opacity: history.length > 0 ? 1 : 0.5
          }} disabled={history.length === 0}>
            <Trash2 size={14} /> Reset
          </button>
          <button onClick={handleExport} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer',
            opacity: history.length > 0 ? 1 : 0.5
          }} disabled={history.length === 0}>
            <Download size={14} /> Export JSON
          </button>
        </div>
      </div>

      {/* Session Summary - Compact single line */}
      <div className="glass" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {[
          { label: 'Total Trades', value: stats.trades, color: 'var(--text-primary)' },
          { label: 'Wins', value: stats.wins, color: 'var(--emerald)' },
          { label: 'Losses', value: stats.losses, color: 'var(--crimson)' },
          { label: 'Win Rate', value: `${winRate}%`, color: 'var(--cyan)' },
          { label: 'Net P&L', value: `$${stats.pnl.toFixed(2)}`, color: stats.pnl >= 0 ? 'var(--emerald)' : 'var(--crimson)' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>
              {item.label}
            </div>
            <div className="font-data" style={{ fontSize: 16, fontWeight: 700, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Full History Table */}
      <TradeHistory limit={0} />
    </div>
  );
}
