import enhancedTradeEngine from './src/lib/enhancedTradeEngine.js';
import derivWS from './src/lib/derivWS.js';
import scanner, { MARKETS, MARKET_LABELS } from './src/lib/marketScanner.js';
import fs from 'fs';

console.log("=== RUNNING DETAILED SIMULATOR DIAGNOSTIC ===");

derivWS.status = 'authorized';
derivWS.accountInfo = { balance: 10000.00, currency: 'USD' };
derivWS.ws = { readyState: 1 };
globalThis.WebSocket = { OPEN: 1 };

let pocCallback = null;
derivWS.on = (event, callback) => {
  console.log(`[derivWS.on] Registered handler for: ${event}`);
  if (event === 'proposal_open_contract') {
    pocCallback = callback;
  }
  return () => {
    console.log(`[derivWS.on] Unsubscribe called for: ${event}`);
  };
};

function generatePriceWithDigit(digit) {
  return (Math.random() * 1000).toFixed(4).slice(0, -1) + digit;
}

let tickCount = 0;
derivWS.send = async (payload) => {
  console.log(`[derivWS.send] Received payload:`, JSON.stringify(payload));
  if (payload.buy) {
    const cid = 'mock_contract_' + Math.random();
    const stake = payload.price;
    const direction = payload.parameters.contract_type === 'DIGITOVER' ? 'OVER5' : 'UNDER5';
    const symbol = payload.parameters.symbol;

    const nextDigit = 8; // force OVER so OVER5 wins, UNDER5 loses
    const price = generatePriceWithDigit(nextDigit);
    scanner.addTick(symbol, price);

    const won = direction === 'OVER5' ? nextDigit > 5 : nextDigit < 5;
    const profit = won ? (direction === 'OVER5' ? stake * 1.3714 : stake * 0.8857) : -stake;

    const msg = {
      proposal_open_contract: {
        contract_id: cid,
        is_sold: 1,
        status: won ? 'won' : 'lost',
        profit: won ? parseFloat(profit.toFixed(2)) : -stake,
        buy_price: stake,
        underlying: symbol,
        exit_tick: parseFloat(price),
        exit_tick_display_value: String(nextDigit),
        barrier: '5'
      }
    };

    console.log(`[derivWS.send] Scheduling pocCallback in process.nextTick for cid: ${cid}, won: ${won}`);
    process.nextTick(() => {
      console.log(`[process.nextTick] Triggering pocCallback now...`);
      if (pocCallback) {
        pocCallback(msg);
      } else {
        console.log(`[process.nextTick] WARNING: pocCallback is null!`);
      }
    });

    return { buy: { contract_id: cid } };
  }
  return {};
};

derivWS.sendRaw = (payload) => {
  console.log(`[derivWS.sendRaw] Sent:`, JSON.stringify(payload));
};

let simulatedTime = Date.now();
Date.now = () => simulatedTime;

enhancedTradeEngine._scheduleNext = (delayMs) => {
  console.log(`[_scheduleNext] Delay requested: ${delayMs}ms. Advancing simulated time...`);
  simulatedTime += delayMs;
  
  setImmediate(() => {
    if (enhancedTradeEngine.running) {
      console.log(`[setImmediate] Running next evaluation cycle...`);
      const sym = MARKETS[Math.floor(Math.random() * MARKETS.length)];
      scanner.addTick(sym, generatePriceWithDigit(4));
      enhancedTradeEngine._executeCycle();
    }
  });
};

enhancedTradeEngine.onTradeUpdate = (trade) => {
  console.log(`[onTradeUpdate] Trade recorded! won: ${trade.won}, P&L: $${trade.profit}`);
};

// Prepopulate
console.log("Prepopulating...");
for (const sym of MARKETS) {
  for (let i = 0; i < 100; i++) {
    scanner.addTick(sym, generatePriceWithDigit(8)); // Dominance OVER
  }
}

console.log("Starting engine...");
enhancedTradeEngine.start({
  strategy: 'BOTH5',
  baseStake: 0.35,
  minConfidence: 65,
  cooldownMs: 0,
});
