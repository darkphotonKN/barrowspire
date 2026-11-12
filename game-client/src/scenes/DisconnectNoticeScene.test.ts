import { afterEach, describe, expect, it, vi } from "vitest";

// Only the notice scene's own wiring is under test: a Phaser stand-in with a bare Scene.
vi.mock("phaser", () => {
  class Scene {
    constructor(_config: unknown) {}
  }
  const phaser = { Scene };
  return { ...phaser, default: phaser };
});

// The shared frame and title, watched: the notice draws through them, not a copy (FS-R6EYZ R9).
vi.mock("@/ui/panelFrame", async (importActual) => {
  const actual = await importActual<typeof import("@/ui/panelFrame")>();
  return {
    ...actual,
    drawPanelFrame: vi.fn(actual.drawPanelFrame),
    drawPanelTitle: vi.fn(actual.drawPanelTitle),
  };
});

const { DisconnectNoticeScene } = await import("./DisconnectNoticeScene");
const { DISCONNECT_NOTICE } = await import("@/ui/disconnectNoticeLayout");
const { viewport } = await import("@/render/viewport");
const { sceneSystems } = await import("./sceneEnd.standin");
const { drawPanelFrame, drawPanelTitle } = await import("@/ui/panelFrame");
const { disconnectNoticeFrame } = await import("@/ui/disconnectNoticeLayout");

type Handler = (...args: unknown[]) => void;

/** A drawn piece: what it answers to, and whether it is gone. */
interface Piece {
  kind: string;
  text?: string;
  handlers: Record<string, Handler>;
  interactive: boolean;
  destroyed: boolean;
}

/** The notice scene with a stand-in factory that keeps every piece it made. */
function noticeScene(domDisplay = "block") {
  const pieces: Piece[] = [];
  const piece = (kind: string, text?: string) => {
    const p: Piece = { kind, text, handlers: {}, interactive: false, destroyed: false };
    pieces.push(p);
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === "on") return (event: string, fn: Handler) => ((p.handlers[event] = fn), self);
          if (key === "setInteractive") return () => ((p.interactive = true), self);
          if (key === "destroy") return () => void (p.destroyed = true);
          if (key === "then") return undefined;
          return () => self;
        },
      },
    );
    return self;
  };
  const systems = sceneSystems();
  const field = { blur: vi.fn() };
  const domContainer = { style: { display: domDisplay }, contains: (n: unknown) => n === field };
  vi.stubGlobal("document", { activeElement: field, documentElement: {} });
  // the canvas font reads the page's CSS; the stand-in page has none, so the fallback face
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  const scene = new DisconnectNoticeScene() as unknown as {
    init(data: object): void;
    create(): void;
    update(): void;
  } & Record<string, unknown>;
  Object.assign(scene, {
    ...systems.scene,
    add: {
      rectangle: () => piece("rectangle"),
      graphics: () => piece("graphics"),
      text: (_x: number, _y: number, text: string) => piece("text", text),
      zone: () => piece("zone"),
    },
    game: { domContainer },
  });
  const notice = { holdWorlds: vi.fn(), returnToMenu: vi.fn() };
  scene.init({ notice });
  scene.create();
  const live = () => pieces.filter((p) => !p.destroyed);
  return { scene, systems, pieces, live, notice, domContainer, field };
}

afterEach(() => {
  vi.unstubAllGlobals();
  viewport.set({ width: 1080, height: 720, renderScale: 1 });
});

describe("DisconnectNoticeScene (FS-R6EYZ R8–R13)", () => {
  it("should draw the title in capitals, the line and the button's words, and no ×", () => {
    const { live } = noticeScene();
    expect(live().filter((p) => p.kind === "text").map((p) => p.text)).toEqual([
      "DISCONNECTED",
      DISCONNECT_NOTICE.line,
      DISCONNECT_NOTICE.button,
    ]);
  });

  // The owner, 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框", "每個ui視窗的標題都不同位置
  // 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一" (FS-R6EYZ R9).
  it("should wear the shared frame without its × and the shared title (R9, R13)", () => {
    vi.mocked(drawPanelFrame).mockClear();
    vi.mocked(drawPanelTitle).mockClear();
    const { scene } = noticeScene();
    const { panel } = disconnectNoticeFrame(viewport);
    expect(drawPanelFrame).toHaveBeenCalledTimes(1);
    expect(drawPanelFrame).toHaveBeenCalledWith(scene, expect.anything(), panel, { close: false });
    expect(drawPanelTitle).toHaveBeenCalledTimes(1);
    expect(drawPanelTitle).toHaveBeenCalledWith(scene, panel, DISCONNECT_NOTICE.title);
  });

  it("should hold the world still as it comes up and on every frame after (R10)", () => {
    const { scene, notice } = noticeScene();
    expect(notice.holdWorlds).toHaveBeenCalledTimes(1);
    scene.update();
    scene.update();
    expect(notice.holdWorlds).toHaveBeenCalledTimes(3);
  });

  it("should return to the menu once the button's press is dispatched, and only for the button (R12, R13)", () => {
    vi.useFakeTimers();
    const { live, notice } = noticeScene();
    const interactive = live().filter((p) => p.interactive);
    // the dim swallows clicks and does nothing with them; the button's zone presses, twice here
    for (const p of interactive) p.handlers.pointerdown?.();
    for (const p of interactive) p.handlers.pointerdown?.();
    expect(interactive.filter((p) => p.handlers.pointerdown)).toHaveLength(1);
    // not inside Phaser's own dispatch of the press
    expect(notice.returnToMenu).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(notice.returnToMenu).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("should hide the DOM layer and blur its focused field while up, and give it back on its end (R10)", () => {
    const { systems, domContainer, field } = noticeScene();
    expect(domContainer.style.display).toBe("none");
    expect(field.blur).toHaveBeenCalledTimes(1);
    systems.shutdown();
    expect(domContainer.style.display).toBe("block");
  });

  it("should draw itself again, centred, when the view changes, leaving nothing of the old draw (R9)", () => {
    const { live } = noticeScene();
    const before = live().length;
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    expect(live()).toHaveLength(before);
  });
});
