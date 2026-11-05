/**
 * The sprite manifest (CONTEXT.md "Sprite manifest"): `public/art/manifest.json`, the bake's
 * index and the only way the client learns about art (FS-2325V §B.2, §B.6).
 *
 * The bake (`tools/bake/`) writes it and validates it with {@link validateManifest} before
 * writing, and the client validates it again on load. One validator, both ends.
 *
 * Geometry conventions every sheet shares:
 * - `anchor` is the origin fraction of the frame where the object's ground footprint origin
 *   sits, so `sprite.setOrigin(anchor.x, anchor.y)` stands it on its world position.
 * - `frames[direction][index]` is the frame's top-left in its atlas, at 1x. Every frame of a
 *   sheet has the sheet's `frameWidth` x `frameHeight`, whatever animation it belongs to. The
 *   atlas is the sheet's, unless the animation names its own page (an oversized sheet split by
 *   animation, FS-Q14EV §B.7).
 * - A state (door locked/open) or a variant (grass a/b/c) is an animation of one frame per
 *   variant at 0 fps; a moving animation (walk) has several frames at its fps.
 * - Directions, when 8, follow {@link DIRECTION_ORDER}, which the manifest also records as
 *   `facings` so the file says what its frame lists mean. The names are the world compass of
 *   `Facing8` (`src/render/iso/facing.ts`): `n` is world -y, `e` is world +x, and `se` faces the
 *   viewer. Use {@link directionIndex} to turn a facing into a frame-list index.
 * - A light's `offset` is in screen px from the anchor, `radius` in screen px, and `color` names
 *   a `BARROW` token (ADR-0013); no authored colour value is ever written into the manifest.
 * - A ground sheet's `mean` is the one colour the manifest carries, and it is measured, not
 *   authored: the bake's average of the sheet's pixels, so the readability floor is judged
 *   against the floor as drawn (FS-2325V §C.9).
 * - A standing sheet's `crown` is measured too: screen px from the anchor up to the top of its
 *   opaque idle silhouette, the tallest across facings, so name plates and HP bars sit over the
 *   head rather than over the frame, which is padded for attack and death poses.
 * - A quadruped's `length` is measured the same way, side-on: screen px across its opaque idle
 *   silhouette in the facings that lay its body along the screen (ne, sw), the longest. Its size
 *   tier is taken by body length, not height (guideline "Size is a threat tier", FS-X2F2H R61).
 * - A sheet's `scale` (absent: 1) is how many of its px make one screen px: a sheet baked at 2x
 *   (FS-HF0WW) holds twice the detail each way and is drawn at half size
 *   ({@link sheetScale}), so it stands exactly as large as a 1x sheet. Its frame geometry
 *   (`frameWidth`, `frameHeight`, frame positions) is in its own px, as the atlas holds them; the
 *   anchor is a fraction, so it holds either way; `crown`, `length` and a light stay screen px.
 * - A `trimmed` sheet (FS-HF0WW) had each frame cut to the box that holds its pixels before
 *   packing, so its atlas stores no empty margin. Each frame then also records its `trim`: where
 *   the cut sits inside the sheet's `frameWidth` x `frameHeight`, in the sheet's px and on whole
 *   screen px (multiples of `scale`). The atlas holds the cut, `trim.w` x `trim.h`, at the frame's
 *   (x, y). The client registers it as a trimmed frame of the whole frame's size (`phaser.ts`), so
 *   it draws, anchors and sizes as the whole frame would; anything else reading frames from the
 *   atlas must put the cut back at `trim.x`, `trim.y` itself.
 */

import type { Facing8 } from "@/render/iso/facing";
import { BARROW } from "@/utils/theme";

export const MANIFEST_VERSION = 1;
export const MAX_ATLAS_SIZE = 4096;

export type BarrowToken = keyof typeof BARROW;

/**
 * The order of an 8-way sheet's frame lists: `frames[i]` faces `DIRECTION_ORDER[i]`. World
 * compass, clockwise from east as seen from above the map (world y down); the projection keeps
 * it clockwise on screen. The bake turns each model to these facings in this order
 * (`tools/bake/page/facing.js`, tested against this list).
 */
export const DIRECTION_ORDER: readonly Facing8[] = [
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
  "n",
  "ne",
];

/** The frame-list index of a facing on an 8-way sheet. */
export function directionIndex(facing: Facing8): number {
  return DIRECTION_ORDER.indexOf(facing);
}

/**
 * Where a trimmed frame's cut sits inside its whole frame: the offset of its top-left and its
 * size, in the sheet's px, each a multiple of the sheet's `scale`.
 */
export interface ArtFrameTrim {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtFramePosition {
  x: number;
  y: number;
  /** A `trimmed` sheet's frames only: the cut the atlas holds at (x, y), and where it sits. */
  trim?: ArtFrameTrim;
}

export interface ArtAnimation {
  fps: number;
  loop: boolean;
  /**
   * The atlas page this animation's frames sit on, written only when that is not the sheet's
   * `atlas`: a sheet too big for one page is split by animation over several pages of its group
   * (FS-Q14EV §B.7). Absent, the frames are on the sheet's atlas. See {@link animationAtlas}.
   */
  atlas?: string;
  /** `frames[direction][index]`: the frame's top-left in its atlas. */
  frames: ArtFramePosition[][];
}

/** The atlas an animation's frames sit on: its own page if it names one, else the sheet's. */
export const animationAtlas = (sheet: ArtSheet, animation: ArtAnimation) =>
  animation.atlas ?? sheet.atlas;

/** Every atlas a sheet's frames sit on: its own, plus any page an animation spilled onto. */
export const sheetAtlases = (sheet: ArtSheet): string[] => [
  ...new Set([
    sheet.atlas,
    ...Object.values(sheet.animations).map((a) => animationAtlas(sheet, a)),
  ]),
];

export interface ArtLight {
  offset: { x: number; y: number };
  radius: number;
  color: BarrowToken;
  /** 0 is a steady light; 1 is the most a flame gutters. */
  flicker: number;
}

/** The most px per screen px a sheet may be baked at. */
export const MAX_SHEET_SCALE = 4;

/** A sheet's px per screen px: its `scale`, or 1. */
export const sheetScale = (sheet: Pick<ArtSheet, "scale">): number =>
  sheet.scale ?? 1;

/** An sRGB colour, 0..255 per channel. */
export interface ArtRgb {
  r: number;
  g: number;
  b: number;
}

export interface ArtSheet {
  atlas: string;
  /** In the sheet's own px: `scale` of them to a screen px. */
  frameWidth: number;
  frameHeight: number;
  /**
   * The sheet's px per screen px, a whole number; absent is 1. Read it through
   * {@link sheetScale}.
   */
  scale?: number;
  /**
   * The frames were cut to their pixels at bake time: every frame records its `trim`. Absent,
   * every frame is whole, `frameWidth` x `frameHeight` in the atlas.
   */
  trimmed?: true;
  anchor: { x: number; y: number };
  directions: 1 | 8;
  animations: Record<string, ArtAnimation>;
  light?: ArtLight;
  /**
   * Ground sheets only: the alpha-weighted mean of every frame's pixels, in sRGB, measured by
   * the bake. Data about the art, not a palette colour.
   */
  mean?: ArtRgb;
  /**
   * Sheets with an idle animation (characters, creatures): screen px from the anchor up to the
   * top of the opaque idle silhouette, the tallest across facings, measured by the bake.
   */
  crown?: number;
  /**
   * Quadrupeds only: screen px rump to snout, measured side-on by the bake, the measure its size
   * tier is taken by. A side-on px of length reads as cos 30° px of height.
   */
  length?: number;
  source: string;
  licence: string;
}

export interface ArtAtlas {
  image: string;
  width: number;
  height: number;
  /** sha256 of the atlas's raw RGBA pixels. The bake keeps a PNG whose pixels are unchanged. */
  sha256: string;
}

export interface ArtManifest {
  version: typeof MANIFEST_VERSION;
  tile: { width: number; height: number };
  /** The direction order of every 8-way sheet: always {@link DIRECTION_ORDER}. */
  facings: Facing8[];
  atlases: Record<string, ArtAtlas>;
  sheets: Record<string, ArtSheet>;
}

export type ManifestResult =
  | { ok: true; manifest: ArtManifest }
  | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 0;
const isNonNegativeInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;
const isFinite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isFraction = (v: unknown): v is number => isFinite(v) && v >= 0 && v <= 1;
const isChannel = (v: unknown): v is number =>
  isNonNegativeInt(v) && (v as number) <= 255;
const isRgb = (v: unknown): v is ArtRgb =>
  isObject(v) && isChannel(v.r) && isChannel(v.g) && isChannel(v.b);
const isText = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Checks a parsed manifest against every rule the loader relies on. Returns every problem found,
 * not just the first, so a bad bake reports all of its defects in one run.
 */
export function validateManifest(input: unknown): ManifestResult {
  const errors: string[] = [];
  if (!isObject(input))
    return { ok: false, errors: ["manifest: not an object"] };

  if (input.version !== MANIFEST_VERSION)
    errors.push(`manifest: version must be ${MANIFEST_VERSION}`);

  const tile = input.tile;
  if (
    !isObject(tile) ||
    !isPositiveInt(tile.width) ||
    !isPositiveInt(tile.height)
  )
    errors.push("manifest: tile needs a positive integer width and height");

  const facings = input.facings;
  if (
    !Array.isArray(facings) ||
    facings.length !== DIRECTION_ORDER.length ||
    facings.some((f, i) => f !== DIRECTION_ORDER[i])
  )
    errors.push(`manifest: facings must be [${DIRECTION_ORDER.join(", ")}]`);

  const atlases = isObject(input.atlases) ? input.atlases : null;
  if (!atlases) errors.push("manifest: atlases must be an object");
  else
    for (const [key, atlas] of Object.entries(atlases))
      checkAtlas(key, atlas, errors);

  if (!isObject(input.sheets))
    errors.push("manifest: sheets must be an object");
  else
    for (const [name, sheet] of Object.entries(input.sheets))
      checkSheet(name, sheet, atlases ?? {}, errors);

  return errors.length === 0
    ? { ok: true, manifest: input as unknown as ArtManifest }
    : { ok: false, errors };
}

function checkAtlas(key: string, atlas: unknown, errors: string[]) {
  const at = `atlas ${key}`;
  if (!isObject(atlas)) return void errors.push(`${at}: not an object`);
  if (!isText(atlas.image) || !atlas.image.endsWith(".png"))
    errors.push(`${at}: image must name a .png`);
  for (const dim of ["width", "height"] as const) {
    const v = atlas[dim];
    if (!isPositiveInt(v) || v > MAX_ATLAS_SIZE)
      errors.push(
        `${at}: ${dim} must be a positive integer no larger than ${MAX_ATLAS_SIZE}`,
      );
  }
  if (typeof atlas.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(atlas.sha256))
    errors.push(`${at}: sha256 must be 64 lowercase hex characters`);
}

function checkSheet(
  name: string,
  sheet: unknown,
  atlases: Json,
  errors: string[],
) {
  const at = `sheet ${name}`;
  if (!isObject(sheet)) return void errors.push(`${at}: not an object`);

  const atlas =
    typeof sheet.atlas === "string" ? atlases[sheet.atlas] : undefined;
  if (!isObject(atlas))
    errors.push(`${at}: atlas must name an atlas in the manifest`);

  for (const dim of ["frameWidth", "frameHeight"] as const)
    if (!isPositiveInt(sheet[dim]))
      errors.push(`${at}: ${dim} must be a positive integer`);

  // only a character or creature sheet (one with a walk clip) is drawn through sheetScale and
  // registered trimmed; every other reader of the atlas takes its frames whole at 1x (ADR-0058)
  const walks =
    isObject(sheet.animations) && sheet.animations.walk !== undefined;
  for (const key of ["scale", "trimmed"] as const)
    if (sheet[key] !== undefined && !walks)
      errors.push(
        `${at}: ${key} is read on character and creature sheets only (a sheet with a walk clip)`,
      );

  const scale = sheet.scale !== undefined ? sheet.scale : 1;
  if (!isPositiveInt(scale) || scale > MAX_SHEET_SCALE)
    errors.push(
      `${at}: scale must be a whole number from 1 to ${MAX_SHEET_SCALE}`,
    );
  else if (
    isPositiveInt(sheet.frameWidth) &&
    isPositiveInt(sheet.frameHeight) &&
    (sheet.frameWidth % scale !== 0 || sheet.frameHeight % scale !== 0)
  )
    errors.push(`${at}: frameWidth and frameHeight must be multiples of scale`);

  if (sheet.trimmed !== undefined && sheet.trimmed !== true)
    errors.push(`${at}: trimmed must be true, or left out`);

  const anchor = sheet.anchor;
  if (!isObject(anchor) || !isFraction(anchor.x) || !isFraction(anchor.y))
    errors.push(`${at}: anchor must be {x, y} fractions within 0..1`);

  const directions = sheet.directions;
  if (directions !== 1 && directions !== 8)
    errors.push(`${at}: directions must be 1 or 8`);

  const animations = sheet.animations;
  if (!isObject(animations) || Object.keys(animations).length === 0)
    errors.push(`${at}: animations must name at least one animation`);
  else
    for (const [anim, value] of Object.entries(animations))
      checkAnimation(
        `${at} animation ${anim}`,
        value,
        sheet,
        atlas,
        atlases,
        errors,
      );

  if (isObject(animations) && animations.walk_attack !== undefined)
    checkWalkAttack(at, animations, errors);

  if (sheet.light !== undefined) checkLight(`${at} light`, sheet.light, errors);
  if (sheet.mean !== undefined && !isRgb(sheet.mean))
    errors.push(`${at}: mean must be {r, g, b} integers within 0..255`);
  if (sheet.crown !== undefined) checkCrown(at, sheet, errors);
  if (
    sheet.length !== undefined &&
    !(
      isPositiveInt(sheet.length) &&
      isPositiveInt(sheet.frameWidth) &&
      sheet.length <= sheet.frameWidth / screenScale(sheet)
    )
  )
    errors.push(
      `${at}: length must be a whole number of px no wider than the frame`,
    );

  if (!isText(sheet.source)) errors.push(`${at}: source must be recorded`);
  if (!isText(sheet.licence)) errors.push(`${at}: licence must be recorded`);
}

/** An animation's length in seconds, or undefined when its fps or frames are unsound. */
const clipSeconds = (anim: unknown): number | undefined =>
  isObject(anim) &&
  isFinite(anim.fps) &&
  anim.fps > 0 &&
  Array.isArray(anim.frames) &&
  Array.isArray(anim.frames[0])
    ? anim.frames[0].length / anim.fps
    : undefined;

/**
 * `walk_attack` plays in the window the client times from `attack` (FS-HF0WW), so it must last
 * exactly as long: frame count over fps the same.
 */
function checkWalkAttack(at: string, animations: Json, errors: string[]) {
  const walkAttack = clipSeconds(animations.walk_attack);
  const attack = clipSeconds(animations.attack);
  if (
    walkAttack === undefined ||
    attack === undefined ||
    Math.abs(walkAttack - attack) > 1e-9
  )
    errors.push(
      `${at}: walk_attack must last as long as attack (frame count / fps)`,
    );
}

/** A sheet's scale while validating it: a bad one is reported once, and read here as 1. */
const screenScale = (sheet: Json): number =>
  isPositiveInt(sheet.scale) ? sheet.scale : 1;

/**
 * A crown is a whole number of screen px, above the anchor and no higher than the frame's top
 * (both taken in screen px, so a 2x sheet's frame counts at half its px).
 */
function checkCrown(at: string, sheet: Json, errors: string[]) {
  const { crown, anchor, frameHeight } = sheet;
  const anchorPx =
    isObject(anchor) && isFraction(anchor.y) && isPositiveInt(frameHeight)
      ? Math.round((anchor.y * frameHeight) / screenScale(sheet))
      : Infinity;
  if (!isPositiveInt(crown) || crown > anchorPx)
    errors.push(
      `${at}: crown must be a whole number of px between the anchor and the frame's top`,
    );
}

function checkAnimation(
  at: string,
  anim: unknown,
  sheet: Json,
  sheetAtlas: unknown,
  atlases: Json,
  errors: string[],
) {
  if (!isObject(anim)) return void errors.push(`${at}: not an object`);
  // an animation spilled onto another page of an oversized sheet names that page
  let atlas = sheetAtlas;
  let atlasKey = sheet.atlas;
  if (anim.atlas !== undefined) {
    atlasKey = anim.atlas;
    atlas = typeof anim.atlas === "string" ? atlases[anim.atlas] : undefined;
    if (!isObject(atlas))
      errors.push(`${at}: atlas must name an atlas in the manifest`);
  }
  if (!isFinite(anim.fps) || anim.fps < 0)
    errors.push(`${at}: fps must be a number >= 0`);
  if (typeof anim.loop !== "boolean")
    errors.push(`${at}: loop must be a boolean`);

  const frames = anim.frames;
  if (!Array.isArray(frames) || !frames.every(Array.isArray))
    return void errors.push(`${at}: frames must be a list per direction`);
  if (
    (sheet.directions === 1 || sheet.directions === 8) &&
    frames.length !== sheet.directions
  )
    errors.push(
      `${at}: has ${frames.length} frame lists for ${sheet.directions} directions`,
    );

  const count = frames[0]?.length ?? 0;
  if (count === 0 || frames.some((d: unknown[]) => d.length !== count))
    errors.push(
      `${at}: frame count must be at least 1 and equal in every direction`,
    );

  const trimmed = sheet.trimmed === true;
  frames.forEach((dir: unknown[], d: number) =>
    dir.forEach((frame, i) => {
      if (
        !isObject(frame) ||
        !isNonNegativeInt(frame.x) ||
        !isNonNegativeInt(frame.y)
      )
        return void errors.push(
          `${at}: frame ${d}/${i} needs integer x, y >= 0`,
        );
      if (trimmed !== (frame.trim !== undefined))
        return void errors.push(
          trimmed
            ? `${at}: frame ${d}/${i} of a trimmed sheet needs its trim`
            : `${at}: frame ${d}/${i} has a trim, but the sheet is not trimmed`,
        );
      // what the atlas holds at (x, y): the cut of a trimmed frame, else the whole frame
      const size = trimmed
        ? checkTrim(`${at}: frame ${d}/${i} trim`, frame.trim, sheet, errors)
        : { w: sheet.frameWidth, h: sheet.frameHeight };
      if (
        size &&
        isObject(atlas) &&
        isPositiveInt(size.w) &&
        isPositiveInt(size.h) &&
        isPositiveInt(atlas.width) &&
        isPositiveInt(atlas.height) &&
        (frame.x + size.w > atlas.width || frame.y + size.h > atlas.height)
      )
        errors.push(
          `${at}: frame ${d}/${i} lies outside atlas ${String(atlasKey)}`,
        );
    }),
  );
}

/**
 * A trimmed frame's cut: whole px, a non-empty rect inside the frame, on whole screen px
 * (multiples of the sheet's scale). Returns its size when it is sound, so the caller can check
 * the cut against the atlas.
 */
function checkTrim(
  at: string,
  trim: unknown,
  sheet: Json,
  errors: string[],
): { w: number; h: number } | undefined {
  if (
    !isObject(trim) ||
    !isNonNegativeInt(trim.x) ||
    !isNonNegativeInt(trim.y) ||
    !isPositiveInt(trim.w) ||
    !isPositiveInt(trim.h)
  )
    return void errors.push(`${at} needs integer x, y >= 0 and w, h > 0`);
  const { frameWidth: fw, frameHeight: fh } = sheet;
  if (
    isPositiveInt(fw) &&
    isPositiveInt(fh) &&
    (trim.x + trim.w > fw || trim.y + trim.h > fh)
  )
    return void errors.push(`${at} must lie inside the frame`);
  const scale = screenScale(sheet);
  if ([trim.x, trim.y, trim.w, trim.h].some((v) => v % scale !== 0))
    return void errors.push(
      `${at} must be on whole screen px (multiples of scale)`,
    );
  return { w: trim.w, h: trim.h };
}

function checkLight(at: string, light: unknown, errors: string[]) {
  if (!isObject(light)) return void errors.push(`${at}: not an object`);
  const offset = light.offset;
  if (!isObject(offset) || !isFinite(offset.x) || !isFinite(offset.y))
    errors.push(`${at}: offset must be {x, y} numbers`);
  if (!isFinite(light.radius) || light.radius <= 0)
    errors.push(`${at}: radius must be > 0`);
  if (typeof light.color !== "string" || !Object.hasOwn(BARROW, light.color))
    errors.push(`${at}: color must name a BARROW token`);
  if (!isFraction(light.flicker))
    errors.push(`${at}: flicker must be within 0..1`);
}
