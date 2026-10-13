// Vitalis ICU Server-Sent Events Stream Manager

class TelemetryStreamClient {
  constructor() {
    this.eventSource = null;
    this.listeners = {
      vital_tick: [],
      simulator_state: [],
      connected: []
    };
    this.reconnectTimer = null;
  }

  connect() {
    if (this.eventSource) {
      this.disconnect();
    }

    const token = API.getToken();
    const url = `/api/stream/events${token ? '?token=' + encodeURIComponent(token) : ''}`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data);
        this.emit('connected', data);
      });

      this.eventSource.addEventListener('vital_tick', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('vital_tick', data);
        } catch (err) {
          console.error('Failed to parse vital_tick SSE data', err);
        }
      });

      this.eventSource.addEventListener('simulator_state', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('simulator_state', data);
        } catch (err) {
          console.error('Failed to parse simulator_state SSE data', err);
        }
      });

      this.eventSource.onerror = (err) => {
        console.warn('SSE stream disconnected, attempting reconnect in 3s...');
        this.disconnect();
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
    } catch (e) {
      console.error('EventSource connection error:', e);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    clearTimeout(this.reconnectTimer);
  }

  on(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].push(callback);
    }
  }

  off(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }
  }

  emit(eventName, data) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in ${eventName} listener:`, e);
        }
      });
    }
  }
}

window.TelemetryStream = new TelemetryStreamClient();
