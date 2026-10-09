import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { BARROW } from "@/utils/theme";
import { WORLD_PX_PER_TILE, worldToScreen } from "@/render/iso/projection";
import { HUB_WASHING_LINE } from "@/render/world/hubKeepOut";
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
    const DELVERS = [
      "char_knight_base",
      "char_archer_base",
      "char_wizard_base",
    ];
    const delverCrown =
      DELVERS.reduce((n, name) => n + baked.sheets[name].crown, 0) /
      DELVERS.length;
    // sheet → its §A.3 atlas group and §A.6 crown ratio band (to the delver mean)
    const ROSTER: [string, string, number, number][] = [
      ["creature_demon_base", "boss", 1.8, Infinity],
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
      "%s stands in its size tier (%s): crown between %s× and %s× the delver mean",
      (name, _group, min, max) => {
        const sheet: RosterSheet = baked.sheets[name];
        expect(Number.isInteger(sheet.crown)).toBe(true);
        const ratio = (sheet.crown as number) / delverCrown;
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
});
