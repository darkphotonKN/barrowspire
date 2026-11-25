---
id: I-X2CMM-26
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-14", "I-X2CMM-15", "I-X2CMM-16", "I-X2CMM-17", "I-X2CMM-18", "I-X2CMM-19", "I-X2CMM-20", "I-X2CMM-21"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 26: server wave-2 review fix round 1 (flaky hire test, area abilities spare the hound, a shut cage, BookGround's ports, stale contracts)"
---
Implements FS-X2CMM §C, §J R49–R58

**Author: agent**

## What to Build

Fixes from `/code-review` of the wave-2 server diff (`4e358210...` I-X2CMM-20), both axes. Server only.

1. **A flaky test (MED).** `TestCastSkill_StrikeADeal_OnlyANearEncounterNPC`
   (`internal/game/class_book_strike_a_deal_test.go`) fails about 3 runs in 8 at a fixed seed ("no open
   ground 400 px from the NPC"): `npcsOf(s)[0]` takes its order from `GetAllEntities`. Pick the NPC
   deterministically (sort by id) and find the far spot robustly (a band of distances, not exactly 5
   cells). Run the test 20 times (`-count=20`) to show it holds.
2. **Monster area abilities strike a standing hound, against a recorded decision (MED, spec).** FS-X2CMM
   "Reconciled at review (wave 1)" says monster area abilities strike delvers only. I-X2CMM-17 made
   `BodyHound` `Hunted()`, so `huntedHit` (`systems/monster_ability.go`) now hits it. Keep the hound
   hunted (chased and struck in melee), but have `huntedHit` spare it; flip the test that locks the new
   behaviour (`systems/hound_body_test.go`). Update `huntedHit`'s doc comment.
3. **Pick the Lock on an open cage (LOW, spec R4).** `isCage` (`systems/book_pick_the_lock.go`) accepts
   an already-open cage, so the 4 s cast is spent before `cage_open`. Make it a shut cage, judged at the
   cast and again at completion (the key may open it mid-cast: then `cage_open` is still told).
4. **`BookGround` holds the world's entry points (LOW, SRP/ISP).** Keep the one-method, consumer-owned
   ports (`ContractTaker`, `CageOpener`, `GroupHirer`, `FarReach`), but move them off `BookGround` (the
   floor's ground: Walkable, Ground, EndCharge, Footing, Cells) into their own struct (e.g.
   `PageEntryPoints`; not `BookWorld`, the glossary's World is taken), passed where the entries run. Do not collapse them into one wide interface.
5. **Heave's target rule (LOW).** Add `PageHeave: isStoneBlock` to `pageInteractables` (`systems/book.go`)
   so every entity page names its own predicate; `gateHeave` keeps only what is Heave's own (the shove).
6. **The shove builds a bare `StoneBlockSystem` (LOW, encapsulation).** `shoveOf`
   (`systems/stone_block.go`) makes `&StoneBlockSystem{grid: grid}` with no drift to reuse `refused` and
   `land`. Make those two read only what they need (functions over the grid), so no half-built system is
   made.
7. **An afar timed open is a flag plus a point (LOW).** `TimedOpenComponent.Afar/AfarX/AfarY`
   (`components/timed_open.go`, `systems/timed_open.go`): always store the reach point (the body's at
   `Start`, the given point at `StartAfar`) and drop the flag; behaviour unchanged, the existing tests
   guard it.
8. **Far Hand's reach is open to every interact branch (LOW, defence in depth).** `interactFrom(from)`
   (`game/session.go`) measures every branch from `reach`. Have `ReachFar` (`game/class_book_far_hand.go`)
   refuse anything but the branches Far Hand works (doors, containers, levers / bridge levers, traps)
   before it calls `interactFrom`, tested, so a remote stairs climb or escape cannot happen even if the
   page's own target rule changes.
9. **Stale contracts (LOW).** Update the doc comments of `BodyOverlapsCell` (`systems/stone_block.go`) and
   `plateHeld` (`game/weighted_plates.go`) for the hound. When a hound is the first onto a plate and wakes
   its ambush, aggro the ambush on the hound's archer if in play, else on the delver nearest the plate,
   never on the hound itself; test it.
10. **The set-down's nearest cell ignores walls (LOW).** `setDownOffPit` (`systems/book_levitate.go`) takes
    the nearest walkable cell by straight distance; safe today only because the chasm band is 2 cells
    thick. Prefer a cell reachable from the pit across pit cells (search outward over pit and walkable
    cells from the delver's cell), falling back to the straight nearest; test with a band wider than 2.

Out of this round: Far Hand line of sight (owner's call, flagged), the bay's exact point on the wire (as
recorded at wave 2).

## Acceptance Criteria

- [ ] Each item above, with a test where behaviour changes; items 4–7 under the existing tests.
- [ ] `make test` and `go vet ./...` green; the Strike a Deal test green at `-count=20`.

## Blocked By

I-X2CMM-14..21

## Spec Reference

FS-X2CMM §C, §J R49–R58, "Reconciled at review (wave 1)", "Reconciled at wave 2"
