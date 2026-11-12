import { describe, expect, it } from "vitest";
import { PANEL_TITLE_BAND } from "./panelFrame";
import {
  DISCONNECT_NOTICE,
  NOTICE_BUTTON,
  NOTICE_PANEL,
  disconnectNoticeFrame,
} from "./disconnectNoticeLayout";

describe("the disconnect notice's words (FS-R6EYZ R8)", () => {
  it("should say what the charter says, word for word", () => {
    expect(DISCONNECT_NOTICE).toEqual({
      title: "Disconnected",
      line: "The connection to the server was lost.",
      button: "Return to menu",
    });
  });
});

describe("disconnectNoticeFrame (FS-R6EYZ R9; FS-ZAJMH R12, R13)", () => {
  it.each([1080, 1280])("should dim the whole view and centre the panel in it, %i wide", (width) => {
    const f = disconnectNoticeFrame({ width, height: 720 });
    expect(f.dim).toEqual({ x: 0, y: 0, width, height: 720 });
    expect(f.panel.width).toBe(NOTICE_PANEL.width);
    expect(f.panel.height).toBe(NOTICE_PANEL.height);
    expect(f.panel.x + f.panel.width / 2).toBe(width / 2);
    expect(f.panel.y + f.panel.height / 2).toBe(360);
  });

  it("should stack the line and the button down the panel's middle under the title band, the button inside it", () => {
    const f = disconnectNoticeFrame({ width: 1280, height: 720 });
    const middle = f.panel.x + f.panel.width / 2;
    expect([f.line.x, f.button.x + f.button.width / 2]).toEqual([middle, middle]);
    // the title is the shared frame's (drawPanelTitle, FS-3EBCA R20): nothing of the notice's own
    // stands in its band, the line's top (14 px words) below its foot
    expect("title" in f).toBe(false);
    expect(f.line.y - 10).toBeGreaterThanOrEqual(f.panel.y + PANEL_TITLE_BAND);
    expect(f.line.y).toBeLessThan(f.button.y);
    expect(f.button.width).toBe(NOTICE_BUTTON.width);
    expect(f.button.y + f.button.height).toBeLessThanOrEqual(f.panel.y + f.panel.height - 16);
  });

  it("should lie on whole logical units", () => {
    const f = disconnectNoticeFrame({ width: 1137, height: 720 });
    for (const n of [f.panel.x, f.panel.y, f.button.x, f.button.y, f.line.y])
      expect(Number.isInteger(n)).toBe(true);
  });
});
