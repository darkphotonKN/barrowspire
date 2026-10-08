---
id: I-F6F88-3
status: done
implements: FS-F6F88
blocked_by: [I-F6F88-2]
labels: [ready-for-agent]
title: "FS-F6F88 slice 3: Client floor indicator, stairs and gather notice"
---
Implements FS-F6F88 §Requirements (Client 29–31, 34; State broadcast 26–27)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent lane.

## What to Build

The run scene shows **where the party is and how to climb.**

- `ClientGameState` gains `floor?`, `floor_count?` and `stairs?` (run only) per FS §State broadcast; the type guard tolerates their absence (hub).
- HUD shows "Floor N of M" in the neutral-HUD channel (vellum, body serif), updates whenever the broadcast's floor changes, and is hidden in the hub.
- Stairs render as an interactable (amber channel) with a code-drawn placeholder, diffed by `entity_id` like switches and escape doors, and absent when `stairs` is empty. The interact key reaches them when nearby, the same way it reaches the switch and the escape door.
- An `interact` refusal with `reason: "party_not_gathered"` shows a lore-voice notice using `missing` (`game-client/CLAUDE.md` "Wording & Tone"); other refusals keep today's behaviour.
- Colours from tokens only (ADR-0013); visuals per `game-client/docs/design-guideline.md` ("Gameplay accent", "Typography", "The blackletter bound").

## Acceptance Criteria

- [ ] Floor indicator renders from state, updates on change, hidden in the hub.
- [ ] Stairs render in the interactable channel, are removed when absent from state, and are reachable with the interact key.
- [ ] `party_not_gathered` shows a lore-voice notice containing the missing count.
- [ ] ADR-0013 token fence passes; no blackletter on these surfaces.
- [ ] Tests pass (state-guard and notice-copy unit tests; scene behaviour against fixture states / MockBackend).

## Blocked By

I-F6F88-2 (stairs in the broadcast and the refusal payload). It can be built against the FS's wire contract with fixtures before then; the blocker is for playing it for real.

## Spec Reference

FS-F6F88 §Requirements 26, 27, 29–31, 34; §Acceptance Criteria "Client" (first three rows and the token row); User Stories 2, 3, 5, 6, 8.

## TDD Approach

- RED: `isGameState` accepts a run state carrying `floor`, `floor_count` and `stairs`, and a hub state without them; the floor label formatter returns "Floor 2 of 3".
- GREEN: type additions, HUD text, stairs renderer, refusal notice.
