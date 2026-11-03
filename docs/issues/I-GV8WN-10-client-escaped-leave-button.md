---
id: I-GV8WN-10
status: in-progress
implements: FS-GV8WN
blocked_by: []
labels: [ready-for-agent]
title: "FS-GV8WN slice 10: an escaped player sees Leave beside Watch"
---
Implements FS-GV8WN §G Requirement 25, §F Requirement 17

**Author: agent.** Client only. The server accepts an escaped player's `leave_run` from I-GV8WN-7;
until then the press is refused with the existing message.

## What to Build

- An escaped player's bottom-centre buttons gain **Leave** beside Watch (FS-QPDKN's escaped Watch
  button). It sends `leave_run`, as the dead player's Leave does. With no teammate in play there is
  no Watch, only Leave (and the Settlement button from I-GV8WN-9).
- Remove the client copy for the `settling` entry refusal (I-QPDKN-11): the server no longer sends
  it after I-GV8WN-7.
- Follow `game-client/CLAUDE.md` and the design guideline.

## Acceptance Criteria

- [ ] An escaped player sees Leave beside Watch; pressing it sends `leave_run`.
- [ ] With no teammate in play, Leave shows without Watch.
- [ ] The `settling` refusal copy is gone (party notice and field refusal).
- [ ] vitest, tsc and lint pass.

## Blocked By

None (end to end after I-GV8WN-7)

## Spec Reference

FS-GV8WN §G R25, §F R17; user stories 2, 3.

## TDD Approach

- RED: render the escaped state → expect a Leave button that sends `leave_run`.
- GREEN: add Leave to the escaped button row.

## Review outcome (2026-11-03)

The `settling` refusal copy removal was **reverted**: the server still sends `settling` until I-GV8WN-7, and without it HubScene's party_notice listener ignored the refusal and `enterPending` stuck. The removal moves to I-GV8WN-7, so the client and server sides land together. `canLeave` is now sticky (seen escaped this run).
