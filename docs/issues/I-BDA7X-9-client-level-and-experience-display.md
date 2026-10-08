---
id: I-BDA7X-9
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-3, I-BDA7X-4, I-BDA7X-7]
labels: [ready-for-agent]
title: "FS-BDA7X slice 9: Client shows level, experience bar, level-up cue and level requirements"
---
Implements FS-BDA7X §Requirements (Client 42–45)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent lane (frontend).

## What to Build

The player sees their progress and the gates.

- Run and HUB HUD: own level and an experience bar from world state (`level`, `experience`,
  `level_floor`, `next_level_at`); full and marked as the cap when `next_level_at` is absent.
- Level-up cue: brief, non-blocking, derived from `level` rising between states.
- Character list (main menu sidebar): each character's level and bar from `list-my-characters`
  (`levelFloor`, `nextLevelAt`).
- Item views (loadout, satchel, in-run inventory): "Requires level N" when N exceeds the active
  character's level (hint only); a refused equip shows the server's error text.
- Read `game-client/docs/design-guideline.md` first; canvas colour is semantic (amber =
  interactable), tokens only (ADR-0013).

## Acceptance Criteria

- [ ] HUD shows level and a bar proportional to `(experience − level_floor) / (next_level_at −
      level_floor)`; at the cap the bar is full and labelled.
- [ ] Gaining a level in a run shows the cue once.
- [ ] Character list shows level + bar per character.
- [ ] Over-level items show "Requires level N"; a refused equip shows the server message.
- [ ] Unit tests for the bar fraction (incl. cap) and level-up detection; token fence passes.

## Blocked By

I-BDA7X-3 (server character list in the client); I-BDA7X-4 (progression fields in world state);
I-BDA7X-7 (`required_level` on item instances).

## Spec Reference

FS-BDA7X §Requirements 42–45; §Acceptance Criteria "Client" rows 3–5. User Stories 4, 17–21, 24.

## TDD Approach

- RED: `xpFraction({experience: 150, level_floor: 100, next_level_at: 230})` ≈ 0.385; cap → 1.
- GREEN: pure helper + HUD widget.
