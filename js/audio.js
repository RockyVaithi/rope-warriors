// Tiny synthesized sound effects (no audio files).
let ctx = null, enabled = true, noiseBuf = null;

export function setSound(on) { enabled = on; }
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch (e) { ctx = null; }
}

function tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = 0.12, freq = 1200) {
  if (!enabled || !ctx || !noiseBuf) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t); s.stop(t + dur);
}

// vol scales with distance from the listener (0..1)
export const sfx = {
  pistol: v => tone(880, 0.07, 'square', 0.05 * v, 300),
  shotgun: v => { noise(0.22, 0.2 * v, 2400); tone(160, 0.12, 'sawtooth', 0.05 * v, 60); },
  rocket: v => { noise(0.35, 0.08 * v, 900); tone(220, 0.3, 'sawtooth', 0.04 * v, 110); },
  boom: v => { noise(0.6, 0.35 * v, 900); tone(90, 0.4, 'sine', 0.2 * v, 40); },
  hit: v => tone(320, 0.05, 'square', 0.06 * v, 180),
  hurt: () => tone(140, 0.12, 'sawtooth', 0.09, 70),
  die: v => { noise(0.3, 0.2 * v, 1600); tone(500, 0.35, 'triangle', 0.08 * v, 70); },
  rope: v => tone(1200, 0.06, 'triangle', 0.05 * v, 2400),
  ropeHit: v => tone(2000, 0.04, 'square', 0.04 * v, 900),
  jump: v => tone(300, 0.08, 'triangle', 0.035 * v, 520),
  dash: v => noise(0.15, 0.09 * v, 3000),
  pick: () => { tone(660, 0.07, 'triangle', 0.07); setTimeout(() => tone(990, 0.09, 'triangle', 0.07), 60); },
  kill: () => { tone(880, 0.08, 'square', 0.06); setTimeout(() => tone(1320, 0.12, 'square', 0.06), 70); },
  spawn: () => tone(440, 0.15, 'triangle', 0.05, 880),
  end: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.08), i * 120)),
};
