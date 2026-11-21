---
id: I-04EEA-1
status: open
implements: FS-04EEA
blocked_by: ["FS-8RZ51 (the tier-3 node held on the seated delver, readable by the CombatSystem)"]
labels: [blocked]
title: "FS-04EEA slice 1: tree abilities are gated by class and the tier-3 node, and Earthbreaker slams"
---
Implements FS-04EEA §A, §B

**Author: agent**

## What to Build

game-service knows the four tree abilities, refuses any of them to a caster who has not earned
it, and resolves the warrior's Earthbreaker as an all-round slam (the stun is slice 2).

- In `internal/components/attack.go`, add the four attack kinds: `earthbreaker`, `blink`,
  `arrow_rain`, `settle_the_debt` (R1).
- In `internal/systems/combat.go`, map the four skill ids in `skillAliases`, one kind each.
  Add an Earthbreaker row to `attackTable`: physical, coefficient 1.5, scaling
  `scaleStrength` as the slash row (integrator correction 2026-11-21 — reason: the warrior's slash
  scales on Strength), cost 40, cooldown 10 s, reach 90 px, all round, `slows: true` (R5, R8,
  R9). An all-round area around the caster is a new delivery (a cone with no arc limit is fine if
  it reads clearly); slice 5's Settle the Debt reuses it.
- The class config (`game/session.go`, beside `Ability:`) names each class's tree ability (R2).
  Carry it onto the delver the way `AbilityComponent` carries the right-click ability.
- **The gate (R3).** In `resolve`, a tree-ability intent does nothing at all (no effect, no cost,
  no cooldown) unless the caster's class names that tree ability **and** the caster holds their
  tree's tier-3 node, read from the state FS-8RZ51 seats on the delver. Rows for Blink, Arrow Rain
  and Settle the Debt land in slices 3–5. Until then their ids resolve to nothing because they
  have no row.
- The common path stays as it is (R4, R6): cooldown and cost refusal, the cost paid once, the
  cooldown shortened by worn attack speed, the attack slow, and a new cast ending a charge in
  flight.
- A slam that hits nothing still pays and cools down (R11).
- **Exported reads for FS-Q18Q3's wire** (its I-Q18Q3-2 expects them): whether a delver holds their
  tree ability (class names it and the tier-3 node is held), and a tree ability's cost beside
  `AttackCost`, reading Settle the Debt as its least cost, 1. Its cooldown slot: the cut's for the
  mercenary (R33).

**Ship before slices 6–7.** A client sending these ids to a server without them gets
`ErrUnknownSkill`.

## Acceptance Criteria

- [ ] `SkillAttackKind` maps each of the four ids to its own kind.
- [ ] Each class config names its tree ability.
- [ ] Earthbreaker cast by a non-warrior, or by a warrior without the tier-3 node, does nothing:
      no damage, no stamina spent, no cooldown.
- [ ] A warrior with the node, 40+ stamina and off cooldown: every valid target within 90 px all
      round is hit, physical, coefficient 1.5, on Strength with worn Strength; 40 stamina is
      spent; a 10 s cooldown starts (10 / 1.5 s with 50% worn attack speed).
- [ ] Inside the cooldown or under 40 stamina: nothing happens, nothing is spent.
- [ ] A slam with nothing in range still spends 40 and starts the cooldown.
- [ ] A resolving slam starts the attack slow and ends a charge in flight.
- [ ] Delvers are not hit with player damage off.
- [ ] The exported reads answer "holds it" only with the class and the node, and Earthbreaker's
      cost as 40 (slices 3–5 add 30, 35 and Settle the Debt's 1 as their rows land).
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

FS-8RZ51 (the tier-3 node held on the seated delver, readable by the CombatSystem). If it has not
landed, build the gate against a narrow interface or component this slice owns and name it in the
PR so the FS-8RZ51 implementer fills it; do not invent the tree's persistence here.

## Spec Reference

FS-04EEA §A R1–R7, §B R8–R11; §User Stories 1–4, 23, 31, 33, 34; §Acceptance Criteria
"game-service" (alias, class config, gate, cooldown, Earthbreaker rows); §Edge States "Tier-3 node
not held", "Wrong class's id", "Earthbreaker's scaling". ADR-0030.

## Files expected

- `game-server/game-service/internal/components/attack.go`
- `game-server/game-service/internal/components/ability.go` (or a sibling component for the tree ability)
- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/systems/combat_test.go`
- `game-server/game-service/internal/game/session.go` (class configs)
- `game-server/game-service/internal/game/factory.go` (seating the tree ability)
- `game-server/game-service/internal/game/combat_test.go`

## TDD Approach

- RED: `combat_test.go` alias cases for the four ids; a resolve test that a warrior with the node
  and 100 stamina hits two monsters at 60 px and 85 px either side, misses one at 95 px, ends at 60
  stamina with a 10 s cooldown; a test that the same cast without the node changes nothing.
- GREEN: kinds, aliases, the row, the all-round delivery, the gate.
