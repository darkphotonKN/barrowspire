// The catalogue: every sheet the bake produces, by manifest name (FS-2325V §B.4).
//
// A sheet is one kind of thing. Its animations are its states (door locked/unlocked/open),
// facings (chair n/e/s/w), variants (grass: frames a..d, picked by the scene with a hash), or,
// later, real animations (walk). Every frame of a sheet shares one size and one anchor.
//
// `group` decides which atlas a sheet is packed into, so a scene can load only what it draws.
// World directions: n = -y, s = +y, e = +x, w = -x (server axes; screen: s/e fall toward the
// viewer).

import { oak, pine, bush, rock, grassTuft, pebbles, LEAF } from "./models/nature.js";
import {
  wallPiece,
  post,
  roofSlope,
  roofRidge,
  WALL_BACK,
  WALL_FRONT,
  SCONCE_FLAME,
  CRESSET_FLAME,
  WINDOW_GLASS,
} from "./models/architecture.js";
import { brazier, lampPost, table, chair, barrel, BRAZIER_FLAME, LAMP_GLASS } from "./models/props.js";
import { door, escapeDoor, lever, chest } from "./models/interactables.js";
import { ICONS } from "./models/items.js";
import { groundTile, transitionTile } from "./ground.js";
import { CAST } from "./characters/cast.js";

export const LICENCE = "Barrowspire original work (procedural, no third-party assets)";
const src = (file, fn) => `procedural: tools/bake/page/${file}#${fn}`;

export const ICON_SIZE = 64;

const still = (...frames) => ({ fps: 0, loop: false, frames });
/** Rotates a model-space point a quarter turn about +y, as a y-axis piece is. */
const onAxis = (p, axis) => (axis === "y" ? [p[2], p[1], -p[0]] : p);

function groundSheets() {
  const sheets = [];
  for (const material of ["grass", "dirt", "cobble", "flagstone"])
    sheets.push({
      name: `ground_${material}`,
      group: "ground",
      kind: "tile",
      animations: { variants: still(...[0, 1, 2, 3].map((v) => () => groundTile(material, v))) },
      source: src("ground.js", material),
    });
  for (const [a, b] of [
    ["grass", "dirt"],
    ["grass", "cobble"],
  ]) {
    const animations = {};
    for (const edge of ["n", "e", "s", "w", "ne", "se", "sw", "nw"])
      animations[edge] = still(() => transitionTile(a, b, edge));
    sheets.push({
      name: `ground_${a}_${b}`,
      group: "ground",
      kind: "tile",
      animations,
      source: src("ground.js", `transitionTile(${a}, ${b})`),
    });
  }
  return sheets;
}

function natureSheets() {
  const prop = (name, file, fn, builders, opts = {}) => ({
    name,
    group: "nature",
    kind: "prop",
    animations: { variants: still(...builders) },
    source: src(file, fn),
    ...opts,
  });
  return [
    prop("decal_grass_tuft", "models/nature.js", "grassTuft", [11, 12, 13].map((s) => () => grassTuft(s)), { pad: 0.05 }),
    prop("decal_pebbles", "models/nature.js", "pebbles", [21, 22, 23].map((s) => () => pebbles(s)), { pad: 0.05 }),
    prop("tree_oak", "models/nature.js", "oak", [() => oak(3, LEAF.oak), () => oak(15, LEAF.oakDeep)]),
    prop("tree_oak_autumn", "models/nature.js", "oak", [() => oak(8, LEAF.autumn)]),
    prop("tree_pine", "models/nature.js", "pine", [() => pine(4), () => pine(9)]),
    prop("bush", "models/nature.js", "bush", [() => bush(2), () => bush(6)]),
    prop("rock", "models/nature.js", "rock", [() => rock(1), () => rock(5), () => rock(11)]),
  ];
}

const WALL_LIGHTS = {
  back: {
    torch: { at: SCONCE_FLAME, radius: 220, color: "amber", flicker: 0.6 },
    window: { at: WINDOW_GLASS, radius: 140, color: "amberBright", flicker: 0.1 },
  },
  front: {
    torch: { at: CRESSET_FLAME, radius: 160, color: "amber", flicker: 0.6 },
    window: { at: [0, WALL_FRONT - 0.3, 0.09], radius: 90, color: "amberBright", flicker: 0.1 },
  },
};

function architectureSheets() {
  const sheets = [];
  for (const [height, H] of [
    ["back", WALL_BACK],
    ["front", WALL_FRONT],
  ])
    for (const variant of ["plain", "brace", "window", "torch"])
      for (const axis of ["x", "y"]) {
        const light = WALL_LIGHTS[height][variant];
        sheets.push({
          name: `wall_${height}_${variant}_${axis}`,
          group: "architecture",
          kind: "prop",
          animations: { variants: still(...[1, 6].map((seed) => () => wallPiece(H, variant, axis, seed + (H > 2 ? 0 : 2)))) },
          light: light && { ...light, at: onAxis(light.at, axis) },
          source: src("models/architecture.js", "wallPiece"),
        });
      }
  for (const [height, H] of [
    ["back", WALL_BACK],
    ["front", WALL_FRONT],
  ])
    sheets.push({
      name: `post_${height}`,
      group: "architecture",
      kind: "prop",
      animations: { default: still(() => post(H)) },
      source: src("models/architecture.js", "post"),
    });
  sheets.push({
    name: "roof_slope",
    group: "architecture",
    kind: "prop",
    shadow: false,
    animations: Object.fromEntries(["s", "e", "n", "w"].map((f) => [f, still(() => roofSlope(f))])),
    source: src("models/architecture.js", "roofSlope"),
  });
  sheets.push({
    name: "roof_ridge",
    group: "architecture",
    kind: "prop",
    shadow: false,
    animations: Object.fromEntries(["x", "y"].map((a) => [a, still(() => roofRidge(a))])),
    source: src("models/architecture.js", "roofRidge"),
  });
  return sheets;
}

function propSheets() {
  const sheets = [];
  const states = (fn, list, ...args) => Object.fromEntries(list.map((s) => [s, still(() => fn(s, ...args))]));
  for (const axis of ["x", "y"]) {
    sheets.push({
      name: `door_${axis}`,
      group: "props",
      kind: "prop",
      animations: states(door, ["locked", "unlocked", "open"], axis),
      source: src("models/interactables.js", "door"),
    });
    sheets.push({
      name: `escape_door_${axis}`,
      group: "props",
      kind: "prop",
      animations: states(escapeDoor, ["locked", "unlocked", "open"], axis),
      source: src("models/interactables.js", "escapeDoor"),
    });
  }
  sheets.push(
    {
      name: "switch",
      group: "props",
      kind: "prop",
      animations: states(lever, ["inactive", "active"]),
      source: src("models/interactables.js", "lever"),
    },
    {
      name: "chest",
      group: "props",
      kind: "prop",
      animations: states(chest, ["closed", "open"]),
      source: src("models/interactables.js", "chest"),
    },
    {
      name: "lamp_post",
      group: "props",
      kind: "prop",
      animations: { default: still(lampPost) },
      light: { at: LAMP_GLASS, radius: 220, color: "amberBright", flicker: 0.15 },
      source: src("models/props.js", "lampPost"),
    },
    {
      name: "brazier",
      group: "props",
      kind: "prop",
      animations: { default: still(brazier) },
      light: { at: BRAZIER_FLAME, radius: 300, color: "amber", flicker: 0.7 },
      source: src("models/props.js", "brazier"),
    },
    {
      name: "table",
      group: "props",
      kind: "prop",
      animations: { default: still(table) },
      source: src("models/props.js", "table"),
    },
    {
      name: "chair",
      group: "props",
      kind: "prop",
      animations: states(chair, ["s", "e", "n", "w"]),
      source: src("models/props.js", "chair"),
    },
    {
      name: "barrel",
      group: "props",
      kind: "prop",
      animations: { default: still(barrel) },
      source: src("models/props.js", "barrel"),
    },
  );
  return sheets;
}

function iconSheets() {
  return Object.entries(ICONS).map(([name, build]) => ({
    name: `icon_${name}`,
    group: "icons",
    kind: "icon",
    animations: { default: still(build) },
    source: src("models/items.js", name),
  }));
}

/**
 * Characters and creatures (FS-2325V §E), authored in code on the shared rig (ADR-0021): each is
 * one 8-direction sheet with idle, walk, attack and death (characters/clips.js ANIMATIONS).
 */
function characterSheets() {
  return CAST.map((c) => ({
    name: c.sheet,
    group: c.group,
    kind: "character",
    build: c.build,
    source: `authored: tools/bake/page/characters/cast.js#${c.fn}`,
  }));
}

export const CATALOGUE = [
  ...groundSheets(),
  ...natureSheets(),
  ...architectureSheets(),
  ...propSheets(),
  ...iconSheets(),
  ...characterSheets(),
].map((s) => ({ licence: LICENCE, ...s }));
