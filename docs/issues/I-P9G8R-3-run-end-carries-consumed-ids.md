---
id: I-P9G8R-3
status: done
implements: FS-P9G8R
blocked_by: [I-P9G8R-1, I-P9G8R-2]
labels: [ready-for-agent]
title: "FS-P9G8R slice 3: a run's end reports each delver's consumed items"
---
Implements FS-P9G8R §B (Requirements 14–16)

**Lane: agent** (game-service). Joins slice 1's consumed record to slice 2's proto field, closing
the duplication hole end to end.

## What to Build

- `types.RawPlayerState` and `types.RankedPlayerState` (`internal/types/game.go`) gain a
  consumed-ids field (`[]uuid.UUID` or `[]string`).
- `getRawMatchState` (`internal/game/session.go`) reads each player body's consumed record (the
  component slice 1 added) onto its `RawPlayerState`; every body is listed already, dead and
  escaped included (R15: the death path is not changed).
- `rankPlayers` (`internal/game/service.go`) copies it onto `RankedPlayerState` (it copies every
  settled field by hand: the classic way to lose the ids).
- `formatMatchData` writes it to `PlayerItems.ConsumedItemIds` as canonical UUID strings.
- `PublishFieldVisit` sends none (R16): leave its `RankedPlayerState` without consumed ids.

## Acceptance Criteria

- [ ] A run in which a delver drank two stored potions writes an `items.extracted` outbox row
      whose `PlayerItems` for that member lists both ids (round-trip through protobuf, as
      `service_test.go` already does for equipment).
- [ ] A delver who drank and then died has their ids listed as well.
- [ ] A delver who drank nothing, or drank only in-run looted potions, lists none.
- [ ] A field visit's `items.extracted` lists none.
- [ ] Existing match-end tests pass unchanged.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

- I-P9G8R-1 (the consumed record on the delver)
- I-P9G8R-2 (the `consumed_item_ids` proto field)

## Spec Reference

FS-P9G8R §B Requirements 14–16; §Acceptance Criteria "Consumed items leave the stash"
(game-service rows); §Edge States (death, floor change, body removed before the end: a
pre-existing gap, do not fix); User Stories 17–19.

## Files expected

- `game-server/game-service/internal/types/game.go`
- `game-server/game-service/internal/game/session.go` (`getRawMatchState`) **hotspot, after slice 1**
- `game-server/game-service/internal/game/service.go` (`rankPlayers`, `formatMatchData`)
- `game-server/game-service/internal/game/service_test.go`, a session-level test for the raw state

## TDD Approach

- RED: in `service_test.go`, a `RawMatchState` whose player carries two consumed ids, expecting
  them on the unmarshalled `ItemsExtractedEvent.PlayerItems[0].ConsumedItemIds`.
- GREEN: the field through `rankPlayers` and `formatMatchData`; then the `getRawMatchState` read
  from the component, tested by drinking in a session and ending it.
