import { afterEach, describe, expect, it, vi } from "vitest";

// FS-AND39 R15: the sound board is dev-only; a production build answers 404, as /dev/gallery does.

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/dev/sounds/SoundBoard", () => ({ default: () => null }));

import SoundsPage from "./page";

describe("/dev/sounds", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should answer not-found in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => SoundsPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("should render the sound board in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(SoundsPage()).toBeTruthy();
  });
});
