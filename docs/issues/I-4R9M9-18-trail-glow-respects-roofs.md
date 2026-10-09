---
id: I-4R9M9-18
status: done
implements: FS-4R9M9
blocked_by: []
labels: [ready-for-agent]
title: "Review fix: burning-trail glow doesn't show through roofs and walls"
---
Implements FS-4R9M9 R61 (trail presentation) — code-review MED.

**Domain:** game-client (BarrowspireScene.ts trail glow, render/world/trails.ts, LightMap). · **Lane:** agent.

## What to fix
- **MED** `BarrowspireScene.ts:327-334`: the trail glow mark sits at HALO_DEPTH (136) with ADD blend, above roofs/walls (roofs sort in the ~100–101 band via worldDepth()). Sconce halos already solve this with a `haloWhen` roof gate (`LightMap.ts:112-113`). Apply the same gate (hide/attenuate the glow when the trail lies under a roof the local delver is outside of), or draw the glow inside the world depth band. The ground bed at depth 0 is fine.
- Keep the client's ring inference as a fallback only — prefer `item_type` when present (the server adds it in I-4R9M9-16).

## Acceptance Criteria
- [ ] Test: a trail inside a roofed house is not glowing for a delver outside; visible when inside / no roof.
- [ ] vitest + tsc + lint-fence green.
