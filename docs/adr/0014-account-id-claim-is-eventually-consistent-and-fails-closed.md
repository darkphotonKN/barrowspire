# ADR-0014 — The `account_id` claim is a denormalized, eventually-consistent copy, and its absence fails closed

Status: accepted
Date: 2026-09-02
Scope: `game-server/auth-service` (the minter and the copy), `game-server/wallet-service` (the
source of truth) — and the shape any future cross-service token claim follows unless an ADR
says otherwise
Realized by: FS-0006 (draft) — `docs/specs/0006-account-and-role-token-claims.md`

## Context

FS-0003 §Requirement 27 designed the ledger read path around a member's `account_id` arriving
as a **verified token claim**, explicitly to avoid "a round trip on every page, plus a new
failure mode on a read path that otherwise has none." It then deferred the minting to a later
auth feature, asserting as it went that *"signup creates the member and their account together,
so the claim is always present and immutable."*

**That assertion is not true of the code.** `wallet.CreateAccount` has no caller anywhere in
the repo; no wallet account has ever been created for any member. So the claim's promised
always-present property was never actually purchased — it was assumed.

Three forces bear on how it gets purchased now:

**The identifier cannot be computed.** `wallet.accounts.id` is a fresh `uuid.New()`. It is
`UNIQUE` 1:1 with `member_id` but is not equal to it, so nothing derives it from `sub`.

**The obvious lookup is circular.** Both `CreateAccountRequest` and `GetAccountRequest` are
empty by design — wallet derives the member from the *caller's* token via the auth interceptor.
At login there is no such token yet: the credential needed to make the call is the credential
being minted.

**The claim is not a source of truth, and that is what makes staleness cheap.** Nothing
authoritative reads it. Wallet resolves the account server-side from the caller's identity for
every balance and hold operation; the ledger holds no account records at all (FS-0003 §Req 15).
The claim exists solely to *scope a read* without a lookup. A wrong or missing value therefore
cannot corrupt a balance, double-spend a hold, or write a bad ledger row — the worst it can do
is deny a read.

This decision was **recorded without adversarial review**. `/challenge-me` was offered at the
pre-lock gate and declined.

## Decision

**auth-service holds a denormalized `members.account_id`, populated asynchronously through a
transactional outbox on the producing side and a deduplicating inbox on the consuming side.
The login path never calls wallet-service. Every consumer of the claim fails closed when it is
absent.**

Concretely:

1. `member.signedup` (already published via auth's existing outbox) is consumed by
   wallet-service, which creates the account.
2. Wallet publishes `account.created` through a transactional outbox — written in the same
   transaction as the account insert.
3. auth-service consumes `account.created` through an inbox that marks the event processed
   inside the same transaction as the column write, following the pattern already working in
   notification-service (`processed_events` + `MarkEventProcessed` + `ErrAlreadyProcessed`).
4. When `members.account_id` is NULL, the minter **omits the claim entirely** rather than
   emitting an empty value. A missing key is unambiguous; an empty string invites a truthiness
   bug at the boundary.
5. A token without the claim is rejected — `401 · UNAUTHENTICATED` per FS-0003 — never
   silently narrowed to an empty result.

**Rejected alternatives**, each with the reason it lost:

- **Synchronous wallet RPC at login** (`GetAccountByMember`). Puts wallet on the login path; a
  wallet outage becomes a login outage. Trading a total auth failure for a partial read failure
  is the wrong direction.
- **Resolve at the gateway per request.** Reintroduces exactly the hop FS-0003 §Req 27 removed.
- **Derive the id deterministically** (`accounts.id = member_id`, or `UUIDv5(ns, member_id)`).
  Genuinely attractive: zero I/O, zero storage, zero backfill, no ordering window, and the
  always-present property becomes *structural* rather than operational. Rejected because it
  welds wallet's primary key to auth's identifier space — the 1:1 that makes it safe today is
  an artifact of one-account-per-member, the same assumption FS-0003 §Req 27 already flags as a
  revisit trigger.
- **auth assigns the id and tells wallet.** Removes the round trip while keeping the ids
  independent, but auth would own wallet's primary key, contradicting ADR-0005's ownership
  line.

## Consequences

**Good**

- The login path gains no new synchronous dependency. Wallet can be down and members still
  authenticate; only ledger reads degrade, and they degrade to a clear `401` rather than a
  wrong answer.
- The ledger read path stays at one hop, which is what FS-0003 §Req 27 bought and this decision
  preserves.
- Failure is bounded by construction. Because the claim scopes reads and nothing else, the
  blast radius of staleness is "cannot read own history yet", never a financial inconsistency.
- The outbox/inbox pair is exactly-once *in effect* on both legs, reusing machinery that
  already exists (`common/outbox`, notification-service's inbox shape) rather than inventing a
  delivery guarantee.

**Bad, and accepted**

- **A member can log in before their claim exists.** There is a real window between signup and
  the event landing. During it, a valid, authenticated member is refused on ledger reads. This
  is correct behavior, but it will read as a bug to whoever hits it first.
- **The always-present-and-immutable property FS-0003 §Req 27 assumed is now false.** Anything
  written against that assumption must be re-read. The claim is eventually present, not always
  present.
- **Existing members never get a claim.** No backfill is in scope (FS-0006, Decision 3), and
  since nothing has ever created an account, *every* member currently in any database is a
  pre-existing member. On deploy the claim is minted for nobody; only post-deploy signups get
  one. Accepted because the repo is pre-launch.
- **Two writes now describe one fact.** `wallet.accounts.id` is the truth and
  `members.account_id` is a copy that can diverge — from a dropped event, a wedged consumer, or
  a manual fix on one side. There is no reconciler. If they diverge, the symptom is a member
  reading someone else's scope or nothing at all, and nothing detects it.
- **Two more services need an inbox**, and the only implementation lives inside
  notification-service. Either it moves to `common/` or the pattern gets copied a third time.
- The plumbing cost is real: a migration, two consumers, one new outbox wiring, and a payload
  contract — to deliver a value that a deterministic id would have provided for free. If the
  loop proves more expensive than it is worth in practice, the derived-id alternative above is
  the one to revisit.

**Revisit when** a member can hold more than one account — a second currency, or any second
wallet. A singular `account_id` claim is only correct while the 1:1 holds, which is the same
trigger FS-0003 §Req 8 and §Req 27 are already waiting on.
