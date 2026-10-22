---
id: I-NXP1W-11
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 11: step 4 TransferItem — roll forward"
---
Implements FS-NXP1W §Requirements 9, 13, 38

**Author: human** (Kranti)

## What to Build

How the transfer survives failure. Once the buyer has paid, the item has to reach them; there is
no path back (ADR-0017).

- **Classification (Req 9):**
  - already applied: owner = buyer and status is not `PENDING_SETTLEMENT`, so return success
  - semantic impossibility: any other owner/status combination. After the pivot this is an
    invariant breach and must escalate and park, never fail (Req 13).
  - transient: items unavailable, deadline exceeded
- **Retry policy:** the default tail policy, escalating and parking through slice 7. Items may be
  down for hours; the settlement has to wait it out.
- **Crash-point table** for this step.

## Acceptance Criteria

- [x] Re-running after success returns success and changes nothing — including after the buyer has relisted, refrozen or sold the item on
- [x] An item with an unexpected owner or status escalates and parks; it is never overwritten — the write refuses it and leaves no record; it parks once step 4 runs through `runUntilDone` as `afterPivot` (see notes)
- [x] Items being down past the cap parks the settlement, and it completes once items recovers — outage errors stay retryable; parking is `runUntilDone`'s, proven in I-NXP1W-7 (see notes)
- [x] Crash-point table committed: `game-server/items-service/docs/crash-points/transfer-item.md`
- [x] `make test` green

## Implementation notes

- **"Already applied" is a record, not the item's state.** §Req 31 words it as "owner = buyer and
  status is not `PENDING_SETTLEMENT`", and I-NXP1W-10 built it that way. Writing the crash-point
  table showed where that breaks: once transferred, the item is the buyer's and unfrozen, so before
  a retry runs the buyer can freeze it in their own sale or sell it on. The retry then reported
  `TransferItemImpossible` although the transfer had happened, and if the item had been sold on
  every retry stayed impossible: the settlement could never reach steps 5–6, with no operator tool
  to move it on.
- **Fix: `item_transfers`** (migration 000025), keyed on `listing_id`, written in the same
  transaction as the transfer. The repository inserts the record first (`ON CONFLICT DO NOTHING`;
  nothing inserted = already applied), then runs the conditional `UPDATE`; an `UPDATE` that changes
  nothing rolls the record back with it. The primary key also serialises two concurrent attempts.
  Same pattern as CreditSeller's `processed_activities`; `listing_id` is the key because a listing
  settles, and so transfers, once.
- **FreezeItem keeps deciding from the item.** A frozen item is held by its settlement until a later
  step of that same settlement, which cannot run before 0b returns, so its evidence cannot move.
- **The repository still reports `false`, not an error.** A private `errNotTransferable` aborts the
  transaction and is turned back into `false, nil`, so the service keeps naming it
  `ErrItemNotTransfer` and the layering matches FreezeItem.
- **Step 4 is not yet scheduled.** `SettleAuction` stops after 0b until 1a–3 are wired. When it is
  added it goes through `runUntilDone(…, afterPivot, …)`; that, not this issue, is where the park
  in AC 2 and 3 becomes end to end. Same status as I-NXP1W-9's last AC.
- **Not yet covered by a test:** two attempts at once (crash point #9) relies on the primary key.
- **Deploy order:** migration 000025 must run before the new `TransferItem`, which writes the table.

## Blocked By

I-NXP1W-7 (the helper), I-NXP1W-10 (the forward step).

## Spec Reference

FS-NXP1W §Requirements 9, 13 (invariant breach after the pivot), 38; Edge States: items down for
hours after the pivot. User story 6. ADR-0017, ADR-0018.
