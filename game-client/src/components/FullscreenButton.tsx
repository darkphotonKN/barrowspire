"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";
import {
  FULLSCREEN_BUTTON,
  fullscreenButtonPlace,
  type FullscreenButtonPlace,
  type FullscreenButtonSpot,
} from "@/render/viewport/fullscreenButton";
import {
  fullscreenLabel,
  fullscreenOf,
  handBackFocus,
  keepFromGame,
  keyboardLockOf,
  type FullscreenDocument,
  type KeyboardLock,
} from "./fullscreen";

interface Props {
  /** The game frame: what goes fullscreen, canvas and Phaser's DOM layer together (R19). */
  frame: RefObject<HTMLElement | null>;
  /** The document whose fullscreen it is; the page's own by default. */
  doc?: FullscreenDocument;
  /** The Keyboard Lock that gives Esc to the game in fullscreen (A16); the navigator's by default. */
  keyboard?: KeyboardLock | null;
  /** Where the scene stands it (FS-56CKV §Change C6); the game's one place by default. */
  place?: FullscreenButtonPlace;
}

/** The button's place and size, in logical units; the CSS multiplies them by the canvas's scale. */
const footprint = (spot: FullscreenButtonSpot) =>
  ({
    "--fullscreen-top": spot.top,
    "--fullscreen-right": spot.right,
    "--fullscreen-height": FULLSCREEN_BUTTON.height,
  }) as CSSProperties;

/**
 * The game frame's fullscreen toggle (FS-ZAJMH §E R18–R23), DOM over the canvas in the web UI's
 * palette (ADR-0025). Its state is the document's, so Esc and the browser's own exits keep it in
 * step (R20). Where the browser has Keyboard Lock, the fullscreen it enters gives Esc to the game
 * and a held Esc leaves (R21 as amended, A16). Nothing is rendered where there is no fullscreen to offer (R23); there is no key
 * for it (R22). It stands where the scene's top-right column hands it: the canvas's corner, or the
 * normal minimap's left (FS-56CKV §Change: Minimap at the top, fullscreen button beside it).
 */
export default function FullscreenButton({ frame, doc, keyboard, place = fullscreenButtonPlace }: Props) {
  const fullscreen = useMemo(
    () =>
      fullscreenOf(
        doc ?? document,
        keyboard !== undefined
          ? keyboard
          : typeof navigator === "undefined"
            ? null
            : keyboardLockOf(navigator),
      ),
    [doc, keyboard],
  );
  const subscribe = useCallback(
    (changed: () => void) => fullscreen?.watch(changed) ?? (() => {}),
    [fullscreen],
  );
  const read = useCallback(() => fullscreen?.active() ?? false, [fullscreen]);
  const active = useSyncExternalStore(subscribe, read, read);
  const watchPlace = useCallback((moved: () => void) => place.watch(moved), [place]);
  const readPlace = useCallback(() => place.current, [place]);
  const spot = useSyncExternalStore(watchPlace, readPlace, readPlace);

  // a press on the button never reaches the scene beneath it (R22)
  const button = useRef<HTMLButtonElement | null>(null);
  useEffect(
    () => (button.current ? keepFromGame(button.current) : undefined),
    [fullscreen],
  );

  if (!fullscreen) return null;

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // asked inside the click, the user gesture a browser requires; a refusal leaves it windowed
    void fullscreen.toggle(frame.current);
    handBackFocus(e);
  };

  const label = fullscreenLabel(active);
  const Icon = active ? ArrowsPointingInIcon : ArrowsPointingOutIcon;
  return (
    <button
      ref={button}
      type="button"
      className="fullscreen-button"
      style={footprint(spot)}
      aria-label={label.name}
      title={label.name}
      onClick={onClick}
    >
      <Icon className="fullscreen-button-icon" aria-hidden="true" />
    </button>
  );
}
