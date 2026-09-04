# CONTEXT — wallet-service

Ubiquitous language for the **wallet-service** bounded context: the **economy context**.

> **The full domain glossary currently lives in
> [`SPECIFICATION.md` § Domain Terms](SPECIFICATION.md#domain-terms)** — Account, Gold, Hold,
> Available, `bid_id`, `version` — alongside the aggregate and invariant prose. It predates
> this file. Terms below are the ones FS-0006 coined or sharpened, plus the boundaries they
> made necessary; the spec's glossary should migrate here when wallet is next worked.

Sources: [FS-0006](../../docs/specs/0006-account-and-role-token-claims.md),
[ADR-0014](../../docs/adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md),
[ADR-0005](../../docs/adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md).

## Terms

- **Account** — a member's gold wallet and this context's aggregate root. **One per member**,
  and that 1:1 is load-bearing well outside this service: it is the only reason a singular
  `account_id` token claim is coherent at all.
- **`accounts.id`** — the account's own identifier, a fresh `uuid.New()` at birth. **The source
  of truth for auth-service's `account_id` claim.** Deliberately *not* equal to `member_id`,
  and not derivable from it.
- **`member_id`** — the auth-service Member this account belongs to. `UNIQUE`, enforcing the
  one-account-per-member rule at the schema level. **A foreign identity, not a wallet concept**
  — wallet stores it to answer "whose wallet is this" and reads nothing else about that Member.
- **`account.created`** — the event announcing that an account now exists, published so
  auth-service can cache the account's id for token minting. **An announcement, not a command**:
  wallet does not know or care that auth denormalizes it, and gains no dependency on auth by
  publishing it.
- **Account birth on signup** — the account is created in reaction to `member.signedup`, not by
  a synchronous call. Wallet learns of new members from the broker; nothing calls in at signup
  time.
- **Inbox** — the consumer-side dedupe guarding account creation against redelivery of
  `member.signedup`. The `UNIQUE(member_id)` constraint is the backstop, but the inbox is what
  makes redelivery a clean no-op rather than a caught error.

## Boundaries

**Wallet owns the account; auth holds a copy.** `accounts.id` is the fact. auth-service's
`members.account_id` is a cache that exists so the login path never calls this service. Wallet
must not read, trust, or reconcile against that copy, and must not grow an RPC that serves it
synchronously — the whole point of ADR-0014 is that a wallet outage does not become a login
outage.

**Identity is derived from the caller, never supplied.** `CreateAccountRequest` and
`GetAccountRequest` are empty by design: the member comes from the auth interceptor's context.
This is why the account id could not simply be fetched at login — the token needed to make the
call is the token being minted. Preserve the empty-request shape; it is a security property,
not an oversight.

**`player` is not a wallet term.** Roles (`player` | `admin`) belong to auth-service. Wallet
authorizes on identity, not on role, and has no administrative read path of its own — the
role-scoped listing lives in ledger-service (FS-0003 §Req 28).

**`account` means something different in ledger-service.** There, `account_id` is a *soft
reference* to this table that the ledger never resolves and holds no record of (FS-0003 §Req
15). Here it is an aggregate with a balance and invariants. Same identifier, two contexts, and
ledger-service deliberately knows nothing about this one.
