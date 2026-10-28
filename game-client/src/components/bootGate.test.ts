import { describe, expect, it } from "vitest";

import { bootInProgress, type SceneStatusReader } from "./bootGate";

// Phaser's Scenes status constants
const PENDING = 0;
const INIT = 1;
const START = 2;
const LOADING = 3;
const CREATING = 4;
const RUNNING = 5;
const SHUTDOWN = 8;

function scenesAt(statuses: Record<string, number>): SceneStatusReader {
  return {
    getScene: (key) => (key in statuses ? { sys: { settings: { status: statuses[key] } } } : null),
  };
}

describe("bootInProgress (world_entered on a refresh)", () => {
  // A refresh mid-run gets world_entered as soon as the socket opens, which is
  // usually while PreloadScene is still fetching the baked art. Phaser does not
  // count a loading scene as active, so the world scene started under the
  // preload, found the manifest cached but the atlases not yet in, and drew the
  // old procedural placeholders.
  it.each([
    ["queued", START],
    ["initialising", INIT],
    ["loading the art", LOADING],
    ["creating", CREATING],
    ["running", RUNNING],
  ])("should hold while PreloadScene is %s", (_label, status) => {
    expect(bootInProgress(scenesAt({ BootScene: SHUTDOWN, PreloadScene: status }))).toBe(true);
  });

  it("should hold while BootScene is still running", () => {
    expect(bootInProgress(scenesAt({ BootScene: RUNNING, PreloadScene: PENDING }))).toBe(true);
  });

  it("should let the world in once the preload has handed over to the menu", () => {
    expect(
      bootInProgress(scenesAt({ BootScene: SHUTDOWN, PreloadScene: SHUTDOWN, MainMenuScene: RUNNING })),
    ).toBe(false);
  });
});
