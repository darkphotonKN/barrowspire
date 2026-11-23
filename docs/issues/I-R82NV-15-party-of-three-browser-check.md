---
id: I-R82NV-15
status: open
implements: FS-R82NV
blocked_by: [I-R82NV-14]
labels: []
title: "FS-R82NV change slice: the owner checks a party of three in the browser, frames, panel and Spire entry (Kranti)"
---
Implements FS-R82NV §Change: Party cap 3, match size its own setting

**HITL gate.** Kranti runs the branch on his own stack (agents never start the backends) with
`PARTY_SIZE` and `MATCH_SIZE` unset, signs in three accounts (dunstan, aldric, player3, all
`@barrowspire.dev`, each with level-20 characters), forms a party of three and enters the Spire.
An agent fixes only a layout defect he finds in the party frames or panel; the client reads the
cap from `size` and is expected to need no change (S5).

## Files it expects to touch

- None expected. A layout fix, if any: `game-client/src/ui/PartyFrames.ts`, `game-client/src/ui/partyFramesLayout.ts`, `game-client/src/ui/PartyPanel.ts`.

## Acceptance Criteria

- [ ] Three frames, the player's first; the panel lists three members; nothing overlaps at 1080 × 720 and 1280 × 720. (S5)
- [ ] A fourth invite is refused with the party-full line. (S1)
- [ ] The party of three passes the ready check and enters the Spire together. (S1)
- [ ] Two solo players queuing still meet in a 2-player match. (S2, S6)

## Blocked By

I-R82NV-14

## Spec Reference

FS-R82NV §Change: Party cap 3, match size its own setting: S5, acceptance rows 4–6 and 8.
