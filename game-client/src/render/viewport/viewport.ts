/**
 * The logical view and the render scale (FS-ZAJMH §A R2, §B R3).
 *
 * The **logical view** is the coordinate space cameras and the HUD work in; the **render scale**
 * is backing-store px per logical unit. Scenes and HUD read the logical size from here, never
 * from `cameras.main.width/height` (those are backing px once the canvas is drawn at density).
 *
 * Pure state, no Phaser: the camera side lives in `camera.ts`.
 */

/**
 * Backing-store px per logical unit, at most. The art is baked at 2x (FS-2325V), so above 2
 * there is no new detail, only fill-rate cost (FS-ZAJMH R3, charter default 3).
 */
export const RENDER_SCALE_CAP = 2;

/**
 * The logical view: always 720 tall; its width follows the frame's shape between 3:2 and 16:9
 * (FS-ZAJMH R7, charter default 1: the run projects to ≈1920×960, so a wider view would show the
 * whole dungeon). Beyond either end the nearest bound holds and the rest of the frame is bars (R8).
 */
export const LOGICAL_HEIGHT = 720;
export const LOGICAL_MIN_WIDTH = 1080;
export const LOGICAL_MAX_WIDTH = 1280;
/** The view the client starts at, and falls back to while the frame has no size. */
export const LOGICAL_WIDTH = LOGICAL_MIN_WIDTH;

export interface View {
  /** Logical units. */
  width: number;
  height: number;
  /** Backing px per logical unit; fractional is valid (R4). */
  renderScale: number;
  /** CSS px per logical unit: how big the canvas is shown. 1 when not given. */
  cssScale?: number;
}

interface Size {
  width: number;
  height: number;
}

const usable = (n: number) => Number.isFinite(n) && n > 0;

/**
 * The view for the game frame's CSS size and a device pixel ratio. The logical width follows the
 * frame's aspect, clamped to 1080–1280 (R7, R8); the canvas is shown as big as fits the frame,
 * up or down (R9); render scale = that CSS size × DPR ÷ logical size, capped at
 * {@link RENDER_SCALE_CAP} (R3). A frame with no size yet shows the 1080×720 view at its own
 * size; a missing or nonsense ratio draws at 1.
 */
export function fitView(frame: Size, dpr: number): View {
  const sized = usable(frame.width) && usable(frame.height);
  const width = sized
    ? Math.min(
        LOGICAL_MAX_WIDTH,
        Math.max(
          LOGICAL_MIN_WIDTH,
          Math.round((LOGICAL_HEIGHT * frame.width) / frame.height),
        ),
      )
    : LOGICAL_MIN_WIDTH;
  const cssScale = sized
    ? Math.min(frame.width / width, frame.height / LOGICAL_HEIGHT)
    : 1;
  const scale = cssScale * dpr;
  const renderScale = usable(scale) ? Math.min(scale, RENDER_SCALE_CAP) : 1;
  return { width, height: LOGICAL_HEIGHT, renderScale, cssScale };
}

/** The backing store's size in whole px: the logical view at the render scale. */
export function backingSize(view: View): Size {
  return {
    width: Math.round(view.width * view.renderScale),
    height: Math.round(view.height * view.renderScale),
  };
}

type Listener = (view: Required<View>) => void;

export class Viewport {
  private view: Required<View> = {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    renderScale: 1,
    cssScale: 1,
  };
  private readonly listeners = new Set<Listener>();

  get width(): number {
    return this.view.width;
  }

  get height(): number {
    return this.view.height;
  }

  get centerX(): number {
    return this.view.width / 2;
  }

  get centerY(): number {
    return this.view.height / 2;
  }

  get renderScale(): number {
    return this.view.renderScale;
  }

  get cssScale(): number {
    return this.view.cssScale;
  }

  current(): Required<View> {
    return { ...this.view };
  }

  /**
   * Takes a new view, telling every listener when anything in it changed. A listener that throws
   * is reported and the rest are still told: one broken widget must not stop the game re-fitting.
   */
  set(next: View): void {
    const v = this.view;
    const cssScale = next.cssScale ?? 1;
    if (
      v.width === next.width &&
      v.height === next.height &&
      v.renderScale === next.renderScale &&
      v.cssScale === cssScale
    )
      return;
    this.view = { ...next, cssScale };
    for (const listener of [...this.listeners]) {
      try {
        listener(this.current());
      } catch (err) {
        console.error("viewport: a view-change listener failed", err);
      }
    }
  }

  /** Hears every change; the returned function stops it. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * A pointer's position in logical units. Phaser's `pointer.x/y` are backing px; a HUD hit
   * test against logical rects goes through here (R15). World aim keeps `pointer.worldX/worldY`.
   */
  toLogical(pointer: { x: number; y: number }): { x: number; y: number } {
    const s = this.view.renderScale;
    return { x: pointer.x / s, y: pointer.y / s };
  }
}

/** The one viewport the client draws through. */
export const viewport = new Viewport();
