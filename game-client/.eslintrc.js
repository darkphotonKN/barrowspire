// The client's lint fence (ADR-0001 §4, ADR-0013). JS rather than JSON so each override composes the
// selector groups it keeps: ESLint replaces a rule's whole option list in an override, so a group added
// to the base must be spelt again in every override that sets the same rule. `npm run lint:fence`
// watches each group reject its fixture in lint-fixtures/.

/** Hand-written fetch (ADR-0001 §4). */
const FETCH = {
    "selector": "CallExpression[callee.name='fetch']",
    "message": "Hand-written fetch is banned outside src/utils/api.ts (ADR-0001 §4). Use the generated client from '@/utils/api' so a contract change breaks the build rather than a user's session. WebSocket traffic is plane 2 and uses `new WebSocket`, which this rule does not match; the one legitimate raw fetch (fetchArtManifest, whose static file is not a gateway path) lives in api.ts and is exempted below."
  };

/** The same, as the Phaser layer has carried it. */
const FETCH_SHORT = {
    "selector": "CallExpression[callee.name='fetch']",
    "message": "Hand-written fetch is banned outside src/utils/api.ts (ADR-0001 section 4)."
  };

/** Raw hex and non-neutral rgb()/rgba() colour (ADR-0013). */
const COLOUR = [
    {
      "selector": "Literal[value=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
      "message": "Raw hex colour is banned outside the two definition sites (ADR-0013). Colour is defined once in src/app/globals.css :root and src/utils/theme.ts, and referenced everywhere else: var(--color-*) in CSS/styled-jsx, the UI table in DOM TS, BARROW/BARROW_HEX in Phaser TS (ADR-0025: DOM never reads BARROW). A new UI colour is a :root token and a UI-table entry first, then referenced. This covers inline style={{}} objects and third-party theme configs (Stripe Elements) too, which no CSS-only rule would reach."
    },
    {
      "selector": "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
      "message": "Raw hex colour is banned outside the two definition sites (ADR-0013) — including inside template literals and styled-jsx blocks. Use var(--color-*), or UI.* where a literal is unavoidable (BARROW.* in Phaser code only)."
    },
    {
      "selector": "Literal[value=/rgba?\\(\\s*(?!(?:0[\\s,]+0[\\s,]+0|255[\\s,]+255[\\s,]+255)[\\s,)])\\d/]",
      "message": "Raw non-neutral rgb()/rgba() colour is banned outside the token definitions (ADR-0013, FS-8TCN2 slice 2). A palette triple typed at the call site does not move when the palette does. Derive it from a token instead: color-mix(in srgb, var(--color-brass) 15%, transparent) for an alpha variant, or add a token to globals.css :root first. Neutral black and white (0,0,0 / 255,255,255) may stay literal."
    },
    {
      "selector": "TemplateElement[value.raw=/rgba?\\(\\s*(?!(?:0[\\s,]+0[\\s,]+0|255[\\s,]+255[\\s,]+255)[\\s,)])\\d/]",
      "message": "Raw non-neutral rgb()/rgba() colour is banned outside the token definitions (ADR-0013, FS-8TCN2 slice 2), including inside template literals and styled-jsx blocks. Use color-mix(in srgb, var(--color-*) N%, transparent) or a token."
    }
  ];

/** Raw 0xRRGGBB in the canvas render layer (ADR-0013, FS-SRA9J). */
const COLOUR_NUM = {
    "selector": "Literal[raw=/^0[xX][0-9a-fA-F]{6}$/]",
    "message": "Raw 0xRRGGBB colour is banned in the canvas render layer outside src/utils/theme.ts (ADR-0013). Use palette.* from '@/utils/canvasPalette' (BARROW_HEX underneath), or a named definition in theme.ts such as TINT_IDENTITY when the number is not a palette colour. Tests are outside this rule."
  };

/** The fetch in the render layer's own words (the S3 note) and its colour rules. */
const RENDER_FETCH = {
    "selector": "CallExpression[callee.name='fetch']",
    "message": "Hand-written fetch is banned outside src/utils/api.ts (ADR-0001 §4). Use the generated client from '@/utils/api' so a contract change breaks the build rather than a user's session. WebSocket traffic is plane 2 and uses `new WebSocket`, which this rule does not match; the one legitimate raw fetch (the S3 presigned upload, which is not a gateway path) lives in api.ts and is exempted below."
  };

/**
 * "No silly animations" (FS-KYPQ9 §B.3, §B.6): no Bounce, Elastic or Back easing, given as a string or
 * through `Easing`, in the effects module and the two scenes that call it.
 */
const EASING = [
  {
    selector: "Literal[value=/^(Bounce|Elastic|Back)(\\.\\w+)?$/]",
    message: "No Bounce, Elastic or Back easing in an effect (FS-KYPQ9 §B.3): ease with Quad, Sine or Cubic.",
  },
  {
    selector: "MemberExpression[object.property.name='Easing'][property.name=/^(Bounce|Elastic|Back)$/]",
    message: "No Bounce, Elastic or Back easing in an effect (FS-KYPQ9 §B.3): ease with Quad, Sine or Cubic.",
  },
];

/**
 * Every hover keeps the bone hand (FS-KYPQ9 § Change: Every hover keeps the bone hand): Phaser 4.2.1
 * hands an interactive object a cursor of its own only through `useHandCursor`, a `cursor` in
 * `setInteractive`'s config or `input.cursor`; the canvas's own cursor is the pointer look's alone
 * (§ Change: The pressed hand, P7, P10). A DOM component's CSS cursor is its own and is not matched.
 */
const OWN_CURSOR = [
  {
    selector: "Property[key.name='useHandCursor']",
    message: "No interactive object gets a cursor of its own: the bone hand stays over every hover (FS-KYPQ9).",
  },
  {
    selector: "CallExpression[callee.property.name='setInteractive'] > ObjectExpression > Property[key.name='cursor']",
    message: "No interactive object gets a cursor of its own: the bone hand stays over every hover (FS-KYPQ9).",
  },
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name='cursor'][object.property.name='input']",
    message: "No interactive object gets a cursor of its own: the bone hand stays over every hover (FS-KYPQ9).",
  },
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name='cursor'][object.property.name='style'][object.object.property.name='canvas']",
    message: "The canvas's cursor has one writer, the pointer look (src/render/cursors/pointerLook.ts; FS-KYPQ9 P7, P10).",
  },
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name='cursor'][object.property.name='style'][object.object.name='canvas']",
    message: "The canvas's cursor has one writer, the pointer look (src/render/cursors/pointerLook.ts; FS-KYPQ9 P7, P10).",
  },
];

/** Fire's own ramp is named only in the theme and the fire effects (ADR-0025; theme.test.ts). */
const FIRE = [
  {
    selector: "Literal[value=/^fire(Core|Hot|Deep)$/]",
    message: "Fire's tokens (fireCore, fireHot, fireDeep) belong to the theme and the fire effects alone: a new fire effect is added to the fire-effect override in .eslintrc.js by name, as a deliberate call.",
  },
  {
    selector: "MemberExpression[property.name=/^fire(Core|Hot|Deep)$/]",
    message: "Fire's tokens (fireCore, fireHot, fireDeep) belong to the theme and the fire effects alone: a new fire effect is added to the fire-effect override in .eslintrc.js by name, as a deliberate call.",
  },
];

const syntax = (...groups) => ["error", ...groups.flat()];

/** The canvas's default cursor: set by the pointer look alone (FS-KYPQ9 § Change: The pressed hand). */
const CURSOR_WRITES = [
  { property: "setDefaultCursor", message: "The canvas's cursor has one writer, the pointer look (src/render/cursors/pointerLook.ts; FS-KYPQ9 P7, P10)." },
  { property: "defaultCursor", message: "The canvas's cursor has one writer, the pointer look (src/render/cursors/pointerLook.ts; FS-KYPQ9 P7, P10)." },
];
/** No radial explode, and no camera shake but the lore line's dread tremor (FS-KYPQ9 §B.5, §B.6; FS-XWHZP R10). */
const SHAKE = { property: "shake", message: "No camera shake (FS-KYPQ9 §B.5): the lore line's dread tremor (src/ui/loreLine.ts) is the one exception (FS-XWHZP R10)." };
const EXPLODE = { property: "explode", message: "No radial explode of an emitter (FS-KYPQ9 §B.6)." };
const MATH_RANDOM = { object: "Math", property: "random", message: "The sound generators are seeded (FS-AND39 R9): draw from seededRandom, so each effect renders the same every time." };

const properties = (...groups) => ["error", ...groups.flat()];

/** What the UI scene owns, which no world scene builds (FS-TQZ5J; the UI scene's own tests drive each). */
const UI_SCENE_PIECES = [
  ["@/ui/ChatWindow", "The chat window is the UI scene's (FS-TQZ5J § Change: Batch 6, R125)."],
  ["@/ui/AbilityHud", "The HUD pieces are the UI scene's (FS-TQZ5J § Change: Batch 5, R67)."],
  ["@/ui/PotionHud", "The HUD pieces are the UI scene's (FS-TQZ5J § Change: Batch 5, R67)."],
  ["@/ui/ResourceHud", "The HUD pieces are the UI scene's (FS-TQZ5J § Change: Batch 5, R67)."],
  ["@/ui/ProgressHud", "The HUD pieces are the UI scene's (FS-TQZ5J § Change: Batch 5, R67)."],
  ["@/ui/HudCorner", "The corner row is the UI scene's (FS-TQZ5J R13, R15)."],
  ["@/ui/menuPanel", "The ESC menu is the UI scene's (FS-TQZ5J R16)."],
  ["@/ui/optionsPanel", "OPTIONS is the UI scene's (FS-TQZ5J R16)."],
  ["@/ui/npcDialogue", "The dialogue card is the UI scene's: a world shows its dialogue through the bridge (FS-TQZ5J A2, I-TQZ5J-7)."],
  ["@/ui/PartyPanel", "The party panel is the UI scene's (FS-TQZ5J § Change: Phase 2: the party, R36)."],
  ["@/ui/PartyInvitePrompt", "The invite prompt is the UI scene's (FS-TQZ5J § Change: Phase 2: the party, I-TQZ5J-10)."],
  ["@/ui/PartyReadyCheck", "The ready check is the UI scene's (FS-TQZ5J § Change: Phase 2: the party, I-TQZ5J-10)."],
  ["@/ui/PartyFrames", "The party frames are the UI scene's (FS-TQZ5J § Change: Phase 2: the party, I-TQZ5J-11)."],
  ["@/ui/GearOverlay", "The gear overlay is the UI scene's (FS-TQZ5J § Change: Phase 3, R50)."],
  ["@/ui/EquipmentHud", "The gear is the UI scene's (FS-TQZ5J § Change: Phase 3, R50)."],
  ["@/ui/gearPieces", "The gear is the UI scene's (FS-TQZ5J § Change: Phase 3, R50)."],
  ["@/ui/SettlementRecord", "The settlement record is the UI scene's: the run hands its record as data (FS-TQZ5J § Change: Phase 3, R57)."],
  ["@/ui/controlsPanel", "The controls panel is the UI scene's (FS-TQZ5J § Change: Phase 3, R57)."],
  ["@/ui/mailboxHud", "The mailbox is the UI scene's (FS-TQZ5J § Change: Batch 4, R101)."],
  ["@/ui/MailboxEnvelope", "The mailbox is the UI scene's (FS-TQZ5J § Change: Batch 4, R101)."],
  ["@/ui/LetterPanel", "The letter panel is the UI scene's: a world reads its open state from the mailbox store (FS-TQZ5J § Change: Batch 4, R103)."],
].map(([name, message]) => ({ name, message }));
/** The UI scene's player of interface sounds: a world reaches it through the bridge (FS-TQZ5J R22). */
const UI_SOUNDS = {
  name: "@/audio/uiSounds",
  importNames: ["UiSounds", "mountUiSounds"],
  message: "The UI scene plays the interface sounds: a world reaches them through the bridge (FS-TQZ5J R22).",
};
/** The run's alone: the heal shimmer (FS-KZC92 §G) and the floor's fog and exploration (FS-P0HSP §A.1). */
const RUN_ONLY = [
  ["@/render/effects/shimmer", "The heal shimmer is the run's (FS-KZC92 §G R33)."],
  ["@/render/world/fog", "A town or a field has no fog: its minimap is its own plan (FS-P0HSP §A.1–§A.2)."],
  ["@/render/world/fogField", "A town or a field has no fog: its minimap is its own plan (FS-P0HSP §A.1–§A.2)."],
  ["@/render/world/exploration", "A town or a field has no exploration: its minimap is its own plan (FS-P0HSP §A.1–§A.2)."],
].map(([name, message]) => ({ name, message }));
/** The kept place: read at the world switch, never by a scene (FS-PQ2TW R8; ADR-0075 Decision 4). */
const KEPT_PLACE = {
  group: ["@/components/arrival", "**/components/arrival"],
  message: "No scene reads the kept place: the switch decides an arrival and hands the verdict in the scene's data (FS-PQ2TW R8; ADR-0075 Decision 4).",
};
/** A piece of the UI scene's, or the shared card, knows no scene: it hears the bridge (FS-TQZ5J R8, R9; ADR-0075 Decision 3). */
const NO_SCENE = {
  group: ["@/scenes/*Scene", "./*Scene", "../scenes/*Scene"],
  message: "No scene calls another, and a shared piece knows none: talk through the UI bridge (FS-TQZ5J R8, R9; ADR-0075 Decision 3).",
};

const imports = ({ paths = [], patterns = [] }) => ["error", { paths, patterns }];

const TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/*.standin.ts"];
const CANVAS_LAYER = [
  "src/scenes/**",
  "src/ui/**",
  "src/game/**",
  "src/utils/spriteGenerator.ts",
  "src/utils/gameStateLogger.ts",
  "src/utils/class/SocketManager.ts",
];

module.exports = {
  extends: ["next/core-web-vitals", "prettier"],
  rules: {
    "no-restricted-syntax": syntax(FETCH, COLOUR, OWN_CURSOR, FIRE),
    "no-restricted-properties": properties(CURSOR_WRITES, SHAKE, EXPLODE),
  },
  overrides: [
    {
      files: ["src/utils/api.ts"],
      rules: { "no-restricted-syntax": "off" },
    },
    {
      files: ["src/utils/theme.ts"],
      rules: { "no-restricted-syntax": "off" },
    },
    {
      files: CANVAS_LAYER,
      rules: { "no-restricted-syntax": syntax(FETCH_SHORT, OWN_CURSOR, FIRE) },
    },
    {
      files: ["src/render/**/*.ts", "lint-fixtures/raw-hex-num.ts"],
      excludedFiles: TESTS,
      rules: { "no-restricted-syntax": syntax(RENDER_FETCH, COLOUR, COLOUR_NUM, OWN_CURSOR, FIRE) },
    },
    // the effects module and the two scenes that call it ease no Bounce, Elastic or Back (FS-KYPQ9 §B.3)
    {
      files: ["src/render/effects/**/*.ts", "lint-fixtures/banned-easing.ts"],
      excludedFiles: TESTS,
      rules: { "no-restricted-syntax": syntax(RENDER_FETCH, COLOUR, COLOUR_NUM, OWN_CURSOR, FIRE, EASING) },
    },
    {
      files: ["src/scenes/HubScene.ts", "src/scenes/BarrowspireScene.ts"],
      rules: { "no-restricted-syntax": syntax(FETCH_SHORT, OWN_CURSOR, FIRE, EASING) },
    },
    // the fire effects: a new one is added here, by name, as a deliberate call
    {
      files: ["src/render/effects/cardAsh.ts"],
      rules: { "no-restricted-syntax": syntax(RENDER_FETCH, COLOUR, COLOUR_NUM, OWN_CURSOR, EASING) },
    },
    {
      files: ["src/render/cursors/pointerLook.ts"],
      rules: { "no-restricted-properties": properties(SHAKE, EXPLODE) },
    },
    {
      files: ["src/ui/loreLine.ts"],
      rules: { "no-restricted-properties": properties(CURSOR_WRITES, EXPLODE) },
    },
    {
      files: ["src/audio/gameplaySfx.ts", "lint-fixtures/unseeded-sfx.ts"],
      rules: {
        "no-restricted-properties": properties(CURSOR_WRITES, SHAKE, EXPLODE, MATH_RANDOM),
        "no-restricted-imports": imports({
          paths: [{ name: "phaser", message: "The sound generators are Phaser-free and Web Audio-free (FS-AND39 R9)." }],
        }),
      },
    },
    // the scenes: no scene reads the kept place, the main menu's forget aside
    {
      files: ["src/scenes/*Scene.ts"],
      rules: { "no-restricted-imports": imports({ patterns: [KEPT_PLACE] }) },
    },
    {
      files: ["src/scenes/MainMenuScene.ts"],
      rules: {
        "no-restricted-imports": imports({
          paths: [
            { name: "@/components/arrival", importNames: ["arrivals", "keptPlaces"], message: KEPT_PLACE.message },
          ],
        }),
      },
    },
    {
      files: ["src/scenes/UIScene.ts", "src/ui/arrivalCard.ts"],
      rules: { "no-restricted-imports": imports({ patterns: [KEPT_PLACE, NO_SCENE] }) },
    },
    // the worlds leave the interface to the UI scene (FS-TQZ5J)
    {
      files: ["src/scenes/BarrowspireScene.ts", "lint-fixtures/world-builds-ui.ts"],
      rules: { "no-restricted-imports": imports({ paths: [...UI_SCENE_PIECES, UI_SOUNDS], patterns: [KEPT_PLACE] }) },
    },
    {
      files: ["src/scenes/HubScene.ts", "src/scenes/FieldScene.ts"],
      rules: {
        "no-restricted-imports": imports({ paths: [...UI_SCENE_PIECES, UI_SOUNDS, ...RUN_ONLY], patterns: [KEPT_PLACE] }),
      },
    },
    // the bridge knows nothing of the chat, nor the mailbox of its slot (FS-TQZ5J § Change: Batch 6, R140)
    {
      files: ["src/ui/uiBridge.ts"],
      rules: {
        "no-restricted-imports": imports({
          patterns: [{ group: ["./chat*", "@/ui/chat*"], message: "The bridge knows nothing of the chat: the chat slot hears the bridge (FS-TQZ5J § Change: Batch 6)." }],
        }),
      },
    },
    {
      files: ["src/ui/mailboxHud.ts"],
      rules: {
        "no-restricted-imports": imports({
          paths: [{ name: "./uiSceneMailbox", message: "The mailbox knows nothing of its slot in the UI scene (FS-TQZ5J § Change: Batch 6, R140)." }],
        }),
      },
    },
    // tests and stand-ins name the banned shapes on purpose: they keep what they had before the fence grew
    {
      files: TESTS,
      rules: { "no-restricted-syntax": syntax(FETCH, COLOUR), "no-restricted-properties": "off" },
    },
    {
      files: CANVAS_LAYER.filter((f) => f.endsWith("/**")).flatMap((dir) => TESTS.map((t) => `${dir.slice(0, -3)}/${t}`)),
      rules: { "no-restricted-syntax": syntax(FETCH_SHORT) },
    },
    {
      files: ["src/render/**/*.standin.ts"],
      rules: { "no-restricted-syntax": syntax(RENDER_FETCH, COLOUR, COLOUR_NUM) },
    },
  ],
};
