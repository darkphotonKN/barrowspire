# SPECIFICATION — barrowspire (monorepo service map)

> **Monorepo root spec = service map ONLY.** This file lists the members and points to where
> each one's real spec lives. **Capability lines never live here** — they live in each member's
> own `SPECIFICATION.md`. A cross-service feature gets ONE `FS-NNNN` in [`docs/specs/`](docs/specs/)
> plus a thin line in each affected member's spec.

Shape: **monorepo**. Backend services under `game-server/`; the frontend `game-client/` is a
member. Shared code (`game-server/common`, `game-server/observability`, `game-server/tools`) has
**no spec** — behavior changes there belong to the `FS-NNNN` of the driving feature.

## Members

| Member               | Path                               | Surface                                 | Spec                                                                                             | Context                                                |
| -------------------- | ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| api-gateway          | `game-server/api-gateway`          | HTTP `:7114` (edge/BFF)                 | [SPEC](game-server/api-gateway/SPECIFICATION.md)                                                 | [CONTEXT](game-server/api-gateway/CONTEXT.md)          |
| auth-service         | `game-server/auth-service`         | gRPC `:7116` (+AMQP)                    | [SPEC](game-server/auth-service/SPECIFICATION.md)                                                | [CONTEXT](game-server/auth-service/CONTEXT.md)         |
| game-service         | `game-server/game-service`         | WebSocket `:5668`                       | [SPEC](game-server/game-service/SPECIFICATION.md) · [CLAUDE](game-server/game-service/CLAUDE.md) | [CONTEXT](game-server/game-service/CONTEXT.md)         |
| wallet-service       | `game-server/wallet-service`       | gRPC                                    | [SPEC](game-server/wallet-service/SPECIFICATION.md)                                              | [CONTEXT](game-server/wallet-service/CONTEXT.md)       |
| marketplace-service  | `game-server/marketplace-service`  | gRPC                                    | [SPEC](game-server/marketplace-service/SPECIFICATION.md)                                         | [CONTEXT](game-server/marketplace-service/CONTEXT.md)  |
| ledger-service       | `game-server/ledger-service`       | gRPC `:7129` (scaffold)                 | [SPEC](game-server/ledger-service/SPECIFICATION.md) 🧱                                           | [CONTEXT](game-server/ledger-service/CONTEXT.md)       |
| items-service        | `game-server/items-service`        | gRPC (Consul `items`)                   | [SPEC](game-server/items-service/SPECIFICATION.md) ⏳                                            | [CONTEXT](game-server/items-service/CONTEXT.md)        |
| payment-service      | `game-server/payment-service`      | gRPC (Consul `payments`, Stripe)        | [SPEC](game-server/payment-service/SPECIFICATION.md) ⏳                                          | [CONTEXT](game-server/payment-service/CONTEXT.md)      |
| stats-service        | `game-server/stats-service`        | gRPC (Consul `stats`)                   | [SPEC](game-server/stats-service/SPECIFICATION.md) ⏳                                            | [CONTEXT](game-server/stats-service/CONTEXT.md)        |
| notification-service | `game-server/notification-service` | gRPC (Consul `notification`)            | [SPEC](game-server/notification-service/SPECIFICATION.md) ⏳                                     | [CONTEXT](game-server/notification-service/CONTEXT.md) |
| example-service      | `game-server/example-service`      | gRPC (reference scaffold)               | [SPEC](game-server/example-service/SPECIFICATION.md) ⏳                                          | [CONTEXT](game-server/example-service/CONTEXT.md)      |
| game-client          | `game-client`                      | Next.js FE (hand-rolled REST/WS client) | [SPEC](game-client/SPECIFICATION.md) · [CLAUDE](game-client/CLAUDE.md)                           | [CONTEXT](game-client/CONTEXT.md)                      |

⏳ = spec is a skeleton (structure only); run `/spec-bootstrap <member>` to fill capability lines
from the existing code. 🧱 = service is scaffolding only (wiring, no domain); run `/scope-it`
before there is anything to bootstrap.

Shared (no spec): `game-server/common`, `game-server/observability`, `game-server/tools`.
