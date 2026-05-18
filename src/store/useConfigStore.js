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
  maxSteps: 7,
  martMultiplier: 2.0,
  recoveryEnabled: false,      // Martingale OFF by default — user turns on manually
  switchAfterLosses: 3,
  stopLoss: 5,
  takeProfit: 3,
  cooldownMs: 3000,            // 3 seconds between trades
  minConfidence: 65,           // don't trade below this signal strength
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
