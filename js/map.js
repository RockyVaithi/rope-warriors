// The arena, its collision helpers, and ray casts.
// Tile values: 0 empty, 1 solid stone (no grapple), 2 grapple surface (rope sticks).
import { TILE } from './config.js?v=3';

const W = 64, H = 36;
// [x, y, w, h, type] in tiles. '#' solid, '=' grapple surface.
const RECTS = [
  [0, 0, 64, 1, '='],            // ceiling: grapple everywhere
  [0, 0, 1, 36, '#'], [63, 0, 1, 36, '#'],
  [0, 33, 28, 3, '#'], [36, 33, 28, 3, '#'],   // floor with a deadly pit in the middle
  [27, 24, 10, 1, '='],          // bridge over the pit (swing under it to escape)
  [5, 27, 9, 1, '#'], [50, 27, 9, 1, '#'],     // low ledges
  [19, 29, 2, 4, '#'], [43, 29, 2, 4, '#'],    // cover pillars
  [14, 21, 10, 1, '='], [40, 21, 10, 1, '='],  // mid platforms
  [27, 12, 10, 1, '#'],          // tower top
  [30, 13, 4, 7, '#'], [29, 13, 1, 7, '='], [34, 13, 1, 7, '='], // tower with grapple sides
  [4, 14, 10, 1, '='], [50, 14, 10, 1, '='],   // upper platforms
  [20, 6, 3, 2, '='], [41, 6, 3, 2, '='],      // hanging swing blocks
  [10, 5, 2, 2, '='], [52, 5, 2, 2, '='],
  [1, 20, 4, 1, '#'], [59, 20, 4, 1, '#'],     // wall ledges
  [1, 9, 3, 1, '#'], [60, 9, 3, 1, '#'],
  [1, 10, 1, 10, '='], [62, 10, 1, 10, '='],   // grapple strips on the side walls
];

// Spawn tiles (the empty tile the feet stand in).
const SPAWNS = [[3, 32], [60, 32], [24, 32], [39, 32], [2, 19], [61, 19], [11, 4], [52, 4], [32, 11], [8, 13], [55, 13]];
// Pickups: [tx, ty, kind]
const PICKUPS = [
  [32, 23, 'health'], [9, 26, 'health'], [54, 26, 'health'],
  [7, 13, 'weapon'], [56, 13, 'weapon'], [31, 11, 'weapon'],
  [18, 20, 'speed'], [45, 20, 'speed'],
];

export function buildMap() {
  const grid = new Uint8Array(W * H);
  for (const [x, y, w, h, t] of RECTS)
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) grid[j * W + i] = t === '=' ? 2 : 1;
  const feet = ([tx, ty]) => ({ x: tx * TILE + TILE / 2, y: (ty + 1) * TILE });
  return {
    W, H, grid,
    pxW: W * TILE, pxH: H * TILE,
    spawns: SPAWNS.map(feet),
    pickups: PICKUPS.map(([tx, ty, kind]) => ({ ...feet([tx, ty]), kind })),
    pit: { x0: 28 * TILE, x1: 36 * TILE, floorY: 33 * TILE },
  };
}

export function tileAt(m, tx, ty) {
  if (tx < 0 || tx >= m.W || ty < 0) return 1;
  if (ty >= m.H) return 0;
  return m.grid[ty * m.W + tx];
}
export const tileAtPx = (m, x, y) => tileAt(m, Math.floor(x / TILE), Math.floor(y / TILE));

// Walks a segment in small steps; returns the first solid tile hit.
export function raycast(m, x0, y0, x1, y1, step = 5) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
  for (let i = 1; i <= n; i++) {
    const x = x0 + dx * i / n, y = y0 + dy * i / n;
    const t = tileAtPx(m, x, y);
    if (t) return { hit: true, t, x, y, px: x0 + dx * (i - 1) / n, py: y0 + dy * (i - 1) / n };
  }
  return { hit: false, x: x1, y: y1 };
}

export const lineOfSight = (m, x0, y0, x1, y1) => !raycast(m, x0, y0, x1, y1, 10).hit;

// Axis-separated AABB vs tile movement. Body is centered at (x, y).
export function moveBody(m, e, dt) {
  const res = { ground: false, ceil: false, wall: 0 };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt / (TILE * 0.4)));
  const sdt = dt / steps, hw = e.w / 2, hh = e.h / 2;
  for (let s = 0; s < steps; s++) {
    e.x += e.vx * sdt;
    const top = Math.floor((e.y - hh + 1) / TILE), bot = Math.floor((e.y + hh - 1) / TILE);
    if (e.vx > 0) {
      const tx = Math.floor((e.x + hw) / TILE);
      for (let ty = top; ty <= bot; ty++) if (tileAt(m, tx, ty)) { e.x = tx * TILE - hw - 0.01; e.vx = 0; res.wall = 1; break; }
    } else if (e.vx < 0) {
      const tx = Math.floor((e.x - hw) / TILE);
      for (let ty = top; ty <= bot; ty++) if (tileAt(m, tx, ty)) { e.x = (tx + 1) * TILE + hw + 0.01; e.vx = 0; res.wall = -1; break; }
    }
    e.y += e.vy * sdt;
    const l = Math.floor((e.x - hw + 1) / TILE), r = Math.floor((e.x + hw - 1) / TILE);
    if (e.vy > 0) {
      const ty = Math.floor((e.y + hh) / TILE);
      for (let tx = l; tx <= r; tx++) if (tileAt(m, tx, ty)) { e.y = ty * TILE - hh - 0.01; e.vy = 0; res.ground = true; break; }
    } else if (e.vy < 0) {
      const ty = Math.floor((e.y - hh) / TILE);
      for (let tx = l; tx <= r; tx++) if (tileAt(m, tx, ty)) { e.y = (ty + 1) * TILE + hh + 0.01; e.vy = 0; res.ceil = true; break; }
    }
  }
  if (!res.ground && e.vy >= 0) {           // standing still: probe 1px below
    const ty = Math.floor((e.y + hh + 1) / TILE);
    const l = Math.floor((e.x - hw + 1) / TILE), r = Math.floor((e.x + hw - 1) / TILE);
    for (let tx = l; tx <= r; tx++) if (tileAt(m, tx, ty)) { res.ground = true; break; }
  }
  return res;
}
