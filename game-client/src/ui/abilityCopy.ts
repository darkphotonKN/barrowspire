/**
 * What each class's ability card says (FS-8AY7S req 30): the ability's name and one line on how
 * it works, keyed by `current_player.class`. Data only: a class gains, loses or changes its card
 * here without touching the card's code (FS-JTNPR swaps the archer to Shadow Shot, FS-MAMHR adds
 * the mercenary's Parry). A class with no row shows no card.
 */

export interface AbilityCopy {
  name: string;
  line: string;
}

export const ABILITY_COPY: Readonly<Record<string, AbilityCopy>> = {
  warrior: { name: "Dash", line: "Charge a short way toward the cursor." },
  mage: {
    name: "Triple Fireball",
    line: "Hurl three fireballs in a spread toward the cursor.",
  },
  archer: {
    name: "Shadow Shot",
    line: "Hold to aim, release to loose one slow, heavy bolt.",
  },
  // FS-MAMHR req 37; the card wraps to two rows (AbilityHud), so the line stays short
  mercenary: {
    name: "Parry",
    line: "Turn a blow as it lands for a parry charge. At three, the cut ripostes.",
  },
};
