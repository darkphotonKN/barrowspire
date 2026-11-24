---
id: I-5FZ4J-11
status: open
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-10]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 11: the client draws the fountain and the hallowed altar, Pray, and the Blessing mark"
---
Implements FS-5FZ4J §I R46 (`fountain`, `hallowed_altar`), R47 (`blessed`), §J R51, R52, R53 (Blessed line), R54 (Praying), R55 (the Blessing mark)

**Hotspot:** `gameState.ts`, `BarrowspireScene.ts`, the UI scene HUD. One writer at a time.

## What to Build

- The fountain (full/dry, no E target) and the hallowed altar (dormant/prayed, E target **Pray**
  with *"Praying…"* on the generalised bar).
- The Blessing: a small status mark beside the own health bar in the UI scene (a new `HudMessage`
  kind; the UI-scene split per ADR-0086), hover line *"Blessed: better finds, quicker resource"*;
  *"Blessed."* when `blessed` turns true.

## Acceptance Criteria

- [ ] Fountain and altar draw in their state's frame; the altar is an E target until prayed.
- [ ] The Blessing mark shows while `blessed`, with its hover line; the line fires on gaining it, not on a first broadcast.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-5FZ4J-10.

## Spec Reference

FS-5FZ4J §I R46–R47, §J R51–R55.
