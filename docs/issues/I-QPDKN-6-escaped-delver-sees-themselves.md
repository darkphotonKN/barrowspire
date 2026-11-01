---
id: I-QPDKN-6
status: done
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 6: an escaped delver keeps receiving their own state until the run ends (game-service)"
---
Implements FS-QPDKN §Requirements 24

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.
Bounds: the state serializer only. No new action, no change to when a run ends.

## What to Build

Today `SerializeBackendState` (`internal/serializer/state_serializer.go`, the Player branch)
skips an escaped player outright: `if player.Escape { backendState.EscapedCount++; continue }`.
They are in neither `Players` nor `LeftBehind`, so `FormatStateToClientState` finds no own state
for them and their frame carries `current_player: null`. The client cannot tell it resolved, so
FS-QPDKN R3's Watch button never appears. The dead are unaffected.

- **An escaped delver sees themselves.** Build the escaped player's `PlayerState` as for anyone
  (it already carries `Escape: true`) and keep it where only their own frame reads it, modelled
  on `LeftBehind` (FS-F6F88 §Requirements 15): `FormatStateToClientState` falls back to it when
  the recipient is not in `Players`. Whether that is a sibling map to `LeftBehind` or one
  "sees only themselves" map is develop's call; the reset in the pool return (next to the
  `LeftBehind` clear) covers it either way. Their resource and parry stance ride their own frame
  as they do today for anyone.
- **Nobody else sees them.** They stay out of `Players`, so they are absent from every other
  recipient's `other_players` and no body is drawn for them (charter default 2).
- **`escaped_count` is unchanged**: still incremented once per escaped player per tick.
- Lasts until the run ends; nothing in the session or the run-end path changes.

## Acceptance Criteria

- [ ] In a two-delver run where one escapes while the other plays on, each tick the escaped
      delver's frame carries their own `current_player` with `escape: true`.
- [ ] In the same run, the delver still in play does not find the escaped one in
      `other_players`, and `escaped_count` is 1.
- [ ] A left-behind dead delver still sees only themselves (FS-F6F88 tests stay green) and is
      not counted as escaped.
- [ ] `go test -race ./internal/...` and `make lint` pass.

## Blocked By

None. (The client slice I-QPDKN-7 is built against the wire shape `current_player.escape ===
true` and does not wait on this one.)

## Spec Reference

FS-QPDKN §Requirements 24 (added 2026-11-02, charter); §Acceptance Criteria "An escaped delver
still sees themselves"; §WebSocket message surface (state broadcast row, amended 2026-11-02);
§User Stories 5, 6.

## Files expected

- `game-server/game-service/internal/serializer/state_serializer.go`
- `game-server/game-service/internal/types/messages.go` (only if a new `BackendGameState` map is added)
- Test: `game-server/game-service/internal/serializer/` (a new `escaped_test.go`, or beside
  `floor_test.go`'s `DelverLeftBehindStillSeesThemselves`), two delvers, one escaped; or a
  session-level two-delver run test in `game-server/game-service/internal/game/` (beside
  `coop_test.go`) where one escapes while the other plays on. The charter asks for the two-player
  shape; develop picks the level.

## TDD Approach

- RED: two player entities, one with `Escape = true`; serialize, then format each recipient's
  frame. The escaped one's `CurrentPlayer` is nil today: assert it is present with `Escape`
  true, the other's `OtherPlayers` lacks them, `EscapedCount` is 1.
- GREEN: keep the escaped player's state in a self-only map and fall back to it in
  `FormatStateToClientState`.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge.
