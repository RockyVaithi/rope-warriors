// Network layer. The host runs the only simulation; clients send inputs and draw snapshots.
// Transport: PeerJS (WebRTC, works across devices) or BroadcastChannel (?net=bc, same-browser testing).

const PREFIX = 'rope-warriors-v1-';
const useBC = new URLSearchParams(location.search).get('net') === 'bc';

export function newRoomCode() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// ---------- input packing ----------
const BITS = ['l', 'r', 'u', 'd', 'fire', 'grap', 'dash'];
export const packInput = inp => [BITS.reduce((m, k, i) => m | (inp[k] ? 1 << i : 0), 0), Math.round(inp.aim * 1000)];
export function unpackInput(arr, into) {
  const [m, a] = arr;
  BITS.forEach((k, i) => { into[k] = !!(m & (1 << i)); });
  into.aim = a / 1000;
  return into;
}

// ---------- snapshot packing ----------
const WIDX = { pistol: 0, shotgun: 1, rocket: 2 }, WNAME = ['pistol', 'shotgun', 'rocket'];
const RSTATE = { none: 0, flying: 1, attached: 2 }, RNAME = ['none', 'flying', 'attached'];
const r1 = v => Math.round(v * 10) / 10;

export function packSnapshot(world, events) {
  return {
    t: 'snap',
    st: world.state === 'playing' ? 1 : 0,
    tl: r1(world.timeLeft),
    tm: r1(world.time),
    p: world.players.map(p => [
      p.id, r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), Math.round(p.aim * 100),
      Math.max(0, Math.round(p.hp)), p.alive ? 1 : 0, WIDX[p.weapon], Number.isFinite(p.ammo) ? p.ammo : -1,
      RSTATE[p.rope.state], r1(p.rope.x), r1(p.rope.y), p.kills, p.deaths,
      (p.onGround ? 1 : 0) | (p.speedT > 0 ? 2 : 0) | (p.invuln > 0 ? 4 : 0) | (p.flash > 0 ? 8 : 0),
      r1(Math.max(0, p.ropeCd)), r1(Math.max(0, p.dashCd)), r1(Math.max(0, p.respawnT)),
    ]),
    pr: world.projectiles.map(q => [WIDX[q.w], r1(q.x), r1(q.y), Math.round(q.vx), Math.round(q.vy)]),
    pk: world.pickups.map(k => (k.active ? 1 : 0) | (k.wk === 'rocket' ? 2 : 0)),
    ev: events,
  };
}

export function applySnapshot(mirror, s) {
  mirror.state = s.st ? 'playing' : 'over';
  mirror.timeLeft = s.tl;
  mirror.serverTime = s.tm;
  const seen = new Set();
  for (const a of s.p) {
    const [id, x, y, vx, vy, aim, hp, alive, w, ammo, rs, rx, ry, kills, deaths, flags, ropeCd, dashCd, respawnT] = a;
    seen.add(id);
    let p = mirror.byId.get(id);
    if (!p) {
      const info = mirror.roster.get(id) || { name: '?', color: '#ffffff' };
      p = { id, name: info.name, color: info.color, x, y, w: 22, h: 34, rope: { state: 'none', x: 0, y: 0 }, facing: 1 };
      mirror.byId.set(id, p);
    }
    const wasAlive = p.alive;
    p.tx = x; p.ty = y; p.vx = vx; p.vy = vy;
    if (!wasAlive || Math.hypot(p.x - x, p.y - y) > 200) { p.x = x; p.y = y; }   // teleport on spawn
    if (id !== mirror.localId) p.aim = aim / 100;
    p.hp = hp; p.alive = !!alive; p.weapon = WNAME[w]; p.ammo = ammo < 0 ? Infinity : ammo;
    p.rope.state = RNAME[rs]; p.rope.x = rx; p.rope.y = ry;
    p.kills = kills; p.deaths = deaths;
    p.onGround = !!(flags & 1); p.speedT = flags & 2 ? 1 : 0; p.invuln = flags & 4 ? 1 : 0; p.flash = flags & 8 ? 0.05 : 0;
    p.ropeCd = ropeCd; p.dashCd = dashCd; p.respawnT = respawnT;
    p.facing = Math.cos(p.aim || 0) >= 0 ? 1 : -1;
  }
  for (const id of [...mirror.byId.keys()]) if (!seen.has(id)) mirror.byId.delete(id);
  mirror.players = [...mirror.byId.values()];
  mirror.projectiles = s.pr.map(([w, x, y, vx, vy]) => ({ w: WNAME[w], x, y, vx, vy }));
  s.pk.forEach((v, i) => { if (mirror.pickups[i]) { mirror.pickups[i].active = !!(v & 1); mirror.pickups[i].wk = v & 2 ? 'rocket' : 'shotgun'; } });
}

// Client-side smoothing between 30 Hz snapshots.
export function smoothMirror(mirror, dt) {
  const k = Math.min(1, dt * 16);
  for (const p of mirror.players) {
    if (p.tx == null) continue;
    p.tx += p.vx * dt; p.ty += p.vy * dt;          // extrapolate
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
  }
  for (const q of mirror.projectiles) { q.x += q.vx * dt; q.y += q.vy * dt; }
}

// ---------- transports ----------
function peerHost(code, h) {
  return new Promise((resolve, reject) => {
    const conns = new Map();
    const peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on('open', () => resolve({
      send: (cid, m) => { const c = conns.get(cid); if (c && c.open) c.send(m); },
      broadcast: m => conns.forEach(c => { if (c.open) c.send(m); }),
      close: () => { conns.forEach(c => c.close()); peer.destroy(); },
    }));
    peer.on('connection', c => {
      c.on('open', () => { conns.set(c.peer, c); h.onJoin(c.peer); });
      c.on('data', m => h.onMsg(c.peer, m));
      c.on('close', () => { if (conns.delete(c.peer)) h.onLeave(c.peer); });
      c.on('error', () => { if (conns.delete(c.peer)) h.onLeave(c.peer); });
    });
    peer.on('error', e => reject(e));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  });
}

function peerClient(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let done = false;
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { done = true; resolve({ send: m => c.open && c.send(m), close: () => { c.close(); peer.destroy(); } }); });
      c.on('data', m => h.onMsg(m));
      c.on('close', () => h.onClose());
    });
    peer.on('error', e => { if (!done) reject(e); else h.onClose(); });
    setTimeout(() => { if (!done) reject({ type: 'timeout' }); }, 12000);
  });
}

function bcHost(code, h) {
  const ch = new BroadcastChannel('rw-' + code);
  const clients = new Set();
  ch.onmessage = ({ data }) => {
    if (data.to !== 'host') return;
    if (data.m.t === 'hello') { clients.add(data.from); h.onJoin(data.from); }
    else if (data.m.t === 'bye') { if (clients.delete(data.from)) h.onLeave(data.from); }
    else h.onMsg(data.from, data.m);
  };
  return Promise.resolve({
    send: (cid, m) => ch.postMessage({ to: cid, m }),
    broadcast: m => ch.postMessage({ to: '*', m }),
    close: () => ch.close(),
  });
}

function bcClient(code, h) {
  const ch = new BroadcastChannel('rw-' + code), me = 'c' + Math.random().toString(36).slice(2);
  ch.onmessage = ({ data }) => { if (data.to === me || data.to === '*') h.onMsg(data.m); };
  ch.postMessage({ to: 'host', from: me, m: { t: 'hello' } });
  addEventListener('beforeunload', () => ch.postMessage({ to: 'host', from: me, m: { t: 'bye' } }));
  return Promise.resolve({ send: m => ch.postMessage({ to: 'host', from: me, m }), close: () => { ch.postMessage({ to: 'host', from: me, m: { t: 'bye' } }); ch.close(); } });
}

export const createHostTransport = (code, h) => useBC ? bcHost(code, h) : peerHost(code, h);
export const createClientTransport = (code, h) => useBC ? bcClient(code, h) : peerClient(code, h);
export const netAvailable = () => useBC || typeof Peer !== 'undefined';
