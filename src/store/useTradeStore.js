/* ═══ Trade Store ═══ */
import { create } from 'zustand';

const useTradeStore = create((set, get) => ({
  history: [],
  activeTrades: 0,
  botRunning: false,
  stopReason: null,
  sessionStats: { wins: 0, losses: 0, pnl: 0, trades: 0 },

  addTrade: (trade) => set((s) => {
    const history = [trade, ...s.history].slice(0, 200);
    const stats = { ...s.sessionStats };
    stats.trades += 1;
    stats.pnl += trade.profit;
    if (trade.won) stats.wins += 1;
    else stats.losses += 1;
    return { history, sessionStats: stats };
  }),

  setActiveTrades: (n) => set({ activeTrades: n }),
  setBotRunning: (running) => set({ botRunning: running, stopReason: running ? null : get().stopReason }),
  setStopReason: (reason) => set({ stopReason: reason, botRunning: false }),

  resetSession: () => set({
    history: [],
    activeTrades: 0,
    sessionStats: { wins: 0, losses: 0, pnl: 0, trades: 0 },
    stopReason: null,
  }),
}));

export default useTradeStore;
