---
id: I-P9G8R-5
status: done
implements: FS-P9G8R
blocked_by: [I-P9G8R-1, I-P9G8R-4]
labels: [ready-for-agent]
title: "FS-P9G8R slice 5: key 1 drinks a potion, listed in the controls panel"
---
Implements FS-P9G8R §C (Requirements 27–30), §WebSocket message surface

**Lane: agent** (game-client). The player-facing half of the drink.

## What to Build

- **The message**: `DrinkPotion: "drink_potion"` in `ActionType` and `drink_potion:
  Record<string, never>` in the action map (`src/assets/types/client.ts`), as `leave_run` is.
  Do not reuse the dead `ActionType.Use`.
- **The binding** (R26–R28): in `bindRunInput`, bind the key from slice 4's `drinkPotion` mapping
  as a keydown **event** (`keydown-ONE`, derived from the mapping, not retyped), gated on
  `if (this.menu) return;` like E/F/I/Q/H. Never a `JustDown` poll: `offerMenu` already polls ONE
  with `JustDown` every frame and one poll would steal the other's press. One send per press
  (ignore key repeat). Optional skip when the count is 0 or the player is resolved. No local
  prediction of the heal or the slot.
- **Controls panel** (R29): a row "1 — Drink potion" in the `controls` list, the key read from the
  mapping.
- **No feedback beyond the Health bar** (R30): no new text, art, sound or notice.

## Acceptance Criteria

- [ ] Pressing 1 in play sends exactly one `drink_potion` with an empty payload; holding 1 sends
      one.
- [ ] With the ESC menu or its confirm open, 1 picks the row and sends no `drink_potion`.
- [ ] The controls panel lists "1 — Drink potion", its key from the mapping.
- [ ] Against a server with slice 1: drinking raises the Health bar and the cell's count drops on
      the next state (manual check on the integration stack).
- [ ] The hub and field scenes send nothing on 1.
- [ ] Client tests, typecheck and lint pass.

## Blocked By

- I-P9G8R-1 (the server answers `drink_potion`; needed for the end-to-end check)
- I-P9G8R-4 (the `drinkPotion` mapping; both edit `BarrowspireScene.ts`)

## Spec Reference

FS-P9G8R §C Requirements 27–30; §WebSocket message surface; §Acceptance Criteria "The potion
cell and the key" (send, menu gating, controls panel, hub / field); User Stories 1, 7, 15, 16, 28.

## Files expected

- `game-client/src/assets/types/client.ts` (action + map entry)
- `game-client/src/scenes/BarrowspireScene.ts` (`bindRunInput`, controls list) **hotspot, after slice 4**
- `game-client/src/scenes/runActions.ts` (read only, from slice 4)
- `game-client/src/scenes/BarrowspireScene.test.ts` (send and menu-gating tests)

## TDD Approach

- RED: a scene test pressing ONE with the menu closed, expecting one `sendMessage("drink_potion",
  {})`; then the same with the menu open, expecting none.
- GREEN: the action type, the event binding from the mapping, the menu gate, the controls row.
