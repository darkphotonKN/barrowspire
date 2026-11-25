---
id: I-R4MYX-19
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-17, I-R4MYX-18]
labels: [blocked]
title: "FS-R4MYX slice 19: draw the bell tower: its sheet, its place in the draw order, the silhouette, hidden indoors, and the plain west gable"
---
Implements FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower (§T-C T10–T16, §T-E T23's manifest tie)

**Lane: game-client (agent).** No server change.

## What to Build

- The wall on the tower's rect draws `chapel_tower` at its rect's centre; the placeholder block
  stays for a client without the sheet (T10).
- Draw order (T11): bodies north or west of it behind, south of it in front; every chapel wall,
  post, roof and gable piece that overlaps it on screen in front of it.
- It joins the silhouette's cover (the list the roofs use) and never the occluders (T12).
- It hides by footprint with the street while the player is in any building, the chapel included
  (T13); tests for both rules of T14.
- No light (T15).
- The chapel's west gable lays frame 0 at its apex; a per-end choice the chapel's look names;
  the other buildings' gable plans unchanged (T16).
- `hubCover.ts`: the tower's named top is held to the manifest frame's drawn top, and the
  tower's drawn pixels lie under its bulk (T23). If the real top moves T3 or T23, fix the layout
  within the FS's rules and say so.

Expected files:
- `game-client/src/scenes/HubScene.ts`, `HubScene.test.ts`
- `game-client/src/render/world/roofs.ts`, `roofs.test.ts`
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts` (the look's west end)
- `game-client/src/render/world/hubCover.ts`, `hubCover.test.ts`
- `game-client/src/render/world/scene.ts` or `buildingLooks.ts` only if the gable choice passes
  through them

Not touched: `game-server/**`, the golden, `tools/bake/**`, the blackout's geometry
(`blackout.ts`: the tower hides, the hole is unchanged).

## Acceptance Criteria

- [ ] Vitest (T10–T14, T16, T23) as the FS's criteria list them.
- [ ] No light source added; the Inn's, the store's and the smithy's gables unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-R4MYX-17 (the tower's wall, rect and placeholder; shares `hubCover.ts`, `hubInteriors.ts`,
`HubScene.ts`), I-R4MYX-18 (the sheet)

## Spec Reference

FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower: T10–T16, T23; user stories 1, 4, 5, 6, 9.

## TDD Approach

- RED: a scene test that the tower's wall draws `chapel_tower` and is hidden once the player
  stands in the chapel; a roof-plan test that the chapel's west apex is frame 0.
- GREEN: the prop, its sort key and cover, the footprint hide, the gable choice.
