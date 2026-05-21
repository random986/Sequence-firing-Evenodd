/* ═══ Trade Store ═══ */
import { create } from 'zustand';

const useTradeStore = create((set, get) => ({
  history: [],
  activeTrades: 0,
  botRunning: false,
  stopReason: null,
  sessionStats: { wins: 0, losses: 0, pnl: 0, trades: 0 },

  addOrUpdateTrade: (trade) => set((s) => {
    let stats = { ...s.sessionStats };
    const existingIndex = s.history.findIndex(t => t.id === trade.id);
    let newHistory = [...s.history];
    
    if (existingIndex >= 0) {
      // Update existing trade (settling a pending trade)
      const existing = newHistory[existingIndex];
      newHistory[existingIndex] = { ...existing, ...trade };
      
      // If it transitioned from pending to settled, update stats
      if (existing.pending && !trade.pending) {
        stats.trades += 1;
        stats.pnl += trade.profit;
        if (trade.won) stats.wins += 1;
        else stats.losses += 1;
      }
    } else {
      // Add new trade
      newHistory = [trade, ...newHistory].slice(0, 200);
      // If it's fully settled immediately (rare but possible), update stats
      if (!trade.pending) {
        stats.trades += 1;
        stats.pnl += trade.profit;
        if (trade.won) stats.wins += 1;
        else stats.losses += 1;
      }
    }
    
    return { history: newHistory, sessionStats: stats };
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
