---
id: I-5SH4G-2
status: done
implements: FS-5SH4G
blocked_by: [I-5SH4G-1]
labels: [ready-for-agent]
title: "FS-5SH4G slice 2: open the world channel, publish on one path, prove it across two pods (game-service)"
---
Implements FS-5SH4G §Requirements A1–A4, B5–B6, B8, B10–B12

**Author: agent, the user having invoked `/develop` and approved the plan on 2026-10-31. Branch
`feat/in-game-chat`.** Built: `chatbus.Publish`; the relay's `chatBus` interface gains it; a
world line passes every FS-WJGFJ check, is stamped `scope: "world"` and handed to a 64-line
outbound queue; one publisher goroutine per pod drains it in order with a 2 s timeout, dropping
a failed publish with a Warn that carries no text; the relay never delivers a world line locally.
Proven on two servers sharing one miniredis, with bus doubles that count, hold and fail
publishes.

## What to Build

The sending half, and the proof that the two halves make one world.

- **Open the channel** (A1): `channel: "world"` from a seated player is relayed, not refused.
  Everything FS-WJGFJ requires of a line still runs first: sender from the connection,
  `not_in_world`, normalising, 200 code points, the shared 2 s flood window (A3, A4). The stamp
  carries `channel: "world"`, `scope: "world"` (A2).
- **One path** (B5, B6): after stamping, the relay hands the line to the publisher and **does not
  deliver locally**; the sender's own pod hears it only when the subscriber (slice 1) gets it
  back from Redis.
- **Publisher** (B8): one goroutine per pod fed by a buffered channel in acceptance order; each
  line is published to `chat:world` with a bounded timeout (reuse the shape of
  `handoffAnnounceTimeout`); a publish that errors is logged with a `Warn` carrying no text and
  dropped, and the next line is attempted afresh. The hub loop never waits on Redis.
- **Area untouched** (B12): an area line never reaches the publisher.

## Acceptance Criteria

- [ ] **Two pods on one miniredis**: a world line from a player seated on pod A arrives at every
      seated player on pod A and on pod B, the sender included, exactly once each, with
      `channel:"world"`, `scope:"world"`, the sender's id and name, and one `message_id` on both
      pods.
- [ ] A world line from a player in no world: `not_in_world`, nothing published.
- [ ] An area line is never published (the miniredis sees no `PUBLISH` for it).
- [ ] Ten world lines accepted in order on pod A arrive on pod B in that order.
- [ ] Before Redis returns the line, nobody on pod A has it (held publish, e.g. a bus double that
      parks publishes until released); after, everybody has it.
- [ ] A publish that errors drops the line with a `Warn` without text; the next line goes through.
- [ ] A world line and an area line from one player inside 2 s: the second is `too_fast`.
- [ ] Logs on the world path carry no message text.
- [ ] Tests pass; `golangci-lint` clean; `go test -race` on the chat tests clean.

## Blocked By

I-5SH4G-1

## Spec Reference

FS-5SH4G §Requirements A1–A4 (the channel), B5–B6 (one path), B8 (publisher), B10 (ordering),
B11 (at-most-once), B12 (area untouched); §User Stories 1, 2, 5–10, 13, 14; §Edge States Redis
unreachable when publishing, sender's own pod, flood, local dev with one pod.

## TDD Approach

- RED: the two-pod test: two servers on one `testutil.NewRedis`, a world line on A, inboxes on
  both pods expect it once.
- GREEN: open `world` in the relay, the publisher goroutine, the hand-off to it after stamping.
- RED: held publish (a bus double) shows A's players have nothing until release; the error row;
  the order row; the area-never-published row.
