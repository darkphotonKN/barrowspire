---
id: I-9JV5K-3
status: open
implements: FS-9JV5K
blocked_by: [I-9JV5K-1, I-9JV5K-2, I-5FZ4J-7]
labels: [ready-for-agent]
title: "FS-9JV5K slice 3: the merchant on a floor, his wares, buying through an off-tick wallet debit, and the tome for sale"
---
Implements FS-9JV5K §A R1–R4, §B R5–R12, §E R18–R20

**Hotspot:** game-service `session.go`, `factory.go`, the serializer, `gameserver/hub.go` routing,
`config/routes.go` and `cmd/server/main.go` (a `WALLET_ADDR` client, default `localhost:7128`,
ADR-0022). One writer at a time. Never the matchmaker. Never start services.

## What to Build

- A wallet gRPC client in `game-server/game-service/grpc/wallet` and a narrow consumer-owned
  interface in `internal/game` for the debit (the notification-service mailbox wallet is the
  reference: forward the token, 5 s per call, map transient codes).
- The session keeps each seated delver's latest token (from seating; replaced on reconnect).
- Merchant spawn in a respite room (FS-5FZ4J's respite-room rule), not a combatant (excluded from
  quarries, hits, projectiles, plates and traps), wares per R3, `merchant` on the wire.
- `buy {merchant_id, ware}`: R6 refusals at once; reserve + purchase key + off-tick debit with
  retries (same key, ≤10 s); the result applied through `queueIntent`; grant as an unsafe find, a
  full bag drops at the feet; a gone buyer is logged at warn with the key; floor change per R12.
- The tome offer (R18–R20) through the tome plan (`tome.go`).
- Add `WALLET_ADDR` wherever the deploy manifests give game-service its other addresses
  (`deploy/` if present), so Kranti's stack wires it.

## Acceptance Criteria

- [ ] Every FS-9JV5K game-service acceptance criterion for §A, §B, §E (see the FS), with a fake debit that records keys and tokens and can be slow, fail transiently or refuse.
- [ ] The tick never blocks on the fake wallet (a test with a blocking fake still steps).
- [ ] `make test` and `make check` green.

## Blocked By

I-9JV5K-1 (the RPC), I-9JV5K-2 (the antidote template), I-5FZ4J-7 (respite rooms).

## Spec Reference

FS-9JV5K §A, §B, §E.

## TDD Approach

- RED: a buy for a ware with stock reserves it (left drops by one) and calls the fake debit with `purchase:<run>:<member>:1`.
- GREEN: the buy branch and the off-tick runner.
