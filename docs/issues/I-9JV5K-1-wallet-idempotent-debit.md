---
id: I-9JV5K-1
status: done
implements: FS-9JV5K
blocked_by: []
labels: [ready-for-agent]
title: "FS-9JV5K slice 1: wallet-service's idempotent Debit over gRPC"
---
Implements FS-9JV5K §C R13–R15

**Files:** `game-server/common/api/proto/wallet/wallet.proto` and its generated Go (`make gen` in
`game-server/common`, committed together), `game-server/wallet-service/internal/account/usecase`
(a `DebitUC` beside `CreditUC`), `.../grpc/handler.go` and its wiring in wallet-service's main/routes.
DDD-lite: the handler parses and maps errors, the usecase holds the rule, SQL only in the
repository. ADR-0093, ADR-0044, ADR-0009.

## What to Build

`rpc Debit(DebitRequest{amount, idempotency_key}) returns (DebitResponse{applied})`. `DebitUC`
mirrors `CreditUC`: key required and namespaced `debit:`; amount positive, refused before the mark;
`MarkActivityProcessed` and the account's domain `Withdraw` (bounded by available gold) and
`SaveTx` in one transaction under `withRetry`; a known key returns `applied=false`; a refusal rolls
the mark back. Handler error mapping per R15. No ledger entry. Add any trace wrapper the
usecase layer's other writers have (the `*_trace.go` pattern) if the codegen expects one.

## Acceptance Criteria

- [ ] A fresh key debits once (applied); the same key again debits nothing (not applied).
- [ ] Not enough available gold with held gold present → `FailedPrecondition`, and the key is not burned (a later call with enough gold applies).
- [ ] Missing key / non-positive amount → `InvalidArgument`, before the mark; no account → `NotFound`; no member → `Unauthenticated`.
- [ ] Generated Go regenerated with `make gen` and committed with the proto.
- [ ] `make test` green in wallet-service (DB tests stay opt-in; use the existing mocks/fakes pattern).

## Blocked By

None.

## Spec Reference

FS-9JV5K §C R13–R15.

## TDD Approach

- RED: `DebitUC.Handle` with a fresh key and enough available gold reports applied and lowers the balance.
- GREEN: the usecase.
