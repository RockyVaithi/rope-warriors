// Bullets, pellets and rockets.
import { WEAPONS } from './config.js?v=3';
import { tileAtPx } from './map.js?v=3';
import { applyDamage } from './health.js?v=3';

export function spawnProjectile(world, weapon, owner, x, y, angle) {
  const W = WEAPONS[weapon];
  world.projectiles.push({
    w: weapon, owner, x, y,
    vx: Math.cos(angle) * W.speed, vy: Math.sin(angle) * W.speed,
    life: W.range,
  });
}

const ownerIsBot = (world, id) => { const o = world.players.find(q => q.id === id); return !!(o && o.bot); };

function hitsPlayer(p, x, y, pad) {
  return p.alive && Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(y - p.y) < p.h / 2 + pad;
}

export function explode(world, x, y, owner, direct) {
  const W = WEAPONS.rocket, R = W.splash;
  for (const p of world.players) {
    if (!p.alive) continue;
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (p !== direct && d > R + 14) continue;
    const f = p === direct ? 1 : Math.max(0, 1 - d / (R + 14));
    const self = p.id === owner;
    const dmg = W.dmg * f * (self ? 0.4 : 1);
    const n = d || 1;
    // rocket jumps: self knockback is generous, damage is small
    const kb = W.kb * f * (self ? 1.15 : 1);
    applyDamage(world, p, dmg, owner, dx / n * kb, dy / n * kb - 160 * f, 'rocket');
  }
  world.events.push({ e: 'boom', x, y });
}

export function updateProjectiles(world, dt) {
  const out = [];
  for (const pr of world.projectiles) {
    const W = WEAPONS[pr.w];
    const dist = Math.hypot(pr.vx, pr.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / 6));
    let dead = false;
    for (let i = 0; i < n && !dead; i++) {
      pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
      if (tileAtPx(world.map, pr.x, pr.y)) {
        if (W.kind === 'rocket') explode(world, pr.x - pr.vx * dt / n, pr.y - pr.vy * dt / n, pr.owner, null);
        else world.events.push({ e: 'spark', x: pr.x, y: pr.y });
        dead = true; break;
      }
      for (const p of world.players) {
        if (p.id === pr.owner || !hitsPlayer(p, pr.x, pr.y, W.kind === 'rocket' ? 8 : (ownerIsBot(world, pr.owner) ? 3 : 8))) continue;
        if (W.kind === 'rocket') explode(world, pr.x, pr.y, pr.owner, p);
        else {
          const sp = Math.hypot(pr.vx, pr.vy);
          applyDamage(world, p, W.dmg * (ownerIsBot(world, pr.owner) && !p.bot ? 0.7 : 1), pr.owner, pr.vx / sp * W.kb, pr.vy / sp * W.kb - 40, pr.w);
        }
        dead = true; break;
      }
    }
    pr.life -= dist;
    if (!dead && pr.life <= 0) {
      if (W.kind === 'rocket') explode(world, pr.x, pr.y, pr.owner, null);
      dead = true;
    }
    if (!dead) out.push(pr);
  }
  world.projectiles = out;
}
