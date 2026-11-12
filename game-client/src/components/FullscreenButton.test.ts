import { readFileSync } from "node:fs";
import path from "node:path";
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
/**
 * The text a sighted player reads on the button: everything outside tags but the hint, which shows
 * only on hover and focus (FS-56CKV §Change C9). Icon only (asked 2026-11-05).
 */
function visibleText(html: string): string {
  return html.replace(/<span class="fullscreen-hint"[^>]*>[^<]*<\/span>/, "").replace(/<[^>]*>/g, "").trim();
}

/** The hint's element, as rendered. */
function hintOf(html: string): string | undefined {
  return html.match(/<span class="fullscreen-hint"[^>]*>[^<]*<\/span>/)?.[0];
}

/** One rule's body in globals.css, by its exact selector list. */
const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
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
    // the hint stands in for the browser's own tooltip (FS-56CKV §Change C8, C9)
    expect(html).not.toContain("title=");
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
    expect(html).not.toContain("title=");
    expect(html).not.toContain("全螢幕");
    expect(visibleText(html)).toBe("");
  });

  // FS-56CKV §Change C9 (owner 2026-11-12: "hover時也有要提示文字")
  describe("the hint (FS-56CKV §Change C9)", () => {
    it("should carry the words for the state, inside the button, hidden from assistive technology", () => {
      const windowed = hintOf(render(docWith({ fullscreenEnabled: true })));
      expect(windowed).toMatch(/>Fullscreen<\/span>$/);
      expect(windowed).toContain('aria-hidden="true"');
      const full = hintOf(render(docWith({ fullscreenEnabled: true, fullscreenElement: {} })));
      expect(full).toMatch(/>Exit fullscreen<\/span>$/);
      // inside the button, so hovering or focusing the button is what shows it
      expect(render(docWith({ fullscreenEnabled: true }))).toMatch(/<button[^>]*>.*<span class="fullscreen-hint".*<\/button>$/);
    });

    it("should stand below the button in the corner, and to its left beside the map", () => {
      expect(hintOf(renderAt(new FullscreenButtonPlace()))).toContain('data-side="below"');
      const place = new FullscreenButtonPlace();
      place.hand({}, { top: 10, right: 232 });
      expect(hintOf(renderAt(place))).toContain('data-side="left"');
      place.hand({}, { top: 10, right: 340 });
      expect(hintOf(renderAt(place))).toContain('data-side="left"');
    });

    it("should be hidden until the button is hovered or keyboard-focused, and take no pointer events", () => {
      const hint = rule(".fullscreen-hint");
      expect(hint).toMatch(/pointer-events:\s*none;/);
      expect(hint).toMatch(/visibility:\s*hidden;/);
      expect(hint).toMatch(/white-space:\s*nowrap;/);
      const shown = rule(".fullscreen-button:hover .fullscreen-hint,\n.fullscreen-button:focus-visible .fullscreen-hint");
      expect(shown).toMatch(/visibility:\s*visible;/);
    });

    it("should be the item tip's look in the button's tokens: a dark ground, a faint hairline, a 6 px corner, vellum text at the column's 12 px in 8 × 3, in logical units", () => {
      const hint = rule(".fullscreen-hint");
      expect(hint).toMatch(/background:\s*var\(--color-bg-dropdown\);/);
      expect(hint).toMatch(/border:\s*1px solid var\(--color-border\);/);
      expect(hint).toMatch(/border-radius:\s*calc\(6 \* var\(--fullscreen-unit\)\);/);
      expect(hint).toMatch(/color:\s*var\(--color-text\);/);
      expect(hint).toMatch(/font-family:\s*var\(--font-body\);/);
      expect(hint).toMatch(/font-size:\s*calc\(12 \* var\(--fullscreen-unit\)\);/);
      expect(hint).toMatch(/padding:\s*calc\(3 \* var\(--fullscreen-unit\)\) calc\(8 \* var\(--fullscreen-unit\)\);/);
      // tokens only (ADR-0013): no raw colour in the hint's rules
      for (const body of [hint, rule('.fullscreen-hint[data-side="below"]'), rule('.fullscreen-hint[data-side="left"]')])
        expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    });

    it("should hang 4 px under the button on its right edge in the corner, and 6 px off its left, centred on its height, beside the map", () => {
      const below = rule('.fullscreen-hint[data-side="below"]');
      expect(below).toMatch(/top:\s*calc\(100% \+ 4 \* var\(--fullscreen-unit\)\);/);
      expect(below).toMatch(/right:\s*0;/);
      const left = rule('.fullscreen-hint[data-side="left"]');
      expect(left).toMatch(/right:\s*calc\(100% \+ 6 \* var\(--fullscreen-unit\)\);/);
      expect(left).toMatch(/top:\s*50%;/);
      expect(left).toMatch(/transform:\s*translateY\(-50%\);/);
    });
  });
});
