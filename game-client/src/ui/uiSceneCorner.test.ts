import { describe, expect, it } from "vitest";
import type { CornerIconSpec } from "./HudCorner";
import type { CornerIcon } from "./hudCornerLayout";
import { UiCornerRow, type CornerRow } from "./uiSceneCorner";
import { NO_FACTS, type UiRequest, type World, type WorldReport, type WorldWindows } from "./uiBridge";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";

// FS-TQZ5J §C R13–R15 (I-TQZ5J-3, I-TQZ5J-4): the corner row is the UI scene's, built from the world's
// report and rebuilt as the world changes; its Inventory and Character the UI scene's own gear overlay
// (§ Change: Phase 3, R55), its Party its party panel, its Menu its menu slot, each inside the UI scene's
// act, so a press plays the rule once; the refusals read the report and the UI's state (the slot filled).

/** What the row was built with, and what was done to it since. */
interface BuiltRow {
  icons: CornerIconSpec[];
  relayouts: number;
  destroyed: boolean;
}

/** A world as it reports itself: its windows and its dialogue, as they are now; what it was asked. */
function aWorld(world: World) {
  const windows: { -readonly [K in keyof WorldWindows]: boolean } = { letter: false };
  const state = { dialogue: false };
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ ...windows }),
    blockers: () => ({ dialogue: state.dialogue }),
    facts: () => NO_FACTS,
    answer: (request) => void asked.push(request),
  };
  return { report, windows, state, asked };
}

/**
 * The UI scene's gear overlay as the row reaches it (§ Change: Phase 3, R55): each panel open or shut,
 * and refused while `refused` says so, as the gear slot is by the menu and `blockers().gear`.
 */
function aGear() {
  const gear = { inventory: false, character: false, refused: false, toggles: [] as string[] };
  return Object.assign(gear, {
    isInventoryOpen: () => gear.inventory,
    isCharacterOpen: () => gear.character,
    toggle: (window: "inventory" | "character") => {
      gear.toggles.push(window);
      if (!gear.refused) gear[window] = !gear[window];
    },
  });
}

/**
 * The UI scene's party panel as the row reaches it (§ Change: Phase 2: the party, R39): open or shut,
 * and refused while `refused` says so, as `PartyPanel.toggle` is by its `blocked`.
 */
function aPartyPanel() {
  const party = { open: false, refused: false, toggles: 0 };
  return Object.assign(party, {
    isOpen: () => party.open,
    toggle: () => {
      party.toggles++;
      if (!party.refused) party.open = !party.open;
    },
  });
}

/**
 * The UI scene's row on the game's bridge, with the UI scene's sounds lent, built on a recording row;
 * its Menu handed to a stand-in for the UI scene's menu slot, which fills and empties the slot as the
 * slot reports it (R10); its Party the UI scene's own party panel.
 */
function onBridge() {
  const party = aPartyPanel();
  const gear = aGear();
  const { bridge, heard } = heardInterfaceSounds(undefined, {
    party: () => party.isOpen(),
    inventory: () => gear.inventory,
    character: () => gear.character,
  });
  const built: BuiltRow[] = [];
  const menuPresses: number[] = [];
  const menu = () => {
    menuPresses.push(1);
    bridge.reportUi({ menuOpen: !bridge.ui.menuOpen });
  };
  const row = new UiCornerRow(
    bridge,
    (icons): CornerRow => {
      const b: BuiltRow = { icons, relayouts: 0, destroyed: false };
      built.push(b);
      return {
        relayout: () => void b.relayouts++,
        destroy: () => void (b.destroyed = true),
        covers: (_x, _y, icon) => icon === "menu",
      };
    },
    menu,
    party,
    gear,
  );
  const live = () => built.filter((b) => !b.destroyed);
  const press = (icon: CornerIcon) => live()[0].icons.find((spec) => spec.icon === icon)!.press?.();
  return { bridge, heard, row, built, live, press, menuPresses, party, gear };
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

  it("should toggle the UI scene's own party panel on Party, asking the world nothing (§ Change: Phase 2: the party, R39)", () => {
    const { bridge, row, press, party } = onBridge();
    const world = aWorld("field");
    bridge.report(world.report);
    row.show(bridge.world);

    press("party");
    expect(party.open).toBe(true);
    press("party");

    expect(party.open).toBe(false);
    expect(world.asked).toEqual([]);
  });

  it.each(["inventory", "character"] as const)(
    "should toggle the UI scene's own gear overlay on %s, asking the world nothing (§ Change: Phase 3, R55)",
    (icon) => {
      const { bridge, row, press, gear } = onBridge();
      const world = aWorld("field");
      bridge.report(world.report);
      row.show(bridge.world);

      press(icon);

      expect(gear.toggles).toEqual([icon]);
      expect(gear[icon]).toBe(true);
      expect(world.asked).toEqual([]);
    },
  );

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

  it("should refuse Party while the world reports a dialogue open, and still hand Inventory to the gear and Menu on (R14)", () => {
    const { bridge, row, press, menuPresses, party, gear } = onBridge();
    const world = aWorld("hub");
    bridge.report(world.report);
    row.show(bridge.world);
    world.state.dialogue = true;

    press("party");
    press("inventory");
    press("menu");

    expect(party.toggles).toBe(0);
    expect(gear.toggles).toEqual(["inventory"]);
    expect(menuPresses).toHaveLength(1);
  });
});

// While the UI scene's menu slot is filled, every window icon is refused and only Menu answers
// (FS-3EBCA R18: 「menu開啟時其他都不能按」): the slot's blocker, in the same scene and over the row,
// takes their hovers and presses. Under the town's dialogue the card, in the same scene since
// I-TQZ5J-7, stands over the row at the popup band and takes its rows' presses by depth, so the row
// holds nothing for it either (FS-TQZ5J A2 R32): what answers under it is what the town refuses (R14).
describe("the UI scene's corner row where the UI's menu or the world keeps the screen (FS-3EBCA R18; FS-TQZ5J R14, A2 R32)", () => {
  it("should send nothing on Inventory, Character or Party while the UI's menu slot is filled, and still hand on Menu", () => {
    const { bridge, row, press, menuPresses, party, gear } = onBridge();
    const world = aWorld("run");
    bridge.report(world.report);
    row.show(bridge.world);
    bridge.reportUi({ menuOpen: true });

    for (const icon of ["inventory", "character", "party"] as const) press(icon);
    press("menu");

    expect(world.asked).toEqual([]);
    expect(gear.toggles).toEqual([]);
    expect(party.toggles).toBe(0);
    expect(menuPresses).toHaveLength(1);
    expect(bridge.ui.menuOpen).toBe(false);
  });

  it("should hold no icon under the town's dialogue: Inventory and Character handed to the gear, Party refused, Menu handed on (A2 R32)", () => {
    const { bridge, row, press, menuPresses, gear } = onBridge();
    const world = aWorld("hub");
    bridge.report(world.report);
    row.show(bridge.world);
    world.state.dialogue = true;

    press("inventory");
    press("character");
    press("party");
    press("menu");

    expect(gear.toggles).toEqual(["inventory", "character"]);
    expect(menuPresses).toHaveLength(1);
    expect("sync" in row).toBe(false);
  });
});

describe("the corner row's hover and refusal sounds (FS-WDM0X § Change: Menu, dialog and notice sounds, M5, M10)", () => {
  /** The world reported and the row built for it, its windows answered as the world answers them. */
  function standing(world: World) {
    const t = onBridge();
    const w = aWorld(world);
    t.bridge.report(w.report);
    t.row.show(t.bridge.world);
    const spec = (icon: CornerIcon) => t.live()[0].icons.find((s) => s.icon === icon)!;
    return { ...t, w, spec };
  }

  it("should play menu_hover for a hover on Menu, Inventory, Character and Party, in each world", () => {
    for (const world of ["hub", "field", "run"] as const) {
      const t = standing(world);
      for (const icon of ["menu", "inventory", "character", "party"] as const) t.spec(icon).hovered?.();
      expect(t.heard()).toEqual(["menu_hover", "menu_hover", "menu_hover", "menu_hover"]);
    }
  });

  it("should give the greyed Mailbox no hover, and play menu_error for its press, outside the town", () => {
    const t = standing("field");
    const mail = t.spec("mail");

    expect(mail.hovered).toBeUndefined();
    mail.refused?.();

    expect(t.heard()).toEqual(["menu_error"]);
  });

  it("should play menu_error for Party under the town's dialogue, and Inventory's own open", () => {
    const t = standing("hub");
    t.w.state.dialogue = true;

    t.press("party");
    t.press("inventory");

    expect(t.heard()).toEqual(["menu_error", "inventory_open"]);
  });

  it("should play menu_error for a window icon turned away: its press changed no window", () => {
    const t = standing("run");
    // the gear refused (the town's dialogue would, § Change: Phase 3, R55), and Party with a chest open
    // (the panel's refusal reads it, § Change: Phase 2: the party, R38)
    t.gear.refused = true;
    t.party.refused = true;

    t.press("inventory");
    t.press("party");

    expect(t.gear.toggles).toEqual(["inventory"]);
    expect(t.party.toggles).toBe(1);
    expect(t.heard()).toEqual(["menu_error", "menu_error"]);
  });

  it("should play one sound for a press that changes a window, never menu_error beside it", () => {
    const t = standing("field");

    t.press("character");
    t.press("character");

    expect(t.heard()).toEqual(["character_open", "character_close"]);
  });
});
