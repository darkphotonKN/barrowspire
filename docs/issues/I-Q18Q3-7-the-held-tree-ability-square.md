---
id: I-Q18Q3-7
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-2, I-Q18Q3-4, I-Q18Q3-6]
labels: [blocked]
title: "FS-Q18Q3 slice 7: the 3 square shows the held tree ability with its cost, sweep and greying (game-client)"
---
Implements FS-Q18Q3 §E (R26), §D (R18, R19), §C (R15), §L (R40)

> **Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.** The world
> judges the held state (from its state and FS-04EEA's key-3 lockout, which only its combat knows)
> and puts it in the `bar` view as plain data; the UI scene's piece only draws it. The world files
> below are where the lockout joins the view, not where the square is drawn.

## Files it expects to touch

- `game-client/src/ui/abilityBarView.ts`, `abilityBar.test.ts` (world side, pure: the 3 square's held
  view: the class's tree icon key, `tree_ability_cost`, the `CooldownState`, the greying, with
  FS-04EEA's key-3 lockout as an input)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (UI-scene piece: draw the held state; the
  sweep from slice 6)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts` and their `*.test.ts` (pass FS-04EEA's
  key-3 client lockout, if it has one, into the view, and send the `bar` message again as it starts
  and ends)

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
- [ ] Each world's test checks the held 3 square in the `bar` message it sends; the piece's tests
      stand a fake bridge.
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
