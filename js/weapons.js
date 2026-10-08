// Weapon system: firing, spread, recoil, ammo.
import { WEAPONS } from './config.js';
import { tileAtPx } from './map.js';
import { spawnProjectile } from './projectiles.js';
import { handY } from './grapple.js';

export function giveWeapon(p, id) {
  p.weapon = id;
  p.ammo = WEAPONS[id].ammo;
  p.fireCd = Math.min(p.fireCd, 0.15);
}

export function tryFire(p, world) {
  if (p.fireCd > 0) return;
  const W = WEAPONS[p.weapon];
  p.fireCd = W.cd;
  const cos = Math.cos(p.aim), sin = Math.sin(p.aim);
  let mx = p.x + cos * 20, my = handY(p) + sin * 20;
  if (tileAtPx(world.map, mx, my)) { mx = p.x; my = handY(p); }   // muzzle inside a wall
  for (let i = 0; i < W.pellets; i++) {
    const a = p.aim + (Math.random() - 0.5) * W.spread;
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
  world.events.push({ e: 'shot', id: p.id, w: p.weapon, x: mx, y: my, a: p.aim });
}
