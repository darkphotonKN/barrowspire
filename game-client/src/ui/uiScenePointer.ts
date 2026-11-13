/**
 * The pointer across the scenes (FS-TQZ5J Amendment A1, R25–R27). Phaser 4.2.1 hands each DOM
 * pointer event to the scenes top down and stops at the first that hit something of its own, or just
 * left something (`InputManager.updateInputPlugins` under `globalTopOnly`, which R7 keeps on). The UI
 * scene stands over every world, so without these rules it would take what the world heard when the
 * interface was the world's: the release of the world's own press, and the moves over and off its
 * pieces. Phaser-free: the UI scene hands its own pointer events to {@link UiScenePointer}, and a world
 * runs a move it was handed through {@link hearMove}, so the rules are tested on their own and the
 * harness proves them against Phaser.
 *
 * No `stopPropagation` and no game-wide switch: only the UI scene's own cameras, and the world's own
 * pass over a move.
 */

/** Phaser's number for a mouse move (`input/const.js` MOUSE_MOVE), pinned by test. */
export const MOUSE_MOVE = 1;

/** A camera as Phaser's hit test reads it: one that takes no input hits nothing. Phaser's `Camera` is one. */
export interface InputCamera {
  inputEnabled: boolean;
}

/** A pointer as Phaser shares it between the scenes: one object, its last DOM event, the camera it was last hit-tested through. */
export interface ScenePointer {
  readonly event?: unknown;
  camera?: unknown;
}

/**
 * A world's input, as a move it was handed runs through it: Phaser's own pass over one DOM pointer
 * event (`InputPlugin.update(type, pointers)`, private in 4.2.1, pinned by test), its hit test, then
 * its drag, move, over and out events, as the input manager runs it for each scene.
 */
export interface WorldInput<P> {
  update(type: number, pointers: P[]): boolean;
}

/**
 * The world hears a move the UI scene took (R27): through its own pass, so its hovers, tips and drags
 * read it as Phaser would; over a UI piece (`onUi`) with its cameras out of the hit test, so nothing of
 * the world's is under the pointer there, as nothing was under the row when the row was the world's
 * top object. The cameras, and the pointer's last camera, are put back after.
 */
export function hearMove<P extends ScenePointer>(
  input: WorldInput<P>,
  cameras: readonly InputCamera[],
  pointer: P,
  onUi: boolean,
): void {
  if (!onUi) {
    input.update(MOUSE_MOVE, [pointer]);
    return;
  }
  const taking = cameras.map((camera) => camera.inputEnabled);
  const camera = pointer.camera;
  for (const c of cameras) c.inputEnabled = false;
  try {
    input.update(MOUSE_MOVE, [pointer]);
  } finally {
    cameras.forEach((c, i) => (c.inputEnabled = taking[i]));
    pointer.camera = camera;
  }
}

/** What the UI scene's pointer rules reach. */
export interface UiScenePointerDeps<P> {
  /** The UI scene's cameras: out of Phaser's hit test while a world's press is down (R25). */
  cameras(): readonly InputCamera[];
  /** Whether any pointer is down now: Phaser's own state, its release heard on window. */
  anyDown(): boolean;
  /** The world reported, handed a move the UI scene took (R27). The UI bridge is one. */
  world: { moved(pointer: P, onUi: boolean): void };
  /** Lets go of the game's focused text field (R26). */
  letGo(): void;
}

/**
 * The UI scene's pointer beside the worlds' (R25–R27), told the UI scene's own scene-wide events as
 * Phaser emits them: `pointerdown` and `pointermove` with what of the UI scene's lies under the
 * pointer, `pointerout` after them, `pointerup` and `pointerupoutside`, and each frame.
 */
export class UiScenePointer<P extends ScenePointer> {
  /** A press the UI scene had nothing under is down: the world's, to its end (R25). */
  private worldPress = false;
  /** The DOM move just heard with nothing of the UI scene's under it: an out in it is a move leaving a piece (R27). */
  private leaving: unknown = null;
  /** The cameras stood aside for a world's press. */
  private aside: InputCamera[] = [];

  constructor(private readonly deps: UiScenePointerDeps<P>) {}

  /**
   * A press: on one of its pieces, the UI scene's, and the game's text field lets go (R26), after the
   * piece answered (Phaser emits the scene's `pointerdown` after its objects'); on nothing of its own,
   * the world's, and the UI scene stands aside until no pointer is down (R25).
   */
  pressed(over: readonly unknown[]): void {
    this.leaving = null;
    if (this.worldPress) return;
    if (over.length > 0) {
      this.deps.letGo();
      return;
    }
    this.worldPress = true;
    this.take(false);
  }

  /** A release, over the canvas or off it: the world's press ends once no pointer is down (R25). */
  released(): void {
    this.leaving = null;
    this.settle();
  }

  /**
   * A move. Over one of its pieces Phaser stops it here, so the world is handed it as a move over
   * nothing of its own; with nothing under it, an out that follows in the same move is a piece left
   * (R27). Under a world's press the UI scene hits nothing, and Phaser hands the move on itself.
   */
  moved(pointer: P, over: readonly unknown[]): void {
    this.leaving = null;
    if (this.worldPress) {
      this.settle();
      return;
    }
    if (over.length > 0) this.deps.world.moved(pointer, true);
    else this.leaving = pointer.event ?? null;
  }

  /** The pointer left one of its pieces: in a move, Phaser stopped that move here, so the world is handed it, once (R27). */
  left(pointer: P): void {
    if (this.leaving === null || pointer.event !== this.leaving) return;
    this.leaving = null;
    this.deps.world.moved(pointer, false);
  }

  /** Each frame: a world's press whose release the UI scene never heard (asleep, held) ends with no pointer down. */
  frame(): void {
    this.settle();
  }

  private settle(): void {
    if (!this.worldPress || this.deps.anyDown()) return;
    this.worldPress = false;
    this.take(true);
  }

  /** The UI scene's cameras out of the hit test, or back: only those that took input before. */
  private take(input: boolean): void {
    if (!input) {
      this.aside = this.deps.cameras().filter((camera) => camera.inputEnabled);
      for (const camera of this.aside) camera.inputEnabled = false;
      return;
    }
    for (const camera of this.aside) camera.inputEnabled = true;
    this.aside = [];
  }
}
