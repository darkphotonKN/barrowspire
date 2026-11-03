---
id: I-KCQ06-2
status: done
implements: FS-KCQ06
blocked_by: [I-KCQ06-1]
labels: [ready-for-agent]
title: "FS-KCQ06 slice 2: whisper to another pod by one whisper letter in its inbox; echo only when handed off (game-service)"
---
Implements FS-KCQ06 §Requirements B8, B9

**Lane: human (HITL), authorised by Nick's charter "私訊" on 2026-11-03.** `/develop` may run this slice.

## What to Build

When the presence lookup finds the target on **another pod**, the sender's pod sends **one**
letter to that pod's inbox: `letter{Kind: "whisper", ToPlayerID: <target>, Payload: <the
stamped line>}`. `letterWhisper` is a new kind next to `letterPartyChat` in `inbox.go`, sent
through `podInbox.send`.

- **Echo:** the sender gets the stamped line only once the letter has been handed to the inbox
  publisher. If the inbox `failed` callback fires (publisher behind, or the pod reaches no other
  pod), there is no echo and the sender gets `not_online`.
- **Receiving pod:** the hub loop's letter dispatch hands a `whisper` letter to the addressee if
  they are seated on this pod in a world, as an outbound `chat` message. Otherwise it drops the
  letter with a Debug line, consulting nothing else (as `heardPartyChat` does).
- No other pod receives anything, and there is no ack back.

This replaces I-KCQ06-1's interim "another pod → `not_online`".

Likely files: `internal/gameserver/inbox.go` (the kind), `chat_whisper.go` (send and receive),
the hub loop's letter dispatch (wherever `letterPartyChat` is routed), and tests (`inbox_test.go`
and `chat_party_test.go` style, with a fake inbox bus between two pods).

## Acceptance Criteria

- [ ] A whisper to a player seated on pod B, sent from pod A, publishes exactly one `whisper` letter to `pod:B:inbox`, and no other inbox gets anything.
- [ ] Pod B delivers it to the target as `channel: "whisper"` with `target_id` and `target_name`, and pod A echoes it to the sender.
- [ ] An inbox send that fails gives the sender `not_online` and no echo, including a letter no pod is subscribed to (R8a).
- [ ] A `whisper` letter for a player not seated on the receiving pod is dropped with a Debug line.
- [ ] Tests pass.

## Blocked By

I-KCQ06-1

## Spec Reference

FS-KCQ06 §Requirements B8, B9; §Edge States (target changes pod, pod crashed, publisher behind); User Stories 2, 18, 19; Acceptance Criteria rows 2, 11, 12.

## TDD Approach

- RED: two pods share a fake inbox bus. A whisper from A's player to B's player arrives at B's player and echoes to A's player, and exactly one letter is published.
- GREEN: `letterWhisper`, send on the found-elsewhere path, and receive in the letter dispatch.
