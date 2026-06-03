import React, { useMemo, useState } from 'react';
import { Trophy, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import useTradeStore from '../store/useTradeStore';
import useConfigStore from '../store/useConfigStore';

const SYNTHETIC = new Set(['BOTH', 'BOTH5', 'EO_WINNING', 'OU_WINNING', 'OMNISNIPER']);

const STATUS = {
  READY: { c: 'var(--success)', l: 'R' },
  NEAR: { c: 'var(--amber)', l: 'N' },
  WATCHING: { c: 'var(--text-muted)', l: 'W' },
  WARMING: { c: 'var(--text-muted)', l: '·' },
};

function sideLabelFor(strategy) {
  if (strategy === 'BOTH5' || strategy === 'OU_WINNING') return 'O5 / U5';
  if (strategy === 'OMNISNIPER') return 'OMNI';
  return 'EVEN / ODD';
}

export default function StrategyLeaderboard() {
  const strategy = useConfigStore(s => s.strategy);
  const board = useTradeStore(s => s.liveAnalysisBoard);
  const botRunning = useTradeStore(s => s.botRunning);
  const [collapsed, setCollapsed] = useState(true);

  const rows = board?.rows || [];
  const top = useMemo(() => rows.slice(0, 8), [rows]);

  if (!SYNTHETIC.has(strategy)) return null;

  const best = board?.bestPick;
  const sides = sideLabelFor(strategy);
  const recoverySec = board?.recoverySecLeft;
  const readyCount = board?.readyCount ?? 0;

  return (
    <div className="glass" style={{ padding: collapsed ? '8px 12px' : '12px 14px' }}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 8,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          marginBottom: collapsed ? 0 : 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Trophy size={15} color="var(--cyan)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Market Leaderboard
          </span>
          {botRunning && (
            <span style={{
              fontSize: 8, fontWeight: 800, color: 'var(--success)',
              background: 'rgba(0,255,136,0.12)', padding: '2px 5px', borderRadius: 3,
            }}>
              LIVE
            </span>
          )}
          {collapsed && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
              · {readyCount} ready
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!collapsed && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              15 mkts · {sides}
            </span>
          )}
          {collapsed
            ? <ChevronDown size={16} color="var(--text-muted)" />
            : <ChevronUp size={16} color="var(--text-muted)" />}
        </div>
      </button>

      {collapsed && best && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
          fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden',
        }}>
          <Zap size={12} color="var(--cyan)" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            #{best.rank} {best.dir} · {best.marketLabel} · {best.winChance}%
          </span>
        </div>
      )}

      {!collapsed && best && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '7px 10px', borderRadius: 8,
          background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.18)',
        }}>
          <Zap size={14} color="var(--cyan)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', flex: 1 }}>
            #{best.rank} {best.dir} · {best.marketLabel} · {best.winChance}%
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: STATUS[best.status]?.c || 'var(--text-muted)' }}>
            {best.status}
          </span>
        </div>
      )}

      {!collapsed && !botRunning && !rows.length && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
          Start bot to rank all markets in parallel
        </div>
      )}

      {!collapsed && top.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '22px 1fr 36px 40px 36px',
            gap: 4, fontSize: 8, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.3px', padding: '0 4px 2px',
          }}>
            <span>#</span><span>Pick</span><span>Win</span><span>VL</span><span>Sc</span>
          </div>
          {top.map((r) => {
            const st = STATUS[r.status] || STATUS.WATCHING;
            return (
              <div key={`${r.sym}:${r.dir}`} style={{
                display: 'grid', gridTemplateColumns: '22px 1fr 36px 40px 36px',
                gap: 4, alignItems: 'center', padding: '4px 6px', borderRadius: 6,
                background: r.rank === 1 ? 'rgba(0,229,255,0.06)' : 'rgba(255,255,255,0.02)',
                fontSize: 10,
              }}>
                <span className="font-data" style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{r.rank}</span>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.marketLabel}
                  </div>
                  <div style={{ fontSize: 9, color: st.c }}>{r.dir}</div>
                </div>
                <span className="font-data" style={{ color: r.winChance >= 50 ? 'var(--success)' : 'inherit' }}>{r.winChance}%</span>
                <span className="font-data" style={{ color: 'var(--amber)' }}>{r.streak}/{r.required || '·'}</span>
                <span className="font-data" style={{ color: 'var(--text-secondary)' }}>{r.score}</span>
              </div>
            );
          })}
          {rows.length > 8 && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
              +{rows.length - 8} more ranked
            </div>
          )}
        </div>
      )}

      {!collapsed && botRunning && recoverySec != null && recoverySec > 0 && (
        <div style={{ fontSize: 9, color: 'var(--amber)', marginTop: 6, textAlign: 'center' }}>
          Recovery window · {recoverySec}s
        </div>
      )}
    </div>
  );
}
