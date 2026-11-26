/*
 * BMP encoders (uncompressed, BITMAPINFOHEADER, bottom-up rows).
 *   BMP.encode24(w, h, rgba)               -> Blob  (24-bit true colour)
 */
(function (global) {
  'use strict';

  function writeHeader(view, fileSize, dataOffset, w, h, bpp, imageSize, colorsUsed) {
    view.setUint8(0, 0x42);                 // 'B'
    view.setUint8(1, 0x4d);                 // 'M'
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);             // reserved
    view.setUint32(10, dataOffset, true);
    view.setUint32(14, 40, true);           // BITMAPINFOHEADER size
    view.setInt32(18, w, true);
    view.setInt32(22, h, true);             // positive = bottom-up
    view.setUint16(26, 1, true);            // planes
    view.setUint16(28, bpp, true);
    view.setUint32(30, 0, true);            // BI_RGB (no compression)
    view.setUint32(34, imageSize, true);
    view.setInt32(38, 2835, true);          // 72 DPI
    view.setInt32(42, 2835, true);
    view.setUint32(46, colorsUsed, true);
    view.setUint32(50, colorsUsed, true);
  }

  function encode24(w, h, rgba) {
    const rowSize = (w * 3 + 3) & ~3;
    const imageSize = rowSize * h;
    const buf = new ArrayBuffer(54 + imageSize);
    writeHeader(new DataView(buf), buf.byteLength, 54, w, h, 24, imageSize, 0);
    const out = new Uint8Array(buf);
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * rowSize;
      let i = y * w * 4;
      for (let x = 0; x < w; x++, i += 4) {
        out[o++] = rgba[i + 2];
        out[o++] = rgba[i + 1];
        out[o++] = rgba[i];
      }
    }
    return new Blob([buf], { type: 'image/bmp' });
  }

  global.BMP = { encode24 };
})(typeof window !== 'undefined' ? window : globalThis);
