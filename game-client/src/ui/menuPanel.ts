/**
 * The chrome of a canvas menu, shared by the hub's ESC menu, the field's, the run's ESC menu and
 * its Fall confirm, and the hub's NPC dialogue's rows: a camera-fixed box in the party panel's
 * frame (`drawPanelFrame`, its × doing what Esc does; FS-G4VMQ § Change: The menu wears the party
 * panel's frame) in the popup band, an optional line of copy over the rows, and one pressable row
 * per choice. While it is open it owns the screen: a blocker over the whole view under it takes
 * every press and hover but the Menu icon's, which closes it (FS-3EBCA R18). What a
 * menu offers is each scene's rule (`hubMenuChoices`, `runMenuChoices`, `FALL_CONFIRM`); what
 * it looks like and how its keys land is this module's.
 *
 * Colour comes in as the scene's tokens (`MenuTones`): the hub reads `BARROW_HEX`, the run reads
 * `palette`, and the chrome takes no colour of its own (ADR-0013).
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
import { PANEL_TITLE_BAND, drawPanelFrame, drawPanelTitle, lightClose } from "./panelFrame";

/** The popup band: menus and dialogues sit here, over the HUD (1000) and the result card (1500). */
export const MENU_DEPTH = 2000;
/**
 * The open menu's blocker (FS-3EBCA R18): under its box, rows and ×, over the HUD (1000), the
 * party panel (1110), the result card (1500) and the letter panel (1800).
 */
export const MENU_BLOCKER_DEPTH = MENU_DEPTH - 1;
/** The panel: its width, the vertical padding, the copy line's row and one row per choice, in screen px. */
export const MENU_WIDTH = 320;
export const MENU_PAD = 18;
export const MENU_LINE = 44;
export const MENU_ROW = 40;
/** Every menu's title, in the windows' one title style (FS-3EBCA R23: "menu目前沒標題也加上"). */
export const MENU_TITLE = "MENU";

/** What a menu is drawn in, as the scene's own palette tokens. */
export interface MenuTones {
  /** The fill of the invisible hit rectangles (the ground itself is the party panel's frame). */
  panel: number;
  /** Kept for the scenes' tone sets; the frame's brass is the party panel's. */
  frame: number;
  /** The copy line over the rows, and a row brightened under the pointer. */
  text: number;
  /** A row that cannot be pressed now. */
  dim: number;
  /** A row the player can act on. */
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

/**
 * A drawn row, which can redraw its colour when whether it can be pressed changes, and stand its
 * hit area under the label again once the box has moved to `origin` (FS-ZAJMH R13).
 */
export type MenuOption = Phaser.GameObjects.Container & {
  retone(): void;
  place(origin: { x: number; y: number }): void;
};

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
 * factor, not the parent's, so once the camera has followed the player a click lands beside the
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
    place: (at: { x: number; y: number }) => void hit.setPosition(at.x + x, at.y + y),
  });

  const hit = scene.add
    .rectangle(origin.x + x, origin.y + y, size.width, size.height, tones.panel, 0)
    .setScrollFactor(0)
    .setDepth(MENU_DEPTH + 1)
    .setInteractive()
    .setName(name);
  // The cursor stays the hand over a row; the text brightening is the hover cue
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
  /**
   * A screen point the blocker leaves to what is drawn under it: the corner row's Menu plate, so a
   * press there closes the menu and a hover there lights the icon (FS-3EBCA R18). Omitted, none.
   */
  through?: (x: number, y: number) => boolean;
}

export interface MenuPanel {
  /** The camera-fixed box, in the popup band; destroying it takes the hit areas with it. */
  container: Phaser.GameObjects.Container;
  keys: MenuKeys;
  /** The box, its hit areas with it, to a new place on the screen: the logical view changed (FS-ZAJMH R13). */
  moveTo(origin: { x: number; y: number }): void;
}

/**
 * A menu panel: a camera-fixed box in the party panel's frame in the popup band, titled MENU, an
 * optional line over the rows, one row per choice. A number answers each actionable row, Enter the first;
 * the cancel row already says Esc on its label and is what Esc does. The caller holds the
 * container and the keys, and takes the previous menu down before building the next.
 */
export function showMenuPanel<C extends MenuChoice>(scene: MenuStage, spec: MenuPanelSpec<C>): MenuPanel {
  const { line, choices, actions, close, origin, tones } = spec;
  const enabled: Partial<Record<C["id"], () => boolean>> = spec.enabled ?? {};
  const lineHeight = line ? MENU_LINE : 0;
  // the title's band over the copy line and the rows, which keep their gaps under it (FS-3EBCA R23)
  const panelHeight = PANEL_TITLE_BAND + lineHeight + choices.length * MENU_ROW + MENU_PAD;
  const top = -panelHeight / 2;
  const below = top + PANEL_TITLE_BAND;

  const panel = scene.add.graphics();
  const box = { x: -MENU_WIDTH / 2, y: top, width: MENU_WIDTH, height: panelHeight };
  const frame = drawPanelFrame(scene, panel, box);
  const parts: Phaser.GameObjects.GameObject[] = [panel, frame.glyph, drawPanelTitle(scene, box, MENU_TITLE)];
  if (line) {
    parts.push(
      scene.add
        .text(0, below + MENU_LINE / 2, line, {
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
      y: below + lineHeight + MENU_ROW * (i + 0.5),
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

  // the frame's ×, Esc's own way out (§ Change C2)
  const closeHit = frameCloseHit(scene, { frame, origin, tones, name: "menu-close", onPress: () => keys.dismiss() });
  const blocker = menuBlocker(scene, { through: spec.through, name: "menu-blocker" });
  container.once("destroy", () => {
    closeHit.destroy();
    blocker.destroy();
  });

  const moveTo = (at: { x: number; y: number }) => {
    container.setPosition(at.x, at.y);
    options.forEach((option) => option.place(at));
    closeHit.place(at);
    blocker.setSize(viewport.width, viewport.height);
    crispen([container]);
  };
  return { container, keys, moveTo };
}

export interface FrameCloseHitSpec {
  /** What `drawPanelFrame` returned: the × box in the panel's space, and its glyph. */
  frame: { close: { x: number; y: number; width: number; height: number }; glyph: Phaser.GameObjects.Text };
  /** Where the panel's box sits on the screen. */
  origin: { x: number; y: number };
  tones: Pick<MenuTones, "panel">;
  name: string;
  onPress: () => void;
}

/**
 * A panel frame's × made pressable (FS-G4VMQ § Change C2): its hit is camera-fixed beside the box,
 * as a row's is, since Phaser hit-tests a container's child with the child's own scroll factor.
 * The caller takes it down with the panel, and stands it under the × again once the box moves.
 */
export function frameCloseHit(
  scene: MenuStage,
  spec: FrameCloseHitSpec,
): Phaser.GameObjects.Rectangle & { place(origin: { x: number; y: number }): void } {
  const { frame, origin, tones, name, onPress } = spec;
  const cross = frame.close;
  const centre = { x: cross.x + cross.width / 2, y: cross.y + cross.height / 2 };
  const hit = scene.add
    .rectangle(origin.x + centre.x, origin.y + centre.y, cross.width, cross.height, tones.panel, 0)
    .setScrollFactor(0)
    .setDepth(MENU_DEPTH + 1)
    .setInteractive({ useHandCursor: true })
    .setName(name);
  hit.on("pointerup", onPress);
  hit.on("pointerover", () => lightClose(frame.glyph, true));
  hit.on("pointerout", () => lightClose(frame.glyph, false));
  return Object.assign(hit, {
    place: (at: { x: number; y: number }) => void hit.setPosition(at.x + centre.x, at.y + centre.y),
  });
}

/**
 * The open menu's blocker (FS-3EBCA R18, owner: "menu開啟時其他都不能按"): a zone over the whole view
 * under the panel. Phaser hands a press and a hover to the topmost interactive object only, so
 * nothing drawn under it hears one, and the press stops here, so no scene-wide listener (the world,
 * the chat window) does. Its own hit test leaves out what `through` names, the Menu plate, which
 * then is the topmost there (owner: "menu無法再按一次icon關閉"). The zone stands at the view's origin,
 * so a local point is a screen point; it reads the view as it is now, as the caller's setSize
 * keeps the zone to it on a resize.
 */
export function menuBlocker(
  scene: MenuStage,
  spec: { through?: (x: number, y: number) => boolean; name: string },
): Phaser.GameObjects.Zone {
  const through = spec.through ?? (() => false);
  const takes = (_area: unknown, x: number, y: number) =>
    x >= 0 && y >= 0 && x < viewport.width && y < viewport.height && !through(x, y);
  const blocker = scene.add
    .zone(0, 0, viewport.width, viewport.height)
    .setOrigin(0)
    .setScrollFactor(0)
    .setDepth(MENU_BLOCKER_DEPTH)
    .setInteractive({}, takes)
    .setName(spec.name);
  blocker.on(
    "pointerdown",
    (_pointer: unknown, _x: number, _y: number, event?: { stopPropagation(): void }) => event?.stopPropagation(),
  );
  return blocker;
}
