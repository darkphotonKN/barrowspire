import { describe, expect, it, vi } from "vitest";

// FS-TQZ5J § Change: Phase 3 (I-TQZ5J-14): what the UI scene builds for each world's gear, its sources'
// own reads going from the pieces (R51; ADR-0082 D3). The pieces themselves are their own tests': here
// recording stand-ins for what is built, with what.
const built = vi.hoisted(() => ({
  hub: [] as { refreshes: number; released: number }[],
  hud: [] as { port: { send(action: string, payload: { item_entity_id: string }): void; notice(t: string): void }; room: boolean }[],
  views: [] as { options: { onLoot(item: unknown): void; mayTake?(): boolean; characterLevel?(): number | undefined } }[],
}));
vi.mock("./GearOverlay", () => ({ GearOverlay: class {} }));
vi.mock("./purse", () => ({ PurseReader: class {} }));
vi.mock("@/utils/api", () => ({ apiClient: {} }));
vi.mock("./HubGear", () => ({
  gearAsCharacter: () => ({}),
  HubGear: class {
    made = { refreshes: 0, released: 0 };
    constructor() {
      built.hub.push(this.made);
    }
    refreshPurse() {
      this.made.refreshes++;
    }
    release() {
      this.made.released++;
    }
  },
}));
vi.mock("./EquipmentHud", () => ({
  EquipmentHud: class {
    made: (typeof built.hud)[number];
    constructor(_panel: unknown, port: (typeof built.hud)[number]["port"]) {
      this.made = { port, room: true };
      built.hud.push(this.made);
    }
    roomForOne() {
      return this.made.room;
    }
    release() {}
  },
}));
vi.mock("./ContainerView", () => ({
  LOOT_PENDING_MS: 1000,
  ContainerContents: class {},
  ContainerView: class {
    constructor(_scene: unknown, _art: unknown, options: (typeof built.views)[number]["options"]) {
      built.views.push({ options });
    }
  },
}));

const { useMailboxStore } = await import("@/stores/mailboxStore");
const { mountGearPieces } = await import("./gearPieces");

const wiring = () => ({
  wrapper: { act: (run: () => void) => run() },
  notice: vi.fn(),
  send: vi.fn(),
  take: vi.fn(),
  level: () => 7,
});
const art = () => ({}) as never;
const goldTake = () => useMailboxStore.setState({ goldTaken: useMailboxStore.getState().goldTaken + 1 });

describe("the town's gear on the UI scene (FS-TQZ5J § Change: Phase 3, R50, R51; FS-7TGZ3 R9)", () => {
  it("should read the purse again once per gold Take, and nothing for a mailbox change that is not one", () => {
    const pieces = mountGearPieces({} as never, art, "hub", wiring());
    const made = built.hub.at(-1)!;

    goldTake();
    useMailboxStore.setState({ ...useMailboxStore.getState() });
    goldTake();

    expect(made.refreshes).toBe(2);
    expect(pieces.container).toBeUndefined();
    pieces.gear.release();
  });

  it("should stop listening as its world leaves, so the next visit hears each Take once", () => {
    const first = mountGearPieces({} as never, art, "hub", wiring());
    const old = built.hub.at(-1)!;
    first.gear.release();
    mountGearPieces({} as never, art, "hub", wiring());
    const now = built.hub.at(-1)!;

    goldTake();

    expect(old.refreshes).toBe(0);
    expect(old.released).toBe(1);
    expect(now.refreshes).toBe(1);
  });
});

describe("a field's and the run's gear and container view on the UI scene (FS-TQZ5J § Change: Phase 3, R50, R54)", () => {
  it.each(["field", "run"] as const)("should ask the %s for its equip and unequip by the item's entity id", (world) => {
    const w = wiring();
    mountGearPieces({} as never, art, world, w);
    const { port } = built.hud.at(-1)!;

    port.send("equip", { item_entity_id: "sword-1" });
    port.send("unequip", { item_entity_id: "helm-1" });
    port.notice("Your bag is full.");

    expect(w.send.mock.calls).toEqual([
      ["equip", "sword-1"],
      ["unequip", "helm-1"],
    ]);
    expect(w.notice).toHaveBeenCalledWith("Your bag is full.");
  });

  it("should pre-check a take against the gear's bag, ask the world for it, and tip by the level handed", () => {
    const w = wiring();
    const pieces = mountGearPieces({} as never, art, "run", w);
    const hud = built.hud.at(-1)!;
    const { options } = built.views.at(-1)!;

    expect(pieces.container).toBeDefined();
    expect(options.mayTake?.()).toBe(true);
    hud.room = false;
    expect(options.mayTake?.()).toBe(false);
    options.onLoot({ entity_id: "ring-1" });
    expect(w.take).toHaveBeenCalledWith({ entity_id: "ring-1" });
    expect(options.characterLevel?.()).toBe(7);
  });
});
