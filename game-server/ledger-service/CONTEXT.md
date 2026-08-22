# CONTEXT — ledger-service

Ubiquitous language for the **ledger-service** bounded context: the **reconciliation context**.

Terms below mean exactly this *inside ledger-service*. Several of them — `account`, `hold`,
`balance` — also exist in wallet-service and mean something different there. That divergence is
deliberate; see [Boundaries](#boundaries) for which context owns what.

Sources: [FS-0003](../../docs/specs/0003-append-only-gold-ledger.md), ADR-0005 … ADR-0009.

## Terms

### The record

- **Movement** — a completed transfer of gold between accounts. The only thing this service records.
- **Transaction** — one movement, written as a set of legs sharing a `transaction_id` whose signed amounts sum to zero. **Always the economic event, never the database mechanism** — see [DB transaction](#db-transaction).
- **Leg** — one side of a transaction: whose gold, which way, how much. A leg is meaningless alone; it exists only as part of a balanced set.
- **Entry** — the persisted row for a leg. **Same row as a leg**, named for the lens: *leg* when the balancing relationship matters (write path, validation), *entry* when the row stands on its own (storage, history reads). `ledger_entries` and `listEntries` use the second; the proto's `LedgerLeg` uses the first.
- **Balanced** / **sum-to-zero** — the invariant that a transaction's legs net to zero, mapping `DEBIT` to negative and `CREDIT` to positive. Enforced in the service layer, never by the database.
- **Direction** — `DEBIT` or `CREDIT`. Carries the sign, because `amount` never does.
- **Amount** — a strictly positive integer quantity of gold. Unsigned in meaning; a negative amount is unrepresentable, not merely rejected (ADR-0008).
- **Currency** — the unit a transaction is denominated in. `GOLD` is the only one; all legs of a transaction share it.
- **Reason** — why a transaction happened, as a closed set. Transaction-level, never leg-level.
- **Reference** — the originating event a transaction records, held as `reference_id`. Transaction-level. Today the winning bid.

### Append-only

- **Append-only** — nothing is ever `UPDATE`d or `DELETE`d. Enforced by the absence of a repository method, not by a rule someone remembers (ADR-0007).
- **Pivot** — the settlement saga's point of no return: the first movement of real gold. **This context's word for "when it becomes recordable."** Before it, a failure compensates and the ledger is never called; after it, the saga only rolls forward and the append is one of those forward steps.
- **Reversal** — **not a term in this context.** There is no correction mechanism, because requirement 2 orders the write so that nothing correctable is ever written. If you need the word, you are describing the saga's pre-pivot compensation, which happens in marketplace-service and wallet-service and leaves no ledger row.

### Identity and idempotency

- **`transaction_id`** — the caller-minted, deterministic UUID identifying one economic event. The ledger never mints one (ADR-0009).
- **Idempotency** — the property that re-posting the same `transaction_id` writes nothing and succeeds. Owned by the caller, because only the caller knows which event it is retrying.
- **`account_id`** — an opaque reference to `wallet-service.accounts.id`. A key this context stores and matches on, never one it resolves, validates, or joins to a record it owns.

### The read path

- **Reconciliation record** — what this service *is*: the independent second record that makes a discrepancy detectable. Its value comes from never being the record anyone reads in normal operation.
- **Reconciler** — the future consumer that compares ledger to wallet. Out of scope for FS-0003; the reason this service exists.
- **Cursor** — an opaque keyset position over `(created_at, id)`. Not an offset, and not a page number.
- **Role** — `member` or `admin`, taken from the verified token. Scopes a read; never supplied as a parameter. *Not yet issued by auth-service — a named prerequisite, not a current capability.*

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

The single most collidable word here, and the two meanings sit adjacent in the same code path:

- **Transaction** (this context) — the economic event. Has legs, a reason, a reference, and must balance.
- **DB transaction** — the atomicity mechanism that commits a transaction's legs together or not at all (FS-0003 §Req 7–8).

**Always qualify the second.** Unqualified `transaction` means the economic event. A variable
named `tx` holding a `*sql.Tx` in code that also handles ledger transactions is how this gets
confusing — and per FS-0003's transaction-boundary rule, `*sql.Tx` never appears in a
service-layer signature anyway.

### `entry` vs `leg` — one row, two lenses

Not a boundary between services, but the one place this context's own vocabulary doubles up.
The rule: **leg on the write path, entry on the read path and in storage.** If a name has to
pick one and the context is ambiguous, prefer `entry` — it is the persisted noun and the one
the schema uses.
