---
id: I-77AB6-9
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-7, I-77AB6-3, I-77AB6-6]
labels: [ready-for-agent]
title: "FS-77AB6 slice 9: Target monsters, treat delvers as allies, show the delve-continues notice"
---
Implements FS-77AB6 §Requirements (Client presentation 39, 40, 42), §WebSocket message surface

**Domain:** game-client · **Touches `internal/game/session.go`:** no (client only). Appearance and copy work: read `game-client/docs/design-guideline.md` and the lore-voice rules in `game-client/CLAUDE.md` first; tokens only (ADR-0013).

## What to Build

The client side of co-op combat.

- **Targeting monsters:** hovering a living monster shows the existing strike-mark cursor;
  clicking sends `attack {enemy_entity_id}` with its entity id (same path rivals use today); a
  hit plays the existing damage flash on it. Dead monsters are not targetable.
- **Delvers are allies:** other delvers get no strike-mark and no click-to-attack; their name and
  HP markers move from the hostile channel to the ally (arcane green) channel. Co-op
  presentation is hard-coded; PvP client presentation is out of scope.
- **Delve-continues notice:** a delver who has escaped or died while others remain sees a short
  lore-voice notice ("delve", never "run") until the `end_game` overlay arrives.

## Acceptance Criteria

- [ ] Clicking a living monster sends `attack` with its entity id; hit flash plays; corpses ignore clicks.
- [ ] Other delvers show no strike-mark, cannot be click-attacked, and use ally-channel markers.
- [ ] Escaped or dead delver with the party still in play sees the notice until `end_game`.
- [ ] Token fence passes; client tests pass.

## Blocked By

I-77AB6-7 (monster sprites), I-77AB6-3 (monsters can be hit server-side), I-77AB6-6 (co-op server rules)

## Spec Reference

FS-77AB6 §Requirements 39, 40, 42; §WebSocket message surface; §Acceptance Criteria "Client" rows 4–6; User Stories 14, 15, 19, 20, 21.

## TDD Approach

- RED: scene test — pointerdown over a monster sprite emits `attack` with that monster's `entity_id`; over another delver emits nothing.
- GREEN: targeting by entity kind; then marker channel and notice tests.
