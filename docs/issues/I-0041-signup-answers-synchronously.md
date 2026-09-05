---
id: I-0041
status: done
implements: FS-0007
blocked_by: []
labels: [ready-for-agent]
title: "FS-0007 slice 1: signup answers synchronously — 201 + member, 409 on duplicate, command path deleted"
---
Implements FS-0007 §Requirements 1–10, §API surface, §Edge States

**Author: agent**

## What to Build

Turn `POST /api/member/signup` from a fire-and-forget broker command into an ordinary
synchronous gRPC call, and delete the command path it leaves behind.

> **Scope amended during review.** The response envelope was dropped (the FS §API surface row
> is the contract, and it declares the bare member), which made the register page's polling loop
> incoherent: the created member now arrives in the signup response, so polling to discover
> whether it exists is nonsense. The client cutover therefore moved into this slice.
> **I-0042 is reduced to removing `check-email` and regenerating.** `check-email` is NOT removed
> here.

### 1. Repoint the typed route

`game-server/api-gateway/internal/gateway/auth/typed.go` → `registerSignup`.

- Call `h.client.CreateMember(ctx, &pb.CreateMemberRequest{...})` instead of
  `amqpClient.RpcCallNoWaitResponse(ctx, commonconstants.AuthMemberCreate, body)`.
- Response becomes **`201` + the bare member body**. The `acceptedEnvelope` shape and
  `DefaultStatus: http.StatusAccepted` both go, and so does the `{statusCode, message, result}`
  envelope: FS-0007 §Requirements 2 makes signup the first operation on this surface to shed it.
  Guard the nil member — the response type is a value, so an unguarded dereference panics the
  request rather than failing it.
- `Errors:` becomes `409, 422, 503, 500` — add `http.StatusConflict`.
- Rewrite `Description`. It currently states the opposite of the new behavior: *"Publishes a
  signup command and returns immediately. The account is NOT created by the time this
  responds — poll check-email to observe it."*

**No error-mapping work is required, and adding some would be a bug.** The chain already
exists and is tested end to end:

| Layer | Already does |
|---|---|
| auth-service repo | unique-email violation → `commonconstants.ErrDuplicateResource` |
| `common/interceptor/status.go:27` | `ErrDuplicateResource` → `codes.AlreadyExists` |
| `api-gateway/internal/httperr/httperr.go:141` | `codes.AlreadyExists` → `409` + `errcode.AlreadyExists` |

Covered by `httperr_test.go:41` and `handler_test.go:129`. It is unreachable today only
because signup answers before the database is touched. Let the error propagate; `guard`
already routes it.

### 2. Delete the `member.create` command path

Nothing publishes to it once step 1 lands. Remove, end to end:

- `commonconstants.AuthMemberCreate` (`common/constants/events.go:61`)
- auth-service's consumer binding and its `case commonconstants.AuthMemberCreate:` branch
  (`auth-service/internal/member/amqp_consumer.go:58,64,110`)
- `api-gateway/internal/gateway/auth/amqp_client.go` — `SignupHandler` and its publish
- `api-gateway/internal/gateway/character/amqp_client.go` — a **copy-paste of the same signup
  handler** publishing the same key from an unrelated package (`:77`)
- `api-gateway/internal/gateway/auth/handler.go` — `CreateMemberAmqpHandler`, plus any
  untyped route registration that survives

This closes the double-create / double-event risk auth-service's own SPECIFICATION.md flags.

**Leave `member.signedup` completely alone.** It is a different thing: an *event* published
from inside `CreateMember` via the transactional outbox. notification-service consumes it
today and wallet-service will under FS-0006. This slice changes how signup is *invoked*, never
what it *announces*.

### 3. Regenerate the contract

From `game-server/api-gateway/`:

```
make openapi && make client
```

Handlers, `openapi.yaml`, and `game-client/src/api/generated/` move in **one commit**. None of
the generated files is hand-edited — not by a person, not by an agent (root CLAUDE.md). If the
output is wrong, the handler signature is wrong.

### 4. Allowlist the deliberate break

`make openapi-breaking` **will fail**, correctly: `202 → 201` and the response-body change are
breaking, and the ratchet fails on `WARN`, not just `ERR` (ADR-0003).

Add entries to `game-server/.oasdiff-ignore`. **Derive them from real output — do not guess.**
That file's own header is explicit: a line carrying the printed message alone matches nothing,
*"does not error — it silently fails to suppress, and the gate stays red with no explanation."*

1. Run the diff and read the two indented lines of each error (method + path, then message).
2. Concatenate and lowercase: `in api post /api/member/signup <message>`.
3. One line per (method, path, message) triple.
4. **Every entry must carry `FS-0007` and the reason.** An entry with no reason is a bug.

A working shape lives at `contract-fixtures/oasdiff-allowlist.txt` — copy that, not oasdiff's
raw output.

> Baseline is `origin/main:game-server/api-gateway/openapi.yaml`. If it reports
> `SKIPPED: no baseline`, that is a different problem — investigate, do not treat as pass.

### 5. Spec line

Remove `- [x] AMQP fire-and-forget publish for signup` from
`game-server/api-gateway/SPECIFICATION.md` § Integration patterns. It stops being true here.
Leave the three `- [ ] … → FS-0007` lines unchecked; they flip when FS-0007 ships (I-0042).

## Acceptance Criteria

- [ ] `POST /api/member/signup` with a valid, unused email returns `201` and a member body with
      an `id` and a blank password
- [ ] The member row is readable from auth-service immediately after that response returns
- [ ] A duplicate email returns `409` with code `ALREADY_EXISTS`
- [ ] A malformed body returns `422 · VALIDATION_FAILED`
- [ ] auth-service unreachable returns `503 · SERVICE_UNAVAILABLE`, **not** `500`, on **both**
      failure paths: the RPC failing on an open connection, and the service being deregistered
      so `ensureConn` fails. The second is the likelier one and a stubbed client cannot reach it.
- [ ] The route's `Errors` declaration lists `409, 422, 503, 500`
- [ ] The operation description no longer claims the account is not yet created
- [ ] A successful signup writes exactly one `member.signedup` outbox row
- [ ] Signup returns no token
- [ ] `grep -rn "AuthMemberCreate\|member\.create" game-server/ --include="*.go"` returns nothing
- [ ] `game-server/api-gateway/internal/gateway/character/amqp_client.go` no longer publishes a
      member-creation command
- [ ] auth-service's AMQP consumer has no `member.create` binding and does not create members
- [ ] notification-service still receives `member.signedup` unchanged
- [ ] The 201 body is the member itself — no `statusCode`, no `result` nesting
- [ ] A nil member from auth-service answers `500`, not a panic or an empty `201`
- [ ] `register/page.tsx` reads `data` directly and contains no `setInterval`/`pollingRef`
- [ ] A duplicate-email registration renders "An account with that email already exists."
- [ ] `tsc --noEmit` passes on the client
- [ ] `openapi.yaml` + `game-client/src/api/generated/` regenerated, not hand-edited, committed
      with the handler
- [ ] `.oasdiff-ignore` entries were copied from real diff output and each cites FS-0007
- [ ] `make gates` passes from `game-server/api-gateway/` (verify by **exit code**, not by
      reading output)
- [ ] `- [x] AMQP fire-and-forget publish for signup` removed from the api-gateway spec
- [ ] `go build ./...` and the existing suites pass

## Blocked By

None.

## Spec Reference

FS-0007 §Requirements 1–10 (the signup call; removing the command path), §API surface (the
`signup` row), §Edge States (duplicate, race, auth-service down, RabbitMQ down).

## TDD Approach

- **RED:** a gateway handler test asserting `POST /api/member/signup` returns `201` with a
  member body — fails against the current `202` envelope. Then a second asserting a duplicate
  email yields `409 · ALREADY_EXISTS` — fails today because the route cannot produce it.
- **GREEN:** repoint the route at `client.CreateMember` and let the existing `httperr` mapping
  carry the error.
- **REFACTOR:** delete the command path (step 2); the compiler finds every caller.

## Check, do not assume

- **`make` runs each recipe line in its own shell** (`docs/agents/contract-patterns.md` §8). A
  guard that `exit 0`s on one line does not stop the next. Verify targets by exit code.
- **Optionality is load-bearing** (`contract-patterns.md` §5): in Go + huma a field is
  **required unless its json tag carries `omitempty`**. Check the member response struct's tags
  against what the member body should actually guarantee before regenerating.
- **`make contract-auth`**: every operation that runs auth middleware must declare it. `signup`
  is public and must stay public — confirm the change did not move it behind `guard`'s auth.
