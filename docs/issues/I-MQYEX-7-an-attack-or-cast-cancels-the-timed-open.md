---
id: I-MQYEX-7
status: open
implements: FS-MQYEX
blocked_by: []
labels: [ready-for-agent]
title: "FS-MQYEX slice 7: an attack or skill cast that goes off cancels the player's timed open (game-service)"
---
Implements FS-MQYEX §Change: An attack cancels the timed open

**Lane: game-server (game-service), opened to agents by the owner for this item** (charter
2026-11-24, "核准"). A timed open is cancelled on the tick an attack or skill cast of its player
goes off: the basic attack, the class ability, every tree ability and the mercenary's parry. A
refused one cancels nothing. Judged with the other cancels, after movement and combat and before
completion. Silent and private. No proto, wire, DB, gateway or client change.

## Files owned

- `game-server/game-service/internal/systems/timed_open.go`: `cancelled` gains the attack rule; the system's doc comment ("nothing else cancels") is brought up to date. **Hotspot: touch only these.**
- `game-server/game-service/internal/systems/combat.go`: only what tells the timed open whose attack or cast went off this tick: `resolve` past its refusals (cost spent, cooldown started) and `stepStance` raising the stance. No change to how combat resolves anything.
- `game-server/game-service/internal/components/timed_open.go` only if the rule needs a field on the timed open (as `HealthBeforeCombat` was for the hit)
- `game-server/game-service/internal/game/session.go`: `step` only if the wiring between combat and `advanceTimedOpens` must change. **Hotspot: `step` only.**
- `game-server/game-service/internal/game/timed_open.go` only if `advanceTimedOpens` must pass something through
- tests: `internal/systems/timed_open_test.go`, `internal/game/timed_open_test.go` (`TestTimedOpen_NothingElseCancels` loses its attacking and casting cases, which move to new tests; equipping stays), `internal/game/timed_open_several_test.go` for the two-player case

## What to Build

1. An attack or cast goes off (E1): read from the tick's combat, never from the message. A targeted attack with nothing in range, a pinned caster, a cooldown, too little resource, a tree ability not held, a parry while the stance is open or locked out: refused, no cancel (R28, R29).
2. The cancel joins R6–R9 in `cancelled`, judged before completion (R31, B4); an attack applied on the reach's own tick cancels it (E4).
3. Only the player's own attack, and only one that goes off while the timed open runs: a projectile, rain or trail from an earlier cast cancels nothing (R30, E3).
4. Drinking and equipping still cancel nothing; a parried strike and a heal still cancel nothing (R33).
5. Silent: no reply, nobody else's timed open touched (R32).

## Acceptance Criteria

- [ ] During a timed open, a basic attack that lands cancels it; so does one that goes off and hits nothing. The container is shut and unrolled, and nothing is sent.
- [ ] During a timed open, the mage's triple fireball cancels it, also when it hits nothing.
- [ ] During a timed open, a tree ability that goes off cancels it.
- [ ] During a mercenary's timed open, a parry cast that raises the stance cancels it; a parry cast while the stance is open, or locked out, cancels nothing.
- [ ] An attack refused for its cooldown, for too little resource, or while the caster is pinned cancels nothing, and the timed open completes on its 45th tick.
- [ ] A targeted attack with nothing in range cancels nothing.
- [ ] An attack that goes off on the tick the timed open would complete cancels it: the container stays shut.
- [ ] An attack applied on the same tick as the reach, before it and after it in arrival order, leaves no timed open after that tick.
- [ ] A projectile from a cast made before the reach that lands during the timed open cancels nothing.
- [ ] With two players at one container, one attacking cancels only their own; the other's completes.
- [ ] After an attack's cancel, the same player's next reach starts from zero and completes after the full 1.5 s.
- [ ] Drinking, and equipping and unequipping, during a timed open still do not cancel it.
- [ ] `TestTimedOpen_AHitCancelsThoughAKillsHealOutweighsIt` still proves the hit (R7), not the attack: the healing kill must not be the delver's own attack on that tick (e.g. a projectile fired before the reach).
- [ ] No file outside `game-server/game-service/` changes; no proto, wire or serializer change.
- [ ] `go test -race ./internal/game/... ./internal/systems/...` passes; `make test` (lint and check included) is green in `game-server/game-service`.
  Recorded 2026-11-24: `make test` green and `go test -race` green; `make lint` shows only the 7 failures already present at 16d2662b (cmd/server/main.go:119,136,165,169; internal/game/hub_town_golden_test.go:129; auth/middleware.go:68,71), none new; `make check` not run, since its `go fmt` rewrites the untouched internal/game/interact_cache_test.go.

## Blocked By

None (I-MQYEX-1 to I-MQYEX-6 are done).

## Spec Reference

FS-MQYEX §Change: An attack cancels the timed open: Requirements 28–34, decisions B1–B4 and E1–E4, the server Acceptance Criteria and every Edge State. Supersedes R13 and D9 for attacks and casts.

## TDD Approach

- RED: start a timed open, `handleAttack` on a target in range, tick once, assert no timed open and a shut, unrolled container.
- GREEN: the attack rule in `cancelled`, fed by combat. Then one RED/GREEN pair per case: a whiff that goes off, a cast, a tree ability, the parry raised and refused, each refusal, the last tick, the reach's own tick, an earlier projectile, two players.
