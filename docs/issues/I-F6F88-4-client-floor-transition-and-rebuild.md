---
id: I-F6F88-4
status: done
implements: FS-F6F88
blocked_by: [I-F6F88-1, I-F6F88-3]
labels: [ready-for-agent]
title: "FS-F6F88 slice 4: Client floor transition and per-floor rebuild"
---
Implements FS-F6F88 §Requirements (Client 32–34; State broadcast 28)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent lane.

## What to Build

When the party climbs, **the client leaves the old floor completely behind and marks the arrival.**

- Detect a floor change as `floor` increasing between broadcasts (no separate message, FS §28).
- Transition: view goes dark → old floor's visuals torn down → new floor built from the incoming state → view returns with a brief floor card in lore voice, body serif (blackletter is bound to the main-menu title and end-of-run heading). Presentation-only: state keeps applying throughout.
- Per-floor rebuild: everything `BarrowspireScene` builds once per world from server walls (the `serverBuildingsCreated` path: roofs, ground flagstone paint, entrance markers, occluders, wall light sources) is torn down and rebuilt. Entity sprite maps drop the cleared ids. One-shot notice memory (`previousSwitchActivated`, `previousEscapeDoorOpened`) resets so the new floor's notices fire. The existing scene-reset path is the likely seam.
- Reconnect into a run already on floor 2 or 3: build that floor directly, with no transition.
- Visuals per `game-client/docs/design-guideline.md`; tokens only (ADR-0013).

## Acceptance Criteria

- [ ] A `floor` increase plays the transition and floor card; no state update is dropped or delayed.
- [ ] After a simulated floor change, no roof, flagstone patch, entrance marker, occluder, light source or entity sprite from the previous floor remains (scene objects counted by kind before and after).
- [ ] The new floor's switch-activated and escape-door-opened notices fire again.
- [ ] Reconnect onto floor 2/3 builds directly with the correct indicator and no transition.
- [ ] Card uses the body serif; ADR-0013 fence passes.
- [ ] Tests pass.

## Blocked By

- I-F6F88-1 (`floor` in the broadcast and real regeneration)
- I-F6F88-3 (same scene file and the floor field types; serialised to avoid conflicting edits in `BarrowspireScene.ts`)

## Spec Reference

FS-F6F88 §Requirements 28, 32–34; §Acceptance Criteria "Client" (transition, rebuild, notices, reconnect rows); §Edge States (reconnecting after the party climbed); User Stories 16, 18, 19.

## TDD Approach

- RED: a pure "floor changed?" detector (previous vs incoming state) returns true only on an increase and false on the first state after a reconnect; a scene-level test feeds floor-1 walls then floor-2 walls and asserts no floor-1 roof/marker/light remains.
- GREEN: detector, teardown and rebuild of the once-per-world visuals, notice-memory reset, transition overlay.
