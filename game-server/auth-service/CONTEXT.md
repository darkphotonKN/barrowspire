# CONTEXT — auth-service

Ubiquitous language for the **auth-service** bounded context: the **identity & authentication
context**. Terms below mean exactly this *inside auth-service*. Two of them — `player` and
`account` — also exist elsewhere in the repo and mean something different there. That
divergence is deliberate; see [Boundaries](#boundaries).

Sources: [FS-9KW9F](../../docs/specs/9KW9F-account-and-role-token-claims.md),
[ADR-0014](../../docs/adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md),
and this service's [`SPECIFICATION.md`](SPECIFICATION.md).

## Terms

### Identity

- **Member** — the identity aggregate and the only entity this service owns. Table `members`,
  one per email. **The platform's word for a human being**, in every context except the game
  canvas and the rendered UI.
- **Role** — an authorization attribute on a Member, not an entity and not a group. Exactly two
  values, and the set is closed: `player` and `admin`. Column `members.role VARCHAR(50) NOT
  NULL DEFAULT 'player'`.
- **player** — the role value for a standard, non-administrative Member. The default every
  Member is born with. **A value, never a noun for a person here** — the person is a Member who
  *has* the `player` role.
- **admin** — the role value for a Member with administrative authority. In the ledger read
  path this is what earns the unscoped listing and the right to name another account
  (FS-F9R7Q §Req 28).

### Verification (FS-V6SFK)

- **Verified member** — a Member who has proved they receive mail at their email address by
  entering a **verification code** sent to it. Recorded as `members.email_verified_at` (set =
  verified). **Unverified** is the opposite state, the state every Member is born in and the
  state every Member who predates FS-V6SFK is in. It is a *state*, not a role: an unverified
  Member can authenticate and play; only email-dependent actions refuse them.
- **Verification code** — a short-lived, single-purpose 6-digit secret proving receipt of
  mail. auth-service issues and checks it (ADR-0040). At most one is live per Member: issuing a
  new one (resend, email change) kills the old one. It dies on success, on expiry, or when its
  wrong tries run out. Not a token: it grants nothing by itself, it only flips the Member to
  verified.
- **Normalized email** — an email trimmed and lowercased. The only form auth-service stores,
  compares or looks up. "One account per email" means one per *normalized* email, so
  `Kranti@x.com` and `kranti@x.com` are the same address.
- **Password policy** — the rule a password must meet *when it is set* (signup, password
  change): length bounds plus a common-password blocklist (ADR-0041). It is never checked at
  login, so a password set before the policy existed is still valid. "Weak password" means
  *refused by the policy at set time*, never *an existing password we now dislike*.

### Tokens

- **Minting** — issuing and signing a token. auth-service is the **only** minter; there is
  exactly one implementation, and keeping it that way is a standing constraint.
- **Claim** — a verified assertion carried inside a signed token. Verified means *the signature
  covers it*, not *someone asserted it* — which is why a claim is trusted and a request
  parameter of the same name is not (FS-F9R7Q §Req 24).
- **Access token** — the short-lived (60 min) credential that carries authorization claims:
  `sub`, `role`, `email_verified` when true, and, when known, `account_id`.
- **Refresh token** — the long-lived (7 day) credential used only to re-mint an access token.
  **Carries no authorization claims, deliberately** — so a stale role or account id cannot be
  copied forward out of a week-old token.
- **account id claim** (`account_id`) — the member's wallet account, carried on the access
  token so a read can be account-scoped without a lookup. **Absent, not empty, when unknown**:
  the key is omitted from the claim map entirely, and a token missing it is refused
  (`401 · UNAUTHENTICATED`), never silently narrowed.
- **email-verified claim** (`email_verified`) — whether the Member was verified when the
  access token was minted. **Absent means not verified** (fails closed, same rule as the
  account id claim). It goes stale the moment the Member verifies, which is why verifying
  mints a fresh pair (FS-V6SFK).

### The denormalized copy

- **`members.account_id`** — a **copy** of `wallet.accounts.id`, nullable, populated
  asynchronously. Never the source of truth, never written by anything but the
  `account.created` consumer.
- **Eventually present** — the honest property of the account id claim, replacing FS-F9R7Q
  §Req 27's assumed "always present and immutable". A Member exists, and can authenticate,
  before their copy is filled.
- **Fails closed** — the rule governing every consumer of the claim: absence is a refusal, not
  a permissive default and not an empty result set. See ADR-0014.
- **Inbox** — the consumer-side dedupe: an event is marked processed inside the same
  transaction as the work it triggers, so redelivery is a no-op. Distinct from the **outbox**,
  which is the producer-side guarantee that an event is written iff its state change committed.

## Boundaries

**`player` here is a role value; in game-service it is an entity.** game-service's WebSocket
protocol owns `player_id`, `current_player`, `other_players` — an in-run participant. This
service's `player` is one of two possible values of `members.role`. Same word, two contexts,
no relationship. game-client holds both at once and translates; see
[`game-client/CONTEXT.md`](../../game-client/CONTEXT.md).

**Do not name the role value `member`.** `Member` is already this context's entity noun, so a
role called `member` would make "the member's role is member" a sentence someone has to parse.
This is why FS-F9R7Q §Req 29's placeholder `member | admin` is being amended to `player | admin`
rather than the column being renamed — and `player` is additionally the value already live in
`commontypes.Role`, `items-service`'s `stringToRole`, the gateway's auth response, and the
generated client schema.

**`account` is not an auth-service term.** This context has `Member`. Wherever `account`
appears here it means **wallet-service's** Account, and it appears only as the borrowed
identifier `members.account_id`. auth-service has no opinion about gold, balances, or holds,
and must never grow one.

**auth owns the claim; wallet owns the fact.** `wallet.accounts.id` is the truth.
`members.account_id` is a cached copy that exists so the login path does not have to ask.
Divergence between them is possible and undetected — see ADR-0014's consequences.
