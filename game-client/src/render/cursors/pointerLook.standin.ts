/**
 * Test-only: a game and a page for the pointer look (FS-KYPQ9 § Change: The pressed hand, and the
 * hand on the menus). The canvas, the window and the document are event targets that count each
 * listener added and taken off, the registry a map, the input manager a recorder of what it was set to, and the game's destroy a
 * button the test presses. `press`, `release` and the rest dispatch the page's own pointer events,
 * as a browser does: `button` is the one that changed, `buttons` what is held after it.
 */

import { pointerLookOf, type PointerCursors } from "./pointerLook";

/** Stand-in CSS for each cursor, so a test reads which one shows. */
export const STAND_IN_CURSORS: PointerCursors = {
  hand: "hand",
  handPressed: "hand pressed",
  strike: "strike-mark",
};

const LEFT = 0;
const LEFT_HELD = 1;

/** A pointer event as the page dispatches it. */
export function pointerEvent(type: string, button: number, buttons: number): Event {
  return Object.assign(new Event(type), { button, buttons });
}

/** An event target that counts the listeners added to it and taken off it. */
class CountedTarget extends EventTarget {
  added = 0;
  removed = 0;

  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    this.added++;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
    this.removed++;
    super.removeEventListener(...args);
  }
}

export function lookGame() {
  const store = new Map<string, unknown>();
  const shown: string[] = [];
  const destroyers: (() => void)[] = [];
  const game = {
    registry: {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
    },
    canvas: new CountedTarget(),
    input: { setDefaultCursor: (css: string) => void shown.push(css) },
    events: { once: (_event: "destroy", fn: () => void) => void destroyers.push(fn) },
  };
  const page = { window: new CountedTarget(), document: new CountedTarget() };
  const targets = [game.canvas, page.window, page.document];
  return {
    game,
    page,
    /** Every CSS the look set, in order. */
    shown,
    /** What the canvas shows now. */
    now: () => shown[shown.length - 1],
    /** The game's look, made here as a scene with the art makes it. */
    look: (cursors: PointerCursors = STAND_IN_CURSORS) => pointerLookOf(game, () => cursors, page),
    /** The game's look, asked with this `cursors`, made only by the first ask. */
    pointerLookOf: (cursors: () => PointerCursors) => pointerLookOf(game, cursors, page),
    /** The left button goes down on the canvas. */
    press: () => game.canvas.dispatchEvent(pointerEvent("pointerdown", LEFT, LEFT_HELD)),
    /** The left button comes up, anywhere on the page. */
    release: () => page.window.dispatchEvent(pointerEvent("pointerup", LEFT, 0)),
    destroy: () => destroyers.splice(0).forEach((fn) => fn()),
    /** The listeners added to the canvas, the window and the document, and those taken off. */
    listeners: () => ({
      added: targets.reduce((n, t) => n + t.added, 0),
      removed: targets.reduce((n, t) => n + t.removed, 0),
    }),
  };
}
