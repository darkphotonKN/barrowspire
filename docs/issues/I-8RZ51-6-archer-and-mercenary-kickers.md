---
id: I-8RZ51-6
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-4]
labels: [blocked]
title: "FS-8RZ51 slice 6: the archer's and the mercenary's four kickers, per-rank stats and rank-3 rules (game-service)"
---
Implements FS-8RZ51 §F R29 (archer and mercenary rows)

**Author: agent.** Reuses (checked 2026-11-21): worn attack and move speed inside the gear caps,
crit chance, pierce, the parry-negation path of a monster strike, the parry
window (`parryWindow` 0.25 s) and cap, the monster wind-up (`WindUpRemaining`), the kill record,
Shadow Shot's cost in `attackTable`. **New, small:** an arrow counter for Quick Draw, an
"early in the window" test for Practiced Guard, Sidestep's per-strike miss roll (an injectable
roll for tests), a riposte heal, a resource refund (shared with
slice 5; whichever lands first builds it).

## Files it expects to touch

- `game-server/game-service/internal/systems/combat.go` (attack speed and cut cooldown, every-4th
  arrow pierce, Sidestep's miss on a monster strike, forced crits for Eagle Eye and Keen Edge, parry
  window and early-parry charges, riposte damage and heal, kill charge, kill refund) and
  `combat_test.go`, `parry_test.go`, `riposte_test.go`, and the monster-shot path in
  `internal/systems/projectile.go` if a shot resolves on the archer there
- `game-server/game-service/internal/components/` (the arrow count; data only)

## What to Build

Each row of R29 for `archer.t2a/t2b/t5a/t5b` and `mercenary.t2a/t2b/t5a/t5b`, R3 rule only at R3:

- Quick Draw: +4% attack speed per rank (inside the cap); R3 every 4th arrow fired in the world
  pierces one more monster.
- Fleet Foot: +3% move speed per rank (inside the cap); R3 **Sidestep**: 10% of monster strikes
  (melee or shot) on the archer miss, negated like a parry (no damage, no crit roll) but no charge
  and no stance; the archer's casts keep the attack slow. *(integrator correction 2026-11-21 —
  reason: moving while shooting will not be allowed (Kranti); replaces "the archer's casts start
  no attack slow")*
- Eagle Eye: +3 crit points per rank; R3 every Shadow Shot is a forced crit (ADR-0030: no hold time
  on the server; every fired shot reads as fully drawn).
- Hunter's Breath: +10% stamina regen per rank; R3 a kill refunds Shadow Shot's `attackTable` cost.
- Keen Edge: +6% cut coefficient per rank; R3 a cut on a monster with `WindUpRemaining > 0` is a
  forced crit.
- Practiced Guard: +0.02 s parry window per rank; R3 a strike negated in the first half of the
  (lengthened) window grants 2 charges, the cap holding.
- Bloodied Riposte: +8% riposte coefficient per rank; R3 a riposte that hits heals 5% max HP, once.
- Steady Hand: cut cooldown −4% per rank; R3 a cut that kills grants 1 parry charge, capped.

## Acceptance Criteria

- [ ] One test per row: stat at R1 and R2, stat and rule at R3, no rule at R2.
- [ ] Tree attack/move speed plus gear never pass the caps.
- [ ] Practiced Guard's 2 charges and Steady Hand's charge never pass 3.
- [ ] Sidestep: roll forced to miss, a strike deals no damage, rolls no crit, changes no resource or
      parry state; forced to land, it resolves as today; none negated at R2; the attack slow still
      starts on the archer's casts.
- [ ] `make test` (and lint, check) green in game-service.

## Blocked By

I-8RZ51-4 (the bonus plumbing on the body).

## Spec Reference

FS-8RZ51 §F R29 (archer, mercenary), §Edge States (Sellsword with Bloodied Riposte). User stories
8, 21, 22.

## TDD Approach

- RED: an archer with `t2a` at 3 fires four arrows through a line of two ghouls; only the 4th hits
  both.
- GREEN: the count on the body and the pierce added in `snapshot`.
