---
id: I-X2CMM-1
status: open
implements: FS-X2CMM
blocked_by: []
labels: [ready-for-agent]
title: "FS-X2CMM slice 1: the server's class books: the page table, the gates, the owner's book on the wire, and Hardened"
---
Implements FS-X2CMM §A, §B, §C, §F, §K

**Author: agent**

## What to Build

Lays the server side every later page stands on, proven end to end by the simplest page:
Hardened (self, no cast time). Keep it in **new files** where you can (the Spire branch edits
`session.go`, `combat.go` and the serializer in parallel; a coordinator merges later).

- **The table (R1, R2, §B).** A new `classBooks` table (e.g. `internal/game/class_book.go` or a
  `bookpages` package if cleaner) holding all 14 pages of §B: id, class, unlock level, target kind
  (`ground|ally|interactable|self|none`), range in cells, cast time, cost, cooldown or limit
  (`per_floor`, `per_delve`), and whether the page is **offered** (has a resolver; R59). Only
  `hardened` is offered after this slice. Each class config names its pages in book order.
- **Routing.** `handleCastSkill` sends a page id to the book path instead of `skillAliases`
  (page ids are never attack kinds, R2). Parse an optional `target_id` (string) into
  `PlayerCastSkillPayload` (R13, R35). No new action.
- **The gates (R4).** Refused with no effect, no cost, no cooldown and no message back when: the
  class lacks the page or the level (`StatsComponent.Level`) is below its unlock level; the world
  is not a run (copy `drinkPotion`'s run-only check); the caster is not in play; on cooldown or
  spent; short of cost; bad or out-of-range target (R13–R15, the floor's `CellSize`); already
  casting (slice 2 adds casting; leave the hook); pinned (`AttackPinComponent`); and the page is not
  offered.
- **Resolve (R5–R8).** Instant pages pay cost, start their book cooldown (no attack-speed
  pace) and apply. They never start the pin and never end a charge. A new component on the delver
  (e.g. `BookComponent`) keeps book cooldowns `{remaining,total}` per page, the spent set for
  per-floor and per-delve pages, and timed book states. A new system ticks them (one place,
  called from `step`). Once-per-floor resets in `settlePartyOnNewFloor`. A fresh run seats a fresh
  component, so cooldowns are per run.
- **Hardened (R30).** Sets the `hardened` state for 10 s (cost 30 stamina, cooldown 90 s). Its
  immunity is wave 2.
- **The wire (R32–R34).** `current_player.book = {pages:[{id, unlock_level, cost, cooldown:
  {remaining,total}, spent}]}` in a run only, offered pages only, absent in hub and fields and on
  `other_players`. Delver states: a `book_states` list (or equivalent) of named states with their
  remaining seconds on both `current_player` and `other_players` (`hardened` now). Register new
  component types in `internal/ecs/entity.go`.

## Acceptance Criteria

- [ ] A level-9 warrior in a run casts `hardened`: stamina −30, cooldown 90 s starts, `hardened` 10 s shows on their own and on other players' state; it ends after 10 s.
- [ ] Refused with nothing spent: level 8; in the hub; in a field; on cooldown; short of stamina; pinned; dead; a mage casting `hardened`; a non-offered page (`recall`).
- [ ] Book cooldowns are not shortened by attack speed and the cast starts no pin.
- [ ] `current_player.book` lists the offered pages with `unlock_level`, `cost`, `cooldown`, `spent`; absent in hub and fields and never on `other_players`.
- [ ] A once-per-floor spent flag resets on a floor change (unit-test the reset with a fake per-floor page row if no per-floor page is offered yet, kept in the test only).
- [ ] `make test` green in game-service.

## Blocked By

None

## Spec Reference

FS-X2CMM §A R1–R8, §B (table), §C R13–R15, §E R30, §F R32–R35, §K R59

## TDD Approach

- RED: `TestCastSkill_HardenedForALevel9WarriorInARun` (copy `TestCastSkill_EarthbreakerOnlyForAWarriorHoldingTheNode`).
- GREEN: table, routing, gate, component, system, serializer.
