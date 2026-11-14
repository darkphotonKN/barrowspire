import { describe, expect, it } from "vitest";
import { GameUiBridge, NO_FACTS, type UiRequest, type World, type WorldBlockers, type WorldReport } from "./uiBridge";
import { UiPartySlot, partyPanelWiring, type PartyPanelPiece } from "./uiSceneParty";

// FS-TQZ5J § Change: Phase 2: the party (I-TQZ5J-9): the party panel is the UI scene's, built for each
// world reported and taken down as it leaves (R36); refused by the world's part of its rule and the UI
// scene's menu slot (R38); its opening closes the town's letter panel by a request (R39); a press on it
// keeps its invite field (R42).

/** A world as it reports itself: its blockers as they are now, and what it was asked. */
function aWorld(world: World, start: Partial<WorldBlockers> = {}) {
  const blockers: { -readonly [K in keyof WorldBlockers]: WorldBlockers[K] } = { dialogue: false, ...start };
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ letter: false, inventory: false, character: false }),
    blockers: () => ({ ...blockers }),
    facts: () => NO_FACTS,
    answer: (request) => void asked.push(request),
  };
  return { report, blockers, asked };
}

/** A party panel as the slot keeps it, recording what was done to it. */
interface BuiltPanel extends PartyPanelPiece {
  world: World;
  open: boolean;
  relayouts: number;
  destroyed: boolean;
  keeps: boolean;
}

function onSlot() {
  const built: BuiltPanel[] = [];
  const slot = new UiPartySlot((world) => {
    const panel: BuiltPanel = {
      world,
      open: false,
      relayouts: 0,
      destroyed: false,
      keeps: false,
      isOpen: () => panel.open,
      close: () => {
        const was = panel.open;
        panel.open = false;
        return was;
      },
      toggle: () => void (panel.open = !panel.open),
      relayout: () => void panel.relayouts++,
      keepsField: () => panel.keeps,
      destroy: () => void (panel.destroyed = true),
    };
    built.push(panel);
    return { panel };
  });
  const live = () => built.filter((p) => !p.destroyed);
  return { slot, built, live };
}

describe("the UI scene's party slot, built for each world reported (FS-TQZ5J § Change: Phase 2: the party, R36)", () => {
  it("should build a party panel for the world reported, and keep it on a report of the same world", () => {
    const { slot, built } = onSlot();
    const town = aWorld("hub");

    slot.show(town.report);
    slot.show(town.report);

    expect(built.map((p) => p.world)).toEqual(["hub"]);
  });

  it("should build nothing while no world is reported, and answer as with no panel", () => {
    const { slot, built } = onSlot();

    slot.show(null);
    slot.toggle();

    expect(built).toEqual([]);
    expect(slot.isOpen()).toBe(false);
    expect(slot.keepsField(1, 1)).toBe(false);
    expect(() => slot.close()).not.toThrow();
  });

  it("should take the panel down as the world leaves, and build it anew for the next: town, run, the town again", () => {
    const { slot, built, live } = onSlot();
    for (const world of ["hub", "run", "hub"] as const) {
      slot.show(aWorld(world).report);
      slot.show(null);
    }
    expect(built.map((p) => p.world)).toEqual(["hub", "run", "hub"]);
    expect(live()).toEqual([]);
  });

  it("should build anew on a report of another world, taking the old one down", () => {
    const { slot, built, live } = onSlot();
    slot.show(aWorld("field").report);
    slot.show(aWorld("hub").report);

    expect(built[0].destroyed).toBe(true);
    expect(live().map((p) => p.world)).toEqual(["hub"]);
  });

  it("should open, shut and read the standing panel, relay it out, and say whether a press keeps its field", () => {
    const { slot, live } = onSlot();
    slot.show(aWorld("run").report);

    slot.toggle();
    expect(slot.isOpen()).toBe(true);
    slot.close();
    expect(slot.isOpen()).toBe(false);
    slot.relayout();
    expect(live()[0].relayouts).toBe(1);
    live()[0].keeps = true;
    expect(slot.keepsField(1, 1)).toBe(true);

    slot.destroy();
    expect(live()).toEqual([]);
  });
});

describe("the party panel's wiring in each world (FS-TQZ5J § Change: Phase 2: the party, R38, R39)", () => {
  it.each(["hub", "field", "run"] as const)("should refuse it in the %s while the UI's menu slot is filled", (world) => {
    const bridge = new GameUiBridge();
    bridge.report(aWorld(world).report);
    const wiring = partyPanelWiring(bridge, world);

    expect(wiring.blocked()).toBe(false);
    bridge.reportUi({ menuOpen: true });
    expect(wiring.blocked()).toBe(true);
  });

  it("should refuse it while the world turns it away (blockers().party), read as it is now", () => {
    const bridge = new GameUiBridge();
    const run = aWorld("run");
    bridge.report(run.report);
    const wiring = partyPanelWiring(bridge, "run");

    run.blockers.party = true;
    expect(wiring.blocked()).toBe(true);
    run.blockers.party = false;
    expect(wiring.blocked()).toBe(false);
  });

  it("should refuse it with no world reported", () => {
    const bridge = new GameUiBridge();
    expect(partyPanelWiring(bridge, "hub").blocked()).toBe(true);
  });

  it("should ask the town to close its letter panel as it opens, and give no opening elsewhere (FS-R82NV § Change C9)", () => {
    const bridge = new GameUiBridge();
    const town = aWorld("hub");
    bridge.report(town.report);

    partyPanelWiring(bridge, "hub").opening?.();

    expect(town.asked).toEqual([{ kind: "close", window: "letter" }]);
    expect(partyPanelWiring(bridge, "field").opening).toBeUndefined();
    expect(partyPanelWiring(bridge, "run").opening).toBeUndefined();
  });

  it("should run its own inputs through the UI scene's act (FS-WDM0X S9)", () => {
    const acted: string[] = [];
    const bridge = new GameUiBridge();
    bridge.lendSounds({ act: (run) => (acted.push("act"), run()), play: () => {} });

    partyPanelWiring(bridge, "field").wrapper.act(() => void acted.push("ran"));

    expect(acted).toEqual(["act", "ran"]);
  });
});
