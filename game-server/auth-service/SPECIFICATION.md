# SPECIFICATION — auth-service

> ⚠️ **GENERATED DRAFT (spec-bootstrap).** Reverse-engineered from the code on
> 2026-07-24 — it captures what the service *does*, not what was necessarily *intended*.
> Correct it, don't trust it. Lines marked `> REVIEW:` are inferences or suspected accidents a
> human must confirm; several are security-relevant. This is the "run zero" baseline; future
> `/spec-audit` runs are cheap deltas against it.

Living spec. Describes **behavior, entities, states, invariants, and contracts** — not code or
file paths. Marked ✅ DONE vs ⏳ PLANNED. Cross-service architecture context:
[`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Assumptions (verify these first)

- auth-service owns the **member identity & authentication** bounded context, plus **avatar
  uploads**. It is the service behind the gateway's `/api/member` routes and the `auth` Consul name.
- It exposes two gRPC services (`AuthService`, `UploadService`), consumes one AMQP command
  (`member.create`), and publishes member events via a transactional outbox.
- A large amount of wired-but-unused infrastructure exists (Redis cache, refresh-token
  minting, seed paths, several structs). These are called out as `> REVIEW:` rather than
  documented as intended behavior.

## Purpose

auth-service is the **identity & auth authority**: it creates members, authenticates them
(password + JWT), serves member profile reads/updates, tracks Stripe linkage on the member
record, and manages **avatar uploads** to S3. It publishes a `member.signedup` event so
downstream services (notification, analytics) learn about new members. ✅ DONE

## Domain terms

- **Member** — the aggregate/entity. Table `members`. One account per email. Fields:
  - `id` UUID PK; `email` TEXT **UNIQUE NOT NULL**; `name` TEXT NOT NULL; `password` TEXT NOT
    NULL (bcrypt hash).
  - `status` SMALLINT NOT NULL DEFAULT 1, **CHECK IN (1,2)** — 1 = Member, 2 = Author.
    > REVIEW: the Go model types `Status` as **string**, and `memberToProto` runs
    > `stringToInt(status)` which returns **0** on parse failure — 0 violates the CHECK domain
    > if ever written back. Works today only because sqlx coerces. Confirm the intended type.
  - `role` VARCHAR(50) NOT NULL DEFAULT `'player'` (player | admin).
  - `average_rating` DECIMAL(2,1) DEFAULT 0, CHECK 0–5.
  - `avatar_url` TEXT nullable.
  - `stripe_customer_id` TEXT nullable, partial UNIQUE where not null;
    `stripe_subscription_product_id` nullable; `stripe_subscription_status` TEXT NOT NULL DEFAULT ''.
  - `created_at` / `updated_at` TIMESTAMPTZ, `updated_at` auto-set by trigger.
- **avatar_uploads** — upload-tracking rows; status FSM `pending → uploaded → synced`, or
  `→ failed`. FK `member_id` ON DELETE CASCADE.
- **outbox** — transactional event outbox (`id, routing_key, exchange, payload BYTEA,
  created_at, published_at`); `published_at IS NULL` = pending.
- **player_profile** — level/xp row, FK to member (exists in schema; **not** exposed by any RPC here).

## Capabilities

<!-- Thin capability index. Format authority: /docs/specs/README.md — capability names only;
     the full RPC contracts and their REVIEW notes live in the prose sections below. -->

### Membership

- [x] Create a member, with the signup event published via transactional outbox
- [x] Log in and receive an access + refresh pair
- [x] Read a member
- [x] Update member info
- [x] Update member password
- [x] Check whether an email is taken
- [ ] Single member-creation path → FS-0007

### Tokens

- [x] Validate a token and return its subject
- [ ] Reject a refresh token presented as an access credential
- [ ] Mint account and role claims into the access token → FS-0006

### Avatars

- [x] Request a presigned avatar upload
- [x] Confirm an avatar upload and publish `profile.updated`
- [ ] Authorize confirmation against the requesting member

### Billing linkage

- [x] Read and write a member's Stripe customer id
- [x] Update a member's subscription status

### Player profile

- [ ] Expose the `player_profile` level/xp row over RPC

### Accounts

- [ ] Record a member's wallet account id → FS-0006

### Messaging

- [x] Consume `member.create` from `auth.events` to create members

## gRPC — AuthService contract

Consul name `auth`, gRPC port default **7116** (`GRPC_AUTH_ADDR`). Proto in
`common/api/proto/auth`. Handler delegates 1:1 to the member service. ✅ DONE

- **CreateMember** (`{Name,Email,Password}` → `Member`) — bcrypt-hash password; in ONE DB tx:
  insert member + write a `member.signedup` outbox row; commit; re-read (password stripped)
  and return. Transactional outbox guarantees the event iff the member is persisted.
- **LoginMember** (`{Email,Password}` → `{access, refresh, expiries, MemberInfo}`) — verify
  password (bcrypt); issue **access** JWT (60 min) + **refresh** JWT (7 days). No event emitted.
  > REVIEW: distinguishes "email not found" from "wrong password" (different errors) → account
  > enumeration. Intended?
- **GetMember** (`{Id}` → `Member`) — read by id, password blanked.
- **UpdateMemberInfo** (`{Id,Name,Status}` → `Member`) — update name+status; return re-read.
- **UpdateMemberPassword** (`{Id,CurrentPassword,NewPassword,RepeatNewPassword}` →
  `{Success,Message}`) — verify match + current password; hash + update.
  > REVIEW: on validation failure it returns a populated `{Success:false, Message}` **and** a
  > non-nil gRPC error; the error drops the response body, so `Message` never reaches the client.
- **ValidateToken** (`{Token}` → `{Valid,MemberId}`) — parse/verify JWT, return `sub`.
  > REVIEW: does **not** check `tokenType`, so a 7-day **refresh** token is accepted as a valid
  > access credential.
- **CheckEmailExists** (`{Email}` → `{Exists}`) — true if member found.
  > REVIEW: returns `Exists:false` on **any** error (incl. DB outage) → a failure reports every
  > email as available.
- **SetStripeCustomerID / GetStripeCustomerID / UpdateSubscriptionStatus** — read/write the
  Stripe columns on the member record (used by payment-service linkage).

> REVIEW: `CreateDefaultMembers` (seed: `communitybuildsmoderator@gmail.com` / hardcoded
> password) exists on the service interface but is **not wired into main.go** — dead seed path.

## gRPC — UploadService contract (avatars)

Registered **only if S3 init succeeds**; otherwise the whole service is absent and clients get
"unimplemented". ✅ DONE
- **RequestAvatarUpload** (`{MemberId,Filename}` → `{UploadId,PresignedUrl,S3Key,ExpiresAt,
  MaxFileSize=5MB,AllowedContentTypes}`) — validate extension (jpg/jpeg/png/webp); build key
  `avatars/{memberId}/{ts}_{uuid8}{ext}`; presign an S3 **PUT** (5-min expiry); insert
  `avatar_uploads` row status `pending`.
- **ConfirmAvatarUpload** (`{MemberId,UploadId}` → `{Success,Message,AvatarUrl}`) — load upload;
  require status `pending`; `HeadObject` to confirm the object exists and is ≤5MB (else mark
  `failed`); in a tx set member `avatar_url` + upload status `synced`; then publish
  `profile.updated`. Avatar URL = `{CDN_URL}/{key}` if set, else `https://{bucket}.s3.amazonaws.com/{key}`.
  > REVIEW: authorization uses the **upload row's** `member_id`, not the request's `MemberId`
  > (which is only logged) — anyone who knows an `UploadId` can confirm it.

## Messaging

**AMQP consumer** ✅ — durable topic exchange `auth.events`, durable queue `auth.signup`, bound
to routing key `member.create`. On delivery → `CreateMember`. **Fire-and-forget**: the marshalled
result is discarded (no reply/correlation).
> REVIEW: the message is **always acked**, even when the handler errors (errors only logged) —
> a failed create is silently dropped (no nack/requeue/DLX).
> REVIEW: `CreateMember` is reachable via BOTH gRPC and this AMQP key, and both write a
> `member.signedup` outbox row — double-create/double-event risk; unique email is the only guard.

**Events published:**
- **member.signedup** (`MemberSignedUpEvent{EventID,UserID,Name,Email,SignedUpAt}`) → `auth.events`,
  written to the **outbox** inside CreateMember's tx; drained by the outbox worker (5s cycle,
  batch 20).
  > REVIEW: `SignedUpAt` is always `""` (`// TODO: update to legit date`) — the event carries no timestamp.
- **profile.updated** (`MemberProfileUpdated{MemberId,Username,AvatarUrl}`) → `auth.events`,
  published **directly** (not via outbox) after ConfirmAvatarUpload commits.
  > REVIEW: publish error is discarded and it's post-commit/non-transactional, so a broker blip
  > loses the event — inconsistent with the outbox guarantee used for signup.
- Constants `member.signedin`, `member.login`, `PasswordResetEvent` are defined but **never
  published** (Login/UpdatePassword emit nothing).

## Auth & credentials

- **Passwords**: bcrypt, `DefaultCost` (10). Compare via `bcrypt.CompareHashAndPassword`.
- **JWT** (`JWT_SECRET`, HS256): claims `{sub, exp, iat, tokenType}`; access = 60 min, refresh =
  7 days. `ValidateJWT` verifies signature + exp, returns `sub`, ignores `tokenType`.
  > REVIEW: `RefreshToken` (mints a 15-min access token from a refresh token) exists but is
  > **dead** — no RPC/caller.

## Infra dependencies

- **Postgres** (sqlx, lib/pq) — the member store; repo errors mapped to domain sentinels via
  `commonhelpers.WrapDBErr` (`ErrNotFound`, `ErrDuplicateResource`, …).
- **Consul** — registers as `auth`; 1s health-check loop (`log.Fatal` on a single failure).
- **RabbitMQ** — `auth.events` exchange (consumer + outbox publisher).
- **Prometheus** — `/metrics` on `:8194`. **OpenTelemetry** — gRPC + span instrumentation.
- **Redis** — connected and a cache injected into the member service…
  > REVIEW: …but the cache is **never read or written** anywhere. Whole Redis subsystem is
  > currently dead infra (no signup-polling/check-email caching implemented). Decide: wire it or remove it.
- **S3** — presigned-PUT avatar flow; bucket/`CDN_URL` from env; if init fails the service runs
  but UploadService is silently unregistered.

## Invariants (observed)

- One member per `email` (DB UNIQUE; app does **not** pre-check on create — relies on the constraint).
- `name`, `email`, `password` NOT NULL; `status` ∈ {1,2}; `role` defaults `player`.
- CreateMember inserts only (id, name, email, password); status/role/rating come from DB defaults.
- Reads blank the password hash except the internal auth lookups (`GetByIdWithPassword`,
  `GetMemberByEmail`).
- avatar upload status ∈ {pending, uploaded, synced, failed}.

## Suspected issues / open questions (draft — confirm before trusting)

Security-relevant, flagged for a real review:
- Refresh tokens accepted as access tokens (`ValidateToken` ignores `tokenType`).
- ConfirmAvatarUpload doesn't verify the requester owns the `UploadId`.
- Login email enumeration; CheckEmailExists reports "available" on DB errors.
- **Secrets committed to `.env`** (`JWT_SECRET`, AWS keys); migration seeds a default admin
  `admin@barrowspire.com` with bcrypt of `123456`; seed constant hardcodes a password.
- AMQP consumer acks on handler failure → silent message loss.
- A committed 43MB `server` binary and `.air.toml` sit in the repo root (likely accidental).

Behavioral open questions:
- Is the Redis cache meant to be used (and for what), or removed?
- Should signup remain double-reachable (gRPC + AMQP), or one canonical path?
- Should `profile.updated` move to the outbox for the same delivery guarantee as `member.signedup`?
- Is the `Status` field meant to be int or string end-to-end?
