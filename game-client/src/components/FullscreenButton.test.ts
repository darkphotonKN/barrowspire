import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FullscreenButtonPlace } from "@/render/viewport/fullscreenButton";
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

const renderAt = (place: FullscreenButtonPlace) =>
  renderToStaticMarkup(
    createElement(FullscreenButton, {
      frame: createRef<HTMLElement>(),
      doc: docWith({ fullscreenEnabled: true }),
      place,
    }),
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

  // FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C2, C6: the place the
  // scene handed, in logical units the CSS multiplies by the canvas's scale; the corner by default
  it("should stand in the canvas's corner while nothing has been handed", () => {
    const html = renderAt(new FullscreenButtonPlace());
    expect(html).toContain("--fullscreen-top:6");
    expect(html).toContain("--fullscreen-right:6");
  });

  it("should stand at the place the scene handed it, beside the minimap", () => {
    const place = new FullscreenButtonPlace();
    place.hand({}, { top: 10, right: 232 });
    const html = renderAt(place);
    expect(html).toContain("--fullscreen-top:10");
    expect(html).toContain("--fullscreen-right:232");
    expect(html).toContain("--fullscreen-height:20");
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
