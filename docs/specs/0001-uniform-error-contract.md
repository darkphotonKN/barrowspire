# FS-0001: Uniform, machine-readable error contract at the gateway

> Status: work-order · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Edge → Uniform, machine-readable error contract" → this FS · Related ADRs: [`docs/adr/0001-contract-layer.md`](../adr/0001-contract-layer.md) **§6** (error representation + the one-seam rule — this FS is what builds it)

## Summary

Every error the gateway returns today is decided in the handler that happens to raise it, in
whatever shape that handler's author chose. There are **90 direct error-status writes** across
**four different body shapes**, and one of them leaks a raw downstream error to the client.

This feature replaces all of them with **one seam**: a single function that maps an error to an
HTTP status and an RFC 9457 `application/problem+json` body carrying a stable domain `code`.
Clients stop string-matching prose and start switching on `code`. Nothing about *what* the
gateway does changes — only how it reports failure.

It exists now because it is the **blocking precondition for ADR-0001**: a generated contract
cannot honestly describe failures that the code decides in 90 places.

## Requirements

**The vocabulary**

1. `game-server/common/errcode` defines `Code` (a string type) and the six generic platform
   codes: `UNAUTHENTICATED`, `VALIDATION_FAILED`, `NOT_FOUND`, `ALREADY_EXISTS`, `FORBIDDEN`,
   `INTERNAL_ERROR`. Domain-specific codes are added only when a real failure needs
   distinguishing — never speculatively.
2. `game-server/common/apperr` defines the sentinel errors the gateway matches on, so services
   and the gateway share one vocabulary rather than each inventing its own.
3. A `Code` is **contract**: removing or repurposing one is a breaking change; adding one is
   not. Handlers may become more specific over time without a coordinated client release.

**The seam**

4. Exactly one function decides HTTP error status for the gateway. No handler, middleware, or
   route writes an error status directly.
5. The seam maps, in this precedence: a gRPC status from downstream → a local sentinel →
   a catch-all `INTERNAL_ERROR` / 500. Observed downstream codes and their mapping:
   `InvalidArgument`→`400 VALIDATION_FAILED`, `NotFound`→`404 NOT_FOUND`,
   `AlreadyExists`→`409 ALREADY_EXISTS`, `Unauthenticated`→`401 UNAUTHENTICATED`,
   `Unavailable`→`500 INTERNAL_ERROR`, `PermissionDenied`→`403 FORBIDDEN`.
6. The seam replaces the `status.FromError` switch currently **duplicated across six handler
   files** (`auth`, `item`, `stats`, `payment`, `notification`, `example`). The mapping logic is
   collected, not invented.
7. The response body is `application/problem+json` with members `type`, `title`, `status`,
   `detail`, `code`, `errors[]`. The `Content-Type` header **must** be
   `application/problem+json` — asserting only on status and body would let it silently
   degrade to `application/json`.
8. `errors[]` is **always present**, empty when there is no field-level detail, so the client
   never null-checks it.
9. **No downstream error text reaches the client.** `detail` carries a client-safe message; the
   raw error is logged server-side with the operation name. The existing call that interpolates
   a raw error into the response is removed by this requirement.
10. `detail` is prose and explicitly **not** contract. Clients switch on `code`.

**Coverage**

11. All 90 error-status writes in `game-server/api-gateway` route through the seam, including:
    - the **JWT middleware** (4 writes, all 401) — replaced outright, not forked, because every
      error body changes at once in this feature;
    - **`POST /webhook/stripe`** (unauthenticated, third-party) — migrated like everything else.
      Stripe keys off the HTTP status, which is unchanged.
12. Success responses (200/201/202) are **untouched**.

**Enforcement**

13. A CI check greps `game-server/api-gateway` for direct 4xx/5xx status writes outside the
    seam package and **fails the build** on any hit.
14. The check is itself verified by a fixture that reintroduces one such call and **must go
    red** — an unexercised gate is unverified configuration.

**Client**

15. `game-client` reads `code` (and `detail` for display) instead of `.error` / `.message`, in
    the same feature, as its final slice.

## User Stories

1. As a **game-client developer**, I want a stable `code` on every error, so that I can branch
   on failure type without string-matching a message that may be reworded.
2. As a **game-client developer**, I want one error shape across all 33 routes, so that I write
   one error handler instead of four.
3. As a **game-client developer**, I want `errors[]` always present, so that I never null-check
   before iterating.
4. As a **game-client developer**, I want `detail` to be safe to display, so that I can surface
   it without leaking internals to a player.
5. As a **gateway developer**, I want one place that decides status, so that adding an endpoint
   does not mean re-deciding what "not found" means.
6. As a **gateway developer**, I want the gRPC mapping written once, so that six handler files
   stop drifting from each other.
7. As a **gateway developer**, I want a compile-time vocabulary of codes, so that a typo is a
   build error rather than a silently wrong client branch.
8. As a **gateway developer**, I want the CI gate to reject a direct status write, so that the
   old pattern cannot creep back from the 90 examples in git history.
9. As a **new contributor**, I want the seam to be the obvious path, so that I do not copy an
   older handler's inline `c.JSON`.
10. As a **security reviewer**, I want raw downstream errors never returned to clients, so that
    internal topology and failure detail stay server-side.
11. As an **on-call operator**, I want the raw error logged with its operation name, so that I
    lose no diagnostic detail when the client-facing message is generalised.
12. As an **on-call operator**, I want 5xx logged at error level and 4xx at info, so that client
    mistakes do not page me.
13. As a **downstream service author**, I want a shared `errcode`/`apperr` vocabulary in
    `common/`, so that I can eventually return codes the gateway maps rather than opaque strings.
14. As a **code reviewer**, I want error shape decided by the seam, so that review is about
    behavior rather than response formatting.
15. As an **API consumer**, I want HTTP status to keep its RFC meaning, so that generic tooling,
    proxies, and retry logic keep working.
16. As an **API consumer**, I want two failures that are both "invalid request" to be
    distinguishable, so that I can tell a malformed body from a rejected value.
17. As **Stripe**, I want a non-2xx status on webhook failure, so that I retry with backoff —
    regardless of the body shape.
18. As the **contract layer (ADR-0001)**, I want a single error boundary to exist, so that a
    generated OpenAPI document can describe the gateway's failures truthfully.
19. As a **future feature author**, I want serializing an endpoint to require no error work, so
    that slice ⓪ stays behavior-preserving.
20. As a **product owner**, I want a player-visible error to be traceable to one code and one
    log line, so that support can diagnose from a screenshot.

## Acceptance Criteria

- [ ] `common/errcode` exists with the six generic codes; `common/apperr` defines the sentinels.
- [ ] One seam function is the only code in `api-gateway` that decides an HTTP error status.
- [ ] The six duplicated `status.FromError` switches are deleted, their logic living only in the seam.
- [ ] Every error response carries `Content-Type: application/problem+json` — **asserted on the header**, not just the body.
- [ ] Every error response body carries `type`, `title`, `status`, `detail`, `code`, `errors[]`, with `errors[]` present-and-empty when there is no field detail.
- [ ] Each mapping in Requirement 5 is covered by a test asserting **status, `code`, and Content-Type**.
- [ ] No downstream error string appears in any response body; a test asserts a known downstream message does **not** appear.
- [ ] The JWT middleware's 4 unauthorized paths emit `401 UNAUTHENTICATED` in problem+json.
- [ ] `POST /webhook/stripe` emits problem+json, with its HTTP statuses unchanged from today.
- [ ] `grep` for direct 4xx/5xx writes in `game-server/api-gateway` outside the seam returns **zero hits**.
- [ ] The CI gate exists, and a fixture reintroducing one direct write makes it **exit non-zero** (demonstrated, not assumed).
- [ ] Success responses (200/201/202) are byte-identical to before.
- [ ] `game-client` reads `code`; no remaining read of `.error` or `.message` on a gateway error path.
- [ ] The full gateway test suite passes.

## Edge States

- **Downstream unreachable** (Consul resolution fails, connection refused) → `500 INTERNAL_ERROR`, generic detail, full error logged. Never surface the dial error.
- **Downstream returns an unmapped gRPC code** → `500 INTERNAL_ERROR`. The catch-all must exist so a new downstream code degrades safely rather than producing an empty status.
- **Downstream returns a non-gRPC error** (a plain Go error crossing a boundary) → sentinel matching, then catch-all.
- **`errors[]` cannot be populated from a gRPC failure** — the wire carries only a string message, so field-level precision must live in the `code`. Expect codes to get more specific over time; adding one is non-breaking.
- **Malformed JSON in the request body** → `400 VALIDATION_FAILED` from the seam, not a gin-generated bind error.
- **Missing/expired/malformed JWT** → `401 UNAUTHENTICATED`. The middleware aborts before the handler, so the seam must be reachable from middleware, not just handlers.
- **Panic in a handler** → recovery middleware must also emit problem+json, or 500s bypass the contract entirely.
- **Stripe webhook with a missing signature header** → `400 VALIDATION_FAILED`; Stripe retries on non-2xx as before.
- **Concurrent requests** — the seam is pure mapping and holds no state; no shared mutable data.
- **An error with an empty message** → `detail` falls back to the status text rather than emitting an empty string.

## API surface

This feature changes the **error half of all 33 existing routes** and adds no endpoints. Per-endpoint
rows are therefore not the useful shape here — the contract is cross-cutting, and per-endpoint
tables arrive as each endpoint serializes under ADR-0001 §9. What this feature pins:

**Error response body — all routes, all 4xx/5xx**

| Member | Type | Notes |
|---|---|---|
| `type` | string (URI) | problem type identifier; `about:blank` until types are minted |
| `title` | string | short, stable summary — defaults from status text |
| `status` | integer | mirrors the HTTP status |
| `detail` | string | client-safe, occurrence-specific. **Prose, not contract** |
| `code` | string | `SCREAMING_SNAKE` domain code. **This is what clients switch on** |
| `errors[]` | array | field-level detail; **always present**, empty when none |

Media type: `application/problem+json` (not `application/json`).

**Code → status mapping**

| Case | Response |
|---|---|
| downstream `NotFound` / local not-found sentinel | `404 · NOT_FOUND` |
| downstream `InvalidArgument` / malformed body | `400 · VALIDATION_FAILED` |
| downstream `AlreadyExists` | `409 · ALREADY_EXISTS` |
| missing / invalid / expired JWT | `401 · UNAUTHENTICATED` |
| downstream `PermissionDenied` | `403 · FORBIDDEN` |
| downstream `Unavailable`, unmapped code, panic | `500 · INTERNAL_ERROR` |

**Unchanged:** every route path, method, request body, and success response. Success envelopes
are explicitly out of scope.

> Note: 422 does not appear. ADR-0001 §7 reserves it for *shape* validation decided at the
> boundary from a typed handler signature — which does not exist until Huma is mounted. Until
> then all validation failures are domain failures and correctly carry 400.

## Out of Scope

- **Success response envelopes.** ~35 `c.JSON(http.StatusOK/Created/Accepted)` calls stay exactly as they are.
- **`game-service`'s 8 error writes.** A different service; the CI gate covers `api-gateway` only. It can adopt the vocabulary later by widening the pattern.
- **Promoting `errcode`/`apperr` into the ten downstream services.** They keep returning opaque gRPC errors; the gateway maps them. `common/` placement makes that promotion possible later, not now.
- **Serializing any endpoint / mounting Huma / generating `openapi.yaml`.** That is ADR-0001 §9 slice ⓪ work, unblocked by this feature but not part of it.
- **The gin/Go version bump** huma will force (gin ≥1.12, Go ≥1.25). Belongs to the first serialization slice.
- **`game-client`'s internal inconsistency** between its own `.error` and `.message` handling beyond gateway error paths.
- **Minting real `type` URIs.** `about:blank` is sufficient while `code` is the switch key.

---

## Scoping notes (raw) — retained

Decisions were locked in a `scope-it` session on 2026-08-11. **`challenge-me` was offered at
the pre-lock gate and declined — these four were not adversarially tested**, and the blast
radius is every gateway route plus the client.

1. **problem+json directly**, not an interim unified shape. *Rejected:* seam-only with each body
   preserved byte-for-byte (centralizes without unifying — four shapes survive, just relocated,
   and the contract layer still has nothing single to serialize); seam plus a bespoke shape (a
   shape we would deliberately break again). Going straight to the target breaks the client
   **once**.
2. **Vocabulary in `game-server/common/`**, not gateway-local. Costs blast radius (`common/` is
   a dependency of all 11 modules); buys not having to move it when downstream services adopt.
3. **Client cutover as the final slice of this feature**, not a follow-up. *Rejected:*
   transitional dual-read emitting both problem+json and legacy keys (safest, but ships a
   deliberately redundant body and depends on a cleanup that historically does not happen);
   separate follow-up FS (leaves the client broken in between unless dual-read anyway).
4. **CI grep gate**, not review-only enforcement, because 90 examples of the old pattern exist
   in git history to copy from.

**Correction carried in:** earlier notes and commit messages said "~122 error-status writes."
That figure counted every `c.JSON(http.Status…)` write in the gateway (125), successes included.
The measured figure is **90 errors** across 8 files, plus ~35 success writes. `game-service`
holds a further 8 error writes, out of scope here. ADR-0001 carries a dated erratum rather than
an edit; `docs/agents/contract.md` is corrected in place.

**Answered during promotion:** gate scope = `api-gateway` only (game-service's 8 writes are out
of scope, so a wider gate would be red on merge or quietly widen the feature). Stripe webhook =
migrated, no exemption, because Stripe reads the status and a first carve-out is how a gate
starts eroding. JWT middleware = replaced outright rather than forked, since every error body
changes at once here.
