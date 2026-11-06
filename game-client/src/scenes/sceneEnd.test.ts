import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "eventemitter3";

vi.mock("phaser", () => {
  const phaser = { Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } } };
  return { ...phaser, default: phaser };
});

const { onSceneEnd } = await import("./sceneEnd");
const { sceneSystems } = await import("./sceneEnd.standin");

// Leaving /game destroys the Phaser game. Game.runDestroy → SceneManager.destroy → Systems.destroy
// emits the scene's DESTROY and never SHUTDOWN, and every scene plugin (input, keyboard, cameras,
// tweens, clock…) subscribed to DESTROY at boot, so each has destroyed itself before any handler a
// scene adds in create() or init() runs: InputPlugin.destroy nulls its manager first, and the hub's
// `this.input.setDefaultCursor("")` threw. A throw there stops Game.runDestroy: no renderer, loop or
// later scene is destroyed and the game's window listeners stay (asked 2026-11-06).

describe("onSceneEnd", () => {
  it("should say shutdown on a stop, after the plugins shut down, and not run again on a later destroy", () => {
    const systems = sceneSystems();
    const ends: string[] = [];
    onSceneEnd(systems.scene, (end) => ends.push(`${end}: input ${systems.input.state}`));

    systems.shutdown();
    systems.destroy();

    expect(ends).toEqual(["shutdown: input shut down"]);
  });

  it("should say destroy on a game destroy, which runs after the plugins destroyed themselves", () => {
    const systems = sceneSystems();
    const ends: string[] = [];
    onSceneEnd(systems.scene, (end) => ends.push(`${end}: input ${systems.input.state}`));

    systems.destroy();

    expect(ends).toEqual(["destroy: input destroyed"]);
  });

  it("should listen again for each start, ending each once", () => {
    const systems = sceneSystems();
    const ends: string[] = [];
    const release = (end: string) => ends.push(end);
    onSceneEnd(systems.scene, release);
    systems.shutdown();
    systems.start();
    onSceneEnd(systems.scene, release);

    systems.destroy();

    expect(ends).toEqual(["shutdown", "destroy"]);
  });

  it("should leave the scene's other listeners be", () => {
    const systems = sceneSystems();
    const other = vi.fn();
    systems.scene.events.once("destroy", other);
    onSceneEnd(systems.scene, () => {});

    systems.shutdown();
    systems.destroy();

    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe("the Phaser stand-in", () => {
  it("should throw, as InputPlugin does, when the input is used after a game destroy", () => {
    const systems = sceneSystems();
    let thrown: unknown;
    systems.scene.events.once("destroy", () => {
      try {
        systems.scene.input.setDefaultCursor("");
      } catch (err) {
        thrown = err;
      }
    });

    systems.destroy();

    expect(thrown).toBeInstanceOf(TypeError);
  });

  it("should let the input be used after a stop", () => {
    const systems = sceneSystems();
    systems.scene.events.once("shutdown", () => systems.scene.input.setDefaultCursor(""));

    expect(() => systems.shutdown()).not.toThrow();
  });

  it("should be an eventemitter3 emitter, as Phaser's scene events are", () => {
    expect(sceneSystems().scene.events).toBeInstanceOf(EventEmitter);
  });
});
