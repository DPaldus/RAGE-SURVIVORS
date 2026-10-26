'use strict';
// Menu backdrops: cinematic underground scenes, painted once into 1920x1080 layers (a base plate plus
// additive light layers) and animated cheaply every frame: neon flicker, sweeping beams, drifting fog,
// dust and the rim-lit hero. Scenes: 'main' (parking deck + neon unicorn), 'chars' (same deck, blurred,
// props in front) and 'yard' (graffiti wall + red-lit lot with a police helicopter) for the other menus.
(function (RS) {
  const VW = 1920, VH = 1080;
  const GRN = '#9cff35', RED = '#ff2448';
  const cv = (w, h) => RS.Sprites.cv(w, h);
  const FILTER = (() => { try { const x = document.createElement('canvas').getContext('2d'); x.filter = 'blur(2px)'; return x.filter === 'blur(2px)'; } catch (e) { return false; } })();

  // tiny seeded RNG so every scene is identical every boot
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function line(x, x0, y0, x1, y1) { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); }
  function poly(x, pts) { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); }
  function fillPoly(x, pts, col) { poly(x, pts); x.fillStyle = col; x.fill(); }
  // Catmull-Rom curve through the points (neon tubing, tails, manes)
  function curve(x, p) {
    x.beginPath(); x.moveTo(p[0], p[1]);
    const n = p.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const a = Math.max(0, i - 1) * 2, b = i * 2, c = (i + 1) * 2, d = Math.min(n - 1, i + 2) * 2;
      x.bezierCurveTo(p[b] + (p[c] - p[a]) / 6, p[b + 1] + (p[c + 1] - p[a + 1]) / 6, p[c] - (p[d] - p[b]) / 6, p[c + 1] - (p[d + 1] - p[b + 1]) / 6, p[c], p[c + 1]);
    }
  }
  function rr(x, x0, y0, w, h, r) {
    x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath();
  }
  function radial(x, cx, cy, r, col, a, sy) {
    x.save(); x.translate(cx, cy); if (sy) x.scale(1, sy);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.45, rgba(col, a * 0.35)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore();
  }
  function blur(x, px) { if (FILTER) x.filter = px ? `blur(${px}px)` : 'none'; }
  // concrete grime: speckles, blots and scratches
  function grime(x, x0, y0, w, h, R, n, cols) {
    for (let i = 0; i < n; i++) {
      x.fillStyle = cols[Math.floor(R() * cols.length)];
      const s = R() < 0.92 ? 1 + R() * 2 : 3 + R() * 9;
      x.globalAlpha = 0.25 + R() * 0.5;
      x.fillRect(x0 + R() * w, y0 + R() * h, s, s * (0.5 + R()));
    }
    x.globalAlpha = 1;
  }
  function stains(x, x0, y0, w, h, R, n) {
    for (let i = 0; i < n; i++) {
      const sx = x0 + R() * w, len = 30 + R() * h * 0.6, sw = 2 + R() * 10;
      const g = x.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(sx, y0, sw, len);
    }
  }

  // ---------------------------------------------------------------- set pieces
  // fluorescent / neon tube: crisp core into the base plate, bloom into the light layer
  function tube(b, g, x0, y0, x1, y1, col, w) {
    b.save(); b.lineCap = 'round';
    b.strokeStyle = '#020202'; b.lineWidth = w + 7; line(b, x0, y0, x1, y1);
    b.strokeStyle = col; b.lineWidth = w; b.shadowColor = col; b.shadowBlur = w * 2.5; line(b, x0, y0, x1, y1);
    b.shadowBlur = 0; b.strokeStyle = 'rgba(255,255,255,0.85)'; b.lineWidth = Math.max(1.5, w * 0.36); line(b, x0, y0, x1, y1);
    b.restore();
    g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter';
    blur(g, w * 2);
    g.strokeStyle = rgba(col, 0.55); g.lineWidth = w * 3; line(g, x0, y0, x1, y1);
    blur(g, w * 6);
    g.strokeStyle = rgba(col, 0.32); g.lineWidth = w * 8; line(g, x0, y0, x1, y1);
    blur(g, 0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    radial(g, (x0 + x1) / 2, (y0 + y1) / 2, Math.max(120, len * 1.4), col, 0.12);
    g.restore();
  }
  // vertical smeared reflection of a light on the wet floor
  function streak(g, cx, y, w, len, col, a) {
    g.save(); g.globalCompositeOperation = 'lighter';
    blur(g, Math.max(2, w * 0.25));
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.5)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, y + len / 2, w / 2, len / 2, 0, 0, Math.PI * 2); g.fill();
    blur(g, 0); g.restore();
  }

  // rearing unicorn in neon tubing (fictional sign), drawn in a 300x420 box
  const UNI = [
    [38, 2, 72, 58, 86, 50, 38, 2],                                                             // horn
    [86, 52, 70, 70, 54, 90, 44, 104, 50, 114, 68, 112, 86, 106, 98, 124, 104, 152, 112, 182, 120, 198],
    [112, 54, 104, 36, 116, 26, 122, 48, 142, 74, 162, 110, 186, 150, 212, 180, 240, 206, 258, 234, 258, 266, 250, 300, 256, 336, 244, 372, 248, 404, 226, 406],
    [226, 406, 230, 372, 232, 342, 214, 304, 180, 264, 150, 246, 128, 226, 120, 210],
    [124, 210, 96, 216, 74, 202, 64, 222, 50, 234],                                            // raised front leg
    [116, 192, 92, 176, 70, 160, 72, 138, 60, 128],                                            // raised front leg
    [204, 292, 198, 340, 186, 374, 190, 404, 170, 406],                                        // hind leg
    [118, 50, 146, 60, 150, 88, 172, 98, 176, 126, 198, 138, 200, 164],                        // mane
    [258, 236, 286, 242, 300, 272, 284, 302, 298, 342, 280, 382],                              // tail
    [262, 252, 282, 284, 270, 322, 288, 362],
  ];
  function unicorn(x, ox, oy, s, col, core) {
    x.save(); x.translate(ox, oy); x.scale(s, s); x.lineCap = 'round'; x.lineJoin = 'round';
    const pass = (w, c, glow) => {
      x.strokeStyle = c; x.lineWidth = w; x.shadowColor = glow || 'transparent'; x.shadowBlur = glow ? 18 / s : 0;
      for (const p of UNI) { curve(x, p); x.stroke(); }
      x.beginPath(); x.arc(74, 78, 3, 0, Math.PI * 2); x.fillStyle = c; x.fill();
    };
    pass(5.5, col, col);
    if (core) pass(2, core);
    x.restore();
  }

  // spray-painted crown tag with drips
  function sprayCrown(x, cx, cy, s, col, R, a) {
    const pts = [-1, 0.45, -0.95, -0.7, -0.45, 0.02, 0, -0.95, 0.45, 0.02, 0.95, -0.7, 1, 0.45];
    x.save(); x.strokeStyle = col; x.fillStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
      x.globalAlpha = (a || 1) * (0.3 + pass * 0.25); x.lineWidth = s * (0.12 - pass * 0.03);
      x.beginPath();
      for (let i = 0; i < pts.length; i += 2) { const j = (R() - 0.5) * s * 0.06; x.lineTo(cx + pts[i] * s + j, cy + pts[i + 1] * s + j); }
      x.stroke();
      line(x, cx - s * 1.05, cy + s * 0.5, cx + s * 1.05, cy + s * 0.55);
      line(x, cx - s, cy + s * 0.78, cx + s * 0.98, cy + s * 0.76);
    }
    x.globalAlpha = (a || 1) * 0.7; x.lineWidth = s * 0.035;
    for (let i = 0; i < 6; i++) { const dx = cx + (R() * 2 - 1) * s; line(x, dx, cy + s * 0.8, dx, cy + s * (0.95 + R() * 0.8)); }
    x.globalAlpha = (a || 1) * 0.25;
    for (let i = 0; i < 90; i++) { const r = R() * s * 1.4, t = R() * 6.28; x.fillRect(cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.7, 1.5, 1.5); }
    x.restore();
  }
  // loose marker scribble (unreadable tag)
  function scribble(x, cx, cy, s, col, R, a) {
    x.save(); x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = Math.max(1.5, s * 0.06); x.lineCap = 'round';
    const p = []; let px0 = cx - s;
    for (let i = 0; i < 9; i++) { p.push(px0, cy + (R() - 0.5) * s * 0.9); px0 += s * 0.25; }
    curve(x, p); x.stroke();
    line(x, cx - s, cy + s * 0.5, cx + s * 1.1, cy + s * 0.35);
    x.restore();
  }

  // standing person silhouette, backlit
  function person(x, cx, fy, h, rim, o) {
    o = o || {};
    const hw = h * (o.wide ? 0.16 : 0.13), hr = h * (o.hood ? 0.085 : 0.07), hy = fy - h + hr;
    const shape = () => {
      x.beginPath();
      x.arc(cx, hy, hr, 0, Math.PI * 2);
      x.moveTo(cx - hw, fy - h * 0.77);
      x.quadraticCurveTo(cx, fy - h * 0.87, cx + hw, fy - h * 0.77);
      x.lineTo(cx + hw * 0.92, fy - h * 0.4); x.lineTo(cx + hw * 0.72, fy); x.lineTo(cx + hw * 0.1, fy);
      x.lineTo(cx, fy - h * 0.36); x.lineTo(cx - hw * 0.1, fy); x.lineTo(cx - hw * 0.72, fy); x.lineTo(cx - hw * 0.92, fy - h * 0.4);
      x.closePath();
      if (o.arm) { x.moveTo(cx + hw * 0.7, fy - h * 0.74); x.lineTo(cx + hw * 1.5, fy - h * 1.02); x.lineTo(cx + hw * 1.25, fy - h * 1.05); x.lineTo(cx + hw * 0.4, fy - h * 0.72); x.closePath(); }
    };
    if (rim) { x.save(); x.translate(rim.dx, rim.dy); x.fillStyle = rim.col; shape(); x.fill(); x.restore(); }
    x.fillStyle = o.col || '#040405'; shape(); x.fill();
    return o.arm ? { x: cx + hw * 1.4, y: fy - h * 1.06 } : null; // phone light spot
  }

  // aluminium-edged flight case
  function fcase(x, x0, y0, w, h, R, o) {
    o = o || {};
    x.save();
    rr(x, x0, y0, w, h, 5); x.fillStyle = '#070807'; x.fill();
    const g = x.createLinearGradient(x0, y0, x0, y0 + h); g.addColorStop(0, '#1a1c1a'); g.addColorStop(1, '#090a09');
    x.fillStyle = g; x.fillRect(x0 + 5, y0 + 5, w - 10, h - 10);
    grime(x, x0 + 5, y0 + 5, w - 10, h - 10, R, Math.floor(w * h / 60), ['#2a2c29', '#050505', '#20221f']);
    x.strokeStyle = '#272926'; x.lineWidth = 3; x.strokeRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5);
    x.fillStyle = '#1c1e1b'; x.fillRect(x0, y0 + h * 0.46, w, 7); x.fillStyle = '#353833'; x.fillRect(x0, y0 + h * 0.46, w, 1.5);
    for (const [cx, cy] of [[x0, y0], [x0 + w - 16, y0], [x0, y0 + h - 16], [x0 + w - 16, y0 + h - 16]]) {
      x.fillStyle = '#3c3f3a'; x.fillRect(cx, cy, 16, 16); x.fillStyle = '#5a5e57'; x.fillRect(cx, cy, 16, 1.5); x.fillStyle = '#121312'; x.fillRect(cx + 6, cy + 6, 4, 4);
    }
    for (const lx of [0.25, 0.75]) { x.fillStyle = '#464a44'; x.fillRect(x0 + w * lx - 9, y0 + h * 0.46 - 6, 18, 18); x.fillStyle = '#0e0f0e'; x.fillRect(x0 + w * lx - 4, y0 + h * 0.46, 8, 6); }
    const sh = x.createLinearGradient(x0, y0, x0 + w, y0 + h); sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = sh; x.fillRect(x0, y0, w, h);
    if (o.crown) sprayCrown(x, x0 + w * 0.5, y0 + h * 0.24, Math.min(w, h) * 0.18, '#d9dcd6', R, 0.55);
    if (o.stickers) for (let k = 0; k < o.stickers; k++) {
      x.save(); x.translate(x0 + 14 + R() * (w - 40), y0 + h * 0.58 + R() * (h * 0.3)); x.rotate((R() - 0.5) * 0.5);
      x.fillStyle = [RED, '#e6e6e0', GRN, RED][k % 4]; x.globalAlpha = 0.85; x.fillRect(0, 0, 18 + R() * 26, 10 + R() * 12); x.restore();
    }
    if (o.rim) { x.strokeStyle = o.rim; x.globalAlpha = 0.75; x.lineWidth = 2; line(x, x0 + 6, y0 + 1, x0 + w - 6, y0 + 1); line(x, o.rimSide < 0 ? x0 + 1 : x0 + w - 1, y0 + 6, o.rimSide < 0 ? x0 + 1 : x0 + w - 1, y0 + h - 6); }
    x.restore();
  }

  // double cup with a crown stamp (the in-game DOUBLE CUP, fictional)
  function cup(x, cx, by, h, R) {
    const tw = h * 0.36, bw = h * 0.27;
    for (const [dy, sh] of [[0, '#d9d9d4'], [-h * 0.05, '#f2f2ee']]) {
      const g = x.createLinearGradient(cx - tw, 0, cx + tw, 0);
      g.addColorStop(0, '#8d8d89'); g.addColorStop(0.35, sh); g.addColorStop(0.7, '#cfcfca'); g.addColorStop(1, '#6d6d69');
      fillPoly(x, [cx - tw, by - h + dy, cx + tw, by - h + dy, cx + bw, by + dy * 0.2, cx - bw, by + dy * 0.2], g);
    }
    x.fillStyle = '#fafaf6'; x.beginPath(); x.ellipse(cx, by - h * 1.05, tw, h * 0.05, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3a1a52'; x.beginPath(); x.ellipse(cx, by - h * 1.04, tw * 0.86, h * 0.035, 0, 0, Math.PI * 2); x.fill();
    // stamped crown
    x.fillStyle = '#121212';
    fillPoly(x, [cx - h * 0.14, by - h * 0.42, cx - h * 0.15, by - h * 0.62, cx - h * 0.07, by - h * 0.5, cx, by - h * 0.66, cx + h * 0.07, by - h * 0.5, cx + h * 0.15, by - h * 0.62, cx + h * 0.14, by - h * 0.42], '#141414');
    x.fillRect(cx - h * 0.15, by - h * 0.39, h * 0.3, h * 0.04);
  }
  function casing(x, cx, cy, s, a) {
    x.save(); x.translate(cx, cy); x.rotate(a);
    const g = x.createLinearGradient(0, -s * 0.3, 0, s * 0.3); g.addColorStop(0, '#f2c46a'); g.addColorStop(0.5, '#a8711f'); g.addColorStop(1, '#4d3008');
    x.fillStyle = g; x.fillRect(-s, -s * 0.28, s * 2, s * 0.56); x.fillStyle = '#6b4a14'; x.fillRect(s * 0.8, -s * 0.32, s * 0.25, s * 0.64);
    x.restore();
  }
  function cash(x, x0, y0, w, h, R) {
    for (let i = 0; i < 6; i++) {
      const yy = y0 - i * h * 0.16;
      x.fillStyle = '#16260f'; x.fillRect(x0 + (R() - 0.5) * 6, yy, w, h * 0.17);
      x.fillStyle = i % 2 ? '#4d7f33' : '#5a8f3b'; x.fillRect(x0 + (R() - 0.5) * 6, yy + 1, w, h * 0.13);
    }
    const top = y0 - 5 * h * 0.16;
    x.fillStyle = '#7fb35a'; x.fillRect(x0, top - h * 0.06, w, h * 0.08);
    x.fillStyle = '#d6d2bf'; x.fillRect(x0 + w * 0.42, top - h * 0.06, w * 0.16, h * 0.98);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(x0 + w * 0.42, top - h * 0.06, 2, h * 0.98);
  }

  // boxy black SUV, three-quarter front view (no badges)
  function suv(b, g, R) {
    b.save();
    // floor shadow
    b.fillStyle = 'rgba(0,0,0,0.85)'; b.beginPath(); b.ellipse(720, 872, 330, 34, 0, 0, Math.PI * 2); b.fill();
    // wheels behind the body arches
    for (const [wx, wy, r] of [[505, 852, 66], [670, 860, 74]]) {
      b.fillStyle = '#020202'; b.beginPath(); b.arc(wx, wy, r + 8, Math.PI, 0); b.fill();
      b.fillStyle = '#080808'; b.beginPath(); b.arc(wx, wy, r, 0, Math.PI * 2); b.fill();
      const rg = b.createRadialGradient(wx - r * 0.2, wy - r * 0.2, 2, wx, wy, r * 0.62);
      rg.addColorStop(0, '#3a3c40'); rg.addColorStop(1, '#0d0e10');
      b.fillStyle = rg; b.beginPath(); b.arc(wx, wy, r * 0.62, 0, Math.PI * 2); b.fill();
      b.strokeStyle = '#4a4d52'; b.lineWidth = 3;
      for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; line(b, wx + Math.cos(t) * r * 0.16, wy + Math.sin(t) * r * 0.16, wx + Math.cos(t) * r * 0.56, wy + Math.sin(t) * r * 0.56); }
      b.fillStyle = '#5a5d62'; b.beginPath(); b.arc(wx, wy, r * 0.12, 0, Math.PI * 2); b.fill();
    }
    // side body + front face
    let gr = b.createLinearGradient(440, 600, 440, 860); gr.addColorStop(0, '#16171a'); gr.addColorStop(0.5, '#0b0c0e'); gr.addColorStop(1, '#050506');
    fillPoly(b, [440, 600, 735, 610, 742, 840, 446, 834], gr);
    gr = b.createLinearGradient(740, 610, 990, 870); gr.addColorStop(0, '#1b1c20'); gr.addColorStop(1, '#070708');
    fillPoly(b, [735, 610, 988, 630, 992, 868, 742, 862], gr);
    // wheel arches cut into the side
    b.fillStyle = '#030303';
    for (const [wx, wy, r] of [[505, 852, 66], [670, 860, 74]]) { b.beginPath(); b.arc(wx, wy, r + 9, Math.PI, Math.PI * 2); b.lineTo(wx + r + 9, 840); b.lineTo(wx - r - 9, 840); b.fill(); }
    for (const [wx, wy, r] of [[505, 852, 66], [670, 860, 74]]) {
      b.fillStyle = '#080808'; b.beginPath(); b.arc(wx, wy, r, Math.PI, Math.PI * 2); b.fill();
      b.fillStyle = '#1d1f23'; b.beginPath(); b.arc(wx, wy, r * 0.62, Math.PI, Math.PI * 2); b.fill();
    }
    // greenhouse: roof, side glass, windscreen
    fillPoly(b, [468, 486, 745, 492, 962, 512, 966, 528, 748, 510, 470, 500], '#141518');
    gr = b.createLinearGradient(460, 500, 735, 596); gr.addColorStop(0, '#0c0e10'); gr.addColorStop(0.6, '#15181b'); gr.addColorStop(1, '#08090a');
    fillPoly(b, [470, 502, 728, 508, 735, 598, 460, 594], gr);
    gr = b.createLinearGradient(748, 510, 976, 612); gr.addColorStop(0, '#1e3317'); gr.addColorStop(0.45, '#0b100a'); gr.addColorStop(1, '#130509');
    fillPoly(b, [750, 512, 964, 530, 976, 612, 750, 598], gr);
    b.strokeStyle = '#030303'; b.lineWidth = 9; line(b, 598, 504, 600, 596); line(b, 744, 508, 746, 600);
    // hood sliver and bonnet edge
    fillPoly(b, [735, 610, 988, 630, 978, 612, 748, 596], '#22242a');
    b.strokeStyle = '#3c3f46'; b.lineWidth = 2; line(b, 748, 597, 978, 613);
    // grille
    fillPoly(b, [804, 662, 936, 670, 938, 772, 806, 766], '#040405');
    b.strokeStyle = '#26282d'; b.lineWidth = 3;
    for (let y = 676; y < 768; y += 13) line(b, 808, y, 934, y + 6);
    b.strokeStyle = '#3a3d43'; b.lineWidth = 2; b.strokeRect(805, 663, 131, 106);
    // headlights
    for (const [hx, hy, r] of [[772, 690, 30], [962, 702, 24]]) {
      b.fillStyle = '#0a0a0c'; b.beginPath(); b.arc(hx, hy, r + 7, 0, Math.PI * 2); b.fill();
      const hg = b.createRadialGradient(hx - r * 0.2, hy - r * 0.2, 1, hx, hy, r);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, '#e4f0ff'); hg.addColorStop(1, '#7b8da6');
      b.fillStyle = hg; b.beginPath(); b.arc(hx, hy, r, 0, Math.PI * 2); b.fill();
      b.strokeStyle = 'rgba(255,255,255,0.95)'; b.lineWidth = 3; b.beginPath(); b.arc(hx, hy, r * 0.72, 0, Math.PI * 2); b.stroke();
    }
    // bumper, fog lamps, plate holder (blank)
    fillPoly(b, [738, 796, 992, 810, 993, 868, 742, 862], '#0f1012');
    b.strokeStyle = '#33363c'; b.lineWidth = 2; line(b, 740, 798, 991, 811);
    b.fillStyle = '#d7e4ff'; b.fillRect(760, 820, 26, 8); b.fillRect(950, 830, 22, 7);
    b.fillStyle = '#16171a'; b.fillRect(838, 818, 74, 26);
    // side details: mirror, door seams, handle, step
    fillPoly(b, [728, 560, 760, 556, 762, 590, 730, 592], '#0c0d0f');
    b.strokeStyle = '#030303'; b.lineWidth = 3; line(b, 600, 604, 604, 834); line(b, 470, 602, 472, 830);
    b.fillStyle = '#2a2c31'; b.fillRect(640, 640, 30, 6); b.fillRect(512, 636, 30, 6);
    fillPoly(b, [448, 838, 744, 846, 744, 856, 450, 848], '#151619');
    // glossy reflections + rim light (green from the tube above, red from the back of the hall)
    b.save(); b.globalCompositeOperation = 'lighter';
    b.strokeStyle = 'rgba(156,255,53,0.45)'; b.lineWidth = 2; line(b, 470, 486, 745, 492); line(b, 745, 492, 962, 512); line(b, 440, 601, 735, 611);
    b.strokeStyle = 'rgba(255,36,72,0.55)'; b.lineWidth = 3; line(b, 989, 632, 992, 866); line(b, 965, 530, 977, 612);
    const sh = b.createLinearGradient(480, 0, 720, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.05)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = sh; fillPoly(b, [520, 606, 600, 607, 540, 834, 470, 832], sh);
    b.restore();
    b.restore();
    // headlight bloom, lens flare and floor reflection
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [hx, hy, k] of [[772, 690, 1], [962, 702, 0.7]]) {
      radial(g, hx, hy, 170 * k, '#dfeaff', 0.55);
      radial(g, hx, hy, 60 * k, '#ffffff', 0.9);
      radial(g, hx, hy, 260 * k, '#dfeaff', 0.35, 0.08);
    }
    g.restore();
    streak(g, 772, 880, 70, 200, '#dfeaff', 0.5);
    streak(g, 962, 885, 55, 160, '#dfeaff', 0.35);
  }

  // concrete pillar with spray work
  function pillar(b, x0, w, top, bot, R, o) {
    o = o || {};
    const gr = b.createLinearGradient(x0, 0, x0 + w, 0);
    gr.addColorStop(0, o.lit || '#2a3324'); gr.addColorStop(0.18, '#1d201c'); gr.addColorStop(0.7, '#141613'); gr.addColorStop(1, '#090a09');
    b.fillStyle = gr; b.fillRect(x0, top, w, bot - top);
    grime(b, x0, top, w, bot - top, R, Math.floor(w * (bot - top) / 40), ['#2c302a', '#0a0b0a', '#353a33', '#101210']);
    stains(b, x0, top, w, bot - top, R, Math.floor(w / 10));
    // hazard band near the floor
    const hz = Math.min(80, (bot - top) * 0.09), hy = bot - hz - 30;
    b.save(); b.beginPath(); b.rect(x0, hy, w, hz); b.clip();
    for (let i = -hz; i < w + hz; i += 34) { b.fillStyle = '#8a7414'; fillPoly(b, [x0 + i, hy, x0 + i + 17, hy, x0 + i + 17 + hz, hy + hz, x0 + i + hz, hy + hz], '#7c6912'); }
    b.restore();
    b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(x0, hy, w, hz);
    // edge rim light
    if (o.rimL) { b.fillStyle = o.rimL; b.fillRect(x0, top, 3, bot - top); }
    if (o.rimR) { b.fillStyle = o.rimR; b.fillRect(x0 + w - 3, top, 3, bot - top); }
  }

  // ---------------------------------------------------------------- MAIN: parking deck B2 with the neon unicorn
  function buildMain() {
    const R = rng(9172);
    const base = cv(VW, VH), b = base.getContext('2d');
    const glow = cv(VW / 2, VH / 2), g = glow.getContext('2d'); g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const uni = cv(VW / 2, VH / 2), u = uni.getContext('2d'); u.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const VPX = 1330, VPY = 470, FLOOR = 740;

    let gr = b.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, '#060607'); gr.addColorStop(0.55, '#0b0b0d'); gr.addColorStop(1, '#030304');
    b.fillStyle = gr; b.fillRect(0, 0, VW, VH);

    // ceiling: beams receding toward the vanishing point + long girders converging on it
    for (let z = 1; z < 14; z += 0.85) {
      const y = VPY - 520 / z, th = 46 / z;
      b.fillStyle = '#121214'; b.fillRect(0, y, VW, th);
      b.fillStyle = 'rgba(156,255,53,0.08)'; b.fillRect(0, y + th - 1, VW * 0.6, 1);
      b.fillStyle = 'rgba(255,36,72,0.1)'; b.fillRect(VW * 0.55, y + th - 1, VW * 0.45, 1);
    }
    b.strokeStyle = '#0d0d0f'; b.lineWidth = 14;
    for (const tx of [-500, 200, 800, 1500, 2300, 3000]) line(b, tx, -20, VPX, VPY - 40);
    grime(b, 0, 0, VW, 420, R, 2600, ['#151517', '#050505', '#1c1c1f']);

    // back of the hall (right): wall, red haze, mezzanine with a crowd on it
    gr = b.createLinearGradient(1000, 0, 1920, 0); gr.addColorStop(0, '#0b0809'); gr.addColorStop(1, '#1a070b');
    b.fillStyle = gr; b.fillRect(1000, 300, 920, FLOOR - 300);
    grime(b, 1000, 300, 920, FLOOR - 300, R, 1800, ['#22090e', '#0a0405', '#2d0c12']);
    radial(b, 1560, 420, 460, '#ff2448', 0.34);
    radial(b, 1460, 690, 340, '#ff2448', 0.26, 0.5);
    radial(b, 1800, 640, 380, '#ff2448', 0.2);
    // mezzanine slab + railing + heads
    for (let i = 0; i < 26; i++) {
      const hx = 1175 + i * 17 + R() * 8, hy = 400 + R() * 10, hr = 7 + R() * 3;
      b.fillStyle = 'rgba(255,36,72,0.4)'; b.beginPath(); b.arc(hx + 1.5, hy - 1, hr, 0, Math.PI * 2); b.fill();
      b.fillStyle = '#050304'; b.beginPath(); b.arc(hx, hy, hr, 0, Math.PI * 2); b.fill();
      b.fillRect(hx - hr * 1.5, hy + hr * 0.6, hr * 3, 30);
    }
    b.fillStyle = '#0a0809'; b.fillRect(1150, 448, 520, 30);
    b.fillStyle = '#2a1015'; b.fillRect(1150, 448, 520, 2);
    b.strokeStyle = '#140a0c'; b.lineWidth = 3; line(b, 1150, 410, 1670, 410);
    for (let xx = 1156; xx < 1670; xx += 16) line(b, xx, 410, xx, 448);
    b.fillStyle = '#060405'; b.fillRect(1150, 478, 520, 10);
    // far pillars
    pillar(b, 1240, 44, 300, FLOOR, R, { lit: '#2a1216', rimR: 'rgba(255,36,72,0.35)' });
    pillar(b, 1690, 70, 120, FLOOR + 6, R, { lit: '#1f0d10', rimL: 'rgba(255,36,72,0.45)' });
    pillar(b, 1860, 80, 0, FLOOR + 10, R, { lit: '#1c0b0e' });

    // left wall behind the SUV: concrete blocks, shutter, tags
    b.fillStyle = '#0d0e0d'; b.fillRect(0, 250, 1000, FLOOR - 250);
    for (let y = 270; y < FLOOR; y += 34) { b.fillStyle = '#080908'; b.fillRect(0, y, 1000, 2); }
    for (let row = 0, y = 270; y < FLOOR; y += 34, row++) for (let xx = (row % 2) * 40; xx < 1000; xx += 80) { b.fillStyle = '#090a09'; b.fillRect(xx, y, 2, 34); }
    grime(b, 0, 250, 1000, FLOOR - 250, R, 3000, ['#161816', '#050505', '#1b1d1a']);
    stains(b, 0, 250, 1000, FLOOR - 250, R, 30);
    b.fillStyle = '#060706'; b.fillRect(130, 360, 300, FLOOR - 360);
    for (let y = 366; y < FLOOR; y += 9) { b.fillStyle = '#151715'; b.fillRect(134, y, 292, 5); }
    sprayCrown(b, 330, 330, 34, GRN, R, 0.55);
    scribble(b, 560, 440, 60, '#d9dcd6', R, 0.25);
    scribble(b, 200, 520, 70, RED, R, 0.3);
    radial(b, 120, 380, 300, '#9cff35', 0.1);
    // far end of the hall (vanishing point): dim opening
    gr = b.createRadialGradient(VPX - 120, VPY + 120, 10, VPX - 120, VPY + 120, 260);
    gr.addColorStop(0, 'rgba(70,24,32,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gr; b.fillRect(VPX - 400, VPY - 160, 560, 560);

    // wet floor
    gr = b.createLinearGradient(0, FLOOR, 0, VH); gr.addColorStop(0, '#0d0c0e'); gr.addColorStop(1, '#040405');
    b.fillStyle = gr; b.fillRect(0, FLOOR, VW, VH - FLOOR);
    grime(b, 0, FLOOR, VW, VH - FLOOR, R, 2600, ['#141416', '#020202', '#1a1a1d']);
    b.strokeStyle = 'rgba(214,200,140,0.10)'; b.lineWidth = 3;
    for (let i = -7; i <= 7; i++) { const bx = VPX + i * 260; const t = (FLOOR - VPY) / (VH - VPY); line(b, VPX + (bx - VPX) * t, FLOOR, bx, VH); }
    b.fillStyle = 'rgba(214,200,140,0.07)'; b.fillRect(0, FLOOR + 1, VW, 2);
    for (let i = 0; i < 14; i++) { b.fillStyle = 'rgba(0,0,0,0.45)'; b.beginPath(); b.ellipse(R() * VW, FLOOR + 40 + R() * 300, 40 + R() * 120, 6 + R() * 16, 0, 0, Math.PI * 2); b.fill(); }

    // crowd on the floor (backlit) + DJ table + phone lights
    radial(b, 1450, 700, 260, '#ff2448', 0.28, 0.6);
    fillPoly(b, [1510, 690, 1660, 690, 1650, 760, 1520, 760], '#0b0708');
    b.fillStyle = RED; for (let i = 0; i < 6; i++) b.fillRect(1525 + i * 21, 702, 8, 3);
    const phones = [];
    const crowd = [[1300, 858, 230, 0], [1352, 846, 246, 1], [1405, 852, 214, 0], [1452, 842, 236, 2], [1500, 848, 222, 0], [1548, 838, 240, 1], [1600, 844, 214, 0], [1258, 864, 210, 0], [1640, 840, 230, 2]];
    for (const [cx, fy, h, kind] of crowd) {
      const ph = person(b, cx, fy, h, { dx: 2.5, dy: -1.5, col: 'rgba(255,36,72,0.45)' }, { hood: kind === 1, wide: kind === 2, arm: kind === 2 });
      if (ph) phones.push(ph);
    }
    for (const ph of phones) { b.fillStyle = '#f3f6ff'; b.fillRect(ph.x - 4, ph.y - 7, 8, 12); radial(g, ph.x, ph.y, 40, '#f3f6ff', 0.6); }

    // flight cases (right)
    fcase(b, 1640, 690, 280, 150, R, { crown: true, rim: GRN, rimSide: -1 });
    fcase(b, 1600, 830, 330, 200, R, { stickers: 3, rim: 'rgba(156,255,53,0.7)', rimSide: -1 });
    fcase(b, 1760, 570, 170, 120, R, { rim: 'rgba(255,36,72,0.6)' });

    // front pillar (P2) behind the SUV
    pillar(b, 790, 165, 0, 1010, R, { lit: '#29351f', rimL: 'rgba(156,255,53,0.55)', rimR: 'rgba(255,36,72,0.3)' });
    sprayCrown(b, 872, 184, 40, GRN, R, 0.8);
    b.save(); b.font = '900 120px Impact, "Arial Black", sans-serif'; b.fillStyle = 'rgba(8,8,8,0.85)'; b.textAlign = 'center';
    b.fillText('P2', 872, 360); b.restore();
    scribble(b, 860, 440, 44, '#dfe3dc', R, 0.35);

    // the SUV
    suv(b, g, R);

    // left foreground: case with stickers, the double cup, spent casings
    fcase(b, 330, 860, 200, 110, R, { stickers: 4, rim: 'rgba(255,36,72,0.6)' });
    cup(b, 250, 1000, 130, R);
    for (let i = 0; i < 6; i++) casing(b, 330 + R() * 220, 1000 + R() * 50, 9, R() * 6.28);

    // lights: tubes (core in base, bloom in glow) + the unicorn sign
    const tubes = [
      [1080, 92, 1268, 44, GRN, 11], [1250, 246, 1330, 258, RED, 7], [1800, 14, 1910, -14, RED, 9],
      [1905, 360, 1905, 470, RED, 8], [0, 386, 70, 392, GRN, 7], [160, 372, 290, 380, GRN, 6],
      [1500, 520, 1560, 524, RED, 5], [1310, 600, 1350, 604, GRN, 4], [420, 120, 640, 150, GRN, 9],
      [700, 214, 840, 226, GRN, 6], [1380, 332, 1436, 338, RED, 4], [1712, 170, 1712, 300, RED, 6], [1170, 300, 1215, 296, GRN, 4],
    ];
    for (const t of tubes) tube(b, g, t[0], t[1], t[2], t[3], t[4], t[5]);
    // unlit glass of the sign in the base, the lit tubing in its own flickering layer
    unicorn(b, 1440, 150, 1.06, '#3a0c14');
    unicorn(u, 1440, 150, 1.06, '#ff2a52', '#ffd6de');
    u.save(); u.globalCompositeOperation = 'lighter'; blur(u, 26); unicorn(u, 1440, 150, 1.06, 'rgba(255,36,72,0.9)'); blur(u, 0); u.restore();
    radial(u, 1600, 370, 360, '#ff2448', 0.22);
    streak(u, 1560, 790, 160, 280, '#ff2448', 0.45);
    streak(u, 1660, 800, 80, 240, '#ff7a90', 0.35);
    // ambient pools
    radial(g, 1170, 70, 520, '#9cff35', 0.16);
    radial(g, 1700, 300, 600, '#ff2448', 0.12);
    radial(g, 60, 420, 360, '#9cff35', 0.14);
    streak(g, 1170, 860, 260, 260, '#9cff35', 0.18);
    streak(g, 1530, 770, 120, 160, '#ff2448', 0.35);

    // floor reflection of every light (mirrored about the far floor line, softened)
    const rf = cv(VW / 2, VH / 2), rx = rf.getContext('2d');
    rx.save(); blur(rx, 6); rx.translate(0, FLOOR / 2); rx.scale(1, -0.75); rx.translate(0, -FLOOR / 2); rx.drawImage(glow, 0, 0); rx.drawImage(uni, 0, 0); rx.restore();
    b.save(); b.globalCompositeOperation = 'lighter'; b.globalAlpha = 0.75;
    b.beginPath(); b.rect(0, FLOOR, VW, VH - FLOOR); b.clip(); b.drawImage(rf, 0, 0, VW, VH); b.restore();
    // puddle glints: short horizontal highlights catching the neon
    b.save(); b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const gx0 = R() * VW, gy0 = FLOOR + 20 + R() * (VH - FLOOR - 30), gw = 20 + R() * 90;
      b.fillStyle = gx0 > 1150 ? `rgba(255,60,90,${0.06 + R() * 0.12})` : gx0 < 700 ? `rgba(156,255,53,${0.04 + R() * 0.08})` : `rgba(220,230,255,${0.04 + R() * 0.08})`;
      b.fillRect(gx0, gy0, gw, 1 + R() * 2);
    }
    b.restore();
    // static smoke banks
    b.save(); blur(b, 40);
    for (let i = 0; i < 18; i++) { b.fillStyle = i % 3 === 1 ? 'rgba(40,52,34,0.18)' : i % 3 ? 'rgba(90,22,34,0.2)' : 'rgba(60,56,60,0.16)'; b.beginPath(); b.ellipse(1100 + R() * 820, 600 + R() * 260, 120 + R() * 160, 40 + R() * 60, 0, 0, Math.PI * 2); b.fill(); }
    blur(b, 0); b.restore();

    return { base, glow, uni, floor: FLOOR, hero: { x: 0.59, y: 0.93, h: 0.71 } };
  }

  // ---------------------------------------------------------------- YARD: graffiti wall + red-lit lot (shop, collection...)
  function buildYard() {
    const R = rng(4404);
    const base = cv(VW, VH), b = base.getContext('2d');
    const glow = cv(VW / 2, VH / 2), g = glow.getContext('2d'); g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const FLOOR = 690;
    b.fillStyle = '#060706'; b.fillRect(0, 0, VW, VH);
    // red sky through the big opening, skyline, haze
    let gr = b.createLinearGradient(0, 0, 0, FLOOR);
    gr.addColorStop(0, '#22050b'); gr.addColorStop(0.55, '#5c0a18'); gr.addColorStop(1, '#a01226');
    b.fillStyle = gr; b.fillRect(1060, 0, 860, FLOOR);
    radial(b, 1500, 420, 520, '#ff2448', 0.35);
    for (let i = 0; i < 16; i++) {
      const bx = 1060 + i * 58 + R() * 20, bw = 40 + R() * 60, bh = 80 + R() * 220;
      b.fillStyle = '#16040a'; b.fillRect(bx, FLOOR - bh, bw, bh);
      for (let k = 0; k < 8; k++) if (R() < 0.5) { b.fillStyle = R() < 0.7 ? 'rgba(255,90,110,0.5)' : 'rgba(255,200,140,0.5)'; b.fillRect(bx + 4 + R() * (bw - 10), FLOOR - bh + 8 + R() * (bh - 20), 3, 4); }
    }
    // chain-link fence
    b.save(); b.beginPath(); b.rect(1430, 210, 490, FLOOR - 210); b.clip();
    b.strokeStyle = 'rgba(8,2,4,0.75)'; b.lineWidth = 2;
    for (let i = -600; i < 600; i += 22) { line(b, 1430 + i, 210, 1430 + i + 480, FLOOR); line(b, 1430 + i + 480, 210, 1430 + i, FLOOR); }
    b.restore();
    b.fillStyle = '#0b0204'; for (const px0 of [1430, 1590, 1750, 1910]) b.fillRect(px0 - 5, 190, 10, FLOOR - 190);
    b.fillRect(1430, 200, 490, 8);
    // stairs + rail on the left of the lot
    b.strokeStyle = '#0d0306'; b.lineWidth = 7; line(b, 1110, FLOOR - 20, 1420, 380); line(b, 1110, FLOOR - 70, 1420, 330);
    for (let i = 0; i < 12; i++) { const t = i / 11; line(b, 1110 + t * 310, FLOOR - 20 - t * 290, 1110 + t * 310, FLOOR - 70 - t * 290); }
    b.save(); blur(b, 50); for (let i = 0; i < 10; i++) { b.fillStyle = 'rgba(255,60,90,0.12)'; b.beginPath(); b.ellipse(1100 + R() * 820, 500 + R() * 200, 200, 70, 0, 0, Math.PI * 2); b.fill(); } blur(b, 0); b.restore();
    // concrete wall (left) with graffiti
    gr = b.createLinearGradient(0, 0, 1060, 0); gr.addColorStop(0, '#121511'); gr.addColorStop(1, '#0a0b0a');
    b.fillStyle = gr; b.fillRect(0, 0, 1060, FLOOR);
    for (let y = 40; y < FLOOR; y += 60) { b.fillStyle = '#070807'; b.fillRect(0, y, 1060, 3); }
    grime(b, 0, 0, 1060, FLOOR, R, 5200, ['#1b1f1a', '#050505', '#232822', '#0d0f0d']);
    stains(b, 0, 0, 1060, FLOOR, R, 40);
    sprayCrown(b, 120, 140, 70, GRN, R, 0.9);
    sprayCrown(b, 960, 220, 42, GRN, R, 0.7);
    scribble(b, 420, 300, 120, GRN, R, 0.35);
    scribble(b, 700, 140, 90, '#dfe3dc', R, 0.2);
    scribble(b, 300, 520, 100, RED, R, 0.25);
    radial(b, 120, 160, 360, '#9cff35', 0.12);
    // column between wall and the lot
    pillar(b, 1000, 90, 0, FLOOR + 10, R, { lit: '#1a2216', rimR: 'rgba(255,36,72,0.6)' });
    // floor
    gr = b.createLinearGradient(0, FLOOR, 0, VH); gr.addColorStop(0, '#0f0b0c'); gr.addColorStop(1, '#040404');
    b.fillStyle = gr; b.fillRect(0, FLOOR, VW, VH - FLOOR);
    grime(b, 0, FLOOR, VW, VH - FLOOR, R, 2400, ['#151315', '#020202', '#1d1a1c']);
    // lights
    tube(b, g, 940, 0, 940, 320, GRN, 9);
    tube(b, g, 40, 40, 40, 260, GRN, 7);
    radial(g, 1500, 420, 700, '#ff2448', 0.22);
    radial(g, 160, 200, 520, '#9cff35', 0.16);
    streak(g, 1500, FLOOR + 10, 700, 380, '#ff2448', 0.35);
    streak(g, 940, FLOOR + 10, 160, 300, '#9cff35', 0.3);
    streak(g, 160, FLOOR + 10, 300, 300, '#9cff35', 0.18);
    return { base, glow, uni: null, floor: FLOOR };
  }

  // ---------------------------------------------------------------- shared animated layers
  function buildFog() {
    const R = rng(77);
    const c = cv(VW, 420), x = c.getContext('2d');
    blur(x, 36);
    for (let i = 0; i < 26; i++) {
      const cx = R() * VW, cy = 120 + R() * 200;
      for (const ox of [-VW, 0, VW]) { x.fillStyle = `rgba(150,156,150,${0.05 + R() * 0.07})`; x.beginPath(); x.ellipse(cx + ox, cy, 160 + R() * 220, 40 + R() * 50, 0, 0, Math.PI * 2); x.fill(); }
    }
    blur(x, 0);
    return c;
  }
  function dimmed(src) {
    const c = cv(VW / 2, VH / 2), x = c.getContext('2d');
    blur(x, 5); x.drawImage(src.base, 0, 0, VW / 2, VH / 2);
    x.globalCompositeOperation = 'lighter'; x.drawImage(src.glow, 0, 0); if (src.uni) x.drawImage(src.uni, 0, 0);
    blur(x, 0); x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(4,4,5,0.55)'; x.fillRect(0, 0, VW / 2, VH / 2);
    return c;
  }
  // props that sit in front of the character select panels
  function buildCharsFg() {
    const R = rng(3131);
    const c = cv(VW, VH), b = c.getContext('2d'), g = b;
    tube(b, g, 0, 262, 110, 262, RED, 7);
    tube(b, g, 0, 298, 80, 300, RED, 5);
    tube(b, g, 1700, 70, 1740, 160, RED, 6);
    tube(b, g, 1480, 6, 1640, 30, GRN, 7);
    fcase(b, -20, 720, 300, 170, R, { stickers: 3, rim: 'rgba(156,255,53,0.55)' });
    fcase(b, -40, 880, 360, 220, R, { crown: true, rim: 'rgba(255,36,72,0.5)' });
    cup(b, 360, 1030, 140, R);
    for (let i = 0; i < 7; i++) casing(b, 300 + R() * 300, 1040 + R() * 30, 10, R() * 6.28);
    cash(b, 1700, 1010, 150, 110, R);
    cash(b, 1790, 1060, 150, 110, R);
    cash(b, 1600, 1065, 140, 100, R);
    return c;
  }

  // ---------------------------------------------------------------- hero art
  // Priority: hand-made high-res render (RS.HERO_ART, rim light already painted in) > the animation sheet's
  // idle frame > the procedural portrait. Pixel sources get integer scaling + green/red pixel rims.
  const artCache = {}, hdArt = {};
  function loadArt() {
    return Promise.all(Object.entries(RS.HERO_ART || {}).map(([id, d]) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const c = cv(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0);
        hdArt[id] = { img: c, fx: d.fx * c.width / d.w, fy: d.fy * c.height / d.h };
        res();
      };
      im.onerror = () => res();
      im.src = d.src;
    })));
  }
  function scaled(src, s) { const c = cv(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s))); const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(src, 0, 0, c.width, c.height); return c; }
  function heroArt(id, cos, f) {
    const sh = RS.Sprites.heroSheets && RS.Sprites.heroSheets[id];
    let key, img, fx, fy, hd = false;
    if (hdArt[id]) { key = id + '|hd'; img = hdArt[id].img; fx = hdArt[id].fx; fy = hdArt[id].fy; hd = true; }
    else if (sh && sh.idle_down) { const fr = sh.idle_down[0]; key = id + '|sheet'; img = fr.img; fx = fr.fx; fy = fr.fy; }
    else {
      const P = RS.Portraits.get(id, cos), i = f % 4;
      key = id + '|' + (cos.mask || '') + '|' + (cos.chain || '') + '|' + i; img = P.frames[i]; fx = P.w / 2; fy = P.h;
    }
    if (artCache[key]) return artCache[key];
    const S = RS.Sprites;
    // soft aura (green spilling left, red spilling right), built small and blurred, drawn scaled up
    const as = hd ? Math.min(1, 160 / img.height) : 1, small = hd ? scaled(img, as) : img;
    const pad = 14, au = cv(small.width + pad * 2, small.height + pad * 2), ax = au.getContext('2d');
    blur(ax, 4);
    ax.globalAlpha = 0.9; ax.drawImage(S.silhouette(small, GRN), pad - 3, pad - 1);
    ax.globalAlpha = 0.75; ax.drawImage(S.silhouette(small, RED), pad + 3, pad);
    blur(ax, 0);
    const art = { img, hd, white: S.silhouette(hd ? scaled(img, 0.5) : img, '#ffffff'), aura: au, pad: pad / as, w: img.width, h: img.height, fx, fy };
    if (!hd) { art.g = S.silhouette(img, GRN); art.r = S.silhouette(img, RED); }
    return (artCache[key] = art);
  }
  // targetH = on-screen height of the whole sprite
  function drawHero(ctx, art, cx, footY, targetH, pulse, flash) {
    const k = art.hd ? targetH / art.h : Math.max(2, Math.round(targetH / art.h));
    const w = art.w * k, h = art.h * k, x = Math.round(cx - art.fx * k), y = Math.round(footY - art.fy * k);
    ctx.save();
    // contact shadow + wet reflection
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.ellipse(cx, footY, w * 0.5, h * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = art.hd;
    ctx.save(); ctx.translate(0, footY * 2); ctx.scale(1, -1); ctx.globalAlpha = 0.16; ctx.drawImage(art.img, x, y, w, h); ctx.restore();
    // aura (smooth), then the pixel rims (a hand-made render already has its rim light painted in)
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (art.hd ? 0.22 : 0.32) + pulse * 0.25;
    ctx.drawImage(art.aura, x - art.pad * k, y - art.pad * k, w + art.pad * k * 2, h + art.pad * k * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = art.hd;
    if (!art.hd) {
      ctx.globalAlpha = 1; ctx.drawImage(art.g, x - k, y - k * 0.5, w, h);
      ctx.globalAlpha = 0.9; ctx.drawImage(art.r, x + k, y, w, h);
    }
    ctx.globalAlpha = 1; ctx.drawImage(art.img, x, y, w, h);
    if (flash > 0) { ctx.globalAlpha = Math.min(1, flash); ctx.drawImage(art.white, x, y, w, h); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- runtime
  const Scene = {
    S: {},
    motes: null,
    last: 0,
    get(name) {
      if (!this.S[name]) {
        if (name === 'main') this.S.main = buildMain();
        else if (name === 'yard') this.S.yard = buildYard();
        else if (name === 'chars') { const m = this.get('main'); this.S.chars = { dim: dimmed(m), fg: buildCharsFg() }; }
        else if (name === 'fog') this.S.fog = buildFog();
      }
      return this.S[name];
    },
    // cover-fit the 1920x1080 scene; ax/ay pick which part survives the crop
    map(W, H, ax, ay) { const k = Math.max(W / VW, H / VH); return { k, ox: (W - VW * k) * ax, oy: (H - VH * k) * ay }; },
    layer(ctx, img, m, alpha, add) {
      ctx.globalAlpha = alpha; if (add) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, m.ox, m.oy, VW * m.k, VH * m.k);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    flicker(time) {
      // neon sign: steady buzz with the odd stutter
      const s = Math.sin(time * 1.7) + Math.sin(time * 4.3) * 0.5;
      if (s > 1.38 && Math.sin(time * 41) > 0) return 0.25;
      return 0.86 + Math.sin(time * 60) * 0.04 + Math.sin(time * 2.1) * 0.06;
    },
    fog(ctx, m, time, y, a, speed) {
      const f = this.get('fog'), off = ((time * speed) % VW + VW) % VW;
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen';
      for (const dx of [-off, VW - off]) ctx.drawImage(f, m.ox + dx * m.k, m.oy + y * m.k, VW * m.k, 420 * m.k);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    dust(ctx, m, dt) {
      if (!this.motes) { const R = rng(5); this.motes = Array.from({ length: 70 }, () => ({ x: R() * VW, y: R() * VH, vx: (R() - 0.5) * 8, vy: -4 - R() * 10, s: 1 + R() * 2.4, p: R() * 6.28 })); }
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this.motes) {
        d.x += d.vx * dt; d.y += d.vy * dt; d.p += dt;
        if (d.y < -10) { d.y = VH + 10; d.x = Math.random() * VW; }
        const a = 0.18 + Math.sin(d.p * 1.3) * 0.12;
        ctx.fillStyle = d.x < VW * 0.55 ? `rgba(190,255,140,${a})` : `rgba(255,120,140,${a})`;
        const s = d.s * m.k;
        ctx.fillRect(m.ox + d.x * m.k, m.oy + d.y * m.k, s, s);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    beams(ctx, m, time) {
      ctx.save(); ctx.setTransform(m.k, 0, 0, m.k, m.ox, m.oy); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sx = 1540 + i * 50, sy = 700, a = -Math.PI / 2 + Math.sin(time * (0.35 + i * 0.13) + i * 2) * 0.55, len = 760, sp = 0.05;
        const gr = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        gr.addColorStop(0, i === 1 ? 'rgba(156,255,53,0.16)' : 'rgba(255,36,72,0.18)'); gr.addColorStop(1, 'rgba(255,36,72,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a - sp) * len, sy + Math.sin(a - sp) * len); ctx.lineTo(sx + Math.cos(a + sp) * len, sy + Math.sin(a + sp) * len); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    heli(ctx, m, time) {
      const cx = 1330 + Math.sin(time * 0.3) * 40, cy = 190 + Math.sin(time * 1.1) * 8, tilt = Math.sin(time * 0.3 + 1.2) * 0.05;
      ctx.save(); ctx.setTransform(m.k, 0, 0, m.k, m.ox, m.oy);
      // searchlight sweeping the lot
      const a = Math.PI / 2 + 0.35 + Math.sin(time * 0.45) * 0.4, len = 900;
      const gr = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,230,235,0.22)'); gr.addColorStop(1, 'rgba(255,120,140,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(cx - 10, cy + 20);
      ctx.lineTo(cx + Math.cos(a - 0.09) * len, cy + Math.sin(a - 0.09) * len); ctx.lineTo(cx + Math.cos(a + 0.09) * len, cy + Math.sin(a + 0.09) * len); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(cx, cy); ctx.rotate(tilt); ctx.fillStyle = '#0a0204';
      ctx.beginPath(); ctx.ellipse(-20, 0, 74, 40, 0, 0, Math.PI * 2); ctx.fill();             // cabin
      ctx.fillRect(40, -12, 150, 16); fillPoly(ctx, [180, -14, 200, -48, 212, -48, 196, 4], '#0a0204'); // boom + fin
      ctx.fillRect(-60, 46, 130, 5); ctx.fillRect(-40, 34, 5, 14); ctx.fillRect(30, 34, 5, 14);       // skids
      ctx.fillRect(-26, -48, 12, 10);
      ctx.globalAlpha = 0.5; ctx.fillRect(-170, -50, 300, 3); ctx.globalAlpha = 1;               // rotor blur
      ctx.globalAlpha = 0.4 + Math.abs(Math.sin(time * 18)) * 0.4; ctx.fillRect(-150 + (time * 900 % 260), -51, 40, 5); ctx.globalAlpha = 1;
      if (Math.sin(time * 5) > 0.6) { ctx.globalCompositeOperation = 'lighter'; radial(ctx, 206, -48, 16, '#ff2448', 0.9); }
      ctx.restore();
    },
    // full-screen backdrop for the current menu
    draw(ctx, W, H, time, pulse, mode, hero) {
      const dt = Math.min(0.05, Math.max(0, time - (this.last || time))); this.last = time;
      ctx.imageSmoothingEnabled = true;
      if (mode === 'chars') {
        const C = this.get('chars'), m = this.map(W, H, 0.5, 0.5);
        ctx.drawImage(C.dim, m.ox, m.oy, VW * m.k, VH * m.k);
        this.fog(ctx, m, time, 640, 0.35, 10);
        ctx.drawImage(C.fg, m.ox, m.oy, VW * m.k, VH * m.k);
        this.dust(ctx, m, dt);
        return m;
      }
      if (mode === 'yard') {
        const Y = this.get('yard'), m = this.map(W, H, 0.5, 0.6);
        this.layer(ctx, Y.base, m, 1);
        this.layer(ctx, Y.glow, m, 0.85 + pulse * 0.15, true);
        this.heli(ctx, m, time);
        this.fog(ctx, m, time, 560, 0.4, 14);
        this.dust(ctx, m, dt);
        return m;
      }
      const M = this.get('main'), m = this.map(W, H, 0.6, 0.85);
      this.layer(ctx, M.base, m, 1);
      this.layer(ctx, M.glow, m, 0.8 + pulse * 0.2, true);
      this.layer(ctx, M.uni, m, this.flicker(time), true);
      this.beams(ctx, m, time);
      this.fog(ctx, m, time, 300, 0.18, 6);
      if (hero) {
        const fw = Math.min(W, H * 16 / 9), fh = fw * 9 / 16, fx = (W - fw) / 2, fy = (H - fh) / 2;
        const art = heroArt(hero.id, hero.cos, Math.floor(time * 3.2));
        drawHero(ctx, art, fx + fw * M.hero.x, fy + fh * M.hero.y, fh * M.hero.h, pulse, 0);
      }
      this.fog(ctx, m, time, 640, 0.32, 16);
      this.dust(ctx, m, dt);
      return m;
    },
    // character-select stage: a crop of the deck with the hero in the middle
    drawStage(c, id, cos, time, pulse, flash) {
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      const M = this.get('main');
      // crop around the crowd + unicorn so the stage reads as the same club
      const sx = 760, sy = 120, sw = 1160, sh = 960;
      const k = Math.max(W / sw, H / sh), ox = (W - sw * k) / 2 - sx * k, oy = (H - sh * k) - sy * k;
      const m = { k, ox, oy };
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
      this.layer(ctx, M.base, m, 1);
      this.layer(ctx, M.glow, m, 0.8 + pulse * 0.2, true);
      this.layer(ctx, M.uni, m, this.flicker(time), true);
      this.beams(ctx, m, time);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
      const art = heroArt(id, cos, Math.floor(time * 3.2));
      // feet stay clear of the SELECT button at the bottom of the stage
      drawHero(ctx, art, W * 0.5, H * 0.865, H * (art.hd ? 0.8 : 0.74), pulse, flash);
      this.fog(ctx, m, time, 640, 0.3, 16);
      const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    heroArt, drawHero, loadArt,
    cup, // the double cup painter (the run intro's drink photo)
  };

  RS.Scene = Scene;
})(window.RS);
