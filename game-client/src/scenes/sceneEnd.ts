/**
 * How a scene ends, as its teardown must know it. The values are Phaser's own event names
 * (`Phaser.Scenes.Events.SHUTDOWN` is `"shutdown"`, `DESTROY` is `"destroy"`).
 *
 * - `"shutdown"`: the scene stops (a switch to another world, a restart). Its plugins have shut
 *   down and live on, and Phaser starts this same instance again on the next visit: the teardown
 *   resets what the visit left on them (the default cursor, the keyboard's lock, the captures its
 *   keys made).
 * - `"destroy"`: the game is destroyed (the page unmounts: leaving /game). Phaser 4.2.1 emits the
 *   scene's DESTROY only, never SHUTDOWN (`Systems.destroy`), and each scene plugin subscribed to
 *   DESTROY at boot, so input, keyboard, cameras, tweens, the clock and the game-object factory have
 *   destroyed themselves before the teardown runs; InputPlugin's and KeyboardPlugin's `manager` is
 *   null. The instance never starts again. The teardown lets go of what outlives the game (socket
 *   listeners, store subscriptions) and asks the plugins nothing: a throw here stops the rest of
 *   `Game.runDestroy`, and the renderer, the loop, the later scenes and the input manager's window
 *   listeners stay.
 */
export type SceneEnd = "shutdown" | "destroy";

const SCENE_ENDS: readonly SceneEnd[] = ["shutdown", "destroy"];

/** What of a scene the end is heard on. A `Phaser.Scene` is one. */
export interface EndingScene {
  events: {
    once(event: SceneEnd, fn: () => void): unknown;
    off(event: SceneEnd, fn: () => void): unknown;
  };
}

/**
 * Runs `release` once, at whichever end comes first, saying which. Called once per start (create
 * or init), as the scene's other listeners are. Returns the cancel: neither end runs it after.
 */
export function onSceneEnd(
  scene: EndingScene,
  release: (end: SceneEnd) => void,
): () => void {
  const heard = SCENE_ENDS.map((end) => ({
    end,
    fn: () => (cancel(), release(end)),
  }));
  const cancel = () => {
    for (const { end, fn } of heard) scene.events.off(end, fn);
  };
  for (const { end, fn } of heard) scene.events.once(end, fn);
  return cancel;
}

/** A keyboard plugin, as far as handing back captures goes. Phaser's KeyboardPlugin is one. */
export interface CapturingKeyboard {
  removeCapture(keyCodes: number[]): unknown;
}

/**
 * On a stop, hands back the captures `keys` made. Phaser's stop destroys a scene's keys
 * (KeyboardPlugin.shutdown → `removeAllKeys(true)`, without removing captures) before the scene's
 * own SHUTDOWN handler, but the captures are the game's KeyboardManager's and stay: each code would
 * have its default prevented on the whole page until the game dies (the run's Tab stopped focus
 * moving in the hub and its DOM overlays). `addKey` and `createCursorKeys` capture by default, and
 * the next world's create captures its own again, after this stop.
 */
export function releaseCaptures(
  keyboard: CapturingKeyboard | null | undefined,
  keys: readonly ({ keyCode: number } | undefined)[],
): void {
  const codes = keys.flatMap((key) => (key ? [key.keyCode] : []));
  if (codes.length > 0) keyboard?.removeCapture(codes);
}
