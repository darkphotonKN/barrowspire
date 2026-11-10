---
id: I-50MTX-5
status: done
implements: FS-50MTX
blocked_by: [I-50MTX-1]
labels: [ready-for-agent]
title: "FS-50MTX slice 5: game-service reads, checks out and settles as the character in play"
---
Implements FS-50MTX §game-service, §Settlement

**Hotspot:** one writer at a time on `game-service/internal/game/session.go`.

**Bounds:** no edits to `game-service/internal/matchmaker` or `internal/match_queue`. None are needed
(see R29 below).

## Files owned

- `game-server/game-service/internal/game/session.go`: `seatGearLocked` and its two callers, a read of the pending entry's character near `HandoffSeatOf`, the `RawPlayerState` build (`:3166`)
- `game-server/game-service/internal/game/service.go`: `PublishSettlement`, `PublishFieldVisit`, `rankPlayers`, `formatMatchData`
- `game-server/game-service/internal/types/game.go`: `RawPlayerState`, `RankedPlayerState`
- `game-server/game-service/internal/gameserver/handler.go`: the `HandoffSeatExpected` arm, `setupHandoffConnectingPlayer`, `readLoadout`
- `game-server/game-service/internal/gameserver/server.go`: `CheckLoadout`
- `game-server/game-service/internal/gameserver/fields.go`: the field entry's checkout call
- Tests that assert the requests or settlement above. In `internal/game`: `seating_checkout_test.go`, `publish_settlement_test.go`, `publish_field_visit_test.go`, `service_test.go`, `extraction_test.go`, `settle_on_resolve_test.go`. In `internal/gameserver`: `seating_checkout_test.go`, `handoff_connect_test.go`, `player_token_test.go`, `field_settlement_test.go`, `party_ready_test.go`. Others only if a whole-request or whole-event comparison fails

## What to Build

**Every gear read and checkout passes the character in play (R28).**

- Hub seating and run seating: `seatGearLocked` takes the character its callers already hold, and sets it on `GetLoadoutWithItems` and `CheckOutRunGear`.
- Loadout pre-check: `CheckLoadout` passes `s.characterOf(player)` through `readLoadout`.
- Field entry: `setupHandoffConnectingPlayer` takes the character; `fields.go` passes the `character` it already resolved. The dev test room still calls nothing.

**Handoff (R29).** A handoff checks out before `SeatArrival`, so the connecting player's record cannot
supply the character. The run already has it: `Session.playersPendingConnection[memberID].Character`,
seeded by `AddPlayersToPendingConnection` from `HandoffPlayers`, which `hub.go` fills from the match's
`matchedPlayer.Character`. `seatPlayerLocked` already seats from that entry. So this needs one small
read on `Session` (beside `HandoffSeatOf`, or by having it return the character as well) and no
matchmaker change. Check out as that character. A missing entry is refused the way a member with no
seat is.

**Settlement (R30, the producer side).** `PlayerItems.character_id` is set on run settlement, partial
settlement and field visits. The source is the body: `RawPlayerState` gains `CharacterID` from the
`PlayerComponent` where it is built (`session.go:3166`), and `RankedPlayerState` carries it through
`PublishSettlement` and `rankPlayers`. Field visits use `visit.CharacterID`. A zero id is sent as empty,
never as the zero UUID, so items-service reads it as R32. The whole-run sweep event carries no players
and does not change.

## gRPC compile

**No caller breaks; this slice is the update.** The fields exist from I-50MTX-1, so game-service
compiles with or without this slice. Here game-service starts sending `character_id` on
`GetLoadoutWithItems` and `CheckOutRunGear`, and tests that compare whole requests move with it.
`ItemsClient` keeps its shape. Runs and fields work end to end only once I-50MTX-3 is also on the
branch; game-service's own tests stub the client and stay green regardless.

## Acceptance Criteria

- [ ] Hub seating, the loadout pre-check, field entry, run seating and handoff each read or check out the character in play.
- [ ] A handoff arrival checks out as the character on the run's pending entry, not one on the connecting player's record.
- [ ] A stale or expired handoff still checks nothing out.
- [ ] Run settlement, partial settlement and field-visit events each carry the character on `PlayerItems`.
- [ ] A zero character id is sent as empty.
- [ ] No file under `game-service/internal/matchmaker` or `internal/match_queue` changes.
- [ ] `go test ./...` in `game-service` passes.

## Blocked By

I-50MTX-1. Nothing waits on it. It may run beside I-50MTX-2, -3, -4 and -6.

## Spec Reference

FS-50MTX R28-R30; user stories 9, 10, 18.

## TDD Approach

- RED: the fake items client records requests; a handoff arrival for a member whose pending entry names character C records `CheckOutRunGear` with `character_id = C`.
- GREEN: the session read and the handler arm. Then the same shape for the other four paths and the settlement event.
