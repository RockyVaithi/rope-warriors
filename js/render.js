// Canvas renderer: arena, warriors, ropes, projectiles, pickups, particles.
import { TILE, WEAPONS, PICKUP } from './config.js?v=3';
import { tileAt } from './map.js?v=3';

const OUTLINE = '#0b0d12';
let mapCanvas = null;

// Draw the static arena once into an offscreen canvas.
function buildMapCanvas(map) {
  const c = document.createElement('canvas');
  c.width = map.pxW; c.height = map.pxH + 160;
  const g = c.getContext('2d');
  // pit glow
  const pit = map.pit;
  const pg = g.createLinearGradient(0, pit.floorY, 0, map.pxH + 160);
  pg.addColorStop(0, 'rgba(255,77,94,0)'); pg.addColorStop(1, 'rgba(255,77,94,0.35)');
  g.fillStyle = pg; g.fillRect(pit.x0, pit.floorY, pit.x1 - pit.x0, map.pxH + 160 - pit.floorY);
  for (let ty = 0; ty < map.H; ty++) for (let tx = 0; tx < map.W; tx++) {
    const t = tileAt(map, tx, ty);
    if (!t) continue;
    const x = tx * TILE, y = ty * TILE;
    g.fillStyle = t === 2 ? '#22343b' : '#2a2f3b';
    g.fillRect(x, y, TILE, TILE);
    // subtle texture
    g.fillStyle = t === 2 ? 'rgba(61,224,200,0.05)' : 'rgba(255,255,255,0.025)';
    if ((tx + ty) % 2) g.fillRect(x, y, TILE, TILE);
    // exposed edges: dark outline, and a teal "rope-able" strip on grapple tiles
    const open = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => !tileAt(map, tx + dx, ty + dy) && !(ty + dy >= map.H));
    g.fillStyle = OUTLINE;
    if (open[0]) g.fillRect(x, y, TILE, 3);
    if (open[1]) g.fillRect(x, y + TILE - 3, TILE, 3);
    if (open[2]) g.fillRect(x, y, 3, TILE);
    if (open[3]) g.fillRect(x + TILE - 3, y, 3, TILE);
    if (t === 2) {
      g.fillStyle = '#3de0c8';
      if (open[0]) g.fillRect(x, y + 3, TILE, 3);
      if (open[1]) g.fillRect(x, y + TILE - 6, TILE, 3);
      if (open[2]) g.fillRect(x + 3, y, 3, TILE);
      if (open[3]) g.fillRect(x + TILE - 6, y, 3, TILE);
      g.fillStyle = 'rgba(61,224,200,0.55)';
      g.beginPath(); g.arc(x + TILE / 2, y + TILE / 2, 2.5, 0, Math.PI * 2); g.fill();
    } else if (open[0]) {
      g.fillStyle = '#3a4152'; g.fillRect(x, y + 3, TILE, 3);
    }
  }
  // hazard chevrons at the pit edges
  g.fillStyle = '#ff4d5e';
  for (const ex of [pit.x0 - 4, pit.x1]) for (let i = 0; i < 3; i++) g.fillRect(ex, pit.floorY + 6 + i * 22, 4, 12);
  return c;
}

function drawBackground(g, view, map) {
  const { W, H } = view;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#151923'); bg.addColorStop(1, '#0f1218');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // far parallax silhouettes
  g.save();
  const s = view.scale * 0.5;
  g.translate(W / 2 - view.cam.x * s, H / 2 - view.cam.y * s);
  g.fillStyle = '#1a1f2b';
  const blocks = [[-300, 200, 260, 900], [120, 380, 180, 700], [420, 120, 140, 900], [700, 300, 300, 800], [1150, 160, 160, 900], [1420, 330, 260, 800], [1800, 220, 200, 900], [2150, 380, 240, 700]];
  for (const [x, y, w, h] of blocks) g.fillRect(x, y, w, h);
  g.restore();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt), gg = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${gg},${b})`;
}

function drawRope(g, p) {
  const r = p.rope;
  if (!r || r.state === 'none') return;
  const hx = p.x, hy = p.y - 6;
  g.lineCap = 'round';
  g.strokeStyle = OUTLINE; g.lineWidth = 5;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(r.x, r.y); g.stroke();
  g.strokeStyle = lighten(p.color, 70); g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(r.x, r.y); g.stroke();
  // hook
  g.fillStyle = r.state === 'attached' ? '#3de0c8' : '#e8ecf4';
  g.strokeStyle = OUTLINE; g.lineWidth = 2;
  g.beginPath(); g.arc(r.x, r.y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
}

function drawGun(g, p) {
  const W = { pistol: [16, 6], shotgun: [24, 8], rocket: [28, 11] }[p.weapon] || [16, 6];
  g.save();
  g.translate(p.x, p.y - 6);
  g.rotate(p.aim);
  if (Math.cos(p.aim) < 0) g.scale(1, -1);
  g.fillStyle = OUTLINE;
  g.fillRect(4, -W[1] / 2 - 2, W[0] + 4, W[1] + 4);
  g.fillStyle = p.weapon === 'rocket' ? '#7d8a5a' : p.weapon === 'shotgun' ? '#8a6a4a' : '#5c6478';
  g.fillRect(6, -W[1] / 2, W[0], W[1]);
  if (p.weapon === 'rocket') { g.fillStyle = '#ff7a45'; g.fillRect(6 + W[0] - 5, -W[1] / 2, 5, W[1]); }
  g.restore();
}

function drawWarrior(g, p, time, isLocal) {
  if (!p.alive) return;
  const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
  g.globalAlpha = blink ? 0.35 : 1;
  const x = p.x, y = p.y, f = p.facing;
  const run = p.onGround && Math.abs(p.vx) > 30 ? Math.sin(time * 22 + p.id) : 0;
  const squash = p.onGround ? 1 : 1.06;

  // speed boost aura
  if (p.speedT > 0) {
    g.fillStyle = 'rgba(61,224,224,0.18)';
    g.beginPath(); g.ellipse(x, y, 22, 24, 0, 0, Math.PI * 2); g.fill();
  }
  // feet
  g.fillStyle = OUTLINE;
  g.beginPath(); g.arc(x - 6 + run * 4, y + 15, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(x + 6 - run * 4, y + 15, 5, 0, Math.PI * 2); g.fill();
  // body
  g.fillStyle = p.flash > 0 ? '#ffffff' : p.color;
  g.strokeStyle = OUTLINE; g.lineWidth = 3.5;
  g.beginPath(); g.ellipse(x, y + 1, 13, 15 * squash, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  // headband tails (flap with speed)
  g.strokeStyle = OUTLINE; g.lineWidth = 3;
  const flap = Math.max(-1, Math.min(1, -p.vx / 400));
  g.beginPath(); g.moveTo(x - f * 10, y - 8); g.quadraticCurveTo(x - f * 18, y - 10 + flap * 3, x - f * 24, y - 4 + Math.abs(flap) * -6); g.stroke();
  g.strokeStyle = lighten(p.color, 90); g.lineWidth = 1.5; g.stroke();
  // band + visor
  g.fillStyle = OUTLINE; g.fillRect(x - 13, y - 10, 26, 5);
  g.fillStyle = '#f3f6ff';
  g.beginPath(); g.ellipse(x + f * 5, y - 2, 6, 4.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = OUTLINE;
  const ex = Math.cos(p.aim) * 2, ey = Math.sin(p.aim) * 2;
  g.beginPath(); g.arc(x + f * 6 + ex, y - 2 + ey, 2, 0, Math.PI * 2); g.fill();
  drawGun(g, p);
  g.globalAlpha = 1;

  // health bar only when hurt
  if (p.hp < 100) {
    const w = 34, hpw = Math.max(0, p.hp) / 100 * w;
    g.fillStyle = OUTLINE; g.fillRect(x - w / 2 - 2, y - 34, w + 4, 7);
    g.fillStyle = p.hp > 50 ? '#3ddc84' : p.hp > 25 ? '#ffc93d' : '#ff4d5e';
    g.fillRect(x - w / 2, y - 32, hpw, 3);
  }
  // name tag
  g.font = '700 11px "Chakra Petch", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = isLocal ? '#ffffff' : lighten(p.color, 40);
  g.globalAlpha = 0.85;
  g.fillText(isLocal ? 'YOU' : p.name, x, y - (p.hp < 100 ? 38 : 30));
  g.globalAlpha = 1;
}

function drawPickup(g, pk, time) {
  if (!pk.active) return;
  const bob = Math.sin(time * 3 + pk.x) * 3, x = pk.x, y = pk.y + bob;
  g.strokeStyle = OUTLINE; g.lineWidth = 3;
  if (pk.kind === 'health') {
    g.fillStyle = '#3ddc84';
    g.beginPath(); g.roundRect(x - 11, y - 11, 22, 22, 5); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(x - 2.5, y - 7, 5, 14); g.fillRect(x - 7, y - 2.5, 14, 5);
  } else if (pk.kind === 'speed') {
    g.fillStyle = '#3de0e0'; g.lineWidth = 2.5;
    g.save(); g.translate(x, y); g.scale(1.35, 1.35); g.translate(-x, -y);
    g.beginPath(); g.moveTo(x + 3, y - 13); g.lineTo(x - 8, y + 2); g.lineTo(x - 1, y + 2); g.lineTo(x - 4, y + 13); g.lineTo(x + 8, y - 3); g.lineTo(x + 1, y - 3); g.closePath(); g.stroke(); g.fill(); g.restore();
  } else {
    g.fillStyle = '#ffc93d';
    g.beginPath(); g.roundRect(x - 15, y - 10, 30, 20, 4); g.fill(); g.stroke();
    g.fillStyle = OUTLINE; g.font = '800 9px "Chakra Petch", sans-serif'; g.textAlign = 'center';
    g.fillText(pk.wk === 'rocket' ? 'RKT' : 'SHG', x, y + 3.5);
  }
}

function drawProjectile(g, pr) {
  const W = WEAPONS[pr.w];
  if (W.kind === 'rocket') {
    const a = Math.atan2(pr.vy, pr.vx);
    g.save(); g.translate(pr.x, pr.y); g.rotate(a);
    g.fillStyle = OUTLINE; g.fillRect(-10, -5, 20, 10);
    g.fillStyle = '#d9dde8'; g.fillRect(-8, -3, 14, 6);
    g.fillStyle = '#ff7a45'; g.fillRect(4, -3, 4, 6);
    g.fillStyle = '#ffd28a'; g.beginPath(); g.arc(-11, 0, 3 + Math.random() * 2, 0, Math.PI * 2); g.fill();
    g.restore();
  } else {
    const sp = Math.hypot(pr.vx, pr.vy) || 1, len = pr.w === 'shotgun' ? 8 : 14;
    g.strokeStyle = W.color; g.lineWidth = pr.w === 'shotgun' ? 2.5 : 3;
    g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x - pr.vx / sp * len, pr.y - pr.vy / sp * len); g.stroke();
  }
}

function drawParticles(g, fx) {
  for (const p of fx.parts) {
    const a = Math.max(0, p.life / p.max);
    g.globalAlpha = a;
    if (p.ring) {
      g.strokeStyle = p.color; g.lineWidth = 4 * a + 1;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.stroke();
    } else {
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  g.textAlign = 'center';
  for (const t of fx.texts) {
    g.globalAlpha = Math.min(1, t.life * 2);
    g.font = '800 14px "Chakra Petch", system-ui, sans-serif';
    g.strokeStyle = OUTLINE; g.lineWidth = 3; g.strokeText(t.t, t.x, t.y);
    g.fillStyle = t.color; g.fillText(t.t, t.x, t.y);
  }
  g.globalAlpha = 1;
}

// scene: { map, players[], projectiles[], pickups[], time }
export function renderScene(g, view, scene, fx, localId) {
  if (!mapCanvas) mapCanvas = buildMapCanvas(scene.map);
  drawBackground(g, view, scene.map);
  const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake;
  g.save();
  g.translate(view.W / 2 + sx, view.H / 2 + sy);
  g.scale(view.scale, view.scale);
  g.translate(-view.cam.x, -view.cam.y);
  g.drawImage(mapCanvas, 0, 0);
  for (const pk of scene.pickups) drawPickup(g, pk, scene.time);
  for (const p of scene.players) if (p.alive) drawRope(g, p);
  for (const pr of scene.projectiles) drawProjectile(g, pr);
  for (const p of scene.players) if (p.id !== localId) drawWarrior(g, p, scene.time, false);
  const me = scene.players.find(p => p.id === localId);
  if (me) drawWarrior(g, me, scene.time, true);
  drawParticles(g, fx);
  g.restore();
  // hurt vignette
  if (fx.hurtT > 0) {
    const v = g.createRadialGradient(view.W / 2, view.H / 2, Math.min(view.W, view.H) * 0.3, view.W / 2, view.H / 2, Math.max(view.W, view.H) * 0.7);
    v.addColorStop(0, 'rgba(255,40,60,0)'); v.addColorStop(1, `rgba(255,40,60,${0.35 * fx.hurtT / 0.25})`);
    g.fillStyle = v; g.fillRect(0, 0, view.W, view.H);
  }
}

export const worldToScreen = (view, x, y) => ({ x: (x - view.cam.x) * view.scale + view.W / 2, y: (y - view.cam.y) * view.scale + view.H / 2 });
export const screenToWorld = (view, x, y) => ({ x: (x - view.W / 2) / view.scale + view.cam.x, y: (y - view.H / 2) / view.scale + view.cam.y });
export const PICKUP_INFO = PICKUP;
