import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderGameplaySfx } from "@/audio/gameplaySfx";
import { GAMEPLAY_EFFECTS, type GameplayEffect } from "@/audio/gameplaySounds";
import { SFX_MAX_GAIN } from "@/audio/sfxSetting";
import SoundBoard, { SoundBoardButtons } from "./SoundBoard";
import { createSoundBoardPlayer } from "./soundBoardPlayer";
import { standInContext } from "./standInAudio";

// FS-AND39 R15, user story 27: one play button per effect, each named by its effect. A press
// renders that effect from the generators and plays it at SFX_MAX_GAIN; a second press restarts it.

type ButtonProps = { children?: ReactNode; onClick?: () => void; "data-effect"?: string };

/** Every <button> in a rendered tree, walked as React elements, so a press is a call to its onClick. */
function buttonsIn(node: ReactNode): ReactElement<ButtonProps>[] {
  if (Array.isArray(node)) return node.flatMap(buttonsIn);
  if (!isValidElement<ButtonProps>(node)) return [];
  if (node.type === "button") return [node];
  return buttonsIn(node.props.children);
}

function press(effect: GameplayEffect, onPlay: (effect: GameplayEffect) => void) {
  const button = buttonsIn(SoundBoardButtons({ onPlay })).find((b) => b.props["data-effect"] === effect);
  if (!button) throw new Error(`no button for ${effect}`);
  button.props.onClick?.();
}

describe("the dev sound board", () => {
  it("should show one play button per effect, named by the effect", () => {
    const html = renderToStaticMarkup(createElement(SoundBoard));
    const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toHaveLength(GAMEPLAY_EFFECTS.length);
    expect(buttons).toHaveLength(11);
    expect([...buttons].sort()).toEqual([...GAMEPLAY_EFFECTS].sort());
  });

  it("should group the effects by kind", () => {
    const html = renderToStaticMarkup(createElement(SoundBoard));
    for (const kind of ["Combat", "Abilities", "Coffers", "Gear"]) expect(html).toContain(`>${kind}</h2>`);
  });

  it("should make no audio context as it renders, only on a press", () => {
    const made = vi.fn();
    vi.stubGlobal("AudioContext", made);
    try {
      renderToStaticMarkup(createElement(SoundBoard));
      expect(made).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("should render the pressed effect and start it on the context at SFX_MAX_GAIN", () => {
    const stage = standInContext(32000);
    const player = createSoundBoardPlayer(() => stage.context);

    press("hit_monster", player.play);

    const [source] = stage.sources;
    expect(source.started).toBe(1);
    expect(source.buffer?.samples).toEqual(renderGameplaySfx("hit_monster", 32000));
    expect(source.connectedTo).toBe(stage.gains[0]);
    expect(stage.gains[0].gain.value).toBe(SFX_MAX_GAIN);
  });

  it("should stop the first source when the same effect is pressed again", () => {
    const stage = standInContext();
    const player = createSoundBoardPlayer(() => stage.context);

    press("parry", player.play);
    press("parry", player.play);

    expect(stage.sources[0].stopped).toBe(1);
    expect(stage.sources[1].started).toBe(1);
  });
});
