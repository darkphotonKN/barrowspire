---
id: I-ZPX58-2
status: open
implements: FS-ZPX58
blocked_by: [I-ZPX58-1]
labels: []
title: "FS-ZPX58 slice 2: public POST /api/member/refresh on the gateway, in the generated contract (api-gateway)"
---
Implements FS-ZPX58 §B (Requirements 8–12), §API surface

**Lane: agent (approved by Nick).** api-gateway.

## What to Build

- `AuthClient.RefreshAccessToken` + `Client` method.
- Typed operation `refresh-access-token`: `POST /api/member/refresh`, no `protect`, no
  `Security`; body `RefreshBody{refresh_token}` required, `minLength: 1`; `200` bare
  `RefreshResult{access_token, access_expires_in, member_info}`; errors 401/422/503/500.
- `make openapi && make client`; commit `openapi.yaml` and `schema.d.ts` with the handler.

## Acceptance Criteria

- [ ] Tests: 200 bare result and the token passed to auth; 401 · UNAUTHENTICATED on
      `Unauthenticated`; 422 on missing / empty / unknown member; 503 on `Unavailable`; works
      with no Authorization header.
- [ ] `go test ./...`, `go vet ./...`, `make openapi-diff`, `make openapi-breaking` (no break),
      `make contract-auth` green.

## Blocked By

I-ZPX58-1 (the RPC).

## Spec Reference

FS-ZPX58 §Requirements B, §API surface.
