---
id: I-G4VMQ-1
status: open
implements: FS-G4VMQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-G4VMQ slice 1: hub ESC menu with Change who you are"
---
Implements FS-G4VMQ §Requirements 1–10, 19–22

**Author: agent**

## What to Build

`HubScene` has no way back to the main menu; its only ESC reader (`dismissKey`) dismisses NPC
dialogue. Give the hub a small ESC menu whose first choice returns the delver to the existing
main menu, where the roster and DELVE already re-enter the hub as the picked character.

- **ESC opens the menu** when no NPC dialogue is open. With a dialogue open, ESC keeps
  dismissing the dialogue (the existing branch in `offerConversation`) and the menu does not
  open. Reuse the existing `dismissKey` key object polled in `update`; do not add a second ESC
  binding (FS-G4VMQ R1, R2, R20).
- **Two choices**: *Change who you are* and *Back*. ESC again closes the menu, as *Back* does.
  (Slice 2 adds a third, queue-only choice; leave the menu's choice list easy to extend, e.g.
  build it from the scene's state on open.) R3.
- **Chrome**: camera-fixed container at depth 2000 (the popup band, with the NPC dialogue), a
  dark vellum panel with a 1px brass hairline, choices in amber, *Back* in the cancel register,
  `CANVAS_FONT.body`, colours from `BARROW_HEX` only (token fence). Terse, grim copy; never
  names the hub. The existing `dialogueOption` / dialogue panel helpers are the natural
  precedent. R4.
- **The world keeps running** behind the menu; WASD is not sent while the menu is open, and the
  interact key does not open a dialogue over it (the menu owns the keyboard the way the dialogue
  does). R5.
- **Change who you are** calls `this.scene.start("MainMenuScene")`, exactly as
  `BarrowspireScene`'s ESC does. Nothing is sent. `MainMenuScene`'s roster, `activate`, and
  DELVE are not touched; `PhaserGame.tsx`'s `world_entered` handler is not touched. R6–R10.
- **Teardown**: the menu overlay and any new state are forgotten in the existing `release()`
  (SHUTDOWN and DESTROY), following the `queuePanel` pattern from commit 0a35e36 (reference
  forgotten on shutdown, reused only while `.active`). R19.

No server change; no new WebSocket message. Copy and chrome per `game-client/CONTEXT.md` and
`game-client/docs/design-guideline.md` Part I.

## Acceptance Criteria

- [ ] ESC in `HubScene` with no dialogue open shows the menu with *Change who you are* and
      *Back*.
- [ ] ESC with an NPC dialogue open dismisses the dialogue; no menu appears.
- [ ] ESC with the menu open closes it; *Back* closes it.
- [ ] With the menu open, no `move` message is sent for WASD and E opens no dialogue.
- [ ] *Change who you are* starts `MainMenuScene` and stops `HubScene`; no message is sent.
- [ ] From the main menu, DELVE sends `enter_hub` with the picked `characterId` and a
      `world_entered(hub)` starts `HubScene` (existing behaviour; verified, not changed).
- [ ] A refused `enter_hub` while queued shows its reason on the main menu (existing FS-BDA7X
      R41 path; verified, not changed).
- [ ] The menu is at depth 2000, drawn from `BARROW_HEX` tokens only; `npm run lint`'s token
      fence passes.
- [ ] After a `HubScene` shutdown and restart, no menu from the earlier visit is referenced and
      ESC opens a fresh one.
- [ ] Unit tests in `HubScene.test.ts` cover: ESC opens/closes, ESC with dialogue open, no move
      while open, *Change who you are* starts `MainMenuScene`, teardown forgets the menu.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-G4VMQ §Requirements 1–10, 19–22; §User Stories 1–10, 20–22; §Edge States "Menu",
"Changing character", "Restart hygiene".

## TDD Approach

- RED: with no dialogue, a JustDown on `dismissKey` makes the scene hold a menu container at
  depth 2000; with a dialogue open, the same press calls `dialogueChoices.dismiss()` and no menu
  exists; pressing the first choice calls `scene.start("MainMenuScene")`.
- GREEN: a `menu` field built on ESC from the scene's state, closed on ESC/*Back*, cleared in
  `release()`; `update` skips movement and interaction while `menu` is set.
