---
id: I-5FZ4J-10
status: done
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-9]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 10: the client draws traps and their springs, poison, secret doors and Search, and rebuilds the floor on a same-floor floor map"
---
Implements FS-5FZ4J §I R46 (`traps`, `secret_door`), R47 (`poisoned_for`), R48, R49 (`target_kind`), §J R51, R52, R53 (poison line), R54, R55 (poison), R56

**Hotspot:** `gameState.ts`, `BarrowspireScene.ts`, `src/ui/minimap.ts`, the fog. One writer at a time.

## What to Build

- `traps` drawn faint, springing on `armed` falling (a gas puff on `puffed_at` changing).
- Secret doors: cracks decal over the wall cell while detected and shut; Search as an E target; the
  timed bar generalised from containers to any drawn target by `entity_id`, labelled by
  `target_kind` (*"Searching…"*; *"Praying…"* is used by slice 11).
- **A same-floor floor map rebuilds** the region grid, wall faces and fog, keeping explored regions
  (today's early returns refuse it); the opened hidden room joins the minimap unexplored.
- Poison: the own health bar and a teammate's overhead bar take a poison tint while `poisoned_for`
  is set (a new semantic palette entry); *"Poisoned."* on first poisoning.

## Acceptance Criteria

- [ ] A listed trap draws faint; `armed` falling plays its spring once.
- [ ] A detected secret door draws cracks; open, a doorway; Search shows *"Searching…"*.
- [ ] A second floor map for the built floor rebuilds the grid and fog and keeps explored regions.
- [ ] The poison tint shows on the own bar and a teammate's while `poisoned_for` is set.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-5FZ4J-9.

## Spec Reference

FS-5FZ4J §I R46–R49, §J R51–R56.
