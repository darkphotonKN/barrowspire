# FS-0001: Uniform, machine-readable error contract at the gateway

> Status: draft · SPECIFICATION.md: game-server/api-gateway/SPECIFICATION.md "### Edge → Uniform, machine-readable error contract" → this FS · Related ADRs: docs/adr/0001-contract-layer.md **§6** (error representation + the one-seam rule — this FS is what builds it)

## Scoping notes (raw)

Session: 2026-08-11. Scoped after a fleet-adoption pass flagged this as the blocking
precondition for adopting the contract layer (generated OpenAPI + gates + typed client) in
this repo. **All four decisions below were accepted without challenge — `challenge-me` was
offered at the pre-lock gate and declined (not challenged).** Worth re-reading before
implementation, because the blast radius is the whole gateway plus the client.

### Observed state (measured, not assumed)

- **~122 direct error-status writes** across gateway handlers — `c.JSON(http.Status…)` called
  inline, each handler deciding its own status.
- **Four different error body shapes already in production:**
  `{"error":…}` ×16 · `{"statusCode":…,"message":…}` ×5 · `{"statusCode":…,"error":…}` ×1 ·
  and one that interpolates the **raw downstream error** into the client response.
  That last one is an **information leak**, not merely an inconsistency — it must not survive.
- **No error package exists.** No `apperr`, no sentinels, no `errcode`. Unlike the sibling
  repos (one has `pkg/apperr` + `pkg/httpx`, another has `apierr.StatusFor`), this gateway has
  nothing to centralize *onto* — the vocabulary is greenfield and part of this work.
- **The mapping logic is already written, just duplicated.** `internal/gateway/auth/handler.go`
  contains `status.FromError` plus a `switch` over `codes.InvalidArgument` / `codes.AlreadyExists`,
  repeated per handler. The seam **collects** existing switches; it does not invent mapping.
- **Downstream is gRPC** over Consul-discovered clients, so the seam maps gRPC status → HTTP
  status + domain code.
- **The client reads the old keys:** `game-client` reads `.error` (18×) and `.message` (14×)
  across ~15 files. Both key names disappear under problem+json.

### Decisions and rationale

1. **Go straight to RFC 9457 `problem+json` with a domain `code`** — do not land an
   intermediate unified shape first.
   *Why:* the contract layer will require problem+json regardless. Landing an interim shape
   breaks the client **twice** for the same end state. One break, one coordination.
   *Rejected:* (a) *seam only, preserve each body byte-for-byte* — zero client impact and
   trivially reversible, but produces a centralized function whose job is to faithfully
   reproduce four inconsistent shapes; the inconsistency survives, it just moves, and the
   contract layer still has nothing single to serialize. (b) *seam + a bespoke unified shape* —
   consistent, but a shape we would deliberately break again later.

2. **Vocabulary lives in `game-server/common/`** — `common/errcode` (codes) and `common/apperr`
   (sentinels), not gateway-local.
   *Why:* the 10 downstream services should eventually return the same vocabulary the gateway
   maps; placing it in the shared module now avoids a second migration later.
   *Cost accepted:* `common/` is a dependency of all 11 modules, so changes there ripple.
   *Rejected:* gateway-local `pkg/apperr` — smaller blast radius now, but guarantees a move.
   *Note:* this feature only makes the gateway **consume** the vocabulary. Downstream services
   keep returning opaque gRPC errors — promoting them is parked (below).

3. **The client cuts over in the final slice of THIS feature**, not a follow-up.
   *Why:* the contract ADR's rule that the two halves of one endpoint never straddle two
   features. The out-of-step window stays inside one branch.
   *Rejected:* (a) *transitional dual-read* — emit problem+json **and** duplicate legacy
   `error`/`message` keys for a release. Safest for a live client, but ships a deliberately
   redundant body and depends on a scheduled cleanup that historically does not happen.
   (b) *separate follow-up feature* — leaves the client broken between the two unless the seam
   keeps legacy keys anyway, which collapses back into (a).

4. **Acceptance is enforced by a CI grep gate**, not by review alone.
   *Why:* 122 call sites means the old pattern is everywhere in git history to copy from;
   review depends on a reviewer noticing. The gate catches a regression the day it appears.
   **The gate must itself be verified by a fixture that reintroduces one call and goes red** —
   a gate that has never rejected anything is unverified configuration.
   *Rejected:* code-review-only enforcement.

### The constraint (routed to ADR-0001, not this FS)

"Uniform error contract **via** a single problem+json seam" is compound. The capability — *can
it be done?* — is this FS. The constraint — *does it hold?* — is ADR-0001:

> Gateway errors are RFC 9457 `problem+json` carrying a domain `code`, and HTTP **error status
> is decided in exactly one place**. `code` is contract (removing/repurposing one is breaking;
> adding is not); `detail` is prose and explicitly not contract.

### Edge cases and open questions

- **Success responses are out of scope.** ~23 `c.JSON(http.StatusOK/Created)` calls stay as
  they are; the gate targets 4xx/5xx only. Whether success envelopes also need unifying is a
  separate question, deliberately not opened here.
- **The unauthenticated Stripe webhook route** — does a third-party caller depend on the
  current error body? Must be checked before the seam changes it; Stripe may only care about
  status codes, but this is unverified.
- **Auth middleware rejects before handlers run.** If it aborts with a legacy body, 401 — the
  most common error — stays outside the contract. The middleware needs the same treatment
  (sibling repos hit exactly this and forked a problem-emitting variant rather than replacing
  the shared one).
- **`errors[]` field-level detail cannot be populated from a gRPC failure** — the wire carries
  only a string message, so precision has to live in the `code`. Expect codes to get more
  specific over time; adding one is non-breaking.
- **Not settled:** the initial `errcode` membership. The generic floor (unauthenticated,
  validation-failed, not-found, already-exists, forbidden, internal) is obvious; which
  domain-specific codes exist on day one is not, and should fall out of walking the 122 sites.
- **Not settled:** whether the CI gate greps only `api-gateway/` or the whole `game-server/`.

### Parking lot

- Promoting `errcode`/`apperr` into the 10 downstream services so they return the vocabulary
  rather than opaque gRPC errors.
- `game-client`'s own internal inconsistency between `.error` and `.message` handling.
- Unifying **success** response envelopes.

### Why this feature exists now

It is the **precondition for the contract layer**. Adoption was declined for this repo on the
grounds that the error adapter assumes a single error-mapping seam and none exists. This FS
builds that seam and lands the exact error model the contract layer mandates — so when it
ships, contract-layer adoption becomes a yes with no rework.
