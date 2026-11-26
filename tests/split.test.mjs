// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for (const f of ['public/js/split.js', 'public/js/bmp.js']) {
  vm.runInThisContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), { filename: f });
}
const { Split: S, BMP } = globalThis;

const COLORS = {
  W: [255, 255, 255], B: [0, 0, 0], P: [255, 105, 180], R: [220, 20, 30], G: [0, 160, 60], Y: [255, 220, 0],
};
const LETTER = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [c.join(), k]));

// rows like ['BBBPPBBB', ...] -> { w, h, rgba }
function image(rows) {
  const h = rows.length, w = rows[0].length;
  const rgba = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => rgba.set([...COLORS[ch], 255], (y * w + x) * 4)));
  return { w, h, rgba };
}

function toRows(rgba, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      s += LETTER[[rgba[i], rgba[i + 1], rgba[i + 2]].join()] ?? '?';
    }
    rows.push(s);
  }
  return rows;
}

// Same steps as the Split / Merge tabs in app.js
function split(img, sepRows) {
  const { colors, idx } = S.buildPalette(img.rgba, img.w, img.h, 0);
  const order = colors.map((_, i) => i)
    .filter((i) => S.hex(colors[i]) !== '#FFFFFF')
    .sort((a, b) => S.luminance(colors[b]) - S.luminance(colors[a]));
  const res = S.splitRows(idx, img.w, img.h, order, { sepRows, emptyRows: 'keep' });
  const pal = [{ r: 255, g: 255, b: 255 }].concat(colors);
  const rgba = new Uint8ClampedArray(res.w * res.h * 4);
  for (let p = 0; p < res.out.length; p++) { const c = pal[res.out[p]]; rgba.set([c.r, c.g, c.b, 255], p * 4); }
  return { res, rgba };
}

function merge(first, second) {
  const { a, b } = S.pickBase(first, second);
  const { res, rgba } = split(a, 1);
  const merged = S.mergeRows(res, rgba, b);
  return { a, b, res, rgba, merged, rows: toRows(rgba, res.w, res.h) };
}

test('Split: the example from the drawing', () => {
  const { res, rgba } = split(image(['BBBPPBBB']), 1);
  assert.deepEqual(toRows(rgba, res.w, res.h), ['WWWPPWWW', 'BBBWWBBB', 'WWWWWWWW']);
});

test('Split: all-white rows stay as one white row plus the separator', () => {
  const { res, rgba } = split(image(['BBBPPBBB', 'WWWWWWWW']), 1);
  assert.deepEqual(toRows(rgba, res.w, res.h), ['WWWPPWWW', 'BBBWWBBB', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW']);
});

test('Split (No White): no separator rows', () => {
  const { res, rgba } = split(image(['BBBPPBBB', 'RRGGBBPP']), 0);
  assert.deepEqual(toRows(rgba, res.w, res.h), [
    'WWWPPWWW', 'BBBWWBBB',
    'WWWWWWPP', 'WWGGWWWW', 'RRWWWWWW', 'WWWWBBWW',
  ]);
});

test('Split: 20 colours in one row give 20 rows plus 1 white row', () => {
  const w = 40, rgba = new Uint8ClampedArray(w * 4);
  for (let x = 0; x < w; x++) rgba.set([10 * Math.floor(x / 2), 50, 100, 255], x * 4);
  const { res } = split({ w, h: 1, rgba }, 1);
  assert.equal(res.h, 21);
  assert.equal(res.rows.filter((r) => r.kind === 'pass').length, 20);
  assert.equal(res.rows[20].kind, 'sep');
});

test('Merge: the image with more rows is A, whatever the upload order', () => {
  const big = image(['BBPP', 'PPBB', 'BPBP']);
  const small = image(['RRRR']);
  assert.equal(S.pickBase(big, small).a, big);
  assert.equal(S.pickBase(small, big).a, big);
  const sameA = image(['BBBB']);
  assert.equal(S.pickBase(sameA, small).a, sameA, 'equal rows: first upload stays A');
});

test('Merge: white rows take B rows in a cycle 1,2,3,1,2,3', () => {
  const A = image(['BBBB', 'PPPP', 'BBBB', 'PPPP', 'BBBB', 'PPPP', 'BBBB']); // 7 rows
  const B = image(['RRRR', 'GGGG', 'YYYY']);                                 // 3 rows
  for (const order of [[A, B], [B, A]]) {
    const { rows, res, merged } = merge(...order);
    assert.equal(merged, 7);
    assert.deepEqual(res.rows.filter((r) => r.kind === 'sep').map((r) => r.bRow + 1), [1, 2, 3, 1, 2, 3, 1]);
    assert.deepEqual(rows, [
      'BBBB', 'RRRR', 'PPPP', 'GGGG', 'BBBB', 'YYYY', 'PPPP', 'RRRR',
      'BBBB', 'GGGG', 'PPPP', 'YYYY', 'BBBB', 'RRRR',
    ]);
  }
});

test('Merge: A\'s own all-white rows stay white; their separator still takes a B row', () => {
  const { rows } = merge(image(['BBBB', 'WWWW', 'PPPP']), image(['RRRR', 'GGGG']));
  assert.deepEqual(rows, ['BBBB', 'RRRR', 'WWWW', 'GGGG', 'PPPP', 'RRRR']);
});

test('Merge: narrower B is padded with white, wider B is cropped', () => {
  const A = image(['BBBB', 'PPPP', 'BBBB']);
  assert.deepEqual(merge(A, image(['RR'])).rows, ['BBBB', 'RRWW', 'PPPP', 'RRWW', 'BBBB', 'RRWW']);
  assert.deepEqual(merge(A, image(['GGGGGG', 'YYYYYY'])).rows, ['BBBB', 'GGGG', 'PPPP', 'YYYY', 'BBBB', 'GGGG']);
});

test('BMP: 24-bit file has a valid header and bottom-up, padded rows', async () => {
  const img = image(['RGB', 'PYW']); // width 3 -> 9 bytes per row, padded to 12
  const buf = Buffer.from(await BMP.encode24(img.w, img.h, img.rgba).arrayBuffer());
  assert.equal(buf.toString('latin1', 0, 2), 'BM');
  assert.equal(buf.readUInt32LE(2), buf.length);
  assert.equal(buf.readInt32LE(18), 3);
  assert.equal(buf.readInt32LE(22), 2);
  assert.equal(buf.readUInt16LE(28), 24);
  assert.equal(buf.length, 54 + 12 * 2);
  const px = (row, x) => { const o = 54 + row * 12 + x * 3; return [buf[o + 2], buf[o + 1], buf[o]]; }; // BGR -> RGB
  assert.deepEqual(px(1, 0), COLORS.R); // top image row is stored last
  assert.deepEqual(px(0, 1), COLORS.Y);
  assert.deepEqual([...buf.subarray(54 + 9, 54 + 12)], [0, 0, 0]); // row padding
});
