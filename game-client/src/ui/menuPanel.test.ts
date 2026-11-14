import { afterEach, describe, expect, it, vi } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import { palette, toCss } from "@/utils/canvasPalette";
import { viewport } from "@/render/viewport";
import {
  MENU_BLOCKER_DEPTH,
  MENU_DEPTH,
  MENU_LINE,
  MENU_PAD,
  MENU_ROW,
  menuOption,
  showMenuPanel,
  type MenuChoice,
  type MenuStage,
  type MenuTones,
} from "./menuPanel";
import { PANEL_TITLE_BAND, drawPanelFrame, drawPanelTitle, frameClose } from "./panelFrame";

// The party panel's frame is one drawing, which this surface must call, not copy (owner
// 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框"). I-3EBCA-6.
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelFrame: vi.fn(real.drawPanelFrame), drawPanelTitle: vi.fn(real.drawPanelTitle) };
});

/** A scene object as the stand-in stage made it: what kind, with what, and whether it is gone. */
interface Made {
  kind: string;
  args: unknown[];
  name?: string;
  destroyed: boolean;
  depth?: number;
  scrollFactor?: number;
  color?: string;
  children: Made[];
  /** The handlers it was given, by event, as Phaser would call them. */
  handlers: Record<string, () => void>;
}

/**
 * A stand-in for the slice of Phaser the chrome draws with, as the scene tests use: every object
 * is recorded by kind and answers any call, and destroying a container destroys what it holds
 * and runs what was hung on `destroy`, as Phaser does.
 */
function recordingStage() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[] = []): unknown => {
    const self = {
      kind,
      args,
      destroyed: false,
      // what setColor last gave it; unset until it is, so a row that never brightened reads so
      color: undefined,
      x: typeof args[0] === "number" ? args[0] : 0,
      y: typeof args[1] === "number" ? args[1] : 0,
      children: [] as Made[],
      handlers: {} as Record<string, () => void>,
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
        if (prop === "setInteractive")
          return (...args: unknown[]) => {
            target.interactive = true;
            target.interactiveArgs = args;
            return proxy;
          };
        if (prop === "setSize")
          return (width: number, height: number) => {
            target.size = [width, height];
            return proxy;
          };
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
        return () => proxy;
      },
    });
    made.push(proxy as Made);
    return proxy;
  };
  const add = new Proxy({}, { get: (_, kind) => (...args: unknown[]) => make(String(kind), args) });
  const scene = { add } as unknown as MenuStage;
  const find = (name: string) => made.find((m) => m.name === name && !m.destroyed);
  return { made, scene, find };
}

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

describe("menuOption", () => {
  function drawn(enabled?: () => boolean) {
    const stage = recordingStage();
    const onPick = vi.fn();
    const option = menuOption(stage.scene, {
      x: 12,
      y: -20,
      label: "Descend",
      colour: TONES.actionable,
      onPick,
      name: "choice-solo",
      origin: ORIGIN,
      enabled,
      hit: HIT,
      tones: TONES,
    });
    const hit = stage.find("choice-solo") as Made;
    const label = (option as unknown as Made).children[0];
    return { ...stage, option: option as unknown as Made, hit, label, onPick };
  }

  it("should keep the hit rectangle outside the label's container, camera-fixed, named and over the panel", () => {
    const { option, hit } = drawn();
    expect(hit.kind).toBe("rectangle");
    expect(option.name).toBe("choice-solo-label");
    expect(option.children).not.toContain(hit);
    expect(hit.scrollFactor).toBe(0);
    expect(hit.depth).toBe(MENU_DEPTH + 1);
    // at the label's place on the screen: the box's origin plus the label's offset in it
    expect(hit.args.slice(0, 4)).toEqual([ORIGIN.x + 12, ORIGIN.y - 20, HIT.width, HIT.height]);
    expect(hit.args[5]).toBe(0);
  });

  it("should take the hit down with the container", () => {
    const { option, hit } = drawn();
    expect(hit.destroyed).toBe(false);
    (option as unknown as { destroy(): void }).destroy();
    expect(hit.destroyed).toBe(true);
  });

  it("should press through the hit, and brighten under the pointer", () => {
    const { hit, label, onPick } = drawn();
    expect((label.args[3] as { color: string }).color).toBe(toCss(TONES.actionable));
    hit.handlers.pointerover();
    expect(label.color).toBe(toCss(TONES.text));
    hit.handlers.pointerout();
    expect(label.color).toBe(toCss(TONES.actionable));
    hit.handlers.pointerup();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("should draw a row that cannot be pressed in the dim tone, and neither brighten nor answer it", () => {
    const { hit, label, onPick } = drawn(() => false);
    expect((label.args[3] as { color: string }).color).toBe(toCss(TONES.dim));
    hit.handlers.pointerover();
    expect(label.color).toBeUndefined();
    hit.handlers.pointerup();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("should retone to what enabled says now", () => {
    let can = true;
    const { option, label } = drawn(() => can);
    can = false;
    (option as unknown as { retone(): void }).retone();
    expect(label.color).toBe(toCss(TONES.dim));
    can = true;
    (option as unknown as { retone(): void }).retone();
    expect(label.color).toBe(toCss(TONES.actionable));
  });
});

describe("showMenuPanel", () => {
  const choices: MenuChoice[] = [
    { id: "fall", label: "Fall where you stand", register: "actionable" },
    { id: "leave", label: "Leave the barrow", register: "actionable" },
    { id: "back", label: "Back  [Esc]", register: "cancel" },
  ];

  function shown(
    spec: {
      line?: string;
      enabled?: Record<string, () => boolean>;
      withBack?: boolean;
      through?: (x: number, y: number) => boolean;
    } = {},
  ) {
    const stage = recordingStage();
    const fall = vi.fn();
    const leave = vi.fn();
    const back = vi.fn();
    const close = vi.fn();
    const panel = showMenuPanel(stage.scene, {
      line: spec.line,
      choices,
      actions: spec.withBack === false ? { fall, leave } : { fall, leave, back },
      enabled: spec.enabled,
      close,
      origin: ORIGIN,
      hit: HIT,
      tones: TONES,
      through: spec.through,
    });
    // the rows' labels, the frame's × and the title aside
    const labels = () =>
      stage.made
        .filter((m) => m.kind === "text" && !m.destroyed && m.args[2] !== "×" && m.args[2] !== "MENU")
        .map((m) => String(m.args[2]));
    return { ...stage, ...panel, container: panel.container as unknown as Made, fall, leave, back, close, labels };
  }

  it("should move the box and every row's hit to a new origin when the view changes (FS-ZAJMH R13)", () => {
    const { moveTo, container, find } = shown();
    const before = choices.map((c) => {
      const hit = find(`menu-${c.id}`) as Made & { x: number; y: number };
      return { x: hit.x - ORIGIN.x, y: hit.y - ORIGIN.y };
    });
    moveTo({ x: ORIGIN.x + 100, y: ORIGIN.y });
    const moved = container as Made & { x: number; y: number };
    expect([moved.x, moved.y]).toEqual([ORIGIN.x + 100, ORIGIN.y]);
    choices.forEach((c, i) => {
      const hit = find(`menu-${c.id}`) as Made & { x: number; y: number };
      expect([hit.x, hit.y]).toEqual([ORIGIN.x + 100 + before[i].x, ORIGIN.y + before[i].y]);
    });
  });

  it("should build a camera-fixed box in the popup band at the origin, one named hit per row", () => {
    const { container, find, labels } = shown();
    expect(container.kind).toBe("container");
    expect(container.args.slice(0, 2)).toEqual([ORIGIN.x, ORIGIN.y]);
    expect(container.scrollFactor).toBe(0);
    expect(container.depth).toBe(MENU_DEPTH);
    expect(container.children[0].kind).toBe("graphics");
    for (const id of ["fall", "leave", "back"]) {
      expect(find(`menu-${id}`)?.kind).toBe("rectangle");
      expect(container.children.map((c) => c.name)).toContain(`menu-${id}-label`);
    }
    // each thing to do answers to its number; the cancel row already says Esc
    expect(labels()).toEqual(["Fall where you stand  [1]", "Leave the barrow  [2]", "Back  [Esc]"]);
  });

  it("should colour the rows by register", () => {
    const { container } = shown();
    const colour = (name: string) =>
      (container.children.find((c) => c.name === name)?.children[0].args[3] as { color: string }).color;
    expect(colour("menu-fall-label")).toBe(toCss(TONES.actionable));
    expect(colour("menu-back-label")).toBe(toCss(TONES.cancel));
  });

  it("should put the line over the rows and move the rows down by its height", () => {
    const bare = shown();
    const lined = shown({ line: "The barrow keeps its dead. Fall?" });
    expect(lined.labels()[0]).toBe("The barrow keeps its dead. Fall?");
    const rowY = (s: ReturnType<typeof shown>, name: string) =>
      (s.container.children.find((c) => c.name === name) as Made & { y: number }).y;
    // the title's band over them (FS-3EBCA R23)
    const height = (rows: number, line: number) => PANEL_TITLE_BAND + MENU_PAD + line + rows * MENU_ROW;
    expect(rowY(bare, "menu-fall-label")).toBe(-height(3, 0) / 2 + PANEL_TITLE_BAND + MENU_ROW / 2);
    expect(rowY(lined, "menu-fall-label")).toBe(-height(3, MENU_LINE) / 2 + PANEL_TITLE_BAND + MENU_LINE + MENU_ROW / 2);
    expect(bare.find("menu-line")).toBeUndefined();
  });

  it("should dispatch pick to the n-th actionable row and confirm to the first", () => {
    const { keys, fall, leave, back } = shown();
    keys.pick(1);
    expect(leave).toHaveBeenCalledTimes(1);
    keys.confirm();
    expect(fall).toHaveBeenCalledTimes(1);
    keys.pick(2);
    keys.pick(7);
    expect(back).not.toHaveBeenCalled();
    expect(fall).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("should dismiss through the cancel row, or close when there is none", () => {
    const { keys, back, close } = shown();
    keys.dismiss();
    expect(back).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    const stage = recordingStage();
    const closeAlone = vi.fn();
    const alone = showMenuPanel(stage.scene, {
      choices: [{ id: "fall-now", label: "Fall", register: "actionable" }],
      actions: {},
      close: closeAlone,
      origin: ORIGIN,
      hit: HIT,
      tones: TONES,
    });
    alone.keys.dismiss();
    expect(closeAlone).toHaveBeenCalledTimes(1);
  });

  it("should close on a row with no action of its own", () => {
    const { find, close, back } = shown({ withBack: false });
    find("menu-back")?.handlers.pointerup();
    expect(close).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it("should neither dispatch to nor press a dimmed row, and retone every row", () => {
    let pending = true;
    const { keys, find, container, fall, leave } = shown({ enabled: { leave: () => !pending } });
    const leaveLabel = container.children.find((c) => c.name === "menu-leave-label")?.children[0] as Made;
    expect((leaveLabel.args[3] as { color: string }).color).toBe(toCss(TONES.dim));
    keys.pick(1);
    find("menu-leave")?.handlers.pointerup();
    expect(leave).not.toHaveBeenCalled();
    keys.pick(0);
    expect(fall).toHaveBeenCalledTimes(1);

    pending = false;
    keys.retone();
    expect(leaveLabel.color).toBe(toCss(TONES.actionable));
    keys.pick(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("should take every hit down with the container", () => {
    const { container, find } = shown();
    (container as unknown as { destroy(): void }).destroy();
    for (const id of ["fall", "leave", "back", "close"]) expect(find(`menu-${id}`)).toBeUndefined();
  });

  // FS-G4VMQ § Change: The menu wears the party panel's frame (C1–C3). I-3EBCA-6.
  it("should draw its box with the party panel's frame drawing, centred on the origin, the rows unchanged (C1, C3)", () => {
    const frame = vi.mocked(drawPanelFrame);
    frame.mockClear();
    const { labels } = shown();
    const height = PANEL_TITLE_BAND + MENU_PAD + choices.length * MENU_ROW;
    expect(frame).toHaveBeenCalledTimes(1);
    expect(frame.mock.calls[0][2]).toEqual({ x: -160, y: -height / 2, width: 320, height });
    expect(labels()).toEqual(["Fall where you stand  [1]", "Leave the barrow  [2]", "Back  [Esc]"]);
  });

  it("should close on its × as Esc does: through the cancel row, camera-fixed over the box (C2)", () => {
    const { find, made, back, container, moveTo } = shown();
    const height = PANEL_TITLE_BAND + MENU_PAD + choices.length * MENU_ROW;
    const box = frameClose({ x: -160, y: -height / 2, width: 320 });
    const glyph = made.find((m) => m.kind === "text" && m.args[2] === "×")!;
    expect(container.children).toContain(glyph);
    const hit = find("menu-close") as Made & { x: number; y: number };
    expect(hit.kind).toBe("rectangle");
    expect(hit.scrollFactor).toBe(0);
    expect([hit.x, hit.y]).toEqual([ORIGIN.x + box.x + box.width / 2, ORIGIN.y + box.y + box.height / 2]);
    hit.handlers.pointerover();
    expect(glyph.color).toBe(toCss(palette.interactableBright));
    hit.handlers.pointerup();
    expect(back).toHaveBeenCalledTimes(1);
    moveTo({ x: ORIGIN.x + 50, y: ORIGIN.y });
    expect(hit.x).toBe(ORIGIN.x + 50 + box.x + box.width / 2);
  });

  // FS-3EBCA R20, R23 (owner 2026-11-12: "menu目前沒標題也加上", "每個ui視窗的標題都不同位置
  // 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一"). I-3EBCA-9.
  it("should title the menu MENU with the shared title drawing, in its box, over the rows (R20, R23)", () => {
    const title = vi.mocked(drawPanelTitle);
    title.mockClear();
    const { container, made } = shown({ line: "The barrow keeps its dead. Fall?" });
    const height = PANEL_TITLE_BAND + MENU_PAD + MENU_LINE + choices.length * MENU_ROW;
    expect(title).toHaveBeenCalledTimes(1);
    expect(title.mock.calls[0][1]).toEqual({ x: -160, y: -height / 2, width: 320, height });
    expect(title.mock.calls[0][2]).toBe("MENU");
    const drawn = made.find((m) => m.kind === "text" && m.args[2] === "MENU")!;
    expect(container.children).toContain(drawn);
  });

  // FS-3EBCA R18 (owner 2026-11-12: "menu開啟時其他都不能按"): while the menu is open only its rows,
  // its × and its keys answer; nothing drawn under it takes a press or a hover.
  describe("the open menu is modal (FS-3EBCA R18)", () => {
    afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

    it("should hang a camera-fixed blocker over the whole view, under its rows and × and over the HUD and every panel", () => {
      const { find } = shown();
      const blocker = find("menu-blocker") as Made & { interactive?: boolean };
      expect(blocker?.kind).toBe("zone");
      expect(blocker.args.slice(0, 4)).toEqual([0, 0, 1080, 720]);
      expect(blocker.scrollFactor).toBe(0);
      expect(blocker.interactive).toBe(true);
      expect(blocker.depth).toBe(MENU_BLOCKER_DEPTH);
      // under the box (2000) and its hits (2001), over the letter panel (1800) and the HUD (1000)
      expect(MENU_BLOCKER_DEPTH).toBeLessThan(MENU_DEPTH);
      expect(MENU_BLOCKER_DEPTH).toBeGreaterThan(1800);
      expect(find("menu-back")!.depth).toBeGreaterThan(MENU_BLOCKER_DEPTH);
      expect(find("menu-close")!.depth).toBeGreaterThan(MENU_BLOCKER_DEPTH);
    });

    it("should stop a press on it there: no scene-wide listener hears it (the world, the chat window)", () => {
      const { find } = shown();
      const stopPropagation = vi.fn();
      const down = find("menu-blocker")!.handlers.pointerdown as unknown as (...a: unknown[]) => void;
      down({ x: 10, y: 10 }, 10, 10, { stopPropagation });
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      // and a call with no event (a stand-in) does not throw
      expect(() => down()).not.toThrow();
    });

    // FS-3EBCA R18 (owner 2026-11-12: "menu無法再按一次icon關閉"): the Menu icon's plate is left to the
    // icon, so a press there closes the menu and a hover there brightens it; nothing else gets through.
    describe("the point it lets through (the Menu icon's plate)", () => {
      const PLATE = { x: 1006, y: 658, width: 58, height: 46 };
      const onPlate = (x: number, y: number) =>
        x >= PLATE.x && x <= PLATE.x + PLATE.width && y >= PLATE.y && y <= PLATE.y + PLATE.height;
      type HitTest = (area: unknown, x: number, y: number, object: unknown) => boolean;
      const hitTestOf = (blocker: Made) => {
        const args = (blocker as Made & { interactiveArgs?: unknown[] }).interactiveArgs ?? [];
        const test = args.find((a) => typeof a === "function") as HitTest | undefined;
        expect(test, "the blocker's own hit test").toBeTypeOf("function");
        return (x: number, y: number) => test!({}, x, y, blocker);
      };

      it("should take every point of the view but the plate it is told to let through", () => {
        const takes = hitTestOf(shown({ through: onPlate }).find("menu-blocker")!);
        expect(takes(10, 10)).toBe(true);
        expect(takes(540, 360)).toBe(true);
        // the plate's centre and its corners go to the icon under it
        expect(takes(PLATE.x + 29, PLATE.y + 23)).toBe(false);
        expect(takes(PLATE.x, PLATE.y)).toBe(false);
        expect(takes(PLATE.x + PLATE.width, PLATE.y + PLATE.height)).toBe(false);
        // a press beside the plate (the gap to Inventory, above it, the Inventory plate) is still the blocker's
        expect(takes(PLATE.x - 4, PLATE.y + 23)).toBe(true);
        expect(takes(PLATE.x + 29, PLATE.y - 2)).toBe(true);
        expect(takes(969, 681)).toBe(true);
        // off the view is no one's
        expect(takes(-1, 10)).toBe(false);
        expect(takes(1080, 10)).toBe(false);
        expect(takes(10, 720)).toBe(false);
      });

      it("should take the whole view when told to let nothing through", () => {
        const takes = hitTestOf(shown().find("menu-blocker")!);
        expect(takes(PLATE.x + 29, PLATE.y + 23)).toBe(true);
      });

      it("should follow the view when it changes", () => {
        const { find, moveTo } = shown({ through: onPlate });
        viewport.set({ width: 1280, height: 720, renderScale: 1 });
        moveTo({ x: 640, y: 360 });
        const takes = hitTestOf(find("menu-blocker")!);
        expect(takes(1200, 10)).toBe(true);
        expect(takes(1280, 10)).toBe(false);
      });
    });

    it("should cover the new view when it changes, and go down with the menu", () => {
      const { find, moveTo, container } = shown();
      viewport.set({ width: 1280, height: 720, renderScale: 1 });
      moveTo({ x: 640, y: 360 });
      expect((find("menu-blocker") as Made & { size?: number[] }).size).toEqual([1280, 720]);
      (container as unknown as { destroy(): void }).destroy();
      expect(find("menu-blocker")).toBeUndefined();
    });
  });
});

describe("the chrome's feedback for the interface sounds (FS-WDM0X § Change: Menu, dialog and notice sounds, M5, M10)", () => {
  const choices: MenuChoice[] = [
    { id: "fall", label: "Fall where you stand", register: "actionable" },
    { id: "leave", label: "Leave the barrow", register: "actionable" },
    { id: "back", label: "Back  [Esc]", register: "cancel" },
  ];

  /** A menu whose Leave the barrow is dimmed, telling a recording feedback what the player did. */
  function shown() {
    const stage = recordingStage();
    const heard: string[] = [];
    const feedback = { hovered: () => void heard.push("hovered"), refused: () => void heard.push("refused") };
    const leave = vi.fn();
    const panel = showMenuPanel(stage.scene, {
      choices,
      actions: { fall: vi.fn(), leave },
      enabled: { leave: () => false },
      close: vi.fn(),
      origin: ORIGIN,
      hit: HIT,
      tones: TONES,
      feedback,
    });
    return { ...stage, ...panel, heard, leave };
  }

  it("should say a hover on a row that can be pressed, and on the frame's ×, and none on a dimmed row", () => {
    const p = shown();

    p.find("menu-fall")!.handlers.pointerover();
    p.find("menu-back")!.handlers.pointerover();
    p.find("menu-close")!.handlers.pointerover();
    p.find("menu-leave")!.handlers.pointerover();

    expect(p.heard).toEqual(["hovered", "hovered", "hovered"]);
  });

  it("should say a press on a dimmed row refused, by the pointer and by its number, and press nothing", () => {
    const p = shown();

    p.find("menu-leave")!.handlers.pointerup();
    p.keys.pick(1);

    expect(p.heard).toEqual(["refused", "refused"]);
    expect(p.leave).not.toHaveBeenCalled();
  });

  it("should say nothing for a press that answers, nor for a number with no row", () => {
    const p = shown();

    p.find("menu-fall")!.handlers.pointerup();
    p.keys.pick(2);

    expect(p.heard).toEqual([]);
  });

  it("should tell a row's feedback alone, drawn by menuOption: a hover while it can be pressed, a refusal while dimmed", () => {
    const stage = recordingStage();
    const heard: string[] = [];
    let can = true;
    menuOption(stage.scene, {
      x: 0,
      y: 0,
      label: "Descend",
      colour: TONES.actionable,
      onPick: vi.fn(),
      name: "choice-solo",
      origin: ORIGIN,
      enabled: () => can,
      hit: HIT,
      tones: TONES,
      feedback: { hovered: () => void heard.push("hovered"), refused: () => void heard.push("refused") },
    });
    const hit = stage.find("choice-solo")!;

    hit.handlers.pointerover();
    can = false;
    hit.handlers.pointerover();
    hit.handlers.pointerup();

    expect(heard).toEqual(["hovered", "refused"]);
  });
});
