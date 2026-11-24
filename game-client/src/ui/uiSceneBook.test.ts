import { describe, expect, it } from "vitest";
import type { CharacterSource } from "./characterSheet";
import type { BookSource, PageView } from "./classBookModel";
import { GameUiBridge, NO_FACTS, gearOpened, type UiRequest, type World, type WorldBlockers, type WorldFacts, type WorldReport } from "./uiBridge";
import { heardInterfaceSounds } from "./uiSceneSounds.standin";
import { UiBookSlot, type BookOthers, type BookPiece, type BookWiring } from "./uiSceneBook";

// FS-X2CMM §G R36–R39 (I-X2CMM-10): the class book on the UI scene, opened and closed by K and the corner
// icon in a run only, fed the own player's state the world hands the gear, a window that steps aside for
// any other opening, closed by Esc, by the run's end and by the player's death or escape.

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

interface BuiltBook extends BookPiece {
  world: World;
  wiring: BookWiring;
  open_: boolean;
  shown: { source: BookSource | undefined; heardAt: number }[];
  frames: number[];
  log: string[];
  destroyed: boolean;
}

const mage = (level = 10): CharacterSource =>
  ({
    username: "Ash",
    class: "mage",
    level,
    resource: { kind: "mana", current: 80, max: 100, ability_cost: 10 },
    book: { pages: [{ id: "witchlight", unlock_level: 2, cost: 20, cooldown: { remaining: 0, total: 0 }, spent: false, cooldown_length: 45 }] },
  }) as CharacterSource;

function onSlot() {
  const gear = { open: false };
  const tree = { open: false };
  const others: { -readonly [K in keyof BookOthers]: boolean } = { menu: false, party: false, controls: false };
  let clock = 1000;
  const { bridge, heard } = heardInterfaceSounds(new GameUiBridge(), {
    inventory: () => gear.open,
    tree: () => tree.open,
    book: () => built.at(-1)?.open_ ?? false,
  });
  const built: BuiltBook[] = [];
  const ground = {};
  const slot = new UiBookSlot(
    bridge,
    (world, wiring) => {
      const piece: BuiltBook = {
        world,
        wiring,
        open_: false,
        shown: [],
        frames: [],
        log: [],
        destroyed: false,
        isOpen: () => piece.open_,
        open: () => void (piece.open_ = true),
        close: () => void (piece.open_ = false),
        show: (source, heardAt) => void piece.shown.push({ source, heardAt }),
        frame: (now) => void piece.frames.push(now),
        pointerMove: (x, y) => void piece.log.push(`move ${x},${y}`),
        pointerDown: (x, y) => (piece.log.push(`down ${x},${y}`), piece.open_),
        owns: (object) => object === ground,
        relayout: () => void piece.log.push("relayout"),
        destroy: () => void (piece.destroyed = true),
      };
      built.push(piece);
      return piece;
    },
    {
      gear: { close: () => ((gear.open = false), true) },
      tree: { close: () => ((tree.open = false), true) },
      others: () => ({ ...others }),
      now: () => clock,
    },
  );
  const tick = (ms: number) => void (clock += ms);
  const inRun = () => {
    const run = aWorld("run");
    bridge.report(run.report);
    slot.show(bridge.world);
    return run;
  };
  return { bridge, heard, slot, built, gear, tree, others, ground, tick, inRun };
}

describe("the book slot's K and its worlds (FS-X2CMM R36)", () => {
  it("should open on K in a run, report it in the UI's state, and close on a second K", () => {
    const t = onSlot();
    t.inRun();

    t.slot.key();
    expect(t.slot.isOpen()).toBe(true);
    expect(t.bridge.ui.book).toBe(true);
    t.slot.key();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.book).toBe(false);
  });

  it("should do nothing on K in the hub or a field, where no book stands", () => {
    for (const world of ["hub", "field"] as const) {
      const t = onSlot();
      t.bridge.report(aWorld(world).report);
      t.slot.show(t.bridge.world);

      t.slot.key();
      t.slot.toggle();
      expect(t.slot.isOpen()).toBe(false);
      expect(t.slot.available()).toBe(false);
      expect(t.built).toEqual([]);
    }
  });

  it("should be refused while the menu slot is filled, after the run's end, and once the player is out of the delve", () => {
    const t = onSlot();
    const run = t.inRun();
    t.bridge.reportUi({ menuOpen: true });
    t.slot.key();
    expect(t.slot.isOpen()).toBe(false);
    t.bridge.reportUi({ menuOpen: false });

    run.facts.resolved = true;
    t.slot.toggle();
    expect(t.slot.isOpen()).toBe(false);
    run.facts.resolved = false;
    run.facts.ended = true;
    t.slot.key();
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should take the book down as the run leaves, and build none for the town after it", () => {
    const t = onSlot();
    t.inRun();
    t.slot.toggle();
    t.bridge.left("run");
    t.slot.show(null);
    expect(t.built[0].destroyed).toBe(true);
    expect(t.bridge.ui.book).toBe(false);

    t.bridge.report(aWorld("hub").report);
    t.slot.show(t.bridge.world);
    expect(t.built).toHaveLength(1);
  });

  it("should play the character panel's open and close for the book, as the tree does (v1)", () => {
    const t = onSlot();
    t.inRun();
    t.slot.key();
    expect(t.heard()).toEqual(["character_open"]);
    t.slot.key();
    expect(t.heard()).toEqual(["character_close"]);
  });

  it("should end a world's aim as it opens, as a gear panel's opening does", () => {
    expect(gearOpened({ menuOpen: false, book: true }, { menuOpen: false })).toBe(true);
    expect(gearOpened({ menuOpen: false, book: true }, { menuOpen: false, book: true })).toBe(false);
  });
});

describe("the book slot's windows (FS-X2CMM R36)", () => {
  it("should close the gear overlay and the passive tree as it opens", () => {
    const t = onSlot();
    t.inRun();
    t.gear.open = true;
    t.tree.open = true;

    t.slot.toggle();
    expect(t.gear.open).toBe(false);
    expect(t.tree.open).toBe(false);
  });

  it("should step aside, silently, when another window opens after it, and not for one open as it opened", () => {
    const t = onSlot();
    t.inRun();
    t.others.party = true;
    t.slot.toggle();
    t.heard();
    t.slot.sync();
    expect(t.slot.isOpen()).toBe(true);

    t.others.controls = true;
    t.slot.sync();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.book).toBe(false);
    expect(t.heard()).toEqual([]);
  });

  it("should close as the player dies or escapes, silently", () => {
    const t = onSlot();
    const run = t.inRun();
    t.slot.toggle();
    t.heard();

    run.facts.resolved = true;
    t.slot.sync();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.heard()).toEqual([]);
  });

  it("should close at the run's end silently", () => {
    const t = onSlot();
    t.inRun();
    t.slot.toggle();
    t.heard();

    t.slot.endPopped();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.bridge.ui.book).toBe(false);
    expect(t.heard()).toEqual([]);
  });

  it("should close, and say whether it was open: Esc's step", () => {
    const t = onSlot();
    t.inRun();
    t.slot.toggle();
    expect(t.slot.close()).toBe(true);
    expect(t.slot.close()).toBe(false);
  });

  it("should close through the UI scene's act on its own ×", () => {
    const t = onSlot();
    t.inRun();
    t.slot.key();
    t.heard();

    t.built[0].wiring.dismiss();
    expect(t.slot.isOpen()).toBe(false);
    expect(t.heard()).toEqual(["character_close"]);
  });
});

describe("the book slot's state (FS-X2CMM R37, R38)", () => {
  it("should hand the book the own player's state the world hands the gear, with when it was heard", () => {
    const t = onSlot();
    t.inRun();
    t.slot.hear({ kind: "seen", character: mage(10) });
    t.slot.hear({ kind: "level", level: 6 });
    t.slot.toggle();
    const shown = t.built[0].shown.at(-1)!;
    expect(shown.source?.class).toBe("mage");
    expect(shown.source?.level).toBe(10);
    expect(shown.source?.book?.pages[0].id).toBe("witchlight");
    expect(shown.heardAt).toBe(1000);

    t.tick(250);
    t.slot.hear({ kind: "seen", character: mage(11) });
    expect(t.built[0].shown.at(-1)).toMatchObject({ heardAt: 1250, source: { level: 11 } });
  });

  it("should keep the state heard before the run, and draw it as the run's book opens", () => {
    const t = onSlot();
    t.bridge.report(aWorld("field").report);
    t.slot.show(t.bridge.world);
    t.slot.hear({ kind: "seen", character: mage(7) });
    t.inRun();
    t.slot.toggle();
    expect(t.built[0].shown.at(-1)?.source?.level).toBe(7);
  });

  it("should run the open book's frame on its clock, and not a shut one's", () => {
    const t = onSlot();
    t.inRun();
    t.slot.frame();
    t.slot.toggle();
    t.tick(16);
    t.slot.frame();
    expect(t.built[0].frames).toEqual([1016]);
  });
});

describe("the book slot's pointer (FS-X2CMM R39)", () => {
  it("should hand the open book its moves and presses, and none while another piece is on top", () => {
    const t = onSlot();
    t.inRun();
    expect(t.slot.pointerDown(5, 5, [])).toBe(false);
    t.slot.toggle();

    t.slot.pointerMove(10, 20, [t.ground]);
    expect(t.slot.pointerDown(10, 20, [t.ground])).toBe(true);
    t.slot.pointerMove(10, 20, [{}]);
    expect(t.slot.pointerDown(10, 20, [{}])).toBe(false);
    expect(t.built[0].log).toEqual(["move 10,20", "down 10,20", "move -1,-1"]);
  });

  // FS-X2CMM §H R40, R44a (I-X2CMM-11): the book asks, the world arms or casts
  it("should ask the run for a ready page pressed, the book kept open", () => {
    const t = onSlot();
    const run = t.inRun();
    t.slot.toggle();
    t.built[0].wiring.pick({ id: "witchlight", state: "ready" } as PageView);
    t.built[0].wiring.pick({ id: "hardened", state: "ready" } as PageView);
    expect(run.asked).toEqual([
      { kind: "page", page: "witchlight" },
      { kind: "page", page: "hardened" },
    ]);
    expect(t.slot.isOpen()).toBe(true);
  });

  it("should ask nothing for a locked, recovering, spent or dim page (R40)", () => {
    const t = onSlot();
    const run = t.inRun();
    t.slot.toggle();
    for (const state of ["locked", "recovering", "dim"] as const) t.built[0].wiring.pick({ id: "witchlight", state } as PageView);
    t.built[0].wiring.pick({ id: "recall", state: "dim", spent: true } as PageView);
    expect(run.asked).toEqual([]);
  });
});
