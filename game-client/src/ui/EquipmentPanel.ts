import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  ItemState,
  EquipmentSlot,
  EquippedItems,
  equipSlotFor,
  getItemType,
} from "@/types/gameState";
import { itemView, type ItemView } from "@/items/itemView";
import { buildItemTip, rarityEdge, type ItemTip } from "./itemTip";

interface SlotLayout {
  slot: EquipmentSlot;
  label: string;
  x: number;
  y: number;
}

interface SlotHitArea {
  slot: EquipmentSlot;
  rect: { x: number; y: number; w: number; h: number };
  item: ItemState | null;
}

interface InventoryRowHitArea {
  rect: { x: number; y: number; w: number; h: number };
  item: ItemState;
}

// Panel dimensions
const EQUIP_W = 420;
const EQUIP_H = 400;
const INV_W = 320;
const INV_H = 400;
const GAP = 20;
const SLOT_BOX_W = 120;
const SLOT_BOX_H = 44;
const INV_ROW_H = 32;
const MAX_VISIBLE_INV = 8;
const PADDING = 16;
/** Where the first slot row and the first inventory row sit, panel-local. */
const SLOTS_TOP = -EQUIP_H / 2 + 48;
const ROWS_TOP = -INV_H / 2 + 42;
/** The rarity accent edge on a row or a worn slot (the guideline's rarity ramp). */
const EDGE_W = 3;

// Colors
const C_FRAME = palette.frame;
const C_BG = palette.ink;
const C_SLOT_EMPTY = palette.hudPanelDeep;
const C_WEAPON = palette.damageBright;
const C_ARMOR = palette.hostile;
const C_CONSUMABLE = palette.safe;
const C_RING = palette.frameBright;

function getSlotColor(slot: EquipmentSlot): number {
  if (slot === "weapon") return C_WEAPON;
  if (slot === "ring_1" || slot === "ring_2") return C_RING;
  if (slot.startsWith("consumable")) return C_CONSUMABLE;
  return C_ARMOR;
}

// Body silhouette layout:
//   [WEAPON]   [HEAD]
//   [HANDS]    [BODY]    [RING 1]
//              [FEET]    [RING 2]
//   [CON 1]   [CON 2]   [CON 3]
const SLOT_LAYOUT: SlotLayout[] = [
  // Row 1: weapon left, head center
  { slot: "weapon", label: "WEAPON", x: -125, y: 0 },
  { slot: "head", label: "HEAD", x: 0, y: 0 },
  // Row 2: hands left (arms), body center, ring right
  { slot: "hands", label: "HANDS", x: -125, y: 58 },
  { slot: "body", label: "BODY", x: 0, y: 58 },
  { slot: "ring_1", label: "RING 1", x: 125, y: 58 },
  // Row 3: feet center, ring right
  { slot: "feet", label: "FEET", x: 0, y: 116 },
  { slot: "ring_2", label: "RING 2", x: 125, y: 116 },
  // Row 4: consumables across bottom
  { slot: "consumable_1", label: "CONS 1", x: -125, y: 186 },
  { slot: "consumable_2", label: "CONS 2", x: 0, y: 186 },
  { slot: "consumable_3", label: "CONS 3", x: 125, y: 186 },
];

export class EquipmentPanel {
  private scene: Phaser.Scene;
  private equipContainer?: Phaser.GameObjects.Container;
  private invContainer?: Phaser.GameObjects.Container;
  private visible = false;

  private equipped: EquippedItems = {
    weapon: null,
    head: null,
    body: null,
    hands: null,
    feet: null,
    ring_1: null,
    ring_2: null,
    consumable_1: null,
    consumable_2: null,
    consumable_3: null,
  };
  private inventory: ItemState[] = [];

  private slotHitAreas: SlotHitArea[] = [];
  private inventoryHitAreas: InventoryRowHitArea[] = [];

  private slotGraphics: Map<EquipmentSlot, Phaser.GameObjects.Graphics> =
    new Map();
  private slotTexts: Map<EquipmentSlot, Phaser.GameObjects.Text> = new Map();

  private invRowGraphics: Phaser.GameObjects.Graphics[] = [];
  private invRowTexts: Phaser.GameObjects.Text[] = [];
  private invEmptyText?: Phaser.GameObjects.Text;

  private hoveredSlot?: EquipmentSlot;
  private hoveredInvIndex = -1;
  private tooltip?: ItemTip;
  /** The active character's level, for "Requires level N" (FS-BDA7X req 45); unknown marks nothing. */
  private characterLevel?: number;

  onEquip?: (item: ItemState, slot: EquipmentSlot) => void;
  onUnequip?: (item: ItemState, slot: EquipmentSlot) => void;

  private pointerMoveHandler?: (p: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.build();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.hideTooltip();
    this.cleanup();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * The active character's level. Items above it are dimmed and their requirement is marked: a
   * hint only, the server is the gate (FS-BDA7X req 45).
   */
  setCharacterLevel(level: number | undefined): void {
    if (level === this.characterLevel) return;
    this.characterLevel = level;
    if (this.visible) this.rebuildInventoryRows();
  }

  /** The item as every item view reads it (FS-4R9M9 R59), for this character. */
  private view(item: ItemState): ItemView {
    return itemView(item, this.characterLevel);
  }

  /** A row's resting colour: dimmed while the character cannot yet equip it. */
  private rowColor(item: ItemState): string {
    return toCss(
      this.view(item).lines.requirement.tooHigh
        ? palette.hudFaint
        : palette.hudText,
    );
  }

  updateInventory(items: ItemState[]): void {
    // Skip rebuild when nothing visible has changed — game state ticks fire
    // many times per second; rebuilding tears down hover state and any open
    // context menu, making the panel feel unresponsive.
    if (this.visible && this.isInventoryEquivalent(items, this.inventory)) {
      this.inventory = items;
      return;
    }
    this.inventory = items;
    if (this.visible) this.rebuildInventoryRows();
  }

  updateEquipment(equipped: EquippedItems): void {
    if (this.visible && this.isEquipmentEquivalent(equipped, this.equipped)) {
      this.equipped = equipped;
      return;
    }
    this.equipped = equipped;
    if (this.visible) this.refreshSlots();
  }

  private isInventoryEquivalent(a: ItemState[], b: ItemState[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].entity_id !== b[i].entity_id) return false;
    }
    return true;
  }

  private isEquipmentEquivalent(a: EquippedItems, b: EquippedItems): boolean {
    const slots: EquipmentSlot[] = [
      "weapon",
      "head",
      "body",
      "hands",
      "feet",
      "ring_1",
      "ring_2",
      "consumable_1",
      "consumable_2",
      "consumable_3",
    ];
    for (const slot of slots) {
      const aId = a[slot]?.entity_id ?? null;
      const bId = b[slot]?.entity_id ?? null;
      if (aId !== bId) return false;
    }
    return true;
  }

  destroy(): void {
    this.hide();
  }

  // === BUILD TWO SEPARATE PANELS ===

  private build(): void {
    const cam = this.scene.cameras.main;
    const totalW = EQUIP_W + GAP + INV_W;
    const leftX = (cam.width - totalW) / 2 + EQUIP_W / 2;
    const rightX = leftX + EQUIP_W / 2 + GAP + INV_W / 2;
    const centerY = cam.height / 2;

    // --- EQUIPMENT PANEL (left) ---
    const eqChildren: Phaser.GameObjects.GameObject[] = [];
    const eqBg = this.scene.add.graphics();
    eqBg.fillStyle(C_BG, 0.92);
    eqBg.fillRoundedRect(-EQUIP_W / 2, -EQUIP_H / 2, EQUIP_W, EQUIP_H, 8);
    eqBg.lineStyle(1, C_FRAME, 0.5);
    eqBg.strokeRoundedRect(-EQUIP_W / 2, -EQUIP_H / 2, EQUIP_W, EQUIP_H, 8);
    eqChildren.push(eqBg);

    const eqTitle = this.scene.add.text(0, -EQUIP_H / 2 + 16, "EQUIPMENT", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.frameBright),
      letterSpacing: 5,
    });
    eqTitle.setOrigin(0.5);
    eqChildren.push(eqTitle);

    // Slots
    this.slotHitAreas = [];
    this.slotGraphics.clear();
    this.slotTexts.clear();

    for (const layout of SLOT_LAYOUT) {
      const slotX = layout.x;
      const slotY = SLOTS_TOP + layout.y;

      const label = this.scene.add.text(slotX, slotY + 2, layout.label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "9px",
        color: toCss(palette.frameBright),
        letterSpacing: 2,
      });
      label.setOrigin(0.5, 0);
      eqChildren.push(label);

      const slotGfx = this.scene.add.graphics();
      eqChildren.push(slotGfx);
      this.slotGraphics.set(layout.slot, slotGfx);

      const slotText = this.scene.add.text(slotX, slotY + SLOT_BOX_H - 4, "—", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "11px",
        color: toCss(palette.frameBright),
      });
      slotText.setOrigin(0.5);
      eqChildren.push(slotText);
      this.slotTexts.set(layout.slot, slotText);

      this.slotHitAreas.push({
        slot: layout.slot,
        rect: { x: 0, y: 0, w: SLOT_BOX_W, h: SLOT_BOX_H },
        item: null,
      });
    }

    const eqHint = this.scene.add.text(
      0,
      EQUIP_H / 2 - 16,
      "HOVER + E TO UNEQUIP",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "9px",
        color: toCss(palette.frameBright),
        letterSpacing: 2,
      },
    );
    eqHint.setOrigin(0.5);
    eqChildren.push(eqHint);

    this.equipContainer = this.scene.add.container(leftX, centerY, eqChildren);
    this.equipContainer.setDepth(1100);
    this.equipContainer.setScrollFactor(0);

    // --- INVENTORY PANEL (right) ---
    const invChildren: Phaser.GameObjects.GameObject[] = [];
    const invBg = this.scene.add.graphics();
    invBg.fillStyle(C_BG, 0.92);
    invBg.fillRoundedRect(-INV_W / 2, -INV_H / 2, INV_W, INV_H, 8);
    invBg.lineStyle(1, C_FRAME, 0.5);
    invBg.strokeRoundedRect(-INV_W / 2, -INV_H / 2, INV_W, INV_H, 8);
    invChildren.push(invBg);

    const invTitle = this.scene.add.text(0, -INV_H / 2 + 16, "INVENTORY", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.frameBright),
      letterSpacing: 5,
    });
    invTitle.setOrigin(0.5);
    invChildren.push(invTitle);

    const invHint = this.scene.add.text(
      0,
      INV_H / 2 - 16,
      "HOVER + E TO EQUIP  //  I CLOSE",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "9px",
        color: toCss(palette.frameBright),
        letterSpacing: 2,
      },
    );
    invHint.setOrigin(0.5);
    invChildren.push(invHint);

    this.invContainer = this.scene.add.container(rightX, centerY, invChildren);
    this.invContainer.setDepth(1100);
    this.invContainer.setScrollFactor(0);

    // Calculate hit areas
    this.updateSlotHitAreas();
    this.refreshSlots();
    this.rebuildInventoryRows();

    // Input
    this.pointerMoveHandler = (p: Phaser.Input.Pointer) =>
      this.handlePointerMove(p);
    this.scene.input.on("pointermove", this.pointerMoveHandler);
  }

  private cleanup(): void {
    if (this.pointerMoveHandler) {
      this.scene.input.off("pointermove", this.pointerMoveHandler);
      this.pointerMoveHandler = undefined;
    }
    this.slotGraphics.clear();
    this.slotTexts.clear();
    this.invRowGraphics = [];
    this.invRowTexts = [];
    this.invEmptyText = undefined;
    this.slotHitAreas = [];
    this.inventoryHitAreas = [];
    this.hoveredSlot = undefined;
    this.hoveredInvIndex = -1;
    if (this.equipContainer) {
      this.equipContainer.destroy();
      this.equipContainer = undefined;
    }
    if (this.invContainer) {
      this.invContainer.destroy();
      this.invContainer = undefined;
    }
  }

  // === HIT AREAS ===

  private updateSlotHitAreas(): void {
    if (!this.equipContainer) return;
    const cx = this.equipContainer.x;
    const cy = this.equipContainer.y;

    for (let i = 0; i < SLOT_LAYOUT.length; i++) {
      const layout = SLOT_LAYOUT[i];
      this.slotHitAreas[i].rect = {
        x: cx + layout.x - SLOT_BOX_W / 2,
        y: cy + SLOTS_TOP + layout.y,
        w: SLOT_BOX_W,
        h: SLOT_BOX_H,
      };
    }
  }

  // === SLOT RENDERING ===

  private refreshSlots(): void {
    for (const layout of SLOT_LAYOUT) {
      const item = this.equipped[layout.slot];
      const text = this.slotTexts.get(layout.slot);
      const hitArea = this.slotHitAreas.find((h) => h.slot === layout.slot);
      if (hitArea) hitArea.item = item;
      if (!text) continue;

      this.drawSlot(layout.slot, false);
      if (item) {
        text.setText(item.name);
        text.setColor(toCss(palette.hudText));
      } else {
        text.setText("—");
        text.setColor(toCss(palette.hudFaint));
      }
    }
  }

  /** A slot's box: hovered, worn (with its rarity edge) or empty. */
  private drawSlot(slot: EquipmentSlot, hovered: boolean): void {
    const gfx = this.slotGraphics.get(slot);
    const layout = SLOT_LAYOUT.find((l) => l.slot === slot);
    if (!gfx || !layout) return;
    const slotX = layout.x - SLOT_BOX_W / 2;
    const slotY = SLOTS_TOP + layout.y;
    const item = this.equipped[slot];

    gfx.clear();
    if (item) {
      const color = getSlotColor(slot);
      gfx.fillStyle(color, hovered ? 0.15 : 0.08);
      gfx.fillRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
      gfx.lineStyle(1, color, hovered ? 0.5 : 0.3);
      gfx.strokeRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
      const edge = rarityEdge(this.view(item));
      if (edge !== undefined) {
        gfx.fillStyle(edge, 0.9);
        gfx.fillRect(slotX + 1, slotY + 6, EDGE_W, SLOT_BOX_H - 12);
      }
    } else if (hovered) {
      gfx.fillStyle(C_FRAME, 0.15);
      gfx.fillRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
      gfx.lineStyle(1, C_FRAME, 0.5);
      gfx.strokeRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
    } else {
      gfx.fillStyle(C_SLOT_EMPTY, 0.3);
      gfx.fillRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
      gfx.lineStyle(1, C_FRAME, 0.06);
      gfx.strokeRoundedRect(slotX, slotY, SLOT_BOX_W, SLOT_BOX_H, 4);
    }
  }

  // === INVENTORY ROWS ===

  private rebuildInventoryRows(): void {
    if (!this.invContainer) return;

    for (const g of this.invRowGraphics) g.destroy();
    for (const t of this.invRowTexts) t.destroy();
    if (this.invEmptyText) {
      this.invEmptyText.destroy();
      this.invEmptyText = undefined;
    }
    this.invRowGraphics = [];
    this.invRowTexts = [];
    this.inventoryHitAreas = [];

    const rowWidth = INV_W - PADDING * 2;

    if (this.inventory.length === 0) {
      this.invEmptyText = this.scene.add.text(0, 0, "(Empty)", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.frameBright),
      });
      this.invEmptyText.setOrigin(0.5);
      this.invContainer.add(this.invEmptyText);
      return;
    }

    const cx = this.invContainer.x;
    const cy = this.invContainer.y;
    const visibleItems = this.inventory.slice(0, MAX_VISIBLE_INV);

    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const rowTop = ROWS_TOP + i * INV_ROW_H;

      const rowBg = this.scene.add.graphics();
      this.drawRow(rowBg, i, item, false);
      this.invContainer.add(rowBg);
      this.invRowGraphics.push(rowBg);

      const label = this.scene.add.text(
        0,
        rowTop + INV_ROW_H / 2,
        this.formatItemLine(item),
        {
          fontFamily: CANVAS_FONT.body,
          fontSize: "13px",
          color: this.rowColor(item),
        },
      );
      label.setOrigin(0.5);
      this.invContainer.add(label);
      this.invRowTexts.push(label);

      this.inventoryHitAreas.push({
        rect: {
          x: cx - rowWidth / 2,
          y: cy + rowTop,
          w: rowWidth,
          h: INV_ROW_H,
        },
        item,
      });
    }

    if (this.inventory.length > MAX_VISIBLE_INV) {
      const moreY = ROWS_TOP + MAX_VISIBLE_INV * INV_ROW_H + 4;
      const moreText = this.scene.add.text(
        0,
        moreY,
        `+${this.inventory.length - MAX_VISIBLE_INV} more...`,
        {
          fontFamily: CANVAS_FONT.body,
          fontSize: "11px",
          color: toCss(palette.frameBright),
        },
      );
      moreText.setOrigin(0.5);
      this.invContainer.add(moreText);
      this.invRowTexts.push(moreText);
    }
  }

  private formatItemLine(item: ItemState): string {
    const { summary } = this.view(item);
    return summary ? `${item.name}  ${summary}` : item.name;
  }

  /** An inventory row's ground: banded, or lit while hovered, with the item's rarity edge. */
  private drawRow(
    gfx: Phaser.GameObjects.Graphics,
    index: number,
    item: ItemState,
    hovered: boolean,
  ): void {
    const rowWidth = INV_W - PADDING * 2;
    const rowTop = ROWS_TOP + index * INV_ROW_H;
    gfx.clear();
    if (hovered) {
      gfx.fillStyle(C_FRAME, 0.08);
      gfx.fillRoundedRect(-rowWidth / 2, rowTop, rowWidth, INV_ROW_H, 4);
      gfx.lineStyle(1, C_FRAME, 0.2);
      gfx.strokeRoundedRect(-rowWidth / 2, rowTop, rowWidth, INV_ROW_H, 4);
    } else {
      gfx.fillStyle(palette.hudPanelDeep, index % 2 === 0 ? 0.25 : 0.15);
      gfx.fillRoundedRect(-rowWidth / 2, rowTop, rowWidth, INV_ROW_H, 4);
      gfx.lineStyle(1, C_FRAME, 0.06);
      gfx.lineBetween(
        -rowWidth / 2 + 8,
        rowTop + INV_ROW_H,
        rowWidth / 2 - 8,
        rowTop + INV_ROW_H,
      );
    }
    const edge = rarityEdge(this.view(item));
    if (edge !== undefined) {
      gfx.fillStyle(edge, 0.9);
      gfx.fillRect(-rowWidth / 2 + 1, rowTop + 5, EDGE_W, INV_ROW_H - 10);
    }
  }

  // === INPUT ===

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.visible) return;

    let foundSlot: EquipmentSlot | undefined;
    for (const hit of this.slotHitAreas) {
      if (this.pointInRect(pointer.x, pointer.y, hit.rect)) {
        foundSlot = hit.slot;
        break;
      }
    }

    if (foundSlot !== this.hoveredSlot) {
      if (this.hoveredSlot) {
        this.setSlotHover(this.hoveredSlot, false);
        this.hideTooltip();
      }
      this.hoveredSlot = foundSlot;
      if (foundSlot) {
        this.setSlotHover(foundSlot, true);
        const item = this.equipped[foundSlot];
        if (item) this.showTooltip(item, pointer.x, pointer.y);
      }
    } else if (foundSlot) {
      this.moveTooltip(pointer.x, pointer.y);
    }

    let foundInvIdx = -1;
    if (!foundSlot) {
      for (let i = 0; i < this.inventoryHitAreas.length; i++) {
        if (
          this.pointInRect(pointer.x, pointer.y, this.inventoryHitAreas[i].rect)
        ) {
          foundInvIdx = i;
          break;
        }
      }
    }

    if (foundInvIdx !== this.hoveredInvIndex) {
      if (this.hoveredInvIndex !== -1) {
        this.setInvRowHover(this.hoveredInvIndex, false);
        this.hideTooltip();
      }
      this.hoveredInvIndex = foundInvIdx;
      if (foundInvIdx !== -1) {
        this.setInvRowHover(foundInvIdx, true);
        this.showTooltip(
          this.inventoryHitAreas[foundInvIdx].item,
          pointer.x,
          pointer.y,
        );
      }
    } else if (foundInvIdx !== -1) {
      this.moveTooltip(pointer.x, pointer.y);
    }
  }

  // === EQUIP KEY HANDLER ===

  /**
   * Triggered by `keydown-E` while the panel is visible. Equips/unequips
   * whatever the cursor is currently hovering. Equipped slot under the cursor
   * takes priority over an inventory row underneath it.
   */
  handleEquipKey(): void {
    console.log("[EquipPanel] handleEquipKey called", {
      visible: this.visible,
      hoveredSlot: this.hoveredSlot,
      hoveredInvIndex: this.hoveredInvIndex,
      hitAreasLength: this.inventoryHitAreas.length,
    });
    if (!this.visible) return;

    // Unequip path: hovering an equipped slot.
    if (this.hoveredSlot) {
      const item = this.equipped[this.hoveredSlot];
      console.log("[EquipPanel] unequip path", {
        slot: this.hoveredSlot,
        hasItem: !!item,
      });
      if (item) {
        this.unequipItem(item, this.hoveredSlot);
        return;
      }
    }

    // Equip path: hovering an inventory row.
    if (
      this.hoveredInvIndex >= 0 &&
      this.hoveredInvIndex < this.inventoryHitAreas.length
    ) {
      const item = this.inventoryHitAreas[this.hoveredInvIndex].item;
      console.log("[EquipPanel] equip path", {
        index: this.hoveredInvIndex,
        item,
      });
      this.equipHoveredItem(item);
    }
  }

  /**
   * Equips into the slot the server will choose: a consumable's first empty slot (a flash when
   * all are full), a ring's first empty ring slot or ring 1 (FS-4R9M9 R42), else its one slot,
   * swapping out whatever is worn there.
   */
  private equipHoveredItem(item: ItemState): void {
    const slot = equipSlotFor(item, this.equipped);
    if (slot) {
      this.equipItem(item, slot);
      return;
    }
    if (getItemType(item) === "consumable") {
      const cam = this.scene.cameras.main;
      this.showFlashMessage(
        "All consumable slots are full",
        cam.width / 2,
        cam.height / 2,
      );
    }
  }

  private showFlashMessage(
    message: string,
    screenX: number,
    screenY: number,
  ): void {
    const padding = 12;
    const text = this.scene.add.text(0, 0, message, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "12px",
      color: toCss(palette.damageBright),
      letterSpacing: 1,
    });
    const bg = this.scene.add.graphics();
    const w = text.width + padding * 2;
    const h = text.height + padding;
    bg.fillStyle(palette.mapEdge, 0.95);
    bg.fillRoundedRect(0, 0, w, h, 6);
    bg.lineStyle(1, palette.damageBright, 0.5);
    bg.strokeRoundedRect(0, 0, w, h, 6);
    text.setPosition(padding, padding / 2);

    let x = screenX + 14;
    let y = screenY - 10;
    const cam = this.scene.cameras.main;
    if (x + w > cam.width) x = cam.width - w - 4;
    if (y + h > cam.height) y = cam.height - h - 4;

    const flash = this.scene.add.container(x, y, [bg, text]);
    flash.setDepth(2300);
    flash.setScrollFactor(0);

    this.scene.time.delayedCall(1500, () => flash.destroy());
  }

  // === EQUIP/UNEQUIP ===

  private equipItem(item: ItemState, slot: EquipmentSlot): void {
    const existing = this.equipped[slot];
    if (existing) this.inventory.push(existing);
    this.inventory = this.inventory.filter(
      (i) => i.entity_id !== item.entity_id,
    );
    this.equipped[slot] = item;
    this.refreshSlots();
    this.rebuildInventoryRows();
    this.onEquip?.(item, slot);
  }

  private unequipItem(item: ItemState, slot: EquipmentSlot): void {
    this.inventory.push(item);
    this.equipped[slot] = null;
    this.refreshSlots();
    this.rebuildInventoryRows();
    this.onUnequip?.(item, slot);
  }

  // === HOVER ===

  private setSlotHover(slot: EquipmentSlot, hovered: boolean): void {
    this.drawSlot(slot, hovered);
  }

  private setInvRowHover(index: number, hovered: boolean): void {
    const gfx = this.invRowGraphics[index];
    const text = this.invRowTexts[index];
    const item = this.inventoryHitAreas[index]?.item;
    if (!gfx || !text || !item) return;
    this.drawRow(gfx, index, item, hovered);
    text.setColor(hovered ? toCss(palette.frameBright) : this.rowColor(item));
  }

  // === TOOLTIP ===

  /** The item's tip (FS-4R9M9 R59): every line the item views share, for this character. */
  private showTooltip(item: ItemState, screenX: number, screenY: number): void {
    this.hideTooltip();
    this.tooltip = buildItemTip(this.scene, this.view(item));
    this.tooltip.container.setDepth(2200);
    this.tooltip.container.setScrollFactor(0);
    this.moveTooltip(screenX, screenY);
  }

  /** Beside the cursor, flipped to the other side where it would leave the screen. */
  private moveTooltip(screenX: number, screenY: number): void {
    if (!this.tooltip) return;
    const { container, width, height } = this.tooltip;
    const cam = this.scene.cameras.main;
    let x = screenX + 14;
    let y = screenY - 10;
    if (x + width > cam.width) x = screenX - width - 8;
    if (y + height > cam.height) y = Math.max(4, screenY - height - 8);
    container.setPosition(x, y);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.container.destroy();
      this.tooltip = undefined;
    }
  }

  // === UTIL ===

  private pointInRect(
    px: number,
    py: number,
    rect: { x: number; y: number; w: number; h: number },
  ): boolean {
    return (
      px >= rect.x &&
      px <= rect.x + rect.w &&
      py >= rect.y &&
      py <= rect.y + rect.h
    );
  }
}
