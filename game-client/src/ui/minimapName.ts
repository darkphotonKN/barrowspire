/**
 * The map name (FS-56CKV §Change: Map name; CONTEXT.md "Map name"): the name of the place the
 * minimap shows, in small vellum on a faint dark plate. Inside the map's top-right in its normal
 * mode; left of the fullscreen button with the map enlarged; left of the map mode icon while the
 * map overlay is up; in a run, the town and a field. The owner's words (2026-11-12):
 * "小地圖右上角顯示目前地圖的名字", then "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊".
 *
 * The words are the arrival card's title for the place (FS-PQ2TW R19, R23): one table. Game
 * palette, tokens only (ADR-0013, ADR-0025). It gives way to what the scene says stands over it
 * (a shown target frame, the town's queue line): hidden while its plate meets one.
 *
 * Draws through {@link MinimapNameStage}, the map mode icon's text factory. Its place is the
 * top-right corner's ({@link minimapNamePlace}, from `topRightCorner`).
 */

import type { Rect } from "@/render/iso/projection";
import { crispen } from "@/render/viewport/crispen";
import { FULLSCREEN_BUTTON, type FullscreenButtonSpot } from "@/render/viewport/fullscreenButton";
import { CANVAS_FONT, palette, rgba, toCss } from "@/utils/canvasPalette";
import { MINIMAP } from "./minimap";
import type { MinimapMode } from "./minimapMode";
import type { MinimapModeIconPlace, ModeIconText } from "./minimapModeIcon";
import { placeCard, type Place } from "./placeCard";

/**
 * Its look and place (E2–E5): 11 px vellum letter-spaced 1, on a `hudPanel` plate at 0.75 padded
 * 4 × 2; `inset` px inside the normal map's top-right, or `gap` px left of the button (enlarged) or
 * the icon (overlay); over the map's layers, under the icon's hint.
 */
export const MINIMAP_NAME = {
  fontSize: "11px",
  letterSpacing: 1,
  colour: palette.hudText,
  plate: palette.hudPanel,
  plateAlpha: 0.75,
  padding: { x: 4, y: 2 },
  inset: MINIMAP.inset,
  gap: MINIMAP.gap,
  depth: MINIMAP.depth + 1,
} as const;

/** The place's name (E1): the arrival card's title for it, never a second list. */
export function minimapPlaceName(place: Place): string {
  return placeCard(place).title;
}

/** Where the name stands: its plate's right edge, and its top or its middle on `y`. */
export interface MinimapNamePlace {
  right: number;
  y: number;
  align: "top" | "middle";
}

/**
 * The name's place (E3–E6), on whole logical px: 4 px inside the normal map's top-right; `gap` px
 * left of the fullscreen button at `button` with the map enlarged, centred on its height; `gap` px
 * left of the map mode icon in the overlay, centred on the button's height; nowhere with no map.
 */
export function minimapNamePlace(
  map: Rect | null,
  mode: MinimapMode | undefined,
  button: FullscreenButtonSpot,
  icon: MinimapModeIconPlace | null,
  view: { width: number },
): MinimapNamePlace | null {
  const { inset, gap } = MINIMAP_NAME;
  const middle = button.top + FULLSCREEN_BUTTON.height / 2;
  if (map && mode === "enlarged") {
    const buttonLeft = Math.round(view.width - button.right - FULLSCREEN_BUTTON.height);
    return { right: buttonLeft - gap, y: middle, align: "middle" };
  }
  if (map) return { right: Math.round(map.x + map.width) - inset, y: Math.round(map.y) + inset, align: "top" };
  if (mode === "overlay" && icon) return { right: icon.box.x - gap, y: middle, align: "middle" };
  return null;
}

/** The plate's box at `at` for a text of `size`, on whole logical px. */
export function minimapNameBox(at: MinimapNamePlace, size: { width: number; height: number }): Rect {
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  const y = at.align === "top" ? Math.round(at.y) : Math.round(at.y - height / 2);
  return { x: Math.round(at.right) - width, y, width, height };
}

/** What the name asks of the scene: `this.add.text`, the map mode icon's own factory. */
export interface MinimapNameStage {
  text(
    words: string,
    style: {
      fontFamily: string;
      fontSize: string;
      color: string;
      backgroundColor: string;
      padding: { x: number; y: number };
      letterSpacing: number;
    },
  ): ModeIconText;
}

const meets = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export class MinimapName {
  private readonly text: ModeIconText;
  private at: MinimapNamePlace | null = null;
  private covers: readonly (Rect | null | undefined)[] = [];
  private visible = false;

  constructor(
    stage: MinimapNameStage,
    readonly words: string,
  ) {
    this.text = stage.text(words, {
      fontFamily: CANVAS_FONT.body,
      fontSize: MINIMAP_NAME.fontSize,
      color: toCss(MINIMAP_NAME.colour),
      backgroundColor: rgba(MINIMAP_NAME.plate, MINIMAP_NAME.plateAlpha),
      padding: { ...MINIMAP_NAME.padding },
      letterSpacing: MINIMAP_NAME.letterSpacing,
    });
    this.text.setScrollFactor(0);
    this.text.setDepth(MINIMAP_NAME.depth);
    this.text.setVisible(false);
  }

  /** Where its plate stands now, or null while it has no place. */
  get box(): Rect | null {
    return this.at && minimapNameBox(this.at, this.text);
  }

  /** Whether it is drawn: placed, and given way to nothing. */
  get shown(): boolean {
    return this.visible;
  }

  /** Stood at `at`, rasterised at the render scale of now (FS-ZAJMH R5); hidden with null (E6). */
  place(at: MinimapNamePlace | null): void {
    this.at = at;
    const box = this.box;
    if (box) this.text.setPosition(box.x, box.y);
    crispen([this.text]);
    this.show();
  }

  /** Hidden while its plate meets one of `covers`, what stands at the top centre now (E7). */
  giveWay(covers: readonly (Rect | null | undefined)[]): void {
    this.covers = covers;
    this.show();
  }

  destroy(): void {
    this.at = null;
    this.visible = false;
    this.text.destroy();
  }

  private show(): void {
    const box = this.box;
    const on = box !== null && !this.covers.some((r) => r && meets(box, r));
    if (on === this.visible) return;
    this.visible = on;
    this.text.setVisible(on);
  }
}
