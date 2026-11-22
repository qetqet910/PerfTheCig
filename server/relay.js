import { WebSocketServer } from 'ws';

/**
 * 흡연장 멀티플레이 릴레이.
 * 서버는 권위 없이 상태만 중계한다 (위치/모금/채팅).
 *
 * C→S  hello {name, color} | state {x,z,ry,s,k,inh,c,len,ash} | puff {p,d,k} | chat {text}
 *       ev {kind, p?, d?, k?, x?, z?, inTray?, to?}   kind: click|lit|ring|cough|ash|butt|borrow
 * S→C  welcome {id, players, butts} | join | leave | state | puff | chat | ev {id, ...}
 * 바닥에 버린 꽁초는 서버가 기억해서 나중에 들어온 사람도 봄 (최대 MAX_BUTTS)
 */
const MAX_PLAYERS = 40;
const MAX_BUTTS = 500;
const EV_KINDS = new Set(['click', 'lit', 'ring', 'cough', 'ash', 'butt', 'borrow']);
const COLORS = /^#[0-9a-f]{6}$/i;
const num = (v, lim = 1e4) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export function attachRelay(httpServer, { path = '/ws', log = console.log } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const players = new Map(); // id -> { ws, info }
  const butts = [];           // [x, z] 바닥 꽁초 (공유)
  const trayButts = [];       // [재떨이번호, dx, dz] 재떨이에 꽂힌 꽁초 (공유)
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    const url = (req.url || '').split('?')[0];
    if (url !== path) return; // 다른 업그레이드(Vite HMR 등)는 건드리지 않음
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, exceptId) => {
    const data = JSON.stringify(msg);
    for (const [id, p] of players) if (id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  };

  wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) { ws.close(1013, 'full'); return; }
    let id = null;
    let lastChat = 0;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'hello' && id === null) {
        id = nextId++;
        const info = {
          id,
          name: clean(m.name, 12) || `직장인${id}`,
          color: COLORS.test(m.color) ? m.color : '#2b2f38',
          x: 0, z: 0, ry: 0, s: 0, k: 0, inh: 0, c: 0, len: 1, ash: 0,
        };
        players.set(id, { ws, info });
        send(ws, { t: 'welcome', id, butts, trayButts, players: [...players.values()].filter((p) => p.info.id !== id).map((p) => p.info) });
        broadcast({ t: 'join', player: info }, id);
        log(`[relay] join #${id} ${info.name} (${players.size})`);
        return;
      }
      if (id === null) return;
      const me = players.get(id).info;

      if (m.t === 'state') {
        Object.assign(me, {
          x: num(m.x, 2000), z: num(m.z, 2000), ry: num(m.ry, 100), s: num(m.s, 20), k: num(m.k, 1), inh: num(m.inh, 1),
          c: Math.round(num(m.c, 3)), len: num(m.len, 1), ash: num(m.ash, 0.1),
        });
        const { name, color, ...st } = me;
        broadcast({ t: 'state', ...st }, id);
      } else if (m.t === 'puff' && Array.isArray(m.p) && Array.isArray(m.d)) {
        broadcast({ t: 'puff', id, p: m.p.slice(0, 3).map((v) => num(v, 2000)), d: m.d.slice(0, 3).map((v) => num(v, 10)), k: num(m.k, 3), v: Math.max(0, num(m.v ?? 0.5, 1)), nose: !!m.nose }, id);
      } else if (m.t === 'ev' && EV_KINDS.has(m.kind)) {
        const out = { t: 'ev', id, kind: m.kind };
        if (Array.isArray(m.p)) out.p = m.p.slice(0, 3).map((v) => num(v, 2000));
        if (Array.isArray(m.d)) out.d = m.d.slice(0, 3).map((v) => num(v, 10));
        if (m.k !== undefined) out.k = num(m.k, 3);
        if (m.to !== undefined) out.to = Math.round(num(m.to, 1e9));
        if (m.tray !== undefined) out.tray = Math.round(num(m.tray, 16));
        if (m.kind === 'butt') {
          out.x = num(m.x, 2000); out.z = num(m.z, 2000); out.inTray = !!m.inTray;
          if (!out.inTray) { butts.push([out.x, out.z]); if (butts.length > MAX_BUTTS) butts.shift(); }
          else if (out.tray >= 0) { trayButts.push([out.tray, num(m.x, 1), num(m.z, 1)]); if (trayButts.length > MAX_BUTTS) trayButts.shift(); }
        }
        broadcast(out, id);
      } else if (m.t === 'chat') {
        const now = Date.now();
        const text = clean(m.text, 80);
        if (!text || now - lastChat < 600) return; // 도배 방지
        lastChat = now;
        broadcast({ t: 'chat', id, text }); // 본인 포함
      }
    });

    ws.on('close', () => {
      if (id === null) return;
      players.delete(id);
      broadcast({ t: 'leave', id });
      log(`[relay] leave #${id} (${players.size})`);
    });
  });

  // 죽은 연결 정리
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);
  wss.on('close', () => clearInterval(timer));
  return wss;
}
