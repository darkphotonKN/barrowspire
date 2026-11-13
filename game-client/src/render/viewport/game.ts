/**
 * The game side of the render scale: the backing store follows the viewport, and a change of
 * the game frame's size or of `devicePixelRatio` (the window moved to another monitor) re-fits
 * it (FS-ZAJMH R10).
 */

import { fitCamera, type ViewCamera } from "./camera";
import { crispen } from "./crispen";
import {
  backingSize,
  fitView,
  viewport as theViewport,
  type Viewport,
} from "./viewport";

/** What of a Phaser game the viewport drives. A `Phaser.Game` is one. */
export interface ViewGame {
  scale: {
    resize(width: number, height: number): unknown;
    setZoom(zoom: number): unknown;
  };
  scene: {
    getScenes(isActive: boolean): {
      cameras?: { main?: ViewCamera };
      /** The scene's display list: its top-level objects, containers among them. */
      children?: { list: readonly object[] };
    }[];
  };
}

/**
 * Keeps `game` drawn at the viewport's render scale: on each change the backing store is resized,
 * shown at the view's CSS size (zoom cssScale/rs), and every started scene's camera re-fitted.
 * When the render scale itself changed (fullscreen, another monitor), the text of every running
 * scene is rasterised again at it (R5, US9): text that no re-layout moves would otherwise stay at
 * the old scale and read soft. Returns the unbinding.
 */
export function fitGame(
  game: ViewGame,
  viewport: Viewport = theViewport,
): () => void {
  let renderScale = viewport.renderScale;
  return viewport.onChange((view) => {
    const { width, height } = backingSize(view);
    game.scale.resize(width, height);
    // after the resize: in Phaser's NONE scale mode only setZoom rewrites the canvas's CSS size
    game.scale.setZoom(view.cssScale / view.renderScale);
    for (const scene of game.scene.getScenes(false)) {
      const cam = scene.cameras?.main;
      if (cam) fitCamera(cam, view);
    }
    if (view.renderScale === renderScale) return;
    renderScale = view.renderScale;
    // a stopped scene's display list is emptied; only a running one holds text to redo
    for (const scene of game.scene.getScenes(true))
      crispen(scene.children?.list ?? [], renderScale);
  });
}

/** What of a window the density watch reads. */
export interface DensityWindow {
  readonly devicePixelRatio: number;
  matchMedia(query: string): {
    addEventListener(type: "change", listener: () => void): void;
    removeEventListener(type: "change", listener: () => void): void;
  };
}

/**
 * Calls `changed` with the new ratio each time the window's `devicePixelRatio` changes. A media
 * query matches one ratio only, so it is re-armed for the new one after each change. Returns the
 * stop.
 */
export function watchDensity(
  win: DensityWindow,
  changed: (dpr: number) => void,
): () => void {
  let query: ReturnType<DensityWindow["matchMedia"]> | undefined;
  const arm = () => {
    query?.removeEventListener("change", onChange);
    query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    query.addEventListener("change", onChange);
  };
  function onChange() {
    arm();
    changed(win.devicePixelRatio);
  }
  arm();
  return () => query?.removeEventListener("change", onChange);
}

/**
 * How long a resize must settle before the view is re-fitted: a drag-resize then rebuilds the
 * backing store and the screen-sized textures once, not every frame (FS-ZAJMH R10).
 */
export const REFIT_DEBOUNCE_MS = 100;

/** What of the game frame the fit reads. An `HTMLElement` is one. */
export interface FrameElement {
  readonly clientWidth: number;
  readonly clientHeight: number;
}

/** What of a `ResizeObserver` the frame watch uses. */
export type FrameObserver = new (notify: () => void) => {
  observe(target: FrameElement): void;
  disconnect(): void;
};

/**
 * Calls `changed` with the frame's CSS size once it has stopped changing for
 * {@link REFIT_DEBOUNCE_MS}: a window resize, the header's banner coming or going, entering or
 * leaving fullscreen. Returns the stop, which drops a pending call too.
 */
export function watchFrame(
  frame: FrameElement,
  changed: (size: { width: number; height: number }) => void,
  Observer: FrameObserver = ResizeObserver as unknown as FrameObserver,
): () => void {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new Observer(() => {
    clearTimeout(pending);
    pending = setTimeout(
      () => changed({ width: frame.clientWidth, height: frame.clientHeight }),
      REFIT_DEBOUNCE_MS,
    );
  });
  observer.observe(frame);
  return () => {
    clearTimeout(pending);
    observer.disconnect();
  };
}

/** What of a Phaser game the mount drives besides its fit. A `Phaser.Game` is one. */
export interface MountedGame extends ViewGame {
  readonly isBooted: boolean;
  /** Phaser's DOM layer over the canvas (the chat input's real field); none until booted. */
  readonly domContainer?: { style: { left: string; top: string } } | null;
  scale: ViewGame["scale"] & { updateBounds(): unknown };
  events: { once(event: "boot", fn: () => void): unknown };
}

/** What of the game frame the mount reads and writes. An `HTMLElement` is one. */
export interface MountFrame extends FrameElement {
  readonly style: { setProperty(name: string, value: string): unknown };
}

/** What the mount listens to; the page's own by default. */
export interface MountDeps {
  win?: DensityWindow;
  viewport?: Viewport;
  Observer?: FrameObserver;
}

/**
 * Keeps `game` fitted to `frame` for as long as it is mounted (FS-ZAJMH R9–R11, R16): Phaser's DOM
 * layer pinned to the canvas's corner (Phaser copies only the canvas's margins); the view re-fitted
 * to the frame's size and the screen's density on a settled resize (the window, the banner,
 * fullscreen) and on a density change (another monitor), Phaser then re-reading where the canvas
 * is for the pointer, since it can move inside the frame without changing size; and the canvas's
 * CSS px per logical unit published on the frame as `--game-scale`, for DOM laid over the canvas
 * in logical units (none now: the fullscreen button is gone, FS-T3DWX R1). The viewport is expected to hold the frame's first fit
 * already: the game was made at its size. Returns the unmount.
 */
export function mountViewport(
  game: MountedGame,
  frame: MountFrame,
  deps: MountDeps = {},
): () => void {
  const win = deps.win ?? window;
  const vp = deps.viewport ?? theViewport;

  const pinDomLayer = () => {
    if (!game.domContainer) return;
    game.domContainer.style.left = "0";
    game.domContainer.style.top = "0";
  };
  if (game.isBooted) pinDomLayer();
  else game.events.once("boot", pinDomLayer);

  const refit = () => {
    vp.set(
      fitView(
        { width: frame.clientWidth, height: frame.clientHeight },
        win.devicePixelRatio,
      ),
    );
    game.scale.updateBounds();
  };
  const publishScale = () =>
    frame.style.setProperty("--game-scale", String(vp.cssScale));

  const unfit = fitGame(game, vp);
  const unwatchFrame = watchFrame(frame, refit, deps.Observer);
  const unwatchDensity = watchDensity(win, refit);
  publishScale();
  const unpublish = vp.onChange(publishScale);
  return () => {
    unpublish();
    unwatchDensity();
    unwatchFrame();
    unfit();
  };
}
