# FS-0002T: Member signup and sign-in

> Status: example · SPECIFICATION.md: none — nothing points here, by design · Related ADRs: [`docs/adr/0001-contract-layer.md`](../adr/0001-contract-layer.md) (the contract layer), [`FS-0001`](0001-uniform-error-contract.md) (the error half of every route)

---

> ## ⚠ EXAMPLE — teaching material, not a work order
>
> **No skill may act on this file.** It is not a record of planned or outstanding work.
>
> **What it is.** A feature spec written the way one *would* have been written if signup and
> sign-in had come through `/scope-it` → `/write-a-spec` as their own capability — so the
> journey from a ratified `§API surface` table to a typed handler to a generated contract can
> be shown at three-endpoint scale. The real work is
> [FS-0002](0002-gateway-surface-serialized.md), which covers 29 endpoints in one batch and
> deliberately writes **no** per-endpoint table. That table is the thing worth teaching, so this
> file writes it.
>
> **The work it describes already shipped.** Every field, status, and error code below is
> transcribed from the running gateway — diff any row against `openapi.yaml` and it matches.
> Nothing here is outstanding.
>
> **Why it is inert.** `Status: example` is not a lifecycle state: `develop` and
> `spec-to-issues` accept only `work-order` and will refuse this file; `open-map` buckets
> `work-order` and `draft` and so will not list it as a quest; `spec-audit` never opens
> `docs/specs/` at all; `code-review` loads only an FS that a change references, and no issue
> references `FS-0002T`. The `EXAMPLE-` filename prefix keeps it out of the `NNNN-slug.md`
> namespace, and `0002T` is not an allocated number — the next real FS is `0003`.
>
> **Do not** add a thin line for it to `SPECIFICATION.md`, and do not register it in
> `docs/specs/README.md` — that file is a tracked copy of the fleet template and must byte-match
> it. This banner is the only marker, which is why it is self-contained.

---

## Summary

A player cannot get into the game without an account. This feature covers the three operations
that stand between a stranger and a session: request an account, find out when it exists, and
exchange credentials for tokens.

Account creation is **asynchronous**. The gateway publishes a signup command to the broker and
answers immediately; auth-service creates the member out-of-band. That one decision shapes the
whole surface — signup returns `202` with no member in the body, and a polling companion
(`check-email`) exists solely so a client can observe the account appear. Sign-in is
synchronous and ordinary by comparison: a gRPC call to auth-service, tokens back.

All three operations are **public** — they are what a caller uses *before* holding a token, so
none of them can require one.

## Requirements

**Signup**

1. `POST /api/member/signup` accepts a name, an email, and a password, publishes a
   `member.create` command to the broker, and returns `202 Accepted` without waiting for the
   account to exist.
2. The response body carries **no member**. Returning one would assert a resource that has not
   been created, which is precisely what `202` exists to avoid claiming.
3. A **duplicate email is not a signup error.** The command is accepted before it is evaluated,
   so uniqueness is enforced downstream and observed through requirement 4. Signup has no
   `409`.
4. When the broker is unreachable, the response is `503 · SERVICE_UNAVAILABLE`, never `500`.
   The request was well-formed and would succeed once the broker returns; a `500` would tell
   every client to give up on a retryable request (FS-0001 §Requirements 5 as amended).

**Observing the account**

5. `GET /api/member/check-email` reports whether an email is already registered. It exists as
   **signup's polling companion** and ships in the same slice — without it, the `202` in
   requirement 1 reads as a defect rather than a design.
6. It is public and unauthenticated by necessity: the caller has no account yet.

**Sign-in**

7. `POST /api/member/signin` exchanges an email and password for an access token, a refresh
   token, and the member record.
8. **A wrong password and an unknown email are indistinguishable** — same status, same code,
   same detail. Distinguishing them turns sign-in into an account-enumeration oracle.
9. Both tokens are returned with their lifetimes in seconds, so a client can schedule a refresh
   without decoding a JWT it has no business parsing.

**Contract**

10. All three operations are declared as typed handlers, so `openapi.yaml` is **derived** from
    their signatures. No hand-written OpenAPI, no hand-written client.
11. Failures use the shared seam: `application/problem+json` carrying a stable `code` from
    `common/errcode`. These operations introduce **no new codes** — the generic vocabulary
    covers every failure mode here.
12. Validation splits by layer, never per endpoint (ADR-0001 §6–§8): shape is decided at the
    boundary from the type and answers `422`; domain rules are decided by the **owning service**
    and answer `400` plus a code. The gateway never restates an auth-service rule.

## User Stories

- **As a new player**, I submit my name, email, and password and am told immediately that my
  request was accepted, so I am not left staring at a spinner while a queue drains.
- **As a new player whose email is already taken**, I am told so — not by signup, which already
  returned, but by the client polling `check-email` and finding the account was not mine.
- **As a returning player**, I sign in and receive tokens plus my member record in one round
  trip, so the client can render my profile without a second call.
- **As an attacker probing for valid accounts**, sign-in tells me nothing: a registered email
  with a wrong password and an unregistered email produce identical responses.
- **As a frontend developer**, I import generated types for all three operations, and a field
  rename on the server fails my type check rather than my users' sessions.

## Acceptance Criteria

- [ ] All three operations appear in `openapi.yaml`, generated — the file is never hand-edited,
      and `make openapi-diff` proves the committed copy matches the code.
- [ ] `make client` regenerates the TypeScript client; the login and register screens call the
      gateway through it, with no raw `fetch` against these paths.
- [ ] Signup returns `202` with `{statusCode, message}` and no member.
- [ ] Signup with the broker down returns `503 · SERVICE_UNAVAILABLE`, verified by a test that
      stubs a publish failure.
- [ ] Sign-in with a wrong password and sign-in with an unknown email produce byte-identical
      response bodies apart from nothing — status, `code`, and `detail` all match.
- [ ] Every failure carries `application/problem+json`, a `code` from `common/errcode`, and a
      present (possibly empty) `errors[]`.
- [ ] No 4xx/5xx status is written outside the error seam in any of the three handlers.
- [ ] The client switches on `code` and never on `detail`, and an unrecognised code degrades to
      the server's `detail` rather than a blank message.
- [ ] `make lint-contract` passes: every operation has a description and documents its errors.

## Edge States

| State | Behavior |
|---|---|
| Signup body is `{}` | Accepted at the boundary — shape is satisfied. auth-service decides, and the account never appears; the client observes this by polling. |
| Signup with an email already registered | `202`. The command is discarded downstream. `check-email` reports `true`, which the client cannot distinguish from "your own account was created" — the client must have submitted the email it is polling. |
| Client stops polling before the account appears | Account is still created. Next sign-in works. Nothing is orphaned. |
| Broker accepts the publish, auth-service then fails | Signup already returned `202`. The failure is invisible to this surface; the account simply never appears. |
| `check-email` called with no `email` parameter | `400 · VALIDATION_FAILED` with an authored detail — **not** a `422`. See the note under the table; this is a wart, not a design. |
| Sign-in body is `{}` | Reaches auth-service, which refuses it: `401 · UNAUTHENTICATED`. The edge does not pre-empt it, because "are these credentials valid" is a domain question. |
| Sign-in succeeds but returns no tokens | Not representable server-side, but every generated field is optional, so the client guards and surfaces a session error rather than storing `undefined`. |
| auth-service unreachable on sign-in | The seam maps gRPC `Unavailable` to `503 · SERVICE_UNAVAILABLE` — but the operation does not declare `503`, so a well-behaved generated client has no type for it. Recorded as a gap, not fixed here. |

## API surface

Three operations, all in the `member` group, all **public** — no `Authorization` header, no
bearer scheme in the contract. Field-level tables, because this is a new resource surface.

Error bodies are RFC 9457 `application/problem+json` as pinned by
[FS-0001 §API surface](0001-uniform-error-contract.md) and are not restated per endpoint; only
the `status · code` rows each operation declares are listed.

### 1 · `POST /api/member/signup` — request a new member account

**Request body** (writable fields only — no `id`, no `createdAt`, no identity):

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | optional | Display name |
| `email` | string | optional | Email address |
| `password` | string | optional | Plaintext over TLS; hashed by auth-service, never stored or logged at the edge |

> **Why all three are optional.** The boundary answers one question — *is this a well-formed
> signup request?* — and a missing `name` does not make it malformed. Whether a blank name is
> **acceptable** is a domain rule owned by auth-service, and the edge does not restate it
> (requirement 12). The cost is real and accepted: `{}` is a valid signup request that will
> never produce an account.

**Success — `202 Accepted`**

| Field | Type | Notes |
|---|---|---|
| `statusCode` | integer | Duplicates the HTTP status |
| `message` | string | Human-readable summary |

**Errors**

| Case | Response |
|---|---|
| unknown body member, malformed JSON | `422 · VALIDATION_FAILED` |
| broker unreachable | `503 · SERVICE_UNAVAILABLE` |
| encoding fault, panic, anything unmapped | `500 · INTERNAL_ERROR` |

There is deliberately **no `409 · ALREADY_EXISTS` row** — see requirement 3. A client that
handles `ALREADY_EXISTS` on this operation is handling a response it can never receive.

### 2 · `GET /api/member/check-email` — has this email registered yet?

**Request**

| Param | In | Type | Required | Notes |
|---|---|---|---|---|
| `email` | query | string | optional *(see note)* | Email address to check |

> **This row is a wart, and worth naming.** The parameter is not declared required, so the
> handler checks for an empty value itself and answers `400 · VALIDATION_FAILED`. Declared
> `required`, the boundary would reject it as `422` before the handler ran — which is what
> requirement 12 asks for. The design is `422`; the code is `400`. The table is where that gap
> becomes visible, because the shape alone in `openapi.yaml` reads as perfectly fine.

**Success — `200 OK`**

| Field | Type | Notes |
|---|---|---|
| `statusCode` | integer | Duplicates the HTTP status |
| `exists` | boolean | Whether an account already uses this email |

**Errors**

| Case | Response |
|---|---|
| `email` missing or empty | `400 · VALIDATION_FAILED` |
| unknown query member | `422 · VALIDATION_FAILED` |
| anything unmapped | `500 · INTERNAL_ERROR` |

Two rows share `VALIDATION_FAILED` across two statuses. That is the split working as intended:
the status says *which layer refused you*, the code says *what kind of refusal it was*.

> **No `503` row, and that is a gap.** This operation calls auth-service over gRPC, so the seam
> can map a downstream `Unavailable` to `503 · SERVICE_UNAVAILABLE` at runtime — but the
> operation does not declare it, so it never reaches the contract or the generated client. See
> question 4 in the appendix.

### 3 · `POST /api/member/signin` — exchange credentials for tokens

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | optional | Email address |
| `password` | string | optional | Plaintext over TLS |

**Success — `200 OK`**

| Field | Type | Notes |
|---|---|---|
| `statusCode` | integer | Duplicates the HTTP status |
| `message` | string | Human-readable summary |
| `result` | LoginResult | Tokens and member |

`LoginResult`:

| Field | Type | Notes |
|---|---|---|
| `access_token` | string | Sent as `Authorization: Bearer <token>` on protected operations |
| `refresh_token` | string | Exchanged for a new access token — out of scope here |
| `access_expires_in` | integer | Lifetime in seconds, so the client never decodes the JWT |
| `refresh_expires_in` | integer | Lifetime in seconds |
| `member_info` | Member | The signed-in member |

`Member`:

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Member id |
| `name` | string | Display name |
| `email` | string | Email address |
| `status` | integer | Account status code as stored by auth-service |
| `average_rating` | number | Average rating |
| `created_at` | Timestamp | `{seconds, nanos}` object, **not** an RFC 3339 string |
| `updated_at` | Timestamp | Same shape |
| `avatar_url` | string | Empty when unset |
| `role` | string | Member role |

**Errors**

| Case | Response |
|---|---|
| wrong password **or** unknown email | `401 · UNAUTHENTICATED` — indistinguishable by design (requirement 8) |
| downstream rejected the credentials shape | `400 · VALIDATION_FAILED` |
| unknown body member, malformed JSON | `422 · VALIDATION_FAILED` |
| anything unmapped | `500 · INTERNAL_ERROR` |

> **Same missing `503` as `check-email`.** Sign-in reaches auth-service over gRPC and can
> therefore produce a `503` the contract does not declare. Signup declares its `503` because
> its broker-publish failure was handled explicitly; these two inherited theirs from the seam
> and nobody wrote the row.

### Shape decisions worth naming

Five things a reader will notice and should not have to guess about:

1. **Every success response is wrapped in a `statusCode` + `message` envelope** that duplicates
   the HTTP status line. It carries no information the response already lacks. It stays because
   removing it is a client-visible shape break, and that belongs to a deliberate cutover
   (ADR-0001 §11), not to a feature that happens to touch the endpoint.
2. **Every field is optional in the generated types.** The gateway marshals from protobuf,
   which emits `omitempty` on every scalar, so absence is genuinely possible on the wire. The
   contract is being honest rather than the generator being unhelpful — the client guards at
   the call site.
3. **`202`, not `201`.** The account is not created when this responds. `201` would name a
   resource and a `Location`, and neither exists yet.
4. **One `401` for two causes.** Fewer response codes than the truth has, on purpose.
5. **Timestamps are objects, not strings.** `{seconds, nanos}` straight from protobuf. A
   client formatting a date does the arithmetic itself.

## Out of Scope

- **Token refresh** — the refresh token is returned here; exchanging it is its own operation and
  its own spec.
- **Password update, profile update, avatar upload** — the protected half of the member group.
  They require a bearer token and belong with the authenticated surface.
- **Email verification links** — `check-email` reports existence, not ownership. No mail is sent
  by this feature.
- **Rate limiting and lockout** — sign-in is unthrottled here. Named so its absence is a
  recorded gap rather than an oversight.
- **Any change to auth-service.** This feature is the gateway's surface over behavior that
  already exists downstream.
- **The `400` on `check-email`** (see the note under its table). Correcting it to a declared
  `required` parameter moves a status and is therefore a behavior change with its own work
  order.

---

## Teaching appendix — trace one row to five files

*Not part of the FS. This is the walkthrough the FS above exists to support.*

Pick one field — `access_token` — and follow it. Every hop is a real file in barrowspire:

| # | Stage | File | Authored or derived |
|---|---|---|---|
| 1 | **Design** | this FS, §API surface → `LoginResult` table | **authored** — a human ratifies the name |
| 2 | **Type** | `game-server/api-gateway/internal/gateway/auth/wire.go` → `LoginResult.AccessToken` | **authored** |
| 3 | **Operation** | `.../auth/typed.go` → `registerSignin` (path, statuses, description, error list) | **authored** |
| 4 | **Collect** | `.../internal/contract/register.go` → `RegisterOperations` gathers every group | **authored** |
| 5 | **Mount** | `.../internal/contract/contract.go` → `New(router)` binds Huma to the gin engine | **authored** |
| 6a | **Serve** | `.../config/routes.go` → `contract.RegisterOperations(contract.New(router), …)` | **authored** — the live route |
| 6b | **Project** | `.../cmd/openapi/main.go` → the *same* call, nil clients | **authored** — the generator |
| 7 | **Contract** | `game-server/api-gateway/openapi.yaml` → `/api/member/signin`, `components.schemas.LoginResult` | **derived** — `make openapi` runs 6b |
| 8 | **Client** | `game-client/src/api/generated/schema.d.ts` | **derived** — `make client` |
| 9 | **Consume** | `game-client/src/app/login/page.tsx` → `publicClient.POST("/api/member/signin", …)` | **authored** |

Stages 7 and 8 are never hand-edited. `make openapi-diff` fails the build if the committed
contract does not match what the code projects.

### Stages 4–6: the step that makes the rest true

Read `typed.go` on its own and nothing tells you it affects a live request. It looks like
metadata — a path string, a status list, a description. It is fair to assume some generator
scrapes it later and that the actual routing happens somewhere else.

It doesn't. **`huma.Register` installs a handler.** The call in `registerSignin` does three
jobs at once, from one declaration:

- **It routes.** `contract.New(router)` wraps the existing `gin.Engine` through the `humagin`
  adapter and returns the `huma.API` handle. Registering against that handle puts a real route
  on the real gin engine. Huma is *added* to the gateway, not substituted for it — every legacy
  gin route above it keeps working, and Huma owns only the paths it registers.
- **It validates.** `SigninBody` is not documentation. The boundary decodes the request into it
  and rejects what does not fit — that is where the `422` in the error table physically comes
  from, and why `additionalProperties: false` is enforcement rather than description.
- **It describes.** The same registration records the types and metadata that the document is
  projected from.

Then stage 6 forks. **One `RegisterOperations`, two callers:**

```
                      internal/contract/register.go
                          RegisterOperations(api, deps)
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
        config/routes.go                          cmd/openapi/main.go
   contract.New(router) + real clients      contract.New(gin.New()) + nil clients
                 │                                       │
          serves live traffic                    api.OpenAPI().YAML()
                                                         │
                                                   openapi.yaml
```

This fork is the mechanism behind every claim in this file. The document is not generated from
a *description* of the server — it is generated from **the very object that serves the
traffic**, built by the same function call. There is no list of routes anywhere for the
generator to keep in step with, because the generator has no list; it has the API handle.

`register.go`'s own comment states the alternative and why it was rejected: a generator with
its own route list is a second source of truth, and the two drift the first time someone adds
an operation to one of them — producing a spec that is confidently wrong while CI stays green.

The generator passes **nil downstream clients** and this is safe by construction: registration
records an operation's types and metadata and never invokes a handler. `make openapi` therefore
dials no Consul, no RabbitMQ, no database — it is a pure function of the source tree, which is
exactly what makes `openapi-diff` a meaningful gate rather than a flaky one.

Collection happens at two levels, and both are opt-in by hand: a new *operation* is added to its
group's `RegisterOperations` in `typed.go`, and a new *group* is added to
`contract/register.go`.

**The question to make them answer:** *you write `registerRefreshToken` in `typed.go` and forget
the one line adding it to the group's `RegisterOperations` — what breaks?* — Nothing visible. The
function compiles, is never called, so the route is never installed and never described. No
client can reach it; no gate objects, because the contract still matches the code exactly. It is
dead code that looks like a shipped endpoint. That is stage 4 earning its place on this list —
and the reason the FS's acceptance criteria check that operations *appear in `openapi.yaml`*
rather than that they were written.

**The three questions to make them answer:**

1. *Where would you rename `access_token` to `token`?* — Stage 2, and nowhere else. Stages 4–5
   regenerate; stage 6 stops compiling, which is the point. Stage 1 gets amended by a **new**
   FS, because a shipped FS is a historical record and is never retro-edited.

2. *What in `openapi.yaml` tells a client that `UNAUTHENTICATED` is a valid `code`?* — Nothing.
   `SeamError.code` is typed `string` with no enum. The vocabulary lives in
   `game-server/common/errcode/errcode.go` and reaches the frontend by a human reading it. That
   is the honest boundary between the **shallow** contract (shape, statuses, one line of prose
   per operation) and the **deep** one (this FS, FS-0001's tables, ADR-0001, and the stability
   rules in `errcode.go`'s doc comment).

3. *`register/page.tsx` handles `ALREADY_EXISTS` on signup. Can that ever fire?* — No.
   Requirement 3 and the signup error table say the operation has no `409`. The client handles a
   code the endpoint cannot produce; the duplicate surfaces through `check-email` instead. It is
   harmless — `userMessage()` falls through to the server's `detail` for any code that does not
   match — but it is exactly the kind of drift a per-endpoint table catches and a bare schema
   does not.

4. *Signup declares `503`. Sign-in and `check-email` don't. Do they emit one?* — Yes. All three
   reach a downstream over the network, and the error seam maps a gRPC `Unavailable` to
   `503 · SERVICE_UNAVAILABLE` regardless of what the operation declared. Signup only has the
   row because its broker failure was handled by hand and the author remembered. The other two
   inherit the behavior and document nothing.

   This is the sharpest lesson in the file. **The gates cannot catch it.** `openapi-diff` proves
   the contract matches the code; the code genuinely does not declare `503`, so the projection is
   correct and the diff is clean. `oasdiff` compares against the previous contract, and the row
   was never there to remove. Spectral checks that errors are *documented*, not that they are
   *complete*. Every gate is green and the contract is still wrong — because **a derived
   document can only be as complete as what it derives from**, and no tool knows which statuses
   a handler is capable of producing.
   
   That is the whole argument for the §API surface table above. Writing the rows *before* the
   code is what puts a human in front of the question "what can this actually return?" — the
   one question the machinery never asks.
