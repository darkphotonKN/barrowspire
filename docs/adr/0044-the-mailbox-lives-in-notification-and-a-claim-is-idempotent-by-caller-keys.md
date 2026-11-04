# ADR-0044 — The mailbox lives in notification-service; a claim is idempotent by caller-minted keys, items first, then gold

Status: accepted
Date: 2026-11-04
Scope: `game-server/notification-service`, `game-server/items-service`, `game-server/wallet-service`
Amended by: [ADR-0045](0045-a-new-letter-is-pushed-to-hub-players-over-redis-at-most-once.md) — §Decision 1's list of the only wire names that use "mail" for the in-game mailbox, and the consequence that notification-service's new dependencies are items and wallet
Realized by: [FS-1GZGD](../specs/1GZGD-in-game-mailbox.md) (D1, D6, D16, D20; spec default S5)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (the caller mints the key),
[ADR-0043](0043-verification-codes-are-owned-by-auth-and-mailed-by-notification.md)
(notification-service already sends email), [FS-PJPNA](../specs/PJPNA-deduplicated-match-result-notifications.md)
(notification's inbox), [FS-NXP1W](../specs/NXP1W-auction-settlement-saga.md) (`CreditSellerUC`:
credit and dedup row in one transaction)

## Context

FS-1GZGD adds an in-game mailbox: admins and, later, platform services send letters, and a letter
may carry items (template + quantity) and gold. Two questions have to hold for the life of the
feature, not just its first slice.

**Where does the mailbox live?** It is per-member, user-facing messaging with a read state, which
is what notification-service already stores (in-app notifications) and already deduplicates (its
`processed_events` inbox). A new service would mean a new database, deploy and gateway client for
a feature whose only new dependencies are two outbound calls. One collision comes with the move:
in notification-service "mail" and `Mailer` already mean outbound **email** (ADR-0043).

**How is a claim made safe?** A claim crosses three services. The letter and its per-member state
live in notification; the items are minted in items-service (whose stash cap can refuse them);
the gold is credited in wallet-service. There is no single transaction, and the user insisted
that a claim can never pay out twice — not on a double click, not from two tabs, not on a retry,
not after a crash between steps. The same claim must also never get stuck half-done. Temporal
already runs the marketplace settlement, but a claim is started by the player, can simply be
retried by the player, and needs no compensation: nothing is ever taken away.

The charter first sent gold as a "gold pouch" item opened later through a second protocol. The
user overrode that the same day: gold is credited straight to the wallet on claim, so the pouch,
its column, its open protocol and its refusals are gone and are not recorded here.

Recorded without adversarial review: every decision below was approved by the user in a
`/charter` run and went through no `/challenge-me`.

## Decision

1. **The mailbox is a bounded context inside notification-service** — its own package, tables
   (new numbered migrations), gRPC methods and AMQP consumer (`mail.letter.requested`, deduped
   through the existing inbox). No new service, database or deploy. In code and tables the
   concept is **Mailbox / Letter / Enclosure**; no in-game type is called `Mail*`, which stays
   email. Only the wire names `/api/mail/*`, `/api/admin/mail` and `mail.letter.requested` use the
   word for the in-game mailbox.
2. **Per-member claim state.** A broadcast letter is stored once; a member's state row (read,
   claim state `unclaimed` → `claiming` → `claimed`) is created lazily. Exactly one claim moves the
   row out of `unclaimed`, by a conditional `UPDATE … WHERE state = 'unclaimed'`.
3. **In-flight detection by a row lock, not by time.** The claiming request holds a row lock on
   the state row while it calls items and wallet. A second claim that cannot take the lock at once
   is refused `LETTER_CLAIM_IN_PROGRESS` and calls nothing. A claim that finds the row `claiming`
   and *can* take the lock knows the earlier attempt died or failed, and re-drives it. A lease or
   timeout would misjudge a slow claim as dead; a lost connection releases a row lock by itself.
4. **Two steps, fixed order, caller-minted keys** (ADR-0009), both derived from letter id + member
   id so every attempt of one claim carries the same keys:
   - **Step 1 — items** `GrantItems(grant_id)`, with the player's forwarded token. It mints every
     item into the stash in one transaction or nothing (`STASH_FULL`). `grant_id` is a unique key
     in items-service, recorded in the minting transaction; a known one mints nothing and returns
     the first result as already-granted. It goes first because it is the only step that can be
     refused.
   - **Step 2 — wallet** `Credit(amount, key = mail:<letter id>:<member id>)`, with the player's
     forwarded token, credited to **that token's member only** (the request names no account).
     The key's dedup row (`MarkActivityProcessed`) and the credit commit in one transaction, as
     `CreditSellerUC` does; a known key credits nothing and succeeds.
   - A letter without items skips step 1; a letter without gold skips step 2.
5. **`claimed` only after both steps succeed.** Any failure leaves the row `claiming`. The next
   claim re-sends both steps with the same keys: a done step answers already-granted /
   already-applied, the missing one completes, and only then is the row marked `claimed`.

## Consequences

- **Never doubled, never stuck, at every layer.** Two concurrent claims: one lock holder, one
  refusal. A retried grant: the unique `grant_id` mints nothing. A retried credit: the dedup row
  credits nothing. A crash after the grant, or a wallet failure after it: the row stays `claiming`
  and the next claim finishes it. Each guard is an acceptance criterion with its own test in
  FS-1GZGD, one of them concurrent.
- **No saga, no workflow, no compensation.** Correctness rests on two idempotent callees and a
  conditional state move. The player is the retry loop.
- **Cost: a claiming request holds a database connection and a row lock across two gRPC calls.**
  Those calls must run under a deadline so the lock is bounded; a slow items or wallet call
  shows as `LETTER_CLAIM_IN_PROGRESS` to a second tab.
- **Cost: correctness depends on the keys being deterministic** (ADR-0009's load-bearing risk). A
  key minted per attempt would double-grant or double-credit unnoticed.
- **Cost: a half-done claim can expire.** A letter that expires while `claiming` hides with its
  row; whatever step already applied stays with the member, the missing one is forfeited. Accepted
  for v1.
- **Mailed gold enters the economy with no counterparty**, so under ADR-0006 it writes no ledger
  entry (deposits wait on a system-account decision). A future reconciler will see these credits
  as unrecorded deposits; the `mail:` key prefix is what identifies them.
- **notification-service gains outbound gRPC dependencies on items and wallet** and must forward
  the player's token on both. It knows nothing of stash rules or balances: it only drives the two
  steps and records the outcome.
- **wallet-service gains exactly one RPC, `Credit`.** It is not `Deposit` (which takes no key) and
  must not grow an account parameter.
- **"Mail" is overloaded in one service**, and CONTEXT.md carries the boundary. A future
  `Mail*` type for the in-game concept is a review finding.
