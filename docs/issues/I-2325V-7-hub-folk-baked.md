---
id: I-2325V-7
status: open
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V slice 7: hub villagers and function NPCs baked on the shared rig; hostile eye tint"
---
Implements FS-2325V §G

**Can run in parallel with I-2325V-6.** This slice owns `tools/bake/`, `public/art/`, the hub NPC
code in `HubScene.ts`, and the villager part of `src/utils/characterTextures.ts`.

## What to Build

1. **Villagers:** author the builds used by hub `appearance` values (`"<palette>_<build>"`, as
   read by `ensureVillagerTexture`) on the shared rig. Bake one sheet per build with palette
   variants covering every value in use, each with 8 directions, idle and walk. An unknown value
   falls back to a default villager.
2. **Function NPCs:** author a distinct character for each hub function NPC, whose role reads
   from the silhouette (e.g. a quartermaster, a delve-warden). No brass tint, no delver class
   body.
3. **Hub integration:** residents and function NPCs play the baked sheets through the same
   `CharacterAnimator` path as delvers, standing on their footprint anchor. Name plates stay
   markers (§C.9).
4. **Hostile eyes:** re-tint the ghoul's and troll's eyes into the hostile channel (ember red from
   the oxblood family, per the guideline's *Enemy design language*). They are amber today.
5. **Contact sheet:** regenerate it and include the new folk.

## Acceptance Criteria

- [ ] Every hub NPC renders from a baked sheet. No `ensureVillagerTexture` pixel texture or
      brass-tinted warrior remains on the baked path.
- [ ] Every `appearance` value the hub sends resolves to a sheet or the default villager.
- [ ] Ghoul and troll eyes are in the hostile channel, not amber.
- [ ] The bake stays deterministic. The manifest schema test passes and atlases are ≤ 4096².
- [ ] No WS or server change. `git diff main... -- game-server/` is empty.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

None

## Spec Reference

FS-2325V §G.1–G.5.

## TDD Approach

- RED: `appearance` → sheet/variant resolution test, including the unknown-value fallback.
- GREEN: a resolver in `src/render/art/` used by HubScene.
