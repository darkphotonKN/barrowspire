import { describe, expect, it, vi } from "vitest";

// Only the queue panel is under test: a Phaser stand-in with the scene base class.
vi.mock("phaser", async () => {
  const { EventEmitter } = await import("eventemitter3");
  class Scene {
    events = new EventEmitter();
    constructor(_config: unknown) {}
  }
  const phaser = {
    Scene,
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 },
  };
  return { ...phaser, default: phaser };
});

const { HubScene } = await import("./HubScene");

interface QueuePanelScene {
  queuePanel?: { active: boolean; setText(text: string): unknown };
  add: { text: (...args: unknown[]) => unknown };
  cameras: { main: { height: number } };
  showQueueProgress(current: number, total: number): void;
}

interface FakeText {
  active: boolean;
  setText(text: string): FakeText;
  setScrollFactor(): FakeText;
  setDepth(): FakeText;
}

function fakeText(): FakeText {
  const text: FakeText = {
    active: true,
    setText: vi.fn((_text: string) => text),
    setScrollFactor: () => text,
    setDepth: () => text,
  };
  return text;
}

describe("HubScene queue panel (FS-29KSH §Requirements 25, 27)", () => {
  // Phaser reuses the scene instance when the delver comes home from a run. The
  // panel from the first visit was destroyed with that visit, and writing to it
  // shows nothing: the second queue looked like it never started.
  it("should show queue progress on a live panel after the hub was left and re-entered", () => {
    const hub = new HubScene() as unknown as QueuePanelScene;
    const stale = { active: false, setText: vi.fn() };
    const fresh = fakeText();
    hub.queuePanel = stale;
    hub.add = { text: vi.fn(() => fresh) };
    hub.cameras = { main: { height: 600 } };

    hub.showQueueProgress(1, 2);

    expect(hub.add.text).toHaveBeenCalledTimes(1);
    expect(hub.queuePanel).toBe(fresh);
  });

  it("should reuse the panel while it is still on screen", () => {
    const hub = new HubScene() as unknown as QueuePanelScene;
    const live = fakeText();
    hub.queuePanel = live;
    hub.add = { text: vi.fn() };
    hub.cameras = { main: { height: 600 } };

    hub.showQueueProgress(2, 2);

    expect(hub.add.text).not.toHaveBeenCalled();
    expect(live.setText).toHaveBeenCalledWith("Gathering the delve  2/2");
  });
});
