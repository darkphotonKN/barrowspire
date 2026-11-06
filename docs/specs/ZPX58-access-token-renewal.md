# FS-ZPX58: Access-token renewal

> Status: work-order · SPECIFICATION.md: `game-server/auth-service` § Tokens, `game-server/api-gateway` § Integration patterns, `game-server/game-service` § Transport, `game-client` § Account → this FS · Related ADRs: [ADR-0067](../adr/0067-a-connection-may-renew-its-held-member-token-with-a-validated-access-token-for-its-own-member.md) (renewing the held token over the socket), [ADR-0066](../adr/0066-an-access-token-is-renewed-from-the-refresh-token-without-rotation-until-a-token-store-exists.md) (lifetimes and the renewal rule), [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (absent claims fail closed), [ADR-0001](../adr/0001-contract-layer.md) (generated contract)

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
    - **Refused.** This covers a `401`, `404` or `422` from the route, no stored refresh token, and
      an answer without an access token. A `404` means the route is not there (a client deployed
      before its gateway), which waiting cannot fix. The client signs out and redirects to
      `/login`, as it does today.
    - **Unavailable.** This covers a network failure and any other non-2xx. The client does not
      sign out. The original call's error is thrown. Renewal then cools down: for 5 seconds,
      doubling while it stays unavailable up to 60 seconds, every renewal answers unavailable
      without a call, so an outage costs one renewal call per cooldown, not one per refused call. A
      renewed or refused answer clears the cooldown.
    - **Superseded.** If the stored session changed while the renewal was out (the stored refresh
      token is no longer the one sent), the answer is dropped. A sign-out stays signed out, and
      counts as refused. A newer sign-in keeps its own tokens, and the call is retried with them.
18. While an access token is stored, the client renews it proactively 2 minutes before the `exp`
    claim in its payload. The client decodes `exp` and does not verify it. A token already inside
    that window renews at once. A token whose `exp` cannot be read gets no timer, and R13 covers
    it. Signing out, or storing a new token, clears or reschedules the timer. The client clock may
    be off: the wait is never longer than the token's lifetime (`exp − iat`, both server times),
    and never shorter than 60 seconds after the previous proactive renewal, so a fast clock that
    makes every fresh token look expired renews at most once a minute instead of in a burst. A
    token that arrives within 30 seconds of a proactive renewal is the one it minted: it is
    anchored on its arrival and renews a lifetime later, so a fast clock costs one extra renewal,
    not one a minute.
19. Public reads (`publicApi`) are untouched. They never renew and never sign out (ADR-0053).

### D. game-client: the game socket

20. Every game-socket URL carries the access token that is current when that socket is opened:
    the first connect, a reconnect, a run handoff and a hub handoff. Until now each URL reused the
    token from the first connect, so a run handoff more than an hour after sign-in sent an
    expired token.
21. When the game socket closes with `4001` (auth error), the client renews the session and
    reconnects as the same player, to the same server, keeping `redirected=1` when the refused
    socket was a redirect target (FS-MCYWK C17). The first retry is immediate; each further `4001`
    in a row waits twice as long, from 1 second up to 30 seconds. Meanwhile the player is shown as
    disconnected and retrying, and the session is kept. Only a **refused** renewal signs the player
    out and redirects, as today; an unavailable one (an auth outage) keeps retrying. game-service
    upgrades a socket before it checks the token, so a refused socket opens, says `auth_error` and
    then closes `4001`: an open proves nothing. The run of refusals ends only at the first message
    that is not `auth_error`, or when a handoff socket is promoted. A renewal that resolves after
    `disconnect()` acts on nothing: no reconnect, no handoff, no sign-out.

### E. game-service: what it does with the token

22. game-service authenticates the socket at the handshake (`auth.WSAuthMiddleware` calls
    auth-service `ValidateToken` once). A live socket is never closed when its token expires, so
    renewal needs no transparent reconnect of an open socket. R21 covers only a handshake refused
    with `4001`. After the handshake, a token is checked again only when the connection hands
    over a renewed one (R27-R32).
23. game-service keeps the handshake token on the player record and forwards it to items-service
    when it seats the player in a world: worn-gear reads, run and field gear checkout, and the
    pre-delve `CheckLoadout`. The record takes a new token only when the player reconnects. More
    than 60 minutes into one connection, a world change on the same pod forwards an expired token,
    and items-service refuses it. The player then sees "Your gear could not be fetched", or is
    seated with no gear. Cross-pod handoffs are fixed by R20, because the new pod receives a fresh
    token. Same-pod world changes are fixed by R27-R32 (option A of Follow-up 3, approved by the
    owner 2026-11-06): the client hands each renewed token to the pod over the open socket.

### F. Hardening (review, fix round 1)

24. A run handoff or a hub handoff whose host refuses the token with `4001` renews the session once
    and opens that handoff again with the current token (the hub one flagged `redirected=1`, as
    before). A refused renewal signs the player out. A second `4001` on the handoff is its failure
    as before: `world_handoff_failed` for a run, the travel-unreachable notice for a hub.
25. Only an access token is an access credential. auth-service `ValidateJWT` (behind the
    `ValidateToken` RPC that game-service's handshake calls) and `common/auth` `NewValidator` (every
    service's interceptor) and the gateway's REST bearer middleware refuse a token whose `tokenType`
    is not `access`, including a refresh token and an untyped one. All three accept HS256 only. Every token auth-service mints is typed, so nothing it handed out as
    access is refused.
26. With no `JWT_SECRET`, auth-service mints nothing and accepts nothing, a `NewValidator` built
    with an empty secret refuses every token, and the gateway's bearer middleware refuses every
    token, instead of signing and checking with the empty key. HMAC verification accepts the empty
    key, so without this a gateway started with no secret would accept a self-signed admin token.

### G. game-service: renew the held token over the socket (option A)

27. After every successful renewal (the proactive timer, a `401`, a `4001`), the client sends
    `{ action: "renew_token", payload: { token } }` with the new access token on the game socket,
    if it is open. A socket that was not open yet (still connecting, or a run or hub handoff still
    pending) is handed the current token when it opens or is promoted, if its URL carried an older
    one.
28. game-service validates the token through auth-service `ValidateToken`, which accepts only an
    access token (R25). Its subject must be the member this connection authenticated as at its
    handshake, taken from the connection's record and never from the payload. Anything else is
    refused: another member's token, a refresh token, an expired or garbage one, no token, and
    auth-service being unreachable.
29. An accepted token replaces the held token on every copy of the member's record (the one
    `connectPlayer` stores and `tokenOf` reads), under the server's lock, so a seat reading it at
    the same moment (`seatGearLocked`, `CheckLoadout`, field checkout, run start) gets the old or
    the new token whole. The next seat reads gear with the new one.
30. An accepted renewal answers `{ action: "token_renewed" }`. A refused one answers a refusal on
    `renew_token`, keeps the old token, logs a warning and never disconnects. The client never
    treats that refusal as a session problem.
31. At most one `renew_token` per second per connection is handled; the rest are refused without
    asking auth-service. The message is handled on the connection, wherever the player is: hub,
    field, run, or no world.
32. The token never reaches a log, accepted or refused, as with the handshake token.

## Deploy order

**auth-service, then api-gateway, then game-service, then game-client.**

- The gateway calls a new RPC. An older auth-service answers Unimplemented, which the client reads
  as unavailable and keeps the session.
- The client calls a new route. An older gateway answers `404`, which the client reads as refused
  and signs out, as it does today.
- **game-service before the client:** the client sends `renew_token` (R27) with a live access token
  in its payload. An older game-service logs every incoming payload at Info, so a client that ships
  first would write a live token into the pod logs on every renewal. Only a game-service with R32
  keeps it out.
- R25 changes what every service accepts, the gateway's bearer middleware included. Deploy it with
  auth-service: only tokens typed `access` pass, and every access token auth-service mints is
  typed.

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
- [ ] Client: a `4001` on the game socket renews and reconnects with the R21 backoff (at once, then 1 s doubling to 30 s); only a refused renewal signs out, and a renewal that resolves after `disconnect()` does nothing.
- [ ] Client: a refused handshake (open, `auth_error`, `4001`) retries with a 1 s to 30 s backoff, never in a loop, and signs out only on a refused renewal.
- [ ] Client: a refused run or hub handoff renews once and opens again; a redirect target keeps `redirected=1`.
- [ ] Client: a renewal answer never revives a signed-out session or overwrites a newer one; a `404` renewal is refused; an unavailable one cools down.
- [ ] `ValidateJWT` and `NewValidator` refuse a refresh or untyped token; an empty secret accepts nothing.
- [ ] `renew_token` replaces the held token for the connection's own member only, answers `token_renewed`, refuses everything else without disconnecting, is limited to one per second per connection, never logs the token, and passes `-race` with concurrent seating.
- [ ] Client: every successful renewal sends `renew_token` on the open socket and nothing on a closed one.
- [ ] Full Go suites of auth-service and api-gateway, `go vet`, full vitest and `tsc --noEmit` green.
- [ ] Browser check by Nick (I-ZPX58-5).

## Edge States

- **Expired refresh token** (more than 7 days since sign-in or verification): renewal is refused, and the player signs in again.
- **Access token expired while the tab slept:** browsers may delay the proactive timer. The next call's `401` renews reactively, and the socket's next handshake reads the renewed token.
- **Concurrent:** many `401`s at once share one renewal (R14). A `401` for a token already replaced retries without renewing (R15).
- **Two tabs:** both tabs read the token from the same `localStorage`. Without rotation the refresh token is never invalidated, so either tab can renew and neither signs the other out. (Rotation would make this a race. See ADR-0066.)
- **Retried writes:** an expired token is answered `401` by the gateway's JWT middleware, before any downstream call, so a retried bid, buyout or listing has normally not run the first time. The Idempotency-Key calls resend the same key anyway. A downstream service could still answer `401` after a side effect, right at the `exp` boundary; that is not traced for every route (Follow-up 6).
- **Auth down:** renewal answers `503`, and the client keeps the session (R17 Unavailable). The `401` that triggered it is thrown to the caller.
- **Member deleted:** renewal is refused, and the player signs out.
- **Role demoted:** the next renewal mints `player`. The old access token keeps its role until it expires, at most 60 minutes.
- **Malformed stored token:** `exp` cannot be decoded, so no timer is set. The first `401` renews reactively.
- **Socket refused while auth-service is down:** game-service closes with `4001` when `ValidateToken` fails, not only for a bad token. Renewal cannot succeed either: the gateway forwards it to the same auth-service, so it answers `503` (unavailable). The client keeps the session, shows the player as reconnecting and retries with the R21 backoff until auth-service is back. Nobody is signed out by the outage.
- **REST during an auth outage:** the first `401` asks for renewal once, then the cooldown (R17) answers unavailable without a call. The session is kept.
- **Sign-out during an in-flight renewal:** the renewal's answer is dropped (R17 Superseded), so it cannot sign the player back in.
- **Client clock far off:** a fast clock renews at most once a minute; a slow one never schedules past the token's lifetime (R18).
- **Same-pod world change more than an hour into one connection:** the pod holds the token the last renewal handed it (R27-R32), so the gear read is authorized. If renew_token was refused or never arrived (the socket was closed at the time), the pod still holds the handshake token, and the next reconnect hands it a fresh one.

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
3. **The stale forwarded token in game-service (R23).** Same-pod world changes forwarded the
   handshake token, and it expired 60 minutes into a connection. Options were:
   - **A.** a socket message that hands game-service the renewed access token, which it validates
     and swaps onto the player record. **Done: R27-R32, approved by the owner 2026-11-06.**
   - B. the client reconnecting after each renewal. Not taken.
   - **C.** game-service reading gear with a service credential instead of the member's token
     (I-GV8WN-11). **Still the long-term fix, and due before GKE**: it ends the pod holding member
     credentials at all.
4. ~~**`ValidateToken` accepts a refresh token.**~~ Closed by R25 in fix round 1.
5. **Tabs keep separate renewal timers (review L3).** Each tab's timer follows its own in-memory
   store. N open tabs make N renewals an hour, and a renewal in one tab does not reschedule the
   others. This is harmless without rotation. Once rotation lands (follow-up 1), the tabs would
   race to redeem the same refresh token. **Before rotation is added, coordinate the tabs** with
   one renewal leader, through a `BroadcastChannel` or a storage-event lock. A related, older
   problem: a write in one tab's memory (for example `updateMemberInfo`) can persist an older
   access token over a newer one. R15 heals it on the next call: the 401 retries with the stored
   token, and the timer renews.
6. **Retried writes at the expiry boundary (review L6).** The claim that "a 401 is answered at the
   edge before any downstream call" was not traced for every route. A downstream service that
   checks the forwarded member token could answer Unauthenticated (401) after an upstream side
   effect, right at the `exp` boundary. The client would then retry a non-idempotent write once
   (R13). Proactive renewal (R18) makes this rare. **Before relying on it, audit the authenticated
   write routes.** Either confirm that every 401 happens before any side effect, or restrict the
   automatic retry to idempotent requests and requests that carry an `Idempotency-Key`.
