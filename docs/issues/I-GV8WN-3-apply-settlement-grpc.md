---
id: I-GV8WN-3
status: in-progress
implements: FS-GV8WN
blocked_by: []
labels: []
title: "FS-GV8WN slice 3: items-service applies a run settlement on request (ApplySettlement)"
---
Implements FS-GV8WN §D Requirement 11 (ADR-0040 §3)

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- `common/api/proto/items/items.proto`: `rpc ApplySettlement(ApplySettlementRequest)` taking the
  event id and an `ItemsExtractedEvent`. Regenerate.
- items-service gRPC handler: parse the id, call the same `ProcessItemsExtracted` the consumer
  calls (same inbox, same transaction). `ErrAlreadyProcessed` → success.
- Errors on the FS-22WKC seam: malformed id or payload → InvalidArgument; transient → Unavailable.
- Service-to-service: no bearer token or owner check.

## Acceptance Criteria

- [ ] `ApplySettlement` applies an event exactly as the consumer would (items stored, consumed deleted, release per `partial`).
- [ ] Calling it twice with the same id applies once; the second call succeeds.
- [ ] The consumer receiving the same event after `ApplySettlement` acks it as a duplicate and writes nothing.
- [ ] A malformed id is InvalidArgument; a store failure is Unavailable.
- [ ] `go test ./...` passes in items-service.

## Blocked By

None (if built after slice 2, the request carries `partial` too)

## Spec Reference

FS-GV8WN §D R11; user story 20.

## TDD Approach

- RED: handler test: `ApplySettlement` then `ProcessItemsExtracted` with the same id → the second returns `ErrAlreadyProcessed`, one set of rows.
- GREEN: handler delegating to `ProcessItemsExtracted`.
