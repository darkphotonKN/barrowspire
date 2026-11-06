# FS-A3CQH: Wallet hold expiry sweep

> Status: work-order · SPECIFICATION.md: `game-server/wallet-service/SPECIFICATION.md` "### Holds" → "Expire stale holds" → this FS · Related ADRs: [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (a release records nothing), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (the bid id is the hold's idempotency key), [ADR-0017](../adr/0017-item-transfer-rolls-forward-the-pivot-stays-at-commit-hold.md) (CommitHold is the pivot; nothing undoes it), [ADR-0018](../adr/0018-settlement-failures-are-classified-by-kind-and-park-rather-than-fail.md) (a settlement may park indefinitely), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (the caller-driven release paths this backs up), [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (names a wallet sweeper over `expired_at` as the safety net) · Depends on: [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 19 (every hold carries listing end + settlement grace as `expired_at`) · Anchors: `I-UNANCHORED-1` · Vocabulary: [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md) (*expired hold*, *hold sweep*) · Scoped 2026-11-04, promoted 2026-11-05 under Nick's charter "wallet hold sweeper". **[charter default]** marks a default Claude proposed and Nick approved in the charter.

> **Amended 2026-11-05** by Nick, after the code review of I-A3CQH-2 and before the branch was
> merged: two owner decisions.
> **(A1) No head-of-line blocking.** A pass reads *all* expired `RESERVED` candidates, not only the
> oldest 100: it pages with a keyset on `(expired_at, bid_id)`, 100 per page, until a page comes back
> short, and stops between pages and between holds when its context is cancelled. Reason: a corrupt
> or unloadable account carrying 100 or more expired holds would otherwise sit at the head of every
> pass and starve every other release (User Story 12).
> **(A2) Clock skew at the boundary.** Requirement 2 and D11 (requirement 13) gain the clock-skew
> case: a `CommitHold` landing right at `expired_at` on a pod whose clock is behind the sweeping
> pod's may meet an already-swept hold and answer `ErrInvalidHoldTransition` instead of
> `ErrHoldExpired`. Both are non-retryable in `commit_hold_activity`, so settlement takes the same
> rollback. Documentation only; no code change.
> Requirements 2, 5, 7, 8, 9 and 13, User Stories 12 and 13, the affected acceptance criteria and
> edge states are corrected in place; each says *(Amended 2026-11-05, A1/A2 …)*.

## Summary

A hold that outlives its expiry is gold the system can no longer spend: `CommitHold` already
refuses it. But nothing gives it back, so it fences the bidder's gold forever. That happens when a
settlement parks before its pivot and never recovers, when an auction ends with outbid bids but no
leader, or when a marketplace bug leaves a claimed bid's hold behind. wallet-service gains a
background **hold sweep** that releases every expired hold. It is wallet's own timeout Cancel in the
hold's TCC, decided entirely from wallet's own rows and clock, and it never changes the outcome of
an auction.

## Requirements

### The TCC role

1. **The sweep is the timeout Cancel of a hold's TCC.** PlaceHold is the Try. CommitHold is the
   Confirm. ReleaseHold (caller-driven) and the sweep (time-driven) are the Cancels. The sweep obeys
   the TCC rules for a Cancel:
   - it acts only on a hold that is `RESERVED` and expired;
   - it never acts after the Confirm: a `COMMITTED` hold is never released;
   - it is idempotent: a hold already `RELEASED` is left as it is and counts as done;
   - it creates no hanging Try: once a hold is swept, a late `PlaceHold` under the same bid id
     is refused with `ErrBidAlreadyHeld`. This is existing behavior (ADR-0009); this FS pins it with
     a test.
   *Charter default — reason: the user asked for the sweep to follow the TCC flow, and these are
   the TCC Cancel's correctness rules.*
2. **Confirm and Cancel meet at one boundary, `expired_at`.** `CommitHold` succeeds only while
   `now` is not after `expired_at`. The sweep releases only once `now` is after it. The predicate is
   the same, so at any instant at most one of them is allowed. Both act through the Account
   aggregate and save under its OCC `version`, so a commit and a sweep racing on the same account
   serialize: whichever saves first wins, and the other reloads and sees the result. A sweep that
   reloads a `COMMITTED` hold changes nothing. A commit that reloads a swept hold gets
   `ErrHoldExpired`, because expiry is checked before the transition. *Charter default (D2e).*
   The one predicate is evaluated on each pod's own clock, so under clock skew between wallet pods
   a `CommitHold` landing right at `expired_at` on a pod whose clock is behind the sweeping pod's
   may pass its expiry check, meet a hold that pod already swept, and answer
   `ErrInvalidHoldTransition` instead of `ErrHoldExpired`. Both are non-retryable in
   `commit_hold_activity`, so settlement takes the same rollback either way. *(Amended 2026-11-05,
   A2: documentation only, no code change.)*

### The domain verb

3. **`Account.ExpireHold(bidID, now)`** is the sweep's only write. For the hold under `bidID`:
   - `RESERVED` and `now` after `expired_at` → `RELEASED` (`updated_at = now`). No gold moves;
     available gold rises because availability is derived from `RESERVED` holds.
   - `RESERVED` and `now` not after `expired_at` → refused with a new sentinel
     `ErrHoldNotExpired`, hold untouched. A stale candidate list can therefore never release a
     hold that is still protecting a bid.
   - `RELEASED` or `COMMITTED` → no change, no error. The caller can tell this apart from a
     release; the mechanism is the implementer's choice.
   - no hold under `bidID` → `ErrHoldNotFound`.
   *Charter default (D3) — reason: the expiry check lives in the aggregate next to CommitHold's,
   so the two halves of requirement 2 cannot drift apart.*
4. **No new hold status.** A swept hold is `RELEASED`, the same as a caller-released one. The hold
   FSM stays `RESERVED → COMMITTED | RELEASED`. *Charter default — reason: the wallet spec already
   states expiry is a timestamp fact with no EXPIRED status.*

### Finding expired holds

5. **Candidates are read by the database clock**: the bid ids of holds with `status = 'RESERVED'
   AND expired_at < NOW()`, oldest expiry first with ties broken by bid id, read in pages of 100
   through a keyset on `(expired_at, bid_id)`: each page starts after the last row of the page
   before it. A pass reads every page until one comes back short. The read uses the existing
   partial index `idx_wallet_holds_sweep ON wallet_holds(expired_at) WHERE status = 'RESERVED'`.
   **No migration.** *Charter default (D4).* *(Amended 2026-11-05, A1; was: "oldest expiry first,
   at most 100 per pass".)*
6. **The candidate list is advisory.** Each hold is decided again inside the aggregate with the
   application clock (requirement 3). When the two clocks disagree, the hold answers
   `ErrHoldNotExpired`. That is skipped silently, not counted as a failure, and the hold is
   released one pass later.

### Running the sweep

7. **A ticker worker in wallet-service's process**, built and stopped like the outbox worker: it
   runs on the worker context, is cancelled with the other workers on shutdown, and joins their
   wait group. One pass every **5 minutes**. Interval and page size are tuning, not contract.
   *Charter default (D5) — reason: matches marketplace's reconcilers; a backstop, not a hot path.*
   *(Amended 2026-11-05, A1; was: "batch size".)*
8. **Each pass:** read the candidates a page at a time (requirement 5). For each one, load its
   account by bid id, `ExpireHold`, and save, retrying OCC conflicts with the existing
   `withRetry`. When the page is done and was full, read the next page after its last row. The
   pass ends at the first short page. When the worker context is cancelled the pass stops between
   pages and between holds; the next start reads from the beginning again. *(Amended 2026-11-05,
   A1; was: "A pass that finds more than 100 expired holds leaves the rest for the next pass.")*
9. **Failures are isolated per hold.** A hold whose account cannot be loaded or saved (OCC retries
   exhausted, corrupt account, database error) is logged at warn and skipped; the keyset moves past
   it, so it never stands in front of the holds behind it, and the next pass tries it again. A
   failed candidate read, on any page, is logged at error and ends the pass. Neither stops the
   worker. *Charter default (D6).* *(Amended 2026-11-05, A1: "the keyset moves past it" and "on any
   page" added.)*
10. **Several replicas may sweep at once.** No leader election in v1. Two replicas releasing the
    same hold serialize on the account's OCC, and the loser reloads a `RELEASED` hold, which is a
    no-op (requirement 3). *Charter default (D5).*
11. **Observability:** one info log per pass with the number of holds released, and a warn per hold
    that failed. No metrics in v1. *Charter default (D9).*

### What it never touches

12. **No cross-service effects.** The sweep calls no other service, writes no marketplace bid, no
    ledger entry (ADR-0006: a release is not a balanced movement) and no event. wallet is a saga
    participant, never an orchestrator. *Charter default (D7).*
13. **The sweep never changes an auction's outcome.** Past `expired_at` (listing end + settlement
    grace, FS-NXP1W Req 19) no bid can be placed, withdrawn or confirmed, and `CommitHold` answers
    `ErrHoldExpired` whether or not the sweep has run. So every settlement path ends exactly as it
    would without the sweep:
    - pre-pivot, the commit fails non-retryably and the rollback runs; its `ReleaseAllHolds` is a
      no-op on a swept hold;
    - post-pivot, step 2 `ReleaseLosingHolds` is a no-op on a swept loser;
    - the winner's `COMMITTED` hold is never swept.
    *Charter default (D11).* Under clock skew between wallet pods, a commit landing right at
    `expired_at` may meet an already-swept hold and answer `ErrInvalidHoldTransition` instead of
    `ErrHoldExpired` (requirement 2). Both are non-retryable in `commit_hold_activity`, so the
    pre-pivot rollback above runs the same way. *(Amended 2026-11-05, A2: documentation only.)*
14. **`expired_at` is authoritative.** There is no carve-out for holds placed before FS-NXP1W
    Req 19 gave holds their settlement-sized expiry; such holds exist only in dev data. *Charter
    default (D8). Escalate, do not work around, if any non-dev environment holds `RESERVED` holds of
    a still-running listing whose `expired_at` is before the listing's end.*

## User Stories

1. As a bidder whose auction settlement stalled before charging anyone, I want my held gold back
   once the hold has expired, so that a stuck saga does not freeze my gold forever.
2. As a bidder outbid on an auction that ended with no leader, I want my held gold back, so that an
   edge case in settlement does not cost me my gold.
3. As a bidder, I want the sweep never to touch a hold that still backs a live bid, so that my lead
   is never left without gold behind it.
4. As a winning bidder whose gold was committed, I want the sweep never to release a committed
   hold, so that the gold I paid stays paid and the ledger stays balanced.
5. As the settlement saga, I want a commit attempted after expiry to fail the same way whether or
   not the sweep has run, so that my rollback logic needs no new case.
6. As the settlement saga's rollback, I want releasing an already-swept hold to succeed as a
   no-op, so that my uncapped retries terminate.
7. As settlement step 2, I want releasing a swept loser's hold to succeed as a no-op, so that the
   tail rolls forward.
8. As wallet-service, I want to decide expiry from my own rows and clock, so that the sweep keeps
   working while marketplace is down or wrong.
9. As wallet-service, I want the expiry decision inside the Account aggregate, so that the
   CommitHold and sweep halves of the boundary cannot drift apart.
10. As wallet-service, I want a late `PlaceHold` under a swept bid id refused, so that a retry
    arriving after the Cancel cannot resurrect the hold (no hanging Try).
11. As wallet-service, I want several replicas to sweep at once without double effects, so that I
    need no leader election.
12. As wallet-service, I want one bad account to cost only its own holds a pass, however many
    expired holds it carries, so that a corrupt row cannot stall every other release, not even by
    filling the first page of every pass. *(Amended 2026-11-05, A1: "however many expired holds it
    carries" and the first-page case added.)*
13. As wallet-service, I want candidates read 100 at a time, so that a backlog cannot pull the
    table into memory at once. *(Amended 2026-11-05, A1; was: "each pass bounded to 100 holds, so
    that a backlog cannot pull the table into memory or hold a pass open for long".)*
14. As an operator, I want one log line per pass with the released count and a warning per failed
    hold, so that I can see the sweep working and find the accounts it cannot fix.
15. As an operator, I want the sweep to stop cleanly on shutdown with the other workers, so that a
    deploy never cuts a save in half.
16. As marketplace's hold reconciler, I want the sweep to leave unclaimed-orphan judgment to me, so
    that a hold of a still-running auction is never released for lack of a bid row.
17. As the ledger, I want a sweep to record nothing, so that only balanced movements reach me.

## Acceptance Criteria

- [ ] `Account.ExpireHold` releases a `RESERVED` hold whose `expired_at` is before `now`, and the
      account's available gold rises by its amount.
- [ ] `ExpireHold` on a `RESERVED` hold whose `expired_at` is `now` or later returns
      `ErrHoldNotExpired` and leaves the hold and the account unchanged.
- [ ] `ExpireHold` on a `COMMITTED` hold changes nothing and returns no error.
- [ ] `ExpireHold` on a `RELEASED` hold changes nothing and returns no error (idempotent).
- [ ] `ExpireHold` for an unknown bid id returns `ErrHoldNotFound`.
- [ ] Anti-hanging: after a hold is swept, `PlaceHold` with the same bid id and amount returns
      `ErrBidAlreadyHeld` and creates no hold.
- [ ] Boundary: at exactly `now == expired_at`, `CommitHold` succeeds and `ExpireHold` refuses;
      one instant later, `CommitHold` returns `ErrHoldExpired` and `ExpireHold` releases.
- [ ] D11: on an expired hold, `CommitHold` returns `ErrHoldExpired` both before and after
      `ExpireHold` has run (never `ErrInvalidHoldTransition`), so settlement's classification and
      rollback are unchanged. This is judged on one clock; the cross-pod clock-skew case is
      requirement 2's, where both answers are non-retryable. *(Amended 2026-11-05, A2: the
      one-clock scope added.)*
- [ ] Releasing a swept hold through the existing release paths (`ReleaseHold`, `ReleaseAllHolds`,
      `ReleaseLosingHolds`) succeeds as a no-op.
- [ ] The candidate query returns only `RESERVED` holds with `expired_at < NOW()`, ordered by
      `(expired_at, bid_id)`, one page of the size it is given starting after a keyset position
      (none for the first page), still uses `idx_wallet_holds_sweep`, and needs no migration.
      *(Amended 2026-11-05, A1; was: "oldest expiry first, capped at 100".)*
- [ ] A pass reads page after page until a page comes back short, and releases expired holds that
      sit behind one or more full pages of holds that fail every time. *(Amended 2026-11-05, A1:
      new.)*
- [ ] A sweep pass releases every expired candidate, skips a candidate the aggregate answers
      `ErrHoldNotExpired` for without counting it as a failure, logs one info line with the
      released count, and logs a warn for, then skips, a hold whose load or save fails.
- [ ] A sweep pass that loses an OCC race to a concurrent commit, release or sweep ends with the
      hold in the winner's state, without error.
- [ ] The worker runs every 5 minutes in wallet-service's process and stops on shutdown with the
      other workers.
- [ ] The sweep makes no call to another service and writes no ledger row, outbox row or event.
- [ ] `game-server/wallet-service` tests pass.

## Edge States

- **Nothing expired:** the pass reads an empty list, releases nothing, logs a count of 0.
- **Backlog over 100:** the pass reads it 100 at a time, oldest first, and works off all of it.
  *(Amended 2026-11-05, A1; was: "the oldest 100 go this pass, the rest on later passes".)*
- **One account carrying 100 or more expired holds that cannot be loaded or saved:** each is warned
  about and skipped; the keyset moves past them and the holds behind them are released in the same
  pass. *(Amended 2026-11-05, A1: new.)*
- **Clock disagreement (DB says expired, app says not):** `ErrHoldNotExpired`, skipped silently,
  released a pass later.
- **Commit racing the sweep on one account:** OCC serializes them. A commit landing first leaves
  a `COMMITTED` hold that the sweep leaves alone. A sweep landing first makes the late commit
  answer `ErrHoldExpired`, which can only happen after expiry, when the commit would have answered
  that anyway. Under clock skew between pods, a commit right at `expired_at` may instead answer
  `ErrInvalidHoldTransition`; it is non-retryable too, so the same rollback runs. *(Amended
  2026-11-05, A2: the clock-skew sentence added.)*
- **Two replicas sweeping one hold:** one releases; the other reloads `RELEASED`, a no-op.
- **Settlement rollback or step 2 after a sweep:** their releases are no-ops on `RELEASED`.
- **Settlement parked pre-pivot, resumed after a sweep:** the commit fails non-retryably
  (`ErrHoldExpired`) and the existing rollback runs: listing `SETTLEMENT_FAILED`, bids `LOST`, item
  unfrozen to its seller.
- **Late PlaceHold for a swept bid id:** refused (`ErrBidAlreadyHeld`); no second hold.
- **Account corrupt or unloadable:** warn, skipped, tried again every pass until fixed.
- **Database unavailable:** the candidate read fails; error log; next pass retries.
- **Shutdown mid-pass:** the worker context is cancelled. The pass stops between pages, between
  holds or inside an aborted load or save, and a save either commits or does not (OCC). The next
  start resumes from the query's first page. *(Amended 2026-11-05, A1: "between pages" and "first
  page" added.)*
- **Bid left behind on an ended listing** (e.g. OUTBID bids on a no-winner listing): untouched; the
  listing is final and the bid can no longer change.

## Out of Scope

- Any marketplace change: the settlement grace (`settlementGrace`), bid statuses, the hold
  reconciler, the no-bids settlement arm.
- Publishing hold state changes (the unchecked "Publish hold state changes via transactional
  outbox" capability) and notifying the player that gold came back.
- Metrics and alerting beyond logs.
- Leader election or a distributed lock for the worker.
- A ledger entry for a release (ADR-0006).
- An `EXPIRED` hold status, or any change to the hold FSM's status set.
- Migrations: the index exists.
- Listing an account's individual holds.
- Correcting `game-server/wallet-service/docs/schema/wallet_hold.md`, which still describes the
  pre-000004 columns (`expiry_date`, birth + 1 hour) and says the sweeper is unimplemented.
