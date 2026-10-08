---
id: I-77AB6-6
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-1]
labels: [ready-for-agent]
title: "FS-77AB6 slice 6: Co-op runs — player damage switched off, party-resolved end rule"
---
Implements FS-77AB6 §Requirements (Co-op 12–17), §WebSocket message surface

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (refusing actions from resolved delvers; end-signal latch / `Shutdown` idempotence if FS-QG1HR D5 has not landed). Also `systems/rules.go`. Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

Delvers stop hurting each other and a run lasts until the whole party is done.

- Run-level `player damage` setting, **off by default**, set at world build (not client-sent).
  Off: `CombatSystem` discards delver→delver hits (no damage, no crit roll); projectiles pass
  through delvers; slash skips them; targeted `attack` on a delver does nothing and starts no
  cooldown. On: delver→delver damage works through the same formula. Keep the code, don't delete.
- Player–player collision unchanged.
- `RulesSystem` co-op end rule: ends when every delver on the run's **actual roster** has
  escaped, died, or been removed by disconnect cleanup — replaces "≤1 alive" and stops reading
  `DefautMaxSessionPlayers`.
- **End signalled exactly once.** If FS-QG1HR D5's latch (`MatchProgressComponent.Ended`,
  `isRunning = false` in `Shutdown`) is not on main, carry exactly that latch here; nothing else
  from D5.
- Resolved (dead or escaped) delvers are out of play: untargetable, undamageable, their `move`,
  `attack`, `cast_skill`, `interact` refused; they stay in the world receiving state until the
  run ends, then the existing `end_game` + return-to-hub flow runs for everyone.

## Acceptance Criteria

- [ ] Switch off (default): arrow, fireball, slash, targeted `attack` never damage another delver; projectiles pass through delvers.
- [ ] Switch on (test): the same actions damage delvers via the CombatSystem formula.
- [ ] Delvers still collide.
- [ ] Two-delver run continues after one escapes/dies and ends when the second resolves; one-delver run ends when that delver resolves.
- [ ] End signalled once across many ticks after the condition holds; no panic on `endSessionCh`.
- [ ] Resolved delvers' actions are refused and they cannot be damaged.
- [ ] `make lint && make test` pass.

## Blocked By

I-77AB6-1 (CombatSystem). Independent of the monster slices; if it lands before I-77AB6-4, slice 4 still owns "monsters drop resolved delvers".

## Spec Reference

FS-77AB6 §Requirements 12–17; §Edge States (delver disconnects, reconnect); §Acceptance Criteria "Co-op"; §Dependencies (FS-QG1HR D5); User Stories 19, 20, 26.

## TDD Approach

- RED: rules test — two delvers, one escaped, one alive → no end; mark second dead → end signalled once over 5 ticks.
- GREEN: co-op rule + latch; then the switch tests on `CombatSystem`.
