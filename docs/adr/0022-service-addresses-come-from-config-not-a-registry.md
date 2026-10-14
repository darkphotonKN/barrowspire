# ADR-0022 — Service addresses come from configuration, not a service registry

Status: accepted
Date: 2026-10-14
Scope: `game-server/common/discovery`, every service's `cmd/` wiring, every gRPC client, `game-server/docker-compose.yml`

## Context

Recorded without adversarial review.

Every service registered itself in Consul under the literal address `localhost:<port>`, kept
itself alive with a 1s TTL heartbeat, and listened on `localhost:<port>` only. Clients asked
Consul for a list of instances, picked one at random, and stayed pinned to it.

That works only while every process shares one network namespace. The deployment target is
Kubernetes (KinD locally, GKE in production), and there it fails twice: a pod dialing the
registered `localhost:<port>` reaches itself, and a server bound to loopback refuses traffic
arriving on the pod's interface.

Kubernetes already provides what Consul was providing. A Service gives each backend a stable DNS
name, and readiness probes take unhealthy pods out of rotation. Keeping Consul would mean two
sources of truth for the same fact, plus a cluster component to run.

## Decision

**Each client gets its downstream's address from an env var, `<SERVICE>_ADDR` (`host:port`),
and dials it through gRPC's `dns` resolver.** The defaults are `localhost:<that service's gRPC
port>`, so native development (air) runs unchanged. Compose and Kubernetes set `<service>:<port>`.
Each client dials once at construction (lazily, so nothing connects until the first RPC) and
closes on shutdown.

**Servers listen on every interface (`:<port>`), not loopback.**

Consul, the `Registry` abstraction, registration, the TTL heartbeat and deregistration are
removed. `grpc.WithDisableServiceConfig()` stays on the dial: the `dns` resolver otherwise looks
up a `_grpc_config` TXT record, which stalled every new connection for ~20s on upstream DNS that
drops the query.

Rejected: **keeping Consul in-cluster.** It duplicates Kubernetes Services and probes, and the
registration code would still need pod IPs threaded through it.

## Consequences

- **One binary, three environments.** Native, compose and Kubernetes differ only in env vars.
- **A downstream that is down is still a runtime failure, never a boot failure.** The RPC fails
  with `codes.Unavailable`, which the gateway's error seam already answers as 503 and marketplace
  already classifies as `ErrTransient`.
- **Re-resolution improves.** The `dns` resolver re-resolves when a connection breaks, whereas a
  Consul-picked instance stayed pinned until the connection shut down.
- **Several clients stop dialing per RPC.** Clients in game-service, items-service, payment and
  marketplace opened and closed a connection on every call; all now reuse one.
- **Cost: no health signal yet.** Nothing replaces the TTL heartbeat until services expose
  `grpc_health_v1` for Kubernetes readiness and liveness probes. That is follow-up work.
- **Cost: per-connection balancing.** A ClusterIP Service balances connections, not requests, and
  gRPC holds one long-lived connection, so a client pins to one pod. That is irrelevant at one
  replica. Scaling a backend past one needs a headless Service plus gRPC `round_robin`.
- **Cost: the address map is configuration to keep in sync.** Each `<SERVICE>_ADDR` must name
  the right port. The variables and their defaults are declared at the top of each consumer's
  `main.go`, and the Kubernetes ConfigMap must mirror them.
