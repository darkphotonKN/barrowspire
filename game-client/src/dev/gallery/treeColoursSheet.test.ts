import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { TREE_LOOK } from "@/ui/PassiveTreeOverlay";
import { TREE_SHEET, TreeColoursScene, mountTreeColours } from "./treeColoursSheet";

// FS-8RZ51 §Change: A lit node glows in its own colour, L13 (I-8RZ51-23): the Tree colours sheet lets go
// of the shared view when it goes. Each of its knockouts watches `viewport` (knockout.ts); one left
// watching would rebuild on a scene that is gone at the page's next view change.

// A Phaser stand-in: a scene that records its end listeners and makes no textures (so every knockout
// is made and watches, its picture falling back to lines), and a game that starts its scenes at once
// and, as Phaser 4.2.1's `Game#destroy` does, only marks itself for destruction: its scenes end on a
// later step, after the page has put its view back.
vi.mock("phaser", () => {
  const chain = (): unknown => {
    const self: unknown = new Proxy(function () {}, {
      get: (_t, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : () => self),
      apply: () => self,
      set: () => true,
    });
    return self;
  };
  class Scene {
    private readonly heard = new Map<string, Set<() => void>>();
    readonly events = {
      once: (event: string, fn: () => void) => {
        if (!this.heard.has(event)) this.heard.set(event, new Set());
        this.heard.get(event)!.add(fn);
      },
      off: (event: string, fn: () => void) => this.heard.get(event)?.delete(fn),
      emit: (event: string) => {
        for (const fn of [...(this.heard.get(event) ?? [])]) (this.heard.get(event)!.delete(fn), fn());
      },
    };
    // no renderTexture, no image, no make: a knockout here is made and watches, and draws in lines
    readonly add = new Proxy({}, { get: (_t, key) => (key === "renderTexture" || key === "image" ? undefined : () => chain()) });
    readonly cameras = { main: chain() };
    constructor(_config: unknown) {}
  }
  class Game {
    readonly scale = { resize: () => {}, setZoom: () => {} };
    readonly scene = { getScenes: () => [] };
    pendingDestroy = false;
    constructor(config: { scene: { create(): void }[] }) {
      for (const scene of config.scene) scene.create();
    }
    destroy() {
      this.pendingDestroy = true;
    }
  }
  const phaser = { Scene, Game, AUTO: 0, Scale: { NONE: 0 } };
  return { ...phaser, default: phaser };
});
vi.mock("@/render/crispText", () => ({ installCrispText: () => {} }));

/** Every view watch made from now on that has not been let go. */
function watches() {
  const live = new Set<object>();
  const onChange = viewport.onChange.bind(viewport);
  vi.spyOn(viewport, "onChange").mockImplementation((listener) => {
    const stop = onChange(listener);
    const watch = {};
    live.add(watch);
    return () => (live.delete(watch), stop());
  });
  return live;
}

type Ending = TreeColoursScene & { events: { emit(event: string): void } };

describe("the Tree colours sheet letting go of the view (FS-8RZ51 L13, I-8RZ51-23)", () => {
  const page = viewport.current();
  afterEach(() => {
    vi.restoreAllMocks();
    viewport.set(page);
  });

  it.each(["shutdown", "destroy"])("should stop every knockout watching the view when its scene ends (%s)", (end) => {
    const live = watches();
    const sheet = new TreeColoursScene() as Ending;
    sheet.create();
    expect(live.size).toBeGreaterThan(0);
    sheet.events.emit(end);
    expect(live.size).toBe(0);
    // a preview after the end draws nothing again
    sheet.preview(TREE_LOOK);
    expect(live.size).toBe(0);
  });

  it("should leave no view watch behind when the panel goes, before it puts the page's view back", () => {
    viewport.set({ width: 1280, height: 720, renderScale: 2, cssScale: 1 });
    const before = viewport.current();
    const live = watches();
    const watching: number[] = [];
    const set = viewport.set.bind(viewport);
    vi.spyOn(viewport, "set").mockImplementation((view) => (watching.push(live.size), set(view)));
    const { unmount } = mountTreeColours({} as HTMLElement);
    expect(viewport.current()).toMatchObject({ ...TREE_SHEET, renderScale: 1 });
    expect(live.size).toBeGreaterThan(0);
    watching.length = 0;
    unmount();
    expect(viewport.current()).toEqual(before);
    expect(watching).toEqual([0]);
    expect(live.size).toBe(0);
  });
});
