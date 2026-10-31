---
id: I-R82NV-9
status: done
implements: FS-R82NV
blocked_by: [I-R82NV-6]
labels: [ready-for-agent]
title: "FS-R82NV slice 9: party frames on the left — class bust, name, health and resource (game-client)"
---
Implements FS-R82NV §Requirements R34, R35

**Lane: agent (AFK).**

## What to Build

- Left edge, below the level/XP bar, shown whenever the player is in a party: one row per
  **other** member in join order.
- Each row: a **class bust** medallion cut from that class's baked standing frame with
  `ui/bust.ts` (the NPC dialogue card's crop); the name, leader icon first on the leader; a
  health bar and a resource bar in the HUD's own-bar style at half scale.
- Bars fill from the member's `current_health`/`max_health` and `resource` when the state
  broadcast carries them (FS-CH21F, runs and fields); when absent, the bar slot shows a state
  word: "village", "afield", "delving", "away".
- Updates from `party_update` and each state tick; nothing requested. Clear of the chat window
  and the queue panel. Game palette tokens only.

## Acceptance Criteria

- [x] No party → no frames; a two-member party → one row (the other member).
- [x] The bust matches the member's class (pure crop test + one scene check).
- [x] Bars render when health/resource are present; the state word renders when they are not.
- [x] Leader icon moves on a `leader` update.
- [x] Rows do not overlap the chat window or the XP bar at 1080×720.
- [x] `vitest` green; lint fence passes.

## Blocked By

I-R82NV-6

## Spec Reference

FS-R82NV §Requirements R34, R35; §User Stories 15–17.

## TDD Approach

- RED: pure layout test — a store with three members and the viewer yields two rows in join order, the leader's row flagged.
- GREEN: a `partyFrames` layout module, then the scene draws it.

## Superseded in part (2026-11-01)

Done to its spec. Nick then changed the frames (FS-R82NV R34 amended): every member is listed,
the player first, as wide as the level/XP frame, with the player's own bars always. That change
is a new issue, not a reopening of this one.
