/* ═══════════════════════════════════════
   DERIVPRINTER — Trade Execution Engine
   Single-direction signal-based trading
   with optional Martingale recovery.
   ═══════════════════════════════════════ */

import derivWS from './derivWS.js';
import scanner from './marketScanner.js';
import riskManager from './riskManager.js';

const CONTRACT_MAP = {
  OVER5:  { contract_type: 'DIGITOVER',  barrier: '5' },
  UNDER5: { contract_type: 'DIGITUNDER', barrier: '5' },
  EVEN:   { contract_type: 'DIGITEVEN' },
  ODD:    { contract_type: 'DIGITODD' },
};

class TradeEngine {
  constructor() {
    this.running = false;
    this.state = {
      active: false,
      direction: null,
      step: 0,
      stake: 0.35,
      consecutiveLosses: 0,
      lastTradeTime: 0,
      contractId: null,
    };
    this.activeMarket = null;
    this.strategy = 'BOTH5';
    this.config = null;
    this.maxSafeDepth = 0;
    this.onTradeUpdate = null;
    this.onStatsUpdate = null;
    this.onBotStop = null;
    this.onMarketSwitch = null;
    this._pocHandler = null;
    this._cycleTimer = null;
  }

  /* ── Start the bot ── */
  start(config) {
    if (this.running) return;
    this.running = true;
    this.config = config;
    this.strategy = config.strategy || 'BOTH5';

    // Reset trade state
    this.state = {
      active: false,
      direction: null,
      step: 0,
      stake: config.baseStake,
      consecutiveLosses: 0,
      lastTradeTime: 0,
      contractId: null,
    };

    // Pick best market
    this.activeMarket = scanner.getBest(this.strategy);
    if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);

    // Calculate max safe Martingale depth for current balance
    const balance = derivWS.accountInfo?.balance || 0;
    this.maxSafeDepth = riskManager.getMaxSafeDepth(config, balance);

    // Start listening for contract results
    this._pocHandler = derivWS.on('proposal_open_contract', (msg) => this._handleContractUpdate(msg));

    // Start session
    riskManager.startSession(balance);
    this._executeCycle();
  }

  /* ── Stop the bot ── */
  stop(reason) {
    this.running = false;
    if (this._cycleTimer) { clearTimeout(this._cycleTimer); this._cycleTimer = null; }
    if (this._pocHandler) { this._pocHandler(); this._pocHandler = null; }
    if (this.onBotStop) this.onBotStop(reason || 'User stopped');
  }

  /* ── Execute a single-direction trade cycle ── */
  _executeCycle() {
    if (!this.running || !derivWS.isReady) return;

    // 1. If a trade is already active, wait for settlement
    if (this.state.active) return;

    // 2. Risk check
    const balance = derivWS.accountInfo?.balance || 0;
    const stopCheck = riskManager.shouldStop(this.config, balance);
    if (stopCheck.stop) { this.stop(stopCheck.reason); return; }

    // 3. Cooldown check
    const cooldownMs = this.config.cooldownMs || 3000;
    const elapsed = Date.now() - this.state.lastTradeTime;
    if (this.state.lastTradeTime > 0 && elapsed < cooldownMs) {
      this._scheduleNext(cooldownMs - elapsed + 100);
      return;
    }

    // 4. Get scanner scores for active market
    const scores = scanner.scores[this.activeMarket];
    if (!scores || scores.tickCount < 10) {
      this._scheduleNext(2000);
      return;
    }

    // 5. Pick ONE direction based on signal strength
    const minConf = this.config.minConfidence || 65;
    const overPct = parseFloat(scores.overPct) || 0;
    const underPct = parseFloat(scores.underPct) || 0;
    const evenPct = parseFloat(scores.evenPct) || 0;
    const oddPct = parseFloat(scores.oddPct) || 0;

    let chosenDirection = null;
    const isOverUnder = this.strategy === 'BOTH5' || this.strategy === 'OVER_UNDER';

    if (isOverUnder) {
      // Mean reversion: if digits are skewing >5, bet UNDER (expect reversion)
      if (overPct >= minConf) {
        chosenDirection = 'UNDER5';
      } else if (underPct >= minConf) {
        chosenDirection = 'OVER5';
      }
    } else {
      // Even/Odd mean reversion
      if (evenPct >= minConf) {
        chosenDirection = 'ODD';
      } else if (oddPct >= minConf) {
        chosenDirection = 'EVEN';
      }
    }

    // 6. No signal → do not trade, wait and recheck
    if (!chosenDirection) {
      this._scheduleNext(2000);
      return;
    }

    // 7. Calculate stake
    const stake = this.config.recoveryEnabled
      ? riskManager.calculateStake(this.config, this.state.step, balance)
      : this.config.baseStake;

    // Exposure safety check
    if (!riskManager.isExposureSafe(stake, balance)) {
      // Hard reset instead of blowing up
      this.state.step = 0;
      this.state.stake = this.config.baseStake;
      this._scheduleNext(2000);
      return;
    }

    // 8. Place single trade
    this._placeTrade(chosenDirection, this.activeMarket, stake);
  }

  /* ── Place a single trade ── */
  async _placeTrade(direction, market, stake) {
    const spec = CONTRACT_MAP[direction];
    if (!spec || this.state.active) return;

    const payload = {
      buy: '1',
      price: stake,
      parameters: {
        contract_type: spec.contract_type,
        symbol: market,
        duration: 1,
        duration_unit: 't',
        currency: derivWS.accountInfo?.currency || 'USD',
        basis: 'stake',
        amount: stake,
      },
    };
    if (spec.barrier) payload.parameters.barrier = spec.barrier;

    this.state.active = true;
    this.state.direction = direction;
    this.state.stake = stake;

    try {
      const res = await derivWS.send(payload);
      if (res.error) {
        console.error(`Trade error [${direction}]:`, res.error.message);
        this.state.active = false;
        this.state.direction = null;
        if (this.running) this._scheduleNext(2000);
        return;
      }

      if (res.buy) {
        this.state.contractId = res.buy.contract_id;
        // Subscribe to contract updates
        derivWS.sendRaw({ proposal_open_contract: 1, contract_id: this.state.contractId, subscribe: 1 });
      }
    } catch (e) {
      console.error(`Trade failed [${direction}]:`, e);
      this.state.active = false;
      this.state.direction = null;
      if (this.running) this._scheduleNext(2000);
    }
  }

  /* ── Handle contract settlement ── */
  _handleContractUpdate(msg) {
    const contract = msg.proposal_open_contract;
    if (!contract || !contract.is_sold) return;

    const cid = contract.contract_id;

    // Check if this contract belongs to our active trade
    if (this.state.contractId !== cid) return;

    const direction = this.state.direction;
    const won = contract.status === 'won';
    const profit = parseFloat(contract.profit) || 0;
    const buyPrice = parseFloat(contract.buy_price) || 0;

    // Build trade record
    const trade = {
      id: cid,
      direction,
      market: contract.underlying || this.activeMarket,
      stake: buyPrice,
      profit,
      won,
      exitTick: contract.exit_tick_display_value || contract.exit_tick || '',
      time: Date.now(),
    };

    // Update risk manager (P&L tracking only, per-direction losses are legacy)
    riskManager.recordResult(direction, won, profit);

    const cooldownMs = this.config.cooldownMs || 3000;

    if (won) {
      // WIN: reset Martingale chain completely
      console.log(`✅ WIN [${direction}] +$${profit.toFixed(2)} | Martingale reset to step 0`);
      this.state.step = 0;
      this.state.stake = this.config.baseStake;
      this.state.consecutiveLosses = 0;
    } else {
      // LOSS: Martingale step carries to NEXT trade (regardless of direction)
      this.state.consecutiveLosses++;

      if (this.config.recoveryEnabled) {
        // Step up — cap at 7, do NOT reset
        if (this.state.step < 7) {
          this.state.step++;
        }
        const balance = derivWS.accountInfo?.balance || 0;
        this.state.stake = riskManager.calculateStake(this.config, this.state.step, balance);
        console.log(`❌ LOSS [${direction}] $${profit.toFixed(2)} | Martingale step ${this.state.step}/7 → next trade at $${this.state.stake} (any direction)`);
      } else {
        // Recovery disabled — flat stake always
        console.log(`❌ LOSS [${direction}] $${profit.toFixed(2)} | No recovery (disabled)`);
        this.state.step = 0;
        this.state.stake = this.config.baseStake;
      }

      // Check if we should switch markets (uses global loss counter, not per-direction)
      if (this.state.consecutiveLosses >= (this.config.switchAfterLosses || 3)) {
        console.log(`🔄 Switching market after ${this.state.consecutiveLosses} consecutive losses`);
        this._switchMarket();
      }
    }

    // Mark trade as settled
    this.state.active = false;
    this.state.contractId = null;
    this.state.direction = null;
    this.state.lastTradeTime = Date.now();

    // Emit trade update to UI
    if (this.onTradeUpdate) this.onTradeUpdate(trade);

    // Schedule next cycle after cooldown
    if (this.running) this._scheduleNext(cooldownMs);
  }

  /* ── Switch to next best market ── */
  _switchMarket() {
    const ranked = scanner.getRanked(this.strategy);
    const next = ranked.find(m => m.symbol !== this.activeMarket);
    if (next) {
      this.activeMarket = next.symbol;
      // Reset loss counter but KEEP Martingale step — recovery continues on new market
      this.state.consecutiveLosses = 0;
      riskManager.consecutiveLosses = { OVER5: 0, UNDER5: 0, EVEN: 0, ODD: 0 };
      console.log(`🔄 Switched to ${next.symbol} | Martingale step preserved at ${this.state.step} ($${this.state.stake})`);
      if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
    }
  }

  /* ── Schedule next cycle ── */
  _scheduleNext(delayMs) {
    if (this._cycleTimer) clearTimeout(this._cycleTimer);
    this._cycleTimer = setTimeout(() => this._executeCycle(), delayMs);
  }

  /* ── Update config live ── */
  updateConfig(config) {
    this.config = config;
    // Recalculate safe depth if balance is available
    const balance = derivWS.accountInfo?.balance || 0;
    if (balance > 0) {
      this.maxSafeDepth = riskManager.getMaxSafeDepth(config, balance);
    }
  }
}

const tradeEngine = new TradeEngine();
export default tradeEngine;
