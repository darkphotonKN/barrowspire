---
id: I-B4SG9-3
status: open
implements: FS-B4SG9
blocked_by: [I-B4SG9-2]
labels: [blocked]
title: "FS-B4SG9 slice 3: with no line of sight a ranged monster walks until it has one"
---
Implements FS-B4SG9 §A (R4, R5)

**Type:** AFK.

## Files owned

- `game-server/game-service/internal/systems/monster_ai.go` (the sight half of "in range and in sight")
- Tests: `internal/systems/monster_ai_test.go`, `monster_path_test.go`; `internal/game/monster_navigation_floor1_test.go` for a case on a real floor-1 layout

Not owned: the nav grid. `NavGrid.Clear` is used as it is, with the shot's radius as the half-size.

## What to Build

- **Line of sight** (R5): the straight flight of the monster's projectile, at the shot's radius,
  from where it stands to where its target stands, crosses walkable cells only. Bodies never block
  it. With no grid it always holds.
- A ranged monster stands and may start a wind-up only when the target is in range **and** in
  sight. With either missing, and not winding up, it walks its path toward the target (R4), which
  brings it round the corner.
- The test gates the **start** of a wind-up only. A wind-up already running finishes, and the
  release has no sight check (R8): the arrow goes and the wall takes it.
- Aggro, retaliation and the leash stay distance-only (FS-77AB6 R26, ADR-0062 Decision 6). This
  slice must not add a sight test to any of them.

## Acceptance Criteria

- [ ] In range with rock between: no wind-up starts; it walks its path until the straight flight
      is clear, then stands and shoots.
- [ ] A target that breaks line of sight during a wind-up: the arrow is still loosed and stops at
      the wall.
- [ ] With the interval elapsed while out of sight, it shoots as soon as it next stands in range
      and in sight (the interval is not consumed by waiting).
- [ ] A monster without a shot never calls the sight test and moves exactly as before.
- [ ] A ranged monster on a floor with no grid treats sight as clear.
- [ ] A delver within the aggro radius but behind rock is still acquired.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Blocked By

I-B4SG9-2

## Spec Reference

FS-B4SG9 §A R4, R5; user stories 7, 8; edge states "No grid", "Target out of range or sight when
the interval elapses"; §Open questions 3 (no ADR is written by this slice).

## TDD Approach

- RED: a ranged monster 200 px from a target with a wall cell between them starts no wind-up and
  has a non-zero velocity.
- GREEN: the sight test in the stand-or-walk decision.
