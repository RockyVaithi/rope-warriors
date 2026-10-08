// HUD (drawn on the canvas) and the DOM screens (title, online, lobby, settings, results).
import { WEAPONS, ROPE, DASH } from './config.js';
import { standings } from './match.js';
import { worldToScreen } from './render.js';

const FONT = '"Chakra Petch", system-ui, sans-serif';
const fmt = s => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

function pill(g, x, y, w, h) { g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); }

export function drawHUD(g, view, scene, fx, localId, mouse, isTouch) {
  const W = view.W, H = view.H;
  const me = scene.players.find(p => p.id === localId);
  g.save();
  g.textBaseline = 'middle';

  // timer
  g.fillStyle = 'rgba(11,13,18,0.75)';
  pill(g, W / 2 - 48, 10, 96, 34);
  g.fillStyle = scene.timeLeft < 30 ? '#ff4d5e' : '#ffffff';
  g.font = `800 20px ${FONT}`; g.textAlign = 'center';
  g.fillText(fmt(scene.timeLeft), W / 2, 28);

  // scores (top-left)
  const rows = standings(scene.players);
  g.font = `700 14px ${FONT}`; g.textAlign = 'left';
  rows.slice(0, 8).forEach((p, i) => {
    const y = 16 + i * 24, isMe = p.id === localId;
    g.fillStyle = isMe ? 'rgba(255,255,255,0.16)' : 'rgba(11,13,18,0.6)';
    pill(g, 10, y, 132, 20);
    g.fillStyle = p.color; g.beginPath(); g.arc(22, y + 10, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillText((isMe ? 'YOU' : p.name).slice(0, 10), 32, y + 10.5);
    g.textAlign = 'right'; g.fillText(String(p.kills), 134, y + 10.5); g.textAlign = 'left';
  });

  // kill feed (top-right)
  g.textAlign = 'right'; g.font = `700 13px ${FONT}`;
  fx.feed.forEach((f, i) => {
    const y = 22 + i * 22;
    g.globalAlpha = Math.min(1, f.t);
    const how = f.c === 'void' ? ' ⤓ ' : f.c === 'rocket' ? ' ✸ ' : f.c === 'shotgun' ? ' ⁂ ' : ' • ';
    const victim = f.vid === localId ? 'YOU' : f.v;
    const killer = f.k ? (f.kid === localId ? 'YOU' : f.k) : '';
    const txt = (killer ? killer + how : '') + victim + (f.k ? '' : ' fell');
    const tw = g.measureText(txt).width + 18;
    g.fillStyle = 'rgba(11,13,18,0.6)'; pill(g, W - 10 - tw, y - 10, tw, 20);
    let x = W - 19;
    g.fillStyle = f.vc; g.fillText(victim + (f.k ? '' : ' fell'), x, y); x -= g.measureText(victim + (f.k ? '' : ' fell')).width;
    if (killer) { g.fillStyle = '#9aa3b5'; g.fillText(how, x, y); x -= g.measureText(how).width; g.fillStyle = f.kc; g.fillText(killer, x, y); }
  });
  g.globalAlpha = 1;

  if (me) {
    // weapon + ammo (bottom-right, above touch sticks on phones)
    const W0 = WEAPONS[me.weapon];
    const bx = isTouch ? W / 2 + 58 : W - 180, by = isTouch ? 8 : H - 62;
    g.fillStyle = 'rgba(11,13,18,0.7)'; pill(g, bx, by, 168, 48);
    g.textAlign = 'left'; g.fillStyle = W0.color; g.font = `800 18px ${FONT}`;
    g.fillText(W0.name, bx + 18, by + 18);
    g.fillStyle = '#c9d0de'; g.font = `600 12px ${FONT}`;
    g.fillText(Number.isFinite(me.ammo) ? `${me.ammo} SHOTS` : '∞ AMMO', bx + 18, by + 35);
    // rope + dash readiness
    const ready = (label, frac, x) => {
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 4;
      g.beginPath(); g.arc(x, by + 18, 8, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = frac >= 1 ? '#3de0c8' : '#9aa3b5';
      g.beginPath(); g.arc(x, by + 18, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac)); g.stroke();
      g.fillStyle = frac >= 1 ? '#3de0c8' : '#9aa3b5'; g.font = `700 8px ${FONT}`; g.textAlign = 'center'; g.fillText(label, x, by + 38);
    };
    ready('ROPE', me.rope.state !== 'none' ? 1 : 1 - Math.max(0, me.ropeCd) / ROPE.cooldown, bx + 122);
    ready('DASH', 1 - Math.max(0, me.dashCd) / DASH.cooldown, bx + 150);

    // crosshair
    if (!isTouch && me.alive && mouse.seen) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      const { x, y } = mouse;
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 15, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 15, y);
      g.moveTo(x, y - 15); g.lineTo(x, y - 5); g.moveTo(x, y + 5); g.lineTo(x, y + 15); g.stroke();
    } else if (isTouch && me.alive) {
      const s = worldToScreen(view, me.x + Math.cos(me.aim) * 90, me.y - 6 + Math.sin(me.aim) * 90);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, s.y, 7, 0, Math.PI * 2); g.stroke();
    }

    // respawn countdown
    if (!me.alive && scene.state === 'playing') {
      g.fillStyle = 'rgba(11,13,18,0.55)'; g.fillRect(0, H / 2 - 44, W, 88);
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`;
      g.fillText('RESPAWNING', W / 2, H / 2 - 10);
      g.font = `600 15px ${FONT}`; g.fillStyle = '#c9d0de';
      g.fillText(me.respawnT > 0 ? me.respawnT.toFixed(1) + 's' : '', W / 2, H / 2 + 20);
    }
  }

  if (fx.banner) {
    g.globalAlpha = Math.min(1, fx.banner.t * 2);
    g.textAlign = 'center'; g.font = `800 22px ${FONT}`;
    g.strokeStyle = '#0b0d12'; g.lineWidth = 5; g.strokeText(fx.banner.text, W / 2, 74);
    g.fillStyle = '#ffe38a'; g.fillText(fx.banner.text, W / 2, 74);
    g.globalAlpha = 1;
  }
  g.restore();
}

// ---------- DOM screens ----------
const $ = id => document.getElementById(id);
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  document.body.classList.toggle('ingame', id === null);
}
export function setText(id, t) { $(id).textContent = t; }

export function renderLobby(players, code, isHost, botCount) {
  $('lobbyCode').textContent = code;
  const list = $('lobbyList');
  list.replaceChildren(...players.map(p => {
    const row = document.createElement('div'); row.className = 'lrow';
    const dot = document.createElement('i'); dot.style.background = p.color;
    const nm = document.createElement('span'); nm.textContent = p.name + (p.bot ? ' (bot)' : '') + (p.me ? ' — you' : '');
    row.append(dot, nm); return row;
  }));
  $('hostControls').style.display = isHost ? '' : 'none';
  $('lobbyWait').style.display = isHost ? 'none' : '';
  $('botCount').textContent = botCount;
}

export function renderResults(players, localId, canRestart) {
  const rows = standings(players);
  const win = rows[0];
  $('resTitle').textContent = win ? (win.id === localId ? 'YOU WIN!' : win.name + ' WINS') : 'MATCH OVER';
  $('resList').replaceChildren(...rows.map((p, i) => {
    const r = document.createElement('div'); r.className = 'rrow' + (p.id === localId ? ' me' : '');
    const rank = document.createElement('b'); rank.textContent = i + 1;
    const dot = document.createElement('i'); dot.style.background = p.color;
    const nm = document.createElement('span'); nm.textContent = p.id === localId ? 'YOU' : p.name;
    const k = document.createElement('em'); k.textContent = `${p.kills} K · ${p.deaths} D`;
    r.append(rank, dot, nm, k); return r;
  }));
  $('btnAgain').style.display = canRestart ? '' : 'none';
  $('resWait').style.display = canRestart ? 'none' : '';
}
