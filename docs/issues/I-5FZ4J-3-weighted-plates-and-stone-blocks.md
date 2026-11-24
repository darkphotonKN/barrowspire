---
id: I-5FZ4J-3
status: open
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-2]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 3: the Weighted Plates seal and pushable stone blocks"
---
Implements FS-5FZ4J §C R17–R20

**Hotspot:** `session.go`, `systems/movement.go` and `systems/wall_index.go`. One writer at a time.
Never touch `internal/matchmaker` or `internal/match_queue`.

## What to Build

- The Weighted Plates kind joins the seal draw (still behind the force tunable for tests): its
  room choice (≥ 6×5, nothing else on the ground), 2–3 plates per floor band, as many blocks as
  plates, the solvable placement with a push search (R20), the seal breaking on the first tick all
  plates are held, the one ambush on the first held plate (R18).
- **Plates** held by a delver's body centre or a block (a hook for a hired ally, FS-4EC7Z: a body
  kind check, not a Player check, so an ally plugs in later); never by a monster.
- **Stone blocks** (R19): a cell-sized blocker; a sustained walk into a face along an axis for the
  half-speed time pushes it one cell, sliding over that time; every refusal case; monsters never
  push; two opposite pushes cancel. The wall index must see a moved block (it rebuilds only on set
  changes today: a version/dirty check or re-create per move), and the nav mask updates (R22).
  Blocks ride `seal_pieces` (`kind: block`, `cell`, position mid-slide).

## Acceptance Criteria

- [ ] A block pushed by a sustained walk moves exactly one cell after the half-speed time; a short touch moves nothing.
- [ ] Each R19 refusal case leaves the block in place.
- [ ] A monster walking into a block does not move it; a monster path routes around it.
- [ ] Holding all plates at once (bodies, blocks, or a mix) breaks the seal; one held plate wakes the one ambush.
- [ ] The placement search passes on every seed of a 500-seed sweep with Weighted Plates forced.
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-2.

## Spec Reference

FS-5FZ4J §C R17–R20, §D R22 (blocks on the nav mask), §I R46 (block pieces).

## TDD Approach

- RED: a delver walking east into a block for the push time moves it one cell east.
- GREEN: the push accumulator in movement.
