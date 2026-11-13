import type { FullscreenControl } from "@/ui/optionsPanel";
import {
  fullscreenOf,
  type FullscreenDocument,
  type FullscreenFrame,
  type KeyboardLock,
} from "./fullscreen";

/**
 * The game frame's fullscreen, bound to the frame, as the OPTIONS panel's Fullscreen row toggles
 * it (FS-T3DWX R12): `fullscreen.ts`'s state, toggle and watch, unchanged (FS-ZAJMH R19–R23, A16),
 * so entering it locks Esc for the game where the browser has Keyboard Lock. The toggle asks at
 * once, inside the caller's press, the user gesture a browser requires. None where the document
 * has no fullscreen to offer (R23).
 */
export function frameFullscreen(
  frame: FullscreenFrame,
  doc: FullscreenDocument,
  keyboard: KeyboardLock | null,
): FullscreenControl | null {
  const fullscreen = fullscreenOf(doc, keyboard);
  if (!fullscreen) return null;
  return {
    active: () => fullscreen.active(),
    // a refusal is swallowed inside: the page stays windowed and the state says so
    toggle: () => void fullscreen.toggle(frame),
    watch: (changed) => fullscreen.watch(changed),
  };
}
