# FS-ZPX58: Access-token renewal

> Status: work-order · SPECIFICATION.md: `game-server/auth-service` § Tokens, `game-server/api-gateway` § Integration patterns, `game-client` § Account → this FS · Related ADRs: [ADR-0066](../adr/0066-an-access-token-is-renewed-from-the-refresh-token-without-rotation-until-a-token-store-exists.md) (lifetimes and the renewal rule), [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (absent claims fail closed), [ADR-0001](../adr/0001-contract-layer.md) (generated contract)

## Summary

A signed-in player is no longer thrown to the login page an hour after signing in. The client
renews its access token from the refresh token it already holds: shortly before the token runs out,
and again whenever a call is refused for an expired token. The call that was refused is sent again
once with the new token. The player signs in again only when renewal itself is refused, at the
latest 7 days after the last sign-in.

## Background (why this exists)

auth-service mints a 60-minute access token and a 7-day refresh token at sign-in and at email
verification. The client stored the refresh token and never used it, and the gateway had no route
that accepted one. Any `401` from the authenticated client signed the player out and sent them to
`/login`. So the first REST call made more than an hour after sign-in ended the session. Since
FS-7TGZ3 every gear-overlay open reads the wallet, which made the kick frequent during play.

A `RefreshToken` helper in auth-service minted a 15-minute access token from a refresh token. Nothing
called it, and its lifetime disagreed with sign-in's 60 minutes. This FS removes it.

## Requirements

### A. auth-service: renew an access token

1. `RefreshAccessToken` takes a refresh token. It answers a new access token, the access token's
   lifetime in seconds, and the member.
2. auth-service accepts the refresh token only when it meets all of these. The token is an HS256
   token signed with the platform secret. It has not expired. Its `tokenType` is `refresh`. Its
   `sub` is a UUID that names an existing member. An access token presented as a refresh token is
   refused.
3. Every refusal in R2 answers the same `Unauthenticated` (`commonconstants.ErrUnauthorized`), so
   the caller cannot tell an expired token from a forged one or from an unknown member. The cause
   is logged at info, without the token.
4. auth-service mints the new access token from the member row as it reads at renewal time. Role,
   account id and email-verified come from that row and never from the presented token. A refresh
   token carries no authorization claims (auth-service `CONTEXT.md`, Refresh token). So a role
   change, a newly populated account id, or a verification made since sign-in takes effect at the
   next renewal.
5. Lifetimes are the ones sign-in uses (ADR-0066). The access token lives 60 minutes and the refresh
   token 7 days. Sign-in, verification and renewal mint from the same two constants. Renewal never
   mints a refresh token, so it does not extend the 7 days. The 15-minute `RefreshToken` helper is
   removed.
6. No rotation in v1 (ADR-0066). The answer carries no refresh token, and the presented one stays
   valid until its own expiry.
7. A failed member lookup that is not not-found is an error, not a refusal. It reaches the edge as
   `503`/`500`, so a database blip never signs a player out.

### B. api-gateway: the renewal route

8. `POST /api/member/refresh` is public. It takes no bearer, because the access token it replaces
   is typically expired. The refresh token travels in the body, never in the URL, so the request
   log, which records paths, never sees it.
9. The body is `{ refresh_token }`, required and non-empty, checked at the edge as shape (`422`).
   Every other rule belongs to auth-service (`docs/specs/README.md` §422 vs 400).
10. Success is `200` with a bare `RefreshResult` (no `statusCode`/`message` envelope, like the
    FS-V6SFK routes): `access_token`, `access_expires_in`, `member_info`.
11. Any R2 refusal answers `401 · UNAUTHENTICATED` as a problem document (FS-22WKC). auth-service
    being unreachable answers `503 · SERVICE_UNAVAILABLE`.
12. The route is declared as a typed operation, and `openapi.yaml` and the client schema are
    regenerated from it, never hand-edited (`docs/contract-guide.md`).

### C. game-client: renewal over REST

13. When an authenticated call answers `401`, the client renews the session and sends the same
    call once more with the new token. If the retry is again `401`, the player is signed out as
    today.
14. Renewal is single-flight: parallel `401`s and the proactive timer (R18) share one in-flight
    renewal call.
15. A call refused with a token that has already been replaced does not renew again. It retries
    with the current token. This covers a call sent just before another call's renewal landed.
16. The renewal call goes through the unauthenticated client. It carries no bearer and has no
    `401` handling of its own, so it cannot loop.
17. The outcome of renewal decides what happens next:
    - **Renewed.** The new access token and member are stored. The stored refresh token is kept.
    - **Refused.** This covers a `401` or `422` from the route, no stored refresh token, and an
      answer without an access token. The client signs out and redirects to `/login`, as it does
      today.
    - **Unavailable.** This covers a network failure and any other non-2xx. The client does not
      sign out. The original call's error is thrown, and the next `401` tries again.
18. While an access token is stored, the client renews it proactively 2 minutes before the `exp`
    claim in its payload. The client decodes `exp` and does not verify it. A token already inside
    that window renews at once. A token whose `exp` cannot be read gets no timer, and R13 covers
    it. Signing out, or storing a new token, clears or reschedules the timer.
19. Public reads (`publicApi`) are untouched. They never renew and never sign out (ADR-0053).

### D. game-client: the game socket

20. Every game-socket URL carries the access token that is current when that socket is opened:
    the first connect, a reconnect, a run handoff and a hub handoff. Until now each URL reused the
    token from the first connect, so a run handoff more than an hour after sign-in sent an
    expired token.
21. When the game socket closes with `4001` (auth error), the client renews the session once and
    reconnects with the new token. If renewal does not renew (refused or unavailable: the socket
    has nothing valid to reconnect with), or the reconnect closes with `4001` again before it
    opens, the client signs out and redirects as it does today. A socket that opens resets the
    one-retry allowance.

### E. game-service (no change; recorded finding)

22. game-service authenticates the socket only at the handshake (`auth.WSAuthMiddleware` calls
    auth-service `ValidateToken` once). A live socket is never closed when its token expires. So
    renewal needs no transparent reconnect of an open socket. R21 covers only a handshake refused
    with `4001`.
23. game-service keeps the handshake token on the player record and forwards it to items-service
    when it seats the player in a world: worn-gear reads, run and field gear checkout, and the
    pre-delve `CheckLoadout`. The record takes a new token only when the player reconnects. More
    than 60 minutes into one connection, a world change on the same pod forwards an expired token,
    and items-service refuses it. The player then sees "Your gear could not be fetched", or is
    seated with no gear. Cross-pod handoffs are fixed by R20, because the new pod receives a fresh
    token. Same-pod world changes are not fixed here; see Follow-ups.

## User Stories

1. As a player, I want to keep playing past the first hour without being sent to the login page, so that a long session is not cut short.
2. As a player, I want opening my gear overlay after an hour to show my gold, not the login page, so that routine actions stay routine.
3. As a player, I want a call that failed because my token had just expired to quietly succeed on the retry, so that I never see an error that was only about time.
4. As a player, I want to be asked to sign in again once my session is genuinely over, so that an old browser is not signed in forever.
5. As a player who returns to an open tab after a long break, I want the page to renew itself on my next action, so that I do not have to sign in again within the week.
6. As a player entering a delve more than an hour after signing in, I want the handoff to the run's host to succeed, so that the run starts instead of failing.
7. As a player whose game socket is refused because my token expired, I want the client to renew and reconnect on its own, so that I land back in the world rather than on the login page.
8. As a player who verified my email in another tab, I want the next renewal to carry my verified status, so that verified-only actions open up without signing in again.
9. As a player with several calls in flight when my token expires, I want one renewal, not one per call, so that the client does not hammer the server or race itself.
10. As a player on a flaky connection, I want a failed renewal attempt not to sign me out, so that a dropped packet does not end my session.
11. As a player with two tabs open, I want both to keep working after either one renews, so that tabs do not sign each other out.
12. As a player whose refresh token has expired or was tampered with, I want to be sent to the login page cleanly, so that I am not stuck with a page that fails every call.
13. As an operator, I want the renewal route to reveal nothing about why a token was refused, so that it is not an oracle for forging tokens or probing member ids.
14. As an operator, I want renewal to read the member's current role, so that a demoted admin loses admin rights within one access-token lifetime.
15. As an operator, I want an auth database blip during renewal to answer 503 rather than 401, so that a transient fault does not sign out every active player.
16. As a developer, I want one place that defines the token lifetimes, so that sign-in, verification and renewal cannot disagree again.
17. As a developer, I want the renewal route in the generated contract, so that the client's call to it is type-checked like every other.
18. As a developer, I want the renewal call to bypass the authenticated client's 401 handling, so that a refused renewal cannot recurse.
19. As a developer, I want the socket to read the current token when it opens, so that no code path holds a stale copy.
20. As a developer, I want the limits of v1 (no rotation, no revocation, socket checked only at connect, the stale forwarded token) written down, so that the next person does not assume they are solved.

## Acceptance Criteria

- [ ] auth-service `RefreshAccessToken` answers a 60-minute access token minted from the member row, with that member, for a valid refresh token.
- [ ] An expired, wrongly signed, malformed, access-typed, non-UUID-subject or unknown-member refresh token is refused with the same `Unauthenticated`.
- [ ] A member-lookup failure other than not-found is not `Unauthenticated`.
- [ ] Sign-in, verification and renewal mint the access token with one lifetime constant. The 15-minute `RefreshToken` helper is gone.
- [ ] `POST /api/member/refresh` answers `200` with a bare `RefreshResult`, `401 · UNAUTHENTICATED` on refusal, `422 · VALIDATION_FAILED` on a missing or empty `refresh_token`, `503 · SERVICE_UNAVAILABLE` when auth is down. It declares no security requirement.
- [ ] `openapi.yaml` and `game-client/src/api/generated/schema.d.ts` regenerated and committed with the handler. `openapi-diff` clean, and `openapi-breaking` reports no breaking change.
- [ ] Client: a `401` on an authenticated call renews once and retries once. A second `401` signs out.
- [ ] Client: parallel `401`s cause one renewal call.
- [ ] Client: a refused renewal signs out and redirects, and an unavailable renewal does not.
- [ ] Client: the renewal call carries no `Authorization` header.
- [ ] Client: a token is renewed 2 minutes before its `exp`, or at once when already inside the window.
- [ ] Client: every socket URL carries the token current when the socket opens.
- [ ] Client: a `4001` on the game socket renews and reconnects once, and a second `4001` signs out.
- [ ] Full Go suites of auth-service and api-gateway, `go vet`, full vitest and `tsc --noEmit` green.
- [ ] Browser check by Nick (I-ZPX58-5).

## Edge States

- **Expired refresh token** (more than 7 days since sign-in or verification): renewal is refused, and the player signs in again.
- **Access token expired while the tab slept:** browsers may delay the proactive timer. The next call's `401` renews reactively, and the socket's next handshake reads the renewed token.
- **Concurrent:** many `401`s at once share one renewal (R14). A `401` for a token already replaced retries without renewing (R15).
- **Two tabs:** both tabs read the token from the same `localStorage`. Without rotation the refresh token is never invalidated, so either tab can renew and neither signs the other out. (Rotation would make this a race. See ADR-0066.)
- **Retried writes:** the gateway answers a `401` at the edge, in its JWT middleware, before any downstream call. So a retried bid, buyout or listing has not run the first time. The Idempotency-Key calls resend the same key anyway.
- **Auth down:** renewal answers `503`, and the client keeps the session (R17 Unavailable). The `401` that triggered it is thrown to the caller.
- **Member deleted:** renewal is refused, and the player signs out.
- **Role demoted:** the next renewal mints `player`. The old access token keeps its role until it expires, at most 60 minutes.
- **Malformed stored token:** `exp` cannot be decoded, so no timer is set. The first `401` renews reactively.
- **Socket refused while auth-service is down:** game-service closes with `4001` for a validation error too. The client renews, which succeeds via the gateway if the gateway is up, and reconnects. A second `4001` signs the player out, as today.
- **Same-pod world change more than an hour into one connection:** the gear read uses the stale handshake token (R23). This is unresolved in v1.

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| refresh-access-token | `POST /api/member/refresh` (public, no bearer) | — | `refresh_token` string, required, non-empty | `200` bare `RefreshResult`: `access_token` string, `access_expires_in` int32 (seconds), `member_info` `Member` (same schema as sign-in) | `401 · UNAUTHENTICATED` (expired / invalid / wrong-type / unknown member: one code), `422 · VALIDATION_FAILED` (missing or empty `refresh_token`, unknown body member), `503 · SERVICE_UNAVAILABLE`, `500 · INTERNAL_ERROR` |

gRPC (auth-service): `AuthService.RefreshAccessToken(RefreshAccessTokenRequest{refresh_token}) → RefreshAccessTokenResponse{access_token, access_expires_in, member_info}`.

## Out of Scope

- How the client stores tokens (`localStorage`), XSS hardening, and moving tokens to HttpOnly cookies.
- Site-wide email verification changes.
- Rate limiting the renewal route. The platform has no rate limiting yet (abuse audit, 2026-11-05).
- A renewal-specific error code. The route answers the platform's one `UNAUTHENTICATED`, and the client tells renewal apart by route.

## Follow-ups (decided by the owner, 2026-11-06: "第一版就先不做，記成之後的工作")

1. **Rotation, with server-side storage of refresh tokens.** Each renewal would issue a new refresh
   token and invalidate the old one, with reuse detection. A stored token family also gives
   revocation of a single token, "log out everywhere", and invalidation of a token known to be
   stolen. **Today a stolen refresh token keeps working for up to 7 days, and nothing can revoke
   it.** Changing the password does not revoke it either. Current practice treats this as the
   expected state for a browser client:
   - RFC 9700 §2.2.2 and §4.14.2: refresh tokens for public clients "MUST be sender-constrained
     or use refresh token rotation". This v1 does neither, and knowingly falls short of that MUST.
   - RFC 9700 §4.14.2 also says refresh tokens "SHOULD expire if the client has been inactive",
     and that the server MAY revoke them on a security event such as a password change or logout.
   - RFC 6749 §6 and §10.4 allow rotation, MAY revoke the old token, and require the client to
     discard the old one.

   The work needs a refresh-token table in auth-service (a new migration), the client storing the
   rotated token, and multi-tab coordination.
2. **Kicking a live WebSocket when an account is banned or its token is revoked.** game-service
   checks the token only at the handshake (R22). A banned or revoked member keeps an open socket
   until it disconnects. This depends on revocation (follow-up 1) existing at all.
3. **The stale forwarded token in game-service (R23).** Same-pod world changes forward the
   handshake token, and it expires 60 minutes into a connection. Options:
   - a socket message that hands game-service the renewed access token, which it validates and
     swaps onto the player record;
   - the client reconnecting after each renewal;
   - game-service reading gear with a service credential instead of the member's token (I-GV8WN-11).

   game-service is the hand-coded lane, so this is Nick's call.
4. **`ValidateToken` accepts a refresh token.** game-service's handshake uses it, so a refresh token
   can open a game socket. This is the existing unchecked auth-service line "Reject a refresh token
   presented as an access credential", and it is not changed here.
