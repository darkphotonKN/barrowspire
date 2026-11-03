import { describe, expect, it } from "vitest";
import { InTurn, type Clock } from "./inTurn";

// FS-1819Q R11 and Edge States: "play all in turn" plays each demo one after another, and a
// second click restarts the sequence rather than running two at once.

function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const clock: Clock = {
    delayedCall: (ms, fn) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return { remove: () => void (t.live = false) };
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((t) => t.live && t.at <= now)) {
      t.live = false;
      t.fn();
    }
  };
  return { clock, advance };
}

describe("InTurn", () => {
  it("should play each item one step after the last", () => {
    const { clock, advance } = fakeClock();
    const played: string[] = [];
    new InTurn(clock, 100).start(["a", "b", "c"], (x) => played.push(x));

    advance(0);
    expect(played).toEqual(["a"]);
    advance(100);
    expect(played).toEqual(["a", "b"]);
    advance(100);
    expect(played).toEqual(["a", "b", "c"]);
  });

  it("should restart from the first item when started again, never running two at once", () => {
    const { clock, advance } = fakeClock();
    const played: string[] = [];
    const turns = new InTurn(clock, 100);
    turns.start(["a", "b", "c"], (x) => played.push(x));
    advance(150);
    turns.start(["a", "b", "c"], (x) => played.push(x));
    advance(1000);

    expect(played).toEqual(["a", "b", "a", "b", "c"]);
  });
});
