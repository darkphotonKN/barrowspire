/**
 * The rune's look (FS-X2CMM §I R47): a madder ring on the floor, 1.5 cells across (R24), that pulses
 * slowly and flashes when it catches: each time its `caught` count climbs, a bright ring flares over the
 * light-map and its ring swells a little, easing back. Binding madder (`palette.bookPigment`'s, through
 * `palette.bookEffect`), kept off oxblood (damage). Its faint halo keeps it readable in the barrow's dark.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookEffects.ts`
 * places it. Pure: no Phaser.
 */

import type { EffectLook, LookBrush, LookClock } from "@/render/world/bookLook";
import { worldToScreen } from "@/render/iso/projection";
import { groundEllipse, presence, wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** The rune's numbers. v1, to tune at the gallery. */
export const RUNE = {
  /** Its radius in cells (R24); the set gives it the floor's cell size. */
  radiusCells: 0.75,
  /** A floor's cell, world px, when the set is given none. */
  cell: 80,
  /** Its slow pulse: alpha swing and period. */
  pulse: { swing: 0.2, periodMs: 2200 },
  /** A catch's flash: how long it eases out, and how far the ring swells at its height. */
  flash: { ms: 500, swell: 0.08 },
  inMs: 300,
  outSeconds: 1,
} as const;

/** How bright the catch flash is this frame, 1 at the catch, 0 once it has eased out (Quad.out). */
export function runeFlash(clock: LookClock): number {
  const k = Math.min(1, Math.max(0, clock.sinceFlashMs / RUNE.flash.ms));
  return (1 - k) * (1 - k);
}

/** The rune's radius in world px at this frame: its own, swollen a little by a flash. */
function radiusAt(clock: LookClock, cell: number): number {
  return RUNE.radiusCells * cell * (1 + RUNE.flash.swell * runeFlash(clock));
}

/** The three strokes crossing at its centre, as the Binding Glyph's page shows them (R45). */
function paintStrokes(g: LookBrush, radius: number): void {
  for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const a = worldToScreen(Math.cos(turn) * radius * 0.55, Math.sin(turn) * radius * 0.55);
    g.lineBetween(-a.x, -a.y, a.x, a.y);
  }
}

/** The rune's look for a floor of `cell` world px per cell. */
export function runeLook(cell: number = RUNE.cell): EffectLook {
  const ground = (g: LookBrush, clock: LookClock) => {
    const shown = presence(clock, RUNE.inMs, RUNE.outSeconds);
    const breath = 1 - RUNE.pulse.swing * (0.5 + 0.5 * wave(clock, RUNE.pulse.periodMs));
    const radius = radiusAt(clock, cell);
    const outer = groundEllipse(radius);
    const inner = groundEllipse(radius * 0.78);
    g.fillStyle(palette.bookEffect.rune, 0.12 * shown);
    g.fillEllipse(0, 0, outer.width, outer.height);
    g.lineStyle(2, palette.bookEffect.rune, 0.85 * breath * shown);
    g.strokeEllipse(0, 0, outer.width, outer.height);
    g.lineStyle(1, palette.bookEffect.rune, 0.6 * breath * shown);
    g.strokeEllipse(0, 0, inner.width, inner.height);
    paintStrokes(g, radius);
  };
  const halo = (g: LookBrush, clock: LookClock) => {
    const shown = presence(clock, RUNE.inMs, RUNE.outSeconds);
    const flash = runeFlash(clock);
    const outer = groundEllipse(radiusAt(clock, cell));
    g.lineStyle(1 + 2 * flash, palette.bookEffect.runeFlash, (0.18 + 0.7 * flash) * shown);
    g.strokeEllipse(0, 0, outer.width, outer.height);
  };
  return { layers: { ground, halo } };
}
