---
id: I-Q18Q3-7
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-2, I-Q18Q3-4, I-Q18Q3-6]
labels: [blocked]
title: "FS-Q18Q3 slice 7: the 3 square shows the held tree ability with its cost, sweep and greying (game-client)"
---
Implements FS-Q18Q3 §E (R26), §D (R18, R19), §C (R15)

## Files it expects to touch

- `game-client/src/ui/abilityBar.ts`, `abilityBar.test.ts` (the 3 square's held view: the class's tree
  icon key, `tree_ability_cost`, the cooldown, the greying)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (draw the held state; the sweep from
  slice 6)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts` and their `*.test.ts` (hand the bar
  FS-04EEA's key-3 client lockout, if it has one)

## What to Build

Once `tree_ability_cooldown` is present on `current_player`, the 3 square shows the class's tree
ability icon (Earthbreaker, Blink, Arrow Rain, Settle the Debt), `resource.tree_ability_cost` under it
in the resource's channel colour, the sweep from `tree_ability_cooldown`, and greys when
`resource.current < tree_ability_cost`, while its cooldown runs, or while FS-04EEA's own key-3 client
lockout runs. While the field is absent it stays locked (slice 4). No active state on the 3 square.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-client: the 3 square's **held** half (icon, cost, sweep,
      greying by cost and cooldown).
- [ ] Edge State: `tree_ability_cost` present with `tree_ability_cooldown` absent stays locked.
- [ ] A mercenary's square greys during the cut's slot and reads cost 1.
- [ ] Headless captures of each class's held square, lit and swept, checked by eye.
- [ ] Typecheck, lint, the token fence and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-Q18Q3-2 (the tree fields on the wire)
- I-Q18Q3-4 (the bar)
- I-Q18Q3-6 (the sweep)
- blocked by FS-04EEA (the key-3 cast and any client lockout it keeps)

## Spec Reference

FS-Q18Q3 §E R26, §D R18–R19, §C R15; User Stories 16, 27.

## TDD Approach

- RED: `abilityBar.test.ts` expects a warrior state with `tree_ability_cooldown {0, 0}` and
  `resource {current: 30, tree_ability_cost: 40}` to give a held, greyed Earthbreaker square reading
  40.
- GREEN: the held branch of the 3 square's view.
