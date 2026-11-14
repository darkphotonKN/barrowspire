/**
 * The gear, bag and stats overlay (FS-HRH2J §A, §B): two mirrored panels on the screen's side
 * edges, drawn over the live world with a clear band between them. The right panel, the
 * inventory, holds the ten gear slots above the 6 × 5 bag; the left, the character panel, is the
 * stats (§C), drawn from the player's own world state, the worn gear and the class card
 * (`characterSheet`), live while open. Each opens and closes on its own, `I` / `B` the inventory
 * and `C` the character panel, and each has an × at its top right (FS-HRH2J § Change: Character
 * and inventory apart). Opened at the hub's stash chest (`openStash`), the left panel shows the
 * account's stash beside the inventory until the inventory closes (FS-VPD8Y §F R35–37; the
 * character panel closes as it opens), and the same gestures move a bag item to the stash and a
 * stash item to the bag (R38).
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
 * `mayUnequip`) before anything is drawn, as a move is. An item on the Bazaar, listed or its sale
 * settling, is dimmed and asked about too; its tip says so in red and its well carries the
 * listed mark, a red corner triangle over its icon (FS-GTNP8).
 *
 * Under the bag sits the purse line (FS-7TGZ3): the coins icon and the account's total gold, its
 * split in a tip on hover. It is a {@link PurseShelf}: the world's `PurseReader` hands it what the
 * wallet says, and it shows "—" until then. It takes no press and no `E`.
 *
 * Game palette world panels (design-guideline "UI Chrome") in the party panel's frame, the one
 * drawing every world panel wears (`drawPanelFrame`, FS-HRH2J § Change C16), vellum text; rarity colour is the rarity edge and, on Runed and Fabled, the still
 * glow and the well's outline (FS-QE2QW §B). Icons are the baked item icons with their generic
 * fallback.
 */

import type Phaser from "phaser";
import type { WorldType } from "@/assets/types/client";
import {
  equipSlotFor,
  getItemType,
  getValidSlotsForItem,
  type EquipmentSlot,
  type EquippedItems,
  type ItemState,
} from "@/types/gameState";
import { itemView, type ItemView } from "@/items/itemView";
import { artSprite } from "@/render/art/phaser";
import { iconSheet } from "@/render/art/itemIcons";
import type { ArtLibrary } from "@/render/art/library";
import { PASS_THROUGH, type UiActWrapper } from "@/audio/uiSounds";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { nothingWorn, type HudPanel } from "./EquipmentHud";
import { satchelIcon } from "./ContainerView";
import { itemShine, strokeWellOutline } from "./itemShine";
import {
  buildItemTip,
  rarityEdge,
  tipGround,
  topTier,
  type ItemTip,
} from "./itemTip";
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
  itemTipRow,
  listedMark,
  overlayLayout,
  overPanel,
  panelClose,
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
import { viewport } from "@/render/viewport";
import { PURSE_UNKNOWN, type PurseShelf, type PurseView } from "./purse";
import { drawPanelFrame, drawPanelTitle, lightClose } from "./panelFrame";

/** Above the HUD (1000) and the satchel (1000), below the item tip and passing notices (2000+). */
export const GEAR_OVERLAY_DEPTH = 1100;
const TIP_DEPTH = 2200;
const FLASH_DEPTH = 2300;

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
  "Right-click or E: wear or take off  //  Shift: compare  //  I, B or Esc: close";
/**
 * In stash mode items move between bag and stash and nothing is worn; worn gear still comes off
 * (FS-VPD8Y R38). A bag item still compares (FS-NV54P R11, R24).
 */
export const STASH_HINT =
  "Right-click or E: move between bag and stash, or take off  //  Shift: compare  //  I, B or Esc: close";

/** A worn tip's caption (FS-NV54P R14): "Worn" for a weapon or armour, and which ring for a ring. */
function wornCaption(slot: EquipmentSlot): string {
  switch (slot) {
    case "ring_1":
      return "Worn · Ring 1";
    case "ring_2":
      return "Worn · Ring 2";
    default:
      return "Worn";
  }
}

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

/**
 * The slots a bag item compares with (FS-NV54P R8–9), in slot order: a weapon's or an armour
 * piece's own slot, a ring's `ring_1` then `ring_2`. A consumable, and an item with no valid
 * slot, compares with nothing.
 */
function compareSlots(item: ItemState): EquipmentSlot[] {
  return getItemType(item) === "consumable" ? [] : getValidSlotsForItem(item);
}

/** The purse tip's padding and text size, as the item tip's body (FS-7TGZ3 R6). */
const PURSE_TIP_PAD = 10;
const PURSE_TIP_SIZE = 12;
/** The gap between the coins icon and the amount. */
const PURSE_ICON_GAP = 6;

/** Which panel: the inventory on the right, the character panel (or the stash) on the left. */
type Side = "left" | "right";

/** A panel's ×: its drawn glyph, the zone that gives it the hand cursor, and its box. */
interface CloseMark {
  side: Side;
  box: Rect;
  glyph: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  lit: boolean;
}

export class GearOverlay implements HudPanel, PurseShelf {
  onEquip?: (item: ItemState, slot: EquipmentSlot) => void;
  onUnequip?: (item: ItemState, slot: EquipmentSlot) => void;
  mayEquip?: (item: ItemState, slot: EquipmentSlot) => boolean;
  mayUnequip?: (item: ItemState) => boolean;
  /** Asked before a stash-mode move is drawn; false leaves the item where it is (FS-VPD8Y R39). */
  mayMove?: (item: ItemState, to: ItemLocation) => boolean;
  /** A stash-mode move, drawn at once to the end of `to` (R38, R41). */
  onMove?: (item: ItemState, to: ItemLocation) => void;

  /** The inventory (the right panel) is open. */
  private inventoryOpen = false;
  /** The character panel (the left panel's stats) is open; never in stash mode (§ Change C9). */
  private characterOpen = false;
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
  /** Each open panel's ×, rebuilt with the frame. */
  private closes: CloseMark[] = [];
  /** The slots, cells, icons and count, rebuilt as what is carried or worn changes. */
  private content?: Phaser.GameObjects.Container;
  /** The stats panel's rows, rebuilt as the sheet they show changes. */
  private stats?: Phaser.GameObjects.Container;
  /** The hover ring, redrawn as the pointer moves. */
  private hoverRing?: Phaser.GameObjects.Graphics;
  private hovered?: Hovered;
  /** The hovered item's tip, then its worn tips while comparing (FS-NV54P R17). */
  private tips: ItemTip[] = [];
  private pointer = { x: -1, y: -1 };
  /**
   * Shift on the scene keyboard, only while open (FS-NV54P R4), never captured (R5). The
   * keyboard is off while the chat input is open, and lets its keys go as the input opens and on
   * blur, so the key reads up then (R6).
   */
  private shift?: Phaser.Input.Keyboard.Key;
  /** Whether Shift was held at the last frame: the worn tips show beside a bag item's tip (R1). */
  private comparing = false;
  /** What the purse line shows: the dash until the wallet has answered (FS-7TGZ3 R10). */
  private purse: PurseView = { amount: PURSE_UNKNOWN };
  /** The purse's tip, while the pointer is over the line (FS-7TGZ3 R5–6). */
  private purseTip?: {
    container: Phaser.GameObjects.Container;
    width: number;
    height: number;
  };

  /**
   * `world` is the world the overlay is drawn in; only a run marks unsafe finds (FS-18Z5F R36–37).
   * `yields` says whether a UI piece holds the pointer now (the UI bridge's `overUi`): a move the UI
   * scene took over one of its pieces, the party panel drawn over the overlay among them, which the
   * overlay gives way to, nothing there lighting or tipping (FS-R82NV § Change C8; FS-TQZ5J § Change:
   * Phase 2, R41, R49). Read on a move only: a press and the wheel over a UI piece never reach the
   * world (FS-TQZ5J R7, R40). `wrapper` runs the overlay's own player input, the panels' ×, as the
   * scene runs its own (the interface sounds' wrapper, FS-WDM0X S9); none, and the input runs as it is.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly world?: WorldType,
    private readonly yields: () => boolean = () => false,
    private readonly wrapper: UiActWrapper = PASS_THROUGH,
  ) {}

  // ── HudPanel ─────────────────────────────────────────────────────────────

  /** Whether either panel is open: the overlay is over the world (§ Change C11). */
  private get visible(): boolean {
    return this.inventoryOpen || this.characterOpen;
  }

  /** `I` / `B`: the inventory opens or closes; the character panel is left as it is (§ Change C2). */
  toggle(): void {
    if (this.inventoryOpen) this.close("right");
    else this.show();
  }

  /** The inventory opens, beside the character panel if that is open. */
  show(): void {
    if (this.inventoryOpen) return;
    const was = this.visible;
    this.inventoryOpen = true;
    this.present(was);
  }

  /** `C`: the character panel opens or closes; refused while the stash holds the left side (C9). */
  toggleCharacter(): void {
    if (this.characterOpen) {
      this.close("left");
      return;
    }
    if (this.stash) return;
    const was = this.visible;
    this.characterOpen = true;
    this.present(was);
  }

  /**
   * Opens the overlay in stash mode, the left panel showing the stash beside the inventory
   * (FS-VPD8Y R35), empty until {@link updateStash} fills it. Only with the inventory closed: an
   * open inventory keeps its mode. An open character panel closes, the stash taking its side
   * (FS-HRH2J § Change C9).
   */
  openStash(): void {
    if (this.inventoryOpen) return;
    const was = this.visible;
    this.characterOpen = false;
    this.stash = [];
    this.stashScroll = 0;
    this.inventoryOpen = true;
    this.present(was);
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

  /** Both panels close: Esc, Q, a world switch (§ Change C3). */
  hide(): void {
    if (!this.visible) return;
    this.inventoryOpen = false;
    this.characterOpen = false;
    // closing ends stash mode: the next open shows the inventory alone (FS-VPD8Y R37, C9)
    this.stash = undefined;
    this.scene.input?.off("pointermove", this.onPointerMove, this);
    this.scene.input?.off("pointerdown", this.onPointerDown, this);
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.scale?.off("resize", this.relayout, this);
    this.scene.events?.off("shutdown", this.hide, this);
    this.scene.events?.off("update", this.readShift, this);
    // closing lets go of Shift (R23). The key is never removed: `addKey` handed back the scene's
    // own Shift (its cursor keys' shift), and removing it would stop that key hearing presses
    this.shift = undefined;
    this.comparing = false;
    this.teardown();
  }

  isVisible(): boolean {
    return this.visible;
  }

  isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  isCharacterOpen(): boolean {
    return this.characterOpen;
  }

  /**
   * One panel closes, by its key or its × (§ Change C4); the other stays as it was. The last one
   * open closes the overlay, and so does the inventory in stash mode, the stash going with it
   * (FS-VPD8Y R37).
   */
  private close(side: Side): void {
    const other = side === "right" ? this.characterOpen : this.inventoryOpen;
    if (!other || this.stash) {
      this.hide();
      return;
    }
    if (side === "right") this.inventoryOpen = false;
    else this.characterOpen = false;
    this.present(true);
  }

  /**
   * Draws what is open now: the first panel to open hangs the overlay's handlers on the scene,
   * a second one (or one closing beside another) only draws again.
   */
  private present(wasOpen: boolean): void {
    if (wasOpen) {
      this.teardown();
      this.build();
      return;
    }
    this.shift = this.scene.input.keyboard?.addKey("SHIFT", false);
    this.comparing = this.shift?.isDown ?? false;
    this.build();
    // Phaser lets a key go on blur and as the chat input opens without an event, so Shift is
    // read each frame rather than heard (R2, R6)
    this.scene.events?.on("update", this.readShift, this);
    this.scene.input.on("pointermove", this.onPointerMove, this);
    this.scene.input.on("pointerdown", this.onPointerDown, this);
    this.scene.input.on("wheel", this.onWheel, this);
    this.scene.scale?.on("resize", this.relayout, this);
    // a world switch while open takes the overlay with it (edge state "World switch while open")
    this.scene.events?.once("shutdown", this.hide, this);
  }

  covers(x: number, y: number): boolean {
    return (
      this.visible &&
      this.layout !== undefined &&
      overPanel(this.layout, x, y, {
        left: this.leftShown(),
        right: this.inventoryOpen,
      })
    );
  }

  /**
   * E while the inventory is open: wear or take off whatever the pointer is over; nothing hovered,
   * nothing happens (R10). The character panel holds nothing to wear (§ Change C7).
   */
  handleEquipKey(): void {
    if (!this.inventoryOpen) return;
    this.act();
  }

  /** Whether the left panel is drawn: the character panel, or the stash in stash mode. */
  private leftShown(): boolean {
    return this.characterOpen || this.stash !== undefined;
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

  /** What the wallet said, kept across closing; drawn at once while open (FS-7TGZ3 R8–13). */
  setPurse(view: PurseView): void {
    if (view.amount === this.purse.amount && view.tip === this.purse.tip)
      return;
    this.purse = { ...view };
    if (this.visible) this.redraw();
  }

  /** The player's own state, every state; drawn while open (R30). */
  updateCharacter(player: CharacterSource): void {
    this.character = player;
    if (this.visible) this.redrawStats();
  }

  // ── Building ─────────────────────────────────────────────────────────────

  private build(): void {
    const layout = overlayLayout(viewport.width, viewport.height);
    this.layout = layout;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const open = (side: Side, title: string) => {
      const r = layout[side];
      // the party panel's frame, the one every world panel wears (§ Change C16)
      const g = this.scene.add.graphics();
      const frame = { x: r.x, y: r.y, width: r.w, height: r.h };
      const { glyph } = drawPanelFrame(this.scene, g, frame);
      // the windows' one title (FS-3EBCA R20)
      parts.push(g, drawPanelTitle(this.scene, frame, title));
      this.closes.push(this.closeMark(side, panelClose(r), glyph));
    };
    if (this.leftShown()) open("left", this.stash ? "STASH" : "CHARACTER");
    // the panel, its key and its corner icon name one thing (§ Change C14)
    if (this.inventoryOpen) open("right", "INVENTORY");
    parts.push(...this.closes.map((c) => c.glyph));
    this.frame = this.scene.add.container(0, 0, parts);
    this.frame.setDepth(GEAR_OVERLAY_DEPTH).setScrollFactor(0);
    this.redraw();
  }

  /**
   * A panel's × (§ Change C4), drawn by the frame. Its press is hit-tested by hand with the
   * overlay's other presses (`onPointerDown`), so a scene that asks `covers` first still sees the
   * panel there; the zone is only for the hand cursor.
   */
  private closeMark(
    side: Side,
    box: Rect,
    glyph: Phaser.GameObjects.Text,
  ): CloseMark {
    const zone = this.scene.add
      .zone(box.x, box.y, box.w, box.h)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(GEAR_OVERLAY_DEPTH + 3)
      .setInteractive({ useHandCursor: true });
    return { side, box, glyph, zone, lit: false };
  }

  /** The × under the pointer, if any. */
  private closeAt(x: number, y: number): CloseMark | undefined {
    return this.closes.find((c) => inRect(c.box, x, y));
  }

  /** Each × brighter while the pointer is over it. */
  private lightCloses(): void {
    const over = this.closeAt(this.pointer.x, this.pointer.y);
    for (const c of this.closes) {
      const lit = c === over;
      if (lit === c.lit) continue;
      c.lit = lit;
      lightClose(c.glyph, lit);
    }
  }

  /**
   * The canvas changed size while open: everything is laid out again (R2). Phaser's resize comes
   * on every change of the logical view too, so this is the overlay's re-layout (FS-ZAJMH R13).
   */
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
    this.hidePurseTip();
    const children: Phaser.GameObjects.GameObject[] = this.inventoryOpen
      ? this.inventoryParts(this.layout.right)
      : [];
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

  /** The inventory's insides: the slots, the bag and its count, the hint and the purse line. */
  private inventoryParts(right: Rect): Phaser.GameObjects.GameObject[] {
    this.gear = gearPanelLayout(
      right,
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
      if (item) children.push(...this.held(rect, item));
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
    children.push(...this.purseLine(g.purse));
    return children;
  }

  private teardown(): void {
    this.hideTip();
    this.hidePurseTip();
    this.hovered = undefined;
    this.stats?.destroy();
    this.stats = undefined;
    this.statsView = undefined;
    this.shownSheet = "";
    this.content?.destroy();
    this.hoverRing?.destroy();
    this.frame?.destroy();
    for (const c of this.closes) c.zone.destroy();
    this.closes = [];
    this.content = undefined;
    this.hoverRing = undefined;
    this.frame = undefined;
    this.layout = undefined;
    this.gear = undefined;
    this.stashGrid = undefined;
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
   * oxblood inner edge clear of it (FS-18Z5F R36); a cell past 30 is tinted over (R23). A Runed
   * or Fabled item's outline stands in for the hairline, under the rarity edge (FS-QE2QW R9).
   */
  private well(
    r: Rect,
    item: ItemState | null | undefined,
    over = false,
  ): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(over ? palette.damage : palette.inkDeep, over ? 0.35 : 0.6);
    g.fillRoundedRect(r.x, r.y, r.w, r.h, WELL_RADIUS);
    const view = item ? this.view(item) : undefined;
    const top = view && topTier(view);
    if (top) strokeWellOutline(g, r, WELL_RADIUS, top);
    else {
      g.lineStyle(
        1,
        over ? palette.damageBright : palette.frame,
        over ? 0.4 : 0.22,
      );
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, WELL_RADIUS);
    }
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
   * What a held item draws over its well, in order: a Runed or Fabled item's glow (FS-QE2QW R11),
   * its icon, a Fabled icon's glints and, for an item on the Bazaar, the listed mark over them, so
   * the faint icon never hides the mark (FS-GTNP8 R5). The glow and glints go with their icon, so
   * with `content`.
   */
  private held(r: Rect, item: ItemState): Phaser.GameObjects.GameObject[] {
    const view = this.view(item);
    const shine = itemShine(this.scene, this.art, view, {
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
      side: Math.min(r.w, r.h) * ICON_FILL,
    });
    const icon = this.icon(r, item);
    const glints = shine?.bind(icon);
    const out: Phaser.GameObjects.GameObject[] = [
      ...(shine ? [shine.glow] : []),
      icon,
      ...(glints ? [glints] : []),
    ];
    const kind = view.standing?.kind;
    if (kind === "listed" || kind === "settling") out.push(this.listedMark(r));
    return out;
  }

  /** The listed mark: a red triangle in the well's top-right corner (FS-GTNP8 R5–R7). */
  private listedMark(r: Rect): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(palette.listed, 1);
    g.fillTriangle(...listedMark(r));
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

  // ── The purse line ───────────────────────────────────────────────────────

  /** The coins icon, then the total in the bag count's tone, left-aligned with the grid (FS-7TGZ3 R1–3). */
  private purseLine(r: Rect): Phaser.GameObjects.GameObject[] {
    const coin = artSprite(
      this.scene,
      this.art,
      r.x + r.h / 2,
      r.y + r.h / 2,
      iconSheet("coins"),
    );
    coin.setOrigin(0.5);
    const size = Math.max(coin.frame?.width ?? 0, coin.frame?.height ?? 0) || 1;
    coin.setScale(r.h / size);
    const amount = this.label(
      r.x + r.h + PURSE_ICON_GAP,
      r.y + r.h / 2,
      this.purse.amount,
      palette.hudText,
      12,
      1,
    );
    amount.setOrigin(0, 0.5);
    return [coin, amount];
  }

  /** The split beside the pointer while it is over the line and the total is known (R5–7). */
  private updatePurseTip(): void {
    const r = this.gear?.purse;
    const over =
      r !== undefined &&
      this.purse.tip !== undefined &&
      inRect(r, this.pointer.x, this.pointer.y);
    if (!over) {
      this.hidePurseTip();
      return;
    }
    if (!this.purseTip) this.purseTip = this.buildPurseTip(this.purse.tip!);
    const [at] = itemTipRow([this.purseTip], this.pointer, viewport);
    this.purseTip.container.setPosition(at.x, at.y);
  }

  /** One line on the item tip's own ground (design-guideline "UI Chrome"). */
  private buildPurseTip(words: string) {
    const text = this.scene.add.text(PURSE_TIP_PAD, PURSE_TIP_PAD, words, {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${PURSE_TIP_SIZE}px`,
      color: toCss(palette.hudText),
      letterSpacing: 1,
    });
    const width = Math.round(text.width + PURSE_TIP_PAD * 2);
    const height = Math.round(text.height + PURSE_TIP_PAD * 2);
    const bg = tipGround(this.scene, width, height);
    const container = this.scene.add.container(0, 0, [bg, text]);
    container.setDepth(TIP_DEPTH).setScrollFactor(0);
    return { container, width, height };
  }

  private hidePurseTip(): void {
    this.purseTip?.container.destroy();
    this.purseTip = undefined;
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
      if (item) out.push(...this.held(cell.rect, item));
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
    // only while the character panel is open; in stash mode the left panel is the stash's
    // (FS-VPD8Y R35, § Change C9)
    if (!this.layout || !this.character || !this.characterOpen) return;
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

  /**
   * The pointer in logical units (Phaser's `pointer.x/y` are backing px, FS-ZAJMH R15): off every
   * panel while a UI piece holds it, so nothing there hovers, lights or answers E (`yields`).
   */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.pointer = this.yields() ? { x: -1, y: -1 } : viewport.toLogical(pointer);
    this.updateHover();
  }

  /**
   * A left-press on a panel's × closes that panel (§ Change C4). A right-press over an item wears
   * or takes it off (R16–17), or in stash mode moves it (FS-VPD8Y R38); a left-press on an item
   * does nothing (R18).
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointer = viewport.toLogical(pointer);
    this.updateHover();
    if (pointer.button === 0) {
      const mark = this.closeAt(this.pointer.x, this.pointer.y);
      if (mark) this.wrapper.act(() => this.close(mark.side));
      return;
    }
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
    const at = viewport.toLogical(pointer);
    const scrolls = (g: ItemGrid | undefined): g is ItemGrid =>
      g !== undefined && g.visibleRows < g.rows && inRect(g.grid, at.x, at.y);
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
      inRect(stats.area, at.x, at.y)
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
    this.lightCloses();
    this.updatePurseTip();
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
    this.showTips(now);
  }

  /** Shift pressed or let go since the last frame: the hovered item's tips again, no pointer move needed (R2). */
  private readShift(): void {
    const held = this.shift?.isDown ?? false;
    if (held === this.comparing) return;
    this.comparing = held;
    this.hideTip();
    if (this.hovered) this.showTips(this.hovered);
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

  /**
   * The hovered item's tip (R15): every line the item views share, for this character. While
   * Shift is held over a bag item, the tip of what is worn in each of its slots follows it,
   * captioned and built from the same view (FS-NV54P R8–14); an empty slot adds none (R10).
   */
  private showTips(at: Hovered): void {
    const item = this.itemOf(at);
    if (!item) return;
    this.tips = [buildItemTip(this.scene, this.view(item))];
    if (this.comparing && at.kind === "bag")
      for (const slot of compareSlots(item)) {
        const wornItem = this.equipped[slot];
        if (wornItem)
          this.tips.push(
            buildItemTip(this.scene, this.view(wornItem), {
              caption: wornCaption(slot),
            }),
          );
      }
    for (const tip of this.tips)
      tip.container.setDepth(TIP_DEPTH).setScrollFactor(0);
    this.moveTip();
  }

  /** The row beside the cursor, flipped or pushed in where it would leave the screen (FS-NV54P §D). */
  private moveTip(): void {
    if (!this.tips.length) return;
    // the pointer is in logical units, so the screen it stays on is the logical view (FS-ZAJMH R15)
    const at = itemTipRow(this.tips, this.pointer, viewport);
    this.tips.forEach((tip, i) => tip.container.setPosition(at[i].x, at[i].y));
  }

  private hideTip(): void {
    for (const tip of this.tips) tip.container.destroy();
    this.tips = [];
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
    const x = Math.min(this.pointer.x + 14, viewport.width - w - 4);
    const y = Math.min(this.pointer.y - 10, viewport.height - h - 4);
    const flash = this.scene.add.container(x, y, [bg, text]);
    flash.setDepth(FLASH_DEPTH).setScrollFactor(0);
    this.scene.time.delayedCall(1500, () => flash.destroy());
  }
}
