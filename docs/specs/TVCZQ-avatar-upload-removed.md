# FS-TVCZQ: Avatar upload removed

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Account" → "Upload and confirm an avatar" (struck, removed by this FS); `game-server/auth-service/SPECIFICATION.md` "### Avatars" → "Request a presigned avatar upload", "Confirm an avatar upload and publish `profile.updated`", "Authorize confirmation against the requesting member" (struck, removed by this FS) · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (the generated contract; removing operations and fields is a deliberate break, allowlisted) · Precedent: [FS-RG1B4](RG1B4-subscriptions-removed.md)

## Summary

Players can no longer upload a profile photo. The avatar circle and Change Photo picker leave
`/profile`, and the user menu always shows the default silhouette. The whole feature goes with
them: the gateway routes, auth-service's upload and S3 code, the `avatar_url` field on the wire
and in the databases, and the `profile.updated` event. The `/profile` page stays, and class
figures and party frame busts are unaffected.

This FS folds in the charter the user approved for this run. A requirement marked
**charter default** carries the charter's decision and its reason. A requirement marked
**(not challenged)** was not run through `challenge-me`: the charter pre-approved the lock, and
these are the expensive, hard-to-reverse decisions.

## Requirements

### Client

1. **Charter default.** `/profile` has no avatar circle, Change Photo picker, file input, or
   upload code. Reason: the user asked to get rid of "player profile photo uploading and anything
   related to it", "Including player profile selection on the frontend".
2. **Charter default.** The `/profile` page stays, with the player's name, email, details and the
   email verification panel. Reason: it holds those details, not only the photo.
3. The page's `error` and `success` state and its message block go too, because only the upload
   handler sets them. Their styles go with them (requirement 7).
4. **Charter default.** `UserMenu` always renders the default silhouette and never reads a photo
   URL. Reason: there is no photo left to show.
5. **Charter default.** Class figures on the character list (`MainMenuScene`'s `avatar` and
   `avatarClass` fields) and party frame busts are unchanged. Reason: they are baked art, not
   photos.
6. `apiClient` has no `requestAvatarUpload`, `confirmAvatarUpload` or `uploadToS3`, and the
   `UPLOAD_FAILED` error code goes with `uploadToS3`.
7. **Charter default.** `.user-avatar` becomes `.user-badge` and `.default-avatar` becomes
   `.user-silhouette`; the `.user-avatar img` rule is deleted. Reason: the done search must come
   back clean, and the classes still style a live element. These `globals.css` rules are deleted
   because nothing renders them: every `.profile-avatar*` rule including the responsive one,
   `.profile-camera-icon`, `.profile-upload-progress`, `.profile-spinner`, `.profile-file-input`,
   `.profile-message`, `.profile-message-icon`, `.profile-error`, `.profile-success`.
   `@keyframes slideIn` goes too, because `.profile-message` was its only user. The shared `spin`
   keyframes stay unless nothing else uses them.
8. **Charter default.** Avatar code leaves the commented-out `leaderboard/page.tsx`, both the
   markup and the styles. The page stays commented out and still answers not-found. Reason: done
   search.
9. The `.eslintrc.json` message that names the S3 upload as the one legitimate raw fetch is
   reworded. The `api.ts` exemption stays, because `fetchArtManifest` still uses it.
10. The design guideline's feedback rule stops naming `.profile-error` as its example. Its
    pink-text remediation note is a record of a past fix that already names the deleted
    `.sub-error`, so it stays. The generic "pills & avatars" radius mention stays.

### Gateway and contract

11. **Charter default.** The gateway registers no `request-avatar-upload` or
    `confirm-avatar-upload` operation, and the auth client and its consumer interface lose both
    methods. Reason: the user said "anything related", which overrides the repo's default of
    leaving game-server alone.
12. **Charter default (not challenged).** `avatar_url` leaves the gateway's `Member` and
    `PlayerRankingStats` responses. Reason: a field with no data behind it should not stay in the
    contract. This is a deliberate breaking contract change.
13. `openapi.yaml` and `game-client/src/api/generated/` are regenerated with
    `make openapi && make client`, never hand-edited, and committed with the handler change.
    `AvatarUploadResult`, the two request bodies and the two envelopes leave the contract.
14. Every break is listed in `game-server/.oasdiff-ignore` under a WHY block for this FS. The gate
    runs `--fail-on WARN`, so removing an optional response property also needs one line per
    affected operation. Lines are copied from `make openapi-breaking` output, lowercased, per the
    format that file documents.
15. **Charter default.** The Postman entries "Request Avatar Upload" and "Confirm Avatar Upload"
    leave `game-server/docs/barrowspire-api.postman_collection.json`. Reason: cleanup.
16. The `errcode.go` comment on `ServiceUnavailable` stops naming the removed handler and keeps
    its reason. The code itself stays.

### Auth-service

17. **Charter default.** `internal/upload`, `internal/s3`, `config/s3.go`, the S3 setup and upload
    wiring in `cmd/server/main.go`, the member service and repository's `UpdateAvatarURL` and
    `UpdateAvatarURLTx`, and the AWS SDK dependency are gone, with `go.mod` and `go.sum` tidied.
    Reason: "anything related".
18. **Charter default (not challenged).** `auth.proto` loses `UploadService` and its four
    messages. `Member.avatar_url` is removed and field number 8 is marked `reserved`. Reason: a
    reserved number can't be reused with a different meaning by a pod or client still on the old
    schema. Numbers only: the charter asks for numbers, and a reserved name would put the word
    back into the proto and the generated code.
19. **Charter default (not challenged).** Migration `000014` drops `avatar_uploads` and
    `members.avatar_url`, and ships in the same issue as removing `Member.AvatarURL`. Reason: auth
    uses `SELECT *`/`RETURNING *` with sqlx, which fails on a column with no struct field, and
    migrations run at pod boot, so a new pod never sees the column. Existing avatar URLs are
    permanently lost, which the user accepted.
20. The `000014` down file restores the empty column and table as they stood after `000008`:
    indexes, trigger and `TIMESTAMPTZ` columns. No URL comes back. Old migrations are never edited
    (**charter default**: they are history, and a fresh database still replays them in order).
21. **Charter default.** `AWS_REGION`, `S3_BUCKET_NAME` and `CDN_URL` leave
    `game-server/deploy/kind/auth-config.yaml` and `game-server/deploy/gke/auth-config.yaml`.
    Reason: nothing reads them. Gitignored secret and `.env` files are the user's.
22. **Charter default.** `game-server/auth-service/docs/avatar-upload-flow.md` is deleted. Reason:
    cleanup.

### Stats-service and the event

23. **Charter default (not challenged).** `profile.updated` is removed completely. Reason:
    `ConfirmAvatarUpload` is its only publisher. That covers `consumeProfileUpdated`, the queue
    declaration and binding in `SetupAMQPInfrastructure`, the stats service's now unused
    `auth.events` exchange declaration, `UpdatePlayerRankings`, the `ConsumerService` method and
    its test fake, and the `MemberProfileUpdated` and `StatsAuthProfileUpdatedQueue` constants.
24. `UpsertPlayerRankingStats`, the non-transactional variant, goes with it, because
    `UpdatePlayerRankings` is its only caller. `UpsertPlayerRankingStatsTx` stays for the match
    path, without the column.
25. `events/auth.proto` holds only `MemberProfileUpdatedEvent`, so it and `events/auth.pb.go` are
    deleted, and its entry leaves `common/Makefile`'s `gen` list.
26. **Charter default (not challenged).** `PlayerRankingStats.avatar_url` leaves `stats.proto` and
    field number 6 is marked `reserved`, for the reason in requirement 18.
27. **Charter default (not challenged).** Migration `000006` drops
    `player_ranking_stats.avatar_url` and ships in the same issue as removing the `AvatarUrl`
    fields and every explicit `avatar_url` column in the repository, for the reason in
    requirement 19. Its down file restores the column shape with no URLs and backfills existing
    rows with `''`, because the older image scans `avatar_url` into a plain `string` and a NULL
    would fail its leaderboard read.
28. The match-ended consumer, its topology, its retries and its DLQ behave as before. Comments
    that say "both consumers" are reworded.

### Sequencing

29. Every issue leaves `go build`, `go test` and the client suite green. The order that does this:
    the client stops using the feature; then the gateway stops exposing it, because regenerating
    the client deletes the types the page imports; then auth; then stats and the event. Removing a
    proto symbol must land with, or after, the last Go code that references it, in a shared
    `go.work`. `events/auth.proto` and `MemberProfileUpdated` can only go once both auth's
    publisher and stats' consumer are gone.
30. Each issue regenerates only the proto it changes. `make -C game-server/common gen` rebuilds
    every proto, and a local `protoc` other than the committed v5.27.1 rewrites unrelated headers,
    so only the changed proto's generated files are committed.

### At ship: specs

31. Struck thin lines and this prose are deleted when the removal ships, in the same step that
    flips this FS to `shipped`, as with FS-RG1B4:
    - `game-client/SPECIFICATION.md`: the struck line; line 27 (the "profile & avatar" purpose
      phrase); 201 (the `/profile` row drops "3-step avatar upload"); 222 (the Profile/avatar
      flow); 237 (`avatar_url?` in `memberInfo`); 246 (the avatar endpoints).
    - `game-server/api-gateway/SPECIFICATION.md`: lines 162-163, the two avatar routes. The
      update-info route stays.
    - `game-server/auth-service/SPECIFICATION.md`: the `### Avatars` section with its three struck
      lines; the assumptions (15-18) and purpose (27) phrases; `avatar_url` and `avatar_uploads`
      in the data model (41, 45-46); the `UploadService` gRPC section (138-151); the
      `profile.updated` event (168-171); the S3 dependency (192-193); the upload status invariant
      (202); the known issue (208); and the open question (218). Line 210's secrets note loses
      only the AWS keys, and `JWT_SECRET` stays.
    - `game-server/stats-service/SPECIFICATION.md` was checked and describes no consumer and no
      avatar. It needs no change.

### Done

32. **Charter default.** Done when a case-insensitive search for "avatar" over the tree, excluding
    `node_modules`, build output and `.claude`, finds only: FS and issue history under `docs/`;
    migrations; `MainMenuScene.ts`'s figure field; the design guideline's generic mention; and
    entries the charter did not list, because they have to stay: `game-server/.oasdiff-ignore`
    (the allowlist names the removed paths), `auth-service/internal/member/common_passwords.txt`
    (blocklist data such as `avatar2010`, unrelated to the feature), and the tests that assert the
    absence: `game-server/api-gateway/config/routes_test.go`,
    `game-server/api-gateway/internal/contract/contract_test.go`,
    `game-server/auth-service/config/migrations_test.go` and
    `game-server/stats-service/internal/stats/repository_test.go`. This holds once requirement
    31's ship step is done. Before that step the search also returns the `SPECIFICATION.md` lines
    requirement 31 names. Reason: "anything related" is only checkable with a search.

## User Stories

1. As a player, I want no photo picker on `/profile`, so that the page doesn't offer a feature
   the game no longer has.
2. As a player, I want `/profile` to keep my name, email and details, so that I can still see my
   account.
3. As a player with an unverified email, I want the verification panel on `/profile`, so that I
   can still verify.
4. As a player, I want the user menu to show the same silhouette every time, so that it never
   shows a broken image.
5. As a player who uploaded a photo, I want it to stop appearing anywhere, so that the site is
   consistent about the feature being gone.
6. As a player, I want my class figure on the character list and my party frame bust to look the
   same, so that this removal doesn't change the game's art.
7. As a player with an old tab open, I want a failed action rather than a crash if I use the old
   picker, so that the rest of the page keeps working.
8. As the developer, I want no route that mints S3 upload URLs, so that nobody can write to the
   bucket through the gateway.
9. As the developer, I want `avatar_url` gone from the contract, so that the generated client
   can't read a field with no data behind it.
10. As the developer, I want the breaking-change gate to pass because each break is listed, so
    that the removal reads as a decision in review.
11. As the developer, I want the old proto field numbers reserved, so that a future field can't
    reuse them with a different meaning.
12. As the developer, I want auth-service to boot with no S3 setup, so that a missing AWS
    credential can't change which gRPC services it registers.
13. As the developer, I want the AWS SDK out of auth-service's module, so that its build and image
    carry only what it uses.
14. As the developer, I want each column dropped in the same release as its struct field, so that
    no pod ever scans a column it can't map.
15. As the developer, I want `profile.updated` gone from publisher, consumer, constants and proto,
    so that nobody builds on an event nothing sends.
16. As the developer, I want the stats match-ended consumer unchanged, so that XP and match results
    keep flowing.
17. As the developer, I want every issue to leave the build and tests green, so that the removal
    can pause between issues.
18. As the developer, I want the kind and gke config to stop setting AWS and CDN values, so that
    the manifests list only what the service reads.
19. As the developer, I want the flow doc and Postman entries gone, so that nobody tries the old
    calls.
20. As the developer, I want the specs to stop claiming avatars, so that a spec audit reports no
    drift.
21. As the developer, I want the CSS classes renamed, so that a search for "avatar" finds only what
    this FS lists.
22. As the operator, I want a written list of what I do by hand after shipping, so that the bucket,
    key and leftover queue don't get forgotten.

## Acceptance Criteria

- [ ] `/profile` renders name, email, details and the verification panel, with no file input and
      no photo.
- [ ] `UserMenu.tsx` reads no photo URL and always renders the silhouette.
- [ ] `apiClient` has no `requestAvatarUpload`, `confirmAvatarUpload` or `uploadToS3`.
- [ ] `globals.css` has no rule from requirement 7's delete list, and has `.user-badge` and
      `.user-silhouette`.
- [ ] `MainMenuScene.ts` and party frame code have no diff from this FS.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` contain no `/api/member/avatar/` path, no
      avatar schema and no `avatar_url`.
- [ ] `POST /api/member/avatar/upload-request` and `POST /api/member/avatar/confirm` answer
      `404 · NOT_FOUND` from the gateway's no-route handler.
- [ ] `PATCH /api/member/update-info` and the other member operations are otherwise unchanged in
      `openapi.yaml`.
- [ ] `.oasdiff-ignore` lists each break, and `make -C game-server/api-gateway gates` passes.
- [ ] `auth-service/internal/upload`, `internal/s3` and `config/s3.go` do not exist, and
      auth-service's `go.mod` has no `aws` line.
- [ ] `auth.proto` has no `UploadService` and has `reserved 8;` in `Member`; `stats.proto` has
      `reserved 6;` in `PlayerRankingStats`.
- [ ] `events/auth.proto` and `events/auth.pb.go` do not exist, and `common/Makefile` doesn't list
      them.
- [ ] Auth migration `000014` and stats migration `000006` exist with down files. Both apply on a
      database at the previous version, and no earlier migration file has a diff.
- [ ] After the migrations, auth's member read and sign-in, and stats' leaderboard read and
      match-completed path, work against real Postgres where the suite can reach it.
- [ ] A search for `profile.updated`, `MemberProfileUpdated`, `StatsAuthProfileUpdatedQueue`,
      `UpdatePlayerRankings(` and `UploadService` finds no live code. FS and issue history may
      still name them.
- [ ] `kind/auth-config.yaml` and `gke/auth-config.yaml` have no `AWS_REGION`, `S3_BUCKET_NAME` or
      `CDN_URL`.
- [ ] `game-server/deploy/gke/auth.yaml`, `deploy/observability/tempo.values.yaml` and matchmaker
      code have no diff from this FS.
- [ ] `go build ./...`, `go vet ./...` and `go test ./...` pass in `api-gateway`, `auth-service`,
      `stats-service` and `common` after every issue.
- [ ] Client typecheck, tests and lint fence pass after every issue.
- [ ] Requirement 32's search returns only the listed entries, once requirement 31's ship step is
      done. Before that step it also returns the `SPECIFICATION.md` lines requirement 31 names.

## Edge States

- **Old tab or cached bundle:** the old picker's first call gets `404 · NOT_FOUND`, and the page
  shows its upload error. Its menu may keep showing an old photo until reload, and until the user
  deletes the bucket.
- **Persisted session:** `localStorage["auth-storage"]` may still hold `memberInfo.avatar_url`.
  Nothing reads it, and the key goes at the next sign-in. No migration of browser storage.
- **Upload in progress at deploy:** the confirm fails. The object stays in S3 until the bucket is
  deleted, and no member row changes.
- **Gateway and auth roll out in either order:** an old gateway calling a new auth gets
  `Unimplemented` on the two upload RPCs, which surfaces as a failed upload. Reads are safe both
  ways: a proto3 reader treats a missing field 8 or 6 as empty, and the gateway's `wire.As` ignores
  unknown JSON members.
- **Old auth pod after a new pod migrated:** `SELECT *` still scans, since a struct field with no
  column is fine. Only the upload path writes `avatar_url`, and it fails with a database error
  until the old pod exits.
- **Old stats pod after a new pod migrated:** its explicit `avatar_url` columns fail, so
  `GetLeaderboard` errors until the old pod exits. `match.ended` doesn't touch the column, because
  the per-player writes have been commented out in `applyMatchEnded` since 3c33171e (PvE TODO).
  The event is only marked processed and acked, so no event is lost.
- **New pod:** it never sees the column, because migrations run at boot and a migration failure is
  fatal before it serves.
- **Stats scaled to zero:** `deploy/gke/stats.yaml` has `replicas: 0` today. The column stays until
  stats next boots, and nothing reads it in between.
- **Rollback to an older image:** the old image has no `000014` or `000006` file, so it can't
  migrate from that version and fails at boot. Run the down migration first. It restores the
  empty column and table, and no URL comes back.
- **Fresh database:** `000004`, `000008` and `000014` replay in order and end with no avatar table
  or column.
- **`profile.updated` left on a running broker:** the durable queue stays bound until the user
  deletes it, with no consumer. New pods publish nothing to it, so only messages from old auth
  pods in the rollout window can sit there. They affect nothing.
- **Ranking username:** a confirmed upload also refreshed the ranking row's username. That stops,
  and nothing else writes it while the per-player writes stay commented out in `applyMatchEnded`
  (PvE TODO), so the row keeps the username it has. The same event also overwrote wins, top threes,
  rating and rank with zero, because `UpdatePlayerRankings` set only three fields. That stops too.
- **Cached leaderboard:** a Redis entry written before the release can hold field 6 for up to an
  hour. `proto.Unmarshal` keeps it as an unknown field and `wire.As` doesn't emit it.
- **`/profile` for a verified player:** no message block and no panel. Only the details show.

## API surface

Removed operations. Each now falls through to the gateway's no-route handler.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `request-avatar-upload` | `POST /api/member/avatar/upload-request` | removed | removed | removed | `404 · NOT_FOUND` |
| `confirm-avatar-upload` | `POST /api/member/avatar/confirm` | removed | removed | removed | `404 · NOT_FOUND` |

Changed responses. The only change is that the optional `avatar_url` member is gone.

| Schema | Operations affected | Change |
|--------|---------------------|--------|
| `Member` | Every operation whose response embeds it, including `signup`, `change-email` and those returning `LoginResult` such as `verify-email`; `make openapi-breaking` gives the exact list | `avatar_url` removed |
| `PlayerRankingStats` | `get-leaderboard` | `avatar_url` removed |

Removed RPCs (plane 2): `UploadService.RequestAvatarUpload` and
`UploadService.ConfirmAvatarUpload`. Removed fields: `auth.Member` 8 and
`stats.PlayerRankingStats` 6, both reserved.

## Out of Scope

- **Charter default.** A replacement feature, new endpoints, or any other change to member fields
  or `update-info`. Reason: this removes only.
- **Charter default.** How migrations run. Reason: that discussion is separate, and this FS only
  adds migrations.
- **Charter default.** Matchmaker code, `game-server/deploy/gke/auth.yaml` and
  `deploy/observability/tempo.values.yaml`. Reason: they are off limits for this work.
- **Charter default.** Editing old FSs or issues. Reason: they are history.
- **Charter default: the user does these after shipping.** Delete the S3 bucket, revoke the AWS
  key, remove AWS keys from secret and `.env` files, and delete the leftover
  `stats.auth.profile.updated` queue on any running broker.
- The `player_ranking_stats` table and the leaderboard page's commented-out state, beyond removing
  the avatar column and avatar code.
