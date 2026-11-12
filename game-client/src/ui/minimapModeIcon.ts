/**
 * The map mode icon (FS-56CKV §Change: Map mode icon; CONTEXT.md "Map mode icon"): a small amber
 * glyph in the minimap's bottom-left corner, normal and enlarged, and beside the fullscreen button
 * while the map overlay is up, in a run, the town and a field. Hovered it brightens and shows
 * "Map mode (M)" beside the map; a press does what M does, under M's guards. The owner's words
 * (2026-11-12): "右上角地圖左下角多加小icon hover顯示可以切換大小或是模式(M)".
 *
 * Game palette, tokens only (ADR-0013, ADR-0025): the glyph in the interactable amber on the map
 * marks' dark ring, as a mark is built (`glyphRects`); the hint on the canvas item tip's ground.
 * It hit-tests in logical units, from the scene's own pointer listeners, as the satchel and the
 * HUD panels do (FS-ZAJMH R15): nothing of it is a Phaser hit area, so it takes no wheel, starts
 * no drag and reaches nothing outside its own 13 × 13.
 *
 * Draws through {@link ModeIconStage}, the narrow slice of Phaser it needs. Its place is the
 * top-right corner's ({@link minimapModeIconPlace}, from `topRightCorner`).
 */

import type { Rect } from "@/render/iso/projection";
import { crispen } from "@/render/viewport/crispen";
import { FULLSCREEN_BUTTON, type FullscreenButtonSpot } from "@/render/viewport/fullscreenButton";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { paintTipGround, type TipGroundGraphics } from "./itemTip";
import { MINIMAP, MINIMAP_GLYPH, glyphRects } from "./minimap";

/**
 * The icon (D1–D3, D5): its 7 × 7 art, `#` inked, `o` the shape's own dark, on the marks' 1 px
 * ring, so a 9 × 9 tile; `inset` px in from the map's left and bottom edges, the same in either
 * size; `gap` px left of the fullscreen button in the overlay; its hit area `pad` px round its
 * box; drawn over the minimap's layers.
 */
export const MINIMAP_MODE_ICON = {
  // two nested squares round a dark middle: the map's sizes, one inside the next
  art: ["#######", "#ooooo#", "#o###o#", "#o#o#o#", "#o###o#", "#ooooo#", "#######"],
  inset: MINIMAP.inset,
  gap: MINIMAP.gap,
  pad: 2,
  depth: MINIMAP.depth + 1,
} as const;

/**
 * Its hint (D7): the words, the type and padding of the fullscreen button's hint (FS-56CKV §Change
 * C9), its right edge `gap` px left of the map (or the icon), over the HUD.
 */
export const MINIMAP_MODE_HINT = {
  text: "Map mode (M)",
  fontSize: "12px",
  padding: { x: 8, y: 3 },
  gap: MINIMAP.gap,
  depth: MINIMAP.depth + 2,
} as const;

/** Where the icon stands: its box, its hit area, and where its hint hangs (its right edge and middle). */
export interface MinimapModeIconPlace {
  box: Rect;
  hit: Rect;
  hint: { right: number; middle: number };
}

/**
 * The icon's place (D2–D4), on whole logical px: 4 px inside `map`'s bottom-left where a map is
 * shown in the corner; with the `overlay` up, `gap` px left of the fullscreen button at `button`,
 * centred on its height; nowhere with neither. The hint's right edge `gap` px left of the map, or
 * of the icon in the overlay, its middle on the icon's.
 */
export function minimapModeIconPlace(
  map: Rect | null,
  overlay: boolean,
  button: FullscreenButtonSpot,
  view: { width: number },
): MinimapModeIconPlace | null {
  const size = MINIMAP_GLYPH.box;
  const { inset, gap, pad } = MINIMAP_MODE_ICON;
  let x: number;
  let y: number;
  if (map) {
    x = Math.round(map.x) + inset;
    y = Math.round(map.y + map.height) - inset - size;
  } else if (overlay) {
    const buttonLeft = Math.round(view.width - button.right - FULLSCREEN_BUTTON.height);
    x = buttonLeft - gap - size;
    y = Math.round(button.top + (FULLSCREEN_BUTTON.height - size) / 2);
  } else return null;
  const box = { x, y, width: size, height: size };
  return {
    box,
    hit: { x: x - pad, y: y - pad, width: size + pad * 2, height: size + pad * 2 },
    hint: { right: (map ? Math.round(map.x) : x) - MINIMAP_MODE_HINT.gap, middle: y + size / 2 },
  };
}

/** What of a Phaser game object the icon stands, layers and shows. */
interface ModeIconObject {
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setScrollFactor(factor: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/** What of a Phaser Graphics the icon draws its glyph and its hint's ground with. */
export interface ModeIconGraphics extends ModeIconObject, TipGroundGraphics {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** What of a Phaser Text the hint is. */
export interface ModeIconText extends ModeIconObject {
  readonly width: number;
  readonly height: number;
}

/** What the icon asks of the scene: `this.add.graphics` and `this.add.text`. */
export interface ModeIconStage {
  graphics(): ModeIconGraphics;
  text(words: string, style: { fontFamily: string; fontSize: string; color: string }): ModeIconText;
}

export interface ModeIconParts {
  /** What a press does: the scene's M. */
  press: () => void;
  /** Whether M's guards hold now (the menu, chat typing, a panel owning the keys): a press then does nothing. */
  blocked: () => boolean;
}

const GLYPH = glyphRects(MINIMAP_MODE_ICON.art);

/** Whether two places stand the icon's box at one spot. */
const sameBox = (a: MinimapModeIconPlace | null, b: MinimapModeIconPlace | null) =>
  a === b || (!!a && !!b && a.box.x === b.box.x && a.box.y === b.box.y && a.hint.right === b.hint.right);

const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

export class MinimapModeIcon {
  private readonly glyph: ModeIconGraphics;
  private readonly ground: ModeIconGraphics;
  private readonly hint: ModeIconText;
  private at: MinimapModeIconPlace | null = null;
  private lit = false;
  /** Whether the glyph was last drawn lit; none before its first draw. */
  private drawnLit?: boolean;

  constructor(
    stage: ModeIconStage,
    private readonly parts: ModeIconParts,
  ) {
    // made bottom to top: the glyph, then the hint's ground and its words
    this.glyph = stage.graphics();
    this.ground = stage.graphics();
    this.hint = stage.text(MINIMAP_MODE_HINT.text, {
      fontFamily: CANVAS_FONT.body,
      fontSize: MINIMAP_MODE_HINT.fontSize,
      color: toCss(palette.hudText),
    });
    this.glyph.setScrollFactor(0);
    this.glyph.setDepth(MINIMAP_MODE_ICON.depth);
    for (const o of [this.ground, this.hint]) {
      o.setScrollFactor(0);
      o.setDepth(MINIMAP_MODE_HINT.depth);
    }
    this.place(null);
  }

  /** Where it stands now, or null while no minimap is shown. */
  get shownAt(): MinimapModeIconPlace | null {
    return this.at;
  }

  /** Whether it is lit under the pointer, its hint up. */
  get hovered(): boolean {
    return this.lit;
  }

  /**
   * Stood at `at`, or hidden and taking nothing with null (D4). Moved, a hover is dropped, as the
   * pointer no longer lies on it; laid out again where it stood, a hover stays.
   */
  place(at: MinimapModeIconPlace | null): void {
    const moved = !sameBox(this.at, at);
    this.at = at;
    this.glyph.setVisible(at !== null);
    if (at) this.glyph.setPosition(at.box.x, at.box.y);
    // rasterised again at the render scale of now (FS-ZAJMH R5)
    crispen([this.hint]);
    if (moved || this.drawnLit === undefined) this.light(false);
  }

  /** Whether (x, y), in logical units, lies in its hit area (D5). */
  covers(x: number, y: number): boolean {
    return this.at !== null && inside(this.at.hit, x, y);
  }

  /** The pointer at (x, y): lit, its hint up, while over it and a press would act (D7). */
  pointerMove(x: number, y: number): void {
    this.light(this.covers(x, y) && !this.parts.blocked());
  }

  /** The pointer left the canvas. */
  pointerOut(): void {
    this.light(false);
  }

  /**
   * A press at (x, y): whether it is the icon's, in its hit area, any button. A primary press steps
   * the mode as M does unless M's guards hold (D6).
   */
  pointerDown(x: number, y: number, primary = true): boolean {
    if (!this.covers(x, y)) return false;
    if (primary && !this.parts.blocked()) this.parts.press();
    return true;
  }

  destroy(): void {
    this.at = null;
    this.lit = false;
    this.drawnLit = false;
    this.glyph.destroy();
    this.ground.destroy();
    this.hint.destroy();
  }

  /** Lit or not: the glyph's ink, and the hint shown or hidden; drawn again only when that changes. */
  private light(on: boolean): void {
    const lit = on && this.at !== null;
    if (lit === this.drawnLit) return;
    this.lit = lit;
    this.drawnLit = lit;
    this.drawGlyph(lit);
    this.ground.setVisible(lit);
    this.hint.setVisible(lit);
    if (lit) this.drawHint(this.at!);
  }

  /** Its ring's dark, then its ink, amber or bright amber (D1), each px on a whole logical px of its box. */
  private drawGlyph(lit: boolean): void {
    const g = this.glyph;
    const ring = MINIMAP_GLYPH.ring;
    g.clear();
    g.fillStyle(palette.markerStroke, 1);
    for (const r of GLYPH.ring) g.fillRect(r.x + ring, r.y + ring, r.w, r.h);
    g.fillStyle(lit ? palette.interactableBright : palette.interactable, 1);
    for (const r of GLYPH.ink) g.fillRect(r.x + ring, r.y + ring, r.w, r.h);
  }

  /** The hint on the item tip's ground, its right edge on `at.hint.right`, its middle on the icon's (D7). */
  private drawHint(at: MinimapModeIconPlace): void {
    const { padding } = MINIMAP_MODE_HINT;
    const width = Math.ceil(this.hint.width) + padding.x * 2;
    const height = Math.ceil(this.hint.height) + padding.y * 2;
    const x = Math.round(at.hint.right - width);
    const y = Math.round(at.hint.middle - height / 2);
    const g = this.ground;
    g.clear();
    paintTipGround(g, width, height);
    g.setPosition(x, y);
    this.hint.setPosition(x + padding.x, y + padding.y);
  }
}
