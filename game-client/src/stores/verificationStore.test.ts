import { describe, expect, it } from "vitest";
import { createVerificationStore } from "./verificationStore";

// FS-V6SFK §Requirements 35–36: state the banner and the profile's panel share
// for one page session.

describe("verificationStore", () => {
  it("starts with the banner open and no code sent", () => {
    const store = createVerificationStore();
    expect(store.getState().bannerCollapsed).toBe(false);
    expect(store.getState().codeSentAt).toBeNull();
  });

  it("collapses the banner for the session", () => {
    const store = createVerificationStore();
    store.getState().collapseBanner();
    expect(store.getState().bannerCollapsed).toBe(true);
  });

  it("brings the banner back in a new page session (it is never persisted)", () => {
    createVerificationStore().getState().collapseBanner();
    expect(createVerificationStore().getState().bannerCollapsed).toBe(false);
  });

  it("records when a code was last issued, so every panel shares one countdown", () => {
    const store = createVerificationStore();
    store.getState().markCodeSent(42_000);
    expect(store.getState().codeSentAt).toBe(42_000);
  });

  // R38: the marketplace prompt opens the panel in place, through the banner.
  it("starts with the panel closed", () => {
    expect(createVerificationStore().getState().panelOpen).toBe(false);
  });

  it("opens the panel and brings back a collapsed banner to show it", () => {
    const store = createVerificationStore();
    store.getState().collapseBanner();
    store.getState().openPanel();
    expect(store.getState().panelOpen).toBe(true);
    expect(store.getState().bannerCollapsed).toBe(false);
  });

  it("closes the panel and leaves the banner up", () => {
    const store = createVerificationStore();
    store.getState().openPanel();
    store.getState().closePanel();
    expect(store.getState().panelOpen).toBe(false);
    expect(store.getState().bannerCollapsed).toBe(false);
  });

  it("closes the panel when the banner is collapsed", () => {
    const store = createVerificationStore();
    store.getState().openPanel();
    store.getState().collapseBanner();
    expect(store.getState().panelOpen).toBe(false);
  });
});
