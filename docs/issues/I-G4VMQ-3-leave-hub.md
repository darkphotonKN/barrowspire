---
id: I-G4VMQ-3
status: open
implements: FS-G4VMQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-G4VMQ slice 3: leave_hub, leaving for the roster leaves the hub"
---
Implements FS-G4VMQ §Requirements 23–24, 26–28 (Amendment 2026-10-29), §WebSocket message surface

**Author: human (hand-coded, human lane). Agent: tests only.**

## What to Build

A new inbound action `leave_hub` on the message hub's loop (`internal/gameserver/hub.go`),
beside `leave_run`.

- `ActionLeaveHub = "leave_hub"` and `ActionWorldLeft = "world_left"` in the constants.
- Routed on the sender's record (`GetPlayerFromConn`); payload ignored.
- **Refuse** with `h.refuse(conn, action, why)` and nothing changed:
  - queued (`IsQueued`; an unreadable queue counts as not queued, as `start_solo`) →
    "Leave the queue first.";
  - record names a run → "You are in a delve.";
  - record names no world → "You are not in the hub.".
- **Accept**: `hub.RemovePlayer(player.ID)` and `setCurrentWorld(player, uuid.Nil)` (the record,
  token and character stay); reply `{action: "world_left"}` to the sender. A `Server.LeaveHub(player)
  error` next to `LeaveRun` is the natural seam.
- A later `enter_hub` seats them again through `JoinHub`/`Admit` (cap applies); a reconnect of a
  member in no world is announced nothing (`announceCurrentWorld` already returns on
  `uuid.Nil`); grace-end cleanup of such a member removes nothing from any world.

## Acceptance Criteria

- [ ] `leave_hub` from a hub member not queued: reply `world_left`; the hub no longer has their
      body; their record names `uuid.Nil`; the record still exists with its character.
- [ ] After leaving, `enter_hub` with a character seats them in the hub again (`world_entered` hub).
- [ ] After leaving, a reconnect (`connectPlayer` + `announceCurrentWorld`) announces no world.
- [ ] `leave_hub` while queued: refused "Leave the queue first."; still in the hub, still queued.
- [ ] `leave_hub` from a member in a run: refused "You are in a delve."; nothing changes.
- [ ] `leave_hub` from a member in no world: refused "You are not in the hub.".
- [ ] A member who left and then drops past the grace is cleaned up without error.
- [ ] `go test -race ./internal/...` green; `golangci-lint run ./internal/... ./common/...` clean.

## Blocked By

None.

## Spec Reference

FS-G4VMQ §Requirements 23, 24, 26, 27, 28; §WebSocket message surface.

## TDD Approach (agent writes these, red first, then hands over)

- RED (`internal/gameserver/leave_hub_test.go`, in the `leaveRun*`/`startSolo*` harness style,
  helpers prefixed `leaveHub`, the strings `"leave_hub"` / `"world_left"` so it compiles today):
  `TestLeaveHub_FreesTheHubAndForgetsTheWorld`, `TestLeaveHub_ThenEnterHubSeatsAgain`,
  `TestLeaveHub_ThenReconnectAnnouncesNoWorld`, `TestLeaveHub_RefusedWhileQueued`,
  `TestLeaveHub_RefusedFromARun`, `TestLeaveHub_RefusedInNoWorld`,
  `TestLeaveHub_ThenGraceEndCleansUp`.
- GREEN: the constants, `Server.LeaveHub`, the hub case.
