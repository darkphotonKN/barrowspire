import { afterEach, describe, expect, it, vi } from "vitest";
import { viewport } from "@/render/viewport";
import { BARROW_HEX } from "@/utils/theme";
import { showDialogueCard } from "./npcDialogue";

// FS-ZAJMH R12, R13: the NPC card keeps to the bottom-right corner as the logical view widens.

interface Made {
  kind: string;
  x: number;
  y: number;
  name?: string;
  height: number;
  /** The handlers it was given, by event. */
  handlers: Record<string, () => void>;
}

/** Every object is recorded and answers any call; positions are kept as Phaser keeps them. */
function recordingStage() {
  const made: Made[] = [];
  const make = (kind: string, args: unknown[]) => {
    const self: Made & Record<string, unknown> = {
      kind,
      x: typeof args[0] === "number" ? args[0] : 0,
      y: typeof args[1] === "number" ? args[1] : 0,
      height: 18,
      handlers: {},
    };
    const proxy: unknown = new Proxy(self, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (prop === "then") return undefined;
        if (prop === "setPosition")
          return (x: number, y: number) => (
            (target.x = x),
            (target.y = y),
            proxy
          );
        if (prop === "setName")
          return (n: string) => ((target.name = n), proxy);
        if (prop === "on" || prop === "once")
          return (event: string, fn: () => void) => ((target.handlers[event] = fn), proxy);
        return () => proxy;
      },
    });
    made.push(self);
    return proxy;
  };
  const add = new Proxy(
    {},
    {
      get:
        (_, kind) =>
        (...args: unknown[]) =>
          make(String(kind), args),
    },
  );
  return { scene: { add } as never, made };
}

const tones = {
  panel: BARROW_HEX.charcoal,
  text: BARROW_HEX.vellum,
  dim: BARROW_HEX.vellumDark,
};

describe("showDialogueCard at another logical width (FS-ZAJMH R12, R13)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should move the card and each answer's hit area to the bottom-right corner of the wider view", () => {
    const { scene, made } = recordingStage();
    const card = showDialogueCard(scene, {
      name: "Warden",
      line: "Well met.",
      rows: [
        {
          id: "go",
          label: "Go  [1]",
          colour: BARROW_HEX.amber,
          onPick: () => undefined,
        },
      ],
      tones,
    });
    const hit = () => made.find((m) => m.name === "choice-go")!;
    const container = made.find(
      (m) => m.kind === "container" && m.name === undefined,
    )!;
    const hitAt1080 = { x: hit().x, y: hit().y };
    // the card's right edge stands 20 in from the right of a 1080 view
    expect(hitAt1080.x).toBe(1080 - 20 - 372 / 2);

    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    card.relayout();
    expect([container.x, container.y]).toEqual([200, 0]);
    expect(hit()).toMatchObject({ x: hitAt1080.x + 200, y: hitAt1080.y });
  });
});

describe("the card's rows tell the interface sounds (FS-WDM0X § Change: Menu, dialog and notice sounds, M5, M10)", () => {
  it("should tell a hover on a row that can be picked, and a press on a dimmed one refused", () => {
    const { scene, made } = recordingStage();
    const feedback = { hovered: vi.fn(), refused: vi.fn() };
    const onPick = vi.fn();
    showDialogueCard(scene, {
      name: "The Spire's door",
      line: "The Spire's door stands open.",
      rows: [
        { id: "solo", label: "Descend alone  [1]", colour: BARROW_HEX.amber, onPick, enabled: () => false },
        { id: "queue", label: "Wait for company  [2]", colour: BARROW_HEX.amber, onPick },
      ],
      tones,
      feedback,
    });
    const hit = (id: string) => made.find((m) => m.name === `choice-${id}`)!;

    hit("queue").handlers.pointerover();
    hit("solo").handlers.pointerover();
    hit("solo").handlers.pointerup();

    expect(feedback.hovered).toHaveBeenCalledTimes(1);
    expect(feedback.refused).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});
