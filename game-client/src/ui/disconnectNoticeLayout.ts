/**
 * The disconnect notice's words and where its pieces stand (FS-R6EYZ R8, R9). Phaser-free; the
 * notice scene (`src/scenes/DisconnectNoticeScene.ts`) draws what these return.
 */

import type { Rect } from "./partyPanelLayout";

/** What the notice says, word for word (R8). */
export const DISCONNECT_NOTICE = {
  title: "Disconnected",
  line: "The connection to the server was lost.",
  button: "Return to menu",
} as const;

/** The carved panel's size, centred in the view. */
export const NOTICE_PANEL = { width: 380, height: 170 } as const;
/** The one button, centred under the line. */
export const NOTICE_BUTTON = { width: 168, height: 34 } as const;
/** How dark the world is under the notice: `inkDeep` at this alpha. */
export const NOTICE_DIM_ALPHA = 0.6;
/** The words' sizes, all in the body serif. */
export const NOTICE_TEXT_PX = { title: 18, line: 14, button: 14 } as const;

/** The title's and the line's centres, from the panel's top. */
const TITLE_DY = 40;
const LINE_DY = 76;
/** The button's foot above the panel's foot. */
const BUTTON_FOOT = 24;

export interface DisconnectNoticeFrame {
  /** The whole view, dimmed. */
  dim: Rect;
  panel: Rect;
  /** The centre of each line of words. */
  title: { x: number; y: number };
  line: { x: number; y: number };
  button: Rect;
}

/** The notice laid out in a logical view, on whole units (FS-ZAJMH R12, R13). */
export function disconnectNoticeFrame(view: {
  width: number;
  height: number;
}): DisconnectNoticeFrame {
  const panel = {
    x: Math.round((view.width - NOTICE_PANEL.width) / 2),
    y: Math.round((view.height - NOTICE_PANEL.height) / 2),
    ...NOTICE_PANEL,
  };
  const middle = panel.x + panel.width / 2;
  return {
    dim: { x: 0, y: 0, width: view.width, height: view.height },
    panel,
    title: { x: middle, y: panel.y + TITLE_DY },
    line: { x: middle, y: panel.y + LINE_DY },
    button: {
      x: middle - NOTICE_BUTTON.width / 2,
      y: panel.y + panel.height - BUTTON_FOOT - NOTICE_BUTTON.height,
      ...NOTICE_BUTTON,
    },
  };
}
