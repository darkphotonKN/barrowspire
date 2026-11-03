---
id: I-QPDKN-11
status: done
implements: FS-QPDKN
blocked_by: [I-QPDKN-10]
labels: [ready-for-agent]
title: "FS-QPDKN slice 11: the client says why entry waits while a run settles"
---
Implements FS-QPDKN §Requirements 33, §WebSocket message surface (charter addendum 2026-11-03)

**Author: agent (charter "死亡斷線視同離開" addendum, Nick approved 2026-11-03).** Client only;
refusal text only (charter #13): no new screens, no Leave button for escaped delvers.

## What to Build

Make sure a settling player sees "Your plunder is still being counted. Wait for the delve to end."
on every refused entry:

- `party_notice` code `settling`: add its copy in `src/ui/partyNotice.ts`.
- Field refusal reason `settling` (`src/scenes/fieldRefusals.ts`): show the server's message or
  map the reason to the same copy, whichever matches how the file treats the other reasons.
- `find_game` / `start_solo`: the existing door-refusal path already shows the server's text.
  Confirm it with a test and change nothing if it does.

Follow `game-client/CLAUDE.md` and the design guideline (no new colours; existing notice styling).

## Acceptance Criteria

- [ ] A `party_notice` with code `settling` shows the settling text.
- [ ] A field refusal with reason `settling` shows the settling text.
- [ ] A `find_game` or `start_solo` refusal carrying the settling text shows it at the door panel
      or as a notice, as other door refusals do.
- [ ] vitest, tsc and lint pass.

## Blocked By

I-QPDKN-10 (the server sends the code and the reason)

## Spec Reference

FS-QPDKN §Requirements 33; §WebSocket message surface; story 34, 36.

## TDD Approach

- RED: `partyNotice` for `settling` returns the text (fails until the copy is added).
- GREEN: add the copy and the field-reason mapping.
