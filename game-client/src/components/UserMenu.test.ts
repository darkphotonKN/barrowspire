import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// FS-TVCZQ req 4, 7: the menu always draws the default silhouette, from the renamed classes.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({
    memberInfo: { name: "Ashen", email: "ashen@example.test" },
    logout: () => {},
  }),
}));

import UserMenu from "./UserMenu";

describe("UserMenu", () => {
  it("should always render the silhouette inside the badge, and no image", () => {
    const html = renderToStaticMarkup(createElement(UserMenu));
    expect(html).toMatch(/class="user-badge"><svg class="user-silhouette"/);
    expect(html).not.toContain("<img");
    expect(html).toContain("Ashen");
  });
});
