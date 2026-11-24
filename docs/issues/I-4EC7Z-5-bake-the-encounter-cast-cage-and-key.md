---
id: I-4EC7Z-5
status: open
implements: FS-4EC7Z
blocked_by: [I-9JV5K-4]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 5: bake the encounter cast, the mark's two looks, the cage and the cage key, with a contact sheet"
---
Implements FS-4EC7Z §H R36

**Files:** `game-client/tools/bake/`, `game-client/public/art/`, `game-client/src/render/art/`
(on-demand table, pins). Not `BarrowspireScene.ts` or `gameState.ts`.

## What to Build

Pilgrim, captive, cutthroat, hooded duelist and debtor knight from the town cast's builds and faces,
with variant tints and gear, clips idle/walk/attack/death (+ cower for the pilgrim) in eight
directions, Ultima Online fidelity, `BARROW` colours; one on-demand group with a stand-in. The cage
(shut/open) and cage key join the sealed-floor props group. All join the contact-sheet review.

## Acceptance Criteria

- [ ] `npm run bake` then `--check` pass; sheets and clips pinned.
- [ ] A contact sheet of the cast and props is written; its path reported.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-9JV5K-4 (one writer at a time in the bake tool).

## Spec Reference

FS-4EC7Z §H R36.
