// Tunables for the whole game. Movement + rope numbers matter most for feel.
export const TILE = 32;
export const STEP = 1 / 60;              // fixed simulation step
export const SNAPSHOT_EVERY = 2;          // host sends a snapshot every N steps (30 Hz)
export const MAX_PLAYERS = 8;

export const PHYS = {
  gravity: 1650,
  runAccel: 3400,
  airAccel: 1500,
  maxRun: 290,
  groundFriction: 14,
  jumpVel: 610,
  thrust: 2300,          // W in the air: short burst, limited by fuel
  thrustMaxUp: 460,
  fuelMax: 0.45,
  fuelRegen: 2.2,
  maxFall: 1150,
  maxSpeed: 1500,
  playerW: 22,
  playerH: 34,
};

export const ROPE = {
  hookSpeed: 1900,
  maxLen: 470,
  minLen: 44,
  autoReel: 230,         // gentle constant pull toward the anchor
  fastReel: 640,         // holding W while attached
  letOut: 320,           // holding S while attached
  swingAccel: 1250,
  cooldown: 0.28,
  missCooldown: 0.35,
  breakFactor: 1.35,     // rope snaps if stretched beyond maxLen * this
  releaseBoost: 1.08,    // tiny bonus on release so swings feel snappy
};

export const DASH = { speed: 640, cooldown: 1.6 };

export const MATCH = {
  duration: 180,
  respawn: 2,
  invuln: 1.2,
  voidCredit: 5,         // seconds a knockback kill-into-the-pit still counts
};

export const WEAPONS = {
  pistol:  { name: 'PISTOL',  kind: 'bullet', dmg: 17, cd: 0.17, speed: 1450, range: 780, pellets: 1, spread: 0.035, kb: 140, ammo: Infinity, recoil: 30,  color: '#ffe38a' },
  shotgun: { name: 'SHOTGUN', kind: 'bullet', dmg: 10, cd: 0.8,  speed: 1150, range: 400, pellets: 8, spread: 0.34,  kb: 95,  ammo: 8,        recoil: 330, color: '#ffb36b' },
  rocket:  { name: 'ROCKET',  kind: 'rocket', dmg: 75, cd: 1.05, speed: 650,  range: 1700, pellets: 1, spread: 0,    kb: 760, ammo: 5,        recoil: 170, color: '#ff7a45', splash: 100 },
};
export const WEAPON_IDS = ['pistol', 'shotgun', 'rocket'];

export const PICKUP = {
  health: { amount: 50, respawn: 10 },
  weapon: { respawn: 12 },
  speed:  { mult: 1.45, duration: 6, respawn: 15 },
};

export const COLORS = [
  { name: 'RED',    hex: '#ff4d5e' },
  { name: 'BLUE',   hex: '#3d9bff' },
  { name: 'GREEN',  hex: '#3ddc84' },
  { name: 'YELLOW', hex: '#ffc93d' },
  { name: 'PURPLE', hex: '#b06bff' },
  { name: 'ORANGE', hex: '#ff8a3d' },
  { name: 'PINK',   hex: '#ff6bd0' },
  { name: 'CYAN',   hex: '#3de0e0' },
];
