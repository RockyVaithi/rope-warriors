// Particles, floating damage numbers, screen shake, kill feed, and sounds — all driven by world events.
// Runs identically on the host and on clients, so everyone sees the same feedback.
import { sfx } from './audio.js';
import { WEAPONS } from './config.js';

export function createEffects() {
  return { parts: [], texts: [], shake: 0, feed: [], hurtT: 0, banner: null };
}

const rand = (a, b) => a + Math.random() * (b - a);

function burst(fx, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, size: rand(size * 0.5, size), color, g: 600 });
  }
}

export function spawnEffect(fx, ev, ctx) {
  // ctx: { localId, players(Map id->player), listener {x,y}, shakeOn }
  const vol = (ev.x != null && ctx.listener) ? Math.max(0.15, 1 - Math.hypot(ev.x - ctx.listener.x, ev.y - ctx.listener.y) / 1400) : 1;
  const P = id => ctx.players.get(id);
  switch (ev.e) {
    case 'shot': {
      const W = WEAPONS[ev.w];
      for (let i = 0; i < (ev.w === 'shotgun' ? 6 : 3); i++) {
        const a = ev.a + rand(-0.4, 0.4), s = rand(150, 420);
        fx.parts.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.09, max: 0.09, size: rand(3, 6), color: W.color, g: 0 });
      }
      sfx[ev.w](vol);
      if (ev.id === ctx.localId && ev.w !== 'pistol') addShake(fx, ev.w === 'shotgun' ? 5 : 4, ctx);
      break;
    }
    case 'hit': {
      const p = P(ev.id);
      burst(fx, ev.x, ev.y, 6, p ? p.color : '#fff', 260, 0.35, 4);
      fx.texts.push({ x: ev.x + rand(-8, 8), y: ev.y - 26, t: ev.d, life: 0.7, color: ev.by === ctx.localId ? '#ffe38a' : '#fff' });
      if (ev.id === ctx.localId) { addShake(fx, 6, ctx); fx.hurtT = 0.25; sfx.hurt(); }
      else if (ev.by === ctx.localId) sfx.hit(1);
      break;
    }
    case 'die': {
      const p = P(ev.id), k = ev.by != null ? P(ev.by) : null;
      burst(fx, ev.x, ev.y, 26, p ? p.color : '#fff', 520, 0.8, 7);
      burst(fx, ev.x, ev.y, 10, '#ffffff', 300, 0.4, 4);
      fx.parts.push({ ring: true, x: ev.x, y: ev.y, r: 8, vr: 380, life: 0.3, max: 0.3, color: p ? p.color : '#fff' });
      sfx.die(vol);
      if (ev.id === ctx.localId) addShake(fx, 10, ctx);
      if (ev.by === ctx.localId) { sfx.kill(); fx.banner = { text: 'ELIMINATED ' + (p ? p.name : ''), t: 1.2 }; }
      fx.feed.unshift({ k: k ? k.name : null, kc: k ? k.color : null, v: p ? p.name : '?', vc: p ? p.color : '#fff', c: ev.c, t: 5, kid: ev.by, vid: ev.id });
      fx.feed.length = Math.min(fx.feed.length, 5);
      break;
    }
    case 'boom': {
      burst(fx, ev.x, ev.y, 30, '#ff9a45', 520, 0.55, 8);
      burst(fx, ev.x, ev.y, 14, '#fff3c4', 300, 0.3, 6);
      burst(fx, ev.x, ev.y, 12, '#555a66', 160, 0.9, 10);
      fx.parts.push({ ring: true, x: ev.x, y: ev.y, r: 10, vr: 520, life: 0.22, max: 0.22, color: '#ffd28a' });
      sfx.boom(vol);
      addShake(fx, 14 * vol, ctx);
      break;
    }
    case 'spark': burst(fx, ev.x, ev.y, 4, '#ffe38a', 220, 0.2, 3); break;
    case 'ropefire': sfx.rope(ev.id === ctx.localId ? 1 : 0.4); break;
    case 'ropehit': burst(fx, ev.x, ev.y, 5, '#3de0c8', 160, 0.25, 3); sfx.ropeHit(ev.id === ctx.localId ? 1 : 0.3); break;
    case 'jump': if (ev.id === ctx.localId) sfx.jump(1); break;
    case 'dash': burst(fx, ev.x, ev.y, 10, '#cfd6e6', 200, 0.3, 5); sfx.dash(vol); break;
    case 'pick': {
      burst(fx, ev.x, ev.y, 12, ev.k === 'health' ? '#3ddc84' : ev.k === 'speed' ? '#3de0e0' : '#ffc93d', 240, 0.4, 4);
      if (ev.id === ctx.localId) {
        sfx.pick();
        fx.texts.push({ x: ev.x, y: ev.y - 20, t: ev.k === 'health' ? '+HEALTH' : ev.k === 'speed' ? 'SPEED!' : WEAPONS[ev.w].name, life: 0.9, color: '#fff' });
      }
      break;
    }
    case 'spawn': if (ev.id === ctx.localId) sfx.spawn(); burst(fx, ev.x, ev.y, 10, '#ffffff', 200, 0.3, 3); break;
    case 'end': sfx.end(); break;
  }
}

function addShake(fx, amt, ctx) { if (ctx.shakeOn) fx.shake = Math.min(18, fx.shake + amt); }

export function updateEffects(fx, dt) {
  for (const p of fx.parts) {
    p.life -= dt;
    if (p.ring) { p.r += p.vr * dt; continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-1.5 * dt);
  }
  fx.parts = fx.parts.filter(p => p.life > 0);
  for (const t of fx.texts) { t.life -= dt; t.y -= 40 * dt; }
  fx.texts = fx.texts.filter(t => t.life > 0);
  for (const f of fx.feed) f.t -= dt;
  fx.feed = fx.feed.filter(f => f.t > 0);
  fx.shake *= Math.exp(-10 * dt);
  fx.hurtT -= dt;
  if (fx.banner) { fx.banner.t -= dt; if (fx.banner.t <= 0) fx.banner = null; }
}

// Trail particles for rockets in flight (called per frame by the renderer's caller).
export function rocketTrail(fx, pr) {
  fx.parts.push({ x: pr.x, y: pr.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.45, max: 0.45, size: rand(4, 7), color: '#6b7080', g: -40 });
}
