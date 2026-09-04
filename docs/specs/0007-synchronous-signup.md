# FS-0007: Synchronous signup

> Status: work-order · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Integration patterns" → "Synchronous signup"; `game-server/auth-service/SPECIFICATION.md` "### Membership" → "Single member-creation path"; `game-client/SPECIFICATION.md` "### Account" → "Register without polling" → this FS · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (contract layer) · Sibling: [FS-0006](0006-account-and-role-token-claims.md) (token claims — sequenced after this) · Vocabulary: [`auth-service/CONTEXT.md`](../../game-server/auth-service/CONTEXT.md)

## Summary

`POST /api/member/signup` publishes a **command over the message broker** and returns `202` with
"Signup request accepted" before touching the database. The client then polls
`GET /api/member/check-email` once a second, up to fifteen times, to find out whether the
account it just asked for exists yet.

This is the wrong shape for a synchronous user action, and it costs a real bug: **the client
already handles `ALREADY_EXISTS` on the signup response, but signup can never return it.** The
unique-email constraint fires inside the AMQP consumer, which acks and discards the error, so a
duplicate email polls for fifteen seconds and reports "Registration is taking longer than
expected."

This feature makes signup a straight gRPC call from gateway to auth-service, returning
`201 Created` with the member. The polling loop, the broker command path, and the
`check-email` endpoint that existed to serve the poll are all removed.

## Requirements

### The signup call

1. **`POST /api/member/signup` calls auth-service's gRPC `CreateMember` synchronously** and
   responds only once the member is durably created. The gateway already has this client
   (`internal/gateway/auth/client.go`); the typed route is repointed at it.
2. **Success is `201 Created` with the member body**, password blanked, matching what
   `CreateMember` already returns. The `202`/`acceptedEnvelope` shape is removed.
3. **A duplicate email returns `409 · ALREADY_EXISTS`.** No new mapping is required:
   auth-service's repository already translates the constraint to `ErrDuplicateResource`, the
   interceptor already maps that to `codes.AlreadyExists`, and the gateway already maps that to
   `409 · ALREADY_EXISTS`. The path is built and tested; it is only unreachable today.
4. **The route's declared errors become `409, 422, 503, 500`** — `409` added, the rest as
   declared today.
5. **Signup mints no tokens.** It creates a member and returns it; signin remains the only
   place tokens are issued. A newly registered member is redirected to log in.
6. **`member.signedup` is still published**, via auth-service's existing transactional outbox
   inside `CreateMember`. This feature changes how signup is *invoked*, never what it
   *announces* — notification-service and, under FS-0006, wallet-service both continue to
   consume it unchanged.

### Removing the command path

7. **The `member.create` AMQP command path is deleted end to end**: the constant
   `commonconstants.AuthMemberCreate`, auth-service's consumer binding and its
   `case AuthMemberCreate` branch, and every gateway publisher of it.
8. **Both gateway signup publishers go**, not just the routed one:
   `internal/gateway/auth/amqp_client.go`'s `SignupHandler` and the copy-pasted duplicate in
   `internal/gateway/character/amqp_client.go`, which publishes the same command from an
   unrelated package.
9. **`CreateMemberAmqpHandler` in `internal/gateway/auth/handler.go` is deleted** along with the
   untyped legacy route registration, if any survives.
10. **`CreateMember` becomes reachable by exactly one path.** auth-service's spec currently
    flags the dual gRPC + AMQP reachability as a double-create and double-event risk; this
    requirement closes it.

### Removing check-email

11. **`GET /api/member/check-email` is removed** — the typed route, the gateway handler, the
    gateway client method, and the `CheckEmailExists` entry on the gateway's auth client
    interface. Its only purpose was serving the poll, and requirement 3 makes the poll
    unnecessary.
12. **auth-service's gRPC `CheckEmailExists` is left in place but becomes callerless**, and is
    recorded as such rather than silently deleted — removing an RPC from another service's
    published contract is a separate decision. Its known defect (returning `Exists: false` on
    *any* error, including a database outage, so an incident reports every email as available)
    is the reason not to simply re-expose it later without a fix.

### The client

13. **The register page calls signup and branches on the response**, with no polling: success →
    redirect to `/login`; `409` → "An account with that email already exists." The error
    branches the form already declares (`ALREADY_EXISTS`, `VALIDATION_FAILED`,
    `SERVICE_UNAVAILABLE`) start working rather than being unreachable.
14. **The polling machinery is deleted** — `startPolling`, `stopPolling`, `pollingRef`,
    `isPolling`, the `maxAttempts` ceiling, the cleanup `useEffect`, and the
    "Registration is taking longer than expected" copy.
15. **The contract is regenerated, not hand-edited.** `make openapi && make client`; the
    handler change, `openapi.yaml`, and `game-client/src/api/generated/` are committed together
    (ADR-0001).

## User Stories

1. As **a registering member**, I want to be told immediately that my email is already taken, so
   that I can correct it instead of waiting fifteen seconds for a timeout that names the wrong
   problem.
2. As **a registering member**, I want the response to mean my account exists, so that being
   sent to the login page is not a guess.
3. As **a registering member**, I want a genuine failure to say so, so that a broker or database
   problem is not reported to me as slowness.
4. As **a registering member on a slow connection**, I want one request rather than one request
   plus up to fifteen polls, so that registration costs less of my data and finishes sooner.
5. As **a member whose signup fails validation**, I want a `422` I can act on, so that the form
   can point at the field.
6. As **the api-gateway**, I want signup to be an ordinary gRPC call, so that its failure modes
   are the same ones every other member route already has.
7. As **the api-gateway**, I want one signup publisher rather than two copies in unrelated
   packages, so that changing signup means changing one thing.
8. As **auth-service**, I want `CreateMember` reachable by exactly one path, so that the
   double-create and double-event risk my own spec flags stops existing.
9. As **auth-service**, I want a failed create to reach the caller, so that an error is answered
   rather than acked and discarded.
10. As **notification-service**, I want `member.signedup` to keep arriving exactly as it does
    now, so that this change costs me nothing.
11. As **wallet-service under FS-0006**, I want the member to exist before I am told about them,
    so that my account creation is one bounded hop rather than a race against an unbounded one.
12. As **a member registering under FS-0006**, I want the signup-to-claim path to be as short as
    possible, so that my `account_id` claim appears on my first real login rather than
    eventually.
13. As **an operator**, I want the broker off the signup path, so that a RabbitMQ outage stops
    being able to silently swallow registrations.
14. As **an operator**, I want signup failures visible as HTTP status codes in gateway logs, so
    that registration health is measurable without inspecting queue depth.
15. As **a client developer**, I want `signup` in the generated schema to return a member, so
    that I can use the result instead of inferring it from a second endpoint.
16. As **a client developer**, I want `check-email` gone rather than left as a dead endpoint
    with an obsolete description, so that the generated surface does not document a workflow
    that no longer exists.
17. As **a future developer**, I want the `member.create` constant deleted, so that nobody wires
    a new publisher to a routing key nothing consumes.
18. As **a reader of the api-gateway spec**, I want "AMQP fire-and-forget publish for signup" to
    stop being listed as an integration pattern, so that the spec describes the gateway that
    exists.

## Acceptance Criteria

**The call**

- [ ] `POST /api/member/signup` with a valid, unused email returns `201` and a member body with
      an `id` and a blank password
- [ ] The member row is readable from auth-service immediately after that response returns
- [ ] `POST /api/member/signup` with an email that already exists returns `409` with code
      `ALREADY_EXISTS`
- [ ] A malformed body returns `422 · VALIDATION_FAILED`
- [ ] auth-service being unreachable returns `503 · SERVICE_UNAVAILABLE`, not `500`
- [ ] The route's `Errors` declaration lists `409, 422, 503, 500`
- [ ] A successful signup writes exactly one `member.signedup` outbox row
- [ ] No token is returned by signup

**The deletions**

- [ ] `grep -rn "AuthMemberCreate\|member.create" game-server/ --include="*.go"` returns no
      matches outside deleted files
- [ ] `game-server/api-gateway/internal/gateway/character/amqp_client.go` no longer publishes a
      member-creation command
- [ ] auth-service's AMQP consumer has no `member.create` binding and does not create members
- [ ] `GET /api/member/check-email` returns 404 (route absent), and the operation is gone from
      `openapi.yaml`
- [ ] auth-service's gRPC `CheckEmailExists` still compiles and is documented as callerless

**The client**

- [ ] `register/page.tsx` contains no `setInterval`, no `pollingRef`, and no `maxAttempts`
- [ ] A duplicate-email registration renders "An account with that email already exists."
- [ ] A successful registration navigates to `/login` on the signup response, not on a poll
- [ ] `game-client/src/api/generated/schema.d.ts` has no `/api/member/check-email` path
- [ ] The generated `signup` operation types a `201` member response

**The contract**

- [ ] `openapi.yaml` and `game-client/src/api/generated/` are regenerated, not hand-edited, and
      committed in the same change as the handler
- [ ] The contract ratchet passes

**Spec consistency**

- [ ] `- [x] AMQP fire-and-forget publish for signup` is removed from the api-gateway spec
- [ ] `- [x] Check whether an email is taken` **stays** on the auth-service spec — the gRPC RPC
      survives (requirement 12); only its HTTP exposure is removed
- [ ] The three FS-0007 thin lines are checked

## Edge States

| Situation | Behavior |
|---|---|
| Email already registered | `409 · ALREADY_EXISTS`. The path already exists in `httperr` and is tested; this feature only makes it reachable. |
| Two identical signups race | One wins with `201`; the other loses on the unique constraint and gets `409`. The database is the arbiter, as it already is. |
| auth-service down | `503 · SERVICE_UNAVAILABLE`. Signup was valid and retry is correct — never `500`. |
| Database down inside auth-service | Surfaces as `503` through the existing interceptor mapping. Previously this was acked and lost. |
| RabbitMQ down | **Signup is unaffected** — it no longer touches the broker. `member.signedup` still commits to the outbox and is published when the broker returns. |
| Outbox worker stalled after a successful signup | Signup succeeded and the member exists; only downstream consumers (notification, and wallet under FS-0006) are delayed. Pre-existing outbox behavior, unchanged. |
| Client holds a cached old OpenAPI | It will send the same request body and receive `201` instead of `202`. Any client branching on `202` specifically must be updated — the repo's own client is, in requirement 13. |
| A member registered under the old async path mid-deploy | Unaffected. Their member row exists; nothing about it differs by which transport created it. |
| Someone re-adds a `member.create` publisher later | Nothing consumes it and the constant is gone, so it fails at compile time rather than silently dropping registrations. |

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `signup` | `POST /api/member/signup` | — | `name` (string, required)<br>`email` (string, required)<br>`password` (string, required) | **`201`** · member (`id`, `name`, `email`, `status`, `role`, `avatar_url`, `created_at`; password blank) | `409 · ALREADY_EXISTS`<br>`422 · VALIDATION_FAILED`<br>`503 · SERVICE_UNAVAILABLE`<br>`500 · INTERNAL_ERROR` |
| `check-email-exists` | ~~`GET /api/member/check-email`~~ | — | — | **REMOVED** | — |

**Changes from today:** `signup` was `202` with `{statusCode, message}` and declared
`422, 503, 500`. It becomes `201` with the member and adds `409`. `check-email-exists` is
deleted outright. Both are breaking changes to a serialized surface and require the regenerate
in requirement 15.

## Out of Scope

- **Auto-login on signup.** Considered; signup returns a member, not tokens (requirement 5).
  Notably, under FS-0006 an auto-login token would be *guaranteed* to lack `account_id`, since
  the wallet loop cannot have run yet.
- **Removing auth-service's gRPC `CheckEmailExists`**, or fixing its "reports available on any
  error" defect. Recorded in requirement 12, decided separately.
- **Fixing auth-service's AMQP consumer to nack on error.** This feature deletes the
  `member.create` branch; the consumer's other handling is untouched. FS-0006 requirement 17
  binds only its own new consumers.
- **The token claims themselves** — FS-0006. This feature's only relationship to it is
  sequencing: collapsing signup to one synchronous hop bounds FS-0006's `account_id` window.
- **Rate limiting or captcha on signup.** Making signup synchronous makes it a more attractive
  probe for email enumeration via `409`; that tradeoff is inherent to reporting the error at
  all, and mitigations are separate work.
- **The register form's visual design** — FS-0004 owns presentation.
