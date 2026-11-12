---
id: I-2325V-11
status: open
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V change slice 11: the knight's slash a full diagonal (right shoulder to left hip) and a backhand path back up (game-client bake keys and clip specs; baked in I-JS7C8-6)"
---
Implements FS-2325V §Change: The class attacks move with weight and cut deep (R1–R3, R5–R8)

*Reworked 2026-11-12 (owner: "先改回只有一刀好了 我再看看狀況 不過一刀還是要有各職業風格"): one cut, in the class's own style (FS-2325V R10); the backhand (items marked parked) is not built.*

**Lane: agent.** Bake keys, clip specs and clip tests; the knight's atlas is baked once in I-JS7C8-6,
which carries the owner's contact-sheet approval. No hand-edited pixels.

## What to Build

1. The knight's own forehand (path 1): wound up high on his right above the shoulder, the weight
   back, the pelvis then the chest turning into a cut down and across the front to low on his left
   past the hip, the strike at key 3 in the middle of the arc, a follow-through to the low-left end,
   a recover; the shield arm counter-balancing. Its own keys, apart from the mercenary's.
2. *Parked:* the backhand (path 2): from low on his left back up across the front to high on his right, ending
   near the forehand's wind-up; same length, frames and strike key.
3. *Parked:* a slashing class's specs carry `backhand` (7 at 12 fps, once), `walk_backhand` and
   `backpedal_backhand` (as `walk_attack` and `backpedal_attack`), made by `clipsFor`.

## Acceptance Criteria

- [ ] Seen red against today's slash: the tip passes above the right shoulder and below the left hip,
      key 3 between them; a wind-up opposite the strike with the weight back; the pelvis leading the
      chest; the tip's path curved, no single step carrying most of it; the strike at key 3.
- [ ] *Parked:* seen red (no such clip): `backhand` runs the tip from below the left hip to above the right
      shoulder under the same rules; `walk_backhand` and `backpedal_backhand` last as long as it.
- [ ] No sword or shield sample inside the torso or head on any key of `attack`, `walk_attack` and `backpedal_attack`.

## Blocked By

None
