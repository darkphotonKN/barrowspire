---
id: I-1GZGD-5
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-3]
labels: [ready-for-agent]
title: "FS-1GZGD slice 5: system letters from deduplicated mail.letter.requested events (notification-service)"
---
Implements FS-1GZGD §Requirements R12, §Acceptance Criteria (Letters and entry points: the letter-request criterion), §Edge States (items down at send)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

## What to Build

notification-service consumes `mail.letter.requested` and stores a `system` letter through the
same validation and storage as the admin send (I-1GZGD-3), without the role check.

- A new event message `LetterRequested` (event id, recipient member id or all-members, title,
  body, enclosures, optional expiry) in a **new** proto file
  `game-server/common/api/proto/events/mailbox.proto` (+ regenerated Go) — not the shared event
  files.
- A queue bound to the event (exchange and naming as notification's existing consumers do).
- The event id goes through the inbox (`processed_events`, FS-PJPNA) **in the same transaction**
  that stores the letter: a redelivery stores nothing.
- A request that breaks R3–R5 or names an unknown template is logged at error, marked processed and
  acked, never requeued. items-service unreachable during validation → nack for redelivery, not
  marked processed.
- No producer in the repo (D2); tests publish the event themselves.

**Files it expects to touch:** `game-server/common/api/proto/events/mailbox.proto` (new) +
generated Go; `game-server/notification-service/internal/mailbox/` (a consumer file and tests,
reusing the send use case); `game-server/notification-service/config/routes.go` (consumer
wiring). No gateway change, no openapi regeneration.

## Acceptance Criteria

- [ ] A valid `mail.letter.requested` stores one `system` letter visible in the mailbox.
- [ ] The same event delivered twice stores one letter.
- [ ] An invalid event is logged at error, marked processed and acked without requeue; nothing is
      stored.
- [ ] With items-service down, the event is not marked processed and is redelivered.
- [ ] Tests pass; lint clean.

## Blocked By

I-1GZGD-3 (letters storage and the send validation it reuses)

## Spec Reference

FS-1GZGD §Requirements R12; §Decisions D2(b), D3; spec default S2. User stories 27, 28.

## TDD Approach

- RED: a consumer test that delivers one event twice and finds one letter.
- GREEN: inbox mark + letter insert in one transaction.
