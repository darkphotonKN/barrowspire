---
id: I-9JV5K-5
status: done
implements: FS-9JV5K
blocked_by: [I-9JV5K-4, I-5FZ4J-11]
labels: [ready-for-agent]
title: "FS-9JV5K slice 5: the client draws the merchant, opens the wares panel, buys, and drinks an antidote"
---
Implements FS-9JV5K §F R21–R25, §A R4 (the wire), §B R5 (the action)

**Hotspot:** `gameState.ts`, `BarrowspireScene.ts`, `src/assets/types/client.ts`, the UI scene,
`GearOverlay.ts`. One writer at a time.

## What to Build

- `merchant` parsed; the merchant drawn from his on-demand sheet (stand-in until loaded), nameplate,
  lantern light, E target; joins the hide rule.
- The wares panel in the UI scene through the typed bridge: rows, prices, left, Buy, the purse line
  (a `PurseReader` with its own shelf), disabled states, *"Paying…"*, every reason's line (§F R23),
  purse refresh after an answer.
- `buy` and `use_item` in the action map (replace the unused `use` entry with `use_item
  {item_entity_id}`); Drink on a bagged antidote in the gear overlay; `not_poisoned` line; the
  shimmer on success.

## Acceptance Criteria

- [ ] Every FS-9JV5K game-client acceptance criterion.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-9JV5K-4 (art), I-5FZ4J-11 (client lane order).

## Spec Reference

FS-9JV5K §A R4, §B R5, §F R21–R25.
