---
id: I-8RZ51-9
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-7]
labels: [blocked]
title: "FS-8RZ51 slice 9: the character panel lists the tree's summed bonuses and the kickers held (game-client)"
---
Implements FS-8RZ51 §G R44

**Author: agent.** Touches FS-HRH2J's character panel; the integrator adds the stub on FS-HRH2J.

## Files it expects to touch

- `game-client/src/ui/characterSheet.ts` (a `passives` group from `passive_ranks` and the golden)
  and `characterSheet.test.ts`
- `game-client/src/ui/GearOverlay.ts`, `game-client/src/ui/gearOverlayLayout.ts` (draw the group
  beside the gear's) and their tests
- `CharacterSource` in `characterSheet.ts` picks `passive_ranks`

## What to Build

A "Passives" group on the character panel: one line per summed bonus across held nodes, from the
golden's values ("+8% max HP", "+2 Strength", "+20% stamina regen"), then one line per R3 kicker
held, by its name from the presentation copy. None held: the group reads "None yet". Health and
resource maxima already come from the server, so a spend in town shows there at once.

## Acceptance Criteria

- [ ] Sums across nodes of the same stat (a warrior's `t1a` and `t2b` both add max HP).
- [ ] A kicker at rank 2 adds its stat line but no kicker line; at rank 3 both.
- [ ] The panel redraws when `passive_ranks` changes while it is open.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-7 (the presentation copy and the golden reader).

## Spec Reference

FS-8RZ51 §G R44, §F R27. User story 13.

## TDD Approach

- RED: `characterSheet` with `{ "warrior.t1a": 2 }` lists "+8% max HP".
- GREEN: the sum over the golden's per-rank values.
