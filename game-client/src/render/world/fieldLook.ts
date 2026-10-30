/**
 * Each field world's look (FS-X2F2H §Requirements 54, CONTEXT.md "Field world"): the ground it
 * lays, the daylight it is lit by, what stands on its keep-outs, and the flat tint past its map's
 * edge (FS-KSD6K §Requirements 14). One entry per field id, so a field is drawn by adding its
 * entry here: FS-3QHQZ adds the Forlorn Forest as one more. A field with no entry is drawn as
 * the Meadows.
 *
 * A client constant, never on the wire. Every colour is mixed from `BARROW_HEX` tokens, and each
 * entry is held to the readability floor against its own lit ground (`src/render/markers/`).
 */

import type { FieldId } from "@/assets/types/client";
import type { MistLook } from "@/render/effects/mist";
import { FOREST_AMBIENT } from "@/render/lighting/lighting";
import { mix } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { FieldDressingLook } from "./fieldDressing";
import type { VergeLean } from "./forestDressing";
import { OUTDOOR_GROUND, type GroundLook } from "./ground";
import type { TreeStandLook } from "./treeStands";

interface FieldLookBase {
  /** The exterior theme's ground family, recoloured for this field. */
  ground: GroundLook;
  /** The field's fixed daylight (guideline "Lighting": fixed per field). */
  ambient: number;
  /**
   * The edge tint: the one flat colour past the map's edge, the camera's background, which the
   * ground fades into at the edge (FS-KSD6K §Requirements 14, 16). Nothing else is drawn there.
   */
  beyond: number;
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
 * Gentle Meadows (D18): cozy, daylit greens, sparse trees, a soft muted green-grey past its edge.
 * The grass is the outdoor family's, tinted toward arcane-deep's green and lifted well past the
 * baked sheet, under a warm vellum-and-amber daylight at full value. Brightness is not capped for the readability floor:
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
  // a soft muted green-grey: the open field falling away calm, no painted sky (FS-KSD6K R14)
  beyond: mix(mix(BARROW_HEX.arcaneDeep, BARROW_HEX.slate, 0.5), BARROW_HEX.necrotic, 0.25),
} satisfies FieldLook;

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
  // a deep moss-black: more forest swallowed by gloom past the edge (FS-KSD6K R14)
  beyond: mix(BARROW_HEX.pitch, BARROW_HEX.arcaneDeep, 0.3),
} satisfies FieldLook;

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
