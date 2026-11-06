---
id: I-ZPX58-7
status: done
implements: FS-ZPX58
blocked_by: [I-ZPX58-6]
labels: []
title: "FS-ZPX58 slice 7: renew_token hands game-service the renewed access token for the connection's own member (game-service, game-client)"
---
Implements FS-ZPX58 §G (R27–R32), ADR-0067

**Lane: agent (owner approved option A, "那就用你說的a方案", 2026-11-06).**

## What was built

- game-service: `renew_token` on the connection, in any world. `Server.RenewToken` validates via
  `ValidateToken`, requires the subject to be the connection's member, swaps the token on every
  record under `s.mu`; `token_renewed` or a refusal, never a disconnect; one per second per
  connection; the token never logged.
- game-client: `SocketManager.renewToken` on the open socket only; `forwardRenewedTokens` sends
  it whenever the auth store takes a new access token; a refused `renew_token` is not a session
  problem.

## Acceptance Criteria

- [x] Go: valid → replaced and the next seat uses it; wrong member / refresh / garbage / auth down
      → refused, token kept; rate limit; `-race` with concurrent seating; no token in logs.
- [x] Client: sent after the 401 and proactive renewals, not on a closed socket.

## Spec Reference

FS-ZPX58 §G; ADR-0067.
