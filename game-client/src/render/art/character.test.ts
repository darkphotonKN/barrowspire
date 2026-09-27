import { describe, expect, it } from "vitest";
import { CharacterAnimator, CharacterMotion, type AnimatedSprite } from "./character";
import { ArtLibrary } from "./library";
import type { ArtAnimation, ArtManifest } from "./manifest";

const quiet = { warn: () => {} };

/** An 8-way clip of `count` frames at `fps`. */
const clip = (fps: number, loop: boolean, count: number): ArtAnimation => ({
  fps,
  loop,
  frames: Array.from({ length: 8 }, (_, d) =>
    Array.from({ length: count }, (_, i) => ({ x: i * 10, y: d * 10 })),
  ),
});

function manifest(): ArtManifest {
  return {
    version: 1,
    tile: { width: 64, height: 32 },
    facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
    atlases: {
      "characters-0": {
        image: "characters-0.png",
        width: 1024,
        height: 1024,
        sha256: "a".repeat(64),
      },
    },
    sheets: {
      char_knight_base: {
        atlas: "characters-0",
        frameWidth: 160,
        frameHeight: 146,
        anchor: { x: 0.45, y: 0.74 },
        directions: 8,
        animations: {
          idle: clip(5, true, 6),
          walk: clip(10, true, 8),
          attack: clip(12, false, 6), // 500 ms
          death: clip(9, false, 7),
        },
        source: "authored: tools/bake/page/characters/cast.js#knight",
        licence: "Barrowspire-original",
      },
    },
  };
}

/** Records what a sprite was told; `play` behaves like Phaser's for the fields used. */
function fakeSprite() {
  const frames = Array.from({ length: 8 }, (_, i) => ({ i }));
  const sprite = {
    texture: "",
    frame: undefined as string | number | undefined,
    origin: { x: 0.5, y: 0.5 },
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
    setOrigin(x: number, y: number) {
      sprite.origin = { x, y };
    },
    play(config: string | { key: string; startFrame?: number }) {
      const c = typeof config === "string" ? { key: config } : config;
      sprite.plays.push(c);
      sprite.anims.currentAnim = { key: c.key, frames };
      sprite.anims.currentFrame = frames[c.startFrame ?? 0];
    },
    /** Advances the current clip to frame `i`, as playback would. */
    at(i: number) {
      sprite.anims.currentFrame = frames[i];
    },
  };
  return sprite satisfies AnimatedSprite;
}

const FRAME = 1000 / 60;

/** Walks `motion` along `v` (world px/s) for `ms`, one 60 fps frame at a time. */
function walk(motion: CharacterMotion, v: { x: number; y: number }, ms: number, from = 0) {
  const pos = { x: 0, y: 0 };
  let choice = motion.step(pos, from, FRAME, false);
  for (let t = FRAME; t <= ms; t += FRAME) {
    pos.x += (v.x * FRAME) / 1000;
    pos.y += (v.y * FRAME) / 1000;
    choice = motion.step(pos, from + t, FRAME, false);
  }
  return choice;
}

describe("CharacterMotion", () => {
  it("should stand idle until the drawn position moves", () => {
    const motion = new CharacterMotion("sw");
    expect(motion.step({ x: 5, y: 5 }, 0, FRAME, false)).toMatchObject({
      animation: "idle",
      facing: "sw",
    });
  });

  it("should walk at the speed the body is drawn moving, facing that way", () => {
    const choice = walk(new CharacterMotion(), { x: 0, y: 200 }, 500);
    expect(choice.animation).toBe("walk");
    expect(choice.facing).toBe("s");
    expect(choice.timeScale).toBeCloseTo(200 / 74, 1);
  });

  it("should come to idle once the body stops, keeping its facing", () => {
    const motion = new CharacterMotion();
    walk(motion, { x: -200, y: 0 }, 300);
    let choice = motion.step({ x: -60, y: 0 }, 400, FRAME, false);
    for (let t = 400; t < 900; t += FRAME) choice = motion.step({ x: -60, y: 0 }, t, FRAME, false);
    expect(choice).toMatchObject({ animation: "idle", facing: "w" });
  });

  it("should attack toward the aim for the clip's length, then carry on", () => {
    const motion = new CharacterMotion("se", 500);
    motion.attack(1000, { x: 0, y: -40 });
    expect(motion.step({ x: 0, y: 0 }, 1000, FRAME, false)).toMatchObject({
      animation: "attack",
      facing: "n",
    });
    expect(motion.step({ x: 0, y: 0 }, 1499, FRAME, false).animation).toBe("attack");
    expect(motion.step({ x: 0, y: 0 }, 1500, FRAME, false)).toMatchObject({
      animation: "idle",
      facing: "n", // stays turned toward what it struck
    });
  });

  it("should not restart an attack already swinging", () => {
    const motion = new CharacterMotion("se", 500);
    motion.attack(1000, { x: 0, y: -40 });
    motion.attack(1300, { x: 40, y: 0 });
    expect(motion.step({ x: 0, y: 0 }, 1300, FRAME, false).facing).toBe("n");
    expect(motion.step({ x: 0, y: 0 }, 1500, FRAME, false).animation).toBe("idle");
  });

  it("should die facing where it fell, whatever it was doing", () => {
    const motion = new CharacterMotion();
    walk(motion, { x: 200, y: 0 }, 300);
    motion.attack(300, { x: 0, y: 40 });
    expect(motion.step({ x: 70, y: 0 }, 310, FRAME, true)).toMatchObject({
      animation: "death",
      facing: "e",
    });
  });
});

describe("CharacterAnimator", () => {
  const art = () => new ArtLibrary(manifest(), quiet);

  it("should be baked only when its class sheet is in the manifest", () => {
    expect(new CharacterAnimator(art(), "warrior").baked).toBe(true);
    expect(new CharacterAnimator(art(), "mage").baked).toBe(false);
    expect(new CharacterAnimator(ArtLibrary.empty(quiet), "warrior").baked).toBe(false);
  });

  it("should stand the sprite on its footprint by the sheet's anchor", () => {
    const sprite = fakeSprite();
    new CharacterAnimator(art(), "warrior", "s").dress(sprite);
    expect(sprite.origin).toEqual({ x: 0.45, y: 0.74 });
    expect(sprite.texture).toBe("art:characters-0");
    expect(sprite.frame).toBe("char_knight_base/idle/2/0");
  });

  it("should play the chosen clip in its direction at the chosen rate", () => {
    const sprite = fakeSprite();
    const anim = new CharacterAnimator(art(), "warrior");
    anim.show(sprite, { animation: "walk", facing: "e", direction: 0, timeScale: 2.7 });
    expect(sprite.plays).toEqual([{ key: "char_knight_base/walk/0", startFrame: 0 }]);
    expect(sprite.anims.timeScale).toBe(2.7);
  });

  it("should not replay a finished death: it holds the last frame", () => {
    const sprite = fakeSprite();
    const anim = new CharacterAnimator(art(), "warrior");
    const death = { animation: "death", facing: "w", direction: 4, timeScale: 1 } as const;
    anim.show(sprite, death);
    sprite.at(6);
    anim.show(sprite, death);
    anim.show(sprite, death);
    expect(sprite.plays).toHaveLength(1);
  });

  it("should keep a stride's place in the cycle when it turns", () => {
    const sprite = fakeSprite();
    const anim = new CharacterAnimator(art(), "warrior");
    anim.show(sprite, { animation: "walk", facing: "e", direction: 0, timeScale: 1 });
    sprite.at(5);
    anim.show(sprite, { animation: "walk", facing: "se", direction: 1, timeScale: 1 });
    expect(sprite.plays[1]).toEqual({ key: "char_knight_base/walk/1", startFrame: 5 });
  });

  it("should start an attack from its first frame, even mid-stride", () => {
    const sprite = fakeSprite();
    const anim = new CharacterAnimator(art(), "warrior");
    anim.show(sprite, { animation: "walk", facing: "e", direction: 0, timeScale: 1 });
    sprite.at(5);
    anim.show(sprite, { animation: "attack", facing: "e", direction: 0, timeScale: 1 });
    expect(sprite.plays[1]).toEqual({ key: "char_knight_base/attack/0", startFrame: 0 });
  });

  it("should time the attack window by the sheet's attack clip", () => {
    const anim = new CharacterAnimator(art(), "warrior");
    anim.attack(0);
    expect(anim.step({ x: 0, y: 0 }, 499, FRAME, false).animation).toBe("attack");
    expect(anim.step({ x: 0, y: 0 }, 500, FRAME, false).animation).toBe("idle");
  });
});
