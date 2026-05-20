/* ══════════════════════════════════════════════════════════════
   COPY TRADE ENGINE — Mirrors trades from Real → Demo account
   Spawns a secondary WebSocket for the demo account and listens
   for buy events on the primary connection to replicate them.
   ══════════════════════════════════════════════════════════════ */

const WS_URL = 'wss://ws.derivws.com/websockets/v3';
const APP_ID = '33h51PQlu5tsWflEmmoxW';

class CopyTradeEngine {
  constructor() {
    this.ws = null;
    this.status = 'idle'; // idle | connecting | authorized | error
    this.demoToken = null;
    this.demoAccountId = null;
    this.realAccountId = null;
    this.active = false;
    this.copiedTrades = [];
    this.maxLog = 100;
    this.onStatusChange = null;
    this.onTradeLog = null;
    this.reqId = 0;
    this.pendingRequests = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnect = 5;
  }

  /* ── Configure with demo account details ── */
  configure({ demoToken, demoAccountId, realAccountId }) {
    this.demoToken = demoToken;
    this.demoAccountId = demoAccountId;
    this.realAccountId = realAccountId;
  }

  /* ── Start: connect the demo WS ── */
  async start() {
    if (!this.demoToken || !this.demoAccountId) {
      this._log('❌ No demo account configured. Please select a demo account.');
      return;
    }
    this.active = true;
    this.reconnectAttempts = 0;
    await this._connectDemo();
  }

  /* ── Stop: tear down the demo WS ── */
  stop() {
    this.active = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.status = 'idle';
    this._emitStatus();
    this._log('⏹️ Copy trade stopped.');
  }

  /* ── Mirror a trade from the real account ── */
  async copyTrade({ contractType, symbol, amount, duration, durationUnit, barrier }) {
    if (!this.active || this.status !== 'authorized') {
      this._log('⚠️ Cannot copy — demo WS not authorized.');
      return;
    }

    const proposal = {
      buy: 1,
      subscribe: 1,
      price: amount,
      parameters: {
        contract_type: contractType,
        symbol: symbol,
        amount: amount,
        basis: 'stake',
        duration: duration,
        duration_unit: durationUnit,
      }
    };
    if (barrier) proposal.parameters.barrier = barrier;

    this._log(`📋 Copying trade → ${contractType} on ${symbol} @ $${amount}`);

    try {
      const result = await this._send(proposal);
      if (result.error) {
        this._log(`❌ Copy failed: ${result.error.message}`);
      } else {
        const cid = result.buy?.contract_id;
        this._log(`✅ Copied! Contract ID: ${cid}`);
        this.copiedTrades.push({
          id: cid,
          contractType,
          symbol,
          amount,
          time: Date.now(),
          status: 'open'
        });
        // Keep log bounded
        if (this.copiedTrades.length > this.maxLog) {
          this.copiedTrades = this.copiedTrades.slice(-this.maxLog);
        }
      }
    } catch (err) {
      this._log(`❌ Copy error: ${err.message}`);
    }
  }

  /* ── Internal: connect to demo WS via OTP ── */
  async _connectDemo() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.status = 'connecting';
    this._emitStatus();
    this._log('🔌 Connecting demo WebSocket...');

    let wsUrl = `${WS_URL}?app_id=${APP_ID}`;

    // Try OTP route
    if (this.demoToken && this.demoAccountId) {
      try {
        const response = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${this.demoAccountId}/otp`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.demoToken}`,
            'Deriv-App-ID': APP_ID
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.otp_url) {
            wsUrl = data.otp_url;
            this._log('🔑 OTP URL obtained for demo account.');
          }
        }
      } catch (err) {
        this._log(`⚠️ OTP fetch failed, falling back to authorize: ${err.message}`);
      }
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this._log('✅ Demo WebSocket connected.');
      this.reconnectAttempts = 0;

      // If connected via OTP, we're already authorized
      if (wsUrl !== `${WS_URL}?app_id=${APP_ID}`) {
        this.status = 'authorized';
        this._emitStatus();
        this._log('🔐 Demo account authorized via OTP.');
      } else if (this.demoToken) {
        // Fallback: authorize via token
        this.ws.send(JSON.stringify({ authorize: this.demoToken }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle authorize response
        if (msg.msg_type === 'authorize') {
          if (msg.error) {
            this._log(`❌ Demo auth failed: ${msg.error.message}`);
            this.status = 'error';
          } else {
            this.status = 'authorized';
            this._log(`🔐 Demo authorized: ${msg.authorize?.loginid}`);
          }
          this._emitStatus();
          return;
        }

        // Handle pending request responses
        if (msg.req_id && this.pendingRequests.has(msg.req_id)) {
          const { resolve } = this.pendingRequests.get(msg.req_id);
          this.pendingRequests.delete(msg.req_id);
          resolve(msg);
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this._log('❌ Demo WebSocket error.');
      this.status = 'error';
      this._emitStatus();
    };

    this.ws.onclose = () => {
      this._log('🔌 Demo WebSocket disconnected.');
      this.status = 'idle';
      this._emitStatus();

      if (this.active && this.reconnectAttempts < this.maxReconnect) {
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        this._log(`🔄 Reconnecting demo in ${(delay / 1000).toFixed(0)}s...`);
        this.reconnectTimer = setTimeout(() => this._connectDemo(), delay);
      }
    };
  }

  /* ── Internal: send message on demo WS ── */
  _send(payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Demo WS not open'));
      }
      const id = ++this.reqId;
      payload.req_id = id;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));

      // Timeout after 15s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 15000);
    });
  }

  /* ── Internal: log helper ── */
  _log(message) {
    console.log('[CopyTrade]', message);
    if (this.onTradeLog) this.onTradeLog(message);
  }

  /* ── Internal: status emitter ── */
  _emitStatus() {
    if (this.onStatusChange) this.onStatusChange(this.status);
  }

  /* ── Get current state summary ── */
  getState() {
    return {
      status: this.status,
      active: this.active,
      copiedTrades: this.copiedTrades,
      demoAccountId: this.demoAccountId,
      realAccountId: this.realAccountId
    };
  }
}

const copyTradeEngine = new CopyTradeEngine();
export default copyTradeEngine;
