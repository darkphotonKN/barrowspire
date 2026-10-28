---
id: I-9K8EZ-1
status: in-progress
implements: FS-9K8EZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-9K8EZ slice 1: forfeit_run, a chosen death is a death"
---
Implements FS-9K8EZ §Requirements 9–14, §WebSocket message surface

**Author: human (hand-coded, human lane). Agent: tests only.**

## What to Build

A new inbound action, `forfeit_run`, on the message hub's loop beside `leave_run`
(`internal/gameserver/hub.go`). It does one thing: a member in play in a run gets their
body's health set to 0. Everything after that is the existing death path.

- `ActionForfeitRun = "forfeit_run"` beside `ActionLeaveRun` in the constants.
- Routed on the sender's record (`GetPlayerFromConn`); payload ignored.
- **Refuse**, with `h.refuse(conn, action, why)` (top-level `Error` + `payload.message`), and
  nothing changed:
  - record names no run (hub, or no world) → "You are not in a delve.";
  - body already resolved (dead, escaped, left behind; `!systems.InPlay`) → "You are
    already out of the delve.";
  - body not found → as "not in a delve".
- **Accept**: set the body's `HealthComponent.CurrentHealth` to 0, under the session's lock,
  through a `Session` method (e.g. `Session.Fall(playerID) error` next to `Depart`, which
  already does the lookup and the in-play check). No message is sent on success; no removal,
  no settlement, nothing else: the next tick's `EliminationSystem` records the elimination,
  `RulesSystem` ends the run if nobody is in play, `end_game` says `eliminated`,
  `match.ended` carries the position, FS-QPDKN's `leave_run` is then accepted for them.
- Two `forfeit_run` on the same tick: the second finds health 0 → refused as resolved; one
  elimination record (the `EliminationSystem` already records a death once).

## Acceptance Criteria

- [ ] `forfeit_run` from a member in play: health 0 after the call; eliminated on the next
      tick with the next index; with a teammate still in play the run goes on and the fallen
      member's `leave_run` is accepted.
- [ ] `forfeit_run` in a run of one: the run ends once, `PublishMatchComplete` with one player
      whose elimination index is 0, the member is sent home with `end_game` `eliminated`.
- [ ] `forfeit_run` from a hub member: refused "You are not in a delve."; still in the hub.
- [ ] `forfeit_run` from a dead member: refused "You are already out of the delve."; from an
      escaped member: refused the same; nothing changes either time.
- [ ] `forfeit_run` twice before the tick: one elimination record.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Blocked By

None.

## Spec Reference

FS-9K8EZ §Requirements 9, 10, 11, 12, 13, 14; §WebSocket message surface; §User Stories 11,
12, 13, 14; §Edge States "Dying", "Refusals".

## TDD Approach (agent writes these, red first, then hands over)

- RED (`internal/gameserver/forfeit_run_test.go`, on the `leaveRun*` / `startSolo*` harness
  style: `enterHub`, `CreateGameSession`, the message hub via `GetServerChan()`, an inbox
  draining the writer channel, death/escape via `Entity.AddComponent`, an emitter spy; the
  string `"forfeit_run"` so the file compiles today):
  `TestForfeitRun_InPlayMemberFallsAndIsEliminated`, `TestForfeitRun_RunOfOneEndsAndSettles`,
  `TestForfeitRun_RefusedFromTheHub`, `TestForfeitRun_RefusedWhenResolved` (dead / escaped
  sub-cases), `TestForfeitRun_TwiceIsOneDeath`, `TestForfeitRun_ThenLeaveRunIsAccepted`.
- GREEN: the constant, `Session.Fall`, the hub case.
