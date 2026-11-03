import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VERIFY_TO_BID } from "@/marketplace/emailGate";
import NoteText from "./NoteText";

const render = (note: { text: string; verifyEmail?: true }) =>
  renderToStaticMarkup(createElement(NoteText, { note }));

// FS-V6SFK §Requirements 38: on EMAIL_UNVERIFIED the note under the action says why it failed
// and opens the verification panel in place.
describe("NoteText", () => {
  it("should render a flagged note as a prompt with a button that opens the panel", () => {
    const html = render({ text: VERIFY_TO_BID, verifyEmail: true });
    expect(html).toContain(VERIFY_TO_BID);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Verify your email<\/button>/);
    expect(html).not.toContain("href=");
  });

  it("should branch on the flag, not the text: the gate's copy alone is plain", () => {
    expect(render({ text: VERIFY_TO_BID })).toBe(VERIFY_TO_BID);
  });

  it("should render any other note as its plain text", () => {
    expect(render({ text: "This auction has ended." })).toBe("This auction has ended.");
  });
});
