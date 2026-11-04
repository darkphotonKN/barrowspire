---
id: I-1GZGD-5
status: done
implements: FS-1GZGD
blocked_by: [I-1GZGD-3, I-1GZGD-8, I-1GZGD-10]
labels: [ready-for-agent]
title: "FS-1GZGD slice 5: system letters from deduplicated mail.letter.requested events (notification-service)"
---
Implements FS-1GZGD §Requirements R12, R41, R55, §Amendment 2026-11-04 (A1, A4), §Amendment 2026-11-04 (A7: A7.2), §Acceptance Criteria (Letters and entry points: the letter-request criterion; New-letter push: redelivery publishes nothing), §Edge States (items down at send)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A1, A4): the event's enclosures take the three
> request kinds (template, copy, gold), resolved to snapshots through the send path; and a
> stored request publishes one `mail:arrived` after its commit through the publisher I-1GZGD-8
> adds, while a redelivery publishes nothing. Now blocked by I-1GZGD-8 as well, so the two
> notification issues touch `internal/mailbox/` and `config/routes.go` one after the other.

> **Amended again 2026-11-04** (FS-1GZGD amendment A7): the event gains a **required `source`**
> (the requesting service or feature, 1–64 characters after trimming), stored as the letter's
> sent-by source through I-1GZGD-10's seam; an event without a usable `source` is invalid under
> R12. Now blocked by I-1GZGD-10 as well (the sent-by columns and seam).

## What to Build

notification-service consumes `mail.letter.requested` and stores a `system` letter through the
same validation and storage as the admin send (I-1GZGD-3), without the role check.

- A new event message `LetterRequested` (event id, recipient member id or all-members, title,
  body, enclosures of the kinds template `{template_id, quantity, item_level?}`, copy
  `{copy_of, quantity}` and gold, optional expiry, and a **required `source`** string, A7) in a
  **new** proto file
  `game-server/common/api/proto/events/mailbox.proto` (+ regenerated Go) — not the shared event
  files.
- A queue bound to the event (exchange and naming as notification's existing consumers do).
- The event id goes through the inbox (`processed_events`, FS-PJPNA) **in the same transaction**
  that stores the letter: a redelivery stores nothing.
- A request that breaks R3–R5 or names an unknown template or instance is logged at error, marked
  processed and acked, never requeued.
- *(A7)* The event's `source` is checked with I-1GZGD-10's source helper (1–64 characters after
  trimming, not checked against a list) and stored as the letter's `sent_by_source`; the letter
  has no `sent_by_member_id`. A missing, blank or 65-character `source` is invalid like any R3–R5
  break: logged at error, marked processed, acked, nothing stored, nothing published. Proto3 has
  no required fields, so "required" means the empty string is refused.
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

- [x] A valid `mail.letter.requested` stores one `system` letter visible in the mailbox.
- [x] The same event delivered twice stores one letter and publishes `mail:arrived` once.
- [x] A request with a copy enclosure stores the source's snapshot; one naming an unknown instance
      is logged, marked processed and stores nothing.
- [x] An invalid event is logged at error, marked processed and acked without requeue; nothing is
      stored.
- [x] With items-service down, the event is not marked processed and is redelivered.
- [x] *(A7)* A request with `source: "test.compensation"` stores that sent-by source and no
      member id; one with a missing, blank or 65-character `source` is logged at error, marked
      processed, acked and stores nothing.
- [x] Tests pass; lint clean.

## Blocked By

I-1GZGD-3 (letters storage and the send validation it reuses), I-1GZGD-8 (the `mail:arrived`
publisher it calls after commit), I-1GZGD-10 (the sent-by columns, the seam that passes a system
source, and the source helper; A7)

## Spec Reference

FS-1GZGD §Requirements R12, R41, R55; §Amendment 2026-11-04 A1, A4; §Amendment 2026-11-04 (A7)
A7.2; §Decisions D2(b), D3; spec
default S2. User stories 27, 28.

## TDD Approach

- RED: a consumer test that delivers one event twice and finds one letter.
- GREEN: inbox mark + letter insert in one transaction.

## Charter run (2026-11-04)

Merged on `feat/notification-mailbox` (not on main, not pushed); the code-review fix round was merged at `fb1abf5c` and is recorded as FS-1GZGD amendment A9. Every criterion has a test, so the boxes are ticked; A9.4 added one behaviour: a request whose store or transaction fails rolls back and is requeued as transient instead of dead-lettered. Wrap-up run: `go test ./...` passes in notification-service, including the `ProcessLetterRequestedDB` tests against a throwaway schema.

**Pending manual check (Nick):** publish a `mail.letter.requested` by hand (RabbitMQ management UI, `mailbox.events` exchange, routing key `mail.letter.requested`, with a `source`) against the running stack, and see one `system` letter in the member's mailbox. Close this issue (`status: done`) once that is seen.

## Closed (2026-11-04)

Manual checks passed on the running stack (Nick, 2026-11-04). FS-1GZGD is shipped (merged to main and pushed).
