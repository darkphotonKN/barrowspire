---
id: I-TVCZQ-2
status: done
implements: FS-TVCZQ
blocked_by: [I-TVCZQ-1]
labels: [ready-for-agent]
title: "FS-TVCZQ slice 2: the gateway stops exposing avatars"
---
Implements FS-TVCZQ §Requirements 11–16, 29, §API surface

## What to Build
Stop registering `request-avatar-upload` and `confirm-avatar-upload`. Remove both methods from the
gateway's auth client and its consumer interface, and from the test stub. Delete the two request
bodies, two envelopes and `AvatarUploadResult`, plus the `wire.go` comment that names
`ConfirmAvatarUploadBody`. Remove `avatar_url` from `Member`, its `memberFromProto` mapping, and
`PlayerRankingStats`. Regenerate with `make openapi && make client`. List every break in
`.oasdiff-ignore` under a WHY block, one line per operation, copied from `make openapi-breaking`
output. The gate runs `--fail-on WARN`, so removing an optional property needs lines too. Remove the
two Postman entries, and stop naming the removed handler in the `errcode.go` comment.

No `.proto` changes here: the generated Go keeps the symbols until I-TVCZQ-3 and I-TVCZQ-4 remove
them.

## Files expected to change
- `game-server/api-gateway/internal/gateway/auth/typed.go`
- `game-server/api-gateway/internal/gateway/auth/wire.go`
- `game-server/api-gateway/internal/gateway/auth/model.go`
- `game-server/api-gateway/internal/gateway/auth/client.go`
- `game-server/api-gateway/internal/gateway/auth/handler_test.go`
- `game-server/api-gateway/internal/gateway/stats/typed.go`
- `game-server/api-gateway/openapi.yaml` (generated)
- `game-client/src/api/generated/schema.d.ts` (generated)
- `game-server/.oasdiff-ignore`
- `game-server/docs/barrowspire-api.postman_collection.json`
- `game-server/common/errcode/errcode.go` (comment only)

## Acceptance Criteria
- [ ] `POST /api/member/avatar/upload-request` and `POST /api/member/avatar/confirm` answer
      `404 · NOT_FOUND` from the no-route handler.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` contain no `/api/member/avatar/` path, no
      avatar schema and no `avatar_url`. Neither was hand-edited.
- [ ] `PATCH /api/member/update-info` and the other member operations are otherwise unchanged.
- [ ] `.oasdiff-ignore` lists each break, and `make -C game-server/api-gateway gates` passes.
- [ ] `go build`, `go vet` and `go test` pass in `game-server/api-gateway`.
- [ ] Client typecheck, tests and lint fence pass against the regenerated client.
- [ ] No change under `auth-service/`, `stats-service/` or `common/api/proto/`.

## Blocked By
I-TVCZQ-1 (regenerating the client deletes the types the profile page imports)

## Spec Reference
FS-TVCZQ §Requirements 11–16, 29; §API surface; §User Stories 8–10, 19; §Edge States (old tab,
rollout order, cached leaderboard).

## TDD Approach
- RED: a gateway test that `POST /api/member/avatar/confirm` answers `404 · NOT_FOUND`.
- GREEN: stop registering the two operations.
