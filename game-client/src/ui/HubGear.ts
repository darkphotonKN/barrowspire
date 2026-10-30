/**
 * The gear and bag overlay in the hub (FS-HRH2J §E R40–44): the same overlay the run and the
 * field drive through `EquipmentHud`, fed here from REST, as the loadout screen it replaces was.
 * Each open loads the owned item instances and the loadout; loadout ids go in their slots and
 * every other instance into the bag in REST order, however many there are (the hub's bag is not
 * capped, R23, R44). An equip or unequip is applied by the overlay at once and sent as one
 * `updateLoadout`; while it is in flight the overlay says it is busy and takes no other change.
 * A refused change says so in the hub's notice and loads the truth again. Phaser-free: the hub
 * hands it the overlay, the REST calls and its notice.
 */

import type { components } from "@/api/generated/schema";
import type {
  EquipmentSlot,
  EquippedItems,
  ItemState,
} from "@/types/gameState";
import {
  instanceItem,
  rarityNames,
  type ItemInstance,
} from "@/items/loadoutItem";
import { nothingWorn, type HudPanel } from "./EquipmentHud";
import type { CharacterSource } from "./characterSheet";

type Loadout = components["schemas"]["GetLoadoutResponse"];
type ItemRarity = components["schemas"]["ItemRarity"];

/** The REST calls the hub's gear reads and writes, as `apiClient` makes them. */
export interface HubGearApi {
  getItemInstances(): Promise<{ result?: { items?: ItemInstance[] | null } }>;
  getLoadout(): Promise<{ result?: Loadout }>;
  getItemRarities(): Promise<{ result?: ItemRarity[] | null }>;
  updateLoadout(slot: string, itemInstanceId: string | null): Promise<unknown>;
}

/** What the hub's gear asks of the overlay: the run's panel, plus a status line. */
export type HubGearPanel = Omit<HudPanel, "mayUnequip"> & {
  /** A line in the bag area; while one is set, equip and unequip input is ignored. */
  setStatus(line: string | undefined): void;
};

/** The hub's passing notice. */
export interface HubGearPort {
  notice(text: string): void;
}

/** Plain words, since the player acts on them (game-client/CONTEXT.md, no lore in errors). */
export const GEAR_LOADING = "Fetching your gear...";
export const GEAR_BUSY = "Changing your gear...";
export const GEAR_LOAD_FAILED =
  "Could not fetch your gear. Close and open to try again.";
export const GEAR_CHANGE_FAILED = "Could not change your gear.";

/** The loadout's field for each overlay slot. */
const LOADOUT_FIELD: Record<EquipmentSlot, keyof Loadout> = {
  weapon: "weaponId",
  head: "headId",
  body: "chestId",
  hands: "glovesId",
  feet: "legsId",
  ring_1: "ring1Id",
  ring_2: "ring2Id",
  consumable_1: "consumable1Id",
  consumable_2: "consumable2Id",
  consumable_3: "consumable3Id",
};

/** The overlay names armour by body region; the loadout by the armor_slot constraint. */
const BACKEND_SLOT: Record<EquipmentSlot, string> = {
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

/** The slot name `updateLoadout` takes for an overlay slot (R42). */
export function backendSlot(slot: EquipmentSlot): string {
  return BACKEND_SLOT[slot];
}

/**
 * What the player owns, as the overlay draws it (R41). Rarities only dress the views
 * (FS-4R9M9 R59): without them everything still loads, with no rarity badge.
 */
export async function loadHubGear(
  api: HubGearApi,
): Promise<{ equipped: EquippedItems; bag: ItemState[] }> {
  const [instances, loadout, rarities] = await Promise.all([
    api.getItemInstances(),
    api.getLoadout(),
    api.getItemRarities().catch(() => undefined),
  ]);
  const names = rarityNames(rarities?.result);
  const owned = (instances.result?.items ?? []).map((i) =>
    instanceItem(i, names),
  );
  const byId = new Map(owned.map((item) => [item.entity_id, item]));
  const equipped = nothingWorn();
  const worn = new Set<string>();
  for (const [slot, field] of Object.entries(LOADOUT_FIELD) as [
    EquipmentSlot,
    keyof Loadout,
  ][]) {
    // the loadout omits an empty slot (protobuf omitempty)
    const id = loadout.result?.[field];
    const item = typeof id === "string" ? byId.get(id) : undefined;
    if (!item) continue;
    equipped[slot] = item;
    worn.add(item.entity_id);
  }
  return { equipped, bag: owned.filter((item) => !worn.has(item.entity_id)) };
}

export class HubGear {
  /** Bumped on each open, so a load that lands after a later open is dropped. */
  private loads = 0;
  /** The change in flight, settled either way; a load waits for it. */
  private inFlight?: Promise<void>;
  private status?: string;

  constructor(
    private readonly panel: HubGearPanel,
    private readonly api: HubGearApi,
    private readonly port: HubGearPort,
  ) {
    panel.onEquip = (item, slot) => this.change(slot, item.entity_id);
    panel.onUnequip = (_item, slot) => this.change(slot, null);
  }

  isOpen(): boolean {
    return this.panel.isVisible();
  }

  /** Whether a screen point lies over the open overlay's panels: a press there is the overlay's (R8). */
  covers(x: number, y: number): boolean {
    return this.panel.isVisible() && this.panel.covers(x, y);
  }

  /** Opens or closes the overlay; every open loads from REST (R41). */
  toggle(): void {
    this.panel.toggle();
    if (this.panel.isVisible()) void this.load();
  }

  /** Closes the overlay; whether it was open. A change in flight still finishes. */
  hide(): boolean {
    if (!this.panel.isVisible()) return false;
    this.panel.hide();
    return true;
  }

  /** E while open is the overlay's (R10); whether it took E. */
  equipKey(): boolean {
    if (!this.panel.isVisible()) return false;
    this.panel.handleEquipKey();
    return true;
  }

  /** The player's own hub state, for the stats panel (R24). */
  updateCharacter(player: CharacterSource): void {
    this.panel.updateCharacter(player);
  }

  /** The character's level, for "Requires level N" (FS-BDA7X R45). */
  setCharacterLevel(level: number | undefined): void {
    this.panel.setCharacterLevel(level);
  }

  private setStatus(line: string | undefined): void {
    this.status = line;
    this.panel.setStatus(line);
  }

  private async load(): Promise<void> {
    const load = ++this.loads;
    const current = () => load === this.loads && this.panel.isVisible();
    if (this.inFlight) {
      // what is drawn is the change being sent; the truth is read once it has answered
      this.setStatus(GEAR_BUSY);
      await this.inFlight;
      if (!current()) return;
    }
    this.setStatus(GEAR_LOADING);
    this.panel.updateEquipment(nothingWorn());
    this.panel.updateInventory([]);
    try {
      const { equipped, bag } = await loadHubGear(this.api);
      if (!current()) return;
      this.panel.updateEquipment(equipped);
      this.panel.updateInventory(bag);
      this.setStatus(undefined);
    } catch (err) {
      if (!current()) return;
      console.error("hub gear: load failed", err);
      this.setStatus(GEAR_LOAD_FAILED);
    }
  }

  /** One change at a time (R42): the overlay has already drawn it. */
  private change(slot: EquipmentSlot, id: string | null): void {
    if (this.inFlight || this.status) return;
    this.setStatus(GEAR_BUSY);
    this.inFlight = this.api.updateLoadout(backendSlot(slot), id).then(
      () => {
        this.inFlight = undefined;
        if (this.status === GEAR_BUSY) this.setStatus(undefined);
      },
      (err) => {
        this.inFlight = undefined;
        console.error("hub gear: change refused", err);
        this.port.notice(GEAR_CHANGE_FAILED);
        this.setStatus(undefined);
        if (this.panel.isVisible()) void this.load();
      },
    );
  }
}
