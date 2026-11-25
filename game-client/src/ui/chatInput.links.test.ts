import { describe, expect, it, vi } from "vitest";
import type { ChatChannel, ChatNoticePayload } from "@/stores/chatStore";
import type { ItemState } from "@/types/gameState";
import { CHAT_TEXT_MAX, ChatInput, type ChatInputField, type ChatSend } from "./chatInput";
import { itemSnapshot } from "@/chat/itemLinks";
import type { SceneKeyboard } from "./worldKeyboard";

// FS-KBA4Q §Requirements B (R9–R17), D (R24); §Acceptance Criteria "Client: linking". I-KBA4Q-5:
// the chat input holds links beside the draft and sends them, on a stand-in for the text field
// that keeps a caret as a browser field does.

const item = (name: string, more: Partial<ItemState> = {}): ItemState => ({
  item_id: `id-${name}`,
  entity_id: `entity-${name}`,
  name,
  quantity: 1,
  item_type: "weapon",
  attack_power: 5,
  durability: 9,
  status: "AVAILABLE",
  unsafe: true,
  ...more,
});

const sword = item("Rusty Blade");
const helm = item("Iron Helm", { item_type: "armor", armor_slot: "head", attack_power: undefined, defense_rating: 3 });
const ring = item("Band", { item_type: "ring", attack_power: undefined });

/** A field as the browser's: a write puts the caret at the end, and a blurred field keeps its caret. */
function caretField() {
  let value = "";
  const field = {
    channel: "area" as ChatChannel,
    isFocused: false,
    composing: false,
    selection: { start: 0, end: 0 },
    onFocus: () => {},
    onBlur: () => {},
    get value() {
      return value;
    },
    set value(v: string) {
      value = v;
      this.selection = { start: v.length, end: v.length };
    },
    focus() {
      if (this.isFocused) return;
      this.isFocused = true;
      this.onFocus();
    },
    blur() {
      if (!this.isFocused) return;
      this.isFocused = false;
      this.onBlur();
    },
    /** The player types `text` at the caret. */
    type(text: string) {
      const { start, end } = this.selection;
      value = value.slice(0, start) + text + value.slice(end);
      this.selection = { start: start + text.length, end: start + text.length };
    },
    caretAt(start: number, end = start) {
      this.selection = { start, end };
    },
  };
  return field satisfies ChatInputField;
}

function rig(open: ChatChannel[] = ["area", "whisper"]) {
  let allowed = true;
  let kept = false;
  const field = caretField();
  const keyboard: SceneKeyboard = { enabled: true, resetKeys: vi.fn() };
  const sends: ChatSend[] = [];
  const played: string[] = [];
  const notices: ChatNoticePayload[] = [];
  const sent: string[] = [];
  const input = new ChatInput({
    field,
    keyboard: () => keyboard,
    mayOpen: () => allowed,
    keepsDraft: () => kept,
    send: (line) => void sends.push(line),
    open: new Set(open),
    play: (effect) => void played.push(effect),
    notice: (notice) => void notices.push(notice),
    recall: { lines: () => sent, remember: (line) => void sent.push(line) },
  });
  field.onFocus = () => input.focused();
  field.onBlur = () => input.blurred();
  input.sync();
  return {
    input,
    field,
    sends,
    played,
    notices,
    /** The player types at the caret, and the field reports it. */
    type(text: string) {
      field.type(text);
      input.typed(false);
    },
    /** The player rewrites the whole draft. */
    retype(text: string) {
      field.value = text;
      input.typed(false);
    },
    enter: () => input.keyDown("Enter", false),
    /** Something takes the keys: by a press elsewhere (`keeping`), or not. */
    take(keeping = false) {
      allowed = false;
      kept = keeping;
      input.sync();
    },
    giveBack() {
      allowed = true;
      kept = false;
      input.sync();
    },
    refuse: () => {
      allowed = false;
    },
  };
}

describe("ChatInput.link: the token at the caret (R3, R9)", () => {
  it("should open a closed input with [Name] in it and the caret after it", () => {
    const { input, field } = rig();

    input.link(sword);

    expect(field.value).toBe("[Rusty Blade]");
    expect(field.isFocused).toBe(true);
    expect(input.isOpen()).toBe(true);
    expect(field.selection).toEqual({ start: 13, end: 13 });
  });

  it("should write the token between the two spaces of `hello  world`, with no space added", () => {
    const r = rig();
    r.input.requestOpen();
    r.retype("hello  world");
    r.field.caretAt(6);

    r.input.link(sword);

    expect(r.field.value).toBe("hello [Rusty Blade] world");
    expect(r.field.selection).toEqual({ start: 19, end: 19 });
  });

  it("should replace a selection with the token", () => {
    const r = rig();
    r.input.requestOpen();
    r.retype("look at THIS now");
    r.field.caretAt(8, 12);

    r.input.link(sword);

    expect(r.field.value).toBe("look at [Rusty Blade] now");
    expect(r.field.selection).toEqual({ start: 21, end: 21 });
  });

  it("should use the caret a closed field last had", () => {
    const r = rig();
    r.input.requestOpen();
    r.retype("ab");
    r.field.caretAt(1);
    r.field.blur();
    expect(r.input.isOpen()).toBe(false);

    r.input.link(ring);

    expect(r.field.value).toBe("a[Band]b");
    expect(r.input.isOpen()).toBe(true);
  });

  it("should leave an open input open and focused, the draft holding the token", () => {
    const r = rig();
    r.input.requestOpen();
    r.type("see ");

    r.input.link(sword);

    expect(r.field.isFocused).toBe(true);
    expect(r.input.isOpen()).toBe(true);
    expect(r.field.value).toBe("see [Rusty Blade]");
  });

  it("should write at the draft's end on a field that reports no caret", () => {
    const r = rig();
    r.retype("see ");
    (r.field as { selection?: unknown }).selection = undefined;

    r.input.link(sword);

    expect(r.field.value).toBe("see [Rusty Blade]");
  });

  it("should pick the channel the draft's prefix names once the token is in", () => {
    const r = rig();
    r.retype("@Bob ");

    r.input.link(sword);

    expect(r.field.channel).toBe("whisper");
    r.enter();
    expect(r.sends[0]).toEqual({
      channel: "whisper",
      target: "Bob",
      text: "[Rusty Blade]",
      items: [itemSnapshot(sword)],
    });
  });

  it("should tell the window the draft changed", () => {
    const changed = vi.fn();
    const field = caretField();
    const input = new ChatInput({
      field,
      keyboard: () => null,
      mayOpen: () => true,
      send: vi.fn(),
      changed,
    });

    input.link(sword);

    expect(changed).toHaveBeenCalled();
  });
});

describe("ChatInput.link: where it does nothing", () => {
  it("should change nothing with the input closed while chat may not open (R7)", () => {
    const r = rig();
    r.retype("kept");
    r.refuse();

    r.input.link(sword);

    expect(r.field.value).toBe("kept");
    expect(r.field.isFocused).toBe(false);
    expect(r.played).toEqual([]);
    expect(r.notices).toEqual([]);
  });

  it("should be ignored while an input method composes, the composing text untouched", () => {
    const r = rig();
    r.input.requestOpen();
    r.field.type("ni");
    r.field.composing = true;

    r.input.link(sword);

    expect(r.field.value).toBe("ni");
    r.field.composing = false;
    r.retype("你");
    r.enter();
    expect(r.sends).toEqual([{ channel: "area", text: "你" }]);
  });

  it.each([
    ["no name", ""],
    ["a bracket in its name", "Blade [old]"],
    ["a line break in its name", "Rusty\nBlade"],
  ])("should do nothing, silently, for an item with %s (R13)", (_what, name) => {
    const r = rig();

    r.input.link(item(name));

    expect(r.field.value).toBe("");
    expect(r.input.isOpen()).toBe(false);
    expect(r.played).toEqual([]);
    expect(r.notices).toEqual([]);
  });
});

describe("ChatInput.link: the limits (R11, R12)", () => {
  it("should refuse a fourth link: nothing inserted, menu_error, the client-held line, nothing sent", () => {
    const r = rig();
    r.input.link(sword);
    r.input.link(helm);
    r.input.link(ring);
    const before = r.field.value;

    r.input.link(sword);

    expect(r.field.value).toBe(before);
    expect(r.played).toEqual(["menu_error"]);
    expect(r.notices).toEqual([{ code: "too_many_links", text: "Three items to a line, no more." }]);
    expect(r.sends).toEqual([]);
  });

  it("should take a link over one of three: the one it replaces is no longer counted", () => {
    const r = rig();
    r.input.link(sword);
    r.input.link(helm);
    r.input.link(ring);
    r.field.caretAt(0, "[Rusty Blade]".length);

    r.input.link(ring);
    r.enter();

    expect(r.played).toEqual([]);
    expect(r.sends[0].text).toBe("[Band][Iron Helm][Band]");
    expect(r.sends[0].items).toEqual([itemSnapshot(ring), itemSnapshot(helm), itemSnapshot(ring)]);
  });

  it("should take a link again once one of three is broken, and send the three that pair", () => {
    const r = rig();
    r.input.link(sword);
    r.input.link(helm);
    r.input.link(ring);
    r.retype("[Rusty Blad][Iron Helm][Band]");

    r.input.link(sword);
    r.enter();

    expect(r.played).toEqual([]);
    expect(r.sends[0].text).toBe("[Rusty Blad][Iron Helm][Band][Rusty Blade]");
    expect(r.sends[0].items).toEqual([itemSnapshot(helm), itemSnapshot(ring), itemSnapshot(sword)]);
  });

  it("should refuse a token that would take the draft past 200 code points, never cutting it short", () => {
    const r = rig();
    r.input.requestOpen();
    const draft = "龍".repeat(CHAT_TEXT_MAX - 12);
    r.retype(draft);

    r.input.link(sword);

    expect(r.field.value).toBe(draft);
    expect(r.played).toEqual(["menu_error"]);
    expect(r.notices).toEqual([{ code: "link_too_long", text: "No room left in this line for that item." }]);

    r.retype(draft.slice(1));
    r.input.link(sword);
    expect(Array.from(r.field.value)).toHaveLength(CHAT_TEXT_MAX);
    expect(r.field.value.endsWith("[Rusty Blade]")).toBe(true);
  });

  it("should refuse any link on a draft at 200 code points", () => {
    const r = rig();
    r.retype("x".repeat(CHAT_TEXT_MAX));

    r.input.link(ring);

    expect(r.field.value).toBe("x".repeat(CHAT_TEXT_MAX));
    expect(r.notices.map((n) => n.code)).toEqual(["link_too_long"]);
  });

  it("should count a whisper's message alone, its @Name and the space aside", () => {
    const r = rig();
    const head = "@Bob ";
    r.retype(head + "x".repeat(CHAT_TEXT_MAX - 13));

    r.input.link(sword);

    expect(r.field.value).toBe(`${head}${"x".repeat(CHAT_TEXT_MAX - 13)}[Rusty Blade]`);
    expect(r.notices).toEqual([]);
    r.input.link(ring);
    expect(r.notices.map((n) => n.code)).toEqual(["link_too_long"]);
  });

  it("should not open a closed input for a refused link", () => {
    const r = rig();
    r.retype("x".repeat(CHAT_TEXT_MAX));

    r.input.link(sword);

    expect(r.input.isOpen()).toBe(false);
  });
});

describe("ChatInput sending held links (R10, R14, R17, R24)", () => {
  it("should send the snapshot with the line, and no id, instance, status, unsafe mark, quantity or durability", () => {
    const r = rig();
    r.input.link(sword);
    r.type(" for sale");

    r.enter();

    expect(r.sends).toEqual([
      {
        channel: "area",
        text: "[Rusty Blade] for sale",
        items: [{ name: "Rusty Blade", item_type: "weapon", attack_power: 5 }],
      },
    ]);
    for (const key of ["item_id", "entity_id", "status", "unsafe", "quantity", "durability"])
      expect(r.sends[0].items?.[0]).not.toHaveProperty(key);
  });

  it("should send a line with no link exactly as before, with no items member", () => {
    const r = rig();
    r.input.requestOpen();
    r.type("hello [not a link]");

    r.enter();

    expect(r.sends).toEqual([{ channel: "area", text: "hello [not a link]" }]);
    expect(r.sends[0]).not.toHaveProperty("items");
  });

  it("should hold links in text order: one inserted before an earlier one is sent before it", () => {
    const r = rig();
    r.input.link(sword);
    r.field.caretAt(0);
    r.input.link(helm);

    r.enter();

    expect(r.sends[0].text).toBe("[Iron Helm][Rusty Blade]");
    expect(r.sends[0].items).toEqual([itemSnapshot(helm), itemSnapshot(sword)]);
  });

  it("should send no snapshot for a token edited inside its brackets, the characters sent as text", () => {
    const r = rig();
    r.input.link(sword);
    r.type(" ");
    r.input.link(helm);
    r.retype("[Rusty Blad] [Iron Helm]");

    r.enter();

    expect(r.sends[0]).toEqual({ channel: "area", text: "[Rusty Blad] [Iron Helm]", items: [itemSnapshot(helm)] });
  });

  it("should send no snapshot for a deleted token", () => {
    const r = rig();
    r.input.link(sword);
    r.type(" ");
    r.input.link(helm);
    r.retype("look: [Iron Helm]");

    r.enter();

    expect(r.sends[0].items).toEqual([itemSnapshot(helm)]);
  });

  it("should send a line whose every link was broken with no items", () => {
    const r = rig();
    r.input.link(sword);
    r.retype("[Rusty Blade");

    r.enter();

    expect(r.sends).toEqual([{ channel: "area", text: "[Rusty Blade" }]);
  });

  it("should pair a token typed back exactly", () => {
    const r = rig();
    r.input.link(sword);
    r.retype("[Rusty]");
    r.retype("[Rusty Blade]");

    r.enter();

    expect(r.sends[0].items).toEqual([itemSnapshot(sword)]);
  });

  it("should send two snapshots for the same item linked twice", () => {
    const r = rig();
    r.input.link(sword);
    r.input.link(sword);

    r.enter();

    expect(r.sends[0].text).toBe("[Rusty Blade][Rusty Blade]");
    expect(r.sends[0].items).toEqual([itemSnapshot(sword), itemSnapshot(sword)]);
  });

  it("should send A's snapshot for the first token and B's for the second, for two items of one name", () => {
    const a = item("Twin", { attack_power: 1 });
    const b = item("Twin", { attack_power: 2 });
    const r = rig();
    r.input.link(a);
    r.type(" ");
    r.input.link(b);

    r.enter();

    expect(r.sends[0].items?.map((s) => s.attack_power)).toEqual([1, 2]);
  });

  it("should show the item clicked for a token, not one of the same name whose token was deleted before", () => {
    const a = item("Twin", { attack_power: 1 });
    const b = item("Twin", { attack_power: 2 });
    const r = rig();
    r.input.link(a);
    r.retype("");
    r.input.link(b);

    r.enter();

    expect(r.sends[0].items?.map((s) => s.attack_power)).toEqual([2]);
  });

  it("should let go the link whose token a link press replaces, so the survivor of the same name keeps its own item", () => {
    const a1 = item("Rusty Blade", { attack_power: 1 });
    const a2 = item("Rusty Blade", { attack_power: 2 });
    const r = rig();
    r.input.link(a1);
    r.type(" ");
    r.input.link(a2);
    // the first token selected, and another item linked over it
    r.field.caretAt(0, "[Rusty Blade]".length);
    r.input.link(helm);

    r.enter();

    expect(r.sends[0].text).toBe("[Iron Helm] [Rusty Blade]");
    expect(r.sends[0].items).toEqual([itemSnapshot(helm), itemSnapshot(a2)]);
  });

  it("should let go the link whose token the caret splits, so the item just linked is sent as a link", () => {
    const a1 = item("A", { attack_power: 1 });
    const a2 = item("A", { attack_power: 2 });
    const r = rig();
    r.input.link(a1);
    r.input.link(a2);
    r.field.caretAt(2);
    r.input.link(ring);

    r.enter();

    expect(r.sends[0].text).toBe("[A[Band]][A]");
    expect(r.sends[0].items).toEqual([itemSnapshot(ring), itemSnapshot(a2)]);
  });

  it("should let go a link whose token a selection covers only in part", () => {
    const r = rig();
    r.input.link(sword);
    r.type(" and ");
    r.input.link(sword);
    // from inside the first token to the middle of the words after it
    r.field.caretAt(7, 15);
    r.input.link(helm);

    r.enter();

    expect(r.sends[0].text).toBe("[Rusty [Iron Helm]nd [Rusty Blade]");
    expect(r.sends[0].items).toEqual([itemSnapshot(helm), itemSnapshot(sword)]);
  });

  it("should keep the links whose tokens a link press only touches: the caret between two tokens", () => {
    const a1 = item("A", { attack_power: 1 });
    const a2 = item("A", { attack_power: 2 });
    const r = rig();
    r.input.link(a1);
    r.input.link(a2);
    r.field.caretAt(3);
    r.input.link(ring);

    r.enter();

    expect(r.sends[0].text).toBe("[A][Band][A]");
    expect(r.sends[0].items).toEqual([itemSnapshot(a1), itemSnapshot(ring), itemSnapshot(a2)]);
  });

  it("should pair against the text as it is sent: a token in a whisper's name is no link", () => {
    const r = rig();
    r.retype("@");
    r.input.link(ring);
    r.type(" hi ");
    r.input.link(sword);

    r.enter();

    expect(r.sends[0]).toEqual({
      channel: "whisper",
      target: "[Band]",
      text: "hi [Rusty Blade]",
      items: [itemSnapshot(sword)],
    });
  });

  it("should keep the snapshot as it stood at the press, whatever the item becomes", () => {
    const worn = item("Old Axe", { attack_power: 7 });
    const r = rig();
    r.input.link(worn);
    worn.attack_power = 99;
    worn.name = "Renamed";

    r.enter();

    expect(r.sends[0].items).toEqual([{ name: "Old Axe", item_type: "weapon", attack_power: 7 }]);
  });

  it("should hold no link after a send", () => {
    const r = rig();
    r.input.link(sword);
    r.enter();

    r.type("[Rusty Blade]");
    r.enter();

    expect(r.sends[1]).toEqual({ channel: "area", text: "[Rusty Blade]" });
  });

  it("should keep the held links with a whisper draft refused for having no message", () => {
    const r = rig();
    r.retype("@");
    r.input.link(ring);
    r.enter();
    expect(r.sends).toEqual([]);
    expect(r.played).toEqual(["menu_error"]);

    r.retype("@Bob [Band]");
    r.enter();

    expect(r.sends[0].items).toEqual([itemSnapshot(ring)]);
  });
});

describe("ChatInput dropping and keeping held links (R15)", () => {
  /** Typing the token again after the draft went: a link only if its held link survived. */
  function retypedItems(r: ReturnType<typeof rig>) {
    r.input.requestOpen();
    r.retype("[Rusty Blade]");
    r.enter();
    return r.sends.at(-1)?.items;
  }

  it("should drop the held links with the draft on Esc", () => {
    const r = rig();
    r.input.link(sword);

    r.input.keyDown("Escape", false);

    expect(r.field.value).toBe("");
    expect(retypedItems(r)).toBeUndefined();
  });

  it("should drop them when the scene cancels the input, open or closed", () => {
    const open = rig();
    open.input.link(sword);
    open.input.cancel();
    expect(retypedItems(open)).toBeUndefined();

    const closed = rig();
    closed.input.link(sword);
    closed.field.blur();
    closed.input.cancel();
    expect(retypedItems(closed)).toBeUndefined();
  });

  it("should drop them when the keys are taken mid-line", () => {
    const r = rig();
    r.input.link(sword);

    r.take();
    r.giveBack();

    expect(r.field.value).toBe("");
    expect(retypedItems(r)).toBeUndefined();
  });

  it("should keep both the draft and its links through a press in the world", () => {
    const r = rig();
    r.input.link(sword);

    r.field.blur();
    r.input.requestOpen();
    r.enter();

    expect(r.sends[0]).toEqual({ channel: "area", text: "[Rusty Blade]", items: [itemSnapshot(sword)] });
  });

  it("should keep both while the letter panel holds the keys", () => {
    const r = rig();
    r.input.link(sword);

    r.take(true);
    r.giveBack();
    r.input.requestOpen();
    r.enter();

    expect(r.sends[0].items).toEqual([itemSnapshot(sword)]);
  });

  it("should drop them on Enter with nothing typed", () => {
    const r = rig();
    r.input.link(sword);
    r.retype("  ");

    r.enter();

    expect(r.input.isOpen()).toBe(false);
    expect(retypedItems(r)).toBeUndefined();
  });
});

describe("ChatInput recall and held links (R16)", () => {
  function spoken() {
    const r = rig();
    r.input.link(sword);
    r.enter();
    return r;
  }

  it("should send a recalled line with no items: its [Name] is ordinary text", () => {
    const r = spoken();

    r.input.keyDown("ArrowUp", false);
    expect(r.field.value).toBe("[Rusty Blade]");
    r.enter();

    expect(r.sends[1]).toEqual({ channel: "area", text: "[Rusty Blade]" });
  });

  it("should give the half-typed draft back with its links past the newest line", () => {
    const r = spoken();
    r.type("mine: ");
    r.input.link(helm);

    r.input.keyDown("ArrowUp", false);
    r.input.keyDown("ArrowDown", false);
    expect(r.field.value).toBe("mine: [Iron Helm]");
    r.enter();

    expect(r.sends[1]).toEqual({ channel: "area", text: "mine: [Iron Helm]", items: [itemSnapshot(helm)] });
  });

  it("should not lend the draft's links to a recalled line of the same words", () => {
    const r = spoken();
    r.input.link(sword);

    r.input.keyDown("ArrowUp", false);
    r.enter();

    expect(r.sends[1]).toEqual({ channel: "area", text: "[Rusty Blade]" });
  });

  it("should make a recalled line the player's own once a link is put in it", () => {
    const r = spoken();
    r.input.keyDown("ArrowUp", false);

    r.input.link(helm);
    r.enter();

    expect(r.sends[1]).toEqual({
      channel: "area",
      text: "[Rusty Blade][Iron Helm]",
      items: [itemSnapshot(helm)],
    });
  });
});
