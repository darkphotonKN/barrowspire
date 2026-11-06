---
id: I-TVCZQ-3
status: done
implements: FS-TVCZQ
blocked_by: [I-TVCZQ-2]
labels: [ready-for-agent]
title: "FS-TVCZQ slice 3: auth-service drops uploads, S3 and the avatar data"
---
Implements FS-TVCZQ §Requirements 17–22, 29–30

## What to Build
Delete `internal/upload`, `internal/s3` and `config/s3.go`, and remove the S3 setup and upload
wiring from `cmd/server/main.go`. Remove `UpdateAvatarURL` and `UpdateAvatarURLTx` from the member
service and repository, and `Member.AvatarURL` and its proto mapping. Tidy the AWS SDK out of
`go.mod` and `go.sum`.

In `auth.proto`, remove `UploadService` and its four messages, remove `Member.avatar_url`, and add
`reserved 8;`. Regenerate, committing only `auth.pb.go` and `auth_grpc.pb.go` (FS-TVCZQ requirement
30).

Add migration `000014`, which drops `avatar_uploads` and `members.avatar_url`. It lands in this
issue, with the struct field, because auth uses `SELECT *`/`RETURNING *` with sqlx. Its down file
restores the empty column and table as they stood after `000008`. Never edit an old migration.

Remove `AWS_REGION`, `S3_BUCKET_NAME` and `CDN_URL` from the kind and gke `auth-config.yaml`. Delete
`docs/avatar-upload-flow.md`.

`MemberProfileUpdatedEvent` and `MemberProfileUpdated` stay in `common` until I-TVCZQ-4, because the
stats consumer still references them.

## Files expected to change
- `game-server/auth-service/cmd/server/main.go`
- `game-server/auth-service/config/s3.go` (deleted)
- `game-server/auth-service/config/migrations_test.go` (if the RED test below lives there)
- `game-server/auth-service/internal/upload/` (deleted: `handler.go`, `model.go`, `repository.go`,
  `service.go`)
- `game-server/auth-service/internal/s3/` (deleted: `aws_client.go`, `client.go`)
- `game-server/auth-service/internal/member/service.go`
- `game-server/auth-service/internal/member/repository.go`
- `game-server/auth-service/internal/models/entities.go`
- `game-server/auth-service/go.mod`, `go.sum`; `game-server/go.work.sum` if it changes
- `game-server/auth-service/migrations/000014_*.up.sql`, `000014_*.down.sql` (new)
- `game-server/auth-service/docs/avatar-upload-flow.md` (deleted)
- `game-server/common/api/proto/auth/auth.proto`
- `game-server/common/api/proto/auth/auth.pb.go`, `auth_grpc.pb.go` (generated)
- `game-server/deploy/kind/auth-config.yaml`
- `game-server/deploy/gke/auth-config.yaml`

Not touched: `game-server/deploy/gke/auth.yaml` and any gitignored `*.secret.env` or `.env` file.
Stage files by name: `deploy/gke/auth.yaml` carries the user's uncommitted edits.

## Acceptance Criteria
- [ ] `internal/upload`, `internal/s3` and `config/s3.go` do not exist, and `go.mod` has no `aws`
      line.
- [ ] auth-service boots with no S3 setup and registers `AuthService` with no `UploadService`.
- [ ] `auth.proto` has no `UploadService` and has `reserved 8;` in `Member`.
- [ ] Migration `000014` and its down file exist, apply on a database at `000013`, and leave no
      `avatar_uploads` table or `members.avatar_url` column. No earlier migration has a diff.
- [ ] After `000014`, member read and sign-in work against real Postgres where the suite can reach
      it, and skip cleanly where it can't, like the existing migration tests.
- [ ] The kind and gke `auth-config.yaml` have no `AWS_REGION`, `S3_BUCKET_NAME` or `CDN_URL`.
- [ ] `go build`, `go vet` and `go test` pass in `auth-service`, `api-gateway`, `stats-service` and
      `common`.

## Blocked By
I-TVCZQ-2 (the gateway must stop referencing `UploadService` and `pb.Member.AvatarUrl` before the
proto drops them)

## Spec Reference
FS-TVCZQ §Requirements 17–22, 29–30; §User Stories 5, 8, 11–14, 18–19; §Edge States (old auth pod,
new pod, rollback, fresh database, upload in progress).

## TDD Approach
- RED: a migration test, following `config/migrations_test.go`'s scratch-schema pattern, that after
  `000014` the `members` table has no `avatar_url` and `avatar_uploads` does not exist.
- GREEN: add the migration, then remove the struct field and the code above.
