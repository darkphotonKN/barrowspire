import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FullscreenButton from "./FullscreenButton";
import type { FullscreenDocument } from "./fullscreen";

const docWith = (api: Partial<FullscreenDocument>): FullscreenDocument => ({
  fullscreenElement: null,
  ...api,
  addEventListener() {},
  removeEventListener() {},
});

const render = (doc: FullscreenDocument) =>
  renderToStaticMarkup(
    createElement(FullscreenButton, { frame: createRef<HTMLElement>(), doc }),
  );

// FS-ZAJMH §E R18, R23
/** The text a sighted player reads on the button: everything outside tags. Icon only (asked 2026-11-05). */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

describe("FullscreenButton", () => {
  it("should render nothing where the Fullscreen API is unavailable (iPhone Safari)", () => {
    expect(render(docWith({}))).toBe("");
    expect(render(docWith({ fullscreenEnabled: false }))).toBe("");
  });

  it("should offer fullscreen while windowed, named for it", () => {
    const html = render(docWith({ fullscreenEnabled: true }));
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain('aria-label="全螢幕 / enter fullscreen"');
    expect(html).toContain('title="全螢幕 / enter fullscreen"');
    expect(visibleText(html)).toBe("");
  });

  it("should read 縮小 while fullscreen, named for leaving it", () => {
    const html = render(
      docWith({ fullscreenEnabled: true, fullscreenElement: {} }),
    );
    expect(html).toContain('aria-label="縮小 / exit fullscreen"');
    expect(html).toContain('title="縮小 / exit fullscreen"');
    expect(html).not.toContain("全螢幕");
    expect(visibleText(html)).toBe("");
  });
});
