/* ══════════════════════════════════════════════════════════════
   DERIVPRINTER — WebSocket Manager
   Single persistent connection to Deriv API.
   Never tears down during market switches.
   ══════════════════════════════════════════════════════════════ */

const WS_URL = 'wss://ws.derivws.com/websockets/v3';

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

  getAppId() {
    return '33h51PQlu5tsWflEmmoxW';
  }

  /* ── Connect ── */
  connect(token, accountId) {
    this.token = token;
    this.accountId = accountId;
    this.reconnectAttempts = 0;
    this._connect();
  }

  async _connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.status = 'connecting';
    this._emitStatus();

    const appId = this.getAppId();
    const isAlphanumeric = isNaN(Number(appId));
    let wsUrl = `${WS_URL}?app_id=${appId}`;
    let usedOtp = false;

    if (this.token && this.accountId && isAlphanumeric) {
      try {
        const response = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${this.accountId}/otp`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Deriv-App-ID': appId
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch OTP url: ' + response.status);
        }
        
        const data = await response.json();
        const finalUrl = data?.data?.url || data?.url;
        if (finalUrl) {
          wsUrl = finalUrl;
          usedOtp = true;
        } else {
          throw new Error('OTP response did not contain a URL');
        }
      } catch (err) {
        console.error('Failed to get OTP URL:', err);
        this.status = 'error';
        this._emitStatus();
        this._scheduleReconnect();
        return;
      }
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('Connection setup failed:', e);
      this.status = 'error';
      this._emitStatus();
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;

      const setupAuthorized = () => {
        this.status = 'authorized';
        this.accountInfo = {
          loginid: this.accountId,
          balance: 0,
          currency: 'USD',
        };
        this._emitStatus();
        if (this.onAccountUpdate) this.onAccountUpdate(this.accountInfo);

        // Fetch initial balance using a direct request if needed, or rely on subscription
        this.send({ balance: 1, subscribe: 1 }).then(balRes => {
          if (balRes && balRes.balance) {
            this.accountInfo.balance = parseFloat(balRes.balance.balance);
            this.accountInfo.currency = balRes.balance.currency;
            if (this.onAccountUpdate) this.onAccountUpdate(this.accountInfo);
          }
        }).catch(err => console.error('Balance subscribe failed:', err));

        // Fetch user settings to get fullname
        this.send({ get_settings: 1 }).then(settingsRes => {
          if (settingsRes && settingsRes.get_settings) {
            const s = settingsRes.get_settings;
            this.accountInfo.fullname = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || '';
            if (this.onAccountUpdate) this.onAccountUpdate(this.accountInfo);
          }
        }).catch(err => console.error('Get settings failed:', err));

        // Re-subscribe to any active tick streams
        this.tickSubscriptions.forEach(sym => {
          this.send({ ticks: sym, subscribe: 1 });
        });
      };

      if (this.token && this.accountId) {
        if (usedOtp) {
          // If we connected with token/accountId via OTP, we are automatically authorized
          setupAuthorized();
        } else {
          // Legacy API requires manual authorization via WebSocket
          this.status = 'connected';
          this.send({ authorize: this.token }).then(authRes => {
            if (authRes.error) {
              console.error('WebSocket authorization failed:', authRes.error);
              this.status = 'error';
              this._emitStatus();
              return;
            }
            setupAuthorized();
          });
        }
      } else {
        this.status = 'connected';
        this._emitStatus();
      }
    };

    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      // Handle balance updates
      if (msg.msg_type === 'balance' && msg.balance) {
        if (this.accountInfo) {
          this.accountInfo.balance = parseFloat(msg.balance.balance);
          this.accountInfo.currency = msg.balance.currency || this.accountInfo.currency;
        }
        if (this.onAccountUpdate) this.onAccountUpdate({ ...this.accountInfo });
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
