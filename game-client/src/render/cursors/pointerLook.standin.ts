/**
 * Test-only: a game and a page for the pointer look (FS-KYPQ9 § Change: The pressed hand, and the
 * hand on the menus). The canvas, the window and the document are bare event targets, the
 * registry a map, the input manager a recorder of what it was set to, and the game's destroy a
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

export function lookGame() {
  const store = new Map<string, unknown>();
  const shown: string[] = [];
  const destroyers: (() => void)[] = [];
  const game = {
    registry: {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
    },
    canvas: new EventTarget(),
    input: { setDefaultCursor: (css: string) => void shown.push(css) },
    events: { once: (_event: "destroy", fn: () => void) => void destroyers.push(fn) },
  };
  const page = { window: new EventTarget(), document: new EventTarget() };
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
  };
}
