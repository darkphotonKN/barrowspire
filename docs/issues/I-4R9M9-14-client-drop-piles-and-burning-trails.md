---
id: I-4R9M9-14
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-8, I-4R9M9-11]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 14: The canvas draws drop piles and burning trails"
---
Implements FS-4R9M9 §Requirements (Client 61; In-run state 55–56)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent (frontend lane).

## What to Build

- `ContainerState` gains `kind` (`chest` | `drop_pile`); world state gains the trail list.
- `scenes/BarrowspireScene.ts`: a `drop_pile` container is drawn as a small heap of remains (built
  in code under `render/`, isometric like the rest, ADR-0020 / ADR-0021 rules), interactable with
  the existing container view; not drawn once its item list is empty. Chests unchanged.
- A live burning trail is drawn along its path (built-in-code fire strip, fading with time left),
  lit through the light map if cheap, and removed when it leaves state.
- Appearance per `game-client/docs/design-guideline.md`.

## Acceptance Criteria

- [ ] A state with a `drop_pile` renders a heap at its position; interacting opens the container
      view; an empty pile is not drawn.
- [ ] A trail in state renders along its path and disappears when it leaves state.
- [ ] Scene tests cover pile add/empty/remove and trail add/remove; `tsc` and tests pass.

## Blocked By

I-4R9M9-8 (`kind` on containers, drop piles in state), I-4R9M9-11 (trails in state).

## Spec Reference

FS-4R9M9 §Requirements 55–56, 61; §Acceptance Criteria "Protocol, gateway, client" row 5;
§Edge States "A pile under a corpse". User Stories 10, 15, 25.

## TDD Approach

- RED: scene test — state with an empty `drop_pile` creates no sprite.
- GREEN: pile renderer keyed on `kind`, then trails.
