---
id: I-1GZGD-4
status: done
implements: FS-1GZGD
blocked_by: [I-1GZGD-2, I-1GZGD-3]
labels: [ready-for-agent]
title: "FS-1GZGD slice 4: claim a letter — items then gold, claimed only after both, no duplicate claims (notification-service + api-gateway)"
---
Implements FS-1GZGD §Requirements R13–R17, R24–R29, R32, §API surface (claim), §Acceptance Criteria (Claim; No duplicate claims; Wallet), §Edge States

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A2): step 1 sends the letter's **stored item
> snapshots** with their quantities to `GrantItems`, which mints exactly from them; the claim
> resolves nothing again. Protocol, keys and guards are unchanged.

## What to Build

`ClaimLetter` in notification-service and `POST /api/mail/letters/{letterId}/claim` on the
gateway, implementing the claim protocol of ADR-0044 exactly:

1. Refuse an expired letter (`LETTER_EXPIRED`), one not addressed to the member (`NOT_FOUND`), one
   without enclosures (`NOTHING_TO_CLAIM`), one already `claimed` (`LETTER_ALREADY_CLAIMED`,
   calling nothing).
2. Create the state row if absent; move it `unclaimed → claiming` by a conditional
   `UPDATE … WHERE state = 'unclaimed'`. Hold a row lock on it for the rest of the claim; a
   second claim that cannot take the lock at once is refused `LETTER_CLAIM_IN_PROGRESS` and calls
   nothing (S5). A claim that finds `claiming` and takes the lock re-drives the steps.
3. Step 1, if the letter has items: items `GrantItems` with the player's forwarded token, the
   grant id derived from letter id + member id, and the letter's stored snapshots with their
   quantities (A2). `STASH_FULL` and other failures stop here.
4. Step 2, if the letter has gold: wallet `Credit` with the player's forwarded token, the amount
   and key `mail:<letter id>:<member id>`.
5. Only after both succeeded (already-granted / already-applied count as success): mark the row
   `claimed` and read. Any failure leaves it `claiming`. Both outbound calls run under a deadline
   so the row lock is bounded.

Add a wallet-service gRPC client (`WALLET_ADDR`) to notification-service. The gateway maps the
refusal codes to `400 · <CODE>` and outages to `503`. Regenerate with
`make openapi && make client`.

**Files it expects to touch:** `game-server/notification-service/internal/mailbox/*` (claim use
case, repository lock/conditional update, tests — including a real-database concurrency test);
`game-server/notification-service/config/routes.go`, `.env`; the gateway mailbox package from
I-1GZGD-3 and `game-server/api-gateway/config/routes.go` if a new route needs wiring;
`game-server/api-gateway/openapi.yaml` and `game-client/src/api/generated/schema.d.ts`
(regenerated only); deploy env for notification's `WALLET_ADDR`. **Does not** touch
`notification.proto` (declared in I-1GZGD-3), `items.proto`, `wallet.proto` or `errcode.go`.

## Acceptance Criteria

- [x] A letter with items (×1, ×3) and 500 gold: four instances in the stash, each equal to its
      stored snapshot, 500 gold credited, the letter `claimed` and read; the response carries the
      item ids and the gold. The claim calls no `ResolveItemSnapshots`.
- [x] A gold-only letter never calls items; an item-only letter never calls wallet.
- [x] Stash 2 short: `400 · STASH_FULL`, nothing minted or credited, the letter still claimable;
      after freeing slots, the same claim succeeds.
- [x] A letter without enclosures is `NOTHING_TO_CLAIM`; an expired one `LETTER_EXPIRED`.
- [x] **Guard 1 (concurrent):** two claims started together against a real database: one grant,
      one credit, one success, one `LETTER_CLAIM_IN_PROGRESS` or `LETTER_ALREADY_CLAIMED`.
- [x] **Guard 1 (sequential):** claiming a `claimed` letter calls neither items nor wallet.
- [x] **Guard 3:** with the grant applied and the row left `claiming`, the next claim gets
      already-granted, completes the credit and marks `claimed`; one set of items.
- [x] **Items succeeded, wallet failed:** the claim fails and the row stays `claiming`; with
      wallet restored, the retry credits the gold exactly once and marks `claimed`.
- [x] Both keys are derived from letter id + member id and identical across attempts (asserted).
- [x] Items and gold go to the token's member; no request field names a member or account.
- [x] `openapi.yaml` and the generated client are regenerated and committed; tests pass; lint
      clean.

## Blocked By

I-1GZGD-2 (wallet `Credit`), I-1GZGD-3 (letters, state rows, `ClaimLetter` declared, errcodes)

## Spec Reference

FS-1GZGD §Requirements R13–R17, R24–R29, R32; §Amendment 2026-11-04 A2; §API surface row 4; §Decisions D5, D6, D7, D16,
D18, D20; spec default S5; ADR-0044. User stories 9–15, 30.

## TDD Approach

- RED: the concurrent two-claims test against a real database, asserting one grant call and one
  credit call through fakes for items and wallet.
- GREEN: the conditional move to `claiming` plus the row lock held across the two steps.

## Charter run (2026-11-04)

Merged on `feat/notification-mailbox` (not on main, not pushed); the code-review fix round was merged at `fb1abf5c` and is recorded as FS-1GZGD amendment A9. Done: every criterion has a test. A9.2 to A9.4 changed this issue's surface: the pool is 8 and at most 3 claims run per pod (a fourth answers 503 at once); the gateway's claim deadline is 15 s; a business refusal from items (`STASH_FULL`, unmintable) puts the row back to the state the claim locked, while an outage still leaves it `claiming`; items `Internal` and wallet `NotFound`/`Internal` are 503. Wrap-up run: the `ClaimDB` tests (Guard 1 concurrent, Guard 3, wallet failure then retry, stash full, cap, mark read during a claim) pass against a throwaway schema, and `go test ./...` passes in notification-service and api-gateway.
