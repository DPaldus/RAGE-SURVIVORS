'use strict';
// Arcade pixel-art environment props. Every prop is drawn on the same grid as the enemies: one art pixel = 2 world
// units (canvas._sc = 2), shaded with a light top / dark lower side, a dark 1 px outline, and drawn at whole device
// pixels (Arena.drawProp). Look: the 2021 rage-era underground (matte black, candy red, chrome, toxic green neon).
//   PropArt.car(col) ... panel()     hand-placed pixel art for the props that used to be simple code shapes
//   PropArt.pixelize(img, sc, mir)   re-samples a painted sheet prop (sc = its world units per pixel, mir = mirrored)
//                                    onto the 2-unit grid: hard alpha, a 16-colour palette, top light / bottom shade,
//                                    outline
// Sizes are picked so every prop keeps the world size (and collision box look) it had before.
(function (RS) {
  const U = RS.U, WPX = 2;
  const OUT = '#0a070c';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const mix = (a, b, t) => U.mixHex(a, b, t);

  // pixel painter on one canvas: rect, single pixel, horizontal bands, an ellipse mask and the outline pass
  // (CPU-backed canvas: the outline pass reads it back, and a GPU readback stalls ~2.5 ms a call)
  function painter(w, h) {
    const c = cv(w, h), x = c.getContext('2d', { willReadFrequently: true });
    const r = (px, py, pw, ph, col) => { x.fillStyle = col; x.fillRect(px, py, pw, ph); };
    const p = (px, py, col) => r(px, py, 1, 1, col);
    // filled ellipse on whole pixels (hard edges)
    const oval = (cx, cy, rx, ry, col) => { x.fillStyle = col; for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) if (((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1) x.fillRect(xx, yy, 1, 1); };
    // rounded rectangle with stepped (pixel) corners of radius k
    const box = (px, py, pw, ph, k, col) => { r(px + k, py, pw - 2 * k, ph, col); for (let i = 0; i < k; i++) { const d = k - i; r(px + i, py + d, 1, ph - 2 * d, col); r(px + pw - 1 - i, py + d, 1, ph - 2 * d, col); } };
    return { c, x, r, p, oval, box };
  }
  // pixels of an atlas sprite, read from its decoded sheet image on a CPU canvas (no GPU readback), mirrored if asked
  function pixels(src, mir) {
    const W = src.width, H = src.height, c = cv(W, H), x = c.getContext('2d', { willReadFrequently: true }), s = src._src;
    if (mir) { x.translate(W, 0); x.scale(-1, 1); }
    if (s) x.drawImage(s[0], s[1], s[2], W, H, 0, 0, W, H); else x.drawImage(src, 0, 0);
    return x.getImageData(0, 0, W, H).data;
  }
  // 1 px outline around everything opaque
  function outline(c, col) {
    const w = c.width + 2, h = c.height + 2, o = cv(w, h), x = o.getContext('2d');
    const sd = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const op = (xx, yy) => xx >= 0 && yy >= 0 && xx < c.width && yy < c.height && sd[(yy * c.width + xx) * 4 + 3] > 100;
    x.fillStyle = col || OUT;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const sx = xx - 1, sy = yy - 1;
      if (!op(sx, sy) && (op(sx - 1, sy) || op(sx + 1, sy) || op(sx, sy - 1) || op(sx, sy + 1))) x.fillRect(xx, yy, 1, 1);
    }
    x.drawImage(c, 1, 1);
    o._sc = WPX;
    return o;
  }

  const PropArt = {
    WPX,
    // ---------------------------------------------------------------- parked car (top-down, nose to the right)
    // 53 x 33 px sports coupe: long hood with stripes and a centre bulge, a glass greenhouse (windshield, side
    // windows, rear glass) around a lit roof, low side panel with chrome trim and rims, spoiler, head / tail lights.
    // The stripe colour contrasts with the paint (candy red on black / white, black on red, neon green on gunmetal).
    car(col) {
      const P = painter(53, 33), { r, p, box } = P;
      const hi = mix(col, '#ffffff', 0.3), hi2 = mix(col, '#ffffff', 0.55), mid = col, lo = mix(col, '#000000', 0.34), lo2 = mix(col, '#000000', 0.58);
      const lum = U.hexToRgb(col).reduce((a, b) => a + b, 0) / 765;
      const stripe = col === '#8a2330' ? '#141416' : col === '#4c7a26' ? '#0f1210' : col === '#3b3f45' ? '#9cff35' : '#ff2448';
      const roof = mix(col, lum > 0.6 ? '#ffffff' : '#000000', lum > 0.6 ? 0.12 : 0.12), glass = '#141c27', glass2 = '#25384a', sheen = '#b8dcef';
      // tyres peeking out at the far side
      for (const tx of [8, 37]) { r(tx, 1, 9, 3, '#0e0e10'); r(tx + 1, 1, 7, 1, '#2a2a2e'); }
      // body: side panel (darker) under the top surface; the nose is rounder than the tail
      box(1, 3, 51, 26, 5, lo);
      box(1, 3, 51, 21, 5, mid);
      r(44, 4, 4, 19, mid); for (let k = 0; k < 4; k++) r(48 + k, 4 + (k + 1) * 2, 1, 19 - (k + 1) * 4, mid); // tapered nose
      r(5, 3, 40, 1, hi2); r(3, 4, 44, 1, hi);       // light along the top edge
      r(2, 23, 49, 1, hi);                           // shoulder crease
      r(3, 24, 47, 1, '#cfd6e1'); r(3, 25, 47, 1, '#5e6672'); // chrome trim
      r(2, 27, 49, 2, lo2);                          // sill in shadow
      r(19, 24, 1, 4, lo2); r(31, 24, 1, 4, lo2); r(15, 26, 3, 1, hi); r(27, 26, 3, 1, hi); // doors + handles
      // rims (near side)
      for (const tx of [8, 37]) {
        r(tx, 26, 9, 7, '#0b0b0d'); r(tx + 1, 27, 7, 5, '#7f8894'); r(tx + 2, 28, 5, 3, '#cfd6df'); r(tx + 3, 29, 3, 1, '#3f4651');
        r(tx + 1, 27, 7, 1, '#eef2f6'); p(tx + 4, 28, '#3f4651'); p(tx + 4, 30, '#3f4651');
      }
      // hood: centre bulge + two stripes running onto the roof
      r(36, 10, 13, 4, hi); r(36, 11, 13, 2, mid);
      r(36, 8, 14, 2, stripe); r(36, 14, 14, 2, stripe); r(36, 8, 14, 1, mix(stripe, '#ffffff', 0.28)); r(36, 14, 14, 1, mix(stripe, '#ffffff', 0.28));
      r(15, 8, 15, 2, mix(stripe, roof, 0.35)); r(15, 14, 15, 2, mix(stripe, roof, 0.35));
      // greenhouse: dark glass ring around the roof
      box(10, 4, 26, 17, 3, glass);
      r(30, 5, 5, 15, glass2); r(11, 6, 3, 13, glass2);              // windshield + rear glass, lighter
      r(14, 5, 16, 1, glass2); r(14, 19, 16, 1, glass2);             // side windows
      for (let k = 0; k < 6; k++) p(31 + (k >> 1), 17 - k * 2, sheen); // diagonal sheen across the windshield
      p(33, 7, '#ffffff'); p(34, 6, '#ffffff');
      p(12, 15, sheen); p(12, 14, sheen); p(13, 9, sheen);
      r(14, 6, 16, 13, roof); r(14, 6, 16, 1, mix(roof, '#ffffff', 0.3)); r(14, 18, 16, 1, mix(roof, '#000000', 0.3)); r(29, 7, 1, 11, mix(roof, '#000000', 0.18));
      // spoiler on the trunk
      r(2, 5, 3, 15, lo2); r(2, 5, 1, 15, mix(lo2, '#ffffff', 0.25)); r(5, 7, 2, 1, lo2); r(5, 17, 2, 1, lo2);
      // mirrors
      r(32, 3, 3, 1, lo); r(32, 21, 3, 1, lo);
      // lights (the bloom pass adds their glow)
      r(50, 6, 2, 3, '#fff6c8'); r(50, 15, 2, 3, '#fff6c8'); p(51, 7, '#ffffff'); p(51, 16, '#ffffff');
      r(1, 6, 1, 4, '#ff2448'); r(1, 14, 1, 4, '#ff2448'); r(2, 7, 1, 2, '#a3122b'); r(2, 15, 1, 2, '#a3122b');
      r(49, 24, 2, 2, '#ffb020'); r(2, 24, 1, 2, '#ff2448'); // side markers
      return outline(P.c, OUT);
    },
    // ---------------------------------------------------------------- concrete pillar with the lit B2 sign
    pillar(GLY) {
      const P = painter(20, 44), { r, p } = P;
      r(0, 0, 20, 44, '#8f8d86'); r(0, 0, 3, 44, '#a9a79f'); r(14, 0, 6, 44, '#6e6c66'); r(18, 0, 2, 44, '#55534e');
      r(0, 0, 20, 2, '#c4c2b9'); r(0, 2, 20, 1, '#9b9991');
      // concrete pores and a crack
      const pores = [[4, 6], [9, 4], [12, 22], [5, 27], [10, 30], [15, 9], [7, 33], [3, 19], [16, 26], [11, 13]];
      for (const [a, b] of pores) p(a, b, '#77756f');
      for (const [a, b] of [[13, 19], [12, 20], [12, 21], [11, 22], [11, 23], [10, 24]]) p(a, b, '#4e4c47');
      // sign plate: dark green, bright rim, white letters
      r(2, 7, 12, 11, '#0f2a0a'); r(2, 7, 12, 1, '#9cff35'); r(2, 17, 12, 1, '#3f8a1c'); r(2, 7, 1, 11, '#6fd11c'); r(13, 7, 1, 11, '#2f6a14');
      let gx = 4;
      for (const ch of ['B', '2']) { const g = GLY[ch]; for (let rr = 0; rr < 5; rr++) for (let k = 0; k < 3; k++) if (g[rr][k] === '1') { p(gx + k, 10 + rr, '#f4fff0'); } gx += 4; }
      // red tag scribble under the sign
      for (const [a, b] of [[4, 21], [5, 20], [6, 21], [7, 22], [8, 21], [9, 20], [6, 23], [8, 23]]) p(a, b, '#ff2448');
      // hazard stripes at the foot, shaded on the right
      for (let yy = 34; yy < 44; yy++) for (let xx = 0; xx < 20; xx++) if ((xx + yy) % 6 < 3) p(xx, yy, xx > 14 ? '#b8952a' : xx < 3 ? '#f2cf4a' : '#e2b934'); else p(xx, yy, xx > 14 ? '#111112' : '#1d1d1f');
      r(0, 33, 20, 1, '#5e5c56');
      return outline(P.c, OUT);
    },
    // ---------------------------------------------------------------- speaker stack
    speaker() {
      const P = painter(21, 30), { r, p, oval } = P;
      r(0, 0, 21, 30, '#121216'); r(0, 0, 21, 2, '#34343e'); r(0, 2, 1, 28, '#24242c'); r(19, 2, 2, 28, '#0a0a0d');
      for (let yy = 3; yy < 29; yy += 3) p(2 + (yy % 5), yy, '#1c1c22'); // tolex grain
      // corner protectors
      for (const [a, b] of [[0, 0], [18, 0], [0, 27], [18, 27]]) { r(a, b, 3, 3, '#5d636e'); p(a + (a ? 2 : 0), b + (b ? 2 : 0), '#9aa3b2'); }
      const woof = (cx, cy) => {
        oval(cx, cy, 6.2, 6.2, '#8d96a3'); oval(cx, cy, 5.2, 5.2, '#2a2b31'); oval(cx, cy, 4, 4, '#050507'); oval(cx, cy, 1.8, 1.8, '#3a3c44');
        p(Math.floor(cx) - 3, Math.floor(cy) - 4, '#d6dde6'); p(Math.floor(cx) - 4, Math.floor(cy) - 3, '#d6dde6'); p(Math.floor(cx) - 1, Math.floor(cy) - 1, '#6a6d78');
      };
      woof(10, 9.5); woof(10, 21.5);
      r(15, 2, 3, 2, '#ff2448'); p(15, 2, '#ffb0bd'); // power LED
      return outline(P.c, OUT);
    },
    // ---------------------------------------------------------------- amp head
    amp() {
      const P = painter(25, 18), { r, p } = P;
      r(0, 0, 25, 18, '#18191c'); r(0, 0, 25, 5, '#33363c'); r(0, 0, 25, 1, '#55595f'); r(0, 5, 25, 1, '#0b0b0d');
      for (let i = 0; i < 6; i++) { const kx = 2 + i * 3; r(kx, 1, 2, 2, '#c9ced6'); p(kx, 1, '#ffffff'); p(kx + 1, 2, '#6a6f78'); }
      r(20, 1, 4, 3, '#050507'); p(20, 2, '#9cff35'); p(21, 2, '#9cff35'); p(22, 2, '#ffe14a'); p(23, 2, '#ff2448'); // VU meter
      for (let yy = 6; yy < 17; yy++) for (let xx = 1; xx < 24; xx++) if ((xx + yy) % 3 === 0) p(xx, yy, '#24262a'); // grille weave
      r(9, 10, 7, 2, '#8d96a3'); r(9, 10, 7, 1, '#d6dde6'); // blank chrome badge
      r(0, 17, 25, 1, '#0a0a0c'); r(0, 15, 2, 3, '#5d636e'); r(23, 15, 2, 3, '#5d636e');
      return outline(P.c, OUT);
    },
    // ---------------------------------------------------------------- live electrical panel
    panel() {
      const P = painter(16, 21), { r, p } = P;
      r(0, 0, 16, 21, '#5a6070'); r(0, 0, 16, 2, '#8a90a0'); r(0, 0, 1, 21, '#757b8b'); r(15, 0, 1, 21, '#3a3f4a');
      r(2, 3, 12, 14, '#454a58'); r(2, 3, 12, 1, '#2f333e'); r(13, 3, 1, 14, '#5d6372');
      // warning triangle with a bolt
      for (let i = 0; i < 6; i++) r(8 - i, 5 + i * 1.5 | 0, i * 2 + 1, 2, '#ffd400');
      for (const [a, b] of [[8, 7], [7, 8], [7, 9], [8, 10], [9, 10], [8, 11], [7, 12]]) p(a, b, '#141414');
      for (let i = 0; i < 4; i++) r(3 + i * 3, 18, 2, 1, '#2a2e38'); // vents
      r(5, 19, 6, 2, '#141418'); p(5, 19, '#9cff35'); // cable gland + status light
      return outline(P.c, OUT);
    },
    // ---------------------------------------------------------------- painted sheet prop -> pixel grid
    pixelize(src, sc, mir) {
      const W = src.width, H = src.height, k = sc / WPX; // target px per source px
      const tw = Math.max(1, Math.round(W * k)), th = Math.max(1, Math.round(H * k));
      const sd = pixels(src, mir);
      const out = new Float32Array(tw * th * 4);
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
        const x0 = tx / k, x1 = (tx + 1) / k, y0 = ty / k, y1 = (ty + 1) / k;
        let a = 0, rr = 0, gg = 0, bb = 0, n = 0;
        for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < H; sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < W; sx++) {
          const i = (sy * W + sx) * 4, al = sd[i + 3] / 255;
          a += al; rr += sd[i] * al; gg += sd[i + 1] * al; bb += sd[i + 2] * al; n++;
        }
        const o = (ty * tw + tx) * 4;
        out[o + 3] = n ? a / n : 0;
        if (a > 0) { out[o] = rr / a; out[o + 1] = gg / a; out[o + 2] = bb / a; }
      }
      // palette: k-means over the opaque pixels, after a small contrast / saturation lift
      const cols = [];
      for (let i = 0; i < tw * th; i++) if (out[i * 4 + 3] >= 0.5) {
        let r0 = out[i * 4], g0 = out[i * 4 + 1], b0 = out[i * 4 + 2];
        const gy = (r0 + g0 + b0) / 3;
        r0 = gy + (r0 - gy) * 1.18; g0 = gy + (g0 - gy) * 1.18; b0 = gy + (b0 - gy) * 1.18;
        r0 = (r0 - 128) * 1.1 + 128; g0 = (g0 - 128) * 1.1 + 128; b0 = (b0 - 128) * 1.1 + 128;
        cols.push([i, U.clamp(r0, 0, 255), U.clamp(g0, 0, 255), U.clamp(b0, 0, 255)]);
      }
      const K = Math.min(16, cols.length);
      const C = [];
      for (let j = 0; j < K; j++) C.push(cols[Math.floor((j + 0.5) * cols.length / K)].slice(1));
      const lab = new Int32Array(cols.length);
      for (let it = 0; it < 8; it++) {
        const sum = C.map(() => [0, 0, 0, 0]);
        cols.forEach((c, n) => {
          let best = 0, bd = 1e9;
          for (let j = 0; j < K; j++) { const d = (c[1] - C[j][0]) ** 2 + (c[2] - C[j][1]) ** 2 + (c[3] - C[j][2]) ** 2; if (d < bd) { bd = d; best = j; } }
          lab[n] = best; const s = sum[best]; s[0] += c[1]; s[1] += c[2]; s[2] += c[3]; s[3]++;
        });
        sum.forEach((s, j) => { if (s[3]) C[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
      }
      const c = cv(tw, th), x = c.getContext('2d', { willReadFrequently: true }), img = x.createImageData(tw, th), d = img.data;
      const opaque = new Uint8Array(tw * th);
      cols.forEach((cc) => { opaque[cc[0]] = 1; });
      cols.forEach((cc, n) => {
        const i = cc[0], tx = i % tw, ty = (i / tw) | 0;
        let [r0, g0, b0] = C[lab[n]];
        // arcade shading: light on the top edge, shade on the lower / right edge, deep shadows pulled to purple-black
        const up = ty > 0 && opaque[i - tw], dn = ty < th - 1 && opaque[i + tw], rt = tx < tw - 1 && opaque[i + 1];
        let f = 1;
        if (!up) f = 1.22; else if (!dn || !rt) f = 0.74;
        r0 *= f; g0 *= f; b0 *= f;
        const lum = (r0 + g0 + b0) / 765;
        if (lum < 0.22) { const t = (0.22 - lum) * 1.6; r0 += (27 - r0) * t; g0 += (15 - g0) * t; b0 += (36 - b0) * t; }
        d[i * 4] = U.clamp(r0, 0, 255); d[i * 4 + 1] = U.clamp(g0, 0, 255); d[i * 4 + 2] = U.clamp(b0, 0, 255); d[i * 4 + 3] = 255;
      });
      x.putImageData(img, 0, 0);
      return outline(c, OUT);
    },
  };

  RS.PropArt = PropArt;
})(window.RS);
