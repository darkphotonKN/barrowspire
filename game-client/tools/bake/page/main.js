// Page entry. The Node driver (tools/bake/bake.mjs) calls:
//   window.bakeInit()      → { renderer, sheets: [{ name, group }] }
//   window.bakeSheet(name) → one sheet's frames (base64 straight RGBA) and metadata
// Frames cross back to Node as raw pixels; packing and PNG encoding happen there, where they are
// deterministic and independent of the browser's encoder.

import { createBaker } from "./baker.js";
import { CATALOGUE, ICON_SIZE } from "./catalogue.js";
import { TILE_H, TILE_W } from "./projection.js";
import { FACINGS, yawFor } from "./facing.js";
import { cssRgb } from "./palette.js";
import { ANIMATIONS, applyPose, clipsFor, groundPose, simulateSprings } from "./characters/clips.js";

let baker = null;

function toBase64(bytes) {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

window.bakeInit = () => {
  baker = createBaker();
  return {
    renderer: baker.info(),
    tile: { width: TILE_W, height: TILE_H },
    facings: FACINGS,
    sheets: CATALOGUE.map((s) => ({ name: s.name, group: s.group })),
  };
};

window.bakeSheet = (name) => {
  const sheet = CATALOGUE.find((s) => s.name === name);
  if (!sheet) throw new Error(`bake: no sheet "${name}"`);
  if (sheet.kind === "character") return bakeCharacterSheet(sheet);

  // Flatten animation → direction → frame builders, bake, then fold the pixels back.
  const order = [];
  for (const [anim, a] of Object.entries(sheet.animations))
    a.frames.forEach((build, i) => order.push({ anim, i, build }));

  let pixels;
  let frameWidth;
  let frameHeight;
  let anchor;
  let light;
  if (sheet.kind === "tile") {
    pixels = order.map((f) => f.build());
    frameWidth = TILE_W;
    frameHeight = TILE_H;
    anchor = { x: 0.5, y: 0.5 };
  } else if (sheet.kind === "texture") {
    // drawn per pixel in code at a fixed size and anchor (models/fx.js, models/cursors.js)
    frameWidth = sheet.width;
    frameHeight = sheet.height;
    anchor = sheet.anchor;
    pixels = order.map((f) => {
      const px = f.build();
      if (px.length !== frameWidth * frameHeight * 4)
        throw new Error(`bake: ${name} frame is not ${frameWidth}×${frameHeight}`);
      return px;
    });
  } else if (sheet.kind === "icon") {
    pixels = order.map((f) => baker.bakeIcon(f.build, ICON_SIZE));
    frameWidth = ICON_SIZE;
    frameHeight = ICON_SIZE;
    anchor = { x: 0.5, y: 0.5 };
  } else {
    const out = baker.bakeProps(
      order.map((f) => f.build),
      { shadow: sheet.shadow !== false, pad: sheet.pad ?? 0.12 },
    );
    pixels = out.frames;
    frameWidth = out.frameWidth;
    frameHeight = out.frameHeight;
    anchor = { x: out.anchorPx[0] / frameWidth, y: out.anchorPx[1] / frameHeight };
    if (sheet.light) {
      const { at, ...rest } = sheet.light;
      light = { offset: baker.screenOffset(at), ...rest };
    }
  }

  const animations = {};
  order.forEach((f, k) => {
    const a = (animations[f.anim] ??= {
      fps: sheet.animations[f.anim].fps,
      loop: sheet.animations[f.anim].loop,
      frames: [[]],
    });
    a.frames[0][f.i] = toBase64(pixels[k]);
  });

  return {
    name,
    group: sheet.group,
    frameWidth,
    frameHeight,
    anchor,
    directions: 1,
    animations,
    ...(light ? { light } : {}),
    source: sheet.source,
    licence: sheet.licence,
  };
};

/**
 * A character or creature (FS-2325V §E): built once on the shared rig, posed through every key
 * frame of every clip (secondary motion simulated per clip), and baked from all 8 facings.
 * Frame lists come back in FACINGS order, which the manifest records.
 */
function bakeCharacterSheet(sheet) {
  const { rig, style, variants = [{ name: null, dress: () => {} }] } = sheet.build();
  const specs = sheet.animations ?? ANIMATIONS;
  const clips = clipsFor(style, specs);
  const poses = [];
  const animations = {};
  const springs = {};
  for (const [anim, spec] of Object.entries(specs)) {
    const frames = clips[anim];
    if (frames.length !== spec.frames) throw new Error(`bake: ${sheet.name} ${anim} has ${frames.length} frames, not ${spec.frames}`);
    springs[anim] = simulateSprings(rig, frames, {
      ...spec,
      speed: anim === "walk" ? (style.speed ?? 1) : 0,
      settle: anim === "death",
      calm: anim === "attack" ? 0.25 : 1,
    });
  }
  // A palette variant (a hub resident's) re-dresses the same rig and poses: its clips follow the
  // first palette's as `<anim>_<palette>` (src/render/art/hubFolk.ts reads them so).
  variants.forEach((variant, v) => {
    for (const [anim, spec] of Object.entries(specs)) {
      const frames = clips[anim];
      const name = v === 0 ? anim : `${anim}_${variant.name}`;
      animations[name] = { fps: spec.fps, loop: spec.loop, frames: FACINGS.map(() => []) };
      frames.forEach((p, i) =>
        poses.push({
          anim: name,
          i,
          apply: () => {
            variant.dress();
            applyPose(rig, p, springs[anim][i]);
            groundPose(rig);
            for (const hook of rig.hooks ?? []) hook(rig, p);
          },
        }),
      );
    }
  });
  const out = baker.bakeCharacter(
    rig.root,
    poses.map((p) => p.apply),
    FACINGS.map(yawFor),
  );
  poses.forEach((p, k) =>
    FACINGS.forEach((_, d) => {
      animations[p.anim].frames[d][p.i] = toBase64(out.frames[k][d]);
    }),
  );
  return {
    name: sheet.name,
    group: sheet.group,
    frameWidth: out.frameWidth,
    frameHeight: out.frameHeight,
    anchor: { x: out.anchorPx[0] / out.frameWidth, y: out.anchorPx[1] / out.frameHeight },
    directions: FACINGS.length,
    animations,
    source: sheet.source,
    licence: sheet.licence,
  };
}

/**
 * Renders review labels (the contact sheet's titles and facing names) as straight RGBA, so the
 * Node side can stamp them without a font stack of its own. Review output only; never shipped.
 */
window.bakeLabels = (texts, { size = 13, color = "vellum" } = {}) =>
  texts.map((text) => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const font = `600 ${size}px sans-serif`;
    ctx.font = font;
    const w = Math.max(1, Math.ceil(ctx.measureText(text).width) + 2);
    const h = Math.ceil(size * 1.4);
    c.width = w;
    c.height = h;
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = cssRgb(color);
    ctx.fillText(text, 1, h / 2);
    return { text, w, h, rgba: toBase64(new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer)) };
  });

window.bakeReady = true;
