/**
 * A world scene's keyboard while the player types in the UI scene's chat window (FS-TQZ5J § Change: Batch 6,
 * R127): the part of a scene's keyboard plugin that is switched off, and the policy that switches the world's
 * off and back. The UI bridge applies the policy to each world it reports (`reportWorld`); the chat input
 * switches its own scene's keyboard the same way. Neither the bridge nor this module knows the chat.
 */

/** The part of a scene's keyboard plugin switched off while the player types. Phaser's `KeyboardPlugin` is one. */
export interface SceneKeyboard {
  enabled: boolean;
  resetKeys(): void;
}

/** The world's keyboard as the guard keeps it: told each typing state the world hears, and the world's end. */
export interface TypingGuard {
  /** The UI's `typing` as the world hears it change. */
  heard(typing: boolean): void;
  /** The world ends: its keyboard handed back as it was. */
  end(): void;
}

/**
 * Reset and off as typing comes on (a held stride key let go: the DOM field swallows its keyup), and handed
 * back as it was as typing goes or as the world ends. It turns on only a keyboard it turned off, so a late
 * `typing: false` heard by the next world leaves that world's keyboard as it is.
 */
export function typingGuard(keyboard: () => SceneKeyboard | null | undefined): TypingGuard {
  let was: boolean | null = null;
  const handBack = () => {
    const keys = keyboard();
    if (keys && was !== null) keys.enabled = was;
    was = null;
  };
  return {
    heard(typing: boolean): void {
      if (!typing) return handBack();
      const keys = keyboard();
      if (!keys || was !== null) return;
      was = keys.enabled;
      keys.resetKeys();
      keys.enabled = false;
    },
    end: handBack,
  };
}
