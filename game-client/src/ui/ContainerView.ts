/**
 * The container view (FS-2325V §D): the leather satchel a coffer opens into.
 *
 * It replaces the presentation of the chest item rows and nothing else. It opens and closes on
 * the scene's old triggers, and taking an item sends exactly the message the item UI sent,
 * under the same optimistic `lootedAt` pending guard (CONTEXT.md "Container view").
 *
 * The rules (pending loots, where icons sit, what a point hits) are Phaser-free and tested
 * without a canvas; `ContainerView` at the bottom is the Phaser side. The icon mapping is in
 * `@/render/art/itemIcons`.
 */

import type Phaser from "phaser";
import { ActionType, type InteractPayload } from "@/assets/types/client";
import { artSprite } from "@/render/art/phaser";
import { iconSheet, itemIcon } from "@/render/art/itemIcons";
import type { ArtLibrary } from "@/render/art/library";
import { getItemType, type ItemState } from "@/types/gameState";
import { itemView } from "@/items/itemView";
import { CANVAS_FONT, palette, rgba, toCss } from "@/utils/canvasPalette";
import { buildItemTip, type ItemTip } from "./itemTip";
import {
  BODY_H,
  BODY_W,
  FLAP_H,
  FLAP_HINGE_Y,
  SATCHEL_BODY_KEY,
  SATCHEL_FLAP_KEY,
  ensureSatchelTextures,
} from "./satchel";

// ── Item detail ───────────────────────────────────────────────────────────

// Which icon an item is drawn with lives in `@/render/art/itemIcons`, Phaser-free and shared
// with the Bazaar page (FS-8EGFA req 32), so both surfaces draw an item alike. What its hover
// tip says lives in `@/items/itemView`, shared with the equipment panel (FS-4R9M9 R59).

/**
 * The icon an item in the satchel is drawn with. The run's world state names no item type, so
 * it is read from the stats, and a ring gets the ring icon (FS-4R9M9 R60).
 */
export function satchelIcon(item: ItemState): string {
  return iconSheet(itemIcon({ ...item, item_type: getItemType(item) }));
}

// ── Looting ───────────────────────────────────────────────────────────────

/**
 * The WS message that loots an item from an open coffer. It is the message the chest item UI
 * always sent (FS-2325V §0.2, §D.2): the satchel changes how an item looks, never what taking
 * it says to the server.
 */
export function lootMessage(item: ItemState): {
  action: typeof ActionType.Interact;
  payload: InteractPayload;
} {
  return {
    action: ActionType.Interact,
    payload: { entity_id: item.entity_id },
  };
}

/** How long a loot waits for the server before the item is takeable again, by default. */
export const LOOT_PENDING_MS = 1000;

export type ContentsState = "rummaging" | "empty" | "items";

/**
 * What the open satchel holds, with the optimistic `lootedAt` pending pattern: a taken item
 * cannot be taken again, and stays out of reach for the pending window even while the server
 * still lists it. If the server still has it after the window, it is takeable again (the loot
 * did not land).
 *
 * A pending item keeps its place in the satchel (`laidOut`) until the server drops it, so the
 * icons do not shuffle under the cursor and a quick second click lands on an empty spot rather
 * than on the neighbour that would have slid into it.
 *
 * Phaser-free, so the looting rules are tested without a canvas. Pending loots outlive a close,
 * as they always have: reopening the coffer within the window does not resurrect the item.
 */
export class ContainerContents {
  private readonly lootedAt = new Map<string, number>();
  private placed: ItemState[] = [];
  private synced = false;

  constructor(private readonly pendingMs = LOOT_PENDING_MS) {}

  /** Every item that has a place in the satchel, pending ones included, in the server's order. */
  get laidOut(): readonly ItemState[] {
    return this.placed;
  }

  /** The items that can be taken: laid out and not pending. */
  get items(): readonly ItemState[] {
    return this.placed.filter((item) => !this.lootedAt.has(item.entity_id));
  }

  get state(): ContentsState {
    if (!this.synced) return "rummaging";
    return this.items.length === 0 ? "empty" : "items";
  }

  /** Server contents in. True when what is shown changed, so the view rebuilds only then. */
  sync(items: readonly ItemState[], now: number): boolean {
    const before = this.fingerprint();
    for (const item of items) this.pending(item.entity_id, now); // expire elapsed loots
    this.placed = items.map((item) => ({ ...item }));
    const changed = !this.synced || this.fingerprint() !== before;
    this.synced = true;
    return changed;
  }

  /** Takes an item, marking its loot pending. Null when it is not shown or already pending. */
  take(entityId: string, now: number): ItemState | null {
    if (this.pending(entityId, now)) return null;
    const item = this.placed.find((i) => i.entity_id === entityId);
    if (!item) return null;
    this.lootedAt.set(entityId, now);
    return item;
  }

  /** The F key: take whatever is first in the satchel. */
  takeFirst(now: number): ItemState | null {
    const first = this.items[0];
    return first ? this.take(first.entity_id, now) : null;
  }

  /** The takeable item whose icon is under a panel-local point, if any. */
  at(x: number, y: number): ItemState | undefined {
    const item = itemAt(this.placed, x, y);
    return item && !this.lootedAt.has(item.entity_id) ? item : undefined;
  }

  /** The satchel closed: forget what it showed, keep the pending loots. */
  clear(): void {
    this.placed = [];
    this.synced = false;
  }

  /** Whether a loot is still awaiting the server; forgets it once the window has passed. */
  private pending(entityId: string, now: number): boolean {
    const at = this.lootedAt.get(entityId);
    if (at === undefined) return false;
    if (now - at < this.pendingMs) return true;
    this.lootedAt.delete(entityId);
    return false;
  }

  private fingerprint(): string {
    return this.placed
      .map((i) =>
        this.lootedAt.has(i.entity_id) ? `(${i.entity_id})` : i.entity_id,
      )
      .join(",");
  }
}

// ── Where icons sit in the satchel ────────────────────────────────────────

/**
 * The part of the satchel body icons may occupy, in panel-local px (origin at the body's
 * centre): below the lip, inside the stitching.
 */
export const SATCHEL_INTERIOR = {
  left: -120,
  right: 120,
  top: -78,
  bottom: 126,
} as const;

const COLUMNS = 4;
const PITCH_X = 60;
const PITCH_Y = 64;
/** Drawn icon size and click target, at full scale. The target is smaller than the icon. */
const ICON_PX = 56;
const HIT_PX = 52;
/** A little per-item scatter, so the bag reads as tipped-in plunder rather than a grid. */
const JITTER_X = 3;
const JITTER_Y = 4;

export interface SatchelLayout {
  /** Icon centres, one per item, in item order. */
  slots: { x: number; y: number }[];
  /** Drawn icon size and click-target size, in px. */
  icon: number;
  hit: number;
  scale: number;
}

/**
 * Where each item's icon sits. Full size while the plunder fits (three rows of four); a fuller
 * coffer shrinks every icon evenly rather than overflowing the leather. An item's scatter comes
 * from its entity id, so a rebuild never shuffles the bag.
 */
export function satchelLayout(items: readonly ItemState[]): SatchelLayout {
  const { left, right, top, bottom } = SATCHEL_INTERIOR;
  const rows = Math.max(1, Math.ceil(items.length / COLUMNS));
  const fullHeight = (rows - 1) * PITCH_Y + HIT_PX + 2 * JITTER_Y;
  const scale = Math.min(1, (bottom - top) / fullHeight);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const slots = items.map((item, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const [jx, jy] = scatter(item.entity_id);
    return {
      x: midX + ((col - (COLUMNS - 1) / 2) * PITCH_X + jx * JITTER_X) * scale,
      y: midY + ((row - (rows - 1) / 2) * PITCH_Y + jy * JITTER_Y) * scale,
    };
  });
  return { slots, icon: ICON_PX * scale, hit: HIT_PX * scale, scale };
}

/** The item whose icon is under a panel-local point, if any. */
export function itemAt(
  items: readonly ItemState[],
  x: number,
  y: number,
): ItemState | undefined {
  const { slots, hit } = satchelLayout(items);
  const index = slots.findIndex(
    (s) => Math.abs(x - s.x) <= hit / 2 && Math.abs(y - s.y) <= hit / 2,
  );
  return index === -1 ? undefined : items[index];
}

/** Two stable values in [-1, 1] from a string (FNV-1a). */
function scatter(key: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++)
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const unit = (bits: number) => ((bits & 0xff) / 255) * 2 - 1;
  return [unit(h >>> 8), unit(h >>> 16)];
}

// ── The view ──────────────────────────────────────────────────────────────

/**
 * Screen-space UI: above the light-map (135) and the atmosphere (902–905), with the HUD, and
 * below tooltips and popups (2000).
 */
export const CONTAINER_VIEW_DEPTH = 1000;

/** The composite (lifted flap to hint) is taller above the body's centre than below it. */
const CENTRE_DROP = 16;
const FLAP_OPEN = -0.42;
const STAGGER_MS = 55;
/** When the first icon starts to drop, measured from open: while the flap is still rising. */
const ICONS_AFTER_MS = 420;

export interface ContainerViewOptions {
  /** An icon was clicked (or F pressed) and its loot is now pending: tell the server. */
  onLoot(item: ItemState): void;
  /** Wall-clock ms for the pending window. The scene's inventory uses `Date.now` too. */
  now?: () => number;
  /** The delver's level, to mark "Requires level N" when above it (FS-BDA7X req 45). */
  characterLevel?: () => number | undefined;
}

interface Icon {
  sprite: Phaser.GameObjects.Sprite;
  /** Resting scale; hover draws the icon a touch larger. */
  base: number;
}

/**
 * The satchel panel. The scene says when a coffer opens and closes and hands it the coffer's
 * contents; the view owns everything drawn, the hover, and the click. Pointer input is
 * hit-tested by hand in screen space, as the item rows were (Phaser's per-object input is
 * unreliable on scrollFactor-0 containers in this scene).
 */
export class ContainerView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly flap: Phaser.GameObjects.Image;
  private readonly status: Phaser.GameObjects.Text;
  /** The hovered item's tip, built for that item and destroyed when the hover ends. */
  private tip?: ItemTip;
  private readonly now: () => number;
  private icons = new Map<string, Icon>();
  private openFor?: string;
  private iconsFrom = 0;
  private hovered?: string;
  private pointer = { x: -1, y: -1 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    private readonly options: ContainerViewOptions,
    private readonly contents = new ContainerContents(),
  ) {
    this.now = options.now ?? Date.now;
    ensureSatchelTextures(scene);

    const body = scene.add.image(0, 0, SATCHEL_BODY_KEY);
    this.flap = scene.add
      .image(0, FLAP_HINGE_Y, SATCHEL_FLAP_KEY)
      .setOrigin(0.5, 0);
    this.status = scene.add
      .text(0, (SATCHEL_INTERIOR.top + SATCHEL_INTERIOR.bottom) / 2, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "15px",
        color: toCss(palette.hudText),
      })
      .setOrigin(0.5)
      .setShadow(0, 1, rgba(palette.inkDeep, 0.9), 3);
    const hint = scene.add
      .text(0, BODY_H / 2 + 6, "Click or F: take  //  Q: close", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudFaint),
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 1, rgba(palette.inkDeep, 0.9), 2);

    this.root = scene.add.container(0, 0, [body, this.flap, this.status, hint]);
    this.root
      .setDepth(CONTAINER_VIEW_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
  }

  get isOpen(): boolean {
    return this.openFor !== undefined;
  }

  /** The coffer the satchel is open for, if it is open. */
  get entityId(): string | undefined {
    return this.openFor;
  }

  /** Pops in, lifts the flap; icons drop in as the contents arrive (§D.1). */
  open(entityId: string): void {
    this.reset();
    this.openFor = entityId;
    const cam = this.scene.cameras.main;
    this.root.setPosition(cam.width / 2, cam.height / 2 + CENTRE_DROP);
    this.root.setVisible(true).setAlpha(0).setScale(0.85);
    this.flap.setScale(1).clearTint();
    this.iconsFrom = this.scene.time.now + ICONS_AFTER_MS;
    this.showStatus();

    this.scene.tweens.add({
      targets: this.root,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: "Back.Out",
    });
    this.scene.tweens.add({
      targets: this.flap,
      scaleY: FLAP_OPEN,
      delay: 170,
      duration: 420,
      ease: "Cubic.Out",
      onUpdate: () => this.shadeFlap(),
    });
  }

  /** Reverses the open: the flap drops, the satchel fades (§D.1). */
  close(): void {
    if (!this.isOpen) return;
    this.openFor = undefined;
    this.contents.clear();
    this.unhover();
    this.scene.tweens.killTweensOf([this.root, this.flap]);
    this.scene.tweens.add({
      targets: this.flap,
      scaleY: 1,
      duration: 200,
      ease: "Quad.In",
      onUpdate: () => this.shadeFlap(),
    });
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      scale: 0.9,
      delay: 160,
      duration: 160,
      onComplete: () => this.reset(),
    });
  }

  /** The open coffer's contents from the server. Rebuilds only when what is shown changes. */
  setItems(items: readonly ItemState[]): void {
    if (!this.isOpen) return;
    if (this.contents.sync(items, this.now())) this.reconcile();
  }

  /** The F key: loot the first item, as it always has. */
  lootFirst(): void {
    if (!this.isOpen) return;
    this.looted(this.contents.takeFirst(this.now()));
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    this.updateHover();
  }

  /**
   * A click in screen space. True when it landed on the satchel, so the scene does not also
   * treat it as an attack. Only a primary click on an icon loots.
   */
  pointerDown(x: number, y: number, primary: boolean): boolean {
    if (!this.isOpen) return false;
    const p = this.toLocal(x, y);
    if (!onSatchel(p.x, p.y)) return false;
    if (!primary) return true;
    const item = this.shownAt(p.x, p.y);
    if (item) this.looted(this.contents.take(item.entity_id, this.now()));
    return true;
  }

  /** The takeable item under a panel-local point, once its icon has dropped into view. */
  private shownAt(x: number, y: number): ItemState | undefined {
    const item = this.contents.at(x, y);
    const icon = item && this.icons.get(item.entity_id);
    return icon && icon.sprite.alpha >= 0.5 ? item : undefined;
  }

  private looted(item: ItemState | null): void {
    if (!item) return; // not shown, or its loot is still pending: ignored, as before
    this.reconcile();
    this.options.onLoot(item);
  }

  /**
   * Brings the drawn icons in line with the contents: new ones drop in, taken or gone ones lift
   * out, the rest slide to their slots. A pending item keeps its slot, undrawn.
   */
  private reconcile(): void {
    this.unhover();
    const layout = satchelLayout(this.contents.laidOut);
    const keep = new Set(this.contents.items.map((i) => i.entity_id));

    for (const [id, icon] of this.icons)
      if (!keep.has(id)) {
        this.icons.delete(id);
        this.liftOut(icon.sprite);
      }

    let fresh = 0;
    this.contents.laidOut.forEach((item, i) => {
      if (!keep.has(item.entity_id)) return;
      const slot = layout.slots[i];
      const known = this.icons.get(item.entity_id);
      if (known) {
        known.base = this.baseScale(known.sprite, layout.icon);
        this.scene.tweens.killTweensOf(known.sprite);
        known.sprite.setAlpha(1).setScale(known.base);
        this.scene.tweens.add({
          targets: known.sprite,
          x: slot.x,
          y: slot.y,
          duration: 140,
          ease: "Quad.Out",
        });
        return;
      }
      const sprite = artSprite(
        this.scene,
        this.art,
        slot.x,
        slot.y,
        satchelIcon(item),
      );
      sprite.setOrigin(0.5);
      const base = this.baseScale(sprite, layout.icon);
      sprite
        .setScale(base)
        .setAlpha(0)
        .setY(slot.y - 16);
      this.root.addAt(sprite, 1); // above the body, under the flap
      this.icons.set(item.entity_id, { sprite, base });
      this.scene.tweens.add({
        targets: sprite,
        alpha: 1,
        y: slot.y,
        delay:
          Math.max(0, this.iconsFrom - this.scene.time.now) +
          fresh++ * STAGGER_MS,
        duration: 240,
        ease: "Quad.Out",
        onComplete: () => this.updateHover(), // it may have landed under the cursor
      });
    });

    this.showStatus();
    this.updateHover();
  }

  private liftOut(sprite: Phaser.GameObjects.Sprite): void {
    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      y: sprite.y - 18,
      duration: 160,
      ease: "Quad.Out",
      onComplete: () => sprite.destroy(),
    });
  }

  private baseScale(sprite: Phaser.GameObjects.Sprite, size: number): number {
    return size / Math.max(sprite.frame.width, sprite.frame.height);
  }

  private updateHover(): void {
    if (!this.isOpen) return this.unhover();
    const p = this.toLocal(this.pointer.x, this.pointer.y);
    const item = this.shownAt(p.x, p.y);
    if (item?.entity_id === this.hovered) return;
    this.unhover();
    const icon = item && this.icons.get(item.entity_id);
    if (!item || !icon) return;
    this.hovered = item.entity_id;
    icon.sprite.setScale(icon.base * 1.1);
    const reach = icon.sprite.displayHeight / 2 + 6;
    this.showTip(
      item,
      icon.sprite.x,
      icon.sprite.y - reach,
      icon.sprite.y + reach,
    );
  }

  private unhover(): void {
    const icon = this.hovered && this.icons.get(this.hovered);
    if (icon) icon.sprite.setScale(icon.base);
    this.hovered = undefined;
    this.tip?.container.destroy();
    this.tip = undefined;
  }

  /**
   * The hovered item's tip above its icon, or below it where it would not fit (§D.3): every line the item views share (FS-4R9M9
   * R59), its requirement marked when above the delver's level (FS-BDA7X req 45).
   */
  private showTip(
    item: ItemState,
    x: number,
    above: number,
    below: number,
  ): void {
    this.tip?.container.destroy();
    const tip = buildItemTip(
      this.scene,
      itemView(item, this.options.characterLevel?.()),
    );
    const half = BODY_W / 2;
    // Above the icon, unless a long tip (a unique's effect and lore) would leave the screen.
    const screenTop = this.root.y + (above - tip.height) * this.root.scaleY;
    tip.container.setPosition(
      Math.min(Math.max(x - tip.width / 2, -half), half - tip.width),
      screenTop >= 4 ? above - tip.height : below,
    );
    this.root.add(tip.container);
    this.tip = tip;
  }

  private showStatus(): void {
    const state = this.contents.state;
    this.status.setText(state === "empty" ? "(Picked clean)" : "Rummaging...");
    this.status.setVisible(state !== "items");
  }

  /** The lifted flap shows its unlit underside. */
  private shadeFlap(): void {
    if (this.flap.scaleY < 0) this.flap.setTint(palette.satchelUnderside);
    else this.flap.clearTint();
  }

  /** Hidden and empty, whether it closed or is about to reopen. */
  private reset(): void {
    this.scene.tweens.killTweensOf([this.root, this.flap]);
    for (const icon of this.icons.values()) {
      this.scene.tweens.killTweensOf(icon.sprite);
      icon.sprite.destroy();
    }
    this.icons.clear();
    this.unhover();
    this.contents.clear();
    this.root.setVisible(false);
  }

  private toLocal(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.root.x) / this.root.scaleX,
      y: (y - this.root.y) / this.root.scaleY,
    };
  }
}

/** Whether a panel-local point is on the satchel: the body, the lifted flap, or the hint. */
function onSatchel(x: number, y: number): boolean {
  return (
    Math.abs(x) <= BODY_W / 2 &&
    y >= FLAP_HINGE_Y + FLAP_H * FLAP_OPEN &&
    y <= BODY_H / 2 + 24
  );
}
