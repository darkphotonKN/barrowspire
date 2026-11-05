import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GameFrame from "./GameFrame";
import type { FullscreenDocument } from "./fullscreen";

const doc: FullscreenDocument = {
  fullscreenEnabled: true,
  fullscreenElement: null,
  addEventListener() {},
  removeEventListener() {},
};

const markup = () =>
  renderToStaticMarkup(
    createElement(GameFrame, {
      frame: createRef<HTMLDivElement>(),
      canvas: createRef<HTMLDivElement>(),
      doc,
    }),
  );

// FS-ZAJMH R18, R19: the button keeps the canvas's corner, bars or none, inside what goes fullscreen
describe("GameFrame", () => {
  it("should hold the canvas and the fullscreen button together in a stage the canvas's size, inside the frame", () => {
    expect(markup()).toMatch(
      /^<div class="game-frame"><div class="game-stage"><div class="game-canvas"><\/div><button[^>]*class="fullscreen-button"/,
    );
  });

  it("should not place the button against the frame itself, where the bars are", () => {
    expect(markup()).not.toMatch(/<\/div><\/div><button/);
    expect(markup()).toMatch(/<\/button><\/div><\/div>$/);
  });
});
