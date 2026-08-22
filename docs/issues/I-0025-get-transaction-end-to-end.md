---
id: I-0025
status: open
implements: FS-0003
blocked_by: [I-0017, I-0018, I-0021, I-0023, I-0024]
labels: [blocked]
title: "FS-0003 slice 12: getTransaction end-to-end — repo read, gRPC arm, Huma op, 404 masking"
---
Implements FS-0003 §API surface, §Requirements 21-22, 24, 26-27, 30

**Author: human** — do NOT hand this to `/develop`. The masking rule below is a security
property that is easy to implement *almost* correctly and hard to catch in review.

> **Extends the FS-0003 chain post-amendment.** First slice to deliver a complete read operation.

## What to Build

One operation, every layer: `GET /api/ledger/transactions/{transaction_id}`.

- **Repository** — read one transaction with all its legs, against I-0023's interface.
- **Service** — assemble the response; enforce the visibility rule below.
- **gRPC handler arm** — `GetTransaction`, wired into the registration I-0018 stood up.
- **`mapError`** — add the read-path rows. I-0021 owns this function; extend it, do not fork it.
- **Gateway typed operation** — the `ledger` group's first Huma op.

This slice also **creates the gateway's `ledger` typed package**, which slice 13 reuses: the
`guard` wrapper, and `Protected` + the identity bridge, extended to carry the `account_id` and
`role` claims through to the typed handler.
Follow `internal/gateway/item/typed.go` for shape — but **not for envelopes**: §Req 31 says bare
payloads, and the item group's `{statusCode, message, result}` is transcribed legacy (ADR-0002
§1), not a convention to copy.

## Transport types — names are decided, do not invent

Per FS-0003 §API surface's transport-type table. This slice builds two of them, in
`api-gateway/internal/gateway/ledger`:

- **`Transaction`** — the `getTransaction` response, nesting `Legs []Leg`
- **`Leg`** — one side: `account_id`, `direction`, `amount`

**Not** `LedgerTransaction` / `LedgerLeg` — inside the `ledger` package those stutter. And **not**
the persistence `LedgerEntry` (I-0017) reshaped: §Req 31 forbids a transport type that mirrors an
internal model, and the visible name difference is what keeps that honest.

Field names on the wire are snake_case, matching the rest of the gateway.

## The masking rule — read this before writing the handler

§Req 26: a member requesting a transaction they have no leg in gets **`404 · NOT_FOUND`**, and
that response must be **byte-identical** to the one for a transaction id that does not exist.
Not similar — identical. Same status, same `code`, same `detail`, same headers.

A transaction id is shared by both counterparties, so a distinguishable `403` would confirm to a
member that a specific movement involving someone else occurred. That is the secret being kept.

**The trap:** it is natural to write `if !found { 404 } else if !authorized { 403 }` and then
"fix" it by changing the 403 to a 404 — which leaves a timing and code-path difference, and
usually a different `detail` string. Decide the shape so that *not-found* and *not-yours* converge
before a response is constructed, not after.

Log the real reason server-side. The seam already does this (`slog` with the true `code`), so
masking on the wire costs no diagnosability.

## Identity, and the role that does not exist yet

§Req 24: identity and role come from the verified token, never a parameter. §Req 29: this feature
builds the **seam** that reads `role` from transport metadata; **issuing the claim is another
feature's problem**, and no JWT in this system carries one today.

So: read `role` from metadata, and define the absent case explicitly — **no role claim means
`member`**, never admin. Fail closed. Write it as a named decision in the code, not an implicit
zero-value default, so the auth feature that lands the claim later can find it.

§Req 27: evaluating "has a leg of theirs" needs the member's own `account_id`, and that arrives
as a **verified token claim** — there is no wallet lookup. So `getTransaction` is **one hop**,
with no resolution failure mode to handle. A token missing the `account_id` claim is `401`,
never an empty result: fail closed, same posture as the missing role claim above.

## Acceptance Criteria

- [ ] `GET /api/ledger/transactions/{transaction_id}` returns the transaction with `legs[]` nested
- [ ] The returned legs sum to zero
- [ ] A member requesting a transaction with no leg of theirs receives `404 · NOT_FOUND`
- [ ] That response is **byte-identical** to the response for a nonexistent id — asserted
      field-by-field including `detail`, not just on status
- [ ] A request with no role claim is treated as `member`, never admin
- [ ] A token missing the `account_id` claim receives `401 · UNAUTHENTICATED`, never an empty
      or unscoped result
- [ ] The handler makes exactly one downstream call — no wallet lookup
- [ ] The response body carries no `statusCode` / `message` / `result` envelope
- [ ] The response carries no total, sum, or balance field
- [ ] Error responses carry `Content-Type: application/problem+json` — asserted on the header
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-0023 — the proto messages and repository read interface
- I-0024 — the gateway cannot dial ledger-service without it
- I-0018 — generated proto and `RegisterLedgerServiceServer`
- I-0017 — the scan targets the repository read fills
- I-0021 — `mapError` must exist before this slice adds rows to it

## Spec Reference

FS-0003 §API surface (the `getTransaction` row, the `legs[]` table, the error-semantics table),
§Requirements 21 (the split), 22 (nested), 24 (identity from token), 26 (the masking rule),
27 (`account_id` as a token claim), 30 (problem+json, 503 not 500), 31 (bare payloads).

## TDD Approach

- RED: request a transaction as a member with no leg in it; assert the response is
  indistinguishable from the nonexistent-id response
- GREEN: converge both paths before response construction
