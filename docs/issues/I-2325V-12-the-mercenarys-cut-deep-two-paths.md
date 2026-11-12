---
id: I-2325V-12
status: open
implements: FS-2325V
blocked_by: [I-2325V-11]
labels: [ready-for-agent]
title: "FS-2325V change slice 12: the mercenary's cut a full diagonal and a backhand path back up, on his own keys (game-client bake keys; baked in I-JS7C8-8)"
---
Implements FS-2325V §Change: The class attacks move with weight and cut deep (R1–R3, R5–R8)

*Reworked 2026-11-12 (owner: "先改回只有一刀好了 我再看看狀況 不過一刀還是要有各職業風格"): one cut, in the class's own style (FS-2325V R10); the backhand (items marked parked) is not built.*

**Lane: agent.** Bake keys and clip tests; the mercenary's atlas is baked once in I-JS7C8-8. No
hand-edited pixels.

## What to Build

The mercenary's forehand and backhand as the knight's (I-2325V-11), on his own keys and rig, his free
arm swinging out against the cut instead of a shield; his parry unchanged (FS-MAMHR §G.35).

## Acceptance Criteria

- [ ] The same tests as I-2325V-11 on the mercenary's rig and style, seen red against today's keys.
- [ ] His `parry` keys and clip unchanged.

## Blocked By

I-2325V-11 (the backhand specs)

## Built (2026-11-12, agent)

Keyed in `clips.js` (the knight's `slash`, the wizard's `cast`, the mercenary's own `cut`), tested in
`classMotion.test.mjs` (seen red against today's keys first) and baked with the mercenary's FS-JS7C8 re-bake;
the owner's approval rides on that slice's contact sheet.
