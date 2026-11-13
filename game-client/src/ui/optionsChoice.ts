/**
 * The ESC menu's Options row (FS-28DDG § Change: Music volume in an Options panel, C1, C2), the
 * same in every world. Phaser-free, so the menu rules (hubMenu, party) can offer it without
 * importing the panel that draws it; `optionsPanel` re-exports it (C13).
 */

/** The ESC menu's row that opens the panel, the same in every world (C1, C2). */
export const OPTIONS_CHOICE = { id: "options", label: "Options", register: "actionable" } as const;
