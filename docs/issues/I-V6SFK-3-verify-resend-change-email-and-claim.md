---
id: I-V6SFK-3
status: done
implements: FS-V6SFK
blocked_by: [I-V6SFK-2]
labels: [ready-for-agent]
title: "FS-V6SFK slice 3: verify, resend and change-email routes, email_verified exposure and claim"
---
Implements FS-V6SFK §Requirements C13, C15, D17–D20, E21–E23, H40, §API surface

## What to Build

The server half of verification, end to end through the gateway: a member can verify with their
code and get a fresh token pair carrying `email_verified: true`, request a new code, or fix their
email while unverified.

- **auth.proto (regenerate, never hand-edit pb):** `Member` and the login member info gain
  `email_verified`. New RPCs `VerifyEmail`, `ResendVerification` and `ChangeUnverifiedEmail`,
  with the member id passed by the gateway as `UpdateMemberPassword` does.
- **auth-service logic:** wrong-attempt counting and burning on the 5th (R13); expiry; the 60s
  cooldown across resend and change, with the check and upsert in one transaction (R15);
  `VERIFICATION_CODE_INVALID`, `VERIFICATION_CODE_EXPIRED`, `VERIFICATION_RESEND_TOO_SOON` and
  `EMAIL_ALREADY_VERIFIED` refusals; the verified-member no-op that still mints a fresh pair
  (R17); change email normalizes and validates, 409 on taken, same address = resend (R19).
  Reuses slice 2's issuance.
- **Claim minting (R21):** the access token carries `email_verified: true` only when verified,
  at login and at verify; otherwise the key is omitted. Refresh is unchanged.
- **common/errcode:** register the four verification codes plus `EMAIL_ALREADY_VERIFIED`.
- **Gateway:** `POST /api/member/email/verify` (bare `LoginResult`), `POST
  /api/member/email/resend` (204) and `PUT /api/member/email` (bare Member), all protected.
  `email_verified` on the Member wire type with no omitempty. Signin/get-member carry it. Run
  `make openapi && make client`.

## Acceptance Criteria

- [ ] The FS-V6SFK §Acceptance Criteria verify, resend and change-email rows hold (auth service tests with a fake clock).
- [ ] An unverified member's access token has no `email_verified` key; after verify, the returned access token decodes to `email_verified: true`.
- [ ] `GET /api/member` and the signin result carry `email_verified`, and `false` serializes.
- [ ] Gateway typed-route tests for the three new ops, including the 400 code passthrough and 401 without a token.
- [ ] Proto, openapi and the generated client are regenerated, not hand-edited; the contract gates pass.
- [ ] `go test ./...` passes for auth-service, api-gateway and common.

## Blocked By

I-V6SFK-2 (needs the code table and issuance)

## Expected files (hotspots marked ★)

- ★ `game-server/common/api/proto/auth/auth.proto` + regenerated `*.pb.go`
- `game-server/auth-service/internal/member/` (service.go, handler.go, repository.go, the verification file, tests), `game-server/auth-service/internal/auth/jwt.go`
- ★ `game-server/common/errcode/errcode.go`
- ★ `game-server/api-gateway/internal/gateway/auth/` (typed.go, wire.go, client.go, model.go, tests)
- ★ `game-server/api-gateway/openapi.yaml`, ★ `game-client/src/api/generated/`

## Spec Reference

FS-V6SFK §D (verify/resend/change), §E21 + E23 (claim minting and staleness), §C13 + C15 (attempts, cooldown), §API surface (all member rows). User stories 3–7, 18, 24–25.

## TDD Approach

- RED: a service test: issue a code, verify with the right code → verified + fresh pair whose access token decodes `email_verified: true`.
- GREEN: VerifyEmail plus claim minting.
