/* ══════════════════════════════════════════════════════════════
   DERIVPRINTER — WebSocket Manager
   Single persistent connection to Deriv API.
   Never tears down during market switches.
   ══════════════════════════════════════════════════════════════ */

const WS_URL = 'wss://ws.derivws.com/websockets/v3';
const APP_ID = 1089;

class DerivWebSocket {
  constructor() {
    this.ws = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | authorized | error
    this.token = null;
    this.accountInfo = null;
    this.handlers = new Map();
    this.pendingRequests = new Map();
    this.reqId = 0;
    this.reconnectAttempts = 0;
    this.maxReconnect = 10;
    this.reconnectTimer = null;
    this.tickSubscriptions = new Set();
    this.onStatusChange = null;
    this.onAccountUpdate = null;
  }

  /* ── Connect ── */
  connect(token) {
    this.token = token;
    this.reconnectAttempts = 0;
    this._connect();
  }

  _connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.status = 'connecting';
    this._emitStatus();

    try {
      this.ws = new WebSocket(`${WS_URL}?app_id=${APP_ID}`);
    } catch (e) {
      this.status = 'error';
      this._emitStatus();
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
      this._emitStatus();

      if (this.token) {
        this.send({ authorize: this.token }).then(res => {
          if (res.error) {
            console.error('Auth failed:', res.error.message);
            this.status = 'error';
            this._emitStatus();
            return;
          }
          this.status = 'authorized';
          this.accountInfo = res.authorize;
          this._emitStatus();
          if (this.onAccountUpdate) this.onAccountUpdate(this.accountInfo);

          // Subscribe to balance updates
          this.send({ balance: 1, subscribe: 1 });

          // Re-subscribe to any active tick streams
          this.tickSubscriptions.forEach(sym => {
            this.send({ ticks: sym, subscribe: 1 });
          });
        });
      }
    };

    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      // Handle balance updates
      if (msg.msg_type === 'balance' && msg.balance) {
        if (this.accountInfo) {
          this.accountInfo.balance = parseFloat(msg.balance.balance);
        }
        if (this.onAccountUpdate) this.onAccountUpdate({ ...this.accountInfo, balance: parseFloat(msg.balance.balance) });
      }

      // Route to pending request callbacks
      if (msg.req_id && this.pendingRequests.has(msg.req_id)) {
        const resolve = this.pendingRequests.get(msg.req_id);
        this.pendingRequests.delete(msg.req_id);
        resolve(msg);
      }

      // Route to registered message type handlers
      const type = msg.msg_type;
      if (type && this.handlers.has(type)) {
        this.handlers.get(type).forEach(fn => {
          try { fn(msg); } catch (e) { console.error(`Handler error [${type}]:`, e); }
        });
      }
    };

    this.ws.onerror = () => {
      console.error('WebSocket error');
    };

    this.ws.onclose = () => {
      this.status = 'disconnected';
      this._emitStatus();
      this._scheduleReconnect();
    };
  }

  /* ── Send a message, returns a promise for the response ── */
  send(payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }

      this.reqId += 1;
      payload.req_id = this.reqId;
      this.pendingRequests.set(this.reqId, resolve);

      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        this.pendingRequests.delete(this.reqId);
        reject(e);
      }

      // Auto-expire after 15s
      setTimeout(() => {
        if (this.pendingRequests.has(payload.req_id)) {
          this.pendingRequests.delete(payload.req_id);
          resolve({ error: { message: 'Request timed out' } });
        }
      }, 15000);
    });
  }

  /* ── Fire-and-forget send (no response tracking) ── */
  sendRaw(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /* ── Subscribe to tick stream ── */
  subscribeTicks(symbol) {
    this.tickSubscriptions.add(symbol);
    if (this.status === 'authorized') {
      this.send({ ticks: symbol, subscribe: 1 });
    }
  }

  /* ── Register handler for a message type ── */
  on(msgType, handler) {
    if (!this.handlers.has(msgType)) {
      this.handlers.set(msgType, new Set());
    }
    this.handlers.get(msgType).add(handler);
    return () => this.handlers.get(msgType)?.delete(handler);
  }

  /* ── Disconnect ── */
  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.token = null;
    this.tickSubscriptions.clear();
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this._emitStatus();
  }

  /* ── Internals ── */
  _scheduleReconnect() {
    if (!this.token || this.reconnectAttempts >= this.maxReconnect) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  _emitStatus() {
    if (this.onStatusChange) this.onStatusChange(this.status);
  }

  get isReady() {
    return this.status === 'authorized' && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
const derivWS = new DerivWebSocket();
export default derivWS;
