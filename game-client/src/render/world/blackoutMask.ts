/**
 * The indoor blackout's mask (FS-9PN7X §D, the owner's pixel model): while the player stands in
 * building B, nothing outside the px B itself draws is seen. We know exactly what B draws, so the
 * mask is made of it: B's floor inside its walls, its walls and posts in the interior look, and
 * everything standing in it (furnishings, dressing, people, monsters, containers, effects), each
 * drawn into a hidden render texture where it stands. One full-view rect of `palette.inkDeep`
 * covers the world wherever that texture holds nothing (an inverted bitmap mask), so the ground
 * along a wall's outer face, under the front walls and over the back walls' coping goes dark to
 * the px, whatever else stands there. A second dark, at the top of the ground band and cut by B's
 * floor, lies under every world object: a px of B that is only partly opaque (a wall's contact
 * shadow, a soft edge) is drawn over the dark, never over the ground beside the building.
 *
 * The texture lives in the world, over B (its own camera looks from its corner, rounding as the
 * main camera does), so a camera that pans or eases needs no redraw: it is redrawn only when
 * something of B changed, as `stampKey` sees it. Bitmap masks are WebGL's; under the canvas
 * renderer the blackout keeps its geometric dark (`Blackout`), as the silhouette keeps its tint.
 *
 * This module only draws. What belongs to B is the scene's rule (`BuildingView`, by footprint).
 */

import type Phaser from "phaser";
// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { WORLD_DEPTH, projectRect } from "@/render/iso/shapes";
import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import type { House } from "./houses";

/**
 * Screen px the mask reaches past the building's projected floor (and, above, past its walls'
 * top): room for whoever stands in it to be drawn whole. Above is the tallest: a character by the
 * back wall stands up to 128 px over its feet (`char_wizard_base`, 170 px at anchor 0.75), with
 * a cast effect or a lifted projectile over that.
 */
export const MASK_MARGIN = { side: 160, above: 320, below: 96 } as const;

/**
 * The second dark's depth: the top of the ground band, under every object in the world band
 * (≥ `WORLD_DEPTH`). Cut by B's floor, it blacks out the ground (and whatever lies flat on it)
 * outside the floor, so a px of B that is only partly opaque (a wall's contact shadow, a
 * sprite's soft edge) lies over the dark, never over the ground beside the building. The mask's
 * dark over the world then takes everything else outside B's px.
 */
export const MASK_UNDER_DEPTH = WORLD_DEPTH - 0.5;

/** A container a stamp sits in: only its offset and whether it shows are read. */
export interface StampParent {
  x: number;
  y: number;
  visible: boolean;
  parentContainer: StampParent | null;
}

/**
 * A display object drawn into the mask where it stands: a wall piece, a prop, a body, an effect.
 * Its look (frame, flip, alpha, children, text, drawing) is read for `stampKey` when it has one.
 */
export type Stamp = StampParent;

/** What the mask is made of: one building and everything drawn as its own. */
export interface MaskLook {
  house: House;
  /** Its walls' thickness in world px: the floor runs to their centrelines, never past a face. */
  wall: number;
  /** How tall its walls stand in screen px: the mask's room above starts over them. */
  wallTop: number;
  stamps: readonly Stamp[];
}

/**
 * The building's floor as the mask holds it: its rect inset by half its walls' thickness (their
 * centrelines), projected. Every wall covers its own footprint, so the floor's edge is always
 * under a wall, and in a door gap it stops at the threshold's middle.
 */
export function maskFloor(house: House, wall: number): Point[] {
  const inset = wall / 2;
  return projectRect(house.x + inset, house.y + inset, house.width - wall, house.height - wall);
}

/** Up to the next even integer. */
const even = (n: number) => n + (n & 1);

/**
 * Where the mask's texture stands, in world screen px: the building's projected rect and walls,
 * with {@link MASK_MARGIN} around. Whole px with even sides, so with an integer camera scroll
 * (`roundPixels` floors it) the mask's px are the screen's.
 */
export function maskBounds(house: House, wallTop: number): { x: number; y: number; width: number; height: number } {
  const [top, right, bottom, left] = projectRect(house.x, house.y, house.width, house.height);
  const x = Math.floor(left.x - MASK_MARGIN.side);
  const y = Math.floor(top.y - wallTop - MASK_MARGIN.above);
  const width = even(Math.ceil(right.x + MASK_MARGIN.side) - x);
  const height = even(Math.ceil(bottom.y + MASK_MARGIN.below) - y);
  return { x, y, width, height };
}

/**
 * Where a stamp is drawn: its position with its containers' offsets added (the scenes never scale
 * or turn a container a stamp sits in), or undefined while it or any container is hidden.
 */
export function drawnAt(stamp: Stamp): Point | undefined {
  if (!stamp.visible) return undefined;
  let x = stamp.x;
  let y = stamp.y;
  for (let p = stamp.parentContainer; p; p = p.parentContainer) {
    if (!p.visible) return undefined;
    x += p.x;
    y += p.y;
  }
  return { x, y };
}

/** The parts of a display object's look that change the px it draws, where it has them. */
interface Looks {
  alpha?: number;
  texture?: { key: string };
  frame?: { name: string | number };
  flipX?: boolean;
  flipY?: boolean;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  text?: string;
  commandBuffer?: readonly unknown[];
  list?: readonly unknown[];
}

/** A checksum of a Graphics' commands: a redrawn bar or block draws other px. */
function commandsKey(commands: readonly unknown[]): string {
  let h = 0;
  for (const c of commands) if (typeof c === "number") h = (Math.imul(h, 31) + Math.round(c * 1024)) | 0;
  return `${commands.length}:${h}`;
}

/** One object's look and placement, its children's too. */
function lookKey(o: Partial<StampParent> & Looks): string {
  const parts: unknown[] = [
    o.x,
    o.y,
    o.visible ? 1 : 0,
    o.alpha,
    o.texture?.key,
    o.frame?.name,
    o.flipX ? 1 : 0,
    o.flipY ? 1 : 0,
    o.scaleX,
    o.scaleY,
    o.rotation,
  ];
  if (o.text !== undefined) parts.push(o.text);
  if (o.commandBuffer) parts.push(commandsKey(o.commandBuffer));
  if (o.list) parts.push(`[${o.list.map((c) => lookKey(c as Looks)).join(",")}]`);
  return parts.join("|");
}

/**
 * What a stamp draws, as a string: equal keys draw the same px. Its look, where it is drawn and
 * whether it shows (containers' offsets and visibility included).
 */
export function stampKey(stamp: Stamp): string {
  const at = drawnAt(stamp);
  return `${at ? `${at.x},${at.y}` : "-"}#${lookKey(stamp as Stamp & Looks)}`;
}

/** The whole mask as a string: the building, its walls, and each stamp in order. */
function maskKey(look: MaskLook): string {
  const { house: h } = look;
  return `${h.id}|${h.x},${h.y},${h.width},${h.height}|${look.wall}|${look.wallTop}|${look.stamps.map(stampKey).join(";")}`;
}

/** The slice of a render texture the mask is drawn into. */
interface MaskTexture {
  camera: { setScroll(x: number, y: number): unknown; roundPixels: boolean };
  setOrigin(x: number, y: number): this;
  setPosition(x: number, y: number): this;
  setVisible(visible: boolean): this;
  clear(): this;
  beginDraw(): this;
  batchDraw(entry: unknown, x?: number, y?: number): this;
  endDraw(): this;
  createBitmapMask(): Phaser.Display.Masks.BitmapMask;
  destroy(): void;
}

/** The dark itself: a rect fixed to the camera. */
interface DarkRect {
  width: number;
  height: number;
  setOrigin(x: number, y: number): this;
  setScrollFactor(factor: number): this;
  setDepth(depth: number): this;
  setVisible(visible: boolean): this;
  setSize(width: number, height: number): this;
  setMask(mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask): this;
  destroy(): void;
}

/** The floor's shape: drawn into the mask, and the stencil the ground's dark is cut by. */
interface FloorShape {
  clear(): this;
  fillStyle(color: number, alpha?: number): this;
  fillPoints(points: Point[], closeShape?: boolean): this;
  createGeometryMask(): Phaser.Display.Masks.GeometryMask;
  destroy(): void;
}

/** The slice of a Phaser scene the mask draws with. */
export interface BlackoutMaskStage {
  add: {
    renderTexture(x: number, y: number, width: number, height: number): MaskTexture;
    rectangle(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): DarkRect;
  };
  make: { graphics(config: object, addToScene?: boolean): FloorShape };
  cameras: { main: { width: number; height: number; roundPixels: boolean } };
}

export class BlackoutMask {
  private readonly camera: BlackoutMaskStage["cameras"]["main"];
  /**
   * B's px, redrawn when they change; never on screen itself, only as the dark's mask. Made the
   * first time the player steps in, and made again at another size for a building it does not
   * fit: Phaser 3.90's `resize` leaves a render texture's GL target at its old size.
   */
  private texture?: MaskTexture;
  private bitmap?: Phaser.Display.Masks.BitmapMask;
  private readonly dark: DarkRect;
  /** The ground band's dark, cut by the floor: what B's semi-transparent px lie over. */
  private readonly under: DarkRect;
  private readonly floor: FloorShape;
  private size = { width: 0, height: 0 };
  /** What was drawn last, while shown: the same again draws nothing. */
  private drawn?: string;

  constructor(
    private readonly stage: BlackoutMaskStage,
    depth: number,
  ) {
    this.camera = stage.cameras.main;
    const dark = (at: number) =>
      stage.add
        .rectangle(0, 0, this.camera.width, this.camera.height, palette.inkDeep, 1)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(at)
        .setVisible(false);
    this.dark = dark(depth);
    this.floor = stage.make.graphics({}, false);
    const cut = this.floor.createGeometryMask();
    cut.invertAlpha = true;
    this.under = dark(MASK_UNDER_DEPTH).setMask(cut);
  }

  /**
   * Once a frame: darkens everything but `look`'s building and what stands in it, redrawing the
   * mask only when that changed; undefined puts the dark out (the player is in no building).
   */
  show(look: MaskLook | undefined): void {
    if (!look) {
      this.dark.setVisible(false);
      this.under.setVisible(false);
      this.drawn = undefined;
      return;
    }
    const { width, height } = this.camera;
    for (const d of [this.dark, this.under]) {
      if (d.width !== width || d.height !== height) d.setSize(width, height);
      d.setVisible(true);
    }
    const key = maskKey(look);
    if (key === this.drawn) return;
    this.drawn = key;
    this.redraw(look);
  }

  destroy(): void {
    this.drawn = undefined;
    this.dark.destroy();
    this.under.destroy();
    this.bitmap?.destroy();
    this.texture?.destroy();
    this.floor.destroy();
  }

  /** The texture, `width` × `height`: the one there is, or a fresh one masking the dark. */
  private fitted(width: number, height: number): MaskTexture {
    if (this.texture && width === this.size.width && height === this.size.height) return this.texture;
    this.bitmap?.destroy();
    this.texture?.destroy();
    const texture = this.stage.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setVisible(false);
    const bitmap = texture.createBitmapMask();
    bitmap.invertAlpha = true;
    this.dark.setMask(bitmap);
    this.texture = texture;
    this.bitmap = bitmap;
    this.size = { width, height };
    return texture;
  }

  /** Draws the floor, then every stamp shown where it stands, into the texture over the building. */
  private redraw(look: MaskLook): void {
    const b = maskBounds(look.house, look.wallTop);
    const texture = this.fitted(b.width, b.height);
    texture.setPosition(b.x, b.y);
    texture.camera.setScroll(b.x, b.y);
    texture.camera.roundPixels = this.camera.roundPixels;
    // only its alpha counts: the mask's colour is never seen
    this.floor.clear().fillStyle(palette.inkDeep, 1).fillPoints(maskFloor(look.house, look.wall), true);

    texture.clear().beginDraw();
    texture.batchDraw(this.floor, 0, 0);
    for (const stamp of look.stamps) {
      const at = drawnAt(stamp);
      if (at) texture.batchDraw(stamp, at.x, at.y);
    }
    texture.endDraw();
  }
}
