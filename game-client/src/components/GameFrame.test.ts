import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GameFrame from "./GameFrame";

const markup = () =>
  renderToStaticMarkup(
    createElement(GameFrame, {
      frame: createRef<HTMLDivElement>(),
      canvas: createRef<HTMLDivElement>(),
    }),
  );

// FS-ZAJMH R19: the frame is what goes fullscreen; FS-T3DWX R1: no fullscreen button over the
// canvas, for the toggle is the OPTIONS panel's Fullscreen row now
describe("GameFrame", () => {
  it("should hold the canvas alone in a stage inside the frame, with no button", () => {
    expect(markup()).toBe(
      '<div class="game-frame"><div class="game-stage"><div class="game-canvas"></div></div></div>',
    );
  });

});
