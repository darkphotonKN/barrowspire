// The dark-room floor (FS-1J1CB §B R10, the guideline's "dark-room floor"): no spec look's back
// reads darker than the darkest of today's four class backs. A sheet's back is its `n` idle
// frame(s); it is measured as the mean WCAG relative luminance of their opaque pixels (alpha 255,
// so a frame's anti-aliased rim and clear corners carry none), read from the baked atlases. The
// four class sheets set the floor by the same measure, so the floor is one Kranti already approved.

/** The four classes' sheet stems (cast.js CLASS_ROWS): each class's back is a candidate floor. */
export const CLASS_STEMS = ["knight", "archer", "wizard", "mercenary"];

const LOOK = new RegExp(`^char_(${CLASS_STEMS.join("|")})_(?!base$)[a-z]+(?:_[a-z]+)*$`);

/** A spec look's sheet (`char_<base>_<spec>`, R15), never a class's own `_base` or a creature's. */
export const isLookSheet = (name) => LOOK.test(name);

const linear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour, 0..1 (as src/render/lighting/lighting.ts). */
export const relativeLuminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/**
 * The mean relative luminance of the opaque pixels of sheet `name`'s `n` idle frames.
 *
 * @param {object} manifest the baked manifest (public/art/manifest.json)
 * @param {string} name a sheet in it
 * @param {(key: string) => { width: number, height: number, rgba: Uint8Array }} atlas an atlas page's pixels by key
 */
export function backLuminance(manifest, name, atlas) {
  const s = manifest.sheets[name];
  if (!s) throw new Error(`darkRoom: no sheet ${name} in the manifest`);
  const idle = s.animations.idle;
  if (!idle) throw new Error(`darkRoom: ${name} has no idle`);
  const n = manifest.facings.indexOf("n");
  const page = atlas(idle.atlas ?? s.atlas);
  let sum = 0;
  let count = 0;
  for (const f of idle.frames[n]) {
    const w = f.trim ? f.trim.w : s.frameWidth;
    const h = f.trim ? f.trim.h : s.frameHeight;
    for (let y = f.y; y < f.y + h; y++)
      for (let x = f.x; x < f.x + w; x++) {
        const o = (y * page.width + x) * 4;
        if (page.rgba[o + 3] !== 255) continue;
        sum += relativeLuminance(page.rgba[o], page.rgba[o + 1], page.rgba[o + 2]);
        count++;
      }
  }
  if (!count) throw new Error(`darkRoom: ${name}'s n idle frame has no opaque pixel`);
  return sum / count;
}

/**
 * Judges every spec look in `manifest` against the floor: the darkest of the four class backs.
 * Vacuous (no looks, no failures) until a look is baked.
 *
 * @returns {{ floor: number, darkest: string, looks: { sheet: string, luminance: number }[], failures: { sheet: string, luminance: number }[] }}
 */
export function darkRoom(manifest, atlas) {
  const bases = CLASS_STEMS.map((c) => `char_${c}_base`);
  const missing = bases.filter((b) => !manifest.sheets[b]);
  if (missing.length) throw new Error(`darkRoom: the floor needs all four class backs; missing ${missing.join(", ")}`);
  const [darkest, floor] = bases.map((b) => [b, backLuminance(manifest, b, atlas)]).sort((a, b) => a[1] - b[1])[0];
  const looks = Object.keys(manifest.sheets)
    .filter(isLookSheet)
    .sort()
    .map((sheet) => ({ sheet, luminance: backLuminance(manifest, sheet, atlas) }));
  return { floor, darkest, looks, failures: looks.filter((l) => l.luminance < floor) };
}

/**
 * The darkest floor the world is drawn on: the baked ground whose measured mean (the manifest's
 * `mean`, lib/mean.mjs) has the lowest luminance. The dark-room strip lays the looks' backs on it.
 *
 * @returns {{ name: string, rgb: number[] }}
 */
export function darkestGround(manifest) {
  const grounds = Object.entries(manifest.sheets).filter(([, s]) => s.mean);
  if (!grounds.length) throw new Error("darkRoom: no baked ground carries a mean");
  const [name, { mean }] = grounds.sort(([, a], [, b]) => relativeLuminance(a.mean.r, a.mean.g, a.mean.b) - relativeLuminance(b.mean.r, b.mean.g, b.mean.b))[0];
  return { name, rgb: [mean.r, mean.g, mean.b] };
}
