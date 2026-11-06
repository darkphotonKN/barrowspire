const fs = require('fs');
const path = require('path');
// floors 2-3 identity: the stable display list (flicker dropped, generated texture keys normalised)
// and the largest per-channel pixel difference against the pre-change baseline (FS-KE075 §H.49)
const BASE_DIR = process.env.BASE_DIR || __dirname, NEW_DIR = process.env.NEW_DIR || require('os').tmpdir();
const at = (dir, name) => path.join(dir, name);
const sharp = require('sharp');
(async () => {
  for (const f of [2, 3]) {
    const a = JSON.parse(fs.readFileSync(at(BASE_DIR, `floor${f}-base.json`))), b = JSON.parse(fs.readFileSync(at(NEW_DIR, `floor${f}-new.json`)));
    const cnt = (xs) => { const m = new Map(); xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return m; };
    const norm = (xs) => xs.map((l) => l.replace(/"k":"[0-9a-f]{8}-[0-9a-f-]{27}"/, "\"k\":\"<generated>\""));
    const A = cnt(norm(a.stable)), B = cnt(norm(b.stable));
    const onlyA = [], onlyB = [];
    for (const [k, n] of A) { const d = n - (B.get(k) ?? 0); for (let i = 0; i < d; i++) onlyA.push(k); }
    for (const [k, n] of B) { const d = n - (A.get(k) ?? 0); for (let i = 0; i < d; i++) onlyB.push(k); }
    console.log(`floor ${f}: stable base ${a.stable.length} new ${b.stable.length}; only base ${onlyA.length}, only new ${onlyB.length}`);
    onlyA.slice(0, 6).forEach((l) => console.log('  -', l)); onlyB.slice(0, 6).forEach((l) => console.log('  +', l));
    const [pa, pb] = await Promise.all([at(BASE_DIR, `floor${f}-base.png`), at(NEW_DIR, `floor${f}-new.png`)].map((p) => sharp(p).raw().toBuffer({ resolveWithObject: true })));
    let diff = 0, big = 0; const n = pa.data.length / pa.info.channels;
    for (let i = 0; i < pa.data.length; i += pa.info.channels) {
      const d = Math.max(Math.abs(pa.data[i] - pb.data[i]), Math.abs(pa.data[i + 1] - pb.data[i + 1]), Math.abs(pa.data[i + 2] - pb.data[i + 2]));
      if (d > 0) diff++; if (d > 24) big++;
    }
    console.log(`  pixels differing ${(100 * diff / n).toFixed(2)}%, by more than 24/255 ${(100 * big / n).toFixed(3)}%`);
  }
})();
