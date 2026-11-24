---
id: I-9JV5K-4
status: open
implements: FS-9JV5K
blocked_by: [I-5FZ4J-8]
labels: [ready-for-agent]
title: "FS-9JV5K slice 4: bake the wandering merchant and the antidote icon, with a contact sheet"
---
Implements FS-9JV5K §G R26

**Files:** `game-client/tools/bake/`, `game-client/public/art/`, `game-client/src/render/art/`
(the on-demand table entry, manifest pins, icon resolver rule for `ANTIDOTE`). Not
`BarrowspireScene.ts` or `gameState.ts`.

## What to Build

The merchant as a townsfolk build with a heavy pack, a lantern and a travel-worn cloak (faces per
FS-67QQY), idle in eight directions, Ultima Online fidelity, `BARROW` colours; his own on-demand
group with a stand-in (ADR-0071 / ADR-0088 pattern; the client slice wires the fetch). The antidote
icon in `models/items.js` `ICONS` and the resolver rule. The merchant joins the contact-sheet review.

## Acceptance Criteria

- [ ] `npm run bake` then `npm run bake -- --check` pass; sheets pinned; the antidote icon resolves for `ANTIDOTE`.
- [ ] A contact sheet of the merchant (and the icon) is written; its path reported.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-5FZ4J-8 (one writer at a time in the bake tool).

## Spec Reference

FS-9JV5K §G R26.
