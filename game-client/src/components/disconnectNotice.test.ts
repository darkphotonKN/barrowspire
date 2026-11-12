import { describe, expect, it, vi } from "vitest";
import {
  DisconnectNotice,
  NOTICE_SCENE,
  hideDomLayer,
  watchConnectionLoss,
} from "./disconnectNotice";

// Phaser 4.2.1's scene statuses (scene/const.js). A scene the game booted and never started is INIT.
const INIT = 1;
const LOADING = 3;
const RUNNING = 5;
const PAUSED = 6;
const SHUTDOWN = 8;

/** A scene manager over statuses, logging what it is asked; a key not given is INIT (booted, never started). */
function sceneManager(statuses: Record<string, number>) {
  const log: string[] = [];
  const data: Record<string, unknown> = {};
  const status = (key: string) => statuses[key] ?? INIT;
  return {
    log,
    data,
    statuses,
    getScene: (key: string) => ({ sys: { settings: { status: status(key) } } }),
    start(key: string, startData?: object) {
      log.push(`start ${key}`);
      data[key] = startData;
      statuses[key] = RUNNING;
    },
    stop(key: string) {
      if (status(key) === SHUTDOWN) return;
      log.push(`stop ${key}`);
      statuses[key] = SHUTDOWN;
    },
    pause(key: string) {
      log.push(`pause ${key}`);
      statuses[key] = PAUSED;
    },
  };
}

describe("DisconnectNotice raised by a lost connection (FS-R6EYZ R6, R7)", () => {
  it.each([
    ["the town running", { HubScene: RUNNING }],
    ["a field running", { FieldScene: RUNNING }],
    ["a run running", { BarrowspireScene: RUNNING }],
    ["a run still loading its art", { BarrowspireScene: LOADING }],
  ])("should start the notice scene with %s", (_name, statuses) => {
    const scenes = sceneManager({ ...statuses });
    const notice = new DisconnectNotice(scenes);
    notice.lost();
    expect(scenes.log).toEqual([`start ${NOTICE_SCENE}`]);
    expect(scenes.data[NOTICE_SCENE]).toEqual({ notice });
  });

  it.each([
    ["the main menu", { MainMenuScene: RUNNING }],
    ["character creation", { CharacterCreationScene: RUNNING }],
    ["the preload", { PreloadScene: LOADING }],
    ["the menu after a run (the run stopped)", { MainMenuScene: RUNNING, BarrowspireScene: SHUTDOWN }],
  ])("should raise nothing on %s, the world scenes booted and never started or stopped", (_name, statuses) => {
    const scenes = sceneManager({ ...statuses });
    new DisconnectNotice(scenes).lost();
    expect(scenes.log).toEqual([]);
  });

  it("should raise one notice however many connections are lost while it is up", () => {
    const scenes = sceneManager({ HubScene: RUNNING });
    const notice = new DisconnectNotice(scenes);
    notice.lost();
    notice.holdWorlds();
    notice.lost();
    notice.lost();
    expect(scenes.log.filter((line) => line.startsWith("start"))).toEqual([`start ${NOTICE_SCENE}`]);
  });

  it("should raise one again after Return to menu, on the next world's lost connection", () => {
    const scenes = sceneManager({ HubScene: RUNNING });
    const notice = new DisconnectNotice(scenes);
    notice.lost();
    notice.returnToMenu();
    scenes.statuses.HubScene = RUNNING;
    scenes.log.length = 0;
    notice.lost();
    expect(scenes.log).toEqual([`start ${NOTICE_SCENE}`]);
  });
});

describe("DisconnectNotice holds the world still (FS-R6EYZ R10)", () => {
  it("should pause every running world scene and leave the rest alone", () => {
    const scenes = sceneManager({ BarrowspireScene: RUNNING, HubScene: SHUTDOWN, [NOTICE_SCENE]: RUNNING });
    const notice = new DisconnectNotice(scenes);
    notice.holdWorlds();
    expect(scenes.log).toEqual(["pause BarrowspireScene"]);
  });

  it("should pause a world scene that comes up under the notice, and pause nothing twice", () => {
    const scenes = sceneManager({ BarrowspireScene: LOADING });
    const notice = new DisconnectNotice(scenes);
    notice.holdWorlds();
    expect(scenes.log).toEqual([]);
    scenes.statuses.BarrowspireScene = RUNNING;
    notice.holdWorlds();
    notice.holdWorlds();
    expect(scenes.log).toEqual(["pause BarrowspireScene"]);
  });
});

describe("DisconnectNotice Return to menu (FS-R6EYZ R12)", () => {
  it("should take the notice down, stop the paused world, and start the main menu", () => {
    const scenes = sceneManager({ BarrowspireScene: PAUSED, [NOTICE_SCENE]: RUNNING });
    const notice = new DisconnectNotice(scenes);
    notice.returnToMenu();
    expect(scenes.log[0]).toBe(`stop ${NOTICE_SCENE}`);
    expect(scenes.log).toContain("stop BarrowspireScene");
    expect(scenes.log[scenes.log.length - 1]).toBe("start MainMenuScene");
    expect(scenes.statuses.BarrowspireScene).toBe(SHUTDOWN);
  });

  it("should stop every world scene starting or running under it too, the menu's included", () => {
    const scenes = sceneManager({ HubScene: PAUSED, FieldScene: LOADING, MainMenuScene: RUNNING });
    new DisconnectNotice(scenes).returnToMenu();
    expect(scenes.log).toEqual(
      expect.arrayContaining(["stop HubScene", "stop FieldScene", "stop MainMenuScene"]),
    );
    expect(scenes.log[scenes.log.length - 1]).toBe("start MainMenuScene");
  });
});

describe("watchConnectionLoss (FS-R6EYZ R6: bound to the game, let go with it)", () => {
  function socket() {
    const listeners = new Set<() => void>();
    return {
      onConnectionLost: (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn)),
      lose: () => listeners.forEach((fn) => fn()),
    };
  }

  it("should raise the notice on the socket's lost connection while a world is up", () => {
    const s = socket();
    const scenes = sceneManager({ FieldScene: RUNNING });
    watchConnectionLoss(s, scenes);
    s.lose();
    expect(scenes.log).toEqual([`start ${NOTICE_SCENE}`]);
  });

  it("should raise nothing once the watch is let go (the player left /game)", () => {
    const s = socket();
    const scenes = sceneManager({ FieldScene: RUNNING });
    const stop = watchConnectionLoss(s, scenes);
    stop();
    s.lose();
    expect(scenes.log).toEqual([]);
  });
});

describe("hideDomLayer (FS-R6EYZ R10: the DOM fields over the canvas take no input)", () => {
  function layer(display = "block") {
    const field = { blur: vi.fn() };
    const container = { style: { display }, contains: (node: unknown) => node === field };
    return { field, container };
  }

  it("should hide the layer, blur the field in it that had focus, and give the layer back", () => {
    const { field, container } = layer();
    const giveBack = hideDomLayer(container, { activeElement: field });
    expect(container.style.display).toBe("none");
    expect(field.blur).toHaveBeenCalledTimes(1);
    giveBack();
    expect(container.style.display).toBe("block");
  });

  it("should blur nothing outside the layer", () => {
    const { container } = layer();
    const elsewhere = { blur: vi.fn() };
    hideDomLayer(container, { activeElement: elsewhere });
    expect(elsewhere.blur).not.toHaveBeenCalled();
  });

  it("should do nothing for a game with no DOM layer", () => {
    expect(() => hideDomLayer(null, { activeElement: null })()).not.toThrow();
  });
});
