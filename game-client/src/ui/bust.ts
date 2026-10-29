/**
 * Where to cut a portrait bust out of a standing figure's frame. Pure, so it is tested without a
 * canvas; the dialogue card reads the bounds from the pixels and draws the crop.
 */

/** The opaque extent of a frame, in frame pixels. `right` and `bottom` are exclusive. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BustCrop {
  x: number;
  y: number;
  size: number;
}

/** How much of the figure's height the bust takes: head and shoulders. */
const BUST_SHARE = 0.62;

/** The side of the bust square: head and shoulders, a share of the figure's height. */
export function bustSize(bounds: Bounds): number {
  return Math.max(1, Math.round((bounds.bottom - bounds.top) * BUST_SHARE));
}

/**
 * Head and shoulders out of a standing figure: a square from the top of its opaque bounds,
 * centred on `centreX`, the middle of the figure's mass across those rows. Mass rather than the
 * bounds, so a thin staff or a held lantern barely moves it. Kept inside the frame.
 */
export function bustCrop(bounds: Bounds, centreX: number, frameWidth: number): BustCrop {
  const size = bustSize(bounds);
  const x = Math.round(centreX - size / 2);
  return {
    x: Math.max(0, Math.min(x, frameWidth - size)),
    y: bounds.top,
    size,
  };
}
