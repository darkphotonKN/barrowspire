---
id: I-ZPX58-1
status: open
implements: FS-ZPX58
blocked_by: []
labels: []
title: "FS-ZPX58 slice 1: auth-service RefreshAccessToken mints a 60-minute access token from the member row (auth-service)"
---
Implements FS-ZPX58 §A (Requirements 1–7)

**Lane: agent (approved by Nick, "做自動續期").** auth-service and `common/api/proto/auth`.

## What to Build

- `auth.proto`: `RefreshAccessToken(RefreshAccessTokenRequest{refresh_token}) →
  RefreshAccessTokenResponse{access_token, access_expires_in, member_info}`; regenerate
  `auth.pb.go` / `auth_grpc.pb.go` with protoc (only `auth.proto`), never hand-edited.
- `internal/auth`: one pair of lifetime constants (60 min, 7 days); a refresh-token parser that
  answers the member id only for a valid, unexpired, HS256, `tokenType: refresh` token with a UUID
  `sub`; delete the unused 15-minute `RefreshToken`.
- `member.Service.RefreshAccessToken`: parse, re-read the member, mint the access token from the
  row; every refusal is `ErrUnauthorized`; a lookup error that is not not-found stays an error.
- `member.Handler.RefreshAccessToken` passes through.

## Acceptance Criteria

- [ ] Table-driven tests: valid, expired, wrong secret, `none`/non-HMAC alg, access-typed,
      malformed, non-UUID sub, unknown member, lookup failure.
- [ ] Claims come from the row (role / account id / email_verified changed since sign-in).
- [ ] Sign-in and verify still mint 60 min / 7 days from the same constants.
- [ ] `go test ./...` and `go vet ./...` green in auth-service.

## Blocked By

None.

## Spec Reference

FS-ZPX58 §Requirements A, §Edge States; ADR-0066.
