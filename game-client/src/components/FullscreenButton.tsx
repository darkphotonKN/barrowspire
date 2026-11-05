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
import { FULLSCREEN_BUTTON } from "@/render/viewport/fullscreenButton";
import {
  fullscreenLabel,
  fullscreenOf,
  handBackFocus,
  keepFromGame,
  type FullscreenDocument,
} from "./fullscreen";

interface Props {
  /** The game frame: what goes fullscreen, canvas and Phaser's DOM layer together (R19). */
  frame: RefObject<HTMLElement | null>;
  /** The document whose fullscreen it is; the page's own by default. */
  doc?: FullscreenDocument;
}

/** The button's corner and height, in logical units; the CSS multiplies them by the canvas's scale. */
const FOOTPRINT = {
  "--fullscreen-inset": FULLSCREEN_BUTTON.inset,
  "--fullscreen-height": FULLSCREEN_BUTTON.height,
} as CSSProperties;

/**
 * The game frame's fullscreen toggle (FS-ZAJMH §E R18–R23), DOM over the canvas in the web UI's
 * palette (ADR-0025). Its state is the document's, so Esc and the browser's own exits keep it in
 * step (R20). Nothing is rendered where there is no fullscreen to offer (R23); there is no key
 * for it (R22).
 */
export default function FullscreenButton({ frame, doc }: Props) {
  const fullscreen = useMemo(() => fullscreenOf(doc ?? document), [doc]);
  const subscribe = useCallback(
    (changed: () => void) => fullscreen?.watch(changed) ?? (() => {}),
    [fullscreen],
  );
  const read = useCallback(() => fullscreen?.active() ?? false, [fullscreen]);
  const active = useSyncExternalStore(subscribe, read, read);

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
      style={FOOTPRINT}
      aria-label={label.name}
      title={label.name}
      onClick={onClick}
    >
      <Icon className="fullscreen-button-icon" aria-hidden="true" />
    </button>
  );
}
