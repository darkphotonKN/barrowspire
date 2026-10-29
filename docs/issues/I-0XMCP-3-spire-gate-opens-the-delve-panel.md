---
id: I-0XMCP-3
status: open
implements: FS-0XMCP
blocked_by: [I-0XMCP-1]
labels: [blocked]
title: "FS-0XMCP slice 3: the Spire gate opens the delve panel; the Warden tells the story (game-client)"
---
Implements FS-0XMCP §Requirements 8–10, 22, 24, 25

**Author: agent**

## What to Build

The way into the Spire moves from the Warden to the door.

- **Read gates from state**: `GateState` and `gates?` in `src/types/gameState.ts`; the scene
  keeps the hub's gates from each state (positions and ranges from the server, never client
  constants).
- **Pure gate detection** (no Phaser, unit-tested): given the player's last server-reported
  position and the gates, which gate (if any) the player is inside, and the enter / leave
  edges between two frames.
- **Spire gate trigger**: entering the Spire gate opens the existing delve dialogue once; no
  reopen while lingering; E inside reopens; walking out closes it (a sent `start_solo` still
  completes); suppressed while the Esc menu or another dialogue is open. Choices, `start_solo`
  / `find_game` / `leave_queue`, the queued line, the corner queue panel and *Leave* are
  unchanged.
- **Re-voiced line** for the door (no keeper), keeping the warning, e.g. *"The Spire's door
  stands open. Few return whole,\nand fewer return twice."* Queued line unchanged.
- **The Warden as storyteller**: a lore dialogue of up to three passages (the town woke one
  morning to a tower on the old barrow field; what it took; its door stands at the north of
  the hub). *Go on* advances, *Farewell* closes, the last passage offers only *Farewell*; no
  memory. No queue, solo or leave choice in any state.
- **Transition alias**: map both `storyteller` and `delve` to `folk_spirewarden` and the lore
  dialogue (`FUNCTION_NPC_SHEETS`, `NPC_DIALOGUE`), so the Warden stays himself whichever side
  ships first. The alias is removed in I-0XMCP-5.

Do not touch the server in this slice. Copy follows the lore voice (design guideline; "player",
"the Spire", "delve").

## Acceptance Criteria

- [ ] Gate detection: inside / outside at the range boundary, and enter / leave edges, unit-tested.
- [ ] Walking into the Spire gate opens the delve panel once; lingering does not reopen it; stepping out and in, or E inside, reopens it; walking out closes it.
- [ ] The trigger uses the server-reported position and is suppressed while the Esc menu or another dialogue is open.
- [ ] *Descend alone* sends `start_solo` and *Wait for company* sends `find_game` with today's payloads; the queued line, corner panel and *Leave* behave as before (existing `HubScene.test.ts` cases still pass).
- [ ] Talking to the Warden gives the lore passages with *Go on* / *Farewell*; no queue, solo or leave option, queued or not.
- [ ] The Warden is drawn as `folk_spirewarden` for function `delve` and for `storyteller` (`hubFolk.test.ts`).
- [ ] Verified by playing it in the hub (client from the worktree; server per the integration flow), not only by the suite.
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/types/gameState.ts` (`GateState`, `gates`, NPC function union gains `storyteller`)
- `game-client/src/scenes/hubGates.ts` + `hubGates.test.ts` (new, pure detection)
- `game-client/src/scenes/HubScene.ts` (gate trigger, door dialogue, Warden lore dialogue)
- `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/render/art/hubFolk.ts`, `hubFolk.test.ts` (`storyteller` + `delve` alias)

## Blocked By

I-0XMCP-1: the client reads gate positions from the hub state's `gates` list.

## Spec Reference

FS-0XMCP §Requirements 8–10, 22, 24, 25; §User Stories 1, 4–10, 15–17, 24; §Acceptance
Criteria 5, 6, 16, 17; §Edge States (lag at the boundary, refused start, queued and walking
away, disconnect at the door, Esc menu open, another dialogue open); §Decision log D6, D9, D10,
D13, D16.

## TDD Approach

- RED: `hubGates.test.ts`: boundary and edge cases.
- RED: `HubScene.test.ts`: the Warden's dialogue for `storyteller` offers no queue choice; the door's dialogue offers the three delve choices.
- GREEN: detection, trigger wiring, dialogue table entries.
