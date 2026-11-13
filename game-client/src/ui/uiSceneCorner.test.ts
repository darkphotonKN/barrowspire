import { describe, expect, it } from "vitest";
import type { CornerIconSpec } from "./HudCorner";
import type { CornerIcon } from "./hudCornerLayout";
import { UiCornerRow, type CornerRow } from "./uiSceneCorner";
import { NO_FACTS, answering, type UiRequest, type World, type WorldReport, type WorldWindows } from "./uiBridge";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";

// FS-TQZ5J §C R13–R15 (I-TQZ5J-3, I-TQZ5J-4): the corner row is the UI scene's, built from the world's
// report and rebuilt as the world changes; its window icons are requests the world answers through
// the bridge, its Menu the UI scene's own menu slot's, each inside the UI scene's act, so a press
// plays the rule once; the refusals read the report and the UI's state (the slot filled).

/** What the row was built with, and what was done to it since. */
interface BuiltRow {
  icons: CornerIconSpec[];
  holds: string[][];
  relayouts: number;
  destroyed: boolean;
}

/** A world as it reports itself: its windows and its dialogue, as they are now; what it was asked. */
function aWorld(world: World) {
  const windows: { -readonly [K in keyof WorldWindows]: boolean } = {
    letter: false,
    party: false,
    inventory: false,
    character: false,
  };
  const state = { dialogue: false };
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ ...windows }),
    blockers: () => ({ dialogue: state.dialogue }),
    facts: () => NO_FACTS,
    answer: (request) => {
      asked.push(request);
      answering({
        inventory: () => void (windows.inventory = !windows.inventory),
        character: () => void (windows.character = !windows.character),
        party: () => void (windows.party = !windows.party),
      })(request);
    },
  };
  return { report, windows, state, asked };
}

/**
 * The UI scene's row on the game's bridge, with the UI scene's sounds lent, built on a recording row;
 * its Menu handed to a stand-in for the UI scene's menu slot, which fills and empties the slot as the
 * slot reports it (R10).
 */
function onBridge() {
  const { bridge, heard } = heardInterfaceSounds();
  const built: BuiltRow[] = [];
  const menuPresses: number[] = [];
  const menu = () => {
    menuPresses.push(1);
    bridge.reportUi({ menuOpen: !bridge.ui.menuOpen });
  };
  const row = new UiCornerRow(
    bridge,
    (icons): CornerRow => {
      const b: BuiltRow = { icons, holds: [], relayouts: 0, destroyed: false };
      built.push(b);
      return {
        hold: (held) => void b.holds.push([...held]),
        relayout: () => void b.relayouts++,
        destroy: () => void (b.destroyed = true),
        covers: (_x, _y, icon) => icon === "menu",
      };
    },
    menu,
  );
  const live = () => built.filter((b) => !b.destroyed);
  const press = (icon: CornerIcon) => live()[0].icons.find((spec) => spec.icon === icon)!.press?.();
  return { bridge, heard, row, built, live, press, menuPresses };
}

const shape = (icons: CornerIconSpec[]) => icons.map(({ icon, greyed }) => (greyed ? `${icon} (greyed)` : icon));

describe("the UI scene's corner row, built from the world's report (FS-TQZ5J R13)", () => {
  it("should build the town's Menu, Inventory, Character and Party, its Mailbox slot left to the town's envelope", () => {
    const { bridge, row, live } = onBridge();
    bridge.report(aWorld("hub").report);

    row.show(bridge.world);

    expect(live()).toHaveLength(1);
    expect(shape(live()[0].icons)).toEqual(["menu", "inventory", "character", "party"]);
  });

  it.each(["field", "run"] as const)("should build the same four in the %s, and the greyed Mailbox", (world) => {
    const { bridge, row, live } = onBridge();
    bridge.report(aWorld(world).report);

    row.show(bridge.world);

    expect(shape(live()[0].icons)).toEqual(["menu", "inventory", "character", "party", "mail (greyed)"]);
    expect(live()[0].icons.at(-1)!.press).toBeUndefined();
  });

  it("should build nothing while no world is reported", () => {
    const { row, built } = onBridge();

    row.show(null);

    expect(built).toEqual([]);
  });

  it("should take the row down as the world leaves, and build it anew for the next world: town, run, the town again", () => {
    const { bridge, row, built, live } = onBridge();
    for (const world of ["hub", "run", "hub"] as const) {
      bridge.report(aWorld(world).report);
      row.show(bridge.world);
      bridge.left(world);
      row.show(null);
    }
    expect(built).toHaveLength(3);
    expect(live()).toEqual([]);
    expect(built.map((b) => shape(b.icons).length)).toEqual([4, 5, 4]);
  });

  it("should rebuild on a report of another world, and keep the row standing on a report of the same one", () => {
    const { bridge, row, built, live } = onBridge();
    bridge.report(aWorld("field").report);
    row.show(bridge.world);
    row.show(bridge.world);
    expect(built).toHaveLength(1);

    bridge.report(aWorld("hub").report);
    row.show(bridge.world);

    expect(built).toHaveLength(2);
    expect(built[0].destroyed).toBe(true);
    expect(shape(live()[0].icons)).toHaveLength(4);
  });

  it("should relay the row out on a new view, and take it down with the UI scene", () => {
    const { bridge, row, built } = onBridge();
    bridge.report(aWorld("run").report);
    row.show(bridge.world);

    row.relayout();
    row.destroy();

    expect(built[0].relayouts).toBe(1);
    expect(built[0].destroyed).toBe(true);
  });
});

describe("the UI scene's corner row's presses (FS-TQZ5J R11, R14, R22)", () => {
  it("should hand Menu to the UI scene's menu slot, asking the world nothing (R14, R16)", () => {
    const { bridge, row, press, menuPresses } = onBridge();
    const world = aWorld("field");
    bridge.report(world.report);
    row.show(bridge.world);

    press("menu");

    expect(menuPresses).toHaveLength(1);
    expect(world.asked).toEqual([]);
  });

  it("should play the slot's own sound for Menu, inside the UI scene's act (R22; FS-WDM0X S3)", () => {
    const { bridge, heard, row, press } = onBridge();
    bridge.report(aWorld("hub").report);
    row.show(bridge.world);

    press("menu");
    expect(heard()).toEqual(["settings_open"]);
    press("menu");
    expect(heard()).toEqual(["settings_close"]);
  });

  it("should say whether a point lies on Menu's plate, for the open menu's blocker (FS-3EBCA R18)", () => {
    const { bridge, row } = onBridge();
    expect(row.covers(1, 1, "menu")).toBe(false);
    bridge.report(aWorld("run").report);
    row.show(bridge.world);

    expect(row.covers(1, 1, "menu")).toBe(true);
    expect(row.covers(1, 1, "party")).toBe(false);
  });

  it.each<[CornerIcon, UiRequest]>([
    ["inventory", { kind: "toggle", window: "inventory" }],
    ["character", { kind: "toggle", window: "character" }],
    ["party", { kind: "toggle", window: "party" }],
  ])("should ask the world, on %s, for %j", (icon, request) => {
    const { bridge, row, press } = onBridge();
    const world = aWorld("field");
    bridge.report(world.report);
    row.show(bridge.world);

    press(icon);

    expect(world.asked).toEqual([request]);
  });

  it("should send each press inside the UI scene's act: one sound for the press, the world's answer joined to it", () => {
    const { bridge, heard, row, press } = onBridge();
    const world = aWorld("hub");
    bridge.report(world.report);
    row.show(bridge.world);

    press("inventory");
    expect(heard()).toEqual(["inventory_open"]);
    press("party");
    expect(heard()).toEqual(["party_open"]);
    press("inventory");
    expect(heard()).toEqual(["inventory_close"]);
  });

  it("should send a press to the world reported now, not the one the row was built for", () => {
    const { bridge, row, press } = onBridge();
    bridge.report(aWorld("run").report);
    row.show(bridge.world);
    const again = aWorld("run");
    bridge.report(again.report);

    press("character");

    expect(again.asked).toEqual([{ kind: "toggle", window: "character" }]);
  });

  it("should refuse Party while the world reports a dialogue open, and still send Inventory and hand on Menu (R14)", () => {
    const { bridge, row, press, menuPresses } = onBridge();
    const world = aWorld("hub");
    bridge.report(world.report);
    row.show(bridge.world);
    world.state.dialogue = true;

    press("party");
    press("inventory");
    press("menu");

    expect(world.asked).toEqual([{ kind: "toggle", window: "inventory" }]);
    expect(menuPresses).toHaveLength(1);
  });
});

// While the UI scene's menu slot is filled, every window icon is refused and only Menu answers
// (FS-3EBCA R18: 「menu開啟時其他都不能按」): the slot's blocker, in the same scene and over the row,
// takes their hovers and presses, so the row holds nothing for it (slice 3's stopgap is gone). Where
// the town keeps the screen with its dialogue, whose answers' hit areas lie under the row, the row
// holds every icon until the dialogue moves into the UI scene (I-TQZ5J-7).
describe("the UI scene's corner row where the UI's menu or the world keeps the screen (FS-3EBCA R18; FS-TQZ5J R14)", () => {
  it("should send nothing on Inventory, Character or Party while the UI's menu slot is filled, and still hand on Menu", () => {
    const { bridge, row, press, menuPresses } = onBridge();
    const world = aWorld("run");
    bridge.report(world.report);
    row.show(bridge.world);
    bridge.reportUi({ menuOpen: true });

    for (const icon of ["inventory", "character", "party"] as const) press(icon);
    press("menu");

    expect(world.asked).toEqual([]);
    expect(menuPresses).toHaveLength(1);
    expect(bridge.ui.menuOpen).toBe(false);
  });

  it("should hold nothing while the menu slot is filled: its blocker over the row is the menu's own (FS-3EBCA R18)", () => {
    const { bridge, row, press, live } = onBridge();
    bridge.report(aWorld("hub").report);
    row.show(bridge.world);

    press("menu");
    row.sync();

    expect(live()[0].holds).toEqual([[]]);
  });

  it("should hold every icon, Menu too, while the town reports a dialogue open, and let them go as it closes", () => {
    const { bridge, row, live } = onBridge();
    const world = aWorld("hub");
    bridge.report(world.report);
    row.show(bridge.world);

    world.state.dialogue = true;
    row.sync();
    world.state.dialogue = false;
    row.sync();

    expect(live()[0].holds).toEqual([[], ["menu", "inventory", "character", "party"], []]);
  });

  it("should sync nothing with no row standing", () => {
    const { row } = onBridge();

    expect(() => row.sync()).not.toThrow();
  });
});
