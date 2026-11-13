/**
 * The OPTIONS panel (FS-28DDG § Change: Music volume in an Options panel, C3–C8, C13, C16): the one
 * settings page every world's ESC menu opens from its **Options** row. A camera-fixed box in the
 * windows' frame and title in the popup band, wider than the menu, a list of setting rows
 * (**Music**, then **Sound effects** (FS-WDM0X S17), each a stepped slider from 0 to 5, then
 * **Fullscreen** (FS-T3DWX), an Off / On toggle, where the game has a fullscreen to offer) and
 * **Back  [Esc]** at its foot. While it is open it owns
 * the screen as the menu does: it stands in the scene's menu slot, under the menu's blocker.
 *
 * Each scene adds the row (through its menu rule), opens this with its tones, its Menu icon's
 * `through`, what Back does (reopen that world's ESC menu), a music level control and the
 * fullscreen its game was lent (`lentFullscreen`, FS-T3DWX R12), and routes
 * ←/→ to `keys.nudge`. No scene draws a panel of its own. Colour comes in as the scene's tokens
 * (`MenuTones`, ADR-0013); the arrows and the steps are drawn in code, never as text glyphs, since
 * the canvas body face has no ◄ ► ■ □.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
import { MUSIC_TOP_LEVEL } from "@/audio/musicSetting";
import { SFX_TOP_LEVEL, browserSfxStore, storedSfxLevel } from "@/audio/sfxSetting";
import {
  MENU_DEPTH,
  MENU_PAD,
  MENU_ROW,
  frameCloseHit,
  menuBlocker,
  menuOption,
  type HitSize,
  type MenuKeys,
  type MenuStage,
  type MenuTones,
} from "./menuPanel";
import { PANEL_TITLE_BAND, drawPanelFrame, drawPanelTitle } from "./panelFrame";

/** The ESC menu's row that opens the panel (C1, C2), kept Phaser-free in `optionsChoice`. */
export { OPTIONS_CHOICE } from "./optionsChoice";
/** The panel's title (C3), in the windows' one title style. */
export const OPTIONS_TITLE = "OPTIONS";
/** The panel's width, wider than the menu's 320 (C3); tunable. */
export const OPTIONS_WIDTH = 480;
/** One setting row's height (C4); tunable. Even, so a row's centre falls on a whole px. */
export const OPTIONS_ROW = 44;
/** How far a row's label and its control stand in from the panel's sides. */
const OPTIONS_INSET = 36;

/** The slider's marks, in px: each arrow a triangle, each step a rectangle (C5, C16). */
const ARROW_W = 8;
const ARROW_H = 12;
const STEP_W = 18;
const STEP_H = 12;
const STEP_GAP = 4;
const ARROW_GAP = 10;
/** The pressable area round each mark: the row's height, and the mark's share of the bar. */
const MARK_HIT_H = 28;
const ARROW_HIT_W = 24;
/** The toggle's Off: right-aligned this far left of the row's right edge, where On ends (FS-T3DWX R4). */
const TOGGLE_OFF_RIGHT = 40;

/** A level, as the panel reads and sets it: the music's (C13) or the sound effects' (FS-WDM0X S19). */
export interface LevelControl {
  level(): number;
  setLevel(level: number): void;
}

/** The music's level (C13): the hub's music, or the stored level alone. */
export type MusicLevelControl = LevelControl;

/**
 * The game frame's fullscreen, as the Fullscreen row reads and toggles it (FS-T3DWX R4–R6, R12):
 * the page that owns the frame lends it, and its state is always the document's.
 */
export interface FullscreenControl {
  /** Whether the page is fullscreen now. */
  active(): boolean;
  /** Asks for fullscreen, or leaves it; called inside the press, the gesture a browser needs. */
  toggle(): void;
  /** Hears every change of state, by any route; the returned function stops it. */
  watch(changed: () => void): () => void;
}

/** One setting row: its label on the left, a stepped slider from 0 to `steps` on the right (C4, C5). */
export interface SettingRow {
  kind?: "slider";
  id: string;
  label: string;
  steps: number;
  value(): number;
  set(value: number): void;
}

/** One on/off row: its label on the left, Off and On on the right, the state's word lit (FS-T3DWX R4). */
export interface ToggleRow {
  kind: "toggle";
  id: string;
  label: string;
  on(): boolean;
  toggle(): void;
  /** Hears the state change while the panel is open; the returned function stops it. */
  watch(changed: () => void): () => void;
}

/** A row of the panel's list. */
export type OptionsRow = SettingRow | ToggleRow;

/** The panel's keys, in the menu slot's shape: Esc is Back, Enter and the numbers do nothing, ←/→ nudge (C6, C7). */
export interface OptionsKeys extends MenuKeys {
  /** ← (-1) or → (+1): the first row's level by one, clamped. */
  nudge(by: -1 | 1): void;
}

/** What a scene's menu slot holds: the ESC menu's keys, or the panel's, which also take ←/→. */
export type MenuSlotKeys = MenuKeys & { nudge?: (by: -1 | 1) => void };

interface OptionsLayoutSpec {
  /** Where the box sits on the screen: the camera's centre. */
  origin: { x: number; y: number };
  /** The Back row's pressable area. */
  hit: HitSize;
  tones: MenuTones;
  /** Back, Esc and the ×: close the panel and reopen that world's ESC menu (C7). */
  back: () => void;
  /** The Menu icon's plate, left to the icon by the blocker (FS-3EBCA R18). */
  through?: (x: number, y: number) => boolean;
}

export interface OptionsPanelSpec extends OptionsLayoutSpec {
  music: MusicLevelControl;
  /**
   * The sound effects' level (FS-WDM0X S19). The scenes pass none: the panel makes the stored-only
   * control as it opens, since the effects have nothing to apply and read the level at each play.
   */
  effects?: LevelControl;
  /** The game frame's fullscreen (FS-T3DWX R12); none where there is none to offer, and then no row (R7). */
  fullscreen?: FullscreenControl | null;
}

export interface OptionsPanel {
  /** The camera-fixed box, in the popup band; destroying it takes the hit areas and the blocker with it. */
  container: Phaser.GameObjects.Container;
  keys: OptionsKeys;
  /** The box, its hit areas with it, to a new place on the screen: the logical view changed (FS-ZAJMH R13). */
  moveTo(origin: { x: number; y: number }): void;
}

/** The game's settings, in order (C4): a later one is one more entry here. */
function settingRows(spec: OptionsPanelSpec): OptionsRow[] {
  const effects = spec.effects ?? storedSfxLevel(browserSfxStore);
  const fullscreen = spec.fullscreen;
  return [
    {
      id: "music",
      label: "Music",
      steps: MUSIC_TOP_LEVEL,
      value: () => spec.music.level(),
      set: (level) => spec.music.setLevel(level),
    },
    // pointer only: ←/→ stay on the first row, Music (FS-WDM0X S18)
    {
      id: "effects",
      label: "Sound effects",
      steps: SFX_TOP_LEVEL,
      value: () => effects.level(),
      set: (level) => effects.setLevel(level),
    },
    // pointer only too (FS-T3DWX R8), and only where the game has a fullscreen to offer (R7)
    ...(fullscreen
      ? [
          {
            kind: "toggle",
            id: "fullscreen",
            label: "Fullscreen",
            on: () => fullscreen.active(),
            toggle: () => fullscreen.toggle(),
            watch: (changed: () => void) => fullscreen.watch(changed),
          } satisfies ToggleRow,
        ]
      : []),
  ];
}

const isToggle = (row: OptionsRow): row is ToggleRow => row.kind === "toggle";

/** The OPTIONS panel with the game's settings (C3), at `spec.origin`. */
export function openOptionsPanel(scene: MenuStage, spec: OptionsPanelSpec): OptionsPanel {
  return showOptionsPanel(scene, { ...spec, rows: settingRows(spec) });
}

/** A drawn slider mark and its camera-fixed hit, redrawn when the level or the pointer changes. */
interface Mark {
  draw(): void;
  place(origin: { x: number; y: number }): void;
}

/**
 * The OPTIONS panel's layout for any list of rows (C4): the title's band, one row per setting,
 * Back at the foot, the height following the rows. `openOptionsPanel` gives it the game's settings.
 */
export function showOptionsPanel(scene: MenuStage, spec: OptionsLayoutSpec & { rows: OptionsRow[] }): OptionsPanel {
  const { rows, origin, tones, back } = spec;
  const height = PANEL_TITLE_BAND + rows.length * OPTIONS_ROW + MENU_ROW + MENU_PAD;
  const top = -Math.round(height / 2);
  const below = top + PANEL_TITLE_BAND;

  const ground = scene.add.graphics();
  const box = { x: -OPTIONS_WIDTH / 2, y: top, width: OPTIONS_WIDTH, height };
  const frame = drawPanelFrame(scene, ground, box);
  const parts: Phaser.GameObjects.GameObject[] = [ground, frame.glyph, drawPanelTitle(scene, box, OPTIONS_TITLE)];

  const marks: Mark[] = [];
  const hits: Phaser.GameObjects.Rectangle[] = [];
  /** What the panel listens to while open, let go as it closes. */
  const stops: (() => void)[] = [];
  const change = (row: SettingRow, value: number) => {
    const next = Math.min(row.steps, Math.max(0, value));
    if (next === row.value()) return;
    row.set(next);
    marks.forEach((mark) => mark.draw());
  };

  /** One mark of a row's slider: drawn in `paint`'s colour, pressable while `enabled`, at (cx, cy) in the box. */
  const markAt = (
    name: string,
    centre: { x: number; y: number },
    hitWidth: number,
    paint: (g: Phaser.GameObjects.Graphics, lit: boolean) => void,
    enabled: () => boolean,
    press: () => void,
  ) => {
    const g = scene.add.graphics().setName(`${name}-mark`);
    parts.push(g);
    let lit = false;
    const draw = () => {
      g.clear();
      paint(g, lit && enabled());
    };
    const hit = scene.add
      .rectangle(origin.x + centre.x, origin.y + centre.y, hitWidth, MARK_HIT_H, tones.panel, 0)
      .setScrollFactor(0)
      .setDepth(MENU_DEPTH + 1)
      .setInteractive()
      .setName(name);
    hit.on("pointerup", () => {
      if (enabled()) press();
    });
    hit.on("pointerover", () => {
      lit = true;
      draw();
    });
    hit.on("pointerout", () => {
      lit = false;
      draw();
    });
    hits.push(hit);
    draw();
    marks.push({ draw, place: (at) => void hit.setPosition(at.x + centre.x, at.y + centre.y) });
  };

  const rowText = (x: number, y: number, words: string) =>
    scene.add.text(x, y, words, { fontFamily: CANVAS_FONT.body, fontSize: "15px", color: toCss(tones.text) });

  /**
   * Off and On, right-aligned on the sliders' right edge, the state's word in the actionable tone
   * and the other dim; a press released anywhere on the row toggles it (FS-T3DWX R4, R5). The words
   * follow the state's every change, by any route, never the press itself (R6).
   */
  const toggleAt = (row: ToggleRow, cy: number) => {
    const name = `options-${row.id}`;
    const right = box.x + box.width - OPTIONS_INSET;
    const on = rowText(right, cy, "On").setOrigin(1, 0.5).setName(`${name}-on`);
    const off = rowText(right - TOGGLE_OFF_RIGHT, cy, "Off").setOrigin(1, 0.5).setName(`${name}-off`);
    parts.push(off, on);
    let lit = false;
    const draw = () => {
      const [state, other] = row.on() ? [on, off] : [off, on];
      state.setColor(toCss(lit ? tones.text : tones.actionable));
      other.setColor(toCss(tones.dim));
    };
    const hit = scene.add
      .rectangle(origin.x, origin.y + cy, box.width - 2 * OPTIONS_INSET + ARROW_HIT_W, MARK_HIT_H, tones.panel, 0)
      .setScrollFactor(0)
      .setDepth(MENU_DEPTH + 1)
      .setInteractive()
      .setName(name);
    // on the release, as Phaser's ScaleManager asks: still inside the browser's mouse event (R5)
    hit.on("pointerup", () => row.toggle());
    hit.on("pointerover", () => {
      lit = true;
      draw();
    });
    hit.on("pointerout", () => {
      lit = false;
      draw();
    });
    hits.push(hit);
    stops.push(row.watch(draw));
    draw();
    marks.push({ draw, place: (at) => void hit.setPosition(at.x, at.y + cy) });
  };

  rows.forEach((row, i) => {
    const cy = below + OPTIONS_ROW * i + OPTIONS_ROW / 2;
    parts.push(rowText(box.x + OPTIONS_INSET, cy, row.label).setOrigin(0, 0.5));
    if (isToggle(row)) {
      toggleAt(row, cy);
      return;
    }

    // ◄ steps ►, right-aligned in the row
    const span = 2 * (ARROW_W + ARROW_GAP) + row.steps * STEP_W + (row.steps - 1) * STEP_GAP;
    const left = box.x + box.width - OPTIONS_INSET - span;
    const markTop = cy - STEP_H / 2;
    const name = `options-${row.id}`;
    const arrowTone = (on: boolean, lit: boolean) => (on ? (lit ? tones.text : tones.actionable) : tones.dim);

    const canLower = () => row.value() > 0;
    markAt(
      `${name}-down`,
      { x: left + ARROW_W / 2, y: cy },
      ARROW_HIT_W,
      (g, lit) => {
        g.fillStyle(arrowTone(canLower(), lit), 1);
        g.fillTriangle(left, cy, left + ARROW_W, cy - ARROW_H / 2, left + ARROW_W, cy + ARROW_H / 2);
      },
      canLower,
      () => change(row, row.value() - 1),
    );

    for (let k = 1; k <= row.steps; k++) {
      const x = left + ARROW_W + ARROW_GAP + (k - 1) * (STEP_W + STEP_GAP);
      markAt(
        `${name}-step-${k}`,
        { x: x + STEP_W / 2, y: cy },
        STEP_W + STEP_GAP,
        (g, lit) => {
          const full = k <= row.value();
          g.fillStyle(lit ? tones.text : full ? tones.actionable : tones.dim, 1);
          if (full) {
            g.fillRect(x, markTop, STEP_W, STEP_H);
            return;
          }
          // an empty step is its outline, 1 px on whole px
          g.fillRect(x, markTop, STEP_W, 1);
          g.fillRect(x, markTop + STEP_H - 1, STEP_W, 1);
          g.fillRect(x, markTop + 1, 1, STEP_H - 2);
          g.fillRect(x + STEP_W - 1, markTop + 1, 1, STEP_H - 2);
        },
        () => true,
        () => change(row, k),
      );
    }

    const right = left + span - ARROW_W;
    const canRaise = () => row.value() < row.steps;
    markAt(
      `${name}-up`,
      { x: right + ARROW_W / 2, y: cy },
      ARROW_HIT_W,
      (g, lit) => {
        g.fillStyle(arrowTone(canRaise(), lit), 1);
        g.fillTriangle(right, cy - ARROW_H / 2, right, cy + ARROW_H / 2, right + ARROW_W, cy);
      },
      canRaise,
      () => change(row, row.value() + 1),
    );
  });

  const backRow = menuOption(scene, {
    x: 0,
    y: below + rows.length * OPTIONS_ROW + MENU_ROW / 2,
    label: "Back  [Esc]",
    colour: tones.cancel,
    onPick: back,
    name: "options-back",
    origin,
    hit: spec.hit,
    tones,
  });

  const nudge = (by: -1 | 1) => {
    const row = rows[0];
    if (row && !isToggle(row)) change(row, row.value() + by);
  };
  const keys: OptionsKeys = {
    // Enter and the numbers answer no row here (C6)
    pick: () => {},
    confirm: () => {},
    dismiss: back,
    retone: () => marks.forEach((mark) => mark.draw()),
    nudge,
  };

  const container = scene.add
    .container(origin.x, origin.y, [...parts, backRow])
    .setScrollFactor(0)
    .setDepth(MENU_DEPTH);
  const closeHit = frameCloseHit(scene, { frame, origin, tones, name: "options-close", onPress: back });
  const blocker = menuBlocker(scene, { through: spec.through, name: "options-blocker" });
  container.once("destroy", () => {
    stops.forEach((stop) => stop());
    hits.forEach((hit) => hit.destroy());
    closeHit.destroy();
    blocker.destroy();
  });

  const moveTo = (at: { x: number; y: number }) => {
    container.setPosition(at.x, at.y);
    marks.forEach((mark) => mark.place(at));
    backRow.place(at);
    closeHit.place(at);
    blocker.setSize(viewport.width, viewport.height);
    crispen([container]);
  };
  return { container, keys, moveTo };
}
