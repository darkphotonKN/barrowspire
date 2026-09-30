---
id: I-8EGFA-2
status: open
implements: FS-8EGFA
blocked_by: []
labels: [ready-for-agent]
title: "FS-8EGFA slice 2: typed wallet balance read"
---
Implements FS-8EGFA §Requirements 17, 19, §API surface

## What to Build

Replace the gin `GET /api/wallet/account` with a typed Huma operation, `get-wallet-account`, at
the same path.

- **Auth:** authenticated, using the `protect` middleware and `Security` the same way the
  marketplace ops do.
- **Response:** `WalletAccount {gold, heldGold, availableGold}`. Every field is always present,
  zeros included.
- **Errors:** carry `respondWithGRPCError`'s mapping over through the FS-22WKC seam:

  | gRPC code | HTTP response |
  |---|---|
  | `Unauthenticated` | `401 · UNAUTHENTICATED` |
  | `NotFound` | `404 · NOT_FOUND` |
  | `Unavailable` | `503 · SERVICE_UNAVAILABLE` |
  | anything else | `500 · INTERNAL_ERROR` |

- **Scope:** remove only the gin GET. The create, deposit and withdraw gin routes stay
  untouched.
- **Contract:** regenerate the contract and the client.

## Acceptance Criteria

- [ ] `GET /api/wallet/account` answers `{gold, heldGold, availableGold}`, and a zero `heldGold` is present as `0`.
- [ ] With no account yet it answers `404 · NOT_FOUND` (problem+json); with no token it answers `401`.
- [ ] `game-server/scripts/seed-dev.sh` runs green against it. The script reads `.gold` and branches on 404.
- [ ] `POST /api/wallet/account`, `/deposit` and `/withdraw` behave exactly as before.
- [ ] Contract gates and the client regen-diff pass. Tests pass.

## Blocked By

None

## Spec Reference

FS-8EGFA §Requirements 17, 19; §API surface (`get-wallet-account`, `WalletAccount`); stories 12, 29.

## TDD Approach

- **RED:** write a typed handler test with a fake wallet client that returns an account with
  zero held gold, and assert that `heldGold: 0` is on the wire. Add one test per error code.
- **GREEN:** register the op, map the proto to `WalletAccount`, and route errors through the
  seam.
