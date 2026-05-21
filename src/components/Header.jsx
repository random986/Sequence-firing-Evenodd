import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Printer, LayoutDashboard, Radar, History, Settings, Plus, LogIn, Moon, Sun, Copy } from 'lucide-react';
import useAccountStore from '../store/useAccountStore';
import useConnectionStore from '../store/useConnectionStore';
import useTradeStore from '../store/useTradeStore';
import useConfigStore from '../store/useConfigStore';
import derivWS from '../lib/derivWS';
import scanner, { MARKETS } from '../lib/marketScanner';
import { generatePKCE } from '../lib/pkce';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scanner', icon: Radar, label: 'Scanner' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/copytrade', icon: Copy, label: 'Copytrade' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('demo'); // 'real' or 'demo'
  const [topupLoading, setTopupLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const dropdownRef = useRef(null);

  const accounts = useAccountStore(s => s.accounts);
  const activeAccountId = useAccountStore(s => s.activeAccountId);
  const setActiveAccountId = useAccountStore(s => s.setActiveAccountId);
  const updateAccountInfo = useAccountStore(s => s.updateAccountInfo);
  const logout = useAccountStore(s => s.logout);
  
  const status = useConnectionStore(s => s.status);
  const setStatus = useConnectionStore(s => s.setStatus);
  const setAccount = useConnectionStore(s => s.setAccount);
  const accountInfo = useConnectionStore(s => s.account);
  
  const botRunning = useTradeStore(s => s.botRunning);
  
  const theme = useConfigStore(s => s.theme);
  const updateConfig = useConfigStore(s => s.updateConfig);
  
  const isLoggedIn = accounts && accounts.length > 0;

  const handleLogin = async () => {
    try {
      const { codeVerifier, codeChallenge, state } = await generatePKCE();
      sessionStorage.setItem('oauth_code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: '33h51PQlu5tsWflEmmoxW',
        redirect_uri: 'https://derivprinter.beexelgraphics.com',
        scope: 'trade',
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

      window.location.href = `https://auth.deriv.com/oauth2/auth?${params.toString()}`;
    } catch (err) {
      console.error('Failed to initiate login:', err);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  // Auto-connect to active account on first load
  useEffect(() => {
    if (status === 'disconnected' && !botRunning && accounts.length > 0) {
      const activeAcc = accounts.find(a => a.id === activeAccountId);
      if (activeAcc) {
        handleConnect(activeAcc);
      } else {
        const demoAcc = accounts.find(a => a.is_virtual || a.loginid?.startsWith('VR'));
        if (demoAcc) {
          handleConnect(demoAcc);
        }
      }
    }
  }, [accounts, activeAccountId, status, botRunning]); // Run on mount or when accounts load

  // Derive Real/Demo accounts heuristics
  const demoAccounts = accounts.filter(a => a.is_virtual || a.loginid?.startsWith('VR'));
  const realAccounts = accounts.filter(a => !a.is_virtual && !a.loginid?.startsWith('VR'));

  const currentAccounts = activeTab === 'demo' ? demoAccounts : realAccounts;
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const isDemoActive = activeAccount?.is_virtual || activeAccount?.loginid?.startsWith('VR');

  const totalAssets = currentAccounts.reduce((acc, a) => acc + (typeof a.balance === 'number' ? a.balance : 0), 0);

  const fetchBalances = async () => {
    if (!accounts.length || !accounts[0].token) return;
    try {
      const response = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
        headers: {
          'Deriv-App-ID': '33h51PQlu5tsWflEmmoxW',
          'Authorization': `Bearer ${accounts[0].token}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        const apiAccounts = result.data || result.accounts || [];
        apiAccounts.forEach(apiAcc => {
          const localAcc = useAccountStore.getState().accounts.find(a => a.loginid === apiAcc.account_id);
          if (localAcc && typeof apiAcc.balance === 'number') {
            updateAccountInfo(localAcc.id, { balance: apiAcc.balance, currency: apiAcc.currency });
          }
        });
      }
    } catch (err) {
      console.error('Failed to fetch background balances', err);
    }
  };

  useEffect(() => {
    if (dropdownOpen) {
      fetchBalances();
    }
  }, [dropdownOpen]);

  const handleConnect = (account) => {
    if (botRunning || status === 'connecting') return;
    setDropdownOpen(false);
    derivWS.disconnect();
    setActiveAccountId(account.id);
    
    derivWS.onStatusChange = (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'authorized') {
        MARKETS.forEach(sym => derivWS.subscribeTicks(sym));
        derivWS.on('tick', (msg) => {
          if (msg.tick) scanner.addTick(msg.tick.symbol, msg.tick.quote);
        });
      }
    };
    derivWS.onAccountUpdate = (info) => {
      setAccount(info);
      updateAccountInfo(account.id, {
        balance: info.balance, currency: info.currency,
        loginid: info.loginid
      });
    };
    derivWS.connect(account.token, account.loginid);
  };

  const handleTopup = async () => {
    if (topupLoading || !isDemoActive) return;
    setTopupLoading(true);
    try {
      await derivWS.send({ topup_virtual: 1 });
    } catch (e) {
      console.error(e);
    }
    setTopupLoading(false);
  };

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      padding: '0 16px',
    }}>
      
      {/* Row 1: Logo + Account Info */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: 70, 
      }}>
        
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <img src="/logo.png" alt="Derivprinter Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Derivprinter</span>
        </div>

        {/* Right Side: Theme + Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          
          {/* Connection Status Dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status === 'authorized' ? 'var(--cyan)' : 'var(--text-muted)'
          }} />

          {/* Theme Toggle */}
          <button
            onClick={() => updateConfig({ theme: theme === 'dark' ? 'light' : 'dark' })}
            title="Toggle Theme"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', padding: '4px'
            }}
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          {/* Account Dropdown Toggle */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            {isLoggedIn ? (
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 8
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {isDemoActive ? 'D' : 'R'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                      {accountInfo?.loginid || (isDemoActive ? 'Demo' : 'Real')}
                    </span>
                    <ChevronDown size={14} color="var(--text-primary)" />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>
                    {accountInfo?.balance ? accountInfo.balance.toFixed(2) : '0.00'} {accountInfo?.currency || 'USD'}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                style={{
                  background: 'linear-gradient(135deg, var(--cyan) 0%, #ff6b74 100%)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '8px 16px', fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <LogIn size={14} />
                Connect Deriv
              </button>
            )}

            {/* Desktop Dropdown Menu */}
            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 8,
                width: 320, background: '#ffffff', borderRadius: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden',
                color: '#333333'
              }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                  <button 
                    onClick={() => setActiveTab('real')}
                    style={{
                      flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      borderBottom: activeTab === 'real' ? '2px solid var(--crimson)' : '2px solid transparent',
                      color: activeTab === 'real' ? '#333' : '#999'
                    }}
                  >Real</button>
                  <button 
                    onClick={() => setActiveTab('demo')}
                    style={{
                      flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer',
                      borderBottom: activeTab === 'demo' ? '2px solid var(--crimson)' : '2px solid transparent',
                      color: activeTab === 'demo' ? '#333' : '#999'
                    }}
                  >Demo</button>
                </div>

                {/* Account List */}
                <div style={{ padding: '16px', maxHeight: 400, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Deriv account</div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {currentAccounts.map(acc => {
                      const isCurrent = activeAccountId === acc.id;
                      return (
                        <div 
                          key={acc.id}
                          onClick={() => { if(!isCurrent) { handleConnect(acc); setDropdownOpen(false); } }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px', borderRadius: 8,
                            background: isCurrent ? '#f3f4f6' : 'transparent',
                            border: isCurrent ? '1px solid #e5e7eb' : '1px solid transparent',
                            cursor: isCurrent ? 'default' : 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%', background: '#9ca3af',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700
                            }}>
                              {activeTab === 'demo' ? 'D' : 'R'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>
                                {activeTab === 'demo' ? 'Demo' : 'Real'}
                              </span>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>{acc.loginid || 'No ID'}</span>
                            </div>
                          </div>
                          
                          {isCurrent && activeTab === 'demo' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleTopup(); }}
                              disabled={topupLoading}
                              style={{
                                padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 4,
                                background: '#fff', fontSize: 12, fontWeight: 600, cursor: topupLoading ? 'wait' : 'pointer'
                              }}
                            >
                              {topupLoading ? 'Resetting...' : 'Reset balance'}
                            </button>
                          )}
                          {!isCurrent && (
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                              {typeof acc.balance === 'number' ? `${acc.balance.toFixed(2)} ${acc.currency}` : '--'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Assets */}
                  <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Total assets</span>
                      <span style={{ fontSize: 14 }}>{totalAssets.toFixed(2)} USD</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                      Total assets in your Deriv accounts.
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => { setDropdownOpen(false); logout(); }}
                  style={{
                    width: '100%', padding: '12px 0', border: 'none', background: 'rgba(255, 68, 79, 0.05)',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    color: 'var(--crimson)', borderTop: '1px solid #e5e7eb',
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}
                >
                  Log Out / Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Navigation */}
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 50, width: '100%', overflowX: 'auto',
        borderTop: '1px solid var(--border)',
      }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 10px', height: '100%',
              color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 500,
              borderBottom: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              fontSize: 13,
            })}
            title={label}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      
    </header>
  );
}
