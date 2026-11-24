---
id: I-X2CMM-22
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-8"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 22: server review fix round 1 (Long Night hold, expired effects, shared page table, book state seams)"
---
Implements FS-X2CMM §A, §D, §E R28, R31, §K R59

**Author: agent**

## What to Build

Fixes from `/code-review` of the wave-1 server diff (`fe3282c1...` I-X2CMM-8), both axes. Server only.

1. **R31, the Long Night's hold outlives it (MED, both axes).** `taunt` in
   `internal/systems/book_long_night.go` sets `Retaliating = true`; `target()` keeps a
   retaliating target past the leash, so a monster dragged past its leash keeps chasing the warrior
   after the 6 s. Hold the taunted target with its own marker (e.g. a `Taunted`/night flag the
   night sets and clears), so when the night ends monsters choose targets normally. Test with a
   taunted monster beyond its leash when the night lapses.
2. **An expired book effect acts for the rest of its tick (MED).** `ageBookEffect`
   (`book_effects.go`) removes an expired hound, but `step` runs on the tick's entity snapshot,
   so the same tick `quarries`, `runHounds` and `houndsBite` still use it (a bite at 40 s can
   still kill and credit the archer) and it is broadcast once more with `remaining <= 0`. Skip a
   hound whose time is up (or at 0 health) in `standingHound`, `houndsBite`, `runHounds` and the
   serializer, or age effects at the end of `step`. Test it.
3. **The page table is shared across worlds (MED, repo rule).** `NewBookComponent` puts the
   package-level class book slices straight into every delver's `BookComponent.Pages`. Clone
   them (`slices.Clone`).
4. **Page-specific state on the general book component (MED, OCP/SRP).**
   `BookComponent.LongNightReach` and `BookComponent.Draught` move to their own components on
   the delver (e.g. `LongNightComponent{Reach}`, `DraughtHealComponent`), added by their
   resolvers and removed when their state ends, like `RuneComponent` and `HoundComponent`. The
   draught branch leaves `BookSystem.Update`'s core loop.
5. **`BookWorld` collides with the glossary's World (MED, language).** Rename it (e.g.
   `BookGround`) and `Session.bookWorld()` with it.
6. **`BookSystem.Update` has four jobs (LOW).** Split effect catching and ageing into their own
   pass (`ageBookEffects`); `Update` may call both so the session hook stays one line.
7. **`delvers` holds hounds (LOW, language).** Rename the `quarries` result at the
   monster_ai.go hook line and its readers' parameter where it now includes hounds.
8. **Monster abilities never hit a hound (LOW).** Leave abilities to delvers only (the
   Spire branch edits `monster_ability.go`), but keep an ability user from wasting its abilities
   on a hound target if that is a one-line guard; otherwise leave it and say so. The FS edge state
   is recorded by the coordinator.
9. **A cast completes one tick late (LOW).** `book_casting.go` compares `Elapsed` with `Total`
   before adding `deltaTime`. Add first, then compare, so a 1 s page resolves on tick 60 at
   60 Hz; adjust tests.
10. **Hound target ties (LOW).** `nearestMonster` in `book_hound.go` breaks ties by map order.
    Break ties by entity id and share one helper with the rune's nearest-first order if they fit.
11. **R59's game-level test (LOW, spec).** `game/class_book_test.go` "a page not offered" casts
    `recall`, now offered; use a wave-2 page (e.g. `heave` for a warrior).

## Acceptance Criteria

- [ ] Each item above fixed or, for 8, decided with a line in the report.
- [ ] A test fails without fix 1 and passes with it; same for fix 2 and fix 9.
- [ ] `make test` green; `go vet ./...` clean; `gofmt -l` clean on touched files.

## Blocked By

I-X2CMM-8

## Spec Reference

FS-X2CMM §A R4–R8, §D R16–R18, §E R28–R31, §K R59.

## TDD Approach

- RED: a monster taunted past its leash picks its target normally once the night lapses.
- GREEN: the night's own hold marker.
