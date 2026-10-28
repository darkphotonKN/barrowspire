---
id: I-G4VMQ-2
status: open
implements: FS-G4VMQ
blocked_by: [I-G4VMQ-1]
labels: [ready-for-agent]
title: "FS-G4VMQ slice 2: leave the queue from the ESC menu and the queue panel"
---
Implements FS-G4VMQ §Requirements 3, 11–19, §WebSocket message surface

**Author: agent**

## What to Build

A queued hub delver cannot cancel (I-29KSH-6 recorded the gap; the server side has since been
fixed by FS-K2HKP R7, which removes the entry and replies only after removal). Give the hub two
entry points for one `leave_queue` action.

- **`queued` flag on `HubScene`**: true on `find_game`'s success reply (the `joinQueue` path) or
  on any `queue_status`; false on a `leave_queue` success reply, on `world_handoff_failed`
  ("The delve could not be joined.": the seat is released), and on shutdown. No new message.
  R11.
- **One path, `leaveQueue()`**: sends `leave_queue` (no payload, `ActionType.LeaveQueue`) and
  sets one pending flag. While pending, both entry points are disabled and a second press sends
  nothing. R12.
- **Reply handling** via `socketManager.on("leave_queue", …)` and
  `socketManager.onError("leave_queue", …)` (`SocketManager.dispatch` routes a message with a
  top-level `error` to the per-action listener if registered). Registered on create, removed
  with `off` / `offError` in `release()`. R17.
  - Success: panel and button come down, `queued` and pending clear, the menu's *Leave the
    queue* choice disappears, the menu closes if open. R13.
  - Error: the server's message ("Could not leave the queue, please try again.") shows as a
    passing hub notice in the neutral HUD register (vellum); the panel, button, `queued` and the
    choice stay; pending clears so the delver can try again. R14.
- **ESC menu, third choice**: while `queued`, the menu from I-G4VMQ-1 shows *Leave the queue*
  (amber) between *Change who you are* and *Back*; it calls `leaveQueue()`. R3.
- **Panel button**: while queued, a small amber *Leave* button immediately to the right of the
  queue progress panel (`showQueueProgressText`: x 24, y height-44), the same height as the
  panel, depth 1000, camera-fixed. It appears with the panel (first `queue_status` or
  `find_game` success) and goes down with it (`leave_queue` success, `world_handoff_failed`,
  shutdown). It calls `leaveQueue()`. While the panel shows "Joining the delve…"
  (`world_handoff`) it is hidden or disabled. Same lifecycle rule as the panel (commit 0a35e36:
  forgotten in `release()`, reused only while `.active`). R15, R16, R19.
- **Types**: add `LeaveQueue: "leave_queue"` to `ActionType` and
  `leave_queue: Record<string, never>` to `ActionMap` in `src/assets/types/client.ts`;
  `MainMenuScene.ts`'s `sendMessage("leave_queue" as any, {})` switches to the constant, no
  behaviour change. R18.

No server change; no new or changed WebSocket message. Copy and chrome per
`game-client/CONTEXT.md` and `game-client/docs/design-guideline.md` Part I.

## Acceptance Criteria

- [ ] `queued` is true after a `find_game` success reply and after any `queue_status`; false
      after a `leave_queue` success, after `world_handoff_failed`, and at scene start.
- [ ] With `queued` true, the ESC menu shows *Leave the queue*; with it false, it does not.
- [ ] *Leave the queue* (menu) and *Leave* (panel) each send exactly one `leave_queue` with no
      payload; a second press on either before the reply sends nothing.
- [ ] On a `leave_queue` success reply: panel and button gone, `queued` false, the menu closed
      if it was open.
- [ ] On a `leave_queue` error reply: the server's message is shown as a passing hub notice;
      panel and button stay; a further press sends again.
- [ ] The *Leave* button is at the panel's right, same height, amber, depth 1000; it appears with
      the panel and is absent when not queued; it is not pressable while "Joining the delve…" is
      shown; it is gone after "The delve could not be joined.".
- [ ] `ActionType.LeaveQueue` and `ActionMap.leave_queue` exist; `MainMenuScene` compiles without
      `as any`.
- [ ] After a `HubScene` shutdown and restart: no `leave_queue` listener from the earlier visit
      is registered (`off` / `offError` ran), no button is referenced, `queued` and pending are
      false.
- [ ] Unit tests in `HubScene.test.ts` cover: flag transitions, one send under double press,
      success and error reply handling, menu choice visibility, button lifecycle with the panel
      and with the handoff texts, teardown removes listeners.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-G4VMQ-1 (the ESC menu that carries the third choice)

## Spec Reference

FS-G4VMQ §Requirements 3, 11–19; §User Stories 11–19, 23–24; §Edge States "Leaving the queue",
"Restart hygiene"; §WebSocket message surface (type entries only).

## TDD Approach

- RED: after a fake `queue_status`, `queued` is true and a *Leave* button sits right of the
  panel; two presses send one `leave_queue`; a fake success reply destroys the panel and button;
  a fake error reply leaves them and shows the message.
- GREEN: `queued` + `leavePending` fields, one `leaveQueue()`, `on`/`onError("leave_queue")`
  wired beside the existing `queue_status` subscription and released with it.
