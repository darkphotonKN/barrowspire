---
id: I-V8FT3-5
status: open
implements: FS-V8FT3
blocked_by: [I-V8FT3-2, I-V8FT3-3, I-V8FT3-4]
labels: [blocked]
title: "FS-V8FT3 slice 5: browser check of the wall shadows (Nick)"
---
Implements FS-V8FT3 §Acceptance Criteria (By eye)

**Lane: human (HITL).** No code. Two calls are the owner's to make here: the edges, and the foot.

## What to Build

Nothing. Look at it.

## Acceptance Criteria

- [ ] On floor 1, along a room's west wall (running along world y): one even shadow, no stripes;
      along its south wall a short one; its north and east walls cast nothing onto the floor in
      front of them (their shadows fall behind them, on void: FS-V8FT3 R23).
- [ ] No shadow on the void past a wall, and none stopping short of a wall's face.
- [ ] At an inside corner and at a post: no darker patch.
- [ ] A chest or a brazier beside a wall: its shadow falls the same way as the wall's.
- [ ] In the village: each house's shadow outside, even, unbroken past its door; inside a house,
      short shadows from the cut-away walls and a long one from the back walls.
- [ ] Walking behind a tall wall: the wall fades, the shadow does not move or fade.
- [ ] Hard edges: keep, or soften (a follow-up either way).
- [ ] The foot of a wall on its lit side: fine bare, or wants a contact shadow.

## Blocked By

I-V8FT3-2, I-V8FT3-3, I-V8FT3-4.

## Spec Reference

FS-V8FT3 §Acceptance Criteria "By eye"; "Left to the owner"; user stories 1-10, 15.
