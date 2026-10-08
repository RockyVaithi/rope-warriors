// Match manager + score manager: world creation, the fixed step, timer, standings.
import { MATCH, COLORS, MAX_PLAYERS } from './config.js';
import { buildMap } from './map.js';
import { createPlayer, updatePlayer } from './player.js';
import { updateProjectiles } from './projectiles.js';
import { updateRespawns } from './health.js';
import { createPickups, updatePickups } from './pickups.js';
import { updateBot, makeBotBrain } from './bots.js';

export function createWorld() {
  const map = buildMap();
  return {
    map, players: [], projectiles: [], pickups: createPickups(map),
    events: [], time: 0, timeLeft: MATCH.duration, state: 'playing',
  };
}

function freeSlot(world) {
  for (let id = 1; id <= MAX_PLAYERS; id++) if (!world.players.some(p => p.id === id)) return id;
  return null;
}

export function addPlayer(world, name, isBot = false) {
  const id = freeSlot(world);
  if (id == null) return null;
  const color = COLORS[id - 1];
  const p = createPlayer(id, isBot ? color.name : name, color.hex, isBot);
  if (isBot) p.bot = makeBotBrain();
  p.respawnT = 0.3 + world.players.length * 0.05;
  world.players.push(p);
  return p;
}

export function removePlayer(world, id) {
  world.players = world.players.filter(p => p.id !== id);
  world.projectiles = world.projectiles.filter(pr => pr.owner !== id);
}

export function restartMatch(world) {
  world.state = 'playing';
  world.timeLeft = MATCH.duration;
  world.projectiles = [];
  world.pickups = createPickups(world.map);
  world.players.forEach((p, i) => { p.kills = 0; p.deaths = 0; p.alive = false; p.respawnT = 0.3 + i * 0.05; p.rope.state = 'none'; });
  world.events.push({ e: 'start' });
}

export function stepWorld(world, dt) {
  world.time += dt;
  if (world.state !== 'playing') return;
  world.timeLeft -= dt;
  if (world.timeLeft <= 0) {
    world.timeLeft = 0;
    world.state = 'over';
    world.players.forEach(p => { p.rope.state = 'none'; });
    world.events.push({ e: 'end' });
    return;
  }
  for (const p of world.players) if (p.isBot && p.alive) updateBot(p, world, dt);
  for (const p of world.players) updatePlayer(p, world, dt);
  updateProjectiles(world, dt);
  updatePickups(world, dt);
  updateRespawns(world, dt);
}

export function standings(players) {
  return [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
}
