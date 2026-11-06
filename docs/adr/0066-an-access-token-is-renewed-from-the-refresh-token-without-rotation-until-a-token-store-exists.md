# ADR-0066 — An access token is renewed from the refresh token, without rotation, until a token store exists

Status: accepted
Date: 2026-11-06
Amended by: [ADR-0067](0067-a-connection-may-renew-its-held-member-token-with-a-validated-access-token-for-its-own-member.md) — clause 7 (game-service also checks a renewed token handed over the socket)
Scope: `game-server/auth-service` (minting, `RefreshAccessToken`), `game-server/api-gateway`
(`POST /api/member/refresh`), `game-client` (authenticated client, game socket)
Realized by: [FS-ZPX58](../specs/ZPX58-access-token-renewal.md)
Builds on: [ADR-0014](0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (claims
read at mint time, absent fails closed), [FS-9KW9F](../specs/9KW9F-account-and-role-token-claims.md)
(the refresh token carries no authorization claims)

## Context

Recorded without adversarial review. The owner approved automatic renewal on 2026-11-06 ("做自動續期"),
and decided the same day that v1 neither rotates nor revokes ("第一版就先不做，記成之後的工作").

auth-service mints two JWTs at sign-in and at email verification. The access token lives 60
minutes and carries the authorization claims. The refresh token lives 7 days and carries none.
Until now the refresh token could not be redeemed anywhere. So a session lasted exactly one
access-token lifetime, and the client signed the player out on the first `401` after it. An unused
`RefreshToken` helper minted a 15-minute access token, a third lifetime that nobody had chosen.

Tokens are stateless. auth-service keeps no record of issued tokens, so it cannot invalidate one
before its `exp`. The client is a browser, a public client in OAuth terms, with both tokens in
`localStorage`.

Current guidance for refresh tokens held by public clients:

- **RFC 9700 §2.2.2 and §4.14.2** (OAuth 2.0 Security BCP). Refresh tokens for public clients
  "MUST be sender-constrained or use refresh token rotation". Refresh tokens "SHOULD expire if the
  client has been inactive". The server MAY revoke them on a security event, such as a password
  change or logout.
- **RFC 6749 §6 and §10.4.** The server MAY issue a new refresh token on refresh and MAY revoke the
  old one. The client MUST then discard the old one.

Rotation means invalidating the old token, and that needs storage: a token family per sign-in,
with reuse detection. The same storage is what revocation, "log out everywhere" and invalidating a
stolen token would need.

## Decision

1. **Two lifetimes, defined once.** An access token lives 60 minutes and a refresh token 7 days.
   Sign-in, verification and renewal mint from the same two constants. No other lifetime exists.
   The 15-minute path is deleted.
2. **Renewal mints only an access token, from the member row as it reads now.** It never copies
   claims out of the presented token. A role, account id or verification change made since
   sign-in takes effect at the next renewal, within at most one access-token lifetime.
3. **Renewal never mints a refresh token,** so it cannot extend a session. A session ends at the
   latest 7 days after the last sign-in or verification, however active the player is.
4. **No rotation and no revocation in v1.** The presented refresh token stays valid until its own
   `exp`. This knowingly falls short of RFC 9700's MUST for public clients, and is the gap
   follow-up 1 closes.
5. **Every refusal is one `401 · UNAUTHENTICATED`.** That covers expired, forged, wrong type,
   malformed, and an unknown member. A failed lookup that is not not-found is an error, not a
   refusal.
6. **The client renews before expiry and on a `401`, single-flight, and retries the refused call
   once.** Only a refused renewal signs the player out. An unavailable one does not.
7. **The game socket reads the current token whenever it opens a connection.** game-service still
   checks the token only at the handshake.

## Consequences

- A player stays signed in through continuous play for up to 7 days, instead of 60 minutes.
- **A stolen refresh token keeps working for up to 7 days, and nothing can revoke it.** That holds
  across a password change and across sign-out, because sign-out only clears the browser. Before
  this decision a stolen refresh token was useless, since no route redeemed it. Now it is worth 7
  days of access tokens. The same XSS that would steal it can already steal the access token,
  which this decision does not change (token storage is out of scope).
- Without rotation, two tabs sharing `localStorage` can renew independently with no race. Rotation
  will have to solve that.
- A demoted admin keeps admin rights until their current access token expires, at most 60
  minutes, and not for up to 7 days.
- game-service keeps the handshake token on the player record for gear reads. That token goes
  stale 60 minutes into a connection, and renewal does not reach it (FS-ZPX58 R23).

### Follow-ups (recorded, not decided)

1. **Rotation, with server-side storage of refresh tokens:** a new refresh token on every renewal,
   the old one invalidated, and reuse of an invalidated token revoking its family. The same store
   gives revocation of a single token, "log out everywhere", revocation on password change, and
   RFC 9700's inactivity expiry. It needs an auth-service migration and client-side multi-tab
   coordination. It supersedes clause 4 of this decision, and probably clause 3.
2. **Kicking a live WebSocket when an account is banned or its token is revoked.** Today the socket
   checks the token only at connect, so a banned or revoked member keeps an open socket until it
   drops. This depends on follow-up 1.
3. **Renewing game-service's forwarded member token** (FS-ZPX58 R23 and its Follow-ups).
