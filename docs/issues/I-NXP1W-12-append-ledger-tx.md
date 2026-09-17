---
id: I-NXP1W-12
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-7, I-NXP1W-9]
labels: [blocked]
title: "FS-NXP1W slice 12: step 5 AppendLedgerTx (saga side) — forward and roll forward"
---
Implements FS-NXP1W §Requirements 18, 32, 38

**Author: human** (Kranti)

## What to Build

One issue for this arm: the ledger already treats a duplicate append as a no-op success
(FS-F9R7Q), so roll forward only needs the shared helper. This slice is the **saga side**; the
activity itself comes from FS-F9R7Q (I-F9R7Q-5).

- **Forward (workflow):** build a two-leg transaction: buyer DEBIT and seller CREDIT for the
  settlement amount, reason `SETTLEMENT`, reference = listingId. Key the legs by the wallet account
  IDs from the CommitHold and CreditSeller outputs; marketplace never reads them from wallet's
  data (Req 18). Schedule it on the `ledger` queue.
- **`transaction_id = uuidv5(fixed settlement namespace, "settlement:" + listingId)`**, not the
  workflow or run ID. The namespace UUID and the derivation are a **permanent contract**: changing
  either causes double posts. Pin them with a test.
- **Roll forward:** a duplicate append is success. Transient failures use the default tail policy
  and escalate and park through slice 7. The separate `ledger` queue means a ledger outage doesn't
  stall wallet or items steps.
- **Crash-point table** for this step.

## Acceptance Criteria

- [ ] A settlement produces exactly two ledger rows under the derived transaction_id
- [ ] A test pins the namespace UUID and derivation to a known value
- [ ] Re-running the append changes nothing
- [ ] Ledger down past the cap parks the settlement, and it completes once ledger recovers
- [ ] Crash-point table committed
- [ ] `make test` green

## Blocked By

I-NXP1W-7 (the helper), I-NXP1W-9 (the seller account ID comes from CreditSeller's output).
`AppendLedgerTx` from FS-F9R7Q (I-F9R7Q-5) must be registered.

## Spec Reference

FS-NXP1W §Requirements 18 (account IDs passed through), 32 (step 5), 38; Edge States: ledger
down, duplicate append. User stories 22–23. ADR-0010.
