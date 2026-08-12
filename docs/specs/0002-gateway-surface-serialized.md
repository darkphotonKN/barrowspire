# FS-0002: Gateway HTTP surface serialized

> Status: draft · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Edge → Gateway HTTP surface serialized" → this FS · Related ADRs: [`docs/adr/0001-contract-layer.md`](../adr/0001-contract-layer.md), [`docs/adr/0002-batch-retrofit-of-the-legacy-surface.md`](../adr/0002-batch-retrofit-of-the-legacy-surface.md)

## Scoping notes (raw)

Hot-context capture from the scoping session of 2026-08-13. Promoted by `write-a-spec`.

### What this is

Mount Huma over the existing gin router and transcribe every in-scope legacy endpoint into a
typed handler, so `openapi.yaml` is born, the interactive docs UI serves the whole surface, and
the three contract gates stop reporting SKIPPED. Ends on two acceptance conditions:

1. every in-scope endpoint appears in `openapi.yaml` and is browsable/testable in the live docs UI;
2. from the merge onward, new features use the normal chain with nothing special —
   FS §API surface → typed handler → derived yaml → generated client → gates.

### Pre-settled, not to be re-litigated

- **Transcription, not design.** Contract = current observed behavior, verbatim. Constraints
  come from existing validation, never invented. Optional stays optional. ADR-0002 §1.
- **No behavior changes ride this feature.** Anything that looks wrong goes to the pioneer log
  as a future FS candidate. ADR-0002 §2.
- **The error path is already done.** FS-0001 shipped the seam; problem+json is live on all 90
  error writes. The wrap consumes it rather than re-deciding it.
- **Retrofit mode is a decision, not a preference.** ADR-0001 §9 said serialize-on-touch, never
  big-bang. ADR-0002 supersedes it for this migration and explains why.

### The real surface (verified against config/routes.go, 2026-08-13)

**29 in-scope routes across 5 groups:**

| Group | Routes | Auth |
|---|---|---|
| member → `auth` | 8 | 3 public (`signup` AMQP→202, `signin`, `check-email`), 5 JWT |
| items → `items` | 11 | all JWT |
| payment → `payments` | 5 | all JWT (webhook excluded, see below) |
| notification → `notification` | 3 | all JWT |
| stats → `stats` | 2 | **public — no AuthMiddleware** |

### Corrections to the brief as received

The retrofit brief described a surface that is fireplace's, not barrowspire's. Verified absent:

- **no `refresh` endpoint** — `internal/auth/jwt.go` has the helper, nothing routes to it;
- **no users group, no admin ban/unban/list** — member routes live under `/api/member`;
- **no admin middleware** — `AuthMiddleware()` is the only one, so the planned "users slice
  proves the admin-middleware pattern" has no subject and the slice dissolves;
- **no `/ws` route on the gateway** — game-client connects to game-service directly on `:5668`,
  so the plane-2 fence is real as a principle but has nothing to exclude here.

Slice count drops from six to five as a result.

### Fences (go to Out of Scope verbatim)

- **`POST /webhook/stripe`** — external caller, raw-body signature verification incompatible
  with typed decode, no client consumer. Stays legacy gin. Restated in its slice's issue.
- **game-service traffic** — plane-2 contract is the typed game message layer, not OpenAPI.
  Nothing to exclude at the gateway, recorded so the boundary is explicit.
- **`/api/example/*`** — dead scaffold (2 routes). Not serialized; deletion is its own task.

### Judgment calls found during scoping

- **stats is unauthenticated.** The gateway's own spec already flags this as an open question
  ("public by design, or missing auth?"). Transcribed as public per ADR-0002 §1; logged as a
  behavior-change candidate. Serializing it does not bless it.
- **signup is AMQP fire-and-forget → 202.** Its typed response describes an accepted command,
  not a created member. `check-email` exists as its polling companion — the pair has to be
  transcribed together or the 202 looks like a bug.
- **`POST /api/items/weapon` and `/template`** are labelled "Legacy/Advanced" in code and are
  candidates for removal in favour of `complete-*`. Transcribed anyway: removing an endpoint is
  a behavior change, and the ratchet exists precisely to make that deliberate later.
- **Docs UI is public**, per ADR-0002 §6, with a revisit trigger recorded there.

### §API surface will document the RULE, not 25 rows

A per-endpoint table for a transcription is noise that invites drift from the code it claims to
describe. The section states the transcription rule plus a short table covering only the
endpoints carrying a judgment call (the four above).

### Slice plan

① wiring + member · ② items · ③ notification + stats · ④ payment (webhook fenced) ·
⑤ client cutover. ②–④ blocked by ①; ⑤ by all.

### Acceptance (to be formalised on promotion)

`make openapi && git diff --exit-code` clean · every in-scope route in `openapi.yaml` · docs UI
serves and lists all groups · per-group recorded before/after with byte-compatible responses
(error bodies excepted) · Spectral passes · oasdiff ratchet live from first merge ·
`make client` + `tsc` clean in game-client · seam gate stays green.
