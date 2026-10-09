// Health, weapon crates and speed boosts. They respawn after a short delay.
import { PICKUP } from './config.js?v=3';
import { giveWeapon } from './weapons.js?v=3';

const WEAPON_CYCLE = ['shotgun', 'rocket'];

export function createPickups(map) {
  return map.pickups.map((pk, i) => ({
    i, kind: pk.kind, x: pk.x, y: pk.y - 16, active: true, t: 0,
    wk: WEAPON_CYCLE[i % 2],
  }));
}

export function updatePickups(world, dt) {
  for (const pk of world.pickups) {
    if (!pk.active) {
      pk.t -= dt;
      if (pk.t <= 0) {
        pk.active = true;
        if (pk.kind === 'weapon') pk.wk = WEAPON_CYCLE[Math.random() < 0.5 ? 0 : 1];
      }
      continue;
    }
    for (const p of world.players) {
      if (!p.alive || Math.abs(p.x - pk.x) > 26 || Math.abs(p.y - pk.y) > 30) continue;
      if (pk.kind === 'health') {
        if (p.hp >= 100) continue;
        p.hp = Math.min(100, p.hp + PICKUP.health.amount);
      } else if (pk.kind === 'weapon') giveWeapon(p, pk.wk);
      else if (pk.kind === 'speed') p.speedT = PICKUP.speed.duration;
      pk.active = false;
      pk.t = PICKUP[pk.kind].respawn;
      world.events.push({ e: 'pick', id: p.id, k: pk.kind, w: pk.wk, x: pk.x, y: pk.y });
      break;
    }
  }
}
