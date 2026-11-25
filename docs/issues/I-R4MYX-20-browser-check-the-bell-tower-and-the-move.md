---
id: I-R4MYX-20
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-19]
labels: [blocked]
title: "FS-R4MYX slice 20: Nick's browser check of the moved chapel, its bell tower and the graveyard strip (HITL)"
---
Implements FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower (§Acceptance Criteria, §User Stories 1–13)

**Lane: HITL (Nick).** No code. Restart game-service and the client (the map changed).

## Files it expects to touch

- This issue file (ticks). On a pass, the Change section's `Status:` flips to `shipped` through
  `spec-update`. No code.

## What to Check

- **From the square:** the path leads south past the spawn and west to the chapel's door; the
  chapel stands at the screen's far left with its tower rising over the roof, the bell showing
  in its open top.
- **The tower:** does it read as part of the church (same stone), and tall enough now? It was
  raised after your first look (A4): its masonry is about 3× the wall height (11 edges) with
  the spire above that, the cross about 15 edges up. Say if the whole should be shorter or
  taller. Walk round it: solid, and you show as a silhouette behind it.
- **The tower's lower stage from the street:** the lower stage and its slit window are hidden
  behind the chapel's roof from the street. Acceptable?
- **The belfry above the roof:** after the raise (A4) both openings, the string course under
  them and both bells should stand wholly above the chapel's roof, nothing of the roof crossing
  them. Is that so in game, and is the gap between the ridge and the string course right?
- **Two bells**, one hung behind each of the two openings you can see (a single bell on the
  tower's axis shows through neither, the camera looking down the footprint's diagonal). Right,
  or should it be one?
- **The west gable has no cross** (the tower stands there); the east gable keeps its cross and
  rose window. Right, or put it back?
- **Inside the chapel:** the room as before. The tower is **hidden** with everything outside
  while you are indoors. Acceptable, or should it stay in view (a further Change to the
  blackout)?
- **The graveyard strip** along the south wall, made twice as deep after your first look (A5:
  y 1790–2170, 620 × 380, the rows 85–90 px apart): deep enough now? The walkway's width, every
  stone and the three mourners there (the Keener (805, 1940), the Widower (800, 2115), the
  Veteran (411, 2025)), the gap and its path, which stayed at the strip's north-east. Do the
  dead trees or crosses cover a window too much?
- **The dev test room's gate** (dev build): its label and the ground round it in plain sight;
  walk in and out.
- **The lane down the old site's west edge:** the path south from the square runs along the
  west 70 px of where the chapel stood, on its way to the new door. Does it read as passing by,
  or as leading to the old site? Keep it there, or move it off?
- **The old site** below the square: plain ground but for that lane, nothing left behind. The Woodcutter and the
  Bellringer still walk the east field: leave them, or move them?
- **The minimap:** the chapel, its door notch and the tower's block at the far left; the town a
  little smaller on the map again (the map is 2000 × 2200 now, drawn at 0.0595).

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-R4MYX-19

## Spec Reference

FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower. The whole Change, with user stories 1–13.
