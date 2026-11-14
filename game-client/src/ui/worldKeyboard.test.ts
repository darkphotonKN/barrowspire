import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { typingGuard } from "./worldKeyboard";

// FS-TQZ5J § Change: Batch 6, R127: the world's keyboard while the player types in the UI scene's chat, a
// policy of its own (batch 6 review, LOW: the bridge no longer imports the chat for it)
describe("typingGuard (FS-TQZ5J § Change: Batch 6, R127)", () => {
  const keyboardOf = (enabled = true) => ({ enabled, resetKeys: vi.fn() });

  it("should reset the keyboard and turn it off as typing comes on, and hand it back as it was as typing goes", () => {
    const keys = keyboardOf();
    const guard = typingGuard(() => keys);

    guard.heard(true);
    expect([keys.enabled, keys.resetKeys.mock.calls.length]).toEqual([false, 1]);
    guard.heard(true);
    expect(keys.resetKeys).toHaveBeenCalledTimes(1);

    guard.heard(false);
    expect(keys.enabled).toBe(true);
  });

  it("should hand the keyboard back as the world ends while the player types", () => {
    const keys = keyboardOf();
    const guard = typingGuard(() => keys);
    guard.heard(true);
    guard.end();
    expect(keys.enabled).toBe(true);
  });

  it("should leave alone a keyboard it never turned off: a late typing false, a keyboard already off", () => {
    const off = keyboardOf(false);
    const guard = typingGuard(() => off);
    guard.heard(false);
    expect(off.enabled).toBe(false);
    guard.heard(true);
    guard.heard(false);
    expect(off.enabled).toBe(false);
  });

  it("should do nothing with no keyboard", () => {
    expect(() => typingGuard(() => null).heard(true)).not.toThrow();
  });

  it("should leave the bridge importing nothing of the chat", () => {
    const bridge = readFileSync(join(__dirname, "uiBridge.ts"), "utf8");
    expect(bridge).not.toMatch(/from "\.\/chat/);
    expect(bridge).not.toMatch(/function typingGuard/);
  });
});
