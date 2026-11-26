/*
 * Core split logic (no DOM).
 *
 *   Input row :  B B B P P B B B
 *   Output    :  W W W P P W W W   <- pass for Pink
 *                B B B W W B B B   <- pass for Black
 *                W W W W W W W W   <- fill (separator) row
 */
(function (global) {
  'use strict';

  const MAX_COLORS = 4096;

  /**
   * Collect the colours of an RGBA image, optionally merging colours that are
   * within `tolerance` (RGB distance) of a more frequent colour.
   * Transparent pixels are treated as white.
   * Returns { colors: [{r,g,b,count}], idx: Uint16Array (colour index per pixel) }.
   */
  function buildPalette(rgba, w, h, tolerance) {
    const n = w * h;
    const keys = new Uint32Array(n);
    const counts = new Map();
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const key = rgba[i + 3] < 128 ? 0xffffff : (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      keys[p] = key;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const colors = [];
    const keyToIdx = new Map();
    const tol2 = tolerance * tolerance;

    for (const [key, count] of entries) {
      const r = (key >> 16) & 255, g = (key >> 8) & 255, b = key & 255;
      let target = -1;
      if (tolerance > 0) {
        let best = Infinity;
        for (let c = 0; c < colors.length; c++) {
          const dr = colors[c].r - r, dg = colors[c].g - g, db = colors[c].b - b;
          const d = dr * dr + dg * dg + db * db;
          if (d <= tol2 && d < best) { best = d; target = c; }
        }
      }
      if (target === -1) {
        if (colors.length >= MAX_COLORS) {
          throw new Error(`Image has more than ${MAX_COLORS} distinct colours. Increase "Merge similar colours" or use an indexed/pixel-art BMP.`);
        }
        target = colors.length;
        colors.push({ r, g, b, count: 0 });
      }
      colors[target].count += count;
      keyToIdx.set(key, target);
    }

    const idx = new Uint16Array(n);
    for (let p = 0; p < n; p++) idx[p] = keyToIdx.get(keys[p]);
    return { colors, idx };
  }

  /**
   * Split every row into one row per colour.
   *   idx        colour index per source pixel
   *   order      colour indices to split, in pass order (others become fill)
   *   opts.sepRows    number of fill rows appended after each source row's group
   *   opts.emptyRows  'keep' | 'skip' — rows with no split colour
   * Output pixel values: 0 = fill, c + 1 = source colour c.
   * Returns { w, h, out: Uint16Array, rows: [{src, color, kind}], groups: [{start, end}] }
   */
  function splitRows(idx, w, h, order, opts) {
    const sepRows = Math.max(0, opts.sepRows | 0);
    const maxIdx = idx.reduce((m, v) => (v > m ? v : m), 0);
    const seen = new Int32Array(maxIdx + 1).fill(-1);
    const rows = [];
    const groups = [];

    for (let y = 0; y < h; y++) {
      const base = y * w;
      for (let x = 0; x < w; x++) seen[idx[base + x]] = y;
      const start = rows.length;
      const present = order.filter((c) => c <= maxIdx && seen[c] === y);

      if (present.length === 0) {
        if (opts.emptyRows !== 'skip') rows.push({ src: y, color: -1, kind: 'empty' });
      } else {
        for (const c of present) rows.push({ src: y, color: c, kind: 'pass' });
      }
      if (rows.length > start) {
        for (let s = 0; s < sepRows; s++) rows.push({ src: y, color: -1, kind: 'sep' });
      }
      groups.push({ start, end: rows.length });
    }

    const outH = rows.length;
    const out = new Uint16Array(w * outH); // zero = fill
    for (let r = 0; r < outH; r++) {
      const row = rows[r];
      if (row.kind !== 'pass') continue;
      const src = row.src * w, dst = r * w, c = row.color;
      for (let x = 0; x < w; x++) if (idx[src + x] === c) out[dst + x] = c + 1;
    }
    return { w, h: outH, out, rows, groups };
  }

  /**
   * Merge: of two images, the one with more rows is the base (A), the other is B.
   * With equal rows the first one stays A.
   */
  function pickBase(first, second) {
    return second.h > first.h ? { a: second, b: first } : { a: first, b: second };
  }

  /**
   * Merge (in place on `rgba`): each white row added after a split is replaced by
   * the next row of B. When B runs out of rows it starts again from its first row
   * (1, 2, 3, 1, 2, 3, …). Columns beyond B's width stay white; extra columns of B
   * are ignored. Marks merged rows with `bRow` (0-based). Returns the number of rows merged.
   */
  function mergeRows(res, rgba, b) {
    const w = res.w;
    const cols = Math.min(w, b.w);
    let n = 0;
    for (let k = 0; k < res.h; k++) {
      const row = res.rows[k];
      if (row.kind !== 'sep') continue;
      const by = n++ % b.h;
      row.bRow = by;
      for (let x = 0; x < cols; x++) {
        const si = (by * b.w + x) * 4, di = (k * w + x) * 4;
        rgba[di] = b.rgba[si]; rgba[di + 1] = b.rgba[si + 1]; rgba[di + 2] = b.rgba[si + 2];
      }
    }
    return n;
  }

  /* ---------- Colour naming helpers ---------- */

  const NAMED = [
    ['White', 255, 255, 255], ['Black', 0, 0, 0], ['Pink', 255, 105, 180], ['Pink', 255, 182, 193],
    ['Red', 220, 20, 30], ['Maroon', 128, 0, 0], ['Orange', 255, 140, 0], ['Yellow', 255, 220, 0],
    ['Gold', 212, 175, 55], ['Green', 0, 160, 60], ['Olive', 128, 128, 0], ['Teal', 0, 128, 128],
    ['Cyan', 0, 200, 220], ['Blue', 30, 80, 230], ['Navy', 0, 0, 128], ['Purple', 128, 0, 128],
    ['Violet', 160, 90, 220], ['Magenta', 255, 0, 255], ['Brown', 120, 70, 20], ['Beige', 225, 205, 170],
    ['Grey', 128, 128, 128], ['Silver', 192, 192, 192], ['Cream', 255, 250, 220], ['Charcoal', 54, 69, 79],
  ];

  function nameColor(c) {
    let best = NAMED[0], bd = Infinity;
    for (const n of NAMED) {
      const d = (n[1] - c.r) ** 2 + (n[2] - c.g) ** 2 + (n[3] - c.b) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best[0];
  }

  function luminance(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
  function hex(c) { return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }
  function parseHex(s) {
    const v = parseInt(s.replace('#', ''), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  global.Split = { buildPalette, splitRows, pickBase, mergeRows, nameColor, luminance, hex, parseHex };
})(typeof window !== 'undefined' ? window : globalThis);
