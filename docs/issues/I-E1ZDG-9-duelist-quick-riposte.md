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

> *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.* The
> ability card is gone: the parry copy goes to the ability bar's right-click tooltip copy
> (`ui/abilityCopy.ts`, keyed by class and specialization, I-E1ZDG-2). The riposte tells stay
> world drawing on the merc's figure.

## What to Build

- **game-service**: `armCut` arms the riposte for a Duelist at **≥ 2** parry charges, and the
  riposte then **spends 2**. Their max stays 3. An unspecialized merc keeps 3 / 3.
- **game-client**:
  - World drawing: `riposteArmed` takes the spec (from `current_player.specialization`): a
    Duelist is armed at ≥ 2, so the armed tell and the riposte slice show at 2.
  - UI scene: the Duelist's parry row in `ui/abilityCopy.ts`, the bar's right-click tooltip: "Turn a blow as it lands for a parry charge. At two, the cut
    ripostes."

## Acceptance Criteria

- [ ] A Duelist's cut at 2 charges is a riposte and leaves 0; at 3 it leaves 1; at 1 it is a cut.
- [ ] An unspecialized merc's riposte still needs and spends 3.
- [ ] A Duelist at 3 who parries stays at 3.
- [ ] The Duelist's armed tell and riposte slice show at 2 charges; an unspecialized merc's at 3.
- [ ] The copy lookup gives the Duelist's parry line for `("mercenary", "duelist")`; with I-Q18Q3-5
      in, the right-click tooltip shows it.
- [ ] `make test` in game-service; `npm test`, `npm run lint`, `npm run lint:fence`,
      `npx tsc --noEmit` in game-client.

## Blocked By

I-E1ZDG-2 (the body's specialization; `specialization` on `current_player`; the spec-keyed copy
lookup). FS-Q18Q3 (square tooltips, I-Q18Q3-5) for the tooltip check only.

## Spec Reference

FS-E1ZDG §I R32; §L R45–46; §Acceptance Criteria "Duelist and Sellsword" rows 1, 5, "Client" row 8;
§Edge States (Duelist at 3); User Stories 24–25.

## Files expected to touch

- `game-server/game-service/internal/systems/combat.go` (`armCut`, the riposte cost)
- `game-server/game-service/internal/systems/riposte_test.go`
- `game-client/src/render/effects/riposte.ts` (`riposteArmed`) and test
- `game-client/src/render/combat/playerCombat.ts`, `classKitFx.ts` (world: pass the spec through)
- `game-client/src/ui/abilityCopy.ts` (+ test): the Duelist's row

## TDD Approach

- RED: a Duelist at 2 parry charges casts `cut`; expect the riposte's 240° arc and 0 charges.
- GREEN: a per-spec arm threshold and cost in `armCut`.
- RED (client): `riposteArmed({resource: 2 charges}, "duelist")` is true; with no spec, false.

## Note

I-E1ZDG-10 changes the same `armCut` and `riposteArmed`; whichever lands second rebases on the
other.
