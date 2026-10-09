import Phaser from "phaser";
import { EquipmentPanel } from "@/ui/EquipmentPanel";
import { ItemState, EquippedItems, EquipmentSlot } from "@/types/gameState";
import { apiClient } from "@/utils/api";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { useGameStore } from "@/stores/gameStore";
import { CLASS_LORE, type ClassKey } from "@/data/classLore";
import { instanceItem, rarityNames } from "@/items/loadoutItem";
import { registerArt } from "@/render/art/phaser";
import { MenuFigure, preloadMenuArt } from "@/render/art/menuFigure";
import {
  buttonTextColor,
  drawBackdrop,
  drawButton,
  drawRule,
  sharpenText,
  type ButtonState,
} from "@/ui/menuChrome";

/** The delver beside the equipment panel: its baked sheet at 1x, in the left margin. */
const HERO_X = 80;
const HERO_FEET_Y = 420;

// Map client-side EquipmentSlot UI names → backend canonical slot names.
// Client uses body/hands/feet (visual body regions), backend uses
// chest/gloves/legs (matching armor_slot CHECK constraint).
const SLOT_TO_BACKEND: Record<EquipmentSlot, string> = {
  weapon: "weapon",
  head: "head",
  body: "chest",
  hands: "gloves",
  feet: "legs",
  ring_1: "ring_1",
  ring_2: "ring_2",
  consumable_1: "consumable_1",
  consumable_2: "consumable_2",
  consumable_3: "consumable_3",
};
function toBackendSlot(slot: EquipmentSlot): string {
  return SLOT_TO_BACKEND[slot];
}

export class LoadoutScene extends Phaser.Scene {
  private equipmentPanel?: EquipmentPanel;
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
  private isLoading = false;
  private loadingOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "LoadoutScene" });
  }

  preload(): void {
    preloadMenuArt(this);
  }

  create(): void {
    // Text rasterised at the display's pixel ratio, so it stays sharp under linear filtering.
    sharpenText(this);

    const { width } = this.cameras.main;

    // Charcoal with drifting dust and embers; no pixel grid.
    drawBackdrop(this, 80);

    this.createHero();

    // Title
    const title = this.add.text(width / 2, 30, "LOADOUT", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "24px",
      color: toCss(palette.frameBright),
      letterSpacing: 8,
      fontStyle: "bold",
    });
    title.setOrigin(0.5);
    // Subtitle
    const subtitle = this.add.text(
      width / 2,
      58,
      "CONFIGURE YOUR GEAR BEFORE DEPLOYMENT",
      {
        fontFamily: CANVAS_FONT.body,
        fontSize: "10px",
        color: toCss(palette.hudLabel),
        letterSpacing: 4,
      },
    );
    subtitle.setOrigin(0.5);

    // Accent line
    const accent = this.add.graphics();
    drawRule(accent, width * 0.15, width * 0.85, 72, 0.3);

    // Back button
    const backBtnX = 70;
    const backBtnY = 30;
    const backBg = this.add.graphics();
    const backText = this.add.text(backBtnX, backBtnY, "BACK", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "12px",
      letterSpacing: 3,
    });
    backText.setOrigin(0.5);
    const drawBack = (state: ButtonState) => {
      drawButton(
        backBg,
        backBtnX - 50,
        backBtnY - 14,
        100,
        28,
        "cancel",
        state,
      );
      backText.setColor(toCss(buttonTextColor("cancel", state)));
    };
    drawBack("idle");

    const backHit = this.add.rectangle(
      backBtnX,
      backBtnY,
      100,
      28,
      palette.inkDeep,
      0,
    );
    backHit.setInteractive({ useHandCursor: true });
    backHit.on("pointerover", () => drawBack("hover"));
    backHit.on("pointerout", () => drawBack("idle"));
    backHit.on("pointerdown", () => this.returnToMenu());

    // ESC to return
    this.input.keyboard?.on("keydown-ESC", () => this.returnToMenu());

    // E to equip/unequip hovered item
    this.input.keyboard?.on("keydown-E", () => {
      if (this.isLoading) return;
      this.equipmentPanel?.handleEquipKey();
    });

    // Create equipment panel
    this.equipmentPanel = new EquipmentPanel(this);
    this.equipmentPanel.onEquip = (item, slot) => {
      if (this.isLoading) return;
      this.equipped[slot] = item;
      this.inventory = this.inventory.filter(
        (i) => i.entity_id !== item.entity_id,
      );
      this.withLoading(() =>
        apiClient.updateLoadout(toBackendSlot(slot), item.entity_id),
      );
    };
    this.equipmentPanel.onUnequip = (item, slot) => {
      if (this.isLoading) return;
      this.equipped[slot] = null;
      this.inventory.push(item);
      this.withLoading(() =>
        apiClient.updateLoadout(toBackendSlot(slot), null),
      );
    };

    // Items above the active character's level say so (FS-BDA7X req 45): a hint, the run's
    // seating is the gate.
    this.equipmentPanel.setCharacterLevel(
      useGameStore.getState().getActiveCharacter()?.level,
    );
    this.equipmentPanel.show();

    // Fetch data from backend
    this.loadData();

    // Disable default right-click context menu
  }

  /**
   * The delver being geared, as its class's baked sheet on a lit plinth, turning (FS-2325V §F.1):
   * the same sheet that walks in the hub and the run. Falls back to the placeholder with no art.
   */
  private createHero(): void {
    const active = useGameStore.getState().getActiveCharacter();
    const cls = (active?.className || "warrior").toLowerCase();
    new MenuFigure(this, registerArt(this), HERO_X, HERO_FEET_Y, cls);

    const lore = CLASS_LORE[cls as ClassKey];
    const label = active?.name
      ? active.name.toUpperCase()
      : (lore?.name ?? cls.toUpperCase());
    const name = this.add
      .text(HERO_X, HERO_FEET_Y + 52, label, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.frameBright),
        letterSpacing: 2,
        align: "center",
        wordWrap: { width: 140 },
      })
      .setOrigin(0.5, 0);
    if (lore)
      this.add
        .text(HERO_X, name.y + name.height + 4, lore.title, {
          fontFamily: CANVAS_FONT.body,
          fontSize: "9px",
          color: toCss(palette.hudLabel),
          letterSpacing: 2,
          align: "center",
          wordWrap: { width: 140 },
        })
        .setOrigin(0.5, 0);
  }

  private async loadData(): Promise<void> {
    this.showLoadingOverlay();
    try {
      // The rarity names only dress the views (FS-4R9M9 R59): without them the loadout still
      // loads, its items simply show no rarity badge.
      const [instancesRes, loadoutRes, raritiesRes] = await Promise.all([
        apiClient.getItemInstances(),
        apiClient.getLoadout(),
        apiClient.getItemRarities().catch(() => undefined),
      ]);

      // The instances in the run's item shape, so both read through one presenter.
      const rarities = rarityNames(raritiesRes?.result);
      const allItems: ItemState[] = (instancesRes.result?.items || []).map(
        (item) => instanceItem(item, rarities),
      );

      // Build equipped items from loadout response
      const loadout = loadoutRes.result || {};
      const equippedIds = new Set<string>();

      // id is optional: the loadout omits empty slots (protobuf omitempty).
      const findAndEquip = (id: string | undefined, slot: EquipmentSlot) => {
        if (!id) return;
        const item = allItems.find((i) => i.entity_id === id);
        if (item) {
          this.equipped[slot] = item;
          equippedIds.add(id);
        }
      };

      findAndEquip(loadout.weaponId, "weapon");
      findAndEquip(loadout.headId, "head");
      findAndEquip(loadout.chestId, "body");
      findAndEquip(loadout.glovesId, "hands");
      findAndEquip(loadout.legsId, "feet");
      findAndEquip(loadout.ring1Id, "ring_1");
      findAndEquip(loadout.ring2Id, "ring_2");
      findAndEquip(loadout.consumable1Id, "consumable_1");
      findAndEquip(loadout.consumable2Id, "consumable_2");
      findAndEquip(loadout.consumable3Id, "consumable_3");

      // Remaining items go to inventory
      this.inventory = allItems.filter((i) => !equippedIds.has(i.entity_id));

      // Update UI
      if (this.equipmentPanel) {
        this.equipmentPanel.updateEquipment(this.equipped);
        this.equipmentPanel.updateInventory(this.inventory);
      }
    } catch (err) {
      console.error("Failed to load loadout data:", err);
    } finally {
      this.hideLoadingOverlay();
    }
  }

  private async withLoading(fn: () => Promise<any>): Promise<void> {
    this.showLoadingOverlay();
    try {
      await fn();
    } catch (err) {
      console.error("Loadout update failed:", err);
    } finally {
      this.hideLoadingOverlay();
    }
  }

  private showLoadingOverlay(): void {
    this.isLoading = true;
    const { width, height } = this.cameras.main;

    const bg = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      palette.inkDeep,
      0.4,
    );
    bg.setInteractive(); // blocks clicks through

    const text = this.add.text(width / 2, height / 2, "UPDATING...", {
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.frameBright),
      letterSpacing: 4,
    });
    text.setOrigin(0.5);

    this.loadingOverlay = this.add.container(0, 0, [bg, text]);
    this.loadingOverlay.setDepth(2000);
  }

  private hideLoadingOverlay(): void {
    this.isLoading = false;
    if (this.loadingOverlay) {
      this.loadingOverlay.destroy();
      this.loadingOverlay = undefined;
    }
  }

  private returnToMenu(): void {
    if (this.equipmentPanel) {
      this.equipmentPanel.destroy();
      this.equipmentPanel = undefined;
    }
    this.scene.start("HubScene");
  }

  shutdown(): void {
    if (this.equipmentPanel) {
      this.equipmentPanel.destroy();
      this.equipmentPanel = undefined;
    }
  }
}
