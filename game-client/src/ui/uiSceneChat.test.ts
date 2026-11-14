import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventEmitter } from "eventemitter3";
import {
  GameUiBridge,
  NO_FACTS,
  lendUiBridge,
  reportWorld,
  type World,
  type WorldBlockers,
  type WorldReport,
  type WorldWindows,
} from "./uiBridge";
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
    expect(slot.keepsField(20, 600)).toBe(false);
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
    expect(slot.keepsField(20, 600)).toBe(true);
  });
});

describe("who owns Enter and Esc, and the draft (FS-TQZ5J § Change: Batch 6, R126)", () => {
  it("should let the window take the keys only with no menu, no gear panel and nothing the world turns it away for", () => {
    const { bridge, built, report } = onSlot();
    const run = aWorld("run");
    report(run);
    const { mayOpen } = built[0].wiring;
    expect(mayOpen()).toBe(true);
    bridge.reportUi({ menuOpen: true });
    expect(mayOpen()).toBe(false);
    bridge.reportUi({ menuOpen: false, inventory: true });
    expect(mayOpen()).toBe(false);
    bridge.reportUi({ inventory: false, character: true });
    expect(mayOpen()).toBe(false);
    bridge.reportUi({ character: false });
    run.blockers.chat = true;
    expect(mayOpen()).toBe(false);
    run.blockers.chat = false;
    expect(mayOpen()).toBe(true);
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

describe("the invite stack's floor (FS-TQZ5J § Change: Batch 6, R132)", () => {
  it.each([
    ["field", 468],
    ["run", 468],
    ["hub", undefined],
  ] as const)("should be the window's top edge in a %s: %s", (world, floor) => {
    const { slot, report } = onSlot();
    report(aWorld(world));
    expect(slot.floor()).toBe(floor);
  });

  it("should be none with no window standing", () => {
    const { slot } = onSlot();
    expect(slot.floor()).toBeUndefined();
  });
});

describe("the worlds leave chat to the UI scene (FS-TQZ5J § Change: Batch 6, R125, R129, R130, R132)", () => {
  const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

  it.each(["HubScene", "FieldScene", "BarrowspireScene"])("should import no chat window in %s, nor read one", (scene) => {
    const text = source(`../scenes/${scene}.ts`);
    expect(text).not.toMatch(/from "@\/ui\/ChatWindow"/);
    expect(text).not.toMatch(/chatWindow/);
    expect(text).not.toMatch(/panelTakes/);
    expect(text).not.toMatch(/chatTop/);
  });

  it("should leave the window no covered option, no overUi, and the mailbox no covers", () => {
    expect(source("ChatWindow.ts")).not.toMatch(/coveredAt|overUi/);
    expect(source("mailboxHud.ts")).not.toMatch(/covers\(/);
    expect(source("LetterPanel.ts")).not.toMatch(/covers\(/);
    expect(source("uiBridge.ts")).not.toMatch(/WorldLayout|chatTop/);
  });
});
