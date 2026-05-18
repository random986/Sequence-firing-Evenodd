/* ═══ Connection Store ═══ */
import { create } from 'zustand';

const useConnectionStore = create((set) => ({
  status: 'disconnected',
  account: null,
  balance: 0,
  currency: 'USD',
  activeMarket: null,

  setStatus: (status) => set({ status }),
  setAccount: (account) => set({
    account,
    balance: account?.balance || 0,
    currency: account?.currency || 'USD',
  }),
  setBalance: (balance) => set({ balance }),
  setActiveMarket: (market) => set({ activeMarket: market }),
}));

export default useConnectionStore;
