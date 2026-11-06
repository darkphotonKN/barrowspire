---
id: I-3V7GC-1
status: open
implements: FS-3V7GC
blocked_by: []
labels: [ready-for-agent]
title: "FS-3V7GC slice 1: every class's thighs drawn in by one shared UNDER_CLEAR, so the 2x leg guard holds all four (game-client)"
---
Implements FS-3V7GC §C (Requirements 9–11)

**Lane: agent (AFK).**

## What to Build

Raise the shared `UNDER_CLEAR` in `tools/bake/page/characters/anatomy.js` from 0.012 to 0.04 H,
the least (0.0025 H steps) that holds the 2x wizard's walk and `walk_attack` under the guard's
0.5 1x px. `legs(rig, mat, { under })` stays one rule for the four classes: no per-class clearance,
no garment option changed, `clearanceLimit` and `KNOWN_CLIPPING` untouched. The archer re-bakes.

## Acceptance Criteria

- [ ] `UNDER_CLEAR` is 0.04; its comment says what sets it (the 2x wizard) and what was tried first (FS-3V7GC § Facts).
- [ ] The four classes pass the guard at 0.5 1x px, at rest and in every clip but the death, `walk_attack` included; per-class worst values recorded in FS-3V7GC § Verification.
- [ ] No `skirt` option of any class changes; `clearance.js` is unchanged.
- [ ] Tests pass.

## Blocked By

None.

## Spec Reference

FS-3V7GC §C R9–R11; user stories 8–10.
