# ADR-0096 — An in-run purchase whose debit outcome is unknown is released and logged, not re-driven

Status: accepted
Date: 2026-11-25
Scope: `game-server/game-service` (the run's purchase book)
Amends: [ADR-0093](0093-an-in-run-purchase-debits-the-wallet-over-grpc-at-the-moment-of-sale-off-the-tick-idempotent-per-purchase.md) —
its Consequences, which named one accepted gap ("the debit succeeds and the run ends before the
result is applied") and said a wallet-unreachable refusal "costs nothing"
Realized by: [FS-9JV5K](../specs/9JV5K-wandering-merchant.md) R10, R23 and the "wallet is down"
edge state, as amended 2026-11-25

## Context

ADR-0093 makes an in-run purchase one idempotent wallet debit, made off the tick with a key minted
per purchase, retried with that key for at most 10 s. The first build reported every failure that
was not "not enough gold" or "no account" as `wallet_unavailable`, released the stock, and told the
buyer "Nothing was taken."

The FS-9JV5K code review (2026-11-25) showed that promise is not always true. A debit can commit in
wallet-service while its answer is lost: the 10 s budget runs out on DeadlineExceeded after the
commit, or the wallet answers Internal after committing. The buyer is then told nothing was taken,
clicks Buy again, and the next purchase carries a new key (n + 1), so they can be charged twice and
granted once. The idempotency key protects a retry of one purchase, not a second purchase the
player makes because they were told the first cost nothing.

Two shapes were weighed. The standard pattern is to keep a purchase whose outcome is unknown
unresolved and re-drive the same key (in the background, or before the buyer's next purchase opens)
until the wallet answers definitely. The smaller one is to stop promising: release the stock, say
the outcome is unknown, and log it for support. The run is short-lived (one floor's merchant, a
delve of about an hour), the window needs a wallet that commits and then fails to answer for 10 s,
and support already handles ADR-0093's first gap from the same warn log.

Recorded without adversarial review: decided by the orchestrating session under the owner's
2026-11-25 Spire charter, after the code review. **Flagged for the owner**: the re-drive pattern is
the stronger answer if this window proves real on the owner's stack.

## Decision

**A purchase whose debit outcome is unknown is released and logged, not re-driven.**

- Outcomes are split three ways: a definite debit (grant), a definite non-debit (`not_enough_gold`,
  `no_wallet`, and `wallet_unavailable` for unauthenticated, invalid argument or no wallet
  configured: nothing was taken), and an **unknown outcome** (`outcome_unknown`: the retry budget
  ran out on transient errors, or any other error after the call may have committed).
- An unknown outcome releases the reserve, logs at warn with the purchase key, buyer, ware and
  price, and tells the buyer to check their gold before buying again. The client never says nothing
  was taken for it.

## Consequences

- No false promise: a buyer who may have paid is told so and pointed at their purse.
- **Second accepted gap:** a buyer who ignores the line and buys again can be charged twice and
  granted once. Support finds both purchases by key in the warn log. No compensation path in v1, as
  for ADR-0093's first gap.
- The reserve is released on an unknown outcome, so a ware may be sold to someone else even though
  the first buyer paid. Accepted with the gap above.
- Moving to the re-drive pattern later needs no wire change beyond keeping `outcome_unknown` as an
  interim state; it supersedes this ADR.
