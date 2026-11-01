---
id: I-NCC9J-1
status: done
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 1: party state in Redis — create, invite, accept, decline on one pod (game-service)"
---
Implements FS-NCC9J §Requirements R1–R4, R6, R8, R10, R12–R15, R22

**Lane: human (HITL).** Discuss each choice before writing code.

## What to Build

- The party moves from the pod's memory (FS-R82NV's `partyRegistry` maps) to Redis: party record,
  members in join order, open invites as a sorted set scored by expiry, member pointers.
- One Lua script per mutation for this slice: create, invite (reserves a slot: members + open
  invites ≤ size, pruning expired first), accept (consumes the reservation, sets the pointer, voids
  the accepter's other invites), decline. Go keeps the refusal order and copy as pre-checks; a
  script returns a refusal code when its final check fails.
- The party cache: each pod's copy of its players' parties; reads on the hub loop come from it;
  re-read every 10 s; dropped when the pod holds none of a party's members.
- Arrival read: a player seated on the pod gets a full `party_update` read from Redis.
- Redis unreachable → every mutation refused `party_notice` `unavailable` (new code).
- Expiry by the invite's score: no server expiry notice (R12); an accept after expiry → `expired`.
- Single pod only in this slice: fan-out to other pods is slice 3.

## Acceptance Criteria

- [ ] Every existing FS-R82NV same-pod party test passes on the Redis-backed party (regression), apart from the expiry notice R12 removes.
- [ ] Each script is unit-tested on miniredis, including its refusal returns.
- [ ] With size 2 and one open invite, a second invite is refused `party_full`; an accept always fits.
- [ ] Two accepts of the same invite: the second finds nothing.
- [ ] An accept after 60 s is refused `expired`; the slot is free again.
- [ ] A player seated on the pod receives a full `party_update`.
- [ ] With Redis down, create/invite/accept/decline are refused `unavailable`.
- [ ] No Redis call on the hub loop for a party read (reads come from the cache).
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

None

## Spec Reference

FS-NCC9J §Requirements R1–R4, R6, R8, R10, R12–R15, R22; §User Stories 5, 19, 20, 22–24; §Edge States (concurrent, Redis unreachable, unauthorized).

## TDD Approach

- RED: a miniredis test that the invite script refuses a second invite when members + open invites reach the size.
- GREEN: the party key layout and the invite script; then move the registry's create/invite/accept/decline onto the scripts, keeping the existing tests green.

## Implementation notes (agreed with Nick, 2026-11-01)

1. **D1, amended: one runner, in order.** Pre-checks run on the hub loop against the party cache;
   every Redis call (scripts, the arrival read, the 10 s re-read) is queued for one runner
   goroutine per pod, which runs them in the order the loop asked and hands each outcome back to
   the loop. Two actions sent one after the other on a pod reach Redis in that order. A full
   runner (256) answers `unavailable` at once; the loop never waits. (First built as a goroutine
   per action; the kick-then-leave test showed the order was lost, and Nick chose the runner.)
   The `queued` pre-check still reads the Spire queue on the loop, as before; it is not a party
   read.
2. **D2: `internal/partystore` replaces `partypointer`** (deleted). Lua scripts are embedded files
   under `partystore/scripts/`, each prefixed with `lib.lua`. The registry's `partyStore`
   interface is defined in `gameserver/party.go`.
3. **D3: keys all carry the `{party}` hash tag** so scripts stay in one slot in cluster mode:
   `{party}:p:<id>` (hash: leader, created_at, members as JSON in join order),
   `{party}:p:<id>:invites` (zset of invite ids by expiry), `{party}:inv:<invite_id>` (hash:
   party_id, target_id, target_name, expires_at), `{party}:pl:<player_id>` (pointer),
   `{party}:pl:<player_id>:invites` (zset, for voiding on accept).
4. **D4: time comes from Go** (`now` in ARGV, the party clock in tests). Every script prunes
   expired invites from the counts before it counts; an invite's record lives 120 s so a late
   accept is told `expired`. Redis TTLs only collect garbage.
5. **D5: a party lives while some pod holds a member.** Its keys carry a 5-minute TTL, put back
   by the arrival read and the 10 s re-read of every pod holding a member. Shutdown dissolves
   nothing (`dissolveAll` gone; `PartiesDissolved` → `PartiesClosed`). Slice 4 replaces this
   with per-member records.
6. **D6: the slot is reserved before delivery.** The invite script creates the inviter's party if
   they have none and reserves the slot; the leader hears `joined` only once a same-pod invite
   is delivered. An undelivered invite is withdrawn (decline script with no decliner), ending a
   party it created if nothing else has joined or been invited since; `delivery_failed` is sent
   only after the withdrawal ran, so the next invite meets the slot free.
7. **D7: arrival is sampled.** Each tick diffs `SeatedPlayerIDs` (any world) against the last;
   a newly held player is read from Redis and sent a full `party_update` with the new reason
   `sync`. A cached party none of whose members the pod holds is dropped.
8. **D8: a pod without a store refuses every change `unavailable`**; every party test rig runs on
   miniredis.
9. **D9: `party_pod_addr` is still sent** on the invite (the client checks it is a string); drop
   it once I-NCC9J-6 lands.
10. **Pulled forward from slice 2:** leave, kick and transfer already run as scripts (`remove`,
    `transfer`), so the same-pod tests keep passing on the Redis party. Slice 2 is left with
    their fan-out across pods and cross-pod tests.
11. **Superseded tests changed** (FS-NCC9J replaces the FS-R82NV rule they asserted): invite from
    a field (R9), accept in a field / `locked` in a run (R14), create anywhere (R15), no expiry
    notice (R12), no `pod_full` at invite (R10, cross-pod test deleted), Redis key layout (R1),
    shutdown keeps the party (ADR-0036).
12. **Removed as dead:** `Server.InHub`, `Server.HubOccupancy` (only the registry used them).

## Acceptance-criteria walk (2026-11-01)

- Same-pod regression: MET. Every FS-R82NV party test passes on the Redis party, except those
  listed in note 11, which assert rules FS-NCC9J replaces.
- Scripts unit-tested on miniredis with refusals: MET (`internal/partystore/redis_test.go`).
- Size 2 + one open invite → `party_full`; an accept always fits: MET
  (`TestInvite_OpenInviteHoldsAPlace_SecondRefusedFull`, `TestInvite_Racing_NeverOverfills`,
  `TestPartyInvite_Refusals_InOrder`).
- Two accepts of one invite, the second finds nothing: MET (`TestAccept_SameInviteTwice_SecondFindsNothing`).
- Accept after 60 s → `expired`, slot free: MET (`TestAccept_AfterTheMinute_ExpiredAndTheSlotFree`,
  `TestPartyInvite_Unanswered_ExpiresAtSixtySeconds`).
- Seated player gets a full `party_update`: MET (`TestPartyArrival_SeatedPlayerGetsTheirParty`).
- Redis down → create/invite/accept/decline `unavailable`: MET
  (`TestParty_RedisUnreachable_ChangesRefusedUnavailable`).
- No Redis call on the hub loop for a party read: MET by construction (every store call goes
  through the runner; reads come from the cache), shown by
  `TestParty_RedisUnreachable_ReadsComeFromTheCache`.
- `go test -race` on touched party tests: MET (partystore; gameserver `TestParty|TestPresence|TestPodInbox`).

## Open after this slice

- `party_update` does not carry `reserved` or real `online` yet (R21: slices 3, 4).
- Updates reach only members this pod holds; cross-pod fan-out is slice 3. The decline's notice
  still travels back via the remembered `remoteInvites` pod, not the presence index.
- Presence still covers the hub only (R7 is slice 3), so a same-pod target in a field is
  `not_found`.

## Code review (2026-11-01): fixed

Standards and Spec axes, run by two independent reviewers on the uncommitted diff.

- **HIGH (both axes): a failed arrival read was never retried.** The player was marked held before
  the read came back, so a Redis blip or a full runner left their party out of the cache for their
  whole stay, and, with no pod keeping it alive, the party could lapse while they were online. Now
  a player is marked arrived only once a read succeeds; a failed one is read again next tick, and
  the cache's let-go rule looks at who is seated this tick. `TestPartyArrival_FailedReadRetried`.
- **MED: the 10 s re-read made one round trip per party under one 2 s deadline.** Now one script
  (`refresh.lua`, `RefreshAll`) reads every cached party in one trip. Writing its test found a
  latent bug: an open invite whose record had lapsed (the caller's clock behind Redis's) broke the
  read; `prune` and the snapshot now drop such entries.
  `TestRefreshAll_*`, `TestInvite_LapsedInviteRecord_FreesItsPlace`.
- **MED: a cross-pod decline forgot where the invite came from before Redis answered.** It is now
  forgotten only once the decline lands. `TestPartyDecline_CrossPod_RetriedAfterRedisBlip`.
- **MED: the withdrawal's outcome was dropped and the cache changed before Redis confirmed.** The
  cache now follows what Redis did; a party a failed withdrawal leaves standing is shown to its
  leader after the `delivery_failed` notice. `TestPartyInvite_UndeliveredAndNotWithdrawn_PartyKept`.
- **MED (language): "party pod"** (retired by ADR-0036) renamed `inviterPod`; the inbox letter field
  is now `inviter_pod_id`.

## Code review (2026-11-01): open

- **MED (SRP): `partyRegistry` owns the runner, the cache, the refusal rules, the wire shapes and
  the letter protocol.** Left for I-NCC9J-3, which already plans to split out the cross-pod part.
- **LOW:** `Withdraw`/`decline.lua` and `RemoveArgs.Kicker` switch behaviour by flag or zero value;
  `close()` drops calls already queued in the runner; scripts touch undeclared keys (safe only
  through the `{party}` tag); `read.lua` returns a code outside `Refusal`; CONTEXT.md lacks
  "withdraw" and the code says `Reservation` for *reserved slot*; a presence-lookup error answers
  `delivery_failed` rather than `unavailable` (pre-existing); `accept.lua` checks `expired` before
  `party_gone` (R14 lists them the other way); the party hash has no settings slot yet (FS-V780R);
  today's client has no copy for `unavailable` and still words `expired` as the leader's line
  (fixed by I-NCC9J-6).
