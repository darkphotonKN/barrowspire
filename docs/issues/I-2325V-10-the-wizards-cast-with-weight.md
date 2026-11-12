---
id: I-2325V-10
status: open
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V change slice 10: the wizard's cast with a wind-up, the body leading, an arc and a follow-through (game-client bake keys; baked in I-JS7C8-7)"
---
Implements FS-2325V §Change: The class attacks move with weight and cut deep (R1, R4–R7)

**Lane: agent.** Bake keys and clip tests only; the wizard's atlas is baked once in I-JS7C8-7, which
carries the owner's contact-sheet approval (old `attack` beside the new). No hand-edited pixels.

## What to Build

`ATTACKS.cast` (`tools/bake/page/characters/clips.js`) re-keyed: 7 keys at 12 fps, the strike
(the thrust, the glow's peak) still key 3; the sceptre drawn back by the right shoulder with the
weight back, the pelvis turning into the thrust before the chest, the sceptre thrust toward the aim,
the free hand opening out, a follow-through and a recover.

## Acceptance Criteria

- [ ] Clip tests on the wizard's rig and style (`classStyles.js`), seen red against today's keys:
      a wind-up opposite the strike (the orb drawn back against the facing, the weight back);
      the pelvis reaching the strike's turn before the chest; the orb's path curved, no key-to-key
      step carrying most of it; the strike at key 3.
- [ ] No sceptre or tome sample inside the torso or head on any key of `attack`, `walk_attack`,
      `backpedal_attack`.
- [ ] 7 frames at 12 fps; `walk_attack` and `backpedal_attack` still as long.

## Blocked By

None
