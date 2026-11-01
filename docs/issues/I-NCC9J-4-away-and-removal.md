---
id: I-NCC9J-4
status: done
implements: FS-NCC9J
blocked_by: [I-NCC9J-2, I-NCC9J-3]
labels: [ready-for-agent]
title: "FS-NCC9J slice 4: away after 30 s, removed after 5 minutes, by TTL (game-service)"
---
Implements FS-NCC9J §Requirements R17, R21 (`online`)

**Lane: human (HITL).**

## What to Build

- A member record per member, refreshed every 10 s by the pod holding them, TTL 5 minutes.
- `online: false` in `party_update` once a record goes ~30 s without a refresh (every kind of drop).
- When a record expires, the next pod to touch the party removes the member by script, with
  succession if they led, and every member gets `left`; each pod also checks its cached parties
  every tick.
- A member seated again anywhere within 5 minutes is refreshed by that pod and stays.

## Acceptance Criteria

- [x] A member whose pod stops refreshing shows `online: false` after ~30 s (clock injected).
- [x] After 5 minutes they are removed; if they led, the earliest-joined leads.
- [x] A member reconnecting on another pod within 5 minutes stays, `online` again.
- [x] A short drop (under 30 s) never shows `online: false`.
- [x] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-2, I-NCC9J-3

## Spec Reference

FS-NCC9J §Requirements R17, R21; §User Stories 15–17; §Edge States (leader on a pod that dies, every member away).

## TDD Approach

- RED: a two-pod test where pod B stops refreshing its member and pod A's update shows them `online: false` after 30 s.
- GREEN: the member record and its refresh, then the expiry sweep.

## Decisions (2026-11-02, Nick)

- **A.** A member's record is a field in a hash kept with the party (`{party}:p:<id>:seen`,
  player → ms), stamped by the refreshing pod's injected clock and never moved backwards; the
  5 minutes are enforced by the scripts that keep it, not by a key TTL.
- **B.** Going away or coming back is told to every member as `sync` about them; an expiry is told
  `left`, then `leader` if the lead passed.
- **C.** Only the re-read (R4) and the arrival read (R6) sweep, plus each tick re-reading a party
  whose cached copy shows a member due; invite, accept and the other scripts do not.
- **Away is 40 s from the last refresh** (code review, Spec MED): counted from the last refresh, 30 s
  let a 21 s drop show away. 40 s keeps every drop under 30 s from showing it.

FS-NCC9J R2, R17, R21 and `game-service/CONTEXT.md` § Away amended to match.

## Code review follow-ups not taken (LOW)

- `newPartyCache` takes two registry callbacks; a cache-owned interface would read better.
- A sweep that flips two members at once sends one `sync` about the first; the party carries both.
- `seen_at` moves without a version bump, so an equal-version letter can carry an older `SeenAt`;
  it costs at most one extra re-read.
- A sweep that removes a party's last member ends it without telling `left`: nobody can be seated
  to hear it then.

