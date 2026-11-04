---
id: I-1GZGD-10
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-3]
labels: [ready-for-agent]
title: "FS-1GZGD slice 10: every letter records who sent it, the admin from the token or the system source (notification-service)"
---
Implements FS-1GZGD §Requirements R52–R56, §Amendment 2026-11-04 (A7: A7.1, A7.2), §Acceptance Criteria (Sent-by audit), §Edge States (A7: an admin mails themselves, letters stored before migration 000006); ADR-0047

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks). Added by amendment A7.**

## What to Build

The **sent-by audit** (A7.2): every letter stored from now on records who sent it, for operators
reading the database, and no player ever sees it. This slice builds the columns and the store
path for both doors; the admin door fills it here, the system path's callers (I-1GZGD-5's letter
request, I-1GZGD-11's welcome) pass their source through the seam this slice adds.

- **Migration pair `000006_add_letter_sent_by`** (next free number in notification-service; never
  edit `000005_create_mailbox_tables`, the user's rule):
  - up: `ALTER TABLE letters ADD COLUMN sent_by_member_id uuid NULL, ADD COLUMN sent_by_source text NULL`,
    then a named `CHECK` constraint added **`NOT VALID`**:
    `(sender = 'official' AND sent_by_member_id IS NOT NULL AND sent_by_source IS NULL) OR
    (sender = 'system' AND sent_by_source IS NOT NULL AND sent_by_member_id IS NULL)`.
    `NOT VALID` means rows stored before the migration (development databases only) keep both
    columns null and are not checked, and every row inserted or updated afterwards is
    (R54, **[spec default]**). No backfill, no delete.
  - down: drop the constraint, then both columns.
- **Model and store path** (`internal/mailbox`): a letter carries its sent-by (an admin member id
  for `official`, a source string for `system`). `prepareLetters` takes the sent-by beside the
  sender kind and stamps it on every letter it builds, and `InsertLetters` writes both columns.
  Shape the seam so a system caller passes a source (I-1GZGD-5 passes the event's `source`,
  I-1GZGD-11 passes `welcome`); give the source its own small type or constant set rather than a
  bare string at every call site if that reads better (`/develop`'s call).
- **Admin send** (`SendLetter`): records `caller.MemberID`, the verified forwarded token's member,
  on every letter of the request: the one member, each letter of a list, the broadcast (R55).
  Nothing in the request names it; the proto and the gateway request do not change.
- **Never shown** (R56): the read query may load the columns or not, but no gRPC response
  message, no gateway response type (`ListLetters`, the summary, the admin send's `201`) and no
  generated client type carries them. No proto change, no gateway change and no openapi
  regeneration are needed; if `/develop` finds one is, stop: the design says none.
- **Source bounds** (1–64 characters after trimming) are a helper this slice provides and tests,
  so I-1GZGD-5 only calls it on the event field. **[spec default]**

**Files it expects to touch:**
`game-server/notification-service/migrations/000006_add_letter_sent_by.up.sql` and
`.down.sql` (new);
`game-server/notification-service/internal/mailbox/model.go`,
`repository.go`, `repository_test.go`, `service.go`, `service_test.go`. No proto, no
`common/errcode`, no gateway, no client, no `internal/notification` file.

## Acceptance Criteria

- [ ] `000006` up adds both columns and the `NOT VALID` check; down removes them; up → down → up
      succeeds; `000005` is unchanged (`git diff` shows no edit to it).
- [ ] A letter row inserted before `000006` survives it with both columns null (a repository
      test that migrates to 5, inserts and migrates to 6 if the test harness can step migrations;
      otherwise checked by hand against a local database and noted in the PR).
- [ ] After `000006`, the database refuses an `official` row without a member id or with a
      source, and a `system` row without a source or with a member id (repository test, raw
      inserts).
- [ ] An admin send to one member, to a list of three and to all members stores the caller's
      member id from the token on every letter, and no source (service test with a fake
      repository, plus one repository round-trip).
- [ ] A system letter built through the seam with source `test.compensation` stores that source
      and no member id; the source helper refuses an empty, blank and 65-character source.
- [ ] No gRPC response message and no gateway response type gains a sent-by field; the gateway
      and `openapi.yaml` are untouched.
- [ ] Tests pass (`go test ./...` in notification-service, repository tests with
      `NOTIFICATION_TEST_DB_DSN`); lint clean.

## Blocked By

I-1GZGD-3 (the letters table and the store path; merged). Coordinate with I-1GZGD-4 (the claim,
in progress in its own worktree), which also edits `internal/mailbox/repository.go` and
`service.go`: whichever merges second rebases.

## Spec Reference

FS-1GZGD §Amendment 2026-11-04 (A7) A7.1, A7.2; §Requirements R52–R56; §Acceptance Criteria
(Sent-by audit); ADR-0047 (the admin is a role on a player account; the audit is the only
mitigation for an admin mailing themselves). User stories 49–52.

## TDD Approach

- RED: a repository test that inserts an `official` letter without a member id after `000006`
  and expects the check violation; a service test that an admin send to `[A, B]` hands the
  repository two letters both stamped with the caller's member id.
- GREEN: the migration pair, the sent-by on the letter model, and `prepareLetters` /
  `InsertLetters` carrying it.
