/**
 * A floor's fixed-light budget (FS-8RBQY §C.6): the sconces, arrow slits, braziers and the stairs
 * pool stamped once per floor build are capped, so a crowded floor never stamps more pools than
 * the light-map is tuned for. The player's carried torch and transient lights are not fixed
 * lights and never pass through here.
 *
 * Pure: it decides which lights to keep, the scene stamps them. The choice depends only on each
 * light's kind and place, never on arrival order, so every client keeps the same pools. A dungeon
 * floor's lights are held by {@link FloorLights}, the one owner of which stand on the floor and
 * which are on the light-map.
 */

import { screenToWorld, type Point } from "@/render/iso";
import type { LightSource } from "@/render/lighting/lighting";
import { BARROW_HEX } from "@/utils/theme";
import { tileHash } from "./ground";

/**
 * What kind of fixed light a pool is: the budget drops by kind. `interactable` is the faint pool
 * a chest or switch stands in under the tower's dark ambient (§B.7's readability floor);
 * `hallowed_altar` the hallowed altar's candles while it is dormant (FS-5FZ4J §J R51).
 */
export type FixedLightKind =
  | "stairs"
  | "interactable"
  | "sconce"
  | "brazier"
  | "slit"
  | "hallowed_altar";

/** The most fixed lights one floor stamps. */
export const FIXED_LIGHT_CAP = 24;

/**
 * Past the cap, lights go in this order (§C.6), an interactable's pool last of all: it is what
 * keeps a chest reading as one. The hallowed altar's candles go just before it: they mark a Pray
 * still to be had, as the pool marks a chest. The stairs pool is not on it: it is never dropped.
 */
const DROP_ORDER: readonly FixedLightKind[] = [
  "slit",
  "brazier",
  "sconce",
  "hallowed_altar",
  "interactable",
];

/**
 * The faint warm pool an interactable stands in, so a chest or switch never sinks into the
 * ambient (FS-8RBQY §B.7). Amber, because the player can act on it (guideline "Gameplay
 * accent"); smaller and dimmer than any sconce, so it reads as a glint, not a light.
 */
export function interactablePool(at: Point, seed: number): LightSource {
  return {
    x: at.x,
    y: at.y,
    radius: 84,
    color: BARROW_HEX.amber,
    intensity: 0.32,
    flicker: 0.12,
    seed,
  };
}

/** One fixed light: its kind, where it stands (any fixed frame), and what the scene stamps. */
export interface FixedLight<T> {
  kind: FixedLightKind;
  at: Point;
  light: T;
}

/** Which of a kind goes first: by a hash of place, so the drops scatter along a wall. */
const dropRank = (l: FixedLight<unknown>) =>
  tileHash(Math.round(l.at.x), Math.round(l.at.y), 0x4c49_4748);

/**
 * The lights to stamp, in the order given: all of them while they fit under `cap`, else less the
 * slits, then braziers, then sconces needed to fit. The stairs pool always survives.
 */
export function budgetLights<L extends FixedLight<unknown>>(
  lights: readonly L[],
  cap: number = FIXED_LIGHT_CAP,
): L[] {
  let over = lights.length - Math.max(cap, 0);
  if (over <= 0) return [...lights];
  const dropped = new Set<L>();
  for (const kind of DROP_ORDER) {
    const ofKind = lights
      .filter((l) => l.kind === kind)
      .sort((a, b) => dropRank(b) - dropRank(a));
    for (const l of ofKind) {
      if (over <= 0) break;
      dropped.add(l);
      over--;
    }
  }
  return lights.filter((l) => !dropped.has(l));
}

/**
 * A dungeon floor's fixed lights to stamp now (FS-KE075 §H.45): only those standing in a chunk
 * near the camera, and of them never more than `cap` at once, dropped as {@link budgetLights}
 * drops them. A floor sixteen times the size holds more lights than the cap; the light-map never
 * stamps more than the cap at a time, wherever the camera is.
 *
 * Under the fog of war, `on` says which are lit at all: a light in a region that is not visible is
 * off (FS-SRA9J §C.12), before the cap, so an unlit light never takes a lit one's place.
 */
export function nearLights<L extends FixedLight<unknown> & { chunk: number }>(
  lights: readonly L[],
  shown: (chunk: number) => boolean,
  cap: number = FIXED_LIGHT_CAP,
  on: (light: L) => boolean = () => true,
): L[] {
  return budgetLights(lights.filter((l) => shown(l.chunk) && on(l)), cap);
}

/** A dungeon floor's fixed light as held: where it stands, its ground chunk and the region it lights (0: none). */
export type FloorLight<S> = FixedLight<{ source: S; at?: Point }> & { chunk: number; region: number };

/** The light-map, as the floor's lights put their sources on it and take them off. */
export interface LightMapPort<S> {
  add(source: S): void;
  remove(source: S): void;
}

/**
 * A dungeon floor's fixed lights (FS-KE075 §H.45, FS-SRA9J §C.12): every light standing on the
 * floor, each with its ground chunk and the region it lights, and which of them are on the
 * light-map now. A light is added once the floor stands (its sconces, braziers, a lit seal
 * brazier, the hallowed altar's candles) and removed when it goes out or what holds it goes;
 * {@link light} puts those near the camera, in a visible region, on the light-map within the
 * floor's cap, and takes the rest off. A floor drawn again from a re-sent map keeps its lights,
 * each given its region on the new grid ({@link reRegion}).
 *
 * Pure: the chunks, the regions and the light-map are handed in.
 */
export class FloorLights<S extends { readonly x: number; readonly y: number }> {
  private held: FloorLight<S>[] = [];
  private readonly on = new Set<S>();

  /**
   * @param chunkAt the ground chunk a screen point stands in
   * @param regionAt the region a world point lies in, 0 for none
   */
  constructor(
    private readonly chunkAt: (screen: Point) => number,
    private regionAt: (world: Point) => number,
    private readonly map: LightMapPort<S>,
  ) {}

  /** Every light standing on the floor. */
  get all(): readonly FloorLight<S>[] {
    return this.held;
  }

  /** The lights on the light-map now. */
  get lit(): ReadonlySet<S> {
    return this.on;
  }

  /**
   * A light standing on the floor, off the light-map until the next {@link light}: by its source's
   * screen point for its chunk, and `at`, the world point it stands on, for its region (with none,
   * a wall's slit, the point under its source). A source already held stays as it is.
   */
  add(kind: FixedLightKind, source: S, at?: Point): void {
    if (this.held.some((l) => l.light.source === source)) return;
    const screen = { x: source.x, y: source.y };
    this.held.push({ kind, at: screen, light: { source, at }, chunk: this.chunkAt(screen), region: this.regionOf(screen, at) });
  }

  /** These lights off the floor, and off the light-map those of them it lit. */
  remove(sources: Iterable<S>): void {
    const gone = new Set(sources);
    if (gone.size === 0) return;
    this.held = this.held.filter((l) => !gone.has(l.light.source));
    for (const source of gone) if (this.on.delete(source)) this.map.remove(source);
  }

  /** Every light given its region on a new grid, and the lights added after placed by it. */
  reRegion(regionAt: (world: Point) => number): void {
    this.regionAt = regionAt;
    for (const l of this.held) l.region = this.regionOf(l.at, l.light.at);
  }

  /**
   * The light-map made to match: the lights in a `shown` chunk whose region is `visible` (or that
   * light no region) on it, never more than `cap` at once, dropped as {@link budgetLights} drops
   * them, and the rest off it.
   */
  light(shown: (chunk: number) => boolean, visible: (region: number) => boolean, cap: number = FIXED_LIGHT_CAP): void {
    const near = nearLights(this.held, shown, cap, (l) => l.region === 0 || visible(l.region));
    const kept = new Set(near.map((l) => l.light.source));
    for (const source of this.on)
      if (!kept.has(source)) {
        this.map.remove(source);
        this.on.delete(source);
      }
    for (const source of kept)
      if (!this.on.has(source)) {
        this.map.add(source);
        this.on.add(source);
      }
  }

  private regionOf(screen: Point, at: Point | undefined): number {
    return this.regionAt(at ?? screenToWorld(screen.x, screen.y));
  }
}
