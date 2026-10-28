/**
 * The chrome of a canvas menu, shared by the hub's ESC menu, the run's ESC menu and its Fall
 * confirm, and the hub's NPC dialogue: a camera-fixed charcoal box with a brass hairline in the
 * popup band, an optional line of copy over the rows, and one pressable row per choice. What a
 * menu offers is each scene's rule (`hubMenuChoices`, `runMenuChoices`, `FALL_CONFIRM`); what
 * it looks like and how its keys land is this module's.
 *
 * Colour comes in as the scene's tokens (`MenuTones`): the hub reads `BARROW_HEX`, the run reads
 * `palette`, and the chrome takes no colour of its own (ADR-0013).
 */

import type Phaser from "phaser";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";

/** The popup band: menus and dialogues sit here, over the HUD (1000) and the result card (1500). */
export const MENU_DEPTH = 2000;
/** The panel: its width, the vertical padding, the copy line's row and one row per choice, in screen px. */
export const MENU_WIDTH = 320;
export const MENU_PAD = 18;
export const MENU_LINE = 44;
export const MENU_ROW = 40;

/** What a menu is drawn in, as the scene's own palette tokens. */
export interface MenuTones {
  /** The panel's ground; also the fill of the invisible hit rectangles. */
  panel: number;
  /** The panel's hairline. */
  frame: number;
  /** The copy line over the rows, and a row brightened under the pointer. */
  text: number;
  /** A row that cannot be pressed now. */
  dim: number;
  /** A row the delver can act on. */
  actionable: number;
  /** A row that goes back. */
  cancel: number;
}

/** The pressable area of a row, in screen px around its label. */
export interface HitSize {
  width: number;
  height: number;
}

/** One row of a menu: what it is called, and whether it is a thing to do or the way back. */
export interface MenuChoice {
  id: string;
  label: string;
  register: "actionable" | "cancel";
}

/** A drawn row, which can redraw its colour when whether it can be pressed changes. */
export type MenuOption = Phaser.GameObjects.Container & { retone(): void };

/** The open menu's keys: a number for that actionable row, Enter for the first, Esc back. */
export interface MenuKeys {
  pick(index: number): void;
  confirm(): void;
  dismiss(): void;
  retone(): void;
}

/** The slice of a scene the chrome draws with. */
export type MenuStage = Pick<Phaser.Scene, "add">;

export interface MenuOptionSpec {
  /** Where the label sits inside the box the caller builds at `origin`. */
  x: number;
  y: number;
  label: string;
  /** The register's colour: amber to press, arcane to go back. */
  colour: number;
  onPick: () => void;
  /** The hit rectangle's name; the label's container is `${name}-label`. */
  name: string;
  /** Where the box sits on the screen, so the hit lands on the label. */
  origin: { x: number; y: number };
  /** Whether it can be pressed now, read live each time it is drawn or pressed; omitted means always. */
  enabled?: () => boolean;
  hit: HitSize;
  tones: Pick<MenuTones, "panel" | "text" | "dim">;
}

/**
 * One pressable row of a menu or a dialogue. Its colour is the register, dimmed to `tones.dim`
 * while `enabled` says it cannot be pressed; `retone` redraws that when the answer changes under
 * an open menu.
 *
 * The label sits at (x, y) inside the camera-fixed box the caller builds at `origin`; the hit
 * area is a separate, camera-fixed rectangle at the same place on the screen, named `name`. It
 * cannot live in the box: Phaser hit-tests a container's child with the child's own scroll
 * factor, not the parent's, so once the camera has followed the delver a click lands beside the
 * row. It goes down with the label's container.
 */
export function menuOption(scene: MenuStage, spec: MenuOptionSpec): MenuOption {
  const { x, y, label, colour, onPick, name, origin, hit: size, tones } = spec;
  const enabled = spec.enabled ?? (() => true);
  const tone = () => toCss(enabled() ? colour : tones.dim);
  const text = scene.add
    .text(0, 0, label, { fontFamily: CANVAS_FONT.body, fontSize: "15px", color: tone() })
    .setOrigin(0.5);
  const option = Object.assign(scene.add.container(x, y, [text]).setName(`${name}-label`), {
    retone: () => void text.setColor(tone()),
  });

  const hit = scene.add
    .rectangle(origin.x + x, origin.y + y, size.width, size.height, tones.panel, 0)
    .setScrollFactor(0)
    .setDepth(MENU_DEPTH + 1)
    .setInteractive()
    .setName(name);
  // The cursor stays the gauntlet over a row; the text brightening is the hover cue
  // (FS-KYPQ9 §H.3). A dimmed row neither brightens nor answers.
  hit.on("pointerup", () => {
    if (enabled()) onPick();
  });
  hit.on("pointerover", () => {
    if (enabled()) text.setColor(toCss(tones.text));
  });
  hit.on("pointerout", () => text.setColor(tone()));
  option.once("destroy", () => hit.destroy());
  return option;
}

export interface MenuPanelSpec<C extends MenuChoice> {
  /** A line of copy over the rows, if the menu has something to say first. */
  line?: string;
  choices: C[];
  /** What picking a row does; a row without an action of its own closes the menu. */
  actions: Partial<Record<C["id"], () => void>>;
  /** Whether a row can be pressed now, read live; a row without one always can. */
  enabled?: Partial<Record<C["id"], () => boolean>>;
  /** What takes the menu down. */
  close: () => void;
  /** Where the box sits on the screen: the camera's centre. */
  origin: { x: number; y: number };
  hit: HitSize;
  tones: MenuTones;
}

export interface MenuPanel {
  /** The camera-fixed box, in the popup band; destroying it takes the hit areas with it. */
  container: Phaser.GameObjects.Container;
  keys: MenuKeys;
}

/**
 * A menu panel: a camera-fixed charcoal box with a brass hairline in the popup band, an optional
 * line over the rows, one row per choice. A number answers each actionable row, Enter the first;
 * the cancel row already says Esc on its label and is what Esc does. The caller holds the
 * container and the keys, and takes the previous menu down before building the next.
 */
export function showMenuPanel<C extends MenuChoice>(scene: MenuStage, spec: MenuPanelSpec<C>): MenuPanel {
  const { line, choices, actions, close, origin, tones } = spec;
  const enabled: Partial<Record<C["id"], () => boolean>> = spec.enabled ?? {};
  const lineHeight = line ? MENU_LINE : 0;
  const panelHeight = MENU_PAD * 2 + lineHeight + choices.length * MENU_ROW;
  const top = -panelHeight / 2;

  const panel = scene.add.graphics();
  panel.fillStyle(tones.panel, 0.96);
  panel.fillRect(-MENU_WIDTH / 2, top, MENU_WIDTH, panelHeight);
  panel.lineStyle(1, tones.frame, 0.5);
  panel.strokeRect(-MENU_WIDTH / 2, top, MENU_WIDTH, panelHeight);
  const parts: Phaser.GameObjects.GameObject[] = [panel];
  if (line) {
    parts.push(
      scene.add
        .text(0, top + MENU_PAD + MENU_LINE / 2, line, {
          fontFamily: CANVAS_FONT.body,
          fontSize: "15px",
          color: toCss(tones.text),
          align: "center",
          wordWrap: { width: MENU_WIDTH - 32 },
        })
        .setOrigin(0.5),
    );
  }

  const act = (choice: C) => actions[choice.id as C["id"]] ?? close;
  const can = (choice: C) => enabled[choice.id as C["id"]] ?? (() => true);
  const actionable = choices.filter((c) => c.register === "actionable");
  // each thing to do answers to its number; the cancel row already says Esc on its label
  const hint = (choice: C) => (choice.register === "actionable" ? `  [${actionable.indexOf(choice) + 1}]` : "");
  const options = choices.map((choice, i) =>
    menuOption(scene, {
      x: 0,
      y: top + MENU_PAD + lineHeight + MENU_ROW * (i + 0.5),
      label: `${choice.label}${hint(choice)}`,
      colour: choice.register === "actionable" ? tones.actionable : tones.cancel,
      onPick: act(choice),
      name: `menu-${choice.id}`,
      origin,
      enabled: can(choice),
      hit: spec.hit,
      tones,
    }),
  );
  const press = (choice?: C) => {
    if (choice && can(choice)()) act(choice)();
  };
  const cancel = choices.find((c) => c.register === "cancel");

  const keys: MenuKeys = {
    pick: (index) => press(actionable[index]),
    confirm: () => press(actionable[0]),
    dismiss: () => (cancel ? press(cancel) : close()),
    retone: () => options.forEach((option) => option.retone()),
  };
  const container = scene.add
    .container(origin.x, origin.y, [...parts, ...options])
    .setScrollFactor(0)
    .setDepth(MENU_DEPTH);
  return { container, keys };
}
