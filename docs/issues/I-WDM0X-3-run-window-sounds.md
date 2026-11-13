---
id: I-WDM0X-3
status: done
implements: FS-WDM0X
blocked_by: [I-WDM0X-1, I-WDM0X-2]
labels: [blocked]
title: "FS-WDM0X slice 3: window and minimap sounds in the run (BarrowspireScene wiring only) (game-client)"
---
Implements FS-WDM0X §Requirements (A: S1–S9), §Acceptance Criteria (The run, Housekeeping)

**Lane: agent.** game-client only. Serialized after slice 2: it uses the module hooks slice 2
adds, and `BarrowspireScene.ts` is touched here alone.

## What to Build

- **The player and the state.** Make the player in `create` and report the window state: the menu
  slot (menu, OPTIONS, Fall confirm), party, inventory, character. There is no letter.
- **Through `act`:**
  - the corner icon presses (Menu, Inventory, Character, Party);
  - I/B, C and Q in `bindRunInput`;
  - `pressEscape`;
  - the menu's and the Fall confirm's row actions and `close` (*Leave the barrow* included);
  - OPTIONS' `back`.
- **Passed on:** the wrapper to the gear overlay (through `EquipmentHud`) and the party panel.
- **The minimap.** `cycleMinimap` plays `map_mode_switch` once it has stepped the mode, and not
  when it returns early with no minimap.
- **Left outside `act`:** `yieldMenu`, `endRun`, `resetRun`, `leaveFloor` and the state handlers.

## Files it expects to touch

- `game-client/src/scenes/BarrowspireScene.ts` (window wiring only), `game-client/src/scenes/BarrowspireScene.test.ts`

## Acceptance Criteria

- [ ] Every item under FS-WDM0X §Acceptance Criteria "The run", tested with a recording stand-in
      for the player's plays.
- [ ] The menu yielding to a death or a resolve, the run's end, a floor change and the scene's end
      play nothing.
- [ ] After the run's end a corner icon press that opens or closes a window plays its sound.
- [ ] `BarrowspireScene.ts` changes only in its window wiring (FS §Housekeeping).
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` pass.

## Blocked By

I-WDM0X-1, I-WDM0X-2

## Spec Reference

FS-WDM0X §Requirements S1–S9 (the run's rows), S5 (Fall confirm). User Stories 1–4, 6–9, 11–18.
Edge States: held keys, after the run's end.

## TDD Approach

- RED: in `BarrowspireScene.test.ts`, the Fall confirm's *Not yet* plays `settings_close` and
  opening the confirm plays nothing.
- GREEN: the menu slot's rows and `close` through `act`. Then the other paths, one test each.
