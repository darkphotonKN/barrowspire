---
id: I-1GZGD-11
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-3, I-1GZGD-8, I-1GZGD-10]
labels: [ready-for-agent]
title: "FS-1GZGD slice 11: one welcome letter with a starter gift for every new account, stored in the signup event's inbox transaction (notification-service)"
---
Implements FS-1GZGD §Requirements R52, R57–R62, §Amendment 2026-11-04 (A7: A7.1, A7.3), §Acceptance Criteria (Welcome letter), §Edge States (A7: signup redelivered, items down at signup, potion template removed, claim before the wallet account, second character, push at signup)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks). Added by amendment A7.**

## What to Build

When notification-service consumes `member.signedup`, it also stores one **welcome letter** for
that account, the first **letter trigger** (CONTEXT.md) and the first system letter the repo
produces (A7.1, A7.3).

- **Same inbox transaction.** Extend `ProcessMemberSignedUp` (`internal/notification/service.go`):
  inside its existing `s.runInTx(ctx, eventID, MemberSignedUpEvent, …)`, after the signup
  notification's `CreateTx`, store the welcome letter on the **same `tx`**. The inbox mark, the
  notification and the letter commit together or not at all (R57), so a redelivery stops at the
  inbox and stores, resolves and publishes nothing.
- **The seam** (R57, **[spec default]**): `internal/notification` defines a narrow interface it
  owns, for example a `WelcomeLetters` with "store the welcome for this member on this tx" and
  "announce it after the commit"; `internal/mailbox` implements it (e.g. `welcome.go`) on top of
  `prepareLetters` → `InsertLetters` and I-1GZGD-8's arrival publisher. Wired in
  `config/routes.go`: today `notification.NewService` is built before the mailbox service, so the
  wiring reorders or injects after. The notification package learns nothing else of letters.
- **The letter** (R58): `system`, to the signup's member id (`payload.UserID`, the account),
  sent-by source `welcome` (through I-1GZGD-10's seam), default expiry (30 days, R5), and:
  - title `The Town Keeps a Fire for You`;
  - body exactly as FS-1GZGD A7.3 prints it (four paragraphs, blank lines between them;
    **[spec default]** copy);
  - enclosures: a template enclosure of **3** × the Small Health Potion template, no item level
    (so the template's `min_item_level`), and a gold enclosure of **100**
    (**[charter default]** amounts).
  Title, body and enclosures go through the same checks as any letter (R3–R5, S1).
- **The potion** (R59, **[spec default]**): one named constant in `internal/mailbox`,
  `aa0e8400-e29b-41d4-a716-446655440006` (Small Health Potion, `HEALTH_POT_SMALL`, items-service
  `migrations/000002_seed_basic_data.up.sql`), with a comment pointing at the seed.
- **Resolving inside the transaction** (R60, **[spec default]**): the welcome is built by
  `prepareLetters`, so `ResolveItemSnapshots` runs inside `runInTx`, after the inbox mark, under a
  short deadline (a few seconds), as `ProcessVerificationRequested` sends its email inside its
  own inbox transaction.
- **Failures** (R61, **[spec default]**):
  - items-service unavailable (unreachable, deadline, an outage status): return an error wrapping
    `commonconstants.ErrTransient`. The transaction rolls back whole and the consumer's existing
    `handleResult` requeues with its delays (5 s, 15 s, 60 s), then dead-letters.
  - items-service refuses the potion (`UNKNOWN_ITEM_TEMPLATE` or `ENCLOSURE_INVALID` from
    `prepareLetters`): log at error with the member id and event id, return a **non-transient**
    error; the transaction rolls back and the event is dead-lettered.
  - Never store a partial welcome (no gold-only fallback, no letter without its gift).
- **The push** (R62): after `runInTx` returns success (committed), announce through the arrival
  publisher: one `{"member_id": M}` on `mail:arrived`, outside the transaction; a failed publish
  is logged at warn and the event is still acked. On `ErrAlreadyProcessed` or any error, publish
  nothing.
- **No backfill** (R57): no migration, job or script creates welcome letters for existing
  members.
- The `member.signedup` payload, the consumer (`amqp_consumer.go`) and its queue binding do not
  change.

**Files it expects to touch:**
`game-server/notification-service/internal/notification/service.go`, `service_test.go`;
`game-server/notification-service/internal/mailbox/welcome.go` and `welcome_test.go` (new; or the
equivalent in `service.go`); `game-server/notification-service/config/routes.go`. No migration,
no proto, no `common/errcode`, no gateway, no client, no items-service file.

## Acceptance Criteria

- [ ] One `member.signedup` stores, in one transaction, the inbox mark, the signup notification
      and one `system` welcome letter to that member: sent-by source `welcome`, the A7.3 title
      and body, 3 Small Health Potions as a snapshot at the template's `min_item_level`, 100 gold,
      expiry 30 days after it was stored.
- [ ] The same event delivered twice stores one welcome letter, calls `ResolveItemSnapshots`
      once and publishes `mail:arrived` once.
- [ ] Two events for two accounts store one welcome letter each.
- [ ] After the commit, exactly one `{"member_id": M}` is published; with the publisher failing,
      the letter and the notification are stored and the handler returns success.
- [ ] With the items resolver unavailable, the handler returns an `ErrTransient`-wrapped error
      and nothing is stored (no inbox mark, no notification, no letter); a later call with the
      resolver back stores all three once.
- [ ] With the items resolver refusing the template, the handler returns a non-transient error,
      logs at error, and nothing is stored.
- [ ] A failure forced in the letter insert rolls back the inbox mark and the notification too.
- [ ] The stored welcome letter shows in that member's mailbox and summary, and (once I-1GZGD-4
      is merged) its claim mints three potions and credits 100 gold once.
- [ ] Members created before the change have no welcome letter.
- [ ] Tests pass (`go test ./...` in notification-service); lint clean.

## Blocked By

I-1GZGD-3 (the letter store path; merged), I-1GZGD-8 (the arrival publisher it announces
through), I-1GZGD-10 (the sent-by source `welcome` and the `system` row's check).

## Spec Reference

FS-1GZGD §Amendment 2026-11-04 (A7) A7.1, A7.3; §Requirements R52, R57–R62; §Acceptance Criteria
(Welcome letter); §Edge States (A7). User stories 54–59.

## TDD Approach

- RED: a `ProcessMemberSignedUp` test with fakes (inbox, notification repo, welcome seam) that one
  event asks the seam to store one welcome for that member on the same transaction, and that a
  second delivery (inbox says already processed) asks nothing and announces nothing.
- RED: a test that a resolver outage surfaces as `ErrTransient` and leaves nothing stored.
- GREEN: the seam interface in `internal/notification`, its mailbox implementation, and the
  wiring in `config/routes.go`.
