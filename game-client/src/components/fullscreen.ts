/**
 * Fullscreen for the game frame (FS-ZAJMH §E R18–R23). The page has two states, windowed and
 * fullscreen; the state is always the document's own (`fullscreenElement`), never a local
 * toggle, so leaving by Esc or the browser's UI reads the same as leaving by the button (R20).
 *
 * Safari before 16.4 and iPadOS speak only the webkit-prefixed API; iPhone Safari has none, and
 * then there is no fullscreen to offer (R23).
 */

type Listener = () => void;

/** What of a document fullscreen reads. A `Document` is one. */
export interface FullscreenDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?(): Promise<void>;
  webkitExitFullscreen?(): void;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
}

/** What of the game frame fullscreen asks. An `HTMLElement` is one. */
export interface FullscreenFrame {
  requestFullscreen?(): Promise<void>;
  webkitRequestFullscreen?(): void;
}

/** The document's fullscreen, as the button needs it. */
export interface Fullscreen {
  /** Whether the page is fullscreen now. */
  active(): boolean;
  /**
   * Windowed: asks for `frame` fullscreen. Fullscreen: leaves it. A refusal (no user gesture, a
   * permission policy) is swallowed: the page stays windowed and the state says so (R23).
   */
  toggle(frame: FullscreenFrame | null): Promise<void>;
  /** Hears every change of state, by any route; the returned function stops it. */
  watch(changed: Listener): () => void;
}

const CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

/** The document's fullscreen, or null where there is none to offer (R23). */
export function fullscreenOf(doc: FullscreenDocument): Fullscreen | null {
  if (doc.fullscreenEnabled !== true && doc.webkitFullscreenEnabled !== true)
    return null;

  const active = () =>
    (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;

  return {
    active,
    async toggle(frame) {
      try {
        if (active()) {
          if (doc.exitFullscreen) await doc.exitFullscreen();
          else doc.webkitExitFullscreen?.();
        } else if (frame) {
          if (frame.requestFullscreen) await frame.requestFullscreen();
          else frame.webkitRequestFullscreen?.();
        }
      } catch {
        // refused: nothing changed, so `active()` and the button still read windowed
      }
    },
    watch(changed) {
      for (const type of CHANGE_EVENTS) doc.addEventListener(type, changed);
      return () => {
        for (const type of CHANGE_EVENTS)
          doc.removeEventListener(type, changed);
      };
    },
  };
}

/** What the button reads in each state, and its accessible name (R18). */
export function fullscreenLabel(active: boolean): {
  text: string;
  name: string;
} {
  return active
    ? { text: "縮小", name: "縮小 / exit fullscreen" }
    : { text: "全螢幕", name: "全螢幕 / enter fullscreen" };
}

/** What of the button the keeping listens on. An `HTMLElement` is one. */
export interface KeptElement {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** The pointer, mouse and touch presses Phaser listens for. */
const PRESS_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
] as const;

/**
 * Phaser hears the mouse and touch on `window` as well as on the canvas (a press that ends off
 * the canvas is still a pointer-up for the scene), and the keyboard on `window`. Stopping the
 * button's own presses there keeps a click on it from ever being an in-game action (R22). The
 * click itself is left alone: React hears it at the root. Of the keys, only the two that press
 * a button stop; the rest still reach the game while it is focused. Returns the release.
 */
export function keepFromGame(el: KeptElement): () => void {
  const stop = (e: Event) => e.stopPropagation();
  const stopPressKey = (e: Event) => {
    const { key } = e as KeyboardEvent;
    if (key === "Enter" || key === " ") e.stopPropagation();
  };
  const kept: [string, (e: Event) => void][] = [
    ...PRESS_EVENTS.map((type): [string, (e: Event) => void] => [type, stop]),
    ["keydown", stopPressKey],
    ["keyup", stopPressKey],
  ];
  for (const [type, fn] of kept) el.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of kept) el.removeEventListener(type, fn);
  };
}

/** A click on the button, as far as {@link handBackFocus} reads it. */
export interface ButtonClick {
  /** How many clicks: 1 or more for a mouse or touch press, 0 for Enter or Space. */
  detail: number;
  currentTarget: { blur(): void };
}

/**
 * After a mouse or touch press on the button, focus goes back to the page, so Enter and the game's
 * other keys are the game's again (R22). After Enter or Space it stays: a keyboard player keeps
 * their place and the focus ring (R18).
 */
export function handBackFocus(e: ButtonClick): void {
  if (e.detail > 0) e.currentTarget.blur();
}
