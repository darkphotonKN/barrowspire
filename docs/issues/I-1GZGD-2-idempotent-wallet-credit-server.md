---
id: I-1GZGD-2
status: open
implements: FS-1GZGD
blocked_by: []
labels: [ready-for-agent]
title: "FS-1GZGD slice 2: one idempotent gold credit to the caller's own account (wallet-service)"
---
Implements FS-1GZGD §Requirements R23, R24, R29, §Acceptance Criteria (Guard 4; Wallet)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

## What to Build

Exactly **one** new wallet-service RPC, `Credit(amount, idempotency_key)`, end to end (proto →
gRPC handler → use case → repository), called later by notification-service on claim
(I-1GZGD-4). No gateway route.

- The account is the **forwarded token's member** (D18); the request has no account or member
  field — preserve the empty-identity shape wallet already uses (`CONTEXT.md` § Boundaries).
- Model it on `wallet-service/internal/account/usecase/credit_seller_usecase.go`:
  `MarkActivityProcessed(key)` and the credit commit in **one transaction**, under `withRetry`.
  A known key credits nothing and returns success with `applied = false` (ADR-0009).
- An empty key or a non-positive amount is refused (`InvalidArgument`); no account →
  `NotFound` (the claim stays retryable, R24).
- No ledger entry (charter bound; ADR-0006). Not `Deposit`, which takes no key and stays as is.

**Files it expects to touch:** `game-server/common/api/proto/wallet/wallet.proto` + its
regenerated Go; a new `game-server/wallet-service/internal/account/usecase/credit_usecase.go` (+
`_test.go`); `game-server/wallet-service/internal/account/grpc/handler.go` (+ test);
`game-server/wallet-service/internal/config/services.go`. No migration expected
(`processed_activities` exists, migration 000008). This is the **only** issue that touches
`wallet.proto`.

## Acceptance Criteria

- [ ] `Credit(500, "mail:L:M")` with member M's token raises M's gold by 500 and returns
      `applied = true`.
- [ ] **Guard 4:** a second `Credit` with the same key changes no balance and returns
      `applied = false`; the dedup row and the credit commit in one transaction (a failure after
      the mark rolls both back).
- [ ] Two concurrent `Credit` calls with one key credit once.
- [ ] An empty key or an amount ≤ 0 is refused and changes nothing.
- [ ] A member with no account gets `NotFound` and nothing is marked processed.
- [ ] The request carries no account/member field; no ledger call is made.
- [ ] Tests pass (`go test ./...` in wallet-service), lint clean.

## Blocked By

None

## Spec Reference

FS-1GZGD §Requirements R23, R24, R29; §Decisions D5, D16, D18. User stories 10, 14, 15.

## TDD Approach

- RED: the use case credited twice with one key leaves the balance raised once.
- GREEN: `MarkActivityProcessed` inside the credit transaction, short-circuiting when already
  claimed (as `CreditSellerUC`).
