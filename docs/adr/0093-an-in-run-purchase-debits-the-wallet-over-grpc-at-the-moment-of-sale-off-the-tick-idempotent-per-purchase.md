# ADR-0093 — An in-run purchase debits the wallet over gRPC at the moment of sale, off the tick, idempotent per purchase

Status: accepted
Date: 2026-11-25
Scope: `game-server/game-service` (the run, its wallet consumer), `game-server/wallet-service`
(the debit), `game-server/common/api/proto/wallet`
Realized by: [FS-9JV5K](../specs/9JV5K-wandering-merchant.md) (the wandering merchant)
Builds on: [ADR-0005](0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet
owns the balance), [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (the caller mints the
key), [ADR-0044](0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md)
(the idempotent credit this debit mirrors)
Amended by: [ADR-0096](0096-an-in-run-purchase-whose-debit-outcome-is-unknown-is-released-and-logged-not-re-driven.md) — the
Consequences' accepted gaps (an unknown debit outcome is a second one)
Does not touch: [ADR-0011](0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md)
(the marketplace settlement saga keeps its Temporal activities)

## Context

The Spire gains its first vendor, a wandering merchant met on a floor, who sells health
potions, antidotes and, rarely, the Tome of Filth for the delver's account gold. Gold lives in
wallet-service (ADR-0005); the run lives in a game-service session whose tick must never wait on
the network.

The user set the mechanism in their own words: "It calls a gRPC to deduct the gold directly,
through the DDD way with a method like we have set up now. Only way to keep it synced and safe,
vs dealing with refresh and quit before finish situations where gold benefited the party yet
they're out somehow." The rejected shapes are the ones that settle later: a running in-run tab
paid at the run's end, or gold copied into the run at entry. Either lets a delver take the goods
and leave (a refresh, a quit, a death, a lost connection) before the money moves.

Two existing shapes were weighed. The marketplace settlement saga runs its wallet writes as
Temporal activities (ADR-0011) because it is a many-step roll-forward over several owners. A
purchase is one write with one owner and a player waiting on the answer; a workflow buys it
nothing. The mailbox claim (ADR-0044) is the nearer precedent: one idempotent gRPC credit keyed
by the caller.

Recorded without adversarial review: no `challenge-me` pass. The user declined one ("it's fair
across all classes and just spend to get an item, no gaming around an ability"); the decision
arrived with a `(not challenged)` marker from the 2026-11-25 scoping session.

## Decision

**A purchase from an in-run vendor is paid by one idempotent debit to wallet-service over gRPC,
made at the moment of sale, off the game tick, with a key minted per purchase.**

- wallet-service exposes a **debit**: gold taken from the account of the member the call is made
  for, bounded by **available** gold (held bid gold is not spendable), once per caller-minted
  idempotency key. A known key debits nothing and succeeds, as the credit does (ADR-0044); the
  dedup row and the balance change commit in one transaction. It lives in the account context's
  usecase layer beside the credit.
- game-service owns a **consumer-side interface** for the debit. The run never calls it on the
  tick: the sale reserves the stock on the tick, the call runs on its own goroutine, and its
  result is applied on a later tick (granted on success, the stock released on refusal).
- The key is **derived from the purchase**, never minted per attempt: the run, the buyer and the
  buyer's purchase sequence in that run. A retry of the same purchase never charges twice.
- Nothing is granted before the debit succeeds. A refusal (not enough available gold, no
  account, wallet unreachable) grants nothing and costs nothing.

## Consequences

- The money and the goods cannot drift apart across a refresh, a quit or a death: the gold moves
  before the item exists, and an item that never arrives was never paid for (a debit that
  succeeds while its session has gone is the one gap, below).
- The tick stays free of I/O. The buyer waits one round trip plus a tick for the answer, and the
  stock is held meanwhile, so two buyers cannot both be sold the last one.
- Correctness rests on the key being stable (ADR-0009's load-bearing risk): a caller that minted
  a fresh key per attempt would double-charge unnoticed.
- **Gap, accepted:** if the debit succeeds and the run ends (or the server restarts) before the
  result is applied, the gold is spent and nothing is granted. The window is one round trip;
  the purchase is logged with its key so support can make it good. No compensation path in v1.
- game-service gains an outbound gRPC dependency on wallet-service, configured like its other
  service addresses (ADR-0022), and the run must know whom to charge: the debit names the buyer
  the way the mailbox's credit does.
- Like the mailbox credit, the debit writes no ledger entry yet: a reconciler will see these
  movements as wallet-only until the system-account decision lands.
- A second in-run vendor (a future shop, a paid shrine) takes this same path; it does not need a
  new decision.
