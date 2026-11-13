"use client";

import { useEffect, useState } from "react";
import { GAMEPLAY_EFFECTS, type GameplayEffect } from "@/audio/gameplaySounds";
import { createSoundBoardPlayer } from "./soundBoardPlayer";

type Kind = "Combat" | "Abilities" | "Coffers" | "Gear";

const KINDS: readonly Kind[] = ["Combat", "Abilities", "Coffers", "Gear"];

// Keyed by effect, so an effect added to GAMEPLAY_EFFECTS with no row here fails the typecheck.
// Each note is when the game plays it (FS-AND39 R1).
const ROWS: Record<GameplayEffect, { kind: Kind; note: string }> = {
  hit_monster: { kind: "Combat", note: "A monster in view loses health, by any hand." },
  hit_player: { kind: "Combat", note: "Your own player loses health." },
  dash: { kind: "Abilities", note: "The warrior casts Dash." },
  triple_fireball: { kind: "Abilities", note: "The mage casts Triple Fireball." },
  shadow_shot: { kind: "Abilities", note: "The archer releases Shadow Shot." },
  parry: { kind: "Abilities", note: "The mercenary raises the parry." },
  chest_open: { kind: "Coffers", note: "A chest's coffer view opens." },
  loot_open: { kind: "Coffers", note: "A sack's or a drop pile's coffer view opens." },
  stash_open: { kind: "Coffers", note: "E opens the town's stash." },
  item_pickup: { kind: "Gear", note: "An item is taken from a coffer into the bag." },
  item_swap: { kind: "Gear", note: "Gear is equipped, unequipped or swapped, or moved between stash and bag." },
};

const button =
  "min-w-[10rem] rounded-[6px] border border-brass/30 px-3 py-1.5 text-left text-sm text-vellum hover:bg-card-2";

/** The board's buttons, grouped by kind. A press hands its effect to `onPlay`. */
export function SoundBoardButtons({ onPlay }: { onPlay: (effect: GameplayEffect) => void }) {
  return (
    <>
      {KINDS.map((kind) => (
        <section key={kind} className="mb-8">
          <h2 className="mb-3 text-sm uppercase tracking-[0.12em] text-vellum-dim">{kind}</h2>
          <ul className="flex flex-col gap-2">
            {GAMEPLAY_EFFECTS.filter((effect) => ROWS[effect].kind === kind).map((effect) => (
              <li key={effect} className="flex items-baseline gap-3">
                <button type="button" className={button} data-effect={effect} onClick={() => onPlay(effect)}>
                  {effect}
                </button>
                <span className="text-sm text-vellum-muted">{ROWS[effect].note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * The dev sound board (FS-AND39 R15): a play button per gameplay effect, rendered from the game's
 * own generators. The audio context is made on the first press and closed as the page goes.
 */
export default function SoundBoard() {
  const [player] = useState(() => createSoundBoardPlayer());
  useEffect(() => () => player.close(), [player]);

  return (
    <main className="min-h-screen bg-bg-dark p-6 text-vellum">
      <h1 className="mb-2 text-xl uppercase tracking-[0.15em] text-vellum-dim">Dev sound board</h1>
      <p className="mb-6 text-sm text-vellum-muted">
        Each effect at the loudest the game plays it. Press again to restart it.
      </p>
      <SoundBoardButtons onPlay={player.play} />
    </main>
  );
}
