---
id: I-V6SFK-2
status: done
implements: FS-V6SFK
blocked_by: [I-V6SFK-1]
labels: [ready-for-agent]
title: "FS-V6SFK slice 2: a verification code is issued at signup and arrives in Mailpit"
---
Implements FS-V6SFK §Requirements C10–C14, C16, F24–F28

## What to Build

End to end: sign up, and within seconds a mail with a 6-digit code is sitting in Mailpit. No
verify endpoint yet; this slice makes the code exist and get delivered.

- **auth-service migration (R10, R11):** `members.email_verified_at TIMESTAMPTZ NULL` (all
  existing rows NULL) and the one-row-per-member code table (member id PK/FK cascade, code hash,
  `expires_at`, wrong-attempt count, `issued_at`).
- **Code issuance (R12–R14, R16):** crypto/rand 6 digits, SHA-256(member id + code) stored,
  15-minute expiry. The upsert and the `member.verification_requested` outbox row are written
  inside `CreateMember`'s existing transaction, next to `member.signedup`. Build issuance as a
  reusable unit: slice 3 calls it for resend and change email.
- **common/constants:** the `member.verification_requested` routing key next to
  `MemberSignedUpEvent`, plus the payload type (`event_id`, `member_id`, `name`, `email`,
  `code`, `expires_at`).
- **notification-service (R24–R27):** a consumer with inbox dedupe by `event_id`; a template
  (subject "Your Barrowspire verification code", text + simple HTML); a `Mailer` interface
  defined in notification-service, with an SMTP implementation injected via config; `SMTP_*`
  env with Mailpit dev defaults and a startup log line. Never store or log the code. On send
  failure, log at error level and leave the event unprocessed for redelivery.
- **docker-compose (R28):** a Mailpit service with a pinned tag; SMTP and UI host ports
  following the file's offset habit, noted in a comment.

## Acceptance Criteria

- [ ] Signup writes member + `member.signedup` + `member.verification_requested` + code row in one transaction (test with a forced rollback).
- [ ] The stored code is a hash; the plaintext appears only in the outbox payload.
- [ ] The notification consumer sends one mail per event and a redelivery sends none (inbox test with a fake Mailer).
- [ ] The rendered mail matches R25, and no log line contains the code.
- [ ] SMTP failure → error log, event not marked processed.
- [ ] docker-compose has Mailpit. Verifying with the stack running is for the human (agents don't start backends); note the ports in the report.
- [ ] `go test ./...` passes for auth-service, notification-service and common.

## Blocked By

I-V6SFK-1 (both touch auth's member service and migration numbering; run in sequence)

## Expected files (hotspots marked ★)

- `game-server/auth-service/migrations/000013_*`
- `game-server/auth-service/internal/member/` (service.go, repository.go, a new verification file, tests)
- ★ `game-server/common/constants/events.go`
- `game-server/notification-service/internal/notification/` (amqp_consumer.go, template.go, a new mailer file, service.go, tests)
- `game-server/notification-service/config/routes.go`, `game-server/notification-service/cmd/server/main.go`
- `game-server/docker-compose.yml`

## Spec Reference

FS-V6SFK §C10–14, §C16 (state, codes, issuance at signup, outbox), §F (delivery, Mailpit). User stories 2, 21–23, 26–27.

## TDD Approach

- RED: a CreateMember test asserting a `member.verification_requested` outbox row with a 6-digit code and a hashed code row.
- GREEN: issuance inside the signup transaction.
