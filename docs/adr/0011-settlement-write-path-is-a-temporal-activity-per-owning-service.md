# ADR-0011 — Settlement write-path operations are Temporal activities owned by each service, not gRPC calls from the orchestrator

Status: accepted
Date: 2026-08-25
Scope: `game-server/marketplace-service`, `game-server/wallet-service`, `game-server/ledger-service`
Builds on: [ADR-0010](0010-the-ledger-is-appended-past-the-saga-pivot.md) — supplies the mechanism
for the roll-forward ordering that ADR deliberately left to the saga
Realized by: FS-0003 §Requirements 19, §API surface, §Known gap — **the FS is not yet updated and
still describes a gRPC write path**

## Context

ADR-0010 made the ledger's correctness depend on an ordering it does not enforce: append only
past the pivot, once every money step has succeeded. It named Temporal as the expected
orchestrator and then explicitly declined to decide anything about it — *"what this ADR depends
on is the ordering guarantee, not the tool that provides it."*

That left the actual topology open, and FS-0003 filled the gap with the obvious answer:
`AppendLedgerTx` as a gRPC service-to-service call, with the orchestrator's workflow calling each
participant in turn. Marketplace is the orchestrator; wallet and ledger are participants.

The obvious answer has two properties that only become visible once you ask how the saga
*detects* and *survives* a degraded participant.

**Where the concurrency limit lives.** If the orchestrator's worker performs every step, every
step draws from one activity slot pool. A ledger that is slow rather than down holds slots while
it blocks. Those are the same slots the hold-commit and debit activities need — steps that are
past the pivot and must roll forward. The failure of the least critical participant throttles the
most critical ones, through a resource none of them share by design.

**What "the service is down" actually means.** Over gRPC from the orchestrator, participant
liveness is inferred from a connection: a call fails, and something between the orchestrator's
worker and the participant is wrong. Temporal already has a direct signal — a worker that stops
polling its task queue stops being available, detected at the queue rather than deduced from an
error at a caller. That signal only exists if the participant runs a worker of its own.

Both properties come from the same root: the orchestrator's worker is doing work it does not own.

## Decision

**Every participating service runs its own Temporal worker on its own task queue. Write-path
operations are Temporal activities, registered and executed in-process by the worker of the
service that owns the data.** The settlement workflow schedules an activity onto the owner's task
queue; it does not call the owner.

Concretely: ledger's append is an activity in ledger-service's worker, not an `AppendLedgerTx`
gRPC call from marketplace. Wallet's commit and debit are activities in wallet-service's worker.
**There is no gRPC hop on the settlement write path.**

**Read paths are untouched.** HTTP → gateway → gRPC stands exactly as ADR-0001's contract layer
and FS-0003's read surface describe it. This decision governs the write path only, and the
asymmetry is the point: reads are request/response for a waiting human, writes are steps in a
durable workflow.

**Retry policy is per activity, and each activity declares its non-retryable error set.** A
roll-forward saga retries by default, so the errors that must *not* retry — validation failures,
unbalanced transactions, malformed input — have to be named explicitly at each activity or a
permanent failure becomes an infinite retry.

Rejected: **the orchestrator's worker invokes each service over gRPC per step.** Simpler
topology, one worker to operate, and no new dependency for participants. Rejected because it
couples every participant's liveness to the orchestrator's slot pool and its connection view,
and keeps a network hop that buys nothing once a durable execution layer is already carrying the
call.

## Consequences

- **Bulkheading is structural, not configured.** Separate task queues mean separate activity slot
  pools. A degraded ledger exhausts ledger's slots and nothing else's. Under the rejected
  alternative this would have been a shared pool needing per-step limits to approximate the same
  property.
- **Failure detection tracks the real service.** Temporal sees ledger-service's worker stop
  polling. That is a fact about ledger-service, not an inference from an error observed at
  marketplace's connection — which could equally mean a network partition or a marketplace-side
  problem.
- **One fewer hop, and one fewer thing to be wrong.** The activity runs in the process that owns
  the data. No client construction, no Consul lookup, no gRPC status to translate back into a
  workflow decision on the write path.
- **The `AppendLedgerTx` RPC loses its caller.** FS-0003 specifies it as gRPC service-to-service
  with wallet-service as the caller. Under this decision the append is an activity and that RPC
  has no caller — the FS's write-path transport, requirement 19, and parts of its API surface are
  now wrong and must be reconciled. That reconciliation is the next step, not this ADR's job.
- **ADR-0009's caller-minted deterministic `transaction_id` gets more important, not less.**
  Temporal retries an activity until it succeeds, so duplicate execution is routine. The
  idempotency key is what makes a retried activity safe, and it is now load-bearing for the
  normal path rather than an at-least-once edge case.
- **Cost: every participating service takes the Temporal SDK dependency and operates a worker.**
  Wallet and ledger each gain a long-lived process to deploy, monitor, and keep polling. For
  ledger-service — which today does one thing — that is a meaningful increase in operational
  surface relative to the work it performs.
- **Cost: activity input/output structs become a cross-service contract with no schema gate.**
  This repo gates its other two contracts: HTTP through generated OpenAPI, gRPC through `.proto`.
  Activity payloads have neither. Nothing fails a PR that renames a field or changes a type, and
  the break surfaces at runtime as a deserialization error inside a workflow that is already past
  its pivot. **This is a known, accepted gap.** Candidate mitigations — a shared types package,
  or contract tests between orchestrator and participants — are noted and explicitly **not
  decided here**.
- **Cost: the write path stops being inspectable with the tools that cover everything else.**
  There is no `grpcurl` equivalent for "post this ledger transaction." Exercising the write path
  means driving a workflow or invoking the activity through Temporal's tooling, which changes how
  integration tests and manual debugging are written.
- **Cost: an undeclared non-retryable error retries forever.** The failure mode is a workflow that
  never completes rather than one that fails loudly, which is harder to notice. This is the price
  of a roll-forward-only saga, and it lands on whoever writes each activity's retry policy.
