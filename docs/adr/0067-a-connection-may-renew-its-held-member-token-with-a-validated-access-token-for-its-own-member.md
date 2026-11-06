# ADR-0067 — A connection may renew its held member token with a validated access token for its own member

Status: accepted
Date: 2026-11-06
Amends: [ADR-0066](0066-an-access-token-is-renewed-from-the-refresh-token-without-rotation-until-a-token-store-exists.md) — clause 7 (game-service checks the token only at the handshake)
Scope: `game-server/game-service` (`renew_token`), `game-client` (game socket)
Realized by: [FS-ZPX58](../specs/ZPX58-access-token-renewal.md) §G (R27–R32)

## Context

Recorded without adversarial review. The owner chose option A of FS-ZPX58 Follow-up 3 on
2026-11-06 ("那就用你說的a方案").

game-service holds the access token a member connected with and forwards it to items-service
whenever it seats them (worn gear, run and field checkout, the pre-delve loadout check). It is
the member's own credential, because items-service checks the caller owns the gear. Access tokens
live 60 minutes (ADR-0066), so 60 minutes into one connection every same-pod world change forwarded
an expired token, and the player's gear could not be read. ADR-0066 clause 7 left game-service
checking a token only at the handshake. That made the held token unrenewable short of a
reconnect.

The long-term fix is a service credential for these reads (I-GV8WN-11). Then the pod holds no
member credential at all. It does not exist yet.

## Decision

1. **A connection may hand game-service a renewed access token (`renew_token`), and the pod holds
   it in place of the one the member connected with.** This amends ADR-0066 clause 7:
   game-service checks a token at the handshake, and again whenever a connection hands over a
   renewed one. A live socket is still never closed for an expired token.
2. **The member is the connection's, never the message's.** The token's subject, as auth-service
   validates it, must equal the member the connection authenticated as at its handshake. A valid
   token for anyone else is refused. The payload carries the token and nothing that names a
   member.
3. **Only an access token renews it.** Validation goes through auth-service `ValidateToken`, which
   accepts `tokenType=access` only (FS-ZPX58 R25).
4. **A refusal changes nothing.** The old token is kept and the connection stays. Renewal is a
   convenience, never a way to end a session.
5. **One renewal per second per connection** reaches auth-service. The client renews about once an
   hour, so anything faster is not the client.
6. **The token is never logged.** The same holds for the handshake token.

## Consequences

- A long session's gear reads stay authorized without a reconnect, in any world on the pod.
- The pod still holds member credentials, now ones that stay fresh. A pod compromise exposes
  live access tokens for its connected members, as it did before for their first hour. The
  service credential (I-GV8WN-11) removes this, and is due before GKE.
- A renewal that never reaches the pod, because the socket was closed or the renewal was refused,
  leaves the old token. The next reconnect carries a fresh one (FS-ZPX58 R20).
- Each accepted renewal costs one `ValidateToken` call to auth-service, at most one per second per
  connection.
