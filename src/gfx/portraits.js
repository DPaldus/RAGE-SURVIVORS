'use strict';
// High-detail pixel-art portraits (48x72) for menus and character select.
// In-game sprites stay small (src/gfx/sprites.js) so pixel density matches the enemies.
(function (RS) {
  const S = RS.Sprites;
  const PW = 48, PH = 72;

  function painter(x) {
    const R = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    const E = (cx, cy, rx, ry, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
    const RR = (px, py, w, h, r, col) => {
      x.fillStyle = col; x.beginPath();
      x.moveTo(px + r, py); x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r);
      x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
      x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r);
      x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py); x.fill();
    };
    // chain links along a U curve, alternating light/dark so it glints
    const chainU = (x0, x1, y, sag, ch) => {
      if (!ch) return;
      const n = x1 - x0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, yy = Math.round(y + Math.sin(t * Math.PI) * sag);
        R(x0 + i, yy, 1, 1, i % 2 ? ch.C : ch.c);
        R(x0 + i, yy + 1, 1, 1, ch.g);
      }
    };
    return { R, E, RR, chainU };
  }

  // ---------------------------------------------------------------- TWIZZYRICH
  function twizzy(x, f, mask, ch) {
    const { R, E, RR, chainU } = painter(x);
    const dy = [0, 0, 1, 1][f];
    const J = '#1c1c21', Jd = '#0d0d10', Jh = '#2f2f37', Jh2 = '#25252c';
    const skin = '#a8745a', skinD = '#7a4f3c';
    // sneakers
    for (const sx of [9, 25]) {
      RR(sx, 63, 15, 8, 2, '#111114');
      R(sx, 69, 15, 2, '#e4e4e4'); R(sx, 70, 15, 1, '#b9b9bd');
      R(sx + 1, 64, 5, 1, '#2c2c33');
      R(sx + 3, 67, 9, 1, '#ff2448');
      R(sx + 6, 63, 1, 1, '#d8d8d8'); R(sx + 8, 64, 1, 1, '#d8d8d8');
    }
    // baggy pants stacking over the shoes
    RR(12, 44, 11, 18, 2, '#18181e'); RR(26, 44, 11, 18, 2, '#18181e');
    RR(10, 56, 14, 9, 3, '#18181e'); RR(25, 56, 14, 9, 3, '#18181e');
    for (const [lx, w] of [[11, 12], [26, 12]]) { R(lx, 58, w, 1, '#0b0b0e'); R(lx + 1, 61, w - 2, 1, '#0b0b0e'); R(lx, 63, w, 1, '#0b0b0e'); }
    R(12, 46, 1, 10, '#272730'); R(36, 46, 1, 10, '#101014');
    R(13, 49, 4, 5, '#121217'); R(13, 49, 4, 1, '#22222a');
    // puffer jacket body + sleeves (quilted)
    RR(8, 22 + dy, 32, 26, 6, J);
    RR(2, 24 + dy, 11, 22, 4, J); RR(35, 24 + dy, 11, 22, 4, J);
    for (let i = 0; i < 5; i++) {
      const y = 25 + dy + i * 5;
      R(10, y, 13, 1, Jh); R(23, y, 15, 1, Jh2); R(10, y + 3, 28, 1, Jd);
      if (y < 44 + dy) { R(3, y + 1, 9, 1, Jh); R(3, y + 4, 9, 1, Jd); R(36, y + 1, 9, 1, Jh2); R(36, y + 4, 9, 1, Jd); }
    }
    R(39, 26 + dy, 1, 18, '#0a0a0d'); R(2, 28 + dy, 1, 14, '#2a2a31');
    // cuffs + hands
    R(3, 44 + dy, 9, 2, Jd); R(36, 44 + dy, 9, 2, Jd);
    RR(4, 46 + dy, 7, 5, 2, skin); R(4, 49 + dy, 7, 1, skinD);
    RR(37, 46 + dy, 7, 5, 2, skin); R(37, 49 + dy, 7, 1, skinD);
    // zipper
    R(24, 25 + dy, 1, 22, '#08080a'); R(23, 26 + dy, 3, 2, '#9aa0a6');
    // crossbody strap + red bag
    for (let i = 0; i < 22; i++) { const sx = 12 + i, sy = 24 + dy + Math.round(i * 0.75); R(sx, sy, 1, 2, '#b0102a'); R(sx, sy, 1, 1, '#ff2448'); }
    RR(32, 39 + dy, 10, 8, 2, '#b0102a'); R(32, 39 + dy, 10, 2, '#ff2448'); R(36, 42 + dy, 2, 1, '#e0e0e0');
    // high collar
    RR(14, 17 + dy, 20, 9, 3, '#25252c'); R(17, 22 + dy, 14, 3, '#08080a'); R(15, 18 + dy, 6, 1, '#34343d');
    // chain + cross pendant
    if (ch) {
      chainU(16, 32, 24 + dy, 9, ch);
      R(23, 33 + dy, 3, 1, ch.c); R(24, 32 + dy, 1, 5, ch.c); R(24, 32 + dy, 1, 1, ch.C);
    }
    // balaclava head
    R(19, 15 + dy, 10, 5, mask.m);
    E(24, 10 + dy, 8.5, 10, mask.m);
    E(21, 4 + dy, 4, 2, mask.M); R(17, 6 + dy, 1, 4, mask.M);
    E(29.5, 12 + dy, 2, 6, 'rgba(0,0,0,0.25)');
    // eye slit with angry brows
    RR(17, 9 + dy, 14, 5, 1, skin); R(17, 9 + dy, 14, 1, skinD);
    R(18, 11 + dy, 3, 2, '#ececec'); R(27, 11 + dy, 3, 2, '#ececec');
    R(19, 11 + dy, 2, 2, '#160707'); R(28, 11 + dy, 2, 2, '#160707');
    R(18, 10 + dy, 2, 1, '#3a2016'); R(20, 11 + dy, 1, 1, '#3a2016'); R(28, 10 + dy, 2, 1, '#3a2016'); R(27, 11 + dy, 1, 1, '#3a2016');
    R(17, 14 + dy, 14, 1, 'rgba(0,0,0,0.35)');
    R(24, 15 + dy, 1, 2, mask.M);
  }

  // ---------------------------------------------------------------- MR.SCHMUNK
  function schmunk(x, f, mask, ch) {
    const { R, E, RR } = painter(x);
    const dy = [0, 1, 1, 0][f];
    const h = '#262a24', hd = '#171a16', hh = '#3a4036';
    // chunky white sneakers
    for (const sx of [8, 25]) {
      RR(sx, 62, 16, 9, 3, '#e8e8f0');
      R(sx, 69, 16, 2, '#aeb3c2'); R(sx + 1, 63, 6, 1, '#ffffff');
      R(sx + 3, 66, 10, 1, '#9cff35'); R(sx + 4, 67, 6, 1, '#5a9e1c');
    }
    // olive cargo pants
    RR(11, 44, 12, 19, 2, '#30352a'); RR(26, 44, 12, 19, 2, '#30352a');
    RR(10, 57, 14, 7, 3, '#30352a'); RR(25, 57, 14, 7, 3, '#30352a');
    R(11, 49, 4, 7, '#252a20'); R(11, 49, 4, 1, '#3c4234'); R(34, 49, 4, 7, '#252a20'); R(34, 49, 4, 1, '#3c4234');
    R(11, 59, 13, 1, '#1f231b'); R(26, 59, 12, 1, '#1f231b'); R(12, 46, 1, 9, '#3c4234');
    // wallet chain loop on the right hip
    if (ch) for (let i = 0; i < 9; i++) R(36 - Math.round(Math.sin(i / 8 * Math.PI) * 3), 45 + i, 1, 1, i % 2 ? ch.C : ch.c);
    // oversized hoodie, hunched shoulders
    RR(6, 25 + dy, 36, 24, 8, h);
    RR(1, 27 + dy, 11, 21, 4, h); RR(36, 27 + dy, 11, 21, 4, h);
    R(3, 30 + dy, 1, 14, hh); R(8, 29 + dy, 6, 1, hh); R(44, 30 + dy, 1, 14, hd);
    R(2, 45 + dy, 9, 2, hd); R(37, 45 + dy, 9, 2, hd);
    RR(2, 47 + dy, 8, 5, 2, '#121412'); RR(38, 47 + dy, 8, 5, 2, '#121412');
    // kangaroo pocket
    RR(14, 39 + dy, 20, 8, 2, '#1e221c'); R(14, 39 + dy, 20, 1, '#121511');
    // chest print: toxic smiley with a drip
    E(24, 32 + dy, 4.5, 4.5, '#9cff35');
    R(22, 31 + dy, 1, 1, '#0b0c0b'); R(26, 31 + dy, 1, 1, '#0b0c0b');
    R(21, 34 + dy, 1, 1, '#0b0c0b'); R(22, 35 + dy, 5, 1, '#0b0c0b'); R(27, 34 + dy, 1, 1, '#0b0c0b');
    R(25, 36 + dy, 1, 3, '#9cff35');
    // drawstrings
    R(20, 25 + dy, 1, 7, '#d9ddd8'); R(28, 25 + dy, 1, 6, '#d9ddd8'); R(20, 32 + dy, 1, 1, '#9aa09a');
    // hood + mask with stitched grin
    E(24, 15 + dy, 12.5, 12, h);
    E(19, 8 + dy, 5, 3, hh);
    E(24, 17 + dy, 9, 9.5, hd);
    E(24, 18 + dy, 7, 8, mask.m);
    E(22, 14 + dy, 3, 2, mask.M);
    R(20, 15 + dy, 3, 2, '#050505'); R(26, 15 + dy, 3, 2, '#050505');
    R(21, 15 + dy, 1, 1, '#c8ff7d'); R(27, 15 + dy, 1, 1, '#c8ff7d');
    for (let i = 0; i < 11; i++) { const gx = 19 + i, gy = 20 + dy + (i % 2); R(gx, gy, 1, 1, '#c8ff7d'); if (i % 2 === 0) R(gx, gy - 1, 1, 3, '#5a9e1c'); }
    R(19, 20 + dy, 1, 1, '#c8ff7d'); R(29, 20 + dy, 1, 1, '#c8ff7d');
  }

  const PAINT = { twizzy, schmunk };
  const cache = {};
  const Portraits = {
    W: PW, H: PH,
    get(id, cos) {
      const key = id + '|' + (cos.mask || '') + '|' + (cos.chain || '');
      if (cache[key]) return cache[key];
      const mask = S.MASKS[cos.mask] || S.MASKS.mask_black;
      const ch = S.CHAINS.hasOwnProperty(cos.chain) ? S.CHAINS[cos.chain] : S.CHAINS.chain_silver;
      const frames = [0, 1, 2, 3].map((f) => {
        const c = S.cv(PW, PH), x = c.getContext('2d');
        (PAINT[id] || twizzy)(x, f, mask, ch);
        return S.outline(S.crisp(c), '#030303');
      });
      cache[key] = {
        frames,
        rim: frames.map((fr) => S.silhouette(fr, '#9cff35')),
        rimR: frames.map((fr) => S.silhouette(fr, '#ff2448')),
        w: frames[0].width, h: frames[0].height,
      };
      return cache[key];
    },
    // draw a rim-lit portrait with its feet at (cx, footY); k = pixel scale
    draw(ctx, id, cos, f, cx, footY, k, opts) {
      const P = this.get(id, cos), i = f % 4;
      const w = P.w * k, h = P.h * k, x = Math.round(cx - w / 2), y = Math.round(footY - h);
      ctx.imageSmoothingEnabled = false;
      if (!opts || opts.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(cx, footY - k, w * 0.4, k * 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.drawImage(P.rim[i], x - k, y, w, h);
      ctx.globalAlpha = 0.55; ctx.drawImage(P.rimR[i], x + k, y, w, h); ctx.globalAlpha = 1;
      ctx.drawImage(P.frames[i], x, y, w, h);
    },
  };

  RS.Portraits = Portraits;
})(window.RS);
