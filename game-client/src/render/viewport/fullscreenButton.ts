/**
 * The fullscreen button's footprint over the canvas, in logical units (FS-ZAJMH R18). The button is
 * DOM over the canvas (never out in the frame's bars) and is drawn at the canvas's CSS scale, so it
 * covers the same logical spot at any fit; the HUD keeps clear of it from here (Nick, 2026-11-05:
 * the button keeps the corner in every scene; the run's top-right HUD steps down). Where the normal
 * minimap holds the very top of that corner the button stands at the minimap's left instead, a
 * place the scene hands it with the top-right column's layout (FS-56CKV §Change: Minimap at the
 * top, fullscreen button beside it; Nick, 2026-11-12).
 */
export const FULLSCREEN_BUTTON = {
  /** From the canvas's top and right edges to the button, in its corner. */
  inset: 6,
  /** Its side: a square round the icon. */
  height: 20,
} as const;

/**
 * How far a top-right HUD widget steps down to clear the button in its corner: its inset and
 * height, and a margin under it.
 */
export const FULLSCREEN_BUTTON_CLEARANCE =
  FULLSCREEN_BUTTON.inset + FULLSCREEN_BUTTON.height + 8;

/** Where the button stands: from the canvas's top edge to its top, and from the canvas's right edge to its right edge, in logical units. */
export interface FullscreenButtonSpot {
  readonly top: number;
  readonly right: number;
}

/** The button in the canvas's top-right corner (FS-ZAJMH R18). */
export const FULLSCREEN_CORNER: FullscreenButtonSpot = {
  top: FULLSCREEN_BUTTON.inset,
  right: FULLSCREEN_BUTTON.inset,
};

/**
 * Where the button stands now, handed it by the scene that lays out the top-right column
 * (FS-56CKV §Change C6), and heard by the button. The scene that handed the last place owns it;
 * when that scene takes it back the button returns to the corner, and an earlier scene taking its
 * own back never moves a later scene's.
 */
export class FullscreenButtonPlace {
  private spot: FullscreenButtonSpot = FULLSCREEN_CORNER;
  private owner: object | null = null;
  private readonly listeners = new Set<() => void>();

  /** The place now: the same object until it changes. */
  get current(): FullscreenButtonSpot {
    return this.spot;
  }

  /** `owner` stands the button at `spot`. */
  hand(owner: object, spot: FullscreenButtonSpot): void {
    this.owner = owner;
    this.move(spot);
  }

  /** `owner` is done with the button: back to the corner, if the place is still its own. */
  takeBack(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.move(FULLSCREEN_CORNER);
  }

  /** Hears every move; the returned function stops it. */
  watch(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private move(spot: FullscreenButtonSpot): void {
    if (spot.top === this.spot.top && spot.right === this.spot.right) return;
    this.spot = { top: spot.top, right: spot.right };
    for (const listener of [...this.listeners]) listener();
  }
}

/** The one place the game's button is stood at. */
export const fullscreenButtonPlace = new FullscreenButtonPlace();
