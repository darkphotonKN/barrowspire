/**
 * The run's controls panel (H), drawn as the run drew it (`toggleControlsPanel`) at the view's centre,
 * now in every window's frame with its × (FS-84N1G R13): the windows' one title (FS-3EBCA R20, R22), a
 * row per control (its key in brass, its action in the HUD's label tone), and "H to close" under them. The class's own ability is named as its
 * HUD card names it (FS-8AY7S req 30).
 *
 * It is the UI scene's (FS-TQZ5J § Change: Phase 3, R50, the note on ADR-0083 2.3): at 1200, over the
 * party panel (1110), as the owner asked (「塔內操作說明蓋在組隊上面」), with a ground over its rect, so a
 * press on it is its own (R59, R61).
 */

import type Phaser from "phaser";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { ABILITY_COPY } from "./abilityCopy";
import { drawPanelFrame, drawPanelTitle, type FrameRect } from "./panelFrame";
import type { Rect } from "./partyPanelLayout";

/** Over the party panel (1110) and the gear overlay (1100), under the record (1600) and the popups (2000). */
export const CONTROLS_PANEL_DEPTH = 1200;
const PANEL_W = 260;
/** A row's pitch, and the panel's title band and foot. */
const ROW_H = 20;
const TITLE_H = 44;
const FOOT_H = 32;

/** The controls, key and action, in the order the panel lists them; the class's ability by its name. */
export function controlRows(className: string): [string, string][] {
  return [
    ["WASD", "Move"],
    ["E", "Interact"],
    ["F", "Take Item"],
    ["I / B", "Inventory"],
    ["C", "Character"],
    ["T", "Party"],
    ["ENTER", "Chat"],
    ["Q", "Close Panel"],
    ["LEFT CLICK", "Attack"],
    // the class's own ability, named as its HUD card names it (FS-8AY7S req 30)
    ["RIGHT CLICK", ABILITY_COPY[className]?.name ?? "Class ability"],
    [RUN_ACTIONS.drinkPotion.label, "Drink potion"],
    ["H", "Toggle Controls"],
    ["ESC", "Menu"],
  ];
}

/** The panel's height for `rows` controls: the title, a 20 px row each, and the hint under them. */
function panelHeight(rows: number): number {
  return TITLE_H + rows * ROW_H + FOOT_H;
}

/** Where the panel stands about `centre`, for `rows` controls: its ground's rect (R59). */
export function controlsPanelRect(centre: { x: number; y: number }, rows: number): Rect {
  const h = panelHeight(rows);
  return { x: centre.x - PANEL_W / 2, y: centre.y - h / 2, width: PANEL_W, height: h };
}

/** The panel as drawn: its container, and its × box and glyph in the container's space. */
export interface DrawnControlsPanel {
  container: Phaser.GameObjects.Container;
  close: FrameRect;
  glyph: Phaser.GameObjects.Text;
}

/**
 * The panel, drawn about `centre` for `className`, held against the screen at its depth, in every
 * window's frame with its × (`drawPanelFrame`, FS-84N1G R13): the × box and glyph handed back, for
 * the caller to hit and light.
 */
export function drawControlsPanel(
  scene: Pick<Phaser.Scene, "add">,
  centre: { x: number; y: number },
  className: string,
): DrawnControlsPanel {
  const controls = controlRows(className);
  const panelW = PANEL_W;
  // the title, a 20 px row per control, and the hint under them, so a row added never runs
  // into the hint
  const panelH = panelHeight(controls.length);
  const children: Phaser.GameObjects.GameObject[] = [];

  // every window's frame and × (FS-84N1G R13; FS-3EBCA §F), the shared drawing, not a copy
  const bg = scene.add.graphics();
  const frame = drawPanelFrame(scene, bg, { x: -panelW / 2, y: -panelH / 2, width: panelW, height: panelH });
  children.push(bg, frame.glyph);

  // the windows' one title (FS-3EBCA R20, R22)
  children.push(drawPanelTitle(scene as Phaser.Scene, { x: -panelW / 2, y: -panelH / 2, width: panelW }, "CONTROLS"));

  let curY = -panelH / 2 + TITLE_H;
  for (const [key, action] of controls) {
    const keyText = scene.add.text(-panelW / 2 + 20, curY, key, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.frameBright),
      letterSpacing: 2,
    });
    const actionText = scene.add.text(panelW / 2 - 20, curY, action, {
      fontFamily: CANVAS_FONT.body,
      fontSize: "11px",
      color: toCss(palette.hudLabel),
    });
    actionText.setOrigin(1, 0);
    children.push(keyText, actionText);
    curY += ROW_H;
  }

  const hint = scene.add.text(0, panelH / 2 - 16, "H to close", {
    fontFamily: CANVAS_FONT.body,
    fontSize: "10px",
    color: toCss(palette.hudFaint),
  });
  hint.setOrigin(0.5);
  children.push(hint);

  const container = scene.add.container(centre.x, centre.y, children);
  container.setDepth(CONTROLS_PANEL_DEPTH);
  container.setScrollFactor(0);
  return { container, close: frame.close, glyph: frame.glyph };
}
