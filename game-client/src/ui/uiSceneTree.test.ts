import { describe, expect, it } from "vitest";
import type { CharacterSource } from "./characterSheet";
import { GameUiBridge, NO_FACTS, type UiRequest, type World, type WorldBlockers, type WorldFacts, type WorldReport } from "./uiBridge";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";
import { UiTreeSlot, type TreePiece, type TreeWiring } from "./uiSceneTree";
import type { TreeSource } from "./passiveTreeModel";
import type { PassiveTreeCommands } from "./passiveTreeCommands";

// FS-8RZ51 §G R32, R33, R36, R41 (I-8RZ51-7): the passive tree on the UI scene, built for each world
// reported, fed the own-player state the world hands the gear, toggled by P and the corner icon, refused
// under the gear's refusals, its open state a part of the UI's.

function aWorld(world: World, start: Partial<WorldBlockers> = {}) {
  const blockers: { -readonly [K in keyof WorldBlockers]: WorldBlockers[K] } = { dialogue: false, ...start };
  const facts: { -readonly [K in keyof WorldFacts]: WorldFacts[K] } = { ...NO_FACTS };
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ letter: false }),
    blockers: () => ({ ...blockers }),
    facts: () => ({ ...facts }),
    answer: (request) => void asked.push(request),
  };
  return { report, blockers, facts, asked };
}

interface BuiltTree extends TreePiece {
  world: World;
  wiring: TreeWiring;
  open_: boolean;
  shown: (TreeSource | undefined)[];
  log: string[];
  refusals: string[];
  destroyed: boolean;
}

const me = (points: number): CharacterSource =>
  ({ username: "Ash", class: "warrior", level: 6, passive_ranks: { "warrior.r1": 1 }, passive_points: points }) as CharacterSource;

function onSlot() {
  const gear = { open: false, closes: 0 };
  const tree = { open: () => built.at(-1)?.open_ ?? false };
  const { bridge, heard } = heardInterfaceSounds(new GameUiBridge(), {
    inventory: () => gear.open,
    tree: tree.open,
  });
  const built: BuiltTree[] = [];
  const marks: boolean[] = [];
  const ground = {};
  // the tree's own commands, as a fake: what it sent, and the refusal listener it claimed
  const spends: [string, number][] = [];
  const claimed: ((reason: string) => void)[] = [];
  const commands: PassiveTreeCommands = {
    spend: (nodeId, rank) => (spends.push([nodeId, rank]), true),
    onRefused: (heard) => void claimed.push(heard),
  };
  const slot = new UiTreeSlot(
    bridge,
    (world, wiring) => {
      const piece: BuiltTree = {
        world,
        wiring,
        open_: false,
        shown: [],
        log: [],
        refusals: [],
        destroyed: false,
        isOpen: () => piece.open_,
        open: () => void (piece.open_ = true),
        close: () => void (piece.open_ = false),
        show: (source) => void piece.shown.push(source),
        pointerMove: (x, y) => void piece.log.push(`move ${x},${y}`),
        pointerDown: (x, y) => (piece.log.push(`down ${x},${y}`), piece.open_),
        relayout: () => void piece.log.push("relayout"),
        owns: (object) => object === ground,
        refused: (reason) => void piece.refusals.push(reason),
        destroy: () => void (piece.destroyed = true),
      };
      built.push(piece);
      return piece;
    },
    {
      gear: {
        close: () => {
          gear.closes++;
          const was = gear.open;
          gear.open = false;
          return was;
        },
      },
      marker: (on) => void marks.push(on),
      commands,
    },
  );
  return { bridge, heard, slot, built, gear, marks, ground, spends, claimed };
}

describe("the tree slot's toggle (FS-8RZ51 R32, R36)", () => {
  it("should open on P's toggle, report it in the UI's state, and close on a second", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);

    t.slot.key();
    expect(t.slot.isOpen()).toBe(true);
    expect(t.bridge.ui.tree).toBe(true);
    t.slot.key();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.tree).toBe(false);
  });

  it("should be refused while the menu slot is filled", () => {
    const t = onSlot();
    t.bridge.report(aWorld("field").report);
    t.slot.show(t.bridge.world);
    t.bridge.reportUi({ menuOpen: true });

    t.slot.key();
    t.slot.toggle();
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should be refused while the world turns the gear away", () => {
    const t = onSlot();
    const town = aWorld("hub", { gear: true });
    t.bridge.report(town.report);
    t.slot.show(t.bridge.world);

    t.slot.toggle();
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should take no P after the run's end", () => {
    const t = onSlot();
    const run = aWorld("run");
    t.bridge.report(run.report);
    t.slot.show(t.bridge.world);
    run.facts.ended = true;

    t.slot.key();
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should close the gear overlay and ask the world to close its letter panel as it opens", () => {
    const t = onSlot();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.slot.show(t.bridge.world);
    t.gear.open = true;

    t.slot.key();
    expect(t.gear.open).toBe(false);
    expect(town.asked).toEqual([{ kind: "close", window: "letter" }]);
  });

  it("should play the character panel's open for P over the open inventory, and its close as it shuts (R36, v1)", () => {
    const t = onSlot();
    t.bridge.report(aWorld("field").report);
    t.slot.show(t.bridge.world);
    t.gear.open = true;

    t.slot.key();
    expect(t.heard()).toEqual(["character_open"]);
    t.slot.key();
    expect(t.heard()).toEqual(["character_close"]);
  });

  it("should close and report it, and whether it was open", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.toggle();

    expect(t.slot.close()).toBe(true);
    expect(t.bridge.ui.tree).toBe(false);
    expect(t.slot.close()).toBe(false);
  });
});

describe("the tree slot's worlds and state (FS-8RZ51 R33, R36, R41)", () => {
  it("should build the tree for each world reported, told its world, and let it go as the world leaves", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.toggle();
    t.bridge.left("hub");
    t.slot.show(null);
    expect(t.built[0].destroyed).toBe(true);
    expect(t.bridge.ui.tree).toBe(false);

    t.bridge.report(aWorld("run").report);
    t.slot.show(t.bridge.world);
    t.slot.show(t.bridge.world);
    expect(t.built.map((b) => b.world)).toEqual(["hub", "run"]);
  });

  it("should hand the tree the character the world hands the gear, and draw the last one as it opens", () => {
    const t = onSlot();
    t.bridge.report(aWorld("field").report);
    t.slot.show(t.bridge.world);

    t.slot.hear({ kind: "seen", character: me(2) });
    t.slot.hear({ kind: "level", level: 6 });
    t.slot.toggle();
    expect(t.built[0].shown.at(-1)?.passive_points).toBe(2);
    t.slot.hear({ kind: "seen", character: me(1) });
    expect(t.built[0].shown.at(-1)?.passive_points).toBe(1);
  });

  it("should hand the tree the character's specialization, for the header's role name (FS-E1ZDG §Change: The specialization name replaces the class name, N3)", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.toggle();

    t.slot.hear({ kind: "seen", character: me(0) });
    expect(t.built[0].shown.at(-1)?.specialization).toBeUndefined();
    t.slot.hear({ kind: "seen", character: { ...me(0), specialization: "berserker" } });
    expect(t.built[0].shown.at(-1)?.specialization).toBe("berserker");
  });

  it("should keep the last character for the next world's tree", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.hear({ kind: "seen", character: me(3) });
    t.bridge.left("hub");
    t.slot.show(null);
    t.bridge.report(aWorld("run").report);
    t.slot.show(t.bridge.world);

    t.slot.toggle();
    expect(t.built[1].shown.at(-1)?.passive_points).toBe(3);
  });

  it("should set the corner marker while points are unspent, and clear it at none (R33)", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);

    t.slot.hear({ kind: "seen", character: me(2) });
    t.slot.hear({ kind: "seen", character: me(0) });
    t.slot.hear({ kind: "seen" });
    expect(t.marks).toEqual([true, false]);
  });

  it("should close at the run's end silently (R36)", () => {
    const t = onSlot();
    t.bridge.report(aWorld("run").report);
    t.slot.show(t.bridge.world);
    t.slot.toggle();
    t.heard();

    t.slot.endPopped();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.tree).toBe(false);
    expect(t.heard()).toEqual([]);
  });

  it("should close through the UI scene's act on its own ×, the character panel's close playing", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.key();
    t.heard();

    t.built[0].wiring.dismiss();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.tree).toBe(false);
    expect(t.heard()).toEqual(["character_close"]);
  });

  it("should hand the open tree moves and presses, and none while it is shut", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);

    t.slot.pointerMove(5, 6, []);
    expect(t.slot.pointerDown(5, 6, [])).toBe(false);
    t.slot.toggle();
    t.slot.pointerMove(7, 8, [t.ground]);
    expect(t.slot.pointerDown(7, 8, [t.ground])).toBe(true);
    expect(t.built[0].log).toEqual(["move 7,8", "down 7,8"]);
  });

  it("should hand the tree no hover and no press where a piece drawn over it is the top object (the party panel)", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.slot.toggle();

    t.slot.pointerMove(7, 8, [{}, t.ground]);
    expect(t.slot.pointerDown(7, 8, [{}, t.ground])).toBe(false);
    expect(t.built[0].log).toEqual(["move -1,-1"]);
  });
});

describe("the tree slot's spends (FS-8RZ51 R38)", () => {
  it("should claim the spend's refusals as it mounts, before any world and with the tree shut", () => {
    const t = onSlot();
    expect(t.claimed).toHaveLength(1);
    // heard with no tree standing: dropped, never thrown
    expect(() => t.claimed[0]("Unknown node.")).not.toThrow();
  });

  it("should hand a refusal to the tree standing, open or not", () => {
    const t = onSlot();
    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    t.claimed[0]("Leave the queue to spend points.");
    expect(t.built[0].refusals).toEqual(["Leave the queue to spend points."]);
  });

  it("should give each world's tree the commands' spend, never a bridge request", () => {
    const t = onSlot();
    const town = aWorld("hub");
    t.bridge.report(town.report);
    t.slot.show(t.bridge.world);
    expect(t.built[0].wiring.spend("warrior.t2a", 2)).toBe(true);
    expect(t.spends).toEqual([["warrior.t2a", 2]]);
    expect(town.asked).toEqual([]);
  });
});
