---
id: I-F9R7Q-16
status: open
implements: FS-F9R7Q
blocked_by: [I-F9R7Q-2, I-F9R7Q-4, I-F9R7Q-10]
labels: [ready-for-agent]
title: "FS-F9R7Q slice 12a: getTransaction plumbing — repository read, server registration, gRPC arm"
---
Implements FS-F9R7Q §API surface, §Requirements 21-22

**Author: agent**

> **Split out of I-F9R7Q-12.** I-F9R7Q-12 originally spanned repository, gRPC, and gateway in one slice.
> The two layers below are transcription against interfaces I-F9R7Q-10 already generated; the
> gateway surface, the transport types, and the masking rule stayed in I-F9R7Q-12 because they are
> decisions. This slice builds the plumbing I-F9R7Q-12 then calls.

## What to Build

Two layers, both against contracts that already exist. Decide nothing.

- **Repository read body** — read one transaction with all its legs, implementing the read
  interface I-F9R7Q-10 defined. Fill I-F9R7Q-4's scan targets. One query or a query pair; the join
  shape is yours, the signature is not.
- **The `GetTransaction` handler arm** — calls the repository and returns the generated
  response message.

  > **The server registration already exists.** `cmd/server/main.go` already calls
  > `pb.RegisterLedgerServiceServer(grpcServer, services.LedgerHandler)`, and
  > `internal/config/services.go` already injects both query objects into the handler. I-F9R7Q-1's
  > follow-on commits landed it. Only the arm is missing — do not re-register, and do not
  > "improve" the existing wiring.

Errors return the slice 1 sentinels unwrapped to the handler. Route them through `mapError` —
do **not** add case arms to it. I-F9R7Q-8 owns that function and I-F9R7Q-12 extends it.

## What NOT to do

- No gateway code. No Huma operation, no route, no transport type — that is I-F9R7Q-12.
- No authorization, no scoping, no visibility check. `GetTransaction` here returns what the id
  names; deciding whether the caller may see it is I-F9R7Q-12's, and doing it twice in two places is
  how the two answers drift.
- No `mapError` case arms.
- No `ListEntries` — that is I-F9R7Q-17.

## Acceptance Criteria

- [ ] The repository read returns a transaction with all its legs, filling I-F9R7Q-4's scan targets
- [ ] The read implements I-F9R7Q-10's interface signature unchanged
- [ ] `RegisterLedgerServiceServer` is wired and the service serves `GetTransaction`
- [ ] A nonexistent transaction id surfaces the not-found sentinel, not a nil dereference
- [ ] `mapError` gains no case arms in this slice
- [ ] No authorization or account scoping appears at either layer
- [ ] `make lint && make test` green for ledger-service

## Blocked By

- I-F9R7Q-2 — the service must be in its final wiring shape before the server registers on it
- I-F9R7Q-4 — the scan targets this read fills
- I-F9R7Q-10 — the proto messages, the generated Go, and the read interface

## Spec Reference

FS-F9R7Q §API surface (the `getTransaction` row, the `legs[]` table), §Requirements 21 (the
split), 22 (legs nested under the transaction). Governed by ADR-0011 (this service's gRPC serves
the read path).

## TDD Approach

- RED: request a transaction id with two legs; assert both come back attached to it
- GREEN: repository read + handler arm
