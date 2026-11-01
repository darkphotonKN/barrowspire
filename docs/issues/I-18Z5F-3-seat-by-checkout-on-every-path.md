---
id: I-18Z5F-3
status: done
implements: FS-18Z5F
blocked_by: [I-18Z5F-1, I-18Z5F-2]
labels: []
title: "FS-18Z5F slice 3: runs, handoffs and field entries seat worn and bag gear by checkout (game-service)"
---
Implements FS-18Z5F §C (Requirements 13–18)

**Author: agent** (the user asked for the full chain; no human-lane split). Must not ship to an
environment before I-18Z5F-2's settlement is deployed: without it every checked-out item stays
IN_RUN until the member's next checkout.

## What to Build

1. **Items client**: add `CheckOutRunGear` to `game-service/grpc/items` (client + the narrow
   interface the session consumes).
2. **Run seat** (R13): `fetchLoadoutLocked` (or a checkout sibling it delegates to) calls
   `CheckOutRunGear(member, s.ID)` as the member when the session's world type is run; a hub
   session keeps `GetLoadoutWithItems`. Timeout or error: seated bare with `LoadoutUnknown`, as
   today (R15).
3. **Handoff seat** (R13, R15, R16): `setupHandoffConnectingPlayer` takes the run's session id
   and checks out; `SeatArrival` seats from the result. Error: refused "loadout unavailable", as
   today. The checkout stays after `handoffRun`'s checks. No matchmaker or `match_queue` change.
4. **Field entry** (R13, R14, R15): `EnterField` mints the visit id, checks out under it after
   its existing pre-checks, and passes the id and the result to `SeatVisitor`, which opens the
   visit under that id. Error: refused `errNoLoadout`, as today. `CheckLoadout` keeps the plain
   read.
5. **Body** (R17): `buildBodyLocked` takes the worn loadout plus the bag; worn items as today
   (over-level carried first), then bag items appended to the body's bag in returned order,
   uncapped. Seated item entities are the safe ones; slice 4 adds the flag.
6. **Reconnect** (R18): assert no checkout on a run or field reconnect.

**Hard bounds:** no proto change beyond slice 1, no items-service change, no client change. Do
not touch the K2HKP matchmaker or `match_queue`.

## Acceptance Criteria

- [ ] A local run seat calls `CheckOutRunGear` with the run's session id and no longer calls `GetLoadoutWithItems`; the hub seat still reads.
- [ ] A handoff arrival checks out under the handoff run's session id and is seated from it; a checkout error refuses it "loadout unavailable".
- [ ] A field entry checks out under the visit id it then opens the visit with; a checkout error refuses the entry; no body or visit is created.
- [ ] A seated body wears its worn items, carries over-level items, then its bag items, uncapped (a 31-item bag is seated in full).
- [ ] A run seat whose checkout times out is seated bare with `LoadoutUnknown`.
- [ ] Reconnect into a run or field makes no checkout call.
- [ ] `go test -race ./...`, `golangci-lint run` in game-service: no new failures.

## Files expected to touch

- `game-server/game-service/grpc/items/client.go`, `model.go`
- `game-server/game-service/internal/game/session.go` (`fetchLoadoutLocked`, `buildBodyLocked`, `SeatArrival`, `seatPlayerLocked`)
- `game-server/game-service/internal/game/field_visit.go` (`SeatVisitor` takes the visit id and the checkout)
- `game-server/game-service/internal/gameserver/handler.go` (`setupHandoffConnectingPlayer`), `fields.go` (`EnterField`), `server.go` (`CheckLoadout` stays a read)
- Fake items clients in `internal/game/*_test.go` and `internal/gameserver/*_test.go`
- Tests: `session_test.go` / a new `seating_checkout_test.go`, `field_visit_test.go`, handoff tests

## Blocked By

- I-18Z5F-1: the RPC.
- I-18Z5F-2: settlement must release what this slice checks out (deploy order).

## Spec Reference

FS-18Z5F §C R13–R18; User Stories 1, 2, 15, 16, 17; Edge States "Checkout commits, reply lost", "Seat refused after a committed checkout", "Reconnect", "Bag over 30 at seating".

## TDD Approach

- RED: run session with a fake items client → AddPlayer calls CheckOutRunGear with the session id; the body's bag holds the returned bag items after a carried over-level helmet.
- RED: field EnterField → the visit's id equals the run id the fake saw.
- GREEN: the seating changes.
