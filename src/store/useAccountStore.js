import { create } from 'zustand';

const STORAGE_KEY = 'derivprinter_accounts';

// We strictly enforce only these two accounts exist if not modified by the user explicitly
const DEFAULT_ACCOUNTS = [
  { id: 'default_demo', token: 'zC1SkSXgajB5ymD', name: 'Demo Account', balance: null, currency: 'USD', loginid: 'VRTC_INIT' },
  { id: 'default_real', token: 'pWGBoEP019BLM2F', name: 'Real Account', balance: null, currency: 'USD', loginid: 'CR_INIT' }
];

function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      let parsed = JSON.parse(raw);
      
      // Cleanup Step: Remove any old default keys that were duplicated in earlier versions
      parsed = parsed.filter(a => a.token !== 'zC1SkSXgajB5ymD' && a.token !== 'pWGBoEP019BLM2F');
      
      // Re-inject strictly the 2 configured defaults
      const merged = [...DEFAULT_ACCOUNTS, ...parsed];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch {}
  
  // First time
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
  return DEFAULT_ACCOUNTS;
}

const useAccountStore = create((set, get) => ({
  accounts: loadAccounts(),
  activeAccountId: null,

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
      return { 
        accounts: newAccounts,
        activeAccountId: state.activeAccountId === id ? null : state.activeAccountId
      };
    });
  },

  setActiveAccountId: (id) => set({ activeAccountId: id }),

  updateAccountInfo: (id, info) => {
    set((state) => {
      const newAccounts = state.accounts.map(a => 
        a.id === id ? { ...a, ...info } : a
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
      return { accounts: newAccounts };
    });
  }
}));

export default useAccountStore;
