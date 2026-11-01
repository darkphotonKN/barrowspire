---
id: I-NCC9J-5
status: done
implements: FS-NCC9J
blocked_by: [I-NCC9J-3, I-NCC9J-4]
labels: [ready-for-agent]
title: "FS-NCC9J slice 5: party_travel to the leader's pod village (game-service)"
---
Implements FS-NCC9J §Requirements R18–R20

**Lane: human (HITL).**

## What to Build

- `party_travel` (no payload): refusals in order `not_member`, `not_in_hub`, `queued`,
  `leader_away` (the leader's member record, slice 4), `pod_full` (the leader's pod's hub at its cap);
  nothing for a member already on the leader's pod; the leader cannot travel.
- On success: `world_handoff {addr: <leader's pod address>, hub: true}`.
- The old pod lets go at once: unseats the traveller's presence and does not hold them for the
  reconnect grace when the old socket closes (so FS-MCYWK never bounces them back).
- Arrival is an ordinary `enter_hub` on the leader's pod; its cap is checked again there.

## Acceptance Criteria

- [x] A member in their village on pod B gets `world_handoff {hub: true}` with pod A's address when the leader is on A.
- [x] Refusals fire in R18's order (table-driven): `not_member`, `not_in_hub` (field, run), `queued`, `leader_away`, `pod_full`.
- [x] After the handoff, pod B holds the player neither in presence nor in the reconnect grace.
- [x] Arrival on A seats them in A's hub and sends them a full `party_update`.
- [x] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-3, I-NCC9J-4

## Spec Reference

FS-NCC9J §Requirements R18–R20; §User Stories 8–12; §Edge States (travel while the leader is mid-handoff, travel and reconnect).

## TDD Approach

- RED: a two-pod test where a member in pod B's hub sends `party_travel` and receives `world_handoff` naming pod A.
- GREEN: the action, the leader's pod from presence, then the refusals and the let-go.

## Decisions (2026-11-02, Nick)

- **Pod address** rides the presence entry: every seat writes `pod_addr` (FS-NCC9J R7 amended).
- **Room at the leader's pod**: travel and arrival get a **fixed margin** past the hub cap, one full
  party (`constants.HubTravelMargin` = 4). Each pod publishes its hub count to `hub:occ:{podID}`
  every tick on a 3 s TTL (FS-JEAVX R19's key only; JEAVX's summed cap is still unbuilt). Travel
  refuses `pod_full` at cap + margin; an unpublished count is not refused. Arrival admits a player
  past the cap when their party's leader stands **on that pod** (hub, field or run; code review),
  read by the server (`LeaderOf`). The margin is the **hub's, shared and first come**: one party
  can take all four places. A per-leader allowance (with an overall ceiling) is left for later.
- **Let-go window** is 15 s (the handoff's seat lapse): a traveller still on the same socket after
  it is taken back and present again, unless presence finds them on another pod (they arrived;
  code review); a new connection ends it too.
- A leader whose presence names no address (an older pod, mid-deploy) is `unavailable`.

FS-NCC9J R7, R18, R19, R20 and `game-service/CONTEXT.md` (Occupancy cap, Presence index) amended.

## Test harness

Party rigs now shut every world down on cleanup (`stopWorlds`): a cancelled test server left its
hub and field loops running (3 → 62 goroutines for three pod pairs, 3 → 8 after), and the pile-up
made later party tests time out under `-race`.

## Out of slice

- Following `world_handoff {hub: true}` on the client: I-NCC9J-8.

## Code review (2026-11-02, two axes) — fixed

- Room rule differed between the two pods (travel at cap+4 always, arrival only with the leader
  in the hub): arrival now uses "leader on this pod" (MED).
- Take-back could overwrite another pod's presence on a half-open old socket: the window's end now
  asks presence first (MED).
- `LeaderOf` reached the server by a hidden type assertion: `partyStore` embeds `partyLeaders` (MED).
- Hub count published every tick through the shared writer: now on change or every 2 s (MED).
- `PresentPlayers` dropped travellers, so a refused traveller missed their party: only the presence
  keeper leaves them out; "Let go" added to CONTEXT (MED).
- Travel decided partly on the cache: now every press is read first (party, queue, presence,
  count), refusals in R18's order; a second press while reading is ignored (LOWs: R4, queued
  recheck, leader order, double press). Tests added for not_member first, Redis unreachable, a
  leader on another pod at the cap.

## Code review follow-ups not taken (LOW)

- Let-go state lives in two places (`registry.letGo` with its deadline, `Server.travelling`).
- The presence keeper also publishes the hub count.
- A party test's cleanup could, in theory, route a late action into a world `Shutdown` closed.

