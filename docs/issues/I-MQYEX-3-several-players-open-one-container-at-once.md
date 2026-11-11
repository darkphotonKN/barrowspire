---
id: I-MQYEX-3
status: done
implements: FS-MQYEX
blocked_by: [I-MQYEX-2]
labels: [ready-for-agent, blocked]
title: "FS-MQYEX slice 3: several players open one container at once, and the first to finish opens it for all (server)"
---
Implements FS-MQYEX §Requirements 14–17

**Lane: game-server (game-service), asked for by the charter.** Any number of players may have a
timed open on one container, each on their own timer. A reach for a shut chest or sack in a run
no longer checks or takes the per-container interact throttle, so a second player's reach is
never dropped. The first timed open to complete opens the container with one roll and ends every
other timed open on it that tick.

## Files owned

- `game-server/game-service/internal/game/session.go`: `handleInteract` (where the per-container throttle is checked, before the target's kind is known) and the completion path from slice 1. **Hotspot: touch only these.**
- `game-server/game-service/internal/systems/` (the timed-open system: ending the others on a completion) and its test
- `game-server/game-service/internal/game/interact_cache_test.go` and a new test beside the timed-open tests

## What to Build

1. The throttle exemption (R15, L8): a reach for a shut chest or sack in a run neither reads nor sets `containerInteractedCache`. Every other interact keeps it: a door, a switch, an item, the stairs, an escape door, an open container, any container in a hub or field world.
2. Independent timers (R14): a cancel of one player's leaves the others' untouched.
3. First to finish (R16): one roll; every other timed open on that container ends on that tick; two completing on the same tick open it once.
4. Everyone sees the contents through the state as today (R17). Nothing new is sent.

## Acceptance Criteria

- [ ] Two players reaching for one shut container on the same tick both have a timed open; so do two reaching 50 ms apart.
- [ ] With two players at one container, cancelling one leaves the other's running to completion.
- [ ] When the first of two completes, the container is rolled exactly once, both players' timed opens are gone on that tick, and the container's items are in both players' states.
- [ ] Two timed opens that complete on the same tick roll the container once.
- [ ] `TestHandleInteract_Success_HoldsTheTargetBriefly` (a door) still passes; an open container in a run still takes the per-container throttle.
- [ ] `go test -race ./internal/game/... ./internal/systems/...` passes.

## Blocked By

I-MQYEX-2 (the same files, and the cancel that criterion 2 needs).

## Spec Reference

FS-MQYEX §Requirements 14–17 (§B); Decisions L7, L8, D12; User Stories 14–17; Acceptance Criteria (Server) lines 14–17; Edge States (two players finish on the same tick, a teammate finishes while the player is mid-open).

## TDD Approach

- RED: two players with a timed open on one chest; step until the first completes; assert the other's timed open is gone on that tick and the roll ran once.
- GREEN: ending the others on a completion.
- The exemption test (two reaches on one tick, and 50 ms apart, both start) may already pass after slice 1, since a start hands off no hold. Write it anyway and make the exemption explicit in `handleInteract`: it is the guard against a later change putting the hold back.
