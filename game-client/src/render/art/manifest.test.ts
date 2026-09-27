import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DIRECTION_ORDER, directionIndex, validateManifest } from "./manifest";

/** A minimal manifest that satisfies every rule. Each case below breaks one. */
function fixture() {
  return {
    version: 1,
    tile: { width: 64, height: 32 },
    facings: ["e", "se", "s", "sw", "w", "nw", "n", "ne"],
    atlases: {
      "props-0": {
        image: "props-0.png",
        width: 256,
        height: 128,
        sha256: "a".repeat(64),
      },
    },
    sheets: {
      brazier: {
        atlas: "props-0",
        frameWidth: 40,
        frameHeight: 60,
        anchor: { x: 0.5, y: 0.8 },
        directions: 1,
        animations: {
          default: { fps: 0, loop: false, frames: [[{ x: 0, y: 0 }]] },
        },
        light: {
          offset: { x: 0, y: -40 },
          radius: 180,
          color: "amber",
          flicker: 0.6,
        },
        source: "procedural: tools/bake/page/models/props.js#brazier",
        licence: "Barrowspire-original",
      },
      door: {
        atlas: "props-0",
        frameWidth: 50,
        frameHeight: 70,
        anchor: { x: 0.5, y: 0.9 },
        directions: 1,
        animations: {
          locked: { fps: 0, loop: false, frames: [[{ x: 40, y: 0 }]] },
          open: { fps: 0, loop: false, frames: [[{ x: 90, y: 0 }]] },
        },
        source: "procedural: tools/bake/page/models/interactables.js#door",
        licence: "Barrowspire-original",
      },
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function rejects(mutate: (m: Fixture) => void, expected: RegExp) {
  const m = fixture();
  mutate(m);
  const result = validateManifest(m);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join("\n")).toMatch(expected);
}

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const result = validateManifest(fixture());
    expect(result).toEqual({ ok: true, manifest: fixture() });
  });

  it("rejects a sheet missing its anchor", () => {
    rejects((m) => {
      delete (m.sheets.brazier as Partial<Fixture["sheets"]["brazier"]>).anchor;
    }, /brazier.*anchor/);
  });

  it("rejects an anchor outside the frame", () => {
    rejects((m) => {
      m.sheets.brazier.anchor.y = 1.4;
    }, /brazier.*anchor/);
  });

  it("rejects a sheet missing its frame size", () => {
    rejects((m) => {
      delete (m.sheets.door as Partial<Fixture["sheets"]["door"]>).frameWidth;
    }, /door.*frameWidth/);
  });

  it("rejects a direction count other than 1 or 8", () => {
    rejects((m) => {
      (m.sheets.door as { directions: number }).directions = 4;
    }, /door.*directions/);
  });

  it("rejects an animation whose frame lists do not match the direction count", () => {
    rejects((m) => {
      (m.sheets.door as { directions: number }).directions = 8;
    }, /door.*locked.*8 directions/);
  });

  it("rejects an animation with no frames", () => {
    rejects((m) => {
      m.sheets.door.animations.open.frames = [[]];
    }, /door.*open.*frame count/);
  });

  it("rejects a sheet with no animations", () => {
    rejects((m) => {
      (m.sheets.door as { animations: object }).animations = {};
    }, /door.*animations/);
  });

  it("rejects a frame that falls outside its atlas", () => {
    rejects((m) => {
      m.sheets.door.animations.open.frames = [[{ x: 230, y: 0 }]];
    }, /door.*open.*outside atlas/);
  });

  it("rejects a sheet that names an unknown atlas", () => {
    rejects((m) => {
      m.sheets.door.atlas = "missing-0";
    }, /door.*atlas/);
  });

  it("rejects a light colour that is not a BARROW token (ADR-0013)", () => {
    rejects((m) => {
      m.sheets.brazier.light.color = "orange";
    }, /brazier.*light.*color/);
  });

  it("rejects a light with a non-positive radius", () => {
    rejects((m) => {
      m.sheets.brazier.light.radius = 0;
    }, /brazier.*light.*radius/);
  });

  it("rejects a light flicker outside 0..1", () => {
    rejects((m) => {
      m.sheets.brazier.light.flicker = 2;
    }, /brazier.*light.*flicker/);
  });

  it("rejects a sheet without a source", () => {
    rejects((m) => {
      m.sheets.door.source = "";
    }, /door.*source/);
  });

  it("rejects a sheet without a licence", () => {
    rejects((m) => {
      delete (m.sheets.brazier as Partial<Fixture["sheets"]["brazier"]>)
        .licence;
    }, /brazier.*licence/);
  });

  it("rejects an atlas larger than 4096²", () => {
    rejects((m) => {
      m.atlases["props-0"].width = 8192;
    }, /props-0.*4096/);
  });

  it("rejects an unknown manifest version", () => {
    rejects((m) => {
      (m as { version: number }).version = 2;
    }, /version/);
  });

  it("rejects a manifest that does not record its direction order", () => {
    rejects((m) => {
      delete (m as Partial<Fixture>).facings;
    }, /facings/);
  });

  it("rejects a direction order other than the one the client reads", () => {
    rejects((m) => {
      m.facings = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
    }, /facings/);
  });

  it("rejects something that is not a manifest at all", () => {
    const result = validateManifest("<html>404</html>");
    expect(result.ok).toBe(false);
  });
});

describe("direction order", () => {
  it("is the world compass, clockwise from east, as Facing8 names it", () => {
    expect(DIRECTION_ORDER).toEqual([
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
      "n",
      "ne",
    ]);
  });

  it("maps a facing to its frame list index", () => {
    expect(directionIndex("e")).toBe(0);
    expect(directionIndex("se")).toBe(1);
    expect(directionIndex("n")).toBe(6);
    expect(directionIndex("ne")).toBe(7);
  });
});

describe("the baked manifest (public/art/manifest.json)", () => {
  const baked = JSON.parse(
    readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
  );

  it("passes the validator", () => {
    const result = validateManifest(baked);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("records the 64x32 tile the projection uses", () => {
    expect(baked.tile).toEqual({ width: 64, height: 32 });
  });

  it("carries every interactable state the scenes swap between", () => {
    const states = (name: string) => Object.keys(baked.sheets[name].animations);
    for (const axis of ["x", "y"]) {
      expect(states(`door_${axis}`)).toEqual(["locked", "unlocked", "open"]);
      expect(states(`escape_door_${axis}`)).toEqual([
        "locked",
        "unlocked",
        "open",
      ]);
    }
    expect(states("switch")).toEqual(["inactive", "active"]);
    expect(states("chest")).toEqual(["closed", "open"]);
  });

  it("has a generic fallback icon", () => {
    expect(baked.sheets.icon_generic).toBeDefined();
  });

  it("declares a light on each lit prop", () => {
    for (const name of [
      "brazier",
      "lamp_post",
      "wall_back_torch_x",
      "wall_back_window_y",
    ])
      expect(baked.sheets[name].light).toBeDefined();
  });

  it("records the direction order its 8-way sheets were baked in", () => {
    expect(baked.facings).toEqual([...DIRECTION_ORDER]);
  });

  describe("characters and creatures (FS-2325V §E)", () => {
    const CAST = [
      "char_knight_base",
      "char_archer_base",
      "char_wizard_base",
      "creature_ghoul_base",
      "creature_troll_base",
    ];

    it.each(CAST)("%s has 8-way idle, walk, attack and death", (name) => {
      const sheet = baked.sheets[name];
      expect(sheet, name).toBeDefined();
      expect(sheet.directions).toBe(8);
      expect(Object.keys(sheet.animations)).toEqual([
        "idle",
        "walk",
        "attack",
        "death",
      ]);
      for (const anim of Object.values(sheet.animations) as {
        frames: unknown[][];
      }[]) {
        expect(anim.frames).toHaveLength(8);
        expect(anim.frames[0].length).toBeGreaterThan(1);
      }
    });

    it.each(CAST)(
      "%s is authored in code, under the project's licence",
      (name) => {
        const sheet = baked.sheets[name];
        expect(sheet.source).toMatch(/^authored: tools\/bake\/page\//);
        expect(sheet.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it("loops idle and walk, and plays attack and death once", () => {
      for (const name of CAST) {
        const a = baked.sheets[name].animations;
        expect([a.idle.loop, a.walk.loop, a.attack.loop, a.death.loop]).toEqual(
          [true, true, false, false],
        );
      }
    });
  });
});
