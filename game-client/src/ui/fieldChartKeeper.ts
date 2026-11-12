/**
 * A visit's charted ground, kept (FS-P0HSP §D.25, §D.28; ADR-0078): the character's chart for the
 * field, read from this browser as the visit opens, for the character active then, the whole visit
 * through; when the field's map is due a redraw, at most every {@link FIELD_CHART}.redraw while new
 * ground is charted; and the browser's write, at most every {@link FIELD_CHART}.save while new
 * ground is charted, and once more as the visit ends. A number compare while nothing is new. Pure,
 * no Phaser: the scene gives it the time.
 */

import { FIELD_CHART, readFieldChart, writeFieldChart, type FieldChart, type FieldChartStore } from "./fieldChart";
import type { WorldSize } from "./worldMap";

export class FieldChartKeeper {
  /** This visit's charted ground: the player's own. */
  readonly chart: FieldChart;
  /** Keeps the chart in this browser for the character and field it was read for. */
  private readonly write: () => void;
  /** The chart's version last written to this browser, and when. */
  private saved: { version: number; at: number };
  /** What the map last drew (the chart's version, the walls' count), and when. */
  private drawn?: { version: number; walls: number; at: number };

  /** `owner` is the active character as the visit opens (none keeps nothing); `now` the scene's clock. */
  constructor(store: FieldChartStore, owner: string | null, field: string, size: WorldSize, now: number) {
    this.chart = readFieldChart(store, owner, field, size);
    this.write = () => writeFieldChart(store, owner, field, this.chart);
    this.saved = { version: this.chart.version, at: now };
  }

  /**
   * Whether the field's map is due a redraw at `now`, its state carrying `walls` walls (§D.28):
   * at once the first time; after, only where new ground was charted or the walls changed since,
   * and no sooner than {@link FIELD_CHART}.redraw since the last. A redraw it says is due is noted
   * as drawn.
   */
  redrawDue(walls: number, now: number): boolean {
    const { version } = this.chart;
    const drawn = this.drawn;
    if (drawn && drawn.version === version && drawn.walls === walls) return false;
    if (drawn && now - drawn.at < FIELD_CHART.redraw) return false;
    this.drawn = { version, walls, at: now };
    return true;
  }

  /**
   * Writes the chart to this browser, unioned with what is stored (§D.25), where new ground was
   * charted since the last write and {@link FIELD_CHART}.save has passed since it, at `now`.
   */
  save(now: number): void {
    if (this.chart.version === this.saved.version) return;
    if (now - this.saved.at < FIELD_CHART.save) return;
    this.write();
    this.saved = { version: this.chart.version, at: now };
  }

  /** The visit's last write, whatever is unwritten (§D.25): it asks no clock, a destroyed game's being gone. */
  saveLast(): void {
    if (this.chart.version === this.saved.version) return;
    this.write();
    this.saved = { version: this.chart.version, at: this.saved.at };
  }
}
