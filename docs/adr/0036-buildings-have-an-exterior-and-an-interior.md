# ADR-0036 — Buildings have an exterior and an interior: a closed block from outside, the cut-away only from inside

Status: accepted
Date: 2026-11-01
Scope: `game-client` (canvas presentation)
Realized by: [FS-9PN7X](../specs/9PN7X-building-exteriors-and-indoor-blackout.md) (closed building
exteriors, indoor blackout)
Builds on: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked
isometric art; its consequences named occlusion as an open design problem, with cut-away fronts
and fading occluders as candidates), [ADR-0021](0021-characters-are-authored-in-code-not-sourced.md)
(art built in code), [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)
(canvas tokens only)

## Context

FS-2325V answered ADR-0020's occlusion question with cut-away walls: every building's south and
east sides are low, so the camera sees over them, and the design guideline wrote it down as
"Occlusion is cut-away, then fade". FS-8RBQY gave Spire rooms the same rule, and FS-B0H2D put
furnished interiors inside the town buildings under a roof that lifts while the player stands
inside.

The result is that from outside you look straight into every building: over the low fronts,
and through the roof whenever it takes the occluder fade. Hiding the people and furnishings
inside (FS-B0H2D) did not make the building feel closed. The owner wants being inside to feel
enclosed and being outside to show only the building, for immersion. A throwaway spike
(`spike/opaque-interiors`, 2026-11-01) that darkened the street while the player stood in a hub
house confirmed the feel was worth doing properly.

The decision is visual only. No PvP exists; the most a player could learn by reading game-state
websocket messages is who is inside a building, or that containers are inside. That is accepted,
so nothing moves to the server.

Recorded without adversarial review: scoped in `/scope-it` with the owner, and judged low cost if
wrong (baked art and draw rules revert cleanly).

## Decision

**Every building is made with two looks: an exterior and an interior.**

- **Exterior** (seen while the player is outside it): a closed block. All four walls stand at full
  height in the building type's exterior surface, topped by a roof or cap that never fades. The
  inside is never drawn from outside, and an entrance shows a dark opening, not the room.
- **Interior** (seen while the player stands inside it): the cut-away look that ships today.
  Back walls full height, the south and east fronts low, the room furnished and lit.
- **One exterior per building type.** A building type is a wall-piece material. Today there are
  two: timber (town buildings) and masonry (Spire rooms). A new building type is not finished
  until it has both looks.
- **A covered player shows as a silhouette.** When a closed exterior stands between the camera
  and the player, the building stays solid and the player shows through as an outline. Fading
  the building, as trees fade, is ruled out because it would reveal the interior.

This replaces the design guideline's "Occlusion is cut-away, then fade" rule **for buildings
seen from outside**. Trees and tall props keep the fade, and the cut-away remains how a room
the player is in is seen.

## Consequences

- Each building type needs exterior pieces: full-height outward faces for its south and east
  sides, plus a top. Timber already has roofs. Masonry has none, so Spire rooms need a new baked
  stone cap.
- Drawing a building depends on whether the player is inside it. This adds a second building
  state to the canvas (FS-9PN7X), alongside the roof lift that already exists.
- Roofs and exterior walls stop taking the occluder fade. A silhouette pass takes over keeping
  the player visible behind buildings.
- Whatever is inside a building is visually hidden from outside, monsters and chests in Spire
  rooms included. That changes how a run reads (you see a room, not its contents) without
  changing any game rule.
- The design guideline must be amended in the same change that realizes this, so the art SSOT
  never contradicts the canvas.
- The unused exterior run theme shares the timber pieces and the run scene's indoor mask, so
  it inherits most of this for free if it is ever revived.
