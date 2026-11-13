---
id: I-3103M-4
status: open
implements: FS-3103M
blocked_by: [I-3103M-3]
labels: [ready-for-agent]
title: "FS-3103M slice 4: burning the tome at the altar summons Vorsk"
---
Implements FS-3103M §F

**Hotspot:** `session.go` and `monster_population.go` / `dungeon_population.go` (also FS-C8VM7's);
one writer at a time. Reuse the existing boss placement helpers without reshaping them (their
reshape is FS-C8VM7's). Never touch `internal/matchmaker` or `internal/match_queue`. No migrations,
no HTTP contract change, no kill or match stats.

## Files expected

- `game-server/game-service/internal/game/tome.go` (`burnTome`, `summonVorsk`, reason `altar_burned`)
- `game-server/game-service/internal/game/dungeon_population.go` (only if a nearest-to-a-point room spot helper is needed beside `placeDungeonDemon`)
- `game-server/game-service/internal/game/session.go` (only the altar branch's call, if I-3103M-3 did not already route it to `tome.go`)
- Tests: `tome_test.go`

## What to Build

Interact on the altar while the party carries the tome burns it: carried clears, `burned` becomes
true (R17). Vorsk spawns in the same tick: archetype `demon`, `Boss: true`, never elite, at
`demonLevel(party level, current floor)` with the party level as population takes it (R18). It
stands at the free spot in the altar's room nearest the altar, off doorways, clear of walls,
fixtures and every delver's body, among a bounded sample; with none, the floor's farthest valid
spot with the delver exclusion relaxed, as a guaranteed boss; logged loudly if even that fails
(R18, charter default). A burned altar refuses every later interact with `altar_burned` (R19).
Vorsk comes on top of the floor's count and beside any blood demon (R20). No reply on a burn: the
broadcast's `burned` says it. Take Vorsk's level through one function at the summon site: FS-BDRTJ's
endgame test run (I-BDRTJ-4) reads its own level there.

## Acceptance Criteria

- [ ] With the tome carried, interact on the altar in range: `burned` true, `tome_carried` absent, exactly one `demon` boss at `demonLevel`, in the altar's room, nearest valid spot, overlapping no delver.
- [ ] Two burns queued in one tick: one Vorsk; the second gets `altar_burned`.
- [ ] A burn by a delver other than the taker works.
- [ ] An altar room with no free spot puts Vorsk at the floor's farthest valid spot; a floor with none logs an error and the altar stays burned.
- [ ] A blood demon already on the floor is untouched.
- [ ] `make test` (and `make lint`, `make check`) green in game-service.

## Blocked By

I-3103M-3.

## Spec Reference

FS-3103M §F R17-R20; user stories 6-10, 18, 25.

## TDD Approach

- RED: forced tome run, carried plan, interact on the altar; one `demon` boss stands in the altar's room.
- GREEN: the burn, then placement, then the burned refusal.
