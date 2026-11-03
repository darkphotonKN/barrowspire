# ADR-0040: Verification codes are owned by auth and mailed by notification through the outbox

Status: accepted
Date: 2026-11-03
Scope: `game-server/auth-service`, `game-server/notification-service`
Realized by: [FS-V6SFK](../specs/V6SFK-signup-hardening.md)
Builds on: auth-service's transactional outbox (the `member.signedup` path),
[FS-PJPNA](../specs/PJPNA-deduplicated-match-result-notifications.md) inbox dedupe in notification-service

## Context

FS-V6SFK adds email verification by a 6-digit code. Until now nothing in the platform sends
email. notification-service has an `email` notification type and a `member.signedup` template,
but it only writes in-app rows. Two services could plausibly own the new work: auth-service,
which owns member identity and the `members` row the code proves, and notification-service,
which owns templates and user-facing messaging.

The code must be tied to the member atomically. A signup that commits without a code, or a code
that goes out for a signup that rolled back, are both wrong. auth-service already solves exactly
this for `member.signedup` with a transactional outbox: the event row commits with the member or
not at all.

Local development needs real mail without a real inbox. Mailpit catches SMTP on one container
and exposes the messages over a web UI and a REST API.

Recorded without adversarial review: the user accepted it during scoping and skipped
challenge-me.

## Decision

- **auth-service owns verification codes**: generation, the stored hash, expiry, the attempt
  counter, the resend cooldown, and the verified state on the member.
- Every time a code is issued (signup, resend, unverified email change), auth writes a
  `member.verification_requested` outbox row **in the same transaction** as the state change.
- **notification-service sends the mail.** It consumes the event, dedupes through its inbox,
  renders the template, and hands the message to a `Mailer` interface it owns. The one
  implementation is SMTP. Dev points it at Mailpit; production points the same SMTP settings
  at a transactional provider. There is no dev bypass flag.
- **The plaintext code is in the event payload.** The broker is internal, and the code is
  short-lived (15 minutes) and single-purpose. That is accepted.

## Consequences

- Identity rules stay in one service. notification-service never decides whether a code is
  valid, so it can't drift from auth.
- Mail delivery inherits the outbox's guarantee: an issued code is eventually mailed, at least
  once, and duplicates are absorbed by the inbox.
- Delivery takes as long as the outbox drain cycle (5s today) plus SMTP, so the email lands
  seconds later rather than instantly. The client says "check your email" and offers resend
  after the cooldown.
- Anyone who can read the broker or notification-service's inbox can read a live code. Moving
  the code out of the payload (for example, notification fetching it from auth) means
  superseding this ADR.
- A synchronous SMTP failure never reaches the user's request. The cost is that a misconfigured
  mailer fails silently from the user's side, so notification-service has to log delivery
  failures loudly.
- Dev, CI and agents read codes from Mailpit's API. No special code path exists to keep in sync.
