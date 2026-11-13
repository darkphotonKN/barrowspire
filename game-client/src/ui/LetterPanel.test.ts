import { EventEmitter } from "eventemitter3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { ArtLibrary } from "@/render/art/library";
import {
  EMPTY_MAILBOX,
  LETTER_CRUMBLED,
  MAILBOX_UNREACHABLE,
  SEAL_WOULD_NOT_BREAK,
  type ClaimedLetter,
  type ItemSnapshot,
  type Letter,
} from "@/mailbox/mailbox";
import { createMailboxStore, type MailboxApi } from "@/stores/mailboxStore";
import { fillMaskArea, viewport } from "@/render/viewport";
import { ApiError } from "@/utils/apiError";
import { palette, toCss } from "@/utils/canvasPalette";
import { LetterPanel } from "./LetterPanel";
import { envelopeFrame, letterPanelFrame } from "./letterPanelLayout";
import { MailboxEnvelope } from "./MailboxEnvelope";
import { MailboxHud } from "./mailboxHud";
import { drawPanelFrame, drawPanelTitle, frameClose } from "./panelFrame";

// The shared title drawing and frame, watched (FS-3EBCA R20; FS-1GZGD § Change C5).
vi.mock("./panelFrame", async (importOriginal) => {
  const real = await importOriginal<typeof import("./panelFrame")>();
  return { ...real, drawPanelTitle: vi.fn(real.drawPanelTitle), drawPanelFrame: vi.fn(real.drawPanelFrame) };
});

// FS-1GZGD R33, R35–R37, R39, R40; A5. I-1GZGD-6 and -7: the envelope and the letter panel as a scene draws them,
// on a recording stand-in for the Phaser scene.

interface Pressable {
  handlers: Record<string, (...args: unknown[]) => void>;
  destroyed: boolean;
}
interface FakeText extends Pressable {
  content: string;
  /** Where it was made, before any move. */
  at?: { x: number; y: number };
  color?: string;
  style?: { wordWrap?: { width?: number; useAdvancedWrap?: boolean } };
  masked?: boolean;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const zones: (Pressable & {
    rect: { x: number; y: number; w: number; h: number };
  })[] = [];
  const tweens: unknown[] = [];
  /** Where each container was last put: an item tip's place. */
  const containers: { x: number; y: number }[] = [];
  const chain = (self: Record<string, unknown>, record?: Pressable) => {
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "setOrigin",
      "setAlpha",
      "setScale",
      "setCrop",
      "enableFilters",
      "setPosition",
      "setVisible",
      "setInteractive",
      "disableInteractive",
      "setColor",
      "clear",
      "fillStyle",
      "lineStyle",
      "fillRect",
      "fillRoundedRect",
      "strokeRoundedRect",
      "strokeRect",
      "lineBetween",
      "fillTriangle",
      "fillCircle",
      "strokeCircle",
      "beginPath",
      "moveTo",
      "lineTo",
      "strokePath",
    ])
      self[m] = () => self;
    self.on = (event: string, cb: (...args: unknown[]) => void) => {
      if (record) record.handlers[event] = cb;
      return self;
    };
    self.destroy = () => {
      if (record) record.destroyed = true;
    };
    return self;
  };
  const add = {
    graphics: () => chain({}),
    text: (
      _x: number,
      _y: number,
      content: string,
      style?: FakeText["style"] & { color?: string },
    ) => {
      const t: FakeText = {
        content,
        at: { x: _x, y: _y },
        color: style?.color,
        style,
        handlers: {},
        destroyed: false,
      };
      texts.push(t);
      const self = chain(
        {
          width: content.length * 7,
          height: 18,
          frame: { width: 10, height: 10 },
        },
        t,
      );
      self.setColor = (color: string) => {
        t.color = color;
        return self;
      };
      // Phaser 4's mask filter (`maskInView`)
      Object.assign(self, {
        scrollFactorX: 0,
        scrollFactorY: 0,
        filtersFocusContext: false,
      });
      self.filters = {
        external: {
          addMask: () => {
            t.masked = true;
            masksLaid.count++;
            return {};
          },
        },
      };
      return self;
    },
    zone: (x: number, y: number, w: number, h: number) => {
      const z = { rect: { x, y, w, h }, handlers: {}, destroyed: false };
      zones.push(z);
      const self = chain({}, z);
      self.setPosition = (nx: number, ny: number) => {
        z.rect = { ...z.rect, x: nx, y: ny };
        return self;
      };
      return self;
    },
    sprite: () => chain({ frame: { width: 64, height: 64 } }),
    // as in Phaser, a container takes its children down with it
    container: (
      _x: number,
      _y: number,
      children: { destroy(): void }[] = [],
    ) => {
      const self = chain({ add: () => undefined });
      self.destroy = () => children.forEach((c) => c.destroy());
      const at = { x: _x, y: _y };
      containers.push(at);
      self.setPosition = (nx: number, ny: number) => {
        at.x = nx;
        at.y = ny;
        return self;
      };
      return self;
    },
  };
  /** Each mask shape made (`make.graphics`): what it was last drawn as, rects and alphas. */
  const maskShapes: {
    rects: number[][];
    alphas: number[];
    destroyed: boolean;
  }[] = [];
  /** Every mask laid on a text (`filters.external.addMask`). */
  const masksLaid = { count: 0 };
  const scene = {
    add,
    make: {
      graphics: () => {
        const m = {
          rects: [] as number[][],
          alphas: [] as number[],
          destroyed: false,
        };
        maskShapes.push(m);
        const self = chain({}, { handlers: {}, destroyed: false });
        self.clear = () => ((m.rects = []), (m.alphas = []), self);
        self.fillStyle = (_c: number, alpha = 1) => (
          m.alphas.push(alpha),
          self
        );
        self.fillRect = (...r: number[]) => (m.rects.push(r), self);
        self.destroy = () => void (m.destroyed = true);
        return self;
      },
    },
    events: new EventEmitter(),
    input: new EventEmitter(),
    tweens: {
      add: (config: unknown) => {
        tweens.push(config);
        return { stop: () => undefined, remove: () => undefined };
      },
    },
    // the mailbox lays out in the logical view (viewport), never the camera's px: only the body's
    // mask reads the camera, for the origin it is seen through
    cameras: { main: { originX: 0, originY: 0 } },
  } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed);
  const shown = () => live().map((t) => t.content);
  const find = (content: string) => live().find((t) => t.content === content);
  return {
    scene,
    texts,
    live,
    shown,
    find,
    zones,
    tweens,
    containers,
    maskShapes,
    masksLaid: () => masksLaid.count,
  };
}

const art = {
  resolve: () => ({
    placeholder: true,
    texture: "__placeholder",
    anchor: { x: 0.5, y: 0.5 },
  }),
} as unknown as ArtLibrary;

const NOW = Date.parse("2026-11-04T12:00:00Z");

const sword: ItemSnapshot = {
  templateId: "t-sword",
  name: "Barrow Blade",
  itemType: "weapon",
  weaponType: "sword",
  rarity: "normal",
  attackPower: 12,
  itemLevel: 10,
  requiredLevel: 8,
  affixes: [],
};

const letter = (over: Partial<Letter> = {}): Letter => ({
  id: "a",
  title: "A word from the Wardens",
  body: "Rest well.",
  sender: "official",
  sentAt: "2026-11-04T11:00:00Z",
  expiresAt: "2026-11-24T12:00:00Z",
  read: true,
  claimState: "none",
  enclosures: [],
  ...over,
});

function setup() {
  const api = {
    summary: vi.fn(async () => ({
      unreadCount: 0,
      unclaimedCount: 0,
      waitingCount: 0,
    })),
    letters: vi.fn(async () => [] as Letter[]),
    markRead: vi.fn(async (_id: string) => undefined),
    claim: vi.fn(
      async (letterId: string): Promise<ClaimedLetter> => ({
        letterId,
        claimState: "claimed",
        itemIds: [],
        gold: 0,
      }),
    ),
  } satisfies MailboxApi;
  const store = createMailboxStore({
    api,
    storage: () => null,
    memberId: () => "me",
  });
  const s = fakeScene();
  return { ...s, api, store };
}

const open = (
  store: ReturnType<typeof setup>["store"],
  letters: Letter[],
  selectedId: string | null = null,
) =>
  store.setState({
    panelOpen: true,
    letters,
    lettersStatus: "ready",
    selectedId,
  });

describe("LetterPanel (R36, R37, R40)", () => {
  it("draws nothing while closed", () => {
    const { scene, store, live } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    expect(live()).toHaveLength(0);
  });

  it("says an empty mailbox in the game's words", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    expect(shown()).toContain(EMPTY_MAILBOX);
  });

  it("says when the letters could not be reached", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    store.setState({ panelOpen: true, lettersStatus: "unreachable" });
    expect(shown()).toContain(MAILBOX_UNREACHABLE);
  });

  it("closes on ×", () => {
    const { scene, store, find, live } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    find("×")!.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    expect(live()).toHaveLength(0);
  });

  it("draws × in amber, the interactable tone, brightening under the pointer", () => {
    const { scene, store, find } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    const x = find("×")!;
    expect(x.color).toBe(toCss(palette.interactable));
    x.handlers.pointerover();
    expect(x.color).toBe(toCss(palette.interactableBright));
    x.handlers.pointerout();
    expect(x.color).toBe(toCss(palette.interactable));
  });

  it("covers its own panel while open, and nothing while closed", () => {
    const { scene, store } = setup();
    const panel = new LetterPanel(scene, { store, art, now: () => NOW });
    expect(panel.covers(540, 360)).toBe(false);
    open(store, []);
    expect(panel.covers(540, 360)).toBe(true);
    expect(panel.covers(2, 2)).toBe(false);
    store.getState().closePanel();
    expect(panel.covers(540, 360)).toBe(false);
  });

  it("lists each letter with its title and time, and shows the open one's sender, dates and body", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(
      store,
      [letter({ sender: "system", expiresAt: "2026-11-06T12:00:00Z" })],
      "a",
    );
    expect(shown()).toEqual(
      expect.arrayContaining([
        "A word from the Wardens",
        "1h ago",
        "The Spire",
        "4 Nov 2026",
        "2 days left",
        "Rest well.",
      ]),
    );
  });

  it("wraps the body within its rect, clear of the scrollbar, and clips it with a mask (asked 2026-11-04)", () => {
    const { scene, store, find } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter({ sender: "system" })], "a");
    const body = find("Rest well.")!;
    expect(body.style?.wordWrap?.useAdvancedWrap).toBe(true);
    const frame = letterPanelFrame({ width: 1080, height: 720 }, 0);
    expect(body.style?.wordWrap?.width).toBeLessThan(frame.body.width);
    expect(body.masked).toBe(true);
  });

  it("opens a letter pressed in the list, marking it read", () => {
    const { scene, store, api, zones } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(
      store,
      [letter({ id: "a" }), letter({ id: "b", title: "Second", read: false })],
      "a",
    );
    const rows = zones.filter((z) => !z.destroyed && z.handlers.pointerdown);
    // the second row zone in the list opens the second letter
    rows[1].handlers.pointerdown();
    expect(store.getState().selectedId).toBe("b");
    expect(api.markRead).toHaveBeenCalledWith("b");
  });

  it("has no Enclosed row on a letter without enclosures", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter()], "a");
    expect(shown()).not.toContain("ENCLOSED");
  });

  it("draws the Enclosed row: x3 on a stacked item, and the gold amount under its coins slot", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(
      store,
      [
        letter({
          claimState: "unclaimed",
          enclosures: [
            { kind: "item", quantity: 3, item: sword },
            { kind: "gold", gold: 500 },
          ],
        }),
      ],
      "a",
    );
    expect(shown()).toEqual(expect.arrayContaining(["ENCLOSED", "x3", "500"]));
  });

  it("shows the item tip from the snapshot while the pointer is over its slot", () => {
    const { scene, store, shown, zones } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(
      store,
      [
        letter({
          claimState: "unclaimed",
          enclosures: [{ kind: "item", quantity: 1, item: sword }],
        }),
      ],
      "a",
    );
    const slot = zones.find((z) => !z.destroyed && z.handlers.pointerover)!;
    slot.handlers.pointerover({ x: 400, y: 500 });
    expect(shown().filter((t) => t === "Barrow Blade")).toHaveLength(1);
    slot.handlers.pointerout();
    expect(shown()).not.toContain("Barrow Blade");
  });

  it("tones the tip's level requirement against the character's level, as the gear overlay does (FS-BDA7X R45)", () => {
    const { scene, store, find, zones } = setup();
    let level = 5;
    new LetterPanel(scene, { store, art, now: () => NOW, level: () => level });
    open(
      store,
      [
        letter({
          claimState: "unclaimed",
          enclosures: [{ kind: "item", quantity: 1, item: sword }],
        }),
      ],
      "a",
    );
    const slot = zones.find((z) => !z.destroyed && z.handlers.pointerover)!;
    slot.handlers.pointerover({ x: 400, y: 500 });
    expect(find("Requires level 8")?.color).toBe(toCss(palette.damageBright));

    slot.handlers.pointerout();
    level = 8;
    slot.handlers.pointerover({ x: 400, y: 500 });
    expect(find("Requires level 8")?.color).toBe(toCss(palette.hudLabel));
  });

  it("says a crumbled letter in place of the letter", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    store.setState({ notice: LETTER_CRUMBLED });
    expect(shown()).toContain(LETTER_CRUMBLED);
    expect(shown()).not.toContain(EMPTY_MAILBOX);
  });

  it("lets go of everything on destroy, and draws nothing after", () => {
    const { scene, store, live } = setup();
    const panel = new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    panel.destroy();
    expect(live()).toHaveLength(0);
    store.setState({ panelOpen: false });
    store.setState({ panelOpen: true });
    expect(live()).toHaveLength(0);
  });
});

/** Lets every pending promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("LetterPanel: Take (R39, A5)", () => {
  const held = letter({
    claimState: "unclaimed",
    enclosures: [
      { kind: "item", quantity: 1, item: sword },
      { kind: "item", quantity: 3, item: sword },
      { kind: "gold", gold: 500 },
    ],
  });
  const refusal = (code: string) =>
    new ApiError({ code, status: 400, detail: code, errors: [] });

  it("walks Take → Taking… (not pressable) → the Taken stamp, the button gone", async () => {
    const { scene, store, api, find, shown } = setup();
    let answer!: (v: ClaimedLetter) => void;
    api.claim.mockImplementationOnce(
      () => new Promise<ClaimedLetter>((resolve) => (answer = resolve)),
    );
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [held], "a");
    expect(shown()).not.toContain("Taken");

    find("Take")!.handlers.pointerdown();
    expect(api.claim).toHaveBeenCalledWith("a");
    expect(shown()).toContain("Taking…");
    expect(shown()).not.toContain("Take");
    expect(find("Taking…")!.handlers.pointerdown).toBeUndefined();

    answer({ letterId: "a", claimState: "claimed", itemIds: [], gold: 500 });
    await settle();
    expect(shown()).toContain("Taken");
    expect(shown()).not.toContain("Take");
    expect(shown()).not.toContain("Taking…");
  });

  it("a full stash shows the slots it needs over the button, and the button stays", async () => {
    const { scene, store, api, find, shown } = setup();
    api.claim.mockRejectedValueOnce(refusal("STASH_FULL"));
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [held], "a");
    find("Take")!.handlers.pointerdown();
    await settle();
    expect(shown()).toEqual(
      expect.arrayContaining(["Your stash needs 4 free slots", "Take"]),
    );
  });

  it("any other failure says the seal would not break, and the button stays", async () => {
    const { scene, store, api, find, shown } = setup();
    api.claim.mockRejectedValueOnce(refusal("LETTER_CLAIM_IN_PROGRESS"));
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [held], "a");
    find("Take")!.handlers.pointerdown();
    await settle();
    expect(shown()).toEqual(
      expect.arrayContaining([SEAL_WOULD_NOT_BREAK, "Take"]),
    );
  });

  it("an expired letter crumbles and leaves the list", async () => {
    const { scene, store, api, find, shown } = setup();
    api.claim.mockRejectedValueOnce(refusal("LETTER_EXPIRED"));
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [held], "a");
    find("Take")!.handlers.pointerdown();
    await settle();
    expect(shown()).toContain(LETTER_CRUMBLED);
    expect(shown()).not.toContain("A word from the Wardens");
  });

  it("holds every other letter's Take while one is in flight: one take per panel", async () => {
    const { scene, store, api, find } = setup();
    let answer!: (v: ClaimedLetter) => void;
    api.claim.mockImplementationOnce(
      () => new Promise<ClaimedLetter>((resolve) => (answer = resolve)),
    );
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [held, { ...held, id: "b", title: "Second" }], "a");
    find("Take")!.handlers.pointerdown();

    store.setState({ selectedId: "b" });
    expect(find("Take")).toBeDefined();
    expect(find("Take")!.handlers.pointerdown).toBeUndefined();

    answer({ letterId: "a", claimState: "claimed", itemIds: [], gold: 500 });
    await settle();
    expect(find("Take")!.handlers.pointerdown).toBeDefined();
  });

  it("has no button on a letter without enclosures, nor on one already taken; and never says Claim", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter()], "a");
    expect(shown()).not.toContain("Take");
    expect(shown()).not.toContain("Taken");

    open(store, [{ ...held, claimState: "claimed" }], "a");
    expect(shown()).not.toContain("Take");
    expect(shown()).toContain("Taken");
    expect(shown().join(" ")).not.toMatch(/claim/i);
  });
});

describe("MailboxEnvelope (R33, R35)", () => {
  it("shows the seal's count while letters wait, and none when nothing does", () => {
    const { scene, store, shown } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    expect(shown()).toHaveLength(0);
    store.setState({
      summary: { unreadCount: 2, unclaimedCount: 1, waitingCount: 3 },
    });
    expect(shown()).toEqual(["3"]);
    store.setState({
      summary: { unreadCount: 0, unclaimedCount: 0, waitingCount: 0 },
    });
    expect(shown()).toHaveLength(0);
  });

  it("opens the panel when pressed, unless something else owns the screen", async () => {
    const { scene, store, zones, api } = setup();
    let blocked = true;
    new MailboxEnvelope(scene, { store, blocked: () => blocked });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    blocked = false;
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(true);
    expect(api.letters).toHaveBeenCalledTimes(1);
  });

  it("pulses a few times for each pulse the store asks for", () => {
    const { scene, store, tweens } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    expect(tweens).toHaveLength(0);
    store.setState({ pulses: 1 });
    expect(tweens).toHaveLength(1);
    expect(tweens[0]).toMatchObject({ yoyo: true, repeat: 2 });
  });
});

// FS-1GZGD § Change: The envelope toggles the letter panel and stands in the corner row. I-1GZGD-12.
describe("MailboxEnvelope (FS-1GZGD § Change C1–C3)", () => {
  it("closes the open panel on a second press, and opens it again on a third (C1)", async () => {
    const { scene, store, zones } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(true);
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(true);
  });

  it("closes the open panel even while something else is up, and opens nothing then (C1)", () => {
    const { scene, store, zones } = setup();
    let blocked = false;
    new MailboxEnvelope(scene, { store, blocked: () => blocked });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerdown();
    blocked = true;
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
  });

  it("stands in the corner row's Mailbox slot, left of Menu, Inventory, Character and Party (C2; FS-3EBCA R2)", () => {
    const { scene, store, zones } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    expect(plate.rect).toEqual({ x: 742, y: 658, w: 58, h: 46 });
    expect(envelopeFrame({ width: 1280, height: 720 })).toEqual({ x: 942, y: 658, width: 58, height: 46 });
  });

  it("names itself \"Mailbox\" under the pointer, and lets the label go on leaving (C3)", () => {
    const { scene, store, zones, shown } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerover();
    expect(shown()).toContain("Mailbox");
    plate.handlers.pointerout();
    expect(shown()).not.toContain("Mailbox");
  });
});

// The owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "全大寫也統一":
// the letter panel's MAILBOX through the shared title drawing (FS-3EBCA R20, R22). I-3EBCA-9.
describe("LetterPanel's title, shared (FS-3EBCA R20, R22)", () => {
  it("should title the open panel MAILBOX with the one title drawing, across the whole panel, once", () => {
    const title = vi.mocked(drawPanelTitle);
    title.mockClear();
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    const panel = letterPanelFrame(viewport, 0).panel;
    const [, at, words] = title.mock.calls.at(-1)!;
    expect(at).toMatchObject({ x: panel.x, y: panel.y, width: panel.width });
    expect(words).toBe("MAILBOX");
    expect(shown().filter((t) => t === "MAILBOX")).toHaveLength(1);
  });
});

// The owner, 2026-11-12: "mailbox的x關閉按鈕好像位置跟其他的不太一樣": the letter panel wears the shared
// frame and its × (FS-1GZGD § Change C5; FS-3EBCA R25).
describe("LetterPanel's frame, shared (FS-1GZGD § Change C5)", () => {
  it("should draw its frame with the one frame drawing, round the whole panel, once", () => {
    const frame = vi.mocked(drawPanelFrame);
    frame.mockClear();
    const { scene, store } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    const panel = letterPanelFrame(viewport, 0).panel;
    expect(frame).toHaveBeenCalledTimes(1);
    expect(frame.mock.calls[0][2]).toEqual(panel);
    // the frame's own ×, with no options that would leave it off
    expect(frame.mock.calls[0][3]).toBeUndefined();
  });

  it("should stand one × at the shared place, which closes the panel", () => {
    const { scene, store, texts } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    const crosses = texts.filter((t) => t.content === "×" && !t.destroyed);
    expect(crosses).toHaveLength(1);
    const box = frameClose(letterPanelFrame(viewport, 0).panel);
    expect(crosses[0].at).toEqual({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    crosses[0].handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
  });
});

// The owner, 2026-11-12: "信箱似乎也會卡住其他面板 但信箱是全畫面 那設定成開信箱時其他視窗會被關閉". The envelope
// clears the screen before it opens the letter panel (FS-1GZGD § Change C4; FS-3EBCA R15).
describe("MailboxEnvelope clears the screen first (FS-1GZGD § Change C4)", () => {
  it("calls `opening` before it opens the panel, and never on a close or a refused press", () => {
    const { scene, store, zones } = setup();
    const order: string[] = [];
    store.subscribe((s, p) => {
      if (s.panelOpen && !p.panelOpen) order.push("open");
    });
    let blocked = false;
    new MailboxEnvelope(scene, { store, blocked: () => blocked, opening: () => order.push("clear") });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerdown();
    expect(order).toEqual(["clear", "open"]);
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    blocked = true;
    plate.handlers.pointerdown();
    expect(store.getState().panelOpen).toBe(false);
    expect(order).toEqual(["clear", "open"]);
  });

  it("is handed the town's `opening` by the mailbox HUD", () => {
    const { scene, store, zones } = setup();
    const opening = vi.fn();
    new MailboxHud(scene, { store, art, blocked: () => false, opening });
    zones.find((z) => z.handlers.pointerdown)!.handlers.pointerdown();
    expect(opening).toHaveBeenCalledTimes(1);
    expect(store.getState().panelOpen).toBe(true);
  });
});

// FS-WDM0X S9: the envelope's press and the letter panel's × are the mailbox's own player inputs,
// so they run through the town's wrapper, which reads the windows before and after; the town's own
// close (Esc, a window opening) and leaving the town run as they are.
describe("the mailbox's own inputs through the town's wrapper (FS-WDM0X S9)", () => {
  function wrapped(store: ReturnType<typeof setup>["store"]) {
    const seen: string[] = [];
    const wrapper = {
      act: vi.fn((run: () => void) => {
        seen.push(`before ${store.getState().panelOpen}`);
        run();
        seen.push(`after ${store.getState().panelOpen}`);
      }),
    };
    return { seen, wrapper };
  }

  it("should run the envelope's press through the wrapper, the panel open as it returns, and a refused press too", () => {
    const { scene, store, zones } = setup();
    const { seen, wrapper } = wrapped(store);
    let blocked = false;
    new MailboxEnvelope(scene, { store, blocked: () => blocked, wrapper });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    plate.handlers.pointerdown();
    plate.handlers.pointerdown();
    blocked = true;
    plate.handlers.pointerdown();
    expect(seen).toEqual(["before false", "after true", "before true", "after false", "before false", "after false"]);
  });

  it("should run the letter panel's × through the wrapper", () => {
    const { scene, store, texts } = setup();
    const { seen, wrapper } = wrapped(store);
    new LetterPanel(scene, { store, art, now: () => NOW, wrapper });
    open(store, []);
    texts.find((t) => t.content === "×" && !t.destroyed)!.handlers.pointerdown();
    expect(seen).toEqual(["before true", "after false"]);
  });

  it("should be handed the town's wrapper by the mailbox HUD, for both, and close and leave outside it", async () => {
    const { scene, store, zones, texts } = setup();
    const { seen, wrapper } = wrapped(store);
    const hud = new MailboxHud(scene, { store, art, blocked: () => false, wrapper });
    zones.find((z) => z.handlers.pointerdown)!.handlers.pointerdown();
    texts.find((t) => t.content === "×" && !t.destroyed)!.handlers.pointerdown();
    expect(seen).toEqual(["before false", "after true", "before true", "after false"]);
    await store.getState().openPanel();
    hud.close();
    await store.getState().openPanel();
    hud.destroy();
    expect(wrapper.act).toHaveBeenCalledTimes(2);
  });
});

describe("MailboxHud: the mailbox as the town hangs it (R33, R34, R44)", () => {
  it("fetches the summary on town entry, and drops mail_arrived once the town is left", async () => {
    const { scene, store, api } = setup();
    const hud = new MailboxHud(scene, { store, art, blocked: () => false });
    await Promise.resolve();
    expect(store.getState().inTown).toBe(true);
    expect(api.summary).toHaveBeenCalledTimes(1);

    hud.destroy();
    await store.getState().arrived();
    expect(api.summary).toHaveBeenCalledTimes(1);
  });

  it("covers the screen under the open panel, so nothing under it takes a wheel or a press", async () => {
    const { scene, store } = setup();
    const hud = new MailboxHud(scene, { store, art, blocked: () => false });
    expect(hud.covers(540, 360)).toBe(false);
    await store.getState().openPanel();
    expect(hud.covers(540, 360)).toBe(true);
  });

  it("owns the keys while the panel is open, and closes it with the town", async () => {
    const { scene, store, live } = setup();
    const hud = new MailboxHud(scene, { store, art, blocked: () => false });
    expect(hud.isOpen()).toBe(false);
    await store.getState().openPanel();
    expect(hud.isOpen()).toBe(true);
    hud.close();
    expect(hud.isOpen()).toBe(false);

    await store.getState().openPanel();
    hud.destroy();
    expect(store.getState().panelOpen).toBe(false);
    expect(live()).toHaveLength(0);
  });
});

describe("the mailbox at another logical width or render scale (FS-ZAJMH R12, R13, R15)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("keeps the envelope in the bottom-right corner and the open panel centred as the view widens", async () => {
    const { scene, store, zones } = setup();
    const hud = new MailboxHud(scene, { store, art, blocked: () => false });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    expect(plate.rect.x).toBe(envelopeFrame({ width: 1080, height: 720 }).x);
    await store.getState().openPanel();
    expect(hud.covers(1000, 360)).toBe(false);

    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    hud.relayout();
    const wide = envelopeFrame({ width: 1280, height: 720 });
    expect(plate.rect).toMatchObject({ x: wide.x, y: wide.y });
    // the panel, 840 wide, now spans 220–1060
    expect(hud.covers(1000, 360)).toBe(true);
    expect(hud.covers(200, 360)).toBe(false);
  });

  it("puts the envelope at its logical corner at render scale 2, not at the backing store's", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const { scene, store, zones } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    const plate = zones.find((z) => z.handlers.pointerdown)!;
    expect(plate.rect.x).toBe(envelopeFrame({ width: 1080, height: 720 }).x);
  });

  /** The body's clip as `fillMaskArea` draws it at `rs`: its rects and their alphas. */
  const bodyClipAt = (rs: number) => {
    const rects: number[][] = [];
    const alphas: number[] = [];
    fillMaskArea(
      {
        fillStyle: (_c: number, a = 1) => alphas.push(a),
        fillRect: (...r: number[]) => rects.push(r),
      },
      letterPanelFrame({ width: 1080, height: 720 }, 0).body,
      0,
      rs,
    );
    return { rects, alphas };
  };
  const live = <T extends { destroyed: boolean }>(shapes: T[]) =>
    shapes.filter((m) => !m.destroyed);

  it.each([1, 1.25, 1.5, 2])(
    "clips the body as Phaser 3.90 clipped it at render scale %s, edge px by the share the body covers (ADR-0057)",
    (rs) => {
      viewport.set({ width: 1080, height: 720, renderScale: rs });
      const { scene, store, maskShapes } = setup();
      new LetterPanel(scene, { store, art, now: () => NOW });
      open(store, [letter()], "a");
      const [mask] = live(maskShapes);
      expect({ rects: mask.rects, alphas: mask.alphas }).toEqual(
        bodyClipAt(rs),
      );
    },
  );

  it("redraws the body's clip for a new render scale alone, on the same mask and the same body", () => {
    const { scene, store, maskShapes, masksLaid, find } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter()], "a");
    const body = find("Rest well.")!;
    viewport.set({ width: 1080, height: 720, renderScale: 1.25 });
    expect(maskShapes).toHaveLength(1);
    expect(masksLaid()).toBe(1);
    expect(body.destroyed).toBe(false);
    const [mask] = maskShapes;
    expect({ rects: mask.rects, alphas: mask.alphas }).toEqual(
      bodyClipAt(1.25),
    );
    expect(mask.alphas.some((a) => a < 1)).toBe(true);
  });

  it("stops following the render scale once destroyed", () => {
    // every viewport listener the panel takes, and whether it gave each back
    const real = viewport.onChange.bind(viewport);
    const held = new Set<object>();
    const watch = vi
      .spyOn(viewport, "onChange")
      .mockImplementation((listener) => {
        const token = {};
        held.add(token);
        const off = real(listener);
        return () => (held.delete(token), off());
      });
    const { scene, store, maskShapes, masksLaid } = setup();
    const panel = new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter()], "a");
    expect(held.size).toBeGreaterThan(0);
    panel.destroy();
    watch.mockRestore();
    expect(held.size).toBe(0);
    expect(() =>
      viewport.set({ width: 1080, height: 720, renderScale: 1.25 }),
    ).not.toThrow();
    expect(maskShapes).toHaveLength(1);
    expect(maskShapes[0].destroyed).toBe(true);
    expect(masksLaid()).toBe(1);
    expect(maskShapes[0].rects).toEqual(bodyClipAt(1).rects);
  });

  it("stands an enclosure's tip beside the pointer in logical units at render scale 2", () => {
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    const { scene, store, zones, containers } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(
      store,
      [
        letter({
          claimState: "unclaimed",
          enclosures: [{ kind: "item", quantity: 1, item: sword }],
        }),
      ],
      "a",
    );
    const slot = zones.find((z) => !z.destroyed && z.handlers.pointerover)!;
    const before = containers.length;
    // backing px (800, 600) is logical (400, 300)
    slot.handlers.pointerover({ x: 800, y: 600 });
    const tip = containers.slice(before).at(-1)!;
    expect(tip).toEqual({ x: 414, y: 290 });
  });
});
