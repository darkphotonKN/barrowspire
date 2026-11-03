# FS-V6SFK: Signup hardening (password policy + soft email verification)

> Status: work-order · SPECIFICATION.md: `game-server/auth-service/SPECIFICATION.md` "### Membership" → "Password policy wherever a password is set", "Case-insensitive unique email", "Email verification by code", "Change email while unverified"; "### Tokens" → "Mint an email-verified claim into the access token"; `game-server/notification-service/SPECIFICATION.md` "## Notifications" → "Verification-code email", "Outbound email delivery behind a mailer"; `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Marketplace writes require a verified email"; `game-server/api-gateway/SPECIFICATION.md` "### Integration patterns" → "Member email verification routes"; `game-client/SPECIFICATION.md` "### Account" → "Password policy at registration", "Verify email from the client", "Change an unverified email", "### Marketplace" → "Verify-email prompt on gated marketplace actions" → this FS · Related ADRs: [ADR-0040](../adr/0040-verification-codes-are-owned-by-auth-and-mailed-by-notification.md) (code ownership + delivery), [ADR-0041](../adr/0041-password-policy-is-length-and-a-blocklist-checked-only-when-set.md) (password policy), [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (fail-closed claims), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only styling) · Related: [FS-83TJK](83TJK-synchronous-signup.md), [FS-9KW9F](9KW9F-account-and-role-token-claims.md) · Vocabulary: [`auth-service/CONTEXT.md`](../../game-server/auth-service/CONTEXT.md) §Verification

**Provenance.** Scoped 2026-11-03 (`/scope-it`), run under `/charter` with 18 approved defaults
and four approved amendments (user: "Yes, all four"). Every decision locked without pushback and
challenge-me was skipped by the user: **the whole FS is not challenged.** Items tagged
*(charter default: reason)* came from that list.

## Summary

Signing up gets two kinds of protection, and neither one slows a new player down. First, any
password set from now on must meet a length-plus-blocklist policy, and emails are validated and
treated as case-insensitive. Second, every member gets a 6-digit code by email at signup and can
play right away while unverified. A banner keeps asking them to verify, and the email can be
fixed while it's unverified, so a typo never turns into a stuck account. Only email-dependent
actions are held back: marketplace listing, bidding and buyout today, and password reset once
it exists. In dev, every mail lands in Mailpit, so testing never needs a real inbox.

## Requirements

### A. Password policy (auth-service): ADR-0041

1. **The policy:** a password must be **at least 10 characters** (counted as Unicode code
   points), **at most 72 bytes** in UTF-8 (bcrypt's input limit), and **not on the embedded
   common-password list**, compared case-insensitively. There are no character-class rules
   *(charter default: length beats composition; NIST 800-63B)*. The checks run in this order
   and the first failure wins: too short, too long, too common.
2. **The policy runs wherever a password is set:** `CreateMember` (signup) and
   `UpdateMemberPassword` (the new password). A failure is a domain refusal through
   `errcode.Refuse`: **`400 · PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` /
   `PASSWORD_TOO_COMMON`** *(amendment A1: auth owns the rule, so it's 400 plus a domain code,
   never 422)*. The three codes are registered in `common/errcode` `domainCodes`, each tagged
   "Added for FS-V6SFK".
3. **Login never applies the policy.** `LoginMember` only compares against the stored hash.
   Existing hashes are never migrated, flagged or force-reset, so a password set before this
   FS keeps working.
4. **The blocklist is a file embedded in auth-service** (`go:embed`), one password per line,
   taken from a permissively licensed public list of at least the top 10,000 common passwords.
   Its source and license go in a comment next to the embed. It loads once at startup into a
   set of lowercased entries. No network call *(charter default: offline, no third party)*.
5. On the password-change path, the existing validation (current password matches, new password
   repeated correctly) runs first. The policy then checks the new password.

### B. Email rules (auth-service)

6. **Normalization:** auth trims and lowercases every email at signup, at the login lookup, and
   at email change, before validating, storing or comparing it. Only the normalized form is ever
   stored *(charter default: fixes the case-sensitive UNIQUE)*.
7. **Validation:** the normalized email must parse with `net/mail.ParseAddress`, the parsed
   address must equal the input (so display-name forms like `Name <a@b.c>` are rejected), and it
   must be at most 254 bytes. Anything else is refused with **`400 · EMAIL_INVALID`** (a
   registered domain code, amendment A1).
8. **Migration (auth-service):** trim and lowercase every existing `members.email`, then enforce
   uniqueness over the normalized form with a unique index on `lower(email)`. If two existing rows
   collide after normalizing, the migration **fails loudly** and does not merge accounts. Only dev
   databases exist today.
9. A duplicate email, compared case-insensitively, keeps answering `409 · ALREADY_EXISTS` on
   signup (the path FS-83TJK built).

### C. Verification state and codes (auth-service): ADR-0040

10. **`members.email_verified_at TIMESTAMPTZ NULL`.** Set means verified. **Every existing row
    starts NULL** (unverified), the admin seed included *(charter default: none were ever
    verified)*.
11. **One live code per member** in a new table: member id (PK, FK `ON DELETE CASCADE`), code
    hash, `expires_at`, wrong-attempt count, `issued_at`. Issuing a code upserts the row, so a
    new code always kills the old one.
12. **The code:** 6 decimal digits, uniform over `000000`–`999999`, drawn with `crypto/rand`.
    Only its hash is stored: SHA-256 over member id + code. Comparison is constant-time. The
    plaintext exists only in the outbox payload (R16).
13. **Lifetime:** valid for **15 minutes** from issue. A wrong entry adds one to the count, and
    the **5th wrong entry burns the code** (deletes the row). Success also deletes the row
    *(charter default: standard OTP bounds)*.
14. **A code is issued at signup** inside `CreateMember`'s existing transaction, next to the
    `member.signedup` outbox row, so a member never commits without a code and a code never goes
    out for a rolled-back signup.
15. **Resend cooldown:** a new code can't be issued within **60 seconds** of the last one's
    `issued_at`. This covers both resend and email change. A request inside the window is
    refused with `400 · VERIFICATION_RESEND_TOO_SOON`.
16. **Every issuance writes a `member.verification_requested` outbox row** on `auth.events` in
    the same transaction as the code row. Payload: `event_id`, `member_id`, `name`, `email` (the
    normalized destination), `code` (plaintext, accepted by ADR-0040), `expires_at`. The
    routing-key constant lives in `common/constants` next to `MemberSignedUpEvent`.

### D. Verify, resend, change email (auth-service RPCs + gateway routes)

17. **Verify** (`code`): the request reaches auth with the caller's member id taken from the
    verified token, never from the body.
    - Unverified, live code matches → set `email_verified_at = now()`, delete the code row, and
      return a **fresh access + refresh pair plus the member**, minted after the update so the
      access token carries the claim (R21) *(charter default: the claim updates without a new
      login)*.
    - Unverified, live code wrong → count it (R13) and refuse with
      `400 · VERIFICATION_CODE_INVALID`.
    - Unverified, no live code (never issued, expired or burned) →
      `400 · VERIFICATION_CODE_EXPIRED`. The client offers resend.
    - **Already verified → success no-op**: returns a fresh pair plus the member, whatever code
      was sent *(amendment 4)*.
18. **Resend:** unverified → issue a new code (R11, R15, R16) and answer 204. **Already
    verified → `400 · EMAIL_ALREADY_VERIFIED`** *(amendment 4)*.
19. **Change email** (`email`), allowed only while unverified: normalize and validate (R6, R7),
    then update the member's email and issue a code to the **new** address in one transaction
    (the cooldown in R15 applies). The response is the updated member. An email taken by
    someone else → `409 · ALREADY_EXISTS`. The same address as the current one behaves as a
    resend. **Already verified → `400 · EMAIL_ALREADY_VERIFIED`** *(amendment 4)*.
20. **Exposure:** `GetMember`'s `Member` and the login result's member info gain
    `email_verified` (bool), read from `email_verified_at IS NOT NULL`.

### E. Email-verified claim

21. **The access token carries `email_verified: true` only when the member is verified**, read
    from the member row at mint time (login, verify). Otherwise the key is omitted. Refresh
    tokens carry no claims (FS-9KW9F R15 unchanged).
22. **`common/auth` reads the claim:** `Claims` gains an `email_verified` bool and `Identity`
    gains `EmailVerified`. An absent key means `false`, so every consumer fails closed
    (the ADR-0014 pattern). It's never a refusal to authenticate: an unverified member is still
    authenticated.
23. A claim minted before verification stays false until the member verifies (R17 hands back a
    fresh pair) or logs in again. No push and no invalidation.

### F. Mail delivery (notification-service + compose): ADR-0040

24. **notification-service consumes `member.verification_requested`** from `auth.events`, with
    inbox dedupe by `event_id` (the FS-PJPNA pattern). A redelivered event never sends twice
    once its inbox row has committed.
25. **It renders a verification email**: subject "Your Barrowspire verification code", plain-text
    and simple HTML bodies naming the member, the code, and that it expires in 15 minutes. It
    never writes an in-app notification row and **never stores or logs the code**. Logs carry the
    member id and event id only.
26. **It sends through a `Mailer` interface** owned by notification-service, with one SMTP
    implementation. Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional
    `SMTP_USERNAME` / `SMTP_PASSWORD`. When the host is unset, the service uses the Mailpit dev
    defaults (`localhost:1025`, from `noreply@barrowspire.local`) and logs at startup that it's
    on dev mail defaults. There is **no "skip sending" flag** *(charter default: bypass flags
    leak into prod)*.
27. **A send failure is logged at error level** with member id and event id, and is not marked
    processed, so it is redelivered under the consumer's existing retry policy.
28. **`docker-compose.yml` gains a Mailpit service**: pinned image tag, SMTP and web-UI ports
    published, and host ports chosen to fit the file's existing offset-to-avoid-conflicts habit.
    The chosen ports are noted in a comment *(charter default)*.

### G. Marketplace gate (marketplace-service): amendment A2

29. **marketplace-service refuses the list, place-bid and buyout operations for an unverified
    caller** (`Identity.EmailVerified == false`) with **`400 · EMAIL_UNVERIFIED`** (a registered
    domain code). The check comes first in the handler, before any read or write.
30. **These stay open to unverified members:** withdraw a bid, accept the leading bid on your
    own listing, and every read (browse, listing detail, my listings, my bids). The reason is
    that a gate never traps someone in a commitment they already made *(amendment 3)*. Every
    member who predates this FS is unverified when it deploys.
31. **The gateway does no gating.** It forwards the bearer as it does today and passes the
    refusal through as 400 (the route error lists already include 400).
32. **Password reset is gated by rule only**: when reset is built, it must refuse unverified
    members. There's nothing to build here.

### H. Client (game-client)

33. **The register page** requires at least 10 characters (counted in code points, matching
    R1) before submitting, shows the rule as a hint, and maps `PASSWORD_TOO_SHORT`,
    `PASSWORD_TOO_LONG`, `PASSWORD_TOO_COMMON` and `EMAIL_INVALID` to plain messages. The
    blocklist stays server-side *(charter default)*. After signup the flow is unchanged:
    redirect to log in.
34. **The profile page's change-password form** maps the same three password codes.
35. **The verification panel** has a code input, Verify, Resend (disabled while the 60-second
    cooldown runs, with a countdown, and also handling `VERIFICATION_RESEND_TOO_SOON`) and
    Change email. It maps `VERIFICATION_CODE_INVALID`, `VERIFICATION_CODE_EXPIRED`,
    `EMAIL_INVALID`, `ALREADY_EXISTS` and `EMAIL_ALREADY_VERIFIED`.
36. **An unverified banner** shows across the signed-in app while `email_verified` is false. It
    can be collapsed for the current page session and comes back on reload. It opens the panel.
    The profile page hosts the same panel and shows "Verified" once verified.
37. **On verify success**, the client replaces its stored tokens and member with the response,
    and the banner disappears without a reload.
38. **On `EMAIL_UNVERIFIED`** from list, bid or buyout, the marketplace shows a "verify your
    email" prompt that opens the verification panel. The banner may already be visible; the
    prompt explains why *this* action failed.
39. All new UI is token-only styling per ADR-0013 and `game-client/docs/design-guideline.md`.
40. **Contract:** the gateway handlers are the authored source. `make openapi && make client`
    regenerate `openapi.yaml` and `game-client/src/api/generated/`, which are committed with the
    handler change and never hand-edited.

### I. Unverified lifetime

41. Unverified accounts never expire and are never deleted in v1 *(charter default)*.

## User Stories

1. As a new player, I want to sign up and start playing right away, so that email verification never stands between me and the game.
2. As a new player, I want my verification code emailed the moment I sign up, so that I don't have to remember to ask for it later.
3. As a player who typo'd my email, I want to change it while it's unverified, so that I can fix it before it costs me my account.
4. As a player, I want a 6-digit code I can type, so that I can read the mail on my phone and verify on my desktop.
5. As a player whose code expired, I want to resend a new one, so that I'm never stuck.
6. As a player, I want to see how long until I can resend, so that I don't hammer a disabled button.
7. As a player who just verified, I want marketplace actions to work immediately, so that I don't have to log out and back in.
8. As an unverified player, I want a clear reason when the marketplace refuses me, so that I know verifying fixes it.
9. As an unverified player with a listing from before this change, I want to still accept its leading bid, so that I'm not trapped mid-trade.
10. As an unverified bidder, I want to still withdraw an outbid bid, so that my gold isn't held hostage.
11. As an unverified player, I want to keep browsing the marketplace, so that I can see what's there before verifying.
12. As a player choosing a password, I want to know the rule up front, so that I don't get refused blindly.
13. As a player, I want a clear message when my password is too common, so that I pick something safer.
14. As an existing player with an old short password, I want to keep logging in, so that the new rules don't lock me out.
15. As a player changing my password, I want the same rules as signup, so that a change can't make my account weaker.
16. As a player, I want `Me@x.com` and `me@x.com` treated as the same address, so that I can log in however I type it.
17. As a player, I want a clear message when my email is malformed, so that I fix it before submitting.
18. As a player who already verified, I want a stale verify click to just work, so that a double-submit doesn't show an error.
19. As a player, I want the banner to stop nagging once I'm verified, so that the UI gets out of my way.
20. As a player, I want to collapse the banner for now, so that it doesn't cover the game while I play.
21. As a developer, I want every signup mail captured locally, so that I can test signup without real inboxes.
22. As a developer or test agent, I want to fetch the latest code over an API, so that e2e tests can verify accounts.
23. As the operator, I want codes stored only as hashes, so that a database leak doesn't hand out live codes.
24. As the operator, I want codes to die after 5 wrong tries, so that guessing a 6-digit code isn't practical.
25. As the operator, I want a resend cooldown, so that nobody can use us to spam an inbox.
26. As the operator, I want a code to be issued only for a committed signup, so that no mail goes out for an account that doesn't exist.
27. As the operator, I want mail failures logged loudly, so that a broken mailer isn't silent.
28. As marketplace-service, I want an absent claim to read as unverified, so that an old token can never slip past the gate.
29. As a future password-reset feature, I want the verified state already recorded, so that reset can refuse unproven addresses.

## Acceptance Criteria

- [ ] Signup with a 9-character password → `400 · PASSWORD_TOO_SHORT`; with 73 bytes → `400 · PASSWORD_TOO_LONG`; with a listed password in any case → `400 · PASSWORD_TOO_COMMON`. A 10-character unlisted password → 201.
- [ ] Password change applies the same three refusals to the new password. Login with a pre-existing 6-character password still succeeds.
- [ ] Signup with `  Foo@Example.COM ` stores `foo@example.com`. Login with `FOO@example.com` succeeds. A second signup with `foo@EXAMPLE.com` → `409 · ALREADY_EXISTS`.
- [ ] Signup with `Name <a@b.c>`, `not-an-email`, or a 255-byte address → `400 · EMAIL_INVALID`.
- [ ] The migration lowercases existing emails, adds the `lower(email)` unique index, adds `email_verified_at` (all NULL), and creates the code table. It fails loudly on a case-collision.
- [ ] A signup commits the member, the `member.signedup` row and a `member.verification_requested` row in one transaction. A forced rollback leaves none of them.
- [ ] With the compose stack up, a signup's code appears in Mailpit within seconds. The subject and body match R25, and the code is in no log line.
- [ ] Redelivering the same `member.verification_requested` event sends no second mail.
- [ ] Verify with the right code → 200, a fresh pair whose access token decodes to `email_verified: true`, member `email_verified: true`, and the code row deleted.
- [ ] A wrong code → `400 · VERIFICATION_CODE_INVALID`. Five wrong entries, then the right code → `400 · VERIFICATION_CODE_EXPIRED`. After 15 minutes → `400 · VERIFICATION_CODE_EXPIRED`.
- [ ] Verify when already verified → 200 with a fresh pair (no-op).
- [ ] Resend inside 60s → `400 · VERIFICATION_RESEND_TOO_SOON`. After 60s → 204 and the old code no longer verifies. Resend when verified → `400 · EMAIL_ALREADY_VERIFIED`.
- [ ] Change email while unverified → 200 with the updated member, and the code goes to the new address. A taken email → 409. A malformed one → `400 · EMAIL_INVALID`. When verified → `400 · EMAIL_ALREADY_VERIFIED`.
- [ ] `GET /api/member` and the signin result carry `email_verified`. An unverified member's access token has no `email_verified` key.
- [ ] marketplace: list, bid and buyout by an unverified caller → `400 · EMAIL_UNVERIFIED` with no side effects. Withdraw, accept and all reads succeed for the same caller. A verified caller is unaffected.
- [ ] Client: the register hint and messages for all four codes; the banner shows for unverified members only and collapses for the session; the panel's verify, resend countdown and change email work; on verify success, stored tokens are replaced and the banner disappears; the marketplace prompt shows on `EMAIL_UNVERIFIED`.
- [ ] `openapi.yaml` and the generated client are regenerated, not hand-edited, and the contract gates pass.
- [ ] Every new domain code is registered in `domainCodes` with an "Added for FS-V6SFK" comment.

## Edge States

- **Empty:** a member with no live code (never issued, expired or burned) → verify answers `VERIFICATION_CODE_EXPIRED`, and resend fixes it once the cooldown allows.
- **Concurrent:** two verify calls with the right code → both succeed (the second is the already-verified no-op). Two resends racing → the cooldown check and the upsert sit in one transaction, so at most one issues. A change-email racing a signup for the same address → the unique index decides and the loser gets 409.
- **Failed:** SMTP down → the event stays unprocessed and is redelivered, and the user can still resend after the cooldown. Outbox publish delayed → mail is late, never lost.
- **Expired:** a 15-minute-old code → `VERIFICATION_CODE_EXPIRED`. An access token minted before verification → reads as unverified until verify's fresh pair replaces it or the member logs in again.
- **Disconnected:** the client loses the verify response → the member is verified server-side, and a retry gets the no-op fresh pair.
- **Unauthorized:** the verify, resend and change-email routes are protected, so no token → 401. A member id in the body is ignored and never trusted.
- **Abuse:** guessing is capped at 5 tries per code and one code per 60 seconds. Changing email to spam arbitrary addresses is capped by the same cooldown.
- **Legacy:** a pre-existing seller is unverified on deploy, so their listings can still be accepted and their bids withdrawn, but nothing new can be listed until they verify.

## API surface

All routes are typed; `/api/member/*` and `/api/marketplace/*` are already serialized (FS-NTPW2, FS-0YXG6), so no serialize-on-touch. New routes return their body bare (no `{statusCode, message, result}` envelope), the same as signup after FS-83TJK.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| signup (changed) | `POST /api/member/signup` | — | unchanged | `201` Member (+ `email_verified`) | **`400 · PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` / `PASSWORD_TOO_COMMON` / `EMAIL_INVALID`** (new; `400` added to the declared errors), `409 · ALREADY_EXISTS`, `422 · VALIDATION_FAILED`, `503`, `500` |
| signin (changed) | `POST /api/member/signin` | — | unchanged (email normalized server-side) | `200` unchanged envelope; member info gains `email_verified`; access token carries the claim when true | unchanged |
| get-member (changed) | `GET /api/member` | — | — | `200` unchanged envelope; Member gains `email_verified` | unchanged |
| update-password (changed) | `PATCH /api/member/update-password` | — | unchanged | unchanged | **`400 · PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` / `PASSWORD_TOO_COMMON`** added; others unchanged |
| verify-email (new) | `POST /api/member/email/verify` | — | `code` string, required, exactly 6 digits | `200` a `LoginResult` (`access_token`, `refresh_token`, `access_expires_in`, `refresh_expires_in`, `member_info`), the same type as signin's `result`, bare | `400 · VERIFICATION_CODE_INVALID`, `400 · VERIFICATION_CODE_EXPIRED`, `401 · UNAUTHENTICATED`, `422 · VALIDATION_FAILED` (shape: not 6 digits), `503`, `500` |
| resend-verification (new) | `POST /api/member/email/resend` | — | none | `204` | `400 · VERIFICATION_RESEND_TOO_SOON`, `400 · EMAIL_ALREADY_VERIFIED`, `401`, `503`, `500` |
| change-email (new) | `PUT /api/member/email` | — | `email` string, required | `200` Member (bare) | `400 · EMAIL_INVALID`, `400 · EMAIL_ALREADY_VERIFIED`, `400 · VERIFICATION_RESEND_TOO_SOON`, `409 · ALREADY_EXISTS`, `401`, `422`, `503`, `500` |
| create-listing / place-bid / buyout (changed) | existing paths | unchanged | unchanged | unchanged | **`400 · EMAIL_UNVERIFIED`** passes through (400 already declared) |

Member wire field: `email_verified` (bool, snake_case like the existing `avatar_url`; it must
serialize `false` too, so no `omitempty` on it, unlike the surface's other fields). gRPC (`auth.proto`, regenerated, never hand-edited): `Member` and the login
member info gain `email_verified`. New RPCs `VerifyEmail`, `ResendVerification` and
`ChangeUnverifiedEmail` take the member id from the gateway (the same convention as
`UpdateMemberPassword`'s id). New domain codes: `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`,
`PASSWORD_TOO_COMMON`, `EMAIL_INVALID`, `EMAIL_UNVERIFIED`, `EMAIL_ALREADY_VERIFIED`,
`VERIFICATION_CODE_INVALID`, `VERIFICATION_CODE_EXPIRED`, `VERIFICATION_RESEND_TOO_SOON`.

## Out of Scope

- Password reset (the gate rule is reserved in R32; the feature itself isn't built).
- Changing email after verification (needs re-verification and a notice to the old address).
- Auto-login after signup (signup still mints no tokens; FS-83TJK R5).
- Choosing or configuring a production mail provider; KinD/GKE manifests for SMTP.
- Breach-corpus / HIBP lookups.
- A world-chat or any other gate besides the marketplace.
- Expiring or deleting unverified accounts.
- Changing how migrations run (deferred discussion); this FS only adds migration files.
- Composition rules (lowercase, digits, symbols): rejected by ADR-0041.
