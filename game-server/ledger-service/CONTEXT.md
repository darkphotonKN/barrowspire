# CONTEXT — ledger-service

Ubiquitous language for the **ledger-service** bounded context: the **reconciliation context**.

Terms below mean exactly this *inside ledger-service*. Several of them — `account`, `hold`,
`balance` — also exist in wallet-service and mean something different there. That divergence is
deliberate; see [Boundaries](#boundaries) for which context owns what.

Sources: [FS-0003](../../docs/specs/0003-append-only-gold-ledger.md), ADR-0005 … ADR-0012.

## Terms

### The record

- **Movement** — a completed transfer of gold between accounts. The only thing this service records.
- **Transaction** — the aggregate root: one movement, written as a set of legs sharing a `transaction_id` whose signed amounts sum to zero. Fields: `transactionID`, `referenceID`, `reason`, `currency`, `legs`. **Always the economic event, never the database mechanism** — see [DB transaction](#db-transaction).
- **Leg** — a value object inside a Transaction: `accountID`, `direction`, `amount`. No identity, no timestamp, never addressed alone. It exists only as part of a balanced set.
- **Entry** — the persisted, readable form a leg becomes. **Not a synonym for leg, and the two must not merge** — an entry carries strictly more than a leg does, and the difference is what the read path is for. Three names, three widths, all deliberate:

  | Name | Where | Is | Adds over the one above |
  |---|---|---|---|
  | `Leg` | domain | `accountID`, `direction`, `amount` | — |
  | `LedgerEntry` | persistence | the `ledger_entries` row | `id`, `transaction_id`, `created_at` |
  | `Entry` | transport | one flattened history row | `reference_id`, `reason`, `currency` from the parent |

  A leg is meaningless alone; an entry is designed to stand alone, which is why it carries its parent's facts down with it (§Req 22).
- **Balanced** / **sum-to-zero** — the invariant that a transaction's legs net to zero, mapping `DEBIT` to negative and `CREDIT` to positive. **The invariant that makes this a ledger and not a log.** Enforced in the aggregate's constructor, never by the database.
- **Direction** — `DEBIT` or `CREDIT`. Carries the sign, because `amount` never does.
- **Amount** — a strictly positive integer quantity of gold. Unsigned in meaning; a negative amount is unrepresentable, not merely rejected (ADR-0008).
- **Currency** — the unit a transaction is denominated in. `GOLD` is the only one; transaction-level, and all legs share it, because sum-to-zero across mixed currencies is meaningless.
- **Reason** — why a transaction exists, as a closed set: `SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`. Transaction-level, never leg-level. Only `SETTLE_AUCTION` has a caller today; the rest are forward-declared and need no schema change to start recording.
- **Reference** — the originating event a transaction records, held as `reference_id`. Transaction-level. **Unaided** — there is no reference *type* beside it; the id carries the meaning alone. Today it is the winning bid.
- **Applied** — the outcome of an append: `true` the transaction was recorded, `false` it already existed. **`false` is a success, not an error** — it is what idempotency looks like from the caller's side.

### Append-only

- **Append-only** — rows are inserted and never `UPDATE`d or `DELETE`d. Enforced by the absence of a repository method, not by a rule someone remembers (ADR-0007).
- **Pivot** — the settlement saga's point of no return: the first movement of real gold, at `CommitHold`. **This context's word for "when it becomes recordable."** Before it, a failure compensates and the ledger is never called; after it, the saga only rolls forward and the append is one of those forward steps.
- **Reversal** — **not a term in this context.** There is no correction mechanism, because requirement 2 orders the write so that nothing correctable is ever written (ADR-0010 amending ADR-0007). If you need the word, you are describing the saga's pre-pivot compensation, which happens in marketplace-service and wallet-service and leaves no ledger row.

### Identity and idempotency

- **`transaction_id`** — the caller-minted, deterministic UUID identifying one economic event. The ledger never mints one (ADR-0009). It is the **sole** idempotency guard; there is no unique constraint beyond it and the entries' own primary key.
- **Idempotency** — the property that re-posting the same `transaction_id` writes nothing and succeeds, reported as `applied: false`. Owned by the caller, because only the caller knows which event it is retrying.
- **`account_id`** — a **soft reference** to `wallet-service.accounts.id`. A key this context stores and matches on, never one it resolves, validates, joins to, or looks up. No FK.

### The read path

- **Reconciliation record** — what this service *is*: the independent second record that makes a discrepancy detectable. Its value comes from never being the record anyone reads in normal operation.
- **Reconciler** — the future consumer that compares ledger to wallet. Out of scope for FS-0003; the reason this service exists.
- **Sort key** — the `(created_at, id)` pair a page resumes from. **What a cursor encodes, and all it encodes** (ADR-0012).
- **Cursor** — the opaque wire form of a sort key: base64url of `created_at|id`. Not an offset and not a page number. **Opaque is a promise to clients, not a mechanism** — it carries no identity and no filter state, so possessing one grants no authority and scoping is re-read from the token on every page.
- **Role** — `member` or `admin`, taken from the verified token. Scopes a read; never supplied as a parameter. *Not yet issued by auth-service — a named prerequisite, not a current capability.*

## Structural vocabulary

How the layers are named here. This is a **hexagonal, CQRS-lite** shape, and it differs from
wallet-service's on purpose — an append-only context has no read-modify-write to protect.

- **Use case** — the application service in this context. Coordinates the aggregate and the repository; holds no business rules of its own. **There is no service layer** — the shape is `handler → usecase → repository`. Files are `usecase/{verb}_{noun}_usecase.go`.
- **Command** — an inbound application write intent, named `{Verb}{Noun}Command`.
- **Handle vs Execute** — writes **`Handle`** a Command; reads **`Execute`** a query. Not interchangeable, and the verb tells you which side of CQRS you are on before you read the body.
- **Repository** — access to **aggregate roots only**. Here it is insert-only: one method, `Append`. **No update, no delete, and no read** — enforced by absence.
- **Read model / DTO** — reads bypass the domain entirely. `query/` holds `*sqlx.DB` directly and returns a `dto` type. No aggregate, no reconstitution, **and no repository method**: a flat row is not an aggregate, so it does not belong on a Repository. `db` struct tags are fine on a DTO precisely because it never loads through the domain.
- **Driving adapter** — inbound. Two here: `grpc/` for reads, `activity/` for the write. Same role, different transport.
- **Driven port** — an interface the domain declares for infrastructure. **Exactly one exists:** `domain/ledger.Repository`. The read path has none, deliberately — it has no invariant to protect and nothing to substitute.
- **Published Language** — `common/api/activity/ledger` and `common/api/proto/ledger`. What other services import. **Domain types never cross this line;** the adapter translates.
- **Snapshot** — the only way data leaves the domain package, because its fields are private.
- **Non-retryable** — an error the activity must fail on rather than retry. **`ledger.IsNonRetryable` in `domain/ledger/errors.go` is the single source of truth**, and the activity's retry policy is built from it (ADR-0011; FS-0003 §API surface's write-path error table is the set it must cover). Stated in the **negative on purpose**, and spelled to match this document's own term exactly: Temporal declares a *non-retryable set* and retries everything else, so the classification that has to be explicit is the one that stops a retry. A positive predicate would name the default and leave the dangerous case implicit — and the dangerous case here is a settlement saga past its pivot retrying a validation failure forever. **An error the predicate does not recognise is retryable**, which is why the sentinel list it closes over is the thing to keep exhaustive.

## Retired vocabulary — do not reintroduce

These appear in git history, in stale comments, in the scaffold still being torn down, and in
sibling services that made a different call. An agent that finds one and tries to be helpful
will reintroduce a decision that was made and reversed. Each is dead for a stated reason.

| Retired | Why it is gone |
|---|---|
| `Ledger` aggregate, `CreateLedger`, `GetLedger` | Scaffold. Dropped with the `ledgers` table (§Req 17–18). |
| `Reconstitute` | Nothing rebuilds the aggregate. It exists only at birth — reads never load it. |
| `version`, OCC, `withRetry`, `ErrConcurrentModification` | Nothing loads-and-mutates, so there is nothing to guard (§Req 17, ADR-0007). **wallet-service has these and must keep them; ledger must not.** |
| `ReferenceType` | Cut from the feature. `reference_id` carries the meaning unaided. |
| `SETTLE_AUCTION_REVERSAL`, `ReverseCommit` | The pivot moved to `CommitHold`, so reversal is unreachable (ADR-0010). |
| `AppendLedgerTx` **as an RPC** | It is a Temporal activity and appears in no `.proto` (ADR-0011). The *name* is live; the *transport* is not. |
| Unique constraints beyond the two PKs | `transaction_id` is the sole idempotency guard (§Open question 1). |
| `IsPermanent`, "permanent error" | Considered while building the classifier, dropped. **"Permanent" is already this context's word for a row that can never be corrected** — ADR-0010: *"an incorrect row is now permanent"*. Reusing it for retry classification makes one word mean two unrelated things within a paragraph of each other. `IsNonRetryable` says only what it means. |
| `IsRetriable` | wallet-service's and marketplace-service's spelling, in the positive. **Not a name to converge on here** — ledger classifies in the negative because Temporal declares a *non-retryable* set (ADR-0011), so flipping the polarity for cross-service consistency inverts what the retry policy consumes. Both spellings are correct in their own context. |

## Boundaries

### `account` — wallet owns the record, ledger holds a key

| | wallet-service | ledger-service |
|---|---|---|
| **`account`** | an entity with a balance, holds, and a lifecycle | an opaque UUID appearing on entries |
| **lookup** | yes — `GetAccount` | never; no FK, no join, no existence check |
| **"account not found"** | a real error | not expressible; an unknown `account_id` is recorded without complaint |

An entry referencing an account wallet has never heard of is **valid here** and is a reconciler
finding. Treating it as a write-time error would require the cross-service read this boundary
exists to forbid.

### `balance` — wallet's word, and it does not cross

**`balance` has no definition in this context, deliberately.** `wallet-service.accounts.gold` is
the sole source of truth (ADR-0005). ledger-service exposes no balance query, no total, and no
sum over entries.

The ledger answers *"why is this number what it is"*. It never answers *"what is the number"*.
Reintroducing the word here is the first step of the failure ADR-0005 exists to prevent — if you
find yourself needing it, you are describing the reconciler or wallet, not this service.

### `hold` — wallet's lifecycle, visible here only by its outcome

A **hold** is an intention to move gold, and it belongs entirely to wallet-service. This context
has no term for it because it records none of it:

| wallet verb | ledger consequence |
|---|---|
| `PlaceHold` | nothing — an intention is not a movement |
| `ReleaseHold` | nothing — gold was parked and unparked |
| `CommitHold` | nothing *yet* — it is the saga's **pivot**, not the ledger's trigger |
| the saga's final roll-forward step | **one transaction, two legs**, once all money steps succeeded |
| failure before the pivot | nothing — compensated in reverse, no gold moved |

Holds outnumber movements heavily — a 47-bid settlement produces exactly two rows. "The ledger
records movement, not the auction."

### <a id="db-transaction"></a>`transaction` — economic event vs. database mechanism

**The single highest-value entry in this file.** Every other ambiguity here is cosmetic; this one
produces wrong code, and the two meanings sit adjacent in the same code path:

- **Transaction** (this context) — the economic event. Has legs, a reason, a reference, and must balance.
- **DB transaction** — the atomicity mechanism that commits a transaction's legs together or not at all (§Req 7–8).

**Always qualify the second — say "DB transaction", always.** Unqualified `transaction` means the
economic event. A variable named `tx` holding a `*sql.Tx` in code that also handles ledger
transactions is how this gets confusing — and per FS-0003's transaction-boundary rule, `*sql.Tx`
never appears in a use-case signature anyway.

### `leg` vs `entry` — related, not interchangeable

Not a boundary between services, but the place this context's own vocabulary is most often
flattened by mistake. The widths are in [Entry](#terms) above; the rule for naming:

**Leg on the write path and inside the aggregate; entry in storage and on the read path.** If a
name has to pick one and the context is genuinely ambiguous, prefer `entry` — it is the persisted
noun and the one the schema uses. What you must not do is treat a `Leg` and an `Entry` as the
same shape: `Entry` carries parent facts a `Leg` deliberately lacks, and a mapping that assumes
otherwise silently drops `reason`, `reference_id`, and `currency`.

### The one name per layer

Pinned in FS-0003 §API surface so no slice invents its own. Repeated here because this is where
someone looks first:

| Layer | Package | Type | Reads as |
|---|---|---|---|
| domain | `ledger-service/internal/ledger/domain/ledger` | `Transaction`, `Leg` | the aggregate and its value object. **Never serialized.** |
| persistence | `ledger-service/internal/ledger` | `LedgerTransaction`, `LedgerEntry` | the rows as stored. **Never serialized** (§Req 31). |
| proto | `common/api/proto/ledger` | `GetTransactionResponse`, `Leg`, `Entry` | the read surface. No write message exists (ADR-0011). |
| transport | `api-gateway/internal/gateway/ledger` | `Transaction`, `Leg`, `Entry`, `EntryPage` | `ledger.Transaction`, `ledger.Entry`, … |

The transport names carry no `Ledger` prefix on purpose: inside the `ledger` package it would
stutter, and the visible difference between `Entry` and `LedgerEntry` is what stops a persistence
struct from drifting onto the wire.
