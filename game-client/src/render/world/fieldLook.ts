/**
 * Each field world's look (FS-X2F2H §Requirements 54, CONTEXT.md "Field world"): the ground it
 * lays, the daylight it is lit by, what stands on its keep-outs, and the horizon behind its far
 * edge. One entry per field id, so a field is drawn by adding its entry here: FS-3QHQZ adds the
 * Forlorn Forest as one more. A field with no entry is drawn as the Meadows.
 *
 * A client constant, never on the wire. Every colour is mixed from `BARROW_HEX` tokens, and each
 * entry is held to the readability floor against its own lit ground (`src/render/markers/`).
 */

import type { FieldId } from "@/assets/types/client";
import type { ArtRgb } from "@/render/art/manifest";
import type { MistLook } from "@/render/effects/mist";
import { FOREST_AMBIENT, groundMean, tinted } from "@/render/lighting/lighting";
import { mix } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { FieldDressingLook } from "./fieldDressing";
import type { VergeLean } from "./forestDressing";
import { OUTDOOR_GROUND, type GroundLook } from "./ground";
import type { HorizonLook } from "./horizon";
import type { TreeStandLook } from "./treeStands";

interface FieldLookBase {
  /** The exterior theme's ground family, recoloured for this field. */
  ground: GroundLook;
  /** The field's fixed daylight (guideline "Lighting": fixed per field). */
  ambient: number;
  /** Sky, distant hills and the land beyond the far edge. */
  horizon: HorizonLook;
  /** Props strewn along the trails' verges (a forest, FS-3QHQZ §Requirements 28). */
  verges?: VergeLean;
  /** A low mist drifting over the ground (a forest, FS-3QHQZ §Requirements 27). */
  mist?: MistLook;
}

/**
 * How a field draws the server's keep-out walls: open country stands a sparse grove or a rock on
 * each (`dressing`); a forest fills every one with a tree stand (`stands`, FS-3QHQZ §Requirements
 * 23), so what blocks is what is drawn.
 */
export type FieldLook = FieldLookBase &
  (
    | { dressing: FieldDressingLook; stands?: undefined }
    | { stands: TreeStandLook; dressing?: undefined }
  );

/**
 * A colour's hue lifted (or sunk) so its brightest channel is `value` of full: a multiply that
 * keeps a token's channel ratio. A tint or an ambient can only darken, and every token is darker
 * than daylight needs, so they take a token's hue rather than its value.
 */
function atValue(color: number, value: number): number {
  const c = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  const scale = (value * 255) / Math.max(...c, 1);
  const [r, g, b] = c.map((v) => Math.min(255, Math.round(v * scale)));
  return (r << 16) | (g << 8) | b;
}

/**
 * The warm haze where the Meadows' sky meets its hills. The sky is drawn under the light-map like
 * the whole world, so the daylight multiplies it; it takes vellum's hue lifted toward full, or the
 * multiply would leave a brown sky.
 */
const MEADOWS_HAZE = atValue(mix(BARROW_HEX.vellum, BARROW_HEX.necrotic, 0.3), 0.95);

/**
 * Gentle Meadows (D18): cozy, daylit greens, sparse trees, a horizon. The grass is the outdoor
 * family's, tinted toward arcane-deep's green and lifted well past the baked sheet, under a warm
 * vellum-and-amber daylight at full value. Brightness is not capped for the readability floor:
 * in a field every marker wears a dark outline (`FIELD_MARKER_OUTLINE`), which carries 3:1
 * against any ground. The grass is ground material, never the safe channel: a lit meadow green,
 * not arcane's.
 */
export const MEADOWS_LOOK = {
  ground: {
    ...OUTDOOR_GROUND,
    tint: atValue(mix(BARROW_HEX.arcaneDeep, BARROW_HEX.vellum, 0.2), 1),
    lift: 0.5,
  },
  ambient: atValue(mix(BARROW_HEX.vellum, BARROW_HEX.amberBright, 0.25), 1),
  dressing: {
    // oaks mostly, a pine now and then: green, never autumn or gloom
    trees: ["tree_oak", "tree_oak", "tree_pine"],
    undergrowth: ["bush"],
    rocks: ["rock"],
  },
  horizon: {
    // a pale sage sky overhead, warming to the haze at the hills
    skyHigh: atValue(mix(BARROW_HEX.necrotic, BARROW_HEX.vellum, 0.15), 0.9),
    skyLow: MEADOWS_HAZE,
    farHills: mix(mix(BARROW_HEX.necrotic, BARROW_HEX.arcaneDeep, 0.5), MEADOWS_HAZE, 0.4),
    nearHills: mix(BARROW_HEX.arcaneDeep, BARROW_HEX.vellum, 0.12),
    // without a measured grass mean; with one, the land is the tinted grass (landBeyond)
    land: mix(BARROW_HEX.arcaneDeep, BARROW_HEX.pitch, 0.2),
    seed: 0x4d45_4144,
  },
} satisfies FieldLook;

/**
 * The overcast where the Forest's sky meets its far treeline: necrotic's cold grey-green, lifted
 * toward vellum, under the forest's dim ambient like the whole world.
 */
const FOREST_HAZE = atValue(mix(BARROW_HEX.necrotic, BARROW_HEX.vellumDark, 0.45), 0.85);

/**
 * The Forlorn Forest (FS-3QHQZ §C): "a little gloomy but not so dark, forest vibes, with a trail
 * to follow". Every server wall is a stand of dark oaks and pines among dead trees and snags; the
 * trails and clearings are worn barrow dirt, leaf litter under the stands, under an overcast
 * grey-green ambient between the hub's and a run's. The ground keeps the outdoor family's sheets,
 * cooled and dimmed toward the forest's grey-green but lifted so the trail reads as the light
 * thing to follow between dark trunks; the markers wear the field outline, as in every field.
 */
export const FOREST_LOOK = {
  ground: {
    ...OUTDOOR_GROUND,
    tint: atValue(mix(BARROW_HEX.vellumDark, BARROW_HEX.necrotic, 0.35), 1),
    lift: 0.6,
    trodden: true,
    // the litter under the trees: the grass sheet sunk to a dim leaf brown
    litterShade: atValue(mix(BARROW_HEX.vellumDark, BARROW_HEX.barrowBrown, 0.4), 0.62),
  },
  ambient: FOREST_AMBIENT,
  stands: {
    // dark, low-saturation oaks and pines; bare dead trees and broken snags
    live: ["tree_oak_gloom", "tree_oak_gloom", "tree_pine_gloom"],
    dead: ["tree_dead", "tree_dead_snag"],
  },
  verges: {
    count: 56,
    weights: [
      [38, "fern"],
      [58, "toadstools"],
      [74, "stump"],
      [90, "fallen_log"],
      [100, "bone_pile"],
    ],
  },
  mist: {
    color: atValue(mix(BARROW_HEX.vellum, BARROW_HEX.necrotic, 0.35), 0.95),
    alpha: 0.35,
    drift: { x: 7, y: 2 },
  },
  horizon: {
    // a low overcast over a far ridge of forest, the near ridge darker
    skyHigh: atValue(mix(BARROW_HEX.slateLight, BARROW_HEX.necrotic, 0.5), 0.6),
    skyLow: FOREST_HAZE,
    farHills: mix(mix(BARROW_HEX.arcaneDeep, BARROW_HEX.slate, 0.5), FOREST_HAZE, 0.35),
    nearHills: mix(BARROW_HEX.arcaneDeep, BARROW_HEX.pitch, 0.45),
    // without a measured mean; with one, the land is the tinted litter (landBeyond)
    land: mix(BARROW_HEX.barrowDeep, BARROW_HEX.arcaneDeep, 0.4),
    seed: 0x464f_5245,
  },
} satisfies FieldLook;

/**
 * The land beyond a field's edges: its grass's measured mean as the look paints it (tint and lift;
 * a forest's litter shade too), so the map's edge meets a colour it already has and the road
 * fading out past it dissolves into that. Without a mean, the look's own.
 */
export function landBeyond(look: FieldLook, grassMean: ArtRgb | undefined): number {
  if (!grassMean) return look.horizon.land;
  // a forest runs on past its edge under its trees: its litter, shaded as the stands' is
  const shade = look.ground.trodden ? look.ground.litterShade : undefined;
  const mean = shade === undefined ? grassMean : tinted(grassMean, shade);
  const { r, g, b } = groundMean(mean, look.ground);
  return (r << 16) | (g << 8) | b;
}

/** Every field's look, by field id. */
export const FIELD_LOOKS: Partial<Record<FieldId, FieldLook>> = {
  gentle_meadows: MEADOWS_LOOK,
  forlorn_forest: FOREST_LOOK,
};

/** The look a field is drawn with; a field with no entry of its own is drawn as the Meadows. */
export function fieldLook(field: string | undefined): FieldLook {
  const known = field !== undefined && Object.prototype.hasOwnProperty.call(FIELD_LOOKS, field);
  return (known && FIELD_LOOKS[field as FieldId]) || MEADOWS_LOOK;
}
