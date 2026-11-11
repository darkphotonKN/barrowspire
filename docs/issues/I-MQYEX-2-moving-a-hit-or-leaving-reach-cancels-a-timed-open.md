---
id: I-MQYEX-2
status: done
implements: FS-MQYEX
blocked_by: [I-MQYEX-1]
labels: [ready-for-agent, blocked]
title: "FS-MQYEX slice 2: moving, a hit, or leaving reach cancels a timed open (server)"
---
Implements FS-MQYEX §Requirements 6–13

**Lane: game-server (game-service), asked for by the charter.** A timed open is cancelled when
its player's body moves, when a hit costs them health, or when they are out of reach of the
container; it ends when they are out of play and on a floor change. A cancel is silent, opens
nothing, and is judged before the timer's end on the same tick. A player has one timed open:
another container replaces it, the same container changes nothing.

## Files owned

- `game-server/game-service/internal/systems/` (the timed-open system from slice 1: the cancel rules) and its test
- `game-server/game-service/internal/components/` (the timed open's data, if a cancel rule needs more of it, such as the health it last saw)
- `game-server/game-service/internal/game/session.go`: `handleInteract`'s container branch (replace, re-press), `step` (order), `applyRequestedFloorChange` only if the floor change does not already drop the container. **Hotspot: touch only these.**
- `game-server/game-service/internal/systems/combat.go` only if "a hit cost health" cannot be read from the health the timed open last saw
- the tests beside each

## What to Build

1. Moved: after the tick's movement, the body is not where it stood at the start (R6, D3). Walking and the warrior's dash both cancel; a `move` that moves nothing does not.
2. Hit: a hit cost the player health this tick (R7, D4). A parried strike and a heal do not cancel.
3. Reach: farther than `DefaultInteractableRange` from the container, or the container is gone (R8, D5).
4. Out of play and floor change end it (R9, D7).
5. Order on one tick: the cancels after movement and combat, before completion (R10).
6. Silent and private; the next reach starts from zero (R11).
7. One per player: replace on another shut container; no change on the same one (R12). Nothing else cancels (R13, D9).

## Acceptance Criteria

- [ ] A player whose position changes during a timed open (walking, and a dash) has none afterwards; the container is shut and unrolled.
- [ ] A `move` that does not change the player's position (zero velocity; a wall in the way) does not cancel.
- [ ] A hit that costs the player health cancels; a parried strike does not; a heal does not.
- [ ] A hit on the tick the timed open would complete cancels it: the container stays shut.
- [ ] A player who dies, escapes or leaves the run has no timed open; a floor change leaves none.
- [ ] After a cancel the same player's next reach starts from zero and completes after the full 1.5 s. No reply is sent for a cancel.
- [ ] A second reach for the same container neither restarts nor shortens the timed open. A reach for another shut container replaces it from zero.
- [ ] Attacking, drinking and equipping during a timed open do not cancel it.
- [ ] `go test -race ./internal/game/... ./internal/systems/...` passes.

## Blocked By

I-MQYEX-1 (the timed open and its system).

## Spec Reference

FS-MQYEX §Requirements 6–13 (§A); Decisions L3, D3–D9; User Stories 3–6, 18, 19; Acceptance Criteria (Server) lines 6–13; Edge States (the reach is made while walking, a hit and the last tick coincide, the player dies mid-open, the floor changes mid-open, the player disconnects mid-open).

## TDD Approach

- RED: start a timed open, set a velocity, step once, assert no timed open and a shut container.
- GREEN: the moved rule. Then one RED/GREEN pair per cause, then the last-tick order, then replace and re-press.
