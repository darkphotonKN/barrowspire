/**
 * The gear and the container view on the UI scene (FS-TQZ5J § Change: Phase 3, R50–R56, R58–R60): the
 * gear overlay with its source (`HubGear` in the town, `EquipmentHud` in a field and the run) and, in
 * a field and the run, the container view, built for each world reported and taken down as it leaves,
 * as each world's create built them and its release let them go. They move together so a take from a
 * container stays inside one scene: the view asks the gear whether the bag has room before it marks the
 * item pending (`mayTake` → `roomForOne`), and holds the item in the bag once the world has sent it.
 *
 * What they read of the world is its data, handed through the bridge (R52): each state tick, the level,
 * a loot sent, the town's stash chest opened, a container opened, filled and closed. What only the
 * world can do is asked (R54): the run's equip and unequip, a take. Their open state is the UI's,
 * reported to the world as each piece changes it (R53), and refused by the menu slot and the world's
 * `blockers().gear` (R55). Their keys moved with them (R56): the UI scene hands each press here,
 * however its world heard it. The run's end clears them, silently (R58).
 *
 * Phaser-free: the UI scene hands it the builder (the overlay, the source and the view on itself), so
 * the wiring is tested on its own.
 */

import type { GameplaySoundPlayer } from "@/audio/gameplaySounds";
import type { UiActWrapper } from "@/audio/uiSounds";
import type { ContainerKind, ItemState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import type { CarriedState, EquipmentHud } from "./EquipmentHud";
import type { HubGear } from "./HubGear";
import type { CharacterSource } from "./characterSheet";
import type { ContainerMessage, GearMessage, NoticeLook, UiBridge, World, WorldReport } from "./uiBridge";

/** The gear as the UI scene keeps it for one world: `HubGear` or `EquipmentHud` over the overlay. */
export interface GearPiece {
  isInventoryOpen(): boolean;
  isCharacterOpen(): boolean;
  /** Open in stash mode: the town's chest stands open while it is (FS-VPD8Y R32). */
  stashOpen(): boolean;
  /** The inventory opens or closes; whether it is open now. */
  toggle(): boolean;
  /** The character panel opens or closes; whether it is open now. */
  toggleCharacter(): boolean;
  /** Both panels close; whether either was open. */
  hide(): boolean;
  /** E over the open inventory; whether it took E. */
  equipKey(): boolean;
  /** The town's stash chest: opens in stash mode from closed; whether it opened. */
  openStash(): boolean;
  /** A state tick: what the player carries and wears (a field and the run), their own state. */
  seen(carried: CarriedState | undefined, character: CharacterSource | undefined): void;
  setCharacterLevel(level: number | undefined): void;
  /** An item the world sent a loot for, held in the bag while pending (a field and the run). */
  taken(item: ItemState): void;
  /** Whether the bag has room for one more, saying so when not (FS-HRH2J R21). */
  roomForOne(): boolean;
  /** Its world has left: a purse read in flight answers nobody, a watch is let go. */
  release(): void;
}

/** The container view as the UI scene keeps it. `ContainerView` is one. */
export interface ContainerPiece {
  readonly isOpen: boolean;
  readonly entityId: string | undefined;
  open(entityId: string, kind: ContainerKind): void;
  close(): void;
  closeNow(): void;
  setItems(items: readonly ItemState[]): void;
  /** The F key: the first item taken. */
  lootFirst(): void;
  pointerMove(x: number, y: number): void;
  /** A press at a screen point; whether it was the view's. */
  pointerDown(x: number, y: number, primary: boolean): boolean;
  /** Whether an object Phaser lists under the pointer is the view's own ground (R60). */
  owns(object: unknown): boolean;
  relayout(): void;
  destroy(): void;
}

/** The pieces built for one world: the gear, and the container view where the world has containers. */
export interface GearPieces {
  gear: GearPiece;
  container?: ContainerPiece;
}

/** What a world's gear and container view are built with (R52–R54). */
export interface GearWiring {
  /** The overlay's own player input (its ×), through the UI scene's act, its state reported after. */
  wrapper: UiActWrapper;
  /** A gear notice, in its world's look; none once the world has left. */
  notice: (text: string) => void;
  /** The gear wore or took off an item: the world's Equip or Unequip (R54). */
  send: (kind: "equip" | "unequip", item: string) => void;
  /** The container view took an item: the world's loot (R54). */
  take: (item: ItemState) => void;
  /** The level the world last handed, for the view's "Requires level N". */
  level: () => number | undefined;
  /**
   * The gameplay effects these pieces' own player actions play (FS-AND39 R5, R7), on the UI scene's
   * gameplay player: a coffer's open, a gear move. A take's sound is the world's, as it sends the loot.
   */
  sounds: GameplaySoundPlayer;
}

/** A gameplay player that plays nothing: a slot built with none. */
const SILENT: GameplaySoundPlayer = { play: () => {} };

/** The keys moved with the gear and the container view (R56): I/B, C, Q, E, F. */
export type GearKey = "inventory" | "character" | "close" | "equip" | "take";

/** A gear notice's look in each world (A2 R33): the town's line, the field's, the run's refused tone. */
export const GEAR_NOTICE_LOOK: Readonly<Record<World, NoticeLook>> = {
  hub: { world: "hub" },
  field: { world: "field" },
  // the run's refused notice (`NOTICE_BACKING.refused`), as the run said a full bag
  run: { world: "run", backing: palette.damageBright },
};

/** What of the bridge the slot reads, asks, reports and says through. */
export type GearBridge = Pick<UiBridge, "world" | "ui" | "request" | "act" | "play" | "reportUi" | "notice">;

export class UiGearSlot {
  private pieces: GearPieces | null = null;
  /** The world the standing pieces were built for. */
  private builtFor: World | null = null;
  /** Lets the standing pieces' notices through; a past world's say nothing. */
  private alive = { on: false };
  /** The level the world last handed (R52). */
  private lastLevel: number | undefined;

  constructor(
    private readonly bridge: GearBridge,
    private readonly build: (world: World, wiring: GearWiring) => GearPieces,
    /** The UI scene's gameplay effects player, handed to each world's pieces (FS-AND39 R5, R7). */
    private readonly sounds: GameplaySoundPlayer = SILENT,
  ) {}

  /**
   * Heard each world report, and none as the world leaves (R50): pieces for the world reported, built
   * anew after a leave or for another world; a report of the world they stand for keeps them.
   */
  show(report: WorldReport | null): void {
    if (report && this.pieces && this.builtFor === report.world) return;
    this.takeDown();
    if (!report) return;
    const alive = { on: true };
    this.alive = alive;
    const world = report.world;
    this.pieces = this.build(world, {
      wrapper: { act: (run) => this.bridge.act(() => (run(), this.report())) },
      notice: (text) => {
        if (alive.on) this.bridge.notice({ text, look: GEAR_NOTICE_LOOK[world] });
      },
      send: (kind, item) => this.bridge.request({ kind, item }),
      take: (item) => this.bridge.request({ kind: "take", item }),
      level: () => this.lastLevel,
      sounds: this.sounds,
    });
    this.builtFor = world;
    this.report();
  }

  /** Whether either gear panel is open: Esc's gear step (R55). */
  isOpen(): boolean {
    return this.isInventoryOpen() || this.isCharacterOpen();
  }

  isInventoryOpen(): boolean {
    return this.pieces?.gear.isInventoryOpen() ?? false;
  }

  isCharacterOpen(): boolean {
    return this.pieces?.gear.isCharacterOpen() ?? false;
  }

  /** The level the world last handed: the container view's tips read it. */
  level(): number | undefined {
    return this.lastLevel;
  }

  /**
   * The corner row's Inventory or Character, I, B or C (R55): refused while the menu slot is filled
   * or the world turns the gear away; a panel opening asks the world to close its letter panel first
   * (FS-3EBCA R16), as the town's `closeLetter` did.
   */
  toggle(window: "inventory" | "character"): void {
    const gear = this.pieces?.gear;
    const report = this.bridge.world;
    if (!gear || !report || this.bridge.ui.menuOpen || report.blockers().gear) return;
    const opening = window === "inventory" ? !gear.isInventoryOpen() : !gear.isCharacterOpen();
    if (opening) this.bridge.request({ kind: "close", window: "letter" });
    if (window === "inventory") gear.toggle();
    else gear.toggleCharacter();
    this.report();
  }

  /**
   * Both panels close: Esc's gear step, the menu opening, the Menu icon after the run's end, the town's
   * letter panel opening (R55). Whether either was open.
   */
  close(): boolean {
    const closed = this.pieces?.gear.hide() ?? false;
    this.report();
    return closed;
  }

  /**
   * A key moved with its window (R56), however its world heard it: each refused while the menu slot is
   * filled and after the run's end (its keyboard was off). I/B and C toggle through the UI scene's act;
   * Q closes the gear, else (in the run) the container view; E is the open inventory's; F takes the
   * container's first item.
   */
  key(key: GearKey): void {
    const report = this.bridge.world;
    if (!report || !this.pieces) return;
    if (this.bridge.ui.menuOpen || report.facts().ended) return;
    const { gear, container } = this.pieces;
    if (key === "inventory" || key === "character") return this.bridge.act(() => this.toggle(key));
    if (key === "close")
      return this.bridge.act(() => {
        if (gear.hide()) return this.report();
        if (report.world === "run" && container?.isOpen) container.close();
        this.report();
      });
    if (key === "equip") gear.equipKey();
    else container?.lootFirst();
  }

  /** The world's gear data (R52), to the gear standing; none standing, nothing. */
  hear(message: GearMessage): void {
    const gear = this.pieces?.gear;
    if (message.kind === "level") this.lastLevel = message.level;
    if (!gear) return;
    switch (message.kind) {
      case "seen":
        return gear.seen(message.carried, message.character);
      case "level":
        return gear.setCharacterLevel(message.level);
      case "taken":
        return gear.taken(message.item);
      case "openStash":
        // the chest's lid is the press's one sound, in place of the window rule's inventory_open: the
        // owner, 2026-11-14, 「按倉庫就顯示倉庫的聲音」 (FS-WDM0X S2 as amended; FS-AND39 R6 superseded)
        if (gear.openStash()) this.bridge.play("stash_open");
        return this.report();
      case "close":
        gear.hide();
        return this.report();
    }
  }

  /** The world's container data (R52), to the view standing; none standing, nothing. */
  hearContainer(message: ContainerMessage): void {
    const container = this.pieces?.container;
    if (!container) return;
    if (message.kind === "items") return container.setItems(message.items);
    if (message.kind === "open") container.open(message.entityId, message.container);
    else if (message.now) container.closeNow();
    else container.close();
    this.report();
  }

  /**
   * A move over the UI scene, logical units, with what Phaser lists under the pointer (R60): the
   * container view hears it unless another UI piece is the top object there.
   */
  pointerMove(x: number, y: number, over: readonly unknown[]): void {
    const container = this.pieces?.container;
    if (!container) return;
    const other = over.length > 0 && !container.owns(over[0]);
    if (other) container.pointerMove(-1, -1);
    else container.pointerMove(x, y);
  }

  /** A press over the UI scene (R60): the container view's only on its own ground; whether it took it. */
  pointerDown(x: number, y: number, primary: boolean, over: readonly unknown[]): boolean {
    const container = this.pieces?.container;
    if (!container || over.length === 0 || !container.owns(over[0])) return false;
    return container.pointerDown(x, y, primary);
  }

  /**
   * The run's end appeared (R58): the gear overlay and the container view close, outside any player
   * action, so they play nothing (FS-WDM0X S4).
   */
  endPopped(): void {
    this.pieces?.gear.hide();
    if (this.pieces?.container?.isOpen) this.pieces.container.close();
    this.report();
  }

  /** The logical view changed: an open container view back to the centre (the overlay follows the resize itself). */
  relayout(): void {
    this.pieces?.container?.relayout();
  }

  destroy(): void {
    this.takeDown();
  }

  /** The UI's state, as the pieces stand now (R53). */
  private report(): void {
    const gear = this.pieces?.gear;
    this.bridge.reportUi({
      inventory: gear?.isInventoryOpen() ?? false,
      character: gear?.isCharacterOpen() ?? false,
      stash: gear?.stashOpen() ?? false,
      container: this.pieces?.container?.entityId,
    });
  }

  private takeDown(): void {
    const pieces = this.pieces;
    this.alive.on = false;
    this.pieces = null;
    this.builtFor = null;
    if (!pieces) return;
    pieces.gear.hide();
    pieces.gear.release();
    pieces.container?.closeNow();
    pieces.container?.destroy();
    this.report();
  }
}

/** The town's gear as the slot reaches it: `HubGear`. */
export type HubGearSource = Pick<
  HubGear,
  | "isInventoryOpen"
  | "isCharacterOpen"
  | "stashOpen"
  | "toggle"
  | "toggleCharacter"
  | "hide"
  | "equipKey"
  | "openStash"
  | "updateCharacter"
  | "setCharacterLevel"
  | "release"
>;

/** A field's and the run's gear as the slot reaches it: `EquipmentHud`. */
export type EquipmentSource = Pick<
  EquipmentHud,
  | "isInventoryOpen"
  | "isCharacterOpen"
  | "toggle"
  | "toggleCharacter"
  | "hide"
  | "equipKey"
  | "sync"
  | "updateCharacter"
  | "setCharacterLevel"
  | "taken"
  | "roomForOne"
  | "release"
>;

/**
 * The town's gear as a piece: fed from REST, its stash at the chest; it carries nothing a state tick
 * hands, takes no loot and always has room (no container stands in the town). `stopWatch` lets go of
 * what the piece watches beside it (the gold Takes, FS-7TGZ3 R9).
 */
export function hubGearPiece(gear: HubGearSource, stopWatch: () => void = () => {}): GearPiece {
  return {
    isInventoryOpen: () => gear.isInventoryOpen(),
    isCharacterOpen: () => gear.isCharacterOpen(),
    stashOpen: () => gear.stashOpen(),
    toggle: () => gear.toggle(),
    toggleCharacter: () => gear.toggleCharacter(),
    hide: () => gear.hide(),
    equipKey: () => gear.equipKey(),
    openStash: () => gear.openStash(),
    seen: (_carried, character) => {
      if (character) gear.updateCharacter(character);
    },
    setCharacterLevel: (level) => gear.setCharacterLevel(level),
    taken: () => {},
    roomForOne: () => true,
    release: () => {
      stopWatch();
      gear.release();
    },
  };
}

/** A field's or the run's gear as a piece: fed by the state ticks, holding loots taken; no stash. */
export function equipmentPiece(gear: EquipmentSource): GearPiece {
  return {
    isInventoryOpen: () => gear.isInventoryOpen(),
    isCharacterOpen: () => gear.isCharacterOpen(),
    stashOpen: () => false,
    toggle: () => gear.toggle(),
    toggleCharacter: () => gear.toggleCharacter(),
    hide: () => gear.hide(),
    equipKey: () => gear.equipKey(),
    openStash: () => false,
    seen: (carried, character) => {
      if (carried) gear.sync(carried);
      if (character) gear.updateCharacter(character);
    },
    setCharacterLevel: (level) => gear.setCharacterLevel(level),
    taken: (item) => gear.taken(item),
    roomForOne: () => gear.roomForOne(),
    release: () => gear.release(),
  };
}
