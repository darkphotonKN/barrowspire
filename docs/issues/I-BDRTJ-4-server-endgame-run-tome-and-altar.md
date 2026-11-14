---
id: I-BDRTJ-4
status: done
implements: FS-BDRTJ
blocked_by: [I-BDRTJ-3, I-3103M-2, I-3103M-3, I-3103M-4]
labels: []
title: "FS-BDRTJ slice 4: endgame test run always holds the tome on floor 6 and the altar on floor 8"
---
Implements FS-BDRTJ §Change: Endgame test run

**Also blocked by FS-3103M's issues that build the tome, the altar and Vorsk's summoning.**
Their ids do not exist yet: add them to `blocked_by` once FS-3103M is sliced. Server lane under
the charter: game-service only.

## What to Build

The plan from slice 3 makes the run a tome run with the tome on floor 6 and the altar on floor 8,
in place of FS-3103M's 2% roll and floor rolls (R29). Placement within each floor, pickup, the
lore lines, burning and Vorsk are FS-3103M's, unchanged; Vorsk summoned on floor 8 stands at the
plan's level for that floor + 2, 30 (R27).

## Acceptance Criteria

- [ ] Every endgame test run holds the tome on floor 6 and the altar on floor 8, placed by
  FS-3103M's placement; no other floor holds either.
- [ ] Burning the tome at the altar summons Vorsk at level 30.
- [ ] The tome not taken: the altar still stands on floor 8 and gives its lore line.
- [ ] Ordinary runs keep FS-3103M's 2% roll and floor rolls (its tests stay green).
- [ ] `make test` (with lint and check) passes in game-service.

## Blocked By

I-BDRTJ-3; FS-3103M's tome, altar and summoning issues (ids pending, see above).

## Spec Reference

FS-BDRTJ §Change: Endgame test run, Requirements 25 (tome and altar line), 27 (Vorsk), 29;
Edge State "Tome not picked up"; User Story 7.

## Files Expected

- `game-server/game-service/internal/game/dev_endgame_run.go` (the plan's tome and altar floors)
  and `internal/game/dev_endgame_run_test.go`
- The FS-3103M file that rolls `TomeRunChance` and the tome and altar floors into its run-level
  plan (FS-3103M R5-R7): the dev plan sets that run-level plan directly in place of the roll
- The FS-3103M summon site (its R18): Vorsk's level read from the dev plan when the run has one

## TDD Approach

- RED: an endgame test run climbed from 6 to 8 finds the tome entity on floor 6 and the altar on
  floor 8, on every seed.
- GREEN: the plan's tome and altar floors read where FS-3103M rolls them.
