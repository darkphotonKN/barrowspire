# SPECIFICATION — wallet-service

<!-- migrating to thin format: one line per capability, → FS-NNNN pointers -->

Living spec. Describes **behavior, entities, states, invariants, and contracts** — not
code or file paths. Everything is marked ✅ DONE vs ⏳ PLANNED. Per-table detail lives in
[`docs/schema/`](docs/schema/). Cross-service architecture context: [`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Purpose

wallet-service owns player **gold balances and holds** — the **economy bounded context**.
It is a **saga PARTICIPANT, never an orchestrator**: it reacts to marketplace saga events
by reserving, releasing, committing, and crediting gold. It never drives a cross-service
flow itself.

## Domain Terms

- **Account** — a player's gold wallet; the aggregate root. One per member.
- **Gold** — the currency unit (whole numbers).
- **Hold** (WalletHold) — a reservation of gold against an account for a pending bid; an
  entity that lives *inside* the Account aggregate.
- **Available** — spendable gold = `balance − Σ(active/RESERVED holds)`; a computed value,
  never stored.
- **bid_id** — the saga / idempotency correlation thread tying a hold back to the bid that
  caused it. `UNIQUE(bid_id)` on `wallet_hold` is the idempotency key.
- **version** — the Account's optimistic-concurrency counter, bumped on every save. Not a
  domain concept; it exists to detect lost updates across the load → modify → save cycle.

## Aggregate & Entities

- **Account is the aggregate root.** All invariants and state changes go through it.
- **WalletHold is an entity INSIDE the Account aggregate** — it has no repository, no port,
  and no use case of its own. It is only ever loaded and mutated through its owning Account.
  There is deliberately no standalone Hold aggregate.
- The Account is loaded together with its holds as a single unit.

## Invariants

- **Account birth** (NewAccount): a member must be present; a new account always starts at
  `gold = 0` and `version = 0`.
- **Account reconstitution** (Reconstitute): rebuilding from persisted state re-checks the
  lifetime invariant — a negative available balance means corrupt state (`ErrCorruptAccountState`).
- **Account lifetime** (enforced when placing a hold): `balance − Σ(active RESERVED holds) ≥ 0`.
  An account can never be over-committed.
- **Hold birth**: `amount > 0`; born in status `RESERVED`; `bid_id` present;
  `account_id` set from the owning account. Enforced in the private `newWalletHold`
  constructor, reachable only through `Account.PlaceHold`.
- **Hold FSM**: `RESERVED → COMMITTED` or `RESERVED → RELEASED`. Both COMMITTED and RELEASED
  are terminal. **There is no EXPIRED status** — expiry is a timestamp fact; a background
  sweeper RELEASES holds whose time has passed.

## Domain Verbs — the saga participant contract

- **PlaceHold** — reserve gold for a bid (creates a RESERVED hold). Enforces the lifetime
  invariant.
- **ReleaseHold** — compensation: return reserved gold (RESERVED → RELEASED). **Idempotent.**
- **CommitHold** — confirm at settlement (RESERVED → COMMITTED); deducts the reserved gold
  from the balance.
- **Credit** — pay a seller their proceeds at settlement.

## Consistency & Concurrency

- **Reserve-first model** — gold is reserved (held) before it is spent, so a failed saga
  compensates by RELEASING a hold rather than clawing back already-spent gold.
- **Concurrency guard — optimistic concurrency control (OCC)** ✅ IMPLEMENTED. The Account
  carries a `version`; `Save` writes with `WHERE id = $x AND version = $expected` and bumps
  the version. Zero rows affected means another writer won the race, and the repository
  returns the `ErrConcurrentModification` sentinel.
  - **Repository contract**: `Save` MUST return `ErrConcurrentModification` on a version
    mismatch — `account.IsRetriable` and the use case's `withRetry` both depend on it.
  - **Retry policy**: `withRetry` retries a racing write up to 5 times with random jitter,
    then gives up with `ErrMaxRetries` (surfaced as gRPC `Aborted`).
  - **Known trade-off**: under high contention on a single account, OCC degrades into retry
    storms. A row lock (`SELECT FOR UPDATE`) or `SERIALIZABLE` isolation is the intended
    escape hatch if that shows up in practice.
- **Read isolation** — `FindByID` loads the account and its holds inside one
  `REPEATABLE READ` read-only transaction, so the aggregate is reconstituted from a
  consistent snapshot.
- **Idempotency** — `UNIQUE(bid_id)` on `wallet_hold`. A redelivered PlaceHold for the same
  bid cannot double-reserve.

## Reliability

- **Transactional outbox** ⏳ PLANNED — a hold's state change and its outbound event must be
  written **in the same transaction** as the aggregate save. A relay process publishes outbox
  rows; consumers dedup. Shared machinery already exists in [`common/outbox`](../common/outbox)
  (model / repository / service / worker); wallet-service does **not** wire it up yet, so no
  domain event is currently published on a hold state change.

## Read Path (CQRS)

- **GetAccount** ✅ — returns gold, held gold, and available gold for a member. Implemented as
  a query that reads the tables directly and returns a DTO; it deliberately **does not load
  the Account aggregate**, because no invariant is being enforced on a read.
- **available** = `gold − Σ(RESERVED holds)`, **computed in the read query, never stored.**
- An account with no RESERVED holds still returns a row (`held_gold` 0, `available_gold` ==
  `gold`) — the read uses a LEFT JOIN so a hold-less account is not mistaken for a missing one.
- **GetHolds** ⏳ PLANNED — listing individual holds is not implemented yet.

## Inbound Interfaces

- **AMQP consumer (primary)** ⏳ PLANNED — saga events are intended to drive all writes
  (PlaceHold / ReleaseHold / CommitHold / Credit). Today the consumer only subscribes to
  `account.created` and logs the payload; it does not yet invoke any use case.
- **gRPC read path** ✅ — `GetAccount` serves the gateway. The member identity comes from the
  auth interceptor via context, never from the request body.
- **gRPC write path** ⏳ PLANNED — `PlaceHold` exists as a use case but is not yet exposed on
  the handler.

## Data Model

Per-table detail (fields, keys, states, constraints, references) lives in `docs/schema/`:
- [`docs/schema/accounts.md`](docs/schema/accounts.md)
- [`docs/schema/wallet_hold.md`](docs/schema/wallet_hold.md)

## Status

### ✅ Done

- Service scaffolded, boots, and wired into infra (gRPC, AMQP, discovery). **Not** OTel and
  **not** the outbox — neither is initialised in this service.
- **Account aggregate** — birth (`NewAccount`), reconstitution (`Reconstitute`), the
  balance/lifetime invariant, and `PlaceHold`. Holds are created only through the aggregate
  root via a package-private constructor.
- **AccountRepository** — `FindByID` (account + holds in one `REPEATABLE READ` read-only
  transaction), `Insert`, and `Save`. `Save` diffs a before/after snapshot and writes the
  account row plus new/changed holds in **one transaction**.
- **Optimistic concurrency** — `version` guard, the `ErrConcurrentModification` contract, and
  the `withRetry` helper (5 attempts, jittered).
- **CreateAccount** and **PlaceHold** use cases.
- **GetAccount** read query + gRPC handler, including the error → gRPC status mapping.
- **Domain tests** pinning the hold-birth (`amount > 0`), lifetime (`Σ RESERVED ≤ gold`), and
  born-RESERVED invariants, plus the `withRetry` boundary contract.

### ⏳ Planned / Not started

- **Hold FSM transitions** — only `RESERVED` (birth) exists. There is no method to move a hold
  to `COMMITTED` or `RELEASED` yet, so **ReleaseHold** / **CommitHold** / **Credit** are all
  unimplemented.
- **Wiring the write path** — `PlaceHold` is not reachable from either gRPC or AMQP.
- **Transactional outbox** — no domain event is published on a hold state change.
- **Expiry sweeper** — the `idx_wallet_hold_sweep` index exists for it, but no background job
  reads it.
- Full **saga participation** (end-to-end marketplace flows).

### ⚠️ Known gaps

- **Balance is never debited.** `CommitHold` does not exist, and no code path writes `gold`
  after account creation — accounts are created with 0 gold and there is no Credit verb yet.
  Consequently the `gold ≥ 0` invariant is stated but untested in practice.
