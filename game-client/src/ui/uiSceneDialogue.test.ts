import { describe, expect, it } from "vitest";
import { BARROW_HEX } from "@/utils/theme";
import type { DialogueCardSpec } from "./npcDialogue";
import {
  GameUiBridge,
  NO_FACTS,
  answering,
  type DialogueOption,
  type ShownDialogue,
  type UiRequest,
  type WorldReport,
} from "./uiBridge";
import { UiDialogueSlot } from "./uiSceneDialogue";

// FS-TQZ5J Amendment A2 R29–R32 (I-TQZ5J-7): the town's NPC dialogue card is the UI scene's, drawn
// from the plain data the town hands over (speaker, text, options with their register and whether
// they can be picked now); a row picked, by the pointer or its key, is the id handed back as a
// request; the same card again retones in place, any other replaces it; it goes with its world.

/** The town as it reports itself, and the requests it was asked. */
function aTown() {
  const asked: UiRequest[] = [];
  const report: WorldReport = {
    world: "hub",
    windows: () => ({ letter: false, party: false, inventory: false, character: false }),
    blockers: () => ({ dialogue: true }),
    facts: () => NO_FACTS,
    answer: (request) => void asked.push(request),
  };
  return { report, asked };
}

/** A drawn card, as `showDialogueCard` would answer for it. */
interface Drawn {
  spec: DialogueCardSpec;
  retones: number;
  relayouts: number;
  destroyed: boolean;
}

/** The UI scene's dialogue slot on the game's bridge, drawing on a recording card. */
function onBridge() {
  const bridge = new GameUiBridge();
  const drawn: Drawn[] = [];
  const slot = new UiDialogueSlot(bridge, (spec) => {
    const d: Drawn = { spec, retones: 0, relayouts: 0, destroyed: false };
    drawn.push(d);
    return {
      container: { destroy: () => void (d.destroyed = true) },
      retone: () => void d.retones++,
      relayout: () => void d.relayouts++,
    };
  });
  const live = () => drawn.filter((d) => !d.destroyed);
  const shown = () => live()[0];
  /** A press on a drawn row, as its hit area answers it: only while it can be picked (menuOption). */
  const press = (id: string) => {
    const row = shown()!.spec.rows.find((r) => r.id === id)!;
    if (row.enabled?.() ?? true) row.onPick();
  };
  const key = (pressed: Partial<{ confirm: boolean; numbered: number }>) =>
    slot.keys({ confirm: false, numbered: -1, ...pressed });
  return { bridge, slot, drawn, live, shown, press, key };
}

const option = (id: string, label: string, extra: Partial<DialogueOption> = {}): DialogueOption => ({
  id,
  label,
  register: "actionable",
  enabled: true,
  ...extra,
});

/** The Spire's door, as the town hands it over: three ways and Not yet; `waiting` held back. */
function door(waiting?: string, text = "The Spire's door stands open."): ShownDialogue {
  return {
    speaker: { name: "The Spire's door" },
    text,
    options: [
      option("solo", "Descend alone", { enabled: waiting !== "solo" }),
      option("queue", "Wait for company", { enabled: waiting !== "queue" }),
      option("enter", "Enter as a party", { enabled: waiting !== "enter" }),
      option("dismiss", "Not yet", { register: "cancel" }),
    ],
  };
}

describe("the dialogue card drawn from the town's data (FS-TQZ5J A2 R29, R32)", () => {
  it("should draw the speaker, the line and each option as a row, its key on its label by today's rule", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);

    t.slot.show({
      speaker: { name: "Elder", role: "Speaker for the town", portrait: { texture: "elder_se", frame: 0 } },
      text: "One grey morning a tower stood.",
      options: [option("on", "Go on"), option("farewell", "Farewell", { register: "cancel" })],
    });

    const spec = t.shown()!.spec;
    expect(spec.name).toBe("Elder");
    expect(spec.role).toBe("Speaker for the town");
    expect(spec.line).toBe("One grey morning a tower stood.");
    expect(spec.portrait).toEqual({ texture: "elder_se", frame: 0 });
    // one thing to do is E, the key that opened it; Esc always declines
    expect(spec.rows.map((r) => r.label)).toEqual(["Go on  [E]", "Farewell  [Esc]"]);
    expect(spec.rows.map((r) => r.id)).toEqual(["on", "farewell"]);
  });

  it("should number several actionable rows, amber, the cancel row arcane, dimmed where it cannot be picked, in the town's tones", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);

    t.slot.show(door("queue"));

    const rows = t.shown()!.spec.rows;
    expect(rows.map((r) => r.label)).toEqual([
      "Descend alone  [1]",
      "Wait for company  [2]",
      "Enter as a party  [3]",
      "Not yet  [Esc]",
    ]);
    expect(rows.map((r) => r.colour)).toEqual([BARROW_HEX.amber, BARROW_HEX.amber, BARROW_HEX.amber, BARROW_HEX.arcane]);
    expect(rows.map((r) => r.enabled?.() ?? true)).toEqual([true, false, true, true]);
    expect(t.shown()!.spec.tones).toEqual({
      panel: BARROW_HEX.charcoal,
      frame: BARROW_HEX.brass,
      text: BARROW_HEX.vellum,
      dim: BARROW_HEX.vellumDark,
      actionable: BARROW_HEX.amber,
      cancel: BARROW_HEX.arcane,
    });
  });

  it("should draw nothing while no world is reported", () => {
    const t = onBridge();

    t.slot.show(door());

    expect(t.drawn).toEqual([]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should retone in place a card with the same speaker, text and option ids, now with the second enabled", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.show(door("queue"));

    t.slot.show(door());

    expect(t.drawn).toHaveLength(1);
    expect(t.shown()!.retones).toBe(1);
    expect(t.shown()!.spec.rows.map((r) => r.enabled?.() ?? true)).toEqual([true, true, true, true]);
  });

  it("should replace a card with another text (a refusal said by the door, a page turned)", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.show(door());

    t.slot.show(door(undefined, "Form a party first."));

    expect(t.drawn).toHaveLength(2);
    expect(t.drawn[0].destroyed).toBe(true);
    expect(t.shown()!.spec.line).toBe("Form a party first.");
  });

  it("should replace a card with other options or another speaker", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.show(door());

    t.slot.show({ ...door(), options: door().options.slice(1) });
    t.slot.show({ ...door(), options: door().options.slice(1), speaker: { name: "Wren" } });

    expect(t.drawn).toHaveLength(3);
    expect(t.live()).toHaveLength(1);
  });

  it("should take the card down on the town's close, and on a close with none shown do nothing", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.show(null);
    t.slot.show(door());

    t.slot.show(null);

    expect(t.live()).toEqual([]);
    expect(t.slot.isOpen()).toBe(false);
  });

  it("should stand the card back in its corner on a new view", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.relayout();
    t.slot.show(door());

    t.slot.relayout();

    expect(t.shown()!.relayouts).toBe(1);
  });
});

describe("the dialogue card's answers, requests to the town (FS-TQZ5J A2 R30)", () => {
  it("should send pickDialogue with the id of a row pressed, and nothing for a dimmed one", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door("queue"));

    t.press("solo");
    t.press("queue");

    expect(town.asked).toEqual([{ kind: "pickDialogue", id: "solo" }]);
  });

  it("should send the cancel row's id when it is pressed: the town closes it as today", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door());

    t.press("dismiss");

    expect(town.asked).toEqual([{ kind: "pickDialogue", id: "dismiss" }]);
  });

  it("should keep the card and send its picks on while its town reports a change", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door());
    t.bridge.changed();
    t.slot.sync();

    t.press("solo");

    expect(town.asked).toEqual([{ kind: "pickDialogue", id: "solo" }]);
  });
});

describe("the dialogue card's keys, the UI scene's while it is shown (FS-TQZ5J A2 R31)", () => {
  it("should pick an actionable row by its number, the second the second id", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door());

    t.key({ numbered: 1 });

    expect(town.asked).toEqual([{ kind: "pickDialogue", id: "queue" }]);
  });

  it("should send nothing for a number on a dimmed row, or past the actionable rows", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door("queue"));

    t.key({ numbered: 1 });
    t.slot.show({ ...door(), options: door().options.slice(0, 1).concat(door().options.slice(3)) });
    t.key({ numbered: 2 });

    expect(town.asked).toEqual([]);
  });

  it("should pick the first actionable row on E or Enter, and nothing while it is dimmed", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door());

    t.key({ confirm: true });
    t.slot.show(door("solo"));
    t.key({ confirm: true });

    expect(town.asked).toEqual([{ kind: "pickDialogue", id: "solo" }]);
  });

  it("should close a card with nothing to confirm on E or Enter, as Esc does", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show({
      speaker: { name: "The Spire's door" },
      text: "The delve is gathering. Wait, or leave the queue.",
      options: [option("dismiss", "I'll wait", { register: "cancel" })],
    });

    t.key({ confirm: true });

    expect(town.asked).toEqual([{ kind: "close", window: "dialogue" }]);
  });

  it("should act on no key with no card shown", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);

    t.key({ confirm: true });
    t.key({ numbered: 0 });

    expect(town.asked).toEqual([]);
  });
});

describe("the dialogue card goes with its world (FS-TQZ5J A2 R32)", () => {
  it("should close, sending nothing, as its world leaves", () => {
    const t = onBridge();
    const town = aTown();
    t.bridge.report(town.report);
    t.slot.show(door());

    t.bridge.left("hub");
    t.slot.sync();

    expect(t.live()).toEqual([]);
    expect(town.asked).toEqual([]);
  });

  it("should close as another world reports, and keep standing while its own world reports a change", () => {
    const t = onBridge();
    t.bridge.report(aTown().report);
    t.slot.show(door());
    t.bridge.changed();
    t.slot.sync();
    expect(t.live()).toHaveLength(1);

    t.bridge.report(aTown().report);
    t.slot.sync();

    expect(t.live()).toEqual([]);
  });
});

describe("the town's answers to the card, by id (FS-TQZ5J A2 R30)", () => {
  it("should hand pickDialogue to the world's own answer for it, with the id", () => {
    const picked: string[] = [];
    const answer = answering({ pickDialogue: (id) => void picked.push(id) });

    answer({ kind: "pickDialogue", id: "solo" });
    answering({})({ kind: "pickDialogue", id: "solo" });

    expect(picked).toEqual(["solo"]);
  });
});
