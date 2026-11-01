import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// FS-RG1B4: the game sells no subscription. Nothing links to the old page, the page is gone,
// and the client calls no payment endpoint.

const SRC = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("subscriptions removed (FS-RG1B4)", () => {
  it("has no subscription page", () => {
    expect(existsSync(path.join(SRC, "app", "subscription"))).toBe(false);
  });

  it("links nowhere to /subscription", () => {
    const linking = sourceFiles(SRC).filter((f) => readFileSync(f, "utf8").includes('"/subscription"'));
    expect(linking.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("calls no payment endpoint", () => {
    const calling = sourceFiles(SRC).filter((f) => readFileSync(f, "utf8").includes("/api/payment/"));
    expect(calling.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
