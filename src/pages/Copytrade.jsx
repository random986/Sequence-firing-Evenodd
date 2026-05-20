import { useState, useEffect } from 'react';
import { Copy, RefreshCw, StopCircle, PlayCircle, AlertTriangle } from 'lucide-react';
import useAccountStore from '../store/useAccountStore';
import copyTradeEngine from '../lib/copyTradeEngine';

export default function Copytrade() {
  const accounts = useAccountStore(s => s.accounts);
  const activeAccountId = useAccountStore(s => s.activeAccountId);

  const realAccounts = accounts.filter(a => !a.is_virtual);
  const demoAccounts = accounts.filter(a => a.is_virtual);

  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const isCurrentlyReal = activeAccount && !activeAccount.is_virtual;

  const [demoAccountId, setDemoAccountId] = useState(demoAccounts[0]?.id || '');
  const [engineState, setEngineState] = useState(copyTradeEngine.getState());
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Poll state
    const interval = setInterval(() => {
      setEngineState(copyTradeEngine.getState());
    }, 1000);

    // Bind log listener
    copyTradeEngine.onTradeLog = (msg) => {
      setLogs(prev => [...prev, { time: new Date(), msg }].slice(-50));
    };

    return () => {
      clearInterval(interval);
      copyTradeEngine.onTradeLog = null;
    };
  }, []);

  const handleToggle = async () => {
    if (engineState.active) {
      copyTradeEngine.stop();
    } else {
      if (!isCurrentlyReal) {
        alert("You must be actively using a Real Account to copy trades to a Demo Account.");
        return;
      }
      if (!demoAccountId) {
        alert("Please select a target Demo Account.");
        return;
      }
      const demoAcc = accounts.find(a => a.id === demoAccountId);
      if (!demoAcc) return;

      copyTradeEngine.configure({
        demoToken: demoAcc.token,
        demoAccountId: demoAcc.loginid,
        realAccountId: activeAccount.loginid
      });
      await copyTradeEngine.start();
    }
    setEngineState(copyTradeEngine.getState());
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Copy size={28} color="var(--amber)" />
        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Copytrade Engine</h1>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 32
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} color="var(--amber)" />
          Real-to-Demo Replication
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          The Copytrade engine intercepts trades placed on your primary Real account and replicates them onto a secondary Demo account in real-time. You must be connected to a Real account to initiate this.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          {/* Source Account */}
          <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8, letterSpacing: '0.5px' }}>Primary (Source)</span>
            {isCurrentlyReal ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
                <span className="font-data" style={{ fontWeight: 700, fontSize: 15 }}>{activeAccount.loginid}</span>
                <span style={{ fontSize: 11, padding: '4px 8px', background: 'rgba(0,230,118,0.1)', color: 'var(--success)', borderRadius: 4, fontWeight: 600 }}>Real</span>
              </div>
            ) : (
              <div style={{ color: 'var(--crimson)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> Please switch to a Real account.
              </div>
            )}
          </div>

          {/* Target Account */}
          <div style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8, letterSpacing: '0.5px' }}>Target (Destination)</span>
            <select
              value={demoAccountId}
              onChange={(e) => setDemoAccountId(e.target.value)}
              disabled={engineState.active || demoAccounts.length === 0}
              className="font-data"
              style={{
                width: '100%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: 14
              }}
            >
              {demoAccounts.length === 0 && <option value="">No Demo accounts found</option>}
              {demoAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.loginid} - {a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: engineState.status === 'authorized' ? 'var(--success)' : engineState.status === 'error' ? 'var(--crimson)' : 'var(--text-muted)'
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Status: <span style={{ color: engineState.status === 'authorized' ? 'var(--success)' : 'var(--text-primary)' }}>{engineState.status}</span>
            </span>
          </div>

          <button
            onClick={handleToggle}
            disabled={!isCurrentlyReal && !engineState.active}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', borderRadius: 8, border: 'none',
              background: engineState.active ? 'var(--crimson)' : 'var(--amber)',
              color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: (!isCurrentlyReal && !engineState.active) ? 0.5 : 1,
              transition: 'all 0.2s',
              boxShadow: engineState.active ? '0 4px 15px rgba(255,68,79,0.3)' : '0 4px 15px rgba(0,168,255,0.3)'
            }}
          >
            {engineState.active ? (
              <><StopCircle size={18} /> STOP COPYING</>
            ) : (
              <><PlayCircle size={18} /> START COPYTRADE</>
            )}
          </button>
        </div>
      </div>

      {/* Copytrade Logs */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 20, minHeight: 300, display: 'flex', flexDirection: 'column'
      }}>
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12
        }}>
          <RefreshCw size={14} style={{ animation: engineState.active ? 'spin 2s linear infinite' : 'none', color: engineState.active ? 'var(--amber)' : 'inherit' }} />
          Replication Logs
        </h3>
        <div className="font-data" style={{ flex: 1, overflowY: 'auto', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontStyle: 'italic' }}>
              Engine idle. Start copying to see logs...
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>[{log.time.toLocaleTimeString()}]</span>
                <span style={{ color: log.msg.includes('❌') ? 'var(--crimson)' : log.msg.includes('✅') ? 'var(--success)' : 'inherit' }}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
