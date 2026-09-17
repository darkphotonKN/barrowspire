---
id: I-F9R7Q-12
status: in-progress
implements: FS-F9R7Q
blocked_by: [I-F9R7Q-8, I-F9R7Q-11, I-F9R7Q-16]
labels: [blocked]
title: "FS-F9R7Q slice 12: getTransaction end-to-end — repo read, gRPC arm, Huma op, 404 masking"
---

Implements FS-F9R7Q §API surface, §Requirements 21-22, 24, 26-27, 29-30

**Author: human** — do NOT hand this to `/develop`. The masking rule below is a security
property that is easy to implement _almost_ correctly and hard to catch in review.

> **Extends the FS-F9R7Q chain post-amendment.** First slice to deliver a complete read operation.

## What to Build

One operation, every layer: `GET /api/ledger/transactions/{transaction_id}`.

> **Narrowed: the repository read and the gRPC registration/arm moved to I-F9R7Q-16.** Those two
> layers are transcription against interfaces I-F9R7Q-10 already generated. What remains here is the
> gateway surface and the visibility rule — the parts that are decisions.

- **Service** — assemble the response; enforce the visibility rule below.
- **`mapError`** — add the read-path rows. I-F9R7Q-8 owns this function; extend it, do not fork it.
- **Gateway typed operation** — the `ledger` group's first Huma op.

This slice also **creates the gateway's `ledger` typed package**, which slice 13 reuses: the
`guard` wrapper, and `Protected` + the identity bridge, extended to carry the `account_id` and
`role` claims through to the typed handler.
Follow `internal/gateway/item/typed.go` for shape — but **not for envelopes**: §Req 31 says bare
payloads, and the item group's `{statusCode, message, result}` is transcribed legacy (ADR-0002
§1), not a convention to copy.

## Transport types — names are decided, do not invent

Per FS-F9R7Q §API surface's transport-type table. This slice builds two of them, in
`api-gateway/internal/gateway/ledger`:

- **`Transaction`** — the `getTransaction` response, nesting `Legs []Leg`
- **`Leg`** — one side: `account_id`, `direction`, `amount`

**Not** `LedgerTransaction` / `LedgerLeg` — inside the `ledger` package those stutter. And **not**
the persistence `LedgerEntry` (I-F9R7Q-4) reshaped: §Req 31 forbids a transport type that mirrors an
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
usually a different `detail` string. Decide the shape so that _not-found_ and _not-yours_ converge
before a response is constructed, not after.

Log the real reason server-side. The seam already does this (`slog` with the true `code`), so
masking on the wire costs no diagnosability.

## Identity, and the role that now arrives

§Req 24: identity and role come from the verified token, never a parameter. §Req 29 has been
amended since this slice was cut: [FS-9KW9F](../specs/9KW9F-account-and-role-token-claims.md)
shipped, so **every access token carries a `role` claim** minted off `members.role`.

So the absent case is **not** this slice's to absorb. `AuthMiddleware` refuses claims carrying no
string `role` with `401 · UNAUTHENTICATED` before any handler runs — the earlier reading here,
"no role claim means `member`", is **withdrawn**. A named member-default silently promotes an
unauthorizable token into an authorized one and makes a minting regression look like ordinary
member traffic. Do not reintroduce it as an implicit zero-value default either: the middleware
must reject, not fall through.

Past the middleware the claim is present, so scoping in the typed handler is a **comparison for
`admin`** — only the exact value is admin. A value outside `player | admin` is a *different* case
from absence: the minter passes `members.role` through verbatim and the column has no `CHECK`, so
an unrecognised value reaches the handler and is **non-admin, not an error**.

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
- [ ] A token whose claims carry no `role` receives `401 · UNAUTHENTICATED` from
      `AuthMiddleware`, never a fall-through to `member` scoping
- [ ] A token carrying a `role` outside `player | admin` is treated as non-admin and is **not**
      an error
- [ ] A token missing the `account_id` claim receives `401 · UNAUTHENTICATED`, never an empty
      or unscoped result
- [ ] The handler makes exactly one downstream call — no wallet lookup
- [ ] The response body carries no `statusCode` / `message` / `result` envelope
- [ ] The response carries no total, sum, or balance field
- [ ] Error responses carry `Content-Type: application/problem+json` — asserted on the header
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-F9R7Q-8 — `mapError` must exist before this slice adds rows to it
- I-F9R7Q-11 — the gateway cannot dial ledger-service without it
- I-F9R7Q-16 — the repository read and the `GetTransaction` gRPC arm this operation calls
  (which in turn carries I-F9R7Q-4's scan targets and I-F9R7Q-10's read interface)

## Spec Reference

FS-F9R7Q §API surface (the `getTransaction` row, the `legs[]` table, the error-semantics table),
§Requirements 21 (the split), 22 (nested), 24 (identity from token), 26 (the masking rule),
27 (`account_id` as a token claim), 29 (`role` is always present; absence is a `401` at the
middleware), 30 (problem+json, 503 not 500), 31 (bare payloads).

## TDD Approach

- RED: request a transaction as a member with no leg in it; assert the response is
  indistinguishable from the nonexistent-id response
- GREEN: converge both paths before response construction

## Remaining — polish, plus one real blocker

Gateway surface is in place: the `ledger` typed package, both ops registered, `guard`, the
admin-only `account_id` targeting rule, and proto→transport mapping. Builds clean, `go vet`
clean, `go test ./api-gateway/...` green.

Two things stand between this and done:

1. **`make openapi` panics, so the contract cannot be regenerated.** huma v2.36.0:
   `pointers are not supported for form/header/path/query parameters`. The offending field is
   `AccountIDTarget *string` on `listEntries`' input. The pointer is not incidental — it is how
   "unset" is told apart from "set to empty", which §Req 25 needs so a member who *supplies*
   `account_id` is refused rather than silently scoped back to themselves. It is the same
   distinction the proto spells `optional`. huma cannot express it as a query param, so the
   presence check has to move somewhere huma allows. **Design call, not a typo.** Until it is
   made, `openapi.yaml` stays stale and the contract gates stay red.

2. **`identity.EmbedClaims` has no caller, so both ops always 401.** `identity.ExtractClaims`
   reads `claimKey` string keys; nothing writes them. `contract.Protected` populates its own
   unexported `memberIDKey`, a different type in a different package, and stops at `member_id` —
   it never carries `account_id` or `role`. Until the bridge writes what the extractor reads,
   `ExtractClaims` returns `false` on every request and both handlers take the unauthenticated
   branch. The issue's own brief calls for extending `Protected` + the identity bridge to carry
   `account_id` and `role`; that extension is the missing half.

