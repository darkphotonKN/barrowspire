---
id: I-WDM0X-2
status: done
implements: FS-WDM0X
blocked_by: [I-WDM0X-1]
labels: [blocked]
title: "FS-WDM0X slice 2: window and minimap sounds in the town and the fields, with the shared modules' own inputs through the wrapper (game-client)"
---
Implements FS-WDM0X §Requirements (A: S1–S9; F: S23), §Acceptance Criteria (The town, The field)

**Lane: agent.** game-client only. Not `BarrowspireScene.ts` (slice 3). This slice gives the
shared modules their hook, and slice 3 only wires the run to it.

## What to Build

- **The shared modules** take an optional wrapper, a narrow `{ act(run: () => void): void }`
  that defaults to running `run`. Each runs its own player inputs through it:
  - `GearOverlay`: the panels' × (`onPointerDown` → `close(side)`);
  - `PartyPanel`: T (`onT`) and its ×;
  - `MailboxEnvelope`: `press`;
  - `LetterPanel`: its ×.

  `WorldMinimapController` takes an optional `stepped` callback, called by `cycle()` (only player
  paths reach it: M and the mode icon).
- **The window state.** `HubGear` and `EquipmentHud` expose whether the inventory and the
  character panel are open (the overlay already has `isInventoryOpen` / `isCharacterOpen`).
- **HubScene:**
  - **The player and the state:** make the player in `create` and report the window state: menu
    slot, letter, party, inventory, character.
  - **Through `act`:**
    - the corner icon presses (Menu, Inventory, Character, Party);
    - `offerGear`'s I/B/C;
    - `pressEscape`;
    - the menu's `actions` and `close`;
    - OPTIONS' `back`;
    - the stash chest's E branch (`openStash`).
  - **Passed on:** the wrapper to the overlay, the party panel, the envelope and the letter panel,
    and `stepped` → `map_mode_switch` to the minimap controller.
  - **Left outside `act`:** `queueGone`, `release` and the world handlers.
- **FieldScene:** the same, without the letter panel, and with Q (`equipment.hide()`) through
  `act`. `release` and the fall stay outside `act`.

## Files it expects to touch

- `game-client/src/ui/GearOverlay.ts`, `game-client/src/ui/GearOverlay.test.ts`
- `game-client/src/ui/HubGear.ts`, `game-client/src/ui/HubGear.test.ts`
- `game-client/src/ui/EquipmentHud.ts`, `game-client/src/ui/EquipmentHud.test.ts`
- `game-client/src/ui/PartyPanel.ts`, `game-client/src/ui/PartyPanel.test.ts`
- `game-client/src/ui/MailboxEnvelope.ts`, `game-client/src/ui/mailboxHud.ts` (passing the wrapper through)
- `game-client/src/ui/LetterPanel.ts`, `game-client/src/ui/LetterPanel.test.ts`
- `game-client/src/ui/worldMinimapController.ts`, `game-client/src/ui/worldMinimapController.test.ts`
- `game-client/src/scenes/HubScene.ts` (window wiring only), `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/scenes/FieldScene.ts` (window wiring only), `game-client/src/scenes/FieldScene.test.ts`

## Acceptance Criteria

- [ ] Every item under FS-WDM0X §Acceptance Criteria "The town" and "The field", tested in the
      scenes' tests with a recording stand-in for the player's plays.
- [ ] Each module's own input (overlay ×, party T and ×, envelope, letter ×) plays through the
      wrapper. The corner Party icon, which reaches `PartyPanel.toggle`, plays once.
- [ ] A module given no wrapper behaves exactly as before (the existing tests are unchanged).
- [ ] Leaving the town or a field with windows open plays nothing. A party panel carried open
      into the next world plays nothing as it appears.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` pass.

## Blocked By

I-WDM0X-1

## Spec Reference

FS-WDM0X §Requirements S1–S9, S23. User Stories 1–17, 30. Edge States: held keys, party panel
carried open, letters still loading, disconnect notice.

## TDD Approach

- RED: in `HubScene.test.ts`, the Menu icon over the open inventory plays `settings_open` alone.
- GREEN: the player in `create`, the window state, and the icon press through `act`. Then the
  other paths, one test each.
