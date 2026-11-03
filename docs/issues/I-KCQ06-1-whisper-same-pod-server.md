---
id: I-KCQ06-1
status: done
implements: FS-KCQ06
blocked_by: []
labels: [ready-for-agent]
title: "FS-KCQ06 slice 1: whisper channel opens, target by presence lookup, same-pod delivery with echo, not_online / whisper_self (game-service)"
---
Implements FS-KCQ06 §Requirements A1–A5, B6, B7, B9 (same pod), B10

**Lane: human (HITL), authorised by Nick's charter "私訊" on 2026-11-03.** `/develop` may run this slice.

## What to Build

The whisper chat channel opens on a pod that has both the presence index and the pod inbox
configured. Otherwise it answers `channel_closed`, as world chat does without its bus. The
inbound `chat` gains a `target` field: the character name as typed.

`chatRelay.relay` gets a whisper branch, checked in this order:
1. `not_in_world` (unchanged)
2. `channel_closed`
3. `whisper_self` "You can't whisper yourself.": `target` equals the sender's own character name, trimmed and case-insensitive. Neither Redis nor the flood window is touched.
4. Empty target or empty text is dropped.
5. `too_long`
6. `too_fast`: the shared 2 s window. An accepted whisper starts it.

The presence lookup (`partypresence.Redis.Lookup`) runs off the hub loop through the runner,
the way party chat reads presence. When the lookup comes back:
- **No entry, or an error:** chat notice `not_online` "That player is not online.", and no echo.
- **Found, seated on this pod:** the stamped line (`channel: "whisper"`, scope = target id, plus
  `target_id` and `target_name`) goes through the writer queue to the target, and then the same
  line goes to the sender as the echo.
- **Found on another pod:** that is I-KCQ06-2. Until it lands, treat it as `not_online`, so no
  path is left half-built.

New `ChatNoticeCode`s go in `common/constants/game.go`, next to `no_party`: `not_online` and
`whisper_self`. Their copy goes in `chatNoticeCopy`. Nothing is stored, and presence is only read.

Likely files: `internal/gameserver/chat.go` (branch, checks, notices); a new
`internal/gameserver/chat_whisper.go` (lookup on the runner, same-pod delivery, echo);
`common/constants/game.go`; the wiring that hands the relay the presence index (see how
`chat_party.go` reaches `partypresence`); tests next to them (`chat_test.go` style).

## Acceptance Criteria

- [ ] A whisper to a player seated on the same pod reaches them once, with `channel: "whisper"`, scope = their id, and `target_id` and `target_name`. The sender gets the same line as the echo.
- [ ] A whisper to an unknown or offline name, or to a player on the main menu, gets `not_online` and no echo.
- [ ] A whisper to a player in a run or a field on this pod is delivered.
- [ ] `target` is matched case-insensitively and trimmed.
- [ ] A whisper to oneself gets `whisper_self`, with no Redis call, and the flood window is unchanged.
- [ ] The check order is `not_in_world`, `channel_closed`, `whisper_self`, empty dropped, `too_long`, `too_fast`.
- [ ] The flood window is shared with area, world and party, in both directions.
- [ ] A pod without the presence index or the pod inbox answers `channel_closed`.
- [ ] The hub loop never waits on the presence lookup.
- [ ] Nothing is written to Redis or any store by a whisper.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-KCQ06 §Requirements A1–A5, B6, B7, B9, B10; User Stories 1, 3, 4, 5, 6, 10, 11, 12, 16, 20–23; Acceptance Criteria rows 1, 3–10, 13, 14.

## TDD Approach

- RED: a whisper from A to B, both seated on one test pod with a fake presence index, delivers to B and echoes to A.
- GREEN: the whisper branch in `relay`, a lookup on the runner, and same-pod delivery.
