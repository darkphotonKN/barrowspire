import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { RESIDENT_ART_PAGES, artLoaderStandin, shippedManifest } from "./artLoader.standin";
import { atlasTextureKey } from "./library";
import { onDemandArt, preloadArt, registerArt, type ArtScene } from "./phaser";
import { RESIDENT_ART, SCENE_ART, fieldArt, type SceneGroups } from "./sceneArt";

const manifest = shippedManifest();
const resident = RESIDENT_ART_PAGES.map(atlasTextureKey);
const pages = (...atlases: string[]) => atlases.map(atlasTextureKey);
const artKeys = (keys: string[]) => keys.filter((k) => k.startsWith("art:") && k !== "art:placeholder").sort();

/** The animation keys the manifest registers for `sheet` (multi-frame clips, every direction). */
const sheetAnims = (sheet: string) =>
  Object.entries(manifest.sheets[sheet].animations).flatMap(([clip, anim]) =>
    anim.frames.flatMap((frames, direction) => (frames.length > 1 ? [`${sheet}/${clip}/${direction}`] : [])),
  );

/**
 * A game standing where `groups`' scene left it: the manifest cached, the resident art and that
 * scene's pages loaded, and its frames and animations registered, as its create left them.
 */
function after(groups: SceneGroups, extra: string[] = []) {
  const art = artLoaderStandin({
    manifest,
    cachedManifest: true,
    textures: [...resident, ...pages(...groups.flatMap(groupPages)), ...extra],
  });
  registerArt(art.scene as unknown as ArtScene, groups, { warn: vi.fn() });
  return art;
}

/** The pages of a scene-scoped group in the shipped manifest. */
const groupPages = (group: string) =>
  Object.keys(manifest.atlases).filter((atlas) => atlas.replace(/-\d+$/, "") === group);

/** Enters a scene holding `groups`: its preload, then, once its load completes, its create. */
function enter(art: ReturnType<typeof artLoaderStandin>, groups: SceneGroups) {
  const seen: { textures?: string[]; anims?: string[] } = {};
  art.boot({
    preload: () => preloadArt(art.scene as unknown as Phaser.Scene, groups),
    create: () => {
      // what create would build on: read before anything is drawn
      seen.textures = artKeys(art.textures.getTextureKeys());
      seen.anims = [...art.anims.list.keys()];
      registerArt(art.scene as unknown as ArtScene, groups, { warn: vi.fn() });
    },
  });
  return seen;
}

describe("eviction once the next scene has loaded (FS-C4JWH §C, ADR-0059)", () => {
  it("should leave the resident pages and the hub's own, before the hub's create, on the way back from the meadows", () => {
    const art = after(fieldArt("gentle_meadows"));
    expect(art.anims.list.has("creature_boar_base/walk/0")).toBe(true);

    const seen = enter(art, SCENE_ART.HubScene);

    expect(seen.textures).toEqual(artKeys([...resident, ...pages("folk-0")]));
    expect(art.textures.removed.sort()).toEqual(pages("wildlife-0", "wildlife-1"));
  });

  it("should take every animation on an evicted page with it, and keep those on the pages kept", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    const knight = sheetAnims("char_knight_base");
    const run = ["creature_ghoul_base", "creature_troll_base", "creature_demon_base"].flatMap(sheetAnims);
    expect(run.length).toBeGreaterThan(0);

    const seen = enter(art, SCENE_ART.HubScene);

    for (const key of run) expect(seen.anims).not.toContain(key);
    for (const key of knight) expect(seen.anims).toContain(key);
    expect(art.anims.removed.sort()).toEqual([...run].sort());
  });

  it("should evict nothing and queue nothing when the scene is re-entered", () => {
    const art = after(SCENE_ART.HubScene);

    const seen = enter(art, SCENE_ART.HubScene);

    expect(art.queued).toEqual([]);
    expect(art.textures.removed).toEqual([]);
    expect(art.anims.removed).toEqual([]);
    expect(seen.textures).toEqual(artKeys([...resident, ...pages("folk-0")]));
  });

  it.each([
    ["the main menu", SCENE_ART.MainMenuScene],
    ["character creation", SCENE_ART.CharacterCreationScene],
  ])("should evict every scene-scoped group on entering %s", (_menu, groups) => {
    const art = after(SCENE_ART.HubScene, pages("creatures-0", "creatures-1", "boss-0", "boss-1", "boss-2"));

    const seen = enter(art, groups);

    expect(seen.textures).toEqual(artKeys(resident));
  });

  it("should register an evicted page anew when it is queued again: its frames and animations are back", () => {
    const art = after(fieldArt("gentle_meadows"));
    enter(art, SCENE_ART.HubScene);
    expect(art.anims.list.has("creature_boar_base/walk/0")).toBe(false);

    const seen = enter(art, fieldArt("gentle_meadows"));

    // the hub's folk on the way in, then the meadows' wildlife again
    expect(art.queued).toEqual(pages("folk-0", "wildlife-0", "wildlife-1"));
    expect(seen.textures).toEqual(artKeys([...resident, ...pages("wildlife-0", "wildlife-1")]));
    for (const key of sheetAnims("creature_boar_base")) expect(art.anims.list.has(key)).toBe(true);
    expect(art.textures.get("art:wildlife-0").getFrameNames()).toContain("creature_boar_base/idle/0/0");
    // the hub's folk went on the way in
    expect(art.textures.exists("art:folk-0")).toBe(false);
  });

  it("should evict only once the download has completed, the old group still there while it runs", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    let created = false;
    art.boot(
      {
        preload: () => preloadArt(art.scene as unknown as Phaser.Scene, SCENE_ART.HubScene),
        create: () => (created = true),
      },
      undefined,
      { hold: true },
    );
    expect(art.textures.exists("art:boss-0")).toBe(true);

    art.finish();

    expect(created).toBe(true);
    expect(art.textures.exists("art:boss-0")).toBe(false);
    expect(art.textures.exists("art:folk-0")).toBe(true);
  });

  it("should leave the next scene to evict when a scene is stopped mid-load", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    art.boot(
      { preload: () => preloadArt(art.scene as unknown as Phaser.Scene, SCENE_ART.HubScene) },
      undefined,
      { hold: true },
    );

    art.stop();

    expect(art.textures.removed).toEqual([]);
    const seen = enter(art, fieldArt("forlorn_forest"));
    expect(seen.textures).toEqual(artKeys([...resident, ...pages("fodder-0", "fodder-1")]));
  });

  it("should evict nothing, and throw nothing, when the manifest never loaded", () => {
    const art = artLoaderStandin({ manifest, failing: ["art:manifest"], textures: resident });
    expect(() => enter(art, SCENE_ART.HubScene)).not.toThrow();
    expect(art.textures.removed).toEqual([]);
  });

  it("should keep the resident art when it is the gallery's or the boot's (RESIDENT_ART)", () => {
    const art = after(RESIDENT_ART);

    const seen = enter(art, RESIDENT_ART);

    expect(seen.textures).toEqual(artKeys(resident));
    expect(art.textures.removed).toEqual([]);
  });
});

describe("the loading bar, paced (FS-C4JWH §D R17, Amendment A1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A bar that says what happens to it, in `order`, with the time. */
  function recordingBar(order: string[]) {
    const progress: number[] = [];
    let shown = 0;
    return {
      progress,
      shown: () => shown,
      bar: () => {
        shown++;
        order.push(`${Date.now()} bar shown`);
        return {
          progress: (v: number) => progress.push(v),
          destroy: () => order.push(`${Date.now()} bar destroyed`),
        };
      },
    };
  }

  /**
   * Enters a scene holding `groups` with a bar, its load held until the test finishes it,
   * recording bar, eviction and create in `order`.
   */
  function enterWithBar(art: ReturnType<typeof artLoaderStandin>, groups: SceneGroups, opts: { fadeIn?: boolean } = {}) {
    const order: string[] = [];
    const bar = recordingBar(order);
    const remove = art.textures.remove.bind(art.textures);
    art.textures.remove = (key: string) => (order.push(`${Date.now()} evicted ${key}`), remove(key));
    art.boot(
      {
        preload: () => preloadArt(art.scene as unknown as Phaser.Scene, groups, { bar: bar.bar, fadeIn: opts.fadeIn }),
        create: () => order.push(`${Date.now()} create`),
      },
      undefined,
      { hold: true },
    );
    return { order, bar };
  }

  it("should show no bar over a load done within 300 ms: evict, then create at once", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    const { order, bar } = enterWithBar(art, SCENE_ART.HubScene);

    vi.advanceTimersByTime(250);
    art.finish();
    vi.runAllTimers();

    expect(bar.shown()).toBe(0);
    expect(order).toEqual([
      "250 evicted art:boss-0",
      "250 evicted art:boss-1",
      "250 evicted art:boss-2",
      "250 evicted art:creatures-0",
      "250 evicted art:creatures-1",
      "250 create",
    ]);
  });

  it("should show the bar at 300 ms, evict on the load's completion under it, and create once it is down", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    const { order } = enterWithBar(art, SCENE_ART.HubScene);

    vi.advanceTimersByTime(400);
    art.finish();
    vi.runAllTimers();

    expect(order).toEqual([
      "300 bar shown",
      "400 evicted art:boss-0",
      "400 evicted art:boss-1",
      "400 evicted art:boss-2",
      "400 evicted art:creatures-0",
      "400 evicted art:creatures-1",
      "1050 bar destroyed",
      "1050 create",
    ]);
  });

  it("should keep the scene LOADING while the bar is up after the load, and RUNNING from its create", () => {
    const art = after(SCENE_ART.BarrowspireScene);
    enterWithBar(art, SCENE_ART.HubScene);

    vi.advanceTimersByTime(400);
    art.finish();
    vi.advanceTimersByTime(500);
    const behindTheBar = art.status();
    vi.runAllTimers();

    expect(behindTheBar).toBe(3);
    expect(art.status()).toBe(5);
  });

  it("should fill the bar from the loader's progress, starting from what loaded before it showed", () => {
    const art = after(SCENE_ART.HubScene);
    const { bar } = enterWithBar(art, SCENE_ART.BarrowspireScene);

    vi.advanceTimersByTime(300);
    art.finish();

    // five pages: the creatures' two and the boss's three
    expect(bar.progress.map((p) => Math.round(p * 100) / 100)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("should show no bar when the scene queued nothing", () => {
    const art = after(SCENE_ART.HubScene);

    const { order, bar } = enterWithBar(art, SCENE_ART.HubScene);
    vi.runAllTimers();

    expect(bar.shown()).toBe(0);
    expect(order).toEqual(["0 create"]);
  });

  it("should pace a load of the manifest alone as any other", () => {
    const art = artLoaderStandin({ manifest, textures: [...resident, ...pages("folk-0")] });
    const { order } = enterWithBar(art, SCENE_ART.HubScene);

    vi.advanceTimersByTime(1200);
    art.finish();
    vi.runAllTimers();

    expect(order).toEqual(["300 bar shown", "1350 bar destroyed", "1350 create"]);
  });

  describe("the camera's fades (A1.4, A1.5)", () => {
    const soot = "18, 18, 18";

    it("should fade a world in from the soot as its create runs, with no bar, and reset the fade once done", () => {
      const art = after(SCENE_ART.BarrowspireScene);
      enterWithBar(art, SCENE_ART.HubScene, { fadeIn: true });

      vi.advanceTimersByTime(100);
      art.finish();
      vi.runAllTimers();

      expect(art.camera.fades).toEqual([`fadeIn(200, ${soot})`, "reset"]);
    });

    it("should fade a world in when it queued nothing", () => {
      const art = after(SCENE_ART.HubScene);
      enterWithBar(art, SCENE_ART.HubScene, { fadeIn: true });
      vi.runAllTimers();

      expect(art.camera.fades).toEqual([`fadeIn(200, ${soot})`, "reset"]);
    });

    it("should not fade a menu that queued nothing or loaded within the delay", () => {
      const quick = after(SCENE_ART.HubScene);
      enterWithBar(quick, SCENE_ART.MainMenuScene);
      vi.advanceTimersByTime(100);
      quick.finish();
      vi.runAllTimers();

      expect(quick.camera.fades).toEqual([]);
    });

    it("should fade the bar in and out, then the scene in, a world's or a menu's", () => {
      for (const fadeIn of [true, false]) {
        const art = after(SCENE_ART.BarrowspireScene);
        enterWithBar(art, SCENE_ART.HubScene, { fadeIn });

        vi.advanceTimersByTime(400);
        art.finish();
        vi.runAllTimers();

        expect(art.camera.fades).toEqual([
          `fadeIn(150, ${soot})`,
          "reset",
          `fadeOut(150, ${soot})`,
          `fadeIn(200, ${soot})`,
          "reset",
        ]);
      }
    });
  });

  describe("a stop while paced (A1.8)", () => {
    it.each([
      ["during the delay", 100, false],
      ["while the bar is up and the load runs", 500, false],
      ["while the bar waits out its 600 ms after the load", 500, true],
      ["during the bar's fade-out", 950, true],
    ])("should never create, and leave no timer, when the scene stops %s", (_when, stopAt, loadedFirst) => {
      const art = after(SCENE_ART.BarrowspireScene);
      const { order } = enterWithBar(art, SCENE_ART.HubScene);
      if (loadedFirst) {
        vi.advanceTimersByTime(400);
        art.finish();
      }
      vi.advanceTimersByTime(stopAt - Date.now());

      art.stop();
      art.finish();
      // the camera's own fade timers in the stand-in stand for Phaser's, which go with the camera
      vi.runAllTimers();

      expect(order.filter((o) => o.endsWith("create") || o.endsWith("bar destroyed"))).toEqual([]);
      expect(art.status()).toBe(8);
    });

    it("should cancel its own clock events on a stop", () => {
      const art = after(SCENE_ART.BarrowspireScene);
      const removed: number[] = [];
      const delayedCall = art.scene.time.delayedCall;
      art.scene.time.delayedCall = (ms: number, step: () => void) => {
        const event = delayedCall(ms, step);
        return { remove: (dispatch?: boolean) => (removed.push(ms), event.remove(dispatch)) };
      };
      enterWithBar(art, SCENE_ART.HubScene);
      vi.advanceTimersByTime(500);

      art.stop();

      expect(removed).toEqual([600]);
    });

    it("should ask the clock nothing on a game destroy, and never create", () => {
      const art = after(SCENE_ART.BarrowspireScene);
      const removed: number[] = [];
      const delayedCall = art.scene.time.delayedCall;
      art.scene.time.delayedCall = (ms: number, step: () => void) => {
        delayedCall(ms, step);
        return { remove: () => void removed.push(ms) };
      };
      const { order } = enterWithBar(art, SCENE_ART.HubScene);
      vi.advanceTimersByTime(500);

      art.scene.events.emit("destroy");
      art.finish();
      vi.runAllTimers();

      expect(removed).toEqual([]);
      expect(order.filter((o) => o.endsWith("create"))).toEqual([]);
    });
  });
});

// A stop resets the loader, but Phaser 4.2.1 aborts nothing: a download in flight still lands and
// adds itself to the texture manager (LoaderPlugin.reset clears its Sets only; File.onLoad →
// nextFile → onProcess → fileProcessComplete → addToCache). FS-C4JWH Edge States.
describe("downloads a stopped scene left in flight (FS-C4JWH Edge States: a world switch mid-download)", () => {
  /** The run started from the hub, held mid-download, then stopped. */
  function runStoppedMidLoad() {
    const art = after(SCENE_ART.HubScene);
    art.boot(
      { preload: () => preloadArt(art.scene as unknown as Phaser.Scene, SCENE_ART.BarrowspireScene) },
      undefined,
      { hold: true },
    );
    art.stop();
    return art;
  }

  it("should not let the run's creatures and boss land after the hub has loaded", () => {
    const art = runStoppedMidLoad();
    const seen = enter(art, SCENE_ART.HubScene);

    art.landStrays();

    expect(seen.textures).toEqual(artKeys([...resident, ...pages("folk-0")]));
    expect(artKeys(art.textures.getTextureKeys())).toEqual(artKeys([...resident, ...pages("folk-0")]));
    expect(art.consoleErrors).toEqual([]);
  });

  it("should load each page once, with no error, when the next scene wants the same pages", () => {
    const art = runStoppedMidLoad();
    art.boot(
      { preload: () => preloadArt(art.scene as unknown as Phaser.Scene, SCENE_ART.BarrowspireScene) },
      undefined,
      { hold: true },
    );

    art.landStrays();
    art.finish();

    expect(artKeys(art.textures.getTextureKeys())).toEqual(
      artKeys([...resident, ...pages("creatures-0", "creatures-1", "boss-0", "boss-1", "boss-2")]),
    );
    expect(art.consoleErrors).toEqual([]);
  });

  it("should keep a page whose download was in and still decoding from landing: its completion is taken away", () => {
    const art = after(SCENE_ART.HubScene);
    art.boot(
      { preload: () => preloadArt(art.scene as unknown as Phaser.Scene, SCENE_ART.BarrowspireScene) },
      undefined,
      { hold: true },
    );
    art.decoding("art:boss-1");

    art.stop();
    const seen = enter(art, SCENE_ART.HubScene);
    art.landStrays();

    expect(art.textures.exists("art:boss-1")).toBe(false);
    expect(seen.textures).toEqual(artKeys([...resident, ...pages("folk-0")]));
    expect(art.consoleErrors).toEqual([]);
  });

  it("should still let a finished scene's own downloads in", () => {
    const art = after(SCENE_ART.HubScene);
    const seen = enter(art, SCENE_ART.BarrowspireScene);

    art.landStrays();

    expect(seen.textures).toEqual(artKeys([...resident, ...pages("creatures-0", "creatures-1", "boss-0", "boss-1", "boss-2")]));
    expect(art.consoleErrors).toEqual([]);
  });
});

// FS-VHGE7 §F R49: no new rule for the on-demand group, only the proof it is covered.
describe("the on-demand group is evicted as any scene-scoped one (FS-VHGE7 §F R49)", () => {
  /** A run that has met a blood demon: the group fetched and registered on its loader. */
  const runWithBlood = () => {
    const art = after(SCENE_ART.BarrowspireScene);
    const library = registerArt(art.scene as unknown as ArtScene, SCENE_ART.BarrowspireScene, { warn: vi.fn() });
    onDemandArt(art.scene as unknown as Phaser.Scene, library).fetch("blood_demon", vi.fn());
    return art;
  };
  const blood = pages(...groupPages("blood_demon"));

  it("should have the group's pages and animations while the run holds them", () => {
    const art = runWithBlood();
    expect(blood.length).toBeGreaterThan(0);
    for (const key of blood) expect(art.textures.exists(key)).toBe(true);
    expect(art.anims.list.has("creature_blood_demon_base/idle/0")).toBe(true);
  });

  it("should free the group and its animations with the next scene's completed preload", () => {
    const art = runWithBlood();

    const seen = enter(art, SCENE_ART.HubScene);

    expect(seen.textures).toEqual(artKeys([...resident, ...pages("folk-0")]));
    for (const key of blood) expect(art.textures.exists(key)).toBe(false);
    for (const key of sheetAnims("creature_blood_demon_base")) expect(art.anims.list.has(key)).toBe(false);
  });

  it("should load the run's own set afresh, without the group, on a later run", () => {
    const art = runWithBlood();
    enter(art, SCENE_ART.HubScene);
    enter(art, SCENE_ART.BarrowspireScene);
    for (const key of blood) expect(art.textures.exists(key)).toBe(false);
  });
});
