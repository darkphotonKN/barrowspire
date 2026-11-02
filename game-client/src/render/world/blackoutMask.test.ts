import { describe, expect, it } from "vitest";
import { WORLD_DEPTH, projectRect } from "@/render/iso/shapes";
import { palette } from "@/utils/canvasPalette";
import {
  BlackoutMask,
  MASK_MARGIN,
  MASK_UNDER_DEPTH,
  drawnAt,
  maskBounds,
  maskFloor,
  stampKey,
  type BlackoutMaskStage,
  type MaskLook,
  type Stamp,
} from "./blackoutMask";
import type { House } from "./houses";

const INN: House = { id: "inn", x: 470, y: 110, width: 400, height: 300 };
const STORE: House = { id: "store", x: 1130, y: 150, width: 300, height: 240 };
/** The baked back wall's top in screen px (BAKE.WALL_BACK · BAKE.VPX ≈ 141). */
const WALL_TOP = 141;
/** The servers' walls: 20 world px thick. */
const WALL = 20;
const DEPTH = 500;

/** A drawn object as the scenes hand them over: a sprite on its frame, maybe in a container. */
interface FakeStamp extends Stamp {
  alpha: number;
  texture: { key: string };
  frame: { name: string };
  flipX: boolean;
}
const sprite = (x: number, y: number, frame = "idle", parentContainer: Stamp | null = null): FakeStamp => ({
  x,
  y,
  visible: true,
  parentContainer,
  alpha: 1,
  texture: { key: "art:characters-0" },
  frame: { name: frame },
  flipX: false,
});
const container = (x: number, y: number, visible = true): Stamp => ({ x, y, visible, parentContainer: null });

/** The scene as the mask draws on it: what each object was made with and asked to do. */
function onStage(camera = { width: 1080, height: 720, roundPixels: true }) {
  const log: string[] = [];
  const drawn: { entry: unknown; x?: number; y?: number }[] = [];
  const bitmap = { invertAlpha: false, destroy: () => {} };
  const rt = {
    made: [] as number[][],
    origin: [] as number[],
    at: { x: 0, y: 0 },
    destroys: 0,
    visible: true,
    destroyed: false,
    camera: { scroll: { x: 0, y: 0 }, roundPixels: false, setScroll: (x: number, y: number) => ((rt.camera.scroll = { x, y }), rt.camera) },
  };
  const texture: Record<string, unknown> = {
    camera: rt.camera,
    setOrigin: (x: number, y: number) => ((rt.origin = [x, y]), texture),
    setPosition: (x: number, y: number) => ((rt.at = { x, y }), texture),
    setVisible: (v: boolean) => ((rt.visible = v), texture),
    clear: () => (log.push("clear"), texture),
    beginDraw: () => (log.push("begin"), texture),
    batchDraw: (entry: unknown, x?: number, y?: number) => (drawn.push({ entry, x, y }), texture),
    endDraw: () => (log.push("end"), texture),
    createBitmapMask: () => bitmap,
    destroy: () => void ((rt.destroyed = true), rt.destroys++),
  };
  /** A full-view rect as the mask makes them: the dark over the world first, the ground's second. */
  const rectState = () => ({
    args: [] as unknown[],
    origin: [] as number[],
    scrollFactor: -1,
    depth: 0,
    visible: true,
    mask: undefined as unknown,
    width: 0,
    height: 0,
    destroyed: false,
  });
  const rects = [rectState(), rectState()];
  const [dark, under] = rects;
  let made = 0;
  const rectangle = (...a: unknown[]) => {
    const state = rects[made++];
    state.args = a;
    state.width = a[2] as number;
    state.height = a[3] as number;
    const rect: Record<string, unknown> = {
      get width() {
        return state.width;
      },
      get height() {
        return state.height;
      },
      setOrigin: (x: number, y: number) => ((state.origin = [x, y]), rect),
      setScrollFactor: (f: number) => ((state.scrollFactor = f), rect),
      setDepth: (d: number) => ((state.depth = d), rect),
      setVisible: (v: boolean) => ((state.visible = v), rect),
      setMask: (m: unknown) => ((state.mask = m), rect),
      setSize: (w: number, h: number) => ((state.width = w), (state.height = h), rect),
      destroy: () => void (state.destroyed = true),
    };
    return rect;
  };
  const cut = { invertAlpha: false };
  const floor = { fills: [] as { color: number; points: { x: number; y: number }[] }[], color: -1, destroyed: false, added: true };
  const shape: Record<string, unknown> = {
    clear: () => ((floor.fills = []), shape),
    fillStyle: (color: number) => ((floor.color = color), shape),
    fillPoints: (points: { x: number; y: number }[]) => (floor.fills.push({ color: floor.color, points }), shape),
    createGeometryMask: () => cut,
    destroy: () => void (floor.destroyed = true),
  };
  const s = {
    add: {
      renderTexture: (...a: number[]) => (rt.made.push(a), texture),
      rectangle,
    },
    make: { graphics: (_config: object, add?: boolean) => ((floor.added = add !== false), shape) },
    cameras: { main: camera },
  };
  return { stage: s as unknown as BlackoutMaskStage, rt, dark, under, cut, floor, bitmap, drawn, log, shape, camera };
}

const look = (stamps: Stamp[] = [], house = INN): MaskLook => ({ house, wall: WALL, wallTop: WALL_TOP, stamps });

describe("maskFloor (FS-9PN7X §D, the owner's pixel model)", () => {
  it("should be the building's floor inside its walls' centrelines, projected", () => {
    expect(maskFloor(INN, WALL)).toEqual(projectRect(480, 120, 380, 280));
  });

  it("should never reach past the walls' outer faces, whatever their thickness", () => {
    const [top, right, bottom, left] = projectRect(INN.x, INN.y, INN.width, INN.height);
    for (const wall of [0, 10, 20, 40]) {
      const [t, r, b, l] = maskFloor(INN, wall);
      expect(t.y).toBeGreaterThanOrEqual(top.y);
      expect(r.x).toBeLessThanOrEqual(right.x);
      expect(b.y).toBeLessThanOrEqual(bottom.y);
      expect(l.x).toBeGreaterThanOrEqual(left.x);
    }
  });
});

describe("maskBounds", () => {
  it("should hold the building and its walls, with room around for whoever stands in it", () => {
    const [top, right, bottom, left] = projectRect(INN.x, INN.y, INN.width, INN.height);
    const b = maskBounds(INN, WALL_TOP);
    expect(b.x).toBeLessThanOrEqual(left.x - MASK_MARGIN.side);
    expect(b.x + b.width).toBeGreaterThanOrEqual(right.x + MASK_MARGIN.side);
    expect(b.y).toBeLessThanOrEqual(top.y - WALL_TOP - MASK_MARGIN.above);
    expect(b.y + b.height).toBeGreaterThanOrEqual(bottom.y + MASK_MARGIN.below);
  });

  it("should sit on whole px with even sides, so the mask's px are the screen's", () => {
    const b = maskBounds({ id: "odd", x: 101.3, y: 57.9, width: 211.1, height: 133.7 }, 20.5);
    for (const v of [b.x, b.y, b.width, b.height]) expect(Number.isInteger(v)).toBe(true);
    expect(b.width % 2).toBe(0);
    expect(b.height % 2).toBe(0);
  });

  it("should leave room over the walls for the tallest character baked standing by the back wall", () => {
    // char_wizard_base: 170 px tall, anchored at 0.75, so 128 px over its feet
    expect(MASK_MARGIN.above).toBeGreaterThanOrEqual(128);
  });
});

describe("drawnAt", () => {
  it("should be where a stamp stands, its containers' offsets added", () => {
    expect(drawnAt(sprite(10, 20))).toEqual({ x: 10, y: 20 });
    const outer = container(100, 200);
    const inner: Stamp = { x: 5, y: 6, visible: true, parentContainer: outer };
    expect(drawnAt(sprite(1, 2, "idle", inner))).toEqual({ x: 106, y: 208 });
  });

  it("should be nowhere while it or any container it is in is hidden", () => {
    expect(drawnAt({ ...sprite(1, 2), visible: false })).toBeUndefined();
    expect(drawnAt(sprite(1, 2, "idle", container(0, 0, false)))).toBeUndefined();
  });
});

describe("stampKey", () => {
  it("should be the same for a stamp that draws the same px", () => {
    expect(stampKey(sprite(10, 20))).toBe(stampKey(sprite(10, 20)));
  });

  it("should change when a stamp moves, turns, animates, fades, or shows", () => {
    const base = stampKey(sprite(10, 20));
    expect(stampKey(sprite(11, 20))).not.toBe(base);
    expect(stampKey(sprite(10, 20, "walk_1"))).not.toBe(base);
    expect(stampKey(Object.assign(sprite(10, 20), { flipX: true }))).not.toBe(base);
    expect(stampKey(Object.assign(sprite(10, 20), { alpha: 0.4 }))).not.toBe(base);
    expect(stampKey({ ...sprite(10, 20), visible: false })).not.toBe(base);
    expect(stampKey(sprite(0, 0, "idle", container(10, 20)))).not.toBe(stampKey(sprite(0, 0, "idle", container(10, 21))));
  });

  it("should change when a container's child animates, a text is retyped, or a drawing is redrawn", () => {
    const holding = (frame: string) => ({ ...container(0, 0), list: [sprite(0, -4, frame)] });
    expect(stampKey(holding("idle"))).not.toBe(stampKey(holding("walk_1")));
    const text = (t: string) => ({ ...container(0, 0), text: t });
    expect(stampKey(text("Ghoul"))).not.toBe(stampKey(text("Ghoul (2)")));
    const drawing = (w: number) => ({ ...container(0, 0), commandBuffer: [3, 0x112233, 1, 4, 0, 0, w, 6] });
    expect(stampKey(drawing(40))).not.toBe(stampKey(drawing(39)));
  });
});

describe("BlackoutMask (FS-9PN7X §D: everything outside the building's own px is dark)", () => {
  it("should cover the whole view in inkDeep at the blackout's depth, fixed to the camera, hidden until asked", () => {
    const { stage, dark } = onStage();
    new BlackoutMask(stage, DEPTH);
    expect(dark.args).toEqual([0, 0, 1080, 720, palette.inkDeep, 1]);
    expect(dark.origin).toEqual([0, 0]);
    expect(dark.scrollFactor).toBe(0);
    expect(dark.depth).toBe(DEPTH);
    expect(dark.visible).toBe(false);
  });

  it("should leave the dark only where the mask holds nothing: an inverted mask of a texture never on screen", () => {
    const { stage, dark, rt, bitmap, floor } = onStage();
    new BlackoutMask(stage, DEPTH).show(look());
    expect(dark.mask).toBe(bitmap);
    expect(bitmap.invertAlpha).toBe(true);
    expect(rt.visible).toBe(false);
    // the floor's shape is drawn into the mask only, never added to the display list
    expect(floor.added).toBe(false);
  });

  it("should place the mask over the building on whole px, its camera looking from that corner as the main camera rounds", () => {
    const { stage, rt } = onStage();
    new BlackoutMask(stage, DEPTH).show(look());
    const b = maskBounds(INN, WALL_TOP);
    expect(rt.made).toEqual([[0, 0, b.width, b.height]]);
    expect(rt.at).toEqual({ x: b.x, y: b.y });
    expect(rt.origin).toEqual([0, 0]);
    expect(rt.camera.scroll).toEqual({ x: b.x, y: b.y });
    expect(rt.camera.roundPixels).toBe(true);
  });

  it("should draw the floor inside the walls first, then every stamp shown, where it stands", () => {
    const { stage, drawn, floor, shape, dark, log } = onStage();
    const body = sprite(0, -4, "idle", container(700, 300));
    const wall = sprite(600, 200);
    const hidden = { ...sprite(650, 250), visible: false };
    const inHidden = sprite(0, 0, "idle", container(10, 10, false));
    new BlackoutMask(stage, DEPTH).show(look([wall, hidden, body, inHidden]));
    expect(dark.visible).toBe(true);
    expect(floor.fills).toEqual([{ color: palette.inkDeep, points: maskFloor(INN, WALL) }]);
    expect(drawn).toEqual([
      { entry: shape, x: 0, y: 0 },
      { entry: wall, x: 600, y: 200 },
      { entry: body, x: 700, y: 296 },
    ]);
    expect(log).toEqual(["clear", "begin", "end"]);
  });

  it("should not redraw while nothing of the building changed, and redraw the frame something did", () => {
    const { stage, drawn, log } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    const body = sprite(700, 300);
    const stamps = [sprite(600, 200), body];
    mask.show(look(stamps));
    mask.show(look(stamps));
    mask.show(look(stamps));
    expect(log.filter((l) => l === "clear")).toHaveLength(1);
    body.frame = { name: "walk_1" };
    mask.show(look(stamps));
    expect(log.filter((l) => l === "clear")).toHaveLength(2);
    body.x = 701;
    mask.show(look(stamps));
    expect(log.filter((l) => l === "clear")).toHaveLength(3);
    // someone walked in: one more stamp
    mask.show(look([...stamps, sprite(720, 320)]));
    expect(log.filter((l) => l === "clear")).toHaveLength(4);
    expect(drawn.at(-1)?.x).toBe(720);
  });

  it("should move to the next building the frame the player does, on a texture of its size, refloored", () => {
    const { stage, rt, floor } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    mask.show(look());
    mask.show(look([], STORE));
    const b = maskBounds(STORE, WALL_TOP);
    expect(rt.at).toEqual({ x: b.x, y: b.y });
    expect(rt.made.at(-1)).toEqual([0, 0, b.width, b.height]);
    expect(rt.destroys).toBe(1);
    expect(floor.fills.at(-1)?.points).toEqual(maskFloor(STORE, WALL));
  });

  it("should black out the ground outside the floor under every world object, so B's soft px lie over the dark", () => {
    const { stage, under, cut, floor } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    expect(under.args).toEqual([0, 0, 1080, 720, palette.inkDeep, 1]);
    expect([under.origin, under.scrollFactor]).toEqual([[0, 0], 0]);
    // the top of the ground band: over the ground and what lies flat on it, under the world band
    expect(MASK_UNDER_DEPTH).toBeGreaterThan(-1);
    expect(MASK_UNDER_DEPTH).toBeLessThan(WORLD_DEPTH);
    expect(under.depth).toBe(MASK_UNDER_DEPTH);
    // cut by the floor's own shape: everywhere but the floor
    expect(under.mask).toBe(cut);
    expect(cut.invertAlpha).toBe(true);
    expect(under.visible).toBe(false);
    mask.show(look());
    expect(under.visible).toBe(true);
    expect(floor.fills.at(-1)?.points).toEqual(maskFloor(INN, WALL));
  });

  it("should go out on the street, and draw afresh the next time the player steps in", () => {
    const { stage, dark, under, log } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    const stamps = [sprite(600, 200)];
    mask.show(look(stamps));
    mask.show(undefined);
    expect([dark.visible, under.visible]).toEqual([false, false]);
    mask.show(look(stamps));
    expect(dark.visible).toBe(true);
    expect(log.filter((l) => l === "clear")).toHaveLength(2);
  });

  it("should stay the size of the view when the view is resized", () => {
    const camera = { width: 1080, height: 720, roundPixels: true };
    const { stage, dark, under } = onStage(camera);
    const mask = new BlackoutMask(stage, DEPTH);
    camera.width = 1280;
    camera.height = 800;
    mask.show(look());
    expect([dark.width, dark.height, under.width, under.height]).toEqual([1280, 800, 1280, 800]);
  });

  it("should let go of the dark, the texture and the floor's shape", () => {
    const { stage, dark, under, rt, floor } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    mask.show(look());
    mask.destroy();
    expect([dark.destroyed, under.destroyed, rt.destroyed, floor.destroyed]).toEqual([true, true, true, true]);
  });
});
