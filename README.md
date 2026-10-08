# Rope Warriors

A fast 2D multiplayer arena shooter. Every warrior has a gun and a grappling rope.

**Play:** https://rockyvaithi.github.io/rope-warriors/

## How to play
- **PLAY** starts a match against bots right away.
- **PLAY ONLINE** lets you create a room and share the 4-letter code or invite link. Friends join from any phone or laptop, and empty slots fill with bots.
- Free-for-all deathmatch: 3 minutes, and the most eliminations wins. You respawn after 2 seconds.

| Action | Desktop | Phone |
|---|---|---|
| Move | A / D | Left stick |
| Jump / short air thrust | W | Push the left stick up |
| Aim + shoot | Mouse + left click | Drag the bottom-right stick |
| **Rope** (hold) | Right click (or Shift / E) | Drag the top-right stick |
| Reel in / let out | W / S while roped | Left stick up / down |
| Dash | Space | DASH button |

The rope only sticks to the **glowing teal surfaces**. Swing, let go to fly, and knock enemies into the pit in the middle.

Weapons: a **pistol** (everyone spawns with it), a **shotgun** (big knockback, and its recoil launches you in mid-air), and a **rocket launcher** (splash damage, rocket jumps). Pickups: health, weapon crates, and speed boost.

## Code layout
Plain ES modules with no build step:

```
js/config.js       tunables (movement, rope, weapons, match)
js/map.js          arena layout, tile collision, raycasts
js/player.js       player controller
js/grapple.js      grappling rope system
js/weapons.js      weapon system
js/projectiles.js  bullets, pellets, rockets, explosions
js/health.js       damage, death, respawn
js/pickups.js      pickups
js/match.js        match manager + score manager
js/bots.js         bot AI
js/net.js          multiplayer layer (PeerJS / WebRTC)
js/input.js        keyboard, mouse, touch
js/render.js       canvas renderer
js/effects.js      particles, shake, kill feed
js/audio.js        synthesized sound effects
js/ui.js           HUD and menus
js/main.js         game loop and modes
```

Multiplayer is host-authoritative. The host's browser runs the simulation at 60 Hz. Clients send their inputs and draw snapshots sent 30 times a second, smoothed between updates. Add `?net=bc` to the URL to test multiplayer across tabs without a network.
