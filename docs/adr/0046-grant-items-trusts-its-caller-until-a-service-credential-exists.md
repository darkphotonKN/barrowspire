# ADR-0046 — Accepted risk: items `GrantItems` mints whatever snapshot its caller sends, until a service credential lets it check the caller is notification-service

Status: accepted
Date: 2026-11-04
Scope: `game-server/items-service`, `game-server/notification-service`, `game-server/common/auth`
Realized by: [FS-1GZGD](../specs/1GZGD-in-game-mailbox.md) (R18–R21, A2)
Builds on: [ADR-0044](0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md)
(the claim's step 1 is `GrantItems` with the player's forwarded token),
[ADR-0040](0040-players-settle-on-resolve-one-event-pair-per-player-applied-at-once.md)
(the same class of risk, accepted for `ApplySettlement`; tracked as I-GV8WN-11)

## Context

FS-1GZGD's amendment A2 stores every item enclosure in the letter as an **item snapshot** taken at
send, and items-service's `GrantItems(grant_id, items[{snapshot, quantity}])` mints exactly from
those snapshots, into the stash of the member in the forwarded token. The snapshot travels from
notification-service to items-service in the request. items-service checks that each snapshot is
**representable** (known template, well-formed affixes, item level ≥ 1) and that the stash has
room. On purpose, it applies no drop rule (A1): the Wardens may send any item that can exist.

What items-service cannot check is **that the snapshot came from a real letter**. It has no
mailbox concept (FS-1GZGD R22) and no way to tell notification-service from any other caller. The
only identity on the call is the player's member token, which notification forwards so the grant
lands in that player's stash (ADR-0044 §Decision 4). So `GrantItems` trusts whoever holds a member
token and can reach items-service's gRPC port. Such a caller could mint any representable item,
affixes and all, into their own stash, up to the stash cap per call and again with each new
`grant_id`.

Today nothing outside the cluster can reach it:

- the gateway has no route that calls `GrantItems`; only notification-service's claim does;
- on GKE, items is a ClusterIP Service, reachable only from inside the cluster;
- locally, items-service listens on all interfaces, but only on the developer's machine.

This is the same class of risk as `ApplySettlement` (ADR-0040 §Consequences) and items'
reservation-reconciler methods. In each, a service-to-service call is protected by the network
and not by a credential, because services have no credential of their own yet. The comments on
`publicMethods` in `game-server/common/auth/interceptor.go` list them. `GrantItems` is not in
`publicMethods`, because it does need a member token. But a member token proves only *whose
stash*, never *which service is asking*.

The alternatives were to build the service credential now, before the mailbox's first slice
(I-GV8WN-11 already needs a decision on its mechanism), or to make items-service look the letter
up in notification-service before minting. That would invert the dependency ADR-0044 set, and
items would learn of letters. The user chose to record the risk and build the credential with
I-GV8WN-11.

Recorded without adversarial review: the user approved this in the 2026-11-04 `/charter` run, and
it went through no `/challenge-me`.

## Decision

1. **Accept the risk for development and local runs.** `GrantItems` keeps minting from the
   snapshots its caller sends, with the forwarded member token as its only check. items-service
   does not verify that a snapshot belongs to a letter.
2. **No gateway route may call `GrantItems`**, and items-service stays unexposed outside the
   cluster (ClusterIP on GKE). Either change would make the risk reachable from outside, and needs
   a new decision first.
3. **Exit condition: the mailbox does not ship to GKE until a service credential exists** that
   lets items-service check that a `GrantItems` caller is notification-service. A member token
   alone must then be refused. The credential is the one I-GV8WN-11 builds for `ApplySettlement`,
   or comes with it: one mechanism for all service-to-service calls, not one per method.

## Consequences

- **The mailbox can be built and tested end to end now** without waiting on the credential's
  mechanism.
- **Until the exit condition is met, anything inside the cluster that holds a player's token can
  mint arbitrary representable items into that player's stash.** The stash cap bounds one call,
  not the total: each new `grant_id` mints again.
- **The mailbox's GKE rollout is blocked on I-GV8WN-11** (or a sibling issue that delivers the same
  credential), as `ApplySettlement`'s is. Whoever closes I-GV8WN-11 must cover `GrantItems` too, or
  name the issue that does.
- **The fix is not a whitelist entry.** Moving `GrantItems` into `publicMethods` would make it
  worse. The method needs both checks: the service credential (who is calling) and the forwarded
  member token (whose stash).
- **items-service stays ignorant of letters.** The credential proves the caller and nothing more.
  Trusting the snapshot remains notification-service's responsibility, because it resolved that
  snapshot at send (`ResolveItemSnapshots`).
- **A future second caller of `GrantItems`** (any other service that grants items) inherits the
  same trust and must be named in the credential's allowed callers, not let in by default.
