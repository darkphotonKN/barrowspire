import { afterEach, describe, expect, it, vi } from "vitest";
import { showsPositionReadout } from "./positionReadout";

describe("showsPositionReadout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { nodeEnv: "development", shown: true },
    { nodeEnv: "test", shown: true },
    { nodeEnv: "production", shown: false },
  ])("is $shown when NODE_ENV is $nodeEnv and nothing overrides it", ({ nodeEnv, shown }) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", "");
    expect(showsPositionReadout()).toBe(shown);
  });

  it.each([
    { nodeEnv: "production", override: "true", shown: true },
    { nodeEnv: "production", override: "1", shown: true },
    { nodeEnv: "production", override: " TRUE ", shown: true },
    { nodeEnv: "development", override: "false", shown: false },
    { nodeEnv: "development", override: "0", shown: false },
  ])(
    "follows NEXT_PUBLIC_SHOW_POSITION_READOUT=$override over NODE_ENV=$nodeEnv",
    ({ nodeEnv, override, shown }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
      expect(showsPositionReadout()).toBe(shown);
    },
  );

  it.each(["yes", "on", "maybe"])("ignores an unrecognised override %j", (override) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SHOW_POSITION_READOUT", override);
    expect(showsPositionReadout()).toBe(false);
  });
});
