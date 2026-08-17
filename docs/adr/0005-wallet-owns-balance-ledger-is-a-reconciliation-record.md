# ADR-0005 — wallet-service owns gold balance; the ledger is a reconciliation record

Status: accepted
Date: 2026-08-17
Scope: `game-server/ledger-service`, `game-server/wallet-service`
Realized by: FS-0003 §Requirements 14 — the absence of any balance RPC, query, or
sum-over-entries in ledger-service (not yet implemented)

## Context

The system will hold two records of the same money: `wallet-service.accounts.gold` (a running
balance, mutated in place) and ledger-service's append-only record of the movements that
produced it.

Once both exist, there is a standing temptation: the ledger has every movement, so
`SUM(entries)` looks like a balance, and it looks like a *better* one — derived from primary
facts rather than from a mutable counter. Adding that query is a few lines and would immediately
serve real needs (a balance-as-of-time view, a second opinion during an incident, a read that
does not contend with wallet's writes).

The temptation has to be refused, because **the ledger's entire value is that it is derived
independently.** A reconciliation record can only detect that wallet is wrong if it is never the
thing wallet is checked against in normal operation. The moment reads start coming from the
ledger, the two records stop being independent: callers begin depending on ledger sums,
divergence becomes a production incident rather than a signal, and the pressure is to make them
agree by construction — at which point there is one record wearing two hats and nothing left
that can detect an error.

There is a secondary, weaker argument: summing an append-only table is O(account history) per
read and grows forever. It is worth stating but should not carry the decision — caching and
snapshots could solve it. The independence argument is the one that holds.

> Recorded without adversarial review in this repo. The decision arrived pre-formed from an
> external design discussion and was locked directly during FS-0003 scoping.

## Decision

**`wallet-service.accounts.gold` is the sole source of truth for gold balance.**

ledger-service exposes **no** balance query, **no** RPC returning an account total, and **no**
repository method that sums over entries. This is a permanent boundary, not a deferral — "we
have not built it yet" would invite it back as a convenience; "it does not live here" does not.

The ledger answers *"why is this number what it is"*. It never answers *"what is the number"*.

## Consequences

- **The two records stay independently derived**, so a discrepancy between them carries
  information. This is the property the whole service exists for.
- **Ledger reads never scale with account history**, because there is no aggregate read path to
  scale.
- **A reconciler becomes possible and necessary.** Comparing the two records is now the only way
  to use the ledger against wallet — which is the intended design, and is out of scope for
  FS-0003.
- **Cost: "balance as of time T" has no cheap answer.** Anyone needing it must build snapshotting
  or go through the reconciler. Accepted.
- **Cost: this pressure will recur**, probably from whoever is mid-incident and wants a second
  opinion fast. This ADR is the standing answer; reversing it requires superseding it, which is
  the point.
