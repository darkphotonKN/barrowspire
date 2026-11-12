---
id: I-JS7C8-10
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-11]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 10: game-service keeps and relays no facing: the face action and the state's facing removed (game-service)"
---
Implements FS-JS7C8 §E (R33, R47), §Wire, §Acceptance Criteria "Facing" (server boxes)

**Lane: agent, under the charter's bounds.** game-service is normally the human lane (root
`CLAUDE.md`); the charter "角色小跑步" authorises this slice, which undoes I-JS7C8-2 (superseded by
the owner's change of 2026-11-12). Removal only: game-service ends as main has it for facing, the
attack slow (I-JS7C8-1) untouched.

## What to Build

Remove everything I-JS7C8-2 added for facing, so no dead wire stays:

1. `constants.ActionFace` and `types.PlayerFacePayload` with its parse branch in
   `types.Message.ParsePayload`.
2. The hub's `face` entries: the allowlist entry in `gameActions`, the Debug-instead-of-Info log
   branch, and the "Face dropped: not in a world" branch. A `face` is then refused like any other
   unknown action.
3. The session's `face` case and `handleFace` (`internal/game/facing.go`), the
   `FacingComponent` (`internal/components/facing.go`) and `ComponentTypeFacing`.
4. `PublicPlayerState.Facing` and the serializer's `facingOf`.
5. The tests that exercised them (`internal/game/facing_test.go`, `internal/gameserver/facing_test.go`,
   the `face` cases in `internal/types/messages_test.go`), replaced by absence tests.

## Acceptance Criteria

- [ ] `{"action":"face","payload":{"player_id":…,"facing":"nw"}}` is refused by the hub as an
      unknown action, in the town, a field world and a run.
- [ ] No `current_player` or `other_players` entry in the state JSON carries `facing`.
- [ ] No facing constant, payload, component, component type, handler or serializer field
      remains (`git grep -n -i facing` in `game-server/game-service` shows only what main has).
- [ ] The attack slow (I-JS7C8-1) and its tests are unchanged and green.
- [ ] No change under `common/api/proto`, `api-gateway`, migrations or `game-client/src/api/generated`.
- [ ] `go test ./...` and `golangci-lint run` green in `game-server/game-service`.

## Blocked By

I-JS7C8-11: the client stops sending `face` first, so a client from the branch never meets a
server that refuses it (FS-JS7C8 Edge States).

## Spec Reference

FS-JS7C8 §E R33, R47; §Wire; Fact 5; Edge State "A client built from slices 3–4 against a server
without `face`"; user stories 22, 23, 25.

## Files it expects to touch

- `game-server/game-service/common/constants/game.go` (drop `ActionFace`)
- `game-server/game-service/internal/types/messages.go` (+ `messages_test.go`), `internal/types/game.go` (drop `Facing`)
- `game-server/game-service/internal/gameserver/hub.go`; delete `internal/gameserver/facing_test.go`
- `game-server/game-service/internal/game/session.go`; delete `internal/game/facing.go`, `internal/game/facing_test.go`
- delete `game-server/game-service/internal/components/facing.go`; `internal/ecs/entity.go` (drop `ComponentTypeFacing`)
- `game-server/game-service/internal/serializer/state_serializer.go`
- an absence test beside the hub's and the serializer's

## TDD Approach

- RED: the hub refuses `face` as an unknown action (today it routes it), and a state for a player
  who sent `face` carries no `facing` (today it does).
- GREEN: delete the route, the handler, the component and the field.
