# FS-0002: Gateway HTTP surface serialized

> Status: work-order · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Edge → Gateway HTTP surface serialized" → this FS · Related ADRs: [`docs/adr/0001-contract-layer.md`](../adr/0001-contract-layer.md) (the layer itself), [`docs/adr/0002-batch-retrofit-of-the-legacy-surface.md`](../adr/0002-batch-retrofit-of-the-legacy-surface.md) (why this is one batch rather than serialize-on-touch)

## Summary

The gateway's 29 in-scope HTTP routes are described nowhere machine-readable. Clients are
hand-written against them, nothing detects a breaking change, and the contract gates copied in
at setup report SKIPPED because there is no document for them to act on.

This feature mounts Huma over the existing gin router and transcribes every in-scope endpoint
into a typed handler, so `openapi.yaml` is derived from signatures, the interactive docs UI
serves the whole surface, and the gates go live. It is **transcription, not design**: each
endpoint's contract is its current behavior, verbatim.

It ends on two conditions. Every in-scope endpoint is in `openapi.yaml` and browsable in the
docs UI. And from the merge onward, a new feature uses the normal chain with nothing special —
which is the point of the whole exercise.

## Requirements

**Mounting**

1. Huma is mounted on the **existing** `gin.Engine` via the humagin adapter. The router, its
   middleware order (Recovery → Logger → CORS → otelgin), and every unserialized route continue
   to work unchanged. Huma is added to the gateway, not substituted for it.
2. Serialized and legacy routes coexist for the duration of the feature. A group is fully
   serialized or fully legacy — never half, because a half-serialized group produces a spec that
   describes some of its own paths.
3. **Identity bridge.** `AuthMiddleware` sets `userId`/`userIdStr` on the gin context. Typed
   handlers receive identity through a Huma-visible mechanism that reads the same values, so
   there is exactly one source of caller identity. Identity is **never** taken from a request
   body (ADR-0001 §5).
4. Both middleware patterns are exercised by the first slice: public routes (no auth) and
   JWT-protected routes. `stats` additionally proves a public route in a group that is otherwise
   read-only.

**The transcription rule**

5. Every operation's request and response types describe **current observed behavior**.
   Constraints are transcribed from existing validation; none are invented. A field that is
   optional today stays optional even where required would be better (ADR-0002 §1).
6. A defect noticed during transcription — missing validation, a questionable status, an
   unauthenticated route that looks like it should not be — is recorded in the pioneer log as a
   future behavior-change candidate and **left in place** (ADR-0002 §2). Fixing it silently
   would make the before/after check meaningless, since that check is the only proof the
   transcription was faithful.
7. Transport types are declared per operation and are never downstream protobuf types or
   storage models (ADR-0001 §5). Request types carry writable fields only.

**Errors**

8. Huma's error path is adapted to the **existing seam**. A failure inside a typed handler
   produces the same `application/problem+json` body with the same `code` vocabulary as
   `internal/httperr` produces today. Huma does not get its own error format.
9. The seam gate stays green: no direct 4xx/5xx status writes appear outside
   `internal/httperr`, including in new typed handlers.

**The two deliberate status changes**

10. **Shape validation fails 422.** ADR-0001 §7 reserves 422 for shape failures decided at the
    boundary from a typed signature; FS-0001 recorded that 422 "does not appear ... until Huma
    is mounted." This feature mounts Huma, so a malformed or type-invalid body that today
    returns `400 VALIDATION_FAILED` from `httperr.BindError` will return **422** once its
    endpoint is serialized. This is the designed end state, not a regression, and it is the
    single expected status difference in the before/after comparison.
11. **Unknown request members are rejected.** ADR-0001 §8 sets plane 1 to strict because the
    consumer ships with the server: silently ignoring an unknown member turns a client typo
    into a no-op the user believes succeeded. Strictness is enabled with serialization. Each
    group's before/after script must exercise the payloads `game-client` actually sends, so a
    payload that would newly 422 is found before merge rather than in the UI.

    > These two are the *only* behavior changes permitted by this feature. Both are mandated by
    > an already-accepted ADR clause; neither is a judgment made here. Anything else that
    > changes is a transcription error.

**Documentation surface**

12. The interactive docs UI is mounted on a **public** route and lists every serialized
    operation (ADR-0002 §6, which records the revisit trigger).
13. `openapi.yaml` is **generated, committed, and never hand-edited**. CI regenerates and fails
    on any diff.

**Gates**

14. `make openapi`, `make client`, `make lint-contract`, `make openapi-diff`, and
    `make openapi-breaking` all act on a real document rather than reporting SKIPPED.
15. The breaking-change ratchet is live from the first merge onward. It is structurally blind to
    each group's *first* serialization (ADR-0001's stated blind spot), which is what requirement
    16 exists to cover.
16. **Each group ships with a recorded before/after comparison.** Every endpoint in the group is
    exercised against a running gateway before and after its wrap; responses must be
    byte-compatible, with error bodies excepted (changed in FS-0001, already shipped) and the
    two changes in requirements 10–11 expected and annotated.

**Client**

17. `game-client` consumes serialized endpoints **only** through the generated client. A
    hand-written `fetch` against a serialized path is a HIGH review finding (ADR-0001 §4), and a
    lint rule enforces it.
18. WebSocket code is untouched. game-service is plane 2 and is contacted directly.

## User Stories

1. As a **frontend developer**, I want a generated TypeScript client, so that a contract change
   breaks my build instead of a user's session.
2. As a **frontend developer**, I want to browse every endpoint in a docs UI, so that I do not
   read Go handlers to learn what a route accepts.
3. As a **frontend developer**, I want request and response types I can autocomplete, so that a
   typo'd field name is a compile error.
4. As a **backend developer**, I want the spec derived from handler signatures, so that it
   cannot drift from the code the way a hand-written document does.
5. As a **backend developer**, I want to add an endpoint without also writing its schema, so
   that the mechanical half of the contract costs me nothing.
6. As a **reviewer**, I want the schema diff on the pull request, so that a contract change is
   something I approve rather than something I discover.
7. As a **reviewer**, I want a breaking change to fail CI, so that it becomes a deliberate,
   allowlisted act.
8. As a **new contributor**, I want one place that describes the HTTP surface, so that I do not
   have to reconstruct it from route registration.
9. As an **on-call engineer**, I want the docs UI to show what a failing endpoint promises, so
   that I can tell a contract violation from a downstream outage.
10. As a **QA engineer**, I want to exercise endpoints from the docs UI, so that I can reproduce
    a report without writing a client.
11. As a **maintainer**, I want serialization done in one batch, so that the gates stop being
    decoration for an unbounded period.
12. As a **maintainer**, I want each group verified before and after, so that a transcription
    error surfaces as a diff rather than as a player bug.
13. As a **maintainer**, I want defects found during transcription logged rather than fixed, so
    that the wrap stays verifiable and the fix gets its own spec.
14. As a **maintainer**, I want the error path to reuse the shipped seam, so that this feature
    does not invent a second error format.
15. As a **security reviewer**, I want identity taken only from the verified token, so that a
    request body cannot assert who the caller is.
16. As a **security reviewer**, I want unknown request members rejected, so that a client typo
    fails loudly instead of silently doing nothing.
17. As a **client author**, I want a hand-written fetch to a serialized path to fail lint, so
    that the generated client cannot be bypassed by habit.
18. As a **product owner**, I want the surface documented publicly, so that the API is legible
    without credentials.
19. As **the next feature's author**, I want to add an endpoint through the normal chain with no
    migration step, so that the contract layer is simply how the repo works.
20. As **the next feature's author**, I want the legacy fences named explicitly, so that I know
    the webhook and game-service traffic are excluded on purpose rather than forgotten.

## Acceptance Criteria

- [ ] `make openapi && git diff --exit-code` is clean — the committed spec matches the derived one
- [ ] All 29 in-scope routes appear in `openapi.yaml`
- [ ] The docs UI is reachable on its public route and lists all five groups
- [ ] Every group has a recorded before/after run; responses byte-compatible except error bodies
      and the two annotated changes (requirements 10–11)
- [ ] `make lint-contract` (Spectral) passes
- [ ] `make openapi-breaking` runs against a real baseline rather than reporting SKIPPED
- [ ] `make client` regenerates cleanly and `tsc` is clean in `game-client`
- [ ] `game-client` calls every serialized endpoint through the generated client
- [ ] A hand-written fetch to a serialized path fails lint — demonstrated, not asserted
- [ ] `scripts/check-seam.sh` still passes: no direct error-status writes outside the seam
- [ ] Legacy routes (webhook, example) still work and are absent from `openapi.yaml`
- [ ] The full gateway and client test suites pass; `next build` succeeds
- [ ] A pioneer-log entry exists listing every behavior-change candidate found and deferred

## Edge States

- **A group is half-wrapped when CI runs** → forbidden by requirement 2. A slice serializes a
  whole group or none of it.
- **A legacy route and a serialized route share a prefix** → the legacy route keeps working;
  Huma owns only the paths it registers. Verified for `/api/payment/*` against `/webhook/stripe`.
- **A typed handler panics** → the existing `httperr.Recovery()` still owns the response, because
  Huma is mounted inside the same engine and its middleware chain.
- **A downstream returns an unmapped gRPC code** → unchanged from FS-0001: `500 INTERNAL_ERROR`
  via the seam. Huma's own error formatter must not intercept it.
- **A request carries an unknown member** → `422` (requirement 11). Before/after scripts must
  use the payloads `game-client` really sends so this is discovered pre-merge.
- **A malformed body reaches a serialized endpoint** → `422` from the boundary rather than the
  `400` the legacy binder produced (requirement 10). Annotated in the comparison, not silently
  accepted.
- **A malformed body reaches an unserialized endpoint** → still `400 VALIDATION_FAILED`. The two
  statuses coexist while the migration is in flight; that is expected and ends at slice ⑤.
- **The docs UI is requested with no credentials** → it renders. Public by decision (ADR-0002 §6).
- **`openapi.yaml` does not exist yet** → gates report SKIPPED with a stated reason, as they do
  today. This stops being reachable after slice ①.
- **An endpoint's current behavior is wrong** → it is transcribed wrong, on purpose, and logged
  (requirement 6).
- **`signup` returns 202 with no member body** → transcribed as an accepted command, not a
  created resource. Its polling companion `check-email` is serialized in the same slice so the
  pair reads coherently.

## API surface

This feature adds **no endpoints**. It describes 29 that already exist, so per-endpoint rows
would restate the code they are derived from and would drift from it. What this section pins is
the **rule**:

> **Every operation's contract is its current observed behavior, transcribed verbatim.**
> Request and response fields, their names, their types, and their optionality come from what
> the endpoint accepts and returns today. Constraints are transcribed from existing validation
> and never invented. A field that is optional today stays optional even where required would
> be better. The authoritative description of each operation is its typed signature, and
> `openapi.yaml` is derived from it.

Error responses are already pinned by [FS-0001 §API surface](0001-uniform-error-contract.md) and
are not restated here, with one addition: **422 · VALIDATION_FAILED** for shape failures at a
serialized boundary (requirement 10).

**Endpoints carrying a judgment call** — the only rows worth writing down:

| Op | Route | The call, and why |
|---|---|---|
| signup | `POST /api/member/signup` | AMQP fire-and-forget → **202**, no member in the body. Transcribed as an accepted command, not a created resource. |
| check-email | `GET /api/member/check-email` | Exists only as signup's polling companion. Serialized in the same slice, or the 202 above reads as a defect. |
| leaderboard, player stats | `GET /api/stats/*` | **Public — no `AuthMiddleware`.** The gateway spec already asks whether that is intended. Transcribed as public; logged as a candidate. Serializing it does not bless it. |
| create weapon, create template | `POST /api/items/weapon`, `/template` | Labelled "Legacy/Advanced" in code, superseded by `complete-*`. Transcribed anyway — removing an endpoint is a behavior change, and the ratchet exists to make that deliberate later. |

## Out of Scope

- **`POST /webhook/stripe`** — external caller, raw-body signature verification incompatible
  with typed decode, no client consumer. Stays legacy gin. Restated in slice ④'s issue.
- **game-service traffic** — plane 2. Its contract is the typed game message layer, not OpenAPI.
  `game-client` connects to it directly on `:5668`; the gateway has no `/ws` route to exclude.
  Recorded so the boundary is explicit rather than assumed.
- **`/api/example/*`** — dead scaffold, 2 routes. Not serialized. Deleting it is its own task.
- **Every behavior change.** Missing validation, the unauthenticated stats routes, the
  superseded item endpoints: logged, not fixed (ADR-0002 §2).
- **Plane 2 (`buf` governance)** — unwired, and untouched by this feature.
- **Deleting the legacy gin handlers** whose routes are now serialized — they are removed as
  each group is wrapped, but no separate cleanup pass is scheduled here.
