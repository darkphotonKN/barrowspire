import { createRequire } from "node:module";
import path from "node:path";
import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import { keepTab, takeFocusOnPress } from "./gameFocus";

// Tab on /game moved the browser's focus off the game onto the page's buttons: the header's links,
// the user menu, the fullscreen button (reported 2026-11-12). Only the run captured Tab, and
// Phaser's capture never holds a key pressed with Shift, so in the hub and the fields Tab, and
// everywhere Shift+Tab, was the browser's. Once a button held focus, a press on the canvas never
// took it back (Phaser prevents a canvas mousedown's default), so the game's keys went on landing
// on it: in a field, where Enter is not captured, Enter followed the focused header link off /game.

// Phaser 4.2.1's own KeyboardManager, the listener on window that calls preventDefault for a
// captured key: loaded from its source, since the package exports only its bundles.
const phaserSrc = path.join(
  path.dirname(createRequire(import.meta.url).resolve("phaser/package.json")),
  "src",
);
const load = (file: string) =>
  createRequire(import.meta.url)(path.join(phaserSrc, file));
const KeyboardManager = load("input/keyboard/KeyboardManager.js");
const InputEvents = load("input/events/index.js");

const TAB = 9;
// the hub's keys (HubScene.bindInput): the cursor keys with Space and Shift, E Enter Esc I B 1 2 3 W A S D
const HUB_CAPTURES = [38, 40, 37, 39, 32, 16, 69, 13, 27, 73, 66, 49, 50, 51, 87, 83, 65, 68];

interface PhaserKeyboard {
  queue: unknown[];
  addCapture(codes: number | number[]): void;
}

/**
 * A game as far as its keyboard boots: `new Phaser.Game` makes the InputManager, which subscribes to
 * the game's BOOT before any code after the constructor can (InputManager.js `initialize`), and
 * on BOOT boots the KeyboardManager, which starts listening on window (KeyboardManager.js `boot`).
 */
function gameOn(win: EventTarget) {
  const events = new EventEmitter();
  const inputEvents = new EventEmitter();
  const keyboard: PhaserKeyboard = new KeyboardManager({
    events: inputEvents,
    config: { inputKeyboard: true, inputKeyboardEventTarget: win, inputKeyboardCapture: [] },
    game: { events: new EventEmitter() },
  });
  const game = { isBooted: false, events };
  events.once("boot", () => inputEvents.emit(InputEvents.MANAGER_BOOT));
  const boot = () => {
    game.isBooted = true;
    events.emit("boot");
  };
  return { game, keyboard, boot };
}

/** A page: the body, the root, and whatever holds focus now (null or the body: nothing does). */
function pageWith() {
  const body = { blur() {} };
  const documentElement = {};
  const doc = { body, documentElement, activeElement: body as unknown };
  return doc;
}

/** A focusable control on the page; `blurred` says whether it lost focus. */
function control(doc: { activeElement: unknown; body: unknown }) {
  const el = {
    blurred: false,
    blur() {
      el.blurred = true;
      if (doc.activeElement === el) doc.activeElement = doc.body;
    },
  };
  return el;
}

/** A key pressed on the page; returns whether its default (moving focus, for Tab) was prevented. */
function press(
  win: EventTarget,
  key: string,
  keyCode: number,
  mods: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
) {
  const e = new Event("keydown", { cancelable: true });
  Object.assign(e, { key, keyCode, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });
  win.dispatchEvent(e);
  return e.defaultPrevented;
}

const asDoc = (doc: object) => doc as unknown as Parameters<typeof keepTab>[2];

describe("keepTab: Tab stays in the game while the game is played (reported 2026-11-12)", () => {
  it("should keep Tab from moving focus in the hub, where no key of the scene captures it", () => {
    const win = new EventTarget();
    const { game, keyboard, boot } = gameOn(win);
    boot();
    keyboard.addCapture(HUB_CAPTURES);
    keepTab(game, win, asDoc(pageWith()));

    expect(press(win, "Tab", TAB)).toBe(true);
    // the game's own keys are as they were
    expect(press(win, "w", 87)).toBe(true);
  });

  it("should still let the game hear Tab, so the run's watch cycles (FS-QPDKN req 8)", () => {
    const win = new EventTarget();
    const { game, keyboard, boot } = gameOn(win);
    boot();
    keepTab(game, win, asDoc(pageWith()));

    expect(press(win, "Tab", TAB)).toBe(true);
    // Phaser drops a key whose default is already prevented: this one reached its queue
    expect(keyboard.queue).toHaveLength(1);
  });

  it("should listen behind Phaser when asked before the game booted", () => {
    const win = new EventTarget();
    const { game, keyboard, boot } = gameOn(win);
    keepTab(game, win, asDoc(pageWith()));
    boot();

    expect(press(win, "Tab", TAB)).toBe(true);
    expect(keyboard.queue).toHaveLength(1);
  });

  it("should leave Tab to the browser while a control on the page holds focus (a header link, the fullscreen button, a text field)", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    boot();
    const doc = pageWith();
    keepTab(game, win, asDoc(doc));
    doc.activeElement = control(doc);

    expect(press(win, "Tab", TAB)).toBe(false);
  });

  it("should treat no focus at all, or the root holding it, as the game's", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    boot();
    const doc = pageWith();
    keepTab(game, win, asDoc(doc));

    doc.activeElement = null;
    expect(press(win, "Tab", TAB)).toBe(true);
    doc.activeElement = doc.documentElement;
    expect(press(win, "Tab", TAB)).toBe(true);
  });

  it("should leave Shift+Tab to the browser, the keyboard player's way out to the page (FS-ZAJMH US 25)", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    boot();
    keepTab(game, win, asDoc(pageWith()));

    expect(press(win, "Tab", TAB, { shiftKey: true })).toBe(false);
  });

  it("should leave the browser's own Ctrl, Alt and Meta Tab alone", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    boot();
    keepTab(game, win, asDoc(pageWith()));

    expect(press(win, "Tab", TAB, { ctrlKey: true })).toBe(false);
    expect(press(win, "Tab", TAB, { altKey: true })).toBe(false);
    expect(press(win, "Tab", TAB, { metaKey: true })).toBe(false);
  });

  it("should give Tab back on release, so the site's other pages keep it", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    boot();
    const release = keepTab(game, win, asDoc(pageWith()));

    release();

    expect(press(win, "Tab", TAB)).toBe(false);
  });

  it("should never start listening once released before the game booted", () => {
    const win = new EventTarget();
    const { game, boot } = gameOn(win);
    const release = keepTab(game, win, asDoc(pageWith()));

    release();
    boot();

    expect(press(win, "Tab", TAB)).toBe(false);
  });
});

/** The canvas's holder: Phaser's parent, the canvas and its DOM layer (the chat field) inside it. */
function holderOf(inside: unknown[]) {
  const holder = new EventTarget() as EventTarget & { contains(other: unknown): boolean };
  holder.contains = (other) => inside.includes(other);
  return holder;
}

const pressOn = (holder: EventTarget) => holder.dispatchEvent(new Event("pointerdown"));
const asHolder = (holder: object) => holder as unknown as Parameters<typeof takeFocusOnPress>[0];

describe("takeFocusOnPress: a press on the game gives the keyboard back to it (reported 2026-11-12)", () => {
  it("should take focus off a page control when the canvas is pressed, so Tab and Enter are the game's again", () => {
    const doc = pageWith();
    const holder = holderOf([]);
    takeFocusOnPress(asHolder(holder), asDoc(doc));
    const link = control(doc);
    doc.activeElement = link;

    pressOn(holder);

    expect(link.blurred).toBe(true);
    expect(doc.activeElement).toBe(doc.body);
  });

  it("should leave a field inside the game to its own rules (the chat input keeps focus on its panel)", () => {
    const doc = pageWith();
    const chatField = control(doc);
    const holder = holderOf([chatField]);
    takeFocusOnPress(asHolder(holder), asDoc(doc));
    doc.activeElement = chatField;

    pressOn(holder);

    expect(chatField.blurred).toBe(false);
  });

  it("should stop on release, leaving /game", () => {
    const doc = pageWith();
    const holder = holderOf([]);
    const release = takeFocusOnPress(asHolder(holder), asDoc(doc));
    const link = control(doc);
    doc.activeElement = link;

    release();
    pressOn(holder);

    expect(link.blurred).toBe(false);
  });
});
