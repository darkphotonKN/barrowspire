---
id: I-GTNP8-1
status: done
implements: FS-GTNP8
blocked_by: []
labels: []
title: "FS-GTNP8 slice 1: listed and settling items get a red tip note, a corner mark and a refusal in the hub gear overlay (game-client)"
---
Implements FS-GTNP8 §A, §B, §C, §D, §E (Requirements 1–16), §Acceptance Criteria

**Lane: agent (AFK).** Client only, on `feat/client-listed-item-note`.

## What to Build

- `itemView` standing gains `listed` (`LISTED`) and `settling` (`PENDING_SETTLEMENT`), with
  their tip notes, read from status in any world as `inRun` is, in the one standing function.
- `palette.listed` = `BARROW_HEX.oxbloodText`; the tip draws a listed or settling note in it.
- `listedMark(well)` in `gearOverlayLayout`: the corner triangle's geometry (R6). `GearOverlay`
  draws it over the icon of every listed or settling bag cell, stash cell and worn slot.
- `HubGear`'s pre-check refuses equip, unequip, swap-out and move of a listed or settling item
  with that standing's words in the hub notice, nothing sent (R10–R12).
- Design guideline line.

## Acceptance Criteria

- [x] Every FS-GTNP8 §Acceptance Criteria item but the browser check.
- [x] Tests first (`test:` commit), then the code (`feat(client):` commit).
- [x] Full vitest suite and `tsc --noEmit` green.

## Blocked By

None.

## Spec Reference

FS-GTNP8 §Requirements, §Acceptance Criteria, §Edge States.
