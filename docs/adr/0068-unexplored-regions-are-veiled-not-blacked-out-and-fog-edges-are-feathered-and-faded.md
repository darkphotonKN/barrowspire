# ADR-0068 — Unexplored regions are veiled, not blacked out; fog edges are feathered and state changes faded

Status: accepted
Date: 2026-11-06
Scope: `game-client` on dungeon floors (floor 1 today). The server is not involved.
Specified by [FS-SRA9J](../specs/SRA9J-fog-of-war-and-minimap.md) (amended 2026-11-06, owner
playtest).
Amends: [ADR-0063](0063-fog-of-war-is-client-presentation-shared-by-the-party.md) — Decision 2's
look for the unexplored state ("black"). Its three states, the monster rule, party sharing,
presentation-only stance and per-floor opt-in stand.

## Context

Nick playtested floor 1 with ADR-0063's fog and gave three reactions on 2026-11-06:

- "看不到的區塊會像斷橋一樣感覺 還是要可以看到 只是用迷霧擋住". An unexplored region drawn as
  solid `palette.inkDeep`, with its walls hidden, makes the visible floor end like a broken bridge.
  He wants it still drawn, terrain and walls, and covered by fog.
- "看不到的區塊有一種撕裂感 然後才突然出現". The boundary between states is a hard, jagged cut, and a
  region pops from one state to the next the moment a member steps in.

Forces:

- The fog lies over the world (`BLACKOUT.depth`, 500), over members, monsters and walls. So a
  translucent veil still has to keep a member's head and a wall in front of the fog clear, as the
  opaque one did, and must never lie over a px twice, or the explored dim compounds.
- Phaser 4.2.1's filters (`filters/Blur.js`, `gameobjects/components/Filters.js`) run under WebGL
  only. Each filtered object renders to a framebuffer plus one draw per filter, every frame, and a
  blur spills over the edges the fog must keep clear.
- A fade that eases the veil off a region a member has just entered would veil that member while
  it runs, since the fog lies over them.
- B3 (which monsters show in a region not visible) is owner-pending with rule C current, so the
  fog must stay over the world rather than move under it.

Recorded without adversarial review: no `challenge-me` pass.

## Decision

1. **An unexplored region is drawn under a dense veil**, darker than the explored one but not
   opaque, so its ground and walls read faintly. Its walls are drawn, tinted as dark as its veil.
   Everything else in it stays hidden: monsters (by the current monster rule), containers, drop
   piles, the switch, escape door, stairs, run dressing, effects and its lights. The void and off
   the floor stay opaque. The veils' strengths are named constants (`FOG.unexplored`,
   `FOG.explored`) in one place, for tuning.
2. **The fog stays one non-overlapping partition over the world.** A drawn wall and a visible
   floor's head clearance stand clear of it, as before.
3. **Fog edges are feathered inward, on the CPU, under both renderers.** The partition is laid on
   a coarse lattice. Each chunk's field is `min(sharp, blur(erode(equiv)))`, where a drawn wall
   counts as its tint's share. The field is painted into a canvas texture per ground chunk and
   drawn smoothly between texels. The feather may lighten fog near a lighter edge. It never puts
   fog on a px the sharp fog leaves clear, and never darkens one past it. A GPU filter is not used.
4. **A region's change of state is faded** over a short, named time, on the scene's clock. Fog that
   comes eases in over the world. Fog that lifts eases out at a depth under every standing thing,
   so no member is ever under it. Wall tints ease with the veil. Nothing is rebuilt per frame;
   only layer alphas and tints change while it runs.

## Consequences

- The floor reads as one place: the layout past a doorway is visible but veiled.
- A cheating client still sees what the server sends (ADR-0063 Decision 5). The veiled layout
  gives away nothing the minimap and walls did not already imply, and monsters and containers stay
  hidden.
- The fog is a set of textures, not polygons. Phaser no longer triangulates fog polygons every
  frame, but a change of state costs more: the larger partition and painting the changed chunks
  in view, with those in the camera's margin painted a few a frame.
- During a fade-in, objects that were hidden (a chest, dressing, a light) appear at once while the
  floor under them is still easing. Accepted for v1.
- On the canvas renderer the feather and fades work the same, being textures and alphas.
