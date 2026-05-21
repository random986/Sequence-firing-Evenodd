/* ═══ Config Store (persisted to localStorage) ═══ */
import { create } from 'zustand';

const STORAGE_KEY = 'derivprinter_config';

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

const defaults = {
  strategy: 'BOTH5',          // 'BOTH5' (Over/Under) or 'BOTH' (Even/Odd)
  baseStake: 0.35,
  maxSteps: 6,
  martMultiplier: 2.0,
  recoveryEnabled: true,      // Martingale ON by default
  switchAfterLosses: 3,
  stopLoss: 0,
  takeProfit: 0,
  maxLossStreak: 0,
  cooldownMs: 1000,            // 1 second between trades
  minConfidence: 65,           // don't trade below this signal strength
  theme: 'dark',               // 'light' or 'dark'
  autoSwitchMarkets: true,     // Switch market after loss
};

const useConfigStore = create((set, get) => ({
  ...defaults,
  ...loadConfig(),

  update: (patch) => {
    set(patch);
    try {
      const state = get();
      const toSave = {};
      Object.keys(defaults).forEach(k => { toSave[k] = state[k]; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  },

  // Alias so UI components that call config.updateConfig() keep working
  updateConfig: (patch) => {
    const { update } = get();
    // update is bound via closure, call it directly
    set(patch);
    try {
      const state = get();
      const toSave = {};
      Object.keys(defaults).forEach(k => { toSave[k] = state[k]; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  },

  reset: () => {
    set(defaults);
    localStorage.removeItem(STORAGE_KEY);
  },
}));

export default useConfigStore;
