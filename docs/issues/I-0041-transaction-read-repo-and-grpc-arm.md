---
id: I-0041
status: open
implements: FS-0003
blocked_by: [I-0015, I-0017, I-0023]
labels: [ready-for-agent]
title: "FS-0003 slice 12a: getTransaction plumbing — repository read, server registration, gRPC arm"
---
Implements FS-0003 §API surface, §Requirements 21-22

**Author: agent**

> **Split out of I-0025.** I-0025 originally spanned repository, gRPC, and gateway in one slice.
> The two layers below are transcription against interfaces I-0023 already generated; the
> gateway surface, the transport types, and the masking rule stayed in I-0025 because they are
> decisions. This slice builds the plumbing I-0025 then calls.

## What to Build

Two layers, both against contracts that already exist. Decide nothing.

- **Repository read body** — read one transaction with all its legs, implementing the read
  interface I-0023 defined. Fill I-0017's scan targets. One query or a query pair; the join
  shape is yours, the signature is not.
- **The `GetTransaction` handler arm** — calls the repository and returns the generated
  response message.

  > **The server registration already exists.** `cmd/server/main.go` already calls
  > `pb.RegisterLedgerServiceServer(grpcServer, services.LedgerHandler)`, and
  > `internal/config/services.go` already injects both query objects into the handler. I-0014's
  > follow-on commits landed it. Only the arm is missing — do not re-register, and do not
  > "improve" the existing wiring.

Errors return the slice 1 sentinels unwrapped to the handler. Route them through `mapError` —
do **not** add case arms to it. I-0021 owns that function and I-0025 extends it.

## What NOT to do

- No gateway code. No Huma operation, no route, no transport type — that is I-0025.
- No authorization, no scoping, no visibility check. `GetTransaction` here returns what the id
  names; deciding whether the caller may see it is I-0025's, and doing it twice in two places is
  how the two answers drift.
- No `mapError` case arms.
- No `ListEntries` — that is I-0042.

## Acceptance Criteria

- [ ] The repository read returns a transaction with all its legs, filling I-0017's scan targets
- [ ] The read implements I-0023's interface signature unchanged
- [ ] `RegisterLedgerServiceServer` is wired and the service serves `GetTransaction`
- [ ] A nonexistent transaction id surfaces the not-found sentinel, not a nil dereference
- [ ] `mapError` gains no case arms in this slice
- [ ] No authorization or account scoping appears at either layer
- [ ] `make lint && make test` green for ledger-service

## Blocked By

- I-0015 — the service must be in its final wiring shape before the server registers on it
- I-0017 — the scan targets this read fills
- I-0023 — the proto messages, the generated Go, and the read interface

## Spec Reference

FS-0003 §API surface (the `getTransaction` row, the `legs[]` table), §Requirements 21 (the
split), 22 (legs nested under the transaction). Governed by ADR-0011 (this service's gRPC serves
the read path).

## TDD Approach

- RED: request a transaction id with two legs; assert both come back attached to it
- GREEN: repository read + handler arm
