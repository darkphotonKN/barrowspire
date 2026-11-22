---
id: I-04EEA-5
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-1]
labels: [blocked]
title: "FS-04EEA slice 5: Settle the Debt spends every parry charge on a flurry"
---
Implements FS-04EEA §F

**Author: agent**

## What to Build

`cast_skill {skill_id: "settle_the_debt"}` from a mercenary who has the tree ability and holds at
least 1 parry charge spends them all on one all-round hit per target, scaled by the count spent.
The first cast that spends a variable amount.

- Add a Settle the Debt row to `attackTable`: physical, base coefficient 1.0, cut's hybrid scaling
  (`scaleStrengthAgility`), reach 90 px all round (slice 1's delivery), `slows: true`, no cooldown
  of its own (R31).
- **Gate (R29).** Refused unless the pool holds ≥ 1 parry charge and the cut's cooldown slot
  (`components.AttackCut`) is free.
- **Spend (R30).** n = the pool's current; set it to 0 whether or not anything is hit. Do not
  assume 3: the pool's max may be 5 (FS-E1ZDG's Sellsword). The fixed-cost path (`pool.Current -=
  spec.cost`) cannot express this; add a variable-cost case without disturbing the riposte's −3.
- **Flurry (R31).** Each valid target within 90 px is hit once at coefficient 1.0 × n, its own crit
  roll.
- **Cooldown slot (R33).** Start the cut's slot at 0.25 s shortened by worn attack speed, not a slot
  of its own.
- Leave the parry stance and lockout as they are (R34). At 3 charges the riposte is simply no longer
  armed, because the pool is 0.

## Acceptance Criteria

- [ ] At 0 parry charges, or inside the cut's slot: nothing happens, nothing is spent.
- [ ] At n = 1, 3, and 5 (the last on a pool with max 5): the pool goes to 0; each valid target
      within 90 px all round is hit once, physical, coefficient n × 1.0, on (STR+AGI)/2.
- [ ] With nothing in range, every parry charge is still spent.
- [ ] A cut inside 0.25 s after it is refused; a second Settle the Debt inside it is refused too.
- [ ] Cast at 3 charges, the next cut is a plain cut, not a riposte.
- [ ] An open stance stays open and a lockout runs on.
- [ ] Not a mercenary, or no node: nothing happens.
- [ ] I-04EEA-1's exported tree-ability cost read answers 1 (its least cost).
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

I-04EEA-1 (the kinds, aliases, gate and all-round delivery). Not blocked by FS-E1ZDG: test the
5-charge case on a pool built with max 5.

## Spec Reference

FS-04EEA §A R4–R6, §F R29–R34; §User Stories 18–22; §Acceptance Criteria "game-service" (Settle the
Debt rows); §Edge States "Settle the Debt at 0 charges", "at 5 charges", "and a parry on the same
tick", "vs the riposte at 3 charges". FS-MAMHR §D.19, §E.23–25.

## Files expected

- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/systems/settle_the_debt_test.go` (new)
- `game-server/game-service/internal/systems/riposte_test.go` (only if a shared helper moves)

## TDD Approach

- RED: `settle_the_debt_test.go`, a merc holding 3 parry charges with two monsters at 40 px and
  80 px behind them: each takes one hit at coefficient 3.0, the pool reads 0, the cut slot reads
  0.25 s.
- GREEN: the row, the variable spend, the shared slot.
