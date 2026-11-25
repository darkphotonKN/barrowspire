import { describe, expect, it } from "vitest";
import type { ChatEntry, ChatLine } from "@/stores/chatStore";
import { contrastRatio } from "@/render/lighting/lighting";
import { palette } from "@/utils/canvasPalette";
import { cornerRowLeft } from "./hudCornerLayout";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_VISIBLE_LINES,
  CHAT_WINDOW_MARGIN,
  CHAT_WINDOW_W,
  CHAT_WINDOW_X,
  chatEntryColour,
  chatNameSpan,
  CHAT_FOLD_W,
  CHAT_FRAME_PAD,
  CHAT_LINES_GAP,
  CHAT_SCROLL_THUMB_MIN,
  chatFoldButton,
  chatFieldLabel,
  chatFieldRect,
  chatPickerList,
  chatPickerRect,
  CHAT_ROW_TEXT_H,
  CHAT_ROW_TEXT_PAD,
  rowTextY,
  chatScrollOffsetAt,
  chatScrollThumb,
  chatScrollTrack,
  chatTabSegments,
  wrapChatText,
  wrapChatSegments,
  chatEntrySegments,
  chatTagColour,
  CHAT_TAG_CUT,
  CHAT_TAG_GROUND_ALPHA,
  CHAT_TAG_PAD,
  CHAT_TAG_SPACE,
  type ChatRowPiece,
  type ChatSegment,
  chatWindowFrame,
  formatChatEntry,
  scrolledOffset,
  visibleEntries,
} from "./chatWindowLayout";
import { CHAT_SHOWN_CHANNELS } from "./chatInput";

// FS-WJGFJ §Requirements C18, C19, C21, C22, C29. I-WJGFJ-3: the window's geometry and the
// stream's presentation, as pure functions the Phaser class draws from.

const line = (text: string, i = 1): ChatEntry => ({
  kind: "line",
  message_id: `m${i}`,
  sender_id: "s",
  sender_name: "Wren",
  channel: "area",
  scope: "pod",
  sent_at: "2026-10-31T09:30:15.250Z",
  text,
});
const system = (text: string): ChatEntry => ({
  kind: "system",
  code: "too_fast",
  text,
});

describe("chatWindowFrame (C18, C19: where the window sits and its shape)", () => {
  it("should put the panel's bottom edge where the caller says and keep it 396 wide", () => {
    const frame = chatWindowFrame(10, 500);

    expect(frame.panel.x).toBe(10);
    expect(frame.panel.width).toBe(CHAT_WINDOW_W);
    // narrowed from 420 to mirror the corner row, asked 2026-11-24; the row's seventh icon, the class
    // book's (FS-X2CMM R36), widens it with the row
    expect(frame.panel.width).toBe(396);
    expect(frame.panel.y + frame.panel.height).toBe(500);
  });

  it("should end as far in from the left as the corner icon row reaches in from the right", () => {
    for (const view of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const frame = chatWindowFrame(CHAT_WINDOW_X, view.height - CHAT_WINDOW_MARGIN);

      expect(frame.panel.x + frame.panel.width).toBe(view.width - cornerRowLeft(view));
    }
  });

  it("should stack the filter row above the messages and the input below them, inset inside the carved frame", () => {
    const frame = chatWindowFrame(0, 400);
    const pad = CHAT_FRAME_PAD;

    expect(frame.filterRow.y).toBe(frame.panel.y + pad);
    expect(frame.messages.y).toBe(frame.filterRow.y + frame.filterRow.height);
    expect(frame.input.y).toBe(frame.messages.y + frame.messages.height);
    expect(frame.input.y + frame.input.height).toBe(
      frame.panel.y + frame.panel.height - pad,
    );
    for (const row of [frame.filterRow, frame.messages, frame.input]) {
      expect(row.x).toBe(frame.panel.x + pad);
      expect(row.width).toBe(frame.panel.width - pad * 2);
    }
  });

  it("should give the messages area room for the visible lines plus a gap above the input", () => {
    const frame = chatWindowFrame(0, 400);

    expect(frame.messages.height).toBe(
      CHAT_VISIBLE_LINES * frame.lineHeight + CHAT_LINES_GAP,
    );
    expect(CHAT_VISIBLE_LINES).toBe(8);
    expect(CHAT_LINES_GAP).toBeGreaterThan(0);
  });
});

describe("formatChatEntry (C22 as amended 2026-10-31, C29)", () => {
  it("should read Name: text, with no time", () => {
    expect(formatChatEntry(line("hello there"))).toBe("Wren: hello there");
  });

  it("should read a system line as a dash and the words, with no name and no time", () => {
    expect(formatChatEntry(system("That channel is not open yet."))).toBe(
      "— That channel is not open yet.",
    );
  });

  it("should leave markup in the text as characters", () => {
    expect(formatChatEntry(line("<b>x</b>"))).toContain("<b>x</b>");
  });
});

// FS-KCQ06 C14, I-KCQ06-3: a whisper reads From or To, by whether this player sent it
describe("formatChatEntry for a whisper (FS-KCQ06 C14)", () => {
  const whisper = (sender_id: string): ChatEntry => ({
    ...(line("meet me at the gate") as ChatLine),
    channel: "whisper",
    sender_id,
    sender_name: "Wren",
    scope: "p-kaelen",
    target_id: "p-kaelen",
    target_name: "Kaelen",
  });

  it("should read a whisper received as From Name: text", () => {
    expect(formatChatEntry(whisper("p-wren"), "p-kaelen")).toBe(
      "From Wren: meet me at the gate",
    );
  });

  it("should read this player's own whisper, the echo, as To Name: text", () => {
    expect(formatChatEntry(whisper("p-wren"), "p-wren")).toBe(
      "To Kaelen: meet me at the gate",
    );
  });

  it("should read a whisper as received while this player is not known", () => {
    expect(formatChatEntry(whisper("p-wren"))).toBe(
      "From Wren: meet me at the gate",
    );
  });

  it("should draw both in the whisper colour", () => {
    expect(chatEntryColour(whisper("p-wren"))).toBe(palette.chatWhisper);
  });

  it("should leave other channels' lines as Name: text whoever sent them", () => {
    expect(formatChatEntry(line("hi"), "s")).toBe("Wren: hi");
  });
});

// FS-KCQ06 C15, I-KCQ06-4: where a line's clickable name sits, measured from its drawn text
describe("chatNameSpan (FS-KCQ06 C15)", () => {
  // a stand-in font: every character 7px wide
  const measure = (s: string) => s.length * 7;
  const whisper = (sender_id: string): ChatEntry => ({
    ...(line("meet me at the gate") as ChatLine),
    channel: "whisper",
    sender_id,
    sender_name: sender_id === "p-wren" ? "Wren" : "Kaelen",
    scope: "x",
    target_id: sender_id === "p-wren" ? "p-kaelen" : "p-wren",
    target_name: sender_id === "p-wren" ? "Kaelen" : "Wren",
  });

  it.each([
    ["area", "area"],
    ["world", "world"],
    ["party", "party"],
  ] as const)(
    "should put the sender's name at the start of a %s line, as wide as it is drawn",
    (_label, channel) => {
      const entry = { ...(line("hi") as ChatLine), channel };
      expect(chatNameSpan(entry, "p-me", measure)).toEqual({
        name: "Wren",
        x: 0,
        width: 28,
      });
    },
  );

  it("should put a received whisper's sender after From", () => {
    expect(chatNameSpan(whisper("p-kaelen"), "p-wren", measure)).toEqual({
      name: "Kaelen",
      x: measure("From "),
      width: measure("Kaelen"),
    });
  });

  it("should put the echo's target after To", () => {
    expect(chatNameSpan(whisper("p-wren"), "p-wren", measure)).toEqual({
      name: "Kaelen",
      x: measure("To "),
      width: measure("Kaelen"),
    });
  });

  it("should give this player's own line no name to click", () => {
    expect(chatNameSpan(line("hi"), "s", measure)).toBeNull();
  });

  it("should give a system line no name to click", () => {
    expect(
      chatNameSpan(system("That player is not online."), "s", measure),
    ).toBeNull();
  });

  it("should measure the span from the very words the line draws", () => {
    const entry = whisper("p-kaelen");
    const span = chatNameSpan(entry, "p-wren", measure)!;
    const drawn = formatChatEntry(entry, "p-wren");
    expect(drawn.slice(0, span.x / 7)).toBe("From ");
    expect(drawn.slice(span.x / 7, (span.x + span.width) / 7)).toBe(span.name);
  });
});

describe("visibleEntries and scrolledOffset (C21: following and scrolling)", () => {
  const stream = Array.from({ length: 20 }, (_, i) => line(`l${i + 1}`, i + 1));

  it("should show the newest lines while following (offset 0)", () => {
    expect(visibleEntries(stream, 0).map((e) => e.text)).toEqual([
      "l13",
      "l14",
      "l15",
      "l16",
      "l17",
      "l18",
      "l19",
      "l20",
    ]);
  });

  it("should show the window one line further back per offset step", () => {
    expect(visibleEntries(stream, 3).map((e) => e.text)).toEqual([
      "l10",
      "l11",
      "l12",
      "l13",
      "l14",
      "l15",
      "l16",
      "l17",
    ]);
  });

  it("should show what there is when the stream is shorter than the window", () => {
    expect(visibleEntries(stream.slice(0, 3), 0).map((e) => e.text)).toEqual([
      "l1",
      "l2",
      "l3",
    ]);
  });

  it("should scroll back on wheel up and forward on wheel down, clamped to the stream", () => {
    expect(scrolledOffset(0, -100, stream.length)).toBe(1);
    expect(scrolledOffset(1, 100, stream.length)).toBe(0);
    expect(scrolledOffset(0, 100, stream.length)).toBe(0);
    expect(scrolledOffset(12, -100, stream.length)).toBe(12);
    expect(scrolledOffset(0, -100, 5)).toBe(0);
  });

  it("should keep a scrolled-back window still when a new line arrives, and keep following at the bottom", () => {
    const before = visibleEntries(stream, 3).map((e) => e.text);
    const longer = [...stream, line("l21", 21)];

    // scrolled back: the same offset from the end now shows newer lines, so the window must
    // move its offset by one to stay on the same lines
    expect(visibleEntries(longer, 4).map((e) => e.text)).toEqual(before);
    // following: the newest line is in view
    expect(visibleEntries(longer, 0).map((e) => e.text)).toContain("l21");
  });
});

describe("chat colours (C30: every channel reads on the panel)", () => {
  it("should clear 4.5:1 against the chat panel for every channel and the system line", () => {
    const colours = { ...CHAT_CHANNEL_COLOUR, system: palette.chatSystem };
    for (const [name, colour] of Object.entries(colours)) {
      expect(
        contrastRatio(colour, palette.chatPanel),
        `${name} on the panel`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("should clear 4.5:1 on a shown tab's ground and on the input row's ground too", () => {
    const colours = { ...CHAT_CHANNEL_COLOUR, system: palette.chatSystem };
    for (const ground of [palette.chatTabOn, palette.chatInputGround]) {
      for (const [name, colour] of Object.entries(colours)) {
        expect(
          contrastRatio(colour, ground),
          `${name} on ${ground.toString(16)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("should draw a system line in the system colour and a player's line in its channel's", () => {
    expect(chatEntryColour(system("x"))).toBe(palette.chatSystem);
    expect(
      chatEntryColour({ ...line("x"), channel: "trade" } as ChatEntry),
    ).toBe(palette.chatTrade);
  });
});

describe("chatWindowFrame folded (Amendment 2026-10-31: collapse)", () => {
  it("should fold down to the input row alone, its bottom edge where it was", () => {
    const open = chatWindowFrame(10, 500);
    const folded = chatWindowFrame(10, 500, true);

    expect(folded.input).toEqual(open.input);
    const pad = CHAT_FRAME_PAD;
    expect(folded.panel).toEqual({
      x: open.input.x - pad,
      y: open.input.y - pad,
      width: open.input.width + pad * 2,
      height: open.input.height + pad * 2,
    });
    expect(folded.messages.height).toBe(0);
    expect(folded.filterRow.height).toBe(0);
  });
});

describe("chatTabSegments (R24 as amended 2026-10-31: tab segments)", () => {
  it("should lay the shown segments edge to edge from the row's left, each as wide as its label needs", () => {
    const row = chatWindowFrame(10, 500).filterRow;
    const segments = chatTabSegments(row, (label) => label.length * 7);

    expect(segments.map((s) => s.channel)).toEqual([
      "area",
      "world",
      "party",
      "whisper",
    ]);
    expect(segments[0].x).toBe(row.x);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].x).toBe(segments[i - 1].x + segments[i - 1].width);
    }
    expect(
      segments.every((s) => s.y === row.y && s.height === row.height),
    ).toBe(true);
    expect(segments[3].width).toBeGreaterThan(segments[0].width);
  });

  it("should stop short of the fold button at the row's right end", () => {
    const row = chatWindowFrame(10, 500).filterRow;
    const last = chatTabSegments(row, (label) => label.length * 7).at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(
      row.x + row.width - CHAT_FOLD_W,
    );
  });
});

describe("chatFoldButton (asked 2026-10-31: the window's top-right corner)", () => {
  it("should sit at the tab row's right end while unfolded", () => {
    const frame = chatWindowFrame(10, 500);
    const button = chatFoldButton(frame);
    expect(button.x + button.width).toBe(
      frame.filterRow.x + frame.filterRow.width,
    );
    expect(button.y).toBe(frame.filterRow.y);
    expect(button.width).toBe(CHAT_FOLD_W);
  });

  it("should sit at the input row's right end while folded, still the window's top-right corner", () => {
    const frame = chatWindowFrame(10, 500, true);
    const button = chatFoldButton(frame);
    expect(button.x + button.width).toBe(frame.input.x + frame.input.width);
    expect(button.y).toBe(frame.input.y);
  });
});

describe("wrapChatText (asked 2026-10-31: fill a line before breaking)", () => {
  const measure = (s: string) => s.length * 10;

  it("should keep a line that fits on one line", () => {
    expect(wrapChatText("Wren: hi there", 200, measure)).toEqual([
      "Wren: hi there",
    ]);
  });

  it("should fill the first line with Chinese before breaking, not throw the sentence to the next line", () => {
    const lines = wrapChatText(
      "Wren: 這是一句很長很長而且沒有空白的中文訊息",
      120,
      measure,
    );
    // 12 characters at 10 each fill the 120 exactly; the sentence starts on the first line
    expect(lines[0]).toBe("Wren: 這是一句很長");
    expect(lines.every((l) => measure(l) <= 120)).toBe(true);
    expect(lines.join("")).toBe("Wren: 這是一句很長很長而且沒有空白的中文訊息");
  });

  it("should break latin text at the last space that fits", () => {
    expect(wrapChatText("Wren: one two three four", 120, measure)).toEqual([
      "Wren: one",
      "two three",
      "four",
    ]);
  });

  it("should break a single word too long for a line inside the word", () => {
    const lines = wrapChatText("aaaaaaaaaaaaaaaaaaaaaaaaa", 100, measure);
    expect(lines).toEqual(["aaaaaaaaaa", "aaaaaaaaaa", "aaaaa"]);
  });

  it("should return the empty line for empty text", () => {
    expect(wrapChatText("", 100, measure)).toEqual([""]);
  });
});

describe("chat scrollbar (asked 2026-10-31: drag back through old lines)", () => {
  const frame = chatWindowFrame(10, 600);
  const track = chatScrollTrack(frame);

  it("should run down the message area's right edge", () => {
    const m = frame.messages;
    expect(track.x + track.width).toBeLessThanOrEqual(m.x + m.width);
    expect(track.x).toBeGreaterThan(m.x + m.width - 12);
    expect(track.y).toBeGreaterThanOrEqual(m.y);
    expect(track.y + track.height).toBeLessThanOrEqual(m.y + m.height);
  });

  it("should have no thumb while every line fits", () => {
    expect(chatScrollThumb(track, 8, 0)).toBeNull();
    expect(chatScrollThumb(track, 3, 0)).toBeNull();
  });

  it("should size the thumb by how much is in view and sit it at the bottom while following", () => {
    const thumb = chatScrollThumb(track, 32, 0)!;
    expect(thumb.height).toBeCloseTo(track.height / 4);
    expect(thumb.y + thumb.height).toBeCloseTo(track.y + track.height);
  });

  it("should sit the thumb at the top when scrolled to the oldest line", () => {
    const thumb = chatScrollThumb(track, 32, 32 - 8)!;
    expect(thumb.y).toBeCloseTo(track.y);
  });

  it("should never make the thumb too small to grab", () => {
    const thumb = chatScrollThumb(track, 1000, 0)!;
    expect(thumb.height).toBeGreaterThanOrEqual(CHAT_SCROLL_THUMB_MIN);
  });

  it("should turn a dragged thumb's top back into an offset, oldest at the top, following at the bottom", () => {
    const total = 32;
    const thumb = chatScrollThumb(track, total, 0)!;
    expect(chatScrollOffsetAt(track, total, track.y)).toBe(total - 8);
    expect(
      chatScrollOffsetAt(track, total, track.y + track.height - thumb.height),
    ).toBe(0);
    expect(chatScrollOffsetAt(track, total, track.y - 50)).toBe(total - 8);
    expect(chatScrollOffsetAt(track, total, track.y + track.height + 50)).toBe(
      0,
    );
    const mid = chatScrollOffsetAt(
      track,
      total,
      track.y + (track.height - thumb.height) / 2,
    );
    expect(mid).toBeGreaterThan(8);
    expect(mid).toBeLessThan(16);
  });
});

describe("the canvas channel picker (FS-J267Q R1, R3)", () => {
  const frame = chatWindowFrame(10, 700);
  const input = frame.input;

  it("should sit at the input row's left, the row's height, the picker's width", () => {
    const picker = chatPickerRect(frame);
    expect(picker.x).toBeGreaterThanOrEqual(input.x);
    expect(picker.x).toBeLessThan(input.x + 8);
    expect(picker.y).toBe(input.y);
    expect(picker.height).toBe(input.height);
    expect(picker.width).toBe(84);
  });

  it("should give the text field the rest of the row right of the picker, and leave the fold button room while folded", () => {
    const picker = chatPickerRect(frame);
    const field = chatFieldRect(frame, false);
    expect(field.x).toBeGreaterThan(picker.x + picker.width);
    expect(field.y).toBe(input.y);
    expect(field.height).toBe(input.height);
    expect(field.x + field.width).toBeLessThanOrEqual(input.x + input.width);
    expect(field.x + field.width).toBeGreaterThan(input.x + input.width - 8);

    const shut = chatWindowFrame(10, 700, true);
    const folded = chatFieldRect(shut, true);
    expect(folded.x + folded.width).toBeLessThanOrEqual(
      shut.input.x + shut.input.width - CHAT_FOLD_W,
    );
  });

  it("should list the shown channels top to bottom, above the input row, inside the message area, clear of the field", () => {
    const list = chatPickerList(frame);
    expect(list.rows.map((r) => r.channel)).toEqual([...CHAT_SHOWN_CHANNELS]);
    expect(list.rows.map((r) => r.channel)).not.toContain("trade");
    // upward: the list ends above the input row, never over the field
    expect(list.box.y + list.box.height).toBeLessThanOrEqual(input.y);
    expect(list.box.y).toBeGreaterThanOrEqual(frame.messages.y);
    expect(list.box.x).toBe(chatPickerRect(frame).x);
    for (let i = 0; i < list.rows.length; i++) {
      const row = list.rows[i];
      expect(row.x).toBeGreaterThanOrEqual(list.box.x);
      expect(row.x + row.width).toBeLessThanOrEqual(
        list.box.x + list.box.width,
      );
      expect(row.y).toBeGreaterThanOrEqual(list.box.y);
      expect(row.y + row.height).toBeLessThanOrEqual(
        list.box.y + list.box.height,
      );
      if (i > 0)
        expect(row.y).toBeGreaterThanOrEqual(
          list.rows[i - 1].y + list.rows[i - 1].height,
        );
    }
  });
});

describe("rowTextY (the picker's and the list's words on their row)", () => {
  it.each([
    [{ x: 0, y: 100, width: 84, height: 30 }, 105],
    [{ x: 0, y: 40, width: 104, height: 24 }, 42],
  ])(
    "should set a padded 16 px line centred on %o, lifted by its padding",
    (rect, y) => {
      expect(rowTextY(rect)).toBe(y);
      // the padded box (16 + 2 * 2) sits inside the row
      expect(y).toBeGreaterThanOrEqual(rect.y);
      expect(y + CHAT_ROW_TEXT_H + CHAT_ROW_TEXT_PAD * 2).toBeLessThanOrEqual(
        rect.y + rect.height,
      );
    },
  );
});

describe("chatFieldLabel (FS-J267Q R7: the field names its channel)", () => {
  it.each([
    ["area", "Chat — Area"],
    ["world", "Chat — World"],
    ["party", "Chat — Party"],
    ["whisper", "Chat — Whisper"],
  ] as const)("should name %s as %s", (channel, label) => {
    expect(chatFieldLabel(channel)).toBe(label);
  });
});

describe("link tag tuning (FS-KBA4Q R34: named constants, a first pass)", () => {
  it("should start from the spec's first values", () => {
    expect(CHAT_TAG_GROUND_ALPHA).toBe(0.16);
    expect(CHAT_TAG_PAD).toBe(3);
    expect(CHAT_TAG_SPACE).toBe(3);
  });
});

describe("chatTagColour (FS-KBA4Q R33: the item tip's rarity tokens)", () => {
  it.each([
    ["normal", palette.rarity.common],
    ["uncommon", palette.rarity.uncommon],
    ["rare", palette.rarity.rare],
    ["runed", palette.rarity.epic],
    ["fabled", palette.rarity.legendary],
  ])("should draw a %s item in its rarity token", (rarity, colour) => {
    expect(chatTagColour({ name: "X", item_type: "weapon", rarity })).toBe(colour);
  });

  it("should draw an item with no rarity in the ordinary text colour", () => {
    expect(chatTagColour({ name: "X", item_type: "weapon" })).toBe(palette.hudText);
    expect(chatTagColour({ name: "X", item_type: "weapon", rarity: " " })).toBe(palette.hudText);
  });
});

describe("chatEntrySegments (FS-KBA4Q R32: a paired token becomes a tag)", () => {
  const blade = { name: "Rusty Blade", item_type: "weapon", rarity: "rare" };
  const linked = (text: string, items: ChatLine["items"], extra: Partial<ChatLine> = {}): ChatEntry => ({
    ...(line(text) as ChatLine),
    items,
    ...extra,
  });

  it("should have none for a line with no items, a system line, or a line whose items pair with nothing", () => {
    expect(chatEntrySegments(line("look [Rusty Blade] here"))).toBeNull();
    expect(chatEntrySegments(system("[Rusty Blade]"))).toBeNull();
    expect(chatEntrySegments(linked("look here", [blade]))).toBeNull();
    expect(chatEntrySegments(linked("look [Rusty Blad] here", [blade]))).toBeNull();
  });

  it("should put the tag in place of the token, the words around it as they were", () => {
    expect(chatEntrySegments(linked("look [Rusty Blade] here", [blade]))).toEqual([
      { kind: "text", text: "Wren: look " },
      { kind: "tag", item: blade },
      { kind: "text", text: " here" },
    ]);
  });

  it("should leave an unpaired token as text beside a paired one", () => {
    const ring = { name: "Ring", item_type: "ring" };

    expect(chatEntrySegments(linked("[Gone] [Ring]", [{ name: "Lost", item_type: "ring" }, ring]))).toEqual([
      { kind: "text", text: "Wren: [Gone] " },
      { kind: "tag", item: ring },
    ]);
  });

  it("should draw two links that touch as two tags with no text between", () => {
    const ring = { name: "Ring", item_type: "ring" };

    expect(chatEntrySegments(linked("[Rusty Blade][Ring]", [blade, ring]))).toEqual([
      { kind: "text", text: "Wren: " },
      { kind: "tag", item: blade },
      { kind: "tag", item: ring },
    ]);
  });

  it("should never read a token out of the sender's name", () => {
    const entry = linked("hi [Rusty Blade]", [blade], { sender_name: "[Rusty Blade]" });

    expect(chatEntrySegments(entry)).toEqual([
      { kind: "text", text: "[Rusty Blade]: hi " },
      { kind: "tag", item: blade },
    ]);
  });

  it("should head a whisper's echo with To and its target, as the plain line does", () => {
    const echo = linked("[Rusty Blade]", [blade], {
      channel: "whisper",
      sender_id: "me",
      target_id: "t",
      target_name: "Ash",
    });

    expect(chatEntrySegments(echo, "me")?.[0]).toEqual({ kind: "text", text: "To Ash: " });
    expect(chatEntrySegments(echo, "other")?.[0]).toEqual({ kind: "text", text: "From Wren: " });
  });
});

describe("wrapChatSegments (FS-KBA4Q R35, R36: text wraps around tags, a tag never splits)", () => {
  const measure = (s: string) => s.length * 10;
  /** A tag's whole width in a row: its bracketed name as drawn, its inner padding and the space outside it. */
  const tagW = (label: string) => measure(label) + (CHAT_TAG_PAD + CHAT_TAG_SPACE) * 2;
  /** What the brackets add to a name's width; each row width below grows by it, so a case lays out as before. */
  const B = measure("[]");
  const text = (t: string): ChatSegment => ({ kind: "text", text: t });
  const tag = (name: string): ChatSegment => ({ kind: "tag", item: { name, item_type: "weapon" } });
  /** Each row as words: a tag as its name drawn, brackets and all. */
  const words = (rows: ChatRowPiece[][]) =>
    rows.map((row) => row.map((p) => (p.kind === "tag" ? p.name : p.text)).join(""));

  it("should lay text, a tag and text on one row when they fit, each where the last ended", () => {
    const rows = wrapChatSegments([text("a "), tag("Blade"), text(" b")], 400, measure);

    expect(rows).toEqual([
      [
        { kind: "text", x: 0, text: "a " },
        {
          kind: "tag",
          x: 20 + CHAT_TAG_SPACE,
          width: 50 + B + CHAT_TAG_PAD * 2,
          name: "[Blade]",
          item: { name: "Blade", item_type: "weapon" },
        },
        { kind: "text", x: 20 + tagW("[Blade]"), text: " b" },
      ],
    ]);
  });

  it("should move a tag that does not fit the rest of the row whole to the next row", () => {
    // "Wren: look " is 110 wide; the tag needs 130 + 12 more and the row is 200 + B
    const rows = wrapChatSegments([text("Wren: look "), tag("Rusty Blade"), text(" here")], 200 + B, measure);

    expect(words(rows)).toEqual(["Wren: look ", "[Rusty Blade] here"]);
    expect(rows[1][0]).toMatchObject({ kind: "tag", x: CHAT_TAG_SPACE, name: "[Rusty Blade]" });
  });

  it("should keep a tag whose name has spaces whole, never breaking at them", () => {
    const rows = wrapChatSegments([text("aaaaaaaa "), tag("A B C D E F")], 150 + B, measure);

    expect(words(rows)).toEqual(["aaaaaaaa ", "[A B C D E F]"]);
  });

  it("should wrap the text after a tag as plain text does: at the last space that fits", () => {
    const rows = wrapChatSegments([tag("Blade"), text(" one two three four")], 122, measure);

    // the tag takes 82 of the 122; " one" fits beside it, then each row fills before it breaks
    expect(words(rows)).toEqual(["[Blade] one", "two three", "four"]);
    expect(rows[1][0]).toMatchObject({ kind: "text", x: 0 });
  });

  it("should break at the space right after a tag when the next word does not fit", () => {
    const rows = wrapChatSegments([tag("Blade"), text(" abcdefgh")], 122 + B, measure);

    expect(words(rows)).toEqual(["[Blade]", "abcdefgh"]);
  });

  it("should fill the row after a tag with Chinese before breaking", () => {
    const rows = wrapChatSegments([tag("Blade"), text("這是一句很長的中文")], 122 + B, measure);

    expect(words(rows)).toEqual(["[Blade]這是一句很長", "的中文"]);
  });

  it("should start a word that touches a tag and does not fit on the next row, not break inside it", () => {
    const rows = wrapChatSegments([tag("Blade"), text("abcdefgh")], 122 + B, measure);

    expect(words(rows)).toEqual(["[Blade]", "abcdefgh"]);
  });

  it("should put two tags that do not fit one row on a row each", () => {
    const rows = wrapChatSegments([tag("Rusty Blade"), tag("Iron Helm")], 200 + B, measure);

    expect(words(rows)).toEqual(["[Rusty Blade]", "[Iron Helm]"]);
  });

  it("should draw a tag wider than a row on a row of its own, cut at the row's width with an ellipsis", () => {
    const name = "Averylongitemnameindeed";
    const rows = wrapChatSegments([text("see "), tag(name), text(" ok")], 150 + B, measure);

    expect(rows).toHaveLength(3);
    expect(words([rows[0]])).toEqual(["see "]);
    const [cut] = rows[1];
    expect(rows[1]).toHaveLength(1);
    if (cut.kind !== "tag") throw new Error("expected a tag");
    expect(cut.name.endsWith(`${CHAT_TAG_CUT}]`)).toBe(true);
    expect(cut.name.startsWith("[")).toBe(true);
    expect(name.startsWith(cut.name.slice(1, -CHAT_TAG_CUT.length - 1))).toBe(true);
    expect(tagW(cut.name)).toBeLessThanOrEqual(150 + B);
    // as much of the name as the row holds
    expect(tagW(cut.name) + measure("x")).toBeGreaterThan(150 + B);
    // the item is whole: the tip still shows its full name
    expect(cut.item.name).toBe(name);
    expect(words([rows[2]])).toEqual(["ok"]);
  });

  it("should not leave a space hanging before the cut mark", () => {
    const [[cut]] = wrapChatSegments([tag("A Very Long Item Name Indeed")], 150 + B, measure);

    expect(cut).toMatchObject({ kind: "tag", name: `[A Very Long${CHAT_TAG_CUT}]` });
  });

  it("should end on an over-wide tag's row when nothing follows it", () => {
    const rows = wrapChatSegments([tag("A Very Long Item Name Indeed")], 150 + B, measure);

    expect(rows).toHaveLength(1);
  });

  it("should keep every row within the width", () => {
    const rows = wrapChatSegments(
      [text("Wren: 看看這個 "), tag("Rusty Blade"), text(" and this "), tag("Iron Helm"), text(" 還有一句很長很長的中文訊息")],
      200,
      measure,
    );

    for (const row of rows) {
      const last = row[row.length - 1];
      const right = last.kind === "tag" ? last.x + last.width + CHAT_TAG_SPACE : last.x + measure(last.text);
      expect(right).toBeLessThanOrEqual(200);
    }
    expect(words(rows).join("").replace(/ /g, "")).toBe(
      "Wren:看看這個[RustyBlade]andthis[IronHelm]還有一句很長很長的中文訊息",
    );
  });

  it.each([
    "Wren: hi there",
    "Wren: 這是一句很長很長而且沒有空白的中文訊息",
    "Wren: one two three four",
    "aaaaaaaaaaaaaaaaaaaaaaaaa",
    "Wren: trailing space here ",
    " leading",
    "",
  ])("should wrap text with no tag exactly as wrapChatText does: %j", (plain) => {
    const rows = wrapChatSegments([text(plain)], 120, measure);

    expect(words(rows)).toEqual(wrapChatText(plain, 120, measure));
    expect(rows.every((row) => row.every((p) => p.x === 0))).toBe(true);
  });
});
