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
import { AMBIENT, tinted } from "@/render/lighting/lighting";
import { mix } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import type { FieldDressingLook } from "./fieldDressing";
import { OUTDOOR_GROUND, type GroundLook } from "./ground";
import type { HorizonLook } from "./horizon";

export interface FieldLook {
  /** The exterior theme's ground family, recoloured for this field. */
  ground: GroundLook;
  /** The field's fixed daylight (guideline "Lighting": fixed per field). */
  ambient: number;
  /** The baked props its keep-outs are dressed with. */
  dressing: FieldDressingLook;
  /** Sky, distant hills and the land beyond the far edge. */
  horizon: HorizonLook;
}

/**
 * A colour's hue lifted (or sunk) so its brightest channel is `value` of full: a multiply that
 * keeps a token's channel ratio. A ground tint can only darken, and every token is darker than
 * the baked grass needs to stay daylit, so the tint takes a token's hue rather than its value.
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
 * family's, tinted toward a moss green (arcane-deep's hue warmed with a little vellum), kept low
 * enough that the darkest marker ink still clears 3:1 at the canvas edge. The grass is ground
 * material, never the safe channel: it sits far darker than arcane green.
 */
export const MEADOWS_LOOK: FieldLook = {
  ground: {
    ...OUTDOOR_GROUND,
    tint: atValue(mix(BARROW_HEX.arcaneDeep, BARROW_HEX.vellum, 0.1), 0.85),
  },
  ambient: AMBIENT.field,
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
};

/**
 * The land beyond a field's edges: its grass's measured mean under the look's tint, so the ground
 * fading out past the edge dissolves into a colour it already has. Without a mean, the look's own.
 */
export function landBeyond(look: FieldLook, grassMean: ArtRgb | undefined): number {
  if (!grassMean) return look.horizon.land;
  const { r, g, b } = look.ground.tint === undefined ? grassMean : tinted(grassMean, look.ground.tint);
  return (r << 16) | (g << 8) | b;
}

/** Every field's look, by field id. */
export const FIELD_LOOKS: Partial<Record<FieldId, FieldLook>> = {
  gentle_meadows: MEADOWS_LOOK,
};

/** The look a field is drawn with; a field with no entry of its own is drawn as the Meadows. */
export function fieldLook(field: string | undefined): FieldLook {
  const known = field !== undefined && Object.prototype.hasOwnProperty.call(FIELD_LOOKS, field);
  return (known && FIELD_LOOKS[field as FieldId]) || MEADOWS_LOOK;
}
