import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { BARROW } from "@/utils/theme";
import { WORLD_PX_PER_TILE, projectedBounds, worldToScreen } from "@/render/iso/projection";
import {
  HUB_CAMERA_MARGIN,
  HUB_SIZE,
  HUB_SPIRE_FACADE,
  HUB_WASHING_LINE,
} from "@/render/world/hubKeepOut";
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
      ground_dirt: {
        atlas: "props-0",
        frameWidth: 64,
        frameHeight: 32,
        anchor: { x: 0.5, y: 0.5 },
        directions: 1,
        animations: {
          variants: { fps: 0, loop: false, frames: [[{ x: 0, y: 70 }]] },
        },
        mean: { r: 74, g: 58, b: 41 },
        source: "procedural: tools/bake/page/ground.js#dirt",
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

  describe("an animation on another page of an oversized sheet (FS-Q14EV §B.7)", () => {
    // the door's "open" animation spilled onto a second page of its group
    const spill = (m: Fixture) => {
      (m.atlases as Record<string, unknown>)["props-1"] = {
        image: "props-1.png",
        width: 64,
        height: 80,
        sha256: "b".repeat(64),
      };
      Object.assign(m.sheets.door.animations.open, { atlas: "props-1" });
      m.sheets.door.animations.open.frames = [[{ x: 2, y: 2 }]];
    };

    it("accepts an animation naming the page it sits on", () => {
      const m = fixture();
      spill(m);
      expect(validateManifest(m)).toEqual({ ok: true, manifest: m });
    });

    it("rejects an animation atlas that names no atlas in the manifest", () => {
      rejects((m) => {
        spill(m);
        Object.assign(m.sheets.door.animations.open, { atlas: "props-9" });
      }, /door.*open.*atlas/);
    });

    it("rejects an animation atlas that is not a name", () => {
      rejects((m) => {
        spill(m);
        Object.assign(m.sheets.door.animations.open, { atlas: 1 });
      }, /door.*open.*atlas/);
    });

    it("checks the animation's frames against its own page, not the sheet's", () => {
      // inside props-0 (256 wide) but outside props-1 (64 wide)
      rejects((m) => {
        spill(m);
        m.sheets.door.animations.open.frames = [[{ x: 100, y: 0 }]];
      }, /door.*open.*outside atlas props-1/);
    });
  });

  it("accepts a sheet without a mean colour: only ground sheets carry one", () => {
    const m = fixture();
    expect(m.sheets.door).not.toHaveProperty("mean");
    expect(validateManifest(m).ok).toBe(true);
  });

  it("rejects a mean colour channel outside 0..255", () => {
    rejects((m) => {
      m.sheets.ground_dirt.mean.g = 256;
    }, /ground_dirt.*mean/);
  });

  it("rejects a mean colour channel that is not an integer", () => {
    rejects((m) => {
      m.sheets.ground_dirt.mean.r = 12.5;
    }, /ground_dirt.*mean/);
  });

  it("rejects a mean colour missing a channel", () => {
    rejects((m) => {
      delete (m.sheets.ground_dirt.mean as { b?: number }).b;
    }, /ground_dirt.*mean/);
  });

  describe("a sheet's crown (head height, FS-2325V §C.9)", () => {
    // the door fixture: 70 px frame, anchor at 0.9, so the anchor sits 63 px down the frame
    const withCrown = (crown: unknown) => (m: Fixture) => {
      (m.sheets.door as { crown?: unknown }).crown = crown;
    };

    it("accepts a sheet without one: only characters and creatures carry it", () => {
      expect(fixture().sheets.door).not.toHaveProperty("crown");
      expect(validateManifest(fixture()).ok).toBe(true);
    });

    it("accepts a whole number of px up to the frame top above the anchor", () => {
      for (const crown of [1, 40, 63]) {
        const m = fixture();
        withCrown(crown)(m);
        expect(validateManifest(m).ok, String(crown)).toBe(true);
      }
    });

    it.each([0, -4, 12.5, "40"])("rejects a crown of %s", (crown) => {
      rejects(withCrown(crown), /door.*crown/);
    });

    it("rejects a crown above the frame's top", () => {
      rejects(withCrown(64), /door.*crown/);
    });
  });

  describe("a quadruped's body length (FS-X2F2H §H R61)", () => {
    // the door fixture: frames are 50 px wide
    const withLength = (length: unknown) => (m: Fixture) => {
      (m.sheets.door as { length?: unknown }).length = length;
    };

    it("accepts a sheet without one: only quadrupeds carry it", () => {
      expect(fixture().sheets.door).not.toHaveProperty("length");
      expect(validateManifest(fixture()).ok).toBe(true);
    });

    it("accepts a whole number of px up to the frame's width", () => {
      for (const length of [1, 30, 50]) {
        const m = fixture();
        withLength(length)(m);
        expect(validateManifest(m).ok, String(length)).toBe(true);
      }
    });

    it.each([0, -4, 12.5, "40", 51])("rejects a length of %s", (length) => {
      rejects(withLength(length), /door.*length/);
    });
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

  it("records the measured mean colour of every ground sheet, for lighting (FS-2325V §C.9)", () => {
    const ground = Object.keys(baked.sheets).filter((n) =>
      n.startsWith("ground_"),
    );
    expect(ground).toContain("ground_dirt");
    expect(ground).toContain("ground_grass");
    for (const name of ground)
      expect(baked.sheets[name].mean, name).toEqual({
        r: expect.any(Number),
        g: expect.any(Number),
        b: expect.any(Number),
      });
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

  it("keeps every atlas within 4096²", () => {
    for (const [key, atlas] of Object.entries(baked.atlases) as [
      string,
      { width: number; height: number },
    ][]) {
      expect(atlas.width, key).toBeLessThanOrEqual(4096);
      expect(atlas.height, key).toBeLessThanOrEqual(4096);
    }
  });

  describe("effect textures and cursors (FS-KYPQ9 §B.10, §H.2)", () => {
    type Sheet = {
      frameWidth: number;
      frameHeight: number;
      anchor: { x: number; y: number };
      directions: number;
      animations: Record<string, { frames: unknown[][] }>;
      source: string;
      licence: string;
    };
    const sheet = (name: string): Sheet => baked.sheets[name];

    // sheet → the authoring function in tools/bake/page/models/fx.js
    const FX: [string, string][] = [
      ["fx_slash", "slash"],
      ["fx_dust", "dust"],
      ["fx_ember", "ember"],
      ["fx_smoke", "smoke"],
      ["fx_fire_core", "fireCore"],
      ["fx_scorch", "scorch"],
      ["fx_glow", "glow"],
      ["fx_escape_column", "escapeColumn"],
      ["fx_arrow", "arrow"],
    ];
    const CURSORS: [string, string][] = [
      ["cursor_gauntlet", "gauntlet"],
      ["cursor_strike", "strikeMark"],
    ];

    const isSet = (s: Sheet) => {
      expect(Number.isInteger(s.frameWidth) && s.frameWidth > 0).toBe(true);
      expect(Number.isInteger(s.frameHeight) && s.frameHeight > 0).toBe(true);
      expect(s.anchor.x).toBeGreaterThanOrEqual(0);
      expect(s.anchor.x).toBeLessThanOrEqual(1);
      expect(s.anchor.y).toBeGreaterThanOrEqual(0);
      expect(s.anchor.y).toBeLessThanOrEqual(1);
      expect(s.directions).toBe(1);
      const anims = Object.values(s.animations);
      expect(anims.length).toBeGreaterThan(0);
      for (const a of anims) {
        expect(a.frames).toHaveLength(1);
        expect(a.frames[0].length).toBeGreaterThan(0);
      }
    };

    it.each(FX)(
      "%s is baked with its geometry set, authored in models/fx.js#%s",
      (name, fn) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        isSet(s);
        expect(s.source).toBe(`authored: tools/bake/page/models/fx.js#${fn}`);
        expect(s.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it.each(CURSORS)(
      "%s is a 32x32 cursor, authored in models/cursors.js#%s",
      (name, fn) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        isSet(s);
        expect([s.frameWidth, s.frameHeight]).toEqual([32, 32]);
        expect(s.source).toBe(
          `authored: tools/bake/page/models/cursors.js#${fn}`,
        );
        expect(s.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it("puts the gauntlet's hotspot on its fingertip, at the top left", () => {
      const { anchor } = sheet("cursor_gauntlet");
      expect(anchor.x).toBeLessThan(0.35);
      expect(anchor.y).toBeLessThan(0.15);
    });

    it("puts the strike-mark's hotspot at its centre", () => {
      expect(sheet("cursor_strike").anchor).toEqual({ x: 0.5, y: 0.5 });
    });

    it("keeps the effect textures and cursors on the fx atlas", () => {
      for (const [name] of [...FX, ...CURSORS])
        expect(baked.sheets[name].atlas, name).toMatch(/^fx-\d+$/);
    });
  });

  describe("hub town props and dressing (FS-KYPQ9 §A.1)", () => {
    type Sheet = {
      atlas: string;
      frameWidth: number;
      frameHeight: number;
      anchor: { x: number; y: number };
      directions: number;
      animations: Record<string, { frames: unknown[][] }>;
      light?: { color: string };
      source: string;
      licence: string;
    };
    const sheet = (name: string): Sheet => baked.sheets[name];

    // sheet → its authoring function in tools/bake/page/models/town.js, and its animations
    // with their frame counts (variants are picked by index in src/render/world/hubKeepOut.ts)
    const TOWN: [string, string, Record<string, number>][] = [
      ["market_stall", "marketStall", { variants: 3 }],
      ["cart", "cart", { default: 1 }],
      ["hay_cart", "hayCart", { default: 1 }],
      ["well", "well", { default: 1 }],
      ["crate", "crate", { default: 1 }],
      ["crate_stack", "crateStack", { default: 1 }],
      ["fence_x", "fenceSegment", { default: 1 }],
      ["fence_y", "fenceSegment", { default: 1 }],
      ["fence_post", "fencePost", { default: 1 }],
      ["water_trough", "waterTrough", { default: 1 }],
      ["woodpile", "woodpile", { default: 1 }],
      ["sacks", "sacks", { variants: 2 }],
      ["signpost", "signpost", { default: 1 }],
      ["washing_post", "washingPost", { default: 1 }],
      ["washing_line", "washingLine", { default: 1 }],
      ["flower_box", "flowerBox", { x: 1, y: 1 }],
      ["chimney", "chimney", { default: 1 }],
    ];

    it.each(TOWN)(
      "%s is baked, authored in models/town.js#%s, with its frames",
      (name, fn, frames) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        expect(Number.isInteger(s.frameWidth) && s.frameWidth > 0).toBe(true);
        expect(Number.isInteger(s.frameHeight) && s.frameHeight > 0).toBe(true);
        expect(s.anchor.x).toBeGreaterThan(0);
        expect(s.anchor.x).toBeLessThan(1);
        expect(s.anchor.y).toBeGreaterThan(0);
        expect(s.anchor.y).toBeLessThanOrEqual(1);
        expect(s.directions).toBe(1);
        expect(
          Object.fromEntries(
            Object.entries(s.animations).map(([a, v]) => [a, v.frames[0].length]),
          ),
        ).toEqual(frames);
        expect(s.source).toBe(`authored: tools/bake/page/models/town.js#${fn}`);
        expect(s.licence).toBe(baked.sheets.brazier.licence);
        expect(s.atlas, name).toMatch(/^town-\d+$/);
      },
    );

    it("bakes no light into dressing: the lit props are the reused lamp post and brazier", () => {
      for (const [name] of TOWN) expect(sheet(name).light, name).toBeUndefined();
      for (const name of ["lamp_post", "brazier"]) {
        const light = sheet(name).light;
        expect(light, name).toBeDefined();
        expect(Object.keys(BARROW)).toContain(light!.color);
      }
    });

    it("bakes the washing line to span its posts, 80 world px (two tiles) along world x", () => {
      // the posts as the hub places them, and the line hung at their midpoint
      const [west, east] = HUB_WASHING_LINE.posts;
      const { line } = HUB_WASHING_LINE;
      const span = east.at.x - west.at.x;
      expect(span).toBe(80);
      expect([west.at.y, east.at.y]).toEqual([line.at.y, line.at.y]);
      expect(line.at.x).toBe(west.at.x + span / 2);

      // the bake model hangs its rope from -LINE_HALF to +LINE_HALF tile edges about its origin
      const model = readFileSync(
        join(__dirname, "../../../tools/bake/page/models/town.js"),
        "utf8",
      );
      const half = Number(/const LINE_HALF = ([\d.]+);/.exec(model)?.[1]);
      expect(2 * half * WORLD_PX_PER_TILE).toBe(span);

      // projected, the rope's west end lies the posts' half-distance left of the anchor: the
      // frame's left edge, give or take its padding and the rope's knot (the shadow falls east)
      const s = sheet("washing_line");
      const anchorX = s.anchor.x * s.frameWidth;
      const halfOnScreen = worldToScreen(span / 2, 0);
      expect(halfOnScreen).toEqual({
        x: baked.tile.width / 2,
        y: baked.tile.height / 2,
      });
      expect(anchorX).toBeGreaterThanOrEqual(halfOnScreen.x);
      expect(anchorX).toBeLessThanOrEqual(halfOnScreen.x + 8);
      expect(s.frameWidth - anchorX).toBeGreaterThanOrEqual(halfOnScreen.x);
    });
  });

  describe("the tower interior sheets (FS-8RBQY §D, §E.1–§E.3)", () => {
    type Sheet = {
      atlas: string;
      frameWidth: number;
      frameHeight: number;
      anchor: { x: number; y: number };
      directions: number;
      animations: Record<string, { frames: unknown[][] }>;
      light?: {
        offset: { x: number; y: number };
        radius: number;
        color: string;
        flicker: number;
      };
      mean?: { r: number; g: number; b: number };
      source: string;
      licence: string;
    };
    const sheet = (name: string): Sheet => baked.sheets[name];
    const frameCounts = (s: Sheet) =>
      Object.fromEntries(
        Object.entries(s.animations).map(([a, v]) => [a, v.frames[0].length]),
      );
    const EDGES = ["n", "e", "s", "w", "ne", "se", "sw", "nw"];
    const AXES = ["x", "y"];

    const GROUND = ["ground_flags", "ground_planks", "ground_dressed"];
    const PARTITION_BACK = [
      "plain",
      "pillar",
      "sconce",
      "banner",
      "cobweb",
    ].flatMap((v) => AXES.map((a) => `tower_wall_back_${v}_${a}`));
    const PARTITION_FRONT = ["plain", "pillar"].flatMap((v) =>
      AXES.map((a) => `tower_wall_front_${v}_${a}`),
    );
    const PARTITION_POSTS = ["tower_post_back", "tower_post_front"];
    const PERIMETER = [
      ...["plain", "slit"].flatMap((v) =>
        AXES.map((a) => `tower_perimeter_back_${v}_${a}`),
      ),
      ...AXES.map((a) => `tower_perimeter_front_plain_${a}`),
      "tower_perimeter_post_back",
      "tower_perimeter_post_front",
    ];
    const DRESSING = ["rubble", "bone_pile", "broken_crate", "roots", "chains"];
    const TOWER = [
      ...GROUND,
      "ground_flags_dirt",
      ...PARTITION_BACK,
      ...PARTITION_FRONT,
      ...PARTITION_POSTS,
      ...PERIMETER,
      ...DRESSING,
      "stairs_spiral",
    ];
    const LIT = [
      ...AXES.map((a) => `tower_wall_back_sconce_${a}`),
      ...AXES.map((a) => `tower_perimeter_back_slit_${a}`),
      "stairs_spiral",
    ];

    it.each(TOWER)(
      "%s is baked into the tower group, authored in tools/bake/page/",
      (name) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        expect(s.atlas, name).toMatch(/^tower-\d+$/);
        expect(s.directions).toBe(1);
        expect(s.source).toMatch(
          /^authored: tools\/bake\/page\/[a-z/]+\.js#[a-zA-Z(), _]+$/,
        );
        expect(s.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it("fits every tower sheet on one 4096² page", () => {
      const pages = Object.keys(baked.atlases).filter((k) =>
        k.startsWith("tower-"),
      );
      expect(pages).toEqual(["tower-0"]);
      expect(baked.atlases["tower-0"].width).toBeLessThanOrEqual(4096);
      expect(baked.atlases["tower-0"].height).toBeLessThanOrEqual(4096);
    });

    it.each(GROUND)(
      "%s is a 64x32 ground tile with 4 variants and a measured mean",
      (name) => {
        const s = sheet(name);
        expect([s.frameWidth, s.frameHeight]).toEqual([64, 32]);
        expect(s.anchor).toEqual({ x: 0.5, y: 0.5 });
        expect(frameCounts(s)).toEqual({ variants: 4 });
        expect(s.mean).toEqual({
          r: expect.any(Number),
          g: expect.any(Number),
          b: expect.any(Number),
        });
      },
    );

    it("bakes the flags/dirt transition with the 8 edges of the grass/dirt one", () => {
      const s = sheet("ground_flags_dirt");
      expect(Object.keys(sheet("ground_grass_dirt").animations)).toEqual(EDGES);
      expect(frameCounts(s)).toEqual(
        Object.fromEntries(EDGES.map((e) => [e, 1])),
      );
      expect([s.frameWidth, s.frameHeight]).toEqual([64, 32]);
    });

    it.each([
      ...PARTITION_BACK.map((n) => [n, `wall_back_plain_${n.slice(-1)}`]),
      ...PARTITION_FRONT.map((n) => [n, `wall_front_plain_${n.slice(-1)}`]),
      ["tower_post_back", "post_back"],
      ["tower_post_front", "post_front"],
    ])(
      "%s shares the frame and anchor of %s, so cutWall geometry is unchanged",
      (name, today) => {
        const s = sheet(name);
        const t = sheet(today);
        expect([s.frameWidth, s.frameHeight, s.anchor]).toEqual([
          t.frameWidth,
          t.frameHeight,
          t.anchor,
        ]);
      },
    );

    it("stands the perimeter taller than a partition: px above the anchor", () => {
      const above = (s: Sheet) => s.anchor.y * s.frameHeight;
      for (const a of AXES) {
        expect(above(sheet(`tower_perimeter_back_plain_${a}`))).toBeGreaterThan(
          above(sheet(`tower_wall_back_plain_${a}`)),
        );
        expect(above(sheet(`tower_perimeter_back_slit_${a}`))).toBeGreaterThan(
          above(sheet(`tower_wall_back_plain_${a}`)),
        );
      }
      expect(above(sheet("tower_perimeter_post_back"))).toBeGreaterThan(
        above(sheet("tower_post_back")),
      );
    });

    it("declares a light on the sconces, the arrow slits and the stairs, and on nothing else", () => {
      for (const name of TOWER)
        if (LIT.includes(name)) {
          const light = sheet(name).light;
          expect(light, name).toBeDefined();
          expect(Object.keys(BARROW), name).toContain(light!.color);
        } else expect(sheet(name).light, name).toBeUndefined();
    });

    it("lights a sconce warm, an arrow slit faint and cold, and the stairs in a dim warm pool", () => {
      const warm = ["amber", "amberBright", "ember"];
      for (const a of AXES) {
        const sconce = sheet(`tower_wall_back_sconce_${a}`).light!;
        const slit = sheet(`tower_perimeter_back_slit_${a}`).light!;
        expect(warm).toContain(sconce.color);
        expect(["necrotic", "slateLight"]).toContain(slit.color);
        expect(slit.radius).toBeLessThan(sconce.radius);
        expect(slit.flicker).toBeLessThan(sconce.flicker);
      }
      const stairs = sheet("stairs_spiral").light!;
      expect(warm).toContain(stairs.color);
      expect(stairs.radius).toBeLessThan(
        sheet("tower_wall_back_sconce_x").light!.radius,
      );
    });

    it("mirrors a y-axis light across the anchor, as the wall torches do", () => {
      for (const v of ["tower_wall_back_sconce", "tower_perimeter_back_slit"]) {
        const x = sheet(`${v}_x`).light!.offset;
        const y = sheet(`${v}_y`).light!.offset;
        expect(y).toEqual({ x: -x.x, y: x.y });
      }
    });
  });

  describe("the Spire's facade (FS-0XMCP §R15–§R17)", () => {
    const s = () => baked.sheets.spire_facade;
    const model = readFileSync(
      join(__dirname, "../../../tools/bake/page/models/spire.js"),
      "utf8",
    );
    /** A dimension of the model, read from its source as the washing line's is. */
    const dim = (name: string) => {
      const value = Number(new RegExp(`const ${name} = (-?[\\d.]+);`).exec(model)?.[1]);
      expect(Number.isFinite(value), name).toBe(true);
      return value;
    };

    it("is baked into its own spire group, authored in models/spire.js", () => {
      expect(s()).toBeDefined();
      expect(s().atlas).toMatch(/^spire-\d+$/);
      expect(s().directions).toBe(1);
      expect(Object.keys(s().animations)).toEqual(["default"]);
      expect(s().source).toBe("authored: tools/bake/page/models/spire.js#spireFacade");
      expect(s().licence).toBe(baked.sheets.brazier.licence);
    });

    it("declares one light, amber, at the door's threshold: its only amber", () => {
      expect(s().light).toMatchObject({ color: "amber" });
      // the threshold pool sits low on the door, just above the sprite's anchor
      expect(Math.abs(s().light.offset.x)).toBeLessThanOrEqual(baked.tile.width / 2);
      expect(s().light.offset.y).toBeLessThan(0);
      expect(s().light.offset.y).toBeGreaterThan(-2 * baked.tile.height * 2);
    });

    it("stands its tower's top above the hub camera's reach, so it is never on screen (R16)", () => {
      // the drum's rim, from the model: a circle of the top radius about (0, H, TOWER_Z)
      const H = dim("TOWER_H");
      const topRadius = dim("TOWER_R") - dim("TAPER");
      const z = dim("TOWER_Z");
      // the bake camera (tools/bake/page/projection.js): px per tile edge in the view plane, and
      // of height
      const K1 = baked.tile.width / 2 / Math.SQRT1_2;
      const VPX = K1 * Math.cos(Math.PI / 6);
      const anchor = worldToScreen(HUB_SPIRE_FACADE.at.x, HUB_SPIRE_FACADE.at.y);
      const centre = worldToScreen(0, z * WORLD_PX_PER_TILE).y + anchor.y - H * VPX;
      // a level circle projects to an ellipse r·K1·sin 30° tall: its lowest point is nearest us
      const rimLowest = centre + topRadius * K1 * Math.sin(Math.PI / 6);
      const reach = projectedBounds(HUB_SIZE.width, HUB_SIZE.height, HUB_CAMERA_MARGIN);
      expect(rimLowest).toBeLessThan(reach.y);
      // and the sprite's frame reaches that high: the bake drew the drum, not a stub
      const frameTop = anchor.y - s().anchor.y * s().frameHeight;
      expect(frameTop).toBeLessThan(rimLowest);
    });

    it("keeps the facade inside the camera's reach side to side, never past a corner", () => {
      const anchor = worldToScreen(HUB_SPIRE_FACADE.at.x, HUB_SPIRE_FACADE.at.y);
      const left = anchor.x - s().anchor.x * s().frameWidth;
      const reach = projectedBounds(HUB_SIZE.width, HUB_SIZE.height, HUB_CAMERA_MARGIN);
      expect(left).toBeGreaterThan(reach.x);
      expect(left + s().frameWidth).toBeLessThan(reach.x + reach.width);
    });
  });

  describe("the Forlorn Forest's trees and dressing (FS-3QHQZ §C R24, R28, R30)", () => {
    type Sheet = {
      atlas: string;
      frameHeight: number;
      anchor: { x: number; y: number };
      directions: number;
      animations: Record<string, { frames: unknown[][] }>;
      light?: unknown;
      source: string;
      licence: string;
    };
    const sheet = (name: string): Sheet => baked.sheets[name];
    /** px of a sheet standing above its anchor: how tall it reads on screen. */
    const standing = (name: string) =>
      sheet(name).anchor.y * sheet(name).frameHeight;

    // sheet → its authoring function in tools/bake/page/models/nature.js, and its variant count
    const FOREST: [string, string, number][] = [
      ["tree_dead", "deadTree", 2],
      ["tree_dead_snag", "deadSnag", 2],
      ["tree_oak_gloom", "oak", 2],
      ["tree_pine_gloom", "pine", 2],
      ["fern", "fern", 3],
      ["stump", "stump", 2],
      ["fallen_log", "fallenLog", 2],
      ["toadstools", "toadstools", 3],
    ];

    it.each(FOREST)(
      "%s is baked on the forest atlas, authored in models/nature.js#%s, with %i variants",
      (name, fn, variants) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        expect(s.atlas).toMatch(/^forest-\d+$/);
        expect(s.directions).toBe(1);
        expect(Object.keys(s.animations)).toEqual(["variants"]);
        expect(s.animations.variants.frames[0]).toHaveLength(variants);
        expect(s.source).toBe(
          `procedural: tools/bake/page/models/nature.js#${fn}`,
        );
        expect(s.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it("bakes no light into a tree or a dressing prop: nothing in the forest glows", () => {
      for (const [name] of FOREST)
        expect(sheet(name).light, name).toBeUndefined();
    });

    it("keeps the dressing small and low beside the trees (R28)", () => {
      const shortestTree = Math.min(
        ...["tree_dead", "tree_oak_gloom", "tree_pine_gloom"].map(standing),
      );
      for (const name of ["fern", "stump", "fallen_log", "toadstools"])
        expect(standing(name), name).toBeLessThan(shortestTree / 3);
    });

    it("reuses the run's bone pile rather than baking another", () => {
      expect(sheet("bone_pile").atlas).toMatch(/^tower-\d+$/);
    });

    it("draws every forest colour from BARROW: no colour literal in models/nature.js", () => {
      const model = readFileSync(
        join(__dirname, "../../../tools/bake/page/models/nature.js"),
        "utf8",
      );
      expect(model).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\(/,
      );
    });
  });

  describe("the town interiors' props (FS-B0H2D §G R30)", () => {
    type Sheet = {
      atlas: string;
      frameWidth: number;
      frameHeight: number;
      anchor: { x: number; y: number };
      directions: number;
      animations: Record<string, { frames: unknown[][] }>;
      light?: {
        offset: { x: number; y: number };
        radius: number;
        color: string;
        flicker: number;
      };
      source: string;
      licence: string;
    };
    const sheet = (name: string): Sheet => baked.sheets[name];

    // sheet → its authoring function in tools/bake/page/models/interior.js, and its animations
    // with their frame counts (the counter runs along either world axis; the Inn's table comes
    // in its two server rects; stools and shelves carry variants, picked by index)
    const INTERIOR: [string, string, Record<string, number>][] = [
      ["counter", "counter", { x: 1, y: 1 }],
      ["inn_table", "innTable", { narrow: 1, wide: 1 }],
      ["stool", "stool", { variants: 2 }],
      ["inn_hearth", "innHearth", { default: 1 }],
      ["shelf", "shelf", { variants: 2 }],
      ["forge", "forge", { default: 1 }],
      ["anvil", "anvil", { default: 1 }],
    ];
    const LIT = ["inn_hearth", "forge"];

    it.each(INTERIOR)(
      "%s is baked, authored in models/interior.js#%s, with its frames",
      (name, fn, frames) => {
        const s = sheet(name);
        expect(s, name).toBeDefined();
        expect(Number.isInteger(s.frameWidth) && s.frameWidth > 0).toBe(true);
        expect(Number.isInteger(s.frameHeight) && s.frameHeight > 0).toBe(true);
        expect(s.anchor.x).toBeGreaterThan(0);
        expect(s.anchor.x).toBeLessThan(1);
        expect(s.anchor.y).toBeGreaterThan(0);
        expect(s.anchor.y).toBeLessThanOrEqual(1);
        expect(s.directions).toBe(1);
        expect(
          Object.fromEntries(
            Object.entries(s.animations).map(([a, v]) => [a, v.frames[0].length]),
          ),
        ).toEqual(frames);
        expect(s.source).toBe(`authored: tools/bake/page/models/interior.js#${fn}`);
        expect(s.licence).toBe(baked.sheets.brazier.licence);
        expect(s.atlas, name).toMatch(/^interior-\d+$/);
      },
    );

    it("packs nothing else into the interior group, so no existing atlas reflows", () => {
      for (const [name, s] of Object.entries(baked.sheets) as [string, Sheet][])
        if (/^interior-/.test(s.atlas))
          expect(INTERIOR.map(([n]) => n)).toContain(name);
    });

    it("declares a warm light on the Inn's hearth and the forge, and on nothing else", () => {
      const warm = ["amber", "amberBright", "ember"];
      for (const [name] of INTERIOR)
        if (LIT.includes(name)) {
          const light = sheet(name).light;
          expect(light, name).toBeDefined();
          expect(warm, name).toContain(light!.color);
          expect(light!.radius, name).toBeGreaterThan(0);
          // the fire sits above the floor: up the frame from the anchor, inside it
          expect(light!.offset.y, name).toBeLessThan(0);
          expect(sheet(name).anchor.y * sheet(name).frameHeight + light!.offset.y).toBeGreaterThan(0);
        } else expect(sheet(name).light, name).toBeUndefined();
    });

    it("reuses the crate and barrel, and bakes the Inn's tables to their rects beside the old table", () => {
      expect(sheet("table").atlas).toMatch(/^props-\d+$/);
      expect(sheet("inn_table").atlas).toMatch(/^interior-\d+$/);
      expect(sheet("barrel").atlas).toMatch(/^props-\d+$/);
      expect(sheet("crate").atlas).toMatch(/^town-\d+$/);
    });

    it("stands the counter and the forge taller than a stool, and the anvil low", () => {
      const standing = (name: string) => sheet(name).anchor.y * sheet(name).frameHeight;
      expect(standing("counter")).toBeGreaterThan(standing("stool"));
      expect(standing("forge")).toBeGreaterThan(standing("counter"));
      expect(standing("anvil")).toBeLessThan(standing("counter"));
    });

    it("draws every interior colour from BARROW: no colour literal in models/interior.js", () => {
      const model = readFileSync(
        join(__dirname, "../../../tools/bake/page/models/interior.js"),
        "utf8",
      );
      expect(model).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\(/,
      );
    });
  });

  describe("characters and creatures (FS-2325V §E)", () => {
    const CAST = [
      "char_knight_base",
      "char_archer_base",
      "char_wizard_base",
      "char_mercenary_base",
      "creature_ghoul_base",
      "creature_troll_base",
      "creature_zombie_base",
      "creature_ghost_base",
    ];

    /** Clips a sheet carries beyond the four: the Mercenary's guard (FS-MAMHR §G.35). */
    const OWN_CLIPS: Record<string, string[]> = { char_mercenary_base: ["parry"] };

    it.each(CAST)("%s has 8-way idle, walk, attack and death", (name) => {
      const sheet = baked.sheets[name];
      expect(sheet, name).toBeDefined();
      expect(sheet.directions).toBe(8);
      expect(Object.keys(sheet.animations)).toEqual([
        "idle",
        "walk",
        "attack",
        "death",
        ...(OWN_CLIPS[name] ?? []),
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

    it.each(CAST)(
      "%s records its head height, below the padded frame's top (FS-2325V §C.9)",
      (name) => {
        const sheet = baked.sheets[name];
        const anchorPx = sheet.anchor.y * sheet.frameHeight;
        expect(Number.isInteger(sheet.crown), name).toBe(true);
        // a head, not a stub: at least a tile tall
        expect(sheet.crown).toBeGreaterThan(baked.tile.height);
        // frames are padded for attack and death poses, so the idle head sits below the top
        expect(sheet.crown).toBeLessThan(anchorPx);
      },
    );

    it("records a crown only on sheets that stand and idle", () => {
      for (const [name, sheet] of Object.entries(baked.sheets) as [
        string,
        { crown?: number; animations: Record<string, unknown> },
      ][])
        if (sheet.crown !== undefined)
          expect(sheet.animations, name).toHaveProperty("idle");
    });

    it("loops idle and walk, and plays attack and death once", () => {
      for (const name of CAST) {
        const a = baked.sheets[name].animations;
        expect([a.idle.loop, a.walk.loop, a.attack.loop, a.death.loop]).toEqual(
          [true, true, false, false],
        );
      }
    });
  });

  describe("the Mercenary (FS-MAMHR §H)", () => {
    it("is its own sheet in the characters group, authored as the mercenary model", () => {
      const sheet = baked.sheets.char_mercenary_base;
      expect(sheet).toBeDefined();
      expect(sheet.atlas).toMatch(/^characters-\d+$/);
      expect(sheet.source).toBe(
        "authored: tools/bake/page/characters/cast.js#mercenary",
      );
    });

    it("keeps the other classes on their own atlases", () => {
      const merc = baked.sheets.char_mercenary_base.atlas;
      for (const name of [
        "char_knight_base",
        "char_archer_base",
        "char_wizard_base",
      ])
        expect(baked.sheets[name].atlas, name).not.toBe(merc);
    });
  });

  describe("the expanded enemy roster (FS-Q14EV §A)", () => {
    type RosterSheet = {
      atlas: string;
      directions: number;
      crown?: number;
      animations: Record<
        string,
        { fps: number; loop: boolean; frames: unknown[][] }
      >;
      source: string;
      licence: string;
    };
    const PLAYERS = [
      "char_knight_base",
      "char_archer_base",
      "char_wizard_base",
    ];
    const playerCrown =
      PLAYERS.reduce((n, name) => n + baked.sheets[name].crown, 0) /
      PLAYERS.length;
    // sheet → its §A.3 atlas group and §A.6 crown ratio band (to the player mean)
    const ROSTER: [string, string, number, number][] = [
      ["creature_demon_base", "boss", 1.8, Infinity],
      // the Forlorn Forest's dead (FS-3QHQZ §C R29): fodder, in their own group
      ["creature_zombie_base", "fodder", 0.85, 1.05],
      ["creature_ghost_base", "fodder", 0.85, 1.05],
    ];
    const atlasGroup = (key: string) => key.replace(/-\d+$/, "");

    it.each(ROSTER)(
      "%s packs into the %s group, never an existing one",
      (name, group) => {
        const sheet: RosterSheet = baked.sheets[name];
        expect(sheet, name).toBeDefined();
        expect(atlasGroup(sheet.atlas)).toBe(group);
      },
    );

    it.each(ROSTER)("%s has 8-way idle, walk, attack and death", (name) => {
      const sheet: RosterSheet = baked.sheets[name];
      expect(sheet.directions).toBe(8);
      expect(Object.keys(sheet.animations)).toEqual([
        "idle",
        "walk",
        "attack",
        "death",
      ]);
      for (const a of Object.values(sheet.animations)) {
        expect(a.frames).toHaveLength(8);
        expect(a.frames[0].length).toBeGreaterThan(1);
      }
      const a = sheet.animations;
      expect([a.idle.loop, a.walk.loop, a.attack.loop, a.death.loop]).toEqual([
        true,
        true,
        false,
        false,
      ]);
    });

    it.each(ROSTER)(
      "%s is authored in tools/bake/page/characters/, under the project's licence",
      (name) => {
        const sheet: RosterSheet = baked.sheets[name];
        expect(sheet.source).toMatch(
          /^authored: tools\/bake\/page\/characters\/[a-z]+\.js#[a-zA-Z]+$/,
        );
        expect(sheet.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it.each(ROSTER)(
      "%s stands in its size tier (%s): crown between %s× and %s× the player mean",
      (name, _group, min, max) => {
        const sheet: RosterSheet = baked.sheets[name];
        expect(Number.isInteger(sheet.crown)).toBe(true);
        const ratio = (sheet.crown as number) / playerCrown;
        expect(ratio, `${name} crown ratio`).toBeGreaterThanOrEqual(min);
        expect(ratio, `${name} crown ratio`).toBeLessThanOrEqual(max);
      },
    );

    it("writes a per-animation atlas only on the boss's spilled animations, never on existing sheets", () => {
      for (const [name, sheet] of Object.entries(baked.sheets) as [
        string,
        RosterSheet,
      ][])
        for (const [anim, a] of Object.entries(sheet.animations) as [
          string,
          { atlas?: string },
        ][]) {
          if (a.atlas === undefined) continue;
          expect(
            ROSTER.map(([n]) => n),
            `${name}/${anim}`,
          ).toContain(name);
          expect(a.atlas, `${name}/${anim}`).not.toBe(sheet.atlas);
          expect(atlasGroup(a.atlas)).toBe(atlasGroup(sheet.atlas));
        }
    });

    it("gives the demon's attack its own timing, long enough for a 0.4 s roar first (§B.6)", () => {
      const attack = (baked.sheets.creature_demon_base as RosterSheet)
        .animations.attack;
      // not the 7-frame default: the roar is held inside the clip, then strike and recovery
      expect(attack.frames[0].length).not.toBe(7);
      expect(attack.frames[0].length / attack.fps).toBeGreaterThan(0.4);
    });
  });

  describe("the boar, on the quadruped rig (FS-X2F2H §H R61)", () => {
    type BoarSheet = {
      atlas: string;
      frameWidth: number;
      directions: number;
      crown?: number;
      length?: number;
      animations: Record<
        string,
        { fps: number; loop: boolean; frames: unknown[][] }
      >;
      source: string;
      licence: string;
    };
    const BOARS: [string, string][] = [
      ["creature_boar_base", "boar"],
      ["creature_boar_elite", "eliteBoar"],
    ];
    const PLAYERS = [
      "char_knight_base",
      "char_archer_base",
      "char_wizard_base",
    ];
    const playerCrown =
      PLAYERS.reduce((n, name) => n + baked.sheets[name].crown, 0) /
      PLAYERS.length;
    /** A side-on screen px of length reads as cos 30° px of height (tools/bake/lib/length.mjs). */
    const HEIGHT_PER_LENGTH_PX = Math.cos(Math.PI / 6);
    const boar = (name: string): BoarSheet => baked.sheets[name];

    it.each(BOARS)(
      "%s has 8-way idle, walk, attack and death, idle and walk looping",
      (name) => {
        const sheet = boar(name);
        expect(sheet, name).toBeDefined();
        expect(sheet.directions).toBe(8);
        expect(Object.keys(sheet.animations)).toEqual([
          "idle",
          "walk",
          "attack",
          "death",
        ]);
        for (const a of Object.values(sheet.animations)) {
          expect(a.frames).toHaveLength(8);
          expect(a.frames[0].length).toBeGreaterThan(1);
        }
        const a = sheet.animations;
        expect([a.idle.loop, a.walk.loop, a.attack.loop, a.death.loop]).toEqual(
          [true, true, false, false],
        );
      },
    );

    it.each(BOARS)(
      "%s is authored in code in characters/boar.js#%s, under the project's licence",
      (name, fn) => {
        const sheet = boar(name);
        expect(sheet.source).toBe(
          `authored: tools/bake/page/characters/boar.js#${fn}`,
        );
        expect(sheet.licence).toBe(baked.sheets.brazier.licence);
      },
    );

    it.each(BOARS)(
      "%s packs into its own wildlife group, so no existing atlas reflows",
      (name) => {
        expect(boar(name).atlas).toMatch(/^wildlife-\d+$/);
      },
    );

    it("packs nothing else into the wildlife group", () => {
      for (const [name, sheet] of Object.entries(baked.sheets) as [
        string,
        BoarSheet,
      ][])
        if (/^wildlife-/.test(sheet.atlas))
          expect(BOARS.map(([n]) => n)).toContain(name);
    });

    it.each(BOARS)(
      "%s measures inside the fodder tier by body length, shorter than a player is tall",
      (name) => {
        const sheet = boar(name);
        expect(Number.isInteger(sheet.length), name).toBe(true);
        expect(sheet.length).toBeLessThanOrEqual(sheet.frameWidth);
        const ratio =
          ((sheet.length as number) * HEIGHT_PER_LENGTH_PX) / playerCrown;
        expect(ratio, `${name} length ratio`).toBeGreaterThanOrEqual(0.85);
        expect(ratio, `${name} length ratio`).toBeLessThan(1);
      },
    );

    it.each(BOARS)(
      "%s stands low: its back below a player's shoulder",
      (name) => {
        // a player's shoulder sits about 0.8 of the way up. The boar's crown is the top of its
        // bristled ridge, and in the facings that run it into the screen its far end rides
        // higher by depth, so the crown overstates how tall it stands.
        expect(boar(name).crown as number).toBeLessThan(0.75 * playerCrown);
      },
    );

    it("bakes the elite at the base's size: the same build, not a bigger beast", () => {
      const base = boar("creature_boar_base").length as number;
      const elite = boar("creature_boar_elite").length as number;
      expect(Math.abs(elite - base) / base).toBeLessThan(0.08);
    });

    it.each(BOARS)(
      "%s winds up long enough to read: the lowered head held through the server's 0.45 s wind-up, then the charge",
      (name) => {
        const attack = boar(name).animations.attack;
        expect(attack.frames[0].length / attack.fps).toBeGreaterThan(0.6);
      },
    );

    it("measures a length only on quadrupeds", () => {
      for (const [name, sheet] of Object.entries(baked.sheets) as [
        string,
        BoarSheet,
      ][])
        if (sheet.length !== undefined)
          expect(BOARS.map(([n]) => n)).toContain(name);
    });
  });
});
