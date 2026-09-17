---
id: I-F9R7Q-11
status: done
implements: FS-F9R7Q
blocked_by: [I-F9R7Q-2]
labels: [ready-for-agent]
title: "FS-F9R7Q slice 11: gateway → ledger gRPC client, Consul discovery, ledger tag"
---
Implements FS-F9R7Q §Requirements 32

**Author: agent**

> **Extends the FS-F9R7Q chain post-amendment.** Slices 1–9 (I-F9R7Q-1 … I-F9R7Q-9) predate the read
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

- Do not add the route group or any Huma operation — that is I-F9R7Q-12.
- Do not invent a connection-management shape. If the five existing clients share a helper, use
  it; if they don't, match the closest one rather than improving on it here.

## Acceptance Criteria

- [x] The gateway constructs a ledger gRPC client through the same Consul discovery path as the
      other five services — the client exists and resolves through
      `discovery.ServiceConnection`, proven by `TestNewClient_DiscoversTheLedgerServiceName`.
      **Its construction in `config/routes.go` is deferred to I-F9R7Q-12**: every sibling pairs the
      client with a handler on the next line, and this slice mounts none, so the local would be
      unused and would not compile.
- [ ] `ledger` appears in `config.Tags` in `internal/contract/contract.go` with a description
- [ ] The gateway starts cleanly with ledger-service absent — a missing downstream is a runtime
      `503`, never a boot failure (matches existing client behavior)
- [ ] No new route, operation, or handler is registered by this slice
- [ ] `make lint && make test` green for api-gateway

## Blocked By

I-F9R7Q-2 — ledger-service's wiring has to be in its final shape before the gateway dials it.

## Spec Reference

FS-F9R7Q §Requirements 32 (the contract is generated; the tag is declared globally).
`api-gateway/SPECIFICATION.md` → "Route ledger read traffic to ledger → FS-F9R7Q" is the thin line
this slice starts satisfying.

## TDD Approach

- RED: a test asserting the gateway's client set contains a ledger client fails
- GREEN: registration added; client resolves through Consul
