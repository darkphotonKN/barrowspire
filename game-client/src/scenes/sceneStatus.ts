/**
 * A scene's status, as Phaser 4.2.1 numbers it (`scene/const.js`, read as `scene.sys.settings.status`),
 * for the modules that drive or read the game's scene manager without importing Phaser. Pinned to
 * Phaser's own values by its test.
 *
 * A scene the game booted and never started sits at INIT; `start` takes it through START, LOADING
 * (its preload) and CREATING to RUNNING. Phaser's `isActive` and `getScenes(true)` count RUNNING
 * only.
 */

export const PENDING = 0;
export const INIT = 1;
export const START = 2;
export const LOADING = 3;
export const CREATING = 4;
export const RUNNING = 5;
export const PAUSED = 6;
export const SLEEPING = 7;
export const SHUTDOWN = 8;
export const DESTROYED = 9;

/**
 * Started and not stopped: START through SLEEPING, so paused and asleep included. Such a scene's
 * display list holds what it made; a stop empties it (`DisplayList.shutdown` destroys every child),
 * and a scene never started has made nothing.
 */
export function standing(status: number): boolean {
  return status >= START && status <= SLEEPING;
}
