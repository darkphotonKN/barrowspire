---
id: I-4R9M9-8
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-6]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 8: Slain monsters drop loot in a pile where they fell"
---
Implements FS-4R9M9 §Requirements (Drops from monsters 44–46; Item level 10; Rarity roll 21; In-run state 55)

**Domain:** game-service · **Touches `internal/game/session.go`:** **yes, one line** — `SubscribeKills` of the drop consumer in `newSession`, next to `NewKillLog`. Everything else in new files. · **Lane:** agent-ready.

## What to Build

- New `internal/game/monster_drops.go`: a `KillConsumer` (FS-77AB6 R29; `systems.KillRecord`)
  that rolls the R44 drop table once per record — ghoul 8%, troll 15%, any elite 50%, demon
  guaranteed 2 or 3; type split 30 / 40 / 10 / 20 (weapon / armor / ring / consumable), demon
  35 / 45 / 20 / 0 — each item at ilvl = `record.Level` with the elite / demon bias. Table and
  numbers live in `loot_tuning.go`. Synchronous on the tick, never blocks; it may change the world
  without locking (KillConsumer contract) — create entities via the factory, not `AddItem`
  (which takes `s.mu`).
- New factory function for a **drop pile**: a container entity at `record.X, record.Y` that is
  already open (`IsOpen` and `HasBeenOpened` true, so `generateItems` never runs on it) holding the
  rolled item ids, marked as a drop pile (e.g. a `Kind` on `ContainerComponent`). Pickup goes
  through the existing container path unchanged. It is a floor entity: the floor change clears it.
- Serializer: `ContainerState` gains `kind` (`chest` | `drop_pile`).
- No drop → no pile. The killer's state is irrelevant.

## Acceptance Criteria

- [ ] Seeded tests: drop rates per archetype / elite / demon; demon drops 2–3, never Normal.
- [ ] A kill that drops places a `drop_pile` container at the kill position, open, with items at
      ilvl = monster level; a delver takes an item from it like from an opened chest.
- [ ] A floor change removes the pile and its items (F6F88 exclusion rule).
- [ ] The consumer is subscribed once per run session; existing tests green.

## Blocked By

I-4R9M9-6 (pools with rings, roll wiring, item component fields).

## Spec Reference

FS-4R9M9 §Requirements 10, 21, 44–46, 55; §Acceptance Criteria "Drops" rows 1–3, "Protocol"
row 1 (`kind`); §Edge States "Kill on the same tick as a floor change", "Two delvers take the same
pile item", "Killer dead…". User Stories 10–13, 25–26.

## TDD Approach

- RED: `ConsumeKill` of a demon record with a seeded source creates a pile with 2–3 non-Normal items.
- GREEN: drop table + pile factory + subscription.
