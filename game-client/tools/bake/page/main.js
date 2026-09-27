// Page entry. The Node driver (tools/bake/bake.mjs) calls:
//   window.bakeInit()      → { renderer, sheets: [{ name, group }] }
//   window.bakeSheet(name) → one sheet's frames (base64 straight RGBA) and metadata
// Frames cross back to Node as raw pixels; packing and PNG encoding happen there, where they are
// deterministic and independent of the browser's encoder.

import { createBaker } from "./baker.js";
import { CATALOGUE, ICON_SIZE } from "./catalogue.js";
import { TILE_H, TILE_W } from "./projection.js";

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
    sheets: CATALOGUE.map((s) => ({ name: s.name, group: s.group })),
  };
};

window.bakeSheet = (name) => {
  const sheet = CATALOGUE.find((s) => s.name === name);
  if (!sheet) throw new Error(`bake: no sheet "${name}"`);

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

window.bakeReady = true;
