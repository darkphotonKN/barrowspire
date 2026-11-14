---
id: I-TQZ5J-11
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-10]
labels: [blocked]
title: "FS-TQZ5J phase 2, slice 3: the party frames and Travel move into the UI scene"
---
Implements FS-TQZ5J §Change: Phase 2: the party (R36–R38, R40, R46 for the frames)

**Lane: AFK (agent).** game-client only.

## What to Build

- The UI scene builds the party frames in every world, their busts from its own art library over the
  resident art (R37).
- Each world hands each state tick it showed the frames to the interface as plain data
  (`partySeen`, R38).
- The frames' ground stays open; Travel is the UI scene's (R40).

## Acceptance Criteria

- [ ] No world mounts the frames; their bars and levels follow `partySeen`; a new world's frames
      start empty, as today.
- [ ] A press on a frame reaches the world; Travel answers on release.
- [ ] Before/after screenshots against ecb92ba9: the frames alone, as leader with Travel live (the
      town) and faint (a field, the run), with a skeleton row, in each world, at 1, 1.5 and 2,
      windowed and fullscreen; pixel-equal but R46's cases.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-10.

## Spec Reference

FS-TQZ5J §Change: Phase 2: the party (R36–R38, R40, R45, R46).

## TDD Approach

- RED: a world's state tick reaches the UI scene's frames through the bridge; a leave takes them down.
- GREEN: the bridge's `partySeen`, the slot's frames, the worlds' calls.
