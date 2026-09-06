---
id: I-0048
status: open
implements: FS-0006
blocked_by: [I-0045, I-0046, I-0047]
labels: [blocked]
title: "FS-0006 slice 4: auth records the account id, closing the loop"
---
Implements FS-0006 §Requirements 15-18, 20, 22

**Author: agent**

## What to Build

The last hop. auth-service consumes `account.created` and writes `members.account_id`, so the
claim I-0045 already knows how to mint finally has something to mint.

```
auth: CreateMember ──(outbox)──▶ member.signedup on auth.events
wallet: consume ──(inbox)──▶ CreateAccount ──(outbox)──▶ account.created on wallet.events
auth: consume ──(inbox)──▶ UPDATE members SET account_id     ← THIS SLICE
next login: the claim is minted
```

### 1. Consume `account.created`

Bind to `wallet.events` (I-0047) with routing key `account.created`. auth-service already runs
an AMQP consumer setup path, so a second binding is a known shape in this service.

Deduplicate through `common/inbox` (I-0046). `MarkEventProcessed` runs **inside the same
transaction** as the column write (§Req 16), so a redelivery leaves the column untouched and
returns no error. Dedupe on the payload's own `EventID`, not the outbox row id.

### 2. Write the column

`UPDATE members SET account_id = $1 WHERE id = $2`. **This is the only writer** (§Req 10, set in
I-0045) — no RPC, no signup path, no admin surface.

### 3. Nack, never ack-on-error

A handler failure nacks for redelivery (§Req 17); §Req 16's inbox makes that safe.

> §Req 17 cites auth-service's `member.create` consumer as the anti-example. **That consumer no
> longer exists** — FS-0007 deleted it. The rule stands; only its example is gone.

**Two failures nack deliberately rather than being swallowed** (§Edge States):

- **Unknown `member_id`** → error → nack → redelivery. Not a routine race: auth produced the
  signup that started the loop, so the member necessarily preceded the event. A member row that
  is not there is a genuine inconsistency.
- **A second member given an already-used `account_id`** → `UNIQUE` violation → error → nack.
  **The message wedges on purpose.** This is a consumer bug and silence would be worse than a
  stuck queue (§Req 9).

### 4. Migration

auth-service, next number is **`000011`** (I-0045 takes `000010`): `processed_events`, same shape
as notification-service's `000004`, in **auth's own database** (§Req 20).

### 5. What does not happen

**No backfill, no re-mint, no invalidation** (§Req 18, 22). A member holding a token minted
before their account existed keeps a claimless token until it expires (60 min) and they log in
again. Members who predate the feature never get the claim — and since `wallet.CreateAccount`
has never had a caller, **that is every member in every database today**. On deploy this mints
for nobody; only post-deploy signups get a claim. Accepted knowingly (ADR-0014).

## Acceptance Criteria

- [ ] An `account.created` delivery sets `members.account_id` for the named member
- [ ] Redelivering the same `account.created` leaves the column unchanged and returns no error
- [ ] The column write and the `processed_events` insert commit or roll back together — a forced
      failure leaves **neither**
- [ ] An `account.created` for an unknown `member_id` errors and **nacks**
- [ ] A second member given an already-used `account_id` fails the `UNIQUE` constraint and
      **nacks** rather than silently skipping
- [ ] A handler error nacks; the message is redelivered, not dropped
- [ ] Migration `000011` adds `processed_events` to auth's database, with a down migration
- [ ] Nothing except this consumer writes `members.account_id`
- [ ] **End to end:** a member who signs up, waits for the loop, then logs in receives a token
      carrying `account_id` — the criterion this whole feature exists for
- [ ] Tokens already issued are unaffected; no invalidation or re-mint occurs
- [ ] No query or connection string references another service's database
- [ ] `go build ./...` and the full suites pass in auth-service and common

## Blocked By

I-0045 (the column and the minter), I-0046 (`common/inbox`), I-0047 (the event to consume).

## Spec Reference

FS-0006 §Requirements 15 (consume and write), 16 (inbox idempotency), 17 (nack), 18 (claim on
next login), 20 (local storage), 22 (no backfill); §Edge States rows for `account.created`
redelivered, unknown `member_id`, duplicate `account_id`, and database failure mid-consumer.

## TDD Approach

- **RED:** deliver `account.created` twice with the same `EventID`; assert the column is set once
  and the second delivery neither changes it nor errors. Fails today — nothing consumes it.
- **GREEN:** consumer + inbox-guarded update.
- **RED:** deliver an `account.created` naming an `account_id` already held by another member;
  assert the handler errors and nacks.
- **GREEN:** let the `UNIQUE` violation propagate — do **not** catch and skip it.

## Check, do not assume

- **The duplicate-`account_id` case must wedge.** The tempting fix is to swallow the constraint
  error and move on; that converts a detectable consumer bug into two members silently sharing
  one account's history, which is precisely what §Req 9's UNIQUE exists to prevent.
- **Prove the transaction by forcing a failure**, not by checking the happy path — both rows
  appearing proves nothing about atomicity.
- The end-to-end criterion is the one that matters. Everything else in FS-0006 is scaffolding for
  it, and it is the first point at which the `account_id` claim is ever non-absent.
