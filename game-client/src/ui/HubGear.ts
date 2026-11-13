/**
 * The gear and bag overlay in the hub (FS-HRH2J §E R40–44): the same overlay the run and the
 * field drive through `EquipmentHud`, fed here from REST, as the loadout screen it replaces was.
 * Each open loads the owned item instances and the loadout; loadout ids go in their slots, the
 * unworn `bag` instances (and any with no location, from an older gateway) into the bag and the
 * unworn `stash` instances into the stash, each in REST order (FS-VPD8Y R27–28). The bag shows
 * every item past 30 (R23); an unequip into a bag of 30 or more is not sent and the notice says
 * the bag is full, while a swap always goes (FS-VPD8Y R29). An equip or unequip is applied by the
 * overlay at once and sent as one `updateLoadout`; while it is in flight the overlay says it is
 * busy and takes no other change. A refused change says so in the hub's notice (the full bag by
 * its `BAG_FULL` code) and loads the truth again. At the hub's stash chest it opens the overlay in
 * stash mode, the stash in the left panel, loaded by the same open (FS-VPD8Y §F R35–37); an open
 * character panel closes then. There a
 * hovered bag or stash item moves to the other side as one `moveItemInstance`, pre-checked against
 * both caps and the item's status, under the same one-at-a-time rule and refusal path (R38–42).
 * An item still in a delve (`IN_RUN`, FS-18Z5F R38), listed on the Bazaar or its sale settling
 * (FS-GTNP8 §D), worn or carried, takes no change: no equip, unequip, swap or move of it is sent,
 * and the notice says why, by the item's standing. Every inventory open, the stash chest's
 * too, reads the purse line's gold, and the hub asks again after a Take that carries gold
 * (FS-7TGZ3 R8–9). The character panel opens on its own (`C`); opened with the inventory closed it
 * loads the loadout too, for its "From gear", and reads no purse (FS-HRH2J § Change C8, C10).
 * Phaser-free: the hub hands it the overlay, the REST calls and its notice.
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
import { statusStanding, type LockedKind } from "@/items/itemView";
import { ApiError } from "@/utils/apiError";
import { BAG_FULL_NOTICE, bagFull } from "./bag";
import {
  NOT_FREE_NOTICE,
  STASH_FULL_NOTICE,
  freeToMove,
  stashFull,
  type ItemLocation,
} from "./stash";
import { nothingWorn, type HudPanel, type PurseRefresh } from "./EquipmentHud";
import type { CharacterSource } from "./characterSheet";

type Loadout = components["schemas"]["GetLoadoutResponse"];
type ItemRarity = components["schemas"]["ItemRarity"];

/** The REST calls the hub's gear reads and writes, as `apiClient` makes them. */
export interface HubGearApi {
  getItemInstances(): Promise<{ result?: { items?: ItemInstance[] | null } }>;
  getLoadout(): Promise<{ result?: Loadout }>;
  getItemRarities(): Promise<{ result?: ItemRarity[] | null }>;
  updateLoadout(slot: string, itemInstanceId: string | null): Promise<unknown>;
  moveItemInstance(id: string, location: ItemLocation): Promise<unknown>;
}

/** The same REST calls as `apiClient` takes them, each naming the character (FS-50MTX R37). */
export interface CharacterGearApi {
  getItemInstances(
    characterId: string,
  ): ReturnType<HubGearApi["getItemInstances"]>;
  getLoadout(characterId: string): ReturnType<HubGearApi["getLoadout"]>;
  getItemRarities: HubGearApi["getItemRarities"];
  updateLoadout(
    characterId: string,
    slot: string,
    itemInstanceId: string | null,
  ): Promise<unknown>;
  moveItemInstance(
    characterId: string,
    id: string,
    location: ItemLocation,
  ): Promise<unknown>;
}

/**
 * The hub's gear calls, made as the active character (FS-50MTX R37). The character is read at
 * each call, so changing character shows that character's gear and bag on the next open. With no
 * active character a call rejects and sends nothing, taking the overlay's own failure path.
 */
export function gearAsCharacter(
  api: CharacterGearApi,
  activeCharacterId: () => string | null,
): HubGearApi {
  const character = (): string => {
    const id = activeCharacterId();
    if (!id) throw new Error("hub gear: no active character");
    return id;
  };
  return {
    getItemInstances: async () => api.getItemInstances(character()),
    getLoadout: async () => api.getLoadout(character()),
    getItemRarities: () => api.getItemRarities(),
    updateLoadout: async (slot, itemInstanceId) =>
      api.updateLoadout(character(), slot, itemInstanceId),
    moveItemInstance: async (id, location) =>
      api.moveItemInstance(character(), id, location),
  };
}

/** What the hub's gear asks of the overlay: the run's panel, plus a status line and stash mode. */
export type HubGearPanel = HudPanel & {
  /** A line in the bag area (and the stash's); while one is set, equip, unequip and move input is ignored. */
  setStatus(line: string | undefined): void;
  /** Opens in stash mode from closed (FS-VPD8Y R35); closing ends the mode (R37). */
  openStash(): void;
  isStashOpen(): boolean;
  /** The stash, in stash order; drawn only in stash mode. */
  updateStash(items: ItemState[]): void;
  /** Asked before a stash-mode move is drawn; false leaves the item where it is (FS-VPD8Y R39). */
  mayMove?: (item: ItemState, to: ItemLocation) => boolean;
  /** A stash-mode move the overlay has drawn, to the end of `to` (R38, R41). */
  onMove?: (item: ItemState, to: ItemLocation) => void;
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
/** The words a change of an item still in a delve shows; nothing is sent (FS-18Z5F R38). */
export const IN_RUN_NOTICE = "That item is still in a delve.";
/** The words a change of an item listed on the Bazaar shows; nothing is sent (FS-GTNP8 R10). */
export const LISTED_NOTICE = "Listed on the Bazaar: withdraw it to use it.";
/** The words a change of an item whose sale is settling shows; nothing is sent (FS-GTNP8 R10). */
export const SETTLING_NOTICE = "That item's sale is settling.";

/** What a change of a locked item says, by its standing (FS-18Z5F R38, FS-GTNP8 R10). */
const LOCKED_NOTICE: Readonly<Record<LockedKind, string>> = {
  inRun: IN_RUN_NOTICE,
  listed: LISTED_NOTICE,
  settling: SETTLING_NOTICE,
};

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

/** What the player owns, by where it sits: worn, in the bag, or in the stash (FS-VPD8Y R27). */
export interface HubGearState {
  equipped: EquippedItems;
  bag: ItemState[];
  stash: ItemState[];
}

/**
 * What the player owns, as the overlay draws it (FS-VPD8Y R27–28). Rarities only dress the
 * views (FS-4R9M9 R59): without them everything still loads, with no rarity badge.
 */
export async function loadHubGear(api: HubGearApi): Promise<HubGearState> {
  const [instances, loadout, rarities] = await Promise.all([
    api.getItemInstances(),
    api.getLoadout(),
    api.getItemRarities().catch(() => undefined),
  ]);
  const names = rarityNames(rarities?.result);
  const listed = instances.result?.items ?? [];
  const owned = listed.map((i) => instanceItem(i, names));
  // an older gateway sends no location: its unworn items are the bag, as before (R28)
  const inStash = new Set(
    listed.flatMap((i) => (i.location === "stash" && i.id ? [i.id] : [])),
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
  const unworn = owned.filter((item) => !worn.has(item.entity_id));
  return {
    equipped,
    bag: unworn.filter((item) => !inStash.has(item.entity_id)),
    stash: unworn.filter((item) => inStash.has(item.entity_id)),
  };
}

/**
 * The words a refused loadout change shows, by its code: the full bag (FS-VPD8Y R29); an item
 * that is not free to wear, listed or lost to a checkout race (FS-18Z5F story 14), or no longer
 * this character's to wear (FS-50MTX R15); else the generic line (R43).
 */
const LOADOUT_REFUSALS: Readonly<Record<string, string>> = {
  BAG_FULL: BAG_FULL_NOTICE,
  ITEM_NOT_AVAILABLE: NOT_FREE_NOTICE,
  NOT_FOUND: NOT_FREE_NOTICE,
};

/** The words a refused move shows, by its code (FS-VPD8Y R42). */
const MOVE_REFUSALS: Readonly<Record<string, string>> = {
  BAG_FULL: BAG_FULL_NOTICE,
  STASH_FULL: STASH_FULL_NOTICE,
  ITEM_NOT_AVAILABLE: NOT_FREE_NOTICE,
  ITEM_WORN: NOT_FREE_NOTICE,
  NOT_FOUND: NOT_FREE_NOTICE,
};

/** A refusal's words by its `code`, never its `detail`; any other failure the generic line. */
function refusalNotice(
  words: Readonly<Record<string, string>>,
  err: unknown,
): string {
  if (err instanceof ApiError && Object.hasOwn(words, err.code))
    return words[err.code];
  return GEAR_CHANGE_FAILED;
}

export class HubGear {
  /** Bumped on each open, so a load that lands after a later open is dropped. */
  private loads = 0;
  /** The change in flight, settled either way; a load waits for it. */
  private inFlight?: Promise<void>;
  private status?: string;
  /**
   * The worn slots and the bag's and stash's sizes as the overlay draws them, for the cap
   * pre-checks (FS-VPD8Y R29, R39).
   */
  private worn: EquippedItems = nothingWorn();
  private bagCount = 0;
  private stashCount = 0;

  constructor(
    private readonly panel: HubGearPanel,
    private readonly api: HubGearApi,
    private readonly port: HubGearPort,
    private readonly purse?: PurseRefresh,
  ) {
    // the overlay equips from the bag; what it swaps out goes to the bag, so a swap is net zero
    // and never pre-checked (FS-VPD8Y R29)
    panel.onEquip = (item, slot) => {
      if (!this.change(slot, item.entity_id)) return;
      if (!this.worn[slot]) this.bagCount--;
      this.worn[slot] = item;
    };
    // a swap takes the worn item off, so it is locked too while that one is in a delve
    panel.mayEquip = (item, slot) => this.free(item, this.worn[slot]);
    panel.mayUnequip = (item) => this.free(item) && this.roomForOne();
    panel.onUnequip = (_item, slot) => {
      if (!this.change(slot, null)) return;
      this.worn[slot] = null;
      this.bagCount++;
    };
    panel.mayMove = (item, to) => this.mayMove(item, to);
    panel.onMove = (item, to) => {
      const sent = this.send(
        () => this.api.moveItemInstance(item.entity_id, to),
        MOVE_REFUSALS,
      );
      if (!sent) return;
      const into = to === "bag" ? 1 : -1;
      this.bagCount += into;
      this.stashCount -= into;
    };
  }

  /** Whether the inventory or the character panel is open (FS-HRH2J § Change C11). */
  isOpen(): boolean {
    return this.panel.isVisible();
  }

  /** Whether the inventory is open, in stash mode or not: the scene's window state (FS-WDM0X S8). */
  isInventoryOpen(): boolean {
    return this.panel.isInventoryOpen();
  }

  /** Whether the character panel is open: the scene's window state (FS-WDM0X S8). */
  isCharacterOpen(): boolean {
    return this.panel.isCharacterOpen();
  }

  /** Whether a screen point lies over an open panel: a press there is the overlay's (R8). */
  covers(x: number, y: number): boolean {
    return this.panel.isVisible() && this.panel.covers(x, y);
  }

  /**
   * Opens or closes the inventory; every open loads from REST (R41) and reads the purse (FS-7TGZ3
   * R8). Whether it is open now.
   */
  toggle(): boolean {
    this.panel.toggle();
    if (!this.panel.isInventoryOpen()) return false;
    void this.load();
    this.refreshPurse();
    return true;
  }

  /**
   * Opens or closes the character panel; refused while the stash is open (FS-HRH2J § Change C9).
   * Opened beside a closed inventory it loads what is worn, for "From gear" (C8); it never reads
   * the purse (C10). Whether it is open now.
   */
  toggleCharacter(): boolean {
    const inventoryOpen = this.panel.isInventoryOpen();
    this.panel.toggleCharacter();
    if (!this.panel.isCharacterOpen()) return false;
    if (!inventoryOpen) void this.load();
    return true;
  }

  /** Its visit is over: a purse read still in flight answers nobody (FS-7TGZ3). */
  release(): void {
    this.purse?.forget();
  }

  /** Reads the purse again, open or closed: after a Take that carried gold (FS-7TGZ3 R9). */
  refreshPurse(): void {
    void this.purse?.refresh();
  }

  /**
   * Opens the overlay in stash mode at the stash chest, loading from REST as any open does
   * (FS-VPD8Y R34–35); whether it opened. An open inventory is left as it is: `E` there is its
   * own. An open character panel closes, the stash taking its side (FS-HRH2J § Change C9).
   */
  openStash(): boolean {
    if (this.panel.isInventoryOpen()) return false;
    this.panel.openStash();
    void this.load();
    this.refreshPurse();
    return true;
  }

  /** Whether the overlay is open in stash mode: the hub draws its chest open while it is (R32). */
  stashOpen(): boolean {
    return this.panel.isStashOpen();
  }

  /** Closes both panels; whether either was open. A change in flight still finishes. */
  hide(): boolean {
    if (!this.panel.isVisible()) return false;
    this.panel.hide();
    return true;
  }

  /** E while the inventory is open is its own (R10; FS-HRH2J § Change C7); whether it took E. */
  equipKey(): boolean {
    if (!this.panel.isInventoryOpen()) return false;
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
    // what was last known worn stays on show while REST answers, so the slots and the character
    // panel's "From gear" don't flash empty on every open; the loading line holds every press
    // until the truth is in
    this.panel.updateEquipment(this.worn);
    this.panel.updateInventory([]);
    this.panel.updateStash([]);
    try {
      const { equipped, bag, stash } = await loadHubGear(this.api);
      if (!current()) return;
      this.worn = { ...equipped };
      this.bagCount = bag.length;
      this.stashCount = stash.length;
      this.panel.updateEquipment(equipped);
      this.panel.updateInventory(bag);
      this.panel.updateStash(stash);
      this.setStatus(undefined);
    } catch (err) {
      if (!current()) return;
      console.error("hub gear: load failed", err);
      this.setStatus(GEAR_LOAD_FAILED);
    }
  }

  /**
   * Whether the bag has room for one more; when it has none, the hub's notice says so and the
   * overlay leaves the item worn (FS-VPD8Y R29). The server's `BAG_FULL` stays the authority.
   */
  private roomForOne(): boolean {
    if (!bagFull(this.bagCount)) return true;
    this.port.notice(BAG_FULL_NOTICE);
    return false;
  }

  /**
   * Whether a stash-mode move may go: only an `AVAILABLE` item, and only into a side under its
   * cap; when not, the hub's notice says why and nothing is sent (FS-VPD8Y R39). A move out of
   * an over-full side always may. The server's codes stay the authority (R42).
   */
  private mayMove(item: ItemState, to: ItemLocation): boolean {
    if (!this.free(item)) return false;
    const refusal = !freeToMove(item)
      ? NOT_FREE_NOTICE
      : to === "bag" && bagFull(this.bagCount)
        ? BAG_FULL_NOTICE
        : to === "stash" && stashFull(this.stashCount)
          ? STASH_FULL_NOTICE
          : undefined;
    if (refusal) this.port.notice(refusal);
    return refusal === undefined;
  }

  /**
   * Whether none of `items` is locked by its status: still in a delve (FS-18Z5F R38), listed or
   * settling (FS-GTNP8 R10). When one is, the hub's notice says why, by the first locked item's
   * standing, and nothing is sent. The server's refusal stays the authority (FS-GTNP8 R13).
   */
  private free(...items: (ItemState | null | undefined)[]): boolean {
    for (const item of items) {
      const locked = item && statusStanding(item);
      if (!locked) continue;
      this.port.notice(LOCKED_NOTICE[locked.kind]);
      return false;
    }
    return true;
  }

  /** A loadout change, as {@link send} sends it. */
  private change(slot: EquipmentSlot, id: string | null): boolean {
    return this.send(
      () => this.api.updateLoadout(backendSlot(slot), id),
      LOADOUT_REFUSALS,
    );
  }

  /**
   * One change at a time, equip, unequip or move (FS-HRH2J R42, FS-VPD8Y R41): the overlay has
   * already drawn it; whether it was sent. A refusal says so by its code and loads the truth
   * again (R43, FS-VPD8Y R42).
   */
  private send(
    request: () => Promise<unknown>,
    refusals: Readonly<Record<string, string>>,
  ): boolean {
    if (this.inFlight || this.status) return false;
    this.setStatus(GEAR_BUSY);
    this.inFlight = request().then(
      () => {
        this.inFlight = undefined;
        if (this.status === GEAR_BUSY) this.setStatus(undefined);
      },
      (err) => {
        this.inFlight = undefined;
        console.error("hub gear: change refused", err);
        this.port.notice(refusalNotice(refusals, err));
        this.setStatus(undefined);
        if (this.panel.isVisible()) void this.load();
      },
    );
    return true;
  }
}
