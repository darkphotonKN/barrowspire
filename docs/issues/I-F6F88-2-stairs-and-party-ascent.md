---
id: I-F6F88-2
status: done
implements: FS-F6F88
blocked_by: [I-F6F88-1]
labels: [ready-for-agent]
title: "FS-F6F88 slice 2: Stairs and party ascent"
---
Implements FS-F6F88 §Requirements (Floor layout 6–7, Stairs and ascent 17–22, Run end and escape 23–24, State broadcast 27)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (`handleInteract` stairs branch, the floor build step places stairs) · **Lane:** backend human lane by default (root `CLAUDE.md`). Hand to `/develop` only if asked.

## What to Build

One feature block: **the party climbs.** Floors below the top get a stairs entity; interacting
with it moves the whole party up when everyone still in the fight has gathered there.

The flow, end to end:
floor build step places one stairs entity on every non-top floor, through the occupied-area
check, with a guaranteed fallback so a non-top floor never lacks stairs → stairs are broadcast
as `stairs: [{ entity_id, position }]` (empty on the top floor) → a delver interacts with the
stairs (existing `interact` action, existing range rule) → the server checks that every living,
non-escaped delver is within interact range of the stairs → if so, it requests exactly one
ascent, which slice 1's regeneration applies between ticks → if not, it replies with the
existing interact error shape plus `reason: "party_not_gathered"` and `missing: <n>`.

Dead and escaped delvers never block. A delver mid-reconnect still has an entity and so still
counts until the reconnection timeout removes it. Concurrent interactions produce exactly one
climb.

## Acceptance Criteria

- [ ] Floors 1 and 2 each have exactly one stairs entity; floor 3 has none; stairs never overlap a building, chest, escape door or switch; a non-top floor still gets stairs when random placement is exhausted.
- [ ] Run broadcasts carry `stairs`; hub broadcasts do not.
- [ ] Gathered party + stairs interaction → depth +1 and a fresh floor; partial party → `success: false`, `reason: "party_not_gathered"`, correct `missing`, nothing changes.
- [ ] Out-of-range interactor gets the existing "too far" refusal.
- [ ] Dead/escaped delvers never block; a lone survivor ascends alone.
- [ ] Several simultaneous stairs interactions → exactly one ascent.
- [ ] Escape door and switch work on every floor; reaching floor 3 does not end the run; an ascent never fires the run-end signal.
- [ ] Tests pass.

## Blocked By

I-F6F88-1 (floor depth, floor build step, regeneration)

## Spec Reference

FS-F6F88 §Requirements 6, 7, 17–24, 27; §Acceptance Criteria "Floors and layout" (stairs rows), "Ascent", "Escape and run end" (first two rows); §Edge States (party split, death at the stairs, reconnect, same-tick interactions, placement exhausted); User Stories 4, 6–13, 20, 21, 23, 24.

## TDD Approach

- RED: three delvers, two at the stairs and one far away; interact and assert the refusal payload with `missing: 1` and unchanged depth. Then move the third into range, interact, and assert depth 2.
- GREEN: stairs component and factory, placement in the floor build step, the stairs branch in `handleInteract`, a single-shot ascent request consumed by slice 1's regeneration.
