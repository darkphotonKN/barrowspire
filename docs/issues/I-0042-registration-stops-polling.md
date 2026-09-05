---
id: I-0042
status: done
implements: FS-0007
blocked_by: [I-0041]
labels: [ready-for-agent]
title: "FS-0007 slice 2: remove the check-email endpoint"
---
Implements FS-0007 §Requirements 11-12, 15, §API surface

**Author: agent**

## What to Build

Remove the endpoint that existed only to serve the register page's polling loop.

> **Scope reduced.** I-0041 dropped the response envelope, which made the polling loop
> incoherent — the created member now arrives in the signup response — so the client cutover
> (requirements 13-14) landed there instead. `register/page.tsx` already has no poll and no
> caller of `check-email`. **What remains is the endpoint removal and its regeneration.**
> Confirm the client really has no caller left before deleting.

### 1. Client cutover

`game-client/src/app/register/page.tsx`.

Delete the polling machinery entirely: `startPolling`, `stopPolling`, `pollingRef`,
`isPolling`, the `maxAttempts` ceiling, the cleanup `useEffect`, and the
`"Registration is taking longer than expected. Please try logging in or try again."` copy.

`handleSubmit` branches on the signup response instead:

- success → `router.push("/login")` on the response itself, not on a poll
- failure → the existing `userMessage(fromProblem(...))` block, unchanged

**The error branches the form already declares start working rather than being unreachable.**
`ALREADY_EXISTS`, `VALIDATION_FAILED`, and `SERVICE_UNAVAILABLE` are already written into that
call site — I-0041 made `409` reachable, so *"An account with that email already exists."*
renders for the first time. This is the bug FS-0007 exists to fix: today a duplicate email
polls for fifteen seconds and reports slowness.

Do not restyle the form. FS-0004 owns its presentation.

### 2. Remove `check-email`

Once step 1 has no caller left:

- `api-gateway/internal/gateway/auth/typed.go` — the `check-email-exists` operation
  (`:177`–`:200`)
- `api-gateway/internal/gateway/auth/handler.go` — `CheckEmailExistsHandler` (`:80`)
- `api-gateway/internal/gateway/auth/client.go` — `CheckEmailExists` (`:151`)
- `api-gateway/internal/gateway/auth/model.go` — the `CheckEmailExists` entry on the client
  interface (`:18`)

**auth-service's gRPC `CheckEmailExists` stays.** Removing an RPC from another service's
published contract is a separate decision (FS-0007 §Req 12, §Out of Scope). Leave the RPC, its
handler, its service method, and its `- [x] Check whether an email is taken` capability line
intact. Add a short note in `auth-service/SPECIFICATION.md` recording that it is now
**callerless**, along with its known defect — it returns `Exists: false` on *any* error,
including a database outage, so during an incident it reports every email as available. That
defect is the reason not to re-expose it later without a fix.

### 3. Regenerate and allowlist

From `game-server/api-gateway/`:

```
make openapi && make client
```

`make openapi-breaking` **will fail** — removing an operation is an unambiguous break. Add
`.oasdiff-ignore` entries the same way I-0041 did: run the diff, read the two indented lines,
concatenate method + path + message, lowercase, one line per triple, each citing **FS-0007**
and the reason. A guessed line silently fails to suppress and leaves the gate red with no
explanation.

### 4. Close out FS-0007

- Check the three thin lines: `game-server/api-gateway/SPECIFICATION.md` "Synchronous signup",
  `game-server/auth-service/SPECIFICATION.md` "Single member-creation path",
  `game-client/SPECIFICATION.md` "Register without polling".
- Flip `docs/specs/0007-synchronous-signup.md` to `Status: shipped`.

## Acceptance Criteria

- [x] *(landed in I-0041)* `register/page.tsx` contains no `setInterval`, no `pollingRef`, no `isPolling`, and no
      `maxAttempts`
- [x] *(landed in I-0041)* A successful registration navigates to `/login` on the signup response, not on a poll
- [x] *(landed in I-0041)* A duplicate-email registration renders "An account with that email already exists."
- [x] *(landed in I-0041)* A `422` renders the validation copy; a `503` renders the unavailable copy
- [x] `GET /api/member/check-email` is absent from the router (404) and from `openapi.yaml`
- [x] `game-client/src/api/generated/schema.d.ts` has no `/api/member/check-email` path
- [x] The generated `signup` operation types a `201` member response
- [x] auth-service's gRPC `CheckEmailExists` still compiles, still has its capability line, and
      is documented as callerless with its `Exists:false`-on-error defect noted
- [x] `.oasdiff-ignore` entries were copied from real diff output and each cites FS-0007
- [ ] `make gates` passes from `game-server/api-gateway/` — **NOT MET, pre-existing.** The four
      contract gates each exit 0; `seam-gate` fails on 9 direct error-status writes in
      `character/` and `listing/`, red on `main` before this slice.
- [x] The three FS-0007 thin lines are checked and FS-0007 is `Status: shipped`
- [x] Client typecheck/lint and the existing suites pass

## Blocked By

I-0041 — the client needs the regenerated `201` signup operation, and `check-email` cannot be
removed while a polling client still calls it.

## Spec Reference

FS-0007 §Requirements 11–12 (removing check-email), 13–14 (the client), 15 (regeneration);
§API surface (the `check-email-exists` REMOVED row).

## TDD Approach

- **RED:** a register-page test asserting a `409` response renders "An account with that email
  already exists." — fails today, because the component polls instead of reading the error.
- **GREEN:** replace the poll with a direct branch on the response.
- **REFACTOR:** delete the now-unreferenced gateway `check-email` surface; the typecheck and
  the Go compiler find the callers.

## Check, do not assume

- **Verify nothing else calls `check-email` before removing it.** `grep -rn "check-email"
  game-client/src --include="*.ts" --include="*.tsx"` should return only the register page and
  generated files once step 1 is done.
- **`make` runs each recipe line in its own shell** (`contract-patterns.md` §8) — verify gate
  targets by exit code, never by reading output.
- The generated client is regenerated, never hand-edited — including when removing a path.
