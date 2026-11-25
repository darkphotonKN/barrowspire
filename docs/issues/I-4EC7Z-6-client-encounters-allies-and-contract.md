---
id: I-4EC7Z-6
status: done
implements: FS-4EC7Z
blocked_by: [I-4EC7Z-5, I-9JV5K-5]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 6: the client draws encounter NPCs, over-head lines, allies, the cage, hostile humans, and the contract's heading and result"
---
Implements FS-4EC7Z §F R22–R28 (the client side), §G R29–R35

**Hotspot:** `gameState.ts`, `BarrowspireScene.ts`, the monster looks, the minimap, the UI-scene
HUD. One writer at a time.

## What to Build

Everything in §G: encounter NPCs from their on-demand looks with plates (neutral or ally with the
overhead bar), E to talk, over-head lines once per `line_at` for 4 s, the cage and cage key with
their lines, `cutthroat` and `contract_mark` on the monster path (the mark's boss plate and name),
the pilgrims-lost line, the contract line / settled mark / lost line for the taker, the revealed
secret door glyph on the minimap.

## Acceptance Criteria

- [ ] Every FS-4EC7Z client criterion.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-4EC7Z-5 (art), I-9JV5K-5 (client lane order).

## Spec Reference

FS-4EC7Z §F, §G.
