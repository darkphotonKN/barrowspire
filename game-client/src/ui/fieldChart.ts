/**
 * A field's **charted ground** (FS-P0HSP §D; CONTEXT.md "Charted ground"): the field's minimap fog,
 * on the minimap only and never on the screen, the character's own. The field is a grid of
 * {@link FIELD_CHART}.cell world px cells; a cell is charted once its centre lies within
 * {@link FIELD_CHART}.radius world px of the local player. Pure, no Phaser.
 */

import type { Point } from "@/render/iso/projection";
import type { WorldRect, WorldSize } from "./worldMap";

/**
 * The chart's named values (§D.21, §D.25, §D.28), each tunable: the cell (one tile), the radius
 * charted round the player (about half a 1080 view's width on screen), the least time between two
 * redraws of the map while new ground is charted, and between two writes to this browser's store.
 */
export const FIELD_CHART = { cell: 40, radius: 480, redraw: 250, save: 2000 } as const;

export class FieldChart {
  readonly cols: number;
  readonly rows: number;
  /** One bit a cell, row by row, the lowest bit first. */
  readonly bits: Uint8Array;
  /** Bumped each time a cell is newly charted: what the map's key is read from. */
  version = 0;
  /** The cell the player was last charted from: within it, nothing new can be charted worth the scan. */
  private lastCell?: number;

  constructor(
    readonly size: WorldSize,
    bits?: Uint8Array,
  ) {
    this.cols = Math.ceil(size.width / FIELD_CHART.cell);
    this.rows = Math.ceil(size.height / FIELD_CHART.cell);
    const bytes = Math.ceil((this.cols * this.rows) / 8);
    this.bits = bits && bits.length === bytes ? bits : new Uint8Array(bytes);
  }

  /** Whether the cell at column `cx`, row `cy` is charted. */
  charted(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    const i = cy * this.cols + cx;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /**
   * Charts the cells round the player at `p` (§D.21): those whose centres lie within the radius.
   * Scanned only when the player has entered another cell since the last call, row by row over the
   * circle's span, so standing or walking within a cell costs nothing. True where any cell was
   * newly charted.
   */
  chartAround(p: Point): boolean {
    const { cell, radius } = FIELD_CHART;
    const here = Math.floor(p.y / cell) * this.cols + Math.floor(p.x / cell);
    if (here === this.lastCell) return false;
    this.lastCell = here;
    let added = false;
    const top = Math.max(0, Math.ceil((p.y - radius) / cell - 0.5));
    const bottom = Math.min(this.rows - 1, Math.floor((p.y + radius) / cell - 0.5));
    for (let cy = top; cy <= bottom; cy++) {
      const dy = (cy + 0.5) * cell - p.y;
      const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      const from = Math.max(0, Math.ceil((p.x - half) / cell - 0.5));
      const to = Math.min(this.cols - 1, Math.floor((p.x + half) / cell - 0.5));
      for (let cx = from; cx <= to; cx++) {
        const i = cy * this.cols + cx;
        const bit = 1 << (i & 7);
        if (this.bits[i >> 3] & bit) continue;
        this.bits[i >> 3] |= bit;
        added = true;
      }
    }
    if (added) this.version++;
    return added;
  }

  /** Charts every cell `other` has charted (a stored chart of this same field); true where any was new. */
  union(other: Uint8Array): boolean {
    if (other.length !== this.bits.length) return false;
    let added = false;
    for (let i = 0; i < other.length; i++) {
      const merged = this.bits[i] | other[i];
      if (merged !== this.bits[i]) {
        this.bits[i] = merged;
        added = true;
      }
    }
    if (added) this.version++;
    return added;
  }

  /**
   * The charted ground as merged runs (§D.28), world px, clipped to the field: each row's runs of
   * charted cells, a run carried down while the rows under it have the same run.
   */
  runs(): WorldRect[] {
    const { cell } = FIELD_CHART;
    const done: WorldRect[] = [];
    let open = new Map<string, WorldRect>();
    for (let cy = 0; cy < this.rows; cy++) {
      const next = new Map<string, WorldRect>();
      let cx = 0;
      while (cx < this.cols) {
        if (!this.charted(cx, cy)) {
          cx++;
          continue;
        }
        const start = cx;
        while (cx < this.cols && this.charted(cx, cy)) cx++;
        const key = `${start},${cx}`;
        const y = cy * cell;
        const height = Math.min(cell, this.size.height - y);
        const above = open.get(key);
        if (above) {
          above.height += height;
          next.set(key, above);
          open.delete(key);
        } else {
          const x = start * cell;
          next.set(key, { x, y, width: Math.min(cx * cell, this.size.width) - x, height });
        }
      }
      done.push(...open.values());
      open = next;
    }
    done.push(...open.values());
    return done;
  }
}
