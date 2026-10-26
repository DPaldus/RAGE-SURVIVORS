'use strict';
// Painted effect sprites (RS.FX_SHEET, built by tools/build_fx.py). Every frame points right and carries an
// anchor (the projectile position / muzzle inside the frame), so drawing is: translate, rotate, offset.
// Until the atlas has decoded (or without the sheet) FXS.ok() is false and callers keep the procedural look.
(function (RS) {
  const FXS = {
    img: null, ready: false, tints: new Map(), filters: new Map(), mips: new Map(),
    load() {
      const S = RS.FX_SHEET;
      if (!S) return Promise.resolve();
      return new Promise((res) => {
        const im = new Image();
        im.onload = () => { this.img = im; this.ready = true; for (let n = 1; n <= 3; n++) this.mip('', n); res(); }; // mips at boot, not mid-fight
        im.onerror = () => res();
        im.src = S.src;
      });
    },
    ok(name) { return this.ready && !!RS.FX_SHEET.frames[name]; },
    count(name) { return RS.FX_SHEET.frames[name].length; },
    // CSS filter that moves a sprite painted in `base` towards `col` (evolutions, child shots)
    filterFor(base, col) {
      if (!col || col === base) return '';
      const key = base + col;
      let f = this.filters.get(key);
      if (f === undefined) {
        const h0 = hsl(base), h1 = hsl(col);
        if (h1[1] < 0.25) f = 'grayscale(1) brightness(1.35)';
        else f = 'hue-rotate(' + Math.round(((h1[0] - h0[0]) % 360 + 360) % 360) + 'deg)' + (h1[2] > 0.6 ? ' brightness(1.15)' : '');
        this.filters.set(key, f);
      }
      return f;
    },
    // filter that turns a grey / white painting into `col` (sound waves, flashlight)
    colorize(col) {
      const key = 'c' + col;
      let f = this.filters.get(key);
      if (f === undefined) { f = 'sepia(1) saturate(5) hue-rotate(' + Math.round(hsl(col)[0] - 38) + 'deg)'; this.filters.set(key, f); }
      return f;
    },
    frame(name, i) { return RS.FX_SHEET.frames[name][i || 0]; }, // [x, y, w, h, ax, ay]
    // a beam strip (painted left to right) laid from (x0, y0) to (x1, y1), `thick` world px high.
    // Short beams show a window of the strip instead of squashing it; `seed` (0..1) picks the window.
    // a strip re-drawn once into its own canvas, column by column, opening from `taper` of its height to full:
    // turns the painted flashlight band into a real cone without seams. Returns [canvas, w, h].
    tapered(name, taper) {
      const key = name + taper;
      let c = this.tints.get(key);
      if (!c) {
        const f = RS.FX_SHEET.frames[name][0], W = f[2] * 3, H = f[3];
        c = RS.Sprites.cv(W, H); const x = c.getContext('2d');
        x.imageSmoothingEnabled = true;
        for (let i = 0; i < W; i++) {
          const th = H * (taper + (1 - taper) * Math.pow(i / W, 0.8));
          x.drawImage(this.img, f[0] + (i / W) * f[2], f[1], f[2] / W, H, i, (H - th) / 2, 1, th);
        }
        this.tints.set(key, c);
      }
      return c;
    },
    drawStrip(ctx, name, x0, y0, x1, y1, thick, alpha, filter, seed, taper) {
      const f = RS.FX_SHEET.frames[name][0];
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 1) return;
      const k = thick / f[3], sw = Math.min(f[2], L / k), sx = f[0] + (f[2] - sw) * (seed || 0);
      const sm = ctx.imageSmoothingEnabled, n = this.level(k), M = 1 / (1 << n);
      ctx.imageSmoothingEnabled = true;
      if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
      if (taper) ctx.drawImage(this.tapered(name, taper), 0, -thick / 2, L, thick);
      else ctx.drawImage(this.mip(filter, n), sx * M, f[1] * M, sw * M, f[3] * M, 0, -f[5] * k, L, thick);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = sm;
    },
    // whole-atlas copy per filter, made once; ctx.filter per draw call would be far too slow
    sheet(filter) {
      if (!filter) return this.img;
      let c = this.tints.get(filter);
      if (!c) {
        c = RS.Sprites.cv(this.img.width, this.img.height);
        const x = c.getContext('2d');
        if ('filter' in x) { x.filter = filter; x.drawImage(this.img, 0, 0); }
        else x.drawImage(this.img, 0, 0);
        this.tints.set(filter, c);
      }
      return c;
    },
    // Mip chain per tint: level n is the atlas at 1/2^n, made by exact 2x2 halving. Frames sit on an 8 px grid with an
    // empty block between them (tools/build_fx.py), so no level mixes two frames. A sprite draws from the level just
    // above its on-screen size with plain bilinear filtering: as clean as 'high' quality smoothing (which made the GPU
    // filter the full-size atlas for every tiny spark and cost ~2/3 of the frame in heavy fights) at a fraction of it.
    mip(filter, n) {
      if (!n) return this.sheet(filter);
      const key = (filter || '-') + '|' + n;
      let c = this.mips.get(key);
      if (!c) {
        const src = this.mip(filter, n - 1);
        c = RS.Sprites.cv(Math.ceil(src.width / 2), Math.ceil(src.height / 2));
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; // exact 0.5x bilinear = 2x2 box filter
        x.drawImage(src, 0, 0, src.width / 2, src.height / 2);
        this.mips.set(key, c);
      }
      return c;
    },
    // mip level for a draw at k world px per sprite px: the first level that is still >= half its on-screen size
    level(k) {
      const d = Math.abs(k) * ((RS.Game && RS.Game.cam && RS.Game.cam.zoom) || 1);
      return d >= 0.5 ? 0 : d >= 0.25 ? 1 : d >= 0.125 ? 2 : 3;
    },
    // frame i of `name` with its anchor at (x, y), rotated to ang, k = world px per sprite px (ky: separate height).
    // Shots heading left are mirrored vertically so the painted light stays on top.
    draw(ctx, name, i, x, y, ang, k, alpha, filter, ky) {
      const fr = RS.FX_SHEET.frames[name];
      const f = fr[((i % fr.length) + fr.length) % fr.length];
      const sm = ctx.imageSmoothingEnabled, kv = ky || k, n = this.level(Math.min(Math.abs(k), Math.abs(kv))), M = 1 / (1 << n);
      ctx.imageSmoothingEnabled = true;
      if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
      ctx.save(); ctx.translate(x, y);
      if (ang) ctx.rotate(ang);
      if (ang && Math.cos(ang) < 0) ctx.scale(k, -kv); else ctx.scale(k, kv);
      ctx.drawImage(this.mip(filter, n), f[0] * M, f[1] * M, f[2] * M, f[3] * M, -f[4], -f[5], f[2], f[3]);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = sm;
    },
  };
  function hsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  RS.FXS = FXS;
})(window.RS);
