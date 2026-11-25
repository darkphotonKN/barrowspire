import { describe, expect, it } from "vitest";
import { StatusWatch } from "./statusLines";

// FS-5FZ4J §J R53 (I-5FZ4J-10): a player's own statuses as HUD notices, read off the state.
describe("StatusWatch: the player's statuses off the state (FS-5FZ4J §I R47–R48, §J R53)", () => {
  it("should say Poisoned. when poisoned_for appears, refused, and not again while it runs down", () => {
    const watch = new StatusWatch();
    expect(watch.see({})).toEqual([]);
    expect(watch.see({ poisoned_for: 6 })).toEqual([{ text: "Poisoned.", tone: "refused" }]);
    expect(watch.see({ poisoned_for: 5.5 })).toEqual([]);
  });

  it("should say it again on a fresh poisoning after the last one ran out", () => {
    const watch = new StatusWatch();
    watch.see({ poisoned_for: 2 });
    watch.see({});
    expect(watch.see({ poisoned_for: 6 })).toEqual([{ text: "Poisoned.", tone: "refused" }]);
  });

  it("should say nothing on a first broadcast that finds the player already poisoned, nor after a reset", () => {
    const watch = new StatusWatch();
    expect(watch.see({ poisoned_for: 4 })).toEqual([]);
    watch.reset();
    expect(watch.see({ poisoned_for: 3 })).toEqual([]);
  });

  it("should say nothing for no player (escaped, or out of the delve), and take the next broadcast after as a first", () => {
    const watch = new StatusWatch();
    watch.see({});
    expect(watch.see(null)).toEqual([]);
    expect(watch.see({ poisoned_for: 1 })).toEqual([]);
  });

  // FS-5FZ4J §J R53 (I-5FZ4J-11)
  it("should say Blessed. when blessed turns true, in the success tone (done), and not again while it holds", () => {
    const watch = new StatusWatch();
    watch.see({});
    expect(watch.see({ blessed: true })).toEqual([{ text: "Blessed.", tone: "done" }]);
    expect(watch.see({ blessed: true })).toEqual([]);
  });

  it("should say nothing on a first broadcast that finds the player already blessed (a reconnect)", () => {
    const watch = new StatusWatch();
    expect(watch.see({ blessed: true })).toEqual([]);
    expect(watch.see({ blessed: true })).toEqual([]);
  });

  it("should say both, poison first, when both come on one broadcast", () => {
    const watch = new StatusWatch();
    watch.see({});
    expect(watch.see({ poisoned_for: 6, blessed: true }).map((l) => l.text)).toEqual(["Poisoned.", "Blessed."]);
  });
});

