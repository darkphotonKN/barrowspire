---
id: I-0024
status: open
implements: FS-0003
blocked_by: [I-0015]
labels: [blocked]
title: "FS-0003 slice 11: gateway → ledger gRPC client, Consul discovery, ledger tag"
---
Implements FS-0003 §Requirements 32

**Author: agent**

> **Extends the FS-0003 chain post-amendment.** Slices 1–9 (I-0014 … I-0022) predate the read
> path; this one covers wiring the amendment assumes and no earlier slice builds.

## What to Build

Nothing in the gateway can currently reach ledger-service. Five services are wired
(`auth`, `items`, `notification`, `payment`, `stats`); ledger is not. This slice adds the sixth,
following the existing pattern exactly — read how one of the five does it and do that.

- **gRPC client registration** in the gateway's wire/DI layer, discovered through Consul like
  its siblings (`api-gateway/SPECIFICATION.md` → "gRPC fan-out over Consul-discovered clients").
- **The `ledger` tag, declared globally** in `internal/contract/contract.go` alongside `member`,
  `items`, `notification`, `stats`, and `payment`. The comment there already says why: *"Spectral
  requires every operation tag to be declared globally."* An operation carrying an undeclared tag
  fails the lint gate, and it fails at generation time, not at review.
- **Health/lifecycle** consistent with the other clients — no bespoke retry or timeout policy
  invented here.

No handlers, no routes, no typed operations. This slice ends with the gateway able to *dial*
ledger-service and the document able to *name* the tag. Slice 12 is what first calls it.

## What NOT to do

- Do not add the route group or any Huma operation — that is I-0025.
- Do not invent a connection-management shape. If the five existing clients share a helper, use
  it; if they don't, match the closest one rather than improving on it here.

## Acceptance Criteria

- [ ] The gateway constructs a ledger gRPC client through the same Consul discovery path as the
      other five services
- [ ] `ledger` appears in `config.Tags` in `internal/contract/contract.go` with a description
- [ ] The gateway starts cleanly with ledger-service absent — a missing downstream is a runtime
      `503`, never a boot failure (matches existing client behavior)
- [ ] No new route, operation, or handler is registered by this slice
- [ ] `make lint && make test` green for api-gateway

## Blocked By

I-0015 — ledger-service's wiring has to be in its final shape before the gateway dials it.

## Spec Reference

FS-0003 §Requirements 32 (the contract is generated; the tag is declared globally).
`api-gateway/SPECIFICATION.md` → "Route ledger read traffic to ledger → FS-0003" is the thin line
this slice starts satisfying.

## TDD Approach

- RED: a test asserting the gateway's client set contains a ledger client fails
- GREEN: registration added; client resolves through Consul
