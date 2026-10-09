// Player controller: arcade movement on top of the tile physics.
import { PHYS, DASH, MATCH, WEAPONS, PICKUP } from './config.js?v=3';
import { moveBody } from './map.js?v=3';
import { newRope, fireRope, releaseRope, updateHook, ropeControl, ropeConstraint } from './grapple.js?v=3';
import { tryFire } from './weapons.js?v=3';
import { killPlayer } from './health.js?v=3';

export const emptyInput = () => ({ l: false, r: false, u: false, d: false, fire: false, grap: false, dash: false, aim: 0 });

export function createPlayer(id, name, color, isBot = false) {
  return {
    id, name, color, isBot,
    x: 0, y: 0, vx: 0, vy: 0, w: PHYS.playerW, h: PHYS.playerH,
    onGround: false, facing: 1, aim: 0,
    hp: 100, alive: false, respawnT: 0.4, invuln: 0, flash: 0,
    weapon: 'pistol', ammo: Infinity, fireCd: 0,
    rope: newRope(), ropeCd: 0, grapHeld: false,
    fuel: PHYS.fuelMax, dashCd: 0, speedT: 0,
    kills: 0, deaths: 0, lastHitBy: null, lastHitT: -99,
    input: emptyInput(),
    bot: null,
  };
}

export function spawnPlayer(p, pos) {
  p.x = pos.x; p.y = pos.y - p.h / 2 - 0.5;
  p.vx = 0; p.vy = 0;
  p.hp = 100; p.alive = true; p.invuln = MATCH.invuln;
  p.weapon = 'pistol'; p.ammo = WEAPONS.pistol.ammo; p.fireCd = 0;
  p.rope.state = 'none'; p.ropeCd = 0; p.fuel = PHYS.fuelMax; p.dashCd = 0; p.speedT = 0;
  p.lastHitBy = null;
}

export function updatePlayer(p, world, dt) {
  if (!p.alive) return;
  const inp = p.input, map = world.map, roped = p.rope.state === 'attached';
  p.fireCd -= dt; p.ropeCd -= dt; p.dashCd -= dt; p.speedT -= dt; p.invuln -= dt; p.flash -= dt;
  p.aim = inp.aim;
  p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;

  const boost = p.speedT > 0 ? PICKUP.speed.mult : 1;
  const maxRun = PHYS.maxRun * boost;
  const move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);

  // horizontal
  if (move) {
    const accel = roped ? 1250 : p.onGround ? PHYS.runAccel : PHYS.airAccel;
    if (roped || Math.sign(p.vx) !== move || Math.abs(p.vx) < maxRun) {
      p.vx += move * accel * dt * boost;
      if (!roped && Math.abs(p.vx) > maxRun && p.onGround) p.vx = move * maxRun;
    }
  }
  if (p.onGround && (!move || Math.abs(p.vx) > maxRun)) p.vx *= Math.exp(-PHYS.groundFriction * dt);
  else if (!p.onGround && !roped) p.vx *= Math.exp(-0.35 * dt);

  // jump / short air thrust (not a jetpack: small fuel tank, refills on the ground)
  if (inp.u && !roped) {
    if (p.onGround) { p.vy = -PHYS.jumpVel; p.onGround = false; world.events.push({ e: 'jump', id: p.id }); }
    else if (p.fuel > 0 && p.vy > -PHYS.thrustMaxUp) { p.vy -= PHYS.thrust * dt; p.fuel -= dt; }
  }
  if (p.onGround) p.fuel = Math.min(PHYS.fuelMax, p.fuel + PHYS.fuelRegen * dt);

  // dash toward the aim
  if (inp.dash && p.dashCd <= 0) {
    p.vx = Math.cos(p.aim) * DASH.speed;
    p.vy = Math.sin(p.aim) * DASH.speed * 0.75;
    p.dashCd = DASH.cooldown;
    world.events.push({ e: 'dash', id: p.id, x: p.x, y: p.y });
  }

  // rope input: hold to grapple, release to let go
  if (inp.grap && !p.grapHeld) fireRope(p, world);
  if (!inp.grap && p.rope.state !== 'none') releaseRope(p);
  p.grapHeld = inp.grap;
  updateHook(p, world, dt);
  ropeControl(p, dt);

  p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > PHYS.maxSpeed) { p.vx *= PHYS.maxSpeed / sp; p.vy *= PHYS.maxSpeed / sp; }

  const res = moveBody(map, p, dt);
  p.onGround = res.ground;
  ropeConstraint(p, world, dt);

  if (inp.fire) tryFire(p, world);

  // fell into the pit
  if (p.y > map.pxH + 60) {
    const credit = world.time - p.lastHitT < MATCH.voidCredit ? p.lastHitBy : null;
    killPlayer(world, p, credit, 'void');
  }
}
