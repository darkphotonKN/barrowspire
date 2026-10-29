// A translucent creature's alpha (FS-3QHQZ §C R29, the ghost): the bake renders each frame twice,
// once lit as usual and once as an opacity pass, where every part is drawn unlit in a grey that
// is its opacity (the body about 0.6, its legs fading to nothing, the eyes 1). The lit frame's
// alpha is scaled by that grey, pixel by pixel. Only the nearest surface counts, as on any
// sprite, so a translucent figure reads as one see-through shape rather than a tangle of parts.
//
// Pure and integer-exact, so the bake stays deterministic.

/**
 * @param {Uint8ClampedArray} full the lit frame, straight RGBA
 * @param {Uint8ClampedArray} pass the opacity pass, straight RGBA, same size: red is opacity
 * @param {{ floor?: number }} o `floor`: the opacity of pixels no part covers (the ground shadow)
 * @returns {Uint8ClampedArray} the lit frame with its alpha scaled
 */
export function applyOpacity(full, pass, { floor = 1 } = {}) {
  if (full.length !== pass.length) throw new Error(`opacity: pass is ${pass.length} bytes, frame ${full.length}`);
  const out = new Uint8ClampedArray(full);
  const bare = Math.round(floor * 255);
  for (let i = 3; i < out.length; i += 4) {
    if (out[i] === 0) continue;
    const cover = pass[i];
    // at a part's anti-aliased edge, blend from the floor toward the part's own opacity
    const op = cover === 0 ? bare : Math.round((bare * (255 - cover) + pass[i - 3] * cover) / 255);
    out[i] = Math.round((out[i] * op) / 255);
  }
  return out;
}
