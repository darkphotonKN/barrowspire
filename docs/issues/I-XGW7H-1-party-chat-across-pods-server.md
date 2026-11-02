---
id: I-XGW7H-1
status: open
implements: FS-XGW7H
blocked_by: []
labels: [ready-for-agent]
title: "FS-XGW7H slice 1: party chat relayed to every member on any pod, party_chat letter, no_party notice (game-service)"
---
Implements FS-XGW7H §Requirements A1–A6, B7–B17, §D Wire contract

**Lane: human (HITL), authorised by Nick's charter on 2026-11-02.** `/develop` may run this slice.
Nick, verbatim: "用b 照charter跑". Runs in parallel with I-XGW7H-2 against the wire below.

## What to Build

- **Open `party` in the relay (A1).** `chatRelay.relay` stops refusing `channel: "party"` with
  `channel_closed`. Other unopened channels (`whisper`, `trade`, unknown) still are.
- **New `chat_notice` code `no_party` (A3).** `constants.ChatNoticeNoParty ChatNoticeCode =
  "no_party"`, copy "You are not in a party." in `chatNoticeCopy`. Sent when the sender's pod's
  party cache holds no party for the sender (`partyCache.partyOf`), read on the loop with no Redis
  call.
- **Refusal order (A4):** `not_in_world`, `no_party`, empty drop, `too_long`, `too_fast`. A
  `no_party` refusal does not touch `lastAccepted`.
- **Stamp (A6):** `channel: "party"`, `scope` = the party id string, the usual FS-WJGFJ stamp,
  minted once on the sender's pod.
- **Recipients and same-pod delivery (B7, B8):** every member of the cached party, sender included.
  Members this pod seats get the `chat` at once on acceptance, through the writer queue, before
  any Redis call.
- **Cross-pod (B9, B10):** for the members not seated here, one `presence.LookupIDs` through the
  party runner (`onRunner`, as `announce` does), its answer handled on the loop; no read when all
  are here. One letter of the new kind `party_chat` (beside `letterPartyUpdate` in `inbox.go`) per
  other pod the read names, payload `{ "to": [ids…], "message": <the chat payload> }`, through the
  party courier and pod inbox. A member the read places on this pod is not lettered.
- **Failures (B11, B12):** a failed read or a full runner → this pod's members only (already told),
  one Warn with the party id, no retry. An unpublishable letter → Warn, dropped. A pod with no
  inbox or no presence index → own members only, no Warn.
- **Receiving (B13):** `partyCourier.receive` handles `party_chat`: sends `chat` with `message` to
  each `to` player this pod seats in a world, without reading the party cache; others skipped
  (Debug at most); a letter missing `to` or `message` skipped with a Warn, no text.
- **Never log text (B16).** Logs carry ids, pod id and length only.
- How the relay reaches the party cache, presence and courier is the implementer's call (a narrow
  consumer-owned interface on `chatRelay`, or the relay handing party lines to the registry);
  keep the hub loop free of Redis waits.

## Acceptance Criteria

- [ ] A `chat` `{channel: "party"}` from a seated player in a party is relayed, not refused `channel_closed`; `whisper`, `trade` and unknown channels still are (update `chat_test.go`'s closed-channel table).
- [ ] A seated player in no party gets exactly one `chat_notice` `{code: "no_party", text: "You are not in a party."}`; nothing is delivered and no presence read is made.
- [ ] After a `no_party` refusal, the same player's area line is relayed (flood window untouched).
- [ ] A player in no world sending party gets `not_in_world`.
- [ ] `too_long`, `too_fast` (shared window across channels) and the empty drop apply to party lines.
- [ ] The relayed line is `chat` with `channel: "party"`, `scope` = party id; all recipients on all pods get the same `message_id`.
- [ ] All members on one pod: every member, sender included, gets the line in hub, field and run; no read, no letter.
- [ ] Members on pods B and C: one read; one `party_chat` letter to B and one to C, each addressed only to that pod's members; two members on B share one letter.
- [ ] Same-pod members receive the line before the read's answer is handled.
- [ ] A failing read: same-pod members only, one Warn without text, no retry.
- [ ] A pod built without inbox or presence: own members only, no Warn.
- [ ] A received `party_chat` letter reaches each addressed seated player, regardless of the receiving pod's party cache; an unseated addressee is skipped; a letter without `to` or `message` is skipped with a Warn.
- [ ] A dead member and an escaped member in a run send and receive party lines.
- [ ] No log line contains party chat text.
- [ ] `make lint && make test` green in game-service.

## Blocked By

None.

## Spec Reference

FS-XGW7H §Requirements A1–A6, B7–B17; §D Wire contract; §User Stories 1–7, 9, 12–22;
§Acceptance Criteria Server; §Edge States (all server rows).

## Wire (what I-XGW7H-2 relies on)

- Inbound unchanged: `chat` `{ "channel": "party", "text" }`.
- Outbound `chat` `{ message_id, sender_id, sender_name, channel: "party", scope: "<party id>", sent_at, text }`.
- Outbound `chat_notice` `{ "code": "no_party", "text": "You are not in a party." }`.
- Internal only: letter `{ "kind": "party_chat", "payload": { "to": [...], "message": {...} } }`, no `to_player_id`.

## Files expected to touch (game-service)

- `common/constants/game.go` (`ChatNoticeNoParty`; the `ChatChannelParty` comment)
- `internal/gameserver/chat.go` (open party, `no_party`, refusal order, scope, local delivery, hand-off to the cross-pod path)
- `internal/gameserver/inbox.go` (`letterPartyChat` kind)
- `internal/gameserver/party_courier.go` (send and receive `party_chat`)
- `internal/gameserver/party.go` and/or `internal/gameserver/party_updates.go` (the cache read and the off-loop `LookupIDs` for a party line, if the registry owns them)
- `internal/gameserver/server.go` (wiring `newChatRelay` to the party side)
- `internal/gameserver/hub.go` (only if `chatRelayer` or the loop's wiring changes)
- `internal/gameserver/chat_test.go` (closed-channel table drops `party`)
- `internal/gameserver/chat_party_test.go` (new: relay, refusals, same-pod and cross-pod delivery, failures)
- `internal/gameserver/party_courier_test.go` (the `party_chat` letter both ways)

## TDD Approach

- RED: `chat_test.go`'s closed-channel table without `party`; a new test expects a party line from a member to reach both same-pod members with `scope` = party id.
- RED: no party → `no_party` notice, no read, window untouched.
- RED: fake presence placing members on B and C → exactly one `party_chat` letter each, correct `to`; failing presence → local only, one Warn.
- RED: courier receives `party_chat` → `chat` to addressed seated players, cache not read.
- GREEN: constant, relay branch, letter kind, courier send and receive, wiring.
