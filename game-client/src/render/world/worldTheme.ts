/**
 * The world theme (FS-8RBQY §A, CONTEXT.md "World theme"): how the client draws a run. One entry
 * per theme decides the ground plan, the wall sheets, whether roofs and the indoor mask exist, the
 * ambient, the perimeter wall and run dressing, so a third theme is one more entry here.
 *
 * A theme may vary per floor by **floor band** (§C): {@link TOWER_BANDS} is the one table where
 * the band shares live, and {@link floorLook} resolves what a given floor is drawn with.
 *
 * A client constant, never on the wire and never a game rule: "selectable later" means changing
 * {@link RUN_WORLD_THEME}.
 */

import { AMBIENT, TOWER_AMBIENT } from "@/render/lighting/lighting";
import {
  OUTDOOR_GROUND,
  TOWER_GROUND,
  tileHash,
  worldSeed,
  type GroundLook,
} from "./ground";
import type { DressingLean } from "./runDressing";
import { MASONRY_WALLS, TIMBER_WALLS, type WallSheets } from "./walls";

export type WorldTheme = "exterior" | "tower";

/** A run floor's place in the climb (FS-8RBQY §C.1, CONTEXT.md "Floor band"). */
export type FloorBand = "lower" | "middle" | "upper";

/** What one floor band changes, within the theme's sheets (§C.2). */
export interface BandLook {
  ground: GroundLook;
  walls: WallSheets;
  dressing: DressingLean;
}

/** What one world theme draws a run with. */
export interface WorldThemeLook {
  ground: GroundLook;
  /** The sheets and variant tables server walls are cut into. */
  walls: WallSheets;
  /** Whether each house wears a roof (and a roof occluder). */
  roofs: boolean;
  /**
   * Whether entering a house darkens everything outside it, and the HUD says Indoor/Outdoor. A
   * tower floor is all indoors, so there "indoor" means nothing.
   */
  indoorMask: boolean;
  ambient: number;
  /** Whether the tower's outer wall rings the play area. */
  perimeter: boolean;
  /** Whether run dressing is strewn on the floor (FS-8RBQY §C.4). */
  dressing: boolean;
  /**
   * Whether the chest and the switch stand in a faint amber pool, so they still read as
   * themselves under a dark ambient (§B.7). A fixed light, inside the floor's budget.
   */
  interactablePools: boolean;
  /** Per-band looks; absent, every floor is drawn alike, from the same seed. */
  bands?: Record<FloorBand, BandLook>;
}

/**
 * The tower's floor bands (§C.2), the only place their shares live. Tuned at the coordinator's
 * visual review. `middle` is the look FS-8RBQY slice 2 settled; `lower` sinks toward the barrow
 * (earth through the flags, cobwebs, roots and bones), `upper` rises toward the Lich Lord's
 * halls (dressed stone, banners, chains and braziers).
 */
export const TOWER_BANDS: Record<FloorBand, BandLook> = {
  lower: {
    ground: {
      ...TOWER_GROUND,
      patches: { sheet: "ground_dirt", edge: "ground_flags_dirt", count: 9 },
    },
    walls: {
      ...MASONRY_WALLS,
      back: [
        [44, "plain"],
        [60, "pillar"],
        [76, "sconce"],
        [100, "cobweb"],
      ],
    },
    dressing: {
      count: 12,
      weights: [
        [34, "rubble"],
        [64, "bone_pile"],
        [94, "roots"],
        [100, "broken_crate"],
      ],
    },
  },
  middle: {
    ground: TOWER_GROUND,
    walls: MASONRY_WALLS,
    dressing: {
      count: 10,
      weights: [
        [36, "rubble"],
        [70, "broken_crate"],
        [100, "chains"],
      ],
    },
  },
  upper: {
    ground: { ...TOWER_GROUND, hall: "ground_dressed" },
    walls: {
      ...MASONRY_WALLS,
      back: [
        [32, "plain"],
        [58, "pillar"],
        [80, "sconce"],
        [100, "banner"],
      ],
    },
    dressing: {
      count: 10,
      weights: [
        [38, "chains"],
        [66, "brazier"],
        [84, "rubble"],
        [100, "broken_crate"],
      ],
      most: { brazier: 2 },
    },
  },
};

export const WORLD_THEMES: Record<WorldTheme, WorldThemeLook> = {
  /** The run look as it shipped before FS-8RBQY, kept for a future outdoor place. */
  exterior: {
    ground: OUTDOOR_GROUND,
    walls: TIMBER_WALLS,
    roofs: true,
    indoorMask: true,
    ambient: AMBIENT.run,
    perimeter: false,
    dressing: false,
    interactablePools: false,
  },
  /** The inside of the Barrowspire. */
  tower: {
    ground: TOWER_GROUND,
    walls: MASONRY_WALLS,
    roofs: false,
    indoorMask: false,
    ambient: TOWER_AMBIENT,
    perimeter: true,
    dressing: true,
    interactablePools: true,
    bands: TOWER_BANDS,
  },
};

/** The world theme every run is drawn in. */
export const RUN_WORLD_THEME: WorldTheme = "tower";

/**
 * The band of floor `floor` of `floorCount`: the climb's fraction `t`, cut at thirds. A
 * single-floor run is `lower`, and any future floor count still ramps lower → upper.
 */
export function floorBand(floor: number, floorCount: number): FloorBand {
  const t = floorCount > 1 ? (floor - 1) / (floorCount - 1) : 0;
  return t < 1 / 3 ? "lower" : t < 2 / 3 ? "middle" : "upper";
}

/** What one floor of a run is drawn with: its band's ground, walls and dressing, and its seed. */
export interface FloorLook {
  band: FloorBand;
  ground: GroundLook;
  walls: WallSheets;
  /** What to strew, or null for a theme without run dressing. */
  dressing: DressingLean | null;
  /** Every hash on the floor (ground, wall variants, dressing) starts from this (§C.3). */
  seed: number;
}

/** Salts a banded theme's floor seed, so its floors never share the exterior's pattern. */
const BANDED_SALT = 0x544f_5752;

/**
 * Floor `floor` of `floorCount` in `theme`. A theme without bands draws every floor alike from
 * the run's seed, exactly as runs were drawn before FS-8RBQY; a banded theme seeds each floor
 * apart, so a climb never repeats the floor below. Missing floor numbers read as floor 1 of 1.
 */
export function floorLook(
  theme: WorldThemeLook,
  floor = 1,
  floorCount = 1,
): FloorLook {
  const band = floorBand(floor, floorCount);
  const banded = theme.bands?.[band];
  if (!banded)
    return {
      band,
      ground: theme.ground,
      walls: theme.walls,
      dressing: null,
      seed: worldSeed("run"),
    };
  return {
    band,
    ground: banded.ground,
    walls: banded.walls,
    dressing: theme.dressing ? banded.dressing : null,
    seed: tileHash(floor, BANDED_SALT, worldSeed("run")),
  };
}
