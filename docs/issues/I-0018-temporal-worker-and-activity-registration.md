---
id: I-0018
status: open
implements: FS-0003
blocked_by: [I-0014]
labels: [blocked]
title: "FS-0003 slice 5: Temporal worker, task queue, activity registration, retry policy"
---
Implements FS-0003 §Requirements 16, 19, §API surface

**Author: human** — do NOT hand this to `/develop`. The retry-policy declaration below is a
correctness decision with a silent failure mode, not wiring.

> **Repurposed by [ADR-0011](../adr/0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md).**
> This slice was "proto generation, `RegisterLedgerServiceServer`, gRPC handler wiring" — all of
> it about the `AppendLedgerTx` RPC. That RPC no longer exists. The slice keeps its role,
> write-path plumbing, for the mechanism that replaced it. **Proto generation moved to I-0023**
> (which authors the read RPCs) and **gRPC registration moved to I-0025** (the first read
> operation end-to-end).

## What to Build

Ledger-service's own Temporal worker, and `AppendLedgerTx` registered on it as an activity.

**1. The worker.** A long-lived worker process in ledger-service, polling **its own task queue**.
The queue name is ledger-service's, not the orchestrator's, and not shared — that separation is
the whole point (ADR-0011): separate queues mean separate activity slot pools, so a degraded
ledger exhausts ledger's slots and cannot starve the hold-commit and debit activities that are
past the pivot and must roll forward. Follow the service's existing `cmd/` + `config/` wiring
shape; the worker is a second long-lived thing the process owns alongside the gRPC server that
I-0015 boots for the read path.

**2. Activity registration.** `AppendLedgerTx` registered against the input/output types I-0014
defined, calling into the service layer I-0020 builds. **In-process** — there is no gRPC hop, no
client, and nothing to dial (§Req 19).

**3. The retry policy, and its non-retryable set — the load-bearing decision here.**
A settlement saga past its pivot rolls forward and retries. That default is correct for a
database blip and catastrophic for a validation failure: **an undeclared non-retryable error
retries forever**, producing a workflow that never completes rather than one that fails loudly.
The failure mode is silence, which is why this is not `/develop` work.

Declare the non-retryable set explicitly, from FS-0003 §API surface's write-path error table —
every row marked **non-retryable** there must appear here:

| Sentinel | Classification |
|---|---|
| `ErrUnbalancedTransaction` | non-retryable |
| `ErrInvalidLegCount` | non-retryable |
| `ErrInvalidLegAmount` | non-retryable |
| `ErrInvalidDirection` | non-retryable |
| `ErrInvalidUUID` | non-retryable |
| an illegal `reason` | non-retryable |
| transient / database unavailable | retryable — the default, and what the policy exists for |
| anything unclassified | retryable — hence the set above must be exhaustive |

**Identity comes from the execution context, never the activity input** (§Req 16). The trap
survives the transport change intact: the retired scaffold took its subject from
`commonauth.MemberIDFromCtx` because it was a member-facing RPC. The `account_id`s in the payload
are *data about whose gold moved*, not an assertion of who is calling. Do not reach for
`MemberIDFromCtx` to populate them.

## Scope fence — the callee, not the caller

**No workflow, no scheduling, no orchestrator.** This slice ships the activity and the worker
that executes it. The settlement workflow that schedules it belongs to whoever specifies the
saga (FS-0003 §Out of Scope), and **its absence does not block this slice**: the SDK's activity
test environment invokes a registered activity directly, and a throwaway workflow or the Temporal
CLI exercises the real queue.

**No AMQP consumer either.** wallet-service's deposit and withdraw verbs will one day publish
events this service consumes — `internal/ledger/amqp_consumer.go` is the seat I-0015 was told to
leave standing for exactly that. It stays a seat. Those movements have **no counterparty
account**: §Req 5a puts the burden on the caller to supply a system or mint account id, and
building one is explicitly out of scope. Wiring that door now would drag the system-account
design into this feature. That a second door is cheap to add later is the *result* of the use
case owning the logic — not a reason to build both now.

## Acceptance Criteria

- [ ] ledger-service runs a Temporal worker on its own task queue, named and configured in
      `config/`, not hardcoded at a call site
- [ ] `AppendLedgerTx` is registered as an activity and reachable through the SDK's activity test
      environment
- [ ] The activity calls into the service layer; no gRPC client is constructed on this path
- [ ] `AppendLedgerTx` appears in no `.proto` file and no gRPC registration
- [ ] A retry policy is attached, with the non-retryable set above declared explicitly
- [ ] A test proves a non-retryable sentinel fails the activity **once** rather than retrying
- [ ] A test proves a transient error **is** retried
- [ ] No `MemberIDFromCtx` anywhere in the `AppendLedgerTx` path
- [ ] No workflow is defined in this slice
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are untouched (§Req 19)
- [ ] `make lint` green

## Blocked By

I-0014 — the activity's input/output types and the sentinel set are authored there.

## Spec Reference

FS-0003 §Requirements 16 (identity from execution context), 19 (write path is a Temporal
activity), §API surface (the write-path field tables and the retryable/non-retryable
classification), §Out of Scope (the workflow, its topology, and its scheduling).
Governed by **ADR-0011** (activity per owning service, own task queue, no gRPC hop) and ADR-0010
(the append is a roll-forward step, which is why retry semantics matter here at all).

## Notes

Plumbing plus one real decision. Leg validation and sum-to-zero are I-0020's — this slice must
not validate anything the activity's input types do not already enforce.

The activity's input/output types are an **ungated cross-service contract** (ADR-0011's accepted
cost): no proto, no `buf`, no OpenAPI fails a PR that breaks them. If a mitigation is ever built —
a shared types package, contract tests — it is its own work, not a quiet addition here.
