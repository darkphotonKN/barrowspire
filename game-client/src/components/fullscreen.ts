/**
 * Fullscreen for the game frame (FS-ZAJMH §E R18–R23). The page has two states, windowed and
 * fullscreen; the state is always the document's own (`fullscreenElement`), never a local
 * toggle, so leaving by Esc or the browser's UI reads the same as leaving by the toggle (R20). The
 * toggle is the OPTIONS panel's Fullscreen row (FS-T3DWX), bound to the frame by `frameFullscreen`.
 *
 * Where the browser has the Keyboard Lock API (Chrome, Edge), a fullscreen entered by the toggle
 * locks Esc, so it reaches the game; the player leaves by holding Esc (R21 as amended, A16).
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

/**
 * The Keyboard Lock API, as fullscreen uses it: `navigator.keyboard` where it has `lock` (Chrome,
 * Edge). Safari and Firefox have none.
 */
export interface KeyboardLock {
  lock(keyCodes: string[]): Promise<void>;
  unlock(): void;
}

/**
 * The navigator's Keyboard Lock, or null where it has none. Detected as Chrome's guide does,
 * `'keyboard' in navigator && 'lock' in navigator.keyboard`
 * (https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock).
 */
export function keyboardLockOf(nav: object): KeyboardLock | null {
  if (!("keyboard" in nav)) return null;
  const { keyboard } = nav;
  return typeof keyboard === "object" && keyboard !== null && "lock" in keyboard
    ? (keyboard as KeyboardLock)
    : null;
}

/** The document's fullscreen, as the toggle needs it. */
export interface Fullscreen {
  /** Whether the page is fullscreen now. */
  active(): boolean;
  /**
   * Windowed: asks for `frame` fullscreen, then, given a Keyboard Lock, locks Esc for it (A16).
   * Fullscreen: leaves it. A refusal (no user gesture, a permission policy) is swallowed: the
   * page stays windowed and the state says so (R23).
   */
  toggle(frame: FullscreenFrame | null): Promise<void>;
  /** Hears every change of state, by any route; the returned function stops it. */
  watch(changed: Listener): () => void;
}

const CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

/** The document's fullscreen, or null where there is none to offer (R23). */
export function fullscreenOf(
  doc: FullscreenDocument,
  keyboard?: KeyboardLock | null,
): Fullscreen | null {
  if (doc.fullscreenEnabled !== true && doc.webkitFullscreenEnabled !== true)
    return null;

  const active = () =>
    (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;

  const watch = (changed: Listener) => {
    for (const type of CHANGE_EVENTS) doc.addEventListener(type, changed);
    return () => {
      for (const type of CHANGE_EVENTS) doc.removeEventListener(type, changed);
    };
  };

  /**
   * Gives Esc to the game for one fullscreen (R21 as amended, A16): locked once fullscreen is on,
   * released when it is left by any route. The browser keeps its own exit, a held Esc.
   */
  const holdEscape = (lock: KeyboardLock) => {
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      stop();
      lock.unlock();
    };
    const stop = watch(() => {
      if (!active()) release();
    });
    // A refusal (not the top-level page, an insecure origin) leaves Esc the browser's, which is
    // today's behaviour, so it is not an error. A lock that lands after fullscreen was left is
    // let go at once.
    lock.lock(["Escape"]).then(
      () => {
        if (!held) lock.unlock();
      },
      () => {},
    );
  };

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
          // after the request, as Chrome's guide orders it; a refused request never gets here
          if (keyboard && active()) holdEscape(keyboard);
        }
      } catch {
        // refused: nothing changed, so `active()` and the toggle still read windowed
      }
    },
    watch,
  };
}
