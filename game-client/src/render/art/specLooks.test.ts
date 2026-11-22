import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { artLoaderStandin } from "./artLoader.standin";
import { CharacterAnimator, type AnimatedSprite } from "./character";
import { PLACEHOLDER_TEXTURE, atlasTextureKey, type ArtLibrary } from "./library";
import type { ArtAnimation } from "./manifest";
import { onDemandArt, registerArt, type ArtScene } from "./phaser";
import { SCENE_ART } from "./sceneArt";
import { SpecLooks, containedBodies, withOwnLook, type LookBodies, type Wearer } from "./specLooks";

/** An 8-way clip of `count` frames, on `atlas` when given. */
const clip = (count: number, loop: boolean, atlas?: string): ArtAnimation => ({
  fps: 10,
  loop,
  ...(atlas ? { atlas } : {}),
  frames: Array.from({ length: 8 }, (_, d) => Array.from({ length: count }, (_, i) => ({ x: i * 10, y: d * 10 }))),
});

/** A class sheet's four clips on `atlas`, the idle on `idleAtlas` (a sheet spilled over two pages). */
const classSheet = (atlas: string, idleAtlas = atlas) => ({
  atlas,
  frameWidth: 267,
  frameHeight: 240,
  scale: 1.5,
  anchor: { x: 0.45, y: 0.74 },
  directions: 8,
  animations: {
    idle: clip(6, true, idleAtlas),
    walk: clip(8, true),
    attack: clip(6, false),
    death: clip(7, false),
  },
  crown: 83,
  source: "procedural",
  licence: "Barrowspire-original",
});

const page = (image: string) => ({ image, width: 1024, height: 1024, sha256: "a".repeat(64) });

/**
 * The class sheets resident, and the Berserker's and the Spellwarden's looks baked, each alone in
 * its own group as feat/spec-looks bakes them (FS-1J1CB R15): the Berserker's spilling to a second
 * page. The Guardian's look is not baked.
 */
const manifest = {
  version: 1,
  tile: { width: 64, height: 32 },
  facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
  atlases: {
    "knight-0": page("knight-0.png"),
    "wizard-0": page("wizard-0.png"),
    "folk-0": page("folk-0.png"),
    "knight_berserker-0": page("knight_berserker-0.png"),
    "knight_berserker-1": page("knight_berserker-1.png"),
    "wizard_spellwarden-0": page("wizard_spellwarden-0.png"),
  },
  sheets: {
    char_knight_base: classSheet("knight-0"),
    char_wizard_base: classSheet("wizard-0"),
    char_knight_berserker: classSheet("knight_berserker-0", "knight_berserker-1"),
    char_wizard_spellwarden: classSheet("wizard_spellwarden-0"),
  },
};

const RESIDENT = ["knight-0", "wizard-0", "folk-0"].map(atlasTextureKey);
const BERSERKER = ["knight_berserker-0", "knight_berserker-1"].map(atlasTextureKey);
const SPELLWARDEN = [atlasTextureKey("wizard_spellwarden-0")];

/** Records what a sprite was told; `play` behaves like Phaser's for the fields used. */
function fakeSprite() {
  const frames = Array.from({ length: 8 }, (_, i) => ({ i }));
  const sprite = {
    texture: "",
    frame: undefined as string | number | undefined,
    plays: [] as { key: string; startFrame?: number }[],
    anims: {
      currentAnim: null as { key: string; frames: unknown[] } | null,
      currentFrame: null as unknown,
      timeScale: 1,
    },
    setTexture(key: string, frame?: string | number) {
      sprite.texture = key;
      sprite.frame = frame;
    },
    setOrigin() {},
    setScale() {},
    play(config: string | { key: string; startFrame?: number }) {
      const c = typeof config === "string" ? { key: config } : config;
      sprite.plays.push(c);
      sprite.anims.currentAnim = { key: c.key, frames };
      sprite.anims.currentFrame = frames[c.startFrame ?? 0];
    },
  };
  return sprite satisfies AnimatedSprite;
}

type Body = { anim: CharacterAnimator; sprite: ReturnType<typeof fakeSprite> };

/**
 * A running world: its art registered, its on-demand loads held open until `finish()`, and its
 * player bodies drawn as a scene draws them, from {@link SpecLooks.look}.
 */
function world(opts: { failing?: string[]; textures?: string[]; held?: readonly string[] } = {}) {
  const warn = vi.fn();
  const art = artLoaderStandin({
    manifest,
    cachedManifest: true,
    textures: [...RESIDENT, ...(opts.textures ?? [])],
    failing: opts.failing,
    hold: true,
  });
  const groups = [...SCENE_ART.HubScene, ...(opts.held ?? [])];
  const library: ArtLibrary = registerArt(art.scene as unknown as ArtScene, groups, { warn });
  const demand = onDemandArt(art.scene as unknown as Phaser.Scene, library, { warn });
  const drawn = new Map<string, Body>();
  const worn: [string, CharacterAnimator][] = [];
  const bodies: LookBodies = {
    body: (id) => drawn.get(id),
    wear: (id, anim) => {
      worn.push([id, anim]);
      const body = drawn.get(id);
      if (body) body.anim = anim;
    },
  };
  const looks = new SpecLooks(library, demand, bodies, opts.held);

  /** One snapshot's entry for `id`: a new body is drawn in its look now, then seen, as scenes do. */
  const see = (id: string, who: Wearer) => {
    if (!drawn.has(id)) {
      const anim = new CharacterAnimator(library, looks.look(who));
      const sprite = fakeSprite();
      anim.dress(sprite);
      drawn.set(id, { anim, sprite });
    }
    looks.see(id, who);
  };
  /** One frame for every body, standing. */
  const frame = (t: number) => {
    for (const { anim, sprite } of drawn.values()) anim.show(sprite, anim.step({ x: 0, y: 0 }, t, 16, false));
  };
  return { art, library, looks, see, frame, drawn, worn, warn };
}

const berserker = { class: "warrior", specialization: "berserker" };

describe("SpecLooks (FS-1J1CB §C)", () => {
  it("should draw another player's Berserker as the knight until the look lands, then the look on the same sprite (R19, R21)", () => {
    const w = world();
    w.see("rival", berserker);
    w.frame(0);
    const body = w.drawn.get("rival")!;
    const sprite = body.sprite;
    expect(body.anim.sheet).toBe("char_knight_base");
    expect(sprite.plays.at(-1)?.key).toBe("char_knight_base/idle/1");
    expect(w.art.queued).toEqual(BERSERKER);

    w.art.finish();

    expect(w.drawn.get("rival")!.sprite).toBe(sprite);
    expect(w.drawn.get("rival")!.anim.sheet).toBe("char_knight_berserker");
    expect(sprite.plays.at(-1)?.key).toBe("char_knight_berserker/idle/1");
    expect(sprite.texture).toBe(atlasTextureKey("knight_berserker-1"));
    expect(w.warn).not.toHaveBeenCalled();
  });

  it("should never draw the placeholder, nor warn of one, while a look downloads (R21)", () => {
    const w = world();
    w.see("rival", berserker);
    for (let t = 0; t < 100; t += 16) {
      w.see("rival", berserker);
      w.frame(t);
    }
    const { sprite } = w.drawn.get("rival")!;
    expect(sprite.texture).toBe(atlasTextureKey("knight-0"));
    expect(sprite.texture).not.toBe(PLACEHOLDER_TEXTURE);
    expect(w.warn).not.toHaveBeenCalled();
  });

  it("should fetch nothing for a state with no specialized player (R18)", () => {
    const w = world();
    w.see("me", { class: "warrior" });
    w.see("rival", { class: "mage", specialization: undefined });
    w.frame(0);
    expect(w.art.queued).toEqual([]);
    expect(w.worn).toEqual([]);
  });

  it("should fetch nothing for a spec it does not know, one of another class, or a look not baked (R16)", () => {
    const w = world();
    w.see("a", { class: "warrior", specialization: "warlock" });
    w.see("b", { class: "warrior", specialization: "spellwarden" });
    w.see("c", { class: "warrior", specialization: "guardian" });
    expect(w.art.queued).toEqual([]);
    for (const id of ["a", "b", "c"]) expect(w.drawn.get(id)!.anim.sheet).toBe("char_knight_base");
  });

  it("should fetch a look two players wear once, and re-dress both when it lands (R19)", () => {
    const w = world();
    w.see("a", berserker);
    w.see("b", berserker);
    w.see("a", berserker);
    w.frame(0);
    expect(w.art.queued).toEqual(BERSERKER);
    w.art.finish();
    expect(w.worn.map(([id]) => id).sort()).toEqual(["a", "b"]);
    for (const id of ["a", "b"]) expect(w.drawn.get(id)!.anim.sheet).toBe("char_knight_berserker");
  });

  it("should fetch each look seen, the Spellwarden beside the Berserker, and dress each in its own", () => {
    const w = world();
    w.see("a", berserker);
    w.see("b", { class: "mage", specialization: "spellwarden" });
    expect(w.art.queued).toEqual([...BERSERKER, ...SPELLWARDEN]);
    w.art.finish();
    expect(w.drawn.get("a")!.anim.sheet).toBe("char_knight_berserker");
    expect(w.drawn.get("b")!.anim.sheet).toBe("char_wizard_spellwarden");
  });

  it("should leave the base look on a failed page, warn once, and not retry in this scene (R24)", () => {
    const w = world({ failing: [BERSERKER[1]] });
    w.see("rival", berserker);
    w.frame(0);
    w.art.finish();
    for (let t = 16; t < 100; t += 16) {
      w.see("rival", berserker);
      w.see(`new-${t}`, berserker);
      w.frame(t);
    }
    expect(w.art.queued).toEqual(BERSERKER);
    expect(w.warn).toHaveBeenCalledOnce();
    expect(w.worn).toEqual([]);
    expect(w.drawn.get("rival")!.anim.sheet).toBe("char_knight_base");
    expect(w.drawn.get("rival")!.sprite.texture).not.toBe(PLACEHOLDER_TEXTURE);
  });

  it("should re-dress a body whose specialization first appears mid-scene, once its look is in (R22)", () => {
    const w = world();
    w.see("me", { class: "warrior" });
    w.frame(0);
    w.see("me", berserker);
    expect(w.drawn.get("me")!.anim.sheet).toBe("char_knight_base");
    w.art.finish();
    expect(w.drawn.get("me")!.anim.sheet).toBe("char_knight_berserker");
  });

  it("should re-dress a mid-scene pick at once when another body's look already brought it in (R22)", () => {
    const w = world();
    w.see("rival", berserker);
    w.art.finish();
    w.see("me", { class: "warrior" });
    w.frame(0);
    w.see("me", berserker);
    expect(w.drawn.get("me")!.anim.sheet).toBe("char_knight_berserker");
    expect(w.art.queued).toEqual(BERSERKER);
  });

  it("should not re-dress a body gone before its look lands", () => {
    const w = world();
    w.see("rival", berserker);
    w.looks.forget("rival");
    w.drawn.delete("rival");
    w.art.finish();
    expect(w.worn).toEqual([]);
  });

  it("should draw the player's own preloaded look from the first frame, and fetch it no more (R20)", () => {
    const w = world({ textures: BERSERKER, held: ["knight_berserker"] });
    w.see("me", berserker);
    w.frame(0);
    expect(w.drawn.get("me")!.anim.sheet).toBe("char_knight_berserker");
    expect(w.drawn.get("me")!.sprite.plays.at(-1)?.key).toBe("char_knight_berserker/idle/1");
    expect(w.art.queued).toEqual([]);
    expect(w.worn).toEqual([]);
  });

  it("should not fetch again a preloaded look whose page failed: its base stays (R20, R24)", () => {
    const w = world({ held: ["knight_berserker"] });
    w.warn.mockClear();
    w.see("me", berserker);
    expect(w.art.queued).toEqual([]);
    expect(w.drawn.get("me")!.anim.sheet).toBe("char_knight_base");
  });
});

describe("withOwnLook (FS-1J1CB R20, ADR-0088 Decision 3)", () => {
  it("should add the selected character's look group to the world's set", () => {
    expect(withOwnLook(SCENE_ART.HubScene, { className: "archer", specialization: "hunter" })).toEqual([
      "folk",
      "archer_hunter",
    ]);
    expect(withOwnLook(SCENE_ART.BarrowspireScene, { className: "warrior", specialization: "berserker" })).toEqual([
      "creatures",
      "boss",
      "knight_berserker",
    ]);
  });

  it("should leave the set as it is with no character, no spec, or a spec it does not know", () => {
    expect(withOwnLook(SCENE_ART.HubScene, null)).toBe(SCENE_ART.HubScene);
    expect(withOwnLook(SCENE_ART.HubScene, { className: "archer" })).toBe(SCENE_ART.HubScene);
    expect(withOwnLook(SCENE_ART.HubScene, { className: "archer", specialization: "berserker" })).toBe(
      SCENE_ART.HubScene,
    );
  });
});

describe("containedBodies (the town's and the fields' views)", () => {
  const view = (anim: CharacterAnimator, body: AnimatedSprite | null) => ({
    sprite: { getByName: (name: string) => (name === "body" ? body : null) },
    anim,
  });

  it("should find a view's body sprite by its name, and keep a re-dress as the view's animator", () => {
    const w = world();
    const first = new CharacterAnimator(w.library, "warrior");
    const next = new CharacterAnimator(w.library, "mage");
    const sprite = fakeSprite();
    const views = new Map([["a", view(first, sprite)], ["b", view(first, null)]]);
    const bodies = containedBodies(views);

    expect(bodies.body("a")).toEqual({ anim: first, sprite });
    expect(bodies.body("b")).toBeUndefined();
    expect(bodies.body("gone")).toBeUndefined();
    bodies.wear("a", next);
    bodies.wear("gone", next);
    expect(views.get("a")!.anim).toBe(next);
  });
});
