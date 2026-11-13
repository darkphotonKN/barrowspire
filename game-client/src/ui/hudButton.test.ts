import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";

vi.mock("@/utils/class/SocketManager", () => ({
  socketManager: { send: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

import { drawHudButton } from "./PartyPanel";

type HitConfig = {
  hitArea: unknown;
  hitAreaCallback: (
    area: unknown,
    x: number,
    y: number,
    gameObject: unknown,
  ) => boolean;
  useHandCursor?: boolean;
};

/**
 * A stage that keeps what drawHudButton hands Phaser: the label's place and origin, and the
 * interactive config. A press lands where Phaser's InputManager.pointWithinHitArea (4.2.1) puts
 * it: the point in the label's local frame, its display origin added back.
 */
function stage(labelWidth: number, labelHeight = 18) {
  let config: HitConfig | undefined;
  let press: (() => void) | undefined;
  let pressedDown = false;
  const label: Record<string, unknown> = {
    x: 0,
    y: 0,
    width: labelWidth,
    height: labelHeight,
    displayOriginX: 0,
    displayOriginY: 0,
  };
  Object.assign(label, {
    setScrollFactor: () => label,
    setDepth: () => label,
    setOrigin: (ox: number, oy: number) => {
      label.displayOriginX = ox * labelWidth;
      label.displayOriginY = oy * labelHeight;
      return label;
    },
    setAlpha: () => label,
    setInteractive: (c: HitConfig) => ((config = c), label),
    on: (event: string, cb: () => void) => {
      if (event === "pointerup") press = cb;
      if (event === "pointerdown") pressedDown = true;
      return label;
    },
  });
  const graphics = {
    lineStyle: () => graphics,
    strokeRoundedRect: () => graphics,
  } as unknown as Phaser.GameObjects.Graphics;
  const scene = {
    add: {
      text: (x: number, y: number) => {
        label.x = x;
        label.y = y;
        return label;
      },
    },
  } as unknown as Phaser.Scene;
  /** Whether a press at (x, y) on the screen lands on the button, as Phaser would decide it. */
  const hits = (x: number, y: number) => {
    if (!config) return false;
    const localX = x - (label.x as number) + (label.displayOriginX as number);
    const localY = y - (label.y as number) + (label.displayOriginY as number);
    return config.hitAreaCallback(config.hitArea, localX, localY, label);
  };
  return {
    scene,
    graphics,
    hits,
    pressed: () => press,
    actsOnPress: () => pressedDown,
    config: () => config,
  };
}

describe("drawHudButton: the whole outlined button answers a press, not only its words", () => {
  const button = { x: 400, y: 300, width: 120, height: 28 };

  it.each([
    ["the top-left corner", button.x + 1, button.y + 1],
    [
      "the bottom-right corner",
      button.x + button.width - 1,
      button.y + button.height - 1,
    ],
    [
      "the left edge, beside the words",
      button.x + 2,
      button.y + button.height / 2,
    ],
    [
      "the right edge, beside the words",
      button.x + button.width - 2,
      button.y + button.height / 2,
    ],
    [
      "the middle, on the words",
      button.x + button.width / 2,
      button.y + button.height / 2,
    ],
  ])("should take a press at %s", (_where, x, y) => {
    // a short label ("Invite", ~40 px) well inside a 120 px button
    const s = stage(40);
    drawHudButton(s.scene, s.graphics, button, "Invite", true, () => undefined);
    expect(s.hits(x, y)).toBe(true);
  });

  it.each([
    ["left of the button", button.x - 2, button.y + 10],
    ["right of the button", button.x + button.width + 2, button.y + 10],
    ["above the button", button.x + 10, button.y - 2],
    ["below the button", button.x + 10, button.y + button.height + 2],
  ])("should not take a press %s", (_where, x, y) => {
    const s = stage(40);
    drawHudButton(s.scene, s.graphics, button, "Invite", true, () => undefined);
    expect(s.hits(x, y)).toBe(false);
  });

  it("should act on the release, never the press, so a press stays its panel's (FS-R82NV R28)", () => {
    const s = stage(40);
    drawHudButton(s.scene, s.graphics, button, "Invite", true, () => undefined);
    expect(s.actsOnPress()).toBe(false);
    expect(s.pressed()).toBeDefined();
  });

  it("should keep the hand cursor and run its press", () => {
    const s = stage(40);
    const press = vi.fn();
    drawHudButton(s.scene, s.graphics, button, "Create party", true, press);
    expect(s.config()?.useHandCursor).toBe(true);
    s.pressed()?.();
    expect(press).toHaveBeenCalledTimes(1);
  });

  it("should leave a greyed button inert", () => {
    const s = stage(40);
    drawHudButton(
      s.scene,
      s.graphics,
      button,
      "Invite",
      false,
      () => undefined,
    );
    expect(s.config()).toBeUndefined();
    expect(s.hits(button.x + 60, button.y + 14)).toBe(false);
  });
});
