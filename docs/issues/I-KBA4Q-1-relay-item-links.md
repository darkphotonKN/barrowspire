---
id: I-KBA4Q-1
status: done
implements: FS-KBA4Q
blocked_by: []
labels: [ready-for-agent]
title: "FS-KBA4Q slice 1: the pod validates and relays item links on every chat channel"
---
Implements FS-KBA4Q §Requirements D (R24–R30), §The item snapshot

**Lane: AFK (game-service).** Backend work, in scope by the owner's charter of 2026-11-25. Chat
action and wire shape only: no database, no api-gateway, no items-service, no proto, no new
dependency. If the work seems to need any of those, stop and report.

## What to Build

The `chat` action accepts an optional `items` array beside `text`. The relay validates it
(count, closed key set, each field's type, range, length and closed set, the pairing of each
`[name]` with the normalised text in order, the 4096-byte cap on the rebuilt value), rebuilds
each snapshot from the validated values, and puts `items` on the stamped line. A line with no
`items`, or an empty one, is stamped exactly as today, with no `items` key. A line that fails is
refused whole with `chat_notice {code: "bad_item_link"}` before the flood window is touched.
Area, world (chat bus), party (party-chat letter) and whisper (direct, whisper letter, and the
sender's echo) all carry it; a receiving pod validates nothing again. No lookup, no world, no
store, and no log line carrying any part of a snapshot.

Also add the Vocabulary terms (item link, item snapshot) to `game-server/game-service/CONTEXT.md`
§ Chat.

## Expected files

- `game-server/game-service/internal/gameserver/chat.go` (**hotspot**: the check order in
  `relay`, `stamp` taking the validated items, `chatNoticeCopy`)
- `game-server/game-service/internal/gameserver/chat_items.go` (new: the limits as named
  constants, validation, rebuild) and `chat_items_test.go` (new)
- `game-server/game-service/internal/gameserver/chat_whisper.go`, `chat_party.go` (only if the
  stamp's signature change reaches them; the payload map already rides both letters)
- `game-server/game-service/common/constants/game.go` (`ChatNoticeBadItemLink`)
- `chat_test.go`, `chat_world_test.go`, `chat_party_test.go`, `chat_whisper_test.go` (one
  with-links case per path)
- `game-server/game-service/CONTEXT.md`

## Acceptance Criteria

- [ ] Every criterion of FS-KBA4Q §Acceptance Criteria "Server (game-service)" holds.
- [ ] `chatItemLinksMax` (3), `chatItemAffixesMax` (6), `chatItemLinksBytesMax` (4096) and the
      field bounds are named constants beside `chatTextMax`.
- [ ] Existing chat tests pass unchanged: a line without links is byte-for-byte today's.
- [ ] `make test` and `make lint` pass in `game-server/game-service`.

## Blocked By

None

## Spec Reference

FS-KBA4Q §Requirements D: R24 (inbound), R25 (outbound), R26 (no lookup, no store, no log), R27
(validation), R28 (`bad_item_link`), R29 (rebuilt), R30 (every channel and path, flood window
unchanged); §The item snapshot (the field table); §Edge States (modified client, cross-pod,
at-most-once). User stories 14, 22–25.

## TDD Approach

- RED: a table-driven `TestValidateChatItems` with one row per boundary of the field table, the
  count, the pairing and the byte cap.
- GREEN: `chat_items.go`.
- RED: an area line with one link is delivered with `items`; a plain line has no `items` key; a
  refused line leaves the flood window untouched.
- GREEN: wire the check into `relay` after `too_long`, before the flood window; `stamp` adds the
  rebuilt items.
- Then one with-links case each for world, party and whisper (here, there, echo).
