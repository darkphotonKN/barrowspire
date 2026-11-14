import { describe, expect, it } from "vitest";
import { GameUiBridge, NO_FACTS, type WorldWindows } from "./uiBridge";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";

const CLOSED: WorldWindows = { letter: false, inventory: false, character: false };

/**
 * The bridge with the UI scene's sounds lent, and a town reporting windows the test opens and closes;
 * `windows.party` is the UI scene's own party panel (§ Change: Phase 2: the party, R39).
 */
function town() {
  const windows: { -readonly [K in keyof WorldWindows]: boolean } & { party: boolean } = { ...CLOSED, party: false };
  const { bridge, sounds, heard } = heardInterfaceSounds(undefined, () => windows.party);
  let reads = 0;
  bridge.report({
    world: "hub",
    windows: () => {
      reads++;
      return { ...windows };
    },
    blockers: () => ({ dialogue: false }),
    facts: () => NO_FACTS,
    answer: () => {},
  });
  return { bridge, sounds, heard, windows, reads: () => reads };
}

// FS-TQZ5J R12, R22: the game's one UiSounds is the UI scene's; a world's player action reaches it
// through the bridge's act, and the rule (FS-WDM0X S3–S9) plays for the action's before and after
describe("the interface sounds on the UI scene, heard through the UI bridge (FS-TQZ5J R12, R22)", () => {
  it("should play only inventory_open for a world action that closes the letter and opens the inventory, reading the world's windows once before and once after (S3)", () => {
    const t = town();
    t.windows.letter = true;
    const before = t.reads();

    t.bridge.act(() => {
      t.windows.letter = false;
      t.windows.inventory = true;
    });

    expect(t.heard()).toEqual(["inventory_open"]);
    expect(t.reads() - before).toBe(2);
  });

  it("should play a world action's close, once (S2)", () => {
    const t = town();
    t.windows.party = true;

    t.bridge.act(() => void (t.windows.party = false));

    expect(t.heard()).toEqual(["party_close"]);
  });

  it("should have a world action inside a UI act join it: the outer action plays once, for its whole change (S9)", () => {
    const t = town();
    t.windows.inventory = true;

    t.sounds.act(() => {
      t.bridge.reportUi({ menuOpen: true });
      t.bridge.act(() => void (t.windows.inventory = false));
    });

    expect(t.heard()).toEqual(["settings_open"]);
  });

  it("should have a world action inside another join it, as a panel's toggle inside a corner press does (S9)", () => {
    const t = town();

    t.bridge.act(() => t.bridge.act(() => void (t.windows.party = true)));

    expect(t.heard()).toEqual(["party_open"]);
  });

  it("should play nothing for a change the world makes on its own, not run through act (S4)", () => {
    const t = town();

    t.windows.inventory = true;
    t.windows.inventory = false;
    t.windows.party = true;

    expect(t.heard()).toEqual([]);
    t.bridge.act(() => {});
    expect(t.heard()).toEqual([]);
  });

  it("should play nothing as the menu gives way to OPTIONS and back: the slot stays filled (S5)", () => {
    const t = town();
    t.bridge.reportUi({ menuOpen: true });

    t.bridge.act(() => t.bridge.reportUi({ menuOpen: true }));

    expect(t.heard()).toEqual([]);
  });

  it("should read the menu's slot from the UI's own state, not the world's windows (FS-TQZ5J R10, R16, R22)", () => {
    const t = town();

    t.bridge.act(() => t.bridge.reportUi({ menuOpen: true }));
    expect(t.heard()).toEqual(["settings_open"]);
    t.bridge.act(() => t.bridge.reportUi({ menuOpen: false }));
    expect(t.heard()).toEqual(["settings_close"]);
  });

  it("should hand back what the world's action returns", () => {
    const t = town();

    expect(t.bridge.act(() => 7)).toBe(7);
  });

  it("should play the minimap's mode step the world tells it of (S7)", () => {
    const t = town();

    t.bridge.play("map_mode_switch");

    expect(t.heard()).toEqual(["map_mode_switch"]);
  });

  it("should read every window shut while no world is reported", () => {
    const t = town();
    t.windows.inventory = true;
    t.bridge.left("hub");

    t.bridge.act(() => void (t.windows.inventory = false));

    expect(t.heard()).toEqual([]);
  });
});

describe("the UI bridge before the UI scene has lent it its sounds", () => {
  it("should run a world's action as it is and play nothing, its step included", () => {
    const bridge = new GameUiBridge();
    const ran: string[] = [];

    const out = bridge.act(() => (ran.push("toggled"), "done"));
    bridge.play("map_mode_switch");

    expect(ran).toEqual(["toggled"]);
    expect(out).toBe("done");
  });
});
