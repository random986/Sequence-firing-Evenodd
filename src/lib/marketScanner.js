/* ══════════════════════════════════════════════════════════════
   DERIVPRINTER — Market Scanner
   Real-time analysis of all Deriv digit markets.
   Maintains 200-tick buffers and computes rankings.
   ══════════════════════════════════════════════════════════════ */

export const MARKETS = [
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
  '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
  'JD10', 'JD25', 'JD50', 'JD75', 'JD100'
];

export const MARKET_LABELS = {
  'R_10': 'V10', 'R_25': 'V25', 'R_50': 'V50', 'R_75': 'V75', 'R_100': 'V100',
  '1HZ10V': 'V10 1s', '1HZ25V': 'V25 1s', '1HZ50V': 'V50 1s',
  '1HZ75V': 'V75 1s', '1HZ100V': 'V100 1s',
  'JD10': 'J10', 'JD25': 'J25', 'JD50': 'J50',
  'JD75': 'J75', 'JD100': 'J100'
};

const BUFFER_SIZE = 200;
const ANALYSIS_WINDOW = 25;

/* ── Extract last digit from tick price using pip_size ── */
export function extractDigit(price, pipSize = 3) {
  const formatted = Number(price).toFixed(pipSize);
  return parseInt(formatted[formatted.length - 1], 10);
}

/* ── Market Scanner Class ── */
class MarketScanner {
  constructor() {
    this.buffers = {};     // symbol -> digit array
    this.scores = {};      // symbol -> analysis object
    this.pipSizes = {};    // symbol -> pip size
    this.tickCounts = {};  // symbol -> total ticks received
    this.onUpdate = null;  // callback when scores change
    MARKETS.forEach(sym => {
      this.buffers[sym] = [];
      this.scores[sym] = this._emptyScore();
      this.pipSizes[sym] = 3; // Default fallback
      this.tickCounts[sym] = 0;
    });
  }

  /* ── Ingest a tick ── */
  addTick(symbol, price, pipSize = null) {
    if (!this.buffers[symbol]) return;

    if (pipSize !== null) {
      this.pipSizes[symbol] = pipSize;
    }

    const digit = extractDigit(price, this.pipSizes[symbol]);
    const buf = this.buffers[symbol];
    buf.push(digit);
    if (buf.length > BUFFER_SIZE) buf.shift();
    
    this.tickCounts[symbol]++;

    // Recalculate scores for this market
    this.scores[symbol] = this._analyze(buf);

    if (this.onUpdate) this.onUpdate(symbol, this.scores);
  }

  /* ── Get ranked markets for a strategy ── */
  getRanked(strategy = 'BOTH5') {
    return MARKETS
      .map(sym => ({ symbol: sym, label: MARKET_LABELS[sym], ...this.scores[sym] }))
      .sort((a, b) => {
        if (strategy === 'BOTH5') {
          const maxA = Math.max(parseFloat(a.overPct) || 0, parseFloat(a.underPct) || 0);
          const maxB = Math.max(parseFloat(b.overPct) || 0, parseFloat(b.underPct) || 0);
          return maxB - maxA;
        }
        const maxA = Math.max(parseFloat(a.evenPct) || 0, parseFloat(a.oddPct) || 0);
        const maxB = Math.max(parseFloat(b.evenPct) || 0, parseFloat(b.oddPct) || 0);
        return maxB - maxA;
      });
  }

  /* ── Get best market for a strategy ── */
  getBest(strategy = 'BOTH5') {
    const ranked = this.getRanked(strategy);
    return ranked[0]?.symbol || MARKETS[0];
  }

  /* ── Analysis engine ── */
  _analyze(digits) {
    if (digits.length < 10) return this._emptyScore();

    const slice = digits.slice(-ANALYSIS_WINDOW);
    const full = digits.slice(-BUFFER_SIZE);

    // Over/Under 5 analysis
    let overCount = 0, underCount = 0, d5Count = 0;
    for (const d of slice) {
      if (d > 5) overCount++;
      else if (d < 5) underCount++;
      else d5Count++;
    }
    const overPct = (overCount / slice.length) * 100;
    const underPct = (underCount / slice.length) * 100;
    const d5Pct = (d5Count / slice.length) * 100;

    // Digit 5 penalty (baseline is 10%, penalize if > 15%)
    const d5Penalty = d5Pct > 15 ? (d5Pct - 15) * 2 : 0;
    const overUnderScore = Math.max(0, Math.max(overPct, underPct) - d5Penalty);

    // Even/Odd analysis
    let evenCount = 0, oddCount = 0;
    for (const d of slice) {
      if (d % 2 === 0) evenCount++;
      else oddCount++;
    }
    const evenPct = (evenCount / slice.length) * 100;
    const oddPct = (oddCount / slice.length) * 100;
    const balance = 100 - Math.abs(evenPct - oddPct);
    const evenOddScore = balance;

    // Streak analysis (from the end)
    let streak = 1;
    let streakType = null;
    if (slice.length >= 2) {
      const lastIsEven = slice[slice.length - 1] % 2 === 0;
      streakType = lastIsEven ? 'even' : 'odd';
      for (let i = slice.length - 2; i >= 0; i--) {
        if ((slice[i] % 2 === 0) === lastIsEven) streak++;
        else break;
      }
    }

    // Confidence calculation (200-tick history)
    let confidence = 50;
    if (full.length >= 50) {
      // Count how often the current streak-type continues
      let cont = 0, total = 0;
      for (let i = 1; i < full.length; i++) {
        const prev = full[i - 1] % 2 === 0;
        const curr = full[i] % 2 === 0;
        if (streakType === 'even' && prev) { total++; if (curr) cont++; }
        if (streakType === 'odd' && !prev) { total++; if (!curr) cont++; }
      }
      if (total > 0) confidence = (cont / total) * 100;
    }

    // Digit frequency distribution
    const freq = Array(10).fill(0);
    for (const d of slice) freq[d]++;

    return {
      overCount, underCount, d5Count,
      overPct: overPct.toFixed(1),
      underPct: underPct.toFixed(1),
      d5Pct: d5Pct.toFixed(1),
      overUnderScore: Math.round(overUnderScore),
      evenCount, oddCount,
      evenPct: evenPct.toFixed(1),
      oddPct: oddPct.toFixed(1),
      evenOddScore: Math.round(evenOddScore),
      streak, streakType,
      confidence: Math.round(confidence),
      freq,
      tickCount: digits.length,
      lastDigit: digits[digits.length - 1],
    };
  }

  _emptyScore() {
    return {
      overCount: 0, underCount: 0, d5Count: 0,
      overPct: '0.0', underPct: '0.0', d5Pct: '0.0',
      overUnderScore: 0,
      evenCount: 0, oddCount: 0,
      evenPct: '0.0', oddPct: '0.0',
      evenOddScore: 0,
      streak: 0, streakType: null,
      confidence: 50,
      freq: Array(10).fill(0),
      tickCount: 0,
      lastDigit: null,
    };
  }

  /* ── Reset all buffers ── */
  reset() {
    MARKETS.forEach(sym => {
      this.buffers[sym] = [];
      this.scores[sym] = this._emptyScore();
    });
  }
}

const scanner = new MarketScanner();
export default scanner;
