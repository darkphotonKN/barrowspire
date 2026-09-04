# FS-0006: Account and role claims on the access token

> Status: work-order · SPECIFICATION.md: `game-server/auth-service/SPECIFICATION.md` "## Capabilities" → "### Tokens" → "Mint account and role claims into the access token" and "### Accounts" → "Record a member's wallet account id"; `game-server/wallet-service/SPECIFICATION.md` "## Capabilities" → "### Account" → "Create a member's account on signup" and "Publish account creation for downstream consumers" → this FS · Related ADRs: [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (eventually-consistent claim, fails closed), [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet owns balance) · Consumer: [FS-0003](0003-append-only-gold-ledger.md) §Req 24–29 · Sibling: [FS-0007](0007-synchronous-signup.md) (synchronous signup — **sequenced before this**) · Vocabulary: [`auth-service/CONTEXT.md`](../../game-server/auth-service/CONTEXT.md), [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md)

## Summary

auth-service's access token carries only `sub`, `exp`, `iat`, and `tokenType`. FS-0003 built the
ledger read path on the assumption that **`role`** and the caller's own **`account_id`** arrive
as verified claims, with no wallet lookup at request time — an assumption nothing has ever
satisfied, which is what blocks I-0025 `getTransaction` and I-0026 `listEntries`.

This feature mints both claims. `role` is a one-line read off a column that already exists.
`account_id` is not derivable and cannot be fetched at login without circularity, so it becomes
a **denormalized copy on `members`, populated asynchronously** through an event loop: wallet
creates the account in reaction to signup and announces it; auth records it and mints it on the
next login. Every consumer **fails closed** when the claim is absent, which is what makes the
staleness safe (ADR-0014).

This is the **minting side only**. Extracting and enforcing the claims at the gateway is
separate work.

## Requirements

### The claims

1. **The access token carries a `role` claim**, read from `members.role` on the `models.Member`
   the minter already receives. No new query, no new I/O.
2. **`role` is `player` or `admin`, and the set is closed.** The value is passed through from
   the column verbatim — the minter does not map, normalise, or default it. `player` is the
   column's `DEFAULT`, so every member has one.
3. **The access token carries an `account_id` claim when, and only when,
   `members.account_id` is non-NULL.**
4. **When `account_id` is unknown the key is omitted from the claim map entirely** — not
   emitted as `""`, not as `null`. A missing key is unambiguous at the parse boundary; an empty
   string invites a truthiness bug in every consumer that reads it.
5. **Both claims go on the access token only.** The refresh token's claim map is unchanged.
   Refresh tokens are credentials for re-minting, not for authorization; keeping claims off
   them means a future redemption endpoint must re-read the member rather than copying a
   week-old role forward.
6. **The login path never calls wallet-service.** No synchronous resolution, at login or
   anywhere else in minting. This is the property ADR-0014 exists to protect.

### The minter

7. **There is exactly one `GenerateJWT` in the repo when this ships.**
   `api-gateway/internal/auth/jwt.go`'s `GenerateJWT` and `RefreshToken` are dead — nothing
   calls them, `config/routes.go` imports that package only for `AuthMiddleware` — and are
   **deleted**, not updated in parallel. `jwt_middleware.go` and its test stay.
8. **Claims are minted through a typed `Claims` struct** embedding `jwt.RegisteredClaims`,
   living in **`common/auth`** next to the validator that must eventually read it, so minter
   and parser cannot drift. `account_id` is `omitempty` so requirement 4 falls out of the type
   rather than being enforced by hand at each call site.

### The copy

9. **`members.account_id` is `UUID NULL UNIQUE`.** Nullable is the whole fail-closed design.
   UNIQUE mirrors `wallet.accounts.member_id UNIQUE` so a buggy consumer cannot write one
   account id onto two members; Postgres permits many NULLs under UNIQUE, so it does not
   constrain the un-populated majority.
10. **Nothing writes `members.account_id` except the `account.created` consumer.** It is a
    cache, never an input — no RPC sets it, no signup path sets it, no admin surface edits it.

### The loop

11. **wallet-service consumes `member.signedup`** from the `auth.events` exchange and creates
    the member's account. The existing payload already carries `EventID: uuid.NewString()` and
    `UserID`, so **no producer change is required** on the auth side.
12. **wallet publishes `account.created` through a transactional outbox**, written in the same
    transaction as the account insert, using the existing `common/outbox`
    (`CreateOutboxTx`) — wallet does not currently wire it up and must.
13. **`account.created` is a routing key on a new `wallet.events` topic exchange**, added to
    `common/constants` as `WalletEventsExchange` alongside `AuthEventsExchange`,
    `GameEventsExchange`, and `ItemEventsExchange`. The existing scaffolded **fanout exchange
    literally named `account.created` is replaced**, not extended.
14. **The `account.created` payload carries its own `EventID`**, distinct from the outbox row's
    `ID`. `common/outbox`'s `OutboxEvent.ID` identifies a *row*, and the publisher ships only
    `Payload` — so the consumer's dedupe key must ride inside the payload, as
    notification-service's does.
15. **auth-service consumes `account.created`** and writes `members.account_id` for the named
    member.
16. **Both consumers are idempotent via an inbox**: the event is marked processed **inside the
    same transaction** as the work it triggers, so a redelivery is a no-op rather than a second
    account or a repeated write.
17. **Neither new consumer acks on handler error.** auth-service's existing `member.create`
    consumer always acks, so a failed create is silently dropped — that behavior is a known
    defect and must not be copied. A handler failure nacks for redelivery, which requirement 16
    makes safe.
18. **The claim appears on the member's next login.** No session invalidation, no push, no
    re-mint of tokens already issued. A member holding a valid access token minted before their
    account existed keeps a claimless token until it expires (60 min) and they log in again.

### Shared machinery

19. **The inbox is lifted into `common/inbox`.** No shared inbox exists today — the only
    implementation is `notification-service/internal/notification/inbox_repository.go`, and
    `common/` has an `outbox` package with no inbox sibling. This feature creates the package
    and **repoints notification-service at it**, so one implementation serves three consumers.
20. **Every service keeps its own `processed_events` and `outbox` tables in its own database.**
    The lifted code is shared; the storage is not. No service reads or writes another service's
    tables. auth-service and wallet-service each get their own `processed_events` migration;
    wallet-service additionally gets its own `outbox` migration.
21. **The `processed_events` shape is preserved**: `(event_id UUID, event_type TEXT,
    processed_at TIMESTAMPTZ, PRIMARY KEY (event_id, event_type))`, inserted `ON CONFLICT DO
    NOTHING`, with "was this new?" decided by `RowsAffected() == 1`. Keying on
    `(event_id, event_type)` rather than `event_id` alone is deliberate — it lets one service
    consume two event types that could share an id without one masking the other.

### Consequences carried deliberately

22. **No backfill.** Members who predate this feature have `account_id` NULL and no claim, and
    nothing repairs that. Since `wallet.CreateAccount` has never had a caller, **every member in
    every database today is such a member** — on deploy the claim mints for nobody, and the
    ledger read path is unblocked only for post-deploy signups. Accepted because the repo is
    pre-launch (ADR-0014).
23. **FS-0003 §Req 29 is amended from `member | admin` to `player | admin`**, together with its
    edge-state rows and the `role=member` references in §Req 25. Done as part of this work
    order; FS-0003 is `work-order`, not `shipped`, so the write-once rule does not bind.
24. **This feature assumes signup is synchronous ([FS-0007](0007-synchronous-signup.md)), and is
    sequenced after it.** Today signup is itself fire-and-forget over the broker, so "the member
    exists" is *already* eventually consistent — layering this feature's wallet hop on top would
    make the `account_id` claim eventually-consistent-on-top-of-eventually-consistent, with no
    bound on the total delay. FS-0007 collapses the first hop to a synchronous call, leaving
    exactly one asynchronous step between signup and the claim.

    **The dependency is only on ordering, not on design.** `member.signedup` is published from
    inside `CreateMember` via the outbox either way (FS-0007 §Req 6), so requirement 11's
    consumer is unaffected by which transport invoked signup. Shipping this feature first is
    possible; the window is simply unbounded until FS-0007 lands.

## User Stories

1. As **a member**, I want my access token to carry my role, so that services can authorize me
   without a round trip to auth-service on every request.
2. As **a member**, I want my access token to carry my own account id, so that reading my gold
   history costs one hop instead of a wallet lookup per page.
3. As **a member**, I want a token that predates my wallet account to be *refused* on ledger
   reads rather than silently showing me an empty history, so that I can tell "not ready yet"
   from "nothing ever happened".
4. As **a member**, I want to still be able to log in when wallet-service is down, so that an
   economy outage is not an authentication outage.
5. As **a member**, I want logging in again to pick up my account id once it exists, so that the
   gap heals without support intervention.
6. As **an admin**, I want my `admin` role to arrive as a verified claim, so that FS-0003's
   unscoped listing and targeted `account_id` lookups have something to authorize against.
7. As **ledger-service**, I want the caller's account id to arrive already verified, so that I
   can scope a query by account without holding any account records (FS-0003 §Req 15).
8. As **ledger-service**, I want a token missing the `account_id` claim to be rejected upstream,
   so that I never have to guess whether an absent claim means "no history" or "broken token".
9. As **the api-gateway**, I want exactly one minter in the repo, so that a token's contents do
   not depend on which code path issued it.
10. As **wallet-service**, I want to learn about new members from the broker, so that I gain no
    dependency on auth-service's availability at signup.
11. As **wallet-service**, I want the account insert and its outbound event in one transaction,
    so that an account can never exist unannounced, nor be announced without existing.
12. As **wallet-service**, I want to keep `CreateAccountRequest` empty and identity
    interceptor-derived, so that the security property that made a login-time fetch impossible
    stays intact.
13. As **auth-service**, I want `account.created` deduplicated, so that a redelivered event
    rewrites nothing and errors nothing.
14. As **auth-service**, I want `members.account_id` UNIQUE, so that a consumer bug surfaces as
    a constraint violation rather than as two members quietly sharing one account's history.
15. As **a consumer of either new event**, I want a handler failure to nack rather than ack, so
    that a transient database blip does not permanently lose a member's account linkage.
16. As **an operator**, I want the outbox worker's existing publish loop to carry the new event,
    so that there is one delivery mechanism to reason about rather than two.
17. As **an operator**, I want `wallet.events` named like every other exchange in the repo, so
    that I can find wallet's events where I would look for any service's.
18. As **an on-call engineer**, I want a member with a NULL `account_id` to produce a clean
    `401` rather than a 500 or an empty page, so that the failure names itself in the logs.
19. As **a future developer**, I want `common/inbox` to exist, so that the fourth consumer that
    needs deduplication copies nothing.
20. As **a future developer**, I want each service's `processed_events` table in its own
    database, so that lifting shared code never became shared storage.
21. As **a future developer**, I want a typed `Claims` struct, so that adding a claim is a field
    on a type rather than a string key duplicated across a minter and a parser.
22. As **a future developer**, I want ADR-0014's rejected alternatives on record, so that
    "why not just derive the id from `member_id`?" is answered before it is re-argued.
23. As **whoever builds the gateway extraction next**, I want the claim's absence semantics
    already decided and written down, so that I implement a refusal rather than inventing a
    default.
24. As **whoever builds a refresh-redemption endpoint next**, I want refresh tokens to carry no
    authorization claims, so that I am forced to re-read the member instead of trusting a
    seven-day-old copy.
25. As **a reader of FS-0003**, I want §Req 29's placeholder role vocabulary corrected to what
    actually shipped, so that the spec and the token agree.

## Acceptance Criteria

**Minting**

- [ ] An access token minted for a member with `role='player'` decodes with `role` == `"player"`
- [ ] An access token minted for a member with `role='admin'` decodes with `role` == `"admin"`
- [ ] An access token minted for a member with `account_id` set decodes with `account_id` equal
      to that value
- [ ] An access token minted for a member with `account_id` NULL decodes with **no `account_id`
      key present** — asserted as key-absence, not as empty-string equality
- [ ] The refresh token's claim map is byte-identical to today's for the same member
- [ ] `sub`, `exp`, `iat`, and `tokenType` are unchanged in name, type, and value semantics
- [ ] Access token expiry is still 60 minutes; refresh is still 7 days
- [ ] `LoginMember` issues tokens with no wallet-service call in the path (asserted by the
      absence of a wallet client on the minting dependency graph, not by a mock's call count)

**The single minter**

- [ ] `api-gateway/internal/auth/jwt.go` no longer exists
- [ ] `grep -r "func GenerateJWT" game-server/` returns exactly one match
- [ ] api-gateway still builds and `jwt_middleware_test.go` still passes

**The column**

- [ ] Migration adds `members.account_id UUID NULL UNIQUE`
- [ ] Two members can both hold NULL `account_id` without violating the constraint
- [ ] Writing the same non-NULL `account_id` to a second member is rejected by the database
- [ ] The down migration drops the column and its constraint

**The loop**

- [ ] A `member.signedup` delivery causes exactly one `accounts` row for that member
- [ ] Redelivering the same `member.signedup` (same `EventID`) creates **no** second account and
      returns no error to the broker
- [ ] The `accounts` insert and its `outbox` row commit or roll back together — a forced failure
      after the insert leaves neither
- [ ] `account.created` is published on `wallet.events` with routing key `account.created`
- [ ] The `account.created` payload carries an `EventID` distinct from the outbox row's `ID`
- [ ] An `account.created` delivery sets `members.account_id` for the named member
- [ ] Redelivering the same `account.created` leaves the column unchanged and returns no error
- [ ] The column write and the `processed_events` insert commit or roll back together
- [ ] A handler error nacks the message rather than acking it
- [ ] A member who signs up, then logs in after the loop completes, receives a token carrying
      `account_id`

**Shared machinery**

- [ ] `common/inbox` exists and exports the `MarkEventProcessed` contract
- [ ] notification-service uses `common/inbox` and its existing tests still pass unchanged
- [ ] auth-service and wallet-service each have their own `processed_events` migration
- [ ] wallet-service has its own `outbox` migration
- [ ] No service's connection string or query references another service's database

**Spec consistency**

- [ ] FS-0003 contains no occurrence of `role=member` or `member | admin`
- [ ] `player` and `admin` are defined in `auth-service/CONTEXT.md`

## Edge States

| Situation | Behavior |
|---|---|
| Member has `account_id` NULL at login | Token minted successfully, `account_id` key absent. Login succeeds; only claim-dependent reads are affected. |
| Member holds a token minted before their account existed | Keeps a claimless token until it expires. No invalidation, no push. Requirement 18. |
| Member predates this feature entirely | Never receives the claim. No backfill exists. Requirement 22. |
| `member.signedup` redelivered | Inbox suppresses it; no second account, no error, message acked. |
| `account.created` redelivered | Inbox suppresses it; column unchanged, message acked. |
| `account.created` arrives for an unknown `member_id` | Handler error → nack → redelivery. A member row that does not exist is a genuine inconsistency, not a routine race: auth is the producer of the signup that started the loop, so the member necessarily preceded it. |
| Two `account.created` events name the same `account_id` for different members | Second write violates `UNIQUE` → handler error → nack. The message wedges deliberately; this is a consumer bug and silence would be worse. Requirement 9. |
| wallet-service down at signup | Signup succeeds and the event waits in the queue. The account is created when wallet returns; the claim appears on a later login. |
| wallet-service down at login | Login unaffected — nothing calls it. Requirement 6. |
| RabbitMQ down at signup | Member is created; the outbox row is durable and the worker publishes when the broker returns. Existing outbox guarantee, unchanged. |
| Database fails mid-consumer | Transaction rolls back; both the work and the `processed_events` row are absent; nack triggers redelivery. |
| `wallet.accounts.id` and `members.account_id` diverge | Undetected. No reconciler exists. Listed as an accepted consequence in ADR-0014. |
| `members.role` holds a value outside `{player, admin}` | Minted verbatim. The minter does not validate; the column has no `CHECK`. Downstream authorization treats an unrecognised role as non-admin, but that enforcement is the gateway's, out of scope here. |
| Member's role changes while a token is live | The token keeps the old role until it expires (≤60 min). Accepted — this is the standard cost of stateless claims and the reason requirement 5 keeps them off the 7-day refresh token. |

## Out of Scope

- **Extracting or enforcing the claims at the api-gateway.** `common/auth`'s `NewValidator`
  still parses into `jwt.RegisteredClaims` and returns only `claims.Subject`. The typed `Claims`
  struct lands in `common/auth` (requirement 8) but the parse path is not rewired here.
- **The ledger read path itself** — FS-0003, I-0025 `getTransaction`, I-0026 `listEntries`. This
  feature unblocks them; it does not build them.
- **A refresh-token redemption endpoint.** `RefreshToken()` remains dead code in auth-service.
  It is *not* deleted (unlike the gateway copy), because it is the one implementation of a
  capability that is on the roadmap.
- **Fixing `ValidateJWT`'s `jwt.RegisteredClaims{ID: sub}`**, which puts `sub` in the `jti`
  field and disagrees with `common/auth`'s validator. Pre-existing, adjacent, and the typed
  `Claims` struct is where it should eventually be fixed.
- **Any backfill or reconciler** for existing members, or for divergence between
  `wallet.accounts.id` and `members.account_id`.
- **Wallet's saga write path** — holds, `CommitHold`, `ReleaseHold`, `Credit`. Only account
  *creation* and its announcement are in scope.
- **Fixing auth-service's existing `member.create` consumer** to stop acking on error.
  Requirement 17 binds the *new* consumers only; repairing the old one is separate work.
- **Deriving `accounts.id` from `member_id`.** Considered and rejected — see ADR-0014.
- **No API surface section:** this feature adds and changes no HTTP endpoint. Claims live
  inside an opaque bearer token, and the login response already exposes `role` on the member
  body (`api-gateway/internal/gateway/auth/typed.go`). The generated OpenAPI and client are
  unaffected.
