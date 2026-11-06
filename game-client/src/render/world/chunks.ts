/**
 * Ground chunks (FS-KE075 §H.44–§H.45): a floor's projected ground cut into screen rects, and what
 * stands in each shown only while the camera is near it.
 *
 * Two Phaser 4.2.1 facts make this the scene's own job:
 *
 * - A drawing context larger than the GPU's limit is clamped without a word:
 *   `DrawingContextPool.get` (`renderer/webgl/DrawingContextPool.js:143-145`) cuts width and height
 *   to `renderer.getMaxTextureSize()`, which `WebGLRenderer` reads from the GL's `MAX_TEXTURE_SIZE`
 *   (`WebGLRenderer.js:757`). So no chunk is larger than {@link CHUNK_MAX}.
 * - Nothing on the display list is culled by the view: `GameObject.willRender`
 *   (`gameobjects/GameObject.js:707-712`) checks only the render flags and the camera filter. A
 *   hidden object fails the render flags and is skipped, so what is far from the camera is hidden.
 *
 * Built once per floor and toggled when the camera crosses a chunk edge, never made and destroyed.
 * Pure: no Phaser, only `setVisible` on what it is handed.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";

/** The largest chunk side, screen px: a drawing context every WebGL GPU takes. */
export const CHUNK_MAX = 2048;

/**
 * A dungeon floor's chunk side, screen px (FS-KE075 §H.45, derived here). What is near the camera
 * is the view grown by one chunk, so a chunk must be small beside the floor: at 2048 a 5760 × 3840
 * floor's ground is 4 × 2 chunks and the view's reach covers nearly all of it; at 1024 (8 × 4) it
 * still covers half. At 512 (16 × 8) the reach of a 1280 × 720 view is 5 or 6 columns by 4 or 5
 * rows, about a fifth of the floor. The ground's texture memory is the same however it is cut.
 */
export const DUNGEON_CHUNK = 512;

/** A screen rect of ground cut into a grid of chunks, row by row from its top-left corner. */
export class ChunkGrid {
  readonly cols: number;
  readonly rows: number;
  /** Each chunk's screen rect, whole px, row by row. */
  readonly rects: readonly Rect[];
  private readonly side: { width: number; height: number };

  /** `bounds` cut into the fewest chunks no larger than `side` (and never than CHUNK_MAX) a side. */
  constructor(bounds: Rect, side: number = CHUNK_MAX) {
    const most = Math.min(side, CHUNK_MAX);
    const width = Math.ceil(bounds.width);
    const height = Math.ceil(bounds.height);
    this.cols = Math.max(1, Math.ceil(width / most));
    this.rows = Math.max(1, Math.ceil(height / most));
    // evenly sized, so no sliver of a chunk is left at the far edge
    this.side = { width: Math.ceil(width / this.cols), height: Math.ceil(height / this.rows) };
    const rects: Rect[] = [];
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) {
        const x = col * this.side.width;
        const y = row * this.side.height;
        rects.push({
          x: bounds.x + x,
          y: bounds.y + y,
          width: Math.min(this.side.width, width - x),
          height: Math.min(this.side.height, height - y),
        });
      }
    this.rects = rects;
  }

  /** The chunk a screen point lies in; a point off the ground falls in the nearest edge chunk. */
  indexAt(p: Point): number {
    const { col, row } = this.cellOf(p);
    return row * this.cols + col;
  }

  /**
   * The chunks that intersect `view` grown by one chunk on every side (§H.45), in index order: what
   * may come into sight before the camera next crosses a chunk edge.
   */
  near(view: Rect): number[] {
    const from = this.cellOf({ x: view.x - this.side.width, y: view.y - this.side.height });
    const to = this.cellOf({
      x: view.x + view.width + this.side.width,
      y: view.y + view.height + this.side.height,
    });
    const out: number[] = [];
    for (let row = from.row; row <= to.row; row++)
      for (let col = from.col; col <= to.col; col++) out.push(row * this.cols + col);
    return out;
  }

  private cellOf(p: Point): { col: number; row: number } {
    const { x, y } = this.rects[0];
    const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v)));
    return {
      col: clamp((p.x - x) / this.side.width, this.cols),
      row: clamp((p.y - y) / this.side.height, this.rows),
    };
  }
}

/** Anything that can be shown or hidden: a Phaser game object. */
export interface Toggle {
  setVisible(visible: boolean): unknown;
}

/**
 * What stands in each chunk, shown while its chunk is near the camera and hidden otherwise
 * (§H.45). Until the first {@link update} every chunk counts as near.
 */
export class ChunkVisibility {
  private readonly parts: Toggle[][];
  private near?: Set<number>;

  constructor(readonly grid: ChunkGrid) {
    this.parts = grid.rects.map(() => []);
  }

  /** A part standing at a screen point, shown or hidden as its chunk is now. Its chunk's index. */
  add(part: Toggle, at: Point): number {
    const index = this.grid.indexAt(at);
    this.parts[index].push(part);
    part.setVisible(this.shown(index));
    return index;
  }

  /** Whether chunk `index` is near the camera, so what stands in it is shown. */
  shown(index: number): boolean {
    return this.near?.has(index) ?? true;
  }

  /**
   * Follows the camera's view: shows what stands in the chunks that came near, hides what stands in
   * those that left. True when any chunk came or left; a pan within the same chunks does nothing.
   */
  update(view: Rect): boolean {
    const next = new Set(this.grid.near(view));
    const before = this.near;
    if (before && before.size === next.size && [...next].every((i) => before.has(i))) return false;
    this.near = next;
    this.parts.forEach((parts, i) => {
      const shown = next.has(i);
      if (before && before.has(i) === shown) return;
      for (const part of parts) part.setVisible(shown);
    });
    return true;
  }

  /** Lets go of every part: the floor they stood on has been torn down. */
  clear(): void {
    for (const parts of this.parts) parts.length = 0;
    this.near = undefined;
  }
}
