/**
 * The player's Health bar and class resource bar at the top left of a run or a field (FS-8AY7S
 * req 20–25). The scene hands it every state's bars (`hudBars` in `./resources`); an empty list
 * takes the panel down, so it is up only while the player is in the delve.
 *
 * The reliquary bars (`./reliquaryBar`): a carved stone plate with corner studs, each bar a sunken
 * channel in a brass bezel, run out of an emblem socket and filled like a vial of its channel's
 * liquid, its name engraved on the plate above it in small caps of the body serif (the blackletter
 * bound), never over the liquid, where no outline keeps it legible. Parry
 * charges are brass lozenge studs. The still layers (plate, channels, sockets) draw when the rows
 * change; the liquid repaints at most 30 times a second while it is up. It sits at the HUD's depth
 * and grows down from its top edge, on the left-edge column it shares with the party frames.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { HudBar, HudChannel } from "./resources";
import {
  BarMotion,
  StudMotion,
  heartbeat,
  lowness,
  paintChannel,
  paintLiquid,
  paintPlate,
  paintSocket,
  paintStuds,
  rampOf,
  type ChannelBox,
} from "./reliquaryBar";

/**
 * The HUD's left-edge column (FS-77DVN §E.19): the resource bars and the party frames stand in it,
 * one width, so the left edge reads as one column and ends left of the T panel.
 */
export const HUD_COLUMN_W = 180;
/** The very top left of a run or a field: nothing stands over the bars there (FS-77DVN §E.17). */
const TOP_LEFT = { x: 10, y: 16 } as const;
/**
 * Where each scene stands the panel, its top-left corner: in the corner of a run and of a field
 * alike. A hub has no bars.
 */
export const RESOURCE_HUD_AT: Readonly<
  Record<"run" | "field", { x: number; y: number }>
> = {
  run: { ...TOP_LEFT },
  field: { ...TOP_LEFT },
};
const HUD_DEPTH = 1000;
/** Panel padding above the first row and below the last: the plate's carved lip and its studs. */
const PAD_Y = 7;
/** A row: its label line, its channel in the bezel, and a gap before the next row. */
const ROW_H = 30;
const ROW_GAP = 3;
/** The engraved label's line at the top of each row; the channel stands under it. */
const LABEL_LINE = 14;
/** The emblem socket's radius and its centre's inset from the panel's left edge. */
const SOCKET_R = 9;
const SOCKET_X = 18;
/** The channel starts under the socket's right edge, so the bar runs out of its emblem. */
const CHANNEL_X = SOCKET_X + SOCKET_R - 3;
/** Between the channel's far end (its finial included) and the panel's right edge. */
const CHANNEL_RIGHT = 10;
/** Health's channel is the taller; a resource's is a little slighter. */
const CHANNEL_H: Readonly<Record<HudChannel, number>> = {
  health: 12,
  mana: 10,
  stamina: 10,
  parry: 10,
  unknown: 10,
};
/** The engraved label's left edge on a panel at `x`: just clear of the socket's ring. */
const LABEL_X = (x: number) => x + SOCKET_X + SOCKET_R + 4;
/** The live layer's frame budget: the liquid repaints at most this often, in ms. */
const REPAINT_MS = 1000 / 30;

/** Each bar's fill colour by channel; the creation lore card shares it (FS-MAMHR §G.30). */
export const HUD_BAR_FILL: Readonly<Record<HudChannel, number>> = {
  health: palette.hudHealth,
  mana: palette.hudMana,
  stamina: palette.hudStamina,
  parry: palette.hudParry,
  unknown: palette.hudResourceOther,
};

/** The colour a bar fills in: its channel's, or the poison tint on a poisoned player's health (FS-5FZ4J §J R55). */
export function hudBarFill(bar: Pick<HudBar, "channel" | "poisoned">): number {
  return bar.poisoned ? palette.poisoned : HUD_BAR_FILL[bar.channel];
}

/**
 * The screen y of row `row`'s bar (0 is Health) on a panel whose top is `top`, the middle of its
 * channel and socket: what the status marks line up with.
 */
export function resourceHudRowMiddle(top: number, row: number): number {
  return top + PAD_Y + row * ROW_H + LABEL_LINE + CHANNEL_H.health / 2;
}

/** The panel's height for `rows` bars: what the party frames measure from. */
export function resourceHudHeight(rows: number): number {
  return rows * ROW_H - ROW_GAP + PAD_Y * 2;
}

/** A bar's label as the plate engraves it: "Health:" reads HEALTH. */
export function engravedLabel(label: string | null): string {
  return (label ?? "").replace(/:\s*$/, "").toUpperCase();
}

/** Where one row's pieces stand. */
interface RowPlace {
  /** The engraved label's top. */
  labelY: number;
  socket: { cx: number; cy: number };
  channel: ChannelBox;
}

/** One row as the live layer keeps it between states. */
interface RowLive {
  bar: HudBar;
  place: RowPlace;
  motion?: BarMotion;
  studs?: StudMotion;
}

export class ResourceHud {
  /** The plate and the channels: drawn when the rows change. */
  private chrome?: Phaser.GameObjects.Graphics;
  /** The liquid, the studs and Health's low glow: repainted as it moves. */
  private live?: Phaser.GameObjects.Graphics;
  /** The emblem sockets, over the channels' ends. */
  private jewels?: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private rows: RowLive[] = [];
  /** What the panel last drew, so the states that change nothing redraw nothing. */
  private drawn?: string;
  /** What the still layers last drew: the rows' channels, labels and pip counts. */
  private shape?: string;
  private clock = 0;
  private sincePaint = 0;

  /** `top` is the screen y of the panel's top edge. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly top: number,
  ) {}

  show(bars: HudBar[]): void {
    const key = JSON.stringify(bars);
    if (key === this.drawn) return;
    this.drawn = key;
    if (bars.length === 0) {
      this.takeDown();
      return;
    }

    const shape = JSON.stringify(bars.map((b) => [b.channel, b.label, b.pips?.length ?? 0]));
    if (shape !== this.shape || !this.chrome) {
      this.shape = shape;
      this.build(bars);
    }
    bars.forEach((bar, i) => {
      const row = this.rows[i];
      row.bar = bar;
      if (bar.pips) row.studs?.set(bar.pips);
      else row.motion?.set(bar.fill);
    });
    this.paintLive();
  }

  /** Taken down for good: its world left the UI scene (FS-TQZ5J § Change: Batch 5, R67). */
  destroy(): void {
    this.takeDown();
    this.drawn = undefined;
  }

  /** The still layers and each row's motion, fresh for a new set of rows. */
  private build(bars: HudBar[]): void {
    const { top } = this;
    const first = !this.chrome;
    const chrome = (this.chrome ??= this.layer());
    this.live ??= this.layer();
    const jewels = (this.jewels ??= this.layer());
    if (first) this.scene.events?.on("update", this.tick, this);
    chrome.clear();
    jewels.clear();

    paintPlate(chrome, this.x, top, HUD_COLUMN_W, resourceHudHeight(bars.length));
    this.rows = bars.map((bar, i) => {
      const place = this.placeOf(bar, i);
      const ramp = rampOf(bar.channel);
      paintChannel(chrome, place.channel, ramp);
      paintSocket(jewels, place.socket.cx, place.socket.cy, SOCKET_R, bar.channel, ramp);
      return {
        bar,
        place,
        ...(bar.pips ? { studs: new StudMotion(bar.pips) } : { motion: new BarMotion(bar.fill) }),
      };
    });

    this.fitLabels();
    bars.forEach((bar, i) => {
      this.labels[i].setText(engravedLabel(bar.label)).setPosition(LABEL_X(this.x), this.rows[i].place.labelY);
    });
  }

  private placeOf(bar: HudBar, i: number): RowPlace {
    const rowY = this.top + PAD_Y + i * ROW_H;
    const h = CHANNEL_H[bar.channel];
    const x = this.x + CHANNEL_X;
    // every channel centred on Health's line, so a slighter one sits in the same socket
    const middle = rowY + LABEL_LINE + CHANNEL_H.health / 2;
    const channel = {
      x,
      y: Math.round(middle - h / 2),
      w: HUD_COLUMN_W - CHANNEL_X - CHANNEL_RIGHT,
      h,
    };
    return { labelY: rowY + 1, socket: { cx: this.x + SOCKET_X, cy: middle }, channel };
  }

  /** One frame: the motions step, and the liquid repaints within its budget. */
  private tick(_time: number, delta: number): void {
    if (!this.live) return;
    this.clock += delta;
    for (const row of this.rows) {
      row.motion?.step(delta);
      row.studs?.step(delta);
    }
    this.sincePaint += delta;
    if (this.sincePaint < REPAINT_MS) return;
    this.sincePaint = 0;
    this.paintLive();
  }

  private paintLive(): void {
    const g = this.live;
    if (!g) return;
    g.clear();
    const t = this.clock;
    for (const { bar, place, motion, studs } of this.rows) {
      const ramp = rampOf(bar.channel, bar.poisoned);
      if (bar.pips) {
        paintStuds(g, place.channel, ramp, bar.pips, t, studs?.flash);
        continue;
      }
      const fill = motion?.shown ?? bar.fill;
      if (bar.channel === "health") {
        const low = lowness(fill);
        if (low > 0) {
          g.fillStyle(ramp.lit, (0.18 + 0.5 * heartbeat(t, fill)) * low);
          g.fillCircle(place.socket.cx, place.socket.cy, SOCKET_R + 3.5);
        }
      }
      paintLiquid(
        g,
        place.channel,
        bar.channel,
        ramp,
        { fill, chip: motion?.chip ?? fill, flash: motion?.flash ?? null, time: t },
        bar.poisoned,
      );
    }
  }

  private layer(): Phaser.GameObjects.Graphics {
    return this.scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
  }

  /** One label per row: new ones made at their row, spare ones dropped. */
  private fitLabels(): void {
    while (this.labels.length > this.rows.length) this.labels.pop()?.destroy();
    while (this.labels.length < this.rows.length) {
      const { labelY } = this.rows[this.labels.length].place;
      this.labels.push(
        this.scene.add
          .text(LABEL_X(this.x), labelY, "", {
            fontFamily: CANVAS_FONT.body,
            fontSize: "11px",
            color: toCss(palette.hudLabel),
            letterSpacing: 2,
          })
          .setShadow(0, 1, toCss(palette.hudPlateDeep), 0, false, true)
          .setScrollFactor(0)
          .setDepth(HUD_DEPTH),
      );
    }
  }

  private takeDown(): void {
    if (this.chrome) this.scene.events?.off("update", this.tick, this);
    for (const g of [this.chrome, this.live, this.jewels]) g?.destroy();
    this.chrome = this.live = this.jewels = undefined;
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
    this.rows = [];
    this.shape = undefined;
  }
}

/** The party frames' compact bars (FS-R82NV R34) keep their own still painters below. */
const PIP_GAP = 6;

export type BarGraphics = Pick<
  Phaser.GameObjects.Graphics,
  "fillStyle" | "fillRect" | "lineStyle" | "strokeRect"
>;

/**
 * A continuous bar, `fill` (0 to 1) full: a dark track in a brass rim. The HUD's own bar style,
 * which the party frames draw at half its height (FS-R82NV R34).
 */
export function drawHudBar(
  g: BarGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  color: number,
): void {
  g.fillStyle(palette.hudTrack, 0.9);
  g.fillRect(x, y, w, h);
  if (fill > 0) {
    g.fillStyle(color, 1);
    g.fillRect(x, y, Math.round(w * fill), h);
  }
  g.lineStyle(1, palette.frame, 0.6);
  g.strokeRect(x, y, w, h);
}

/** Parry charges: one stud per pip across the bar's width, bright brass for each charge held. */
export function drawHudPips(
  g: BarGraphics,
  x: number,
  y: number,
  w: number,
  h: number,
  pips: boolean[],
): void {
  const pipW = Math.floor((w - PIP_GAP * (pips.length - 1)) / pips.length);
  pips.forEach((lit, i) => {
    const px = x + i * (pipW + PIP_GAP);
    g.fillStyle(lit ? palette.hudParry : palette.hudTrack, lit ? 1 : 0.9);
    g.fillRect(px, y, pipW, h);
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRect(px, y, pipW, h);
  });
}
