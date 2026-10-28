import { describe, expect, it, vi } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import { toCss } from "@/utils/canvasPalette";
import {
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

  function shown(spec: { line?: string; enabled?: Record<string, () => boolean>; withBack?: boolean } = {}) {
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
    });
    const labels = () => stage.made.filter((m) => m.kind === "text" && !m.destroyed).map((m) => String(m.args[2]));
    return { ...stage, ...panel, container: panel.container as unknown as Made, fall, leave, back, close, labels };
  }

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
    const height = (rows: number, line: number) => MENU_PAD * 2 + line + rows * MENU_ROW;
    expect(rowY(bare, "menu-fall-label")).toBe(-height(3, 0) / 2 + MENU_PAD + MENU_ROW / 2);
    expect(rowY(lined, "menu-fall-label")).toBe(-height(3, MENU_LINE) / 2 + MENU_PAD + MENU_LINE + MENU_ROW / 2);
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
    for (const id of ["fall", "leave", "back"]) expect(find(`menu-${id}`)).toBeUndefined();
  });
});
