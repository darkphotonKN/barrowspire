import { ActionType, type EquipPayload } from "@/assets/types/client";
import type { EquipmentSlot, EquipmentState, EquippedItems, ItemState } from "@/types/gameState";

/**
 * The equip HUD every world with a body shares (FS-X2F2H §Requirements 56): the player's
 * inventory and worn gear as the server last reported them, drawn on the run's
 * {@link HudPanel} (the run's EquipmentPanel), and the panel's equip and unequip sent as the run
 * has always sent them, applied at once and corrected by the next state. An item taken from a
 * satchel is held in the inventory while its loot is pending, so it does not flicker out before
 * the server confirms it. The run scene and the field scene each compose one; neither copies it.
 * Phaser-free: the scene hands it the panel and a port for sends.
 */

/** How long, in ms, an item taken but not yet in the server's inventory is held: the run's window. */
export const PENDING_MS = 1000;

/** What the HUD asks of the run's equipment panel. */
export interface HudPanel {
  onEquip?: (item: ItemState, slot: EquipmentSlot) => void;
  onUnequip?: (item: ItemState, slot: EquipmentSlot) => void;
  toggle(): void;
  hide(): void;
  isVisible(): boolean;
  handleEquipKey(): void;
  updateInventory(items: ItemState[]): void;
  updateEquipment(equipped: EquippedItems): void;
  setCharacterLevel(level: number | undefined): void;
}

/** Messages to the server: the run's equip and unequip. */
export interface HudPort {
  send(action: typeof ActionType.Equip | typeof ActionType.Unequip, payload: EquipPayload): void;
}

/** What one state says the player carries and wears; either may be absent. */
export interface CarriedState {
  inventory?: ItemState[];
  equipment?: EquipmentState;
}

function nothingWorn(): EquippedItems {
  return {
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
}

export class EquipmentHud {
  private worn: EquippedItems = nothingWorn();
  private carried: ItemState[] = [];

  constructor(
    private readonly panel: HudPanel,
    port: HudPort,
    private readonly now: () => number = Date.now,
  ) {
    panel.onEquip = (item, slot) => {
      port.send(ActionType.Equip, { item_entity_id: item.entity_id });
      this.worn[slot] = item;
      this.carried = this.carried.filter((i) => i.entity_id !== item.entity_id);
    };
    panel.onUnequip = (item, slot) => {
      port.send(ActionType.Unequip, { item_entity_id: item.entity_id });
      this.worn[slot] = null;
      this.carried.push(item);
    };
  }

  /** The inventory as drawn: the server's, plus items taken and still pending. */
  get inventory(): readonly ItemState[] {
    return this.carried;
  }

  /** The worn gear, on the panel's slots. */
  get equipped(): Readonly<EquippedItems> {
    return this.worn;
  }

  isOpen(): boolean {
    return this.panel.isVisible();
  }

  /** Opens or closes the panel; opening fills it. */
  toggle(): void {
    this.panel.toggle();
    if (this.panel.isVisible()) {
      this.panel.updateInventory(this.carried);
      this.panel.updateEquipment(this.worn);
    }
  }

  /** Closes the panel; whether it was open. */
  hide(): boolean {
    if (!this.panel.isVisible()) return false;
    this.panel.hide();
    return true;
  }

  /** E, while the panel is open, equips or unequips what the pointer is over; whether it took E. */
  equipKey(): boolean {
    if (!this.panel.isVisible()) return false;
    this.panel.handleEquipKey();
    return true;
  }

  /** The character's level, for the panel's "Requires level N" marks (FS-BDA7X req 45). */
  setCharacterLevel(level: number | undefined): void {
    this.panel.setCharacterLevel(level);
  }

  /** One state's inventory and equipment, whichever it carries. */
  sync(state: CarriedState): void {
    if (state.inventory) this.syncInventory(state.inventory);
    if (state.equipment) this.syncEquipment(state.equipment);
  }

  /** An item taken from a satchel: held while its loot is pending. */
  taken(item: ItemState): void {
    this.carried.push({ ...item, lootedAt: this.now() });
    if (this.panel.isVisible()) this.panel.updateInventory(this.carried);
  }

  /** Everything one world drew is let go. */
  reset(): void {
    this.worn = nothingWorn();
    this.carried = [];
  }

  /**
   * The server's inventory is the truth, except for an item taken in the last {@link PENDING_MS}
   * that the server has not reported yet, which is kept until it does or the window runs out.
   */
  private syncInventory(server: ItemState[]): void {
    const now = this.now();
    const fromServer = new Map(server.map((item) => [item.entity_id, item]));
    const next: ItemState[] = [];
    for (const local of this.carried) {
      const confirmed = fromServer.get(local.entity_id);
      if (confirmed) {
        next.push({ ...confirmed, lootedAt: undefined });
        fromServer.delete(local.entity_id);
      } else if (local.lootedAt && now - local.lootedAt < PENDING_MS) {
        next.push(local);
      }
    }
    next.push(...fromServer.values());
    this.carried = next;
    if (this.panel.isVisible()) this.panel.updateInventory(this.carried);
  }

  /** The server names armour slots chest/gloves/legs; the panel, body/hands/feet. */
  private syncEquipment(server: EquipmentState): void {
    this.worn = {
      weapon: server.weapon,
      head: server.head,
      body: server.chest,
      hands: server.gloves,
      feet: server.legs,
      ring_1: server.ring_1,
      ring_2: server.ring_2,
      consumable_1: server.consumable_1,
      consumable_2: server.consumable_2,
      consumable_3: server.consumable_3,
    };
    if (this.panel.isVisible()) this.panel.updateEquipment(this.worn);
  }
}
