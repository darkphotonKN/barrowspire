# CONTEXT — auth-service

Ubiquitous language for the **auth-service** bounded context: the **identity & authentication
context**. Terms below mean exactly this *inside auth-service*. Two of them — `player` and
`account` — also exist elsewhere in the repo and mean something different there. That
divergence is deliberate; see [Boundaries](#boundaries).

Sources: [FS-0006](../../docs/specs/0006-account-and-role-token-claims.md),
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
  (FS-0003 §Req 28).

### Tokens

- **Minting** — issuing and signing a token. auth-service is the **only** minter; there is
  exactly one implementation, and keeping it that way is a standing constraint.
- **Claim** — a verified assertion carried inside a signed token. Verified means *the signature
  covers it*, not *someone asserted it* — which is why a claim is trusted and a request
  parameter of the same name is not (FS-0003 §Req 24).
- **Access token** — the short-lived (60 min) credential that carries authorization claims:
  `sub`, `role`, and, when known, `account_id`.
- **Refresh token** — the long-lived (7 day) credential used only to re-mint an access token.
  **Carries no authorization claims, deliberately** — so a stale role or account id cannot be
  copied forward out of a week-old token.
- **account id claim** (`account_id`) — the member's wallet account, carried on the access
  token so a read can be account-scoped without a lookup. **Absent, not empty, when unknown**:
  the key is omitted from the claim map entirely, and a token missing it is refused
  (`401 · UNAUTHENTICATED`), never silently narrowed.

### The denormalized copy

- **`members.account_id`** — a **copy** of `wallet.accounts.id`, nullable, populated
  asynchronously. Never the source of truth, never written by anything but the
  `account.created` consumer.
- **Eventually present** — the honest property of the account id claim, replacing FS-0003
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
This is why FS-0003 §Req 29's placeholder `member | admin` is being amended to `player | admin`
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
