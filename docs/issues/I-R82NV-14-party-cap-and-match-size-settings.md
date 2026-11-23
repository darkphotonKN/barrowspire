---
id: I-R82NV-14
status: done
implements: FS-R82NV
blocked_by: []
labels: []
title: "FS-R82NV change slice: PARTY_SIZE is the party cap (default 3) and MATCH_SIZE the random match size (default 2) (game-service)"
---
Implements FS-R82NV §Change: Party cap 3, match size its own setting

**Human lane, agent authorised for this run** (charter "Party of three", Kranti 2026-11-24).

## What to Build

`PARTY_SIZE` stops feeding the matchmaker and becomes the party cap only, default 3. A new
`MATCH_SIZE` env, default 2, loaded the same way (whole number 2 to 4, anything else fails startup
with an error naming the setting), is passed to `NewMatchmaker` instead. Both are logged at startup.
Random matches stay at 2 players; parties now take three. ADR-0091.

## Files it expects to touch

- `game-server/game-service/config/party.go` (default 3, a `LoadMatchSize` beside `LoadPartySize`, comments)
- `game-server/game-service/config/party_test.go` (default 3, `MATCH_SIZE` table)
- `game-server/game-service/config/routes.go` (a `matchSize` parameter; the `NewMatchmaker` call site only)
- `game-server/game-service/cmd/server/main.go` (load and log `MATCH_SIZE`, pass it to `SetupRouter`)
- `game-server/game-service/internal/gameserver/fields.go` (the `partySize` comment, if it names the match size)

Not touched: anything under `internal/matchmaker/` or `internal/match_queue/` (user-owned);
`internal/gameserver/party.go`'s `defaultPartySize` stays 2 (S4); no wire, proto or contract file.

## Acceptance Criteria

- [x] `PARTY_SIZE` unset gives 3; `2`, `3`, `4`, `" 3 "` are taken; `1`, `5`, `0`, `-2`, `two` fail with an error naming `PARTY_SIZE`. (S1)
- [x] `MATCH_SIZE` unset gives 2; `2`, `3`, `4`, `" 3 "` are taken; `1`, `5`, `0`, `-2`, `two` fail with an error naming `MATCH_SIZE`. (S2)
- [x] `SetupRouter` passes the party size to `gameserver.WithPartySize` and the match size to `NewMatchmaker`; nothing derives one from the other. (S1–S3)
- [x] A hub party test at cap 3 (the existing `WithPartySize(3)` rigs) shows two accepts then `party_full` on a fourth invite, `party_update` `size` 3. Add one if none covers it. (S1)
- [x] `git diff` shows no file under `internal/matchmaker/` or `internal/match_queue/`. (S2)
- [x] `make test` (and `make lint check`) in `game-server/game-service` pass. *(`make test` passes; `make lint check` stays red on older golangci-lint errors in main.go, handler.go, hub.go, server.go, none on this diff's lines.)*

## Blocked By

None

## Spec Reference

FS-R82NV §Change: Party cap 3, match size its own setting: S1–S4, S6, S-US1–S-US4, acceptance rows 1–5 and 7.

## TDD Approach

- RED: `TestLoadPartySize` "unset defaults to three" and a new `TestLoadMatchSize` table.
- GREEN: default 3 in `party.go`, `LoadMatchSize` beside it; then thread `matchSize` through `main.go` and `SetupRouter` to `NewMatchmaker`.
