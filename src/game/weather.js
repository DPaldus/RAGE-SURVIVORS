'use strict';
// NIGHT / STORM visuals (D.MAPMODES): the night layer level, rain and lightning. Visual only: no sound, no damage.
//  - Night: Render.lightPass paints a dark layer with light holes (hero, aisle lights, shots, loot) on both render
//    paths; attack warnings and enemy shots are drawn after it, so threats stay fully readable in the dark.
//  - Rain: screen-space streaks, one stroke() for all drops and one for the splashes; a light shower (70-150 drops
//    by the particle setting), carried along by the camera so the deck seems to move under it.
//  - Lightning: lifts the night layer for a moment and paints a short bolt near a screen edge (never over the middle).
//    Flash safety: a strike is two pulses 0.24 s apart and strikes come 9-18 s apart, so the screen never flashes more
//    than twice in any second; REDUCE FLASHING turns a strike into one slow, soft brightening without the bolt.
(function (RS) {
  const U = RS.U;
  const WIND = 0.22; // drops lean this far from vertical (rad)

  function newRain() { return { drops: [], splash: [], lastX: null, lastY: null }; }
  // a jagged bolt from the top edge, kept to the outer quarter of the screen (in 0..1 screen units)
  function makeBolt() {
    const x0 = Math.random() < 0.5 ? U.rand(0.04, 0.24) : U.rand(0.76, 0.96), y1 = U.rand(0.25, 0.5), pts = [x0, 0];
    let x = x0, n = 7;
    for (let i = 1; i <= n; i++) { x += U.rand(-0.035, 0.035); pts.push(x, y1 * i / n); }
    return pts;
  }
  // brightness of a strike t s after it began (0..1)
  function envelope(t, soft) {
    if (soft) return t < 0.18 ? 0.35 * t / 0.18 : 0.35 * Math.max(0, 1 - (t - 0.18) / 0.5);
    const a = t < 0.03 ? t / 0.03 : Math.max(0, 1 - (t - 0.03) / 0.14);
    const t2 = t - 0.24, b = t2 < 0 ? 0 : t2 < 0.03 ? 0.65 * t2 / 0.03 : 0.65 * Math.max(0, 1 - (t2 - 0.03) / 0.2);
    return Math.max(a, b);
  }

  const Weather = {
    flash: 0, strikeT: -1, next: 0, bolt: null, rain: newRain(),
    reset(G) {
      this.flash = 0; this.strikeT = -1; this.next = U.rand(9, 15); this.bolt = null;
      this.rain = newRain();
    },
    // lightning clock (game time: it stops with the game)
    update(G, dt) {
      const M = G.mapMode;
      if (!M || !M.lightning) return;
      const s = this.strike(dt, RS.Save.s.reduceFlash);
      if (s) this.next = U.rand(9, 18);
    },
    // shared by the run and the menu preview: returns true when a new strike starts
    strike(dt, soft, st) {
      st = st || this;
      let began = false;
      st.next -= dt;
      if (st.next <= 0 && st.strikeT < 0) { st.strikeT = 0; st.bolt = soft ? null : makeBolt(); began = true; }
      if (st.strikeT >= 0) {
        st.strikeT += dt;
        st.flash = envelope(st.strikeT, soft);
        if (st.strikeT > 0.8) { st.strikeT = -1; st.flash = 0; st.bolt = null; }
      }
      return began;
    },
    // night layer alpha for this frame (0 on NORMAL); a strike lights the whole deck for a moment
    dark(G) { const M = G.mapMode; return M && M.dark ? M.dark * (1 - 0.72 * this.flash) : 0; },

    // ---------------------------------------------------------------- drawing (screen space, device px)
    drawRain(ctx, W, H, dt, camX, camY, z, rain) {
      const R = rain || this.rain, P = RS.Save.s.particles | 0;
      const n = Math.round([70, 110, 150][P] * U.clamp((W * H) / (1600 * 900), 0.4, 1.6));
      let dx = 0, dy = 0;
      if (R.lastX !== null && camX !== undefined) { dx = -(camX - R.lastX) * z; dy = -(camY - R.lastY) * z; if (Math.abs(dx) + Math.abs(dy) > 300) dx = dy = 0; }
      if (camX !== undefined) { R.lastX = camX; R.lastY = camY; }
      const D = R.drops, sp = H * 1.45, len = H * 0.034, lw = Math.max(1, Math.round(H / 620));
      while (D.length < n) D.push({ x: Math.random() * W * 1.2 - W * 0.1, y: Math.random() * H, v: sp * U.rand(0.85, 1.15), life: U.rand(0.1, 0.7) });
      if (D.length > n) D.length = n;
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const d of D) {
        d.x += d.v * WIND * dt + dx; d.y += d.v * dt + dy; d.life -= dt;
        if (d.life <= 0 || d.y > H + len || d.x > W + len || d.x < -len * 2) {
          if (d.life <= 0 && R.splash.length < 40 && d.x > 0 && d.x < W && d.y > 0 && d.y < H) R.splash.push({ x: d.x, y: d.y, t: 0 });
          d.x = Math.random() * W * 1.2 - W * 0.15; d.y = -Math.random() * H * 0.4; d.v = sp * U.rand(0.85, 1.15); d.life = U.rand(0.25, 0.75);
        }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - WIND * len, d.y - len);
      }
      ctx.strokeStyle = 'rgba(178,198,236,0.34)'; ctx.lineWidth = lw; ctx.stroke();
      // splashes: a tiny pixel crown where a drop lands
      if (R.splash.length) {
        ctx.beginPath();
        const s = Math.max(2, Math.round(H / 300));
        for (let i = R.splash.length - 1; i >= 0; i--) {
          const q = R.splash[i];
          q.t += dt; q.x += dx; q.y += dy;
          if (q.t > 0.16) { R.splash.splice(i, 1); continue; }
          const k = 1 + q.t * 9;
          ctx.rect(q.x - s * k, q.y - s * 0.5, s, s * 0.6); ctx.rect(q.x + s * (k - 1), q.y - s * 0.5, s, s * 0.6);
        }
        ctx.fillStyle = 'rgba(190,210,245,0.38)'; ctx.fill();
      }
      ctx.restore();
    },
    // the strike itself: a cool brightening of the whole frame plus the bolt near an edge
    drawStrike(ctx, W, H, st) {
      st = st || this;
      if (st.flash <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(150,170,230,' + (0.1 * st.flash).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
      const b = st.bolt;
      if (b && st.strikeT < 0.16) {
        ctx.beginPath(); ctx.moveTo(b[0] * W, b[1] * H);
        for (let i = 2; i < b.length; i += 2) ctx.lineTo(b[i] * W, b[i + 1] * H);
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = 'rgba(140,160,255,' + (0.35 * st.flash).toFixed(3) + ')'; ctx.lineWidth = Math.max(4, H / 110); ctx.stroke();
        ctx.strokeStyle = 'rgba(235,240,255,' + (0.8 * st.flash).toFixed(3) + ')'; ctx.lineWidth = Math.max(1.5, H / 420); ctx.stroke();
      }
      ctx.restore();
    },

    // ---------------------------------------------------------------- pregame map card preview
    // base = Render.mapPreview() (the real deck from above), st = this card's own rain / lightning state
    preview(ctx, w, h, M, base, dt, st) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, w, h);
      if (M.lightning) {
        if (st.next === undefined) { st.next = 1.2; st.strikeT = -1; st.flash = 0; }
        if (this.strike(dt, RS.Save.s.reduceFlash, st)) st.next = U.rand(4.5, 7);
      }
      if (M.dark) {
        // the dark layer with the aisle lights and the hero's pool cut out, built once per card size
        if (!st.layer || st.layer.width !== w || st.layer.height !== h) {
          const c = st.layer = RS.Sprites.cv(w, h), x = c.getContext('2d'), cut = RS.Render.cut;
          x.fillStyle = 'rgba(' + M.tint + ',' + Math.min(0.92, M.dark + 0.14) + ')'; x.fillRect(0, 0, w, h);
          x.globalCompositeOperation = 'destination-out';
          const r = h * 0.2;
          for (const [lx, ly] of base._lamps || []) { x.globalAlpha = 0.85; x.drawImage(cut, lx * w - r, ly * h - r, r * 2, r * 2); }
          x.globalAlpha = 1; const hr = h * 0.42; x.drawImage(cut, w / 2 - hr, h / 2 - hr, hr * 2, hr * 2);
        }
        ctx.globalAlpha = 1 - 0.72 * (st.flash || 0);
        ctx.drawImage(st.layer, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (M.rain) { st.rain = st.rain || newRain(); this.drawRain(ctx, w, h, dt, undefined, undefined, 1, st.rain); }
      if (M.lightning) this.drawStrike(ctx, w, h, st);
    },
  };

  RS.Weather = Weather;
})(window.RS);
