import { describe, expect, it } from "vitest";
import type { ChatEntry } from "@/stores/chatStore";
import { contrastRatio } from "@/render/lighting/lighting";
import { palette } from "@/utils/canvasPalette";
import {
  CHAT_CHANNEL_COLOUR,
  CHAT_VISIBLE_LINES,
  CHAT_WINDOW_W,
  chatEntryColour,
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
  it("should put the panel's bottom edge where the caller says and keep it 360 wide", () => {
    const frame = chatWindowFrame(10, 500);

    expect(frame.panel.x).toBe(10);
    expect(frame.panel.width).toBe(CHAT_WINDOW_W);
    expect(frame.panel.width).toBe(360);
    expect(frame.panel.y + frame.panel.height).toBe(500);
  });

  it("should stack the filter row above the messages and the input below them, inside the panel", () => {
    const frame = chatWindowFrame(0, 400);

    expect(frame.filterRow.y).toBe(frame.panel.y);
    expect(frame.messages.y).toBe(frame.filterRow.y + frame.filterRow.height);
    expect(frame.input.y).toBe(frame.messages.y + frame.messages.height);
    expect(frame.input.y + frame.input.height).toBe(
      frame.panel.y + frame.panel.height,
    );
  });

  it("should give the messages area room for exactly the visible line count", () => {
    const frame = chatWindowFrame(0, 400);

    expect(frame.messages.height).toBe(CHAT_VISIBLE_LINES * frame.lineHeight);
    expect(CHAT_VISIBLE_LINES).toBe(8);
  });
});

describe("formatChatEntry (C22, C29)", () => {
  it("should read HH:MM  Name: text with the time in the local zone", () => {
    const sentAt = new Date("2026-10-31T09:30:15.250Z");
    const hh = String(sentAt.getHours()).padStart(2, "0");
    const mm = String(sentAt.getMinutes()).padStart(2, "0");

    expect(formatChatEntry(line("hello there"))).toBe(
      `${hh}:${mm}  Wren: hello there`,
    );
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

  it("should draw a system line in the system colour and a player's line in its channel's", () => {
    expect(chatEntryColour(system("x"))).toBe(palette.chatSystem);
    expect(
      chatEntryColour({ ...line("x"), channel: "trade" } as ChatEntry),
    ).toBe(palette.chatTrade);
  });
});
