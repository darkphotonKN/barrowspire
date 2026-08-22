# FS-0003: Append-only gold ledger

> Status: work-order · SPECIFICATION.md: `game-server/ledger-service/SPECIFICATION.md` "## Capabilities" → "Append a balanced ledger transaction" and "Read the movement record"; `game-server/api-gateway/SPECIFICATION.md` "### Downstream routing" → "Route ledger read traffic to ledger" → this FS · Related ADRs: [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet owns balance), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (only balanced movements recorded), [ADR-0007](../adr/0007-the-ledger-is-append-only-corrections-are-reversals.md) (append-only), [ADR-0008](../adr/0008-amounts-are-unsigned-direction-carries-the-sign.md) (unsigned amounts), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-owned idempotency), [ADR-0010](../adr/0010-the-ledger-is-appended-past-the-saga-pivot.md) (appended past the saga pivot; no reversals)

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
through the gateway**, because its consumers are support engineers and incident responders —
people, not services. **No player-facing UI is planned**; the member-scoped arm of the read path
exists as an authorization rule, not as a screen. Reading the record is a listing of movements and never an aggregate, which is what
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
5a. **The `reason` vocabulary is forward-declared, and the ledger needs no change to record any
   of it.** The legal set is `SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`, closed by a DB
   `CHECK` and by the proto enum. Only `SETTLE_AUCTION` has a caller today.

   The distinction that matters, and the one this spec previously blurred: **building the
   deposit and withdraw verbs is out of scope; recording their effects is not.** A movement is a
   movement. When wallet-service grows those verbs, they append here under their own `reason`
   with **no schema change, no migration, and no new RPC** — which is the point of closing the
   set now rather than after the fact.

   The only constraint on them is the one every transaction has: **two legs that sum to zero**
   (requirements 7–8). Gold entering or leaving the economy has no natural counterparty, so the
   **caller** must supply an `account_id` for the other leg — a system or mint account. Because
   the ledger never looks an account up (requirement 15), it records that id without knowing or
   caring what it is. **Whose account that is, and whether it exists, is wallet-service's
   question, not this service's.** The ledger is ready; the counter-account is what is missing.

**Balance and sign**

6. **`amount > 0` always**; `direction` carries the sign. Enforced by a DB `CHECK`, not by
   convention.
7. **Legs sharing a `transaction_id` sum to zero**, treating `DEBIT` as negative and `CREDIT` as
   positive. Enforced in the service layer before the write, not by the database.
8. **A transaction has at least two legs**, and **is denominated in exactly one currency.**
   Sum-to-zero across mixed currencies is meaningless. `currency` sits on the transaction, not
   the leg, so this is **structural, not validated** — there is no per-leg value that could
   disagree, and the violation is unrepresentable rather than merely rejected. With `GOLD` the
   only currency today the rule is trivially satisfied; the shape is what keeps it true when it
   stops being trivial.

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
13. **Idempotency is enforced by the parent's primary key** — `ledger_transactions.transaction_id`
    — and by nothing else. The append does `ON CONFLICT DO NOTHING` on the parent insert;
    **0 rows affected means already recorded**, so the service returns success (requirement 12)
    and skips the legs. Two concurrent identical posts cannot both write, because the PK
    serialises them. The service layer never decides this by reading first and then writing.

    **The caller's `transaction_id` derivation is a contract, not an implementation detail.**
    A deterministic UUIDv5 over the economic event's identifying facts is only idempotent if
    that derivation is **permanently stable**. Changing the namespace, the input fields, or their
    order re-mints ids for events the ledger already holds, and every one of them appends a second
    time — silently, as a valid new transaction. This is the one caller-side change that can
    corrupt an append-only record with no error surfacing anywhere, so it is versioned and
    reviewed like a schema change, not refactored.

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

    **`internal/ledger/amqp_consumer.go` is NOT removed.** It is the seat for the event-driven
    write path: wallet-service's deposit, withdraw, and transfer verbs will publish events this
    consumer appends from, under the reasons requirement 5a forward-declares. Its current
    `ledger.created` routing key is a **placeholder** naming the retired aggregate's event and
    will be renamed when a real event exists — the file survives the scaffold retirement even
    though its constant does not. This is also the shape the Known gap's outbox would land on.
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
    is what the support and incident paths read for (user stories 13, 17), and it matches the
    `(account_id, created_at DESC)` index. **Offset pagination is refused**, not merely unused —
    an append-only table takes inserts underneath a reader, and offset paging silently skips or
    repeats rows when it does. This is the repo's first keyset pager; the existing leaderboard's
    limit/offset is deliberately not the precedent followed.
24. **Identity, role, and the caller's own `account_id` come from the verified token, never from a
    parameter.** Zero-trust per service: the gateway does not decide authorization on
    ledger-service's behalf, and ledger-service does not trust a caller's claim about who it is.

    **`account_id` now appears on both sides of that line, and the distinction is the whole
    rule:** as a *token claim* it is **who is asking** and is trusted; as a *query parameter* it
    is **which account to look at** and is never an assertion of identity. They are different
    inputs that happen to share a name and a type — which is exactly why requirement 25 refuses
    the parameter outright for a member rather than comparing it against the claim. The same
    distinction requirement 16 draws on the write path.
25. **A member sees only their own entries, and asking about another account is refused, not
    filtered.** `account_id` present with `role=member` returns `FORBIDDEN`. Silently narrowing
    it to an empty result would leave a working existence oracle for account ids; targeted
    search is an administrative capability.
26. **A transaction a member has no leg in is `404`, not `403`.** A transaction id is shared by
    both counterparties, so confirming one exists tells the asker that a specific movement
    involving someone else happened. Existence is the secret here, which is what earns the
    ambiguity — this is not the default posture for the platform, and requirement 25's refusal
    is deliberately the louder `403` because there the secret is nothing.
27. **A member's `account_id` arrives as a verified token claim.** There is no resolution step and
    no call to wallet-service. The gateway extracts `account_id` from the token the same way it
    extracts identity, and passes it down; both operations use it — `listEntries` to scope the
    query, `getTransaction` to evaluate requirement 26's "has no leg of theirs". **One hop, for
    members and admins alike.**

    The claim exists **because of** requirement 15, not in spite of it. The ledger holds no
    account records and must never look one up; putting the account on the token is what lets the
    read path be account-scoped without the ledger learning what an account is. A synchronous
    wallet lookup would have bought the same scoping at the cost of a round trip on every page,
    plus a new failure mode on a read path that otherwise has none.

    Signup creates the member and their account together, so the claim is **always present and
    immutable** for a member. As with requirement 29's `role`, this feature builds the seam that
    reads the claim; **minting it belongs to the auth feature.**

    > **Accepted tradeoff: one account per member, per currency.** A singular `account_id` claim
    > is only correct while a member has exactly one account. A second currency — or any second
    > account — makes the claim ambiguous and forces either a claim carrying a set, or the wallet
    > lookup this requirement just removed. **That is the trigger to revisit**, and it is the same
    > trigger requirement 8's one-currency-per-transaction rule is waiting on.
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
16. As **a member**, I want to be unable to look up another player's account, so that my
    transaction history is not enumerable by anyone who guesses an id.
17. As **an incident responder**, I want an unscoped listing of recent movements, so that I can
    see what the economy did in a window without a database session.
18. As **a client developer**, I want errors to carry a stable `code`, so that I can branch on
    the failure without string-matching prose that is allowed to change.
19. As **a client developer**, I want the read contract generated from the handlers, so that the
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
- [ ] A member paging without `account_id` sees only their own entries, scoped by the
      `account_id` token claim
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
- **A caller posts the same `transaction_id` with genuinely different legs** → recorded once, as
  the first version; the second post is a no-op success (requirement 12). **The ledger cannot
  detect this and does not try.** It is a caller defect — a non-deterministic derivation, or two
  events colliding on one id — and requirement 13's stability rule is what prevents it. Detecting
  it here would need a read-before-write that still races, for a case correct callers never
  produce.
- **Two different economic events are given the same `transaction_id`** → same case, same answer.
  The second is dropped whole rather than corrupting the first. Under the rejected four-column
  index this would have half-written and broken sum-to-zero across the pair; the parent PK makes
  it an atomic no-op instead.
- **A duplicate arrives while the original is still committing** → the parent's **primary key**
  serialises them. The loser's `ON CONFLICT DO NOTHING` affects 0 rows and becomes the
  requirement 12 no-op, rather than surfacing a conflict.
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
- **A member holds no account** → **no longer reachable.** Signup creates the member and their
  account together, so the `account_id` claim is always present (requirement 27). Kept on record
  rather than deleted: it becomes reachable again the moment a member can exist without an
  account, or hold more than one — the same trigger as requirement 27's one-account tradeoff.
- **A member's token carries no `account_id` claim** → `401 · UNAUTHENTICATED`. Fail closed: a
  token missing a claim the contract requires is not a member with no history, it is a token this
  service cannot authorize. Never degrade to an empty listing.
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
enum Reason {
  REASON_UNSPECIFIED = 0;
  SETTLE_AUCTION     = 1;  // the winning bid pays; the only reason with a caller today
  DEPOSIT            = 2;  // forward-declared — see requirement 5a
  WITHDRAW           = 3;  // forward-declared — see requirement 5a
  TRANSFER           = 4;  // forward-declared — see requirement 5a
}
```

### Write path — `AppendLedgerTx` (gRPC only)

**`AppendLedgerTxRequest`** — writable fields only; caller identity comes from transport
metadata, never the body (requirement 16).

| Field | Type | Notes |
|---|---|---|
| `transaction_id` | `string` (UUID) | Caller-minted, deterministic. The idempotency key. |
| `reason` | `Reason` | Transaction-level. `UNSPECIFIED` is refused. |
| `reference_id` | `string` (UUID) | Transaction-level. The originating event — today, wallet-service's `bid_id`. |
| `currency` | `string` | Transaction-level. Optional; defaults to `GOLD`. |
| `legs` | `repeated LedgerLeg` | Min 2. Leg-level facts only. Proto-side name; see the transport-type table under the read path for the HTTP-side names. |

**`LedgerLeg`**

| Field | Type | Notes |
|---|---|---|
| `account_id` | `string` (UUID) | Soft reference to `wallet-service.accounts.id`. |
| `direction` | `Direction` | Carries the sign. |
| `amount` | `int64` | Strictly positive. |

> The split is deliberate and mirrors the schema: **transaction-level facts sit outside the
> slice, leg-level facts inside.** `reason`, `reference_id`, and `currency` describe the event;
> `account_id`, `direction`, and `amount` describe one side of it.
>
> **`currency` moved off the leg**, and that is what makes requirement 8's one-currency-per-
> transaction rule **structural rather than validated**. With one field on the parent there is no
> per-leg value to disagree, so "all legs share a currency" stops being a check that could be
> forgotten and becomes a shape that cannot express the violation.

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
| transaction already recorded, contradictory | `OK` · `applied = false` — deliberately indistinguishable from the identical case (open question 1). No `LEDGER_CONFLICT` code exists. |
| database unavailable | `Unavailable · TRANSIENT` |
| anything else | `Internal · INTERNAL_ERROR` |

### Read path — `getTransaction` and `listEntries` (HTTP via the gateway)

Paths are gateway HTTP. **Each maps to exactly one gRPC call into ledger-service** — identity,
role, and the caller's own `account_id` all arrive as verified token claims, so no operation
makes a second downstream call to resolve anything (requirement 27). Payloads are bare — no
envelope (requirement 31).

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

**Transport type names.** Pinned here so no slice has to invent them, and so the same row is not
called three things across three layers.

| Layer | Package | Type | Notes |
|---|---|---|---|
| persistence | `ledger-service/internal/ledger` | **`LedgerTransaction`** | The parent row as stored. Matches `ledger_transactions`. **Never serialized** (requirement 31). |
| persistence | `ledger-service/internal/ledger` | **`LedgerEntry`** | The leg row as stored. Matches `ledger_entries`. Owned by I-0017. **Never serialized** (requirement 31). |
| transport | `api-gateway/internal/gateway/ledger` | **`Entry`** | One flattened history row — the `entries[]` member. |
| transport | same | **`EntryPage`** | The `listEntries` response: `entries[]` plus `next_cursor`. |
| transport | same | **`Transaction`** | The `getTransaction` response, nesting `legs[]`. |
| transport | same | **`Leg`** | One side of a transaction — the `legs[]` member. |

> **The transport names are deliberately unprefixed.** In the gateway's `ledger` package they
> read `ledger.Entry` and `ledger.Transaction`; prefixing them to `ledger.LedgerEntry` would
> stutter, which the root CLAUDE.md's Go naming rule rules out. The unprefixed name is also what
> keeps requirement 31 honest — a transport `Entry` and a persistence `LedgerEntry` are visibly
> different types, so no one is tempted to pass one where the other belongs.
>
> `Transaction` here means the **economic event**, per `CONTEXT.md`. A database transaction is
> always qualified.

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

Two tables. **Transaction-level facts live on the parent; leg-level facts live on the child** —
the same split the `AppendLedgerTx` request draws, so the schema and the contract agree instead
of the schema denormalising every parent fact onto every leg.

```sql
CREATE TABLE ledger_transactions (
    -- caller-supplied and deterministic; the ledger never mints one, and there is
    -- no DEFAULT here on purpose (requirement 11)
    transaction_id UUID        PRIMARY KEY,
    reason         TEXT        NOT NULL,
    reference_id   UUID        NOT NULL,
    currency       TEXT        NOT NULL DEFAULT 'GOLD',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reason_valid   CHECK (reason IN ('SETTLE_AUCTION','DEPOSIT','WITHDRAW','TRANSFER')),
    CONSTRAINT currency_valid CHECK (currency IN ('GOLD'))
);

CREATE TABLE ledger_entries (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID        NOT NULL REFERENCES ledger_transactions(transaction_id),
    account_id     UUID        NOT NULL,
    direction      TEXT        NOT NULL,
    amount         BIGINT      NOT NULL,
    -- duplicated from the parent deliberately: it is what lets the history sort
    -- and page without a join. See the note below.
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT direction_valid CHECK (direction IN ('DEBIT','CREDIT'))
);

-- "what moved in this window" — reconciliation scans by time
CREATE INDEX ON ledger_transactions (created_at);
-- "what did this bid produce" — tracing an event back to its record
CREATE INDEX ON ledger_transactions (reference_id);
-- the read path's primary index: scoped history, sorted and paged, no join
CREATE INDEX ON ledger_entries (account_id, created_at, id);
-- the unscoped admin listing, same sort key
CREATE INDEX ON ledger_entries (created_at, id);
-- the FK join, and "give me both legs of this transaction"
CREATE INDEX ON ledger_entries (transaction_id);
```

**The duplication is sound only because `now()` is transaction-scoped.** Postgres' `now()` is
`transaction_timestamp()`, so the parent and every leg written in the same DB transaction get the
**identical** value. `clock_timestamp()` would not, and the legs of one movement would then sort
apart from each other and from their parent. This is load-bearing for requirement 23's keyset,
and it is the kind of thing a well-meaning change breaks silently.

**`created_at` is duplicated onto the leg on purpose.** It is a transaction-level fact, so
normalising it away would be the textbook call — and it would put a join inside the keyset
predicate of every history page. The duplicate is written once by an append-only table that
never updates, so the usual cost of denormalisation (two copies drifting) cannot occur here.
This is what makes `(account_id, created_at, id)` serve the read path directly.

**There are no unique constraints beyond the two primary keys, and that is deliberate.**
`transaction_id` — the parent's PK, caller-supplied, no `DEFAULT` — is the *sole* idempotency
guard (requirement 13, open question 1). Every richer natural key that was considered turned out
to encode a domain rule that real operations break; see [Open questions](#open-questions) and
[Rejected alternatives](#rejected-alternatives).

The migration that creates this also **drops `ledgers`** (requirement 17). Per-column detail
belongs in `game-server/ledger-service/docs/schema/`, replacing the existing `ledgers.md`.

## Open questions

**All three are RESOLVED.** They are kept here, rewritten as decisions, because the reasoning is
what stops them being reopened — and two of them were reopened once already. Nothing in this
section is still a choice.

**1. Is there a natural key for a transaction? — RESOLVED: no, and there must not be.**

Scoping assumed a four-column unique index, `(reason, reference_id, account_id, direction)`,
identifying the *fact* while `amount` carried its *content*. The question was what to do about a
retry carrying a corrected amount.

**The answer is that the premise was wrong.** That index is not a uniqueness constraint, it is a
**domain rule in disguise** — it asserts that one account can be debited at most once per
reference for a given reason. Real operations break that assertion routinely:

- a **partial refund** against the same reference
- a **second fee** on one settlement
- an **admin adjustment** touching an account already involved

Each is legitimate, and each collides. A constraint that a correct operation violates is a bug
that surfaces in production as a mysterious duplicate error.

**Decision: `transaction_id` — the parent's primary key — is the sole idempotency guard.** The
append does `ON CONFLICT DO NOTHING` on the parent insert; **0 rows affected means already
recorded**, so the service returns success (requirement 12) and skips the legs entirely. One
guard, at one place, enforced by the database.

The corrected-amount case dissolves with the premise: a caller re-deriving the same
`transaction_id` for a genuinely different movement is a caller bug, and requirement 13's
stability rule is what prevents it.

**2. Should the transaction be its own row? — RESOLVED: yes, two tables.**

`ledger_transactions` parent, `ledger_entries` legs, per §Data model. Transaction-level facts
stop being denormalised onto every leg, and the schema now matches the `AppendLedgerTx`
signature instead of contradicting it.

**But not the unique constraints the original recommendation proposed.** Neither
`UNIQUE(reason, reference_id)` nor `UNIQUE(transaction_id, account_id, direction)` is created —
both are the same mistake as question 1's index, one level up. The parent's PK is
`transaction_id`, caller-supplied, **with no `DEFAULT`**, and it is the only uniqueness the
schema asserts.

*Noted but not adopted:* requirement 7 puts sum-to-zero in the service layer, and Postgres could
enforce it with a `DEFERRABLE INITIALLY DEFERRED` constraint trigger summing signed legs per
`(transaction_id, currency)` at commit. That remains the one place the database could catch a
service-layer bug in this service's central invariant. Not built here.

**3. Should the legal set of `reason` be closed at the schema level, in the type system, or

**3. Should the legal set of `reason` be closed at the schema level, in the type system, or
both? — SETTLED.**

> This question originally covered `reference_type` too, which has since been removed from the
> feature entirely.

**Answer: both, and the set is `SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`** — a proto
enum and a DB `CHECK`, matching. Recorded in requirement 5a; the `CHECK` is already in
`000001_create_ledger_transactions_and_entries.up.sql`.

The set is **closed now and forward-declared**, rather than added one value at a time as callers
appear. The cost of closing it early — a migration per new reason, landing before the code that
emits it — is real, and in an append-only financial table it is a feature: a new economic reason
becomes a deliberate, versioned event rather than a string someone typed. The benefit is that
deposits, withdrawals, and transfers need **no ledger change at all** when their verbs get built.

The proto enum and Go value type are the enforcement that matters, because they sit where bad
input arrives. The `CHECK` is the backstop, consistent with `direction`'s existing precedent.

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
| [ADR-0010](../adr/0010-the-ledger-is-appended-past-the-saga-pivot.md) | the ledger is appended only past the saga's pivot, so nothing recorded is ever wrong and no reversal exists | 2–3, 9 |

Open questions 1 and 2 below are explicitly **left unsettled by ADR-0008 and ADR-0009** — both
ADRs name them rather than resolving them.

> **ADR-0007 is amended, not superseded, by [ADR-0010](../adr/0010-the-ledger-is-appended-past-the-saga-pivot.md).**
> Its append-only clause stands and is load-bearing. Its *"corrections are reversals"* clause is
> replaced: the settlement saga appends only past its pivot, once the money is final, so no
> recorded transaction is ever wrong and there is nothing to reverse. ADR-0007's body is
> immutable and still describes the old mechanism; its header points at ADR-0010.

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
- **The four-column unique index itself** — `(reason, reference_id, account_id, direction)`,
  rejected once the question above was examined properly. It is not a uniqueness constraint but a
  **domain rule wearing one's clothes**: it asserts an account can be debited at most once per
  reference per reason. Partial refunds, a second fee on one settlement, and admin adjustments all
  break that assertion legitimately, and each would surface as an unexplained duplicate error in
  production. `transaction_id` alone carries idempotency (open question 1).
- **`UNIQUE(reason, reference_id)` on the parent, and `UNIQUE(transaction_id, account_id,
  direction)` on the legs** — the shape open question 2 originally recommended. Rejected for the
  same reason one level up: both encode domain assertions that correct operations violate.

## Out of Scope

- **The deposit, withdraw, and transfer *verbs*.** Building those operations is wallet-service's
  work and is not in this feature. **Recording their effects is not out of scope** — their
  `reason` values are already in the enum and the `CHECK`, and requirement 5a says they append
  here with no schema change when their callers exist. The earlier wording of this bullet
  conflated the verb with the record; they are different things and only the verb is excluded.
- **System / mint accounts.** The counter-account a deposit or withdrawal needs on its other leg,
  so the transaction sums to zero. **Its absence blocks the caller, not the ledger** — this
  service records whatever balanced legs it is handed and never resolves an `account_id`
  (requirement 15). Deciding who owns that account belongs to wallet-service.
- **The settlement saga itself.** Its orchestration, its pivot, and its compensation steps live
  in marketplace-service and wallet-service. This feature only depends on the *ordering* the saga
  guarantees (requirement 2); it does not implement or specify it.
- **The saga's ordering guarantee.** [ADR-0010](../adr/0010-the-ledger-is-appended-past-the-saga-pivot.md)
  records the pivot decision this feature depends on, but ledger-service **cannot enforce it** —
  nothing here can check that its caller is past the pivot. Verifying the ordering belongs to
  whoever specifies the saga.
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
- **Any player-facing UI.** No `game-client` screen consumes this read path, and none is planned.
  The generated TypeScript client still gains both operations — generation covers the whole
  gateway surface (requirement 32) — it simply has no caller. Member-scoped reads exist so the
  authorization model is complete and correct, not to serve a screen: requirements 25–27 are the
  rule that a member reaching this API sees only their own rows, whoever eventually calls it.
- **Issuing the `role` and `account_id` claims.** This feature reads both from verified token
  metadata and scopes by them (requirements 27, 29). Minting them — auth-service's contract, the
  signup flow that creates a member and their account together, and the token's shape — belongs to
  a separate feature. This feature builds only the seam that consumes them.
- **Resolving a member to more than one account.** Requirement 27's singular `account_id` claim
  assumes one account per member per currency. Supporting a set of accounts, or a second currency,
  is out of scope and is the named trigger to revisit both that requirement and requirement 8.
- **Filtering `listEntries` by `reference_id`.** Worth noting the argument for it so it is not
  re-derived: with reversals gone, one settlement is one transaction, so today
  `getTransaction` already answers *"what happened to this bid"* once you have the id. A filter
  earns its keep only when one `reference_id` can produce several transactions — which is not
  true now and may become true if a future reason ever splits a settlement. Left out; an optional
  query param is non-breaking to add later.
- **`reference_type`.** Removed from the feature entirely. `reference_id` alone carries the
  originating event; a second discriminator was never load-bearing while `BID` was the only
  value, and adding one later is non-breaking.
