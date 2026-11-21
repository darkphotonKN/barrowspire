---
id: I-E1ZDG-10
status: open
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 10: Sellsword: five parry charges, no riposte, each charge a sharper, faster cut, and five pips"
---
Implements FS-E1ZDG §J (Requirements 33–36), §L (Requirements 44–46)

**Lane: agent** (game-service, game-client). Changes FS-MAMHR §E.23 through its stub
`## Change: Duelist and Sellsword riposte rules → FS-E1ZDG`, and FS-8AY7S R14, R22 through its stub
`## Change: Sellsword's five parry charges → FS-E1ZDG`.

## What to Build

- **game-service**
  - A Sellsword's parry-charge pool has **max 5**: at seating (seated at 0), and at the pick
    (I-E1ZDG-2's seam: the max becomes 5, the count stays).
  - `armCut` never arms the riposte for a Sellsword.
  - Per charge held at the moment a cast resolves: **+5% cut damage** (the cut's raw damage ×
    `1 + 0.05 × charges`) and **+5% attack speed** (added after worn attack speed's cap, shortening
    every cooldown).
  - Death's existing reset to 0 (FS-MAMHR R21) drops the stacks; nothing new there. Settle the
    Debt (FS-04EEA) spends the charges like any spend.
- **game-client**
  - `resources.ts` draws one pip per point of a `parry_charges` resource's **max** (3, or 5 for a
    Sellsword), in the HUD and the party frames alike; `PARRY_PIPS` goes.
  - `riposteArmed` is never true for a Sellsword: no armed tell, no riposte slice; the left-click
    always plays the cut.
  - The Sellsword's parry card line: "Turn a blow as it lands for a parry charge. Each one held
    sharpens the cut."

## Acceptance Criteria

- [ ] A Sellsword's cut at 0–5 charges is always a cut; parries climb to 5 and stop.
- [ ] At 4 charges a cut's raw damage is 1.20× and its cooldown is `0.25 / (1 + (min(worn, 50) +
      20) / 100)`.
- [ ] A Sellsword who dies is at 0 charges.
- [ ] A Sellsword at 5 who parries negates the strike, counts the parry, and stays at 5.
- [ ] The charges and stacks carry across a floor change.
- [ ] A Sellsword's HUD and party frame show 5 pips; an unspecialized merc's and a Duelist's show 3.
- [ ] A Sellsword at 5 charges shows no armed tell and plays the cut.
- [ ] The Sellsword's card shows the Sellsword line.
- [ ] `make test` in game-service; `npm test`, `npm run lint`, `npm run lint:fence`,
      `npx tsc --noEmit` in game-client.

## Blocked By

I-E1ZDG-2 (the body carries its specialization; the pick seam; `specialization` on
`current_player`).

## Spec Reference

FS-E1ZDG §J R33–36; §L R44–46; §Acceptance Criteria "Duelist and Sellsword" rows 2–4, "Client" rows
7–8; §Edge States (Sellsword rows); User Stories 26–30.

## Files expected to touch

- `game-server/game-service/internal/game/class_growth.go` or the seat path (max 5)
- `game-server/game-service/internal/systems/combat.go` (`armCut`, `snapshot`, `resolve`
  cooldown)
- `game-server/game-service/internal/systems/riposte_test.go`, `parry_test.go`,
  `game/character_seat_test.go`
- `game-client/src/ui/resources.ts`, `ResourceHud.ts`, `partyFramesLayout.ts` (+ tests)
- `game-client/src/render/effects/riposte.ts` (+ test)
- `game-client/src/ui/abilityCopy.ts`, `abilityCard.ts` (+ tests)

## TDD Approach

- RED: seat a Sellsword; the parry-charge pool is 0 / 5. Five parries leave 5; a sixth leaves 5.
- GREEN: the max at seating; then `armCut`, damage and cooldown, one test each.
- RED (client): a `parry_charges` resource of max 5 yields five pips.

## Note

I-E1ZDG-9 changes the same `armCut` and `riposteArmed`; whichever lands second rebases on the
other.
