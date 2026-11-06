import { afterEach, describe, expect, it } from "vitest";
import { viewport } from "@/render/viewport";
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

/** The logical view and render scale the mask draws at: 1080×720 at `renderScale`. */
const viewAt = (renderScale: number, width = 1080, height = 720) => viewport.set({ width, height, renderScale });
afterEach(() => viewAt(1));

/** The scene as the mask draws on it: what each object was made with and asked to do. */
function onStage(camera = { roundPixels: true, originX: 0, originY: 0 }) {
  const log: string[] = [];
  const drawn: { entry: unknown; x?: number; y?: number }[] = [];
  const rt = {
    made: [] as number[][],
    origin: [] as number[],
    at: { x: 0, y: 0 },
    destroys: 0,
    visible: true,
    destroyed: false,
    scale: 1,
    camera: {
      scroll: { x: 0, y: 0 },
      roundPixels: false,
      renderRoundPixels: false,
      zoomX: 1,
      scrollX: 0,
      scrollY: 0,
      useBounds: false,
      origin: [0.5, 0.5],
      setScroll: (x: number, y: number) => (
        (rt.camera.scroll = { x, y }), (rt.camera.scrollX = x), (rt.camera.scrollY = y), rt.camera
      ),
      setZoom: (z: number) => ((rt.camera.zoomX = z), rt.camera),
      setOrigin: (x: number, y: number) => ((rt.camera.origin = [x, y]), rt.camera),
      clampX: (x: number) => x,
      clampY: (y: number) => y,
      // Phaser 4.2.1's (`cameras/2d/Camera.js`): the scroll left as it is, rounding or not
      // (3.90 floored a rounding camera's scroll to whole units), and the canvas renderer's flag
      // set at a whole zoom only
      preRender: () => {
        rt.camera.renderRoundPixels = rt.camera.roundPixels && Number.isInteger(rt.camera.zoomX);
      },
    },
  };
  const texture: Record<string, unknown> = {
    camera: rt.camera,
    setOrigin: (x: number, y: number) => ((rt.origin = [x, y]), texture),
    setPosition: (x: number, y: number) => ((rt.at = { x, y }), texture),
    setScale: (k: number) => ((rt.scale = k), texture),
    setVisible: (v: boolean) => ((rt.visible = v), texture),
    clear: () => (log.push("clear"), texture),
    // Phaser 4: drawn offset from where it stands, buffered until render
    draw: (entry: unknown, x?: number, y?: number) => (drawn.push({ entry, x, y }), texture),
    render: () => (log.push("render"), texture),
    destroy: () => void ((rt.destroyed = true), rt.destroys++),
  };
  /** A full-view rect as the mask makes them: the dark over the world first, the ground's second. */
  const rectState = () => ({
    args: [] as unknown[],
    origin: [] as number[],
    scrollFactor: -1,
    depth: 0,
    visible: true,
    /** Its mask filter (`maskInView`): what it is masked by, inverted or not, seen through which camera. */
    mask: undefined as { source: unknown; invert?: boolean; camera?: unknown } | undefined,
    /** Phaser 4 focuses a Shape's filters on the camera's whole view until told otherwise. */
    focusContext: true,
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
      get scrollFactorX() {
        return state.scrollFactor;
      },
      get scrollFactorY() {
        return state.scrollFactor;
      },
      get filtersFocusContext() {
        return state.focusContext;
      },
      set filtersFocusContext(v: boolean) {
        state.focusContext = v;
      },
      filterCamera: { setOrigin: () => undefined },
      enableFilters: () => rect,
      filters: {
        external: {
          addMask: (source: unknown, invert?: boolean, camera?: unknown) => {
            const m = {
              source,
              invert,
              camera,
              setGameObject: (next: unknown) => void (m.source = next),
            };
            state.mask = m;
            return m;
          },
        },
      },
      setScrollFactor: (f: number) => ((state.scrollFactor = f), rect),
      setDepth: (d: number) => ((state.depth = d), rect),
      setVisible: (v: boolean) => ((state.visible = v), rect),
      setSize: (w: number, h: number) => ((state.width = w), (state.height = h), rect),
      destroy: () => void (state.destroyed = true),
    };
    return rect;
  };
  const floor = { fills: [] as { color: number; points: { x: number; y: number }[] }[], color: -1, destroyed: false, added: true };
  const shape: Record<string, unknown> = {
    clear: () => ((floor.fills = []), shape),
    fillStyle: (color: number) => ((floor.color = color), shape),
    fillPoints: (points: { x: number; y: number }[]) => (floor.fills.push({ color: floor.color, points }), shape),
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
  return { stage: s as unknown as BlackoutMaskStage, rt, dark, under, floor, drawn, log, shape, camera, texture };
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
    const { stage, dark, rt, floor, texture, camera } = onStage();
    new BlackoutMask(stage, DEPTH).show(look());
    expect(dark.mask).toMatchObject({ source: texture, invert: true, camera });
    // a camera-fixed rect: its filters focused on itself, where its scroll factor holds
    expect(dark.focusContext).toBe(false);
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
    rt.camera.preRender();
    // the flag a `fullAuto` stamp reads (ADR-0057), and the canvas renderer's
    expect([rt.camera.roundPixels, rt.camera.renderRoundPixels]).toEqual([true, true]);
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
    // offset from where each stands (Phaser 4's draw): a body by its container's offset
    expect(drawn).toEqual([
      { entry: shape, x: undefined, y: undefined },
      { entry: wall, x: 0, y: 0 },
      { entry: body, x: 700, y: 300 },
    ]);
    expect(log).toEqual(["clear", "render"]);
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
    expect(drawn.at(-1)?.entry).toMatchObject({ x: 720 });
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
    const { stage, under, floor, shape, camera } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    expect(under.args).toEqual([0, 0, 1080, 720, palette.inkDeep, 1]);
    expect([under.origin, under.scrollFactor]).toEqual([[0, 0], 0]);
    // the top of the ground band: over the ground and what lies flat on it, under the world band
    expect(MASK_UNDER_DEPTH).toBeGreaterThan(-1);
    expect(MASK_UNDER_DEPTH).toBeLessThan(WORLD_DEPTH);
    expect(under.depth).toBe(MASK_UNDER_DEPTH);
    // cut by the floor's own shape: everywhere but the floor
    expect(under.mask).toMatchObject({ source: shape, invert: true, camera });
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
    const { stage, dark, under } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    viewAt(1, 1280, 800);
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

describe("BlackoutMask at a render scale (FS-ZAJMH R6: sharp and aligned with the world)", () => {
  it("should cover the logical view, not the backing store's px", () => {
    viewAt(2);
    const { stage, dark, under } = onStage();
    new BlackoutMask(stage, DEPTH).show(look());
    expect([dark.args.slice(0, 4), dark.width, dark.height]).toEqual([[0, 0, 1080, 720], 1080, 720]);
    expect([under.width, under.height]).toEqual([1080, 720]);
  });

  it.each([1.5, 2])("should draw the mask at backing px at render scale %s, drawn back over the building's world rect", (rs) => {
    viewAt(rs);
    const { stage, rt } = onStage();
    new BlackoutMask(stage, DEPTH).show(look());
    const b = maskBounds(INN, WALL_TOP);
    const [made] = rt.made;
    // the corner on a backing px, at or before the building's: the screen's px are the mask's
    expect(rt.at.x * rs).toBeCloseTo(Math.round(rt.at.x * rs));
    expect(rt.at.y * rs).toBeCloseTo(Math.round(rt.at.y * rs));
    expect(rt.at.x).toBeLessThanOrEqual(b.x);
    expect(rt.at.y).toBeLessThanOrEqual(b.y);
    // backing px enough to reach past the far corner
    expect(rt.at.x + made[2] / rs).toBeGreaterThanOrEqual(b.x + b.width);
    expect(rt.at.y + made[3] / rs).toBeGreaterThanOrEqual(b.y + b.height);
    expect(rt.scale).toBe(1 / rs);
    expect(rt.camera.zoomX).toBe(rs);
    expect(rt.camera.origin).toEqual([0, 0]);
    expect(rt.camera.scroll).toEqual(rt.at);
  });

  it.each([1, 1.5, 2])(
    "should round its stamps to backing px as the main camera rounds the world at render scale %s, its corner unmoved (R4)",
    (rs) => {
      viewAt(rs);
      // a building whose mask corner falls between whole world units at 1.5
      const odd: House = { ...INN, x: INN.x + 1 };
      const { stage, rt } = onStage();
      new BlackoutMask(stage, DEPTH).show(look([], odd));
      rt.camera.preRender();
      // the flag a `fullAuto` stamp reads (ADR-0057), and the canvas renderer's
      expect([rt.camera.roundPixels, rt.camera.renderRoundPixels]).toEqual([true, true]);
      expect({ x: rt.camera.scrollX, y: rt.camera.scrollY }).toEqual(rt.at);
    },
  );

  it("should leave its stamps unrounded when the main camera does not round", () => {
    const { stage, rt } = onStage({ roundPixels: false, originX: 0, originY: 0 });
    new BlackoutMask(stage, DEPTH).show(look());
    rt.camera.preRender();
    expect([rt.camera.roundPixels, rt.camera.renderRoundPixels]).toEqual([false, false]);
  });

  it("should redraw on a texture of the new size when the render scale changes, the building unchanged", () => {
    const { stage, rt, log } = onStage();
    const mask = new BlackoutMask(stage, DEPTH);
    mask.show(look());
    viewAt(2);
    mask.show(look());
    const b = maskBounds(INN, WALL_TOP);
    expect(rt.made.at(-1)).toEqual([0, 0, b.width * 2, b.height * 2]);
    expect(log.filter((l) => l === "clear")).toHaveLength(2);
  });
});
