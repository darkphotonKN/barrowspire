import { describe, expect, it } from "vitest";
import { recordAnchor, resolvedRowY } from "./resolvedRow";
import { GameUiBridge, NO_FACTS, type UiRequest, type World, type WorldFacts, type WorldReport } from "./uiBridge";
import { UiControlsSlot, UiRecordSlot, type ControlsPiece, type OpenWindows, type RecordPiece } from "./uiSceneRecord";
import type { RecordView } from "./settlement";

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-15): the run's settlement record is drawn by the UI scene from the
// run's data, its Close asked of the run after its sound (R57); the controls panel is the UI scene's own,
// toggled by H, refused under the menu and after the run's end, and closed by the end appearing (R56, R58).

function aWorld(world: World) {
  const facts: { -readonly [K in keyof WorldFacts]: WorldFacts[K] } = { ...NO_FACTS };
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ letter: false }),
    blockers: () => ({ dialogue: false }),
    facts: () => ({ ...facts }),
    answer: (request) => void asked.push(request),
  };
  return { report, facts, asked };
}

/** Every window the slot hears of, shut. */
const SHUT: OpenWindows = {
  menu: false,
  inventory: false,
  character: false,
  stash: false,
  container: false,
  party: false,
  record: false,
  letter: false,
};

const view = (status: string) => ({ status: { text: status, tone: "neutral" } }) as unknown as RecordView;

/** The record as the slot keeps it, recording what was done to it. */
function onRecord() {
  const bridge = new GameUiBridge();
  const played: string[] = [];
  bridge.lendSounds({ act: (run) => run(), play: (effect) => void played.push(effect) });
  const records: { log: string[]; anchor: unknown; onClose(): void; onHover(): void }[] = [];
  let anchor = { x: 540, bottom: 400 };
  const slot = new UiRecordSlot(
    bridge,
    (at, onClose, onHover): RecordPiece => {
      const r = { log: [] as string[], anchor: at, onClose, onHover };
      records.push(r);
      return {
        set: (v) => void r.log.push(`set ${(v as unknown as { status: { text: string } }).status.text}`),
        open: () => void r.log.push("open"),
        close: () => void r.log.push("close"),
        relayout: (a) => void r.log.push(`relayout ${a.x},${a.bottom}`),
        rect: () => ({ x: 280, y: 100, width: 520, height: 300 }),
      };
    },
    () => anchor,
  );
  const run = aWorld("run");
  bridge.report(run.report);
  slot.world(run.report);
  return { bridge, slot, records, played, run, moveAnchor: (a: typeof anchor) => (anchor = a) };
}

describe("the run's settlement record on the UI scene (FS-TQZ5J § Change: Phase 3, R57)", () => {
  it("should build the record on the first the run hands, at its anchor, and draw each up or down as the run says", () => {
    const { slot, records } = onRecord();
    slot.show({ view: view("Settling…"), open: true }, "run");
    slot.show({ view: view("Settled."), open: true }, "run");
    slot.show({ view: view("Settled."), open: false }, "run");

    expect(records).toHaveLength(1);
    expect(records[0].anchor).toEqual({ x: 540, bottom: 400 });
    expect(records[0].log).toEqual(["set Settling…", "open", "set Settled.", "open", "set Settled.", "close"]);
  });

  it("should play menu_click on Close, then ask the run to close it; menu_hover as the pointer comes onto Close (FS-WDM0X § Pass 2b E4, E5)", () => {
    const { slot, records, played, run } = onRecord();
    slot.show({ view: view("Settled."), open: true }, "run");

    records[0].onHover();
    expect(played).toEqual(["menu_hover"]);
    expect(run.asked).toEqual([]);
    records[0].onClose();

    expect(played).toEqual(["menu_hover", "menu_click"]);
    expect(run.asked).toEqual([{ kind: "close", window: "record" }]);
  });

  it("should stand the record at its new place on a new view, and take it down as the run leaves or hands none", () => {
    const { slot, records, moveAnchor } = onRecord();
    slot.show({ view: view("Settled."), open: true }, "run");
    moveAnchor({ x: 960, bottom: 600 });
    slot.relayout();
    slot.world(aWorld("hub").report);

    expect(records[0].log.slice(-2)).toEqual(["relayout 960,600", "close"]);
    slot.show({ view: view("Again."), open: true }, "run");
    slot.show(null, "run");
    expect(records).toHaveLength(2);
    expect(records[1].log.at(-1)).toBe("close");
  });

  // FS-84N1G R20: where the record stands while it is up, for the party panel's invite field
  it("should give its rect while it is up, and none while it is down or gone", () => {
    const { bridge, slot } = onRecord();
    expect(slot.rect()).toBeNull();
    bridge.lendSounds({ act: (run) => run(), play: () => {} });
    slot.show({ view: view("Pending"), open: true }, "run");
    expect(slot.rect()).toEqual({ x: 280, y: 100, width: 520, height: 300 });
    slot.show({ view: view("Pending"), open: false }, "run");
    expect(slot.rect()).toBeNull();
  });

  it("should place the record by the run's own rule: centred across, just over the bottom-centre row", () => {
    const at = recordAnchor({ centerX: 540, height: 720 });
    expect(at).toEqual({ x: 540, bottom: resolvedRowY({ height: 720 }) - 19 - 12 });
    expect(resolvedRowY({ height: 720 })).toBe(720 - 16 - 200 - 19);
  });
});

describe("the run's controls panel on the UI scene (FS-TQZ5J § Change: Phase 3, R56, R58)", () => {
  function onControls(world: World = "run") {
    const bridge = new GameUiBridge();
    const played: string[] = [];
    // the game's one player: an action's first effect asked is its one sound (FS-WDM0X M2)
    let depth = 0;
    let asked: string | null = null;
    bridge.lendSounds({
      act: (run) => {
        if (depth > 0) return run();
        depth++;
        try {
          return run();
        } finally {
          depth--;
          if (asked) played.push(asked);
          asked = null;
        }
      },
      play: (effect) => {
        if (depth > 0) asked ??= effect;
        else played.push(effect);
      },
    });
    const panels: { relayouts: number; destroyed: boolean; close: () => void }[] = [];
    const slot = new UiControlsSlot(
      bridge,
      (close): ControlsPiece => {
        const p = { relayouts: 0, destroyed: false, close };
        panels.push(p);
        return { relayout: () => void p.relayouts++, destroy: () => void (p.destroyed = true), rect: () => ({ x: 410, y: 192, width: 260, height: 336 }) };
      },
      () => SHUT,
    );
    const w = aWorld(world);
    bridge.report(w.report);
    slot.world(w.report);
    return { bridge, slot, panels, w, played };
  }

  it("should open and close on H in the run", () => {
    const { slot, panels } = onControls();
    slot.toggle();
    expect(slot.isOpen()).toBe(true);
    slot.relayout();
    slot.toggle();
    expect(slot.isOpen()).toBe(false);
    expect(panels.map(({ relayouts, destroyed }) => ({ relayouts, destroyed }))).toEqual([{ relayouts: 1, destroyed: true }]);
  });

  // FS-84N1G R11 (the owner: 「音效用dialog的開關就可」): the player's open plays dialog_open, the close dialog_cancel
  it("should play dialog_open as H opens it and dialog_cancel as H closes it, one sound each", () => {
    const { slot, played } = onControls();
    slot.toggle();
    expect(played).toEqual(["dialog_open"]);
    slot.toggle();
    expect(played).toEqual(["dialog_open", "dialog_cancel"]);
  });

  it("should play nothing for an H it refuses (FS-84N1G R19)", () => {
    const { slot, bridge, played } = onControls();
    bridge.reportUi({ menuOpen: true });
    slot.toggle();
    expect(played).toEqual([]);
  });

  // FS-84N1G R14: its × closes it, as the player's close
  it("should close on its ×, with dialog_cancel", () => {
    const { slot, panels, played } = onControls();
    slot.toggle();
    panels[0].close();
    expect(slot.isOpen()).toBe(false);
    expect(panels[0].destroyed).toBe(true);
    expect(played).toEqual(["dialog_open", "dialog_cancel"]);
  });

  // FS-84N1G R12: what the game closes plays nothing (FS-WDM0X S4)
  it("should play nothing as the run's end or the run's leaving closes it", () => {
    const { slot, played } = onControls();
    slot.toggle();
    slot.close();
    slot.toggle();
    slot.world(null);
    expect(played).toEqual(["dialog_open", "dialog_open"]);
  });

  // FS-84N1G R20: where the open panel stands, for the party panel's invite field
  it("should give its rect while open, and none while shut", () => {
    const { slot } = onControls();
    expect(slot.rect()).toBeNull();
    slot.toggle();
    expect(slot.rect()).toEqual({ x: 410, y: 192, width: 260, height: 336 });
  });

  it("should refuse H outside the run, under the menu and after the run's end", () => {
    const town = onControls("hub");
    town.slot.toggle();
    expect(town.slot.isOpen()).toBe(false);

    const run = onControls();
    run.bridge.reportUi({ menuOpen: true });
    run.slot.toggle();
    expect(run.slot.isOpen()).toBe(false);
    run.bridge.reportUi({ menuOpen: false });
    run.w.facts.ended = true;
    run.slot.toggle();
    expect(run.slot.isOpen()).toBe(false);
  });

  it("should close as the run's end appears, and as the run leaves", () => {
    const { slot, panels } = onControls();
    slot.toggle();
    slot.close();
    expect(panels[0].destroyed).toBe(true);
    slot.toggle();
    slot.world(null);
    expect(panels[1].destroyed).toBe(true);
    expect(slot.isOpen()).toBe(false);
  });
});

// FS-84N1G R16 (the owner: 「這個面板開啟其他面板時也要關閉」): another window opening closes the open panel,
// silently; R18: Q closes it first
describe("the controls panel's close rules (FS-84N1G R16, R18)", () => {
  function onControls() {
    const bridge = new GameUiBridge();
    const played: string[] = [];
    bridge.lendSounds({ act: (run) => run(), play: (effect) => void played.push(effect) });
    // the windows as the UI scene reads them, each time the slot asks
    const windows: { now: OpenWindows } = { now: SHUT };
    const slot = new UiControlsSlot(
      bridge,
      (): ControlsPiece => ({ relayout: () => {}, destroy: () => {}, rect: () => ({ x: 0, y: 0, width: 0, height: 0 }) }),
      () => windows.now,
    );
    const w = aWorld("run");
    bridge.report(w.report);
    slot.world(w.report);
    const open = (...names: (keyof OpenWindows)[]) => (windows.now = { ...SHUT, ...Object.fromEntries(names.map((n) => [n, true])) });
    return { bridge, slot, played, w, open };
  }

  it.each(["inventory", "party", "record", "container", "menu", "letter"] as const)("should close, silently, as the %s opens", (window) => {
    const { slot, played, open } = onControls();
    slot.sync();
    slot.toggle();
    slot.sync();
    expect(slot.isOpen()).toBe(true);
    open(window);
    slot.sync();
    expect(slot.isOpen()).toBe(false);
    expect(played).toEqual(["dialog_open"]);
  });

  it("should stay open over a window already open as it opened, and close as another opens", () => {
    const { slot, open } = onControls();
    open("inventory");
    slot.sync();
    slot.toggle();
    slot.sync();
    expect(slot.isOpen()).toBe(true);
    open("inventory", "party");
    slot.sync();
    expect(slot.isOpen()).toBe(false);
  });

  // the review of FS-84N1G: the UI scene updates before the world (Phaser steps the scene list from the
  // top), so a window the world opened in its own update is first seen at the next sync, after an H
  // heard on that frame's key event; a window open as H opens the panel must not close it
  it("should stay open over a window opened since the last sync but before H, as it opened over it", () => {
    const { slot, open } = onControls();
    slot.sync();
    open("container");
    slot.toggle();
    slot.sync();
    expect(slot.isOpen()).toBe(true);
  });

  it("should take Q while open, closing with dialog_cancel, and leave Q to the gear while shut", () => {
    const { slot, played } = onControls();
    expect(slot.closeKey()).toBe(false);
    slot.toggle();
    expect(slot.closeKey()).toBe(true);
    expect(slot.isOpen()).toBe(false);
    expect(played).toEqual(["dialog_open", "dialog_cancel"]);
  });
});
