import { EventEmitter } from "eventemitter3";
import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { ArtLibrary } from "@/render/art/library";
import {
  EMPTY_MAILBOX,
  LETTER_CRUMBLED,
  MAILBOX_UNREACHABLE,
  type ItemSnapshot,
  type Letter,
} from "@/mailbox/mailbox";
import { createMailboxStore, type MailboxApi } from "@/stores/mailboxStore";
import { LetterPanel } from "./LetterPanel";
import { MailboxEnvelope } from "./MailboxEnvelope";
import { MailboxHud } from "./mailboxHud";

// FS-1GZGD R33, R35–R37, R40. I-1GZGD-6: the envelope and the letter panel as a scene draws them,
// on a recording stand-in for the Phaser scene.

interface Pressable {
  handlers: Record<string, (...args: unknown[]) => void>;
  destroyed: boolean;
}
interface FakeText extends Pressable {
  content: string;
  color?: string;
}

function fakeScene() {
  const texts: FakeText[] = [];
  const zones: (Pressable & { rect: { x: number; y: number; w: number; h: number } })[] = [];
  const tweens: unknown[] = [];
  const chain = (self: Record<string, unknown>, record?: Pressable) => {
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "setOrigin",
      "setAlpha",
      "setScale",
      "setCrop",
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
    text: (_x: number, _y: number, content: string, style?: { color?: string }) => {
      const t: FakeText = { content, color: style?.color, handlers: {}, destroyed: false };
      texts.push(t);
      return chain({ width: content.length * 7, height: 18, frame: { width: 10, height: 10 } }, t);
    },
    zone: (x: number, y: number, w: number, h: number) => {
      const z = { rect: { x, y, w, h }, handlers: {}, destroyed: false };
      zones.push(z);
      return chain({}, z);
    },
    sprite: () => chain({ frame: { width: 64, height: 64 } }),
    // as in Phaser, a container takes its children down with it
    container: (_x: number, _y: number, children: { destroy(): void }[] = []) => {
      const self = chain({ add: () => undefined });
      self.destroy = () => children.forEach((c) => c.destroy());
      return self;
    },
  };
  const scene = {
    add,
    events: new EventEmitter(),
    input: new EventEmitter(),
    tweens: {
      add: (config: unknown) => {
        tweens.push(config);
        return { stop: () => undefined, remove: () => undefined };
      },
    },
    cameras: { main: { width: 1080, height: 720 } },
  } as unknown as Phaser.Scene;
  const live = () => texts.filter((t) => !t.destroyed);
  const shown = () => live().map((t) => t.content);
  const find = (content: string) => live().find((t) => t.content === content);
  return { scene, live, shown, find, zones, tweens };
}

const art = {
  resolve: () => ({ placeholder: true, texture: "__placeholder", anchor: { x: 0.5, y: 0.5 } }),
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
    summary: vi.fn(async () => ({ unreadCount: 0, unclaimedCount: 0, waitingCount: 0 })),
    letters: vi.fn(async () => [] as Letter[]),
    markRead: vi.fn(async (_id: string) => undefined),
  } satisfies MailboxApi;
  const store = createMailboxStore({ api, storage: () => null, memberId: () => "me" });
  const s = fakeScene();
  return { ...s, api, store };
}

const open = (store: ReturnType<typeof setup>["store"], letters: Letter[], selectedId: string | null = null) =>
  store.setState({ panelOpen: true, letters, lettersStatus: "ready", selectedId });

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

  it("lists each letter with its title and time, and shows the open one's sender, dates and body", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter({ sender: "system", expiresAt: "2026-11-06T12:00:00Z" })], "a");
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

  it("opens a letter pressed in the list, marking it read", () => {
    const { scene, store, api, zones } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, [letter({ id: "a" }), letter({ id: "b", title: "Second", read: false })], "a");
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
    open(store, [letter({ claimState: "unclaimed", enclosures: [{ kind: "item", quantity: 1, item: sword }] })], "a");
    const slot = zones.find((z) => !z.destroyed && z.handlers.pointerover)!;
    slot.handlers.pointerover({ x: 400, y: 500 });
    expect(shown().filter((t) => t === "Barrow Blade")).toHaveLength(1);
    slot.handlers.pointerout();
    expect(shown()).not.toContain("Barrow Blade");
  });

  it("says a crumbled letter in place of the letter", () => {
    const { scene, store, shown } = setup();
    new LetterPanel(scene, { store, art, now: () => NOW });
    open(store, []);
    store.setState({ notice: LETTER_CRUMBLED });
    expect(shown()).toContain(LETTER_CRUMBLED);
    expect(shown()).not.toContain(EMPTY_MAILBOX);
  });

  it("covers its own rect only while open, and lets go of everything on destroy", () => {
    const { scene, store, live } = setup();
    const panel = new LetterPanel(scene, { store, art, now: () => NOW });
    expect(panel.covers(540, 360)).toBe(false);
    open(store, []);
    expect(panel.covers(540, 360)).toBe(true);
    expect(panel.covers(5, 5)).toBe(false);
    panel.destroy();
    expect(live()).toHaveLength(0);
    store.setState({ panelOpen: false });
    store.setState({ panelOpen: true });
    expect(live()).toHaveLength(0);
  });
});

describe("MailboxEnvelope (R33, R35)", () => {
  it("shows the seal's count while letters wait, and none when nothing does", () => {
    const { scene, store, shown } = setup();
    new MailboxEnvelope(scene, { store, blocked: () => false });
    expect(shown()).toHaveLength(0);
    store.setState({ summary: { unreadCount: 2, unclaimedCount: 1, waitingCount: 3 } });
    expect(shown()).toEqual(["3"]);
    store.setState({ summary: { unreadCount: 0, unclaimedCount: 0, waitingCount: 0 } });
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

  it("covers the envelope and the open panel", async () => {
    const { scene, store } = setup();
    const hud = new MailboxHud(scene, { store, art, blocked: () => false });
    expect(hud.covers(1080 - 30, 720 - 30)).toBe(true);
    expect(hud.covers(540, 360)).toBe(false);
    await store.getState().openPanel();
    expect(hud.covers(540, 360)).toBe(true);
  });
});
