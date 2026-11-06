// FS-KE075 I-KE075-3: floors 2 and 3 identity captures, from fixture states injected through the
// client's own socket dispatch (no game-service of this branch needed). Nick's server stays the
// socket's peer; the fixture run's session id is the client's own, so the hub's frames are ignored.
// usage (from game-client, beside a next dev on its own port and the local stack's game server):
//   BASE=http://localhost:4073 MODE=base|new|late LABEL=x OUT=/tmp/x node docs/fixtures/KE075-floors/floorcap.cjs
// base: walls in the state (the pre-change wire); new: floor_map first, no walls in the state;
// late: the map withheld 2.6 s, then sent (request_floor_map, build on arrival).
// Compare with: BASE_DIR=docs/fixtures/KE075-floors NEW_DIR=/tmp/x node docs/fixtures/KE075-floors/cmp.cjs
const fs = require('fs');
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:4073';
const MODE = process.env.MODE || 'base';
const LABEL = process.env.LABEL || MODE;
// the captures land in OUT (default: the system temp dir); the pre-change baseline beside this
// script is floor{2,3}-base.{png,json}, taken on ac8d19f9 before any client change of I-KE075-3
const OUT = process.env.OUT || require('os').tmpdir();
setTimeout(() => { console.log("GLOBAL TIMEOUT"); process.exit(2); }, 300000);

const SID = '0f1e2d3c-4b5a-4968-8776-ke0753fixture'.replace('ke0753fixture', 'aabbccddeeff');
const at = (x, y) => ({ x, y });
let ids = 0;
const id = (p) => `${p}-0000-4000-8000-${String(++ids).padStart(12, '0')}`.replace(/^([a-z]+)/, (m) => m.padEnd(8, '0').slice(0, 8));

/** A server building: five walls, a door in the bottom wall (session.go AddBuilding, 20/50). */
function building(bx, by, bw, bh) {
  const house = id('house');
  const t = 20, dw = 50, off = (bw - dw) / 2;
  const rects = [[bx, by, bw, t], [bx, by, t, bh], [bx + bw - t, by, t, bh], [bx, by + bh - t, off, t], [bx + off + dw, by + bh - t, off, t]];
  return {
    walls: rects.map(([x, y, w, h]) => ({ house_id: house, entity_id: id('wall'), position: at(x, y), width: w, height: h })),
    door: { entity_id: id('door'), position: at(bx + off, by + bh - t), width: dw, height: t, is_open: false },
  };
}

function floorState(floor) {
  const layout = floor === 2
    ? [building(120, 110, 300, 200), building(620, 420, 400, 300), building(1000, 60, 300, 250)]
    : [building(900, 520, 400, 300), building(140, 380, 500, 400), building(560, 80, 300, 200)];
  const me = floor === 2 ? at(700, 300) : at(760, 400);
  return {
    session_id: SID,
    world_type: 'run',
    current_player: {
      id: '11111111-2222-4333-8444-555555555555', entity_id: '11111111-2222-4333-8444-666666666666',
      username: 'Trial', class: 'warrior', position: me, direction: { vx: 0, vy: 0, speed: 0 },
      escape: false, current_health: 100, max_health: 100, level: 1, experience: 0, level_floor: 0, next_level_at: 100,
      inventory: [],
    },
    other_players: [],
    items: [],
    walls: layout.flatMap((b) => b.walls),
    doors: layout.map((b) => b.door),
    containers: [{ container_id: 'c', entity_id: `cccccccc-0000-4000-8000-00000000000${floor}`, kind: 'chest', position: floor === 2 ? at(500, 700) : at(1200, 250), is_open: false, items: [] }],
    escape_doors: [{ entity_id: `eeeeeeee-0000-4000-8000-00000000000${floor}`, position: floor === 2 ? at(1250, 800) : at(300, 150), is_open: false, is_locked: true }],
    switches: [{ entity_id: `ffffffff-0000-4000-8000-00000000000${floor}`, position: floor === 2 ? at(200, 800) : at(1300, 880), switch_id: 1, is_activated: false }],
    stairs: floor < 3 ? [{ entity_id: 'dddddddd-0000-4000-8000-000000000002', position: at(1300, 600) }] : [],
    projectiles: [],
    monsters: [],
    floor,
    floor_count: 3,
    escaped_count: 0,
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-web-security'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 845 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    const Native = window.WebSocket;
    window.__sent = [];
    function Wrapped(url, protocols) {
      const s = protocols ? new Native(url, protocols) : new Native(url);
      window.__sock = s;
      const send = s.send.bind(s);
      s.send = (d) => { try { window.__sent.push(JSON.parse(d).action); } catch {} return send(d); };
      return s;
    }
    Wrapped.prototype = Native.prototype;
    Object.assign(Wrapped, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = Wrapped;
    window.__inject = (obj) => { const s = window.__sock; if (s && s.onmessage) s.onmessage({ data: JSON.stringify(obj) }); };
    window.__findGame = () => {
      if (window.__g) return window.__g;
      const el = document.querySelector('canvas')?.parentElement; if (!el) return null;
      let f = null;
      for (let n = el; n && !f; n = n.parentElement) { const key = Object.keys(n).find(k => k.startsWith('__reactFiber')); if (key) f = n[key]; }
      while (f) { let h = f.memoizedState; while (h && typeof h === 'object') { const c = h.memoizedState && h.memoizedState.current; if (c && c.scene && c.scene.getScenes) return (window.__g = c); h = h.next; } f = f.return; }
      return null;
    };
    window.__active = () => { const g = window.__findGame(); return g ? g.scene.getScenes(true).map(s => s.sys.settings.key) : []; };
    // every display-list object of the run, as a line; containers walked
    window.__fingerprint = () => {
      const scene = window.__findGame().scene.getScene('BarrowspireScene');
      const out = [];
      const r = (n) => Math.round((n ?? 0) * 10) / 10;
      const walk = (list, depth) => {
        for (const o of list) {
          out.push(JSON.stringify({ t: o.type, k: o.texture?.key, f: o.frame?.name, x: r(o.x), y: r(o.y), d: r(o.depth), v: o.visible, a: r(o.alpha), w: r(o.width), h: r(o.height), sx: r(o.scaleX), sy: r(o.scaleY), lvl: depth }));
          if (o.list) walk(o.list, depth + 1);
        }
      };
      walk(scene.children.list, 0);
      return {
        lines: out.sort(),
        walls: scene.walls.size, buildings: scene.buildings.length, perimeter: scene.perimeter?.length ?? null,
        dressing: scene.dressing?.length ?? null, lights: scene.stampedLights, map: [scene.mapWidth, scene.mapHeight],
      };
    };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  const sleep = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type=email], input[name=email]', 'phaser4-trial@example.test');
  await page.fill('input[type=password]', 'Trial-Phaser4-pass!');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/game/, { timeout: 60000 });
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForFunction(() => window.__active().some((k) => ['MainMenuScene', 'HubScene', 'FieldScene', 'BarrowspireScene'].includes(k)), null, { timeout: 90000, polling: 100 });
  await sleep(3000);
  console.log('before inject, active', JSON.stringify(await page.evaluate(() => window.__active())));

  const feed = async (floor, ms) => {
    const state = floorState(floor);
    if (MODE !== 'base') delete state.walls;
    await page.evaluate(async ([st, ms]) => {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { window.__inject(st); await new Promise((r) => setTimeout(r, 33)); }
    }, [state, ms]);
  };
  const mapOf = (floor) => ({ action: 'floor_map', payload: { session_id: SID, floor, width: 1440, height: 960, walls: floorState(floor).walls } });

  await page.evaluate((sid) => window.__inject({ action: 'world_entered', payload: { session_id: sid, world_type: 'run' } }), SID);
  if (MODE === 'new') await page.evaluate((m) => window.__inject(m), mapOf(2));
  await page.waitForFunction(() => { const s = window.__findGame().scene.getScene('BarrowspireScene'); return s && s.sys.settings.status === 5; }, null, { timeout: 120000, polling: 100 });
  await sleep(1500);

  const capture = async (floor) => {
    const a = await page.evaluate(() => window.__fingerprint());
    await page.screenshot({ path: `${OUT}/floor${floor}-${LABEL}.png` });
    await feed(floor, 1000);
    const b = await page.evaluate(() => window.__fingerprint());
    // the stable lines: in both takes, a second apart (flicker and drift drop out)
    const count = new Map();
    for (const l of a.lines) count.set(l, (count.get(l) ?? 0) + 1);
    const stable = [];
    for (const l of b.lines) { const n = count.get(l) ?? 0; if (n > 0) { stable.push(l); count.set(l, n - 1); } }
    const { lines, ...meta } = b;
    fs.writeFileSync(`${OUT}/floor${floor}-${LABEL}.json`, JSON.stringify({ meta, stable: stable.sort(), all: lines.length }, null, 1));
    console.log(`floor ${floor}`, JSON.stringify(meta), 'stable', stable.length, 'of', lines.length);
  };

  if (MODE === 'late') {
    await feed(2, 2600);
    const before = await page.evaluate(() => { const s = window.__findGame().scene.getScene('BarrowspireScene'); return { walls: s.walls.size, perimeter: s.perimeter?.length ?? null, asks: window.__sent.filter((a) => a === 'request_floor_map').length }; });
    console.log('withheld 2.6 s', JSON.stringify(before));
    await page.evaluate((m) => window.__inject(m), mapOf(2));
    await feed(2, 1500);
    const after = await page.evaluate(() => { const s = window.__findGame().scene.getScene('BarrowspireScene'); return { walls: s.walls.size, perimeter: s.perimeter?.length ?? null, dressing: s.dressing?.length ?? null, asks: window.__sent.filter((a) => a === 'request_floor_map').length }; });
    console.log('map came', JSON.stringify(after));
    await page.screenshot({ path: `${OUT}/floor2-late.png` });
  } else {
  await feed(2, 4000);
    await capture(2);

    // the climb: floor 3's map (new code) before its first state, then its states
    if (MODE === 'new') await page.evaluate((m) => window.__inject(m), mapOf(3));
    await feed(3, 9000);
    await capture(3);

  }
  console.log('sent', JSON.stringify([...new Set(await page.evaluate(() => window.__sent))]));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
