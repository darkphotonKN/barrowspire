import { describe, expect, it, vi } from "vitest";
import { FACE_GAP_MS, FaceSender, wireFacing } from "./faceWire";

/**
 * FS-JS7C8 §E R28, R29: the own facing goes up as `face` once on a body's first state, then only on
 * a change, at most once per 100 ms with the latest facing sent at the end of the gap, and never
 * while a Shadow Shot hold is up (ADR-0030). I-JS7C8-4.
 */
describe("FaceSender (FS-JS7C8 §E R28, R29)", () => {
  function sender() {
    const send = vi.fn();
    return { faces: new FaceSender(send), send };
  }

  it("should wait 100 ms between sends", () => {
    expect(FACE_GAP_MS).toBe(100);
  });

  it("should send the first facing on a body's first state at once", () => {
    const { faces, send } = sender();

    faces.update("body-1", "se", false, 5000);

    expect(send.mock.calls).toEqual([["se"]]);
  });

  it("should send nothing while the facing stays the same", () => {
    const { faces, send } = sender();

    faces.update("body-1", "se", false, 0);
    faces.update("body-1", "se", false, 200);
    faces.update("body-1", "se", false, 400);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("should send facings turned through inside 100 ms once at 0 and once at 100 ms with the latest", () => {
    const { faces, send } = sender();

    faces.update("body-1", "n", false, 0);
    faces.update("body-1", "ne", false, 30);
    faces.update("body-1", "e", false, 60);
    expect(send.mock.calls).toEqual([["n"]]);

    faces.update("body-1", "e", false, 100);

    expect(send.mock.calls).toEqual([["n"], ["e"]]);
  });

  it("should send nothing at the end of the gap when the facing came back to the one sent", () => {
    const { faces, send } = sender();

    faces.update("body-1", "n", false, 0);
    faces.update("body-1", "ne", false, 30);
    faces.update("body-1", "n", false, 60);
    faces.update("body-1", "n", false, 100);

    expect(send.mock.calls).toEqual([["n"]]);
  });

  it("should send a change after the gap at once", () => {
    const { faces, send } = sender();

    faces.update("body-1", "n", false, 0);
    faces.update("body-1", "s", false, 250);

    expect(send.mock.calls).toEqual([["n"], ["s"]]);
  });

  it("should send nothing while a Shadow Shot hold is up, and the first change after its release", () => {
    const { faces, send } = sender();
    faces.update("body-1", "n", false, 0);

    faces.update("body-1", "e", true, 200);
    faces.update("body-1", "s", true, 400);
    faces.update("body-1", "w", true, 600);
    expect(send.mock.calls).toEqual([["n"]]);

    faces.update("body-1", "w", false, 800);

    expect(send.mock.calls).toEqual([["n"], ["w"]]);
  });

  it("should not send a change left waiting in the gap once a hold goes up", () => {
    const { faces, send } = sender();
    faces.update("body-1", "n", false, 0);
    faces.update("body-1", "e", false, 50);

    faces.update("body-1", "e", true, 100);

    expect(send.mock.calls).toEqual([["n"]]);
  });

  it("should send nothing after a release that left the facing where it was sent", () => {
    const { faces, send } = sender();
    faces.update("body-1", "n", false, 0);
    faces.update("body-1", "e", true, 200);

    faces.update("body-1", "n", false, 400);

    expect(send.mock.calls).toEqual([["n"]]);
  });

  it("should send on a new body's first state again, whatever was sent for the last one", () => {
    const { faces, send } = sender();
    faces.update("body-1", "n", false, 0);

    // a world switch, a reconnect or a handoff: a new body has no facing on the server
    faces.update("body-2", "n", false, 10);

    expect(send.mock.calls).toEqual([["n"], ["n"]]);
  });
});

/** FS-JS7C8 §E R32, R34: another player's facing as their state entry carries it. */
describe("wireFacing (FS-JS7C8 §E R32, R34)", () => {
  it.each(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const)("should read %s", (facing) => {
    expect(wireFacing({ facing })).toBe(facing);
  });

  it.each([
    ["absent until the player has sent one", {}],
    ["an unknown name", { facing: "up" }],
    ["upper case", { facing: "NW" }],
    ["empty", { facing: "" }],
    ["a number", { facing: 3 }],
  ])("should read none when %s", (_why, entry) => {
    expect(wireFacing(entry as never)).toBeUndefined();
  });
});
