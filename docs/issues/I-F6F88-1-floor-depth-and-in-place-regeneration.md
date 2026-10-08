---
id: I-F6F88-1
status: done
implements: FS-F6F88
blocked_by: []
labels: [ready-for-agent]
title: "FS-F6F88 slice 1: Floor depth, floor build step and leak-free in-place regeneration"
---
Implements FS-F6F88 §Requirements (Floors 1–4, Floor layout 5 and 8, Floor regeneration 9–16, Run end and escape 25, State broadcast 26)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (`InitialMapObjects`, per-floor session fields, a new regenerate operation) · **Lane:** backend human lane by default (root `CLAUDE.md`). Hand to `/develop` only if asked.

## What to Build

One feature block: **a run knows which floor it is on, and can rebuild itself as the next floor
without leaking anything.** Nothing triggers a climb yet (that is slice 2). This slice delivers
the depth, the single floor-build seam FS-77AB6 will extend, and the regeneration routine,
driven directly from tests.

The flow, end to end:
run starts at depth 1 of 3 (depth stored as plain data on the run-level match-progress entity,
readable by systems) → floor 1 is built through **one floor build step** that takes the depth
(today's `InitialMapObjects` layout: buildings, chest, escape door + switch) → a regenerate
operation, applied **between ticks**, removes every floor entity, keeps every delver entity and
every item a delver wears or carries, resets per-floor bookkeeping (occupied areas, escape
door/switch ids, interaction caches, attack targets), raises depth by one, runs the floor build
step again **without** re-fetching the item catalogue, and moves living non-escaped delvers to
fresh spawn points with zero velocity → every run broadcast carries `floor` and `floor_count`
(hub broadcasts omit them).

Dead delvers must not appear as present bodies after a regeneration (escaped ones already do
not). The mechanism is open; the FS states the requirement only.

Read FS §Requirements 9–16 and the "Why in place" decision record while building. The
leak-freedom criteria are the point of this slice.

## Acceptance Criteria

- [ ] A new run broadcasts `floor: 1`, `floor_count: 3`; a hub broadcast has neither.
- [ ] A system can read floor depth from the entity list without the session struct.
- [ ] Floor 1 and every later floor are built by the same floor build step, which takes the depth and runs with no monster code.
- [ ] After a regeneration (and after two in a row), the entity manager holds only: the new floor's entities, every delver entity, every item referenced by a delver's equipment or satchel, and the run-level entity. Counted by kind and checked by id.
- [ ] Movement on the new floor collides only with the new floor's walls and doors. A delver placed where an old wall stood moves freely.
- [ ] The new floor's buildings all place (the occupied-area list was reset); escape door and switch ids point at the new floor's entities.
- [ ] Carried items keep id and stats; chest contents and ground items are gone.
- [ ] Living, non-escaped delvers are in bounds with zero velocity and no attack target; dead delvers are absent from later broadcasts as bodies; escaped count, elimination order and stats are unchanged.
- [ ] Regeneration makes no items-service call (counting fake).
- [ ] The first state serialized after a regeneration holds only new-floor entities.
- [ ] Regeneration never sends on the run-end channel.
- [ ] `getRawMatchState`, computed after a regeneration (before any player removal), still lists items picked up on the earlier floor.
- [ ] `go test -race ./...` for the touched packages passes.

## Blocked By

None

## Spec Reference

FS-F6F88 §Requirements 1–5, 8–16, 25, 26; §Acceptance Criteria "Floors and layout" (non-stairs rows), "Regeneration is leak-free", "Escape and run end" (last two rows); §Edge States (cleared-entity interaction, projectile in flight, chest left, catalogue empty, D4 note, end-of-run ordering defect); User Stories 1, 14, 15, 17, 18, 25–30.

## TDD Approach

- RED: build a run, add two delvers (one carrying an item, one dead), open the chest and leave its items, regenerate, and assert the entity census. Red today, because no regeneration exists.
- GREEN: floor build step extracted from `InitialMapObjects`, plus the regenerate operation and the per-floor resets.
- Note: `manageGameLoop` returns early when `TestMessageSpy` is set (FS-QG1HR), so drive regeneration and serialization directly, not through the tick.
