---
id: I-BDA7X-6
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-4]
labels: [ready-for-agent]
title: "FS-BDA7X slice 6: Run experience persists to character-service via match.ended"
---
Implements FS-BDA7X §Requirements (Persistence 22–29)

**Domain:** proto (events) + game-service + character-service (consumer + migration) · **Touches `internal/game/session.go`:** yes (`getRawMatchState` / `endSession`; updating the player record at run end) · **Lane:** backend human lane by default; agent-ready if handed to `/develop`.

## What to Build

What a character earned in a run lands on the character, exactly once.

- `events/game.proto`: `PlayerMatchResult` gains `character_id` and `experience_gained`
  (additive). Regenerate.
- game-service: the run-end event reports, for every character with experience in the run
  (including players removed before the end), its gained experience from the per-run tally. If
  slice 5 has not landed the tally is empty and gained is 0 — the plumbing is still testable.
  When the run resolves, the player record's character in play takes the run's resulting level
  and experience (R24).
- character-service: migration `000002` creates the experience-grant record keyed
  `(session_id, character_id)` with amount and timestamp. A consumer on its own durable queue
  bound to `game.events` / `match.ended` applies each `experience_gained > 0` in one transaction:
  insert grant (conflict → no-op), add to `exp`, recompute `level` from the shared table. Apply
  only if the character is live and `player_id = member_id`; otherwise drop and log. Malformed →
  reject without requeue (dead-letter); transient DB error → requeue. Use `slog` (the current
  consumer uses `log` / `fmt`).

## Acceptance Criteria

- [ ] A resolved run's `match.ended` carries `character_id` + `experience_gained` per character,
      including a player removed mid-run.
- [ ] Replaying the same event leaves `exp` and `level` unchanged.
- [ ] A grant for another member's or a deleted character is dropped and logged.
- [ ] After the run, the HUB world state shows the new level before the consumer runs.
- [ ] Repository tests for the grant transaction; consumer test for duplicate / foreign / malformed.

## Blocked By

I-BDA7X-4 (character id in the run). Meaningful amounts need I-BDA7X-5, but this slice does not.

## Spec Reference

FS-BDA7X §Requirements 22–29; §Acceptance Criteria "Persistence"; §Edge States "Consumer lag",
"Duplicate delivery", "Character deleted mid-run", "Process crash mid-run". User Stories 15–16, 26.

## TDD Approach

- RED: applying grant (s1, c1, 120) twice yields exp 120, level 2.
- GREEN: migration + repo transaction + consumer.
