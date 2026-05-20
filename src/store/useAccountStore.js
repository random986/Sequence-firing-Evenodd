import { create } from 'zustand';
import derivWS from '../lib/derivWS';
import useConnectionStore from './useConnectionStore';

const STORAGE_KEY = 'derivprinter_accounts';
const ACTIVE_STORAGE_KEY = 'derivprinter_active_account_id';

const DEFAULT_ACCOUNTS = [];

// Synchronous OAuth URL query parameter parser
function parseOAuthParams() {
  try {
    if (typeof window === 'undefined') return [];
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('acct1')) {
      const oauthAccounts = [];
      let i = 1;
      while (urlParams.has(`acct${i}`)) {
        const loginid = urlParams.get(`acct${i}`);
        const token = urlParams.get(`token${i}`);
        const currency = urlParams.get(`cur${i}`) || 'USD';
        if (token) {
          oauthAccounts.push({
            id: loginid,
            token,
            loginid,
            currency,
            name: loginid.startsWith('VRTC') ? 'Demo Account' : 'Real Account',
            balance: null
          });
        }
        i++;
      }
      return oauthAccounts;
    }
  } catch (e) {
    console.error('Failed to parse OAuth parameters:', e);
  }
  return [];
}

const oauthAccounts = parseOAuthParams();

function loadAccounts() {
  let accounts = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      accounts = JSON.parse(raw);
    }
  } catch {}
  
  if (accounts.length === 0) {
    accounts = [...DEFAULT_ACCOUNTS];
  }
  
  // Cleanup Step: Remove any old default keys that were duplicated in earlier versions
  accounts = accounts.filter(a => a.token !== 'zC1SkSXgajB5ymD' && a.token !== 'pWGBoEP019BLM2F');
  accounts = [...DEFAULT_ACCOUNTS, ...accounts];

  // Merge OAuth accounts
  if (oauthAccounts.length > 0) {
    oauthAccounts.forEach(newAcc => {
      const idx = accounts.findIndex(a => a.loginid === newAcc.loginid || a.token === newAcc.token);
      if (idx !== -1) {
        accounts[idx] = { ...accounts[idx], ...newAcc };
      } else {
        accounts.push(newAcc);
      }
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {}
  return accounts;
}

// Persist the active account ID if oauth accounts are parsed
let initialActiveId = null;
try {
  initialActiveId = localStorage.getItem(ACTIVE_STORAGE_KEY);
  if (oauthAccounts.length > 0) {
    initialActiveId = oauthAccounts[0].id;
    localStorage.setItem(ACTIVE_STORAGE_KEY, initialActiveId);
    
    // Clear URL query parameters so credentials are not exposed
    window.history.replaceState({}, document.title, window.location.pathname);
  }
} catch {}

const useAccountStore = create((set, get) => ({
  accounts: loadAccounts(),
  activeAccountId: initialActiveId,

  addAccount: (account) => {
    set((state) => {
      const newAccounts = [...state.accounts, { ...account, id: Date.now().toString() }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
      return { accounts: newAccounts };
    });
  },

  removeAccount: (id) => {
    set((state) => {
      const newAccounts = state.accounts.filter(a => a.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
      const nextActiveId = state.activeAccountId === id ? null : state.activeAccountId;
      if (nextActiveId) {
        localStorage.setItem(ACTIVE_STORAGE_KEY, nextActiveId);
      } else {
        localStorage.removeItem(ACTIVE_STORAGE_KEY);
      }
      return { 
        accounts: newAccounts,
        activeAccountId: nextActiveId
      };
    });
  },

  setActiveAccountId: (id) => {
    try {
      if (id) {
        localStorage.setItem(ACTIVE_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(ACTIVE_STORAGE_KEY);
      }
    } catch {}
    set({ activeAccountId: id });
  },

  updateAccountInfo: (id, info) => {
    set((state) => {
      const newAccounts = state.accounts.map(a => 
        a.id === id ? { ...a, ...info } : a
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
      return { accounts: newAccounts };
    });
  },

  addOAuthAccounts: (oauthAccounts) => {
    set((state) => {
      const existing = [...state.accounts];
      oauthAccounts.forEach(newAcc => {
        const idx = existing.findIndex(a => a.loginid === newAcc.loginid || a.token === newAcc.token);
        if (idx !== -1) {
          existing[idx] = { ...existing[idx], ...newAcc };
        } else {
          existing.push(newAcc);
        }
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      
      let newActiveId = state.activeAccountId;
      if (oauthAccounts.length > 0) {
        newActiveId = oauthAccounts[0].id;
        localStorage.setItem(ACTIVE_STORAGE_KEY, newActiveId);
      }
      return { accounts: existing, activeAccountId: newActiveId };
    });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_STORAGE_KEY);
    derivWS.disconnect();
    
    // Reset connection store state
    try {
      const connState = useConnectionStore.getState();
      if (connState) {
        connState.setAccount(null);
        connState.setStatus('disconnected');
      }
    } catch (e) {
      console.error('Failed to reset connection state:', e);
    }
    
    set({ accounts: [], activeAccountId: null });
  }
}));

export default useAccountStore;
