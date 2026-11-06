import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import { holdOneShots } from "./heldMessages";

/** A socket as `SocketManager` is to a scene: one listener per action, `on` replacing it. */
function socket() {
  const listeners = new Map<string, (payload: unknown) => void>();
  return {
    listeners,
    on: vi.fn((action: string, fn: (payload: unknown) => void) => void listeners.set(action, fn)),
    off: vi.fn((action: string) => void listeners.delete(action)),
    send: (action: string, payload: unknown) => listeners.get(action)?.(payload),
  };
}

describe("holdOneShots (FS-C4JWH Edge States: a world's messages while its art downloads)", () => {
  it("should keep what arrives before create and hand it over, in arrival order, once create is done", () => {
    const io = socket();
    const scene = { events: new EventEmitter() };
    const held = holdOneShots(scene, io, ["a", "b"]);
    const heard: string[] = [];

    io.send("b", 1);
    io.send("a", 2);
    io.send("b", 3);
    expect(heard).toEqual([]);

    held.replay({ a: (p) => heard.push(`a${p}`), b: (p) => heard.push(`b${p}`) });

    expect(heard).toEqual(["b1", "a2", "b3"]);
  });

  it("should pass what comes after create straight on", () => {
    const io = socket();
    const held = holdOneShots({ events: new EventEmitter() }, io, ["a"]);
    const heard: unknown[] = [];
    held.replay({ a: (p) => heard.push(p) });

    io.send("a", "late");

    expect(heard).toEqual(["late"]);
  });

  it.each(["shutdown", "destroy"] as const)(
    "should let go of every action and what it kept when the scene ends (%s) before create",
    (end) => {
      const io = socket();
      const scene = { events: new EventEmitter() };
      const held = holdOneShots(scene, io, ["a", "b"]);
      io.send("a", 1);

      scene.events.emit(end);
      const heard: unknown[] = [];
      held.replay({ a: (p) => heard.push(p) });

      expect(io.off.mock.calls.map(([action]) => action).sort()).toEqual(["a", "b"]);
      expect(io.listeners.size).toBe(0);
      expect(heard).toEqual([]);
    },
  );
});
