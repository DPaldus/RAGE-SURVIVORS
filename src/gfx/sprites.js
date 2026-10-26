'use strict';
// Procedural pixel-art: heroes, enemies, bosses, floors and glow sprites; the props come from src/gfx/props_px.js.
(function (RS) {
  const U = RS.U;

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // a canvas that is painted and then read back (outline / crisp) lives in CPU memory: reading a GPU canvas back
  // stalls ~2.5 ms per call (measured: ~0.5 s of boot when every sprite did it), this one ~0.1 ms
  function cvR(w, h) { const c = cv(w, h); c.getContext('2d', { willReadFrequently: true }); return c; }
  function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

  // add a 1px dark outline around every opaque pixel
  function outline(src, col) {
    const w = src.width + 2, h = src.height + 2;
    const out = cv(w, h), o = out.getContext('2d');
    const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const [r, g, b] = U.hexToRgb(col || '#050507');
    const img = o.createImageData(w, h), d = img.data;
    const op = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && sd[(y * src.width + x) * 4 + 3] > 100;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = x - 1, sy = y - 1;
        if (op(sx, sy)) continue;
        if (op(sx - 1, sy) || op(sx + 1, sy) || op(sx, sy - 1) || op(sx, sy + 1)) {
          const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        }
      }
    }
    o.putImageData(img, 0, 0);
    o.drawImage(src, 1, 1);
    return out;
  }
  // hard alpha so anti-aliased primitives read as crisp pixels
  function crisp(c) {
    const ctx = c.getContext('2d');
    const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
    ctx.putImageData(im, 0, 0);
    return c;
  }
  function silhouette(src, col) {
    const c = cv(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    px(x, 0, 0, c.width, c.height, col);
    return c;
  }
  function tint(src, col, a) {
    const c = cv(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = a;
    px(x, 0, 0, c.width, c.height, col);
    return c;
  }
  function toCanvas(im) { const c = cv(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; }
  function flip_(src) { return flip(src); }
  function flip(src) {
    const c = cv(src.width, src.height), x = c.getContext('2d');
    x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return c;
  }
  // mirror an 8-char half row into a 16-char row
  const mirror = (half) => half + half.split('').reverse().join('');

  // ---------------------------------------------------------------- heroes
  const HERO_ART = {
    twizzy: {
      head: [
        '......mm',
        '....mmMM',
        '...mmMmm',
        '...mmmmm',
        '...mssss',
        '...mwess',
        '...mmmmC',
        '....mmmm',
      ],
      torso: [
        '..JJjjjj',
        '.JJjjcjj',
        'JjjqjjCj',
        'Jjjqjjjr',
        'jrjqjjjj',
        'jrqqqqqq',
        'hJjjjjjj',
        'cJjjjjjj',
        '.JJJJJJJ',
      ],
      pal: { s: '#a8745a', w: '#f4f4f4', e: '#160707', J: '#2d2d33', j: '#17171b', q: '#0a0a0e', r: '#ff2448', h: '#0c0c10' },
      legs: { w: 5, gap: 2, pants: '#1b1b25', shade: '#111118', shoe: '#0e0e12', neon: '#ff2448', sole: '#e6e6e6', soleH: 1, cargo: false },
      headBob: [0, 0, 1, 1], headSway: [0, 0, 0, 0], runBob: [0, -1, 0, -1],
      extra(ctx, ox, oy) {
        // red crossbody bag on the left hip (asymmetry so facing reads)
        px(ctx, ox + 1, oy + 13, 3, 3, '#c0102a'); px(ctx, ox + 1, oy + 13, 3, 1, '#ff3b55');
        px(ctx, ox + 4, oy + 12, 1, 1, '#c0102a'); px(ctx, ox + 5, oy + 11, 1, 1, '#c0102a');
      },
    },
    schmunk: {
      head: [
        '........',
        '.....hhh',
        '....hHhh',
        '...hhmmm',
        '...hmmmm',
        '...hmamm',
        '...hmmmm',
        '...hmAaA',
      ],
      torso: [
        '..hhhhmm',
        '.hhhhshh',
        'hhHhhshh',
        'hhHhhhpp',
        'hhhhhpPp',
        'hhhhhhpp',
        'khhqqqqq',
        'khhqhhhh',
        '.hhqqqqq',
      ],
      pal: { h: '#262a24', H: '#3a4036', a: '#c8ff7d', A: '#5a9e1c', s: '#cfd6e3', p: '#9cff35', P: '#d6ffb0', q: '#151814', k: '#0d0d10' },
      legs: { w: 6, gap: 1, pants: '#30352a', shade: '#1f231b', shoe: '#e8e8f0', neon: '#9cff35', sole: '#aeb3c2', soleH: 2, cargo: true },
      headBob: [1, 1, 2, 2], headSway: [-1, 0, 1, 0], runBob: [0, 1, 0, 1],
      extra(ctx, ox, oy, chain) {
        // wallet chain hanging off the right hip
        if (!chain) return;
        px(ctx, ox + 12, oy + 17, 1, 1, chain.c); px(ctx, ox + 13, oy + 18, 1, 1, chain.C);
        px(ctx, ox + 13, oy + 19, 1, 1, chain.c); px(ctx, ox + 12, oy + 20, 1, 1, chain.g);
      },
    },
  };

  const MASKS = {
    mask_black: { m: '#101015', M: '#2b2b36' },
    mask_blood: { m: '#5c0a14', M: '#8f1626' },
    mask_chrome: { m: '#8d97a8', M: '#e6ebf3' },
    mask_void: { m: '#2a0f4a', M: '#5a2a9a' },
    mask_acid: { m: '#29470d', M: '#5f9a1c' },
    mask_leaked: { m: '#a07a10', M: '#ffd75a' },
  };
  const CHAINS = {
    chain_silver: { c: '#cfd6e3', C: '#ffffff', g: '#8a93a3' },
    chain_gold: { c: '#e6b422', C: '#fff0a0', g: '#9a7410' },
    chain_iced: { c: '#9fe9ff', C: '#ffffff', g: '#4fb0d0' },
    chain_none: null,
  };

  function drawLegs(ctx, L, ox, oy, frame, running) {
    const lx = ox + 8 - Math.ceil(L.gap / 2) - L.w, rx = ox + 8 + Math.floor(L.gap / 2);
    let lLift = 0, rLift = 0;
    if (running) { if (frame === 0) lLift = 2; if (frame === 2) rLift = 2; if (frame === 1) lLift = 1; if (frame === 3) rLift = 1; }
    const leg = (x, lift, side) => {
      const top = oy + 17, ph = 5 - lift;
      px(ctx, x, top, L.w, ph, L.pants);
      px(ctx, side < 0 ? x + L.w - 1 : x, top, 1, ph, L.shade);
      // baggy stack at the ankle
      px(ctx, side < 0 ? x - 1 : x + 1, top + ph - 2, L.w, 2, L.pants);
      if (L.cargo) px(ctx, side < 0 ? x : x + L.w - 2, top + 1, 2, 2, L.shade);
      const sy = oy + 22 - lift;
      px(ctx, x, sy, L.w, 2, L.shoe);
      px(ctx, x + 1, sy + 1, L.w - 2, 1, L.neon);
      px(ctx, x, sy + 2, L.w, L.soleH, L.sole);
    };
    leg(lx, lLift, -1);
    leg(rx, rLift, 1);
  }

  function drawAscii(ctx, rows, pal, ox, oy) {
    for (let r = 0; r < rows.length; r++) {
      const full = mirror(rows[r]);
      for (let c = 0; c < 16; c++) {
        const ch = full[c];
        if (ch === '.') continue;
        const col = pal[ch];
        if (col) px(ctx, ox + c, oy + r, 1, 1, col);
      }
    }
  }

  function buildHero(id, cos) {
    const art = HERO_ART[id];
    const mask = MASKS[cos.mask] || MASKS.mask_black;
    const chain = CHAINS.hasOwnProperty(cos.chain) ? CHAINS[cos.chain] : CHAINS.chain_silver;
    const pal = Object.assign({}, art.pal, mask);
    if (chain) Object.assign(pal, { c: chain.c, C: chain.C, g: chain.g });
    else Object.assign(pal, { c: pal.j || pal.h, C: pal.j || pal.h, g: pal.j || pal.h });
    const make = (frame, running) => {
      const c = cvR(20, 28), x = c.getContext('2d');
      const ox = 2, oy = 1;
      const bob = running ? art.runBob[frame] : art.headBob[frame] > 1 ? 1 : 0;
      drawLegs(x, art.legs, ox, oy, frame, running);
      drawAscii(x, art.torso, pal, ox, oy + 8 + bob);
      art.extra(x, ox, oy + bob, chain);
      const hb = running ? art.runBob[frame] : art.headBob[frame];
      const hs = running ? 0 : art.headSway[frame];
      drawAscii(x, art.head, pal, ox + hs, oy + hb);
      return outline(c);
    };
    const idle = [0, 1, 2, 3].map((f) => make(f, false));
    const run = [0, 1, 2, 3].map((f) => make(f, true));
    const res = { idle, run, w: idle[0].width, h: idle[0].height };
    res.idleL = idle.map(flip); res.runL = run.map(flip);
    res.white = silhouette(idle[0], '#ffffff');
    res.whiteL = flip(res.white);
    return res;
  }

  // ---------------------------------------------------------------- enemies
  // Each painter draws into a small canvas; frame 0/1 = walk/bob.
  const EN = {
    // masked crowd member: dark hoodie, pale mask; 4-frame walk with arm swing
    npc(x, f) {
      const st = [0, 1, 0, -1][f];
      const lL = st > 0 ? 1 : 0, rL = st < 0 ? 1 : 0;
      // legs + sneakers
      px(x, 3, 12, 2, 3 - lL, '#2e3646'); px(x, 7, 12, 2, 3 - rL, '#2e3646');
      px(x, 3, 15 - lL, 2, 1, '#e8e8e8'); px(x, 7, 15 - rL, 2, 1, '#e8e8e8');
      // hoodie body
      px(x, 2, 7, 8, 5, '#34373d'); px(x, 2, 7, 8, 1, '#4a4e56'); px(x, 4, 10, 4, 1, '#26282d'); px(x, 9, 8, 1, 4, '#26282d');
      // swinging arms + hands
      const aL = st > 0 ? -1 : st < 0 ? 1 : 0;
      px(x, 1, 8 + aL, 1, 4, '#34373d'); px(x, 10, 8 - aL, 1, 4, '#34373d');
      px(x, 1, 12 + aL, 1, 1, '#d9c3a8'); px(x, 10, 12 - aL, 1, 1, '#d9c3a8');
      // hood + pale mask
      px(x, 3, 0, 6, 1, '#2a2c31'); px(x, 2, 1, 8, 6, '#2a2c31'); px(x, 3, 1, 3, 1, '#3c3f46');
      px(x, 4, 2, 4, 5, '#e6e1d6'); px(x, 4, 2, 4, 1, '#ffffff');
      px(x, 4, 4, 1, 1, '#0e0e10'); px(x, 7, 4, 1, 1, '#0e0e10');
      px(x, 5, 6, 2, 1, '#9b958a');
    },
    clip(x, f) {
      const l = f ? 1 : 0;
      px(x, 3, 0, 6, 2, '#1d1d1d'); px(x, 8, 1, 3, 1, '#1d1d1d');
      px(x, 3, 2, 6, 4, '#c69072'); px(x, 4, 3, 1, 1, '#000'); px(x, 7, 3, 1, 1, '#000');
      px(x, 2, 6, 8, 5, '#2fb36b'); px(x, 2, 6, 8, 1, '#5fe39b');
      px(x, 4, 7, 4, 3, '#0d0d0d'); px(x, 5, 7, 2, 2, '#e3ece6'); px(x, 6, 7, 1, 1, '#ff2a2a');
      px(x, 3, 11, 2, 3 - l, '#232323'); px(x, 7, 11, 2, 2 + l, '#232323');
      px(x, 3, 14 - l, 2, 1, '#f0f0f0'); px(x, 7, 13 + l, 2, 1, '#f0f0f0');
    },
    // rival crew: red ski mask, black hoodie, red bandana
    fiend(x, f) {
      const st = [0, 1, 0, -1][f], lL = st > 0 ? 1 : 0, rL = st < 0 ? 1 : 0, aL = st > 0 ? -1 : st < 0 ? 1 : 0;
      px(x, 4, 12, 2, 3 - lL, '#1a1a1e'); px(x, 8, 12, 2, 3 - rL, '#1a1a1e');
      px(x, 4, 15 - lL, 2, 1, '#ff2448'); px(x, 8, 15 - rL, 2, 1, '#ff2448');
      px(x, 3, 7, 8, 5, '#1d1d22'); px(x, 3, 7, 8, 1, '#2c2c33'); px(x, 5, 10, 4, 1, '#141418');
      px(x, 4, 7, 6, 2, '#c01428'); px(x, 6, 9, 2, 1, '#c01428'); px(x, 5, 7, 1, 1, '#ff3b4f');
      px(x, 2, 8 + aL, 1, 4, '#1d1d22'); px(x, 11, 8 - aL, 1, 4, '#1d1d22');
      px(x, 2, 12 + aL, 1, 1, '#7a4a34'); px(x, 11, 12 - aL, 1, 1, '#7a4a34');
      px(x, 4, 0, 6, 7, '#c01428'); px(x, 4, 0, 6, 1, '#ff3b4f'); px(x, 3, 1, 1, 5, '#a0102a'); px(x, 10, 1, 1, 5, '#a0102a');
      px(x, 5, 3, 4, 1, '#140406'); px(x, 5, 3, 1, 1, '#f2f2ec'); px(x, 8, 3, 1, 1, '#f2f2ec');
      px(x, 6, 5, 2, 1, '#140406');
    },
    // soundcloud rapper: beanie, shades, cloud hoodie, mic up to the mouth
    stalker(x, f) {
      const l = f ? 1 : 0;
      px(x, 4, 12, 2, 3 - l, '#2a2d2a'); px(x, 8, 12, 2, 2 + l, '#2a2d2a');
      px(x, 4, 15 - l, 2, 1, '#f2f2ec'); px(x, 8, 14 + l, 2, 1, '#f2f2ec');
      px(x, 3, 7, 8, 5, '#2a2d2a'); px(x, 3, 7, 8, 1, '#3d413c'); px(x, 4, 9, 4, 2, '#9cff35'); px(x, 5, 8, 2, 1, '#9cff35'); px(x, 5, 9, 1, 1, '#d6ffb0');
      px(x, 2, 8, 1, 4, '#2a2d2a'); px(x, 2, 12, 1, 1, '#8a5a40');
      px(x, 11, 6, 1, 4, '#2a2d2a'); px(x, 10, 6, 1, 1, '#8a5a40');
      px(x, 4, 1, 6, 6, '#8a5a40'); px(x, 4, 0, 6, 2, '#151515'); px(x, 3, 1, 8, 1, '#151515');
      px(x, 4, 3, 6, 1, '#050505'); px(x, 5, 3, 1, 1, '#ff2448'); px(x, 8, 3, 1, 1, '#ff2448');
      px(x, 6, 5, 2, 1, '#3a1a10');
      px(x, 9, 4, 2, 2, '#cfd6e3'); px(x, 9, 4, 2, 1, '#1a1a1a'); px(x, 10, 6, 1, 1, '#5a6070');
    },
    // venue security: buzzcut, earpiece, hi-vis vest, flashlight
    guard(x, f) {
      const st = [0, 1, 0, -1][f], lL = st > 0 ? 1 : 0, rL = st < 0 ? 1 : 0, aL = st > 0 ? -1 : st < 0 ? 1 : 0;
      px(x, 4, 14, 3, 4 - lL, '#1b1d22'); px(x, 9, 14, 3, 4 - rL, '#1b1d22');
      px(x, 4, 18 - lL, 3, 2, '#0b0b0c'); px(x, 9, 18 - rL, 3, 2, '#0b0b0c');
      px(x, 2, 7, 12, 7, '#1b1d22');
      px(x, 3, 7, 10, 7, '#e8ff3a'); px(x, 7, 7, 2, 7, '#1b1d22'); px(x, 3, 7, 10, 1, '#f6ffa0');
      px(x, 3, 10, 4, 1, '#d8dde0'); px(x, 9, 10, 4, 1, '#d8dde0'); px(x, 3, 12, 4, 1, '#d8dde0'); px(x, 9, 12, 4, 1, '#d8dde0');
      px(x, 1, 8 + aL, 2, 5, '#1b1d22'); px(x, 13, 8 - aL, 2, 5, '#1b1d22');
      px(x, 1, 13 + aL, 2, 1, '#b07a5a'); px(x, 13, 13 - aL, 2, 1, '#b07a5a');
      px(x, 14, 12 - aL, 2, 3, '#3a3d42'); px(x, 15, 12 - aL, 1, 1, '#fff6c8');
      px(x, 6, 6, 4, 1, '#8a5a40');
      px(x, 5, 1, 6, 5, '#b07a5a'); px(x, 5, 0, 6, 2, '#2a1a10');
      px(x, 6, 3, 1, 1, '#000'); px(x, 9, 3, 1, 1, '#000'); px(x, 7, 5, 2, 1, '#6a3a2a'); px(x, 11, 2, 1, 3, '#0b0b0c');
    },
    // ---- hallucinations
    pony(x, f) {
      const g = [0, 1, 2, 1][f];
      px(x, 1, 7, 3, 1, '#9fe9ff'); px(x, 0, 8, 2, 2, '#b45cff'); px(x, 0, 10, 2, 1, '#fff36a');
      for (let i = 0; i < 4; i++) {
        const lx = [5, 7, 13, 15][i] + (i % 2 ? g - 1 : 1 - g);
        px(x, lx, 12, 2, 3, '#ff6ad5'); px(x, lx, 15, 2, 1, '#ffffff');
      }
      px(x, 4, 7, 13, 5, '#ff6ad5'); px(x, 5, 7, 11, 1, '#ffb3ea'); px(x, 5, 11, 11, 1, '#e050b8');
      px(x, 14, 3, 3, 5, '#ff6ad5'); px(x, 15, 1, 5, 4, '#ff6ad5'); px(x, 19, 3, 3, 2, '#ff8fe0'); px(x, 16, 0, 1, 1, '#ff6ad5');
      px(x, 17, 2, 1, 1, '#1a0a14'); px(x, 21, 4, 1, 1, '#c0409a'); px(x, 15, 1, 4, 1, '#ffb3ea');
      px(x, 13, 1, 2, 6, '#9fe9ff'); px(x, 14, 0, 2, 1, '#fff36a'); px(x, 12, 3, 1, 4, '#b45cff');
      px(x, 8 + g, 8, 1, 1, '#ffffff'); px(x, 11 - g, 9, 1, 1, '#ffffff');
    },
    stretch(x, f) {
      const l = f ? 1 : 0;
      px(x, 4, 20, 1, 9 - l, '#2a2440'); px(x, 7, 20, 1, 8 + l, '#2a2440');
      px(x, 3, 29 - l, 2, 1, '#efe7ff'); px(x, 7, 28 + l, 2, 1, '#efe7ff');
      px(x, 3, 9, 6, 11, '#5a3fd0'); px(x, 3, 9, 6, 1, '#7a5ff0'); px(x, 5, 12, 2, 6, '#4a30b0');
      px(x, 2, 10, 1, 14 + l, '#b9a7ff'); px(x, 9, 10, 1, 14 - l, '#b9a7ff');
      px(x, 1, 24 + l, 2, 2, '#efe7ff'); px(x, 9, 24 - l, 2, 2, '#efe7ff');
      px(x, 5, 5, 2, 4, '#b9a7ff');
      px(x, 3, 0, 6, 5, '#b9a7ff'); px(x, 3, 0, 6, 1, '#efe7ff');
      px(x, 4, 2, 1, 1, '#1a0a30'); px(x, 7, 2, 1, 1, '#1a0a30');
      px(x, 4, 4, 4, 1, '#1a0a30'); px(x, 3, 3, 1, 1, '#1a0a30'); px(x, 8, 3, 1, 1, '#1a0a30');
    },
    dancer(x, f) {
      const B = '#3ff2ff', H = '#c8fdff', K = '#ff6ad5';
      px(x, 5, 6, 4, 6, B); px(x, 5, 6, 4, 1, H);
      px(x, 5, 1, 4, 4, H); px(x, 6, 2, 1, 1, '#0a2a33'); px(x, 8, 2, 1, 1, '#0a2a33'); px(x, 6, 4, 2, 1, '#0a2a33');
      px(x, 4, 1, 1, 3, K); px(x, 9, 1, 1, 3, K); px(x, 5, 0, 4, 1, K);
      if (f === 0) { px(x, 3, 3, 1, 4, B); px(x, 10, 3, 1, 4, B); px(x, 3, 2, 1, 1, '#fff'); px(x, 10, 2, 1, 1, '#fff'); }
      else if (f === 1) { px(x, 1, 7, 4, 1, B); px(x, 0, 7, 1, 1, '#fff'); px(x, 9, 7, 1, 4, B); }
      else if (f === 2) { px(x, 4, 7, 1, 4, B); px(x, 9, 7, 1, 4, B); }
      else { px(x, 9, 7, 4, 1, B); px(x, 13, 7, 1, 1, '#fff'); px(x, 4, 7, 1, 4, B); }
      const kick = f % 2;
      px(x, 5, 12, 1, 5 - kick * 2, B); px(x, 8, 12, 1, 5, B);
      if (kick) px(x, 3, 14, 2, 1, B);
      px(x, kick ? 2 : 4, kick ? 14 : 17, 2, 1, K); px(x, 8, 17, 2, 1, K);
    },
    bigshoe(x, f) { // 4 frames: the loose lace flaps and the toe box flexes a pixel on the hop
      const fl = [0, 1, 2, 1][f], flex = f === 1 ? 1 : 0;
      px(x, 0, 12, 26, 3, '#f2f2ec'); px(x, 0, 14, 26, 1, '#9aa3b2'); px(x, 0, 15, 26, 1, '#1a1a1e');
      px(x, 2, 5, 22, 7, '#f2f2ec'); px(x, 18, 7 + flex, 7, 5 - flex, '#f2f2ec'); px(x, 24, 9, 1, 3, '#f2f2ec');
      px(x, 1, 3, 8, 3, '#f2f2ec'); px(x, 2, 2, 6, 1, '#d8dde0'); px(x, 3, 3, 5, 1, '#1a1a1e');
      px(x, 9, 2, 4, 4, '#d8dde0');
      for (let i = 0; i < 4; i++) px(x, 10 + i * 2, 5 + i, 1, 1, '#1a1a1e');
      px(x, 9 - fl, 1 + (fl === 2 ? 1 : 0), 2, 1, '#1a1a1e'); px(x, 8 - fl, 2 + fl, 1, 1, '#1a1a1e'); // lace end
      px(x, 4, 8, 6, 2, '#ff2448'); px(x, 9, 9, 4, 2, '#ff2448'); px(x, 12, 8, 5, 2, '#ff2448');
      px(x, 4, 8, 6, 1, '#ff6a80');
      px(x, 2, 11, 22, 1, '#cfd3d6');
      px(x, 20, 8 + flex, 1, 2, '#1a1a1e'); px(x, 22, 8 + flex, 1, 2, '#1a1a1e');
    },
    smiley(x, f) { // 4 frames: three drips stretch and snap back out of phase, the face wobbles a pixel
      const d1 = [4, 5, 6, 5][f], d2 = [5, 3, 2, 3][f], d3 = [4, 5, 4, 3][f], wob = f === 1 ? 1 : f === 3 ? -1 : 0;
      x.fillStyle = '#ffe14a'; x.beginPath(); x.arc(8, 7, 7, 0, Math.PI * 2); x.fill();
      crisp(x.canvas);
      px(x, 3, 10, 2, d1, '#ffe14a'); px(x, 7, 12, 2, d2, '#ffe14a'); px(x, 11, 11, 2, d3, '#ffe14a');
      px(x, 3, 9 + d1, 2, 1, '#fff36a'); px(x, 7, 11 + d2, 2, 1, '#fff36a'); px(x, 11, 10 + d3, 2, 1, '#fff36a');
      px(x, 4, 2, 3, 1, '#fff7b0'); px(x, 3, 3, 1, 2, '#fff7b0');
      px(x, 5 + wob, 5, 2, 3, '#1a1405'); px(x, 10 + wob, 5, 2, 3, '#1a1405');
      px(x, 3, 8, 2, 1, '#ff6ad5'); px(x, 12, 8, 2, 1, '#ff6ad5');
      px(x, 5 + wob, 10, 7, 1, '#1a1405'); px(x, 4 + wob, 9, 1, 1, '#1a1405'); px(x, 12 + wob, 9, 1, 1, '#1a1405');
    },
    exec(x, f) {
      const l = f ? 1 : 0;
      px(x, 5, 0, 6, 2, '#151515');
      px(x, 5, 2, 6, 5, '#c79a7a'); px(x, 5, 3, 6, 2, '#050505'); px(x, 6, 3, 1, 1, '#9fe9ff'); px(x, 9, 3, 1, 1, '#9fe9ff');
      px(x, 7, 6, 2, 1, '#8a5a4a');
      px(x, 3, 7, 10, 8, '#1c2333'); px(x, 7, 7, 2, 5, '#f0f0f0'); px(x, 7, 8, 2, 4, '#d0142c');
      px(x, 3, 7, 10, 1, '#2c3550');
      px(x, 1, 8, 2, 6, '#1c2333'); px(x, 13, 8, 2, 6, '#1c2333');
      px(x, 12, 12, 4, 5, '#9aa3b2'); px(x, 12, 12, 4, 1, '#e6ebf3'); px(x, 13, 11, 2, 1, '#5a6070');
      px(x, 4, 15, 3, 4 - l, '#141a26'); px(x, 9, 15, 3, 3 + l, '#141a26');
      px(x, 4, 19 - l, 3, 1, '#050505'); px(x, 9, 18 + l, 3, 1, '#050505');
    },
    glitch(x, f) {
      const l = f ? 1 : 0;
      px(x, 3, 0, 6, 2, '#9cff35'); px(x, 2, 1, 1, 2, '#9cff35');
      px(x, 3, 2, 6, 4, '#d8a890'); px(x, 4, 3, 1, 1, '#000'); px(x, 7, 3, 1, 1, '#ff4f6e');
      px(x, 2, 6, 8, 6, '#c81e3c'); px(x, 4, 7, 4, 3, '#151515'); px(x, 5, 8, 2, 1, '#e3ece6');
      px(x, 1, 7, 1, 4, '#d8a890'); px(x, 10, 7, 1, 4, '#d8a890');
      px(x, 3, 12, 2, 3 - l, '#1d201d'); px(x, 7, 12, 2, 2 + l, '#1d201d');
      px(x, 3, 15 - l, 2, 1, '#e3ece6'); px(x, 7, 14 + l, 2, 1, '#e3ece6');
    },
    bruiser(x, f) {
      const l = f ? 1 : 0;
      px(x, 9, 0, 4, 2, '#ff2448'); px(x, 10, 2, 2, 1, '#ff2448');
      px(x, 7, 2, 8, 7, '#b07a5a'); px(x, 8, 4, 2, 1, '#000'); px(x, 12, 4, 2, 1, '#000'); px(x, 9, 7, 4, 1, '#4a2a1a');
      px(x, 2, 9, 18, 10, '#1a1414'); px(x, 2, 9, 18, 1, '#3a2c2c');
      px(x, 8, 10, 6, 7, '#b07a5a'); px(x, 9, 11, 4, 1, '#8a5a40');
      for (let i = 0; i < 4; i++) { px(x, 3 + i * 1, 10 + i * 2, 1, 1, '#cfd6e3'); px(x, 18 - i, 10 + i * 2, 1, 1, '#cfd6e3'); }
      px(x, 0, 11, 3, 6, '#1a1414'); px(x, 19, 11, 3, 6, '#1a1414'); px(x, 0, 17, 3, 2, '#b07a5a'); px(x, 19, 17, 3, 2, '#b07a5a');
      px(x, 4, 19, 5, 4 - l, '#2a2a33'); px(x, 13, 19, 5, 3 + l, '#2a2a33');
      px(x, 4, 23 - l, 5, 1, '#111'); px(x, 13, 22 + l, 5, 1, '#111');
    },
    // the leaker: yellow hoodie, face in shadow, glowing hard drive clutched to the chest
    leak(x, f) { // 4-frame sprint: legs scissor, arms pump, the body drops a pixel on each contact
      const st = [0, 1, 0, -1][f], b = st === 0 ? 1 : 0;
      const lx = st > 0 ? 4 : st < 0 ? 2 : 3, rx = st < 0 ? 8 : st > 0 ? 6 : 7, lh = st > 0 ? 2 : 3, rh = st < 0 ? 2 : 3;
      px(x, lx, 12, 2, lh, '#2a2a2a'); px(x, rx, 12, 2, rh, '#2a2a2a');
      px(x, lx, 12 + lh, 2, 1, '#ffcf3f'); px(x, rx, 12 + rh, 2, 1, '#ffcf3f');
      px(x, 2, 6 + b, 8, 6, '#ffcf3f'); px(x, 2, 6 + b, 8, 1, '#fff0a0'); px(x, 2, 11 + b, 8, 1, '#d9a520');
      px(x, 1, 7 + b + (st > 0 ? 1 : 0), 1, 4, '#ffcf3f'); px(x, 10, 7 + b + (st < 0 ? 1 : 0), 1, 4, '#ffcf3f');
      px(x, 3, b, 6, 6, '#d9a520'); px(x, 3, b, 6, 1, '#ffcf3f'); px(x, 4, 2 + b, 4, 3, '#1a1405');
      px(x, 5, 3 + b, 1, 1, '#9cff35'); px(x, 7, 3 + b, 1, 1, '#9cff35');
      px(x, 4, 8 + b, 4, 3, '#202020'); px(x, 5, 9 + b, 2, 1, '#9cff35'); px(x, 4, 8 + b, 4, 1, '#3a3a3a');
    },
  };
  EN.minismile = EN.smiley;
  const EN_SIZE = { npc: [12, 16], clip: [12, 15], fiend: [14, 16], stalker: [14, 16], exec: [16, 20], glitch: [12, 16], bruiser: [22, 24], leak: [12, 17],
    guard: [16, 20], pony: [22, 16], stretch: [12, 30], dancer: [14, 18], bigshoe: [26, 16], smiley: [16, 18], minismile: [16, 18] };
  // painters that draw a full 4-frame cycle (the rest alternate two poses)
  const FOUR = { npc: 1, fiend: 1, guard: 1, pony: 1, dancer: 1, leak: 1, smiley: 1, minismile: 1, bigshoe: 1 };

  // tier 1 = toxic (green cast), tier 2 = enraged (red cast)
  const TIER_TINT = [null, ['#6fd11c', 0.34], ['#ff2448', 0.42]];

  function buildEnemy(type) {
    const [w, h] = EN_SIZE[type];
    const base = [0, 1, 2, 3].map((f) => { const c = cvR(w, h); EN[type](c.getContext('2d'), FOUR[type] ? f : f % 2); return outline(c); });
    const tiers = [0, 1, 2].map((t) => {
      const frames = TIER_TINT[t] ? base.map((c) => tint(c, TIER_TINT[t][0], TIER_TINT[t][1])) : base;
      return { frames, framesL: frames.map(flip) };
    });
    const out = { tiers, white: silhouette(base[0], '#ffffff'), gold: silhouette(base[0], '#ffd75a'), w: base[0].width, h: base[0].height };
    // hallucinations get pink / cyan ghost copies for their chromatic shimmer
    if (RS.Data.ENEMIES[type] && RS.Data.ENEMIES[type].halluc) { out.pink = silhouette(base[0], '#ff6ad5'); out.cyan = silhouette(base[0], '#3ff2ff'); out.pinkL = flip(out.pink); out.cyanL = flip(out.cyan); }
    return out;
  }

  // ---------------------------------------------------------------- bosses
  function buildPlant() {
    const c = cv(40, 50), x = c.getContext('2d');
    // pot
    px(x, 10, 38, 20, 3, '#c0602d'); px(x, 11, 41, 18, 7, '#a0522d'); px(x, 12, 47, 16, 2, '#7a3a1d'); px(x, 11, 41, 18, 1, '#d8783d');
    // suit
    px(x, 9, 20, 22, 18, '#1f3a2a'); px(x, 9, 20, 22, 2, '#2f5a3e');
    px(x, 17, 20, 6, 10, '#f0f0f0'); px(x, 19, 21, 2, 9, '#d0142c');
    px(x, 4, 22, 5, 12, '#1f3a2a'); px(x, 31, 22, 5, 12, '#1f3a2a'); px(x, 3, 34, 4, 3, '#3fbf4f'); px(x, 33, 34, 4, 3, '#3fbf4f');
    px(x, 12, 26, 3, 1, '#e6b422'); px(x, 25, 26, 3, 1, '#e6b422');
    // leafy head
    const leaf = (lx, ly, w, h, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(lx, ly, w, h, 0, 0, Math.PI * 2); x.fill(); };
    leaf(20, 12, 11, 9, '#2a8a3a'); leaf(10, 8, 7, 4, '#3fbf4f'); leaf(30, 8, 7, 4, '#3fbf4f'); leaf(20, 3, 5, 4, '#5fe06a');
    leaf(6, 14, 5, 3, '#2a8a3a'); leaf(34, 14, 5, 3, '#2a8a3a');
    px(x, 14, 10, 4, 3, '#f8ff9a'); px(x, 22, 10, 4, 3, '#f8ff9a'); px(x, 15, 11, 2, 1, '#2a2a00'); px(x, 23, 11, 2, 1, '#2a2a00');
    px(x, 15, 16, 10, 2, '#0d2a12'); px(x, 16, 16, 1, 1, '#f0f0f0'); px(x, 19, 16, 1, 1, '#f0f0f0'); px(x, 22, 16, 1, 1, '#f0f0f0');
    return outline(crisp(c));
  }
  function buildRageKing() {
    const c = cv(46, 54), x = c.getContext('2d');
    // crown spikes
    for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#e6ebf3' : '#9aa3b2'; x.beginPath(); x.moveTo(11 + i * 6, 8); x.lineTo(14 + i * 6, 0 + (i % 2) * 3); x.lineTo(17 + i * 6, 8); x.fill(); }
    px(x, 11, 7, 24, 3, '#cfd6e3'); px(x, 21, 7, 4, 2, '#ff2448');
    // masked head
    px(x, 12, 10, 22, 13, '#7a0a16'); px(x, 12, 10, 22, 2, '#a8162a');
    px(x, 15, 14, 16, 4, '#2a0006'); px(x, 16, 15, 4, 2, '#ffe14a'); px(x, 26, 15, 4, 2, '#ffe14a');
    px(x, 18, 20, 10, 2, '#e6ebf3'); px(x, 18, 20, 10, 1, '#ffffff');
    // puffer
    px(x, 4, 23, 38, 20, '#a8102a'); px(x, 4, 23, 38, 2, '#ff3b55');
    for (let i = 0; i < 3; i++) px(x, 4, 28 + i * 5, 38, 1, '#6a0816');
    // chains
    x.strokeStyle = '#e6ebf3'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(13, 24); x.quadraticCurveTo(23, 38, 33, 24); x.stroke();
    x.strokeStyle = '#e6b422'; x.beginPath(); x.moveTo(11, 24); x.quadraticCurveTo(23, 44, 35, 24); x.stroke();
    px(x, 21, 35, 4, 4, '#e6ebf3'); px(x, 22, 36, 2, 2, '#ff2448');
    // arms / fists
    px(x, 0, 26, 5, 14, '#a8102a'); px(x, 41, 26, 5, 14, '#a8102a'); px(x, 0, 39, 5, 4, '#151515'); px(x, 41, 39, 5, 4, '#151515');
    px(x, 1, 40, 1, 1, '#e6ebf3'); px(x, 44, 40, 1, 1, '#e6ebf3');
    // legs
    px(x, 9, 43, 11, 8, '#121218'); px(x, 26, 43, 11, 8, '#121218');
    px(x, 8, 50, 13, 3, '#0e0e12'); px(x, 25, 50, 13, 3, '#0e0e12'); px(x, 9, 51, 11, 1, '#ff2448'); px(x, 26, 51, 11, 1, '#ff2448');
    return outline(crisp(c));
  }

  // ---------------------------------------------------------------- props
  // every prop is a painted atlas sheet re-sampled by RS.PropArt or hand-made PropArt pixel art (src/gfx/props_px.js);
  // tiny 3x5 glyphs for the level sign on the pillars
  const GLY = { B: ['11.', '1.1', '11.', '1.1', '11.'], 2: ['111', '..1', '111', '1..', '111'] };

  // ---------------------------------------------------------------- floors
  // Floors are painted at half resolution and upscaled x2 (nearest) so their pixel density
  // matches the ~2.3x-scaled sprites.
  function up2(src) {
    const c = cv(src.width * 2, src.height * 2), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function speckle(x, w, h, cols, n) { for (let i = 0; i < n; i++) px(x, U.randi(0, w), U.randi(0, h), 1, 1, U.pick(cols)); }
  function crack(x, sx, sy, n, col) {
    let cx = sx, cy = sy;
    for (let k = 0; k < n; k++) { px(x, Math.round(cx), Math.round(cy), 1, 1, col); cx += U.randi(-1, 2); cy += U.randi(0, 2) ? U.randi(-1, 2) : 0; if (U.randi(0, 3) === 0) cx += 1; }
  }
  // daylight-bright asphalt deck: mottled tarmac, speckle, sealed cracks, a few pebbles
  function floorGarage() {
    const s = 160, c = cv(s, s), x = c.getContext('2d');
    px(x, 0, 0, s, s, '#56585b');
    for (let i = 0; i < 30; i++) { x.fillStyle = U.pick(['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.035)', 'rgba(0,0,0,0.04)']); x.beginPath(); x.ellipse(U.rand(s), U.rand(s), U.rand(10, 34), U.rand(6, 22), U.rand(3), 0, 7); x.fill(); }
    speckle(x, s, s, ['#4d4f52', '#5f6164', '#646669', '#48494c', '#6c6e70', '#525457'], 3800);
    // sealed cracks (smooth tar lines) and raw cracks
    for (let i = 0; i < 3; i++) {
      let cx = U.rand(s), cy = U.rand(s); x.strokeStyle = 'rgba(30,31,33,0.55)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, cy);
      for (let k = 0; k < 8; k++) { cx += U.rand(-9, 9); cy += U.rand(4, 10); x.lineTo(cx, cy); }
      x.stroke();
    }
    for (let i = 0; i < 5; i++) crack(x, U.randi(0, s), U.randi(0, s), U.randi(8, 18), '#3a3b3e');
    for (let i = 0; i < 18; i++) { const bx = U.randi(0, s), by = U.randi(0, s); px(x, bx, by, 1, 1, '#7a7c7e'); px(x, bx, by + 1, 1, 1, '#3e3f42'); }
    return up2(c);
  }
  // raised loading-dock concrete
  function floorSlab() {
    const s = 64, c = cv(s, s), x = c.getContext('2d');
    px(x, 0, 0, s, s, '#8f8d86');
    speckle(x, s, s, ['#85837c', '#9a988f', '#7d7b74', '#a3a198'], 900);
    px(x, 0, 0, s, 1, '#6f6d66'); px(x, 0, 0, 1, s, '#6f6d66');
    return up2(c);
  }
  // diagonal yellow/black hazard stripes for the arena curb
  function hazardTile() {
    const c = cvR(16, 16), x = c.getContext('2d');
    px(x, 0, 0, 16, 16, '#111111');
    x.fillStyle = '#c9a51c';
    for (let i = -16; i < 32; i += 8) { x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 4, 16); x.lineTo(i + 20, 0); x.lineTo(i + 16, 0); x.fill(); }
    return crisp(c);
  }

  // ---------------------------------------------------------------- glows
  const glowCache = new Map();
  function glow(col, r) {
    r = Math.max(2, Math.round(r / 2) * 2);
    const key = col + '|' + r;
    let g = glowCache.get(key);
    if (g) return g;
    const s = Math.ceil(r * 2);
    g = cv(s, s);
    const x = g.getContext('2d');
    const gr = x.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, U.rgba(col, 0.9)); gr.addColorStop(0.35, U.rgba(col, 0.35)); gr.addColorStop(1, U.rgba(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    glowCache.set(key, g);
    return g;
  }

  const Sprites = {
    cv, cvR, px, outline, crisp, silhouette, tint, flip, glow, hazardTile,
    MASKS, CHAINS,
    heroes: {}, enemies: {}, bosses: {}, props: {}, floors: {},
    init() {
      // code-drawn enemies are built on first use: in a run only the types without a painted sheet need them (the
      // collection screen and the intro stickers show the rest)
      for (const t of Object.keys(EN)) {
        Object.defineProperty(this.enemies, t, { configurable: true, enumerable: true, get: () => {
          const v = buildEnemy(t);
          Object.defineProperty(this.enemies, t, { value: v, configurable: true, enumerable: true, writable: true });
          return v;
        } });
      }
      const painted = (RS.Render && RS.Render.ENEMY_ART) || {}; // the ones a run draws in code: made now, no hitch at their first spawn
      for (const t of Object.keys(EN)) if (!painted[t]) void this.enemies[t];
      this.bosses.plant = buildPlant();
      this.bosses.king = buildRageKing();
      for (const k of Object.keys(this.bosses)) {
        const b = this.bosses[k];
        this.bosses[k] = { img: b, imgL: flip(b), white: silhouette(b, '#ffffff'), w: b.width, h: b.height };
      }
      // props (src/gfx/props_px.js): the painted atlas sheets re-sampled onto the enemies' 2-world-unit pixel grid, and
      // hand-made pixel art for the rest. Every variant comes as [as painted, mirrored]; ws = the sheet prop's world width
      const A = RS.Atlas, PA = RS.PropArt, P = this.props = {};
      const keep = (c, from) => { c._sc = from._sc; return c; };
      const rot = (src, dir) => { const c = cv(src.height, src.width), x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(dir * Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2); return c; };
      const sheet = (name, ws) => {
        const out = [];
        for (let i = 0; i < 4; i++) {
          const c = A.get('prop_' + name + i);
          if (c) out.push(PA.pixelize(c, ws / c.width), PA.pixelize(c, ws / c.width, true));
        }
        return out;
      };
      P.barrel = sheet('barrel', 34); P.cone = sheet('cone', 24); P.barrier = sheet('barrier', 72); P.crate = sheet('crate', 40);
      P.toxic = sheet('toxic', 44); P.trash = sheet('trash', 38); P.dumpster = sheet('dumpster', 86); P.pallet = sheet('pallet', 60);
      // stall-parked cars: [nose up, nose down] per colour
      P.carV = ['#3b3f45', '#d6d6cf', '#1d1f22', '#4c7a26', '#8a2330'].map((col) => PA.car(col)).reduce((a, c) => a.concat([keep(rot(c, -1), c), keep(rot(c, 1), c)]), []);
      P.pillar = PA.pillar(GLY); P.speaker = PA.speaker(); P.amp = PA.amp(); P.panel = PA.panel();
      this.floors = { garage: floorGarage(), slab: floorSlab() };
    },
    // hand-drawn animation sheets (src/gfx/<id>_sheet.js) replace the procedural in-run hero where present
    heroSheets: {},
    loadHeroSheets() {
      return this.loadSheetSet(RS.HERO_SHEETS || {}, this.heroSheets);
    },
    // painted enemy sheets (RS.ENEMY_SHEETS, tools/build_enemies.py). Each atlas keeps its frames in place;
    // mirrored, tier-tinted and flash copies of the whole atlas are made on first use (see enemyAtlas).
    enemySheets: {},
    loadEnemySheets() {
      const D = RS.ENEMY_SHEETS || {};
      return Promise.all(Object.entries(D).map(([key, d]) => new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const anims = {};
          for (const [name, list] of Object.entries(d.frames)) anims[name] = list.map(([x, y, w, h, ax, ay]) => ({ x, y, w, h, ax, ay }));
          this.enemySheets[key] = { img: im, W: im.width, body: d.body, px: d.px || 0, anims, cache: {} };
          res();
        };
        im.onerror = () => res();
        im.src = d.png;
      })));
    },
    // variant: 0 base, 1 toxic, 2 enraged, 'white' hit flash, 'gold' elite rim; flip: mirrored atlas
    // lvl 0.5 = a half-size copy made once with high-quality filtering, used whenever a frame is drawn at half its
    // painted size or less (crowds on smaller screens): sharp and cheap, instead of a costly big downscale per draw
    enemyAtlas(sh, variant, flip, lvl) {
      lvl = lvl || 1;
      const key = variant + (flip ? 'L' : '') + lvl;
      let c = sh.cache[key];
      if (c) return c;
      if (flip) c = flip_(this.enemyAtlas(sh, variant, false, lvl));
      else if (variant === 0) {
        if (lvl === 1) c = sh.img;
        else {
          c = cv(Math.round(sh.img.width * lvl), Math.round(sh.img.height * lvl));
          const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
          x.drawImage(sh.img, 0, 0, c.width, c.height);
        }
      } else {
        const base = this.enemyAtlas(sh, 0, false, lvl), src = base instanceof HTMLImageElement ? toCanvas(base) : base;
        if (variant === 'white' || variant === 'gold') c = silhouette(src, variant === 'white' ? '#ffffff' : '#ffd75a');
        else c = tint(src, TIER_TINT[variant][0], TIER_TINT[variant][1] * 0.5); // half strength: the paintings keep their detail
      }
      return (sh.cache[key] = c);
    },
    loadSheetSet(D, into) {
      return Promise.all(Object.entries(D).map(([id, d]) => new Promise((res) => {
        const im = new Image();
        im.onload = () => {
          const out = {}, s = d.k ? d.k / 0.62 : 1, made = new Map(); // s: sheet px size vs the 0.62 world units of the first sheet
          for (const [k, list] of Object.entries(d.frames)) {
            out[k] = list.map(([x, y, w, h, fx, fy, mx, my]) => {
              const key = x + ',' + y; // frames shared by several anims are cut once
              let c = made.get(key);
              if (!c) { c = cv(w, h); c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h); c = { c, L: flip(c) }; made.set(key, c); }
              return { img: c.c, imgL: c.L, w, h, fx, fy, fxL: w - fx, s, mx: mx === undefined ? -1 : mx, my: my === undefined ? -1 : my };
            });
          }
          // mirrored anims (walk / idle left) are the right ones flipped: same frames, swapped images and anchors
          for (const [k, from] of Object.entries(d.mirror || {})) {
            if (out[from]) out[k] = out[from].map((f) => Object.assign({}, f, { img: f.imgL, imgL: f.img, fx: f.fxL, fxL: f.fx, mx: f.mx >= 0 ? f.w - f.mx : -1 }));
          }
          // poses made from other frames until their own art exists (not enumerable: callers loop over the anims)
          Object.defineProperty(out, 'derived', { value: new Set(d.derived || []), enumerable: false });
          into[id] = out;
          res();
        };
        im.onerror = () => res();
        im.src = d.png;
      })));
    },
    hero(id, cos) {
      const key = id + '|' + (cos.mask || '') + '|' + (cos.chain || '');
      if (!this.heroes[key]) this.heroes[key] = buildHero(id, cos);
      return this.heroes[key];
    },
  };

  RS.Sprites = Sprites;
})(window.RS);
