---
id: I-NCC9J-4
status: open
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

- [ ] A member whose pod stops refreshing shows `online: false` after ~30 s (clock injected).
- [ ] After 5 minutes they are removed; if they led, the earliest-joined leads.
- [ ] A member reconnecting on another pod within 5 minutes stays, `online` again.
- [ ] A short drop (under 30 s) never shows `online: false`.
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-2, I-NCC9J-3

## Spec Reference

FS-NCC9J §Requirements R17, R21; §User Stories 15–17; §Edge States (leader on a pod that dies, every member away).

## TDD Approach

- RED: a two-pod test where pod B stops refreshing its member and pod A's update shows them `online: false` after 30 s.
- GREEN: the member record and its refresh, then the expiry sweep.
