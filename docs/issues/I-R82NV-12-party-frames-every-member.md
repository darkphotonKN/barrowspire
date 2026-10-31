---
id: I-R82NV-12
status: in-progress
implements: FS-R82NV
blocked_by: []
labels: [ready-for-agent]
title: "FS-R82NV slice 12: party frames list every member, the player first, with their own bars (game-client)"
---
Implements FS-R82NV §Requirements R34

**Lane: agent (AFK).** Reworks the frames built in I-R82NV-9.

## What to Build

- One row per member, **the player first**, then the others in join order.
- The frames are exactly as wide as the level/XP frame's outer border above them, in each world
  that has one (a field has no XP bar: keep the current width there, and say so).
- **The player's own row always shows both bars**, health and resource, from their own state.
- A teammate's row is unchanged: bars when this world's state carries their health (resource
  empty until FS-CH21F), the state word otherwise (always in the hub).
- Rows still clear the chat window, the T panel and the invite prompts.

## Acceptance Criteria

- [ ] A two-member party draws two rows, the player's first.
- [ ] The player's row shows health and resource from their own state, in the hub as well as in fields and runs.
- [ ] A teammate's row keeps the bars-or-word rule.
- [ ] The frames' width equals the level/XP frame's outer width (layout test against the real constant, not a copied literal).
- [ ] No overlap with the chat window, T panel or invite prompts at 1080x720 with four members.
- [ ] `vitest` green; lint fence passes.

## Blocked By

None (I-R82NV-9 is done)

## Spec Reference

FS-R82NV §Requirements R34; §User Stories 28, 29; §Acceptance Criteria (client party frames).

## TDD Approach

- RED: a layout test that a two-member party yields two rows with the viewer first and the viewer's slot holding bars in the hub.
- GREEN: drop the viewer filter, order the viewer first, feed the viewer's own state into their slot.

## Implementation notes (Nick approved, 2026-11-01)

- The frames are 180 wide (`PROGRESS_HUD_W`) in every world, the field too (no XP bar there), so
  their width does not change at a gate. The XP bar's corners now come from
  `ProgressHud.PROGRESS_HUD_AT`, read by the scenes and the frames alike.
- Every bars row draws two bars: with no `resource` on the wire yet, the second is an empty
  track (R34 "its bar stays empty until FS-CH21F"), teammates' rows included.
- Before the player's first state arrives, their own row shows empty bars, not a word.
- `PartyFrames.show(state)` now takes the whole state (the player's own bars come from
  `current_player`).

