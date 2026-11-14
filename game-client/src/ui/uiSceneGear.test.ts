import { describe, expect, it } from "vitest";
import type { ContainerKind, ItemState } from "@/types/gameState";
import {
  GameUiBridge,
  NO_FACTS,
  type UiRequest,
  type UiState,
  type World,
  type WorldBlockers,
  type WorldFacts,
  type WorldReport,
} from "./uiBridge";
import { UiGearSlot, type ContainerPiece, type GearPiece, type GearWiring } from "./uiSceneGear";

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-14): the gear overlay and the container view are the UI scene's,
// built for each world reported and taken down as it leaves (R50); fed the world's data (R52); their open
// state the UI's (R53, R55); their sends and a take requests (R54); their keys moved with them (R56); and
// the run's end clears them (R58).

/** A world as it reports itself: its blockers and facts as they are now, and what it was asked and heard. */
function aWorld(world: World, start: Partial<WorldBlockers> = {}) {
  const blockers: { -readonly [K in keyof WorldBlockers]: WorldBlockers[K] } = { dialogue: false, ...start };
  const facts: { -readonly [K in keyof WorldFacts]: WorldFacts[K] } = { ...NO_FACTS };
  const asked: UiRequest[] = [];
  const heard: UiState[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ letter: false }),
    blockers: () => ({ ...blockers }),
    facts: () => ({ ...facts }),
    heardUi: (ui) => void heard.push(ui),
    answer: (request) => void asked.push(request),
  };
  return { report, blockers, facts, asked, heard };
}

const sword = { entity_id: "sword-1", name: "Sword" } as ItemState;

/** A gear piece as the slot keeps it, recording what it was handed. */
interface BuiltGear extends GearPiece {
  world: World;
  inventory: boolean;
  character: boolean;
  stash: boolean;
  room: boolean;
  log: string[];
  released: boolean;
}

/** A container view as the slot keeps it. */
interface BuiltContainer extends ContainerPiece {
  open_: string | undefined;
  log: string[];
  destroyed: boolean;
  ground: object;
}

function onSlot() {
  const bridge = new GameUiBridge();
  const gears: BuiltGear[] = [];
  const containers: BuiltContainer[] = [];
  const wirings: GearWiring[] = [];
  const slot = new UiGearSlot(bridge, (world, wiring) => {
    wirings.push(wiring);
    const gear: BuiltGear = {
      world,
      inventory: false,
      character: false,
      stash: false,
      room: true,
      log: [],
      released: false,
      isInventoryOpen: () => gear.inventory,
      isCharacterOpen: () => gear.character,
      stashOpen: () => gear.stash,
      toggle: () => {
        gear.inventory = !gear.inventory;
        if (!gear.inventory) gear.stash = false;
        return gear.inventory;
      },
      toggleCharacter: () => {
        if (gear.stash) return false;
        gear.character = !gear.character;
        return gear.character;
      },
      hide: () => {
        const was = gear.inventory || gear.character;
        gear.inventory = gear.character = gear.stash = false;
        return was;
      },
      equipKey: () => {
        if (!gear.inventory) return false;
        gear.log.push("E");
        return true;
      },
      openStash: () => {
        if (gear.inventory) return false;
        gear.inventory = gear.stash = true;
        gear.character = false;
        return true;
      },
      seen: (carried, character) => void gear.log.push(`seen ${JSON.stringify([carried, character])}`),
      setCharacterLevel: (level) => void gear.log.push(`level ${level}`),
      taken: (item) => void gear.log.push(`taken ${item.entity_id}`),
      roomForOne: () => gear.room,
      release: () => void (gear.released = true),
    };
    gears.push(gear);
    if (world === "hub") return { gear };
    const container: BuiltContainer = {
      open_: undefined,
      log: [],
      destroyed: false,
      ground: {},
      get isOpen() {
        return container.open_ !== undefined;
      },
      get entityId() {
        return container.open_;
      },
      open: (id: string, kind: ContainerKind) => {
        container.open_ = id;
        container.log.push(`open ${id} ${kind}`);
      },
      close: () => {
        container.open_ = undefined;
        container.log.push("close");
      },
      closeNow: () => {
        container.open_ = undefined;
        container.log.push("closeNow");
      },
      setItems: (items) => void container.log.push(`items ${items.length}`),
      lootFirst: () => void container.log.push("F"),
      pointerMove: (x, y) => void container.log.push(`move ${x},${y}`),
      pointerDown: (x, y, primary) => (container.log.push(`down ${x},${y} ${primary}`), true),
      owns: (obj) => obj === container.ground,
      relayout: () => void container.log.push("relayout"),
      destroy: () => void (container.destroyed = true),
    };
    containers.push(container);
    return { gear, container };
  });
  const enter = (world: World, blockers: Partial<WorldBlockers> = {}) => {
    const w = aWorld(world, blockers);
    bridge.report(w.report);
    slot.show(w.report);
    return w;
  };
  return { bridge, slot, gears, containers, wirings, enter };
}

describe("the UI scene's gear slot, built for each world reported (FS-TQZ5J § Change: Phase 3, R50)", () => {
  it("should build the gear in every world and a container view in a field and the run, and take them down as the world leaves", () => {
    const { bridge, slot, gears, containers, enter } = onSlot();
    enter("hub");
    expect(gears.map((g) => g.world)).toEqual(["hub"]);
    expect(containers).toEqual([]);

    bridge.left("hub");
    slot.show(null);
    enter("run");

    expect(gears[0].released).toBe(true);
    expect(gears.map((g) => g.world)).toEqual(["hub", "run"]);
    expect(containers.map((c) => c.destroyed)).toEqual([false]);
  });

  it("should keep the pieces for a report of the world they stand for, and build anew for another", () => {
    const { slot, gears, enter } = onSlot();
    const w = enter("field");
    slot.show(w.report);
    expect(gears).toHaveLength(1);
    enter("run");
    expect(gears).toHaveLength(2);
    expect(gears[0].released).toBe(true);
  });

  it("should take an open gear down silently with its world, reporting it shut", () => {
    const { bridge, slot, gears, enter } = onSlot();
    enter("hub");
    slot.toggle("inventory");
    expect(bridge.ui.inventory).toBe(true);

    slot.show(null);

    expect(gears[0].inventory).toBe(false);
    expect(bridge.ui.inventory).toBe(false);
  });

  it("should say a gear notice of a world gone nothing", () => {
    const { bridge, slot, wirings, enter } = onSlot();
    const said: string[] = [];
    bridge.onScreen({ notice: (n) => void said.push(n.text) });
    enter("hub");
    wirings[0].notice("Your bag is full.");
    slot.show(null);
    wirings[0].notice("Could not change your gear.");
    expect(said).toEqual(["Your bag is full."]);
  });

  it("should say each world's gear notice in that world's look: the town's line, the field's, the run's refused tone", () => {
    const { bridge, wirings, enter } = onSlot();
    const looks: unknown[] = [];
    bridge.onScreen({ notice: (n) => void looks.push(n.look) });
    enter("hub");
    wirings[0].notice("a");
    enter("field");
    wirings[1].notice("b");
    enter("run");
    wirings[2].notice("c");
    expect(looks.map((l) => (l as { world: string }).world)).toEqual(["hub", "field", "run"]);
    expect((looks[2] as { backing?: number }).backing).toBeTypeOf("number");
  });
});

describe("the gear's open state is the UI scene's (FS-TQZ5J § Change: Phase 3, R53, R55)", () => {
  it("should toggle the inventory and the character panel, reporting the UI's state to the world each time", () => {
    const { bridge, slot, enter } = onSlot();
    const w = enter("field");

    slot.toggle("inventory");
    slot.toggle("character");

    expect(bridge.ui).toMatchObject({ inventory: true, character: true, stash: false });
    expect(w.heard.at(-1)).toMatchObject({ inventory: true, character: true });
    expect(slot.isOpen()).toBe(true);
    slot.close();
    expect(bridge.ui).toMatchObject({ inventory: false, character: false });
    expect(slot.isOpen()).toBe(false);
  });

  it("should refuse a toggle while the menu slot is filled or the world turns the gear away, the press changing nothing", () => {
    const { bridge, slot, gears, enter } = onSlot();
    const w = enter("hub", { gear: true });
    slot.toggle("inventory");
    expect(gears[0].inventory).toBe(false);

    w.blockers.gear = false;
    bridge.reportUi({ menuOpen: true });
    slot.toggle("character");
    expect(gears[0].character).toBe(false);

    bridge.reportUi({ menuOpen: false });
    slot.toggle("inventory");
    expect(gears[0].inventory).toBe(true);
  });

  it("should ask the world to close its letter panel as a panel opens, and not as one closes (FS-3EBCA R16)", () => {
    const { slot, enter } = onSlot();
    const w = enter("hub");
    slot.toggle("inventory");
    slot.toggle("inventory");
    slot.toggle("character");
    expect(w.asked).toEqual([
      { kind: "close", window: "letter" },
      { kind: "close", window: "letter" },
    ]);
  });

  it("should open the stash on the town's word, reporting it, and close the gear on the world's word", () => {
    const { bridge, slot, enter } = onSlot();
    enter("hub");
    slot.hear({ kind: "openStash" });
    expect(bridge.ui).toMatchObject({ inventory: true, stash: true });
    slot.hear({ kind: "close" });
    expect(bridge.ui).toMatchObject({ inventory: false, stash: false });
  });

  it("should report a close the overlay made on its own (its ×), through the wrapper it was handed", () => {
    const { bridge, gears, wirings, enter } = onSlot();
    enter("run");
    wirings[0].wrapper.act(() => void (gears[0].inventory = true));
    expect(bridge.ui.inventory).toBe(true);
    wirings[0].wrapper.act(() => void (gears[0].inventory = false));
    expect(bridge.ui.inventory).toBe(false);
  });
});

describe("the gear's data from the world (FS-TQZ5J § Change: Phase 3, R52)", () => {
  it("should hand the gear each state tick, the level and an item taken", () => {
    const { slot, gears, enter } = onSlot();
    enter("run");
    const me = { level: 4, inventory: [sword] } as never;
    slot.hear({ kind: "seen", carried: me, character: me });
    slot.hear({ kind: "level", level: 4 });
    slot.hear({ kind: "taken", item: sword });
    expect(gears[0].log).toEqual([`seen ${JSON.stringify([me, me])}`, "level 4", "taken sword-1"]);
    expect(slot.level()).toBe(4);
  });

  it("should hand nothing to a gear with no world reported", () => {
    const { slot } = onSlot();
    expect(() => slot.hear({ kind: "close" })).not.toThrow();
    expect(() => slot.hearContainer({ kind: "close" })).not.toThrow();
  });
});

describe("the gear's sends and a take are requests (FS-TQZ5J § Change: Phase 3, R54)", () => {
  it("should ask the world to equip and unequip by the item's entity id", () => {
    const { wirings, enter } = onSlot();
    const w = enter("field");
    wirings[0].send("equip", "sword-1");
    wirings[0].send("unequip", "helm-1");
    expect(w.asked).toEqual([
      { kind: "equip", item: "sword-1" },
      { kind: "unequip", item: "helm-1" },
    ]);
  });

  it("should ask the world to take an item from the container", () => {
    const { wirings, enter } = onSlot();
    const w = enter("run");
    wirings[0].take(sword);
    expect(w.asked).toEqual([{ kind: "take", item: sword }]);
  });
});

describe("the container view's state and data (FS-TQZ5J § Change: Phase 3, R52, R53)", () => {
  it("should open, fill and close it on the world's word, reporting the container it is open for", () => {
    const { bridge, slot, containers, enter } = onSlot();
    const w = enter("run");
    slot.hearContainer({ kind: "open", entityId: "chest-1", container: "chest" });
    expect(bridge.ui.container).toBe("chest-1");
    slot.hearContainer({ kind: "items", items: [sword] });
    slot.hearContainer({ kind: "close" });
    expect(bridge.ui.container).toBeUndefined();
    slot.hearContainer({ kind: "open", entityId: "pile-2", container: "drop_pile" });
    slot.hearContainer({ kind: "close", now: true });
    expect(containers[0].log).toEqual(["open chest-1 chest", "items 1", "close", "open pile-2 drop_pile", "closeNow"]);
    expect(w.heard.map((u) => u.container)).toEqual(["chest-1", undefined, "pile-2", undefined]);
  });

  it("should hand the container view the pointer unless another UI piece is over it, and a press only on its own ground", () => {
    const { slot, containers, enter } = onSlot();
    enter("field");
    const c = containers[0];
    const other = {};
    slot.pointerMove(10, 20, []);
    slot.pointerMove(11, 21, [c.ground]);
    slot.pointerMove(12, 22, [other]);
    expect(slot.pointerDown(13, 23, true, [c.ground])).toBe(true);
    expect(slot.pointerDown(14, 24, true, [other])).toBe(false);
    expect(slot.pointerDown(15, 25, true, [])).toBe(false);
    expect(c.log).toEqual(["move 10,20", "move 11,21", "move -1,-1", "down 13,23 true"]);
  });
});

describe("the gear's and the container's keys (FS-TQZ5J § Change: Phase 3, R56)", () => {
  it("should toggle on I and C, refused under the menu and after the run's end", () => {
    const { bridge, slot, gears, enter } = onSlot();
    const w = enter("run");
    slot.key("inventory");
    slot.key("character");
    expect([gears[0].inventory, gears[0].character]).toEqual([true, true]);
    slot.key("inventory");
    bridge.reportUi({ menuOpen: true });
    slot.key("inventory");
    expect(gears[0].inventory).toBe(false);
    bridge.reportUi({ menuOpen: false });
    w.facts.ended = true;
    slot.key("inventory");
    expect(gears[0].inventory).toBe(false);
    // the corner icons still work after the end (FS-WDM0X: the run's icons)
    slot.toggle("inventory");
    expect(gears[0].inventory).toBe(true);
  });

  it("should close the gear on Q, and in the run the container view after it, one step a press; in a field the gear only", () => {
    const { slot, gears, containers, enter } = onSlot();
    enter("run");
    slot.toggle("inventory");
    slot.hearContainer({ kind: "open", entityId: "chest-1", container: "chest" });
    slot.key("close");
    expect(gears[0].inventory).toBe(false);
    expect(containers[0].isOpen).toBe(true);
    slot.key("close");
    expect(containers[0].isOpen).toBe(false);

    enter("field");
    slot.hearContainer({ kind: "open", entityId: "pile-1", container: "drop_pile" });
    slot.key("close");
    expect(containers[1].isOpen).toBe(true);
  });

  it("should give E to the open inventory alone, and F to the container view, not under the menu", () => {
    const { bridge, slot, gears, containers, enter } = onSlot();
    enter("field");
    slot.key("equip");
    expect(gears[0].log).toEqual([]);
    slot.toggle("inventory");
    slot.key("equip");
    slot.key("take");
    bridge.reportUi({ menuOpen: true });
    slot.key("equip");
    slot.key("take");
    expect(gears[0].log).toEqual(["E"]);
    expect(containers[0].log).toEqual(["F"]);
  });
});

describe("the run's end clears the moved windows (FS-TQZ5J § Change: Phase 3, R58)", () => {
  it("should close the gear and the container view, reporting them shut", () => {
    const { bridge, slot, gears, containers, enter } = onSlot();
    enter("run");
    slot.toggle("character");
    slot.hearContainer({ kind: "open", entityId: "chest-1", container: "chest" });

    slot.endPopped();

    expect(gears[0].character).toBe(false);
    expect(containers[0].isOpen).toBe(false);
    expect(bridge.ui).toMatchObject({ character: false, container: undefined });
  });
});
