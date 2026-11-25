import { describe, expect, it } from "vitest";
import { EventEmitter } from "eventemitter3";
import {
  GameUiBridge,
  NO_FACTS,
  lendUiBridge,
  reportWorld,
  type UiState,
  type World,
  type WorldBlockers,
  type WorldReport,
  type WorldWindows,
} from "./uiBridge";
import { ChatInput } from "./chatInput";
import { UiChatSlot, type ChatPiece, type ChatWiring } from "./uiSceneChat";

// FS-TQZ5J § Change: Batch 6, R125–R132: the chat window is the UI scene's, built as each world is reported
// and taken down as it leaves; it takes the keys exactly when the world's old rule let it, reports the
// player typing in the UI's state, and its top edge is the invite stack's floor in a field and the run

/** A world as it reports itself, its windows and blockers as they are now. */
function aWorld(world: World, start: Partial<WorldBlockers> = {}) {
  const blockers: { -readonly [K in keyof WorldBlockers]: WorldBlockers[K] } = { dialogue: false, ...start };
  const windows: { -readonly [K in keyof WorldWindows]: WorldWindows[K] } = { letter: false };
  const heard: boolean[] = [];
  const report: WorldReport = {
    world,
    windows: () => ({ ...windows }),
    blockers: () => ({ ...blockers }),
    facts: () => NO_FACTS,
    heardUi: (ui) => void heard.push(!!ui.typing),
    answer: () => {},
  };
  return { report, blockers, windows, heard };
}

/** A chat window as the slot keeps it, recording what was done to it and the wiring it was built with. */
interface BuiltChat extends ChatPiece {
  wiring: ChatWiring;
  synced: number;
  destroyed: boolean;
  top: number;
  keeps: boolean;
  linked: string[];
  field: { x: number; y: number; width: number; height: number } | null;
}

function onSlot() {
  const bridge = new GameUiBridge();
  const built: BuiltChat[] = [];
  const slot = new UiChatSlot(bridge, (wiring) => {
    const chat: BuiltChat = {
      wiring,
      synced: 0,
      destroyed: false,
      top: 468,
      keeps: false,
      linked: [],
      field: null,
      fieldRow: () => chat.field,
      link: (item) => void chat.linked.push(item.name),
      holds: () => chat.keeps,
      keepsField: () => chat.keeps,
      topEdge: () => chat.top,
      sync: () => void chat.synced++,
      destroy: () => void (chat.destroyed = true),
    };
    built.push(chat);
    return chat;
  });
  const report = (world: ReturnType<typeof aWorld>) => {
    bridge.report(world.report);
    slot.show(world.report);
  };
  const leave = (world: World) => {
    bridge.left(world);
    slot.show(null);
  };
  const standing = () => built.filter((c) => !c.destroyed);
  return { bridge, slot, built, report, leave, standing };
}

describe("the UI scene's chat slot (FS-TQZ5J § Change: Batch 6, R125)", () => {
  it.each(["hub", "field", "run"] as const)("should build the window as the %s is reported, and take it down as it leaves", (world) => {
    const { slot, built, report, leave, standing } = onSlot();
    report(aWorld(world));
    expect(standing()).toHaveLength(1);
    leave(world);
    expect(standing()).toEqual([]);
    expect(built).toHaveLength(1);
    expect(slot.keepsField(20, 600, [])).toBe(false);
    expect(slot.holds(20, 600)).toBe(false);
  });

  it("should keep the window on a changed report of its world, re-reading who owns the keys at once (R128)", () => {
    const { bridge, slot, built, report } = onSlot();
    const run = aWorld("run");
    report(run);
    bridge.changed();
    slot.show(run.report);
    expect(built).toHaveLength(1);
    expect(built[0].synced).toBe(1);
  });

  it("should build a new window for the next world, with no leave between (a draft goes with its world)", () => {
    const { built, report, standing } = onSlot();
    report(aWorld("hub"));
    report(aWorld("field"));
    expect(built).toHaveLength(2);
    expect(built[0].destroyed).toBe(true);
    expect(standing()).toEqual([built[1]]);
  });

  it("should take the window down with the game", () => {
    const { slot, built, report } = onSlot();
    report(aWorld("run"));
    slot.destroy();
    expect(built[0].destroyed).toBe(true);
  });

  it("should keep the field for a press on the window, as the window says (R131)", () => {
    const { slot, built, report } = onSlot();
    report(aWorld("field"));
    built[0].keeps = true;
    expect(slot.keepsField(20, 600, [{}])).toBe(true);
    expect(slot.holds(20, 600)).toBe(true);
  });
});

describe("who owns Enter and Esc, and the draft (FS-TQZ5J § Change: Batch 6, R126)", () => {
  it("should let the window take the keys with the inventory, the character panel and the stash open (FS-KBA4Q R18)", () => {
    const { bridge, built, report } = onSlot();
    report(aWorld("hub"));
    const { mayOpen } = built[0].wiring;
    expect(mayOpen()).toBe(true);
    bridge.reportUi({ inventory: true });
    expect(mayOpen()).toBe(true);
    bridge.reportUi({ inventory: false, character: true });
    expect(mayOpen()).toBe(true);
    bridge.reportUi({ inventory: true, character: true, stash: true });
    expect(mayOpen()).toBe(true);
  });

  it.each<[string, (on: boolean, at: { bridge: GameUiBridge; world: ReturnType<typeof aWorld> }) => void]>([
    ["the menu", (on, { bridge }) => bridge.reportUi({ menuOpen: on })],
    // the town's dialogue card and letter panel, a run's open container and its end: the world's own rule
    ["what the world turns the chat away for", (on, { world }) => void (world.blockers.chat = on)],
  ])("should let the window take no keys under %s, a gear panel open or not (FS-KBA4Q R21)", (_label, block) => {
    const { bridge, built, report } = onSlot();
    const world = aWorld("run");
    report(world);
    const { mayOpen } = built[0].wiring;
    for (const panels of [{}, { inventory: true, character: true, stash: true }]) {
      bridge.reportUi({ inventory: false, character: false, stash: false, ...panels });
      block(true, { bridge, world });
      expect(mayOpen()).toBe(false);
      block(false, { bridge, world });
      expect(mayOpen()).toBe(true);
    }
  });

  it("should let the window take no keys with no world reported", () => {
    const { bridge, built, report, leave } = onSlot();
    report(aWorld("hub"));
    const { mayOpen } = built[0].wiring;
    leave("hub");
    expect(bridge.world).toBeNull();
    expect(mayOpen()).toBe(false);
  });

  it("should keep the draft while the world's letter panel holds the keys (FS-1GZGD R40)", () => {
    const { built, report } = onSlot();
    const hub = aWorld("hub");
    report(hub);
    const { keepsDraft } = built[0].wiring;
    expect(keepsDraft()).toBe(false);
    hub.windows.letter = true;
    expect(keepsDraft()).toBe(true);
  });
});

describe("a draft with a gear panel opening and closing (FS-KBA4Q R18, R19)", () => {
  /** The input as the window builds it, on the slot's wiring, read once a frame as `watchKeys` reads it. */
  function typingIn(world: ReturnType<typeof aWorld>) {
    const at = onSlot();
    at.report(world);
    const field = {
      value: "",
      channel: "area" as const,
      focused: false,
      focus: () => void (field.focused = true),
      blur: () => void (field.focused = false),
    };
    const { mayOpen, keepsDraft } = at.built[0].wiring;
    // the UI scene's keyboard, which hears I, B, C, E, Q and Esc for the gear overlay
    const keyboard = { enabled: true, resets: 0, resetKeys: () => void keyboard.resets++ };
    const input = new ChatInput({ field, keyboard: () => keyboard, mayOpen, keepsDraft, send: () => {} });
    input.sync();
    const open = () => {
      const opened = input.requestOpen();
      if (opened) input.focused();
      return opened;
    };
    return { ...at, field, keyboard, input, open };
  }

  it.each<[string, Partial<UiState>, Partial<UiState>]>([
    ["the inventory", { inventory: true }, { inventory: false }],
    ["the character panel", { character: true }, { character: false }],
    ["the stash", { inventory: true, stash: true }, { inventory: false, stash: false }],
  ])("should keep a half-typed line and the open input as %s opens and closes", (_label, opens, closes) => {
    const { bridge, field, input } = typingIn(aWorld("hub"));
    input.requestOpen();
    input.focused();
    field.value = "look at th";

    for (const ui of [opens, closes]) {
      bridge.reportUi(ui);
      // the row is neither hidden nor shown again: nothing changed for the window
      expect(input.sync()).toBeUndefined();
      expect([field.value, input.isOpen(), field.focused]).toEqual(["look at th", true, true]);
    }
  });

  it.each<[string, Partial<UiState>]>([
    ["the inventory", { inventory: true }],
    ["the character panel", { character: true }],
    ["the stash", { inventory: true, stash: true }],
  ])("should keep a draft let go of as %s opens, and open on it under the panel", (_label, opens) => {
    const { bridge, field, input, open } = typingIn(aWorld("field"));
    open();
    field.value = "half";
    // the press that opened the panel let go of the field (FS-TQZ5J R131)
    field.blur();
    input.blurred();

    bridge.reportUi(opens);
    expect(input.sync()).toBeUndefined();
    expect(field.value).toBe("half");
    expect(open()).toBe(true);
    expect([field.value, input.isOpen()]).toEqual(["half", true]);
  });

  it("should give the keys to the field alone while typing under open panels, and back to the overlay on Esc (R20, R22)", () => {
    const { bridge, field, keyboard, input, open } = typingIn(aWorld("hub"));
    bridge.reportUi({ inventory: true, character: true });
    expect(keyboard.enabled).toBe(true);

    // Enter, which the overlay never used, opens chat: the overlay's keyboard is off and its held keys let go
    expect(open()).toBe(true);
    expect([keyboard.enabled, keyboard.resets]).toEqual([false, 1]);
    field.value = "ibceq";

    // Esc is the field's: the input closes and the draft goes, the panels stay, and the keys are the overlay's again
    input.keyDown("Escape", false);
    expect([input.isOpen(), field.value, keyboard.enabled]).toEqual([false, "", true]);
    expect([bridge.ui.inventory, bridge.ui.character]).toEqual([true, true]);
  });

  it("should still drop the draft as the menu or the world takes the keys, a panel open or not (R21)", () => {
    const world = aWorld("run");
    const { bridge, field, input, open } = typingIn(world);
    bridge.reportUi({ inventory: true });
    open();
    field.value = "half";
    world.blockers.chat = true;
    expect(input.sync()).toBe(false);
    expect([field.value, input.isOpen()]).toEqual(["", false]);

    world.blockers.chat = false;
    input.sync();
    open();
    field.value = "again";
    bridge.reportUi({ menuOpen: true });
    expect(input.sync()).toBe(false);
    expect([field.value, input.isOpen()]).toEqual(["", false]);
  });
});

describe("the player typing, in the UI's state (FS-TQZ5J § Change: Batch 6, R127)", () => {
  it("should report typing to the world as the input opens and closes", () => {
    const { bridge, built, report } = onSlot();
    const field = aWorld("field");
    report(field);
    built[0].wiring.typing(true);
    expect(bridge.ui.typing).toBe(true);
    built[0].wiring.typing(false);
    expect(bridge.ui.typing).toBe(false);
    expect(field.heard).toEqual([true, false]);
  });

  it("should play through the UI scene's one player", () => {
    const { bridge, built, report } = onSlot();
    const played: string[] = [];
    bridge.lendSounds({ act: (run) => run(), play: (effect) => void played.push(effect) });
    report(aWorld("hub"));
    built[0].wiring.play("menu_tab");
    expect(played).toEqual(["menu_tab"]);
  });
});

describe("the run's end while the player types (FS-TQZ5J § Change: Batch 6, R128)", () => {
  it("should cancel the line and hand the run its keyboard inside the run's change, before the run turns it off", () => {
    const bridge = new GameUiBridge();
    const held = new Map<string, unknown>();
    const registry = { get: (key: string) => held.get(key), set: (key: string, value: unknown) => void held.set(key, value) };
    lendUiBridge(registry, bridge);
    // the window as ChatWindow is: re-reading who owns the keys, and saying the player stopped typing
    let typing = false;
    const slot = new UiChatSlot(bridge, (wiring) => ({
      holds: () => false,
      link: () => {},
      fieldRow: () => null,
      keepsField: () => false,
      topEdge: () => 468,
      sync: () => {
        if (typing && !wiring.mayOpen()) wiring.typing((typing = false));
      },
      destroy: () => {},
    }));
    bridge.onWorld((report) => slot.show(report));
    const keyboard = { enabled: true, resetKeys: () => {} };
    let ended = false;
    reportWorld({ registry, events: new EventEmitter(), input: { keyboard } }, "run", {
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false, chat: ended }),
      facts: () => NO_FACTS,
      answer: () => {},
    });
    bridge.reportUi({ typing: (typing = true) });
    expect(keyboard.enabled).toBe(false);

    // the run's endRun: its end set, its change told, then its keyboard switched off for good
    ended = true;
    bridge.changed();
    expect([typing, keyboard.enabled]).toEqual([false, true]);
    keyboard.enabled = false;
    bridge.reportUi({ typing: false });
    expect(keyboard.enabled).toBe(false);
  });
});

describe("the window's top edge (FS-TQZ5J § Change: Batch 6, R132)", () => {
  it.each(["field", "run", "hub"] as const)("should be the standing window's top edge in the %s: the invites' floor is the world's to report", (world) => {
    const { slot, report } = onSlot();
    report(aWorld(world));
    expect(slot.topEdge()).toBe(468);
  });

  it("should be none with no window standing", () => {
    const { slot } = onSlot();
    expect(slot.topEdge()).toBeUndefined();
  });

});

// FS-KBA4Q §A (I-KBA4Q-6): the gear overlay's link press reaches the standing window through the slot
describe("the UI scene's chat slot taking an item link (FS-KBA4Q R3)", () => {
  const blade = { entity_id: "e-1", name: "Rusty Blade" } as import("@/types/gameState").ItemState;

  it("should hand a linked item to the window standing, and to none with no world reported", () => {
    const { slot, built, report, leave } = onSlot();
    expect(() => slot.link(blade)).not.toThrow();
    report(aWorld("hub"));
    slot.link(blade);
    expect(built[0].linked).toEqual(["Rusty Blade"]);
    leave("hub");
    slot.link(blade);
    expect(built[0].linked).toEqual(["Rusty Blade"]);
    report(aWorld("run"));
    slot.link(blade);
    expect(built[1].linked).toEqual(["Rusty Blade"]);
  });
});

// FS-KBA4Q review (round 1): the gear overlay's tips keep clear of the standing window's shown text field
describe("the UI scene's chat slot saying where its text field is shown (FS-KBA4Q)", () => {
  it("should say the standing window's, and nowhere while it is hidden or no window stands", () => {
    const { slot, built, report, leave } = onSlot();
    expect(slot.fieldRow()).toBeNull();
    report(aWorld("hub"));
    expect(slot.fieldRow()).toBeNull();
    built[0].field = { x: 109, y: 665, width: 232, height: 30 };
    expect(slot.fieldRow()).toEqual({ x: 109, y: 665, width: 232, height: 30 });
    leave("hub");
    expect(slot.fieldRow()).toBeNull();
  });
});
