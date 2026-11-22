/**
 * 멀티플레이 클라이언트. 서버: server/relay.js (dev에선 Vite에 붙어 /ws)
 * handlers: { welcome, join, leave, state, puff, chat, status(online:boolean) }
 */
export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.id = null;
    this.lastState = 0;
    this.profile = null;
    this.closedByUser = false;
  }

  get online() { return this.ws?.readyState === 1 && this.id !== null; }

  connect(name, color) {
    this.profile = { name, color };
    this.closedByUser = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // Windows에서 localhost는 IPv6(::1)부터 시도하는데 서버가 IPv4만 들으면 웹소켓이 수 초~무한정 걸림
    const host = location.hostname === 'localhost' ? `127.0.0.1:${location.port}` : location.host;
    const url = import.meta.env.VITE_WS_URL || `${proto}://${host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    // CONNECTING에서 멈추는 경우(페이지 로드 직후 등)가 있어서 타임아웃 후 재시도
    const stuck = setTimeout(() => { if (ws.readyState === 0) ws.close(); }, 4000);
    ws.onopen = () => { clearTimeout(stuck); ws.send(JSON.stringify({ t: 'hello', name, color })); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.id = m.id; this.h.status?.(true); }
      this.h[m.t]?.(m);
    };
    ws.onclose = () => {
      clearTimeout(stuck);
      if (this.ws !== ws) return;
      this.id = null;
      this.h.status?.(false);
      this.h.reset?.();
      if (!this.closedByUser) setTimeout(() => this.connect(name, color), 3000);
    };
  }

  send(m) { if (this.online) this.ws.send(JSON.stringify(m)); }

  /** 10Hz로 제한 */
  sendState(st) {
    const now = performance.now();
    if (now - this.lastState < 100) return;
    this.lastState = now;
    this.send({ t: 'state', ...st });
  }
}
