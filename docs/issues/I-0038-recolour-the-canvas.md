---
id: I-0038
status: done
implements: FS-0005
blocked_by: [I-0037]
labels: [blocked]
title: "FS-0005 slice 3: recolour all 377 canvas sites onto the semantic palette"
---
Implements FS-0005 §Requirements 14-18, 23-24

The bulk of the diff. Mechanical but very wide — one operation repeated across seven files.

## What to Build

### Move every presentation colour site onto the palette (§R14)

| File | Sites |
|---|---|
| `src/scenes/BarrowspireScene.ts` | 245 |
| `src/scenes/MainMenuScene.ts` | 62 |
| `src/ui/EquipmentPanel.ts` | 40 |
| `src/scenes/LoadoutScene.ts` | 16 |
| `src/utils/spriteGenerator.ts` | 8 |
| `src/scenes/PreloadScene.ts` | 3 |
| `src/utils/class/SocketManager.ts` | 3 (the user-visible connection-status colours only) |

`SocketManager`'s fourth hex is a `console.log('%c…')` and is **out of scope** — devtools console
styling is not presentation. Same reason `gameStateLogger.ts` is excluded entirely.

### Purge the off-palette values (§R15)

Known set — the fence defines completeness, not this list:

- **sci-fi slate ramp:** `0x4a5568` (13×), `0x3a4556` (10×), `0x2a3040`, `0x5a6577`, `0x6b7280`
- **mint:** `0x4ecca3` (8×) — the same residue FS-0004 cleared from the web CSS
- **raw extremes:** `0xffffff` (11×), `0x000000` (11×)
- **off-ramp glow:** `0xffaa44` (8×), `0xaaddff`, `0xf2e3b8`
- **strays:** `0xff4466`, `0x4a4a44`, `0xb8d08a`

### Re-examine amber against the accent rule (§R16)

Amber appears **65 times**. This is not a reduction target — I-0036's rule says amber means
*interactable or actionable*, so the test is semantic:

> **An amber thing the player cannot act on is a defect.**

Health bars, damage numbers and neutral counters are not interactables; they move to their proper
channel. A door, a chest, a switch, an escape point stays amber. Expect the count to fall, but the
criterion is meaning, not arithmetic.

### The delver sprite (§R17)

`spriteGenerator.ts` draws the **player character** — cloak, cloak shadow, ink outline, hood
shadow. Its values are already barrow-toned but hardcoded, and its `ink` is the stale `0x0d0b0a`
base. The most-looked-at object in the game gets the same treatment as everything else.

### PreloadScene, end to end (§R18, §R24)

The `0x222222` box, the white progress bar, the `#ffffff` text and the literal `"Loading..."`.
**This is the first frame a player ever sees** and currently reads as a stock Phaser demo. Copy
takes the lore voice, subject to the standing rule that a message the player needs in order to act
stays plain.

### Voice (§R23)

`operator` / `Operator` at `BootScene.ts:42,47` and the version string at `MainMenuScene.ts:296`.
Both were already on `CLAUDE.md`'s never-use list while shipping — the list was never enforced.
Conform to `CONTEXT.md`: delvers, the Spire, the barrow-deep.

## Acceptance Criteria

- [ ] All 377 presentation colour sites resolve from the semantic palette
- [ ] Every off-palette value in §R15 is gone
- [ ] Every remaining amber use marks something interactable or actionable
- [ ] The delver sprite's colours resolve from the palette, stale base included
- [ ] `PreloadScene` is fully themed — box, progress bar, text colour and copy
- [ ] No `operator` or sci-fi version string in canvas copy
- [ ] `gameStateLogger.ts` and `SocketManager`'s console call are untouched
- [ ] The game renders and plays — walls, doors, containers, enemies and HUD all still legible
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0037 — consumes the palette module and the font constant.

## Spec Reference

FS-0005 §Requirements 14-18, 23-24 (§D. Recolour the canvas, §F. Voice); §User Stories 3, 4, 5, 6,
10, 11, 14, 18; §Edge States (HUD text at small sizes on a busy background); §Risks (the 245-site
scene is why the palette module exists — if its names do not fit what the scene draws, fix the
names rather than falling back to raw lookups).
