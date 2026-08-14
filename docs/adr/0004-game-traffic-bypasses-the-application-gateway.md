# ADR-0004 — Game traffic bypasses the application gateway; game-service owns its client surface

Status: accepted
Date: 2026-08-14
Scope: `game-server/game-service`, `game-server/api-gateway`
Realized by: the absence of a game route in `api-gateway/config/routes.go`, and
`game-service/auth/middleware.go` terminating its own WebSocket auth

## Context

`api-gateway/SPECIFICATION.md` carried an unchecked thin line, **"Route game traffic to
game-service"**, inherited from the template pattern where the gateway fronts every service.
It contradicted how the system was actually built, and nothing recorded the contradiction —
which is why the line survived long enough to be questioned.

What is actually built: the client connects straight to game-service.

```ts
// game-client/src/scenes/BootScene.ts:57
ws://localhost:5668/game/ws?token=${token}&name=${name}
```

The gateway has never routed game traffic. The only trace is a commented-out block, and note
that it was for **HTTP**, not the socket:

```go
// api-gateway/config/routes.go:99
// --- GAME SERVICE ---
// TODO: Add game service routes when implemented
// gameRoutes.GET("/items", gameHandler.GetItemsHandler)
```

So "game traffic" in the thin line silently conflated two unrelated surfaces: request/response
game HTTP, and the 30Hz authoritative socket. Only the first was ever intended to be proxied.

### The distinction the thin line was missing

An **infrastructure gateway** (ingress / load balancer) terminates TLS and routes. An
**application gateway** — which is what `api-gateway` is — is a BFF: it fans HTTP out to
gRPC services over Consul, aggregates, and translates protocol. Routing is a side effect of
that job, not its purpose. A service that already speaks its own protocol directly to clients
gains nothing by being fronted by a second application-layer hop.

### Why the socket in particular must not be proxied

Per-hop latency is the **weakest** form of this argument and should not be used to defend it.
A gRPC hop on loopback is ~0.1–0.5ms, same-datacenter ~0.5–2ms — against the 33ms tick budget
named in `internal/components/metrics/metrics.go:35`, that is noise. The real reasons:

- **Jitter, not mean latency.** A client interpolating at 30Hz absorbs a constant offset
  invisibly and shows p99 variance as rubber-banding. An extra queue adds variance.
- **Broadcast amplification.** Each tick fans one snapshot to N players. Proxying makes the
  gateway relay N messages 30×/sec; if it deserializes to inspect them, that is N×30
  decode/encode cycles per second imposed on the one component every other service depends on.
- **It would make the edge stateful.** api-gateway's value is being a stateless, horizontally
  scalable terminator. Long-lived per-player sockets destroy that property.
- **game-service pods are not interchangeable.** The HUB is a shared world and an escape run is
  an instance pinned to one pod. A gateway doing ordinary L7 round-robin would send players who
  must share a world to different pods, or a party to a pod holding no such instance. Routing
  here is an *allocation* decision owned by matchmaking, not a load-balancing decision.

### Zero trust makes edge authentication unnecessary, not merely optional

game-service does not trust the network; it independently validates every connection against
the token's issuer:

```go
// game-service/auth/middleware.go:64
resp, err := authClient.ValidateToken(c.Request.Context(), &pb.ValidateTokenRequest{Token: token})
```

Notably it does **not** hold `JWT_SECRET`. Signing is HS256 (`auth-service/internal/auth/jwt.go:27`),
so any holder of the secret can mint as well as verify; distributing it to every service in the
name of "local verification" would have weakened exactly the property zero trust is meant to
provide. Delegating to the issuer keeps the secret to auth-service and api-gateway.

### Alternatives considered and rejected

- **Proxy the WebSocket through api-gateway.** Buys a single entry point in exchange for a
  stateful edge, broadcast amplification, and an L7 hop that would mis-route instance-pinned
  connections. The "one entry point" benefit is delivered better by the infra gateway.
- **Route only game HTTP through the gateway, keep the socket direct.** Coherent, and was the
  original intent. Rejected because it splits one service's client surface across two entry
  paths with two auth mechanisms, for a handful of endpoints that do not need aggregation.
- **Give game-service `JWT_SECRET` and verify locally.** Removes the connect-time RPC, at the
  cost of putting a minting key in a service that only needs to verify.

## Decision

**game-service owns its entire client surface. api-gateway holds no route to it — HTTP or
WebSocket.**

1. Clients reach game-service directly. In production, an infrastructure gateway (ingress /
   load balancer) routes to it; no application-layer gateway sits in the path.
2. game-service authenticates its own connections by calling auth-service's `ValidateToken`,
   and does not hold the signing secret.
3. Because game-service pods hold world state, routing to them is **allocation**, not load
   balancing. Matchmaking allocates an instance and hands the client that pod's address.
   Ordinary round-robin across game-service replicas is incorrect and must not be introduced.
4. api-gateway's thin line "Route game traffic to game-service" is removed rather than
   reworded, and its stated purpose as the platform's *single* HTTP entry point is amended:
   it is the single entry point for **request/response platform traffic**, not for the realtime
   game surface.

## Consequences

**Accepted / positive:**

- The realtime path has one fewer process between tick and client, and no component in it that
  could reorder or batch relative to the tick.
- api-gateway stays stateless and therefore trivially replicable.
- The secret stays with its issuer; adding a service that verifies tokens does not widen the
  set of services that can mint them.
- The instance-pinning constraint is now recorded, so a future "just put it behind the gateway
  / behind a Service" change has something explicit to contradict.

**Costs / follow-ups:**

- **game-service is directly exposed and must provide what the edge otherwise would.** One gap
  is already open: `auth/middleware.go:19` sets `CheckOrigin` to accept every origin, so any
  site can open a socket. Combined with a token in the URL this is cross-site WebSocket
  hijacking. This needs fixing independently of this ADR.
- **Connection-rate limiting has no home.** The edge is a natural place for it; direct exposure
  means game-service needs its own.
- **The token rides in the query string** (`?token=…`) and so reaches access and proxy logs.
  The browser WebSocket API cannot set headers, so this is not a mistake, but it should not
  become permanent by default — a short-lived ticket redeemed on connect is the intended
  replacement. Tracked as a follow-up, not settled here.
- **auth-service is a hard dependency of joining a game.** It already was at the edge, so this
  is not a regression, but with N game-service replicas a restart produces a reconnect storm
  that lands on `ValidateToken` all at once.
- **Nothing yet enforces clause 3.** The allocation-not-round-robin rule is a constraint a
  deployment manifest can silently violate; there is no gate for it the way `check-seam.sh`
  gates the error contract.
