import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ArtManifest } from "@/render/art/manifest";
import type { CursorSource } from "./cursors";
import { bakedCursors, scenePointerLook } from "./pointerLook";
import { STAND_IN_CURSORS, lookGame, pointerEvent } from "./pointerLook.standin";

// FS-KYPQ9 § Change: The pressed hand, and the hand on the menus. The owner, 2026-11-14: 「Ａ」 the
// index presses down, 「左鍵」 on the left button only, 「2好」 the menus wear the hand too,
// 「怪物的游標部分先不處理」 the strike-mark is left as it is.

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;
const HELD = { [LEFT]: 1, [MIDDLE]: 4, [RIGHT]: 2 } as const;

describe("the pointer look (FS-KYPQ9 § Change: The pressed hand, P4–P6)", () => {
  it("should show the hand, the pressed hand while the left button is held, and the hand on its release (P4)", () => {
    const page = lookGame();
    page.look().base("hand");
    expect(page.now()).toBe("hand");

    page.press();
    expect(page.now()).toBe("hand pressed");

    page.release();
    expect(page.now()).toBe("hand");
  });

  it.each([
    ["right", RIGHT],
    ["middle", MIDDLE],
  ] as const)("should keep the plain hand under a %s press: the Shadow Shot's aim, the parry (P4)", (_, button) => {
    const page = lookGame();
    page.look().base("hand");

    page.game.canvas.dispatchEvent(pointerEvent("pointerdown", button, HELD[button]));

    expect(page.shown).toEqual(["hand"]);
  });

  it("should show the strike-mark unchanged under a press (P5)", () => {
    const page = lookGame();
    const look = page.look();
    look.base("strike");

    page.press();
    expect(page.now()).toBe("strike-mark");
    page.release();
    expect(page.shown).toEqual(["strike-mark"]);
  });

  it("should show the pressed hand when the pointer leaves the monster mid-press, then the hand on the release (P5)", () => {
    const page = lookGame();
    const look = page.look();
    look.base("strike");
    page.press();

    look.base("hand");
    expect(page.now()).toBe("hand pressed");
    page.release();
    expect(page.now()).toBe("hand");
  });

  it("should show the strike-mark when the pointer comes onto a monster mid-press (P5)", () => {
    const page = lookGame();
    const look = page.look();
    look.base("hand");
    page.press();

    look.base("strike");
    expect(page.now()).toBe("strike-mark");
  });

  it("should let go on a release anywhere on the page, a cancel, a lost window or a hidden tab (P6)", () => {
    const page = lookGame();
    page.look().base("hand");
    const lettingGo: (() => void)[] = [
      () => page.release(),
      () => page.page.window.dispatchEvent(pointerEvent("pointercancel", LEFT, 0)),
      () => page.page.window.dispatchEvent(new Event("blur")),
      () => page.page.document.dispatchEvent(new Event("visibilitychange")),
    ];
    for (const letGo of lettingGo) {
      page.press();
      expect(page.now()).toBe("hand pressed");
      letGo();
      expect(page.now()).toBe("hand");
    }
  });

  it("should not press on a press off the canvas: the chat field, the page (edge states)", () => {
    const page = lookGame();
    page.look().base("hand");

    page.page.window.dispatchEvent(pointerEvent("pointerdown", LEFT, HELD[LEFT]));

    expect(page.shown).toEqual(["hand"]);
  });

  it("should press while the left is down with the right, whichever went down first (edge states)", () => {
    const page = lookGame();
    page.look().base("hand");
    // the right first: the left's press is a move with the left changed (Pointer Events' chorded buttons)
    page.game.canvas.dispatchEvent(pointerEvent("pointerdown", RIGHT, HELD[RIGHT]));
    page.game.canvas.dispatchEvent(pointerEvent("pointermove", LEFT, HELD[RIGHT] | HELD[LEFT]));
    expect(page.now()).toBe("hand pressed");
    // the left comes up with the right still held: a move, no pointerup
    page.page.window.dispatchEvent(pointerEvent("pointermove", LEFT, HELD[RIGHT]));
    expect(page.now()).toBe("hand");

    // the left first, then the right, then the left up
    page.press();
    page.page.window.dispatchEvent(pointerEvent("pointermove", RIGHT, HELD[LEFT] | HELD[RIGHT]));
    expect(page.now()).toBe("hand pressed");
    page.page.window.dispatchEvent(pointerEvent("pointermove", LEFT, HELD[RIGHT]));
    expect(page.now()).toBe("hand");
  });

  it("should not let go on a move with the left still held", () => {
    const page = lookGame();
    page.look().base("hand");
    page.press();

    page.page.window.dispatchEvent(pointerEvent("pointermove", -1, HELD[LEFT]));

    expect(page.now()).toBe("hand pressed");
  });

  it("should show the browser's cursor on the browser base, pressed or not", () => {
    const page = lookGame();
    const look = page.look();
    look.base("hand");
    look.base("browser");
    expect(page.now()).toBe("");

    page.press();
    expect(page.now()).toBe("");
  });

  it("should set the canvas's cursor only when what it shows changes", () => {
    const page = lookGame();
    const look = page.look();
    look.base("hand");
    look.base("hand");
    page.release();
    page.press();
    page.press();

    expect(page.shown).toEqual(["hand", "hand pressed"]);
  });
});

describe("one pointer look per game (FS-KYPQ9 § Change: The pressed hand, P6, P10)", () => {
  it("should give every ask the same look, its cursors made once, its listeners added once", () => {
    const page = lookGame();
    const cursors = vi.fn(() => STAND_IN_CURSORS);
    const { pointerLookOf } = page;
    const first = pointerLookOf(cursors);
    const second = pointerLookOf(cursors);

    expect(second).toBe(first);
    expect(cursors).toHaveBeenCalledTimes(1);
    first.base("hand");
    page.press();
    expect(page.shown).toEqual(["hand", "hand pressed"]);
  });

  it("should take its listeners off and write nothing more once the game is destroyed", () => {
    const page = lookGame();
    const look = page.look();
    look.base("hand");

    page.destroy();
    page.press();
    look.base("strike");

    expect(page.shown).toEqual(["hand"]);
  });
});

describe("the baked cursors as the look shows them (FS-KYPQ9 § Change: The pressed hand, P2, P9)", () => {
  const SHEETS = ["cursor_hand", "cursor_hand_pressed", "cursor_strike"];
  /** A source holding `sheets`, each image its name. */
  const sourceOf = (sheets: string[]): CursorSource => ({
    sheet: (name) => (sheets.includes(name) ? { anchor: { x: 0.1875, y: 0.03125 } } : undefined),
    image: (name) => (sheets.includes(name) ? { url: name, width: 32, height: 32 } : undefined),
  });

  it("should make each cursor's CSS from its sheet, the pressed hand on the hand's hotspot", () => {
    expect(bakedCursors(sourceOf(SHEETS))).toEqual({
      hand: "url(cursor_hand) 6 1, default",
      handPressed: "url(cursor_hand_pressed) 6 1, default",
      strike: "url(cursor_strike) 6 1, crosshair",
    });
  });

  it("should show the plain hand on a press without the pressed sheet (P9)", () => {
    const cursors = bakedCursors(sourceOf(["cursor_hand", "cursor_strike"]));
    expect(cursors.handPressed).toBe(cursors.hand);
  });

  it("should fall back to the browser's cursors without the art (P9)", () => {
    expect(bakedCursors(null)).toEqual({ hand: "default", handPressed: "default", strike: "crosshair" });
  });

  it("should crop each image once", () => {
    const source = sourceOf(SHEETS);
    const image = vi.spyOn(source, "image");
    bakedCursors(source);
    expect(image.mock.calls.map(([name]) => name).sort()).toEqual([...SHEETS].sort());
  });
});

describe("a scene's pointer look (FS-KYPQ9 § Change: The pressed hand, P7)", () => {
  const textures = { getBase64: () => "" };

  it("should find the game's look for a scene without the art, and make none", () => {
    const page = lookGame();
    expect(scenePointerLook({ game: page.game, textures })).toBeUndefined();

    const look = page.look();
    expect(scenePointerLook({ game: page.game, textures })).toBe(look);
  });

  it("should make the game's look from a scene with the art, its cursors cropped from that art", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", new EventTarget());
    try {
      const page = lookGame();
      const baked: ArtManifest = JSON.parse(
        readFileSync(path.join(__dirname, "../../../public/art/manifest.json"), "utf8"),
      );
      const scene = { game: page.game, textures: { getBase64: (_key: string, frame?: string | number) => `data:${frame}` } };

      const look = scenePointerLook(scene, { sheet: (name) => baked.sheets[name] });
      look?.base("hand");
      expect(page.now()).toBe("url(data:cursor_hand/default/0/0) 6 1, default");
      window.dispatchEvent(pointerEvent("pointerup", LEFT, 0));
      page.press();
      expect(page.now()).toBe("url(data:cursor_hand_pressed/default/0/0) 6 1, default");
      window.dispatchEvent(pointerEvent("pointerup", LEFT, 0));
      expect(page.now()).toBe("url(data:cursor_hand/default/0/0) 6 1, default");
      expect(scenePointerLook({ game: page.game, textures })).toBe(look);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should give a scene with no game no look (a stand-in)", () => {
    expect(scenePointerLook({ textures }, { sheet: () => undefined })).toBeUndefined();
  });
});

// P10: the canvas's default cursor has one writer, the look; and P7: each scene the player sees
// asks it for the hand. Pinned on the source, as boneHand.test.ts pins the hover rule.
describe("the look is the canvas cursor's one writer (FS-KYPQ9 § Change: The pressed hand, P7, P10)", () => {
  const SRC = path.resolve(__dirname, "../..");
  const OUTSIDE_THE_CANVAS = ["app", "components", "api"].map((dir) => path.join(SRC, dir));
  const sources = (dir: string): string[] =>
    OUTSIDE_THE_CANVAS.includes(dir)
      ? []
      : readdirSync(dir).flatMap((name) => {
          const file = path.join(dir, name);
          if (statSync(file).isDirectory()) return sources(file);
          return /\.tsx?$/.test(name) && !/\.(test|standin)\.tsx?$/.test(name) ? [file] : [];
        });
  const read = (file: string) => readFileSync(path.join(SRC, file), "utf8");

  it("should have no scene set the default cursor itself", () => {
    const own = path.join(SRC, "render/cursors");
    const offenders = sources(SRC)
      .filter((file) => !file.startsWith(own))
      .filter((file) => /\.setDefaultCursor\(/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it.each(["scenes/MainMenuScene.ts", "scenes/CharacterCreationScene.ts", "scenes/HubScene.ts"])(
    "should have %s ask the look for the hand with its art",
    (file) => {
      expect(read(file)).toMatch(/scenePointerLook\(this, this\.art\)\?\.base\("hand"\)/);
    },
  );
});
