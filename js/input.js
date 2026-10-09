// Keyboard + mouse + touch -> one input object { l, r, u, d, fire, grap, dash, aim }.
import { screenToWorld } from './render.js?v=3';

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, l: false, r: false, seen: false };
  const touch = { active: false, move: null, aim: null, rope: null, dash: null, lastAim: -0.6 };
  let dashQueued = false;

  const key = e => e.code;
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys.add(key(e));
    if (e.code === 'Space') e.preventDefault();
    if (['ShiftLeft', 'ShiftRight', 'KeyQ'].includes(e.code) && !e.repeat) dashQueued = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(key(e)));
  addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---- touch: left = move stick, right-bottom = aim+shoot stick, right-top = rope stick ----
  const zoneOf = (x, y) => {
    const W = innerWidth, H = innerHeight;
    if (Math.hypot(x - W * 0.5, y - (H - 56)) < 40) return 'dash';
    if (x < W * 0.42) return 'move';
    return y < H * 0.5 ? 'rope' : 'aim';
  };
  const stick = t => ({ id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault(); touch.active = true;
    for (const t of e.changedTouches) {
      const z = zoneOf(t.clientX, t.clientY);
      if (!touch[z]) touch[z] = stick(t);
      if (z === 'dash') dashQueued = true;
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) for (const z of ['move', 'aim', 'rope', 'dash'])
      if (touch[z] && touch[z].id === t.identifier) { touch[z].x = t.clientX; touch[z].y = t.clientY; }
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) for (const z of ['move', 'aim', 'rope', 'dash'])
      if (touch[z] && touch[z].id === t.identifier) touch[z] = null;
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);

  const vec = s => { const dx = s.x - s.ox, dy = s.y - s.oy; return { dx, dy, len: Math.hypot(dx, dy) }; };

  function read(view, player) {
    const inp = { l: false, r: false, u: false, d: false, fire: false, grap: false, dash: false, aim: 0 };
    const has = (...c) => c.some(k => keys.has(k));
    inp.l = has('KeyA', 'ArrowLeft'); inp.r = has('KeyD', 'ArrowRight');
    inp.u = has('KeyW', 'ArrowUp'); inp.d = has('KeyS', 'ArrowDown');
    inp.fire = mouse.l || has('Space', 'KeyJ');
    inp.grap = mouse.r || has('KeyE', 'KeyK');
    inp.dash = dashQueued; dashQueued = false;
    if (player && mouse.seen) {
      const w = screenToWorld(view, mouse.x, mouse.y);
      inp.aim = Math.atan2(w.y - (player.y - 6), w.x - player.x);
    } else if (player) inp.aim = player.facing < 0 ? Math.PI : 0;

    if (touch.active) {
      if (touch.move) {
        const v = vec(touch.move);
        if (v.dx > 18) inp.r = true; if (v.dx < -18) inp.l = true;
        if (v.dy < -28) inp.u = true; if (v.dy > 34) inp.d = true;
      }
      if (touch.aim) {
        const v = vec(touch.aim);
        if (v.len > 14) { touch.lastAim = Math.atan2(v.dy, v.dx); inp.fire = true; }
      }
      inp.aim = touch.lastAim;
      if (touch.rope) {
        const v = vec(touch.rope);
        // drag sets the rope direction; a plain tap shoots it up and forward
        const a = v.len > 14 ? Math.atan2(v.dy, v.dx) : (player && player.facing < 0 ? -2.2 : -0.95);
        if (v.len > 14 || !touch.aim) inp.aim = a;
        inp.grap = true;
      }
    }
    return inp;
  }

  function drawTouch(g) {
    if (!touch.active) return;
    const W = innerWidth, H = innerHeight;
    g.save();
    g.lineWidth = 2;
    const ring = (x, y, r, label, on) => {
      g.strokeStyle = on ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)';
      g.fillStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '700 11px "Chakra Petch", sans-serif'; g.textAlign = 'center';
      g.fillText(label, x, y + 4);
    };
    const drawStick = (s, label, dx, dy) => {
      if (s) { ring(s.ox, s.oy, 46, '', true); ring(s.x, s.y, 20, label, true); }
      else ring(dx, dy, 40, label, false);
    };
    drawStick(touch.move, 'MOVE', 90, H - 100);
    drawStick(touch.aim, 'SHOOT', W - 100, H - 100);
    drawStick(touch.rope, 'ROPE', W - 100, H * 0.3);
    ring(W * 0.5, H - 56, 26, 'DASH', !!touch.dash);
    g.restore();
  }

  return { read, drawTouch, isTouch: () => touch.active, mouse };
}
