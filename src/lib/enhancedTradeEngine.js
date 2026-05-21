/* ═══════════════════════════════════════════════════════════════
   DERIVPRINTER — Enhanced Trade Execution Engine (Demo Mode)
   Sequence-firing Over/Under trading with streak protection,
   multiplier-based stake sizing, and live decision auditing.
   ═══════════════════════════════════════════════════════════════ */

import derivWS from './derivWS.js';
import scanner, { MARKETS, MARKET_LABELS } from './marketScanner.js';
import riskManager from './riskManager.js';
import copyTradeEngine from './copyTradeEngine.js';

const CONTRACT_MAP = {
  OVER5:  { contract_type: 'DIGITOVER',  barrier: '5' },
  UNDER5: { contract_type: 'DIGITUNDER', barrier: '5' },
  EVEN:   { contract_type: 'DIGITEVEN' },
  ODD:    { contract_type: 'DIGITODD' },
  DIFF:   { contract_type: 'DIGITDIFF' },
  MATCH:  { contract_type: 'DIGITMATCH' },
};

class EnhancedTradeEngine {
  constructor() {
    this.running = false;
    this.channels = {
      SINGLE: { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null, direction: null },
      OVER5:  { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      UNDER5: { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      EVEN:   { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      ODD:    { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
    };

    // --- Market Protection & Meta Scoring States ---
    this.marketStats = {};
    MARKETS.forEach(sym => {
      this.marketStats[sym] = {
        consecutiveLosses: 0,
        totalSessionLosses: 0,
        totalSessionWins: 0,
        metaScore: 0,
        quarantinedUntil: 0
      };
    });

    // --- Sizing and Protection Session States ---
    this.stakeMultiplier = 1.0;
    this.sessionOpeningBalance = 0;
    this.sessionConsecutiveLosses = 0;
    this.momentumTradesRemaining = 0;
    this.defensiveWins = 0;
    this.isDefensiveMode = false;

    // --- General Session Properties ---
    this.activeMarket = null;
    this.strategy = 'MATCHES';
    this.config = null;
    this.lastTradeTime = 0;
    this.nextAllowedTradeTime = 0;
    this.sessionTrades = []; // Accumulator for mathematical expectancy
    this.currentStatus = 'Idle';

    // Hook up configuration changes
    this._configUpdateListener = () => {
      const configStr = localStorage.getItem('derivprinter_config');
      if (configStr) {
        try {
          this.config = JSON.parse(configStr);
        } catch(e) {}
      }
    };
    window.addEventListener('storage', this._configUpdateListener);

    // --- Callbacks registered by UI ---
    this.onTradeUpdate = null;
    this.onBotStop = null;
    this.onMarketSwitch = null;
    this.onStatusChange = null;

    // --- Watchdogs and timers ---
    this._pocHandler = null;
    this._cycleTimer = null;

    // --- DIFF strategy original states ---
    this.currentAutoDigit = null;
    this.winsSinceDigitChange = 0;
    this.waitingForTargetDigit = false;
    this.pauseTicksRemaining = 0;

    // --- MATCH_DIFF strategy states ---
    this.matchDiffStakeStep = 0;
    this._restartTimer = null;

    // --- MATCHES strategy states ---
    this.matchesTargetDigit = null;
    this.matchesLastSwitchTime = 0;
  }

  // --- Real-Time Logger Interface ---
  async sendLog(message) {
    const formatted = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(formatted);
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: formatted }),
      });
    } catch (e) {
      // Fetch fails silently if server middleware is not active
    }
  }

  updateStatus(status) {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      if (this.onStatusChange) this.onStatusChange(status);
    }
  }

  setMarket(symbol) {
    if (!MARKETS.includes(symbol)) return;
    this.activeMarket = symbol;
    this.sendLog(`🎯 Manual Market Override: Switched to ${MARKET_LABELS[symbol] || symbol}`);
    this.setStatus(`Manually locked to ${MARKET_LABELS[symbol] || symbol}`);
    if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
    if (this.onStatusChange) this.onStatusChange(this.currentStatus, this.activeMarket);
  }

  start(config) {
    if (this.running) return;
    this.running = true;
    this.config = config;
    this.strategy = config.strategy || 'MATCHES';

    this.sendLog(`🚀 BOT STARTING — Mode: DEMO | Strategy: ${this.strategy} | Base Stake: $${config.baseStake.toFixed(2)}`);

    // Reset stats
    MARKETS.forEach(sym => {
      this.marketStats[sym] = {
        consecutiveLosses: 0,
        totalSessionLosses: 0,
        totalSessionWins: 0,
        metaScore: 0,
        quarantinedUntil: 0
      };
    });

    // Reset channels
    for (const key in this.channels) {
      this.channels[key] = {
        active: false,
        step: 0,
        consecutiveLosses: 0,
        stake: config.baseStake,
        contractId: null,
        direction: null
      };
    }

    this.stakeMultiplier = 1.0;
    this.sessionConsecutiveLosses = 0;
    this.momentumTradesRemaining = 0;
    this.defensiveWins = 0;
    this.isDefensiveMode = false;
    this.sessionTrades = [];
    this.lastTradeTime = 0;
    this.nextAllowedTradeTime = 0;

    // DIFF Strategy Resets
    this.currentAutoDigit = null;
    this.winsSinceDigitChange = 0;
    this.waitingForTargetDigit = false;
    this.pauseTicksRemaining = 0;

    // MATCH_DIFF Strategy Resets
    this.matchDiffStakeStep = 0;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }

    const balance = derivWS.accountInfo?.balance || 0;
    this.sessionOpeningBalance = balance;
    riskManager.startSession(balance);

    if (this.strategy === 'MATCHES') {
      this.matchesTargetDigit = null;
      this.matchesLastSwitchTime = 0;
      this.pauseTicksRemaining = 0;

      const best = this.getMatchesSniperTarget();
      if (best.market) {
        this.activeMarket = best.market;
        this.matchesTargetDigit = best.digit;
      } else {
        this.activeMarket = MARKETS[0];
      }
    } else if (this.strategy === 'MATCH_DIFF') {
      this.activeMarket = this.getMatchDiffMarket();
    } else {
      this.activeMarket = scanner.getBest(this.strategy, this.config?.diffTarget);
    }
    if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);

    this.sendLog(`🎯 Active Market Locked: ${MARKET_LABELS[this.activeMarket] || this.activeMarket} (Opening Balance: $${balance.toFixed(2)})`);

    this._pocHandler = derivWS.on('proposal_open_contract', (msg) => this._handleContractUpdate(msg));
    this._executeCycle();
  }

  stop(reason) {
    this.running = false;
    this.updateStatus('Idle');
    this.sendLog(`🛑 BOT STOPPED — Reason: ${reason || 'User stopped'}`);
    if (this._cycleTimer) { clearTimeout(this._cycleTimer); this._cycleTimer = null; }
    if (this._pocHandler) { this._pocHandler(); this._pocHandler = null; }

    // MATCH_DIFF Auto-Restart schedule
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (this.strategy === 'MATCH_DIFF' && reason && reason.includes('Hard Stop')) {
      this.sendLog(`⏳ Auto-restart scheduled in 5 minutes (300 seconds) for Matches/Differs...`);
      this._restartTimer = setTimeout(() => {
        this.sendLog(`🔄 Auto-restarting Matches/Differs bot strategy now...`);
        this.start(this.config);
      }, 300000); // 5 minutes
    }

    if (this.onBotStop) this.onBotStop(reason || 'User stopped');
  }

  // --- Active Market Router with Meta-Skins & Quarantine ---
  getActiveMarket() {
    const now = Date.now();
    const available = MARKETS.filter(sym => {
      const stats = this.marketStats[sym];
      return !stats.quarantinedUntil || stats.quarantinedUntil <= now;
    });

    if (available.length === 0) {
      // All are quarantined! Find the one expiring first
      let bestSym = MARKETS[0];
      let minExpire = this.marketStats[bestSym].quarantinedUntil || 0;
      for (const sym of MARKETS) {
        const expire = this.marketStats[sym].quarantinedUntil || 0;
        if (expire < minExpire) {
          minExpire = expire;
          bestSym = sym;
        }
      }
      return { market: bestSym, allQuarantined: true, expiresAt: minExpire };
    }

    // Sort by metaScore descending. If equal, sort by scanner overUnderScore descending.
    available.sort((a, b) => {
      const scoreA = this.marketStats[a].metaScore;
      const scoreB = this.marketStats[b].metaScore;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      const ouA = scanner.scores[a]?.overUnderScore || 0;
      const ouB = scanner.scores[b]?.overUnderScore || 0;
      return ouB - ouA;
    });

    return { market: available[0], allQuarantined: false };
  }

  getMatchDiffMarket() {
    const now = Date.now();
    // Filter allowed markets: Volatility 10, 25, 75
    const allowed = ['1HZ10V', '1HZ25V', '1HZ75V'];
    const available = allowed.filter(sym => {
      const stats = this.marketStats[sym] || {};
      return !stats.quarantinedUntil || stats.quarantinedUntil <= now;
    });

    if (available.length === 0) {
      // Find the one quarantine expiring first
      let bestSym = allowed[0];
      let minExpire = this.marketStats[bestSym]?.quarantinedUntil || 0;
      for (const sym of allowed) {
        const expire = this.marketStats[sym]?.quarantinedUntil || 0;
        if (expire < minExpire) {
          minExpire = expire;
          bestSym = sym;
        }
      }
      return bestSym;
    }

    // Default to the first available non-quarantined volatility market
    return available[0];
  }

  _switchMatchDiffMarket() {
    const current = this.activeMarket;
    const nextMarket = this.getMatchDiffMarket();
    if (nextMarket && nextMarket !== current) {
      this.activeMarket = nextMarket;
      if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
      this.sendLog(`🔄 Market Rotation: Switched active market to ${MARKET_LABELS[nextMarket] || nextMarket}`);
    }
  }

  getPhase(marketSym) {
    if (this.isDefensiveMode) return 'DEFENSIVE';
    const losses = this.marketStats[marketSym]?.consecutiveLosses || 0;
    if (losses === 2) return 'CAUTION';
    if (losses >= 3) return 'DEFENSIVE';
    return 'NORMAL';
  }

  // --- Mathematical Expectancy Calculator ---
  getExpectancy() {
    if (this.sessionTrades.length === 0) return 0.0;
    const wins = this.sessionTrades.filter(t => t.won);
    const losses = this.sessionTrades.filter(t => !t.won);
    const winRate = wins.length / this.sessionTrades.length;
    const lossRate = losses.length / this.sessionTrades.length;
    const avgWin = wins.length > 0 ? (wins.reduce((sum, t) => sum + t.profit, 0) / wins.length) : 0;
    const avgLoss = losses.length > 0 ? (losses.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losses.length) : 0;
    return (winRate * avgWin) - (lossRate * avgLoss);
  }

  _executeCycle() {
    if (!this.running) return;
    if (!derivWS.isReady) {
      this.updateStatus('Waiting for connection...');
      this._scheduleNext(3000);
      return;
    }

    // Stuck watchdog
    const now = Date.now();
    for (const key in this.channels) {
      const ch = this.channels[key];
      if (ch.active && ch.placedAt && (now - ch.placedAt > 30000)) {
        this.sendLog(`⚠️ Watchdog: Releasing stuck channel [${key}] after 30s`);
        ch.active = false;
        ch.contractId = null;
        if (key === 'SINGLE') ch.direction = null;
      }
    }

    // Session Hard Stops
    const balance = derivWS.accountInfo?.balance || 0;
    if (this.strategy === 'MATCH_DIFF') {
      if (this.sessionOpeningBalance > 0 && balance <= 0.8 * this.sessionOpeningBalance) {
        const lossPct = ((this.sessionOpeningBalance - balance) / this.sessionOpeningBalance) * 100;
        this.stop(`Hard Stop: Balance dropped ${lossPct.toFixed(1)}% below opening (Opening: $${this.sessionOpeningBalance.toFixed(2)}, Current: $${balance.toFixed(2)})`);
        return;
      }
      if (this.sessionConsecutiveLosses >= 3) {
        this.stop(`Hard Stop: 3 consecutive session losses.`);
        return;
      }
    } else if (this.strategy === 'MATCHES') {
      if (this.sessionOpeningBalance > 0 && balance <= 0.8 * this.sessionOpeningBalance) {
        const lossPct = ((this.sessionOpeningBalance - balance) / this.sessionOpeningBalance) * 100;
        this.stop(`Hard Stop: Balance dropped ${lossPct.toFixed(1)}% below opening (Opening: $${this.sessionOpeningBalance.toFixed(2)}, Current: $${balance.toFixed(2)})`);
        return;
      }
      if (this.sessionConsecutiveLosses >= 4) {
        this.stop(`Hard Stop: 4 consecutive session losses.`);
        return;
      }
      if (this.sessionTrades.length >= 50) {
        this.stop(`Hard Stop: Max trades limit (50) reached for session.`);
        return;
      }
    }

    // Cooldown check
    if (this.nextAllowedTradeTime && now < this.nextAllowedTradeTime) {
      const waitMs = this.nextAllowedTradeTime - now;
      this._scheduleNext(waitMs);
      return;
    }

    // Router for the specific strategy
    if (this.strategy === 'MATCH_DIFF') {
      this._executeMatchesDiffersCycle();
      return;
    }
    if (this.strategy === 'MATCHES') {
      this._executeMatchesSniperCycle();
      return;
    }
  }

  // --- MATCHES DIGIT SNIPER STRATEGY ---
  getHottestDigitForMarket(marketSym) {
    const ticks = scanner.buffers[marketSym]?.slice(-20);
    if (!ticks || ticks.length === 0) {
      return { digit: null, count: 0, score: 0 };
    }
    const total = ticks.length;
    const counts = Array(10).fill(0);
    for (const tick of ticks) {
      const d = parseInt(tick, 10);
      if (!isNaN(d) && d >= 0 && d <= 9) {
        counts[d]++;
      }
    }
    let maxCount = -1;
    let hottestDigit = null;
    for (let d = 0; d < 10; d++) {
      if (counts[d] > maxCount) {
        maxCount = counts[d];
        hottestDigit = d;
      }
    }
    const score = (maxCount / total) * 100;
    return { digit: hottestDigit, count: maxCount, score };
  }

  getMatchesSniperTarget() {
    let bestMarket = null;
    let bestDigit = null;
    let bestScore = -1;

    for (const sym of MARKETS) {
      // Quarantine check: skip quarantined markets
      const qUntil = this.marketStats[sym]?.quarantinedUntil || 0;
      if (qUntil > Date.now()) continue;

      const res = this.getHottestDigitForMarket(sym);
      if (res.score > bestScore) {
        bestScore = res.score;
        bestMarket = sym;
        bestDigit = res.digit;
      }
    }

    return { market: bestMarket, digit: bestDigit, score: bestScore };
  }

  _evaluateMatchesSniperMarket() {
    const currentMarket = this.activeMarket;
    const currentHottest = currentMarket ? this.getHottestDigitForMarket(currentMarket) : { digit: null, score: -1 };

    const best = this.getMatchesSniperTarget();

    if (!currentMarket) {
      if (best.market) {
        this.activeMarket = best.market;
        this.matchesTargetDigit = best.digit;
        const mStats = this.marketStats[best.market];
        if (mStats) mStats.consecutiveLosses = 0;
        this.sendLog(`🎯 MATCHES SNIPER Init: Selected ${MARKET_LABELS[best.market] || best.market} (Hottest Digit: ${best.digit}, Score: ${best.score.toFixed(0)}%)`);
      }
      return;
    }

    const currentScore = currentHottest.score;
    const scoreDiff = best.score - currentScore;

    const mStats = this.marketStats[currentMarket];
    const consecutiveLosses = mStats ? mStats.consecutiveLosses : 0;
    const hottestDigitChanged = currentHottest.digit !== this.matchesTargetDigit;

    let shouldSwitch = false;
    let reason = '';

    // Switch rule 1: Another market scores 10% higher than current market
    if (scoreDiff >= 10) {
      shouldSwitch = true;
      reason = `Another market (${MARKET_LABELS[best.market]} @ ${best.score.toFixed(0)}%) scores 10%+ higher than current (${MARKET_LABELS[currentMarket]} @ ${currentScore.toFixed(0)}%)`;
    }
    // Switch rule 2: Current market loses 2 consecutive MATCH trades
    else if (consecutiveLosses >= 2) {
      shouldSwitch = true;
      reason = `Current market (${MARKET_LABELS[currentMarket]}) lost 2 consecutive MATCH trades`;
    }
    // Switch rule 3: Hottest digit changes to a different digit
    else if (hottestDigitChanged) {
      shouldSwitch = true;
      reason = `Hottest digit of current market changed from ${this.matchesTargetDigit} to ${currentHottest.digit}`;
    }

    if (shouldSwitch && best.market && (best.market !== currentMarket || best.digit !== this.matchesTargetDigit)) {
      const oldMarket = currentMarket;
      this.activeMarket = best.market;
      this.matchesTargetDigit = best.digit;
      if (this.marketStats[oldMarket]) {
        this.marketStats[oldMarket].consecutiveLosses = 0;
      }
      if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
      this.sendLog(`🔄 MATCHES SNIPER Switch: ${reason}. Target: ${MARKET_LABELS[best.market]} (Digit: ${best.digit}, Score: ${best.score.toFixed(0)}%)`);
      this.matchesLastSwitchTime = Date.now();
    }
  }

  _executeMatchesSniperCycle() {
    const channel = this.channels.SINGLE;
    if (channel.active) {
      this.updateStatus('Polling settlement...');
      this._scheduleNext(1000);
      return;
    }

    // Skip 3 ticks after a loss cooldown
    if (this.pauseTicksRemaining > 0) {
      this.updateStatus(`Paused (${this.pauseTicksRemaining} ticks after loss)`);
      this.pauseTicksRemaining--;
      this._scheduleNext(1000);
      return;
    }

    // Evaluate market switching in real time
    this._evaluateMatchesSniperMarket();

    if (!this.activeMarket || this.matchesTargetDigit === null) {
      this.updateStatus('Scanning markets...');
      this._scheduleNext(1000);
      return;
    }

    const ticks = scanner.buffers[this.activeMarket]?.slice(-20);
    if (!ticks || ticks.length < 20) {
      this.updateStatus('Syncing ticks...');
      this._scheduleNext(1000);
      return;
    }

    // Entry condition: target digit appeared once (meaning it is the last tick's digit)
    const lastDigit = parseInt(ticks[ticks.length - 1], 10);
    if (lastDigit !== this.matchesTargetDigit) {
      this.updateStatus(`Waiting for digit ${this.matchesTargetDigit} on ${MARKET_LABELS[this.activeMarket]}`);
      this._scheduleNext(500); // Check again quickly on next tick/timer
      return;
    }

    // Stake sizing: base stake (minimum $0.35)
    const baseStake = this.config.baseStake || 0.35;

    this.sendLog(
      `🎯 [MATCHES SNIPER ENTRY] Market: ${MARKET_LABELS[this.activeMarket]} | ` +
      `Target Digit: ${this.matchesTargetDigit} appeared! Placing DIGITMATCH trade...`
    );

    this.updateStatus('Placing Match Trade');
    this._placeTrade('SINGLE', 'MATCH', baseStake, this.matchesTargetDigit.toString());
  }

  getMatchesSniperData() {
    return {
      activeMarket: this.activeMarket,
      targetDigit: this.matchesTargetDigit,
      lastSwitchTime: this.matchesLastSwitchTime,
      markets: MARKETS.map(sym => {
        const stats = this.getHottestDigitForMarket(sym);
        return {
          symbol: sym,
          label: MARKET_LABELS[sym] || sym,
          hottestDigit: stats.digit,
          frequency: stats.count,
          score: stats.score,
          status: sym === this.activeMarket ? 'ACTIVE' : (this.marketStats[sym]?.quarantinedUntil > Date.now() ? 'QUARANTINE' : 'SCANNING'),
        };
      })
    };
  }

  async _placeTrade(channelKey, direction, stake, dynamicBarrier = null) {
    const spec = CONTRACT_MAP[direction];
    if (!spec) return;

    const payload = {
      buy: 1,
      price: stake,
      parameters: {
        contract_type: spec.contract_type,
        underlying_symbol: this.activeMarket,
        duration: 1,
        duration_unit: 't',
        currency: derivWS.accountInfo?.currency || 'USD',
        basis: 'stake',
        amount: stake,
      },
    };
    if (dynamicBarrier) payload.parameters.barrier = dynamicBarrier;
    else if (spec.barrier) payload.parameters.barrier = spec.barrier;

    const channel = this.channels[channelKey];
    channel.active = true;
    channel.direction = direction;
    channel.stake = stake;
    channel.placedAt = Date.now();

    const balance = derivWS.accountInfo?.balance || 0;
    if (stake > balance) {
      this.sendLog(`🚨 Stake $${stake.toFixed(2)} exceeds balance $${balance.toFixed(2)}. Stop.`);
      channel.active = false;
      channel.direction = null;
      this.stop(`Insufficient balance for $${stake.toFixed(2)} stake.`);
      return;
    }

    try {
      const res = await derivWS.send(payload);
      if (res.error) {
        this.sendLog(`❌ Trade error [${direction}]: ${res.error.message}`);
        channel.active = false;
        channel.direction = null;
        this.stop(`Trade failed: ${res.error.message}`);
        return;
      }
      if (res.buy) {
        channel.contractId = res.buy.contract_id;
        this.sendLog(`✅ Triggered ${channelKey} ${direction} at $${stake.toFixed(2)} | Contract ID: ${channel.contractId}`);
        derivWS.sendRaw({ proposal_open_contract: 1, contract_id: channel.contractId, subscribe: 1 });
        
        // MIRROR TO DEMO IF COPYTRADE IS ACTIVE
        if (copyTradeEngine.active) {
          copyTradeEngine.copyTrade({
            contractType: spec.contract_type,
            symbol: this.activeMarket,
            amount: stake,
            duration: 1,
            durationUnit: 't',
            barrier: dynamicBarrier || spec.barrier
          });
        }
      }
    } catch (e) {
      this.sendLog(`⚠️ Connection drop, retrying trade in 3s...`);
      channel.active = false;
      channel.direction = null;
      if (this.running) this._scheduleNext(3000);
    }
  }

  _handleContractUpdate(msg) {
    const contract = msg.proposal_open_contract;
    if (!contract || !contract.is_sold) return;
    const cid = contract.contract_id;

    let channelKey = null;
    let channel = null;
    for (const key in this.channels) {
      if (this.channels[key].contractId === cid) {
        channelKey = key;
        channel = this.channels[key];
        break;
      }
    }

    if (!channel) return;

    const direction = channel.direction;
    const won = contract.status === 'won';
    const profit = parseFloat(contract.profit) || 0;
    const buyPrice = parseFloat(contract.buy_price) || 0;
    const market = contract.underlying || this.activeMarket;

    // Record results
    const mStats = this.marketStats[market];
    let justTriggeredDefensive = false;

    if (this.strategy === 'MATCHES') {
      if (won) {
        this.sessionConsecutiveLosses = 0;
        if (mStats) {
          mStats.totalSessionWins++;
          mStats.consecutiveLosses = 0;
        }
      } else {
        this.sessionConsecutiveLosses++;
        if (mStats) {
          mStats.totalSessionLosses++;
          mStats.consecutiveLosses++;
          if (mStats.consecutiveLosses >= 2) {
            mStats.quarantinedUntil = Date.now() + 90000; // 90 seconds quarantine
            this.sendLog(`⚠️ Market ${MARKET_LABELS[market] || market} quarantined for 90s after 2 consecutive losses.`);
          }
        }
        this.pauseTicksRemaining = 3; // Cooldown after loss: wait 3 ticks before next entry
        this.sendLog(`⏱️ Cooldown after loss: Pausing entry for next 3 ticks.`);
      }
      riskManager.recordResult(direction, won, profit);
    } else if (this.strategy === 'MATCH_DIFF') {
      if (won) {
        this.sessionConsecutiveLosses = 0;
        if (mStats) mStats.consecutiveLosses = 0;
        this.matchDiffStakeStep = 0; // Return to base stake
      } else {
        this.sessionConsecutiveLosses++;
        if (mStats) {
          mStats.consecutiveLosses++;
          // Market rotation: after 2 consecutive losses on a market -> switch market and quarantine for 90s
          if (mStats.consecutiveLosses >= 2) {
            mStats.quarantinedUntil = Date.now() + 90000; // 90 seconds quarantine
            mStats.consecutiveLosses = 0;
            this.sendLog(`⚠️ Market ${MARKET_LABELS[market] || market} quarantined for 90s due to 2 consecutive losses. Rotating...`);
            this._switchMatchDiffMarket();
          }
        }

        // Stake Progression (safe version: base -> 1.5x -> base)
        if (this.matchDiffStakeStep === 0) {
          this.matchDiffStakeStep = 1; // next stake = base * 1.5
        } else {
          this.matchDiffStakeStep = 0; // next stake = base
        }

        // Cooldown after loss: wait 3 ticks before next entry
        this.pauseTicksRemaining = 3;
        this.sendLog(`⏱️ Cooldown after loss: Pausing entry for next 3 ticks.`);
      }
      riskManager.recordResult(direction, won, profit);
    } else {
      // Legacy strategy statistics recording
      riskManager.recordResult(direction, won, profit);
    }

    const trade = {
      id: cid,
      direction,
      market,
      stake: buyPrice,
      profit,
      won,
      exitTick: contract.current_spot_display_value || contract.exit_tick_display_value || contract.sell_spot_display_value || contract.current_spot || contract.sell_spot || '',
      barrier: contract.barrier || '',
      time: Date.now(),
    };

    this.sessionTrades.push(trade);

    // Cooldown determination
    let cooldownMs = 2000;
    if (this.strategy === 'MATCHES') {
      cooldownMs = won ? 1500 : 2500;
    } else {
      if (!won) cooldownMs = 4000;
      if (justTriggeredDefensive) cooldownMs = 6000;
    }

    this.nextAllowedTradeTime = Date.now() + cooldownMs;
    this.lastTradeTime = Date.now();

    // Log the trade outcome
    const expectancy = this.getExpectancy();
    if (this.strategy === 'MATCHES') {
      this.sendLog(
        `💸 [MATCH SNIPER OUTCOME] Market: ${MARKET_LABELS[market]} | Result: ${won ? '✅ WIN' : '❌ LOSS'} (${won ? '+' : ''}$${profit.toFixed(2)}) | ` +
        `Target Digit: ${this.matchesTargetDigit} | Stake: $${buyPrice.toFixed(2)} | session P&L: $${this.sessionTrades.reduce((sum, t) => sum + t.profit, 0).toFixed(2)} | ` +
        `Expectancy: $${expectancy.toFixed(4)}`
      );
    } else {
      this.sendLog(
        `💸 [TRADE OUTCOME] Market: ${MARKET_LABELS[market]} | Result: ${won ? '✅ WIN' : '❌ LOSS'} (${won ? '+' : ''}$${profit.toFixed(2)}) | ` +
        `Stake: $${buyPrice.toFixed(2)} | Active Phase: ${this.getPhase(market)} | ` +
        `Stake Multiplier: ${this.stakeMultiplier.toFixed(2)}x | session P&L: $${this.sessionTrades.reduce((sum, t) => sum + t.profit, 0).toFixed(2)} | ` +
        `Mathematical Expectancy: $${expectancy.toFixed(4)}`
      );
    }

    channel.active = false;
    channel.contractId = null;
    if (channelKey === 'SINGLE') channel.direction = null;

    if (this.onTradeUpdate) this.onTradeUpdate(trade);

    // Strategy-specific legacy recovery switches
    if (this.strategy === 'DIFF') {
      if (!won) {
        this._switchMarketLegacy(direction);
        this.waitingForTargetDigit = true;
      } else {
        this.winsSinceDigitChange++;
        const marketUpgradeWins = this.config.diffWinsToChangeMarket || 15;
        if (this.winsSinceDigitChange >= marketUpgradeWins) {
          this._switchMarketLegacy(direction);
          this.winsSinceDigitChange = 0;
          this.currentAutoDigit = null;
        }
      }
    } else if (this.strategy !== 'MATCHES' && !won) {
      if (this.channels[channelKey].consecutiveLosses >= (this.config.switchAfterLosses || 6)) {
        this._switchMarketLegacy(direction);
      }
    }

    if (this.running) this._scheduleNext(cooldownMs);
  }

  // --- Legacy strategy execution loop for backward compatibility ---
  _executeLegacyCycle() {
    const scores = scanner.scores[this.activeMarket];
    if (!scores || scores.tickCount < 10) {
      this.updateStatus('Waiting for market data...');
      this._scheduleNext(2000);
      return;
    }

    const isDual = this.strategy === 'OU_WINNING' || this.strategy === 'EO_WINNING';

    if (!isDual) {
      const channel = this.channels.SINGLE;
      if (channel.active) {
        this.updateStatus('Polling settlement...');
        this._scheduleNext(1500);
        return;
      }

      if (this.strategy === 'DIFF') {
        const userDigit = this.config.diffTarget;
        const targetDigit = (!userDigit || userDigit === 'AUTO') ? this.currentAutoDigit : userDigit;

        if (this.waitingForTargetDigit && targetDigit != null) {
          this.updateStatus(`Waiting for digit ${targetDigit}...`);
          const lastDigit = scores.lastDigit;
          if (lastDigit === parseInt(targetDigit, 10)) {
            this.waitingForTargetDigit = false;
            this.pauseTicksRemaining = 2;
          } else {
            this._scheduleNext(1000);
            return;
          }
        }

        if (this.pauseTicksRemaining > 0) {
          this.updateStatus(`Paused (${this.pauseTicksRemaining} ticks)`);
          this.pauseTicksRemaining--;
          this._scheduleNext(1500);
          return;
        }

        let finalTarget;
        if (!userDigit || userDigit === 'AUTO') {
          const winsThreshold = this.config.diffWinsToChangeDigit || 5;
          if (this.currentAutoDigit === null || this.winsSinceDigitChange >= winsThreshold) {
            const indexed = scores.freq.map((f, d) => ({ digit: d, freq: f }));
            indexed.sort((a, b) => a.freq - b.freq);
            this.currentAutoDigit = (indexed.length >= 2 ? indexed[1] : indexed[0]).digit.toString();
            this.winsSinceDigitChange = 0;
          }
          finalTarget = this.currentAutoDigit;
        } else {
          finalTarget = userDigit;
        }

        this.updateStatus('Executing');
        this._placeTrade('SINGLE', 'DIFF', this.config.baseStake, finalTarget.toString());
        return;
      }

      // Even/Odd or other legacy
      const minConf = this.config.minConfidence || 65;
      const evenPct = parseFloat(scores.evenPct) || 0;
      const oddPct = parseFloat(scores.oddPct) || 0;

      let chosenDirection = null;
      let dominantPct = Math.max(evenPct, oddPct);
      let dominantDir = evenPct > oddPct ? 'EVEN' : 'ODD';
      let weakerDir = evenPct > oddPct ? 'ODD' : 'EVEN';

      chosenDirection = this.config.tradeLogic === 'momentum' ? dominantDir : weakerDir;

      if (dominantPct < minConf) {
        this.updateStatus(`Waiting for signal strength (${dominantPct.toFixed(0)}% < ${minConf}%)`);
        this._scheduleNext(1000);
        return;
      }

      this.updateStatus('Executing');
      this._placeTrade('SINGLE', chosenDirection, this.config.baseStake);
    } else {
      const dirs = ['EVEN', 'ODD', 'OVER5', 'UNDER5'];
      let tradesPlaced = 0;
      this.updateStatus('Executing');
      dirs.forEach(dir => {
        const channel = this.channels[dir];
        if (!channel.active) {
          this._placeTrade(dir, dir, this.config.baseStake);
          tradesPlaced++;
        }
      });

      if (tradesPlaced === 0) {
        this._scheduleNext(1500);
      }
    }
  }

  _switchMarketLegacy(lastDirection) {
    if (this.config && this.config.autoSwitchMarkets === false) {
      this.sendLog(`ℹ️ Auto-switch disabled. Remaining on ${MARKET_LABELS[this.activeMarket] || this.activeMarket}`);
      return;
    }

    const switchStrategy = this.config.switchStrategy || 'best_score';
    let ranked;

    if (switchStrategy === 'streak_reversion' && lastDirection) {
      ranked = scanner.getStreakRanked(lastDirection);
      const best = ranked.find(m => m.symbol !== this.activeMarket && m.streakLen >= 2);
      if (best) {
        this.activeMarket = best.symbol;
        if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
        return;
      }
    }

    ranked = scanner.getRanked(this.strategy, this.config?.diffTarget);
    const next = ranked.find(m => m.symbol !== this.activeMarket);
    if (next) {
      this.activeMarket = next.symbol;
      if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
    }
  }

  _executeMatchesDiffersCycle() {
    const channel = this.channels.SINGLE;
    if (channel.active) {
      this.updateStatus('Polling settlement...');
      this._scheduleNext(1500);
      return;
    }

    // Filter 2 — Cooldown after loss (wait 3 ticks before next entry)
    if (this.pauseTicksRemaining > 0) {
      this.updateStatus(`Paused (${this.pauseTicksRemaining} ticks after loss)`);
      this.pauseTicksRemaining--;
      this._scheduleNext(1500);
      return;
    }

    const ticks = scanner.buffers[this.activeMarket]?.slice(-5);
    if (!ticks || ticks.length < 5) {
      this.updateStatus('Waiting for tick data (need 5)...');
      this._scheduleNext(1000);
      return;
    }

    // Filter 1 — Repeat cluster check: If same digit appeared 3+ times in last 5 ticks -> skip
    const counts = {};
    for (const d of ticks) {
      counts[d] = (counts[d] || 0) + 1;
    }
    const hasCluster = Object.values(counts).some(c => c >= 3);
    if (hasCluster) {
      this.updateStatus('Skip: Digit cluster');
      this.sendLog(`⚠️ Skip entry: Same digit appeared 3+ times in last 5 ticks (${ticks.slice(-5).join(', ')}). Waiting for cluster to break.`);
      this._scheduleNext(1500);
      return;
    }

    // Barrier is the last digit of the previous tick
    const previousDigit = ticks[ticks.length - 1];

    // Stake sizing: base stake vs 1.5x recovery
    const baseStake = this.config.baseStake || 0.35;
    const actualStake = this.matchDiffStakeStep === 1 ? baseStake * 1.5 : baseStake;

    this.sendLog(
      `🔍 [MATCH_DIFF EVALUATION] Market: ${MARKET_LABELS[this.activeMarket] || this.activeMarket} | ` +
      `Ticks: ${ticks.join(', ')} | Skip Check: Passed | ` +
      `Previous Digit (Barrier): ${previousDigit} | Phase: MATCH_DIFF | ` +
      `Stake: $${actualStake.toFixed(2)} (${this.matchDiffStakeStep === 1 ? '1.5x recovery' : 'base stake'})`
    );

    this.updateStatus('Executing Matches/Differs');
    this._placeTrade('SINGLE', 'DIFF', actualStake, previousDigit.toString());
  }

  _scheduleNext(delayMs) {
    if (this._cycleTimer) clearTimeout(this._cycleTimer);
    this._cycleTimer = setTimeout(() => this._executeCycle(), delayMs);
  }

  updateConfig(config) {
    this.config = config;
  }
}

const enhancedTradeEngine = new EnhancedTradeEngine();
export default enhancedTradeEngine;
