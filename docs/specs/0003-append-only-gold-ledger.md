# FS-0003: Append-only gold ledger

> Status: work-order · SPECIFICATION.md: `game-server/ledger-service/SPECIFICATION.md` "## Capabilities" → "Append a balanced ledger transaction" → this FS · Related ADRs: [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet owns balance), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (only balanced movements recorded), [ADR-0007](../adr/0007-the-ledger-is-append-only-corrections-are-reversals.md) (append-only), [ADR-0008](../adr/0008-amounts-are-unsigned-direction-carries-the-sign.md) (unsigned amounts), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-owned idempotency)

## Summary

ledger-service exists but has no domain. It boots, serves gRPC, owns a database, and carries a
placeholder `Ledger` aggregate — a per-member root with an OCC version and no verbs.

This feature replaces that placeholder with the real thing: an **append-only, double-entry
record of completed gold movements**. A movement is written as a **transaction** — a set of legs
sharing one `transaction_id` whose signed amounts sum to zero. Nothing is ever updated or
deleted; a correction is posted as a new transaction with the legs swapped.

The ledger is a **reconciliation record, not the source of truth for balance.**
`wallet-service.accounts.gold` owns balance. The ledger exists to answer *"why is this number
what it is"*, and to make it possible to detect when the flows that produced that number were
wrong. It therefore never sums entries into an account total and never answers *"what is the
balance"* — that question stays in wallet-service permanently, and moving it here for
convenience would defeat the purpose of having two records.

Transport is **gRPC service-to-service**. There is no UI and none is planned; this feature adds
no HTTP route and does not touch `openapi.yaml` or the generated client.

## Requirements

**What is and is not an entry**

1. **`CommitHold` (the winner pays) is recorded** — one transaction, two legs: the buyer is
   `DEBIT`ed, the seller is `CREDIT`ed.
2. **`ReverseCommit` (settlement failed after commit) is recorded** — a **new** transaction,
   with its own `transaction_id` and the legs swapped. Never an UPDATE or DELETE of the
   original.
3. **`PlaceHold` produces no entry.** A hold is an *intention*, not a movement. No counter-account
   exists for gold that might leave, so a hold entry would have nothing to balance against.
4. **`ReleaseHold` produces no entry.** Nothing moved — gold was parked and unparked.
5. **A settlement of N bids produces exactly two rows**, independent of N. The 46 losing bids of
   a 47-bid auction release their holds and leave no trace here. The ledger records movement,
   not the auction.

**Balance and sign**

6. **`amount > 0` always**; `direction` carries the sign. Enforced by a DB `CHECK`, not by
   convention.
7. **Legs sharing a `transaction_id` sum to zero**, treating `DEBIT` as negative and `CREDIT` as
   positive. Enforced in the service layer before the write, not by the database.
8. **A transaction has at least two legs**, and **all its legs share one currency.** Sum-to-zero
   across mixed currencies is meaningless; with `GOLD` the only currency today this is trivially
   true, and it must stay enforced so it is still true when it stops being trivial.

**Append-only**

9. **No `UPDATE`, no `DELETE`, ever.** The repository exposes insert and read only — there is no
   method to call, not merely a rule not to break. A correction is requirement 2's reversal.
10. `created_at` is set by the database (`DEFAULT now()`), never supplied by the caller.

**Idempotency**

11. **`transaction_id` is caller-supplied and deterministic.** The ledger never mints one. This
    places idempotency ownership on the caller, deliberately — the caller is the only party that
    knows which economic event it is retrying.
12. **Re-posting an already-recorded transaction is a no-op success**, not an error. Callers
    receive `OK` with an indication that nothing new was written. The error is removed rather
    than propagated, because at-least-once delivery makes duplicates the normal path rather than
    an exceptional one.
13. Idempotency is enforced by a unique index, so two concurrent identical posts cannot both
    write. The service layer never decides this by reading first and then writing.

**Boundaries**

14. **The ledger never answers "what is the balance."** No RPC, no query, and no read path sums
    entries into an account total.
15. **The ledger holds no account records.** `account_id` is a soft reference to
    `wallet-service.accounts.id`, with no foreign key and no lookup. Storing wallet's primary key
    (rather than `member_id`) is what makes the future reconciler a straight join.
16. **Caller identity is not in the request body.** `AppendLedgerTx` is service-to-service, so
    the authenticated caller comes from transport metadata. The `account_id`s in the payload are
    *data about whose gold moved*, not an assertion of who is calling — the distinction matters
    because the retired scaffold took its subject from `MemberIDFromCtx`, and this RPC must not.

**Retiring the scaffold**

17. The `ledgers` table, the `Ledger` aggregate root, its `version` column, `Reconstitute`/`Save`,
    `usecase/retry.go`'s `withRetry`, and the `CreateLedger`/`GetLedger` RPCs are **removed**.
    An append-only record performs no read-modify-write, so optimistic concurrency guards nothing;
    keeping it would imply a contention model this service does not have.
18. `ledger.proto` is rewritten. Both existing RPCs are marked `SCAFFOLD` in the proto itself and
    have no callers, so their removal breaks nothing.

**Transport**

19. **gRPC only.** No gateway route, no HTTP surface, no `openapi.yaml` regeneration, no client
    generation. If that changes, it is a separate feature with its own contract work.

## User Stories

1. As **wallet-service**, I want to post a completed settlement to the ledger, so that the gold
   movement I just applied to a balance has a durable, independent record.
2. As **wallet-service**, I want a redelivered settlement event to be a no-op success, so that
   at-least-once broker delivery does not double-record a movement.
3. As **wallet-service**, I want to post a reversal rather than retract an entry, so that a
   failed settlement leaves the history of what happened intact.
4. As **a future reconciler**, I want every movement recorded as balanced legs, so that I can
   detect a discrepancy by summing rather than by replaying application logic.
5. As **a future reconciler**, I want `account_id` to be wallet's account key, so that comparing
   the two records is a join and not a translation step.
6. As **a support engineer**, I want to see why an account's gold is what it is, so that I can
   answer a player dispute without reading service logs.
7. As **a support engineer**, I want a correction to appear as a new dated transaction, so that
   I can tell "this was fixed" from "this never happened."
8. As **an auditor**, I want the record to be structurally append-only, so that the absence of
   tampering is a property of the system rather than a claim about its operators.
9. As **a backend developer**, I want the ledger to refuse an unbalanced transaction, so that a
   caller's arithmetic bug fails at the boundary instead of becoming permanent bad data.
10. As **a backend developer**, I want `amount > 0` with a separate direction, so that a sign
    error is unrepresentable rather than merely unlikely.
11. As **a backend developer**, I want the ledger to have no balance query, so that nobody can
    quietly make it a second source of truth.
12. As **the next feature's author**, I want deposits and withdrawals to be blocked on a system
    account decision, so that conservation is never broken by an entry with no counterparty.

## Acceptance Criteria

- [ ] `AppendLedgerTx` records a two-leg transaction and returns success
- [ ] All legs of a transaction commit in one DB transaction, or none do — proven by a test that
      fails the second leg's insert and asserts zero rows remain
- [ ] An unbalanced transaction (legs not summing to zero) is refused and writes nothing
- [ ] A single-leg transaction is refused
- [ ] A leg with `amount <= 0` is refused, at both the service layer and the DB `CHECK`
- [ ] A transaction whose legs mix currencies is refused
- [ ] Re-posting an identical transaction returns success and leaves the row count unchanged
- [ ] Two concurrent identical posts result in exactly one set of rows — proven by a
      concurrent test, not by inspection
- [ ] A `ReverseCommit` posts a second transaction with swapped legs; the original rows are
      byte-identical afterwards
- [ ] The repository exposes no update or delete method — verified by its interface, not by grep
- [ ] A 47-bid settlement scenario produces exactly 2 rows
- [ ] No RPC, query, or repository method returns an account balance or a sum over entries
- [ ] The `ledgers` table, `Ledger` aggregate, OCC `version`, and `withRetry` are gone; the
      service builds and boots without them
- [ ] `ledger.proto` contains no `CreateLedger` or `GetLedger`
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are untouched by this feature
- [ ] `make lint && make test` green for ledger-service

## Edge States

- **Legs sum to zero but there is only one leg** (`amount 0`) → refused by requirement 6's
  `amount > 0` before the sum is ever evaluated.
- **A caller posts the same `transaction_id` with genuinely different legs** → **open question 1**.
  Today's index makes this a silent no-op success. See [Open questions](#open-questions).
- **Two different economic events are given the same `transaction_id`** → **open question 2**.
  Nothing currently detects it, and sum-to-zero would silently break across the pair.
- **A duplicate arrives while the original is still committing** → the unique index serialises
  them; the loser sees a unique violation and translates it to the requirement 12 no-op, rather
  than surfacing a conflict.
- **The caller retries after the ledger committed but before the response arrived** → recorded
  once, second call is a no-op success. This is the case requirement 11's determinism exists for.
- **wallet-service commits a balance change and the ledger append then fails** → the ledger is
  permanently missing an entry and a future reconciler reports a discrepancy that has no
  underlying gold error. **This feature does not close that gap** — see
  [Known gap](#known-gap--the-write-path-is-not-durable-yet).
- **A reversal is posted for a transaction that was never recorded** → accepted. The ledger does
  not verify that a reversal has an original; doing so would require a read-before-write and
  would still race. The reconciler is what notices an orphaned reversal.
- **A reversal is posted twice** → the reversal has its own deterministic `transaction_id`, so
  requirement 12 makes the second one a no-op.
- **An entry references an `account_id` that does not exist in wallet-service** → accepted and
  recorded. There is no FK across service boundaries (requirement 15) and no synchronous check.
  This is a reconciler finding, not a write-time error.
- **`reason` or `reference_type` carries a value the service does not know** → **open question 3**.
  Bare `TEXT` accepts it today.
- **A hold expires and is swept** → no entry, by requirement 4. Expiry is a release.
- **Currency is omitted by the caller** → defaults to `GOLD` at the DB level. With no other
  currency in scope this is unambiguous; it stops being unambiguous the moment one is added.

## API surface

gRPC service-to-service. **This feature adds no HTTP endpoint**, so `openapi.yaml` and the
generated TypeScript client are untouched.

`ledger.proto` is rewritten: `CreateLedger` and `GetLedger` are deleted (both are marked
`SCAFFOLD` in the proto and have no callers), and one RPC replaces them.

```proto
service LedgerService {
  // Record a completed, balanced gold movement. Idempotent on transaction_id.
  rpc AppendLedgerTx(AppendLedgerTxRequest) returns (AppendLedgerTxResponse) {}
}

enum Direction     { DIRECTION_UNSPECIFIED = 0; DEBIT = 1; CREDIT = 2; }
enum Reason        { REASON_UNSPECIFIED = 0; SETTLEMENT = 1; SETTLEMENT_REVERSAL = 2; }
enum ReferenceType { REFERENCE_TYPE_UNSPECIFIED = 0; BID = 1; }
```

**`AppendLedgerTxRequest`** — writable fields only; caller identity comes from transport
metadata, never the body (requirement 16).

| Field | Type | Notes |
|---|---|---|
| `transaction_id` | `string` (UUID) | Caller-minted, deterministic. The idempotency key. |
| `reason` | `Reason` | Transaction-level. `UNSPECIFIED` is refused. |
| `reference_type` | `ReferenceType` | Transaction-level. `UNSPECIFIED` is refused. |
| `reference_id` | `string` (UUID) | Transaction-level. For `BID`, wallet-service's `bid_id`. |
| `legs` | `repeated LedgerLeg` | Min 2. Leg-level facts only. |

**`LedgerLeg`**

| Field | Type | Notes |
|---|---|---|
| `account_id` | `string` (UUID) | Soft reference to `wallet-service.accounts.id`. |
| `direction` | `Direction` | Carries the sign. |
| `amount` | `int64` | Strictly positive. |
| `currency` | `string` | Optional; defaults to `GOLD`. Must match across legs. |

> The split is deliberate and mirrors the schema: **transaction-level facts sit outside the
> slice, leg-level facts inside.** `reason`, `reference_type`, and `reference_id` describe the
> event; `account_id`, `direction`, and `amount` describe one side of it.

**`AppendLedgerTxResponse`**

| Field | Type | Notes |
|---|---|---|
| `transaction_id` | `string` (UUID) | Echoed. |
| `applied` | `bool` | `true` = rows written; `false` = already recorded, no-op (requirement 12). |
| `recorded_at` | `Timestamp` | The original write's time, not the retry's. |

**Errors.** gRPC code plus the stable domain code, mapped through the existing `mapError` seam
in `internal/ledger/grpc/handler.go`.

| Case | Response |
|---|---|
| legs do not sum to zero | `InvalidArgument · UNBALANCED_TRANSACTION` |
| fewer than two legs | `InvalidArgument · UNBALANCED_TRANSACTION` |
| any leg has `amount <= 0` | `InvalidArgument · VALIDATION_FAILED` |
| legs mix currencies | `InvalidArgument · VALIDATION_FAILED` |
| `reason` or `reference_type` is `UNSPECIFIED` | `InvalidArgument · VALIDATION_FAILED` |
| any UUID field is malformed | `InvalidArgument · VALIDATION_FAILED` |
| transaction already recorded, identical | `OK` · `applied = false` |
| transaction already recorded, contradictory | **open question 1** — recommended `FailedPrecondition · LEDGER_CONFLICT` |
| database unavailable | `Unavailable · TRANSIENT` |
| anything else | `Internal · INTERNAL_ERROR` |

## Data model

```sql
CREATE TABLE ledger_entries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID        NOT NULL,
    account_id      UUID        NOT NULL,
    direction       TEXT        NOT NULL,
    amount          BIGINT      NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'GOLD',
    reason          TEXT        NOT NULL,
    reference_type  TEXT        NOT NULL,
    reference_id    UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT direction_valid CHECK (direction IN ('DEBIT','CREDIT'))
);
CREATE INDEX ON ledger_entries (account_id, created_at DESC);
CREATE INDEX ON ledger_entries (transaction_id);
CREATE UNIQUE INDEX ON ledger_entries (reason, reference_id, account_id, direction);
```

The migration that creates this also **drops `ledgers`** (requirement 17). Per-column detail
belongs in `game-server/ledger-service/docs/schema/ledger_entries.md`, replacing the existing
`ledgers.md`.

## Open questions

These were explicitly **not settled** during scoping. Each has a recommendation, and each is
resolvable within one slice — but none should be silently defaulted during implementation.

**1. The unique index excludes `amount`. Is a corrected-amount retry a duplicate, or a bug we
are making invisible?**

`(reason, reference_id, account_id, direction)` identifies the *fact*; `amount` is its *content*.
A retry carrying a different amount is therefore not a duplicate — it is a **contradiction**, and
today it silently no-ops as a success while the ledger keeps the first (possibly wrong) amount.

*Recommendation:* keep the index as-is and make the no-op **conditional on agreement** — on
conflict, read the existing legs and compare. Identical → no-op success (requirement 12).
Different → hard error. Adding `amount` to the index is the wrong fix: it makes both rows
insertable and breaks conservation. A ledger built to detect wrong flows must not silently absorb
a contradictory restatement of a fact it already holds.

**2. Nothing enforces `transaction_id` uniqueness. Caller's problem by design, or a missing check?**

Two idempotency keys currently coexist: `transaction_id` (caller-minted, deterministic) and the
four-column unique index. If the first is deterministic it is a function of the second, so they
are redundant — and redundancy with no consistency check is where question 1's bug hides.

*Recommendation:* promote the transaction to its own row —
`ledger_transactions (id PK, reason, reference_type, reference_id, created_at, UNIQUE(reason,
reference_type, reference_id))`, with `ledger_entries.transaction_id` referencing it and
`UNIQUE(transaction_id, account_id, direction)` on the legs. Two different transactions sharing
an id then becomes a PK violation rather than an undetected corruption, question 1 gains a row to
compare against, and the schema stops contradicting the `AppendLedgerTx` signature by
denormalising transaction-level facts onto every leg.

*Also worth deciding here:* requirement 7 puts sum-to-zero in the service layer. Postgres can
enforce it directly with a `DEFERRABLE INITIALLY DEFERRED` constraint trigger summing signed legs
per `(transaction_id, currency)` at commit. That is the one place the database can catch a
service-layer bug in the invariant this service exists to protect.

**3. Should the legal set of `reason` / `reference_type` be closed at the schema level, in the
type system, or both?**

*Recommendation:* both, asymmetrically. Proto enums plus Go value types are the real enforcement,
because they sit where bad input actually arrives. A DB `CHECK` on `reference_type` is cheap and
low-churn. A `CHECK` on `reason` is consistent with this schema's own precedent — `direction`
already has one — at the cost of a migration per new reason, which must land before the code that
emits it. In an append-only financial table that ordering constraint is arguably a feature: a new
economic reason should be a deliberate, versioned event.

## Known gap — the write path is not durable yet

wallet-service and ledger-service have **separate databases**, so a synchronous `AppendLedgerTx`
cannot join wallet's commit transaction. If wallet commits a balance change and the gRPC call
then fails, the ledger is permanently missing an entry, and a future reconciler reports a
discrepancy with no underlying gold error — the exact failure this service exists to catch,
manufactured by the service itself.

The shape that closes it is the **transactional outbox wallet-service already has planned**
(`wallet-service/SPECIFICATION.md` → "Reliability"): wallet writes the balance change and an
outbox row in one transaction, a relay publishes, and the ledger consumes and appends
idempotently. At-least-once delivery is precisely *why* requirement 11's caller-minted
deterministic `transaction_id` is the right call — duplicates stop being an edge case and become
the normal path.

This is recorded, not solved. The gRPC surface above is correct either way: an AMQP consumer
would invoke the same use case. **Do not treat the ledger as durable until the outbox lands.**

## Governing decisions

The constraints behind this feature are recorded as ADRs. They are **constraints, not
suggestions** — a slice that contradicts one supersedes it or is wrong.

| ADR | Holds that… | Requirements it governs |
|---|---|---|
| [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) | wallet-service owns balance; the ledger never answers "what is the balance" | 14, 15 |
| [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) | only balanced movements are recorded; holds produce no entries | 1–5, 7–8 |
| [ADR-0007](../adr/0007-the-ledger-is-append-only-corrections-are-reversals.md) | the record is append-only; corrections are reversals, and OCC is removed | 2, 9–10, 17 |
| [ADR-0008](../adr/0008-amounts-are-unsigned-direction-carries-the-sign.md) | `amount > 0` always; `direction` carries the sign | 6–7 |
| [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) | the caller mints a deterministic `transaction_id`; duplicates are no-op successes | 11–13 |

Open questions 1 and 2 below are explicitly **left unsettled by ADR-0008 and ADR-0009** — both
ADRs name them rather than resolving them.

## Rejected alternatives

- **Recording holds as ledger entries** — rejected: a hold entry has nothing to balance against,
  so it would either break conservation or force a system account (out of scope).
- **Signed amounts** (negative for debits) — rejected in favour of `amount > 0` with `direction`
  carrying the sign, so a sign error is unrepresentable rather than merely unlikely.
- **Propagating a duplicate-post error to callers** — rejected: the error is removed rather than
  handed to every caller, because at-least-once delivery makes duplicates routine.
- **Keeping the per-member `Ledger` aggregate and its OCC version** — rejected: append-only has no
  read-modify-write for OCC to protect.
- **Adding `amount` to the unique index** (as the fix for open question 1) — rejected: it makes
  both the wrong and the corrected leg insertable, which breaks conservation outright.

## Out of Scope

- **Deposits and withdrawals.** They need a system or mint account or conservation breaks. When
  built, they are recorded — but not here.
- **System / mint accounts.** The prerequisite for the above.
- **Reversal reason codes beyond `SETTLEMENT_REVERSAL`.**
- **Currencies beyond `GOLD`.** The multi-currency invariant (requirement 8) is enforced now so
  that adding one later is safe, but no second currency is introduced.
- **Balance-derivation queries.** Permanently out of scope for this service, not merely deferred
  (requirement 14).
- **The reconciler itself.** This feature produces the record it will read; comparing ledger to
  wallet is separate work.
- **The transactional outbox in wallet-service.** See [Known gap](#known-gap--the-write-path-is-not-durable-yet).
- **wallet-service's `CommitHold` / `Credit` verbs.** Both are unbuilt (`wallet-service/SPECIFICATION.md`
  marks them `[ ]`). The ledger's caller does not exist yet; this feature builds the callee.
- **Any HTTP surface, gateway route, or generated client change** (requirement 19).
- **A read path.** No RPC to list entries is defined here — the reconciler is out of scope, and a
  read surface designed without its consumer would be guesswork.
