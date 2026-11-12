/**
 * A field's **charted ground** (FS-P0HSP §D; CONTEXT.md "Charted ground"): the field's minimap fog,
 * on the minimap only and never on the screen, the character's own. The field is a grid of
 * {@link FIELD_CHART}.cell world px cells; a cell is charted once its centre lies within
 * {@link FIELD_CHART}.radius world px of the local player. Kept per character and field in this
 * browser (ADR-0078), every read and write guarded. Pure, no Phaser.
 */

import type { KeyValueStore } from "@/characters/roster";
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

/** The store, reached lazily: reaching `window.localStorage` may itself throw, and the server render has none. */
export type FieldChartStore = () => KeyValueStore | null;

/** This browser's `localStorage`, or none while Next renders on the server. */
export const browserFieldChartStore: FieldChartStore = () => (typeof window === "undefined" ? null : window.localStorage);

/** Where this browser keeps a character's charted ground in a field (FS-P0HSP §D.25). */
export const fieldChartKey = (characterId: string, fieldId: string) => `barrowspire_field_chart:${characterId}:${fieldId}`;

/** The stored format's version (§D.25). */
const FORMAT = 1;

const toBase64 = (bits: Uint8Array) => {
  let binary = "";
  for (const b of bits) binary += String.fromCharCode(b);
  return btoa(binary);
};

/** The stored bits for a field of `cols` × `rows`, or none where the value does not fit it now. */
function storedBits(raw: string | null, cols: number, rows: number): Uint8Array | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as { v?: unknown; cell?: unknown; cols?: unknown; rows?: unknown; bits?: unknown };
  if (value.v !== FORMAT || value.cell !== FIELD_CHART.cell || value.cols !== cols || value.rows !== rows) return null;
  if (typeof value.bits !== "string") return null;
  const bits = Uint8Array.from(atob(value.bits), (c) => c.charCodeAt(0));
  return bits.length === Math.ceil((cols * rows) / 8) ? bits : null;
}

/**
 * The character's charted ground in this field, as this browser kept it (§D.25), else none: no
 * active character, no store, a store that throws, a value that does not parse, or one whose
 * version, cell, columns or rows do not fit the field now (a resized field) all start uncharted,
 * and nothing throws (§D.26).
 */
export function readFieldChart(store: FieldChartStore, characterId: string | null, fieldId: string, size: WorldSize): FieldChart {
  const chart = new FieldChart(size);
  if (!characterId) return chart;
  try {
    const bits = storedBits(store()?.getItem(fieldChartKey(characterId, fieldId)) ?? null, chart.cols, chart.rows);
    if (bits) chart.union(bits);
  } catch {
    // unreadable: charting lives for this visit only
  }
  return chart;
}

/**
 * Keeps `chart` in this browser for the character in this field (§D.25): unioned with what is
 * stored at this moment, so two tabs on one character never lose each other's ground, the chart
 * taking the stored ground in too. With no active character nothing is kept; a store that is
 * missing, blocked or full keeps nothing, and nothing throws (§D.26).
 */
export function writeFieldChart(store: FieldChartStore, characterId: string | null, fieldId: string, chart: FieldChart): void {
  if (!characterId) return;
  try {
    const kv = store();
    if (!kv) return;
    const key = fieldChartKey(characterId, fieldId);
    let stored: Uint8Array | null = null;
    try {
      stored = storedBits(kv.getItem(key), chart.cols, chart.rows);
    } catch {
      // a stored value that does not parse is written over
    }
    if (stored) chart.union(stored);
    kv.setItem(key, JSON.stringify({ v: FORMAT, cell: FIELD_CHART.cell, cols: chart.cols, rows: chart.rows, bits: toBase64(chart.bits) }));
  } catch {
    // a blocked or full store keeps nothing: the ground lives for this visit
  }
}
