# ADR-0031 — Field visits settle as `match.ended` with a `world_type`; stats and notifications skip fields

Status: accepted
Date: 2026-10-30
Scope: `game-server/common` (events proto), `game-server/game-service`,
`game-server/stats-service`, `game-server/notification-service`
Realized by: [FS-X2F2H](../specs/X2F2H-field-worlds-and-gentle-meadows.md) §F (R38–R47, "The
settlement finding", decision D22)
Builds on: [ADR-0030](0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md)
(field worlds are per-replica channels; gains settle when the player leaves)

## Context

FS-X2F2H adds field worlds: shared, always-on worlds with monsters and loot and no queue. A
player's XP, kills and gear from a field visit settle when they leave. The charter assumed a
visit could ride the run's existing match-end path (game-service outbox, FS-9TNJA relay,
FS-BVM9H consumer inboxes) with no consumer change.

Read against the code on 2026-10-29, the path carries a visit's data unchanged: `session_id` is
already a world-minted uuid, one-player events are fine, there is no escrow, and items-service
already treats a dead player's gear like a survivor's. What it cannot do is tell its consumers
that a visit is not a match:

- **stats-service** (`ProcessMatchCompleted`) has no per-outcome branch. Every `match.ended`
  player adds `games_played + 1` and a `match_history` row, and a `win` is counted in stats and
  the leaderboard. Farming a field would inflate games played and match history by one per visit.
- **notification-service** (`ProcessGameEnded`) sends one in-app notification per player per
  event: every field visit would send a "Game Over".
- **game-service's run ranking** (`rankPlayers`) marks anyone not eliminated `win = true`, so a
  visit sent through it would make the visitor a winner.

The gap surfaced at FS promotion as a promotion default (D22). The owner approved it on
2026-10-30 ("Approve"). Recorded without adversarial review beyond that approval.

## Decision

**A field visit settles through the existing match-end outbox, as an ordinary
`MatchEndedEvent` + `ItemsExtractedEvent` pair, distinguished by a new additive proto field.**

- `MatchEndedEvent` gains `string world_type = 5`: `"run"` or `"field"`. **Empty reads as
  `"run"`**, so events published before the field existed, and any old outbox rows still in
  flight, stay runs.
- game-service sets `"run"` explicitly on every run's end and `"field"` on every visit. A visit
  builds its own one-player result (`win = false`, `escape = false`, `final_position = 1`) and
  never goes through `rankPlayers`.
- **stats-service skips field events**: it records the event processed in its inbox and writes
  no stats, history or leaderboard change.
- **notification-service skips field events**: no notification.
- **Each visit mints a fresh `session_id`.** character-service keys XP grants on
  `(session_id, character_id)`; reusing the field channel's id would drop every visit after the
  first as already granted.

No new event, routing key, queue, endpoint or migration. character-service and items-service do
not change: they grant XP and upsert the loadout by their existing paths.

## Consequences

- **One settlement path, not two.** Fields reuse the outbox, relay, inboxes and idempotency the
  runs already rely on; there is no second pipeline to keep correct.
- **A visit is not a match.** Games played, match history, wins and the leaderboard stay a record
  of Spire runs only. Field play shows up only as XP and items.
- **Every `match.ended` consumer must now honour `world_type`.** A consumer that ignores it
  treats a visit as a match. New consumers have to decide what a field visit means to them;
  `"run"` is the safe reading only of an empty value, never of an unknown one.
- **Deploy order is load-bearing.** stats-service and notification-service ship their skip before
  game-service publishes any field visit. proto3 consumers ignore an unknown field, so an old
  consumer would silently count every visit as a match. The other order is unsafe.
- **The name stays `MatchEndedEvent` / `match.ended`** though it now carries non-matches. Renaming
  would touch every consumer and the AMQP topology for no behaviour gain; the discriminator is the
  cheaper truth. A later ADR may rename it if more world kinds settle this way.
- **Stringly-typed discriminator.** `world_type` is a string, not a proto enum, matching the
  client's existing `world_entered.world_type` vocabulary. Typos are caught by tests at each
  producer and consumer, not by the schema.
