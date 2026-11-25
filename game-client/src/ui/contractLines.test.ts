import { describe, expect, it } from "vitest";
import { ContractWatch, contractLine } from "./contractLines";

// FS-4EC7Z §G R34 (I-4EC7Z-6): the contract as its taker sees it, read off current_player.contract
describe("contractLine: the mark's heading under the notices (FS-4EC7Z §G R34)", () => {
  it("should read Mark: last seen to the <heading> while active", () => {
    expect(contractLine({ state: "active", heading: "east" })).toBe("Mark: last seen to the east");
    expect(contractLine({ state: "active", heading: "north-west" })).toBe("Mark: last seen to the north-west");
  });

  it("should read nothing with no contract, once settled or lost, or while no heading is known", () => {
    expect(contractLine(undefined)).toBeNull();
    expect(contractLine({ state: "settled" })).toBeNull();
    expect(contractLine({ state: "lost" })).toBeNull();
    expect(contractLine({ state: "active" })).toBeNull();
  });
});

describe("ContractWatch: the contract's end said (FS-4EC7Z §G R34)", () => {
  it("should say Contract Settled. in the success tone when it settles, once", () => {
    const watch = new ContractWatch();
    watch.see({ state: "active", heading: "east" });
    expect(watch.see({ state: "settled" })).toEqual([{ text: "Contract Settled.", tone: "done" }]);
    expect(watch.see({ state: "settled" })).toEqual([]);
  });

  it("should say Contract lost. refused when it is lost, once", () => {
    const watch = new ContractWatch();
    watch.see({ state: "active", heading: "east" });
    expect(watch.see({ state: "lost" })).toEqual([{ text: "Contract lost.", tone: "refused" }]);
    expect(watch.see({ state: "lost" })).toEqual([]);
  });

  it("should say nothing as one is taken, nor as its heading turns", () => {
    const watch = new ContractWatch();
    watch.see(undefined);
    expect(watch.see({ state: "active", heading: "east" })).toEqual([]);
    expect(watch.see({ state: "active", heading: "south" })).toEqual([]);
  });

  it("should say nothing on a first broadcast that finds it settled or lost (a reconnect), nor after a reset", () => {
    const watch = new ContractWatch();
    expect(watch.see({ state: "settled" })).toEqual([]);
    watch.reset();
    expect(watch.see({ state: "lost" })).toEqual([]);
  });

  it("should take the next broadcast after no player as a first", () => {
    const watch = new ContractWatch();
    watch.see({ state: "active", heading: "east" });
    expect(watch.see(null)).toEqual([]);
    expect(watch.see({ state: "settled" })).toEqual([]);
  });
});

describe("contractLineAt: where the heading line stands (FS-4EC7Z §G R34)", () => {
  it("should stand centred, under the Braziers window's place", async () => {
    const { contractLineAt } = await import("./contractLines");
    const { sealWindowFrame } = await import("./sealWindow");
    const at = contractLineAt(1280);
    const { panel } = sealWindowFrame(1280);
    expect(at.x).toBe(640);
    expect(at.y).toBeGreaterThan(panel.y + panel.height);
  });
});
