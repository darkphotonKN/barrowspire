---
id: I-5FZ4J-9
status: open
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-8]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 9: the client draws the seal, its pieces, the gate, blocks, pits and bridge, and says the seal's lines"
---
Implements FS-5FZ4J §I R46 (`seal`, `seal_pieces`, `barriers` gate/pit), R48, R49, §J R51–R53, R56 (the gate stroke)

**Hotspot:** `src/types/gameState.ts`, `src/scenes/BarrowspireScene.ts`. One writer at a time. The
server lane builds the same wire in parallel: build against §I's shapes exactly. Code map: the
shared notes folder's `code-map-game-client.md`.

## What to Build

- Types and guards for `seal`, `seal_pieces`, `barriers` (forward-compatible unknown kinds, as `placedKind` does).
- A pure set (in the `StairsSet`/`SummoningSet` pattern) drawing levers, plates, blocks (sliding
  between cells), braziers, the stair key, the bridge lever, the mural and a shrine; the gate
  (shut/open) and pits and the lowered bridge from `barriers`. Joins the hide rule.
- E targets (R52): lever, brazier, bridge lever, stair key, mural, shrine, gate.
- Lines (R53) through the HUD notice and `REPLY_LINES`: floor arrival with a seal, stage rise, seal
  broken, `stairs_sealed`/`gate_sealed`, `lever_wrong`, `mural` (with glyph names), `shrine` (one of
  three), key taken, the Braziers countdown on the countdown bar and its expiry line. None on a first broadcast.
- The gate as a wall stroke on the minimap while shut.

## Acceptance Criteria

- [ ] The parser keeps the three keys; unknown piece kinds draw nothing and do not throw.
- [ ] Each piece draws in the frame its state names; a block slides over the push time.
- [ ] Each R53 line fires on its event and not on a first broadcast.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-5FZ4J-8 (the sheets).

## Spec Reference

FS-5FZ4J §I R46, R48, R49; §J R51–R53, R56.
