---
id: I-BDA7X-4
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-1, I-BDA7X-3]
labels: [ready-for-agent]
title: "FS-BDA7X slice 4: game-service resolves the character in play and seats it at its level"
---
Implements FS-BDA7X §Requirements (Character identity 5–7; Level-up in a run 18–19, 21)

**Domain:** game-service (new gRPC client to character-service) · **Touches `internal/game/session.go`:** yes (`AddPlayer` / `addPlayerLocked` seat stats; `Classes` growth) · **Lane:** backend human lane by default; agent-ready if handed to `/develop`.

## What to Build

The server knows whose character is playing, and the body it builds matches that character's
level.

- `enter_hub` reads `characterId`; game-service calls character-service `GetCharacter(member,
  id)` through a new client under `grpc/` (consumer-owned interface, injected by constructor like
  `grpc/items`). Class, name, level and experience come from the record; payload class/name are
  ignored.
- Refuse entry (visible, retryable reason) when the id is missing, not found for this member, or
  character-service is unreachable (R6). Never seat a default character.
- Store the character in play (id, class, level, experience) on the server-held player record
  (`types.Player`), so it survives HUB → run → HUB and reconnect into a run (R7). If FS-K2HKP's
  handoff (I-K2HKP-3) has landed, the handoff seat re-resolves the character from the id it
  carries — coordinate with that slice; do not edit FS-K2HKP's issues.
- Seat stats = class base + `(level − 1) ×` R19 growth, full HP/MP; `StatsComponent.Level` /
  `Experience` set from the record.
- World state for the own player carries `level`, `experience`, `level_floor`, `next_level_at`
  (via the `game-server/common` table from slice 1).

## Acceptance Criteria

- [ ] Valid `characterId` → seated with that character's class/name/level/experience regardless
      of payload class/name.
- [ ] Missing / foreign / deleted id, or character-service down → refused, nothing seated.
- [ ] Character in play kept across HUB → run → HUB and a run reconnect.
- [ ] A level-5 warrior seats with Str 16, Vit 17, max HP 198, max MP 58 (base + 4 × growth).
- [ ] Serialized player state includes the four progression fields.
- [ ] Tests with a fake character client; existing gameserver/game tests green.

## Blocked By

I-BDA7X-1 (GetCharacter RPC, shared table); I-BDA7X-3 (client sends `characterId` — merging this
first would refuse every current client).

## Spec Reference

FS-BDA7X §Requirements 5–7, 18–19, 21; §Acceptance Criteria "Character identity" (entry rows),
"Experience and level-up" (seat + state rows); §Edge States "character-service down", "Two tabs",
"Foreign character id", "Cross-pod run". User Stories 7, 13–14, 19, 25.

## TDD Approach

- RED: `enter_hub` with a fake client returning a level-5 archer seats Agi 20.
- RED: `enter_hub` with the fake returning NotFound sends a refusal and seats nothing.
- GREEN: client + Player record + seat computation.
