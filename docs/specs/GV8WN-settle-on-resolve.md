# FS-GV8WN: Settle each player the moment they resolve

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" (resolved players settle the moment they resolve · leave a run early after escaping), "### Results" (match-end writes retried until recorded); `game-server/items-service/SPECIFICATION.md` "## Run extraction" (settle one player of a run without releasing the rest · apply a run settlement on request); `game-client/SPECIFICATION.md` "### Escape run" (toggleable settlement record while in the run · leave a run early after escaping) → this FS · Related ADRs: [ADR-0040](../adr/0040-players-settle-on-resolve-one-event-pair-per-player-applied-at-once.md) (per-player event pair, deterministic ids, applied at once with reclaim kept), [ADR-0031](../adr/0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md) (one-player settlement precedent), [ADR-0032](../adr/0032-run-gear-is-checked-out-synchronously-to-in-run-not-escrowed-by-a-saga.md) (checkout, run fence, reclaim; unchanged), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) · **Supersedes in part [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md):** R3/R10/R14's "no leave for an escaped delver", the held result card (R15–R17), the escaped reconnect grace (R18 and R12 for escaped delvers), the release to the village (R29–R31) and settling (R32–R36), plus both ACCEPTED settling edge states. QPDKN's spectate, dead leave and dead-disconnect rules stand. FS-QPDKN is not edited. · Builds on: [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) (R9 reclaim, R29 release, run fence), [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (inboxes), [FS-P9G8R](P9G8R-drink-health-potions.md) (consumed items), [FS-BDA7X](BDA7X-character-leveling.md) R22–R24 (run progress), [FS-PJPNA](PJPNA-deduplicated-match-result-notifications.md) (game-ended notifications), [FS-9TNJA](9TNJA-game-service-owns-its-outbox.md) (outbox) · Depends on: [FS-MCYWK](MCYWK-reconnect-to-the-holding-pod.md) (in-play grace reconnects reach the holding pod) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*settle on resolve*, *settlement record*, *pending settlement*, *rollback* pending via domain-model)

## Summary

Today a run settles everyone together when it ends, so a player who escaped or died waits on
their teammates before their plunder, experience and gear come home. This feature settles each
player at the moment they leave active play: on escape, on death, or on removal after a
disconnect. A settled player sees a settlement record of what they carried out, lost and earned,
and can watch their teammates or leave the tower at once. The run's end then settles only
whoever is still unsettled.

**Lane:** game-service, items-service and `common` slices are **human lane** (hand-coded, agent
for tests only). Client slices are agent lane.

## Requirements

### A. Settle on resolve (game-service)

1. **A player is settled when they resolve.** Resolving is one of three moments:
   - **escape**: the escape door is reached (`handlePlayerEscape`);
   - **death**: the player is eliminated, including a death by choice (FS-9K8EZ) and a player left
     behind on a lower floor (FS-F6F88);
   - **removal**: an in-play player's disconnect outlives its reconnect grace (FS-QPDKN R20).
   Settlement happens on the tick the moment is recorded. It is never deferred to the run's end.
2. **What is settled is final at that moment.** It is a snapshot of the player's body, taken on
   that tick:
   - **escape**: everything worn and carried, finds included;
   - **death** and **removal**: only the safe items (`safeItems`); unsafe finds are lost
     (FS-18Z5F R23). Removal counts as death for settlement (Nick, 2026-11-03).
   - In all three: the ids of stored items used up in the run (FS-P9G8R), and the experience
     earned so far. Experience can't change after resolution: kill experience goes only to
     delvers still in play (`KillExperience.ConsumeKill`).
   - Removal therefore deletes potions drunk before the drop. Today they are not deleted.
3. **A settled player's progress is applied to their village seat at once** (`ApplyRunProgress`,
   FS-BDA7X R24). A player who leaves early arrives in the village at their new level.
4. **A settled player's body is not settled again.** The run's end (R14) skips every member
   already settled. A settled escapee's body stays in the world until they leave or the run ends,
   so they still receive their own state (FS-QPDKN R24). It is never part of a later event.

### B. One event pair per player (common, game-service)

5. **Each settlement writes one `items.extracted` and one `match.ended` carrying only that
   player,** in one outbox transaction (as `writeMatchEndOutbox` does). Across a run, each member
   appears in exactly one pair (ADR-0040). `world_type` stays `run`.
6. **`items.extracted` gains `bool partial`** (proto field, default false). Partial means "these
   members only": items-service releases only the listed members' IN_RUN rows under the run
   (R12). False keeps today's meaning: release every IN_RUN row of the run. Older events have
   no field and read as false.
7. **Settlement event ids are deterministic.** The outbox row id, which is the `MessageId`
   consumers dedup on, comes from the run id, the member id and the routing key (for example,
   UUIDv5 under a fixed namespace). Inserting a row whose id exists is a no-op that reports success
   (ON CONFLICT DO NOTHING). The run-end sweep (R14) uses the run id and a fixed `sweep` member
   key. This lives in the shared outbox writer, so field-visit settlements (visit id + member)
   get it too. A field visit gets nothing else from this FS (*Out of Scope*).

### C. Writes retried until recorded (game-service)

8. **A failed settlement write is retried, not dropped.** The session keeps the formatted pending
   settlement in memory and retries the outbox transaction with backoff (for example, 0.5 s
   doubling to 30 s), until it commits.
   - The retry never blocks the tick or the message hub loop.
   - The write has a timeout; run end no longer writes under `context.Background()`.
   - A retry reuses the same payload and the same ids (R7). A commit that errored but did commit
     is therefore harmless.
9. **The session holds its pending settlements, not its players.** A session is not torn down
   until every pending settlement it holds, the run-end sweep included, has committed. That holds
   whether or not any player is still in it. While waiting, an ended session does not tick and
   serves no one. It exists only to finish its writes.
   *(Amended 2026-11-03, I-GV8WN-4; Nick approved D1: a pod-level settlement writer holds each
   formatted settlement and retries it until it commits. The session is torn down as usual. The
   formatted pair is all a retry needs, and a pod death loses it either way (R10).)*
10. **A pod that dies before a settlement commits rolls that player's run back.** Nothing extra is
    built for this. Their gear is IN_RUN under a run that will never settle, and their next
    checkout reclaims it as it was (FS-18Z5F R9). Finds, consumption and experience from that run
    never land.

### D. Applied at once (items-service, game-service)

11. **items-service exposes `ApplySettlement`** (gRPC, `items.proto`). It takes an
    `ItemsExtractedEvent` and its event id and applies it through the same
    `ProcessItemsExtracted` path the consumer uses: same inbox, same transaction.
    - A repeat, or the async copy arriving later, is `ErrAlreadyProcessed`, reported as success.
    - It is a service-to-service call, not an owner call: no bearer token.
    - Errors follow the FS-22WKC seam: malformed → InvalidArgument, transient → Unavailable.
12. **Member-scoped release.** When `partial` is true, `settleRun` replaces `ReleaseRunTx(runID)`
    with a release limited to the event's members (`run_id = $1 AND owner_member_id = ANY($2)
    AND status = 'IN_RUN'`). The account locks (`lockSettlementAccounts`) cover only those
    members. Everything else in `settleRun` is unchanged: store through the run fence, then
    delete consumed items, then release.
13. **game-service applies each settlement at once.** Right after a settlement's outbox commit,
    the session calls `ApplySettlement` with the same payload and id.
    - **On success**, the settlement is **confirmed** (R20).
    - **On failure**, it is retried with backoff while the session holds it (R9). Giving up when
      the session ends is safe, because the async copy is already durable.
    - Checkout keeps FS-18Z5F R9 reclaim unchanged (ADR-0040 §3).

### E. Run end (game-service)

14. **The run's end settles only who is left, then sweeps.**
    - Members still unsettled at the end, if any (for example, a server-side end with someone in
      play), are settled as in R1–R2, with their outcome taken from their body as today.
    - Then one `items.extracted` with no players and `partial=false` is written: the **sweep**. It
      releases anything still IN_RUN under the run (FS-18Z5F R29), such as orphans or members
      never listed.
    - No `match.ended` is written for the sweep. A run whose members were all settled emits no
      further `match.ended`.
    *(Amended 2026-11-03, I-GV8WN-4; Nick approved D2: when members are left unsettled, the run's end
    writes **one pair carrying all of them with `partial=false`**: store, then release the whole
    run, in one items transaction. Split into a partial pair plus a sweep, the sweep could be
    processed first, release their gear and fence their store out. A players-less sweep is written
    only when nobody is left. Its ordering against a still-retrying partial is open (I-GV8WN-5,
    D3).)* *(Amended 2026-11-03, I-GV8WN-5; Nick chose D3 (i): every whole-run `items.extracted`
    names the members already settled (`settled_member_ids`), and items' release skips their
    IN_RUN rows, which their own partial events release. A players-less sweep can no longer overtake
    a still-retrying partial. A member checked out but never seated (failed cross-pod handoff) is
    still released at the run's end.)*
15. **`endSession` order.**
    1. Settle the remaining members (R14).
    2. Notify and return players to the hub as today.
    3. Write the sweep.
    4. Close and shut down.
    5. Hold the session until its pending writes commit (R9).
    Today's "write the outbox last and only log a failure" is gone.
    *(Amended 2026-11-03, I-GV8WN-4 review; Nick chose (b): **today's order is kept**. Players are
    returned and the session shut down, then the pair is written, because the final elimination
    order is only read after Shutdown. The first attempt follows on the same goroutine within
    milliseconds, which no player can re-enter a run inside. A first attempt that fails leaves the
    retry window, which is the residual ADR-0040 §4 accepts. Only "log a failure and drop it" is
    gone (R8). Reordering would move Shutdown before the return home, for a few milliseconds' gain.)*

### F. Leaving and disconnecting (game-service)

16. **An escaped player may leave.** `leave_run` from an escaped player is accepted, the same as
    a dead player's (FS-QPDKN R10–R14): their record names the hub and they get `world_entered`
    (hub). `ErrEscapedWaits` is removed. A leave is accepted whether or not their settlement has
    committed or been confirmed yet. The session keeps the pending write (R9).
17. **A settled player's disconnect is a leave.** This now covers escaped players as well as dead
    ones (FS-QPDKN R25). They are not held for a reconnect grace: a refresh lands in the village.
    Removed from FS-QPDKN: the escaped reconnect grace (R18 and R12 for escaped), the release
    (R29–R31), the `settling:<playerID>` mark and its entry refusals (R32–R36), `internal/settling`,
    and `Session.Release`.
18. **An in-play player's disconnect is unchanged:** a 30 s grace, and a reconnect to the run.
    After the grace, R1's removal applies. A reconnect inside the grace must reach the holding pod
    (dependency FS-MCYWK, with its open question "does a player in a run follow the same path"
    answered **yes**).

### G. The settlement record (game-service WS + game-client)

19. **On settling, the player is sent `settlement`.** It is a new server→client action, sent only
    to that player, with:
    - `outcome`: `escaped` | `died`;
    - `carried`: items carried out, each flagged `found: true` when it is a find from this run;
    - `lost`: items lost, each with a `reason`: `unsafe` (a find lost on death) or `consumed`
      (used up in the run, e.g. a drunk potion);
    - `experience_gained`, `level_before`, `level_after`;
    - `kills`, `seconds_in_run`;
    - `status`: `pending` | `confirmed`.

    Items use the existing WS item shape. A removed player is not connected, so they are not sent
    one (*Edge States*). The record is built from the settlement snapshot (R2), not from what
    items-service stored.
20. **Confirmation re-sends `settlement` with `status: confirmed`** and the same content, when
    `ApplySettlement` succeeds (R13). The client replaces its record.
21. **The client shows the record at once.** On `settlement`, the client opens the record, which
    can be closed and reopened.
    - A **Settlement** button joins the bottom-centre buttons for a settled player (Watch, and now
      Leave for escaped players too) and reopens it.
    - Status copy: pending reads as settling ("結算中" register), confirmed as settled. It never
      says the player may lose their items: once pending, delivery is guaranteed.
    - Copy, layout and colours follow `game-client/docs/design-guideline.md` (game palette; lore
      voice).
22. **The record is viewable until the player leaves the tower.** It is cleared on `world_entered`
    for any other world.
23. **The record holds the return to the village.** If the run ends (`end_game` +
    `world_entered(hub)`) while the record is open, the hub world is held until the player
    closes the record or presses Leave. This reuses `ResultHold`, raised by the record instead of
    the result card. If the record is closed when the run ends, the hub is applied at once. This
    is how a solo player, or the last to resolve, still sees their record.
24. **The QPDKN result card is removed.** `end_game` no longer opens a card. The record replaces
    it (Nick, 2026-11-03).
25. **An escaped player sees Leave beside Watch.** Leave sends `leave_run`, as the dead player's
    Leave does. With no teammate in play, the run ends and R23 applies.

### H. Watching the residual (items-service)

26. **A consumed-item delete that matches zero rows is logged.** When it does so under its run
    fence (`DeleteConsumedItemInstancesTx`), items-service logs a warning with the member, the
    run and the ids, and counts it in a metric. This is the free-consumable case ADR-0040 accepts.
    The count decides whether to build the checkout upgrade early. The upgrade itself is *Out of
    Scope* until durability wear.

## User Stories

1. As a player who escaped, I want my plunder stored the moment I am out, so that I am not
   waiting on teammates still delving.
2. As a player who escaped, I want to leave the tower right away, so that I can go back to the
   village and delve again.
3. As a player who escaped, I want to keep watching my teammates if I choose, so that leaving
   stays my choice.
4. As a player who died, I want my safe items and experience settled at death, so that leaving
   early or watching makes no difference to what I keep.
5. As a player, I want to see what I carried out, what I lost and what I earned the moment I
   resolve, so that I know the outcome of my delve.
6. As a player, I want potions I drank listed as lost, so that the record matches what I really
   have.
7. As a player, I want to close the record and reopen it while I am in the tower, so that it does
   not block my view of the delve I am watching.
8. As a solo player, or the last to resolve, I want my record to stay up until I close it, so that
   the return to the village does not sweep it away.
9. As a player, I want the record to say settling and then settled, so that I can trust my items
   have landed.
10. As a player who left while settling, I want my items to arrive anyway, so that leaving never
    costs me plunder.
11. As a player who escaped and then lost my connection, I want to land in the village with my
    plunder, so that a dropped socket never undoes an escape.
12. As a player whose connection dropped mid-delve and who never came back, I want what I
    brought in returned, and the potions I drank removed, the same as a death, so that the outcome
    is consistent.
13. As a player who leaves early, I want my new level shown in the village at once, so that the
    experience I earned is visible straight away.
14. As a player, I want one game-ended notification per run, sent when my settlement lands, so
    that the village tells me my items are home.
15. As a teammate still delving, I want my own settlement unaffected by others settling, so that
    their leaving never releases or changes my gear.
16. As a player on a server that crashed mid-delve, I want my brought-in gear back as it was, so
    that a crash costs me the run but nothing I owned.
17. As the operator, I want a settlement write that fails to be retried until it lands, so that a
    database blip never loses a player's plunder.
18. As the operator, I want a retried write never to store plunder twice, so that retries are safe.
19. As the operator, I want to see when a consumed item escaped its deletion, so that I know
    whether the accepted gap is real before durability wear ships.
20. As items-service, I want a settlement delivered twice (sync and async) applied once, so that
    the two paths never double-apply.
21. As character-service, I want each player's experience in its own event, granted once, so that
    per-player settlement needs no change on my side.
22. As notification-service, I want each player in exactly one `match.ended` per run, so that each
    player is notified once.

## Acceptance Criteria

- [ ] Escape writes one outbox pair for that player only, on the escape tick; `items.extracted` has `partial=true`.
- [ ] Death (incl. by choice, and left behind on a lower floor) writes that player's pair at death, with only safe items and their consumed ids.
- [ ] Removal after an in-play grace writes that player's pair at removal, settled as a death, and their drunk potions are deleted.
- [ ] A settled player's progress is applied to their village seat on settlement.
- [ ] The run's end writes pairs only for unsettled members, then one sweep `items.extracted` (no players, `partial=false`), and no `match.ended` for the sweep. *(Amended, R14 D2: one `partial=false` pair for everyone left; a players-less sweep only when nobody is left.)*
- [ ] items-service, given a partial event, releases only the listed members' IN_RUN rows; a teammate's IN_RUN gear under the same run is untouched.
- [ ] items-service, given an event with no `partial` field, behaves exactly as today.
- [ ] Settlement outbox row ids are deterministic. Writing the same settlement twice leaves one row and reports success.
- [ ] A failed outbox write is retried with backoff until it commits, off the tick and hub loop, with a timeout per attempt.
- [ ] A session is not torn down while it holds an uncommitted settlement, players present or not. *(Amended, R9 D1: the settlement writer holds it until commit; the session is torn down as usual.)*
- [ ] After each commit, game-service calls `ApplySettlement`. Success sends `settlement` with `status: confirmed`. Failure is retried while the session holds it.
- [ ] `ApplySettlement` applies through the consumer's path. A second call, or the async copy, is a no-op reported as success.
- [ ] `leave_run` from an escaped player is accepted; `ErrEscapedWaits` no longer exists.
- [ ] A dead or escaped player's disconnect is a leave: no grace, and a reconnect lands in the village.
- [ ] `internal/settling`, the `settling:` key, its entry refusals and `Session.Release` are removed, with their tests.
- [ ] The settled player gets `settlement` with outcome, carried (finds flagged), lost (`unsafe` / `consumed`), experience, levels, kills, time and status.
- [ ] The client opens the record on `settlement`. It can be closed and reopened from a Settlement button.
- [ ] The record is cleared on entering any other world.
- [ ] With the record open, the run's end holds the hub until the record is closed or Leave is pressed. With it closed, the hub applies at once.
- [ ] `end_game` no longer opens the QPDKN result card.
- [ ] An escaped player sees Leave beside Watch, and Leave returns them to the village.
- [ ] A zero-row consumed delete under the run fence is logged and counted.
- [ ] character-service, stats-service and notification-service need no code change. A test shows one grant and one notification per player across a two-player run where both resolve before the end.

## Edge States

**Order and timing**
- Two players resolve on the same tick: two settlements, two pairs, independent. Their account
  locks are taken per event, in member-id order, so they cannot deadlock.
- A player resolves on the same tick the run ends: settled once. R14 sees them settled and skips
  them.
- Leave pressed before the settlement commits: accepted (R16). The session keeps the write.
- The async copy arrives before `ApplySettlement`: the sync call finds it processed and succeeds.
  The record is confirmed.

**Failures**
- game-service's database down at settlement: the record shows pending. The player may stay,
  watch or leave. The session retries. If the pod dies first, that player's run rolls back (R10).
- `ApplySettlement` fails (items unreachable): the record stays pending. The async copy lands when
  items is back. In the village, the game-ended notification arrives then. A tower record left
  pending is accepted.
- items consumer lagging (RabbitMQ down, retry backoff) and the sync call also failed, and the
  player re-enters before it lands: R9 reclaims the brought-in gear. The late delete misses its
  fence, so a drunk potion survives (logged, R26). Plunder still lands in the bag. **Accepted**
  (ADR-0040 §4).
- Late plunder landing in a bag already checked out into a new run: the bag can go over its cap,
  and nothing is lost (as FS-QPDKN accepted).
- An item items-service skips on store (no template, bad affix): the record still lists it (built
  from the snapshot). **Accepted:** rare, and it is logged by items-service already.

- A body that cannot be snapshotted when its member resolves (gone, or malformed) is not marked
  settled: the run's end settles it as before, and logs an error. *(Added 2026-11-03, I-GV8WN-5/6
  code review.)*
- A settlement handed over once the pod has begun draining is refused and rolls back for its
  member, as a pod's death would (R10). *(Added 2026-11-03, I-GV8WN-5/6 code review.)*

**Players and connections**
- Solo run: escape or death settles the player, and the run ends on the same tick. The record is
  open, so the hub is held (R23).
- Last to resolve in a party: as solo.
- A removed player is not connected and gets no `settlement`. If they reconnect after the grace,
  they land in the village, already settled. The game-ended notification is how they learn the
  outcome.
- A refresh while the record is open, after resolving: the refresh is a leave (R17). The record is
  gone, and the game-ended notification follows when the settlement lands.
- A reconnect inside an in-play grace to another pod, before FS-MCYWK: that pod could reclaim gear
  of a live run. This is closed by the FS-MCYWK dependency. Until then it is a known gap, the same
  as today.

- An escaped player whose drop cannot be their leave (the hub is missing) is held, and past their
  grace kept in the run until it ends, as a dead player is (FS-QPDKN R26). They were settled at
  their escape, so only where they reconnect is at stake: back into the run. *(Added 2026-11-04,
  I-GV8WN-7 code review.)*

**Run end**
- Every member already settled: the run's end writes only the sweep.
- The run ends with someone still in play (server-side end): they are settled at the end from
  their body, as today.
- A deploy or crash with live runs: players not yet settled roll back (R10). Graceful drain is
  *Out of Scope*.

## Out of Scope

- **The checkout upgrade** (look up the settlement record, hand-deliver it, and reclaim only on a
  crash) that closes the free-consumable window. Required **before durability wear ships**
  (ADR-0040 §4). The R26 count may pull it earlier.
- **Retry and `ApplySettlement` for field visits.** A field visit gets deterministic ids only
  (R7). Its write still runs on the hub loop and drops on failure.
- **Graceful drain on SIGTERM** and a maintenance announcement (Nick: "只是之後要做的一個系統通知").
  Until then, a deploy rolls back players in live runs.
- **A mailbox** for late plunder, overflow, marketplace deliveries or compensation.
- **AFK runs that never end:** an idle kick or a run time limit.
- **Run checkpointing**, to survive a crash without rollback.
- **Hiding consumed items in the village** before the DB confirms them.
- **Reviving stats-service's per-player match stats.** When revived, they must count per player,
  because `match.ended` is per player now (ADR-0040).
- **FS-MCYWK itself:** a dependency, built under its own FS.

## Design notes (from scoping and challenge-me, 2026-11-03)

- **Why the pair and not a new event:** Nick's choice. Per-player events are naturally idempotent
  in character (`(session_id, character_id)`). Stats' per-player stats are a TODO. Notifications
  become one per player per run.
- **Why deterministic ids:** outbox ids were DB-random (`common/outbox/repository.go:31`). A commit
  that errored but did commit, then a retry, would write a second row under a new id, and items
  would store the plunder twice.
- **Why "lite":** these alternatives were rejected with reasons in ADR-0040:
  - checkout refusing until the settlement lands;
  - a run liveness heartbeat;
  - a pod-death detector with `run.abandoned`;
  - applying late settlements to reclaimed items;
  - a checkout diff;
  - holding the player until items confirms.

  The free-potion mechanism is spelled out in ADR-0040 §Context.
- **Why a leave isn't held for the commit (i′):** Nick: "他已經逃離只是卡在結算中 然後重整後還要被
  送回run裏面是不是怪怪的". Under lite, holding the player bought nothing.
- **Crash = rollback:** Nick: "多一瓶水感覺可以當回朔".
- **Copy:** never "離開風險自負 / 可能拿不到". Once pending, delivery is guaranteed (R21).
