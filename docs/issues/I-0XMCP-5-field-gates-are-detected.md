---
id: I-0XMCP-5
status: done
implements: FS-0XMCP
blocked_by: [I-0XMCP-1, I-0XMCP-2, I-0XMCP-3, I-0XMCP-4]
labels: [blocked]
title: "FS-0XMCP slice 5: field gates are detected and named, with a seam for FS-X2F2H (game-client)"
---
Implements FS-0XMCP §Requirements 21, 22, 25

**Author: agent**

## What to Build

The west and east gates know when a player steps up to them, without going anywhere yet.

- **Detection**: using the gate detection from I-0XMCP-3, stepping into the Forest or Meadows
  gate shows the destination's name as an amber marker over that gate's signpost (*"The
  Forlorn Forest"*, *"Gentle Meadows"*), hidden on stepping out.
- **The seam**: the scene exposes one gate-entered callback keyed by destination (e.g.
  `onFieldGate(destination)`), fired once per entry, default a no-op. FS-X2F2H wires it to its
  enter message. No message is sent in this slice; the player stays in the hub, held at the
  edge by the movement clamp.
- **Drop the alias**: with I-0XMCP-4 making the server send `storyteller`, remove the `delve`
  alias from `FUNCTION_NPC_SHEETS` / `NPC_DIALOGUE` and from the NPC function union.

Do not add the `field` world kind, enter/leave messages or any world switch (FS-X2F2H).

## Acceptance Criteria

- [ ] Stepping into the Forest gate shows "The Forlorn Forest"; the Meadows gate shows "Gentle Meadows"; both hide on stepping out.
- [ ] The seam fires once per entry with the right destination, not while lingering, and not for the Spire gate.
- [ ] No socket message is sent on entering a field gate (asserted in the scene test).
- [ ] The `delve` function value no longer appears in the client; the Warden still draws as `folk_spirewarden` with `storyteller`.
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/scenes/HubScene.ts` (field-gate marker, the seam)
- `game-client/src/scenes/hubGates.ts`, `hubGates.test.ts`
- `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/render/art/hubFolk.ts`, `hubFolk.test.ts` (alias removal)
- `game-client/src/types/gameState.ts` (drop `delve` from the function union)

## Blocked By

- I-0XMCP-1: gates in the hub state.
- I-0XMCP-2: the signposts the marker stands over.
- I-0XMCP-3: the gate detection module.
- I-0XMCP-4: the server's Warden rename, before the client alias goes.

## Spec Reference

FS-0XMCP §Requirements 21, 22, 25; §User Stories 13, 26; §Acceptance Criteria 15, 17;
§Edge States (field gate before FS-X2F2H; server rename order); §Decision log D8, D16.
Downstream: FS-X2F2H's enter-field work depends on this seam and on I-0XMCP-1's at-gate query
and arrival points.

## TDD Approach

- RED: `hubGates.test.ts`: entering the Meadows gate yields one `meadows` edge; lingering yields none.
- RED: scene test: no socket send on a field-gate entry.
- GREEN: marker and seam.
