/**
 * How a scene's art load is paced on screen (FS-C4JWH Amendment A1): no bar over a load that ends
 * quickly, and a bar that, once it shows, stays long enough to be read, so neither flashes past.
 *
 *   0 ──── showDelay ──┬─ bar fades in ─── minVisible (and as long as the load runs) ──┬─ bar fades out ─┬─ create, world fades in
 *                      │                                                                │                 │
 *   load done before showDelay → no bar: create at once, the world fades in            ⋯                ⋯
 *
 * The common loading-indicator pattern (a show delay plus a minimum display time): Firefox Acorn
 * "Loading indicators", Learning Equality "Loaders" (300 ms delay, 400 ms minimum). Pure, on an
 * injected clock and curtain, so it is tested on fake timers; `preloadArt` (`phaser.ts`) runs it on
 * the scene's clock and its main camera's fade.
 */

import type { SceneEnd } from "@/scenes/sceneEnd";

/** Every duration of the pacing, in ms, in one place (FS-C4JWH A1.7). */
export const LOAD_PACE = {
  /** A load still running this long after it was queued shows the bar (A1.1). */
  showDelay: 300,
  /** A bar shown stays at least this long, counted from the start of its fade-in (A1.2). */
  minVisible: 600,
  /** The bar fades in, and out, over this (A1.2). */
  barFade: 150,
  /** The scene fades in from black over this as its create runs (A1.4). */
  worldFade: 200,
} as const;

/** The scene's clock: runs `step` once after `ms`, and returns its cancel. */
export interface PaceClock {
  after(ms: number, step: () => void): () => void;
}

/** A fade over the whole scene, from and to black (the main camera's own, A1.5). */
export interface Curtain {
  /** From black to the scene, over `ms`. */
  fadeIn(ms: number): void;
  /** From the scene to black, over `ms`; black it stays until the next fade-in. */
  fadeOut(ms: number): void;
}

/** The bar a scene shows while its art loads (`LoadingBar`, the torch bar in the game). */
export interface PacedBar {
  progress(value: number): void;
  destroy(): void;
}

export interface PacedLoad {
  /** The load's progress, 0 to 1: the bar shows it once it is up, starting from the latest. */
  progress(value: number): void;
  /** The load has completed (and its eviction run): the scene is entered now, or once the bar is down. */
  loaded(): void;
  /**
   * The scene ended: nothing more happens and nothing is entered. On "shutdown" every pending step
   * is cancelled on the clock; on "destroy" the clock, a dead plugin, is asked nothing (`SceneEnd`).
   */
  end(end: SceneEnd): void;
}

export function paceLoad(opts: {
  clock: PaceClock;
  curtain: Curtain;
  /** Draws the bar: called at most once, when the show delay passes with the load still running. */
  bar: () => PacedBar;
  /** Runs the scene's create: called once, at the end. */
  enter: () => void;
  /** Whether the scene fades in when no bar showed: a world scene does, a menu does not (A1.4). */
  fadeIn: boolean;
}): PacedLoad {
  const { clock, curtain } = opts;
  const pending = new Set<() => void>();
  let over = false;
  let latest = 0;
  let bar: PacedBar | undefined;
  let shownLongEnough = false;
  let loaded = false;

  const after = (ms: number, step: () => void) => {
    const cancel = clock.after(ms, () => {
      pending.delete(cancel);
      if (!over) step();
    });
    pending.add(cancel);
  };
  const enter = () => {
    over = true;
    opts.enter();
  };
  const fadeBarOut = () => {
    curtain.fadeOut(LOAD_PACE.barFade);
    after(LOAD_PACE.barFade, () => {
      bar?.destroy();
      curtain.fadeIn(LOAD_PACE.worldFade);
      enter();
    });
  };

  after(LOAD_PACE.showDelay, () => {
    if (loaded) return;
    bar = opts.bar();
    bar.progress(latest);
    curtain.fadeIn(LOAD_PACE.barFade);
    after(LOAD_PACE.minVisible, () => {
      shownLongEnough = true;
      if (loaded) fadeBarOut();
    });
  });

  return {
    progress(value) {
      latest = value;
      bar?.progress(value);
    },
    loaded() {
      if (over || loaded) return;
      loaded = true;
      if (!bar) {
        for (const cancel of pending) cancel();
        pending.clear();
        if (opts.fadeIn) curtain.fadeIn(LOAD_PACE.worldFade);
        enter();
      } else if (shownLongEnough) fadeBarOut();
    },
    end(end) {
      over = true;
      if (end === "shutdown") for (const cancel of pending) cancel();
      pending.clear();
    },
  };
}
