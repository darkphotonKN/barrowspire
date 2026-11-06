#!/usr/bin/env node
// The client's dungeon fixture (src/render/world/dungeon.fixture.json) from the levelgen golden
// (game-server/game-service/internal/levelgen/testdata/dungeon_seed_20261106.golden.json), as a
// floor map carries it (FS-KE075 §F.31): the floor's size, its cell size, its regions and its
// walls. Never its roles: where the switch, doors and chests stand is the snapshot's, not the map's.
//
//   node tools/fixtures/dungeon-fixture.mjs           rewrite the fixture from the golden
//   node tools/fixtures/dungeon-fixture.mjs --check   exit 1 when the fixture is not the golden's
//
// `dungeon.test.ts` holds the fixture to the golden too, so a regenerated golden fails the client's
// suite until this is run.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN = resolve(here, "../../../game-server/game-service/internal/levelgen/testdata/dungeon_seed_20261106.golden.json");
export const FIXTURE = resolve(here, "../../src/render/world/dungeon.fixture.json");

/** The floor map's part of a golden layout: size, cell size, regions, walls (as the wire's WallState). */
export function fixtureFrom(golden) {
  return {
    width: golden.bounds.w,
    height: golden.bounds.h,
    cell_size: golden.cell_size,
    regions: golden.regions.map(({ id, kind, cells }) => ({ id, kind, cells: cells.map(({ x, y, w, h }) => ({ x, y, w, h })) })),
    walls: golden.walls.map(({ x, y, w, h }, i) => ({
      entity_id: `dw-${String(i).padStart(3, "0")}`,
      position: { x, y },
      width: w,
      height: h,
    })),
  };
}

/** One region or wall a line, as the fixture has always been written. */
export function format(fixture) {
  const rows = (list) => list.map((r) => `    ${JSON.stringify(r).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/,\{/g, ", {")}`).join(",\n");
  return `{
  "width": ${fixture.width},
  "height": ${fixture.height},
  "cell_size": ${fixture.cell_size},
  "regions": [
${rows(fixture.regions)}
  ],
  "walls": [
${rows(fixture.walls)}
  ]
}
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = format(fixtureFrom(JSON.parse(readFileSync(GOLDEN, "utf8"))));
  if (process.argv.includes("--check")) {
    const have = readFileSync(FIXTURE, "utf8");
    if (have !== want) {
      console.error("dungeon.fixture.json is not the levelgen golden's floor: run node tools/fixtures/dungeon-fixture.mjs");
      process.exit(1);
    }
    console.log("dungeon.fixture.json is the golden's floor");
  } else {
    writeFileSync(FIXTURE, want);
    console.log(`wrote ${FIXTURE}`);
  }
}
