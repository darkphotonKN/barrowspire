/**
 * The game's one pointer look (FS-KYPQ9 § Change: The pressed hand, and the hand on the menus): what
 * the canvas's default cursor shows, from a base the scenes set (the bone hand, the strike-mark over
 * a monster, or the browser's) and whether the left button is held. The bone hand shows pressed
 * while it is (P4); the strike-mark shows unchanged (P5).
 *
 * One per game, kept on the game's registry (P6, P10). Its one output is the game input manager's
 * `setDefaultCursor`: a scene's stop puts the manager's default back on the canvas
 * (InputPlugin.shutdown), so a raw write to the canvas's style would not stick. The press is read
 * off the page's own pointer events, not a scene's: Phaser dispatches a press to the top scene
 * only, a menu button starts its scene on the press, and a world can stop before the release.
 *
 * Phaser-free on purpose: it takes the slices of the game and the page it needs.
 */

import type { ArtLibrary } from "@/render/art/library";
import { cursorCss, cursorSource, type CursorSource, type CursorTextures } from "./cursors";

/** What the scenes ask for: the hand, the strike-mark over a monster, or the browser's own cursor. */
export type PointerBase = "hand" | "strike" | "browser";

/** Each cursor's CSS `cursor` value, made once per game. */
export interface PointerCursors {
  hand: string;
  handPressed: string;
  strike: string;
}

/** Where the pointer look writes: Phaser's InputManager is one. */
export interface CursorSink {
  setDefaultCursor(css: string): void;
}

/** The slices of a Phaser game the pointer look reads. `Phaser.Game` is one. */
export interface LookGame {
  registry: { get(key: string): unknown; set(key: string, value: unknown): unknown };
  canvas: EventTarget;
  input: CursorSink;
  events: { once(event: "destroy", fn: () => void): unknown };
}

/** The page the press is read from. */
export interface LookPage {
  window: EventTarget;
  document: EventTarget;
}

/** The left button: `button` when it is the one that changed, its bit in `buttons` while held. */
const LEFT = 0;
const LEFT_HELD = 1;

const POINTER_LOOK_KEY = "pointerLook";

/**
 * What marks a pointer look on the registry. A registered symbol, not the class: Fast Refresh
 * swaps this module and its class with it, and the game keeps the old module's pointer look.
 */
const POINTER_LOOK_BRAND = Symbol.for("barrowspire.pointerLook");

/**
 * The baked cursors as the pointer look shows them: the hand, the pressed hand and the strike-mark, each
 * cropped once. Without the pressed sheet a press shows the plain hand; without the others, the
 * browser's `default` and `crosshair` (P9).
 */
export function bakedCursors(source: CursorSource | null | undefined): PointerCursors {
  const hand = cursorCss("cursor_hand", "default", source);
  const pressed = cursorCss("cursor_hand_pressed", "default", source);
  return {
    hand,
    handPressed: pressed === "default" ? hand : pressed,
    strike: cursorCss("cursor_strike", "crosshair", source),
  };
}

export class PointerLook {
  readonly [POINTER_LOOK_BRAND] = true;
  private shownBase: PointerBase = "browser";
  private pressed = false;
  private shown?: string;
  private live = true;

  constructor(
    private readonly cursors: PointerCursors,
    private readonly sink: CursorSink,
  ) {}

  /** What the scene under the pointer shows: the hand, the strike-mark, or the browser's cursor. */
  base(base: PointerBase): void {
    this.shownBase = base;
    this.show();
  }

  /** The left button went down on the canvas. */
  press(): void {
    this.pressed = true;
    this.show();
  }

  /** The left button came up, or the page lost the pointer. */
  release(): void {
    this.pressed = false;
    this.show();
  }

  /** The game is gone: nothing more is written. */
  end(): void {
    this.live = false;
  }

  private css(): string {
    switch (this.shownBase) {
      case "browser":
        return "";
      case "strike":
        return this.cursors.strike;
      case "hand":
        return this.pressed ? this.cursors.handPressed : this.cursors.hand;
    }
  }

  private show(): void {
    if (!this.live) return;
    const css = this.css();
    if (css === this.shown) return;
    this.shown = css;
    this.sink.setDefaultCursor(css);
  }
}

type Buttons = Event & { button?: number; buttons?: number };

/**
 * Watches the left button for the pointer look `look`: a press on the canvas, the release anywhere
 * on the page. With another button held, the left's press and release come as moves (Pointer
 * Events' chorded buttons), so a move that changed the left presses, and one with the left no
 * longer held lets go. A cancel, a lost window or a hidden tab lets go too. Returns the unwatch.
 */
function watchLeft(look: PointerLook, canvas: EventTarget, page: LookPage): () => void {
  const held = (e: Buttons) => ((e.buttons ?? 0) & LEFT_HELD) !== 0;
  const onDown = (e: Buttons) => {
    if (e.button === LEFT) look.press();
  };
  const onChord = (e: Buttons) => {
    if (e.button === LEFT && held(e)) look.press();
  };
  const onUp = (e: Buttons) => {
    if (!held(e)) look.release();
  };
  const letGo = () => look.release();
  const on: [EventTarget, string, (e: Buttons) => void][] = [
    [canvas, "pointerdown", onDown],
    [canvas, "pointermove", onChord],
    [page.window, "pointerup", onUp],
    [page.window, "pointermove", onUp],
    [page.window, "pointercancel", letGo],
    [page.window, "blur", letGo],
    [page.document, "visibilitychange", letGo],
  ];
  for (const [target, type, fn] of on) target.addEventListener(type, fn);
  return () => {
    for (const [target, type, fn] of on) target.removeEventListener(type, fn);
  };
}

/** The game's pointer look, if one was made, by this module or one Fast Refresh swapped out. */
function lentPointerLook(registry: LookGame["registry"]): PointerLook | undefined {
  const lent = registry.get(POINTER_LOOK_KEY);
  const branded =
    typeof lent === "object" && lent !== null && (lent as Partial<PointerLook>)[POINTER_LOOK_BRAND] === true;
  return branded ? (lent as PointerLook) : undefined;
}

/**
 * The game's pointer look, made by the first ask with `cursors` and kept on its registry; every
 * later ask gets the same pointer look and `cursors` is not called again. It watches the page until the game is
 * destroyed.
 */
export function pointerLookOf(game: LookGame, cursors: () => PointerCursors, page: LookPage): PointerLook {
  const lent = lentPointerLook(game.registry);
  if (lent) return lent;
  const look = new PointerLook(cursors(), game.input);
  const unwatch = watchLeft(look, game.canvas, page);
  game.events.once("destroy", () => {
    unwatch();
    look.end();
  });
  game.registry.set(POINTER_LOOK_KEY, look);
  return look;
}

/**
 * A scene's pointer look, made if it is not made yet: for a scene with the art (the menus and the
 * worlds, after PreloadScene's resident `fx-0`), its cursors cropped from that art. No game or no
 * page, no pointer look: a scene stand-in.
 */
export function ensurePointerLook(
  scene: { game?: LookGame; textures: CursorTextures },
  art: Pick<ArtLibrary, "sheet">,
): PointerLook | undefined {
  const game = scene.game;
  if (!game?.registry) return undefined;
  if (typeof window === "undefined") return lentPointerLook(game.registry);
  return pointerLookOf(game, () => bakedCursors(cursorSource(art, scene.textures)), {
    window,
    document,
  });
}

/**
 * A scene's pointer look if the game has one, never made here: for a scene without the art (the
 * disconnect notice, a world's stop).
 */
export function findPointerLook(scene: { game?: LookGame }): PointerLook | undefined {
  const game = scene.game;
  return game?.registry ? lentPointerLook(game.registry) : undefined;
}
