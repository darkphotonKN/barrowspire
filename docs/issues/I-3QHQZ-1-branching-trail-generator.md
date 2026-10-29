---
id: I-3QHQZ-1
status: done
implements: FS-3QHQZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-3QHQZ slice 1: branching-trail generator as a pure, seeded, reusable module (internal/levelgen)"
---
Implements FS-3QHQZ §A (Requirements 1–8), §B Requirement 12 (the Forest's parameter set only)

Agent lane (the user: "no hand coded here, all agents now"). Independent of art, of the Forest
world and of FS-X2F2H, so it can run first.

## Files expected to touch

- `game-server/game-service/internal/levelgen/` (new package): `params.go` (parameters and
  validation), `layout.go` (output types: `Rect`, `Point`, `Layout`, `Trail`, `DeadEnd`),
  `trail.go` (walk, branches, clearings, retry), `merge.go` (wall cells into rects),
  `validate.go` (layout invariants), `forest.go` (the Forest's starting parameter set as a named
  value, `ForestParams`, so slice 2 does not invent it).
- `game-server/game-service/internal/levelgen/*_test.go`, including an ASCII render helper and
  `internal/levelgen/testdata/<fixed-seed>.golden`.

Nothing else. The package must not import `ecs`, `components`, `systems`, `game`, `gameserver`,
or anything outside the standard library.

## What to Build

A pure function, roughly `Generate(p Params, seed uint64) (Layout, error)`:

1. Validate parameters (R7); invalid ones return a wrapped error before any walking.
2. On a cell grid: the mouth on the entrance side at a seeded position away from the corners; a
   forward-biased main trail that never touches itself until it covers the span share; a seeded
   count of branches from main-trail cells, forking up to the depth limit; a clearing at every
   dead end; a solid border except across the mouth; a minimum gap between unjoined segments;
   trails carved at the parameterised width. The trail network is a tree (R3, R4).
3. Merge every uncarved cell into axis-aligned rects (rows into runs, then stack equal runs), in
   world px, top-left origin: the `WallConfig` / `PlaceArea` convention (R5).
4. Self-validate (R6). On a failed attempt, retry from a seed derived deterministically from the
   original, up to the retry limit; report `Seed` and `Attempt`. Never truncate walls to meet the
   budget.
5. One seeded source (`math/rand/v2` PCG or equivalent); no global rand, no clock, no map-order
   dependence (R2).
6. `ForestParams`: cell 80 px, 26 × 17 cells, entrance east, trail width 2 cells, main span ≥
   60 % of width, 3–5 branches, fork depth ≤ 2, clearing radius 2 cells, gap ≥ 1 cell, border 1
   cell, wall budget 120, retry limit 32 (R12). Starting values; the property test is the gate.

## Acceptance Criteria

- [ ] The package imports only the standard library; no game package imports.
- [ ] Same params and seed twice → `reflect.DeepEqual` layouts; at least 2 of 10 consecutive seeds differ.
- [ ] Property test over ≥ 1 000 seeds with `ForestParams`: open cells all reachable from the mouth; one clearing per dead end; rects never overlap open cells or each other; rects inside bounds; rects tile exactly the uncarved cells; rect count ≤ 120; no loops; gap kept; border solid except the mouth; main trail ≥ span share.
- [ ] Table-driven invalid-parameter cases each return an error.
- [ ] A parameter set that forces the first attempt to fail returns a valid layout with `Attempt > 0`, deterministically.
- [ ] Golden ASCII of one fixed seed (`#` wall, `.` open, `E` mouth, `o` clearing centre) in `testdata/`; the test fails on any change.
- [ ] Trail width in px ≥ 4 × `PlayerRadius` (20) for `ForestParams`.
- [ ] `go test ./internal/levelgen/...` and `golangci-lint run` green.

## Blocked By

None

## Spec Reference

FS-3QHQZ §A Requirements 1–8; §B Requirement 12 (parameters); Acceptance Criteria "Generator
(§A)"; Edge States "Generator boxed in", "Wall budget exceeded"; User Stories 24, 25, 27.

## TDD Approach

- RED: the parameter-validation table test, then a determinism test against a stub returning an
  empty layout.
- GREEN: walk, carve and merge until determinism and the ≥ 1 000-seed property test pass; then
  record the golden ASCII.
