import { describe, expect, it } from "vitest";
import { NO_FACTS, answering, type UiRequest, type World, type WorldFacts, type WorldReport, type WorldWindows } from "./uiBridge";
import type { MenuChoice, MenuPanelSpec } from "./menuPanel";
import type { MusicLevelControl, OptionsPanelSpec } from "./optionsPanel";
import { MENU_LOOKS, UiMenuSlot, type SlotPanel } from "./uiSceneMenu";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";

// FS-TQZ5J §D R16–R21 (I-TQZ5J-4): the ESC menu, OPTIONS and the run's Fall confirm are the UI scene's
// one menu slot, built from the world's report; Esc's step and the menu's keys are the UI scene's;
// what a row needs of the world is a request the world answers; the slot's state is the UI's
// reported state, which the world hears; the slot yields to the world's report.

/** A world as it reports itself: its windows, dialogue and facts as they are now; what it was asked; what it heard. */
function aWorld(world: World, start: Partial<WorldFacts> = {}) {
  const windows: { -readonly [K in keyof WorldWindows]: boolean } = {
    letter: false,
    party: false,
    inventory: false,
    character: false,
  };
  const state = { dialogue: false };
  const facts: { -readonly [K in keyof WorldFacts]: boolean } = { ...NO_FACTS, ...start };
  const asked: UiRequest[] = [];
  const heardUi: boolean[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ ...windows }),
    blockers: () => ({ dialogue: state.dialogue }),
    facts: () => ({ ...facts }),
    // the menu opens over no window (FS-3EBCA R17), as each world answers it
    heardUi: (ui) => {
      heardUi.push(ui.menuOpen);
      if (ui.menuOpen) Object.assign(windows, { letter: false, party: false, inventory: false, character: false });
    },
    answer: (request) => {
      asked.push(request);
      answering({
        inventory: () => void (windows.inventory = !windows.inventory),
        close: {
          letter: () => void (windows.letter = false),
          party: () => void (windows.party = false),
          gear: () => void (windows.inventory = windows.character = false),
          dialogue: () => void (state.dialogue = false),
        },
        changeCharacter: () => void (facts.leaving = true),
        fall: () => void (facts.fallPending = true),
      })(request);
    },
  };
  return { report, windows, state, facts, asked, heardUi };
}

/** A drawn panel, as the chrome would answer its keys (`showMenuPanel`, `openOptionsPanel`). */
interface Drawn {
  kind: "menu" | "options";
  menu?: MenuPanelSpec<MenuChoice>;
  options?: OptionsPanelSpec;
  retones: number;
  moves: { x: number; y: number }[];
  destroyed: boolean;
}

/** The chrome's rule for a menu's keys (menuPanel.ts): a number its actionable row, Enter the first, Esc the cancel row. */
function menuKeys(spec: MenuPanelSpec<MenuChoice>, drawn: Drawn): SlotPanel["keys"] {
  const actionable = spec.choices.filter((c) => c.register === "actionable");
  const act = (c: MenuChoice) => (spec.actions as Record<string, (() => void) | undefined>)[c.id] ?? spec.close;
  const can = (c: MenuChoice) => (spec.enabled as Record<string, (() => boolean) | undefined> | undefined)?.[c.id]?.() ?? true;
  const press = (c?: MenuChoice) => {
    if (c && can(c)) act(c)();
  };
  const cancel = spec.choices.find((c) => c.register === "cancel");
  return {
    pick: (i) => press(actionable[i]),
    confirm: () => press(actionable[0]),
    dismiss: () => (cancel ? press(cancel) : spec.close()),
    retone: () => void drawn.retones++,
  };
}

/** The UI scene's slot on the game's bridge, the UI scene's sounds lent, drawing on a recording chrome. */
function onBridge(fullscreen: OptionsPanelSpec["fullscreen"] = null) {
  const { bridge, heard } = heardInterfaceSounds();
  const drawn: Drawn[] = [];
  const stored = { level: 3 };
  const slot = new UiMenuSlot({
    bridge,
    draw: {
      menu: (spec) => {
        const d: Drawn = { kind: "menu", menu: spec, retones: 0, moves: [], destroyed: false };
        drawn.push(d);
        return { container: { destroy: () => void (d.destroyed = true) }, keys: menuKeys(spec, d), moveTo: (at) => void d.moves.push(at) };
      },
      options: (spec) => {
        const d: Drawn = { kind: "options", options: spec, retones: 0, moves: [], destroyed: false };
        drawn.push(d);
        return {
          container: { destroy: () => void (d.destroyed = true) },
          keys: {
            pick: () => {},
            confirm: () => {},
            dismiss: spec.back,
            retone: () => void d.retones++,
            nudge: (by) => spec.music.setLevel(spec.music.level() + by),
          },
          moveTo: (at) => void d.moves.push(at),
        };
      },
    },
    through: (x) => x === 7,
    centre: () => ({ x: 540, y: 360 }),
    musicLevel: (): MusicLevelControl => ({
      level: () => stored.level,
      setLevel: (level) => void (stored.level = Math.min(5, Math.max(0, level))),
    }),
    fullscreen: () => fullscreen,
  });
  const live = () => drawn.filter((d) => !d.destroyed);
  const shown = () => live()[0];
  const rows = () => shown()?.menu?.choices.map((c) => c.id);
  const press = (keys: Partial<{ esc: boolean; enter: boolean; numbered: number; nudge: -1 | 1 }>) =>
    slot.keys({ esc: false, enter: false, numbered: -1, ...keys });
  const esc = () => press({ esc: true });
  const row = (id: string) => {
    const spec = shown()!.menu!;
    const action = (spec.actions as Record<string, (() => void) | undefined>)[id] ?? spec.close;
    action();
  };
  return { bridge, heard, slot, drawn, live, shown, rows, press, esc, row, stored };
}

describe("Esc's one step, the UI scene's (FS-TQZ5J R17; FS-R82NV § Change C2)", () => {
  it("should ask the town to close its open dialogue, and open no menu", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    town.state.dialogue = true;

    t.esc();

    expect(town.asked).toEqual([{ kind: "close", window: "dialogue" }]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it.each<[string, (w: ReturnType<typeof aWorld>) => void, UiRequest]>([
    ["the letter panel", (w) => (w.windows.letter = true), { kind: "close", window: "letter" }],
    ["the party panel", (w) => (w.windows.party = true), { kind: "close", window: "party" }],
    ["the inventory", (w) => (w.windows.inventory = true), { kind: "close", window: "gear" }],
    ["the character panel", (w) => (w.windows.character = true), { kind: "close", window: "gear" }],
  ])("should ask the world to close %s before it opens the menu", (_what, open, request) => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    open(town);

    t.esc();
    expect(town.asked).toEqual([request]);
    expect(t.slot.isOpen()).toBe(false);
    t.esc();
    expect(t.slot.isOpen()).toBe(true);
  });

  it("should close the letter panel before the party panel, the party panel before the gear (escapeStep)", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    Object.assign(town.windows, { letter: true, party: true, inventory: true });
    (town.report as { answer: WorldReport["answer"] }).answer = (request) => {
      town.asked.push(request);
      if (request.kind === "close" && request.window === "letter") town.windows.letter = false;
      if (request.kind === "close" && request.window === "party") town.windows.party = false;
      if (request.kind === "close" && request.window === "gear") town.windows.inventory = false;
    };
    t.bridge.report(town.report);

    t.esc();
    t.esc();
    t.esc();

    expect(town.asked.map((r) => (r.kind === "close" ? r.window : r.kind))).toEqual(["letter", "party", "gear"]);
  });

  it("should open the town's menu with Leave the queue while queued, and without it otherwise (FS-G4VMQ R3)", () => {
    const queued = onBridge();
    queued.bridge.report(aWorld("hub", { queued: true }).report);
    queued.esc();
    expect(queued.rows()).toEqual(["change", "leave", "options", "back"]);

    const not = onBridge();
    not.bridge.report(aWorld("hub").report);
    not.esc();
    expect(not.rows()).toEqual(["change", "options", "back"]);
  });

  it("should open the field's menu as the town's, never queued (FS-G4VMQ § Change C2)", () => {
    const t = onBridge();
    t.bridge.report(aWorld("field").report);
    t.esc();
    expect(t.rows()).toEqual(["change", "options", "back"]);
    expect(t.shown()!.menu!.tones).toBe(MENU_LOOKS.field.tones);
  });

  it("should open the run's rows for the player's state, Fall while in the delve and Leave the barrow once out (FS-9K8EZ req 2)", () => {
    const alive = onBridge();
    alive.bridge.report(aWorld("run").report);
    alive.esc();
    expect(alive.rows()).toEqual(["fall", "options", "back"]);
    expect(alive.shown()!.menu!.tones).toBe(MENU_LOOKS.run.tones);
    expect(alive.shown()!.menu!.hit).toEqual({ width: 220, height: 34 });

    const out = onBridge();
    out.bridge.report(aWorld("run", { resolved: true }).report);
    out.esc();
    expect(out.rows()).toEqual(["leave", "options", "back"]);
  });

  it("should close the menu on the next Esc, as its Back (FS-G4VMQ R2)", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub").report);
    t.esc();
    t.esc();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.live()).toEqual([]);
  });

  it("should do nothing at all once the run has ended: its end took the keys (FS-9K8EZ edge state \"Menu\")", () => {
    const t = onBridge();
    const run = aWorld("run", { ended: true });
    t.bridge.report(run.report);
    run.windows.party = true;

    t.esc();

    expect(run.asked).toEqual([]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should do nothing with no world reported", () => {
    const t = onBridge();
    expect(() => t.esc()).not.toThrow();
    expect(t.slot.isOpen()).toBe(false);
  });
});

describe("the menu's keys, shared by state (FS-TQZ5J R18, R21)", () => {
  it("should act on no 1, Enter or arrow while the slot is empty: they are the world's then", () => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);

    t.press({ numbered: 0 });
    t.press({ enter: true });
    t.press({ nudge: 1 });

    expect(run.asked).toEqual([]);
    expect(t.drawn).toEqual([]);
  });

  it("should pick the run's first row on 1 while the menu is open: Fall opens its confirm", () => {
    const t = onBridge();
    t.bridge.report(aWorld("run").report);
    t.esc();

    t.press({ numbered: 0 });

    expect(t.shown()!.menu!.line).toBe("The barrow keeps its dead. Fall here?");
    expect(t.rows()).toEqual(["fall-now", "not-yet"]);
  });

  it("should press the first row on Enter while the menu is open: Change character asked of the town", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();

    t.press({ enter: true });

    expect(town.asked).toEqual([{ kind: "changeCharacter" }]);
    expect(t.slot.isOpen()).toBe(true);
  });

  it("should nudge the OPTIONS Music row on ←/→, asking the world to apply each level (R19)", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();
    t.row("options");

    t.press({ nudge: 1 });
    t.press({ nudge: -1 });
    t.press({ nudge: -1 });

    expect(town.asked).toEqual([
      { kind: "musicLevel", level: 4 },
      { kind: "musicLevel", level: 3 },
      { kind: "musicLevel", level: 2 },
    ]);
    expect(t.stored.level).toBe(2);
  });
});

describe("the ESC menu's rows, asked of the world (FS-TQZ5J R11, R16; FS-G4VMQ, FS-9K8EZ)", () => {
  it("should ask the town to change character and dim the row while it is asked, retoning at once", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();
    const enabled = () => (t.shown()!.menu!.enabled as Record<string, () => boolean>).change();
    expect(enabled()).toBe(true);

    t.row("change");

    expect(town.asked).toEqual([{ kind: "changeCharacter" }]);
    expect(enabled()).toBe(false);
    expect(t.shown()!.retones).toBe(1);
  });

  it("should retone the rows when the world says the ask came back (a refusal), and not on a report that changes nothing", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();
    t.row("change");
    const drawn = t.shown()!;

    t.slot.sync();
    expect(drawn.retones).toBe(1);
    town.facts.leaving = false;
    t.slot.sync();
    expect(drawn.retones).toBe(2);
  });

  it("should ask the town to leave the queue, the menu kept open", () => {
    const t = onBridge();
    const town = aWorld("hub", { queued: true });
    t.bridge.report(town.report);
    t.esc();

    t.row("leave");

    expect(town.asked).toEqual([{ kind: "leaveQueue" }]);
    expect(t.slot.isOpen()).toBe(true);
  });

  it("should ask the run to leave the barrow and close, dimmed while one is pending (FS-QPDKN req 13)", () => {
    const t = onBridge();
    const run = aWorld("run", { resolved: true });
    t.bridge.report(run.report);
    t.esc();
    expect((t.shown()!.menu!.enabled as Record<string, () => boolean>).leave()).toBe(true);
    run.facts.leavePending = true;
    expect((t.shown()!.menu!.enabled as Record<string, () => boolean>).leave()).toBe(false);
    run.facts.leavePending = false;

    t.row("leave");

    expect(run.asked).toEqual([{ kind: "leaveRun" }]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should send Fall from the confirm only, and dim it while it is asked (FS-9K8EZ req 3, 4)", () => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);
    t.esc();
    t.row("fall");
    expect(run.asked).toEqual([]);

    t.press({ enter: true });
    t.press({ enter: true });

    expect(run.asked).toEqual([{ kind: "fall" }]);
    expect(t.rows()).toEqual(["fall-now", "not-yet"]);
  });

  it("should take the whole of it down on the confirm's Not yet, and on Esc from it, nothing sent", () => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);
    t.esc();
    t.row("fall");
    t.esc();
    expect(t.slot.isOpen()).toBe(false);

    t.esc();
    t.row("fall");
    t.row("not-yet");
    expect(t.slot.isOpen()).toBe(false);
    expect(run.asked).toEqual([]);
  });

  it("should draw each panel at the view's centre, its blocker leaving the Menu icon's plate, and move it on a new view", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub").report);
    t.esc();
    const spec = t.shown()!.menu!;
    expect(spec.origin).toEqual({ x: 540, y: 360 });
    expect(spec.through?.(7, 0)).toBe(true);
    expect(spec.hit).toEqual({ width: 160, height: 34 });

    t.slot.relayout();

    expect(t.shown()!.moves).toEqual([{ x: 540, y: 360 }]);
  });
});

describe("OPTIONS in the slot (FS-TQZ5J R19; FS-28DDG § Change C3–C8, C17; FS-T3DWX)", () => {
  it("should open in the menu's place, the slot kept filled, and Back reopen the menu rebuilt as it is then", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();
    t.row("options");
    expect(t.shown()!.kind).toBe("options");
    expect(t.live()).toHaveLength(1);
    town.facts.queued = true;

    t.shown()!.options!.back();

    expect(t.rows()).toEqual(["change", "leave", "options", "back"]);
    expect(town.heardUi).toEqual([true]);
  });

  it("should go back to the menu on Esc, and close and open nothing on the Menu icon", () => {
    const t = onBridge();
    t.bridge.report(aWorld("field").report);
    t.esc();
    t.row("options");

    t.esc();
    expect(t.shown()!.kind).toBe("menu");
    t.row("options");
    t.slot.pressMenu();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.live()).toEqual([]);
  });

  it("should hand the panel the frame's fullscreen its page lent, and none where none was", () => {
    const fullscreen = { active: () => false, toggle: () => {}, watch: () => () => {} };
    const lent = onBridge(fullscreen);
    lent.bridge.report(aWorld("run").report);
    lent.esc();
    lent.row("options");
    expect(lent.shown()!.options!.fullscreen).toBe(fullscreen);

    const none = onBridge();
    none.bridge.report(aWorld("run").report);
    none.esc();
    none.row("options");
    expect(none.shown()!.options!.fullscreen).toBeNull();
  });

  it("should play menu_click as the menu gives way to OPTIONS, menu_back as it comes back, and settings_close as the whole closes (FS-WDM0X S5; § Change M6, M7)", () => {
    const t = onBridge();
    t.bridge.report(aWorld("hub").report);
    t.esc();
    expect(t.heard()).toEqual(["settings_open"]);

    t.row("options");
    t.esc();
    t.row("options");
    expect(t.heard()).toEqual(["menu_click", "menu_back", "menu_click"]);

    t.slot.pressMenu();
    expect(t.heard()).toEqual([]);
    t.esc();
    t.heard();
    t.bridge.act(() => t.slot.pressMenu());
    expect(t.heard()).toEqual(["settings_close"]);
  });

  it("should yield to the player's death as the menu does (FS-28DDG § Change C17)", () => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);
    t.esc();
    t.row("options");

    run.facts.resolved = true;
    t.slot.sync();

    expect(t.slot.isOpen()).toBe(false);
  });
});

describe("the slot's state, the UI's (FS-TQZ5J R10)", () => {
  it("should report the slot filled as the menu opens, so the world closes its windows first, and empty as it closes", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    town.windows.inventory = true;

    t.slot.pressMenu();
    expect(t.bridge.ui.menuOpen).toBe(true);
    expect(town.windows.inventory).toBe(false);
    expect(town.heardUi).toEqual([true]);

    t.slot.pressMenu();
    expect(t.bridge.ui.menuOpen).toBe(false);
    expect(town.heardUi).toEqual([true, false]);
  });

  it("should play only settings_open as the Menu icon opens the menu over an open window (FS-WDM0X S3)", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    town.windows.inventory = true;

    t.bridge.act(() => t.slot.pressMenu());

    expect(t.heard()).toEqual(["settings_open"]);
  });

  it("should open nothing on the Menu icon while the town's dialogue is open", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    town.state.dialogue = true;

    t.slot.pressMenu();

    expect(t.slot.isOpen()).toBe(false);
  });

  it("should only close the run's windows on the Menu icon once the run has ended (FS-3EBCA R6)", () => {
    const t = onBridge();
    const run = aWorld("run", { ended: true });
    t.bridge.report(run.report);

    t.slot.pressMenu();

    expect(run.asked).toEqual([
      { kind: "close", window: "party" },
      { kind: "close", window: "gear" },
    ]);
    expect(t.slot.isOpen()).toBe(false);
  });
});

describe("the menu yields (FS-TQZ5J R20; FS-9K8EZ req 6)", () => {
  it.each<[string, (w: ReturnType<typeof aWorld>, t: ReturnType<typeof onBridge>) => void]>([
    ["the player dies", (w) => (w.facts.resolved = true)],
    ["the run ends", (w) => (w.facts.ended = true)],
    ["the world leaves", (_w, t) => t.bridge.left("run")],
    ["another world comes up", (_w, t) => t.bridge.report(aWorld("hub").report)],
  ])("should close, with no sound, as %s", (_what, change) => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);
    t.esc();
    t.row("fall");
    t.heard();

    change(run, t);
    t.slot.sync();

    expect(t.slot.isOpen()).toBe(false);
    expect(t.live()).toEqual([]);
    expect(t.bridge.ui.menuOpen).toBe(false);
    expect(t.heard()).toEqual([]);
  });

  it("should close as a dialogue opens in the town", () => {
    const t = onBridge();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.esc();

    town.state.dialogue = true;
    t.slot.sync();

    expect(t.slot.isOpen()).toBe(false);
  });

  it("should stay open for a report of the same world that changes nothing it reads", () => {
    const t = onBridge();
    const run = aWorld("run", { resolved: true });
    t.bridge.report(run.report);
    t.esc();

    t.slot.sync();
    run.facts.fallPending = false;
    t.slot.sync();

    expect(t.slot.isOpen()).toBe(true);
    expect(t.shown()!.retones).toBe(0);
  });
});

describe("the town's menu and its queue (FS-TQZ5J R20; FS-G4VMQ R13)", () => {
  it("should come down as the queue it offered a way out of is gone, and stay for a queue joined under it", () => {
    const queued = onBridge();
    const town = aWorld("hub", { queued: true });
    queued.bridge.report(town.report);
    queued.esc();
    town.facts.queued = false;
    queued.slot.sync();
    expect(queued.slot.isOpen()).toBe(false);

    const not = onBridge();
    const other = aWorld("hub");
    not.bridge.report(other.report);
    not.esc();
    other.facts.queued = true;
    not.slot.sync();
    expect(not.slot.isOpen()).toBe(true);
  });
});

describe("the menu slot's sounds (FS-WDM0X § Change: Menu, dialog and notice sounds, M5–M10, M13)", () => {
  it("should play menu_click for Options, Change character and Leave the queue, each once, by the pointer or its key", () => {
    const t = onBridge();
    const town = aWorld("hub", { queued: true });
    t.bridge.report(town.report);
    t.esc();
    t.heard();

    t.row("change");
    t.press({ numbered: 1 });
    t.press({ numbered: 2 });

    expect(t.heard()).toEqual(["menu_click", "menu_click", "menu_click"]);
    expect(town.asked).toEqual([{ kind: "changeCharacter" }, { kind: "leaveQueue" }]);
    expect(t.shown()!.kind).toBe("options");
  });

  it("should play menu_back for OPTIONS' Back, its × and Esc, and nothing else for it", () => {
    const t = onBridge();
    t.bridge.report(aWorld("run").report);
    t.esc();
    t.row("options");
    t.heard();

    t.shown()!.options!.back();
    t.row("options");
    t.esc();

    expect(t.heard()).toEqual(["menu_back", "menu_click", "menu_back"]);
  });

  it("should play only settings_close as the menu's Back, its × or Esc closes the whole menu", () => {
    const t = onBridge();
    t.bridge.report(aWorld("field").report);
    t.esc();
    t.heard();
    t.row("back");
    expect(t.heard()).toEqual(["settings_close"]);

    t.esc();
    t.heard();
    t.shown()!.menu!.close();
    expect(t.heard()).toEqual(["settings_close"]);
  });

  it("should play only settings_close for Leave the barrow, which closes the whole menu", () => {
    const t = onBridge();
    const run = aWorld("run", { resolved: true });
    t.bridge.report(run.report);
    t.esc();
    t.heard();

    t.row("leave");

    expect(t.heard()).toEqual(["settings_close"]);
  });

  it("should play dialog_open as Fall where you stand opens the confirm, by the pointer or 1", () => {
    const t = onBridge();
    t.bridge.report(aWorld("run").report);
    t.esc();
    t.heard();
    t.row("fall");
    expect(t.heard()).toEqual(["dialog_open"]);

    t.row("not-yet");
    t.esc();
    t.heard();
    t.press({ numbered: 0 });
    expect(t.heard()).toEqual(["dialog_open"]);
  });

  it("should play dialog_confirm_heavy for Fall, and dialog_cancel alone for Not yet, its × and Esc", () => {
    const t = onBridge();
    const run = aWorld("run");
    t.bridge.report(run.report);
    const confirm = () => {
      t.esc();
      t.row("fall");
      t.heard();
    };

    confirm();
    t.row("fall-now");
    expect(t.heard()).toEqual(["dialog_confirm_heavy"]);
    expect(run.asked).toEqual([{ kind: "fall" }]);
    t.row("not-yet");
    expect(t.heard()).toEqual(["dialog_cancel"]);

    confirm();
    t.shown()!.menu!.close();
    expect(t.heard()).toEqual(["dialog_cancel"]);

    confirm();
    t.esc();
    expect(t.heard()).toEqual(["dialog_cancel"]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should hand the menu, the Fall confirm and OPTIONS a feedback that plays menu_hover and menu_error", () => {
    const t = onBridge();
    t.bridge.report(aWorld("run").report);
    t.esc();
    t.heard();
    const menu = t.shown()!.menu!.feedback!;
    menu.hovered();
    menu.refused();
    expect(t.heard()).toEqual(["menu_hover", "menu_error"]);

    t.row("fall");
    t.heard();
    const confirm = t.shown()!.menu!.feedback!;
    confirm.hovered();
    confirm.refused();
    expect(t.heard()).toEqual(["menu_hover", "menu_error"]);

    t.row("not-yet");
    t.esc();
    t.row("options");
    t.heard();
    const options = t.shown()!.options!.feedback!;
    options.hovered();
    options.refused();
    expect(t.heard()).toEqual(["menu_hover", "menu_error"]);
  });

  it("should hand OPTIONS a feedback that plays a tick for a step and the Fullscreen row's way for its press", () => {
    const t = onBridge({ active: () => false, toggle: () => {}, watch: () => () => {} });
    t.bridge.report(aWorld("hub").report);
    t.esc();
    t.row("options");
    t.heard();
    const options = t.shown()!.options!.feedback!;

    options.stepped();
    options.toggled(true);
    options.toggled(false);

    expect(t.heard()).toEqual(["menu_slider_tick", "menu_toggle_on", "menu_toggle_off"]);
  });
});
