import { describe, expect, it, vi } from "vitest";

import type { WorldEnteredPayload } from "@/assets/types/client";
import { ResultHold } from "./resultHold";

const hub: WorldEnteredPayload = { session_id: "hub-1", world_type: "hub" };
const run: WorldEnteredPayload = { session_id: "run-2", world_type: "run" };

describe("ResultHold (FS-QPDKN §Requirements 15–17)", () => {
  // The run's end sends end_game and world_entered(hub) in the same moment; applied
  // at once, the hub sweeps the result card away before it can be read.
  it("should hold the hub world while the result card is up, and apply it on release", () => {
    const hold = new ResultHold();
    const apply = vi.fn();
    hold.raise();

    expect(hold.hold(hub, apply)).toBe(true);
    expect(apply).not.toHaveBeenCalled();

    hold.release();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(hub);
  });

  // R16: only the hub is held; a run (a handoff host's, say) is the caller's to apply now
  it("should not hold a run world while the card is up", () => {
    const hold = new ResultHold();
    hold.raise();
    expect(hold.hold(run, vi.fn())).toBe(false);
  });

  it("should not hold the hub while no card is up", () => {
    const hold = new ResultHold();
    expect(hold.hold(hub, vi.fn())).toBe(false);
  });

  // the scene stopped under the card (a reconnect rebuilds it): nothing stale must switch
  it("should forget the held world when cleared, and hold nothing after", () => {
    const hold = new ResultHold();
    const apply = vi.fn();
    hold.raise();
    hold.hold(hub, apply);

    hold.clear();

    hold.release();
    expect(apply).not.toHaveBeenCalled();
    expect(hold.hold(hub, apply)).toBe(false);
  });

  // a fast press beats the hub message: the next hub world must not be held forever
  it("should let the hub in at once if the card was dismissed before it arrived", () => {
    const hold = new ResultHold();
    hold.raise();
    hold.release();
    expect(hold.hold(hub, vi.fn())).toBe(false);
  });

  it("should apply the held world once, not on every press", () => {
    const hold = new ResultHold();
    const apply = vi.fn();
    hold.raise();
    hold.hold(hub, apply);
    hold.release();
    hold.release();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
