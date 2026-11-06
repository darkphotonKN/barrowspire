"use client";

import type { RefObject } from "react";
import FullscreenButton from "./FullscreenButton";
import type { FullscreenDocument } from "./fullscreen";

interface Props {
  /** The game frame (FS-ZAJMH "Terms"): what the canvas is fitted into, and what goes fullscreen. */
  frame: RefObject<HTMLDivElement | null>;
  /** Phaser's parent: the canvas and its DOM layer go in here. */
  canvas: RefObject<HTMLDivElement | null>;
  /** The document whose fullscreen it is; the page's own by default. */
  doc?: FullscreenDocument;
}

/**
 * The game frame's markup. The canvas is centred in the frame, and what it does not fill (outside
 * 3:2–16:9) is bars (R8). The fullscreen button shares a stage with the canvas, exactly the
 * canvas's size, so it keeps the canvas's top-right corner at every fit, never out in a bar (R18);
 * the frame around both is what goes fullscreen (R19).
 */
export default function GameFrame({ frame, canvas, doc }: Props) {
  return (
    <div ref={frame} className="game-frame">
      <div className="game-stage">
        <div ref={canvas} className="game-canvas" />
        <FullscreenButton frame={frame} doc={doc} />
      </div>
    </div>
  );
}
