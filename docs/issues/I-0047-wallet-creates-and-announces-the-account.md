---
id: I-0047
status: open
implements: FS-0006
blocked_by: [I-0046]
labels: [blocked]
title: "FS-0006 slice 3: wallet creates the account on signup and announces it"
---
Implements FS-0006 §Requirements 11-14, 16, 17, 20

**Author: agent**

## What to Build

Wallet learns about new members from the broker, creates their account, and announces it — the
account insert and its outbound event in one transaction.

**Replaces scaffolding, does not extend it.** `wallet-service/internal/account/amqp_consumer.go`
today declares a **fanout exchange literally named `account.created`**, consumes its *own* event,
unmarshals to `map[string]any`, prints it, and **auto-acks** (`Consume(..., true, ...)`). None of
that survives.

### 1. `wallet.events`, not an exchange per event

Add `WalletEventsExchange = "wallet.events"` to `common/constants`, alongside
`AuthEventsExchange`, `GameEventsExchange`, `ItemEventsExchange`. A **topic** exchange, with
`account.created` as a routing key on it (§Req 13). The scaffolded fanout goes.

### 2. Consume `member.signedup`

Bind to `auth.events` with routing key `member.signedup`. **No producer change is needed** —
auth-service already publishes it via its outbox, and the payload already carries
`EventID: uuid.NewString()` and `UserID` (`commonconstants.MemberSignedUpEventPayload`), so the
dedupe key is there on day one (§Req 11).

Deduplicate through `common/inbox` (I-0046): `MarkEventProcessed` runs **inside the same
transaction** as the account insert, so a redelivery is a no-op rather than a second account
(§Req 16). `UNIQUE(member_id)` on `accounts` is the backstop, but the inbox is what makes
redelivery clean instead of a caught error.

### 3. Insert and announce atomically

The `accounts` insert and its `outbox` row share one transaction (§Req 12) via `common/outbox`'s
`CreateOutboxTx`. **wallet does not wire the outbox up at all today and must** — follow
auth-service's `cmd/server/main.go` (`NewRepo` → `NewService` → `NewOutboxWorker(5s, 20, …)` →
`go worker.Run(ctx)`).

**The `account.created` payload carries its own `EventID`**, distinct from the outbox row's `ID`
(§Req 14). `OutboxEvent.ID` identifies a *row*; the worker ships only `Payload`, so the
consumer's dedupe key must ride inside the payload — as notification-service's does. Payload
needs at minimum `EventID`, `AccountID`, `MemberID`. Put the type in `common/constants` beside
`MemberSignedUpEventPayload`.

Keep `CreateAccountRequest` empty and identity interceptor-derived (§User story 12) — that is a
security property, not an oversight, and it is the reason a login-time fetch was impossible.

### 4. Nack, never ack-on-error

A handler failure **nacks for redelivery** (§Req 17), which §Req 16's inbox makes safe.

> §Req 17 cites auth-service's `member.create` consumer as the anti-example. **That consumer no
> longer exists** — FS-0007 deleted it. The rule stands; only its example is gone.

### 5. Migrations

wallet-service, next number is **`000005`** (highest today is `000004`):
- `000005` — `processed_events`, same shape as notification-service's `000004`
- `000006` — `outbox`, same shape as auth-service's `000009_create_outbox`

Both tables live in **wallet's own database** (§Req 20).

## Acceptance Criteria

- [ ] `WalletEventsExchange = "wallet.events"` exists in `common/constants`, declared as a topic
- [ ] The scaffolded fanout exchange named `account.created` is gone, along with its
      map-and-print consumer
- [ ] A `member.signedup` delivery creates exactly one `accounts` row for that member
- [ ] Redelivering the same `member.signedup` (same `EventID`) creates **no** second account and
      returns no error to the broker
- [ ] The `accounts` insert and its `outbox` row commit or roll back together — a forced failure
      after the insert leaves **neither**
- [ ] `account.created` is published on `wallet.events` with routing key `account.created`
- [ ] The payload carries an `EventID` distinct from the outbox row's `ID`, plus `AccountID` and
      `MemberID`
- [ ] A handler error **nacks**; the message is redelivered, not dropped
- [ ] `CreateAccountRequest` is still empty and identity still interceptor-derived
- [ ] Migrations `000005` (processed_events) and `000006` (outbox) exist with down migrations
- [ ] The outbox worker is wired in `cmd/server/main.go` and drains on the same 5s/20 cadence
- [ ] No query or connection string references another service's database
- [ ] `go build ./...` and the full suites pass in wallet-service and common

## Blocked By

I-0046 — needs `common/inbox`.

## Spec Reference

FS-0006 §Requirements 11 (consume signup), 12 (transactional outbox), 13 (`wallet.events`),
14 (payload EventID), 16 (inbox idempotency), 17 (nack), 20 (local storage); §Edge States rows
for `member.signedup` redelivered, RabbitMQ down at signup, and database failure mid-consumer.

## TDD Approach

- **RED:** deliver a `member.signedup` twice with the same `EventID`; assert exactly one
  `accounts` row and no error on the second. Fails today — nothing consumes it.
- **GREEN:** consumer + inbox-guarded use case.
- **RED:** force a failure between the account insert and the outbox write; assert **neither**
  row exists.
- **GREEN:** move both into one transaction.

## Check, do not assume

- **Prove the transaction, do not assert it.** A test that only checks both rows appear on the
  happy path passes just as well against two independent writes. Force the failure.
- **Prove the nack.** Auto-ack is the current behavior and the easiest thing to leave in place by
  accident; assert redelivery, not just that the handler returned an error.
- The outbox worker publishes `Payload` bytes only — a dedupe key stored outside the payload is
  invisible to the consumer.
