"use client";

import type { RefObject } from "react";

interface Props {
  /** The game frame (FS-ZAJMH "Terms"): what the canvas is fitted into, and what goes fullscreen. */
  frame: RefObject<HTMLDivElement | null>;
  /** Phaser's parent: the canvas and its DOM layer go in here. */
  canvas: RefObject<HTMLDivElement | null>;
}

/**
 * The game frame's markup. The canvas is centred in the frame, and what it does not fill (outside
 * 3:2–16:9) is bars (R8). The stage is exactly the canvas's size; the frame around it is what goes
 * fullscreen (R19). Nothing stands over the canvas: fullscreen is the OPTIONS panel's Fullscreen
 * row (FS-T3DWX R1), which the page lends the game the frame's fullscreen for (PhaserGame).
 */
export default function GameFrame({ frame, canvas }: Props) {
  return (
    <div ref={frame} className="game-frame">
      <div className="game-stage">
        <div ref={canvas} className="game-canvas" />
      </div>
    </div>
  );
}
