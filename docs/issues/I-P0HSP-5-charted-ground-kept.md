---
id: I-P0HSP-5
status: open
implements: FS-P0HSP
blocked_by: [I-P0HSP-4]
labels: [blocked]
title: "FS-P0HSP slice 5: charted ground kept per character and field in the browser; the guideline and CONTEXT (game-client)"
---
Implements FS-P0HSP §D, §H

## Files it expects to touch

- `game-client/src/ui/fieldChart.ts` + test: read and write
  `barrowspire_field_chart:<characterId>:<fieldId>` (`{"v":1,"cell":40,"cols","rows","bits"}`),
  unioned with the stored value, every read and write in a try/catch, reached lazily as
  `minimapMode.ts` reaches its store (`FIELD_CHART.save` = 2000 ms).
- `game-client/src/scenes/FieldScene.ts` + test: read at scene start from the active character
  (`useGameStore().activeCharacterId`) and the field id; write at most every 2 s while charting and
  once at scene end (`onSceneEnd`).
- `game-client/docs/design-guideline.md` "UI Chrome": a "Town and field minimap" bullet after "Map
  overlay", marked "*(Added by FS-P0HSP, 2026-11-12.)*".
- `game-client/CONTEXT.md` "Minimap": names the town and the fields.

## What to Build

A field walked once stays charted on the next visit, on this machine, for this character; each
field and each character apart; two tabs never lose each other's ground; a resized field, an
unparsable value, a throwing store or no active character leave charting for the visit only, with
nothing thrown. Then the guideline and CONTEXT say what the town's and fields' minimap is.

## Acceptance Criteria

- [ ] FS-P0HSP §Acceptance Criteria: the stored chart (key, format, union, cadence, scene end, read at
      start, every failure kept to the visit, nothing thrown) (`fieldChart.test.ts` with a fake store).
- [ ] Two characters and two fields kept apart; a second visit shows the first's ground (scene test).
- [ ] The guideline bullet and the CONTEXT entry; no gallery card.
- [ ] Headless captures of the Forest part-charted at 1080 × 720 and 1280 × 720, render scales 1
      and 2, looked at by eye.
- [ ] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-P0HSP-4

## Spec Reference

FS-P0HSP §D.25–§D.27, §H.39–§H.41; User Stories 13, 14, 24.

## TDD Approach

- RED: a chart written for character A in the Forest reads back for A in the Forest and not for B or
  in the Meadows; a stored value with `cols` 78 for a field now 80 wide reads as empty; a store whose
  `setItem` throws leaves the chart intact and throws nothing.
- GREEN: the read, the unioning write, then the scene's cadence and scene-end write.
