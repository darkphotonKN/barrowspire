import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as SceneStatus from "./sceneStatus";

// Phaser's own scene statuses (4.2.1), not a copy: the module is Phaser-free, so this pins its
// values to the source it mirrors. Phaser's exports map admits only its bundle, so its source is
// reached by path.
const PHASER: Record<string, number> = createRequire(import.meta.url)(
  "../../node_modules/phaser/src/scene/const.js",
);

describe("a scene's status, as Phaser numbers it (scene/const.js)", () => {
  it.each([
    "PENDING",
    "INIT",
    "START",
    "LOADING",
    "CREATING",
    "RUNNING",
    "PAUSED",
    "SLEEPING",
    "SHUTDOWN",
    "DESTROYED",
  ] as const)("should name %s as Phaser does", (name) => {
    expect(SceneStatus[name]).toBe(PHASER[name]);
  });

  it.each([
    ["PENDING", false],
    ["INIT", false],
    ["START", true],
    ["LOADING", true],
    ["CREATING", true],
    ["RUNNING", true],
    ["PAUSED", true],
    ["SLEEPING", true],
    ["SHUTDOWN", false],
    ["DESTROYED", false],
  ] as const)("should count a scene at %s as standing (started, not stopped: its display list holds what it made): %s", (name, holds) => {
    expect(SceneStatus.standing(PHASER[name])).toBe(holds);
  });
});
