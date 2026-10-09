---
id: I-4R9M9-10
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-7, I-4R9M9-9]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 10: Wightfang, The Hollow Crown and Ring of the Last King work"
---
Implements FS-4R9M9 §Requirements (Unique effects 32, 33, 37, 38; Uniques 29)

**Domain:** game-service · **Touches `internal/game/session.go`:** **yes, one line** — `SubscribeKills` of the unique-effect consumer in `newSession`. · **Lane:** agent-ready.

## What to Build

- New `internal/game/unique_effects.go`: a `KillConsumer` resolving `KillerMemberID` to the
  killer's entity; if alive, in play, and wearing (equipment slot) a unique with:
  - `kill_frenzy`: add a stack (max 3) and reset the 4 s timer on a new `FrenzyComponent`
    (pure data);
  - `kill_heal`: heal `max(1, round(4% × max health))`, capped at max.
- `GearSystem` (slice 9): counts `kill_frenzy` stacks as +15% attack speed each inside the +50%
  cap, ticks the frenzy timer down and clears stacks at 0; applies `floor_attributes` as
  +(depth − 1) to Strength, Agility, Intelligence, Vitality while worn (`systems.CurrentFloor`).
- Each effect applies once however many copies are worn (R29); never from a dead / out-of-play
  wearer; nothing in the HUB.

## Acceptance Criteria

- [ ] Wightfang: three kills in 4 s give +45% attack speed; 4 s after the last kill it is gone;
      a fourth kill keeps 3 stacks and resets the timer.
- [ ] Hollow Crown: a kill heals 4% of max (min 1), never above max; a dead wearer gets nothing.
- [ ] Ring of the Last King on floor 3: +2 to each attribute; two worn → still +2.
- [ ] Session tests drive kills through the real CombatSystem; existing tests green.

## Blocked By

I-4R9M9-7 (uniques exist with effect codes), I-4R9M9-9 (`GearSystem`, gear bonus component).

## Spec Reference

FS-4R9M9 §Requirements 29, 32–33, 37–38; §Acceptance Criteria "Uniques" row 1 (three of six);
§Edge States "Unequip during a frenzy", "Two Rings of the Last King". User Stories 7, 15.

## TDD Approach

- RED: kill record for a Wightfang wearer → frenzy stack and shorter next cooldown.
- GREEN: consumer + frenzy component + gear-system hook.
