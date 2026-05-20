/* ═══ Settings Page — Premium Grid Layout ═══ */
import { useState } from 'react';
import { Settings2, Shield, Plus, Key, Copy, Check, Trash2, SlidersHorizontal, Activity } from 'lucide-react';
import useConfigStore from '../store/useConfigStore';
import useAccountStore from '../store/useAccountStore';

function SliderInput({ label, value, onChange, min, max, step, unit = '' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number" value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{
              width: 70, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              borderRadius: 6, color: '#fff', fontSize: 13, padding: '4px 8px', textAlign: 'right',
            }}
          />
          {unit && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unit}</span>}
        </div>
      </div>
      <div className="hidden md:block">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--cyan)' }}
        />
      </div>
    </div>
  );
}

export default function Settings() {
  const config = useConfigStore();
  const accounts = useAccountStore(s => s.accounts);
  const addAccount = useAccountStore(s => s.addAccount);
  const removeAccount = useAccountStore(s => s.removeAccount);
  const activeAccountId = useAccountStore(s => s.activeAccountId);

  const [newToken, setNewToken] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [appId, setAppId] = useState(localStorage.getItem('derivprinter_app_id') || '1089');

  const handleCopy = (token) => {
    navigator.clipboard.writeText(token);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newToken.trim()) return;
    addAccount({ token: newToken.trim(), balance: null, currency: 'USD' });
    setNewToken('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
      
      {/* Header */}
      <div>
        <h1 className="font-display" style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Settings2 size={28} color="var(--cyan)" />
          Terminal Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Manage your Deriv API keys, algorithm strategy, and strict risk guardrails.
        </p>
      </div>

      {/* Grid Layout for Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          
          {/* Strategy Selection */}
          <div className="glass" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color="var(--cyan)" />
              Algorithmic Strategy
            </h2>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => config.updateConfig({ strategy: 'BOTH5' })}
                style={{
                  flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer',
                  border: config.strategy === 'BOTH5' ? '2px solid var(--cyan)' : '1px solid var(--border)',
                  background: config.strategy === 'BOTH5' ? 'rgba(0, 229, 255, 0.05)' : 'transparent',
                  color: config.strategy === 'BOTH5' ? '#fff' : 'var(--text-secondary)',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Over/Under 5</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hedges &gt;5 and &lt;5 digits simultaneously. Excludes 5.</div>
              </button>
              <button
                onClick={() => config.updateConfig({ strategy: 'BOTH' })}
                style={{
                  flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer',
                  border: config.strategy === 'BOTH' ? '2px solid var(--cyan)' : '1px solid var(--border)',
                  background: config.strategy === 'BOTH' ? 'rgba(0, 229, 255, 0.05)' : 'transparent',
                  color: config.strategy === 'BOTH' ? '#fff' : 'var(--text-secondary)',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Even/Odd</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hedges Even and Odd digits simultaneously.</div>
              </button>
            </div>
          </div>

          {/* Staking & Martingale */}
          <div className="glass" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <SlidersHorizontal size={18} color="var(--cyan)" />
              Staking Rules
            </h2>
            <SliderInput
              label="Base Stake" value={config.baseStake} unit="USD"
              onChange={(v) => config.updateConfig({ baseStake: v })}
              min={0.35} max={10} step={0.01}
            />

            {/* Martingale Recovery Toggle */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Martingale Recovery</span>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {config.recoveryEnabled ? 'Doubles stake after loss to recover' : 'Disabled — flat stake only'}
                  </div>
                </div>
                <button
                  onClick={() => config.updateConfig({ recoveryEnabled: !config.recoveryEnabled })}
                  style={{
                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: config.recoveryEnabled ? 'var(--cyan)' : 'rgba(255,255,255,0.1)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: config.recoveryEnabled ? 25 : 3,
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>

            {config.recoveryEnabled && (
              <SliderInput
                label="Martingale Multiplier" value={config.martMultiplier} unit="x"
                onChange={(v) => config.updateConfig({ martMultiplier: v })}
                min={1} max={3} step={0.1}
              />
            )}

            <SliderInput
              label="Trade Cooldown" value={(config.cooldownMs || 3000) / 1000} unit="sec"
              onChange={(v) => config.updateConfig({ cooldownMs: Math.round(v * 1000) })}
              min={1} max={10} step={0.5}
            />
            <SliderInput
              label="Min Signal Strength" value={config.minConfidence || 65} unit="%"
              onChange={(v) => config.updateConfig({ minConfidence: v })}
              min={50} max={85} step={1}
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          
          {/* Risk Management */}
          <div className="glass" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} color="var(--amber)" />
              Risk Guardrails
            </h2>
            <SliderInput
              label="Stop Loss (Session Limit)" value={config.stopLoss} unit="USD"
              onChange={(v) => config.updateConfig({ stopLoss: v })}
              min={1} max={500} step={1}
            />
            <SliderInput
              label="Take Profit (Session Target)" value={config.takeProfit} unit="USD"
              onChange={(v) => config.updateConfig({ takeProfit: v })}
              min={1} max={500} step={1}
            />
            <SliderInput
              label="Max Consecutive Losses" value={config.maxLossStreak} unit="Losses"
              onChange={(v) => config.updateConfig({ maxLossStreak: v })}
              min={1} max={10} step={1}
            />
          </div>

          {/* Account API Keys */}
          <div className="glass" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key size={18} color="var(--text-secondary)" />
              API & OAuth Management
            </h2>

            {/* App ID Config for OAuth */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Deriv App ID
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => {
                  const val = e.target.value;
                  setAppId(val);
                  localStorage.setItem('derivprinter_app_id', val.trim());
                }}
                placeholder="Default is 1089"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 13
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Required for OAuth. Use the default 1089 or register your App ID on the Deriv Developer portal.
              </span>
            </div>

            {/* OAuth Login Button */}
            <button
              type="button"
              onClick={() => {
                const currentAppId = localStorage.getItem('derivprinter_app_id') || '1089';
                window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${currentAppId}`;
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--cyan) 0%, #00b0ff 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                marginBottom: 24,
                boxShadow: '0 4px 15px rgba(0, 229, 255, 0.15)',
                transition: 'all 0.2s'
              }}
            >
              <Key size={16} /> Connect with Deriv OAuth
            </button>

            <div style={{ height: '1px', background: 'var(--border)', marginBottom: 20 }} />

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Manual API Tokens (Legacy / Direct)
            </div>

            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                type="text" value={newToken} onChange={(e) => setNewToken(e.target.value)}
                placeholder="Paste Deriv API Token..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '10px 14px', color: '#fff', fontSize: 13
                }}
              />
              <button type="submit" style={{
                background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: 600, fontSize: 13, cursor: 'pointer'
              }}>
                <Plus size={16} /> Add Key
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map(acc => {
                const isActive = activeAccountId === acc.id;
                const isDefault = acc.token === 'zC1SkSXgajB5ymD' || acc.token === 'pWGBoEP019BLM2F';
                return (
                  <div key={acc.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 8,
                    background: isActive ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.02)',
                    border: isActive ? '1px solid var(--cyan)' : '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="font-data" style={{ fontSize: 14, color: '#fff', letterSpacing: '1px' }}>
                        {acc.token.substring(0, 4)}•••••••••••
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {acc.loginid || 'Unverified'} {isDefault && '(Default)'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleCopy(acc.token)} style={{
                        background: 'transparent', border: 'none', padding: 6, borderRadius: 4, cursor: 'pointer',
                        color: copiedId === acc.token ? 'var(--emerald)' : 'var(--text-muted)'
                      }}>
                        {copiedId === acc.token ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <button onClick={() => removeAccount(acc.id)} style={{
                        background: 'transparent', border: 'none', padding: 6, borderRadius: 4, cursor: 'pointer',
                        color: 'var(--crimson)'
                      }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
