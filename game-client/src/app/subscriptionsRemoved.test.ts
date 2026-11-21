import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// FS-RG1B4: the game sells no subscription, and the page is gone. The contract carries no payment
// path, so a call to one through the generated client fails the type check, and a hand-written
// fetch is fenced by lint (ADR-0001 §4).
describe("subscriptions removed (FS-RG1B4)", () => {
  it("has no subscription page", () => {
    expect(existsSync(path.join(__dirname, "subscription"))).toBe(false);
  });
});
