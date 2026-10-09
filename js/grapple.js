// Grappling rope: the signature mechanic.
// States: 'none' -> 'flying' (hook travelling) -> 'attached' (swinging) -> 'none'.
import { ROPE } from './config.js?v=3';
import { raycast, moveBody } from './map.js?v=3';

export const handY = p => p.y - 6;

export function newRope() {
  return { state: 'none', x: 0, y: 0, vx: 0, vy: 0, travelled: 0, len: 0 };
}

export function fireRope(p, world) {
  const r = p.rope;
  if (r.state !== 'none' || p.ropeCd > 0) return;
  r.state = 'flying';
  r.x = p.x; r.y = handY(p);
  r.vx = Math.cos(p.aim) * ROPE.hookSpeed;
  r.vy = Math.sin(p.aim) * ROPE.hookSpeed;
  r.travelled = 0;
  world.events.push({ e: 'ropefire', id: p.id });
}

export function releaseRope(p, boost = true) {
  const r = p.rope;
  if (r.state === 'attached' && boost) { p.vx *= ROPE.releaseBoost; p.vy *= ROPE.releaseBoost; }
  if (r.state !== 'none') p.ropeCd = r.state === 'attached' ? ROPE.cooldown : ROPE.missCooldown;
  r.state = 'none';
}

// Moves a flying hook. Sticks only to grapple tiles (value 2).
export function updateHook(p, world, dt) {
  const r = p.rope;
  if (r.state !== 'flying') return;
  const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
  const hit = raycast(world.map, r.x, r.y, nx, ny, 4);
  r.travelled += Math.hypot(nx - r.x, ny - r.y);
  if (hit.hit) {
    if (hit.t === 2) {
      r.state = 'attached';
      r.x = hit.px; r.y = hit.py;
      r.len = Math.max(ROPE.minLen, Math.hypot(p.x - r.x, handY(p) - r.y));
      world.events.push({ e: 'ropehit', id: p.id, x: r.x, y: r.y });
    } else {
      releaseRope(p);
      world.events.push({ e: 'spark', x: hit.px, y: hit.py });
    }
    return;
  }
  r.x = nx; r.y = ny;
  if (r.travelled > ROPE.maxLen) releaseRope(p);
}

// Called before integration: reel in/out and swing control.
export function ropeControl(p, dt) {
  const r = p.rope;
  if (r.state !== 'attached') return;
  const inp = p.input;
  if (inp.u) r.len -= ROPE.fastReel * dt;
  else if (inp.d) r.len += ROPE.letOut * dt;
  else r.len -= ROPE.autoReel * dt;
  r.len = Math.min(ROPE.maxLen, Math.max(ROPE.minLen, r.len));
}

// Called after integration: keep the player inside the rope circle (collision-safe).
export function ropeConstraint(p, world, dt) {
  const r = p.rope;
  if (r.state !== 'attached') return;
  const dx = p.x - r.x, dy = handY(p) - r.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d > ROPE.maxLen * ROPE.breakFactor) { releaseRope(p, false); return; }
  if (d <= r.len) return;
  const nx = dx / d, ny = dy / d;
  // remove outward radial speed so the player swings instead of flying off
  const vr = p.vx * nx + p.vy * ny;
  const keepVx = p.vx - (vr > 0 ? vr * nx : 0), keepVy = p.vy - (vr > 0 ? vr * ny : 0);
  // move back onto the circle through the collision system
  const over = d - r.len;
  p.vx = -nx * over / dt; p.vy = -ny * over / dt;
  moveBody(world.map, p, dt);
  p.vx = keepVx; p.vy = keepVy;
}
