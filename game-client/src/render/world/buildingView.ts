/**
 * What the player sees of the buildings from where they stand (ADR-0036, FS-9PN7X §A–§E): the one
 * controller both scenes drive once a frame. It owns the drawn buildings, what of them covers the
 * player, the silhouette and the indoor blackout. Handed where the player stands, it finds their
 * building (§A.2), swaps every building's look (§B.2, §B.6), hides whatever stands outside that
 * building by footprint (§C.1), darkens the rest (§D) and shows the player through a closed
 * building that covers them (§E).
 *
 * What differs per scene comes in as options, never as flags: which other pieces cover the player
 * (the hub's roofs and gables, the Spire's room doors and their dark openings), which scenery
 * hides by footprint, and what else changes with the player's building (the hub's interiors, the
 * Spire's room lights).
 */

import type { Point } from "@/render/iso/projection";
import { Blackout, type BlackoutGeometry, type BlackoutStage } from "./blackout";
import type { House } from "./houses";
import { buildingAt, hidden, markerShown } from "./indoors";
import { covering, type Sorted } from "./occlusion";
import { showLook, type BuildingPart, type BuiltBuilding, type Cover } from "./scene";
import { Silhouette, type SilhouetteBody, type SilhouetteScene } from "./silhouette";

/** Anything shown and hidden whole. */
export interface Visible {
  setVisible(visible: boolean): unknown;
}

/**
 * Scenery hidden by footprint (§C.1): parts standing at a world point, hidden while the player is
 * in a building it is not in, or out of the one they are in. With no point it stands outside
 * every building (the tower's perimeter) or is a building's top (a roof, lifted over its own
 * house): seen only while the player is in no building.
 */
export interface Scenery {
  parts: readonly Visible[];
  at?: Point;
}

/** The player as the silhouette copies them: their body, and the bounds and depth it is drawn at. */
export interface Figure extends Sorted {
  body: SilhouetteBody;
}

export interface BuildingViewOptions {
  /** How tall the blackout's hole stands and how far its dark reaches (§D.2). */
  blackout: BlackoutGeometry;
  /**
   * Pieces drawn beside the buildings that cover the player from outside too (§E.1): the hub's
   * roofs, gables and chimneys; the Spire's room doors, their dark openings and a house's roof.
   * Read when the cover is retaken: on the first frame, and after {@link BuildingView.invalidate}.
   */
  cover?: () => readonly Cover[];
  /** The scene's scenery hidden by footprint, read whenever the looks are shown. */
  scenery?: () => Iterable<Scenery>;
  /**
   * What else follows the player's building, called whenever the looks are shown: the frame the
   * building changes, and the frame after the buildings, scenery or cover changed.
   */
  onShow?: (building: House | undefined) => void;
}

/** What the controller draws with: the blackout's Graphics and the silhouette's image and mask. */
export type BuildingViewStage = BlackoutStage & SilhouetteScene;

/** Every part of a building as drawn, in either look. */
const partsOf = (b: BuiltBuilding): BuildingPart[] => [...b.shared, ...b.interior, ...b.exterior];

export class BuildingView {
  /** By house id, in the order they were first set: the order the inside test picks in (§A.2). */
  private readonly built = new Map<string, BuiltBuilding>();
  private readonly blackout: Blackout;
  /** Made the first frame there is a player and a building to stand behind. */
  private silhouette?: Silhouette;
  private inside?: House;
  /** The looks need showing again: something was set, removed or invalidated. */
  private stale = true;
  /** What covers the player from outside, taken once and kept until something changes. */
  private covers?: Cover[];

  constructor(
    private readonly stage: BuildingViewStage,
    private readonly options: BuildingViewOptions,
  ) {
    this.blackout = new Blackout(stage, options.blackout);
  }

  /** The building the player stands in, if any. */
  get building(): House | undefined {
    return this.inside;
  }

  /** Every building drawn, in the inside test's order. */
  get drawn(): readonly BuiltBuilding[] {
    return [...this.built.values()];
  }

  /**
   * Adds a building drawn in both its looks, or replaces the one with its house id (its old parts
   * destroyed) in that one's place. It takes its look on the next {@link update}.
   */
  set(building: BuiltBuilding): void {
    const old = this.built.get(building.house.id);
    if (old) for (const part of partsOf(old)) part.destroy();
    this.built.set(building.house.id, building);
    this.invalidate();
  }

  /** Destroys a building's parts and forgets it. */
  remove(id: string): void {
    const old = this.built.get(id);
    if (!old) return;
    for (const part of partsOf(old)) part.destroy();
    this.built.delete(id);
    this.invalidate();
  }

  /**
   * The buildings, the scenery or what covers the player changed: the next {@link update} shows
   * the looks again and retakes the cover.
   */
  invalidate(): void {
    this.stale = true;
    this.covers = undefined;
  }

  /** Whether a world position is hidden from the player by the one hide rule (§C.1). */
  hidden(pos: Point): boolean {
    return hidden(pos, this.houses(), this.inside);
  }

  /** Whether a function marker over `pos` shows (§C.5). */
  markerShown(pos: Point): boolean {
    return markerShown(pos, this.houses(), this.inside);
  }

  /**
   * Once a frame: `eye` is where the player stands, undefined while there is no player to stand
   * anywhere (not drawn, dead, escaped, spectating); `figure` is the player to silhouette, if any.
   * On the frame the player's building changes, every look, the scenery and the blackout follow
   * at once (§A.4).
   */
  update(eye: Point | undefined, figure?: Figure): void {
    const next = buildingAt(eye, this.houses());
    if (next !== this.inside || this.stale) {
      this.inside = next;
      this.stale = false;
      this.showLooks();
      this.options.onShow?.(next);
    }
    // redrawn only on a change of building or of the walls' height, once they bake
    this.blackout.show(next);
    this.showSilhouette(figure);
  }

  /** Off and forgotten, for a floor's teardown: every building destroyed, no blackout, no silhouette. */
  clear(): void {
    for (const b of this.built.values()) for (const part of partsOf(b)) part.destroy();
    this.built.clear();
    this.inside = undefined;
    this.invalidate();
    this.blackout.clear();
    this.silhouette?.update(null, []);
  }

  /**
   * Gone with its scene: the buildings and the silhouette are the display list's to destroy, as
   * Phaser does on shutdown; the blackout lets go of its Graphics (destroying it twice is safe).
   */
  destroy(): void {
    this.built.clear();
    this.inside = undefined;
    this.silhouette = undefined;
    this.blackout.destroy();
  }

  private houses(): House[] {
    return [...this.built.values()].map((b) => b.house);
  }

  /**
   * From outside every building each shows its exterior; inside one, that one shows its interior
   * look and every other building stands outside it and hides whole (§B.2, §B.6, §C.1). Scenery
   * follows the hide rule by its footprint.
   */
  private showLooks(): void {
    const mine = this.inside;
    for (const b of this.built.values()) {
      if (!mine) showLook(b, "exterior");
      else if (b.house.id === mine.id) showLook(b, "interior");
      else for (const part of partsOf(b)) part.setVisible(false);
    }
    for (const { parts, at } of this.options.scenery?.() ?? []) {
      const shown = at ? !this.hidden(at) : !mine;
      for (const part of parts) part.setVisible(shown);
    }
  }

  /**
   * The silhouette (§E): while the player stands outside every building and pieces cover them by
   * the occluder test, it shows where those pieces are (§E.3); never inside a building (§E.5).
   */
  private showSilhouette(figure: Figure | undefined): void {
    if (!figure || this.built.size === 0) {
      this.silhouette?.update(null, []);
      return;
    }
    const over = this.inside ? [] : covering(figure, this.cover());
    this.silhouette ??= new Silhouette(this.stage);
    this.silhouette.update(figure.body, over.map((c) => c.part));
  }

  /** Every piece standing from outside: each building's exterior and back walls, then the scene's. */
  private cover(): Cover[] {
    this.covers ??= [
      ...[...this.built.values()].flatMap((b) => b.cover),
      ...(this.options.cover?.() ?? []),
    ];
    return this.covers;
  }
}
