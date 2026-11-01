---
id: I-R82NV-3
status: in-progress
implements: FS-R82NV
blocked_by: [I-R82NV-1]
labels: [ready-for-agent]
title: "FS-R82NV slice 3: presence index, pod inbox, invite and decline across pods (game-service)"
---
Implements FS-R82NV §Requirements R7, R9, R10, R12 (lookup), R13, R15

**Lane: human (HITL).**

## What to Build

- **Presence index:** `presence:name:<lower(name)>` → `{player_id, pod_id}` written when a player
  is seated in the hub, refreshed every 10 s (TTL 30 s), deleted when they leave the hub for any
  reason. Invite lookup switches from "this pod's hub" to the index; a UUID target reads the
  same key family by id (or a sibling key — decide in the slice).
- **Pod inbox:** subscribe at boot to `pod:<podID>:inbox` on the chat bus's subscriber path
  (buffered channel into the hub loop, resubscribe after 1 s). JSON `{kind, to_player_id,
  payload}`. Publish through the existing publisher goroutine with the 2 s timeout.
- Cross-pod `party_invite` delivered via the target pod's inbox; `party_reply {declined}` back
  to the party pod's inbox → `declined` to the inviter.
- A message for a player this pod does not hold is dropped with a Debug log; a publish failure
  notices `delivery_failed` to the inviter.

## Acceptance Criteria

- [ ] Two-pod miniredis test: invite from pod A reaches a hub-seated player on pod B as a `party_invite` message.
- [ ] Decline on B notices `declined` on A.
- [ ] A player in a field or run has no presence key → `not_found`.
- [ ] Presence keys appear on hub seating, vanish on leaving the hub, and expire within 30 s of a pod stopping its refresh.
- [ ] Inbox message for an absent player is dropped (Debug); a failed publish notices `delivery_failed`.

## Blocked By

I-R82NV-1

## Spec Reference

FS-R82NV §Requirements R7, R9, R10, R12, R13, R15; §User Stories 1, 2, 23, 24; §Edge States (invitee in a field/run, target pod dies after delivery).

## TDD Approach

- RED: the `twoPods` harness from `chat_world_test.go`, A invites B's name, B's connection receives `party_invite`.
- GREEN: presence writes on hub seating, the inbox subscription, and the publish.

## Carried from code review (2026-11-01, I-R82NV-2)

- The pointer writer drops a write when its 256-slot queue is full. A dropped `Point` comes back
  at the next refresh, but a dropped `ForgetPlayers` / `ForgetParty` is never retried: the pointer
  lingers up to 30 s. Harmless on one pod; once this slice reads pointers across pods, a stale
  pointer can refuse `already_in_party` or skip `party_gone`. Decide here whether deletes must
  never be dropped (e.g. retried, or a separate path).

## Implementation notes (agreed with Nick, 2026-11-01)

1. **Presence is sampled, not hooked**: the hub loop's one-second tick diffs who is seated in
   this pod's hub against the last sample (seat the new, unseat the gone) and refreshes all every
   10 s. A seat is at most a second late. Keys are Redis hashes (`player_id`, `pod_id` /
   `name`, `pod_id`), and unseating is conditional (a Lua compare-and-delete on `pod_id`), so a
   player handed to another pod and seated there keeps that pod's key. A pod shutting down
   gracefully unseats everyone; a dead pod's seats lapse in 30 s.
2. **Cross-pod lookups run off the hub loop**: the inviter's standing and R12's head (not_in_hub,
   not_leader, queued, party_full, self) are checked on the loop; a target seated in this hub is
   answered at once; anyone else is looked up (presence, then `PartyPodOf` through the pointers
   and `pod:alive`) on a goroutine, and the answer finishes the invite back on the loop, with
   the inviter's standing checked again. A lookup error notices `delivery_failed`.
3. **UUID targets** read a sibling key `presence:id:<uuid>` written with the name key.
4. **The inbox shares the chat bus's Redis client and its shape** (subscriber that resubscribes
   after 1 s, publisher with a 2 s timeout) but runs its **own** goroutines: R9/R10 say "the same
   publisher goroutine"; chat and party no longer hold each other up.
5. **Letters carry `party_pod_id`** (between pods only, stripped before the client sees the
   invite); the target's pod remembers each delivered invite for its minute and sends a
   decline back to that pod as `party_reply {invite_id, declined: true}`.
6. **Deletes are never dropped**: the pointer writer became the pod's one `orderedWriter`, shared
   with presence; a delete the full queue cannot take waits in a backlog flushed each tick, in
   order. A Redis error on a delete still relies on the 30 s TTL.

Also:
- `pod_full` counts this hub's occupancy (new `Session.Occupancy`, the count the cap is held to)
  plus open invites to players on other pods.
- A cross-pod invite forms the inviter's party before the letter is published; if publishing
  fails, the invite is dropped (`delivery_failed`) but the party of one stays, as one made by
  `party_create` would.
- `sent` is noticed when the letter is queued; `delivery_failed` follows if it is not published.
  A letter published but dropped by the target pod (player gone) just expires at 60 s.
- Accepting a cross-pod invite on the target's pod does nothing yet: that is slice 4.
- Production wiring: `config/routes.go` adds `WithPresence` and `WithPodInbox` on the pod's Redis.

## Carried into FS-NCC9J (2026-11-01)

ADR-0036 superseded ADR-0034 after this slice was built: party state moves to Redis and
membership spans pods. This slice is committed as is, on feat/party-formation, to carry into
FS-NCC9J: the presence keeper (to widen to every connected player), the pod inbox, the ordered
Redis writer, `partypresence` and `partypointer.PartyPodOf`. Its code review (2026-11-01) left
these open, to be settled in FS-NCC9J's slices rather than here:

- writer ordering: `queue()` can overtake a deferred delete (both reviewers, MED);
- the same-pod path ignores pointers for `already_in_party` (closes once state is in Redis);
- `partyRegistry` has become a god object: split the cross-pod courier, move the work queue to
  the hub;
- writer drain at shutdown; the target pod delivering an invite outside the hub; `queued` not
  re-checked after a lookup; failure notices dropped under load; test gaps (field not_found,
  inbox letter consumption); smaller LOWs.

