---
id: I-CH21F-1
status: done
implements: FS-CH21F
blocked_by: []
labels: [ready-for-agent]
title: "FS-CH21F slice 1: party members' resource in each recipient's broadcast, from a membership snapshot (game-service)"
---
Implements FS-CH21F §Requirements R1–R7

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.

## What to Build

- **Membership snapshot.** The party registry publishes an immutable player → party map (every
  member of every cached party, remote members included: the cache's `memberOf`) after every cache
  change (put, drop, re-read, arrival read, letter). Copy-on-write behind an atomic pointer; a
  published map is never mutated. Empty until the first change.
- **Handed to every serializer.** One snapshot holder built at wiring and passed to the hub's,
  every run's and every field's `StateSerializer` through a narrow interface the serializer
  package defines. A broadcast reads the snapshot once for all its recipients.
- **Serializer.** In `FormatStateToClientState`, each other player in the recipient's party is
  wrapped for that recipient with `resource` (from `backendState.Resources`) and, for a mercenary,
  the parry fields (from `backendState.Parries`). Non-members stay bare `PlayerState`s: their JSON
  is byte-for-byte today's. The shared `PlayerState` is never written.
- Health and level untouched (already public, every world).

## Acceptance Criteria

- [ ] Table test: for recipient R in party P, another player in P carries `resource` (and parry keys for a mercenary) in `other_players`; a non-member carries health and level but no `resource`/parry keys; R in no party gets no one's `resource`.
- [ ] Same table across a hub, a field and a run backend state.
- [ ] A non-member's `other_players` entry marshals to exactly today's JSON.
- [ ] Building two recipients from one backend state leaves the shared `PlayerState`s unchanged and neither sees the other's additions.
- [ ] The registry publishes a new snapshot after each kind of cache change; a published map is never mutated; a concurrent reader under `-race` sees whole snapshots only.
- [ ] Hub, run and field serializers get the holder at wiring; no serializer touches Redis or the cache.
- [ ] `go test ./... -race` on the touched packages green; lint fence passes.

## Blocked By

None

## Spec Reference

FS-CH21F §Requirements R1–R7; §User Stories 15–21; §Acceptance Criteria (server rows); §Edge States (no party, join/leave mid-tick, snapshot not yet published, Redis unreachable).

## Files expected to touch (game-server/game-service)

- `internal/gameserver/party_cache.go` (publish after put/drop), `internal/gameserver/party.go` (registry owns/publishes the holder); a new small file for the snapshot holder if cleaner (e.g. `internal/gameserver/party_roster.go`)
- `internal/serializer/state_serializer.go` (consumer-owned membership interface, constructor, per-recipient wrap)
- `internal/types/messages.go` (other-player wrapper type with `resource` / parry fields, `omitempty`), `internal/types/game.go` if the wrapper sits there
- `internal/gameserver/server.go` (~L248, ~L1060) and `internal/gameserver/fields.go` (~L212): pass the holder to `NewStateSerializer`
- `internal/game/session.go` only if the `stateSerializer` interface (~L201) must change
- Tests beside each: `internal/serializer/state_serializer_test.go`, `internal/gameserver/party_*_test.go`

## TDD Approach

- RED: serializer table test — a party member of R in `other_players` without `resource`.
- GREEN: the consumer-owned membership interface on the serializer and the per-recipient wrap.
- RED: registry test — after an arrival read / letter / drop, the published snapshot reflects it; `-race` reader test.
- GREEN: copy-on-write publish from the cache's change points; wire the holder into hub, run and field serializers.

## Charter run (2026-11-02)

Built by a /develop child, reviewed on two axes. Round 1 fixed: the membership snapshot was named
`partyRoster`, against game-service CONTEXT.md's **roster** (the people a run seats): renamed
`partyMembership` (MED); a stale test comment. Open LOWs: every taken put republishes the whole
map (fine at today's scale); `newPartyCache` has 7 positional params; arrival/letter/re-read reach
the publish only through put/drop, not each tested directly.
