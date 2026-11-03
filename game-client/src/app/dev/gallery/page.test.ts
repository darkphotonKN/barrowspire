import { afterEach, describe, expect, it, vi } from "vitest";

// FS-1819Q R5: the route itself answers 404 in a production build, not just an unlinked page.

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/dev/gallery/Gallery", () => ({ default: () => null }));

import GalleryPage from "./page";

describe("/dev/gallery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should answer not-found in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => GalleryPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("should render the gallery in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(GalleryPage()).toBeTruthy();
  });
});
