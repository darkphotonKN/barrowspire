import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// FS-TVCZQ req 1-3: the page keeps the player's details and verification panel, and offers no photo.

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  memberInfo: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/stores/authStore", () => ({ useAuthStore: () => auth }));
vi.mock("@/components/VerificationPanel", () => ({
  default: () => createElement("div", { "data-testid": "verification-panel" }),
}));

import ProfilePage from "./page";

const render = () => renderToStaticMarkup(createElement(ProfilePage));

describe("/profile", () => {
  beforeEach(() => {
    auth.memberInfo = {
      name: "Ashen",
      email: "ashen@example.test",
      status: 1,
      email_verified: true,
    };
  });

  it("should show the player's name, email and details", () => {
    const html = render();
    expect(html).toContain("Ashen");
    expect(html).toContain("ashen@example.test");
    expect(html).toContain("Delver");
    expect(html).toContain("Sworn:");
  });

  it("should offer no photo: no image, file input or picker", () => {
    const html = render();
    expect(html).not.toContain("<img");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Change Photo");
  });

  it("should show no message block or panel to a verified player", () => {
    const html = render();
    expect(html).not.toContain("profile-message");
    expect(html).not.toContain("verification-panel");
  });

  it("should show the verification panel until the email is verified", () => {
    auth.memberInfo.email_verified = false;
    expect(render()).toContain("verification-panel");
  });
});
