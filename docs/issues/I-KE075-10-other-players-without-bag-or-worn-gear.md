---
id: I-KE075-10
status: done
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "FS-KE075 slice 10: other players' entries carry no bag or worn gear in any world; the client's type for them has none (game-service + game-client)"
---
Implements FS-KE075 §I (Requirements 51–56), ADR-0064

**Lane: agent (AFK), game-service (approved by Nick: "那就不用看到隊友的背包了") and game-client
types.**

## What to Build

Server: every `other_players` entry, in the run (every floor), the field and the hub, drops its
`inventory` and `equipment` keys and keeps every other key, party resource and parry fields
included. The recipient's own `current_player` is unchanged. The trimmed entry is built without
writing the shared per-tick player state and without sharing any list with the pooled backend
state (race B stays closed).

Client: the type of an `other_players` entry has no `inventory` or `equipment`, so a read of either
fails `tsc`.

Bench: `BenchmarkFormatStateToClientState_BytesPerRecipient` gains a hub case at
`HubOccupancyCap` and an other-players metric; record before and after here.

## Files (expected)

- `game-server/game-service/internal/types/game.go`, `messages.go` (the other player's shape)
- `game-server/game-service/internal/serializer/state_serializer.go` (`FormatStateToClientState`)
- `game-server/game-service/internal/serializer/*_test.go`, `state_serializer_bench_test.go`
- `game-client/src/types/gameState.ts` (+ a type test)
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts` (`placePlayer` takes the shown part only, so a kit read there fails `tsc` too)

## Acceptance Criteria

- [x] Run (floor 1 cut, floor 2), field and hub: no `other_players` entry has `inventory` or `equipment`; every other key stays
- [x] `current_player` keeps its own `inventory` and `equipment` in every world, and when left behind or escaped
- [x] The shared player states are unwritten; a `-race` test shows a sent frame untouched by the next tick's pool reset
- [x] The client's `other_players` entry type has no `inventory`/`equipment`; a type test proves a read fails `tsc`
- [x] Bench before/after recorded below for floor 1 cut, floor 2, hub
- [x] game-service `go test ./...`, `go vet ./...`, `-race` on serializer and game; game-client vitest and `tsc` pass

## Measured (2026-11-06, Apple M5 Pro, `-benchtime 20x`)

`BenchmarkFormatStateToClientState_BytesPerRecipient`, JSON bytes per recipient per tick. Fixtures:
a party of four, each with a bag of eight and five worn; the hub case is 40 players
(`HubOccupancyCap`), each kitted the same.

| Case | Before | After | Other players before → after |
|---|---|---|---|
| floor 1, cut, party mid | 29,015 | 18,017 | 11,950 → 952 |
| floor 1, cut, party corner | 19,474 | 8,476 | 11,944 → 946 |
| floor 1, uncut, party mid | 48,922 | 37,924 | 11,950 → 952 |
| floor 2 | 25,333 | 14,335 | 11,944 → 946 |
| hub at cap (40) | 160,660 | 17,686 | 156,397 → 13,423 |

Floor 1 cut with the party mid-floor is still over the 16 KB target by about 1.6 KB: of the
18,017 B, 12,353 B are the monsters and containers inside the interest radius and most of the rest
is the recipient's own bag and worn gear, which R52 keeps.

## Blocked By

None.

## Spec Reference

FS-KE075 §I.51–56. ADR-0064 Decisions 1–5. FS-CH21F R1–R4 (party resource, shared state never
written). FS-KE075 §G R38, FS-QG1HR D2 race B.

## TDD Approach

- RED: a serializer test that marshals each world's frame and finds `inventory`/`equipment` on an
  `other_players` entry; a client type test with `@ts-expect-error` on `other.inventory`
- GREEN: split the shown part of a player from their bag and worn gear; `other_players` embeds only
  the shown part
