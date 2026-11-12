---
id: I-JS7C8-2
status: done
implements: FS-JS7C8
blocked_by: []
superseded_by: [I-JS7C8-10]
labels: [ready-for-agent]
title: "SUPERSEDED (2026-11-12, by I-JS7C8-10) FS-JS7C8 slice 2: a player's facing is taken by a face action and relayed in the state (game-service)"
---
Implements FS-JS7C8 §E (R27, R30–R33, R35), §Wire, §Acceptance Criteria "Facing" (server boxes)

> **Superseded 2026-11-12.** The owner's change to FS-JS7C8 (a character faces where it runs,
> never the pointer) leaves this slice's `face` action and `facing` relay with no reader, and
> FS-JS7C8 R47 removes them. The code below is on `feat/run-class-run-face` and must not reach
> main: **I-JS7C8-10** removes it. Kept `done` as the record of what was built.

**Lane: agent, under the charter's bounds.** game-service is normally the human lane (root
`CLAUDE.md`); the charter "角色小跑步" authorises this slice. JSON over the game WebSocket only.

## What to Build

1. A new in-game action `face` (`constants.ActionFace = "face"`), payload
   `{"player_id", "facing"}`, `facing` one of `n ne e se s sw w nw`. Parsed in
   `types.Message.ParsePayload` like `move` (requires `player_id`).
2. The hub routes it to the player's world with the other in-game actions (`gameActions`) and logs
   it at Debug, not at Info (it may arrive up to 10 times a second).
3. The session stores the facing on the player's body (a pure-data component or a field on an
   existing player component). A value outside the 8 names, or a player with no body, is ignored
   with a Debug log; nothing is sent back. Same handling in the town, a field and a run.
4. `PublicPlayerState` gains `Facing string \`json:"facing,omitempty"\``, filled by the serializer
   from the body, so `current_player` and `other_players` carry it.
5. Nothing reads facing except the serializer. `move` and every other message are unchanged.

## Acceptance Criteria

- [x] `{"action":"face","payload":{"player_id":…,"facing":"nw"}}` sets that player's facing; the
      next state shows `"facing":"nw"` on their `current_player` and on their entry in every other
      recipient's `other_players`.
- [x] Works in the town, a field world and a run.
- [x] An unknown facing (`"up"`, `""`, a number) is ignored and logged at Debug; the stored facing is unchanged.
- [x] Before any `face`, `facing` is absent from the JSON.
- [x] `face` is not logged at Info by the hub.
- [x] No reader of facing outside the serializer (review grep).
- [x] No change under `common/api/proto`, `api-gateway`, migrations or `game-client/src/api/generated`.
- [x] `go test ./...` and `golangci-lint run` green in `game-server/game-service`. (`golangci-lint`
      clean on this diff, `--new-from-rev`; its older findings in `cmd/server/main.go` and
      `hub_town_golden_test.go` are not this slice's.)

## Blocked By

None

## Spec Reference

FS-JS7C8 §E R27, R30–R33, R35; Facts 4–5; Edge States "Dead", "World switch, reconnect, handoff",
"A modified client"; user stories 13, 15, 22, 23.

## Files it expects to touch

- `game-server/game-service/common/constants/game.go` (`ActionFace`)
- `game-server/game-service/internal/types/messages.go` (parse `face`), `internal/types/game.go` (`Facing`)
- `game-server/game-service/internal/gameserver/hub.go` (route, Debug log)
- `game-server/game-service/internal/game/session.go` (handle `face`)
- `game-server/game-service/internal/components/` (where the facing is held)
- `game-server/game-service/internal/serializer/state_serializer.go`
- tests beside each

## TDD Approach

- RED: a session that receives `face nw` from a player broadcasts a state whose entry for them
  carries `facing: "nw"`.
- GREEN: parse, route, store, serialize.

## Done

`constants.ActionFace`; `types.PlayerFacePayload` (`player_id` and `facing` both required strings, so a
number or a missing facing fails the parse); the message hub routes `face` with the other in-game
actions, logs it at Debug, and drops one from a player in no world with a Debug line and no refusal.
The session ignores every refusal at Debug and sends nothing back; `handleFace`
(`internal/game/facing.go`) takes only the 8 names (`components.Facing`), only from a delver in play
with a body here, and keeps it in a `FacingComponent` added on the first face, so a new body (world
switch, reconnect, handoff) starts without one. The serializer's `facingOf` fills
`PublicPlayerState.Facing` (`facing,omitempty`). Review grep: `ComponentTypeFacing` is written only by
`handleFace` and read only by the serializer. No proto, gateway, OpenAPI, generated client or
migration change.

Wire for the client: send `{"action":"face","payload":{"player_id":"<member id>","facing":"nw"}}`;
read `current_player.facing` and `other_players[].facing` (string, absent until sent).
