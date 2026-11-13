import type Phaser from "phaser";
import { browserMusicStore, storedMusicLevel } from "@/audio/musicSetting";
import { viewport } from "@/render/viewport";
import { lentFullscreen } from "./gameFullscreen";
import { HudCorner } from "./HudCorner";
import { showMenuPanel, type MenuStage } from "./menuPanel";
import { openOptionsPanel } from "./optionsPanel";
import { GameUiBridge, lendUiBridge, reportWorld, uiBridgeOf, type UiBridge, type World, type WorldSide, type WorldUi } from "./uiBridge";
import { UiCornerRow } from "./uiSceneCorner";
import { UiMenuSlot, type MenuKeysPressed, type SlotPanel } from "./uiSceneMenu";

/** A world scene as the UI scene's tests reach it: its game's registry, its end, its UI and what it reports. */
interface WorldUnderTest {
  registry?: { get(key: string): unknown; set(key: string, value: unknown): void };
  events: { once(event: string, fn: () => void): unknown; off(event: string, fn: () => void): unknown };
  ui: WorldUi;
  worldSide(): WorldSide;
}

/** The UI scene's keys a test presses, by name. */
export type UiKey = "esc" | "enter" | "one" | "two" | "three" | "left" | "right";

/** The UI scene's side of a world under test, built on the world's own stage. */
export interface UiSceneOnStage {
  bridge: UiBridge;
  menu: UiMenuSlot;
  row?: UiCornerRow;
  /** The panel standing in the menu slot, as the stage made it, while the slot is filled. */
  panel(): Phaser.GameObjects.Container | undefined;
  /** One frame of the UI scene, before the world's update (Phaser steps the list from the top). */
  frame(pressed?: Partial<MenuKeysPressed>): void;
  /** A frame with this key pressed since the last. */
  key(name: UiKey): void;
}

const NUMBERS: readonly UiKey[] = ["one", "two", "three"];

/** The UI scene's side built over each world under test: one per world scene, as one UI scene per game. */
const sides = new WeakMap<object, UiSceneOnStage>();

/** The UI scene's side already built over `scene`, if any. */
export function uiSceneFor(scene: object): UiSceneOnStage | undefined {
  return sides.get(scene);
}

/**
 * The panel standing in the UI scene's menu slot over `scene`'s world, while it is filled (FS-TQZ5J
 * R16): whatever the world's stage made it as, read as a record.
 */
export function menuOver(scene: object): Record<string, unknown> | undefined {
  return sides.get(scene)?.panel() as Record<string, unknown> | undefined;
}

/** The keys pressed, as the UI scene hands them to its slot, for one named key. */
function pressedFor(name: UiKey): Partial<MenuKeysPressed> {
  if (name === "esc") return { esc: true };
  if (name === "enter") return { enter: true };
  if (name === "left") return { nudge: -1 };
  if (name === "right") return { nudge: 1 };
  return { numbered: NUMBERS.indexOf(name) };
}

/**
 * Test-only: the UI scene's interface for `scene`'s world, built as the UI scene builds it (FS-TQZ5J
 * R13, R16), on `scene`'s own stage so a test finds the menu's rows and the row's plates where it
 * found the world's own: the menu slot drawn with the shared chrome, and (unless `row: false`) the
 * corner row, its Menu the slot's. Where the world's game was lent no bridge yet, lends one (with no
 * sounds; `hearWorld` lends one with them); where the world has not reported, reports it as its
 * create does (`this.ui = reportWorld(this, world, this.worldSide())`, pinned in UIScene.test.ts).
 * The slot yields and the row is rebuilt on each report, as the UI scene's listener does. One side per
 * world scene: a later call hands back the one built, its row added if asked for now.
 */
export function uiSceneOn(scene: object, world: World, options: { row?: boolean } = {}): UiSceneOnStage {
  const built = sides.get(scene);
  if (built) {
    if (options.row !== false && !built.row) built.row = cornerRow(scene, built.bridge, built.menu);
    return built;
  }
  const s = scene as WorldUnderTest;
  let bridge = uiBridgeOf(s.registry);
  if (!bridge) {
    const held = new Map<string, unknown>();
    s.registry ??= { get: (key) => held.get(key), set: (key, value) => void held.set(key, value) };
    bridge = new GameUiBridge();
    lendUiBridge(s.registry, bridge);
  }
  if (bridge.world?.world !== world || s.ui !== bridge) s.ui = reportWorld(s, world, s.worldSide());
  const stage = scene as MenuStage;
  let standing: SlotPanel | undefined;
  const drawn = (panel: SlotPanel) => ((standing = panel), panel);
  const menu = new UiMenuSlot({
    bridge,
    draw: {
      menu: (spec) => drawn(showMenuPanel(stage, spec)),
      options: (spec) => drawn(openOptionsPanel(stage, spec)),
    },
    through: (x, y) => side.row?.covers(x, y, "menu") ?? false,
    centre: () => ({ x: viewport.centerX, y: viewport.centerY }),
    musicLevel: () => storedMusicLevel(browserMusicStore),
    fullscreen: () => lentFullscreen(s.registry),
  });
  const frame = (pressed: Partial<MenuKeysPressed> = {}) => {
    menu.keys({ esc: false, enter: false, numbered: -1, ...pressed });
    menu.sync();
    side.row?.sync();
  };
  const side: UiSceneOnStage = {
    bridge,
    menu,
    row: options.row === false ? undefined : cornerRow(scene, bridge, menu),
    panel: () => (menu.isOpen() ? (standing?.container as Phaser.GameObjects.Container | undefined) : undefined),
    frame,
    key: (name) => frame(pressedFor(name)),
  };
  bridge.onWorld((report) => {
    menu.sync();
    side.row?.show(report);
  });
  sides.set(scene, side);
  return side;
}

/** The corner row on `scene`'s stage, its Menu the slot's, built for the world reported. */
function cornerRow(scene: object, bridge: UiBridge, menu: UiMenuSlot): UiCornerRow {
  const row = new UiCornerRow(bridge, (icons) => new HudCorner(scene as Phaser.Scene, { icons }), () => menu.pressMenu());
  row.show(bridge.world);
  return row;
}
