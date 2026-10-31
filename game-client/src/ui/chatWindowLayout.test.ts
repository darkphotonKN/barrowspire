import { describe, expect, it } from "vitest";
import type { ChatEntry } from "@/stores/chatStore";
import { contrastRatio } from "@/render/lighting/lighting";
import { palette } from "@/utils/canvasPalette";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_VISIBLE_LINES,
  CHAT_WINDOW_W,
  chatEntryColour,
  CHAT_FOLD_W,
  CHAT_FRAME_PAD,
  CHAT_LINES_GAP,
  chatFoldButton,
  chatTabSegments,
  wrapChatText,
  chatWindowFrame,
  formatChatEntry,
  scrolledOffset,
  visibleEntries,
} from "./chatWindowLayout";

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
  it("should put the panel's bottom edge where the caller says and keep it 420 wide", () => {
    const frame = chatWindowFrame(10, 500);

    expect(frame.panel.x).toBe(10);
    expect(frame.panel.width).toBe(CHAT_WINDOW_W);
    // widened from 360 at the user's ask, 2026-10-31
    expect(frame.panel.width).toBe(420);
    expect(frame.panel.y + frame.panel.height).toBe(500);
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
  it("should lay the five segments edge to edge from the row's left, each as wide as its label needs", () => {
    const row = chatWindowFrame(10, 500).filterRow;
    const segments = chatTabSegments(row, (label) => label.length * 7);

    expect(segments.map((s) => s.channel)).toEqual([
      "area",
      "world",
      "party",
      "whisper",
      "trade",
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
