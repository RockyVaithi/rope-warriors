// Boot, game modes (local / host / client), the main loop, camera, and menu wiring.
import { STEP, SNAPSHOT_EVERY, MAX_PLAYERS } from './config.js?v=3';
import { buildMap } from './map.js?v=3';
import { createWorld, addPlayer, removePlayer, stepWorld, restartMatch } from './match.js?v=3';
import { createPickups } from './pickups.js?v=3';
import { createInput } from './input.js?v=3';
import { renderScene } from './render.js?v=3';
import { createEffects, spawnEffect, updateEffects, rocketTrail } from './effects.js?v=3';
import { drawHUD, showScreen, renderLobby, renderResults, setText } from './ui.js?v=3';
import { unlockAudio, setSound } from './audio.js?v=3';
import { newRoomCode, createHostTransport, createClientTransport, packInput, unpackInput, packSnapshot, applySnapshot, smoothMirror, netAvailable } from './net.js?v=3';

const $ = id => document.getElementById(id);
const canvas = $('game'), g = canvas.getContext('2d');
const input = createInput(canvas);
const store = {
  get(k, d) { try { const v = localStorage.getItem('rw-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rw-' + k, JSON.stringify(v)); } catch (e) {} },
};
const settings = { name: store.get('name', ''), bots: store.get('bots', 3), sound: store.get('sound', true), shake: store.get('shake', true) };
setSound(settings.sound);

// ---- state ----
let mode = 'menu';            // menu | local | lobby-host | host | lobby-client | client
let world = null, mirror = null, localId = null, transport = null, roomCode = null;
let fx = createEffects();
let acc = 0, tick = 0, netEvents = [], sendT = 0, rosterT = 0, pendingDash = false, clientClock = 0;
const clients = new Map();    // host: transport id -> player id
const view = { W: innerWidth, H: innerHeight, scale: 1, cam: { x: 1024, y: 700 } };

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.W = innerWidth; view.H = innerHeight;
  canvas.width = view.W * dpr; canvas.height = view.H * dpr;
  canvas.style.width = view.W + 'px'; canvas.style.height = view.H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.scale = Math.max(0.45, Math.min(view.W / 1400, view.H / 820));
}
addEventListener('resize', resize); resize();

const isSim = () => mode === 'local' || mode === 'host';
const myName = () => (settings.name || 'Warrior').slice(0, 12);

// ---- local play vs bots ----
function startLocal() {
  cleanupNet();
  world = createWorld();
  localId = addPlayer(world, myName()).id;
  for (let i = 0; i < settings.bots; i++) addPlayer(world, '', true);
  enterGame('local');
}

function enterGame(m) {
  mode = m; fx = createEffects(); acc = 0;
  showScreen(null);
  const me = scene().players.find(p => p.id === localId);
  if (me) { view.cam.x = me.x; view.cam.y = me.y; }
}

// ---- hosting ----
async function hostRoom() {
  cleanupNet();
  setText('onlineErr', 'Opening room…');
  roomCode = newRoomCode();
  world = createWorld();
  localId = addPlayer(world, myName()).id;
  try {
    transport = await createHostTransport(roomCode, {
      onJoin: () => {},
      onMsg: onHostMsg,
      onLeave: cid => {
        const id = clients.get(cid); clients.delete(cid);
        if (id != null) { removePlayer(world, id); sendRoster(); refreshLobby(); }
      },
    });
  } catch (e) {
    setText('onlineErr', 'Could not open room (' + (e.type || e.message || e) + '). Try again.');
    world = null; return;
  }
  setText('onlineErr', '');
  mode = 'lobby-host';
  history.replaceState(null, '', '?room=' + roomCode + (location.search.includes('net=bc') ? '&net=bc' : ''));
  showScreen('lobby'); refreshLobby();
}

function onHostMsg(cid, m) {
  if (!m || typeof m !== 'object' || !world) return;
  if (m.t === 'join') {
    if (clients.has(cid)) return;
    const humans = world.players.filter(p => !p.isBot).length;
    if (humans >= MAX_PLAYERS) { transport.send(cid, { t: 'deny', why: 'Room is full.' }); return; }
    // make room by removing a bot if needed
    if (world.players.length >= MAX_PLAYERS) { const bot = world.players.find(p => p.isBot); if (bot) removePlayer(world, bot.id); }
    const p = addPlayer(world, String(m.name || 'Warrior').slice(0, 12));
    clients.set(cid, p.id);
    transport.send(cid, { t: 'welcome', id: p.id, code: roomCode });
    sendRoster();
    if (mode === 'host') transport.send(cid, { t: 'start' });
    refreshLobby();
  } else if (m.t === 'in') {
    const id = clients.get(cid), p = id != null && world.players.find(q => q.id === id);
    if (p && Array.isArray(m.i)) unpackInput(m.i, p.input);
  }
}

function sendRoster() {
  if (!transport || !world) return;
  transport.broadcast({ t: 'roster', p: world.players.map(p => [p.id, p.name, p.color, p.isBot ? 1 : 0]) });
}

function refreshLobby() {
  if (mode === 'lobby-host') {
    renderLobby(world.players.map(p => ({ name: p.name, color: p.color, bot: p.isBot, me: p.id === localId })), roomCode, true, settings.bots);
  } else if (mode === 'lobby-client' && mirror) {
    renderLobby([...mirror.roster.values()].map(r => ({ name: r.name, color: r.color, bot: r.bot, me: r.id === localId })), roomCode, false, 0);
  }
}

function hostStart() {
  if (!world) return;
  world.players.filter(p => p.isBot).forEach(p => removePlayer(world, p.id));
  const room = MAX_PLAYERS - world.players.length;
  for (let i = 0; i < Math.min(settings.bots, room); i++) addPlayer(world, '', true);
  restartMatch(world);
  sendRoster();
  transport.broadcast({ t: 'start' });
  enterGame('host');
}

// ---- joining ----
async function joinRoom(code) {
  cleanupNet();
  code = (code || '').trim().toUpperCase();
  if (code.length !== 4) { setText('onlineErr', 'Enter the 4-letter room code.'); return; }
  setText('onlineErr', 'Joining ' + code + '…');
  roomCode = code;
  const map = buildMap();
  mirror = { map, byId: new Map(), roster: new Map(), players: [], projectiles: [], pickups: createPickups(map), timeLeft: 180, state: 'playing', localId: null };
  try {
    transport = await createClientTransport(code, { onMsg: onClientMsg, onClose: () => { if (mode !== 'menu') { leave(); setText('onlineErr', 'Disconnected from the host.'); showScreen('online'); } } });
  } catch (e) {
    mirror = null;
    setText('onlineErr', e.type === 'peer-unavailable' || e.type === 'timeout' ? 'Room ' + code + ' not found.' : 'Connection problem (' + (e.type || e) + ').');
    return;
  }
  transport.send({ t: 'join', name: myName() });
  mode = 'lobby-client';
  history.replaceState(null, '', '?room=' + code + (location.search.includes('net=bc') ? '&net=bc' : ''));
  setText('onlineErr', '');
  showScreen('lobby'); refreshLobby();
}

function onClientMsg(m) {
  if (!mirror || !m) return;
  if (m.t === 'welcome') { localId = mirror.localId = m.id; refreshLobby(); }
  else if (m.t === 'deny') { leave(); setText('onlineErr', m.why); showScreen('online'); }
  else if (m.t === 'roster') {
    mirror.roster = new Map(m.p.map(([id, name, color, bot]) => [id, { id, name, color, bot: !!bot }]));
    for (const p of mirror.players) { const r = mirror.roster.get(p.id); if (r) { p.name = r.name; p.color = r.color; } }
    refreshLobby();
  } else if (m.t === 'start') { enterGame('client'); }
  else if (m.t === 'snap') {
    const wasPlaying = mirror.state === 'playing';
    applySnapshot(mirror, m);
    const ctx = fxCtx();
    for (const e of m.ev) spawnEffect(fx, e, ctx);
    if (mode === 'client' && wasPlaying && mirror.state === 'over') showResults();
  }
}

// ---- shared ----
function scene() {
  if (mirror) return { map: mirror.map, players: mirror.players, projectiles: mirror.projectiles, pickups: mirror.pickups, time: clientClock, timeLeft: mirror.timeLeft, state: mirror.state };
  if (world) return world;
  return { map: null, players: [], projectiles: [], pickups: [], time: 0, timeLeft: 0, state: 'over' };
}

function fxCtx() {
  const sc = scene(), me = sc.players.find(p => p.id === localId);
  return { localId, players: new Map(sc.players.map(p => [p.id, p])), listener: me || { x: view.cam.x, y: view.cam.y }, shakeOn: settings.shake };
}

function showResults() {
  renderResults(scene().players, localId, mode !== 'client');
  showScreen('results');
}

function cleanupNet() {
  if (transport) { try { transport.close(); } catch (e) {} }
  transport = null; clients.clear(); mirror = null; world = null; localId = null;
}

function leave() {
  cleanupNet(); mode = 'menu';
  history.replaceState(null, '', location.pathname + (location.search.includes('net=bc') ? '?net=bc' : ''));
  showScreen('title');
}

// ---- main loop ----
let last = performance.now();
function simulate(dt) {
  if (isSim() && world) {
    const me = world.players.find(p => p.id === localId);
    if (me) me.input = input.read(view, me);
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 5) {
      const wasPlaying = world.state === 'playing';
      stepWorld(world, STEP);
      acc -= STEP;
      if (me) me.input.dash = false;
      const ctx = fxCtx();
      for (const e of world.events) { spawnEffect(fx, e, ctx); if (mode === 'host') netEvents.push(e); }
      world.events.length = 0;
      if (mode === 'host' && ++tick % SNAPSHOT_EVERY === 0) {
        transport.broadcast(packSnapshot(world, netEvents)); netEvents = [];
      }
      if (wasPlaying && world.state === 'over') showResults();
    }
    if (mode === 'host') { rosterT -= dt; if (rosterT <= 0) { rosterT = 3; sendRoster(); } }
  } else if (mode === 'client' && mirror) {
    clientClock += dt;
    const me = mirror.byId.get(localId);
    const inp = input.read(view, me);
    pendingDash = pendingDash || inp.dash;
    if (me) { me.aim = inp.aim; me.facing = Math.cos(inp.aim) >= 0 ? 1 : -1; }
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / 30; inp.dash = pendingDash; pendingDash = false; transport.send({ t: 'in', i: packInput(inp) }); }
    smoothMirror(mirror, dt);
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden) simulate(dt);

  const sc = scene();
  for (const pr of sc.projectiles) if (pr.w === 'rocket' && Math.random() < 0.7) rocketTrail(fx, pr);
  updateEffects(fx, dt);

  if (sc.map) {
    const me = sc.players.find(p => p.id === localId);
    if (me && me.alive) {
      const lead = 70;
      const tx = me.x + Math.cos(me.aim || 0) * lead, ty = me.y - 30 + Math.sin(me.aim || 0) * lead * 0.6;
      view.cam.x += (tx - view.cam.x) * Math.min(1, dt * 5);
      view.cam.y += (ty - view.cam.y) * Math.min(1, dt * 5);
    }
    const hw = view.W / 2 / view.scale, hh = view.H / 2 / view.scale;
    view.cam.x = sc.map.pxW < hw * 2 ? sc.map.pxW / 2 : Math.max(hw, Math.min(sc.map.pxW - hw, view.cam.x));
    view.cam.y = Math.max(hh - 40, Math.min(sc.map.pxH + 80 - hh, view.cam.y));
    renderScene(g, view, sc, fx, localId);
    if (mode === 'local' || mode === 'host' || mode === 'client') {
      drawHUD(g, view, sc, fx, localId, input.mouse, input.isTouch());
      input.drawTouch(g);
    }
  } else {
    drawTitleBackdrop(now / 1000);
  }
  requestAnimationFrame(frame);
}

// When the host's tab is hidden, browsers pause requestAnimationFrame and throttle timers.
// A worker clock keeps the match running for everyone else in the room.
let hiddenLast = performance.now();
try {
  const clock = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),16)'], { type: 'text/javascript' })));
  clock.onmessage = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - hiddenLast) / 1000); hiddenLast = now;
    if (document.hidden && mode === 'host') { last = now; simulate(dt); }
  };
} catch (e) { /* no workers: host simulation pauses while hidden */ }

// Animated backdrop behind the menus: a swinging warrior silhouette.
function drawTitleBackdrop(t) {
  const W = view.W, H = view.H;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#151923'); bg.addColorStop(1, '#0d1016');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const ax = W * 0.5, ay = 0, len = H * 0.62;
  const a = Math.sin(t * 1.4) * 0.9;
  const px = ax + Math.sin(a) * len, py = ay + Math.cos(a) * len;
  g.strokeStyle = 'rgba(61,224,200,0.25)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.stroke();
  g.fillStyle = 'rgba(255,77,94,0.25)';
  g.beginPath(); g.arc(px, py, 26, 0, Math.PI * 2); g.fill();
}

// ---- menu wiring ----
const firstGesture = () => unlockAudio();
addEventListener('pointerdown', firstGesture);
addEventListener('keydown', firstGesture);

$('btnPlay').onclick = startLocal;
$('btnOnline').onclick = () => {
  if (!netAvailable()) { setText('onlineErr', 'Network library failed to load. Check your connection.'); }
  $('nameOnline').value = settings.name; showScreen('online');
};
$('btnSettings').onclick = () => { syncSettingsUI(); showScreen('settings'); };
$('btnHowTo').onclick = () => showScreen('howto');
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { if (mode.startsWith('lobby')) leave(); else showScreen('title'); });

$('btnCreate').onclick = () => { saveName($('nameOnline').value); hostRoom(); };
$('btnJoin').onclick = () => { saveName($('nameOnline').value); joinRoom($('joinCode').value); };
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnStart').onclick = hostStart;
$('botMinus').onclick = () => { settings.bots = Math.max(0, settings.bots - 1); store.set('bots', settings.bots); refreshLobby(); syncSettingsUI(); };
$('botPlus').onclick = () => { settings.bots = Math.min(MAX_PLAYERS - 1, settings.bots + 1); store.set('bots', settings.bots); refreshLobby(); syncSettingsUI(); };
$('btnCopy').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + roomCode;
  try {
    if (navigator.share && input.isTouch()) await navigator.share({ title: 'Rope Warriors', text: 'Join my Rope Warriors room ' + roomCode, url });
    else { await navigator.clipboard.writeText(url); setText('copyNote', 'Link copied!'); }
  } catch (e) { setText('copyNote', url); }
};
$('btnAgain').onclick = () => {
  if (mode === 'local') { restartMatch(world); enterGame('local'); }
  else if (mode === 'host') { hostStart(); }
};
$('btnMenu').onclick = leave;
$('btnLeave').onclick = leave;
addEventListener('keydown', e => { if (e.code === 'Escape' && (mode === 'local' || mode === 'host' || mode === 'client')) leave(); });

function saveName(n) { settings.name = (n || '').trim().slice(0, 12); store.set('name', settings.name); }
function syncSettingsUI() {
  $('setName').value = settings.name;
  $('setBots').textContent = settings.bots;
  $('setSound').textContent = settings.sound ? 'ON' : 'OFF';
  $('setShake').textContent = settings.shake ? 'ON' : 'OFF';
}
$('setName').addEventListener('input', e => saveName(e.target.value));
$('setBotsMinus').onclick = () => $('botMinus').onclick();
$('setBotsPlus').onclick = () => $('botPlus').onclick();
$('setSound').onclick = () => { settings.sound = !settings.sound; store.set('sound', settings.sound); setSound(settings.sound); syncSettingsUI(); };
$('setShake').onclick = () => { settings.shake = !settings.shake; store.set('shake', settings.shake); syncSettingsUI(); };

// open the online screen directly from an invite link
const invite = new URLSearchParams(location.search).get('room');
if (invite) { $('joinCode').value = invite.toUpperCase().slice(0, 4); $('btnOnline').onclick(); }
else showScreen('title');

// debug hook for automated tests
window.__rw = { get mode() { return mode; }, get world() { return world; }, get mirror() { return mirror; }, get localId() { return localId; }, get code() { return roomCode; }, get view() { return view; } };

requestAnimationFrame(frame);
