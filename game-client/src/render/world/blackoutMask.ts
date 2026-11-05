/**
 * The indoor blackout's mask (FS-9PN7X §D, the owner's pixel model): while the player stands in
 * building B, nothing outside the px B itself draws is seen. We know exactly what B draws, so the
 * mask is made of it: B's floor inside its walls, its walls and posts in the interior look, and
 * everything standing in it (furnishings, dressing, people, monsters, containers, effects), each
 * drawn into a hidden render texture where it stands. One full-view rect of `palette.inkDeep`
 * covers the world wherever that texture holds nothing (an inverted mask, `maskInView`), so the ground
 * along a wall's outer face, under the front walls and over the back walls' coping goes dark to
 * the px, whatever else stands there. A second dark, at the top of the ground band and cut by B's
 * floor, lies under every world object: a px of B that is only partly opaque (a wall's contact
 * shadow, a soft edge) is drawn over the dark, never over the ground beside the building.
 *
 * The texture lives in the world, over B (its own camera looks from its corner, rounding as the
 * main camera does), so a camera that pans or eases needs no redraw: it is redrawn only when
 * something of B changed, as `stampKey` sees it. Masks are WebGL's (Phaser 4's mask filter); under
 * the canvas renderer the blackout keeps its geometric dark (`Blackout`), as the silhouette keeps
 * its tint.
 *
 * This module only draws. What belongs to B is the scene's rule (`BuildingView`, by footprint).
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { WORLD_DEPTH, projectRect } from "@/render/iso/shapes";
import type { Point } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { roundAtAnyZoom, roundsPixels, viewport } from "@/render/viewport";
import { maskInView, type MaskCamera, type Maskable, type ViewMask } from "@/render/viewport/mask";
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
 * (the pixel grid floors it, `keepOnPixelGrid`) the mask's px are the screen's. At a render scale
 * the texture is laid over it on backing px ({@link maskPlacement}).
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
 * The mask's texture over `bounds` at `renderScale`: its corner moved back onto the 1/rs grid (a
 * whole backing px, as the main camera's scroll is: `keepOnPixelGrid`), and its size in backing px,
 * even, reaching past the far corner. At render scale 1 it is `bounds` itself.
 */
export function maskPlacement(
  bounds: { x: number; y: number; width: number; height: number },
  renderScale: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.floor(bounds.x * renderScale) / renderScale;
  const y = Math.floor(bounds.y * renderScale) / renderScale;
  const width = even(Math.ceil((bounds.x + bounds.width - x) * renderScale));
  const height = even(Math.ceil((bounds.y + bounds.height - y) * renderScale));
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
  /** Phaser types it a BaseCamera; a dynamic texture's camera is a full Camera, `preRender` and all. */
  camera: {
    roundPixels: boolean;
    renderRoundPixels: boolean;
    /** Phaser's types leave it off a BaseCamera; a render texture's Camera has it ({@link roundAtAnyZoom}). */
    preRender?: () => void;
    setScroll(x: number, y: number): unknown;
    setZoom(zoom: number): unknown;
    setOrigin(x: number, y: number): unknown;
  };
  setOrigin(x: number, y: number): this;
  setPosition(x: number, y: number): this;
  setScale(scale: number): this;
  setVisible(visible: boolean): this;
  clear(): this;
  /** Phaser 4: the entry drawn offset by (`x`, `y`) from where it stands, once `render` runs. */
  draw(entry: unknown, x?: number, y?: number): this;
  render(): unknown;
  destroy(): void;
}

/** The dark itself: a rect fixed to the camera. */
interface DarkRect extends Maskable {
  width: number;
  height: number;
  setOrigin(x: number, y: number): this;
  setScrollFactor(factor: number): this;
  setDepth(depth: number): this;
  setVisible(visible: boolean): this;
  setSize(width: number, height: number): this;
  destroy(): void;
}

/** The floor's shape: drawn into the mask, and the stencil the ground's dark is cut by. */
interface FloorShape {
  clear(): this;
  fillStyle(color: number, alpha?: number): this;
  fillPoints(points: Point[], closeShape?: boolean): this;
  destroy(): void;
}

/** The slice of a Phaser scene the mask draws with. */
export interface BlackoutMaskStage {
  add: {
    renderTexture(x: number, y: number, width: number, height: number): MaskTexture;
    rectangle(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): DarkRect;
  };
  make: { graphics(config: object, addToScene?: boolean): FloorShape };
  cameras: { main: { roundPixels: boolean } & MaskCamera };
}

export class BlackoutMask {
  private readonly camera: BlackoutMaskStage["cameras"]["main"];
  /**
   * B's px, redrawn when they change; never on screen itself, only as the dark's mask. Made the
   * first time the player steps in, and made again at another size for a building it does not
   * fit, not resized (ADR-0057 §Render textures): Phaser 3.90's `resize` left a render texture's
   * GL target at its old size; Phaser 4.2.1 fixed that, and making it again is kept as harmless
   * (it happens only on a building of another size, and the texture is redrawn then anyway).
   */
  private texture?: MaskTexture;
  /** The dark's mask, its source the texture: given the new one when the texture is made again. */
  private cut?: ViewMask;
  private readonly dark: DarkRect;
  /** The ground band's dark, cut by the floor: what B's semi-transparent px lie over. */
  private readonly under: DarkRect;
  private readonly floor: FloorShape;
  /** The texture's size in backing px. */
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
        .rectangle(0, 0, viewport.width, viewport.height, palette.inkDeep, 1)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(at)
        .setVisible(false);
    this.dark = dark(depth);
    this.floor = stage.make.graphics({}, false);
    this.under = dark(MASK_UNDER_DEPTH);
    maskInView(this.under, this.floor, this.camera, true);
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
    // the logical view: the camera draws it at the render scale (FS-ZAJMH R6)
    const { width, height } = viewport;
    for (const d of [this.dark, this.under]) {
      if (d.width !== width || d.height !== height) d.setSize(width, height);
      d.setVisible(true);
    }
    const key = `${viewport.renderScale}|${maskKey(look)}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.redraw(look);
  }

  destroy(): void {
    this.drawn = undefined;
    this.dark.destroy();
    this.under.destroy();
    this.texture?.destroy();
    this.floor.destroy();
  }

  /** The texture, `width` × `height`: the one there is, or a fresh one masking the dark. */
  private fitted(width: number, height: number): MaskTexture {
    if (this.texture && width === this.size.width && height === this.size.height) return this.texture;
    this.texture?.destroy();
    const texture = this.stage.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setVisible(false);
    // its stamps rounded to backing px as the main camera rounds the world, fractional zoom too
    roundAtAnyZoom(texture.camera, () => roundsPixels(this.camera));
    if (this.cut) this.cut.setGameObject(texture);
    else this.cut = maskInView(this.dark, texture, this.camera, true);
    this.texture = texture;
    this.size = { width, height };
    return texture;
  }

  /** Draws the floor, then every stamp shown where it stands, into the texture over the building. */
  private redraw(look: MaskLook): void {
    const rs = viewport.renderScale;
    const b = maskPlacement(maskBounds(look.house, look.wallTop), rs);
    const texture = this.fitted(b.width, b.height);
    // backing px, drawn back at 1/rs over the building's world rect: sharp, and on the screen's px
    texture.setPosition(b.x, b.y).setScale(1 / rs);
    texture.camera.setZoom(rs);
    texture.camera.setOrigin(0, 0);
    // its corner stays where it is set: Phaser 4's frame set-up (`render`) no longer floors a
    // rounding camera's scroll, and sets px rounding as the main camera rounds (roundAtAnyZoom)
    texture.camera.setScroll(b.x, b.y);
    // only its alpha counts: the mask's colour is never seen
    this.floor.clear().fillStyle(palette.inkDeep, 1).fillPoints(maskFloor(look.house, look.wall), true);

    texture.clear().draw(this.floor);
    for (const stamp of look.stamps) {
      const at = drawnAt(stamp);
      // offset from its own place to where it is drawn: its containers' offsets
      if (at) texture.draw(stamp, at.x - stamp.x, at.y - stamp.y);
    }
    texture.render();
  }
}
