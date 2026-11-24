---
id: I-5FZ4J-8
status: open
implements: FS-5FZ4J
blocked_by: []
labels: [ready-for-agent]
title: "FS-5FZ4J slice 8: bake the sealed-floor props and their contact sheet"
---
Implements FS-5FZ4J §K R57

**Files:** `game-client/tools/bake/` (catalogue, models), `game-client/public/art/` (baked output
and manifest), `game-client/src/render/art/` tests that pin sheets and resident page counts. Not
`BarrowspireScene.ts` or `gameState.ts` (the client slices own those). Code map: the shared notes
folder's `code-map-game-client.md` §4.

## What to Build

Every prop of §K R57 modelled in code in the bake tool (ADR-0020, ADR-0021), Ultima Online
fidelity (believable proportions, readable silhouettes, textured stone and iron), colours from
`BARROW` tokens only (ADR-0013; the fenced bake models take no colour literals). Multi-state props
framed together so a state swap never moves the sprite; frame names are the states the client
plays (`up`/`down`, `up`/`pressed`, `cold`/`lit`, `shut`/`open`, `full`/`dry`, `dormant`/`prayed`,
`armed`/`sprung`). The hallowed altar reuses the `altar(state)` model with a holy recolour (warm
gold, pale stone, candlelight), not a copy. A brazier for the seal is the run brazier's model with a
`cold` state. Pack them as one new group (`sealed`, or named to fit the catalogue) resident for the
run; update the resident-page test and pin the new sheets against the shipped manifest. Add the
group to the contact sheet's review (`reviewSheets` and the group loop in `tools/bake/lib/contact.mjs`)
so a contact sheet of it is written. Decide the look; record the calls in the issue's closing note.

## Acceptance Criteria

- [ ] `npm run bake` produces the group; `npm run bake -- --check` passes after it.
- [ ] Every §K R57 prop and state is in the manifest, pinned by a test.
- [ ] A contact sheet of the group is written under `tools/bake/review/`; its path is reported.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None.

## Spec Reference

FS-5FZ4J §K R57.
