# ADR-0040 — Players settle on resolve: one event pair per player, deterministic ids, applied at once with reclaim kept

Status: accepted
Date: 2026-11-03
Scope: `game-server/common` (events proto, outbox), `game-server/game-service`,
`game-server/items-service`, with consumer impact on `character-service`, `stats-service`,
`notification-service`
Realized by: [FS-GV8WN](../specs/GV8WN-settle-on-resolve.md) (draft; scoping notes, decisions
3, 4, 8, 9)
Builds on: [ADR-0031](0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md)
(one-player settlement through the match-end pair), [ADR-0032](0032-run-gear-is-checked-out-synchronously-to-in-run-not-escrowed-by-a-saga.md)
(synchronous checkout, run-id fence, next checkout reclaims orphans; unchanged here)

## Context

A run settles once, at its end: `endSession` writes one `items.extracted` and one `match.ended`
for every member. A player who escaped or died waits on teammates, and FS-QPDKN grew a set of
rules around that wait: an escaped player's reconnect grace, release to the village, a Redis
settling mark, and entry refusals. Nick wants a player settled the moment they leave active play
(escape, death, or removal after an in-play disconnect outlives its grace). Their result is final
then: kill experience goes only to delvers still in play (`KillExperience.ConsumeKill`).

Read against the code on 2026-11-03:

- items-service's `settleRun` ends with `ReleaseRunTx(runID)`, which frees **every** IN_RUN row of
  the run, other members' gear included. A one-player settlement cannot use it.
- character-service keys experience grants `(session_id, character_id)` ON CONFLICT DO NOTHING, so
  per-player events are already idempotent. stats-service's per-player match stats are commented
  out (TODO). notification-service sends one notification per player per `match.ended`.
- The outbox inserts without an id, so the DB picks a random one, and consumers dedup on
  `MessageId` = that id. A commit that errors but did commit, then a retry, writes a second row
  under a new id, and items would store the plunder twice. A failed write is only logged today
  (`PublishMatchComplete`; field visits: "it is lost").
- Drinking a potion changes only the run's ECS memory. Until settlement, the DB holds the potion as
  IN_RUN under run R. If the player checks out a new run S first, FS-18Z5F R9 re-tags it to S and
  seats it in S's memory. The late settlement's consumed-item delete is fenced on `run_id = R`, so
  it matches nothing and is skipped for good. The player keeps the run's gains and its
  consumption is undone. Once players can leave early, this window becomes reachable.

The decisions below were challenged (`/challenge-me`, 2026-11-03) before being recorded.

## Decision

1. **One event pair per player, kept as the existing pair.** Each player is settled at their own
   resolution by an `items.extracted` + `match.ended` pair carrying only them. Each member of a run
   appears in exactly one pair across the run. Run end writes a pair for whoever is still unsettled.
   `items.extracted` gains a `partial` flag. Its proto default, false, keeps today's whole-run
   meaning, so older events apply unchanged. A partial event releases only the listed member's
   IN_RUN rows. Run end always closes with a `partial=false` sweep that releases whatever is left
   under the run. **`match.ended` no longer means one match**: it means "these members' results for
   run X". A consumer that counts matches must count per player, not per event.
2. **Settlement event ids are deterministic**, derived from run id + member id + event type, and
   unique in the outbox. If the outbox write fails, the session retries it with backoff, and run end
   makes one last attempt. A session is not torn down until every pending settlement it holds has
   committed, whether or not its players are still present.
3. **Applied at once, reclaim kept (lite).** After the outbox commit, game-service calls
   items-service synchronously (`ApplySettlement`) with the same payload and the same event id,
   through the same handler as the consumer. The async copy then arrives and is dropped by the inbox
   as a duplicate. Checkout keeps FS-18Z5F R9 reclaim unchanged. A pod that dies before a player's
   settlement commits rolls that run back for them: brought-in gear returns as it was, finds are
   lost, consumption is undone, and no experience is granted.
4. **Accepted residual, watched, with an upgrade trigger.** The window above survives only when the
   sync apply fails while items-service still serves checkout, and the player re-enters before the
   async delivery lands. items-service logs and counts a consumed-item delete that matches zero rows
   under the run fence. **Before durability wear ships**, checkout must stop reclaiming in-flight
   settlements. It does so by looking up game-service's settlement record for the residue's run and
   hand-delivering it, and reclaims (rolls back) only when no record exists.

## Rejected

- **A new `delver.settled` event**, with `match.ended` kept as one per match: the cleanest meaning,
  but it adds new queues and topology in items and character. Nick chose to keep the pair.
- **Run liveness heartbeat** to tell an in-flight settlement from a crashed run: this is timing
  inference. A GC pause or a Redis blip misjudges a live run as dead.
- **Pod-death detector emitting `run.abandoned`**: the detector is a heartbeat under another name.
  It also races late settlements published by other pods' outbox workers from the shared database.
- **Applying late settlements to reclaimed items**: the item is already in the new run's memory and
  can be used again.
- **Checkout diffing the pending settlement**: duplicates settlement semantics in a second place.
- **Checkout refusing (`settling`) until the settlement lands**: correct, but players wait whenever
  the broker is slow. It became the hand-delivery upgrade in Decision 4.
- **Holding the player until items-service confirms**: a closed tab is a leave and slips past it. It
  also needs a new confirmation channel and traps everyone during a broker outage.

## Consequences

- Escaped and dead players settle and may leave without waiting. FS-QPDKN's escaped grace, release,
  settling mark and entry refusals (R29–R36) can be removed once FS-GV8WN ships.
- items-service: a member-scoped release, the `partial` branch, an `ApplySettlement` gRPC entry, and
  the fence-miss counter. game-service: per-player settlement at resolution, a retrying writer, and
  `endSession` reordered so teardown waits for commits. common: deterministic outbox ids.
- Clients learn "settled" from the sync call's answer: 結算中 → 結算完成.
- The free-consumable window stays open under rare infrastructure faults. It is not
  player-triggerable, it is counted, and it must close before durability wear
  (FS-GV8WN decision 9).
- A deploy that kills a pod with live runs rolls those players back until a graceful drain exists.
  That is out of scope for FS-GV8WN.
- A future stats revival must count matches per player, because `match.ended` is per player now.
- Reconnects inside an in-play grace must reach the holding pod (FS-MCYWK), or another pod's
  checkout could reclaim gear from a live run.
- **Accepted risk, to close before slice 8 calls it or anything ships to GKE:** `ApplySettlement`
  writes items for whichever members its event names, and has no service credential yet. It sits
  in `common/auth` `publicMethods` beside wallet's service-called methods. Unlike wallet, though,
  items-service's gRPC listener is not bound to localhost, so anything that can reach the items
  Service could mint items. Nick (2026-11-03, after code review) chose to record the risk now and
  build the credential later. Tracked as I-GV8WN-11. The candidates are a shared internal service
  secret checked by the interceptor (recommended, and it retires wallet's entries too) or a
  service-role JWT. The JWT was not preferred: game-service would have to hold `JWT_SECRET`, and
  could then mint player tokens.
