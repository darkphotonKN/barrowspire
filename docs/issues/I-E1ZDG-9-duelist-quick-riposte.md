---
id: I-E1ZDG-9
status: open
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 9: Duelist: the riposte arms at two charges and costs two, and the client shows it"
---
Implements FS-E1ZDG §I (Requirement 32), §L (Requirements 45–46)

**Lane: agent** (game-service, game-client). Changes FS-MAMHR §E.23 through its stub
`## Change: Duelist and Sellsword riposte rules → FS-E1ZDG`.

## What to Build

- **game-service**: `armCut` arms the riposte for a Duelist at **≥ 2** parry charges, and the
  riposte then **spends 2**. Their max stays 3. An unspecialized merc keeps 3 / 3.
- **game-client**:
  - `riposteArmed` takes the spec: a Duelist is armed at ≥ 2, so the armed tell and the riposte
    slice show at 2.
  - The Duelist's parry card line: "Turn a blow as it lands for a parry charge. At two, the cut
    ripostes."

## Acceptance Criteria

- [ ] A Duelist's cut at 2 charges is a riposte and leaves 0; at 3 it leaves 1; at 1 it is a cut.
- [ ] An unspecialized merc's riposte still needs and spends 3.
- [ ] A Duelist at 3 who parries stays at 3.
- [ ] The Duelist's armed tell and riposte slice show at 2 charges; an unspecialized merc's at 3.
- [ ] The Duelist's card shows the Duelist line.
- [ ] `make test` in game-service; `npm test`, `npm run lint`, `npm run lint:fence`,
      `npx tsc --noEmit` in game-client.

## Blocked By

I-E1ZDG-2 (the body carries its specialization; `specialization` on `current_player`).

## Spec Reference

FS-E1ZDG §I R32; §L R45–46; §Acceptance Criteria "Duelist and Sellsword" rows 1, 5, "Client" row 8;
§Edge States (Duelist at 3); User Stories 24–25.

## Files expected to touch

- `game-server/game-service/internal/systems/combat.go` (`armCut`, the riposte cost)
- `game-server/game-service/internal/systems/riposte_test.go`
- `game-client/src/render/effects/riposte.ts` (`riposteArmed`) and test
- `game-client/src/render/combat/playerCombat.ts`, `classKitFx.ts` (pass the spec through)
- `game-client/src/ui/abilityCopy.ts`, `abilityCard.ts` (+ tests)

## TDD Approach

- RED: a Duelist at 2 parry charges casts `cut`; expect the riposte's 240° arc and 0 charges.
- GREEN: a per-spec arm threshold and cost in `armCut`.
- RED (client): `riposteArmed({resource: 2 charges}, "duelist")` is true; with no spec, false.

## Note

I-E1ZDG-10 changes the same `armCut` and `riposteArmed`; whichever lands second rebases on the
other.
