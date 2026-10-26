'use strict';
// In-run HUD drawn on its own full-resolution canvas (screen space), plus damage numbers and
// world labels projected from the camera so every piece of type stays sharp.
// Layout follows a classic open-world arcade HUD: portrait + stat panel and weapon slots top-left,
// timer and kill counter top-centre, money top-right, a round street minimap bottom-right.
(function (RS) {
  const U = RS.U, FX = RS.FX, I = RS.Icons, D = RS.Data, TAU = Math.PI * 2;
  // arcade theme: pixel fonts (Silkscreen for small print and numbers, Jersey 10 for the big display type)
  const MONO = '"Silkscreen", ui-monospace, Consolas, monospace';
  const DISP = '"Jersey 10", "Bebas Neue", Impact, "Arial Narrow", sans-serif';
  const C = {
    green: '#9cff35', money: '#8dff3c', red: '#ff2448', hp: '#e8223e', hpHi: '#ff5c72', text: '#f2f3ef', muted: '#9a9f98',
    line: '#2c302c', panel: 'rgba(8,10,9,0.76)', slot: 'rgba(10,12,11,0.84)', gold: '#ffd23f', armor: '#eef0ec', bg: 'rgba(6,7,6,0.82)',
  };
  C.muted = '#b8bdb5'; // secondary HUD text: light grey, never mid grey on the dark ground
  // soft dark band behind free-floating HUD text (streak, banners, hints): fades out at the ends instead of a hard box
  function plate(ctx, x, y, w, h, align) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    if (align === 'center') { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.2, 'rgba(0,0,0,0.62)'); g.addColorStop(0.8, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.7, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }

  function bar(ctx, x, y, w, h, k, col, bg) {
    ctx.fillStyle = bg || 'rgba(20,22,20,0.9)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * U.clamp(k, 0, 1)), h);
  }
  // arcade theme: every HUD frame is square (the radius argument is kept by the call sites)
  function rr(ctx, x, y, w, h) {
    ctx.beginPath(); ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // dark glassy panel with a hairline rim and a soft drop shadow
  function panel(ctx, x, y, w, h, r, stroke, lw) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, x + 2, y + 3, w, h, r); ctx.fill();
    ctx.fillStyle = C.panel; rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = stroke || 'rgba(255,255,255,0.09)'; ctx.lineWidth = lw || 1; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  }
  // Outlined HUD type is rendered once per (text, font, colour) into a small bitmap and then drawn with a single
  // drawImage: the 2-3 stroke/fill passes per label every frame were most of the HUD's cost. The cache is dropped
  // when it grows large (damage numbers churn) and when web fonts finish loading (no fallback glyphs kept).
  const STAMPS = new Map();
  let stampX = null;
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => STAMPS.clear());
  // font: canvas font string; lw: outline width; dx/dy: offset of an extra outline-only drop copy (0 = none)
  function stamp(ctx, str, x, y, font, track, lw, dx, dy, edge, join, col, align) {
    const key = font + '|' + track + '|' + lw + '|' + dx + '|' + dy + '|' + edge + '|' + join + '|' + col + '|' + str;
    let e = STAMPS.get(key);
    if (!e) {
      if (STAMPS.size > 700) STAMPS.clear();
      if (!stampX) stampX = RS.Sprites.cv(1, 1).getContext('2d');
      let x2 = stampX;
      const setup = () => {
        x2.font = font; x2.textAlign = 'left'; x2.textBaseline = 'middle';
        if ('letterSpacing' in x2) x2.letterSpacing = track + 'px';
      };
      setup();
      const m = x2.measureText(str), pad = Math.ceil(lw) + 2;
      const l = Math.ceil(m.actualBoundingBoxLeft || 0), r = Math.ceil(m.actualBoundingBoxRight || m.width);
      const asc = Math.ceil(m.actualBoundingBoxAscent || 0), desc = Math.ceil(m.actualBoundingBoxDescent || 0);
      const c = RS.Sprites.cv(Math.max(1, l + r + pad * 2 + dx), Math.max(1, asc + desc + pad * 2 + dy));
      x2 = c.getContext('2d'); setup();
      const ox = pad + l, oy = pad + asc;
      x2.lineJoin = join; x2.miterLimit = 2; x2.lineWidth = lw; x2.strokeStyle = edge;
      if (dx || dy) x2.strokeText(str, ox + dx, oy + dy);
      x2.strokeText(str, ox, oy);
      x2.fillStyle = col; x2.fillText(str, ox, oy);
      e = { c, w: m.width, ox, oy };
      STAMPS.set(key, e);
    }
    const x0 = align === 'right' ? x - e.w : align === 'center' ? x - e.w / 2 : x;
    ctx.drawImage(e.c, Math.round(x0 - e.ox), Math.round(y - e.oy));
    return e.w;
  }
  // text with a dark square pixel outline so it reads over any background
  function text(ctx, s, x, y, size, col, align, font, weight, track) {
    return stamp(ctx, String(s), x, y, (weight || 500) + ' ' + Math.round(size) + 'px ' + (font || MONO), Math.round(track || 0), Math.max(2, size / 4.5), 0, 0, '#000', 'miter', col, align || 'left');
  }
  const disp = (ctx, s, x, y, size, col, align, track) => text(ctx, s, x, y, size, col, align, DISP, 400, track === undefined ? size * 0.04 : track);
  // heavy arcade type: thick black outline + drop shadow, returns the advance width
  function big(ctx, s, x, y, size, col, align, track) { // square outline + a hard offset drop, like an arcade title
    return stamp(ctx, String(s), x, y, '400 ' + Math.round(size) + 'px ' + DISP, Math.round(track === undefined ? size * 0.03 : track),
      Math.max(3, size * 0.16), Math.round(size * 0.05), Math.round(size * 0.07), '#000', 'miter', col, align || 'left');
  }
  const measure = (ctx, s, size, track) => {
    ctx.font = '400 ' + Math.round(size) + 'px ' + DISP;
    if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(track === undefined ? size * 0.03 : track) + 'px';
    const w = ctx.measureText(s).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return w;
  };
  // glossy bar: base, fill with a lighter top band, black rim
  function gbar(ctx, x, y, w, h, k, col, hi, bg) {
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = bg || 'rgba(40,10,16,0.95)'; ctx.fillRect(x, y, w, h);
    const fw = Math.round(w * U.clamp(k, 0, 1));
    ctx.fillStyle = col; ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = hi; ctx.fillRect(x, y, fw, Math.max(1, Math.round(h * 0.32)));
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, y + h - Math.max(1, Math.round(h * 0.25)), fw, Math.max(1, Math.round(h * 0.25)));
  }
  // segmented meter (dash, ability)
  function segBar(ctx, x, y, w, h, n, k, col, off) {
    const g = Math.max(2, Math.round(h * 0.6)), sw = (w - g * (n - 1)) / n, lit = k * n;
    for (let i = 0; i < n; i++) {
      const sx = Math.round(x + i * (sw + g));
      ctx.fillStyle = '#000'; ctx.fillRect(sx - 1, y - 1, Math.round(sw) + 2, h + 2);
      ctx.fillStyle = off; ctx.fillRect(sx, y, Math.round(sw), h);
      const f = U.clamp(lit - i, 0, 1);
      if (f > 0) { ctx.fillStyle = col; ctx.fillRect(sx, y, Math.round(sw * f), h); }
    }
  }
  // inventory slot: rounded box, green number tag, centred sprite icon
  function slot(ctx, x, y, w, h, s, o) {
    const r = Math.round(7 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, x + 2, y + 3, w, h, r); ctx.fill();
    ctx.fillStyle = o.id ? C.slot : 'rgba(10,12,11,0.5)'; rr(ctx, x, y, w, h, r); ctx.fill();
    const edge = o.evo ? C.red : o.sel ? C.green : o.tag || (o.id ? '#3a3f3a' : '#232623');
    ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.5, (o.sel || o.evo ? 2.6 : 1.6) * s); rr(ctx, x + 1, y + 1, w - 2, h - 2, r); ctx.stroke();
    if (o.sel) { ctx.strokeStyle = 'rgba(156,255,53,0.18)'; ctx.lineWidth = 5 * s; rr(ctx, x - 2 * s, y - 2 * s, w + 4 * s, h + 4 * s, r + 2 * s); ctx.stroke(); }
    if (o.id) {
      const img = I.get(o.id), isz = Math.round(Math.min(h * 0.72, w * 0.72));
      ctx.imageSmoothingEnabled = false;
      const ix = o.iconLeft ? x + Math.round(8 * s) : Math.round(x + (w - isz) / 2), iy = Math.round(y + (h - isz) / 2 - (o.wide ? 0 : 2 * s));
      ctx.drawImage(img, ix, iy, isz, isz);
    }
    if (o.reload !== undefined && o.id) { // fire-rate ring as a thin strip along the bottom edge
      const bw = w - 14 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x + 7 * s, y + h - 6 * s, bw, 2.5 * s);
      ctx.fillStyle = o.reload >= 0.999 ? C.green : '#cfd3cc'; ctx.fillRect(x + 7 * s, y + h - 6 * s, bw * o.reload, 2.5 * s);
    }
    if (o.num) { // number tag in the top-left corner
      const t = Math.round(17 * s);
      ctx.fillStyle = o.id ? C.green : '#2a2e2a'; rr(ctx, x - 3 * s, y - 3 * s, t, t, 3 * s); ctx.fill();
      ctx.font = '400 ' + Math.round(15 * s) + 'px ' + DISP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = o.id ? '#0a0c0a' : '#7c817b'; ctx.fillText(o.num, x - 3 * s + t / 2, y - 3 * s + t / 2 + 1 * s);
    }
    if (o.label) big(ctx, o.label, x + w - 6 * s, y + h - (o.wide ? 15 : 13) * s, (o.wide ? 21 : 17) * s, o.evo ? C.red : C.text, 'right', 0.5 * s);
    if (o.ready && Math.floor(o.t * 3) % 2) { // evolution ready: blinking green corner
      ctx.fillStyle = C.green;
      ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w - w * 0.3, y + h); ctx.lineTo(x + w, y + h - w * 0.3); ctx.fill();
    }
  }

  const HUD = {
    HUD_K: 0.84,
    draw(ctx, G, W, H, dt) {
      // HUD_K shrinks every panel; the base keeps it resolution independent
      const p = G.p, s = Math.max(0.6, Math.min(2.4, Math.min(W / 1400, H / 800))) * this.HUD_K;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // world-anchored text first so the HUD panels sit on top of it
      this.worldText(ctx, G, W, H, s);
      this.hitArcs(ctx, G, W, H, s);

      const pad = Math.round(22 * s);
      const bottom = this.playerBlock(ctx, G, p, pad, pad, s);
      this.centre(ctx, G, W, pad, s);
      this.rightColumn(ctx, G, p, W, pad, s);
      this.minimap(ctx, G, W, H, s);
      this.arrows(ctx, G, W, H, s);
      this.banners(ctx, G, W, H, s);
      // panel areas (used next frame to keep damage numbers off them): [cx, cy, radius] or [0, 0, 0, x0, x1, y0, y1]
      const mR = this.MINI_R * s, wide = G.bosses.length ? 260 : 150;
      this.panelZones = [
        [0, 0, 0, 0, pad + 520 * s, 0, bottom + 64 * s],
        [0, 0, 0, W / 2 - wide * s, W / 2 + wide * s, 0, 150 * s],
        [0, 0, 0, W - 300 * s, W, 0, 120 * s],
        [W - mR - 26 * s, H - mR - 30 * s, mR + 14 * s],
      ];
      // streak / momentum under the slots, like a wanted-level readout
      let ly = bottom + 26 * s;
      const rows = (p.streak >= 3 ? 30 : 0) + (p.momentumT > 0 && p.id === 'twizzy' ? 22 : 0) + (p.highGround ? 22 : 0);
      if (rows) plate(ctx, 0, ly - 20 * s, pad + 300 * s, (rows + 14) * s, 'left');
      if (p.streak >= 3) {
        const w1 = big(ctx, 'STREAK', pad, ly, 34 * s, C.green, 'left');
        big(ctx, ' x' + p.streak, pad + w1, ly, 34 * s, C.red, 'left');
        ly += 30 * s;
      }
      if (p.momentumT > 0 && p.id === 'twizzy') { big(ctx, 'MOMENTUM ' + p.momentumT.toFixed(1) + 'S', pad, ly, 19 * s, C.text, 'left'); ly += 22 * s; }
      if (p.highGround) { big(ctx, 'HIGH GROUND +15%', pad, ly, 19 * s, '#ffe14a', 'left'); ly += 22 * s; }
      // controls hint during the first seconds
      if (G.time < 12) {
        ctx.globalAlpha = Math.min(1, (12 - G.time) / 2);
        plate(ctx, W / 2 - 520 * s, H - 52 * s, 1040 * s, 36 * s, 'center');
        big(ctx, 'WASD / ARROWS  MOVE    ·    SPACE  DASH    ·    F  ABILITY    ·    ESC  PAUSE', W / 2, H - 34 * s, 18 * s, C.text, 'center', 1 * s);
        ctx.globalAlpha = 1;
      }
    },

    // ---------------------------------------------------------------- top-left: portrait, stats, slots
    playerBlock(ctx, G, p, x0, y0, s) {
      const t = G.time;
      // portrait card
      const pw = Math.round(64 * s), ph = Math.round(88 * s), r = Math.round(8 * s);
      panel(ctx, x0, y0, pw, ph, r, C.green, 2.6 * s);
      const P = RS.Portraits.get(p.id, p.cos || {});
      ctx.save(); rr(ctx, x0 + 3 * s, y0 + 3 * s, pw - 6 * s, ph - 6 * s, r - 2 * s); ctx.clip();
      const g = ctx.createRadialGradient(x0 + pw / 2, y0 + ph * 0.45, 2, x0 + pw / 2, y0 + ph * 0.45, ph * 0.7);
      g.addColorStop(0, '#26331d'); g.addColorStop(1, '#080a08');
      ctx.fillStyle = g; ctx.fillRect(x0, y0, pw, ph);
      const SH = RS.Sprites.heroSheets[p.id];
      if (SH) { // hand-drawn hero: front idle frame, cropped to head and puffer
        const f = SH.idle_down[0].img, cw = f.width, kk = (pw - 6 * s) / (cw * 0.9);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(f, cw * 0.05, 0, cw * 0.9, f.height * 0.72, x0 + 3 * s, y0 + 6 * s, cw * 0.9 * kk, f.height * 0.72 * kk);
      } else {
        const k = (pw - 6 * s) / 40; // crop the 48px-wide portrait to head and shoulders
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(P.frames[Math.floor(t * 2) % 2 ? 0 : 0], 4, 0, 40, 58, x0 + 3 * s, y0 + 4 * s, 40 * k, 58 * k);
      }
      if (p.hurtFlash > 0) { ctx.globalAlpha = Math.min(1, p.hurtFlash * 4); ctx.fillStyle = 'rgba(255,36,72,0.45)'; ctx.fillRect(x0, y0, pw, ph); ctx.globalAlpha = 1; }
      ctx.restore();
      this.abilityBadge(ctx, G, p, x0 + pw - 4 * s, y0 + ph - 4 * s, s);

      // stat panel: level, health, armor, dash, xp
      const sx = x0 + pw + Math.round(9 * s), sw = Math.round(272 * s), sh = Math.round(64 * s);
      panel(ctx, sx, y0, sw, sh, r);
      const lw = big(ctx, 'LV', sx + 12 * s, y0 + 26 * s, 22 * s, C.text, 'left');
      big(ctx, String(p.level), sx + 15 * s + lw, y0 + 24 * s, 40 * s, C.green, 'left');
      const hx = sx + Math.round(84 * s), hw = sw - Math.round(96 * s), hy = y0 + Math.round(12 * s), hh = Math.round(15 * s);
      // low health: a slow smooth pulse (1.2 Hz) instead of a hard on/off blink
      const hk = p.hp / p.s.maxHp, lowK = hk < 0.3 ? 0.5 + 0.5 * Math.sin(t * 7.5) : 0;
      gbar(ctx, hx, hy, hw, hh, hk, lowK ? U.mixHex(C.hp, '#ff8a9c', lowK) : C.hp, lowK ? U.mixHex(C.hpHi, '#ffd0d8', lowK) : C.hpHi);
      if (hk > 1) { // overheal (CHONK DRIP / GASSED): the HP past max as a gold strip from the left
        const ow = Math.round(hw * U.clamp(hk - 1, 0, 1));
        ctx.fillStyle = C.gold; ctx.fillRect(hx, hy, ow, Math.max(2, Math.round(hh * 0.4)));
      }
      big(ctx, Math.ceil(p.hp) + ' / ' + Math.round(p.s.maxHp), hx + hw - 5 * s, hy + hh / 2 + 1 * s, 17 * s, C.text, 'right', 0.5 * s);
      // armor: white bar from the armor stat, shield charges as bright pips on top
      const ay = hy + hh + Math.round(7 * s), ah = Math.round(6 * s), armor = p.s.armor || 0;
      gbar(ctx, hx, ay, hw, ah, Math.min(1, armor / 10), C.armor, '#ffffff', 'rgba(36,38,36,0.95)');
      for (let i = 0; i < Math.min(8, p.shield); i++) { ctx.fillStyle = '#9fe9ff'; ctx.fillRect(hx + hw - (i + 1) * 12 * s, ay - 1 * s, 9 * s, ah + 2 * s); }
      // dash readiness as a segmented meter
      const dk = p.dash.cd > 0 ? 1 - p.dash.cd / p.s.dashCd : 1;
      big(ctx, 'DASH', sx + 12 * s, y0 + 54 * s, 15 * s, dk >= 1 ? C.text : C.muted, 'left', 1 * s);
      segBar(ctx, hx, y0 + Math.round(49 * s), hw * 0.62, Math.round(7 * s), 8, dk, dk >= 1 ? C.text : '#8d918b', '#262826');
      text(ctx, 'SPACE', hx + hw, y0 + 53 * s, 11 * s, C.muted, 'right', MONO, 600, 1 * s);
      // XP: slim green strip along the bottom edge of the panel
      const xk = p.xp / p.xpNext;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx + 10 * s, y0 + sh - 6 * s, sw - 20 * s, 3 * s);
      ctx.fillStyle = C.green; ctx.fillRect(sx + 10 * s, y0 + sh - 6 * s, (sw - 20 * s) * U.clamp(xk, 0, 1), 3 * s);

      // weapons (3 slots, the 4th from WAVE 15, a 5th with FEATURE SLOT): primary in a wide slot, the rest square, weapon
      // MODS as a gold "+N"; a locked 4th slot shows its wave; the TAPES to their right; passives below as the inventory row
      const wy = y0 + sh + Math.round(10 * s), bw = Math.round(88 * s), bh = Math.round(58 * s), ss = Math.round(48 * s), gap = Math.round(6 * s);
      let x = sx;
      for (let i = 0; i < p.maxWeapons; i++) {
        const w = p.weapons[i];
        const evoReady = !!(w && w.def.evo && !w.def.evolved && w.level >= w.def.max && p.hasPassive(w.def.evoWith));
        const tag = w && w.thumbTag === 'up' ? C.green : w && w.thumbTag === 'down' ? '#ff6a7a' : w && w.temp ? '#ff4f6e' : null;
        const wide = i === 0, ww = wide ? bw : ss, hh2 = wide ? bh : ss, yy = wide ? wy : wy + (bh - ss);
        const reload = w && w.cdMax ? U.clamp(1 - w.t / w.cdMax, 0, 1) : undefined;
        const maxed = w && w.level >= w.def.max;
        slot(ctx, x, yy, ww, hh2, s, {
          id: w ? w.def.id : null, num: String(i + 1), sel: wide && !!w, evo: w && w.def.evolved, tag, ready: evoReady, t,
          label: w ? (w.def.evolved ? 'EVO' : maxed ? 'MAX' : wide ? w.level + ' / ' + w.def.max : String(w.level)) : '', wide, iconLeft: wide, reload,
        });
        if (w && w.mods) big(ctx, '+' + w.mods, x + ww - 5 * s, yy + 9 * s, (wide ? 15 : 13) * s, C.gold, 'right', 0.5 * s);
        x += ww + gap;
      }
      if (!RS.Save.isUnlocked('slots', 'slot4')) { // the next slot, locked until WAVE 15 is cleared
        ctx.globalAlpha = 0.55;
        slot(ctx, x, wy + (bh - ss), ss, ss, s, { id: 'lock', label: 'W' + D.SLOT_WAVE });
        ctx.globalAlpha = 1;
        x += ss + gap;
      }
      const ts = Math.round(34 * s), tx0 = x + Math.round(6 * s), ty = wy + bh - ts;
      for (let i = 0; i < p.maxTapes; i++) {
        const tp = p.tapes[i];
        slot(ctx, tx0 + i * (ts + gap), ty, ts, ts, s, { id: tp ? tp.id : null, tag: tp ? tp.def.col : '#2a2440', label: tp ? (tp.level >= tp.def.max ? 'MAX' : String(tp.level)) : '' });
      }
      if (!p.tapes.length) big(ctx, 'TAPES', tx0 + (p.maxTapes * (ts + gap) - gap) / 2, ty - 7 * s, 11 * s, C.muted, 'center', 0.5 * s);
      const iy = wy + bh + Math.round(8 * s), is = Math.round(34 * s);
      for (let i = 0; i < 6; i++) {
        const it = p.passives[i];
        slot(ctx, sx + i * (is + gap), iy, is, is, s, { id: it ? it.id : null, label: it ? String(it.level) + (it.ghost ? '+' : '') : '' });
      }
      // stash: one small slot per item (rarity-coloured edge, copy count), up to two rows of 10, then "+N"
      const st = p.stashOrder;
      if (!st.length) return iy + is;
      const ks = Math.round(27 * s), kg = Math.round(4 * s), ky0 = iy + is + Math.round(8 * s), per = 10;
      const shown = Math.min(st.length, per * 2 - (st.length > per * 2 ? 1 : 0));
      for (let i = 0; i < shown; i++) {
        const id = st[i], def = D.STASH[id], n = p.stash[id], x = sx + (i % per) * (ks + kg), y = ky0 + Math.floor(i / per) * (ks + kg);
        slot(ctx, x, y, ks, ks, s, { id, tag: D.RARITY[def.rarity].col });
        if (n > 1) big(ctx, 'x' + n, x + ks + 1 * s, y + ks - 4 * s, 12 * s, C.text, 'right', 0.5 * s);
        const h = def.hud && def.hud(p.stashSt[id]); // a live value (STAND STILL, DEMON TIME) across the top of the slot
        if (h) big(ctx, h, x + ks / 2, y + 5 * s, 10 * s, def.col, 'center', 0.5 * s);
      }
      if (shown < st.length) big(ctx, '+' + (st.length - shown), sx + (shown % per) * (ks + kg) + ks / 2, ky0 + (ks + kg) + ks / 2 + 1 * s, 15 * s, C.text, 'center', 0.5 * s);
      return ky0 + Math.ceil(Math.min(st.length, per * 2) / per) * (ks + kg);
    },
    // round ability button on the portrait corner: cooldown sweep, live countdown, pulse when ready
    abilityBadge(ctx, G, p, cx, cy, s) {
      const A = p.char.active, R = 17 * s, t = G.time;
      let k, ready = false, live = p.ability.t > 0;
      if (live) k = p.ability.t / p.ability.max;
      else { k = p.ability.cd > 0 ? 1 - p.ability.cd / (A.cd * p.s.abilityCd) : 1; ready = k >= 1; }
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, R + 3 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = ready ? (Math.floor(t * 3) % 2 ? '#ff2448' : '#c8102e') : live ? '#ff2448' : '#2a0d14'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      if (!ready) { // remaining cooldown / duration as a pie
        ctx.fillStyle = live ? 'rgba(255,214,220,0.55)' : 'rgba(255,36,72,0.75)';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = ready ? '#ffd0d6' : '#5a1a26'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      big(ctx, live ? p.ability.t.toFixed(0) : 'F', cx, cy + 1 * s, 20 * s, '#ffffff', 'center', 0);
    },

    // ---------------------------------------------------------------- top centre: timer, kills, clout, bosses
    centre(ctx, G, W, y0, s) {
      const cx = W / 2;
      big(ctx, U.fmtTime(G.time), cx, y0 + 26 * s, 60 * s, C.text, 'center', 2 * s);
      // wave | kills | clout pill
      const fs = 23 * s, ky = y0 + 70 * s, kt = U.fmtNum(G.stats.kills), ct = U.fmtNum(G.runClout), fin = G.time >= D.RUN_LENGTH;
      const wn = D.waveAt(G.time), wt = fin ? 'FINAL' : wn + '/' + D.WAVES;
      const parts = [['WAVE ', C.text], [wt, fin ? C.red : C.green], ['   |   ', C.muted], ['KILLS ', C.text], [kt, C.green], ['   |   ', C.muted], ['CLOUT ', C.text], [ct, C.green]];
      const ws = parts.map((q) => measure(ctx, q[0], fs));
      const tw = ws.reduce((a, b) => a + b, 0), pw = tw + 30 * s, ph = 32 * s;
      panel(ctx, cx - pw / 2, ky - ph / 2, pw, ph, 7 * s);
      let x = cx - tw / 2;
      parts.forEach((q, i) => { big(ctx, q[0], x, ky + 1 * s, fs, q[1], 'left'); x += ws[i]; });
      let by = ky + 30 * s;
      // the wave call-out: what the new wave holds for its first seconds, then "CLEARED" through the breather
      if (!fin) {
        const into = G.time - (wn - 1) * D.WAVE_LEN, boss = RS.Director.schedule.find((b) => b.t >= (wn - 1) * D.WAVE_LEN && b.t < wn * D.WAVE_LEN);
        let msg = null, col = C.text;
        if (D.waveRest(G.time)) { msg = 'WAVE ' + wn + ' CLEARED'; col = C.green; }
        else if (into < 2.5 && wn > 1) {
          msg = 'WAVE ' + wn + (wn === D.WAVES ? ' · LAST ONE' : boss ? ' · BOSS WAVE' : wn === D.SLOT_WAVE && !RS.Save.isUnlocked('slots', 'slot4') ? ' · CLEAR IT: 4TH WEAPON SLOT' : '');
          col = boss || wn === D.WAVES ? C.red : C.text;
        }
        if (msg) { big(ctx, msg, cx, by + 2 * s, 25 * s, col, 'center', 1.5 * s); by += 32 * s; }
      }
      if (!G.won) {
        const next = RS.Director.schedule.find((b) => !b.spawned);
        if (next && next.t - G.time < 60 && next.t > G.time) { big(ctx, 'BOSS IN ' + Math.ceil(next.t - G.time) + 'S', cx, by, 20 * s, C.red, 'center', 1.5 * s); by += 26 * s; }
      }
      // boss bars
      by += 8 * s;
      for (const b of G.bosses) {
        if (b.spawning > 0) continue;
        const bw = Math.min(W * 0.46, 560 * s);
        big(ctx, b.bdef.name, cx - bw / 2, by, 24 * s, C.text, 'left');
        big(ctx, (b.phase > 1 ? 'PHASE ' + b.phase + '  ·  ' : '') + Math.ceil(b.hp / b.maxHp * 100) + '%', cx + bw / 2, by + 1 * s, 17 * s, C.muted, 'right');
        gbar(ctx, cx - bw / 2, by + 16 * s, bw, Math.round(10 * s), b.hp / b.maxHp, b.shieldUp ? '#ffffff' : C.hp, b.shieldUp ? '#ffffff' : C.hpHi);
        by += 50 * s;
      }
    },

    // ---------------------------------------------------------------- top right: money, rage thumbs, buffs
    rightColumn(ctx, G, p, W, y0, s) {
      const rx = W - Math.round(22 * s);
      const total = Math.max(0, Math.floor((RS.Save.data.clout || 0) + G.runClout));
      big(ctx, '$' + String(total).padStart(7, '0'), rx, y0 + 26 * s, 54 * s, C.money, 'right', 1.5 * s);
      // the big number is the bank plus this run; only this run's CL0UT can be spent at THE PLUG, so it gets its own
      // line (playtest: "I had $100 and could not buy anything" while the run itself held $40)
      big(ctx, 'RUN $' + Math.floor(G.runClout), rx, y0 + 62 * s, 24 * s, C.green, 'right', 1 * s);
      let ry = y0 + 84 * s;
      const MM = G.mapMode;
      if (MM && MM.cash > 1) { big(ctx, MM.name + ' · ' + MM.cash + '× CASH', rx, y0 + 88 * s, 18 * s, MM.col, 'right', 1 * s); ry += 22 * s; }
      const ts = Math.round(40 * s), gap = Math.round(7 * s);
      p.thumbs.forEach((th, i) => {
        const x = rx - (i + 1) * (ts + gap) + gap;
        slot(ctx, x, ry, ts, ts, s, { id: th.id, tag: th.def.col });
        if (th.def.hud) big(ctx, th.def.hud(p, th.st), x + ts / 2, ry + ts + 11 * s, 15 * s, th.def.col, 'center', 0.5 * s);
      });
      if (p.thumbs.length) ry += ts + 30 * s;
      for (const b of p.buffs) {
        const bw = Math.round(176 * s), bh = Math.round(34 * s), bx = rx - bw;
        panel(ctx, bx, ry, bw, bh, 6 * s);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(I.get(b.icon || 'perc'), bx + 5 * s, ry + 4 * s, 26 * s, 26 * s);
        big(ctx, b.name, bx + 37 * s, ry + 12 * s, 16 * s, b.debuff ? '#ff6a7a' : C.text, 'left', 0.5 * s);
        big(ctx, b.t.toFixed(1) + 'S', rx - 7 * s, ry + 12 * s, 15 * s, C.muted, 'right', 0.5 * s);
        bar(ctx, bx + 37 * s, ry + bh - 9 * s, bw - 44 * s, Math.round(4 * s), b.t / b.max, b.debuff ? '#ff6a7a' : (b.col || C.green), 'rgba(0,0,0,0.6)');
        ry += bh + 6 * s;
      }
      for (const w of p.weapons) if (w.temp && w.tempT > 0) {
        big(ctx, 'CHAOS · ' + w.def.name + ' ' + (w.tempName || '') + ' ' + w.tempT.toFixed(1) + 'S', rx, ry + 8 * s, 15 * s, '#ff4f6e', 'right', 0.5 * s);
        ry += 20 * s;
      }
    },

    // where the last hits came from: a red arc around the hero that fades out in 0.9 s (one fade, no blinking),
    // with the attacker's name on hits of 9+ so you learn which enemy to respect
    hitArcs(ctx, G, W, H, s) {
      const marks = G.hitMarks;
      if (!marks || !marks.length) return;
      const V = RS.Render.view, z = V.z * (W / RS.Main.W), p = G.p;
      const px = (p.x - V.cx) * z + W / 2, py = (p.y - 20 - V.cy) * z + H / 2, R = Math.max(70 * s, 46 * z);
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i], age = G.time - m.at;
        if (age < 0 || age > 0.9) { marks.splice(i, 1); continue; }
        const k = 1 - age / 0.9, w = m.big ? 0.42 : 0.3, rr2 = R + age * 14 * s;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,' + (0.55 * k) + ')'; ctx.lineWidth = (m.big ? 13 : 9) * s;
        ctx.beginPath(); ctx.arc(px, py, rr2, m.a - w, m.a + w); ctx.stroke();
        ctx.strokeStyle = U.rgba(C.red, 0.95 * k); ctx.lineWidth = (m.big ? 8 : 5) * s;
        ctx.beginPath(); ctx.arc(px, py, rr2, m.a - w, m.a + w); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,226,' + (0.8 * k) + ')'; ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.arc(px, py, rr2 - 2 * s, m.a - w * 0.7, m.a + w * 0.7); ctx.stroke();
        ctx.lineCap = 'butt';
        if (m.big && m.who) {
          ctx.globalAlpha = Math.min(1, k * 1.6);
          text(ctx, m.who, px + Math.cos(m.a) * (rr2 + 30 * s), py + Math.sin(m.a) * (rr2 + 22 * s), Math.max(12, 14 * s), '#ff8a9c', 'center', MONO, 700, 1 * s);
          ctx.globalAlpha = 1;
        }
      }
    },

    // damage numbers and world labels, projected with the same camera as the world canvas
    worldText(ctx, G, W, H, s) {
      const V = RS.Render.view, k = W / RS.Main.W, z = V.z * k;
      const tx = (x) => (x - V.cx) * z + W / 2, ty = (y) => (y - V.cy) * z + H / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const zones = this.panelZones || [];
      for (const t of FX.texts.list) {
        const X = tx(t.x), Y = ty(t.y);
        if (X < -60 || X > W + 60 || Y < -40 || Y > H + 40) continue;
        let hidden = false; // damage numbers never sit on top of the HUD panels
        for (const r of zones) if (r[2] ? (X - r[0]) ** 2 + (Y - r[1]) ** 2 < r[2] * r[2] : X > r[3] && X < r[4] && Y > r[5] && Y < r[6]) { hidden = true; break; }
        if (hidden) continue;
        const kk = t.life / t.max;
        const pop = t.crit ? 1 + Math.max(0, (kk - 0.75)) * 3 : 1;
        const size = Math.max(11, Math.round(t.size * pop * z * 0.95));
        ctx.globalAlpha = Math.min(1, kk * 2.5);
        stamp(ctx, String(t.str), X, Y, (t.crit ? 700 : 600) + ' ' + size + 'px ' + MONO, 0, Math.max(2, size / 4), 0, 0, 'rgba(0,0,0,0.9)', 'round', t.col, 'center');
      }
      ctx.globalAlpha = 1;
      for (const l of RS.Render.labels) {
        const X = tx(l.x), Y = ty(l.y);
        if (X < -200 || X > W + 200 || Y < -40 || Y > H + 40) continue;
        ctx.globalAlpha = l.a;
        text(ctx, l.text, X, Y, Math.max(11, l.size * z), l.col, 'center', MONO, 700, 1.5 * z);
      }
      ctx.globalAlpha = 1;
    },


    // ---------------------------------------------------------------- round minimap
    // Street-map texture of the arena, baked once per run: parking blocks are the city blocks, the drive
    // aisles are the roads, loading docks are buildings. North stays up because the camera never rotates;
    // the player arrow turns with the movement heading instead.
    MAP_SCALE: 0.25,
    MINI_R: 92,
    // landmarks shown with labels on the minimap: stages (speaker clusters), loading docks, hazards
    landmarks(A) {
      if (A._marks) return A._marks;
      const out = [];
      const sp = A.props.filter((pr) => pr.type === 'speaker' || pr.type === 'amp');
      const used = new Set();
      for (const a of sp) { // cluster speakers / amps into stages
        if (used.has(a)) continue;
        const g = sp.filter((b) => !used.has(b) && Math.hypot(b.x - a.x, b.y - a.y) < 260);
        g.forEach((b) => used.add(b));
        out.push({ x: g.reduce((t, b) => t + b.x, 0) / g.length, y: g.reduce((t, b) => t + b.y, 0) / g.length, label: 'STAGE', col: '#b45cff' });
      }
      for (const pl of A.platforms) out.push({ x: pl.x + pl.w / 2, y: pl.y + pl.h / 2, label: 'DOCK', col: '#ffe14a' });
      // labels that would overlap on the map (about 220 x 80 world px each) keep only the first one
      const kept = [];
      for (const m of out) if (!kept.some((o) => Math.abs(o.x - m.x) < 220 && Math.abs(o.y - m.y) < 80)) kept.push(m);
      return (A._marks = kept);
    },
    mapImg(A) {
      if (A._mini) return A._mini;
      const k = this.MAP_SCALE, c = RS.Sprites.cv(Math.ceil(A.w * k), Math.ceil(A.h * k)), x = c.getContext('2d');
      x.fillStyle = '#4c4f4b'; x.fillRect(0, 0, c.width, c.height); // asphalt roads
      x.scale(k, k);
      // road edges: lighter kerb lines along each aisle
      const rows = [...new Set(A.decals.filter((d) => d.k === 'bay').map((d) => d.y))].sort((a, b) => a - b);
      for (const d of A.decals) if (d.k === 'bay') { // parking blocks with stall lines
        x.fillStyle = '#2b2e2c'; x.fillRect(d.x - 14, d.y - 124, d.len + 28, 248);
        x.fillStyle = '#6b6f6a'; x.fillRect(d.x - 14, d.y - 124, d.len + 28, 6); x.fillRect(d.x - 14, d.y + 118, d.len + 28, 6);
        x.fillStyle = '#3d413e';
        for (let sx = d.x; sx <= d.x + d.len; sx += d.gap) x.fillRect(sx - 4, d.y - 118, 8, 236);
        x.fillRect(d.x, d.y - 4, d.len, 8);
      }
      // aisles: dashed centre lines + lamp posts as bright dots
      for (let i = 0; i < rows.length - 1; i++) {
        const y = (rows[i] + rows[i + 1]) / 2;
        x.fillStyle = 'rgba(240,226,150,0.7)';
        for (let sx = 60; sx < A.w - 60; sx += 140) x.fillRect(sx, y - 5, 70, 10);
      }
      // cross streets between the bay blocks
      x.fillStyle = 'rgba(240,240,232,0.25)';
      for (const d of A.decals) if (d.k === 'bay') { x.fillRect(d.x - 40, d.y - 130, 8, 260); x.fillRect(d.x + d.len + 32, d.y - 130, 8, 260); }
      for (const l of A.lamps || []) { x.fillStyle = 'rgba(255,240,190,0.9)'; x.fillRect(l.x - 14, l.y - 14, 28, 28); }
      for (const d of A.decals) if (d.k === 'zebra') { x.fillStyle = 'rgba(240,240,232,0.75)'; for (let i = 0; i < d.n; i++) { if (d.vert) x.fillRect(d.x, d.y + i * 36, 130, 18); else x.fillRect(d.x + i * 36, d.y, 18, 130); } }
      for (const pl of A.platforms) { // buildings
        x.fillStyle = '#1b1d1c'; x.fillRect(pl.x + 10, pl.y + 14, pl.w, pl.h);
        x.fillStyle = '#9a978e'; x.fillRect(pl.x, pl.y, pl.w, pl.h);
        x.fillStyle = '#b9b6ac'; x.fillRect(pl.x, pl.y, pl.w, 14);
        x.strokeStyle = '#2a2b29'; x.lineWidth = 8; x.strokeRect(pl.x, pl.y, pl.w, pl.h);
      }
      const CAR = ['#8a1b2a', '#2a4a7a', '#d8d8d0', '#1c1e1d', '#6e7a2a'];
      for (const pr of A.props) {
        if (pr.type === 'carV') { x.fillStyle = CAR[Math.floor(pr.x + pr.y) % 5]; x.fillRect(pr.x - 21, pr.y - 44, 42, 88); }
        else if (pr.type === 'pillar') { x.fillStyle = '#b9b6ac'; x.fillRect(pr.x - 22, pr.y - 22, 44, 44); }
        else if (pr.type === 'dumpster') { x.fillStyle = '#2e6a2a'; x.fillRect(pr.x - 34, pr.y - 16, 68, 32); }
        else if (pr.type === 'speaker' || pr.type === 'amp') { x.fillStyle = '#6a2fa0'; x.fillRect(pr.x - 30, pr.y - 24, 60, 48); }
        else if (pr.type === 'toxic') { x.fillStyle = '#9cff35'; x.beginPath(); x.arc(pr.x, pr.y, 26, 0, TAU); x.fill(); }
        else if (pr.type === 'barrel') { x.fillStyle = '#d06a1a'; x.beginPath(); x.arc(pr.x, pr.y, 18, 0, TAU); x.fill(); }
        else if (pr.type === 'barrier') { x.fillStyle = '#e8c21e'; x.fillRect(pr.x - 40, pr.y - 9, 80, 18); }
        else if (pr.type === 'panel') { x.fillStyle = '#ffe14a'; x.fillRect(pr.x - 20, pr.y - 20, 40, 40); }
      }
      x.strokeStyle = '#d8b21e'; x.lineWidth = 24; x.strokeRect(0, 0, A.w, A.h); // painted curb
      A._mini = c;
      return c;
    },
    minimap(ctx, G, W, H, s) {
      const A = G.arena, p = G.p, R = Math.round(this.MINI_R * s), cx = Math.round(W - R - 26 * s), cy = Math.round(H - R - 30 * s);
      const span = 1050, k = R / span; // world units from centre to rim
      const map = this.mapImg(A), mk = k / this.MAP_SCALE;
      const toM = (wx, wy) => [cx + (wx - p.x) * k, cy + (wy - p.y) * k];
      // backing + drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(cx + 3 * s, cy + 4 * s, R + 9 * s, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      ctx.fillStyle = '#111312'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); // outside the arena
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(map, cx - p.x * k, cy - p.y * k, map.width * mk, map.height * mk);
      // camera view footprint
      const vw = G.cam.vw * k, vh = G.cam.vh * k;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(cx + (G.cam.x - p.x) * k - vw / 2, cy + (G.cam.y - p.y) * k - vh / 2, vw, vh);
      // enemies: small red squares, batched into one path (dark underlay first)
      const list = G.enemies.list, d = Math.max(2, 2.9 * s), R2 = (R - 2) * (R - 2);
      const step = Math.max(1, Math.floor(list.length / 260));
      for (const halluc of [false, true]) {
        ctx.beginPath();
        for (let i = 0; i < list.length; i += step) {
          const e = list[i]; if (e.dead || e.boss || !!e.def.halluc !== halluc) continue;
          const ex = (e.x - p.x) * k, ey = (e.y - p.y) * k;
          if (ex * ex + ey * ey < R2) ctx.rect(cx + ex - d / 2, cy + ey - d / 2, d, d);
        }
        ctx.fillStyle = halluc ? '#ff6ad5' : '#ff2448'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(30,0,8,0.8)'; ctx.stroke();
      }
      // consumables (heals, buffs) as small green crosses
      ctx.fillStyle = C.green;
      for (const pk of G.pickups.list) if (!pk.dead && pk.kind === 'cons') {
        const ex = (pk.x - p.x) * k, ey = (pk.y - p.y) * k;
        if (ex * ex + ey * ey < R2) { ctx.fillRect(cx + ex - 3 * s, cy + ey - 1 * s, 6 * s, 2 * s); ctx.fillRect(cx + ex - 1 * s, cy + ey - 3 * s, 2 * s, 6 * s); }
      }
      // landmark labels
      for (const m of this.landmarks(A)) {
        const ex = (m.x - p.x) * k, ey = (m.y - p.y) * k;
        if (ex * ex + ey * ey > (R - 12 * s) * (R - 12 * s)) continue;
        text(ctx, m.label, cx + ex, cy + ey, 8 * s, m.col, 'center', MONO, 700, 1 * s);
      }
      ctx.restore();

      // rim: black ring with the XP progress as a green arc
      ctx.lineWidth = 8 * s; ctx.strokeStyle = '#050605'; ctx.beginPath(); ctx.arc(cx, cy, R + 3 * s, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, R + 7 * s, 0, TAU); ctx.stroke();
      const xk = U.clamp(p.xp / p.xpNext, 0, 1);
      if (xk > 0) { ctx.lineWidth = 4.5 * s; ctx.strokeStyle = C.green; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, R + 3 * s, -Math.PI / 2, -Math.PI / 2 + TAU * xk); ctx.stroke(); ctx.lineCap = 'butt'; }

      // blips: icons clamp to the rim when out of range
      const blip = (wx, wy, draw) => {
        let [mx, my] = toM(wx, wy);
        const dx = mx - cx, dy = my - cy, dd = Math.hypot(dx, dy), lim = R - 9 * s;
        if (dd > lim) { mx = cx + dx / dd * lim; my = cy + dy / dd * lim; }
        draw(mx, my, dd > lim);
      };
      const icon = (id, sz) => (mx, my) => { ctx.imageSmoothingEnabled = false; const z2 = sz * s; ctx.drawImage(I.get(id), mx - z2 / 2, my - z2 / 2, z2, z2); };
      const ring = (col, cross) => (mx, my) => {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(mx, my, 8 * s, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.arc(mx, my, 5.5 * s, 0, TAU); ctx.stroke();
        if (cross) { ctx.fillStyle = col; ctx.fillRect(mx - 1 * s, my - 1 * s, 2 * s, 2 * s); }
      };
      for (const e of list) if (!e.dead && (e.elite || e.type === 'leak' || e.def.isElite)) blip(e.x, e.y, (mx, my) => { ctx.fillStyle = '#000'; ctx.fillRect(mx - 4 * s, my - 4 * s, 8 * s, 8 * s); ctx.fillStyle = '#ffd75a'; ctx.fillRect(mx - 3 * s, my - 3 * s, 6 * s, 6 * s); });
      for (const pk of G.pickups.list) {
        if (pk.kind === 'chest') blip(pk.x, pk.y, icon(pk.tier === 'boss' ? 'chest_boss' : pk.tier === 'legendary' ? 'chest_legendary' : 'chest', 16));
        else if (pk.kind === 'thumb') blip(pk.x, pk.y, ring('#ff4f6e', true));
        else if (pk.kind === 'ruby') blip(pk.x, pk.y, (mx, my) => { // red pixel diamond
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(mx, my - 8 * s); ctx.lineTo(mx + 7 * s, my); ctx.lineTo(mx, my + 8 * s); ctx.lineTo(mx - 7 * s, my); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff2448'; ctx.beginPath(); ctx.moveTo(mx, my - 5 * s); ctx.lineTo(mx + 4.5 * s, my); ctx.lineTo(mx, my + 5 * s); ctx.lineTo(mx - 4.5 * s, my); ctx.closePath(); ctx.fill();
        });
      }
      // stash items on the ground: a small diamond in the rarity colour; altars: a red ring (a green one while healing)
      for (const pk of G.pickups.list) if (pk.kind === 'stash' && !pk.dead) blip(pk.x, pk.y, (mx, my) => {
        ctx.fillStyle = '#000'; ctx.fillRect(mx - 4.5 * s, my - 4.5 * s, 9 * s, 9 * s);
        ctx.fillStyle = D.RARITY[pk.tier].col; ctx.fillRect(mx - 3 * s, my - 3 * s, 6 * s, 6 * s);
      });
      for (const a of G.altars || []) if (a.state !== 'done') blip(a.x, a.y, ring(a.state === 'heal' ? C.green : C.red, a.state === 'idle'));
      // THE PLUG: a cash icon (on the rim when he is out of range, like a compass); hidden while he packs up
      if (G.plug && !(G.plug.leaving > 0)) blip(G.plug.x, G.plug.y, icon('clout_stack', 15));
      const c2 = RS.Director.cypher; if (c2) blip(c2.x, c2.y, ring(C.green, true));
      const sp = RS.Director.supply; if (sp) blip(sp.x, sp.y, ring(C.text, true));
      for (const b of G.bosses) blip(b.x, b.y, icon('crown', 20));
      // player arrow, turned to the movement heading
      const ang = Math.atan2(p.aimY, p.aimX) + Math.PI / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, -9 * s); ctx.lineTo(6.5 * s, 7 * s); ctx.lineTo(0, 3 * s); ctx.lineTo(-6.5 * s, 7 * s); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      // north badge on the rim
      const nx = cx, ny = cy - R - 3 * s;
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(nx, ny, 9 * s, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(nx, ny, 9 * s, 0, TAU); ctx.stroke();
      big(ctx, 'N', nx, ny + 1 * s, 15 * s, '#ffffff', 'center', 0);
    },

    arrows(ctx, G, W, H, s) {
      const targets = [];
      for (const b of G.bosses) targets.push([b.x, b.y, C.red, 'BOSS']);
      const p = G.p;
      for (const k of G.pickups.list) if (!k.dead && k.kind === 'ruby') targets.push([k.x, k.y, '#ff2448', 'DIAMOND ' + Math.max(0, Math.ceil(RS.Data.LOOT.rubyLife - k.age)) + 'S']);
      const loot = G.pickups.list.filter((k) => k.kind === 'chest' || k.kind === 'thumb')
        .sort((a, b) => U.dist2(a.x, a.y, p.x, p.y) - U.dist2(b.x, b.y, p.x, p.y)).slice(0, 3);
      for (const k of loot) targets.push([k.x, k.y, k.kind === 'thumb' ? '#ff4f6e' : '#ffcf3f', k.kind === 'thumb' ? 'THUMB' : 'CHEST']);
      for (const e of G.enemies.list) if (!e.dead && e.type === 'leak') targets.push([e.x, e.y, '#ffcf3f', 'LEAK']);
      if (RS.Director.cypher && RS.Director.cypher.state === 'wait') targets.push([RS.Director.cypher.x, RS.Director.cypher.y, '#ffcf3f', 'CYPHER']);
      if (RS.Director.supply) targets.push([RS.Director.supply.x, RS.Director.supply.y, C.text, 'DROP']);
      const V = RS.Render.view, z = V.z * (W / RS.Main.W);
      for (const [x, y, col, lab] of targets) {
        const sx = (x - V.cx) * z + W / 2, sy = (y - V.cy) * z + H / 2;
        if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
        const a = Math.atan2(sy - H / 2, sx - W / 2);
        const m = 48 * s;
        const ex = U.clamp(W / 2 + Math.cos(a) * W, m, W - m);
        let ey = U.clamp(H / 2 + Math.sin(a) * H, m + 20 * s, H - m);
        const mm = this.MINI_R * s * 2 + 90 * s; // keep pointers off the minimap in the bottom-right corner
        if (ex > W - mm && ey > H - mm) ey = H - mm;
        // and off the HUD panels (timer, kill pill, player block, money): slide below the panel it would cover
        for (const r of this.panelZones || []) if (!r[2] && ex > r[3] - 50 * s && ex < r[4] + 50 * s && ey < r[6] + 40 * s) ey = r[6] + 40 * s;
        // pointer + a dark tag with the name and the distance; never smaller than 13 px on screen
        const k2 = Math.max(s, 13 * (RS.Main.hdpr || 1) / 16), pulse = lab === 'BOSS' ? 1 : 1 + Math.sin(G.time * 5) * 0.08;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(17 * k2, 0); ctx.lineTo(-10 * k2, -13 * k2); ctx.lineTo(-5 * k2, 0); ctx.lineTo(-10 * k2, 13 * k2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(14 * k2, 0); ctx.lineTo(-7 * k2, -10 * k2); ctx.lineTo(-3 * k2, 0); ctx.lineTo(-7 * k2, 10 * k2); ctx.closePath(); ctx.fill();
        ctx.restore();
        const dist = Math.round(Math.hypot(x - p.x, y - p.y) / 20) + 'M', tag = lab + ' ' + dist, fs = 16 * k2;
        ctx.font = '400 ' + Math.round(fs) + 'px ' + DISP;
        const tw = ctx.measureText(tag).width + 14 * k2, ty2 = ey + 24 * k2;
        const tx2 = U.clamp(ex, tw / 2 + 4, W - tw / 2 - 4); // the tag slides along the edge instead of being cut off
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(Math.round(tx2 - tw / 2), Math.round(ty2 - fs * 0.62), Math.round(tw), Math.round(fs * 1.25));
        ctx.fillStyle = col; ctx.fillRect(Math.round(tx2 - tw / 2), Math.round(ty2 - fs * 0.62), Math.max(2, Math.round(3 * k2)), Math.round(fs * 1.25));
        big(ctx, tag, tx2, ty2, fs, col, 'center', 1 * k2);
      }
    },

    banners(ctx, G, W, H, s) {
      let y = H * 0.32; // below the timer, pill and boss bars
      for (const b of FX.banners) {
        const inK = Math.min(1, b.t * 5), outK = Math.min(1, (b.dur - b.t) * 3);
        const a = Math.min(inK, outK);
        const size = Math.min((b.small ? 40 : 78) * s, (W * 0.92) / Math.max(6, b.title.length) * 2.1);
        ctx.globalAlpha = a;
        // a controlled glitch: two offset steps on entry (not a per-frame jitter), then a clean title
        const jx = b.t < 0.12 ? -6 * s : b.t < 0.25 ? 4 * s : 0;
        const accent = b.col === '#ffffff' || b.col === '#e3ece6' ? C.green : b.col;
        plate(ctx, W / 2 - W * 0.36, y - size * 0.62, W * 0.72, size * 0.62 + (b.sub ? 44 : 22) * s + size * 0.48, 'center');
        if (b.t < 0.35) disp(ctx, b.title, W / 2 + jx + 4 * s, y, size, U.rgba(accent, 0.65), 'center', size * 0.05);
        disp(ctx, b.title, W / 2 - jx * 0.3, y, size, accent === C.red || accent === C.green ? C.text : accent, 'center', size * 0.05);
        // accent rule under the title
        const tw = Math.min(W * 0.6, b.title.length * size * 0.42);
        ctx.fillStyle = accent; ctx.fillRect(W / 2 - tw / 2, y + size * 0.48, tw * Math.min(1, b.t * 4), Math.max(2, 2 * s));
        if (b.sub) text(ctx, b.sub.toUpperCase(), W / 2, y + size * 0.48 + 20 * s, Math.max(12, 15 * s), C.text, 'center', MONO, 600, 2 * s);
        ctx.globalAlpha = 1;
        y += size + 46 * s;
      }
    },
  };

  RS.HUD = HUD;
})(window.RS);
