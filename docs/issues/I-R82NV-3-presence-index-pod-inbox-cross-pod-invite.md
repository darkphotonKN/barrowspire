---
id: I-R82NV-3
status: open
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
