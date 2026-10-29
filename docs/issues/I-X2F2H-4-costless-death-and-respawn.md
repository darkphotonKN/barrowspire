---
id: I-X2F2H-4
status: open
implements: FS-X2F2H
blocked_by: [I-X2F2H-3]
labels: [blocked]
title: "FS-X2F2H slice 4: dying in a field costs nothing; back at the entrance in 3 s (game-service + game-client)"
---
Implements FS-X2F2H §C (Requirements 22–25), §H (Requirement 58)

**Author: agent.**

## What to Build

**game-service**

1. **Fallen** (FS §C R22): a field player at 0 HP is fallen; moves, attacks, interactions and
   `leave_field` (`fallen`, from slice 1) are refused as for a dead delver in a run. Nothing worn
   or carried is dropped or removed. The death counts in the visit's deaths (kept where slice 6
   reads it).
2. **Respawn** (FS §C R23): 3 s after falling (constant beside the field tuning), the body stands
   at the place's arrival point with full health and full mana and is in play again; nothing else
   on the body changes. Driven by the field's tick with an injectable clock.
3. **No run machinery** (FS §C R24–R25): a field records no eliminations and sends no `end_game`;
   monsters ignore the fallen.

**game-client**

4. `FieldScene` shows a short fallen state with a 3-2-1 countdown and then the player at the
   entrance (FS §H R58). No result card, no loss copy.

## Acceptance Criteria

- [ ] A field player killed by a boar keeps every item worn and carried.
- [ ] Their actions are refused while fallen; 3 s later they are in play at the arrival point at full HP and MP.
- [ ] No `end_game` is sent and nothing is written to the session's eliminations in a field; runs unchanged.
- [ ] Monsters drop a fallen player as a target.
- [ ] The visit's death count rises by one per death.
- [ ] Client: fallen state with countdown, then back on the entrance; no result card in a field.
- [ ] `go test ./...`, `golangci-lint run`, `npm test`, lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/systems/field_respawn.go` (new: pure system, timer data on a component) and test, or the field branch of `internal/systems/elimination.go`
- `game-server/game-service/internal/components/` (a respawn-timer component, pure data)
- `game-server/game-service/internal/game/session.go` (field skips `recordEliminations`, runs the respawn system)
- `game-client/src/scenes/FieldScene.ts`, `FieldScene.test.ts`

## Blocked By

- I-X2F2H-3: monsters that can kill a player in a field.

## Spec Reference

FS-X2F2H §C R22–R25; §H R58; User Stories 8, 9; Acceptance Criteria 20, 23 (fallen countdown);
Edge States "Disconnect while fallen"; Decision log D10, D11.

## TDD Approach

- RED: set a field body's HP to 0, step 3 s with an injected clock → in play at the arrival point, full HP/MP, satchel unchanged.
- RED: no `end_game` sent from a field death.
- GREEN: the respawn system and the field branch.
