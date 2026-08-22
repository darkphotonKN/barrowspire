# FS-0003: Append-only gold ledger

> Status: work-order · SPECIFICATION.md: `game-server/ledger-service/SPECIFICATION.md` "## Capabilities" → "Append a balanced ledger transaction" and "Read the movement record"; `game-server/api-gateway/SPECIFICATION.md` "### Downstream routing" → "Route ledger read traffic to ledger" → this FS · Related ADRs: [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet owns balance), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (only balanced movements recorded), [ADR-0007](../adr/0007-the-ledger-is-append-only-corrections-are-reversals.md) (append-only), [ADR-0008](../adr/0008-amounts-are-unsigned-direction-carries-the-sign.md) (unsigned amounts), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-owned idempotency)

## Summary

ledger-service exists but has no domain. It boots, serves gRPC, owns a database, and carries a
placeholder `Ledger` aggregate — a per-member root with an OCC version and no verbs.

This feature replaces that placeholder with the real thing: an **append-only, double-entry
record of completed gold movements**. A movement is written as a **transaction** — a set of legs
sharing one `transaction_id` whose signed amounts sum to zero. Nothing is ever updated or
deleted — and nothing ever needs to be, because the ledger is written only once the settlement
saga is past its pivot and the money is final.

The ledger is a **reconciliation record, not the source of truth for balance.**
`wallet-service.accounts.gold` owns balance. The ledger exists to answer *"why is this number
what it is"*, and to make it possible to detect when the flows that produced that number were
wrong. It therefore never sums entries into an account total and never answers *"what is the
balance"* — that question stays in wallet-service permanently, and moving it here for
convenience would defeat the purpose of having two records.

It also serves that "why" to the people who need to ask it. The **write path is gRPC
service-to-service** — its caller is wallet-service, not a browser. The **read path is HTTP
through the gateway**, because its consumers are support engineers, members, and incident
responders. Reading the record is a listing of movements and never an aggregate, which is what
keeps a read surface from quietly turning the ledger into the second source of truth the
paragraph above rules out.

## Requirements

**What is and is not an entry**

1. **A completed settlement is recorded** — one transaction, two legs: the buyer is `DEBIT`ed,
   the seller is `CREDIT`ed.
2. **The ledger is written only after the settlement saga is past its pivot and every money step
   has succeeded.** The pivot is the first movement of real gold — the winning bid's wallet hold
   committed and the buyer's account debited. Before the pivot, a failure compensates in reverse
   and no gold has moved, so there is nothing for the ledger to record. After the pivot the saga
   only rolls forward, and the ledger append is one of those forward steps. The whole settlement
   lands as a **single transaction under one `transaction_id`**.
3. **There is no reversal, and none is needed.** A settlement either never reaches the ledger
   (compensated before the pivot) or is recorded once, correct, after the money is final. The
   ledger therefore has no correction mechanism — not because corrections are forbidden, but
   because the write is ordered so that nothing correctable ever gets written.
4. **Holds produce no entry.** A hold is an *intention*, not a movement: no counter-account
   exists for gold that might leave, so a hold entry would have nothing to balance against.
   Releasing one is equally invisible — gold was parked and unparked.
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
   method to call, not merely a rule not to break. Nothing needs correcting, because
   requirement 2 only writes once the money is final.
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

19. **The write path is gRPC only.** `AppendLedgerTx` is service-to-service: no gateway route,
    no HTTP surface, no generated-client change. The **read path** added by requirements 20–32
    is a separate surface and does carry HTTP, because its consumers are people rather than
    services.

**The read path**

20. **The ledger answers "why", never "what".** Both read operations return rows. Neither
    returns a total, a sum, or a balance field, and no repository method added for them
    aggregates (ADR-0005, requirement 14). This is what makes a read path safe to add at all:
    listing movements does not make the ledger a second source of truth, whereas summing them
    would.
21. **Two operations, split by the shape of the question.** `getTransaction` answers *"what was
    this one movement"* — a single transaction with all its legs. `listEntries` answers *"what
    has happened to this account"* — a flat, time-ordered history. One operation serving both
    would force either a nested shape nobody can page through or a flat shape that repeats
    parent facts for no reader.
22. **An entry row is flattened; a transaction response stays nested.** `listEntries` returns
    leg fields joined with their parent's transaction fields in one row, because a history view
    is read per-leg and re-nesting it client-side to display it is wasted work. `getTransaction`
    keeps `legs[]` nested, because seeing both sides balance is the entire point of that
    operation. (Naming follows `CONTEXT.md`: *leg* on the write path, *entry* on the read path.)
23. **Pagination is keyset, over `(created_at, id)` descending — newest first.** A cursor encodes
    the last row's sort key; the response carries `next_cursor`, absent on the final page.
    Direction is part of the contract, not a default: it decides which way the cursor's
    comparison runs, and reversing it later invalidates every cursor a client holds. Newest-first
    is what the support and incident paths read for (user stories 13, 18), and it matches the
    `(account_id, created_at DESC)` index. **Offset pagination is refused**, not merely unused —
    an append-only table takes inserts underneath a reader, and offset paging silently skips or
    repeats rows when it does. This is the repo's first keyset pager; the existing leaderboard's
    limit/offset is deliberately not the precedent followed.
24. **Identity and role come from the verified token, never from a parameter.** Zero-trust per
    service: the gateway does not decide authorization on ledger-service's behalf, and
    ledger-service does not trust a caller's claim about who it is. An `account_id` in the query
    is *which account to look at*, never an assertion of *who is asking* — the same distinction
    requirement 16 draws on the write path.
25. **A member sees only their own entries, and asking about another account is refused, not
    filtered.** `account_id` present with `role=member` returns `FORBIDDEN`. Silently narrowing
    it to an empty result would leave a working existence oracle for account ids; targeted
    search is an administrative capability.
26. **A transaction a member has no leg in is `404`, not `403`.** A transaction id is shared by
    both counterparties, so confirming one exists tells the asker that a specific movement
    involving someone else happened. Existence is the secret here, which is what earns the
    ambiguity — this is not the default posture for the platform, and requirement 25's refusal
    is deliberately the louder `403` because there the secret is nothing.
27. **A member's own account is resolved from wallet-service, not from the ledger.** The gateway
    resolves the caller to an `account_id` via `wallet.GetAccount` before calling ledger-service,
    so requirement 15 holds: the ledger gains no account records, no member column, and no
    lookup. **Both** operations need this for a member — `listEntries` to scope the query, and
    `getTransaction` to evaluate requirement 26's "has no leg of theirs" — so both are two hops
    for a member and one for an admin. A resolution failure is a `503`, not an empty result:
    the ledger's answer is unknown, not empty.
28. **`role=admin` with `account_id` scopes to that account; without it, the listing is
    unscoped.** The unscoped form is the reconciliation and incident path. It remains a paged
    listing of rows and never becomes an aggregate (requirement 20).
29. **The role arrives on the request; minting it is another feature's problem.** This feature
    builds the seam — the boundary reads `role` from verified token metadata and scopes the query
    by it. It does not define how the claim is issued, and takes no position on the claim's
    shape beyond `member | admin`. The admin semantics above are specified here so that whoever
    lands the auth work has a defined target.
30. **Errors are RFC 9457 problem+json carrying a stable `code`**, emitted through the gateway's
    existing seam rather than a new one. A ledger-service outage surfaces as
    `503 · SERVICE_UNAVAILABLE`, never `500` — the request was valid and retry is correct, and
    collapsing an outage into 500 tells every client to abandon a request that would have
    succeeded a second later.
31. **Transport types are declared per operation, carry bare payloads, and never mirror internal
    models.** No `{statusCode, message, result}` envelope: that shape exists on the item and
    stats groups as transcribed legacy (ADR-0002 §1), not as a convention new resources adopt.
    The `LedgerEntry` persistence struct, the repository's scan targets, and any domain value
    type stay out of the schema — a contract that exposes internal shapes turns every
    persistence refactor into a client-breaking change.
32. **The contract is generated, never hand-written.** Typed handler signatures are the source;
    `openapi.yaml` and the TypeScript client are regenerated from them and committed in the same
    change. The `ledger` tag is declared globally in the gateway config — Spectral fails an
    operation whose tag is undeclared.

## User Stories

1. As **wallet-service**, I want to post a completed settlement to the ledger, so that the gold
   movement I just applied to a balance has a durable, independent record.
2. As **wallet-service**, I want a redelivered settlement event to be a no-op success, so that
   at-least-once broker delivery does not double-record a movement.
3. As **the settlement saga**, I want to append to the ledger only after the money is final, so
   that a failure before the pivot compensates cleanly and leaves no trace to correct.
4. As **a future reconciler**, I want every movement recorded as balanced legs, so that I can
   detect a discrepancy by summing rather than by replaying application logic.
5. As **a future reconciler**, I want `account_id` to be wallet's account key, so that comparing
   the two records is a join and not a translation step.
6. As **a support engineer**, I want to see why an account's gold is what it is, so that I can
   answer a player dispute without reading service logs.
7. As **a support engineer**, I want a settlement that failed to be simply absent from the
   ledger, so that "there is a row" always means "the gold really moved."
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
13. As **a support engineer**, I want to page an account's movement history newest-first, so that
    I can answer "where did my gold go" from the record rather than from a log search.
14. As **a support engineer**, I want to open a single transaction and see both of its legs, so
    that I can show a player where their gold went and who received it.
15. As **a support engineer**, I want paging to be stable while new movements are being appended,
    so that a history I am reading during an incident does not skip or repeat rows underneath me.
16. As **a member**, I want to see my own gold history without asking support, so that routine
    "what happened to my gold" questions never become a ticket.
17. As **a member**, I want to be unable to look up another player's account, so that my
    transaction history is not enumerable by anyone who guesses an id.
18. As **an incident responder**, I want an unscoped listing of recent movements, so that I can
    see what the economy did in a window without a database session.
19. As **a client developer**, I want errors to carry a stable `code`, so that I can branch on
    the failure without string-matching prose that is allowed to change.
20. As **a client developer**, I want the read contract generated from the handlers, so that the
    TypeScript I call it with cannot drift from what the server accepts.

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
- [ ] A settlement that fails before the pivot leaves **zero** ledger rows
- [ ] No RPC, service method, or repository method exists that reverses, corrects, or retracts a
      recorded transaction — verified by the interface, not by grep
- [ ] The repository exposes no update or delete method — verified by its interface, not by grep
- [ ] A 47-bid settlement scenario produces exactly 2 rows
- [ ] No RPC, query, or repository method returns an account balance or a sum over entries
- [ ] The `ledgers` table, `Ledger` aggregate, OCC `version`, and `withRetry` are gone; the
      service builds and boots without them
- [ ] `ledger.proto` contains no `CreateLedger` or `GetLedger`
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are **regenerated from the typed
      handlers and committed with them** — never hand-edited (requirement 32)
- [ ] A support engineer can retrieve an account's movement history without reading logs — the
      capability user stories 6 and 7 ask for
- [ ] `getTransaction` returns every leg of a transaction, and they sum to zero
- [ ] `listEntries` returns flattened rows carrying both parent and leg fields
- [ ] Paging the full history with `limit` smaller than the row count visits every row exactly
      once — proven by a test that appends a transaction mid-page and asserts no row is skipped
      or repeated
- [ ] `next_cursor` is absent, not null, on the final page
- [ ] A member paging without `account_id` sees only their own entries, resolved through
      `wallet.GetAccount`
- [ ] A member supplying `account_id` receives `403 · FORBIDDEN`
- [ ] A member requesting a transaction with no leg of theirs receives `404 · NOT_FOUND`, and the
      response is byte-identical to one for a transaction id that does not exist
- [ ] Neither read operation's response contains a total, a sum, or a balance field
- [ ] A ledger-service outage surfaces as `503 · SERVICE_UNAVAILABLE`, not `500`
- [ ] Error responses carry `Content-Type: application/problem+json` — asserted on the header,
      not only the body
- [ ] No response body carries a `statusCode` / `message` / `result` envelope
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
- **A settlement fails after the pivot** → the saga rolls forward until every money step
  succeeds, then appends. The ledger sees one transaction, late, not two.
- **A settlement fails before the pivot** → compensated in reverse; the ledger is never called
  and holds nothing to explain.
- **The append step itself fails after the money moved** → the saga retries the step. This is
  requirement 11's determinism earning its keep: every retry carries the same `transaction_id`,
  so the append is safe to attempt any number of times.
- **An entry references an `account_id` that does not exist in wallet-service** → accepted and
  recorded. There is no FK across service boundaries (requirement 15) and no synchronous check.
  This is a reconciler finding, not a write-time error.
- **`reason` carries a value the service does not know** → **open question 3**. Bare `TEXT`
  accepts it today.
- **A member pages their history and holds no wallet account** → `wallet.GetAccount` has nothing
  to resolve, so the listing is empty rather than an error. Having no account is a legitimate
  state for a member who has never transacted.
- **A transaction is appended while a reader is mid-page** → the keyset cursor means the new row
  is simply not seen by that pass; no row is skipped or repeated, which is the failure offset
  paging would have (requirement 23).
- **A cursor is replayed after the rows around it were... nothing.** Rows are never deleted
  (requirement 9), so a cursor cannot dangle. An append-only table is the one place keyset
  paging has no stale-cursor case.
- **`limit` is supplied as 0** → refused as out of range (`422`), not treated as "unlimited".
- **An admin pages the unscoped listing** → allowed, and it is a firehose. It is still rows, never
  a total (requirement 20).
- **A hold expires and is swept** → no entry, by requirement 4. Expiry is a release.
- **Currency is omitted by the caller** → defaults to `GOLD` at the DB level. With no other
  currency in scope this is unambiguous; it stops being unambiguous the moment one is added.

## API surface

Two surfaces, for two kinds of consumer. The **write path** is gRPC service-to-service and has
no HTTP (requirement 19). The **read path** is HTTP through the gateway, because its consumers
are people — and each HTTP operation maps to one gRPC call into ledger-service.

`ledger.proto` is rewritten: `CreateLedger` and `GetLedger` are deleted (both are marked
`SCAFFOLD` in the proto and have no callers), and three RPCs replace them.

```proto
service LedgerService {
  // Record a completed, balanced gold movement. Idempotent on transaction_id.
  rpc AppendLedgerTx(AppendLedgerTxRequest) returns (AppendLedgerTxResponse) {}

  // Read one transaction with all of its legs.
  rpc GetTransaction(GetTransactionRequest) returns (GetTransactionResponse) {}

  // Page a flat, time-ordered history of entries. Never aggregates (requirement 20).
  rpc ListEntries(ListEntriesRequest) returns (ListEntriesResponse) {}
}

enum Direction { DIRECTION_UNSPECIFIED = 0; DEBIT = 1; CREDIT = 2; }
enum Reason    { REASON_UNSPECIFIED = 0; SETTLEMENT = 1; }
```

### Write path — `AppendLedgerTx` (gRPC only)

**`AppendLedgerTxRequest`** — writable fields only; caller identity comes from transport
metadata, never the body (requirement 16).

| Field | Type | Notes |
|---|---|---|
| `transaction_id` | `string` (UUID) | Caller-minted, deterministic. The idempotency key. |
| `reason` | `Reason` | Transaction-level. `UNSPECIFIED` is refused. |
| `reference_id` | `string` (UUID) | Transaction-level. The originating event — today, wallet-service's `bid_id`. |
| `legs` | `repeated LedgerLeg` | Min 2. Leg-level facts only. |

**`LedgerLeg`**

| Field | Type | Notes |
|---|---|---|
| `account_id` | `string` (UUID) | Soft reference to `wallet-service.accounts.id`. |
| `direction` | `Direction` | Carries the sign. |
| `amount` | `int64` | Strictly positive. |
| `currency` | `string` | Optional; defaults to `GOLD`. Must match across legs. |

> The split is deliberate and mirrors the schema: **transaction-level facts sit outside the
> slice, leg-level facts inside.** `reason` and `reference_id` describe the event;
> `account_id`, `direction`, and `amount` describe one side of it.

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
| `reason` is `UNSPECIFIED` | `InvalidArgument · VALIDATION_FAILED` |
| any UUID field is malformed | `InvalidArgument · VALIDATION_FAILED` |
| transaction already recorded, identical | `OK` · `applied = false` |
| transaction already recorded, contradictory | **open question 1** — recommended `FailedPrecondition · LEDGER_CONFLICT` |
| database unavailable | `Unavailable · TRANSIENT` |
| anything else | `Internal · INTERNAL_ERROR` |

### Read path — `getTransaction` and `listEntries` (HTTP via the gateway)

Paths are gateway HTTP. Each maps to one gRPC call into ledger-service, except `listEntries`
for a member, which resolves the caller's account through `wallet.GetAccount` first
(requirement 27). Payloads are bare — no envelope (requirement 31).

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|---|---|---|---|---|---|
| `getTransaction` | `GET /api/ledger/transactions/{transaction_id}` | path `transaction_id` (UUID) | — | `transaction_id`, `reason`, `reference_id`, `currency`, `created_at`, `legs[]` | `401 · UNAUTHENTICATED`<br>`404 · NOT_FOUND`<br>`422 · VALIDATION_FAILED`<br>`503 · SERVICE_UNAVAILABLE`<br>`500 · INTERNAL_ERROR` |
| `listEntries` | `GET /api/ledger/entries` | `account_id` (UUID, optional, admin-only)<br>`limit` (int, default 50, max 100)<br>`cursor` (opaque, optional) | — | `entries[]`, `next_cursor` | `401 · UNAUTHENTICATED`<br>`403 · FORBIDDEN`<br>`422 · VALIDATION_FAILED`<br>`503 · SERVICE_UNAVAILABLE`<br>`500 · INTERNAL_ERROR` |

**`legs[]` member** (nested — requirement 22)

| Field | Type | Notes |
|---|---|---|
| `account_id` | `string` (UUID) | |
| `direction` | `string` | `DEBIT` or `CREDIT`. |
| `amount` | `int64` | Always positive; `direction` carries the sign. |

**`entries[]` member** — flattened: leg fields joined with their parent's (requirement 22)

| Field | Type | Notes |
|---|---|---|
| `transaction_id` | `string` (UUID) | Parent. Shared by every leg of the movement. |
| `reference_id` | `string` (UUID) | Parent. The originating event — today, the winning bid. |
| `reason` | `string` | Parent. |
| `currency` | `string` | Parent. |
| `created_at` | `string` (RFC 3339) | Parent. Half of the sort key. |
| `account_id` | `string` (UUID) | Leg. |
| `direction` | `string` | Leg. |
| `amount` | `int64` | Leg. |

**`next_cursor`** — opaque keyset position over `(created_at, id)`. **Absent** on the final
page, rather than present-and-null: absence is the end-of-pages signal, so a client loops while
the field is there.

**Error semantics.** Which case is which; the meaning of each is in Requirements.

| Case | Response |
|---|---|
| no token, or token invalid | `401 · UNAUTHENTICATED` |
| `role=member` supplied `account_id` | `403 · FORBIDDEN` (requirement 25) |
| `role=member` requested a transaction with no leg on their account | `404 · NOT_FOUND` (requirement 26) |
| `transaction_id` unknown | `404 · NOT_FOUND` |
| malformed UUID, `limit` out of range, or undecodable `cursor` | `422 · VALIDATION_FAILED` |
| ledger-service unreachable | `503 · SERVICE_UNAVAILABLE` (requirement 30) |
| anything else | `500 · INTERNAL_ERROR` |

Every code above already exists in `common/errcode`; this feature adds none. `getTransaction`
carries no `403` row **on purpose** — its only authorization failure is requirement 26's, which
is deliberately indistinguishable from absence.

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
`ledger_transactions (id PK, reason, reference_id, created_at, UNIQUE(reason, reference_id))`,
with `ledger_entries.transaction_id` referencing it and
`UNIQUE(transaction_id, account_id, direction)` on the legs. Two different transactions sharing
an id then becomes a PK violation rather than an undetected corruption, question 1 gains a row to
compare against, and the schema stops contradicting the `AppendLedgerTx` signature by
denormalising transaction-level facts onto every leg.

*Also worth deciding here:* requirement 7 puts sum-to-zero in the service layer. Postgres can
enforce it directly with a `DEFERRABLE INITIALLY DEFERRED` constraint trigger summing signed legs
per `(transaction_id, currency)` at commit. That is the one place the database can catch a
service-layer bug in the invariant this service exists to protect.

**3. Should the legal set of `reason` be closed at the schema level, in the type system, or
both?**

> Narrowed by amendment: this question originally covered `reference_type` as well, which has
> since been removed from the feature entirely. Only `reason` remains open.

*Recommendation:* both. The proto enum plus a Go value type is the real enforcement, because it
sits where bad input actually arrives. A `CHECK` on `reason` is consistent with this schema's own
precedent — `direction`
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

> **Requirement 2 narrows this gap considerably, and the narrowing should be checked rather than
> assumed.** If the append is a roll-forward step of a saga that retries until it succeeds, the
> "wallet committed and the append was lost" case stops being permanent — the orchestrator
> re-drives it, and requirement 11's deterministic `transaction_id` makes every retry safe. What
> survives is the window between the money moving and the retry succeeding, during which a
> reconciler run would report a false discrepancy. Whether that residue still justifies the
> outbox is a question for whoever specifies the saga; this feature does not answer it.

## Governing decisions

The constraints behind this feature are recorded as ADRs. They are **constraints, not
suggestions** — a slice that contradicts one supersedes it or is wrong.

| ADR | Holds that… | Requirements it governs |
|---|---|---|
| [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) | wallet-service owns balance; the ledger never answers "what is the balance" | 14, 15, 20, 27, 28 |
| [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) | only balanced movements are recorded; holds produce no entries | 1–5, 7–8 |
| [ADR-0007](../adr/0007-the-ledger-is-append-only-corrections-are-reversals.md) | the record is append-only, and OCC is removed | 9–10, 17 — **its "corrections are reversals" clause is superseded**; see below |
| [ADR-0008](../adr/0008-amounts-are-unsigned-direction-carries-the-sign.md) | `amount > 0` always; `direction` carries the sign | 6–7 |
| [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) | the caller mints a deterministic `transaction_id`; duplicates are no-op successes | 11–13 |

Open questions 1 and 2 below are explicitly **left unsettled by ADR-0008 and ADR-0009** — both
ADRs name them rather than resolving them.

> **ADR-0007 is half-superseded by requirements 2–3.** Its append-only half stands and is
> load-bearing. Its *"corrections are reversals"* half no longer applies: the settlement saga
> appends only past its pivot, once the money is final, so no recorded transaction is ever wrong
> and there is nothing to reverse. ADRs are immutable, so this is recorded here and needs a new
> ADR to supersede it properly — see [Out of Scope](#out-of-scope).

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
- **The settlement saga itself.** Its orchestration, its pivot, and its compensation steps live
  in marketplace-service and wallet-service. This feature only depends on the *ordering* the saga
  guarantees (requirement 2); it does not implement or specify it.
- **A new ADR superseding ADR-0007's "corrections are reversals" clause.** Recommended, and
  deliberately not done inline — ADRs are append-only and this feature is not the place to write
  one. Run `/record-decision` on the pivot ordering.
- **Currencies beyond `GOLD`.** The multi-currency invariant (requirement 8) is enforced now so
  that adding one later is safe, but no second currency is introduced.
- **Balance-derivation queries.** Permanently out of scope for this service, not merely deferred
  (requirement 14).
- **The reconciler itself.** This feature produces the record it will read; comparing ledger to
  wallet is separate work.
- **The transactional outbox in wallet-service.** See [Known gap](#known-gap--the-write-path-is-not-durable-yet).
- **wallet-service's `CommitHold` / `Credit` verbs.** Both are unbuilt (`wallet-service/SPECIFICATION.md`
  marks them `[ ]`). The ledger's caller does not exist yet; this feature builds the callee.
- **An HTTP surface for the write path.** `AppendLedgerTx` stays gRPC service-to-service
  (requirement 19). The read path's HTTP surface is in scope; the write path's is not.
- **Issuing the `role` claim.** This feature reads `role` from verified token metadata and scopes
  by it (requirement 29). Minting the claim, and auth-service's contract for it, belong to a
  separate feature.
- **Filtering `listEntries` by `reference_id`.** Worth noting the argument for it so it is not
  re-derived: with reversals gone, one settlement is one transaction, so today
  `getTransaction` already answers *"what happened to this bid"* once you have the id. A filter
  earns its keep only when one `reference_id` can produce several transactions — which is not
  true now and may become true if a future reason ever splits a settlement. Left out; an optional
  query param is non-breaking to add later.
- **`reference_type`.** Removed from the feature entirely. `reference_id` alone carries the
  originating event; a second discriminator was never load-bearing while `BID` was the only
  value, and adding one later is non-breaking.
