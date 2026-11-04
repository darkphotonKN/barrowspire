---
id: I-1GZGD-5
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-3, I-1GZGD-8]
labels: [ready-for-agent]
title: "FS-1GZGD slice 5: system letters from deduplicated mail.letter.requested events (notification-service)"
---
Implements FS-1GZGD §Requirements R12, R41, §Amendment 2026-11-04 (A1, A4), §Acceptance Criteria (Letters and entry points: the letter-request criterion; New-letter push: redelivery publishes nothing), §Edge States (items down at send)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A1, A4): the event's enclosures take the three
> request kinds (template, copy, gold), resolved to snapshots through the send path; and a
> stored request publishes one `mail:arrived` after its commit through the publisher I-1GZGD-8
> adds, while a redelivery publishes nothing. Now blocked by I-1GZGD-8 as well, so the two
> notification issues touch `internal/mailbox/` and `config/routes.go` one after the other.

## What to Build

notification-service consumes `mail.letter.requested` and stores a `system` letter through the
same validation and storage as the admin send (I-1GZGD-3), without the role check.

- A new event message `LetterRequested` (event id, recipient member id or all-members, title,
  body, enclosures of the kinds template `{template_id, quantity, item_level?}`, copy
  `{copy_of, quantity}` and gold, optional expiry) in a **new** proto file
  `game-server/common/api/proto/events/mailbox.proto` (+ regenerated Go) — not the shared event
  files.
- A queue bound to the event (exchange and naming as notification's existing consumers do).
- The event id goes through the inbox (`processed_events`, FS-PJPNA) **in the same transaction**
  that stores the letter: a redelivery stores nothing.
- A request that breaks R3–R5 or names an unknown template or instance is logged at error, marked
  processed and acked, never requeued.
- After the letter and inbox mark commit, publish `mail:arrived` (`{"member_id"}` or
  `{"broadcast": true}`) through I-1GZGD-8's publisher, outside the transaction; a failed publish
  is logged and the event is still acked. A redelivery that stores nothing publishes nothing. items-service unreachable during validation → nack for redelivery, not
  marked processed.
- No producer in the repo (D2); tests publish the event themselves.

**Files it expects to touch:** `game-server/common/api/proto/events/mailbox.proto` (new) +
generated Go; `game-server/notification-service/internal/mailbox/` (a consumer file and tests,
reusing the send use case); `game-server/notification-service/config/routes.go` (consumer
wiring). No gateway change, no openapi regeneration, no Redis wiring (I-1GZGD-8 owns it).

## Acceptance Criteria

- [ ] A valid `mail.letter.requested` stores one `system` letter visible in the mailbox.
- [ ] The same event delivered twice stores one letter and publishes `mail:arrived` once.
- [ ] A request with a copy enclosure stores the source's snapshot; one naming an unknown instance
      is logged, marked processed and stores nothing.
- [ ] An invalid event is logged at error, marked processed and acked without requeue; nothing is
      stored.
- [ ] With items-service down, the event is not marked processed and is redelivered.
- [ ] Tests pass; lint clean.

## Blocked By

I-1GZGD-3 (letters storage and the send validation it reuses), I-1GZGD-8 (the `mail:arrived`
publisher it calls after commit)

## Spec Reference

FS-1GZGD §Requirements R12, R41; §Amendment 2026-11-04 A1, A4; §Decisions D2(b), D3; spec
default S2. User stories 27, 28.

## TDD Approach

- RED: a consumer test that delivers one event twice and finds one letter.
- GREEN: inbox mark + letter insert in one transaction.
