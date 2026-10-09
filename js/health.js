// Health, damage, death and respawn.
import { MATCH } from './config.js?v=3';
import { releaseRope } from './grapple.js?v=3';
import { spawnPlayer } from './player.js?v=3';

export function applyDamage(world, target, dmg, byId, kx, ky, cause) {
  if (!target.alive || target.invuln > 0 || world.state !== 'playing') return;
  target.hp -= dmg;
  target.vx += kx; target.vy += ky;
  target.flash = 0.12;
  if (byId !== target.id) { target.lastHitBy = byId; target.lastHitT = world.time; }
  world.events.push({ e: 'hit', id: target.id, by: byId, x: target.x, y: target.y, d: Math.round(dmg) });
  if (target.hp <= 0) {
    const killer = byId !== target.id ? byId
      : (world.time - target.lastHitT < MATCH.voidCredit ? target.lastHitBy : null);
    killPlayer(world, target, killer, cause);
  }
}

export function killPlayer(world, p, killerId, cause) {
  if (!p.alive) return;
  p.alive = false; p.hp = 0;
  p.respawnT = MATCH.respawn;
  releaseRope(p, false);
  p.deaths++;
  const killer = killerId != null && killerId !== p.id ? world.players.find(q => q.id === killerId) : null;
  if (killer) killer.kills++;
  world.events.push({ e: 'die', id: p.id, by: killer ? killer.id : null, x: p.x, y: p.y, c: cause });
}

// Spawn as far as possible from living enemies.
export function findSpawn(world, p) {
  let best = null, bestScore = -1;
  for (const s of world.map.spawns) {
    let nearest = 1e9;
    for (const q of world.players) if (q !== p && q.alive) nearest = Math.min(nearest, Math.hypot(q.x - s.x, q.y - s.y));
    const score = nearest + Math.random() * 120;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

export function updateRespawns(world, dt) {
  for (const p of world.players) {
    if (p.alive) continue;
    p.respawnT -= dt;
    if (p.respawnT <= 0) {
      spawnPlayer(p, findSpawn(world, p));
      world.events.push({ e: 'spawn', id: p.id, x: p.x, y: p.y });
    }
  }
}
