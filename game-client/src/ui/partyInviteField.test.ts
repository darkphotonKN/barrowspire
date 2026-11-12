import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { domPartyInviteField } from "./partyInviteField";

// FS-R82NV R29 and FS-3EBCA R8 (owner 2026-11-12: "開道具欄跟角色欄時開不了隊伍"): the invite field takes
// typing over the open inventory and character panel as anywhere, so no key typed into it reaches
// the scene's keys (I, C, B, T, E, Q). On a stand-in document: the field is a browser <input>.

interface FakeKeyEvent {
  key: string;
  keyCode: number;
  isComposing: boolean;
  stopPropagation: () => void;
  preventDefault: () => void;
}

function fakeDocument() {
  const listeners = new Map<string, (e: FakeKeyEvent) => void>();
  const element = (tag: string) => ({
    tagName: tag.toUpperCase(),
    style: {} as Record<string, string>,
    classList: { add: vi.fn() },
    setAttribute: vi.fn(),
    append: vi.fn(),
    blur: vi.fn(),
    value: "",
    disabled: false,
    textContent: "",
    addEventListener: (type: string, fn: (e: FakeKeyEvent) => void) =>
      tag === "input" ? listeners.set(type, fn) : undefined,
  });
  return {
    document: { createElement: element, documentElement: {} },
    type: (type: "keydown" | "keyup", key: string) => {
      const e: FakeKeyEvent = {
        key,
        keyCode: key.toUpperCase().charCodeAt(0),
        isComposing: false,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      };
      listeners.get(type)!(e);
      return e;
    },
  };
}

function fieldOnStage() {
  const doc = fakeDocument();
  vi.stubGlobal("document", doc.document);
  // the canvas font reads the page's CSS variables; none here, so it falls back
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  const dom: unknown = new Proxy(() => dom, { get: () => dom, apply: () => dom });
  const scene = { add: { dom: () => dom } } as unknown as Phaser.Scene;
  const submit = vi.fn();
  domPartyInviteField(scene, { x: 0, y: 0, width: 200, height: 26 }, { submit });
  return { ...doc, submit };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("domPartyInviteField (FS-R82NV R29; FS-3EBCA R8: typing over the open overlay)", () => {
  it.each(["i", "c", "b", "t", "e", "q", "I", "C", "B", "T", "E", "Q"])(
    "should keep %s typed into the field from the scene's keys",
    (key) => {
      const { type, submit } = fieldOnStage();
      expect(type("keydown", key).stopPropagation).toHaveBeenCalled();
      expect(type("keyup", key).stopPropagation).toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    },
  );
});
