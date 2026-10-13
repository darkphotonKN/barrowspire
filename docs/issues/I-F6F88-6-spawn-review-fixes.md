---
id: I-F6F88-6
status: done
implements: FS-F6F88
blocked_by: [I-F6F88-5, I-4R9M9-23]
labels: [ready-for-agent]
title: "Grouped spawn: seeded placement and one in-play rule"
---
Implements FS-F6F88 §Requirements 15 as amended (I-F6F88-5) — code-review MED + LOWs on I-F6F88-5.

**Domain:** game-service (internal/game/party_spawn.go, monster_population.go, session.go comment, party_spawn_test.go). · **Lane:** agent.

## What to fix
1. **MED — seeded placement.** `party_spawn.go:~56` `partyArea` uses global `math/rand/v2`; monster placement now depends on that unseeded party point, so seeded monster tests (`TestNewRun_PlacesMonstersOnOpenGroundAwayFromDelvers`) no longer reproduce per seed. Use the session's injectable `s.spawnRand`.
2. **LOW — one in-play rule.** `livingParty` (party_spawn.go:~79) and `inPlayPositions` (monster_population.go:~199) define "who stands on this floor" differently (only one excludes IsEliminated). Use one helper (built on `systems.InPlay`) for both.
3. **LOW — reserve the formation area.** Append the party's cleared rectangle to `objectOccupiedPlaceAreas` (like stairs) so later placements can't land on the party.
4. **LOW — comment.** session.go:~976-979 `spawnPoint` comment: say a late joiner to a run keeps this point until the next climb (known gap).
5. **LOW — test.** party_spawn_test.go:~117 compares against the pre-climb scattered position; assert the second climb's point differs from the FIRST regroup point (seeded so it's deterministic).

## Acceptance Criteria
- [x] Seeded runs place the party and monsters identically for the same seed.
- [x] Shared in-play helper used by both; formation area reserved; tests green.
