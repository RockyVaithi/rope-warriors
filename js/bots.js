// Simple bots: chase, shoot, grab pickups, grapple when the target is above or they are stuck.
// They only write to p.input, exactly like a human or a network client would.
import { ROPE, WEAPONS, TILE } from './config.js?v=3';
import { raycast, lineOfSight, tileAtPx } from './map.js?v=3';
import { handY } from './grapple.js?v=3';

export const makeBotBrain = () => ({
  think: 0, ropeT: 0, stuckT: 0, lastX: 0, goal: null, target: null,
  aimNoise: 0, skill: 0.3 + Math.random() * 0.35, strafe: Math.random() < 0.5 ? -1 : 1, jumpHold: 0,
});

const PREFERRED_RANGE = { pistol: 300, shotgun: 120, rocket: 340 };

function findAnchor(p, world, towardX, towardY) {
  const base = Math.atan2(Math.min(towardY - p.y, -60), towardX - p.x);
  const tries = [base, -Math.PI / 2, base - 0.35, base + 0.35, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6, -Math.PI / 2 - 1.0, -Math.PI / 2 + 1.0];
  for (const a of tries) {
    const x1 = p.x + Math.cos(a) * ROPE.maxLen * 0.92, y1 = handY(p) + Math.sin(a) * ROPE.maxLen * 0.92;
    const hit = raycast(world.map, p.x, handY(p), x1, y1, 6);
    if (hit.hit && hit.t === 2 && Math.hypot(hit.x - p.x, hit.y - p.y) > 90) return a;
  }
  return null;
}

export function updateBot(p, world, dt) {
  const b = p.bot, inp = p.input, map = world.map;
  b.think -= dt;
  b.jumpHold -= dt;

  // rope handling runs every frame
  if (p.rope.state === 'attached') {
    b.ropeT -= dt;
    const close = Math.hypot(p.rope.x - p.x, p.rope.y - p.y) < 70;
    if (b.ropeT <= 0 || close) inp.grap = false;
  } else if (p.rope.state === 'none' && inp.grap) inp.grap = false;   // missed or snapped

  if (b.think > 0) return;
  b.think = 0.1 + Math.random() * 0.06;

  // pick a target: nearest living enemy, prefer visible ones
  let target = null, best = 1e9;
  for (const q of world.players) {
    if (q === p || !q.alive) continue;
    let d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!lineOfSight(map, p.x, handY(p), q.x, q.y)) d *= 1.6;
    if (q.invuln > 0) d *= 1.3;
    if (d < best) { best = d; target = q; }
  }
  b.target = target;

  // goal: health when hurt, a weapon when holding the pistol, else the target
  let goal = target ? { x: target.x, y: target.y } : { x: map.pxW / 2, y: map.pxH / 2 };
  const want = p.hp < 45 ? 'health' : p.weapon === 'pistol' ? 'weapon' : null;
  if (want) {
    let pk = null, pd = want === 'health' ? 900 : 520;
    for (const k of world.pickups) if (k.active && k.kind === want) {
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < pd) { pd = d; pk = k; }
    }
    if (pk) goal = { x: pk.x, y: pk.y };
  }
  b.goal = goal;

  const dx = goal.x - p.x, dy = goal.y - p.y, dist = Math.hypot(dx, dy);
  const visible = target && lineOfSight(map, p.x, handY(p), target.x, target.y);
  let dir = Math.abs(dx) > 30 ? Math.sign(dx) : 0;
  if (target && visible && goal.x === target.x) {
    const pref = PREFERRED_RANGE[p.weapon];
    if (dist < pref * 0.6) dir = -Math.sign(dx);                 // back off
    else if (dist < pref) dir = Math.random() < 0.3 ? b.strafe : 0;
    if (Math.random() < 0.05) b.strafe *= -1;
  }

  // don't walk into the pit
  const pit = map.pit;
  const aheadX = p.x + dir * 40;
  if (p.onGround && dir && aheadX > pit.x0 && aheadX < pit.x1 && p.y > pit.floorY - 60) b.jumpHold = 0.35;

  // stuck detection
  if (dir && Math.abs(p.x - b.lastX) < 2 && p.onGround) b.stuckT += 0.12; else b.stuckT = 0;
  b.lastX = p.x;

  inp.l = dir < 0; inp.r = dir > 0; inp.d = false;
  const wallAhead = dir && tileAtPx(map, p.x + dir * 22, p.y);
  if ((p.onGround && (wallAhead || dy < -90)) || b.stuckT > 0.25) b.jumpHold = 0.25;
  inp.u = b.jumpHold > 0 || (!p.onGround && dy < -120 && p.fuel > 0.15);

  // grapple: target above, stuck, falling into the pit, or just for style
  const inPit = p.x > pit.x0 - 10 && p.x < pit.x1 + 10 && p.y > pit.floorY - 20;
  if (p.rope.state === 'none' && p.ropeCd <= 0) {
    const wantRope = inPit || b.stuckT > 0.5 || (!visible && (dy < -150 || Math.random() < 0.06)) || (visible && dy < -200 && Math.random() < 0.25) || Math.random() < 0.012;
    if (wantRope) {
      const a = inPit ? findAnchor(p, world, p.x, p.y - 400) : findAnchor(p, world, goal.x, goal.y);
      if (a !== null) {
        inp.aim = a; inp.grap = true;
        b.ropeT = 0.45 + Math.random() * 0.7;
        inp.fire = false;
        return;   // keep aim on the anchor for this think
      }
    }
  }

  // aim + shoot
  inp.fire = false;
  if (target && visible) {
    const W = WEAPONS[p.weapon];
    const tdist = Math.hypot(target.x - p.x, target.y - p.y);
    const lead = W.kind === 'rocket' ? tdist / W.speed : tdist / W.speed * 0.6;
    const tx = target.x + target.vx * lead, ty = target.y + target.vy * lead;
    if (Math.random() < 0.2) b.aimNoise = (Math.random() - 0.5) * (1 - b.skill) * 1.0;
    inp.aim = Math.atan2(ty - handY(p), tx - p.x) + b.aimNoise;
    inp.fire = tdist < W.range * 0.9 && Math.random() < 0.35 + b.skill * 0.35;
    if (p.weapon === 'rocket' && tdist < 110) inp.fire = false;   // don't rocket yourself
  } else if (target) {
    inp.aim = Math.atan2(target.y - p.y, target.x - p.x);
  }
  inp.dash = p.flash > 0 && Math.random() < 0.15;
}

export const BOT_TILE = TILE;
