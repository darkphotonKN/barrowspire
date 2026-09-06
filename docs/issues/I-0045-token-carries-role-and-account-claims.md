---
id: I-0045
status: done
implements: FS-0006
blocked_by: []
labels: [ready-for-agent]
title: "FS-0006 slice 1: the access token carries role and account_id"
---
Implements FS-0006 §Requirements 1-10, §Edge States

**Author: agent**

## What to Build

Put both claims on the access token, behind a typed struct, and leave exactly one minter in the
repo.

**`account_id` will be absent for every member when this ships, and that is correct.** Nothing
populates `members.account_id` until I-0048 closes the loop, and no member has ever had a wallet
account anyway (§Req 22). The absent-claim path is not an edge case here — it is the only path,
which makes it the easiest thing in this slice to test properly.

### 1. Typed `Claims` in `common/auth`

`jwt.RegisteredClaims` cannot carry custom fields, and the minter currently builds a
`jwt.MapClaims` literal. Add a `Claims` struct embedding `jwt.RegisteredClaims`, in
**`common/auth`** — next to the validator that must eventually read it, so minter and parser
cannot drift (§Req 8).

`account_id` carries `omitempty` so §Req 4 falls out of the type rather than being re-enforced
by hand at each call site. `role` does not: every member has one (`DEFAULT 'player'`).

> **Do not rewire the parse side.** `common/auth`'s `NewValidator` still parses into
> `jwt.RegisteredClaims` and returns `uuid.Parse(claims.Subject)`. Gateway extraction is
> explicitly out of scope (FS-0006 §Out of Scope). The struct lands; the reader does not change.

### 2. The column

auth-service migration **`000010`** (highest today is `000009_create_outbox`):

```sql
ALTER TABLE members ADD COLUMN account_id UUID NULL UNIQUE;
```

Nullable is the whole fail-closed design. UNIQUE mirrors `wallet.accounts.member_id UNIQUE` so a
buggy consumer cannot write one account id onto two members; Postgres permits many NULLs under
UNIQUE, so it does not constrain the un-populated majority (§Req 9). Write the down migration.

Add the field to `models.Member` as a nullable type — a bare `uuid.UUID` cannot represent
"absent", and collapsing NULL to `uuid.Nil` reintroduces exactly the ambiguity §Req 4 removes.

**Nothing writes this column in this slice** (§Req 10). No RPC, no signup path, no admin surface.

### 3. The minter

`auth-service/internal/auth/jwt.go` → `GenerateJWT(user models.Member, tokenType, expiration)`.

- `role` is read from `members.role` on the `models.Member` already passed in — **no new query,
  no new I/O** (§Req 1). Pass it through **verbatim**: no mapping, no normalising, no defaulting
  (§Req 2). A value outside `{player, admin}` is minted as-is; the minter does not validate.
- `account_id` is emitted only when the column is non-NULL, and **omitted entirely** otherwise —
  not `""`, not `null` (§Req 3, 4).
- **Access token only.** The refresh token's claim map must come out byte-identical to today's
  for the same member (§Req 5).
- `sub`, `exp`, `iat`, `tokenType` unchanged. Access stays 60 min, refresh 7 days — the live call
  sites are `auth-service/internal/member/service.go:199-206`.

### 4. One minter

Delete `game-server/api-gateway/internal/auth/jwt.go` (§Req 7). Its `GenerateJWT` and
`RefreshToken` are dead: `config/routes.go` imports that package only for `AuthMiddleware`.
**Verified safe** — `jwt_middleware.go` references nothing declared in `jwt.go` (no `TokenType`,
no `Access`/`Refresh`), so the package survives the deletion. Keep `jwt_middleware.go` and its
test.

> auth-service's own `RefreshToken()` is also dead but is **NOT** deleted — it is the one
> implementation of a capability on the roadmap (FS-0006 §Out of Scope).

## Acceptance Criteria

- [x] A token minted for `role='player'` decodes with `role` == `"player"`
- [x] A token minted for `role='admin'` decodes with `role` == `"admin"`
- [x] A token minted with `account_id` set decodes with `account_id` equal to that value
- [x] A token minted with `account_id` NULL decodes with **no `account_id` key present** —
      asserted as key absence, not as `== ""`
- [x] The refresh token's claim map is byte-identical to today's for the same member
- [x] `sub`, `exp`, `iat`, `tokenType` unchanged in name, type, and value semantics
- [x] Access expiry still 60 minutes; refresh still 7 days
- [x] `LoginMember` mints with no wallet-service call in the path — asserted by the **absence of
      a wallet client on the minting dependency graph**, not by a mock's call count (§Req 6)
- [x] A `members.role` value outside `{player, admin}` is minted verbatim, not rejected or
      defaulted (§Edge States)
- [x] `game-server/api-gateway/internal/auth/jwt.go` no longer exists
- [x] `grep -rn "func GenerateJWT" game-server/` returns exactly one match
- [x] api-gateway builds and `jwt_middleware_test.go` passes unchanged
- [x] Migration `000010` adds `members.account_id UUID NULL UNIQUE` — **written, not executed.**
      There is no live-DB test harness in auth-service (no testutil suite, no testcontainers),
      so the two NULLs-coexist and duplicate-rejected behaviours rest on Postgres semantics and
      review of the DDL, not on a run. Flagged rather than claimed.
- [x] The down migration drops the column and its constraint — **written, not executed**, same
      reason as above
- [x] `go build ./...` and the full suites pass in auth-service, api-gateway, and common

## Blocked By

None.

## Spec Reference

FS-0006 §Requirements 1-6 (the claims), 7-8 (the minter), 9-10 (the column); §Edge States rows
for a NULL `account_id` at login and a role outside the closed set.

## TDD Approach

- **RED:** mint a token for a member with `role='player'` and `account_id` NULL, parse it, assert
  `role == "player"` **and** that the claim map has no `account_id` key. Fails today — neither
  claim exists.
- **GREEN:** introduce `Claims`, populate it in `GenerateJWT`.
- **REFACTOR:** the `jwt.MapClaims` literal should be gone, not left beside the struct.

## Check, do not assume

- **Assert key absence, not emptiness.** `claims["account_id"] == ""` passes for a key that
  exists with an empty value, which is exactly the bug §Req 4 exists to prevent. Use the
  two-value map read.
- Decode with the same library that mints (`golang-jwt/jwt/v5`), and assert on the parsed claim
  map rather than on the token string.
