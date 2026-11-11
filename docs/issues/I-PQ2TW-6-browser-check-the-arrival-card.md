---
id: I-PQ2TW-6
status: open
implements: FS-PQ2TW
blocked_by: [I-PQ2TW-3, I-PQ2TW-4, I-PQ2TW-5]
labels: []
title: "FS-PQ2TW slice 6: Nick's browser check of the arrival card, its words and its dust (game-client)"
---
Implements FS-PQ2TW §Acceptance Criteria, §Open for the owner

**Lane: human (HITL).** Nick, in a real browser. No code unless the check finds something: an
edited line is a one-entry change to the words table (`Tunes`-sized, done on the spot); anything
else becomes a new issue or an escalation.

## What to Check

- [ ] Main menu → the town: the card, then the town.
- [ ] Town → Gentle Meadows → town → the Forlorn Forest → town: a card each time, the right name.
- [ ] Into the Spire: "The First Floor / The barrow takes you in." Then a climb: the card as before.
- [ ] Run ends → the town's card, after the settlement record is closed.
- [ ] Refresh the page in the town, in a field and on a run's floor: no card. Pull the network and let it reconnect: no card.
- [ ] Into the Inn and out: no card.
- [ ] Move, open the bag and read a notice while a card is up.
- [ ] The dust: it comes off the letters, not a box; drifts out and a little up; gone in about a second; reads as dust and not as confetti.
- [ ] Reduced motion on (OS setting): the card only fades.
- [ ] `/dev/gallery`: the dust card replays.

## Decisions to give

- [ ] **The town's title** (O1): keep "The Town", or give the town its name.
- [ ] **The subtitle lines** (O4): edit the four starting lines.
- [ ] **The timings**: the card on every short walk between the town and a field: keep, shorten, or shorten for fields only.
- [ ] **The dust's numbers**: duration, how many, how far.
- [ ] **Refresh or arrival** (O2): accept the tab's session storage, or ask for a server flag.
- [ ] **"No confetti"** (O3): accept the exception to FS-KYPQ9 §B.6.

## Blocked By

I-PQ2TW-3, I-PQ2TW-4, I-PQ2TW-5

## Spec Reference

FS-PQ2TW §Acceptance Criteria, §C R19, §Open for the owner O1–O4.

## Files it expects to touch

None; an edited line touches `game-client/src/ui/placeCard.ts` (or `src/ui/floor.ts`) and its test.
