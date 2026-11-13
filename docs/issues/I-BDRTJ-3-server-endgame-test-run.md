---
id: I-BDRTJ-3
status: done
implements: FS-BDRTJ
blocked_by: [I-C8VM7-1, I-C8VM7-4]
labels: []
title: "FS-BDRTJ slice 3: server endgame test run (dev gate, start action, fixed height-10 run from floor 6, fixed pools and levels)"
---
Implements FS-BDRTJ §Change: Endgame test run

**Also blocked by FS-C8VM7's issues that build the floor pools and the Dark Warrior family**
(Dark Warrior and Dark Reaper, with every other 26+ variant the plan names). Their ids do not
exist yet: add them to `blocked_by` once FS-C8VM7 is sliced. Until then this stays `blocked`.
Server lane under the charter: game-service only.

## What to Build

The run end to end on the server, behind the dev test room's existing guard
(`WithDevTestRoom`, R18): a second dev hub gate `dev_endgame_run`, the action
`start_dev_endgame_run` run through `start_solo`'s guards with the gate swapped (R22), and a run
session built from one fixed plan in a new file: height 10, first floor 6, each floor's fixed
pool of 5 (R26), monster level 20 + floor with no spread (R27), at least one Dark Warrior-family
monster per floor within FS-C8VM7's cap (R24), no Blood Demon, Daa'gon at 35 on floor 10 (R30).
The body is the real character with checked-out gear (R31), and the run settles as any run (R32).
The plan is threaded into the session as an option; a session without one behaves exactly as
today (R35). No change to `internal/matchmaker` or `internal/match_queue` (R34, C1).

## Acceptance Criteria

- [ ] Off: no `dev_endgame_run` gate in the hub, and `start_dev_endgame_run` is answered
  `Unknown action` with no session made.
- [ ] On: the gate stands at (160, 720), arrival (300, 720), not in `hubGates`; a test asserts
  its range overlaps no other gate's, its arrival is outside every gate's range, and it is clear
  of every wall, NPC and resident region.
- [ ] On, a solo character at the gate with readable gear: one run session, seated at their own
  level with a `CheckOutRunGear` call, answered `world_entered`.
- [ ] Refused in `start_solo`'s words: no character, in a party (of one included), queued, away
  from this gate (`Walk to the gate first.`). Unreadable gear: `loadout_unavailable`. Already in a
  run: resumed. The queue is only read, through the existing `IsQueued`.
- [ ] The run's `FloorComponent` starts at depth 6, count 10; climbing goes 6 → 10; floor 10 has
  no stairs, holds Daa'gon at 35 and no champion.
- [ ] Each floor's standard monsters come only from that floor's plan pool, all at level
  20 + floor; at least one Dark Warrior-family monster; no Blood Demon.
- [ ] Loot rolls are untouched: the plan holds no drop, chest or Fabled input.
- [ ] Escaping with an item publishes `match.ended` with it, as any run.
- [ ] A run made by `start_solo`, `party_enter` or the matchmaker is unchanged (height rolled,
  floor 1, pools drawn, spread, Blood Demon chance): existing tests stay green.
- [ ] A test fails if the plan names a variant the roster does not have.
- [ ] `session.go` changes only at `InitialSystems`, `InitialMapObjects` and the population call
  (R35). No diff under `internal/matchmaker`, `internal/match_queue`, other services, proto,
  migrations or deploy.
- [ ] `make test` (with lint and check) passes in game-service.

## Blocked By

FS-C8VM7's floor-pool and Dark Warrior issues (ids pending, see above).

## Spec Reference

FS-BDRTJ §Change: Endgame test run, Requirements 18, 19, 22, 23 (server half), 24-28, 30-35;
C1-C3; User Stories 6, 8-15.

## Files Expected

- New: `game-server/game-service/internal/game/dev_endgame_run.go` (the plan table, the gate,
  the session option), `internal/game/dev_endgame_run_test.go`,
  `internal/gameserver/dev_endgame_run_test.go`
- `game-server/game-service/internal/game/session.go` (the three plan sites only),
  `internal/game/monster_population.go` and the FS-C8VM7 pool-draw file (the plan's pool and
  level in place of the draw and spread), `internal/game/factory.go` (`CreateMatchProgressEntity`
  takes the first floor)
- `game-server/game-service/internal/components/gate.go` (new destination)
- `game-server/game-service/common/constants/` (the action)
- `game-server/game-service/internal/gameserver/hub.go` (the case, sharing `start_solo`'s guards),
  `internal/gameserver/server.go` (the run constructor beside `CreateGameSession`, the gate at
  boot beside `AddDevTestRoomGate`), `internal/gameserver/fields.go` (pass the existing flag on)

## TDD Approach

- RED: with the option on, `start_dev_endgame_run` from a solo player at the gate yields a session
  whose floor is 6 of 10 and whose monsters are all from floor 6's pool at level 26.
- GREEN: the plan, the session option and the hub case behind the existing guard.
