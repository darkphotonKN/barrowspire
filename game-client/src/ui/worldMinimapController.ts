/**
 * The town's and a field's minimap on the HUD (FS-P0HSP §E, §F, §G): one {@link WorldMinimap},
 * built by the scene with the world's first state, in the mode this browser kept on the run's one
 * key; M steps it; it stands in the top-right corner and follows it (FS-T3DWX §Change: The
 * top-right HUD fills the button's spot); its dots are the player's and the party's, and as the overlay
 * it follows their drawn figures. Its map mode icon, built with it, steps the mode on a press as M
 * does (FS-56CKV §Change: Map mode icon); its map name, built with it, names the place
 * (FS-56CKV §Change: Map name). The scene hands it the plan to draw and says who owns the keys. Phaser-light: it draws through the scene's stage and reads the view's corner, nothing more.
 */

import type { Point, Rect } from "@/render/iso/projection";
import { viewport } from "@/render/viewport";
import { WorldMinimap, type MinimapPicture, type MinimapStage, type MinimapWorld } from "./minimap";
import { nextMinimapMode, readMinimapMode, rememberMinimapMode, type MinimapMode, type MinimapModeStore } from "./minimapMode";
import { MinimapModeIcon, type ModeIconStage } from "./minimapModeIcon";
import { MinimapName } from "./minimapName";
import { cornerMinimap, topRightCorner } from "./topRightColumn";
import { partyOnMap, type PartyOnMapState } from "./worldMap";

/** What of a world's state the party's dots, and the overlay's figures, are read from. */
export interface MapPartyState extends PartyOnMapState {
  other_players?: readonly { id: string; entity_id: string; position: Point }[] | null;
}

export interface WorldMinimapParts {
  /** What the minimap draws with: the scene's graphics, its canvas images and the camera's frames. */
  stage: MinimapStage;
  /** The world's size in world px, which the map fits (§B.5). */
  world: MinimapWorld;
  /** Where this browser keeps the minimap's mode, the run's key (§F.32; FS-1SEF0 §A.4). */
  store: MinimapModeStore;
  /** Backing px per logical px now (`viewport.renderScale`): the overlay's grid. */
  renderScale?: () => number;
  /**
   * The map mode icon's own stage, and M's guards in this scene (FS-56CKV §Change: Map mode icon,
   * D6): a press on it then does nothing. None, and no icon is built.
   */
  icon?: { stage: ModeIconStage; blocked: () => boolean };
  /**
   * The place's name, the arrival card's title (FS-56CKV §Change: Map name, E1), drawn on the
   * icon's stage. None, or no icon stage, and no name is built.
   */
  name?: string;
  /**
   * Told after each step of the mode, M's or the icon's (the interface sounds' mode switch,
   * FS-WDM0X S7). Building the map in the kept mode is no step.
   */
  stepped?: () => void;
}

export class WorldMinimapController {
  readonly map: WorldMinimap;
  /** Its map mode icon (FS-56CKV §Change: Map mode icon), where the scene gave it a stage. */
  readonly modeIcon?: MinimapModeIcon;
  /** Its map name (FS-56CKV §Change: Map name), where the scene gave it words and a stage. */
  readonly mapName?: MinimapName;
  private readonly store: MinimapModeStore;
  private readonly stepped?: () => void;
  /** How it is shown (§F.32): the run's one remembered mode, read as the map is built; M steps it. */
  private mode: MinimapMode;
  /** The party members' entity ids in the last state: whose drawn figures the overlay's dots follow. */
  private allies: string[] = [];

  constructor({ stage, world, store, renderScale, icon, name, stepped }: WorldMinimapParts) {
    this.store = store;
    this.stepped = stepped;
    this.map = new WorldMinimap(stage, world, renderScale);
    // over the map's layers: made after them (D1); a press is M's (D6)
    if (icon) this.modeIcon = new MinimapModeIcon(icon.stage, { press: () => this.cycle(), blocked: icon.blocked });
    if (icon && name) this.mapName = new MinimapName(icon.stage, name);
    // the mode this browser kept, in a run, the town or a field (§F.32)
    this.mode = readMinimapMode(store);
    this.map.setMode(this.mode);
    this.place();
  }

  /** M (§F.31): the next mode, kept in this browser, the map placed for it; the step told (FS-WDM0X S7). */
  cycle(): void {
    this.mode = nextMinimapMode(this.mode);
    rememberMinimapMode(this.store, this.mode);
    this.map.setMode(this.mode);
    this.place();
    this.stepped?.();
  }

  /**
   * In the top-right corner, right-aligned on its x (§G.35): normal or enlarged in the very corner;
   * in overlay mode the corner holds the map mode icon and the name at its left (FS-T3DWX G2–G4).
   * Nothing stands under it (§G.36). The map mode icon in the map's bottom-left, or in the corner
   * (§Change: Map mode icon, D2, D3); the map name in the normal map's top-right, or left of the
   * enlarged map or of the icon (§Change: Map name, E3–E5).
   */
  place(): void {
    const corner = topRightCorner(viewport, cornerMinimap(this.map));
    if (corner.minimap) this.map.place(corner.minimap);
    this.modeIcon?.place(corner.modeIcon);
    this.mapName?.place(corner.name);
  }

  /** What stands at the top centre now, which the map name gives way to where they meet (§Change: Map name, E7). */
  giveWay(covers: readonly (Rect | null | undefined)[]): void {
    this.mapName?.giveWay(covers);
  }

  /** Whether a press at (x, y), logical units, is the map mode icon's (D5). */
  covers(x: number, y: number): boolean {
    return this.modeIcon?.covers(x, y) ?? false;
  }

  /** The pointer at (x, y), logical units: the icon lit under it (D7). */
  pointerMove(x: number, y: number): void {
    this.modeIcon?.pointerMove(x, y);
  }

  /** The pointer left the canvas, or a panel covers it. */
  pointerOut(): void {
    this.modeIcon?.pointerOut();
  }

  /** A press at (x, y), logical units: whether it is the icon's, a primary one stepping the mode as M does (D6). */
  pointerDown(x: number, y: number, primary = true): boolean {
    return this.modeIcon?.pointerDown(x, y, primary) ?? false;
  }

  /** The plan now; the map and marks are redrawn only if its key changed. */
  show(picture: MinimapPicture): void {
    this.map.show(picture);
  }

  /**
   * The party's dots from this state (§E.29, §E.30): the player's own and each member's
   * (`members`, the party store's `player_id`s), no one else; the members' entity ids kept for the
   * overlay's follow.
   */
  party(state: MapPartyState, members: readonly string[]): void {
    this.map.party(partyOnMap(state, members));
    this.allies = (state.other_players ?? []).filter((p) => members.includes(p.id)).map((p) => p.entity_id);
  }

  /**
   * The map overlay on the player (§F.31; FS-1SEF0 §C.14, §C.19): each frame, after the figures
   * have eased, the player's drawn position `self` and the members' drawn figures (`figure`, by
   * entity id). A move of its layers, never a redraw; in a panel mode the minimap only notes these.
   * Nothing before the player's own figure is drawn.
   */
  follow(self: Point | undefined, figure: (entityId: string) => Point | undefined): void {
    if (!self) return;
    const at = (p: Point) => ({ x: p.x, y: p.y });
    const allies = this.allies.flatMap((id) => {
      const p = figure(id);
      return p ? [at(p)] : [];
    });
    this.map.follow(at(self), { self: at(self), allies });
  }

  /** Gone with its visit: every layer, its icon and its name. */
  destroy(): void {
    this.map.destroy();
    this.modeIcon?.destroy();
    this.mapName?.destroy();
  }
}

/** The part of a scene's keyboard M is bound on. */
export interface MinimapKeyboard {
  on(event: string, fn: (event?: KeyboardEvent) => void): unknown;
}

/**
 * M (§F.31, §F.33): the run's three modes on the world's minimap. A keydown event, never an added
 * key: nothing is captured, so the letter types in any field. Not on a held key's repeat, while
 * `keysOwned` (chat typing, or a panel of the scene's that owns the keys), or before the scene's
 * minimap is built.
 */
export function bindMinimapKey(
  keyboard: MinimapKeyboard | undefined,
  keysOwned: () => boolean,
  minimap: () => WorldMinimapController | undefined,
): void {
  keyboard?.on("keydown-M", (event?: KeyboardEvent) => {
    if (event?.repeat || keysOwned()) return;
    minimap()?.cycle();
  });
}

/** A pointer as the scene's input hands it: backing px, and the button pressed. */
interface MinimapPointer {
  x: number;
  y: number;
  button?: number;
}

/** The part of a scene's input the map mode icon's pointer is heard on. */
export interface MinimapPointerInput {
  on(event: string, fn: (pointer?: MinimapPointer) => void): unknown;
}

/**
 * The map mode icon's pointer (FS-56CKV §Change: Map mode icon, D5–D7), for a scene whose presses
 * no other listener routes: its moves light the icon, a press on it steps the mode as M does, and
 * leaving the canvas dims it, each in logical units (FS-ZAJMH R15). Where `covered` says a panel
 * lies over the point (the open gear overlay), the press and the hover are the panel's. Nothing
 * before the scene's minimap is built.
 */
export function bindMinimapPointer(
  input: MinimapPointerInput | undefined,
  minimap: () => WorldMinimapController | undefined,
  covered: (x: number, y: number) => boolean = () => false,
): void {
  input?.on("pointermove", (pointer) => {
    if (!pointer) return;
    const at = viewport.toLogical(pointer);
    if (covered(at.x, at.y)) minimap()?.pointerOut();
    else minimap()?.pointerMove(at.x, at.y);
  });
  input?.on("pointerdown", (pointer) => {
    if (!pointer) return;
    const at = viewport.toLogical(pointer);
    if (!covered(at.x, at.y)) minimap()?.pointerDown(at.x, at.y, (pointer.button ?? 0) === 0);
  });
  input?.on("gameout", () => minimap()?.pointerOut());
}
