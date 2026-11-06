---
id: I-SRA9J-4
status: open
implements: FS-SRA9J
blocked_by: [I-SRA9J-1, I-SRA9J-2, I-SRA9J-3, I-KE075-6]
labels: []
title: "FS-SRA9J slice 4: Nick's browser check of fog of war and the minimap on floor 1 (HITL)"
---
Implements FS-SRA9J §Acceptance Criteria (whole FS), §User Stories 1–16

**Lane: HITL (Nick).**

## What to Build

Nick plays floor 1 on the branch, solo and with a second browser as a party member, and ticks what he sees.

## Files (expected)

- none (check only); findings go back into this issue

## Acceptance Criteria

- [ ] Unentered rooms are black; walked rooms stay drawn, dim, with no monsters
- [ ] The room I stand in is clear; a monster just past a doorway shows
- [ ] My teammate's exploring uncovers rooms on my screen
- [ ] The minimap sits under the floor indicator, clear of the fullscreen button, and M toggles it
- [ ] Switch, door and stairs appear on the minimap once their room is found
- [ ] Floors 2 and 3 look as before, with no fog and no minimap
- [ ] After a reconnect the run works and the fog starts over

## Blocked By

I-SRA9J-1, I-SRA9J-2, I-SRA9J-3, I-KE075-6

## Spec Reference

FS-SRA9J as a whole.
