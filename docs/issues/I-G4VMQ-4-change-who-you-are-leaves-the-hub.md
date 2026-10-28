---
id: I-G4VMQ-4
status: done
implements: FS-G4VMQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-G4VMQ slice 4: Change who you are leaves the hub before the roster"
---
Implements FS-G4VMQ §Requirements 25–26 (Amendment 2026-10-29)

**Author: agent**

## What to Build

`HubScene.changeCharacter()` currently starts `MainMenuScene` at once, leaving the body in the
hub. It now asks the server to leave first.

- *Change who you are* sends `leave_hub` (`ActionType.LeaveHub = "leave_hub"`,
  `ActionMap.leave_hub: Record<string, never>`) once; a `leavingHub` flag ignores further presses
  until a reply; the ESC menu row is disabled meanwhile (`retone`).
- On `world_left` (`socketManager.on("world_left", …)`): `this.scene.start("MainMenuScene")`.
- On an error reply (`socketManager.onError("leave_hub", …)`): clear the flag, re-enable the row,
  show the message as a passing notice (`notice()`), stay in the hub.
- `off("world_left")` / `offError("leave_hub")` and the flag reset in `release()`.
- Nothing else changes: the main menu's roster and DELVE re-enter the hub as before; a refresh
  while on the roster boots to the main menu because the server announces no world (server side,
  I-G4VMQ-3).

## Acceptance Criteria

- [ ] *Change who you are* sends exactly one `leave_hub`; a second press before the reply sends
      nothing; `MainMenuScene` is not started on the press.
- [ ] `world_left` starts `MainMenuScene`.
- [ ] An error reply keeps the scene, re-enables the row, shows the message as a passing notice.
- [ ] `release()` removes both listeners and resets the flag.
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint` pass; existing HubScene tests
      that expected `MainMenuScene` on the press are updated to expect it on `world_left`.

## Blocked By

None. End to end against a live server waits on I-G4VMQ-3 (human lane).

## Spec Reference

FS-G4VMQ §Requirements 25, 26; §Edge States "Menu" (queued case is refused server-side).

## TDD Approach

- RED: with the `queuedHubOnStage()` harness in `src/scenes/HubScene.test.ts` (it captures
  `on`/`onError` listeners and spies `sendMessage`): press `menu-change` → one `leave_hub`,
  no `scene.start`; `reply("world_left")` → `scene.start("MainMenuScene")`; `refuse("leave_hub",
  …)` → notice, row re-enabled; `release()` → `off`/`offError`.
- GREEN: the send, the flag, the two listeners, the teardown.
