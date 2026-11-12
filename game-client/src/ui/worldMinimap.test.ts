import { describe, expect, it } from "vitest";
import { EventEmitter } from "eventemitter3";
import type Phaser from "phaser";
import { worldToScreen } from "@/render/iso/projection";
import { contrastRatio } from "@/render/lighting/lighting";
import { createPartyStore } from "@/stores/partyStore";
import { PartyInvitePrompt } from "./PartyInvitePrompt";
import { palette } from "@/utils/canvasPalette";
import {
  MINIMAP,
  MINIMAP_EDGE,
  MINIMAP_OVERLAY,
  WORLD_MARKS,
  WorldMinimap,
  minimapPanel,
  type MinimapMark,
  type MinimapPicture,
  type MinimapStage,
} from "./minimap";

// FS-P0HSP §A.4, §B, §E (I-P0HSP-1): the run's minimap drawing a world's plan: one look, one set
// of modes, the plan in place of a dungeon floor's region grid.

type Call = { name: string; args: unknown[] };

/** A stand-in for `this.add.graphics()`: records each call, in order. */
function fakeGraphics() {
  const calls: Call[] = [];
  const g = {
    calls,
    visible: true,
    depth: 0,
    scrollFactor: 1,
    position: { x: 0, y: 0 },
    destroyed: false,
    /** The calls made since the last clear. */
    drawn: () => calls.slice(calls.map((c) => c.name).lastIndexOf("clear") + 1),
  };
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
      return g;
    };
  return Object.assign(g, {
    clear: record("clear"),
    fillStyle: record("fillStyle"),
    fillRect: record("fillRect"),
    fillPoints: record("fillPoints"),
    fillCircle: record("fillCircle"),
    lineStyle: record("lineStyle"),
    strokeRect: record("strokeRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    strokePath: record("strokePath"),
    setPosition: (x: number, y: number) => ((g.position = { x, y }), g),
    setDepth: (d: number) => ((g.depth = d), g),
    setScrollFactor: (f: number) => ((g.scrollFactor = f), g),
    setVisible: (v: boolean) => ((g.visible = v), g),
    destroy: () => {
      g.destroyed = true;
    },
  });
}

/** The scene as the minimap asks it: its graphics and vignette images, in the order made. */
function fakeStage(renderScale = 1) {
  void renderScale;
  const made: ReturnType<typeof fakeGraphics>[] = [];
  const images: ReturnType<typeof fakeGraphics>[] = [];
  const stage: MinimapStage = {
    graphics: () => {
      const g = fakeGraphics();
      made.push(g);
      return g;
    },
    canvasImage: () => {
      const image = fakeGraphics();
      images.push(image);
      return image;
    },
  };
  return { stage, made, images };
}

const TOWN = { width: 2000, height: 1000 };
const SQUARE = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 0, y: 1000 },
];
const HOUSE = [
  { x: 1130, y: 150 },
  { x: 1430, y: 150 },
  { x: 1430, y: 390 },
  { x: 1130, y: 390 },
];
const picture = (key = "a"): MinimapPicture => ({
  key,
  ground: [SQUARE],
  solids: () => [HOUSE],
  lines: [{ closed: true, points: SQUARE }],
  marks: [],
});

/** The fills made in each colour, in order, in a layer's last draw. */
function fillsInOrder(drawn: Call[]): { colour: number; name: string }[] {
  let colour = -1;
  const out: { colour: number; name: string }[] = [];
  for (const c of drawn) {
    if (c.name === "fillStyle") colour = c.args[0] as number;
    if (c.name === "fillPoints") out.push({ colour, name: c.name });
  }
  return out;
}

describe("WorldMinimap (FS-P0HSP §A.4, §B)", () => {
  it("should draw the panel, then the ground in the one fill, then the footprints and the edge in the walls' ink (§B.6, §B.8, §B.13)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    const drawn = made[0].drawn();
    // the panel's backing and rim, as the run's
    expect(drawn[0]).toEqual({ name: "fillStyle", args: [palette.hudPanel, 0.85] });
    expect(drawn[1]).toEqual({ name: "fillRect", args: [0, 0, MINIMAP.width, MINIMAP.height] });
    expect(fillsInOrder(drawn).map((f) => f.colour)).toEqual([palette.minimapExplored, palette.minimapEdge]);
    expect(drawn.find((c) => c.name === "lineStyle" && c.args[1] === palette.minimapEdge)?.args).toEqual([
      MINIMAP_EDGE.width,
      palette.minimapEdge,
      1,
    ]);
    expect(drawn.filter((c) => c.name === "closePath")).toHaveLength(1);
  });

  it("should fit the town's diamond to the panel's height at 1/12 of the world's projection (§B.5)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    const ground = made[0].drawn().find((c) => c.name === "fillPoints")!.args[0] as { x: number; y: number }[];
    const ys = ground.map((p) => p.y);
    // the diamond's top at the inset, its bottom at the inset from the panel's foot: 100 px tall
    expect(Math.min(...ys)).toBeCloseTo(MINIMAP.inset, 6);
    expect(Math.max(...ys)).toBeCloseTo(MINIMAP.height - MINIMAP.inset, 6);
  });

  it("should ask the footprints at the scale the map is drawn at, each mode its own", () => {
    const { stage } = fakeStage();
    const asked: number[] = [];
    const map = new WorldMinimap(stage, TOWN);
    map.show({ ...picture(), solids: (k) => (asked.push(k), [HOUSE]) });
    map.setMode("enlarged");
    map.setMode("overlay");
    expect(asked[0]).toBeCloseTo(1 / 12, 6);
    expect(asked[1]).toBeCloseTo(1.5 / 12, 6);
    expect(asked[2]).toBe(0.125);
    expect(minimapPanel("enlarged").width).toBe(324);
  });

  it("should redraw the map only when its key changes, not as the party moves (§A.4; FS-56CKV §A.8)", () => {
    const { stage } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture("a"));
    map.show(picture("a"));
    map.party({ self: { x: 500, y: 500 }, allies: [] });
    map.party({ self: { x: 900, y: 500 }, allies: [] });
    map.show(picture("a"));
    expect(map.redraws).toBe(1);
    map.show(picture("b"));
    expect(map.redraws).toBe(2);
  });

  it("should draw the player's dot r 3 over the allies' r 2, each ringed (§E.29)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.party({ self: { x: 1000, y: 500 }, allies: [{ x: 400, y: 300 }] });
    const dots = made[made.length - 1].drawn().filter((c) => c.name === "fillCircle" || c.name === "fillStyle");
    expect(dots.map((c) => (c.name === "fillStyle" ? c.args[0] : c.args[2]))).toEqual([
      palette.markerStroke,
      3,
      palette.markerAlly,
      2,
      palette.markerStroke,
      4,
      palette.markerSelf,
      3,
    ]);
  });

  it("should draw the player's dot alone where no ally is given (§E.30)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.party({ self: { x: 1000, y: 500 }, allies: [] });
    expect(made[made.length - 1].drawn().filter((c) => c.name === "fillCircle")).toHaveLength(2);
  });
});

// FS-P0HSP §C.17–§C.19 (I-P0HSP-2): the town's five glyphs, drawn as the run's are, and set side by
// side where two would overlap.
describe("WorldMinimap marks (FS-P0HSP §C)", () => {
  type Box = { x: number; y: number; right: number; bottom: number; ink: Set<string>; ring: Set<string> };
  /** Each mark the marks layer drew, in order: its ring's box, and its ink and ring px. */
  function glyphs(calls: Call[]): Box[] {
    const out: Box[] = [];
    let colour = -1;
    for (const c of calls) {
      if (c.name === "fillStyle") {
        colour = c.args[0] as number;
        if (colour === palette.markerStroke)
          out.push({ x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity, ink: new Set(), ring: new Set() });
      }
      if (c.name !== "fillRect") continue;
      const [x, y, w, h] = c.args as number[];
      const box = out[out.length - 1];
      for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true);
      const into = colour === palette.interactable ? box.ink : box.ring;
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) into.add(`${i - 0},${j - 0}`);
      if (colour === palette.markerStroke) {
        box.x = Math.min(box.x, x);
        box.y = Math.min(box.y, y);
        box.right = Math.max(box.right, x + w);
        box.bottom = Math.max(box.bottom, y + h);
      }
    }
    return out;
  }
  const marked = (marks: MinimapMark[], mode?: "enlarged" | "overlay") => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show({ ...picture(), marks });
    if (mode) map.setMode(mode);
    return glyphs(made[1].drawn());
  };
  const SPREAD = [
    { kind: "tower", at: { x: 400, y: 200 } },
    { kind: "teleport", at: { x: 1700, y: 200 } },
    { kind: "chest", at: { x: 900, y: 500 } },
    { kind: "bag", at: { x: 1300, y: 300 } },
    { kind: "lozenge", at: { x: 1500, y: 800 } },
  ] as MinimapMark[];

  it("should draw each of the five as a 9 × 9 box, its 7 × 7 amber ink on a 1 px ring, ink 3:1 against its ring, inside the rim (§C.17)", () => {
    // no scroll: the Elder only tells a story and is not marked (Nick, 2026-11-12)
    expect(WORLD_MARKS).toEqual(["tower", "teleport", "chest", "bag", "lozenge"]);
    const boxes = marked(SPREAD);
    expect(boxes).toHaveLength(5);
    for (const b of boxes) {
      // the ring round the ink, within its 9 × 9 box (the chest's lid row is blank: 9 × 8)
      expect(b.right - b.x).toBe(9);
      expect(b.bottom - b.y).toBeGreaterThanOrEqual(8);
      expect(b.bottom - b.y).toBeLessThanOrEqual(9);
      const ink = [...b.ink].map((k) => k.split(",").map(Number));
      expect(Math.max(...ink.map(([x]) => x)) - Math.min(...ink.map(([x]) => x)) + 1).toBe(7);
      expect(Math.max(...ink.map(([, y]) => y)) - Math.min(...ink.map(([, y]) => y)) + 1).toBeLessThanOrEqual(7);
      expect(b.x).toBeGreaterThanOrEqual(1);
      expect(b.right).toBeLessThanOrEqual(MINIMAP.width - 1);
    }
    expect(contrastRatio(palette.interactable, palette.markerStroke)).toBeGreaterThanOrEqual(3);
  });

  it("should give each of the five its own art (§C.17)", () => {
    const shapes = marked(SPREAD).map((b) =>
      [...b.ink].map((k) => k.split(",").map(Number)).map(([x, y]) => `${x - b.x},${y - b.y}`).sort().join(";"),
    );
    expect(new Set(shapes).size).toBe(5);
  });

  // the stash chest (1180, 245) and the Quartermaster (1280, 270): 5 × 4 px apart on the normal map
  const STASH_AND_QUARTERMASTER = [
    { kind: "bag", at: { x: 1280, y: 270 } },
    { kind: "chest", at: { x: 1180, y: 245 } },
  ] as MinimapMark[];

  it.each([[undefined], ["enlarged"], ["overlay"]] as const)(
    "should set marks that would overlap side by side on one row, chest then bag, 1 px apart (mode %s; §C.19)",
    (mode) => {
      const [bag, chest] = marked(STASH_AND_QUARTERMASTER, mode);
      // one row: both glyphs' foot rows are inked
      expect(chest.bottom).toBe(bag.bottom);
      expect(bag.x - chest.x).toBe(10);
    },
  );

  it("should centre the row on the mean of their seats (§C.19)", () => {
    const [bag, chest] = marked(STASH_AND_QUARTERMASTER);
    const [lone] = marked([STASH_AND_QUARTERMASTER[0]]);
    const [loneChest] = marked([STASH_AND_QUARTERMASTER[1]]);
    expect(Math.abs((bag.x + chest.x) / 2 - (lone.x + loneChest.x) / 2)).toBeLessThanOrEqual(0.5);
  });

  it("should leave marks that do not overlap where they stand", () => {
    const apart = marked(SPREAD);
    const alone = SPREAD.map((m) => marked([m])[0]);
    apart.forEach((b, i) => expect([b.x, b.y]).toEqual([alone[i].x, alone[i].y]));
  });
});

// FS-P0HSP §F.31, §F.34, §G.38 (I-P0HSP-3): the run's modes in the town, and what lies over the map.
describe("WorldMinimap modes (FS-P0HSP §F)", () => {
  it("should hold the enlarged 324 × 162 panel and none as the overlay, at depth 920 in the world (§F.31, §F.34)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.setMode("enlarged");
    expect(map.panel).toEqual({ width: 324, height: 162 });
    map.setMode("overlay");
    expect(map.panel).toBeNull();
    for (const g of made) expect([g.depth, g.scrollFactor]).toEqual([MINIMAP_OVERLAY.depth, 1]);
    expect(MINIMAP_OVERLAY.depth).toBe(920);
  });

  it("should stand the overlay so the player's point on it lies on the player, at 1/8 about them (§F.31; FS-1SEF0 §C.14)", () => {
    const { stage, made } = fakeStage();
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    map.setMode("overlay");
    const focus = { x: 1180, y: 600 };
    map.follow(focus, { self: focus, allies: [] });
    const s = worldToScreen(focus.x, focus.y);
    const stand = (v: number) => Math.round(v) - Math.round(v * MINIMAP_OVERLAY.scale);
    expect(made[0].position).toEqual({ x: stand(s.x), y: stand(s.y) });
    // the town at 1/8: 300 × 150 logical px
    const ground = made[0].drawn().find((c) => c.name === "fillPoints")!.args[0] as { x: number; y: number }[];
    const xs = ground.map((p) => p.x);
    const ys = ground.map((p) => p.y);
    expect([Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]).toEqual([300, 150]);
  });

  it("should lie under an invite prompt drawn after it, at the one HUD depth (§G.38)", () => {
    const order: { what: string; depth: number }[] = [];
    const layer = (what: string) => {
      const entry = { what, depth: 0 };
      order.push(entry);
      const self: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_t, key) =>
            key === "setDepth"
              ? (d: number) => ((entry.depth = d), self)
              : key === "then"
                ? undefined
                : () => self,
        },
      );
      return self;
    };
    const stage: MinimapStage = {
      graphics: () => layer("map") as never,
      canvasImage: () => layer("map") as never,
    };
    const map = new WorldMinimap(stage, TOWN);
    map.show(picture());
    const scene = {
      events: new EventEmitter(),
      cameras: { main: { width: 1080, height: 720 } },
      add: { graphics: () => layer("prompt"), text: () => layer("prompt") },
    } as unknown as Phaser.Scene;
    const store = createPartyStore({ selfId: () => "me", now: () => 0 });
    new PartyInvitePrompt(scene, {
      store,
      commands: { accept: () => {}, decline: () => {} },
      hidden: () => false,
      world: () => "hub",
      floor: () => undefined,
    });
    store.getState().receiveInvite({
      invite_id: "a",
      party_id: "party-a",
      party_pod_addr: "10.0.0.7:5660",
      leader_name: "Wren",
      member_count: 2,
      size: 4,
      expires_at: "2026-11-01T05:01:00Z",
    });
    const lastMap = order.map((o) => o.what).lastIndexOf("map");
    const firstPrompt = order.findIndex((o) => o.what === "prompt");
    expect(firstPrompt).toBeGreaterThan(lastMap);
    // one depth: Phaser draws a depth's objects in the order they were made
    expect(new Set(order.map((o) => o.depth))).toEqual(new Set([MINIMAP.depth]));
  });
});
