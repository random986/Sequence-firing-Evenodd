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
    this.channels = {
      SINGLE: { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null, direction: null },
      OVER5:  { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      UNDER5: { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      EVEN:   { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
      ODD:    { active: false, step: 0, consecutiveLosses: 0, stake: 0.35, contractId: null },
    };
    this.globalConsecutiveLosses = 0; // For market switching
    this.lastTradeTime = 0;
    this.activeMarket = null;
    this.strategy = 'BOTH5';
    this.config = null;
    this.onTradeUpdate = null;
    this.onBotStop = null;
    this.onMarketSwitch = null;
    this._pocHandler = null;
    this._cycleTimer = null;
  }

  start(config) {
    if (this.running) return;
    this.running = true;
    this.config = config;
    this.strategy = config.strategy || 'BOTH5';

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
    this.globalConsecutiveLosses = 0;
    this.lastTradeTime = 0;

    this.activeMarket = scanner.getBest(this.strategy);
    if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);

    this._pocHandler = derivWS.on('proposal_open_contract', (msg) => this._handleContractUpdate(msg));

    const balance = derivWS.accountInfo?.balance || 0;
    riskManager.startSession(balance);
    this._executeCycle();
  }

  stop(reason) {
    this.running = false;
    if (this._cycleTimer) { clearTimeout(this._cycleTimer); this._cycleTimer = null; }
    if (this._pocHandler) { this._pocHandler(); this._pocHandler = null; }
    if (this.onBotStop) this.onBotStop(reason || 'User stopped');
  }

  _executeCycle() {
    if (!this.running || !derivWS.isReady) return;

    const balance = derivWS.accountInfo?.balance || 0;
    const stopCheck = riskManager.shouldStop(this.config, balance);
    if (stopCheck.stop) { this.stop(stopCheck.reason); return; }

    const cooldownMs = this.config.cooldownMs || 1000;
    const elapsed = Date.now() - this.lastTradeTime;
    if (this.lastTradeTime > 0 && elapsed < cooldownMs) {
      this._scheduleNext(cooldownMs - elapsed + 100);
      return;
    }

    const scores = scanner.scores[this.activeMarket];
    if (!scores || scores.tickCount < 10) {
      this._scheduleNext(2000);
      return;
    }

    const isDual = this.strategy === 'OU_WINNING' || this.strategy === 'EO_WINNING';

    if (!isDual) {
      // --- SINGLE DIRECTION STRATEGIES ---
      if (this.channels.SINGLE.active) return; // Wait for settlement

      const minConf = this.config.minConfidence || 65;
      const overPct = parseFloat(scores.overPct) || 0;
      const underPct = parseFloat(scores.underPct) || 0;
      const evenPct = parseFloat(scores.evenPct) || 0;
      const oddPct = parseFloat(scores.oddPct) || 0;

      let chosenDirection = null;
      if (this.strategy === 'BOTH5' || this.strategy === 'OVER_UNDER') {
        // Mean reversion: bet against the highest occurring digits
        chosenDirection = overPct > underPct ? 'UNDER5' : 'OVER5';
      } else {
        chosenDirection = evenPct > oddPct ? 'ODD' : 'EVEN';
      }

      if (!chosenDirection) {
        this._scheduleNext(2000);
        return;
      }

      this._placeTrade('SINGLE', chosenDirection, this.channels.SINGLE.stake);

    } else {
      // --- DUAL DIRECTION STRATEGIES ---
      const dirs = this.strategy === 'OU_WINNING' ? ['OVER5', 'UNDER5'] : ['EVEN', 'ODD'];
      let tradesPlaced = 0;
      
      dirs.forEach(dir => {
        const channel = this.channels[dir];
        if (!channel.active) {
          this._placeTrade(dir, dir, channel.stake);
          tradesPlaced++;
        }
      });

      if (tradesPlaced === 0) {
        // Both channels are currently active, wait for settlement
        return;
      }
    }
  }

  async _placeTrade(channelKey, direction, stake) {
    const spec = CONTRACT_MAP[direction];
    if (!spec) return;

    const payload = {
      buy: '1',
      price: stake,
      parameters: {
        contract_type: spec.contract_type,
        symbol: this.activeMarket,
        duration: 1,
        duration_unit: 't',
        currency: derivWS.accountInfo?.currency || 'USD',
        basis: 'stake',
        amount: stake,
      },
    };
    if (spec.barrier) payload.parameters.barrier = spec.barrier;

    const channel = this.channels[channelKey];
    channel.active = true;
    channel.direction = direction;
    channel.stake = stake;

    try {
      const res = await derivWS.send(payload);
      if (res.error) {
        console.error(`Trade error [${direction}]:`, res.error.message);
        channel.active = false;
        channel.direction = null;
        if (this.running) this._scheduleNext(2000);
        return;
      }

      if (res.buy) {
        channel.contractId = res.buy.contract_id;
        derivWS.sendRaw({ proposal_open_contract: 1, contract_id: channel.contractId, subscribe: 1 });
      }
    } catch (e) {
      console.error(`Trade failed [${direction}]:`, e);
      channel.active = false;
      channel.direction = null;
      if (this.running) this._scheduleNext(2000);
    }
  }

  _handleContractUpdate(msg) {
    const contract = msg.proposal_open_contract;
    if (!contract || !contract.is_sold) return;
    const cid = contract.contract_id;

    // Find which channel this contract belongs to
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

    riskManager.recordResult(direction, won, profit);
    const maxSteps = this.config.maxSteps || 6;

    if (won) {
      console.log(`✅ WIN [${direction}] +$${profit.toFixed(2)} | Resetting stake`);
      channel.step = 0;
      channel.stake = this.config.baseStake;
      channel.consecutiveLosses = 0;
      this.globalConsecutiveLosses = 0;
    } else {
      channel.consecutiveLosses++;
      this.globalConsecutiveLosses++;

      if (this.config.recoveryEnabled) {
        if (channel.step < maxSteps) {
          channel.step++;
          channel.stake = riskManager.calculateStake(this.config, channel.step, 0);
          console.log(`❌ LOSS [${direction}] $${profit.toFixed(2)} | Martingale step ${channel.step}/${maxSteps} → next trade at $${channel.stake}`);
        } else {
          // Reached max steps, reset to base
          console.log(`❌ LOSS [${direction}] $${profit.toFixed(2)} | Martingale max steps (${maxSteps}) reached. Resetting to base stake.`);
          channel.step = 0;
          channel.stake = this.config.baseStake;
        }
      } else {
        console.log(`❌ LOSS [${direction}] $${profit.toFixed(2)} | Recovery disabled`);
        channel.step = 0;
        channel.stake = this.config.baseStake;
      }

      // Check if we should switch markets using global losses
      if (this.globalConsecutiveLosses >= (this.config.switchAfterLosses || 6)) {
        console.log(`🔄 Switching market after ${this.globalConsecutiveLosses} global consecutive losses`);
        this._switchMarket();
      }
    }

    channel.active = false;
    channel.contractId = null;
    if (channelKey === 'SINGLE') channel.direction = null;
    this.lastTradeTime = Date.now();

    if (this.onTradeUpdate) this.onTradeUpdate(trade);
    if (this.running) this._scheduleNext(this.config.cooldownMs || 1000);
  }

  _switchMarket() {
    const ranked = scanner.getRanked(this.strategy);
    const next = ranked.find(m => m.symbol !== this.activeMarket);
    if (next) {
      this.activeMarket = next.symbol;
      this.globalConsecutiveLosses = 0; // Reset switch counter
      // NOTE: We do NOT reset channel.step or channel.stake here!
      // Martingale recovery continues seamlessly on the new market.
      if (this.onMarketSwitch) this.onMarketSwitch(this.activeMarket);
    }
  }

  _scheduleNext(delayMs) {
    if (this._cycleTimer) clearTimeout(this._cycleTimer);
    this._cycleTimer = setTimeout(() => this._executeCycle(), delayMs);
  }

  updateConfig(config) {
    this.config = config;
  }
}

const tradeEngine = new TradeEngine();
export default tradeEngine;
