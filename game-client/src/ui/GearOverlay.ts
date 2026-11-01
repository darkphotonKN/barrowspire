/**
 * The gear, bag and stats overlay (FS-HRH2J §A, §B): two mirrored panels on the screen's side
 * edges, drawn over the live world with a clear band between them. The right panel holds the
 * ten gear slots above the 6 × 5 bag; the left is the stats panel (§C), drawn from the player's
 * own world state, the worn gear and the class card (`characterSheet`), live while open. Both
 * open and close together. Opened at the hub's stash chest (`openStash`), the left panel shows
 * the account's stash instead of the stats until the overlay closes (FS-VPD8Y §F R35–37), and
 * the same gestures move a bag item to the stash and a stash item to the bag (R38).
 *
 * It is the {@link HudPanel} `EquipmentHud` drives in a run and a field world, and `HubGear`
 * drives from REST in the hub (§E), so the sends, the pending pickups and the full-bag
 * pre-check (and the stash's pre-checks and moves, `mayMove` / `onMove`) live there, not here.
 * What it owns: where
 * everything is drawn (`gearOverlayLayout`), hover and the item tip, and equip / unequip by
 * hover + right-click or hover + E (R16–17), applied to its own copy at once. Left-click does
 * nothing and nothing drags (R18). Pointer input is hit-tested by hand in screen space, as the
 * equip panel and the satchel do.
 *
 * It is told the world it is drawn in, for the item's standing (FS-18Z5F §H): in a run an unsafe
 * find wears an oxblood inner edge and its tip a warning; in the hub an item still in a delve is
 * dimmed, its tip says so, and an equip or unequip of it is asked about (`mayEquip`,
 * `mayUnequip`) before anything is drawn, as a move is.
 *
 * Game palette world panels (design-guideline "UI Chrome"): dark ink and carved stone, a 1px
 * brass border, vellum text; the rarity edge is the only rarity colour. Icons are the baked item
 * icons with their generic fallback.
 */

import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import {
  equipSlotFor,
  getItemType,
  type EquipmentSlot,
  type EquippedItems,
  type ItemState,
} from "@/types/gameState";
import { itemView, type ItemView } from "@/items/itemView";
import { artSprite } from "@/render/art/phaser";
import type { ArtLibrary } from "@/render/art/library";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { nothingWorn, type HudPanel } from "./EquipmentHud";
import { satchelIcon } from "./ContainerView";
import { buildItemTip, rarityEdge, type ItemTip } from "./itemTip";
import {
  characterSheet,
  type CharacterSheet,
  type CharacterSource,
} from "./characterSheet";
import { drawXpBar } from "./ProgressHud";
import { HUD_BAR_FILL } from "./ResourceHud";
import { BAG_CAPACITY, bagCountLabel } from "./bag";
import {
  STASH_CAPACITY,
  freeToMove,
  stashCountLabel,
  type ItemLocation,
} from "./stash";
import {
  GEAR_SLOTS,
  gearPanelLayout,
  inRect,
  overlayLayout,
  overPanel,
  rowWindow,
  stashPanelLayout,
  statsPanelArea,
  type GearPanelLayout,
  type ItemGrid,
  type OverlayLayout,
  type Rect,
  type RowWindow,
  type StashPanelLayout,
} from "./gearOverlayLayout";

/** Above the HUD (1000) and the satchel (1000), below the item tip and passing notices (2000+). */
export const GEAR_OVERLAY_DEPTH = 1100;
const TIP_DEPTH = 2200;
const FLASH_DEPTH = 2300;

const PANEL_RADIUS = 6;
const WELL_RADIUS = 4;
/** The rarity accent edge down a worn slot's or a bag cell's left side. */
const EDGE_W = 3;
/** An unsafe find's inner edge (FS-18Z5F R36): its line width, and its inset inside the well. */
const UNSAFE_EDGE_W = 2;
const UNSAFE_INSET = 2;
/** How much of a well an icon fills. */
const ICON_FILL = 0.78;
/** An item above the character's level is drawn this faint (FS-BDA7X R45). */
const TOO_HIGH_ALPHA = 0.4;
/**
 * An item that is not `AVAILABLE` (listed, settling, or still in a delve) is drawn this faint
 * (FS-VPD8Y R40, FS-18Z5F R38).
 */
export const UNAVAILABLE_ALPHA = 0.3;
/** The stats panel's row pitch, and its bars' heights, in px. */
const STAT_ROW_H = 17;
const XP_BAR_H = 6;
const RESOURCE_BAR_H = 4;

export const GEAR_HINT =
  "Right-click or E: wear or take off  //  I, B or Esc: close";
/** In stash mode items move between bag and stash and nothing is worn; worn gear still comes off (FS-VPD8Y R38). */
export const STASH_HINT =
  "Right-click or E: move between bag and stash, or take off  //  I, B or Esc: close";

/** One stats panel row: its height, and how it draws itself with its top at `y`. */
interface StatsRow {
  h: number;
  draw: (
    y: number,
    out: Phaser.GameObjects.GameObject[],
    ink: Phaser.GameObjects.Graphics,
  ) => void;
}

/** What the pointer is over: a gear slot, a bag position, or a stash position. */
type Hovered =
  | { kind: "slot"; slot: EquipmentSlot }
  | { kind: "bag" | "stash"; index: number };

function hoverKey(at: Hovered | undefined): string {
  if (!at) return "";
  return at.kind === "slot" ? `slot:${at.slot}` : `${at.kind}:${at.index}`;
}

export class GearOverlay implements HudPanel {
  onEquip?: (item: ItemState, slot: EquipmentSlot) => void;
  onUnequip?: (item: ItemState, slot: EquipmentSlot) => void;
  mayEquip?: (item: ItemState, slot: EquipmentSlot) => boolean;
  mayUnequip?: (item: ItemState) => boolean;
  /** Asked before a stash-mode move is drawn; false leaves the item where it is (FS-VPD8Y R39). */
  mayMove?: (item: ItemState, to: ItemLocation) => boolean;
  /** A stash-mode move, drawn at once to the end of `to` (R38, R41). */
  onMove?: (item: ItemState, to: ItemLocation) => void;

  private visible = false;
  private equipped: EquippedItems = nothingWorn();
  private inventory: ItemState[] = [];
  private characterLevel?: number;
  /** The player's own latest state, for the stats panel (R24). */
  private character?: CharacterSource;
  /** What the stats panel last drew (its scroll and sheet), so a state that changes none of it draws nothing (R30). */
  private shownSheet = "";
  /** The bag grid's first shown row, when its rows do not all fit (R23, edge state "Small window"). */
  private scroll = 0;
  /** The stats panel's first shown row, likewise, and where its rows last stood. */
  private statsScroll = 0;
  private statsView?: { area: Rect; win: RowWindow };
  /** A line over the bag (the hub's loading, busy or failed load, R42–43); set, no change is taken. */
  private status?: string;
  /**
   * The stash, while the overlay is open in stash mode (FS-VPD8Y R35); undefined otherwise, when
   * the left panel is the stats. Closing ends the mode (R37).
   */
  private stash?: ItemState[];
  /** The stash grid's first shown row, when its rows do not all fit (R36). */
  private stashScroll = 0;

  private layout?: OverlayLayout;
  private gear?: GearPanelLayout;
  private stashGrid?: StashPanelLayout;
  /** The panels' frames and fixed words, rebuilt only on open and resize. */
  private frame?: Phaser.GameObjects.Container;
  /** The slots, cells, icons and count, rebuilt as what is carried or worn changes. */
  private content?: Phaser.GameObjects.Container;
  /** The stats panel's rows, rebuilt as the sheet they show changes. */
  private stats?: Phaser.GameObjects.Container;
  /** The hover ring, redrawn as the pointer moves. */
  private hoverRing?: Phaser.GameObjects.Graphics;
  private hovered?: Hovered;
  private tip?: ItemTip;
  private pointer = { x: -1, y: -1 };

  /** `world` is the world the overlay is drawn in; only a run marks unsafe finds (FS-18Z5F R36–37). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world?: WorldType,
  ) {}

  // ── HudPanel ─────────────────────────────────────────────────────────────

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.build();
    this.scene.input.on("pointermove", this.onPointerMove, this);
    this.scene.input.on("pointerdown", this.onPointerDown, this);
    this.scene.input.on("wheel", this.onWheel, this);
    this.scene.scale?.on("resize", this.relayout, this);
    // a world switch while open takes the overlay with it (edge state "World switch while open")
    this.scene.events?.once("shutdown", this.hide, this);
  }

  /**
   * Opens the overlay in stash mode, the left panel showing the stash (FS-VPD8Y R35), empty until
   * {@link updateStash} fills it. Only from closed: an open overlay keeps its mode.
   */
  openStash(): void {
    if (this.visible) return;
    this.stash = [];
    this.stashScroll = 0;
    this.show();
  }

  /** Whether the overlay is open in stash mode. */
  isStashOpen(): boolean {
    return this.visible && this.stash !== undefined;
  }

  /** What the stash holds, in stash order; drawn only in stash mode. */
  updateStash(items: ItemState[]): void {
    if (!this.stash) return;
    this.stash = [...items];
    if (this.visible) this.redraw();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    // closing ends stash mode: the next open shows the stats (FS-VPD8Y R37)
    this.stash = undefined;
    this.scene.input?.off("pointermove", this.onPointerMove, this);
    this.scene.input?.off("pointerdown", this.onPointerDown, this);
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.scale?.off("resize", this.relayout, this);
    this.scene.events?.off("shutdown", this.hide, this);
    this.teardown();
  }

  isVisible(): boolean {
    return this.visible;
  }

  covers(x: number, y: number): boolean {
    return (
      this.visible && this.layout !== undefined && overPanel(this.layout, x, y)
    );
  }

  /** E while open: wear or take off whatever the pointer is over; nothing hovered, nothing happens (R10). */
  handleEquipKey(): void {
    if (!this.visible) return;
    this.act();
  }

  updateInventory(items: ItemState[]): void {
    // a state lands many times a second; rebuild only when what is shown changes
    const same =
      items.length === this.inventory.length &&
      items.every((item, i) => item.entity_id === this.inventory[i].entity_id);
    this.inventory = [...items];
    if (!same && this.visible) this.redraw();
  }

  updateEquipment(equipped: EquippedItems): void {
    const same = GEAR_SLOTS.every(
      ({ slot }) =>
        (equipped[slot]?.entity_id ?? null) ===
        (this.equipped[slot]?.entity_id ?? null),
    );
    this.equipped = { ...equipped };
    if (!same && this.visible) this.redraw();
  }

  setCharacterLevel(level: number | undefined): void {
    if (level === this.characterLevel) return;
    this.characterLevel = level;
    if (this.visible) this.redraw();
  }

  /**
   * A line in the bag area, kept across closing; while one is set, equip, unequip and move input
   * is ignored (the hub's REST source, FS-HRH2J R42–43, FS-VPD8Y R41). Hover and the tip still read.
   */
  setStatus(line: string | undefined): void {
    if (line === this.status) return;
    this.status = line;
    if (this.visible) this.redraw();
  }

  /** The player's own state, every state; drawn while open (R30). */
  updateCharacter(player: CharacterSource): void {
    this.character = player;
    if (this.visible) this.redrawStats();
  }

  // ── Building ─────────────────────────────────────────────────────────────

  private build(): void {
    const cam = this.scene.cameras.main;
    this.layout = overlayLayout(cam.width, cam.height);
    this.frame = this.scene.add.container(0, 0, [
      this.panel(this.layout.left),
      this.panel(this.layout.right),
      this.heading(this.layout.left, this.stash ? "STASH" : "CHARACTER"),
      this.heading(this.layout.right, "GEAR"),
    ]);
    this.frame.setDepth(GEAR_OVERLAY_DEPTH).setScrollFactor(0);
    this.redraw();
  }

  /** The canvas changed size while open: everything is laid out again (R2). */
  private relayout(): void {
    if (!this.visible) return;
    this.teardown();
    this.build();
  }

  /** The slots, the bag and the count, from what is carried and worn now. */
  private redraw(): void {
    if (!this.layout) return;
    this.content?.destroy();
    this.hoverRing?.destroy();
    this.hideTip();
    this.gear = gearPanelLayout(
      this.layout.right,
      this.inventory.length,
      this.scroll,
    );
    this.scroll = this.gear.scroll;
    const g = this.gear;
    const children: Phaser.GameObjects.GameObject[] = [];

    for (const { slot, label } of GEAR_SLOTS) {
      const item = this.equipped[slot];
      const rect = g.slots[slot];
      children.push(this.well(rect, item));
      if (item) children.push(this.icon(rect, item));
      else children.push(this.slotLabel(rect, label));
    }

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, palette.frame, 0.3);
    divider.lineBetween(
      g.innerX + 8,
      g.bagHeaderY - 6,
      g.innerX + g.innerW - 8,
      g.bagHeaderY - 6,
    );
    children.push(divider);
    children.push(
      this.label(g.grid.x, g.bagHeaderY, "BAG", palette.frameBright, 12, 3),
    );
    const over = this.inventory.length > BAG_CAPACITY;
    const count = this.label(
      g.grid.x + g.grid.w,
      g.bagHeaderY,
      bagCountLabel(this.inventory.length),
      over ? palette.damageBright : palette.hudText,
      12,
      1,
    );
    count.setOrigin(1, 0);
    children.push(count);

    children.push(...this.itemGrid(g, this.inventory));

    const hint = this.scene.add.text(
      g.innerX + g.innerW / 2,
      g.hintY + 4,
      this.stash ? STASH_HINT : GEAR_HINT,
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "10px",
        color: toCss(palette.hudFaint),
        align: "center",
        wordWrap: { width: g.innerW },
      },
    );
    hint.setOrigin(0.5, 0);
    children.push(hint);
    if (this.stash) children.push(...this.stashPanel(this.stash));

    this.content = this.scene.add.container(0, 0, children);
    this.content.setDepth(GEAR_OVERLAY_DEPTH + 1).setScrollFactor(0);
    this.hoverRing = this.scene.add.graphics();
    this.hoverRing.setDepth(GEAR_OVERLAY_DEPTH + 2).setScrollFactor(0);
    this.hovered = undefined;
    this.updateHover();
    // what is worn feeds "From gear" (R29)
    this.redrawStats();
  }

  private teardown(): void {
    this.hideTip();
    this.hovered = undefined;
    this.stats?.destroy();
    this.stats = undefined;
    this.statsView = undefined;
    this.shownSheet = "";
    this.content?.destroy();
    this.hoverRing?.destroy();
    this.frame?.destroy();
    this.content = undefined;
    this.hoverRing = undefined;
    this.frame = undefined;
    this.layout = undefined;
    this.gear = undefined;
    this.stashGrid = undefined;
  }

  /** A world panel: ink ground, a carved inner edge, a 1px brass border, a small radius. */
  private panel(r: Rect): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(palette.ink, 0.94);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, PANEL_RADIUS);
    g.lineStyle(1, palette.hudPanel, 0.9);
    g.strokeRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, PANEL_RADIUS - 2);
    g.lineStyle(1, palette.frame, 0.6);
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, PANEL_RADIUS);
    return g;
  }

  private heading(r: Rect, words: string): Phaser.GameObjects.Text {
    const text = this.label(
      r.x + r.w / 2,
      r.y + 14,
      words,
      palette.frameBright,
      14,
      4,
    );
    text.setOrigin(0.5, 0);
    return text;
  }

  private label(
    x: number,
    y: number,
    words: string,
    color: number,
    size: number,
    spacing: number,
  ): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, words, {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${size}px`,
      color: toCss(color),
      letterSpacing: spacing,
    });
  }

  /** An empty slot shows its name (R13). */
  private slotLabel(r: Rect, words: string): Phaser.GameObjects.Text {
    const text = this.label(
      r.x + r.w / 2,
      r.y + r.h / 2,
      words,
      palette.hudFaint,
      9,
      1,
    );
    text.setOrigin(0.5);
    return text;
  }

  /**
   * A slot's or cell's well; a held item adds its rarity edge, and an unsafe find in a run an
   * oxblood inner edge clear of it (FS-18Z5F R36); a cell past 30 is tinted over (R23).
   */
  private well(
    r: Rect,
    item: ItemState | null | undefined,
    over = false,
  ): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(over ? palette.damage : palette.inkDeep, over ? 0.35 : 0.6);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, WELL_RADIUS);
    g.lineStyle(
      1,
      over ? palette.damageBright : palette.frame,
      over ? 0.4 : 0.22,
    );
    g.strokeRoundedRect(r.x, r.y, r.w, r.h, WELL_RADIUS);
    const view = item ? this.view(item) : undefined;
    if (view?.standing?.kind === "unsafeFind") {
      const left = r.x + EDGE_W + UNSAFE_INSET;
      g.lineStyle(UNSAFE_EDGE_W, palette.unsafeFind, 0.9);
      g.strokeRoundedRect(
        left,
        r.y + UNSAFE_INSET,
        r.x + r.w - UNSAFE_INSET - left,
        r.h - UNSAFE_INSET * 2,
        WELL_RADIUS - 1,
      );
    }
    const edge = view ? rarityEdge(view) : undefined;
    if (edge !== undefined) {
      g.fillStyle(edge, 0.9);
      g.fillRect(r.x + 1, r.y + 5, EDGE_W, r.h - 10);
    }
    return g;
  }

  /**
   * The item's baked icon, centred in its well, faint while above the character's level or not
   * free to move (FS-VPD8Y R40).
   */
  private icon(r: Rect, item: ItemState): Phaser.GameObjects.Sprite {
    const sprite = artSprite(
      this.scene,
      this.art,
      r.x + r.w / 2,
      r.y + r.h / 2,
      satchelIcon(item),
    );
    sprite.setOrigin(0.5);
    const size =
      Math.max(sprite.frame?.width ?? 0, sprite.frame?.height ?? 0) || 1;
    sprite.setScale((Math.min(r.w, r.h) * ICON_FILL) / size);
    const tooHigh = this.view(item).lines.requirement.tooHigh;
    const alpha = Math.min(
      tooHigh ? TOO_HIGH_ALPHA : 1,
      freeToMove(item) ? 1 : UNAVAILABLE_ALPHA,
    );
    if (alpha < 1) sprite.setAlpha(alpha);
    return sprite;
  }

  /** Where a scrolled list (the bag grid, the stats) stands among its rows: a track `h` tall at `x, y`. */
  private scrollBar(
    x: number,
    y: number,
    h: number,
    win: RowWindow,
  ): Phaser.GameObjects.Graphics {
    const bar = this.scene.add.graphics();
    bar.fillStyle(palette.hudPanelDeep, 0.9);
    bar.fillRect(x, y, 3, h);
    const thumb = (win.count / win.rows) * h;
    const top = y + (win.first / win.rows) * h;
    bar.fillStyle(palette.frame, 0.8);
    bar.fillRect(x, top, 3, thumb);
    return bar;
  }

  /** The status, centred over the bag grid on an ink band. */
  private statusLine(
    grid: Rect,
    words: string,
  ): Phaser.GameObjects.GameObject[] {
    const text = this.scene.add.text(
      grid.x + grid.w / 2,
      grid.y + grid.h / 2,
      words,
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        align: "center",
        wordWrap: { width: grid.w - 24 },
      },
    );
    text.setOrigin(0.5);
    const h = Math.max(text.height, 14) + 16;
    const band = this.scene.add.graphics();
    band.fillStyle(palette.inkDeep, 0.92);
    band.fillRoundedRect(
      grid.x + 4,
      grid.y + grid.h / 2 - h / 2,
      grid.w - 8,
      h,
      WELL_RADIUS,
    );
    band.lineStyle(1, palette.frame, 0.4);
    band.strokeRoundedRect(
      grid.x + 4,
      grid.y + grid.h / 2 - h / 2,
      grid.w - 8,
      h,
      WELL_RADIUS,
    );
    return [band, text];
  }

  // ── The stash panel ──────────────────────────────────────────────────────

  /**
   * The left panel in stash mode (FS-VPD8Y R35–36): the count, then the stash in cells drawn as
   * the bag's are, rows past 60 tinted over and the count in the over tone, scrolled by the
   * wheel. A status line shows over it as over the bag (edge state "REST load fails").
   */
  private stashPanel(stash: ItemState[]): Phaser.GameObjects.GameObject[] {
    if (!this.layout) return [];
    const s = stashPanelLayout(
      this.layout.left,
      stash.length,
      this.stashScroll,
    );
    this.stashGrid = s;
    this.stashScroll = s.scroll;
    const out: Phaser.GameObjects.GameObject[] = [];
    const over = stash.length > STASH_CAPACITY;
    const count = this.label(
      s.grid.x + s.grid.w,
      s.countY,
      stashCountLabel(stash.length),
      over ? palette.damageBright : palette.hudText,
      12,
      1,
    );
    count.setOrigin(1, 0);
    out.push(count);
    out.push(...this.itemGrid(s, stash));
    return out;
  }

  /**
   * A bag's or the stash's cells with what they hold, the rows past capacity tinted over, a
   * scroll bar when its rows do not all fit, and the status line over it while one is set.
   */
  private itemGrid(
    g: ItemGrid,
    items: readonly ItemState[],
  ): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    for (const cell of g.cells) {
      const item = items[cell.index];
      out.push(this.well(cell.rect, item, cell.over));
      if (item) out.push(this.icon(cell.rect, item));
    }
    if (g.visibleRows < g.rows)
      out.push(
        this.scrollBar(g.grid.x + g.grid.w + 4, g.grid.y, g.grid.h, {
          first: g.scroll,
          count: g.visibleRows,
          rows: g.rows,
        }),
      );
    if (this.status) out.push(...this.statusLine(g.grid, this.status));
    return out;
  }

  // ── The stats panel ──────────────────────────────────────────────────────

  /** The left panel from the latest state and what is worn, only when what it shows changed. */
  private redrawStats(): void {
    // in stash mode the left panel is the stash's (FS-VPD8Y R35)
    if (!this.layout || !this.character || this.stash) return;
    const sheet = characterSheet(this.character, this.equipped);
    const shows = JSON.stringify(sheet);
    if (`${this.statsScroll}:${shows}` === this.shownSheet) return;
    this.stats?.destroy();
    const area = statsPanelArea(this.layout.left);
    const rows = this.statsRows(sheet, area);
    const win = rowWindow(
      rows.map((r) => r.h),
      area.h,
      this.statsScroll,
    );
    this.statsScroll = win.first;
    this.statsView = { area, win };
    this.shownSheet = `${this.statsScroll}:${shows}`;

    // only whole rows inside the area are drawn, so nothing passes the panel's foot
    const out: Phaser.GameObjects.GameObject[] = [];
    const ink = this.scene.add.graphics();
    out.push(ink);
    let y = area.y;
    for (const row of rows.slice(win.first, win.first + win.count)) {
      row.draw(y, out, ink);
      y += row.h;
    }
    if (win.count < win.rows)
      out.push(this.scrollBar(area.x + area.w + 4, area.y, area.h, win));
    this.stats = this.scene.add.container(0, 0, out);
    this.stats.setDepth(GEAR_OVERLAY_DEPTH + 1).setScrollFactor(0);
  }

  /**
   * Top to bottom: class, name, level and the experience bar (R25–26); health and the class
   * resource, each with a thin bar in its HUD colour (R27); the class card (R28); what worn gear
   * adds (R29). Each row knows its height, so the panel shows the rows that fit and scrolls the
   * rest (edge state "Small window").
   */
  private statsRows(sheet: CharacterSheet, area: Rect): StatsRow[] {
    const { x, w } = area;
    const right = (text: Phaser.GameObjects.Text) => text.setOrigin(1, 0);
    const rows: StatsRow[] = [];
    const row = (h: number, draw: StatsRow["draw"]) => rows.push({ h, draw });

    row(18, (y, out) =>
      out.push(this.label(x, y, sheet.className, palette.frameBright, 12, 3)),
    );
    row(26, (y, out) =>
      out.push(this.label(x, y, sheet.name, palette.hudText, 18, 1)),
    );
    row(18, (y, out) => {
      out.push(
        this.label(x, y, `Level ${sheet.level}`, palette.hudLabel, 12, 1),
      );
      if (sheet.xp.text)
        out.push(
          right(
            this.label(x + w, y + 1, sheet.xp.text, palette.hudFaint, 11, 1),
          ),
        );
    });
    row(XP_BAR_H + 14, (y, _out, ink) =>
      drawXpBar(ink, x, y, w, XP_BAR_H, sheet.xp.fraction),
    );

    for (const r of sheet.resources)
      row(STAT_ROW_H + RESOURCE_BAR_H + 10, (y, out, ink) => {
        out.push(this.label(x, y, r.label, palette.hudLabel, 12, 1));
        out.push(right(this.label(x + w, y, r.text, palette.hudText, 12, 1)));
        const bar = y + STAT_ROW_H;
        ink.fillStyle(palette.hudTrack, 0.9);
        ink.fillRect(x, bar, w, RESOURCE_BAR_H);
        if (r.fill > 0) {
          ink.fillStyle(HUD_BAR_FILL[r.channel], 1);
          ink.fillRect(x, bar, Math.round(w * r.fill), RESOURCE_BAR_H);
        }
      });

    /** A heading under a rule, `lead` px below the row above. */
    const section = (words: string, lead = 0) =>
      row(lead + 30, (y, out, ink) => {
        ink.lineStyle(1, palette.frame, 0.3);
        ink.lineBetween(x, y + lead, x + w, y + lead);
        out.push(
          this.label(x, y + lead + 8, words, palette.frameBright, 12, 3),
        );
      });
    const stat = (label: string, value: string) =>
      row(STAT_ROW_H, (y, out) => {
        out.push(this.label(x, y, label, palette.hudLabel, 12, 1));
        out.push(right(this.label(x + w, y, value, palette.hudText, 12, 1)));
      });
    const line = (words: string, color: number) =>
      row(STAT_ROW_H, (y, out) =>
        out.push(this.label(x, y, words, color, 12, 1)),
      );

    if (sheet.classStats.length) {
      section("CLASS");
      for (const s of sheet.classStats) stat(s.label, s.value);
    }
    section("FROM GEAR", sheet.classStats.length ? 8 : 0);
    for (const s of sheet.gear.stats) stat(s.label, s.value);
    for (const a of sheet.gear.affixes) line(a, palette.hudText);
    if (sheet.gear.note) line(sheet.gear.note, palette.hudFaint);
    return rows;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.pointer = { x: pointer.x, y: pointer.y };
    this.updateHover();
  }

  /**
   * A right-press over an item wears or takes it off (R16–17), or in stash mode moves it
   * (FS-VPD8Y R38); a left-press does nothing (R18).
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointer = { x: pointer.x, y: pointer.y };
    this.updateHover();
    if (pointer.button === 2) this.act();
  }

  /**
   * The wheel over the bag scrolls its rows (R23), and over the stats panel its rows, a row a
   * step, when they do not all fit (edge state "Small window").
   */
  private onWheel(
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    const step = Math.sign(dy);
    const scrolls = (g: ItemGrid | undefined): g is ItemGrid =>
      g !== undefined &&
      g.visibleRows < g.rows &&
      inRect(g.grid, pointer.x, pointer.y);
    /** A grid's first row a step on, kept so its last row stays in view. */
    const stepped = (g: ItemGrid, from: number) =>
      Math.min(Math.max(0, from + step), g.rows - g.visibleRows);
    if (scrolls(this.gear)) {
      const next = stepped(this.gear, this.scroll);
      if (next === this.scroll) return;
      this.scroll = next;
      this.redraw();
      return;
    }
    if (scrolls(this.stashGrid)) {
      const next = stepped(this.stashGrid, this.stashScroll);
      if (next === this.stashScroll) return;
      this.stashScroll = next;
      this.redraw();
      return;
    }
    const stats = this.statsView;
    if (
      stats &&
      stats.win.count < stats.win.rows &&
      inRect(stats.area, pointer.x, pointer.y)
    ) {
      const { first, count, rows } = stats.win;
      // the last row in view: a step further down stays put
      if (step > 0 && first + count >= rows) return;
      const next = Math.max(0, this.statsScroll + step);
      if (next === this.statsScroll) return;
      this.statsScroll = next;
      this.redrawStats();
    }
  }

  private hitAt(x: number, y: number): Hovered | undefined {
    const g = this.gear;
    if (!g) return undefined;
    for (const { slot } of GEAR_SLOTS)
      if (inRect(g.slots[slot], x, y)) return { kind: "slot", slot };
    const cell = g.cells.find((c) => inRect(c.rect, x, y));
    if (cell) return { kind: "bag", index: cell.index };
    const stashed = this.stashGrid?.cells.find((c) => inRect(c.rect, x, y));
    return stashed ? { kind: "stash", index: stashed.index } : undefined;
  }

  private itemOf(at: Hovered): ItemState | undefined {
    if (at.kind === "slot") return this.equipped[at.slot] ?? undefined;
    return at.kind === "bag"
      ? this.inventory[at.index]
      : this.stash?.[at.index];
  }

  private rectOf(at: Hovered): Rect | undefined {
    const g = this.gear;
    if (!g) return undefined;
    if (at.kind === "slot") return g.slots[at.slot];
    const cells = at.kind === "bag" ? g.cells : this.stashGrid?.cells;
    return cells?.find((c) => c.index === at.index)?.rect;
  }

  private updateHover(): void {
    if (!this.visible) return;
    const now = this.hitAt(this.pointer.x, this.pointer.y);
    if (hoverKey(now) === hoverKey(this.hovered)) {
      this.moveTip();
      return;
    }
    this.hovered = now;
    this.hideTip();
    this.hoverRing?.clear();
    if (!now) return;
    const rect = this.rectOf(now);
    if (rect && this.hoverRing) {
      this.hoverRing.fillStyle(palette.frame, 0.12);
      this.hoverRing.fillRoundedRect(
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        WELL_RADIUS,
      );
      this.hoverRing.lineStyle(1, palette.frameBright, 0.8);
      this.hoverRing.strokeRoundedRect(
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        WELL_RADIUS,
      );
    }
    const item = this.itemOf(now);
    if (item) this.showTip(item);
  }

  /**
   * Wear or take off what the pointer is over. In stash mode nothing is worn: a worn item still
   * comes off to the bag, a bag item moves to the stash and a stash item to the bag (FS-VPD8Y R38).
   */
  private act(): void {
    if (this.status) return;
    const at = this.hovered;
    if (!at) return;
    const item = this.itemOf(at);
    if (!item) return;
    if (at.kind === "slot") this.unequip(item, at.slot);
    else if (this.stash) this.move(item, at.kind === "bag" ? "stash" : "bag");
    else if (at.kind === "bag") this.equip(item);
  }

  /** To the end of the other side (FS-VPD8Y R41), unless the move is not allowed (R39). */
  private move(item: ItemState, to: ItemLocation): void {
    if (!this.stash || (this.mayMove && !this.mayMove(item, to))) return;
    const without = (items: ItemState[]) =>
      items.filter((i) => i.entity_id !== item.entity_id);
    if (to === "stash") {
      this.inventory = without(this.inventory);
      this.stash = [...without(this.stash), item];
    } else {
      this.stash = without(this.stash);
      this.inventory = [...without(this.inventory), item];
    }
    this.redraw();
    this.onMove?.(item, to);
  }

  /**
   * Into the slot the server will choose (FS-4R9M9 R42): a consumable's first empty slot (a
   * flash when all are full), a ring's first empty ring slot or ring 1, else its one slot. What
   * was worn there goes to the end of the bag (R16).
   */
  private equip(item: ItemState): void {
    const slot = equipSlotFor(item, this.equipped);
    if (!slot) {
      if (getItemType(item) === "consumable")
        this.flash("All consumable slots are full");
      return;
    }
    if (this.mayEquip && !this.mayEquip(item, slot)) return;
    const displaced = this.equipped[slot];
    this.inventory = this.inventory.filter(
      (i) => i.entity_id !== item.entity_id,
    );
    if (displaced) this.inventory.push(displaced);
    this.equipped[slot] = item;
    this.redraw();
    this.onEquip?.(item, slot);
  }

  /** To the end of the bag (R17), unless the bag has no room for it (R20). */
  private unequip(item: ItemState, slot: EquipmentSlot): void {
    if (this.mayUnequip && !this.mayUnequip(item)) return;
    this.equipped[slot] = null;
    this.inventory.push(item);
    this.redraw();
    this.onUnequip?.(item, slot);
  }

  // ── The tip and the flash ────────────────────────────────────────────────

  private view(item: ItemState): ItemView {
    return itemView(item, this.characterLevel, this.world);
  }

  /** The item's tip (R15): every line the item views share, for this character. */
  private showTip(item: ItemState): void {
    this.tip = buildItemTip(this.scene, this.view(item));
    this.tip.container.setDepth(TIP_DEPTH).setScrollFactor(0);
    this.moveTip();
  }

  /** Beside the cursor, flipped to the other side where it would leave the screen. */
  private moveTip(): void {
    if (!this.tip) return;
    const { container, width, height } = this.tip;
    const cam = this.scene.cameras.main;
    const { x: px, y: py } = this.pointer;
    let x = px + 14;
    let y = py - 10;
    if (x + width > cam.width) x = px - width - 8;
    if (y + height > cam.height) y = Math.max(4, py - height - 8);
    container.setPosition(Math.round(x), Math.round(y));
  }

  private hideTip(): void {
    this.tip?.container.destroy();
    this.tip = undefined;
  }

  /** A short refusal beside the cursor, as the equip panel gave one. */
  private flash(words: string): void {
    const pad = 12;
    const text = this.scene.add.text(pad, pad / 2, words, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "12px",
      color: toCss(palette.damageBright),
      letterSpacing: 1,
    });
    const w = text.width + pad * 2;
    const h = text.height + pad;
    const bg = this.scene.add.graphics();
    bg.fillStyle(palette.mapEdge, 0.95);
    bg.fillRoundedRect(0, 0, w, h, WELL_RADIUS);
    bg.lineStyle(1, palette.damageBright, 0.5);
    bg.strokeRoundedRect(0, 0, w, h, WELL_RADIUS);
    const cam = this.scene.cameras.main;
    const x = Math.min(this.pointer.x + 14, cam.width - w - 4);
    const y = Math.min(this.pointer.y - 10, cam.height - h - 4);
    const flash = this.scene.add.container(x, y, [bg, text]);
    flash.setDepth(FLASH_DEPTH).setScrollFactor(0);
    this.scene.time.delayedCall(1500, () => flash.destroy());
  }
}
