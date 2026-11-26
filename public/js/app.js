/* Handloom Panel — Split, Split (No White) and Merge tabs */
(function () {
  'use strict';

  const S = window.Split;
  const FILL = { r: 255, g: 255, b: 255 }; // white

  const MODES = {
    'split':         { sepRows: 1, merge: false, suffix: '_split' },
    'split-nowhite': { sepRows: 0, merge: false, suffix: '_split_nowhite' },
    'merge':         { sepRows: 1, merge: true,  suffix: '_merge' },
  };

  /* ================= Panel markup ================= */
  function panelHTML(mode) {
    const accept = '.bmp,image/bmp,image/png,image/gif';
    const uploads = mode.merge
      ? `<label class="btn primary"><input type="file" class="js-file" data-slot="0" accept="${accept}" multiple hidden>Upload BMP 1</label>
         <label class="btn primary alt"><input type="file" class="js-file" data-slot="1" accept="${accept}" hidden>Upload BMP 2</label>`
      : `<label class="btn primary"><input type="file" class="js-file" data-slot="0" accept="${accept}" hidden>Upload BMP</label>`;
    const meta = mode.merge
      ? `<strong class="js-name">Upload two BMPs, in any order</strong>
         <span class="js-stats">The one with more rows becomes A (base). A is split, then each white row is replaced by the next row of B (1, 2, 3, 1, 2, 3, …).</span>`
      : `<strong class="js-name">No image loaded</strong>
         <span class="js-stats">Upload a BMP or drop it anywhere on the page</span>`;
    const bView = mode.merge
      ? `<div class="view">
           <div class="view-label">B · Row source <span class="js-b-dims"></span></div>
           <div class="canvas-wrap js-b-wrap" data-role="b"><canvas class="js-b-canvas"></canvas><div class="placeholder">Image with fewer rows</div></div>
         </div>`
      : '';
    return `
      <div class="card actionbar">
        <div class="uploads">${uploads}</div>
        <div class="file-meta">${meta}</div>
        <div class="downloads">
          <button class="btn js-dl-bmp" type="button" disabled>Download BMP</button>
          <button class="btn js-dl-png" type="button" disabled>Download PNG</button>
        </div>
      </div>

      <div class="card preview-card">
        <div class="toolbar">
          <h2>Preview</h2>
          <div class="tools">
            <label class="zoom">Zoom
              <input type="range" class="js-zoom" min="1" max="40" value="8">
              <span class="js-zoom-val">8px</span>
            </label>
            <button class="btn ghost sm js-fit" type="button">Fit</button>
          </div>
        </div>
        <div class="views ${mode.merge ? 'three' : ''}">
          <div class="view">
            <div class="view-label">${mode.merge ? 'A · Base' : 'Input'} <span class="js-in-dims"></span></div>
            <div class="canvas-wrap js-in-wrap" data-role="a"><canvas class="js-in-canvas"></canvas><div class="placeholder">${mode.merge ? 'Image with more rows' : 'No image loaded'}</div></div>
          </div>
          ${bView}
          <div class="view">
            <div class="view-label">Output <span class="js-out-dims"></span></div>
            <div class="canvas-wrap js-out-wrap"><canvas class="js-out-canvas"></canvas><div class="placeholder">Output appears here</div></div>
          </div>
        </div>
        <p class="hint center">Click a row (or use ↑ / ↓) to inspect how it splits.</p>
      </div>

      <div class="card">
        <div class="toolbar">
          <h2>Row inspector <span class="muted js-insp-title"></span></h2>
        </div>
        <div class="inspector js-inspector"><p class="hint">Select a row in the preview.</p></div>
      </div>`;
  }

  /* ================= Pixel canvas view ================= */
  class PixelView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.off = document.createElement('canvas');
      this.w = 0; this.h = 0;
      this.groups = null;
      this.highlight = null; // [rowStart, rowEnd)
    }
    setImage(w, h, rgba) {
      this.w = w; this.h = h;
      this.off.width = w; this.off.height = h;
      this.off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
      this.canvas.closest('.canvas-wrap').classList.add('loaded');
    }
    draw(s) {
      const { ctx, w, h } = this;
      if (!w) return;
      const W = w * s, H = h * s;
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.off, 0, 0, W, H);

      if (s >= 5) {
        ctx.beginPath();
        for (let x = 1; x < w; x++) { ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, H); }
        for (let y = 1; y < h; y++) { ctx.moveTo(0, y * s + 0.5); ctx.lineTo(W, y * s + 0.5); }
        ctx.strokeStyle = 'rgba(120,120,130,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (this.groups) {
          ctx.beginPath();
          for (const g of this.groups) if (g.start > 0 && g.end > g.start) { ctx.moveTo(0, g.start * s + 0.5); ctx.lineTo(W, g.start * s + 0.5); }
          ctx.strokeStyle = 'rgba(79,70,229,0.55)';
          ctx.stroke();
        }
      }
      if (this.highlight && this.highlight[1] > this.highlight[0]) {
        const [a, b] = this.highlight;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#f59e0b';
        ctx.strokeRect(1, a * s + 1, W - 2, (b - a) * s - 2);
        ctx.lineWidth = 1;
      }
    }
    cellAt(ev, scale) {
      const r = this.canvas.getBoundingClientRect();
      const x = Math.floor((ev.clientX - r.left) / scale);
      const y = Math.floor((ev.clientY - r.top) / scale);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
      return { x, y };
    }
  }

  /* ================= Shared helpers ================= */
  async function decodeFile(file) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    } catch (_) {
      bmp = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not read this image file.'));
        img.src = URL.createObjectURL(file);
      });
    }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    // transparent pixels count as white
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) { rgba[i] = rgba[i + 1] = rgba[i + 2] = 255; }
      rgba[i + 3] = 255;
    }
    return { w: c.width, h: c.height, rgba, name: file.name };
  }

  const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'design';
  const pixelAt = (rgba, i) => ({ r: rgba[i * 4], g: rgba[i * 4 + 1], b: rgba[i * 4 + 2] });
  const describe = (c) => `<i style="background:${S.hex(c)}"></i><b>${S.nameColor(c)}</b> ${S.hex(c)}`;

  function stripCanvas(rgba, start, w, cell) {
    const cv = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * cell * dpr; cv.height = cell * dpr;
    cv.style.width = w * cell + 'px'; cv.style.height = cell + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = 'rgba(120,120,130,0.45)';
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = S.hex(pixelAt(rgba, start + x));
      ctx.fillRect(x * cell, 0, cell, cell);
      ctx.strokeRect(x * cell + 0.5, 0.5, cell - 1, cell - 1);
    }
    return cv;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Downloaded ' + name);
  }

  let toastT;
  function toast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, isErr ? 5000 : 2200);
  }

  const tip = document.getElementById('tooltip');
  function showTip(ev, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  /* ================= One tool per tab ================= */
  function createTool(root, mode) {
    root.innerHTML = panelHTML(mode);
    const q = (sel) => root.querySelector(sel);

    const st = {
      slots: [null, null], // uploaded images in upload-button order (merge uses both)
      a: null,            // base image { w, h, rgba, name } — the one that gets split
      b: null,            // merge only: image with fewer rows, supplies the rows for the white lines
      colors: [],         // colours of A
      srcIdx: null,       // colour id per pixel of A
      result: null,       // split result + rgba
      selectedRow: -1,
      scale: 8,
      fitted: false,
    };

    const inView = new PixelView(q('.js-in-canvas'));
    const outView = new PixelView(q('.js-out-canvas'));
    const bView = mode.merge ? new PixelView(q('.js-b-canvas')) : null;

    /* ---------- loading ---------- */
    // files: [{ file, slot }]
    async function load(files) {
      try {
        for (const { file, slot } of files) st.slots[slot] = await decodeFile(file);
        assignRoles();
        st.fitted = false;
        compute();
      } catch (e) {
        toast(e.message || 'Could not load image', true);
      }
    }

    // Merge: whichever image has more rows is A (base), regardless of upload order.
    function assignRoles() {
      const [first, second] = st.slots;
      let a = first || second, b = null;
      if (mode.merge && first && second) ({ a, b } = S.pickBase(first, second));
      if (a !== st.a) setA(a);
      if (mode.merge && b !== st.b) {
        st.b = b;
        if (b) {
          bView.setImage(b.w, b.h, b.rgba);
          q('.js-b-dims').textContent = `${b.w} × ${b.h} · ${b.name}`;
        }
      }
    }

    function setA(img) {
      const built = S.buildPalette(img.rgba, img.w, img.h, 0);
      st.a = img;
      st.srcIdx = built.idx;
      st.colors = built.colors.map((c) => ({ ...c, name: S.nameColor(c) }));
      st.selectedRow = 0;
      inView.setImage(img.w, img.h, img.rgba);
      q('.js-in-dims').textContent = mode.merge ? `${img.w} × ${img.h} · ${img.name}` : `${img.w} × ${img.h}`;
    }

    /* ---------- compute ---------- */
    function compute() {
      updateMeta();
      if (!st.a) { fit(); return; }
      const { w, h } = st.a;
      const fillHex = S.hex(FILL);
      // every non-white colour gets its own pass, lighter colours first
      const order = st.colors.map((_, i) => i)
        .filter((i) => S.hex(st.colors[i]) !== fillHex)
        .sort((a, b) => S.luminance(st.colors[b]) - S.luminance(st.colors[a]));
      const res = S.splitRows(st.srcIdx, w, h, order, { sepRows: mode.sepRows, emptyRows: 'keep' });

      const outPal = [FILL].concat(st.colors); // 0 = white, c + 1 = colour c
      const rgba = new Uint8ClampedArray(res.w * res.h * 4);
      for (let p = 0; p < res.out.length; p++) {
        const c = outPal[res.out[p]], i = p * 4;
        rgba[i] = c.r; rgba[i + 1] = c.g; rgba[i + 2] = c.b; rgba[i + 3] = 255;
      }

      // Merge: each white row is replaced by the next row of B, cycling 1, 2, 3, 1, 2, 3, …
      const merged = mode.merge && st.b ? S.mergeRows(res, rgba, st.b) : 0;

      st.result = { ...res, rgba, colorCount: order.length, merged };
      outView.setImage(res.w, res.h, rgba);
      outView.groups = mode.sepRows ? res.groups : null;
      q('.js-out-dims').textContent = `${res.w} × ${res.h}`;
      updateMeta();

      const ready = !mode.merge || !!st.b;
      q('.js-dl-bmp').disabled = q('.js-dl-png').disabled = !ready;

      if (!st.fitted) { fit(); st.fitted = true; } else draw();
      renderInspector();
    }

    function updateMeta() {
      const r = st.result;
      if (mode.merge) {
        const { a, b } = st;
        if (!a) return;
        q('.js-name').textContent = b
          ? `A (base): ${a.name} · ${a.h} rows   |   B (rows): ${b.name} · ${b.h} rows`
          : `A (base): ${a.name} · ${a.h} rows   |   B: upload the second BMP`;
        const parts = [];
        let warn = false;
        if (r) parts.push(`${a.w} × ${a.h} → ${r.w} × ${r.h} · ${r.colorCount} colour${r.colorCount === 1 ? '' : 's'}`);
        if (b && r) {
          parts.push(b.h < r.merged
            ? `${r.merged} white rows filled with B rows 1–${b.h}, repeating`
            : `${r.merged} white rows filled with B rows 1–${r.merged}`);
          if (a.h === b.h) parts.push('same row count, so BMP 1 is A');
          if (b.w < a.w) { parts.push(`B is ${b.w} wide, so the last ${a.w - b.w} columns stay white`); warn = true; }
          if (b.w > a.w) { parts.push(`B is ${b.w} wide, so only its first ${a.w} columns are used`); warn = true; }
        }
        q('.js-stats').textContent = parts.join(' · ');
        q('.js-stats').classList.toggle('warn', warn);
      } else if (st.a && r) {
        q('.js-name').textContent = st.a.name;
        q('.js-stats').textContent = `${st.a.w} × ${st.a.h} → ${r.w} × ${r.h} · ${r.colorCount} colour${r.colorCount === 1 ? '' : 's'}${mode.sepRows ? ' + white' : ''}`;
      }
    }

    /* ---------- drawing ---------- */
    function draw() {
      const r = st.result, sel = st.selectedRow;
      inView.highlight = sel >= 0 ? [sel, sel + 1] : null;
      outView.highlight = sel >= 0 && r ? [r.groups[sel].start, r.groups[sel].end] : null;
      inView.draw(st.scale);
      if (r) outView.draw(st.scale);
      if (bView && st.b) {
        const by = selectedBRow();
        bView.highlight = by >= 0 ? [by, by + 1] : null;
        bView.draw(st.scale);
      }
      q('.js-zoom').value = st.scale;
      q('.js-zoom-val').textContent = st.scale + 'px';
    }

    function fit() {
      const ref = st.a || st.b;
      if (!ref) return;
      const wrap = q('.js-in-wrap');
      if (!wrap.clientWidth) return; // tab hidden; fit when shown
      const availW = Math.max(60, wrap.clientWidth - 24);
      const availH = Math.max(240, wrap.clientHeight - 24);
      const s = Math.floor(Math.min(availW / ref.w, availH / ref.h));
      st.scale = Math.max(1, Math.min(40, s));
      draw();
    }

    // B row used for the selected A row's white line (-1 if none)
    function selectedBRow() {
      const r = st.result;
      if (!mode.merge || !st.b || !r || st.selectedRow < 0) return -1;
      const g = r.groups[st.selectedRow];
      for (let k = g.start; k < g.end; k++) if (r.rows[k].bRow !== undefined) return r.rows[k].bRow;
      return -1;
    }

    function scrollIntoWrap(wrap, top, bottom) {
      if (top < wrap.scrollTop || bottom > wrap.scrollTop + wrap.clientHeight) {
        wrap.scrollTop = Math.max(0, top - wrap.clientHeight / 3);
      }
    }

    function selectRow(y) {
      if (!st.a) return;
      st.selectedRow = Math.max(0, Math.min(st.a.h - 1, y));
      draw();
      renderInspector();
      const g = st.result.groups[st.selectedRow], s = st.scale;
      scrollIntoWrap(q('.js-out-wrap'), g.start * s, g.end * s);
      scrollIntoWrap(q('.js-in-wrap'), st.selectedRow * s, (st.selectedRow + 1) * s);
      const by = selectedBRow();
      if (by >= 0) scrollIntoWrap(q('.js-b-wrap'), by * s, (by + 1) * s);
    }

    /* ---------- inspector ---------- */
    function renderInspector() {
      const box = q('.js-inspector');
      const r = st.result;
      if (!st.a || !r || st.selectedRow < 0 || !box.clientWidth) return;
      const y = st.selectedRow, w = st.a.w;
      const g = r.groups[y];
      q('.js-insp-title').textContent = `· row ${y + 1} of ${st.a.h} → ${g.end - g.start} output row${g.end - g.start === 1 ? '' : 's'}`;

      const avail = Math.max(200, box.clientWidth - 170);
      const cell = Math.max(4, Math.min(22, Math.floor(avail / w)));

      box.innerHTML = '';
      const addLine = (label, sub, swatch, rgba, start, cls) => {
        const row = document.createElement('div');
        row.className = 'insp-row ' + (cls || '');
        const lab = document.createElement('div');
        lab.className = 'insp-label';
        lab.innerHTML = `<strong>${swatch ? `<i style="background:${swatch}"></i>` : ''}${label}</strong><small>${sub}</small>`;
        const sc = document.createElement('div');
        sc.className = 'insp-strip';
        sc.appendChild(stripCanvas(rgba, start, w, cell));
        row.append(lab, sc);
        box.appendChild(row);
      };

      addLine(mode.merge ? 'A (base)' : 'Input', `row ${y + 1}`, null, st.a.rgba, y * w, 'is-input');
      const arrow = document.createElement('div');
      arrow.className = 'insp-arrow';
      arrow.textContent = '↓ split';
      box.appendChild(arrow);

      for (let k = g.start; k < g.end; k++) {
        const row = r.rows[k];
        if (row.kind === 'pass') {
          const c = st.colors[row.color];
          addLine(c.name, `${S.hex(c)} · out row ${k + 1}`, S.hex(c), r.rgba, k * w, '');
        } else if (row.kind === 'sep' && row.bRow !== undefined) {
          addLine(`B row ${row.bRow + 1}`, `replaces white · out row ${k + 1}`, null, r.rgba, k * w, 'is-merge');
        } else {
          addLine('White', `out row ${k + 1}`, '#FFFFFF', r.rgba, k * w, 'is-fill');
        }
      }
    }

    /* ---------- pointer & keyboard ---------- */
    q('.js-in-canvas').addEventListener('mousemove', (ev) => {
      const p = inView.cellAt(ev, st.scale);
      if (!p) return hideTip();
      showTip(ev, `${describe(pixelAt(st.a.rgba, p.y * st.a.w + p.x))}<br>Row ${p.y + 1}, col ${p.x + 1}`);
    });
    q('.js-out-canvas').addEventListener('mousemove', (ev) => {
      const r = st.result;
      const p = outView.cellAt(ev, st.scale);
      if (!p || !r) return hideTip();
      const row = r.rows[p.y];
      const from = row.bRow !== undefined ? `B row ${row.bRow + 1}` : `from row ${row.src + 1}`;
      showTip(ev, `${describe(pixelAt(r.rgba, p.y * r.w + p.x))}<br>Out row ${p.y + 1}, col ${p.x + 1} · ${from}`);
    });
    q('.js-in-canvas').addEventListener('click', (ev) => { const p = inView.cellAt(ev, st.scale); if (p) selectRow(p.y); });
    q('.js-out-canvas').addEventListener('click', (ev) => {
      const p = outView.cellAt(ev, st.scale);
      if (p && st.result) selectRow(st.result.rows[p.y].src);
    });
    if (bView) {
      q('.js-b-canvas').addEventListener('mousemove', (ev) => {
        const p = bView.cellAt(ev, st.scale);
        if (!p) return hideTip();
        showTip(ev, `${describe(pixelAt(st.b.rgba, p.y * st.b.w + p.x))}<br>B row ${p.y + 1}, col ${p.x + 1}`);
      });
      q('.js-b-canvas').addEventListener('click', (ev) => {
        const p = bView.cellAt(ev, st.scale);
        // jump to the first A row whose white line uses this B row
        const k = p && st.result ? st.result.rows.findIndex((row) => row.bRow === p.y) : -1;
        if (k >= 0) selectRow(st.result.rows[k].src);
      });
    }
    root.querySelectorAll('canvas').forEach((c) => c.addEventListener('mouseleave', hideTip));

    /* ---------- controls ---------- */
    root.querySelectorAll('input[type=file]').forEach((input) => {
      input.addEventListener('change', () => {
        const slot = +input.dataset.slot;
        const files = [...input.files];
        // two files picked at once fill both slots
        if (files.length) load(files.length > 1 && mode.merge ? files.slice(0, 2).map((file, i) => ({ file, slot: i })) : [{ file: files[0], slot }]);
        input.value = '';
      });
    });

    q('.js-dl-bmp').addEventListener('click', () => {
      const r = st.result;
      download(BMP.encode24(r.w, r.h, r.rgba), baseName(st.a.name) + mode.suffix + '.bmp');
    });
    q('.js-dl-png').addEventListener('click', () => {
      const r = st.result;
      const c = document.createElement('canvas');
      c.width = r.w; c.height = r.h;
      c.getContext('2d').putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
      c.toBlob((b) => download(b, baseName(st.a.name) + mode.suffix + '.png'), 'image/png');
    });

    q('.js-zoom').addEventListener('input', (e) => { st.scale = +e.target.value; draw(); });
    q('.js-fit').addEventListener('click', fit);

    // keep the previews scrolled together horizontally
    const wraps = [...root.querySelectorAll('.canvas-wrap')];
    let syncing = false;
    wraps.forEach((wEl) => wEl.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      wraps.forEach((o) => { if (o !== wEl) o.scrollLeft = wEl.scrollLeft; });
      syncing = false;
    }));

    return {
      onShow() {
        if (!st.fitted && (st.a || st.b)) { fit(); st.fitted = !!st.a; }
        else draw();
        renderInspector();
      },
      onKey(ev) {
        if (!st.a) return;
        if (ev.key === 'ArrowDown') { ev.preventDefault(); selectRow(st.selectedRow + 1); }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); selectRow(st.selectedRow - 1); }
      },
      onDrop(files, target) {
        if (!mode.merge) return load([{ file: files[0], slot: 0 }]);
        if (files.length > 1) return load(files.slice(0, 2).map((file, i) => ({ file, slot: i })));
        // one file: dropped on a preview replaces that image, otherwise fills the empty slot (or replaces B)
        const roleEl = target.closest && target.closest('[data-role]');
        const shown = roleEl ? st[roleEl.dataset.role] : null;
        let slot = shown ? st.slots.indexOf(shown) : st.slots.indexOf(null);
        if (slot < 0) slot = st.b ? st.slots.indexOf(st.b) : 1;
        load([{ file: files[0], slot }]);
      },
      onResize() { renderInspector(); },
    };
  }

  /* ================= Tabs ================= */
  const tools = {};
  for (const id of Object.keys(MODES)) tools[id] = createTool(document.getElementById('tab-' + id), MODES[id]);
  let active = 'split';

  function showTab(id) {
    if (!tools[id]) id = 'split';
    active = id;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + id));
    tools[id].onShow();
  }
  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => {
    history.replaceState(null, '', '#' + btn.dataset.tab);
    showTab(btn.dataset.tab);
  }));
  showTab(location.hash.slice(1));

  document.addEventListener('keydown', (ev) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    tools[active].onKey(ev);
  });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    document.body.classList.remove('dragging');
    if (e.dataTransfer.files[0]) { e.preventDefault(); tools[active].onDrop([...e.dataTransfer.files], e.target); }
  });
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => tools[active].onResize(), 150); });
})();
