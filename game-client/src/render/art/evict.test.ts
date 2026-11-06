import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { RESIDENT_ART_PAGES, artLoaderStandin, shippedManifest } from "./artLoader.standin";
import { atlasTextureKey } from "./library";
import { preloadArt, registerArt, type ArtScene } from "./phaser";
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
    const run = [...sheetAnims("creature_ghoul_base"), ...sheetAnims("creature_troll_base"), ...sheetAnims("creature_demon_base")];
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
    const art = after(SCENE_ART.HubScene, pages("creatures-0", "creatures-1", "boss-0", "boss-1"));

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
