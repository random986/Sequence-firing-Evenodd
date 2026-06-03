/* ═══ Dashboard Page — Command Center ═══ */
import { useEffect, useState } from 'react';
import { Wallet, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import useConfigStore from '../store/useConfigStore';
import StatCard from '../components/StatCard';
import TickFeed from '../components/TickFeed';
import BotControl from '../components/BotControl';
import TradeHistory from '../components/TradeHistory';
import StrategyLeaderboard from '../components/StrategyLeaderboard';
import useConnectionStore from '../store/useConnectionStore';
import useTradeStore from '../store/useTradeStore';
import enhancedTradeEngine from '../lib/enhancedTradeEngine';
import { MARKETS, MARKET_LABELS } from '../lib/marketScanner';
import { computePerformanceBreakdown, BINARY_BREAKEVEN_WR } from '../lib/tradeAnalytics';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const balance = useConnectionStore(s => s.balance);
  const currency = useConnectionStore(s => s.currency);
  const stats = useTradeStore(s => s.sessionStats);
  const botRunning = useTradeStore(s => s.botRunning);
  const botStatus = useTradeStore(s => s.botStatus);
  const config = useConfigStore();
  const [tick, setTick] = useState(0);

  // Force re-render every second for live balance
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const history = useTradeStore(s => s.history);
  const stopReason = useTradeStore(s => s.stopReason);

  const winRate = stats.trades > 0
    ? ((stats.wins / stats.trades) * 100).toFixed(1)
    : '0.0';

  const balanceNum = Number(balance) || 0;
  const pnlNum = Number(stats.pnl) || 0;

  const perf = computePerformanceBreakdown(history);
  const showPerfWarn = stats.trades >= 10 && perf.belowBreakeven;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1600, margin: '0 auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display" style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
            margin: 0,
          }}>
            Synthetic Markets
          </h1>
          <div style={{ color: 'var(--crimson)', fontSize: 13, marginTop: 4, fontWeight: 600 }}>
            Do not overtrade you might loose everything
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {/* Auto Switch Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8, paddingRight: 8, borderRight: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Auto Switch:</span>
              <button 
                  onClick={() => config.updateConfig({ autoSwitchMarkets: !config.autoSwitchMarkets })}
                  style={{
                    width: 36, height: 20, borderRadius: 10,
                    background: config.autoSwitchMarkets ? 'var(--success)' : 'var(--border)',
                    border: 'none', position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: config.autoSwitchMarkets ? 19 : 3,
                    transition: 'left 0.2s',
                  }} />
              </button>
            </div>
            {/* Base Stake Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8, paddingRight: 8, borderRight: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Stake:</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>$</span>
                <input
                  type="number"
                  value={config.baseStake ?? 0.35}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    config.updateConfig({ baseStake: Number.isFinite(v) && v >= 0.35 ? v : 0.35 });
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isFinite(v) || v < 0.35) config.updateConfig({ baseStake: 0.35 });
                  }}
                  step={0.01}
                  min={0.35}
                  className="font-data"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '4px 10px 4px 22px',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                    width: 88,
                    minWidth: 88,
                  }}
                />
              </div>
            </div>

            {/* Martingale Button */}
            <button
              onClick={() => config.updateConfig({ recoveryEnabled: !config.recoveryEnabled })}
              style={{
                background: config.recoveryEnabled ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                border: config.recoveryEnabled ? 'none' : '1px solid var(--border)',
                color: config.recoveryEnabled ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s',
                marginRight: 4
              }}
            >
              MARTINGALE {config.recoveryEnabled ? 'ON' : 'OFF'}
            </button>

            {/* Anti-Martingale Button */}
            <button
              onClick={() => config.updateConfig({ antiMartEnabled: !config.antiMartEnabled })}
              style={{
                background: config.antiMartEnabled ? 'var(--amber)' : 'rgba(255,255,255,0.05)',
                border: config.antiMartEnabled ? 'none' : '1px solid var(--border)',
                color: config.antiMartEnabled ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s',
                marginRight: 8
              }}
            >
              ANTI-MART {config.antiMartEnabled ? 'ON' : 'OFF'}
            </button>
            
            {/* Market Selection Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8, paddingRight: 8, borderRight: '1px solid var(--border)' }}>
               <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Market:</span>
               <select
                 value={enhancedTradeEngine.activeMarket || ''}
                 onChange={(e) => enhancedTradeEngine.setMarket(e.target.value)}
                 className="font-data"
                 style={{
                   background: 'var(--bg-primary)',
                   border: '1px solid var(--border)',
                   borderRadius: 4,
                   padding: '2px 8px',
                   color: 'var(--text-primary)',
                   fontSize: 12,
                   outline: 'none',
                   cursor: 'pointer'
                 }}
               >
                 <option value="" disabled>Select...</option>
                 {MARKETS.map(m => (
                   <option key={m} value={m}>{MARKET_LABELS[m] || m}</option>
                 ))}
               </select>
            </div>

            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Strategy:</span>
            <button
              onClick={() => config.updateConfig({ strategy: 'BOTH' })}
              style={{
                background: config.strategy === 'BOTH' ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                border: config.strategy === 'BOTH' ? 'none' : '1px solid var(--border)',
                color: config.strategy === 'BOTH' ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              EVEN / ODD
            </button>
            <button
              onClick={() => config.updateConfig({ strategy: 'BOTH5' })}
              style={{
                background: config.strategy === 'BOTH5' ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                border: config.strategy === 'BOTH5' ? 'none' : '1px solid var(--border)',
                color: config.strategy === 'BOTH5' ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              OVER / UNDER 5
            </button>
            <button
              onClick={() => config.updateConfig({ strategy: 'EO_WINNING' })}
              style={{
                background: config.strategy === 'EO_WINNING' ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                border: config.strategy === 'EO_WINNING' ? 'none' : '1px solid var(--border)',
                color: config.strategy === 'EO_WINNING' ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              EO WINNING
            </button>
            <button
              onClick={() => config.updateConfig({ strategy: 'OU_WINNING' })}
              style={{
                background: config.strategy === 'OU_WINNING' ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                border: config.strategy === 'OU_WINNING' ? 'none' : '1px solid var(--border)',
                color: config.strategy === 'OU_WINNING' ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              OU WINNING
            </button>
            <button
              onClick={() => config.updateConfig({ strategy: 'OMNISNIPER' })}
              style={{
                background: config.strategy === 'OMNISNIPER' ? 'var(--amber)' : 'rgba(255,255,255,0.05)',
                border: config.strategy === 'OMNISNIPER' ? 'none' : '1px solid var(--border)',
                color: config.strategy === 'OMNISNIPER' ? '#000' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              OMNISNIPER
            </button>
          </div>
        </div>
        {botRunning && <div className="live-dot" />}
      </div>
      {(showPerfWarn || stopReason || config.conservativeMode || config.minStakeOnly) && (
        <div className="glass" style={{
          padding: '10px 14px', fontSize: 12,
          borderLeft: showPerfWarn ? '3px solid var(--crimson)' : '3px solid var(--cyan)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            {showPerfWarn && (
              <span style={{ color: 'var(--crimson)', fontWeight: 600 }}>
                WR {winRate}% below break-even ({BINARY_BREAKEVEN_WR}%) · consider conservative / base-stake mode ·{' '}
              </span>
            )}
            {config.conservativeMode && <span>Conservative · </span>}
            {config.minStakeOnly && <span>Base stake only · </span>}
            {perf.rolling10 != null && <span>WR10 {Number(perf.rolling10).toFixed(0)}% · </span>}
            {perf.rolling50 != null && <span>WR50 {Number(perf.rolling50).toFixed(0)}%</span>}
            {stopReason && (
              <div style={{ color: 'var(--crimson)', marginTop: 4 }}>Stopped: {stopReason}</div>
            )}
          </div>
          <Link to="/history" style={{ color: 'var(--cyan)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
            Analytics →
          </Link>
        </div>
      )}

      {/* Grid Layout: Adjusted for wider history table */}
      <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
        
        {/* Left Column (Main Controls & Stats - Reduced width to 5/12) */}
        <div className="flex flex-col gap-4 xl:w-5/12 flex-shrink-0">
          
          <StrategyLeaderboard />

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            <StatCard
              icon={Wallet}
              label="Balance"
              value={`$${balanceNum.toFixed(2)}`}
              sub={currency}
              color="var(--amber)"
              delay={0}
            />
            <StatCard
              icon={TrendingUp}
              label="Session P&L"
              value={`${pnlNum >= 0 ? '+' : ''}$${pnlNum.toFixed(2)}`}
              sub={`${stats.trades} trades`}
              color={pnlNum >= 0 ? 'var(--success)' : 'var(--crimson)'}
              delay={0.05}
            />
            <StatCard
              icon={BarChart3}
              label="Win Rate"
              value={`${winRate}%`}
              sub={`${stats.wins}W / ${stats.losses}L`}
              color="var(--cyan)"
              delay={0.1}
            />
            <StatCard
              icon={Activity}
              label="Active"
              value={botRunning ? 'LIVE' : 'OFF'}
              sub={botRunning ? (botStatus || 'Scanning…') : 'Idle'}
              color={botRunning ? 'var(--cyan)' : 'var(--text-muted)'}
              delay={0.15}
            />
          </div>

          {/* Tick Feed Removed for Synthetics */}

          {/* Bot Control */}
          <BotControl />
        </div>

        {/* Right Column (Trade History - Expanded width to 7/12) */}
        <div className="flex-1 xl:w-7/12 min-h-[400px] xl:min-h-0 flex flex-col">
          <TradeHistory limit={0} fullHeight />
        </div>

      </div>
    </div>
  );
}
