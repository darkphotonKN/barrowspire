---
id: I-V6SFK-1
status: done
implements: FS-V6SFK
blocked_by: []
labels: [ready-for-agent]
title: "FS-V6SFK slice 1: password policy and case-insensitive, validated email at signup, login and password change"
---
Implements FS-V6SFK §Requirements A1–A5, B6–B9, H33–H34, H40, §API surface

## What to Build

End to end, a new password must meet the policy wherever it's set, and every email is
normalized and validated. Signup with a weak password or a malformed email is refused with a
precise code that the register page explains.

- **common/errcode:** register `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_TOO_COMMON`
  and `EMAIL_INVALID` in `domainCodes`, each tagged "Added for FS-V6SFK".
- **auth-service policy (R1, R4):** min 10 code points, max 72 bytes, embedded common-password
  list (`go:embed`, lowercased set at startup, source and license in a comment). Checks run
  short → long → common.
- **auth-service enforcement (R2, R3, R5):** `CreateMember` and `UpdateMemberPassword` (after its
  existing current/repeat checks) refuse via `errcode.Refuse`. `LoginMember` is untouched apart
  from normalizing the lookup.
- **Email (R6, R7, R9):** trim + lowercase at signup and at the login lookup. `net/mail`
  round-trip check, ≤254 bytes → `EMAIL_INVALID`.
- **Migration (R8):** a new auth migration lowercases and trims `members.email`, then adds a
  unique index on `lower(email)`. It fails loudly on a collision. It only adds files; how
  migrations run is unchanged.
- **Gateway:** add `400` to signup's declared errors (update-password already declares it). Run
  `make openapi && make client`.
- **Client (R33, R34):** the register page enforces min 10 (code points) with a hint and maps
  the four codes. The profile page's change-password form maps the three password codes.

## Acceptance Criteria

- [ ] The signup and password-change refusals in FS-V6SFK §Acceptance Criteria rows 1–2 hold. Login with an old 6-character password still succeeds.
- [ ] The email normalization, case-insensitive duplicate (409) and `EMAIL_INVALID` rows hold.
- [ ] Migration up/down are written, and up fails on a case-collision.
- [ ] Codes are registered and `Refuse` passes them through as 400 (a gateway test or the existing passthrough tests).
- [ ] openapi + generated client are regenerated, not hand-edited, and the contract gates pass.
- [ ] Client unit tests cover the hint and the code-to-message mapping.
- [ ] `go test ./...` passes for the touched modules; the client test suite passes.

## Blocked By

None

## Expected files (hotspots marked ★)

- ★ `game-server/common/errcode/errcode.go`
- `game-server/auth-service/internal/member/` (service.go, a new policy file + embedded list, repository.go, tests)
- `game-server/auth-service/migrations/000012_*`
- ★ `game-server/api-gateway/internal/gateway/auth/typed.go` (signup Errors)
- ★ `game-server/api-gateway/openapi.yaml`, ★ `game-client/src/api/generated/`
- `game-client/src/app/register/page.tsx`, `game-client/src/app/profile/page.tsx`

## Spec Reference

FS-V6SFK §A (policy), §B (email rules), §H33–34 (client messages), §API surface (signup and update-password rows). User stories 12–17.

## TDD Approach

- RED: a table test of the policy (9 chars, 10 chars, 73 bytes, listed in mixed case) → expected refusal code.
- GREEN: the policy function wired into CreateMember and UpdateMemberPassword.
