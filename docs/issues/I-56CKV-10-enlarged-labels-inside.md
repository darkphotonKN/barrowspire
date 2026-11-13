---
id: I-56CKV-10
status: open
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV change: the enlarged minimap keeps the map name and the dev readout inside, where the normal map has them (game-client)"
---
Implements FS-56CKV §Change: The enlarged map keeps its labels inside

**Lane: AFK (agent).** game-client only.

## What to Build

Owner, 2026-11-14: 「小地圖1.5倍時 區域名稱跟座標也要放在地圖內跟1倍時的位置一樣」. With the map
enlarged, the map name stands 4 px inside the map's top-right and the dev readout 4 px inside its
bottom-right, by the normal map's rule, measured against the enlarged map's own rect (F1, F2), in
the run, the town and a field. The give-way rule stays (F4). The constants and branches that only
placed them outside the map go (F6). The guideline and `CONTEXT.md` follow (F7).

## Files it expects to touch

- `game-client/src/ui/minimapName.ts` + test: one inside rule for the normal and enlarged map.
- `game-client/src/ui/positionReadout.ts` + test: the same for the readout; no enlarged branch.
- `game-client/src/ui/topRightColumn.ts` + test, `worldMinimapController.ts` + test.
- `game-client/src/scenes/BarrowspireScene.ts` + test (the readout's wiring), `HubScene.ts` +
  test (the give-way comment and test).
- `game-client/docs/design-guideline.md`, `game-client/CONTEXT.md`.

## Acceptance Criteria

- [ ] Every acceptance criterion of the § Change but the owner's look, each named by a test or by
      the diff.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-56CKV §Change: The enlarged map keeps its labels inside, F1–F7, Acceptance Criteria, Edge
States.

## TDD Approach

- RED: `minimapName.test.ts` and `positionReadout.test.ts`: for the normal and the enlarged map,
  at 1080 and 1280, the name's place is (map right − 4, map top + 4, top-aligned) and the
  readout's (map right − 4, map bottom − 4, bottom-right origin), measured against that map's
  own rect.
- GREEN: drop the enlarged branches of `minimapNamePlace` and `positionReadoutPlace`, then the
  feeds that only served them.
