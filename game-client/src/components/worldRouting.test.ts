import { describe, expect, it } from "vitest";
import type { WorldEnteredPayload } from "@/assets/types/client";
import { WORLD_SCENES, sceneFor, switchWorld } from "./worldRouting";

describe("sceneFor (FS-29KSH §Requirements 15; FS-X2F2H §Requirements 55)", () => {
  it.each([
    { world: "hub", scene: "HubScene" },
    { world: "run", scene: "BarrowspireScene" },
    { world: "field", scene: "FieldScene" },
  ] as const)("should start $scene for a $world world", ({ world, scene }) => {
    expect(sceneFor(world)).toBe(scene);
  });

  it("should stop the field scene with the other world scenes", () => {
    expect(WORLD_SCENES).toEqual(
      expect.arrayContaining(["HubScene", "BarrowspireScene", "FieldScene", "MainMenuScene"]),
    );
  });
});

// Phaser 4.2.1's scene statuses (scene/const.js) and what its SceneManager does with them.
const PENDING = 0;
const LOADING = 3;
const RUNNING = 5;
const SHUTDOWN = 8;

/**
 * A scene manager as Phaser 4.2.1's treats a world scene: `isActive` is RUNNING only
 * (Systems.isActive); `stop` shuts down anything not already SHUTDOWN (SceneManager.stop); `start`
 * on a scene START..CREATING lets it continue and drops the new data, on one RUNNING..SLEEPING
 * shuts it down and starts it again, otherwise starts it (SceneManager.start). A started world
 * scene sits LOADING while its art downloads.
 */
function sceneManager(statuses: Record<string, number>) {
  const log: string[] = [];
  const data: Record<string, unknown> = {};
  const status = (key: string) => statuses[key] ?? PENDING;
  return {
    log,
    data,
    statuses,
    getScene: (key: string) => ({ sys: { settings: { status: status(key) } } }),
    isActive: (key: string) => status(key) === RUNNING,
    stop(key: string) {
      if (status(key) === SHUTDOWN) return;
      statuses[key] = SHUTDOWN;
      log.push(`stop ${key}`);
    },
    start(key: string, startData?: object) {
      const s = status(key);
      if (s >= 2 && s <= 4) return void log.push(`ignored start ${key}`);
      if (s >= RUNNING && s <= 7) log.push(`restart ${key}`);
      else log.push(`start ${key}`);
      statuses[key] = LOADING;
      data[key] = startData;
    },
  };
}

describe("switchWorld while a world scene is still loading (FS-C4JWH Edge States: a world switch mid-download)", () => {
  it("should stop the run that is still downloading its creatures when the hub is entered", () => {
    const scenes = sceneManager({ MainMenuScene: SHUTDOWN, BarrowspireScene: LOADING });

    switchWorld(scenes, { world_type: "hub" } as WorldEnteredPayload);

    expect(scenes.log).toEqual(["stop BarrowspireScene", "start HubScene"]);
  });

  it("should restart a field still loading for another field, with the new field's data", () => {
    const scenes = sceneManager({ FieldScene: LOADING });

    switchWorld(scenes, { world_type: "field", field: "gentle_meadows" } as WorldEnteredPayload);

    expect(scenes.log).toEqual(["stop FieldScene", "start FieldScene"]);
    expect(scenes.data.FieldScene).toMatchObject({ field: "gentle_meadows" });
  });

  it("should restart a running world it is sent to again, and stop the other running one", () => {
    const scenes = sceneManager({ HubScene: RUNNING, BarrowspireScene: RUNNING });

    switchWorld(scenes, { world_type: "run", session_id: "run-b" } as WorldEnteredPayload);

    expect(scenes.log).toEqual(["stop HubScene", "restart BarrowspireScene"]);
    expect(scenes.data.BarrowspireScene).toMatchObject({ sessionID: "run-b" });
  });

  it("should leave a world scene that never started, or has stopped, alone", () => {
    const scenes = sceneManager({ FieldScene: SHUTDOWN });

    switchWorld(scenes, { world_type: "hub" } as WorldEnteredPayload);

    expect(scenes.log).toEqual(["start HubScene"]);
  });
});
