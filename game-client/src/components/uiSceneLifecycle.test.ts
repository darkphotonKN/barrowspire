import { describe, expect, it } from "vitest";
import { DisconnectNotice } from "./disconnectNotice";
import { UI_SCENE, driveUiScene } from "./uiSceneLifecycle";
import { switchWorld } from "./worldRouting";
import type { WorldEnteredPayload } from "@/assets/types/client";
import { GameUiBridge, NO_FACTS, type World, type WorldListener } from "@/ui/uiBridge";

// Phaser 4.2.1's scene statuses (scene/const.js). A scene the game booted and never started is INIT.
const INIT = 1;
const LOADING = 3;
const RUNNING = 5;
const PAUSED = 6;
const SLEEPING = 7;
const SHUTDOWN = 8;

const WORLD_OF: Record<string, World> = { HubScene: "hub", BarrowspireScene: "run", FieldScene: "field" };

/** A world's report: which world, its windows all shut (FS-TQZ5J R9). */
const reportOf = (world: World) => ({
  world,
  windows: () => ({ letter: false, party: false, inventory: false, character: false }),
  blockers: () => ({ dialogue: false }),
  facts: () => NO_FACTS,
  answer: () => {},
});

/**
 * A game's scene manager over statuses, with Phaser 4.2.1's rules where the UI scene's life rests on
 * them (scene/SceneManager.js, scene/Systems.js): `start` restarts a running, paused or sleeping
 * scene; `sleep` and `pause` only take a running one (any other is warned about and left); `wake`
 * and `resume` make it run. A world scene reports as its create runs and that it has left on its
 * stop, as its own code does through the UI bridge; one still loading its art has not reached
 * create, and reports when `loaded` is called.
 */
function game(statuses: Record<string, number> = {}, loading: string[] = []) {
  const log: string[] = [];
  const status = (key: string) => statuses[key] ?? INIT;
  const scenes = {
    getScene: (key: string) => ({ sys: { settings: { status: status(key) } } }),
    start(key: string) {
      const restart = status(key) >= RUNNING && status(key) <= SLEEPING;
      if (restart) scenes.stop(key);
      log.push(`${restart ? "restart" : "start"} ${key}`);
      if (loading.includes(key)) {
        statuses[key] = LOADING;
        return;
      }
      statuses[key] = RUNNING;
      if (WORLD_OF[key]) bridge.report(reportOf(WORLD_OF[key]));
    },
    stop(key: string) {
      if (status(key) === SHUTDOWN) return;
      const reported = status(key) >= RUNNING;
      log.push(`stop ${key}`);
      statuses[key] = SHUTDOWN;
      if (WORLD_OF[key] && reported) bridge.left(WORLD_OF[key]);
    },
    sleep(key: string) {
      if (status(key) !== RUNNING) return void log.push(`cannot sleep ${key}`);
      log.push(`sleep ${key}`);
      statuses[key] = SLEEPING;
    },
    pause(key: string) {
      if (status(key) !== RUNNING) return void log.push(`cannot pause ${key}`);
      log.push(`pause ${key}`);
      statuses[key] = PAUSED;
    },
    wake(key: string) {
      log.push(`wake ${key}`);
      statuses[key] = RUNNING;
    },
    resume(key: string) {
      log.push(`resume ${key}`);
      statuses[key] = RUNNING;
    },
  };
  const bridge = new GameUiBridge();
  driveUiScene(bridge, scenes);
  /** The world's own `world_entered`, routed as the game bridge routes it. */
  const enter = (world_type: WorldEnteredPayload["world_type"]) =>
    switchWorld(scenes, { world_type } as WorldEnteredPayload, { isArrival: () => false });
  /** A loading world's art is in: its create runs. */
  const loaded = (key: string) => {
    loading.splice(loading.indexOf(key), 1);
    statuses[key] = RUNNING;
    bridge.report(reportOf(WORLD_OF[key]));
  };
  const ui = () => status(UI_SCENE);
  const uiLog = () => log.filter((line) => line.endsWith(UI_SCENE));
  return { scenes, bridge, log, statuses, enter, loaded, ui, uiLog };
}

describe("the UI scene's life, driven by the worlds' reports (FS-TQZ5J R2–R5, ADR-0084 Decision 1)", () => {
  it("should stand unstarted in the main menu, and launch on the first world's report (R2, R3)", () => {
    const g = game({ MainMenuScene: RUNNING });
    expect(g.ui()).toBe(INIT);

    g.enter("hub");

    expect(g.uiLog()).toEqual([`start ${UI_SCENE}`]);
    expect(g.ui()).toBe(RUNNING);
    expect(g.bridge.world?.world).toBe("hub");
  });

  it("should never restart or stop it on a switch town → run → town → field (R2)", () => {
    const g = game({ MainMenuScene: RUNNING });

    g.enter("hub");
    g.enter("run");
    g.enter("hub");
    g.enter("field");

    expect(g.uiLog().filter((line) => !/^(sleep|wake) /.test(line))).toEqual([`start ${UI_SCENE}`]);
    expect(g.ui()).toBe(RUNNING);
    expect(g.bridge.world?.world).toBe("field");
  });

  it("should leave it standing when the same world is restarted (a reconnect mid-run): a left, then an entered", () => {
    const g = game({ MainMenuScene: RUNNING });
    g.enter("run");

    g.enter("run");

    expect(g.log).toContain("restart BarrowspireScene");
    expect(g.uiLog()).toEqual([`start ${UI_SCENE}`, `sleep ${UI_SCENE}`, `wake ${UI_SCENE}`]);
    expect(g.ui()).toBe(RUNNING);
  });

  it.each([
    ["character creation (Change character, started from inside the town)", "CharacterCreationScene"],
    ["the main menu", "MainMenuScene"],
  ])("should sleep it in %s, and wake the same scene with the next world (R3)", (_name, menu) => {
    const g = game({ MainMenuScene: RUNNING });
    g.enter("hub");

    // the town stops itself and starts the menu scene, through no world switch
    g.scenes.stop("HubScene");
    g.scenes.start(menu);

    expect(g.ui()).toBe(SLEEPING);
    expect(g.bridge.world).toBeNull();

    g.scenes.stop(menu);
    g.enter("hub");

    expect(g.ui()).toBe(RUNNING);
    expect(g.uiLog()).toEqual([`start ${UI_SCENE}`, `sleep ${UI_SCENE}`, `wake ${UI_SCENE}`]);
  });

  it("should show nothing of a world still loading its art, and wake with that world's report at its create (Edge States)", () => {
    const g = game({ MainMenuScene: RUNNING }, ["BarrowspireScene"]);
    g.enter("hub");

    g.enter("run");

    expect(g.statuses.BarrowspireScene).toBe(LOADING);
    expect(g.ui()).toBe(SLEEPING);

    g.loaded("BarrowspireScene");

    expect(g.ui()).toBe(RUNNING);
    expect(g.bridge.world?.world).toBe("run");
  });

  it("should take no left from a world no longer the one reported", () => {
    const g = game({ MainMenuScene: RUNNING });
    g.enter("hub");
    g.bridge.report(reportOf("field"));

    g.bridge.left("hub");

    expect(g.ui()).toBe(RUNNING);
    expect(g.bridge.world?.world).toBe("field");
  });

  it("should ask nothing of a game with no UI scene in its list", () => {
    const log: string[] = [];
    const bridge = new GameUiBridge();
    driveUiScene(bridge, {
      getScene: () => null,
      start: (key: string) => void log.push(`start ${key}`),
      sleep: (key: string) => void log.push(`sleep ${key}`),
      wake: (key: string) => void log.push(`wake ${key}`),
      resume: (key: string) => void log.push(`resume ${key}`),
    });

    bridge.report(reportOf("hub"));
    bridge.left("hub");

    expect(log).toEqual([]);
  });
});

describe("the UI scene's life as a listener on the bridge's reports (FS-TQZ5J R2, R3)", () => {
  it("should follow any source of world reports, and stop following once let go", () => {
    const listeners: WorldListener[] = [];
    const reports = {
      onWorld(listener: WorldListener) {
        listeners.push(listener);
        return () => void listeners.splice(listeners.indexOf(listener), 1);
      },
    };
    const g = game();
    const stop = driveUiScene(reports, g.scenes);

    for (const listener of [...listeners]) listener(reportOf("hub"));
    expect(g.ui()).toBe(RUNNING);
    for (const listener of [...listeners]) listener(null);
    expect(g.ui()).toBe(SLEEPING);

    stop();

    expect(listeners).toHaveLength(0);
  });
});

describe("the UI scene under the disconnect notice (FS-TQZ5J R5, FS-R6EYZ R10, R12)", () => {
  it("should be paused with the worlds while the notice is up", () => {
    const g = game({ MainMenuScene: RUNNING });
    g.enter("hub");
    const notice = new DisconnectNotice(g.scenes);

    notice.lost();
    notice.holdWorlds();

    expect(g.statuses.HubScene).toBe(PAUSED);
    expect(g.ui()).toBe(PAUSED);
  });

  it("should hold one that woke under the notice as it comes (a world that finished loading under it)", () => {
    const g = game({ MainMenuScene: RUNNING }, ["FieldScene"]);
    g.enter("hub");
    g.enter("field");
    const notice = new DisconnectNotice(g.scenes);
    notice.lost();
    notice.holdWorlds();
    expect(g.ui()).toBe(SLEEPING);

    g.loaded("FieldScene");
    notice.holdWorlds();

    expect(g.ui()).toBe(PAUSED);
  });

  it("should leave it asleep, not drawn, on Return to menu; the next world wakes it", () => {
    const g = game({ MainMenuScene: RUNNING });
    g.enter("run");
    const notice = new DisconnectNotice(g.scenes);
    notice.lost();
    notice.holdWorlds();

    notice.returnToMenu();

    expect(g.ui()).toBe(SLEEPING);
    expect(g.log).not.toContain(`cannot sleep ${UI_SCENE}`);

    g.enter("hub");

    expect(g.ui()).toBe(RUNNING);
    expect(g.uiLog().filter((line) => line.startsWith("start"))).toEqual([`start ${UI_SCENE}`]);
  });
});

describe("the UI bridge's typed channel (FS-TQZ5J R9–R12)", () => {
  it("should report no world before the first, and the last world's report after it (R9)", () => {
    const g = game();
    expect(g.bridge.world).toBeNull();

    g.bridge.report(reportOf("run"));

    expect(g.bridge.world?.world).toBe("run");
  });

  it("should carry the UI's state to the worlds: its menu shut until the UI reports it open (R10)", () => {
    const { bridge } = game();
    expect(bridge.ui).toEqual({ menuOpen: false });

    bridge.reportUi({ menuOpen: true });

    expect(bridge.ui).toEqual({ menuOpen: true });
  });

  it("should run a world's player action through act, once, as it is (R12)", () => {
    const { bridge } = game();
    const ran: string[] = [];

    bridge.act(() => ran.push("toggled"));

    expect(ran).toEqual(["toggled"]);
  });
});
