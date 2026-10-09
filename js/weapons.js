// Weapon system: firing, spread, recoil, ammo.
import { WEAPONS } from './config.js?v=3';
import { tileAtPx } from './map.js?v=3';
import { spawnProjectile } from './projectiles.js?v=3';
import { handY } from './grapple.js?v=3';
import { lineOfSight } from './map.js?v=3';

// Humans get a generous snap toward an enemy near the crosshair. Bots aim on their own.
const ASSIST_CONE = 0.32; // radians (~18 degrees) either side of the crosshair
function assistedAim(p, world, W) {
  if (p.bot) return p.aim;
  let best = null, bestDiff = ASSIST_CONE;
  for (const q of world.players) {
    if (q === p || !q.alive) continue;
    const dx = q.x - p.x, dy = q.y - handY(p), d = Math.hypot(dx, dy);
    if (d > W.range) continue;
    const t = W.kind === 'rocket' ? d / W.speed : d / W.speed * 0.8;   // lead moving targets
    const a = Math.atan2(q.y + q.vy * t - handY(p), q.x + q.vx * t - p.x);
    const diff = Math.abs(Math.atan2(Math.sin(a - p.aim), Math.cos(a - p.aim)));
    if (diff < bestDiff && lineOfSight(world.map, p.x, handY(p), q.x, q.y)) { bestDiff = diff; best = a; }
  }
  return best === null ? p.aim : best;
}

export function giveWeapon(p, id) {
  p.weapon = id;
  p.ammo = WEAPONS[id].ammo;
  p.fireCd = Math.min(p.fireCd, 0.15);
}

export function tryFire(p, world) {
  if (p.fireCd > 0) return;
  const W = WEAPONS[p.weapon];
  p.fireCd = W.cd;
  const aim = assistedAim(p, world, W);
  const cos = Math.cos(aim), sin = Math.sin(aim);
  let mx = p.x + cos * 20, my = handY(p) + sin * 20;
  if (tileAtPx(world.map, mx, my)) { mx = p.x; my = handY(p); }   // muzzle inside a wall
  for (let i = 0; i < W.pellets; i++) {
    const a = aim + (Math.random() - 0.5) * W.spread * (p.bot ? 1 : 0.6);
    spawnProjectile(world, p.weapon, p.id, mx, my, a);
  }
  // recoil: the shotgun doubles as a mid-air movement tool
  const airMult = p.onGround ? 0.35 : 1;
  p.vx -= cos * W.recoil * airMult;
  p.vy -= sin * W.recoil * airMult;
  if (Number.isFinite(p.ammo)) {
    p.ammo--;
    if (p.ammo <= 0) giveWeapon(p, 'pistol');
  }
  world.events.push({ e: 'shot', id: p.id, w: p.weapon, x: mx, y: my, a: aim });
}
