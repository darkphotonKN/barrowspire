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
 *   sheet has the sheet's `frameWidth` x `frameHeight`, whatever animation it belongs to.
 * - A state (door locked/open) or a variant (grass a/b/c) is an animation of one frame per
 *   variant at 0 fps; a moving animation (walk) has several frames at its fps.
 * - Directions, when 8, run clockwise on screen from east: E, SE, S, SW, W, NW, N, NE.
 * - A light's `offset` is in screen px from the anchor, `radius` in screen px, and `color` names
 *   a `BARROW` token (ADR-0013); no colour value is ever written into the manifest.
 */

import { BARROW } from "@/utils/theme";

export const MANIFEST_VERSION = 1;
export const MAX_ATLAS_SIZE = 4096;

export type BarrowToken = keyof typeof BARROW;

export interface ArtFramePosition {
  x: number;
  y: number;
}

export interface ArtAnimation {
  fps: number;
  loop: boolean;
  /** `frames[direction][index]`: the frame's top-left in the sheet's atlas. */
  frames: ArtFramePosition[][];
}

export interface ArtLight {
  offset: { x: number; y: number };
  radius: number;
  color: BarrowToken;
  /** 0 is a steady light; 1 is the most a flame gutters. */
  flicker: number;
}

export interface ArtSheet {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  directions: 1 | 8;
  animations: Record<string, ArtAnimation>;
  light?: ArtLight;
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
      checkAnimation(`${at} animation ${anim}`, value, sheet, atlas, errors);

  if (sheet.light !== undefined) checkLight(`${at} light`, sheet.light, errors);

  if (!isText(sheet.source)) errors.push(`${at}: source must be recorded`);
  if (!isText(sheet.licence)) errors.push(`${at}: licence must be recorded`);
}

function checkAnimation(
  at: string,
  anim: unknown,
  sheet: Json,
  atlas: unknown,
  errors: string[],
) {
  if (!isObject(anim)) return void errors.push(`${at}: not an object`);
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

  const fw = sheet.frameWidth;
  const fh = sheet.frameHeight;
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
      if (
        isObject(atlas) &&
        isPositiveInt(fw) &&
        isPositiveInt(fh) &&
        isPositiveInt(atlas.width) &&
        isPositiveInt(atlas.height) &&
        (frame.x + fw > atlas.width || frame.y + fh > atlas.height)
      )
        errors.push(
          `${at}: frame ${d}/${i} lies outside atlas ${String(sheet.atlas)}`,
        );
    }),
  );
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
