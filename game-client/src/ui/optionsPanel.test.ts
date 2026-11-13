import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@/characters/roster";
import { MUSIC_SETTING_KEY } from "@/audio/musicSetting";
import { SFX_SETTING_KEY } from "@/audio/sfxSetting";
import { BARROW_HEX } from "@/utils/theme";
import { toCss } from "@/utils/canvasPalette";
import { viewport } from "@/render/viewport";
import { MENU_BLOCKER_DEPTH, MENU_DEPTH, type MenuStage, type MenuTones } from "./menuPanel";
import { drawPanelFrame, drawPanelTitle } from "./panelFrame";
import {
  OPTIONS_CHOICE,
  OPTIONS_ROW,
  OPTIONS_TITLE,
  OPTIONS_WIDTH,
  openOptionsPanel,
  showOptionsPanel,
  type MusicLevelControl,
  type SettingRow,
} from "./optionsPanel";

// The windows' frame and title are one drawing each, which this panel must call, not copy
// (FS-28DDG § Change: Music volume in an Options panel, C3).
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelFrame: vi.fn(real.drawPanelFrame), drawPanelTitle: vi.fn(real.drawPanelTitle) };
});

/** A scene object as the stand-in stage made it. A graphics object records what it was drawn with since its last clear. */
interface Made {
  kind: string;
  args: unknown[];
  name?: string;
  destroyed: boolean;
  depth?: number;
  scrollFactor?: number;
  color?: string;
  origin?: unknown[];
  x: number;
  y: number;
  size?: number[];
  interactive?: boolean;
  interactiveArgs?: unknown[];
  children: Made[];
  drawn: { call: string; args: number[] }[];
  handlers: Record<string, (...args: unknown[]) => void>;
}

/**
 * A stand-in for the slice of Phaser the panel draws with: every object is recorded by kind and
 * answers any call; a graphics object keeps its draw calls since its last clear; destroying a
 * container destroys what it holds and runs what was hung on `destroy`, as Phaser does.
 */
function recordingStage() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[] = []): unknown => {
    const self = {
      kind,
      args,
      destroyed: false,
      color: undefined,
      x: typeof args[0] === "number" ? args[0] : 0,
      y: typeof args[1] === "number" ? args[1] : 0,
      children: [] as Made[],
      drawn: [] as Made["drawn"],
      handlers: {} as Made["handlers"],
    } as Made & { [k: string]: unknown };
    if (kind === "container" && Array.isArray(args[2])) self.children.push(...(args[2] as Made[]));
    const kill = (m: Made) => {
      if (m.destroyed) return;
      m.destroyed = true;
      m.children.forEach(kill);
      m.handlers.destroy?.();
    };
    const setter = (prop: string) => (value: unknown) => {
      self[prop] = value;
      return proxy;
    };
    const proxy: unknown = new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "then") return undefined;
        if (prop === "destroy") return () => kill(target);
        if (prop === "setDepth") return setter("depth");
        if (prop === "setName") return setter("name");
        if (prop === "setScrollFactor") return setter("scrollFactor");
        if (prop === "setColor") return setter("color");
        if (prop === "setOrigin") return (...a: unknown[]) => ((target.origin = a), proxy);
        if (prop === "setInteractive")
          return (...a: unknown[]) => {
            target.interactive = true;
            target.interactiveArgs = a;
            return proxy;
          };
        if (prop === "setSize") return (w: number, h: number) => ((target.size = [w, h]), proxy);
        if (prop === "setPosition")
          return (x: number, y: number) => {
            target.x = x;
            target.y = y;
            return proxy;
          };
        if (prop === "on" || prop === "once")
          return (event: string, fn: () => void) => {
            target.handlers[event] = fn;
            return proxy;
          };
        if (kind === "graphics") {
          if (prop === "clear") return () => ((target.drawn = []), proxy);
          return (...a: number[]) => {
            target.drawn.push({ call: String(prop), args: a });
            return proxy;
          };
        }
        return () => proxy;
      },
    });
    made.push(proxy as Made);
    return proxy;
  };
  const add = new Proxy({}, { get: (_, kind) => (...args: unknown[]) => make(String(kind), args) });
  const scene = { add } as unknown as MenuStage;
  const find = (name: string) => made.find((m) => m.name === name && !m.destroyed);
  const texts = () => made.filter((m) => m.kind === "text" && !m.destroyed);
  return { made, scene, find, texts };
}

/** What an object was named, or nothing: an unnamed stand-in answers `name` with a call. */
const named = (m: Made) => (typeof m.name === "string" ? m.name : "");

const TONES: MenuTones = {
  panel: BARROW_HEX.charcoal,
  frame: BARROW_HEX.brass,
  text: BARROW_HEX.vellum,
  dim: BARROW_HEX.vellumDark,
  actionable: BARROW_HEX.amber,
  cancel: BARROW_HEX.arcane,
};
const HIT = { width: 160, height: 34 };
const ORIGIN = { x: 400, y: 300 };

/** A music level control holding `level`, as the stored-only control or the hub's music would. */
function musicAt(level: number) {
  let current = level;
  const set = vi.fn((next: number) => void (current = next));
  const control: MusicLevelControl = { level: () => current, setLevel: set };
  return { ...control, set };
}

function opened(
  level = 3,
  through?: (x: number, y: number) => boolean,
  row = "music",
  effects: MusicLevelControl | null = musicAt(3),
) {
  const stage = recordingStage();
  const music = musicAt(level);
  const back = vi.fn();
  const panel = openOptionsPanel(stage.scene, {
    origin: ORIGIN,
    hit: HIT,
    tones: TONES,
    back,
    music,
    through,
    ...(effects ? { effects } : {}),
  });
  const hit = (part: string) => stage.find(`options-${row}-${part}`)!;
  const mark = (part: string) => stage.find(`options-${row}-${part}-mark`)!;
  /** The one colour a mark was last drawn in. */
  const tone = (part: string) => {
    const fills = mark(part).drawn.filter((d) => d.call === "fillStyle").map((d) => d.args[0]);
    expect(new Set(fills).size, `${part} is drawn in one colour`).toBe(1);
    return fills[0];
  };
  /** Whether a step is drawn solid (one rectangle) rather than as an outline (four). */
  const filled = (k: number) => mark(`step-${k}`).drawn.filter((d) => d.call === "fillRect").length === 1;
  const steps = () => [1, 2, 3, 4, 5].map(filled);
  return { ...stage, ...panel, container: panel.container as unknown as Made, music, back, hit, mark, tone, steps };
}

describe("the Options choice and the panel's tunables (FS-28DDG § Change: Music volume in an Options panel, C1–C4)", () => {
  it("should offer Options as an actionable row, and name the panel's width and row height", () => {
    expect(OPTIONS_CHOICE).toEqual({ id: "options", label: "Options", register: "actionable" });
    expect(OPTIONS_TITLE).toBe("OPTIONS");
    expect(OPTIONS_WIDTH).toBe(480);
    expect(OPTIONS_ROW).toBeGreaterThan(0);
  });
});

describe("openOptionsPanel (FS-28DDG § Change C3–C8, C16)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should build a camera-fixed box in the popup band at the origin, framed and titled OPTIONS, OPTIONS_WIDTH wide", () => {
    vi.mocked(drawPanelFrame).mockClear();
    vi.mocked(drawPanelTitle).mockClear();
    const { container } = opened();

    expect(container.kind).toBe("container");
    expect([container.x, container.y]).toEqual([ORIGIN.x, ORIGIN.y]);
    expect(container.scrollFactor).toBe(0);
    expect(container.depth).toBe(MENU_DEPTH);
    const box = vi.mocked(drawPanelFrame).mock.calls[0][2];
    expect(box.width).toBe(OPTIONS_WIDTH);
    expect(box.x).toBe(-OPTIONS_WIDTH / 2);
    expect(box.y).toBe(-box.height / 2);
    expect(vi.mocked(drawPanelTitle).mock.calls[0][2]).toBe(OPTIONS_TITLE);
  });

  it("should show one setting row, Music, and Back [Esc] at its foot in the cancel register", () => {
    const { texts, find } = opened();
    const words = texts().map((t) => String(t.args[2]));

    expect(words).toContain("Music");
    expect(words).toContain("Back  [Esc]");
    const back = find("options-back-label")!.children[0];
    expect(back.args[3]).toMatchObject({ color: toCss(TONES.cancel) });
    const music = texts().find((t) => t.args[2] === "Music")!;
    expect(music.y).toBeLessThan(find("options-back-label")!.y);
  });

  it("should fill steps 1 to the level and leave the rest empty", () => {
    expect(opened(0).steps()).toEqual([false, false, false, false, false]);
    expect(opened(3).steps()).toEqual([true, true, true, false, false]);
    expect(opened(5).steps()).toEqual([true, true, true, true, true]);
  });

  it("should draw the arrows and filled steps amber, an empty step dim, and each arrow dim at its end", () => {
    const mid = opened(3);
    expect(mid.tone("down")).toBe(TONES.actionable);
    expect(mid.tone("up")).toBe(TONES.actionable);
    expect(mid.tone("step-3")).toBe(TONES.actionable);
    expect(mid.tone("step-4")).toBe(TONES.dim);

    expect(opened(0).tone("down")).toBe(TONES.dim);
    expect(opened(0).tone("up")).toBe(TONES.actionable);
    expect(opened(5).tone("up")).toBe(TONES.dim);
    expect(opened(5).tone("down")).toBe(TONES.actionable);
  });

  it("should draw the arrows as filled triangles and the steps as rectangles on whole px, in the panel's tokens only", () => {
    const { made, mark } = opened(2);
    expect(mark("down").drawn.some((d) => d.call === "fillTriangle")).toBe(true);
    expect(mark("up").drawn.some((d) => d.call === "fillTriangle")).toBe(true);
    const marks = made.filter((m) => m.kind === "graphics" && named(m).endsWith("-mark"));
    // seven a row: ◄, five steps, ►; Music's and Sound effects'
    expect(marks).toHaveLength(14);
    const tokens = new Set(Object.values(TONES));
    for (const m of marks) {
      for (const d of m.drawn) {
        if (d.call === "fillStyle") expect(tokens.has(d.args[0])).toBe(true);
        else for (const n of d.args) expect(Number.isInteger(n), `${m.name} ${d.call} ${d.args}`).toBe(true);
      }
    }
  });

  it("should draw no ◄ ► ■ □ text glyph and no emoji (C16)", () => {
    const { texts } = opened();
    for (const t of texts()) expect(String(t.args[2])).not.toMatch(/[■-◿\u{1F300}-\u{1FAFF}]/u);
  });

  it("should lay the ◄, the five steps and the ► out left to right, right of the Music label", () => {
    const { texts, hit } = opened();
    const label = texts().find((t) => t.args[2] === "Music")!;
    const xs = ["down", "step-1", "step-2", "step-3", "step-4", "step-5", "up"].map((p) => hit(p).x - ORIGIN.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(label.x).toBeLessThan(xs[0]);
    expect(xs[6]).toBeLessThan(OPTIONS_WIDTH / 2);
    expect(label.x).toBeGreaterThan(-OPTIONS_WIDTH / 2);
  });

  describe("the Music row's presses (C5)", () => {
    it("should lower and raise the level by one on a click of ◄ or ►, and redraw the bar", () => {
      const { hit, music, steps } = opened(3);

      hit("up").handlers.pointerup();
      expect(music.set).toHaveBeenLastCalledWith(4);
      expect(steps()).toEqual([true, true, true, true, false]);
      hit("down").handlers.pointerup();
      hit("down").handlers.pointerup();
      expect(music.set).toHaveBeenLastCalledWith(2);
      expect(steps()).toEqual([true, true, false, false, false]);
    });

    it("should neither answer nor brighten the arrow at its end, and dim the other end's arrow once it gets there", () => {
      const top = opened(5);
      top.hit("up").handlers.pointerover();
      top.hit("up").handlers.pointerup();
      expect(top.music.set).not.toHaveBeenCalled();
      expect(top.tone("up")).toBe(TONES.dim);

      const one = opened(1);
      one.hit("down").handlers.pointerup();
      expect(one.music.set).toHaveBeenLastCalledWith(0);
      expect(one.tone("down")).toBe(TONES.dim);
      one.hit("down").handlers.pointerup();
      expect(one.music.set).toHaveBeenCalledTimes(1);
    });

    it.each([1, 2, 3, 4, 5])("should set level %i on a click of step %i", (k) => {
      const { hit, music, steps } = opened(k === 3 ? 0 : 3);
      hit(`step-${k}`).handlers.pointerup();
      expect(music.set).toHaveBeenLastCalledWith(k);
      expect(steps()).toEqual([1, 2, 3, 4, 5].map((s) => s <= k));
    });

    it("should brighten a part to the text tone under the pointer and give it back its tone after", () => {
      const { hit, tone } = opened(3);
      for (const part of ["up", "down", "step-2", "step-5"]) {
        const before = tone(part);
        hit(part).handlers.pointerover();
        expect(tone(part)).toBe(TONES.text);
        hit(part).handlers.pointerout();
        expect(tone(part)).toBe(before);
      }
    });

    it("should hang each part's hit camera-fixed over the panel, apart from the box", () => {
      const { hit, container } = opened();
      for (const part of ["down", "step-1", "step-5", "up"]) {
        expect(hit(part).kind).toBe("rectangle");
        expect(hit(part).scrollFactor).toBe(0);
        expect(hit(part).depth).toBe(MENU_DEPTH + 1);
        expect(hit(part).interactive).toBe(true);
        expect(container.children).not.toContain(hit(part));
      }
    });
  });

  describe("its keys (C6, C7)", () => {
    it("should move the level by one on nudge, clamped at 0 and 5", () => {
      const { keys, music, steps } = opened(4);
      keys.nudge(1);
      keys.nudge(1);
      expect(music.level()).toBe(5);
      expect(music.set).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 7; i++) keys.nudge(-1);
      expect(music.level()).toBe(0);
      expect(music.set).toHaveBeenCalledTimes(6);
      expect(steps()).toEqual([false, false, false, false, false]);
    });

    it("should do nothing on Enter or a number", () => {
      const { keys, music, back } = opened(3);
      keys.confirm();
      [0, 1, 2].forEach((i) => keys.pick(i));
      expect(music.set).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled();
    });

    it("should go back on Esc (dismiss), on a click of Back and on the frame's ×", () => {
      const { keys, back, find } = opened();
      keys.dismiss();
      find("options-back")!.handlers.pointerup();
      const close = find("options-close")!;
      expect(close.scrollFactor).toBe(0);
      expect(close.depth).toBe(MENU_DEPTH + 1);
      close.handlers.pointerup();
      expect(back).toHaveBeenCalledTimes(3);
    });
  });

  describe("it owns the screen, as the menu does (C8)", () => {
    const onPlate = (x: number, y: number) => x > 1000 && y > 650;

    it("should hang a blocker over the whole view under it, which stops a press and leaves the Menu plate through", () => {
      const { find } = opened(3, onPlate);
      const blocker = find("options-blocker")!;
      expect(blocker.kind).toBe("zone");
      expect(blocker.args.slice(0, 4)).toEqual([0, 0, 1080, 720]);
      expect(blocker.scrollFactor).toBe(0);
      expect(blocker.depth).toBe(MENU_BLOCKER_DEPTH);
      const takes = blocker.interactiveArgs!.find((a) => typeof a === "function") as (
        area: unknown,
        x: number,
        y: number,
      ) => boolean;
      expect(takes({}, 10, 10)).toBe(true);
      expect(takes({}, 1030, 680)).toBe(false);
      const stopPropagation = vi.fn();
      blocker.handlers.pointerdown({}, 10, 10, { stopPropagation });
      expect(stopPropagation).toHaveBeenCalledOnce();
    });

    it("should re-centre the box and every hit on a resize, and cover the new view", () => {
      const { moveTo, container, find, hit } = opened();
      const parts = ["options-back", "options-close", "options-music-down", "options-music-step-3", "options-music-up"];
      const before = parts.map((name) => ({ x: find(name)!.x - ORIGIN.x, y: find(name)!.y - ORIGIN.y }));

      viewport.set({ width: 1280, height: 720, renderScale: 1 });
      moveTo({ x: 640, y: 360 });

      expect([container.x, container.y]).toEqual([640, 360]);
      parts.forEach((name, i) => expect([find(name)!.x, find(name)!.y]).toEqual([640 + before[i].x, 360 + before[i].y]));
      expect(find("options-blocker")!.size).toEqual([1280, 720]);
      expect(hit("up")).toBeDefined();
    });

    it("should take every hit and the blocker down with the box", () => {
      const { container, made } = opened();
      (container as unknown as { destroy(): void }).destroy();
      const left = made.filter((m) => !m.destroyed && named(m).startsWith("options-"));
      expect(left).toEqual([]);
    });
  });
});

describe("the Sound effects row (FS-WDM0X S17–S19)", () => {
  afterEach(() => void vi.unstubAllGlobals());

  /** The panel open with the effects' control at `level`, its marks and hits read off the effects row. */
  const effectsAt = (level: number) => {
    const effects = musicAt(level);
    return { ...opened(3, undefined, "effects", effects), effects };
  };

  it("should show Music then Sound effects, one row apart, each with ◄, five steps and ►, Back below both", () => {
    vi.mocked(drawPanelFrame).mockClear();
    const { texts, find } = opened();
    const label = (words: string) => texts().find((t) => t.args[2] === words)!;

    expect(label("Sound effects").y - label("Music").y).toBe(OPTIONS_ROW);
    expect(label("Sound effects").x).toBe(label("Music").x);
    expect(find("options-back-label")!.y).toBeGreaterThan(label("Sound effects").y);
    for (const row of ["music", "effects"])
      for (const part of ["down", "step-1", "step-2", "step-3", "step-4", "step-5", "up"])
        expect(find(`options-${row}-${part}`), `${row} ${part}`).toBeDefined();
    expect(find("options-effects-up")!.x).toBe(find("options-music-up")!.x);
  });

  it("should be one row taller than the Music row alone, its layout unchanged", () => {
    vi.mocked(drawPanelFrame).mockClear();
    opened();
    const both = vi.mocked(drawPanelFrame).mock.calls[0][2].height;
    showOptionsPanel(recordingStage().scene, {
      origin: ORIGIN,
      hit: HIT,
      tones: TONES,
      back: vi.fn(),
      rows: [{ id: "music", label: "Music", steps: 5, value: () => 3, set: vi.fn() }],
    });
    const one = vi.mocked(drawPanelFrame).mock.calls[1][2].height;

    expect(both - one).toBe(OPTIONS_ROW);
  });

  it("should fill steps 1 to the effects' level", () => {
    expect(effectsAt(0).steps()).toEqual([false, false, false, false, false]);
    expect(effectsAt(2).steps()).toEqual([true, true, false, false, false]);
    expect(effectsAt(5).steps()).toEqual([true, true, true, true, true]);
  });

  it("should lower and raise the effects' level by one on ◄ and ►, the arrow at its end dimmed and ignored", () => {
    const p = effectsAt(1);
    p.hit("up").handlers.pointerup();
    expect(p.effects.set).toHaveBeenLastCalledWith(2);
    p.hit("down").handlers.pointerup();
    p.hit("down").handlers.pointerup();
    expect(p.effects.set).toHaveBeenLastCalledWith(0);
    expect(p.tone("down")).toBe(TONES.dim);
    p.hit("down").handlers.pointerup();
    expect(p.effects.set).toHaveBeenCalledTimes(3);

    const top = effectsAt(5);
    top.hit("up").handlers.pointerup();
    expect(top.effects.set).not.toHaveBeenCalled();
    expect(top.tone("up")).toBe(TONES.dim);
  });

  it.each([1, 2, 3, 4, 5])("should set the effects' level on a click of its step %i", (k) => {
    const p = effectsAt(k === 3 ? 0 : 3);
    p.hit(`step-${k}`).handlers.pointerup();
    expect(p.effects.set).toHaveBeenLastCalledWith(k);
    expect(p.steps()).toEqual([1, 2, 3, 4, 5].map((s) => s <= k));
  });

  it("should leave the Music row alone on its presses, and the Sound effects row alone on Music's", () => {
    const p = effectsAt(2);
    p.hit("up").handlers.pointerup();
    expect(p.music.set).not.toHaveBeenCalled();

    p.find("options-music-step-1")!.handlers.pointerup();
    expect(p.music.set).toHaveBeenLastCalledWith(1);
    expect(p.effects.set).toHaveBeenCalledTimes(1);
  });

  it("should send ←/→ to Music only (S18)", () => {
    const p = effectsAt(2);
    p.keys.nudge(1);
    p.keys.nudge(-1);
    p.keys.nudge(-1);

    expect(p.music.set).toHaveBeenLastCalledWith(2);
    expect(p.effects.set).not.toHaveBeenCalled();
    expect(p.effects.level()).toBe(2);
  });

  it("should only set the level on a change: no Back, no other callback, nothing played (S19)", () => {
    const p = effectsAt(2);
    p.hit("step-4").handlers.pointerup();
    p.hit("down").handlers.pointerup();

    expect(p.effects.set.mock.calls).toEqual([[4], [3]]);
    expect(p.back).not.toHaveBeenCalled();
    expect(p.music.set).not.toHaveBeenCalled();
  });

  /** This browser's store, as `window.localStorage`, recording each write by key. */
  const browserStore = (held: Record<string, string>) => {
    const writes: [string, string][] = [];
    const localStorage: KeyValueStore = {
      getItem: (key) => held[key] ?? null,
      setItem: (key, value) => {
        writes.push([key, value]);
        held[key] = value;
      },
      removeItem: (key) => void delete held[key],
    };
    vi.stubGlobal("window", { localStorage });
    return writes;
  };

  it("should make its own control from barrowspire_sfx as it opens, where the scene passes none, and write each change there", () => {
    const writes = browserStore({ [SFX_SETTING_KEY]: "1", [MUSIC_SETTING_KEY]: "4" });
    const p = opened(3, undefined, "effects", null);

    expect(p.steps()).toEqual([true, false, false, false, false]);
    p.hit("step-4").handlers.pointerup();
    p.hit("up").handlers.pointerup();

    expect(writes).toEqual([
      [SFX_SETTING_KEY, "4"],
      [SFX_SETTING_KEY, "5"],
    ]);
    expect(opened(3, undefined, "effects", null).steps()).toEqual([true, true, true, true, true]);
  });

  it("should hold a change for this visit where the browser refuses it, and throw nothing", () => {
    vi.stubGlobal("window", {
      get localStorage(): KeyValueStore {
        throw new Error("SecurityError");
      },
    });
    const first = opened(3, undefined, "effects", null);
    expect(first.steps()).toEqual([true, true, true, false, false]);

    expect(() => first.hit("step-1").handlers.pointerup()).not.toThrow();

    expect(opened(3, undefined, "effects", null).steps()).toEqual([true, false, false, false, false]);
  });
});

describe("showOptionsPanel, the layout for any list of rows (FS-28DDG § Change C4)", () => {
  /** A second stepped setting, as a later row (sound effects) would be. */
  const effects = (): SettingRow => {
    let value = 2;
    return { id: "effects", label: "Effects", steps: 5, value: () => value, set: (v) => void (value = v) };
  };
  const music = (): SettingRow => {
    let value = 3;
    return { id: "music", label: "Music", steps: 5, value: () => value, set: (v) => void (value = v) };
  };

  function laidOut(rows: SettingRow[]) {
    vi.mocked(drawPanelFrame).mockClear();
    const stage = recordingStage();
    const panel = showOptionsPanel(stage.scene, { origin: ORIGIN, hit: HIT, tones: TONES, back: vi.fn(), rows });
    const height = vi.mocked(drawPanelFrame).mock.calls[0][2].height;
    const label = (words: string) => stage.texts().find((t) => t.args[2] === words)!;
    return { ...stage, panel, height, label };
  }

  it("should take a second row under the first, one row taller, with Back still at the foot", () => {
    const one = laidOut([music()]);
    const two = laidOut([music(), effects()]);

    expect(two.height - one.height).toBe(OPTIONS_ROW);
    expect(two.label("Effects").y - two.label("Music").y).toBe(OPTIONS_ROW);
    expect(two.label("Music").x).toBe(two.label("Effects").x);
    expect(two.find("options-effects-step-2-mark")).toBeDefined();
    expect(two.find("options-effects-up")!.x).toBe(two.find("options-music-up")!.x);
    expect(two.find("options-back-label")!.y).toBeGreaterThan(two.label("Effects").y);
    // the box stays centred on the origin
    expect(two.label("Music").y).toBe(one.label("Music").y - OPTIONS_ROW / 2);
  });

  it("should move the first row's level on nudge", () => {
    const rows = [music(), effects()];
    const { panel } = laidOut(rows);
    panel.keys.nudge(1);
    expect(rows[0].value()).toBe(4);
    expect(rows[1].value()).toBe(2);
  });
});
