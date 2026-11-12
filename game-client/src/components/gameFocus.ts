/**
 * Who has the keyboard on /game: the game, while nothing on the page holds focus, and the page's
 * controls (the header, the fullscreen button, a text field) while one does. Phaser-free, so it is
 * tested against Phaser's own KeyboardManager.
 *
 * Tab moved the browser's focus off the game onto the page's buttons (reported 2026-11-12): only the
 * run captured it, and Phaser never holds a key pressed with a modifier. And once a button held
 * focus, pressing the canvas never took it back, since Phaser prevents a canvas mousedown's default:
 * the game's keys went on landing on the button.
 */

/** Phaser.Core.Events.BOOT. */
const BOOT = "boot";

/** A game, as far as when its keyboard starts listening goes. A `Phaser.Game` is one. */
export interface BootingGame {
  isBooted: boolean;
  events: {
    once(event: typeof BOOT, fn: () => void): unknown;
    off(event: typeof BOOT, fn: () => void): unknown;
  };
}

/** Where the keys are heard: the window, where Phaser's KeyboardManager listens too. */
export type KeyTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** What of the document focus is read on. A `Document` is one. */
export type FocusDocument = Pick<Document, "activeElement" | "body" | "documentElement">;

/** Whether the game has the keyboard: no element of the page holds focus. */
function withGame(doc: FocusDocument): boolean {
  const focused = doc.activeElement;
  return focused === null || focused === doc.body || focused === doc.documentElement;
}

/**
 * Keeps Tab from moving focus while the game has the keyboard; returns the release. Shift+Tab stays
 * the browser's, the keyboard player's way out to the page (the fullscreen button, FS-ZAJMH US 25),
 * and Tab on a focused control moves on as on any page. A field inside the game that owns Tab (the
 * chat's channel picker) stops it before window.
 *
 * Heard on window behind Phaser's own listener, which drops a key whose default is already
 * prevented: so the run's Tab still cycles the watched player. The game's InputManager subscribes
 * to BOOT inside `new Phaser.Game`, before this can, so whether the game has booted or not, this
 * listens after it.
 */
export function keepTab(game: BootingGame, win: KeyTarget, doc: FocusDocument): () => void {
  const onKey = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (withGame(doc)) e.preventDefault();
  };
  let listening = false;
  const listen = () => {
    listening = true;
    win.addEventListener("keydown", onKey);
  };
  if (game.isBooted) listen();
  else game.events.once(BOOT, listen);

  return () => {
    game.events.off(BOOT, listen);
    if (listening) win.removeEventListener("keydown", onKey);
    listening = false;
  };
}

/** The canvas's holder, Phaser's parent: the canvas and its DOM layer (the chat field). */
export type PressHolder = Pick<HTMLElement, "contains" | "addEventListener" | "removeEventListener">;

/**
 * A press on the game gives it the keyboard back: a page control holding focus lets go of it, as
 * the browser would itself were the canvas's mousedown not prevented. A field inside the game keeps
 * its own rules (the chat input stays focused for a press on its panel). Returns the release.
 */
export function takeFocusOnPress(holder: PressHolder, doc: FocusDocument): () => void {
  const onPress = () => {
    const focused = doc.activeElement;
    if (withGame(doc) || !focused || holder.contains(focused)) return;
    if ("blur" in focused && typeof focused.blur === "function") focused.blur();
  };
  holder.addEventListener("pointerdown", onPress);
  return () => holder.removeEventListener("pointerdown", onPress);
}
