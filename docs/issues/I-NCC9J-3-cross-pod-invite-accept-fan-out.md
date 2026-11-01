---
id: I-NCC9J-3
status: in-progress
implements: FS-NCC9J
blocked_by: [I-NCC9J-1]
labels: [ready-for-agent]
title: "FS-NCC9J slice 3: invites and accepts anywhere, fan-out to every member's pod (game-service)"
---
Implements FS-NCC9J §Requirements R5, R7, R9–R11, R13, R14, R21

**Lane: human (HITL).**

## What to Build

- Presence widens to every connected player with a character: hashes gain `name` and `world`
  (`hub` | `field` | `run`); sampled on the tick as FS-R82NV slice 3 does, kept while a player is
  held in the reconnect grace.
- Invites from and to any world; delivery through the target pod's inbox in whatever world they
  stand.
- Accept in place on any pod, no handoff; inside a run refused `locked` (until FS-BJNYC).
- Fan-out: after each mutation, a `party_update` letter to every member's pod (looked up in
  presence); the receiving pod updates its cache and delivers it.
- `party_update` gains `reserved: [{name, expires_at}]` and each member's `online`.
- Close the FS-R82NV slice 3 code review items carried in I-R82NV-3 (writer ordering behind the
  backlog, the god-object split into a cross-pod courier with the work queue on the hub, writer
  drain at shutdown, `queued` re-check, failure notices not dropped, test gaps).

## Acceptance Criteria

- [ ] A player on pod A invites a player in a field on pod B; B shows the prompt; accepting there makes them a member with no `world_handoff`; both get `party_update` with two members.
- [ ] An accept inside a run is refused `locked`; an invite to someone in a party → `already_in_party`, from any pod.
- [ ] R10's refusal order holds under a table-driven test with cross-pod rows.
- [ ] Every member, on every pod, receives `reserved` entries; decline and expiry remove them.
- [ ] Presence holds players in fields and runs with `world`; keys vanish on leaving and lapse within 30 s of a pod stopping.
- [ ] The I-R82NV-3 review items listed above are closed or explicitly re-deferred.
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-1

## Spec Reference

FS-NCC9J §Requirements R5, R7, R9–R11, R13, R14, R21; §User Stories 1–6, 18; §Edge States (invitee joins another party first, a letter dropped, unauthorized).

## TDD Approach

- RED: the two-pod harness (`party_crosspod_test.go`): a player in pod B's Meadows receives an invite from pod A.
- GREEN: presence for every world, then delivery outside the hub, then accept in place.

## Decided after slicing (2026-11-01)

- **`party_update` carries each member's `pod_id`** (FS-NCC9J R21, amended): the pod holding them,
  read from the presence index when the update is built; empty with no presence entry. Nick's
  choice over a per-recipient `same_pod` flag; I-NCC9J-8 compares the leader's with the player's
  own. Note it breaks the earlier rule that pod ids stay between pods (the cross-pod test asserting
  the invite payload carries none still holds: this is party_update, not the invite).
- **`reserved` and the update on every invite change (R21) are this slice's**: until it lands the
  client's skeleton rows (I-NCC9J-7) never show, as Nick saw in the browser.

## Implementation notes (agreed with Nick, 2026-11-01)

- **E1, split first (6e84410, no behaviour change):** `partyRunner` (the FIFO runner, `onRunner`),
  `partyCache` (cache, arrival read, re-read), `partyCourier` (letters), and `loopJobs`, the queue
  of work handed back to the loop, now owned by the hub. The registry keeps the rules.
- **E2, presence covers every world:** the keeper samples `Server.PresentPlayers()` (every record
  with a character, connected or within the reconnect grace, not a delver kept only for
  settlement); both hashes hold `{player_id, name, pod_id, world}`; a change of world reseats.
  `HubSeatedPlayers` removed.
- **E3, fan-out:** after a change the registry `announce`s it: one presence lookup
  (`LookupIDs`, pipelined) through the runner, then this pod's recipients are told directly and
  every other pod holding one gets one `party_update` letter carrying the party, which updates its
  cache too. *Deviation from the plan:* the lookup is its own runner job queued right after the
  script's, not inside it; the FIFO runner keeps announcements in the order of the changes.
- **E4, notices across pods:** a `party_notice` letter; `noticeAnywhere` tries this pod, then the
  presence index. `remoteInvites`, the reply letter and `inviter_pod_id` are gone: a decline's
  notice goes to whoever leads now, wherever they stand.
- **E5, no update on expiry:** new reasons `invited` (a slot reserved) and `invite_ended` (declined,
  voided by an accept elsewhere, withdrawn). An expired slot leaves the next update (the cache
  filters by `expires_at`); the client drops the row by `expires_at` itself.
- **E6:** members carry `pod_id` (Nick, R21 amended) and `where` = the presence world (`hub`,
  `field`, `run`); `online` stays true until slice 4. The client's `partyWhereLabel` needs
  `"field"` → "afield" (noted on I-NCC9J-8).
- **E8:** a target this pod holds is answered here in any world (`Server.HeldPlayer`, replacing
  `HubSeatedPlayer`).
- The accept script now returns each voided invite's party, so its members hear the slot go.

## Carried review items (I-R82NV-3): closed

- Writer `queue()` overtaking a deferred delete: a refresh now joins the backlog while it holds
  anything. `TestOrderedWriter_RefreshQueuesBehindTheBacklog` (seen RED).
- God object: split (E1).
- Writer drain at shutdown: a stopping writer runs what is still queued within 2 s, and
  `leaveAll` runs the backlog the last tick could not flush. `TestOrderedWriter_DrainsTheQueueAsItStops` (seen RED).
- `queued` not re-checked after a lookup: re-checked. `TestPartyInvite_CrossPod_QueuedDuringLookup_Refused` (seen RED).
- Failure notices dropped under load: an undelivered invite's failure now waits for room on the
  loop. `TestPartyCourier_FailedInvite_WaitsForTheLoop` (RED at compile only).
- Test gaps: inbox letter consumption `TestPodInbox_LettersReachTheLoopBadOnesSkipped`; "field
  not_found" is obsolete (a field target is now reached).
- Same-pod `already_in_party` ignoring pointers: closed by I-NCC9J-1 (state in Redis).

## Acceptance-criteria walk (2026-11-01)

- A on pod A invites a player in a field on pod B; prompt on B; accept there, no handoff; both get
  two members: MET (`TestPartyAccept_CrossPod_InAField_BothGetTheParty`).
- Accept in a run → `locked`; invite to someone in a party → `already_in_party`, from any pod: MET
  (`TestPartyAccept_CrossPod_InARun_Locked`, `TestPartyAccept_Refusals`,
  `TestPartyInvite_CrossPod_TargetInAPartyThere`).
- R10's order with cross-pod rows: MET (`TestPartyInvite_CrossPod_Refusals_InOrder`; passed on
  first run, the order already held).
- Every member on every pod gets `reserved`; decline removes it: MET
  (`TestPartyReserved_CrossPod_EveryMemberSeesTheSlot`). Expiry: by E5, no server update; the slot
  leaves the next update and the client drops it at `expires_at`.
- Presence holds fields and runs with `world`; keys go on leaving and lapse within 30 s: MET
  (`TestPresence_FollowsThePlayerAcrossWorlds`, `TestPresence_HoldsPlayersInARun`,
  `TestPresence_LapsesWithoutRefreshAndGoesAtShutdown`).
- I-R82NV-3 review items closed or re-deferred: MET (above; none re-deferred).
- `-race` on touched party tests: MET (partystore, partypresence, gameserver party/presence/inbox/writer).

## Open after this slice

- `online` is always true (slice 4).
- A `party_update` letter that fails to publish is only logged: that pod's cache catches up on its
  10 s re-read, its players on the next update.
- A member seated on a pod less than a tick ago may not be in presence yet and so miss one update;
  the arrival read sends them the whole party.

## Code review (2026-11-01): fixed

Standards and Spec axes, two independent reviewers, on `1dde588..` plus the uncommitted work.

- **HIGH (Standards): letters carried no version; an older one arriving late overwrote the cache
  and players' frames, and a lost letter left frames stale for good.** Every script now moves the
  party's `version` on by one (`bump` in lib.lua). The cache refuses an older party; an older
  letter is dropped whole; a local update older than the cache is not told. The cache records the
  newest version its members have been told; the 10 s re-read sends a `sync` to the members here
  when Redis holds a newer one, so a lost letter, a failed lookup or a skipped update costs at most
  ten seconds. `TestVersion_*`, `TestPartyLetter_OlderThanTheCache_Dropped`,
  `TestPartyRefresh_NewerParty_MembersHereTold` (RED at compile only).
- **MED (Standards): a full runner delivered locally at once, overtaking queued updates.** Now it
  delivers nothing; the re-read tells them.
- **MED (Standards): the new `queued` re-check read Redis on the hub loop.** It is read with the
  presence lookup, off the loop (`lookedUp`).
- **MED (Spec, R10): a target on another pod could get `pending` before `already_in_party`.** For
  such a target only `already_in_party` is pre-checked; `pending` is left to the script.
  New row in `TestPartyInvite_CrossPod_Refusals_InOrder` (written after the fix; seen failing
  `pending` against the old logic).
- **MED (Spec, AC 4): no test that an expired slot leaves the next update.**
  `TestPartyReserved_ExpiredSlotLeavesTheNextUpdate`.
- **MED (Standards): routing in the registry.** The courier's `tell` and `noticeAt` now decide
  direct versus by letter, and which pod; the registry decides what to say and to whom.
- **MED (Standards, language):** `partyNews` → `partyUpdate`; `HeldPlayer` → `SeatedPlayer`;
  CONTEXT.md now defines *seated* / *present* and the three letters.
- **MED (Standards): the letter's party had no JSON tags.** `partystore.Party`, `Member` and
  `Reservation` carry fixed JSON names; the letter is the typed `partyUpdateLetter`.
- **LOW (Spec): cross-pod voiding untested.** `TestPartyAccept_CrossPod_VoidsAnInviteFromAnotherPod`.
- **LOW (Spec): FS R21 still promised an expiry update.** Amended (E5, the two reasons).
- **LOW (Standards):** the cache takes a two-method `partyReader`; the courier's `onUpdate` and the
  cache's callbacks are passed in at construction; `leaveAll` has separate budgets for waiting and
  for unseating; refresh writes no longer grow the writer's backlog past the queue's size
  (`TestOrderedWriter_BacklogDoesNotGrowWithoutBound`, written after the fix); deletes still wait in
  it unbounded, by design (never dropped). *(Corrected in round 2: round 1 said "bounded".)*

## Code review (2026-11-01): open

- **LOW:** after a successful withdraw, `invite_ended` is told only if this pod still caches the
  party (the store's `Withdraw` returns no snapshot); members elsewhere see the row go at its
  expiry or the next re-read.
- **LOW:** the ended party's final update carries `leader_id` = the removed player (as since
  FS-R82NV); `withdraw(…, formed bool, …)` remains a flag argument.
- **LOW (Spec):** `where` is `field` (or empty with no presence entry) until I-NCC9J-8 teaches the
  client the label.
- **LOW (Spec):** under heavy machine load the party tests can time out under `-race`; they pass
  on a quiet machine.

## Code review round 2 (2026-11-01): fixed

Both axes again, on the same scope; round 1's fixes held except the two noted below.

- **HIGH (both axes, introduced by round 1's version gate): an update to one player was gated by
  version too**, so a removed player's final update or an arrival sync could be dropped when a
  newer letter landed first, and nothing later reaches them. Updates addressed to one player (`to`)
  are now told whatever their age, on this pod and by letter; when the runner is behind they are
  still told here. `TestPartyUpdate_ToOnePlayer_NotDroppedAsOlder` (seen RED).
- **MED (both axes): a whole letter marked the party told to every member here**, though only its
  `To` were told (a member the sender's presence lookup missed), and a failed direct send also
  marked it. The party is marked told only when every member present here was told.
  `TestPartyLetter_MissingAMemberHere_NotMarkedTold` (seen RED).
- **MED (Standards): a decline left the cache at the old version**, so a late letter could bring
  the slot back. Decline and withdraw now put the party as Redis left it; `Withdraw` returns it
  (`partystore.WithdrawResult`), which also closes round 1's open item: `invite_ended` after a
  withdrawal is told even when this pod no longer caches the party.
  `TestPartyDecline_CacheTakesTheNewVersion` (seen RED).
- **LOW (Spec): R21 said `invited` for every reserved slot**; an invite that creates the party
  sends `joined` (FS-R82NV). R21 reworded.
- **LOW (Spec): no test of `where` / `pod_id` values.** `TestPartyAccept_CrossPod_InAField_BothGetTheParty`
  now asserts `field`/`hub` and the pods; `TestPartyUpdate_CrossPod_MemberPresentNowhere_NoPodNoWorld`.
- **LOW (Standards):** `party_news.go` → `party_updates.go`, `invitedNews` → `invitedUpdate`;
  `partyUpdateLetter.Whole`'s comment said the opposite of what it means.
- **LOW (Standards, pre-existing): the cross-pod invite's lookup ran on its own goroutine**, outside
  the runner's order. It now runs on the runner.
- Removed as dead: `partyCache.forgetReservation`.

## Re-deferred (round 2)

- **The first `queued` pre-check of invite, accept and create still reads the Spire queue on the
  hub loop** (bounded at 2 s), as since FS-R82NV. Moving it off the loop means reordering R10's
  checks (party_full, self and not_found are answered on the loop before it), so it waits for its
  own change. Nick agreed 2026-11-01.

## Code review round 3 (2026-11-01, narrow): fixed

Rounds 1 and 2 patched the version handling case by case, and each round's patch let a new case
through. Round 3 replaced the patches with one rule, applied on every path:

> **A member is never shown a party older than the newest this pod knows.** The one exception is
> a removed player's final update, since they are in no newer party.

- **HIGH (Standards, introduced by round 2): an arrival sync was told whatever its age**, so a
  newer letter could land first and the older read then overwrite what the member saw, with
  `told` already past it. `deliver` now sends an update addressed to one member as the newest
  cached party when the cache is newer; only a non-member (the removed player) gets the update as
  built. `TestPartySync_OlderThanTheCache_SendsTheNewest` (seen RED).
- **MED (Standards): the re-read and the arrival read handed on the party they read**, not the
  newest the cache held. Both now hand on the cache's newest.
- **LOW (Standards):** `resync` marks the party told only if every member here was told;
  `markTold` records only parties the cache keeps (no growing map); a failed withdrawal's
  `delivery_failed` finds the leader from the party Redis returned, not the cache.
- **LOW (Spec):** R21 now states `pod_id` and `where` and their sources, that a member present
  nowhere is told nothing, and every reason (`party_create` included). Tests: the offline-member
  test waits for the accept to fan out and has a positive control for `where`; the refusal table
  takes an explicit `size` per row; two over-broad comments narrowed.

Flake check: the cross-pod and version tests pass 5 runs out of 5 without `-race` at load
average ~20, and once under `-race`. Under `-race -count=5` with load 9→26 they time out widely
(3–48 s per test against ~0.05 s): the fixed 2–3 s waits, not the logic.

## Code review round 4 (2026-11-01): fixed so far

- **HIGH (Standards, the round-3 exception): a kicked player could be shown the party again.**
  Round 3 told the final update apart from a sync by who it was for ("not a member of the newest
  party"). A player kicked while their arrival read was in flight is not a member either, so their
  older sync went out as built and put them back in the party on screen, with `told` already past
  the kick. The final update is now marked (`partyUpdate.final`, `partyUpdateLetter.Final`), set
  only by `removed`; `deliver` sends any other one-player update as the newest cached party (which
  drops the party on the screen of a player removed since), and `heardUpdate` drops every older
  letter but a final one. `TestPartySync_RecipientKickedSince_NotShownTheOldParty` (seen RED),
  `TestPartyLetter_OlderThanTheCache_OnlyAFinalUpdateTold`.

Still open from round 4: a removed player whose final letter is lost is never repaired (MED);
LOWs (sync repeated during the reconnect grace, a duplicate first sync, empty `where`/`pod_id` on
resync and degraded paths); Spec MEDs (R21 lacks `sync`; the empty `pod_id`/`where`). Per-player
reconciliation is the candidate fix for the lost-letter MED; not decided.

## Decided after round 4 (with Nick, 2026-11-01): each pod reconciles what its players see

The lost-letter MED: a removed player whose final letter is lost keeps the party on screen for as
long as they stay connected, because the re-read resyncs only the party's members and they are no
longer one. pub/sub is at most once and an acknowledged transport would not close it either (a
letter to the wrong pod, a publisher that dies between the script and the publish, a send to the
socket that fails), so the repair is by state, not by redelivery, as ADR-0036 already says ("a
periodic re-read corrects any missed letter"). The pod holding a player is the only one that can
repair their screen: it holds their socket and re-reads their party anyway.

- **What each player was shown.** The pod records, per player it holds, the last `party_update`
  written to their socket: a party and its version, or no party (an update that does not list
  them). Recorded once the update is queued for them, keyed by the connection: a new connection is a
  player whose screen is unknown. Dropped on the tick that finds the connection gone, however the
  player left.
- **Arrival always sends.** A player newly seated is read from Redis and sent their party, or a
  `party_update` with no members when they have none: a reconnect that keeps the page (and its
  party store) is corrected too. Only a read that succeeds sends.
- **Reconcile after every re-read.** Once the 10 s re-read has brought the cache level with Redis,
  every player seated here is checked: what the cache says they are in against what they were
  shown. A different party, a newer version, or a party they are no longer in is sent; the same is
  not. In memory, no extra Redis call.
- **Out of this step:** `told`, `final` and the delivery rules stay as they are; the record is a
  safety net under them. Replacing them with a check against the record before each send is a
  later step, to weigh when FS-MCYWK or I-NCC9J-4 touch delivery.

Rejected: an acknowledged transport (Redis Streams, RabbitMQ), for the cases above; diffing the
cache's old and new versions, which misses a removal the cache learnt from another letter; client
polling, which works but adds a protocol action for what the pod can see itself. B ("repair only
when the player acts") was weighed and superseded by this.

### Built (2026-11-01)

- `Server.SeatedConns()` (player → connection) replaces `SeatedPlayerIDs` in `partyDirectory`; the
  cache's `arrived` records the connection, so a new connection is read afresh.
- `partyCache.shown` (`shownParty`: connection, party, version), written by `saw` after every
  party_update queued for a player here (deliver, a letter); forgotten on the tick that finds the
  player's connection gone or changed.
- One way to resend: the cache hands `partyView`s (a player and their party, or none) to
  `partyRegistry.show`, which builds `sync` items, or `noPartyUpdate` for a player in no party
  (lists nobody; `party_id`/`leader_id` empty via `idOrEmpty`), and sends them through
  `announce` like any update, so members elsewhere get their pod and world.
- Arrival always shows the player their party, or none. `reconcile` runs after every re-read, and
  at once when nothing is cached, and resends whoever's record (`showing`) differs from the cache.
- Every sync is checked again in `deliver` as it goes out (`partyRegistry.current`): it is sent
  only if the cache still holds its party at the version it was built from and the player's
  record does not already show it; a sync overtaken by a change is dropped, the change telling the
  player itself (or the next reconcile). The update listing nobody goes only to a player held
  here, never as a letter. With the runner behind, only removed players' final updates go out at
  once; syncs and whole updates wait for the next reconcile.
- Removed (from the committed code): `told`, `markTold`, `everyMemberHereTold`,
  `resync`/`onNewer`, and the letter's `Whole` flag. The reconcile is the only resend.
- Tests (`party_reconcile_test.go`): arrival with no party; a removed member whose letter was lost;
  a party gone from Redis with no letter; a quiet re-read sends nothing (the re-read checked to
  have run); a reconnect between ticks is read again; a reconcile sync names a remote member's pod
  and world; a re-read landing while a kick is still being told leaves it to the kick; a sync whose
  party ended while it waited is sent as no party. Each was seen failing: RED before the code, or
  with the piece it covers taken out (the reconcile send, the presence lookup, the check against
  the record as a sync goes out, the ended-party check). `TestPartyLetter_MissingAMemberHere_NotMarkedTold` became
  `..._ShownAtTheNextReRead` (behaviour, not `told`).
- FS-NCC9J: R6 (the empty update, a new connection read again), R21 (`sync`, the empty update),
  R21a (reconcile), the lost-letter edge state. CONTEXT.md: shown party, a new connection read
  afresh.

Closes round 4's lost-letter MED, its Spec MED "R21 lacks `sync`", and both duplicate-send LOWs
(the per-party `told` is gone). Empty `where`/`pod_id` remains only on the degraded paths (presence
unreadable, runner behind), as for every update. `TestHandleWebSocketConnection_HandoffRefusals/run_has_ended`
flakes about 1–3 runs in 20 under load, on the previous commit too, with no party store in that
test: not this change.

## Code review round 5 (2026-11-01): fixed

Both axes on the reconcile above. Spec: ready (the empty update matches R21/R6; the client takes it
and lets the party go). Standards: needs changes, all fixed:

- **MED (Standards and Spec): the reconcile sync left remote members' `pod_id`/`where` empty** (no
  presence lookup) and recorded that as shown, so nothing corrected it. `show` now goes through
  `announce`.
- **MED (Standards): a re-read landing between a change and its update** synced the same party
  first, a duplicate. The reconcile now waits behind one empty runner job.
- **MED (Standards): two records of staleness** (`told` per party, `shown` per player). `told` and
  `resync` removed; the reconcile is the only resend.
- **LOW:** the `in bool` hooks and `ended bool` on `saw` folded into `partyView` and one `onShow`;
  the hand-built empty payload replaced by `noPartyUpdate` through `updateMessage`; the `Seats`
  comment no longer claims two connections per player; R21a says "queued for", lists "no record",
  and names the reconcile as the only resend; the tests check the empty update's fields and that
  the quiet re-read ran.
- **Not changed (LOW, DIP):** `Seats()` returns `*websocket.Conn` to the cache, which only compares
  it; the cache is package-internal and the hub owns connections.

## Code review round 6 (2026-11-01): fixed

Both axes again. Spec: ready. Standards: needs changes, fixed:

- **MED: a sync for a party that ended while it waited went out** (the version gate read "not
  cached" as "not newer"). `current` sends the update listing nobody instead.
- **MED: the empty runner job did not stop every duplicate** (a write already on the runner had its
  update queued behind it). Replaced: every sync is checked against the player's record as it goes
  out, which happens after everything queued before it; the empty job is gone.
- **MED (ubiquitous language): "seat" already means a place in a run** (FS-K2HKP). Renamed
  `Seats()` → `SeatedConns()`, the cache field `seats` → `conns`; CONTEXT.md no longer defines seat
  as a connection.
- **LOW:** the update listing nobody is never sent as a letter (a zero-id letter was rejected and
  logged); `reconcile` uses `showing` instead of a switch with an empty case; R21 says "a `sync`
  listing no members" (the ended party's final update lists none but carries its id); the issue's
  removed list names only committed code; test and decision wording says "queued".
- **Not changed (LOW):** `*websocket.Conn` in the cache (DIP, as in round 5); the shown record as
  its own type (SRP), for when FS-MCYWK or I-NCC9J-4 next touch it; a seated player missing from
  `PresentPlayers` (awaiting settlement) is resent to on each re-read until present, one presence
  lookup each time.

## Code review round 7 (2026-11-02): fixed

Spec: ready. Standards: one MED, fixed with the Spec LOWs; the rest left, as LOW, for when
FS-MCYWK or I-NCC9J-4 next touch delivery.

- **MED (Standards): a sync moved up to the newest version could overtake that version's own
  update.** With write, re-read, write queued in that order, the reconcile's sync went out as the
  second write's version, then that write's update told it again. `current` now drops a sync whose
  party has moved on instead of moving it up; the round 6 "party ended → no party" branch goes with
  it. `TestPartyRefresh_BetweenTwoChanges_SyncsOvertakenNotSent` (fails when the sync is moved up
  instead); `TestPartySync_OlderThanTheCache_...` and `TestPartySync_PartyEndedWhileItWaited_...`
  now expect the sync not to be sent.
- **LOW (Standards):** the sync check is keyed on a one-player, non-final update, not on the reason.
- **LOW (Spec): with the runner behind, a sync went out with no presence data and was recorded.**
  That path now sends only final updates; the next reconcile tells everyone else.
- **LOW (Spec):** "seat" for a connection left in a test comment and here; reworded.
- **Left (LOW):** `ended` doubling as "no party for this player"; `*websocket.Conn` in the cache;
  the shown record and its rule as their own type; reconcile skipped on a failed re-read while it
  runs with nothing cached; `saw`/`conns` naming; a seated player not yet present resent each
  re-read; no test of a letter recorded so the next reconcile stays quiet.
