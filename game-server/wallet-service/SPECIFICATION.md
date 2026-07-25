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
- **transaction_id** — the saga / idempotency correlation thread tying a hold back to the
  bid that caused it.

## Aggregate & Entities

- **Account is the aggregate root.** All invariants and state changes go through it.
- **WalletHold is an entity INSIDE the Account aggregate** — it has no repository, no port,
  and no use case of its own. It is only ever loaded and mutated through its owning Account.
  There is deliberately no standalone Hold aggregate.
- The Account is loaded together with its holds as a single unit.

## Invariants

- **Account birth** (NewAccount): `gold ≥ 0`; a member must be present.
- **Account lifetime** (enforced when placing a hold): `balance − Σ(active RESERVED holds) ≥ 0`.
  An account can never be over-committed.
- **Hold birth**: `amount > 0`; born in status `RESERVED`; `transaction_id` present;
  `account_id` set from the owning account.
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

- **Pessimistic model** — reserve/deduct first (no optimistic rollback of spent gold).
- **Concurrency guard** — `SELECT FOR UPDATE` on the account row while placing a hold,
  serializing concurrent holds against the same account. Chosen over optimistic versioning
  to match the pessimistic stance.
- **Idempotency** — `UNIQUE(transaction_id)` on holds. A redelivered PlaceHold no-ops
  (ON CONFLICT DO NOTHING) rather than double-reserving.

## Reliability

- **Transactional outbox from day one** — a hold's state change and its outbound event are
  written **in the same transaction** as the aggregate save. This is a foundational
  requirement, not a later TODO. A relay process publishes outbox rows; consumers dedup.

## Read Path (CQRS)

- **GetAccountBalance** / **GetHolds** — read queries.
- **available** = `balance − Σ(active holds)`, **computed in the read query, never stored.**

## Inbound Interfaces

- **AMQP consumer (primary)** — saga events drive all writes (PlaceHold / ReleaseHold /
  CommitHold / Credit).
- **gRPC read path** — serves the gateway for balance / holds reads.

## Data Model

Per-table detail (fields, keys, states, constraints, references) lives in `docs/schema/`:
- [`docs/schema/accounts.md`](docs/schema/accounts.md)
- [`docs/schema/wallet_holds.md`](docs/schema/wallet_holds.md)

## Status

### ✅ Done
- Service scaffolded, boots, and wired into infra (gRPC, AMQP, outbox, discovery, OTel).

### ⏳ Planned / Not started
- **Account aggregate** + **PlaceHold** verb + the balance/lifetime invariant + the hold FSM.
- **AccountRepository** that persists an account and its holds in **one transaction**.
- **PlaceHold use case** + **transactional outbox** (first slice — in progress).
- Then **ReleaseHold** / **CommitHold** (compensation + settlement).
- Full **saga participation** (Credit at settlement; end-to-end marketplace flows).
