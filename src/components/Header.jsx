import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Printer, LayoutDashboard, Radar, History, Settings, Plus, LogIn } from 'lucide-react';
import useAccountStore from '../store/useAccountStore';
import useConnectionStore from '../store/useConnectionStore';
import useTradeStore from '../store/useTradeStore';
import derivWS from '../lib/derivWS';
import scanner, { MARKETS } from '../lib/marketScanner';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scanner', icon: Radar, label: 'Scanner' },
  { to: '/history', icon: History, label: 'History' },
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
  
  const isLoggedIn = accounts && accounts.length > 0;

  const handleLogin = () => {
    const appId = localStorage.getItem('derivprinter_app_id') || '1089';
    const redirectUri = encodeURIComponent(window.location.origin);
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${appId}&redirect_uri=${redirectUri}&affiliate_token=33h51PQlu5tsWflEmmoxW`;
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
    if (status === 'disconnected' && !botRunning) {
      const activeAcc = accounts.find(a => a.id === activeAccountId);
      if (activeAcc) {
        handleConnect(activeAcc);
      } else {
        const demoAcc = accounts.find(a => a.loginid?.startsWith('VRTC') || (!a.loginid && a.token === 'zC1SkSXgajB5ymD'));
        if (demoAcc) {
          handleConnect(demoAcc);
        }
      }
    }
  }, []); // Run once on mount

  // Derive Real/Demo accounts heuristics
  // CR loginid = Real, VRTC = Demo
  const demoAccounts = accounts.filter(a => a.loginid?.startsWith('VRTC') || (!a.loginid && a.token === 'zC1SkSXgajB5ymD'));
  const realAccounts = accounts.filter(a => a.loginid?.startsWith('CR') || (!a.loginid && a.token === 'pWGBoEP019BLM2F'));

  const currentAccounts = activeTab === 'demo' ? demoAccounts : realAccounts;
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const isDemoActive = activeAccount?.loginid?.startsWith('VRTC') || activeAccount?.token === 'zC1SkSXgajB5ymD';

  const totalAssets = currentAccounts.reduce((acc, a) => acc + (a.balance || 0), 0);

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
    derivWS.connect(account.token);
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
      height: 60,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 50
    }}>
      
      {/* Left: Logo and Nav Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, height: '100%' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--cyan) 0%, var(--bg-primary) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Printer size={16} color="#fff" />
          </div>
          <span className="font-display hidden md:block" style={{ fontSize: 18, fontWeight: 700 }}>Derivprinter</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 h-full ml-2 sm:ml-4">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 8px', height: '100%',
                color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 500,
                borderBottom: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
              })}
              title={label}
            >
              <Icon size={18} />
              <span className="hidden md:block" style={{ fontSize: 13 }}>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Right: Account & Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        
        {/* Connection Status Dot (Mobile only) */}
        <div className="md:hidden" style={{
          width: 8, height: 8, borderRadius: '50%',
          background: status === 'authorized' ? 'var(--cyan)' : 'var(--text-muted)'
        }} />

        {/* Account Dropdown Toggle */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          {isLoggedIn ? (
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {isDemoActive ? 'D' : 'R'}
                </span>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {isDemoActive ? 'Demo' : 'Real'}
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
                background: 'linear-gradient(135deg, var(--cyan) 0%, #00b0ff 100%)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0, 229, 255, 0.15)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <LogIn size={14} />
              Connect Deriv
            </button>
          )}

          {/* Dropdown Menu */}
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
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Deriv account</div>
                  <button
                  onClick={() => {
                    window.location.href = 'https://oauth.deriv.com/oauth2/authorize?app_id=33h51PQlu5tsWflEmmoxW';
                  }}
                    style={{
                      background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: 4,
                      padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s'
                    }}
                  >
                    <Plus size={12} /> Connect OAuth
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentAccounts.map(acc => {
                    const isCurrent = activeAccountId === acc.id;
                    return (
                      <div 
                        key={acc.id}
                        onClick={() => !isCurrent && handleConnect(acc)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px', borderRadius: 8,
                          background: isCurrent ? '#f3f4f6' : 'transparent',
                          border: isCurrent ? '1px solid #e5e7eb' : '1px solid transparent',
                          cursor: isCurrent ? 'default' : 'pointer',
                        }}
                        className={!isCurrent ? 'hover:bg-gray-50' : ''}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: '#9ca3af',
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
                              padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 4,
                              background: '#fff', fontSize: 12, fontWeight: 600, cursor: topupLoading ? 'wait' : 'pointer'
                            }}
                          >
                            {topupLoading ? 'Resetting...' : 'Reset balance'}
                          </button>
                        )}
                        {!isCurrent && (
                          <span style={{ fontSize: 14, fontWeight: 600 }}>
                            {acc.balance !== null ? `${acc.balance.toFixed(2)} ${acc.currency}` : '--'}
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
      
    </header>
  );
}
