# ADR-0047 — An admin is a role on a player account for now; a separate back-office identity will replace it at the admin doors

Status: accepted
Date: 2026-11-04
Scope: `game-server/auth-service`, `game-server/api-gateway`, `game-server/notification-service`, `game-server/ledger-service`, `game-server/items-service`, `game-server/common/auth`
Realized by: [FS-1GZGD](../specs/1GZGD-in-game-mailbox.md) amendment A7 (the people's door, the sent-by audit)
Builds on: [FS-9KW9F](../specs/9KW9F-account-and-role-token-claims.md) (`role` is `player` or `admin`, minted into the access token from `members.role`),
[ADR-0044](0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md)
(the mailbox and its claim), [ADR-0046](0046-grant-items-trusts-its-caller-until-a-service-credential-exists.md)
(another stand-in that blocks the mailbox's GKE rollout)

## Context

FS-1GZGD lets an admin send official letters that carry items and gold
(`POST /api/admin/mail`). Amendment A7 keeps that admin API as the door for people
(compensation, events, support) beside the system paths for code. So the question is: who is
an admin?

Today the answer is a column. auth-service's `members.role` holds `player` or `admin`
(migration `000007_add_role_to_members`), and FS-9KW9F mints it into the access token as the
`role` claim. Every admin check in the platform reads that claim (`common/auth.RoleAdmin`): the
mailbox's admin send (gateway and notification-service), the ledger's read-all view (gateway
and ledger-service), and items-service's catalogue writes. No code in auth-service sets the role:
signup creates a `player`, and no RPC or admin screen changes it. It is set by hand in the database, or by migration 000007, which
either promotes the oldest member to admin or, on an empty table, inserts
`admin@barrowspire.com` with the bcrypt hash of a default password that is written in the
migration's comment. The repository is not private-by-construction, so that password is
public.

So an admin is a **player account** with one extra claim. That account can create characters,
hold a wallet and a stash, delve, trade on the marketplace and receive letters. Once the
mailbox exists, it can also send letters with any item or any amount of gold to anyone,
**itself included**.

The intended model is different. Operators should have a **separate back-office identity**:
not a member, no characters, no wallet, no stash, so it cannot be the recipient of its own
letters. Every action it takes should be recorded against it (per-action audit). That
identity, its login and its audit trail do not exist yet, and building them is out of scope
for the mailbox.

Recorded without adversarial review: the user decided this in the 2026-11-04 `/charter` run,
and it went through no `/challenge-me`.

## Decision

1. **The player-account admin role is a temporary stand-in for an operator identity.** Until a
   back-office identity exists, a token whose `role` claim is `admin` is what lets a caller
   through every admin door: the mailbox's admin send, the ledger's read-all, and items'
   catalogue writes. Nothing else changes about how the role is stored or minted (FS-9KW9F
   stands).
2. **The intended model is a separate back-office identity**, not a player account: it owns no
   characters, wallet or stash, cannot send a letter to itself, and every action it takes is
   audited. It does not exist yet, and this ADR does not design it.
3. **When it is built, it replaces the role check at the admin doors, not the cores behind
   them.** The mailbox's store, the letter's `official` sender kind and the sent-by audit
   (FS-1GZGD A7) stay as they are; only what the gateway and the owning service accept as "an
   admin" changes. The same holds for the ledger's read-all and items' catalogue writes.
4. **The mailbox does not reach GKE while the seeded admin keeps its public default password.**
   Before then, `admin@barrowspire.com`'s password must be changed, or the account removed,
   in every environment that migration 000007 seeded. This joins ADR-0046's exit condition
   (the service credential) as a GKE blocker for the mailbox.

## Consequences

- **An admin can also play, and can mail itself items and gold.** Nothing in the mailbox stops
  an admin account from naming its own member id, or sending to every member including itself,
  and then claiming like any player. The only mitigation today is the **sent-by audit** of
  FS-1GZGD A7: every official letter records the admin member id taken from the token, so a
  self-addressed letter is visible in the database afterwards. It is detected, not prevented.
- **The admin doors stay simple and few.** Three places read `RoleAdmin` today. When the
  back-office identity arrives, those are the places to change, and the mailbox core,
  ledger queries and catalogue logic do not move.
- **A leaked admin password is a minting key.** With the mailbox, the default
  `admin@barrowspire.com` credential stops being a catalogue-editing nuisance and becomes a way
  to mint any item and any amount of gold. That is why Decision 4 blocks the GKE rollout on it.
- **Local and development environments keep the seeded admin** with its default password,
  which is how the admin send is tried by hand. Anyone with the repository can log in as it on
  a machine where the migration ran.
- **Mailed gold and items from an admin are not ledger entries** (ADR-0006, ADR-0044). The
  sent-by audit is the only record of who sent them, until the back office brings its own
  per-action audit.
- **A future wish to let an operator also play** is a new decision: Decision 2 says the
  operator identity is not a player account.
