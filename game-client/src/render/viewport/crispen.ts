/**
 * Existing text kept crisp (FS-ZAJMH R5). Text is rasterised at the render scale of the moment it
 * is made (`installCrispText`); after the render scale changes, the game's re-fit (`fitGame`) and
 * a re-layout that moves existing text rasterise it again through here. No Phaser import: it reads
 * only what a Text and a Container carry.
 */

import { viewport } from "./viewport";

/** What of a display object crispen reads: a Text's resolution, or a Container's children. */
interface Crispable {
  style?: { resolution?: number };
  setResolution?(resolution: number): unknown;
  list?: unknown;
}

/**
 * Rasterises each text in `objects` (a container's, however deep, included) at `scale`, the
 * render scale of now by default, if it is not at it already (FS-ZAJMH R5): a HUD re-layout that
 * moves existing text calls this, and so does the game's re-fit when the render scale changes
 * (`fitGame`), so text keeps crisp after the resize. Anything else, and nothing at all, is passed
 * over.
 */
export function crispen(
  objects: readonly (object | null | undefined)[],
  scale: number = viewport.renderScale,
): void {
  const visit = (obj: object | null | undefined) => {
    if (!obj) return;
    const o = obj as Crispable;
    if (typeof o.setResolution === "function") {
      if (o.style?.resolution !== scale) o.setResolution(scale);
    } else if (Array.isArray(o.list)) {
      for (const child of o.list) visit(child as object);
    }
  };
  for (const obj of objects) visit(obj);
}
