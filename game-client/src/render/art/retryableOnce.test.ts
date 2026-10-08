import { describe, expect, it, vi } from "vitest";
import { retryableOnce } from "./retryableOnce";

describe("retryableOnce", () => {
  it("shares one successful load across every caller", async () => {
    const load = vi.fn().mockResolvedValue("manifest");
    const get = retryableOnce(load);

    expect(await Promise.all([get(), get()])).toEqual(["manifest", "manifest"]);
    expect(await get()).toBe("manifest");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("answers null for a failed load, then tries again on the next call", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("manifest");
    const get = retryableOnce(load);

    expect(await get()).toBeNull();
    expect(await get()).toBe("manifest");
    expect(await get()).toBe("manifest");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight failure between concurrent callers", async () => {
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    const get = retryableOnce(load);

    expect(await Promise.all([get(), get()])).toEqual([null, null]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
