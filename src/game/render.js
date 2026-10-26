'use strict';
// World renderer: floor, zones, pickups, y-sorted entities, projectiles, lighting, telegraphs, post FX.
(function (RS) {
  const U = RS.U, FX = RS.FX, S = RS.Sprites, TAU = U.TAU;
  const draws = [];
  const shadowCache = new WeakMap();
  const HERO_SCALE = 2.3;
  const DIRS = ['right', 'left', 'down', 'up'];
  const SHEET_K = 0.62; // world units per pixel of a hand-drawn hero sheet (~66 px tall, like the procedural hero)
  const whiteCache = new WeakMap();
  const ghostCache = new WeakMap();
  const OVER_ZONES = { wave: 1, slash: 1, cone: 1, stab: 1 }; // zones drawn over the crowd, the rest lie on the ground
  const WHITE3 = [1, 1, 1]; // neutral ambient tint for the GPU compositor

  const R = {
    light: null, lctx: null, cut: null, vign: null, hurtV: null, scan: null, W: 0, H: 0,
    resize(W, H) {
      this.W = W; this.H = H;
      this.light = S.cv(Math.ceil(W / 4), Math.ceil(H / 4)); this.lctx = this.light.getContext('2d');
      // radial cutout used to punch light holes
      if (!this.cut) {
        this.cut = S.cv(128, 128);
        const x = this.cut.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      }
      const mk = (col, inner, a) => {
        const c = S.cv(W, H), x = c.getContext('2d');
        const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(1, U.rgba(col, a));
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        return c;
      };
      this.vign = mk('#000000', 0.3, 0.75);
      this.vignSoft = mk('#000000', 0.5, 0.32);
      this.hurtV = mk('#ff0020', 0.25, 0.85);
      this.pulseV = mk('#9cff35', 0.35, 0.45);
      const sc = S.cv(1, 3), sx = sc.getContext('2d');
      sx.fillStyle = 'rgba(0,0,0,0.55)'; sx.fillRect(0, 2, 1, 1);
      this.scanCanvas = sc; this.scan = null;
    },

    // world-space text queued during the world pass, rendered crisp by the HUD
    labels: [],
    label(x, y, text, col, size, alpha) { this.labels.push({ x, y, text, col, size: size || 11, a: alpha === undefined ? 1 : alpha }); },
    // world -> HUD canvas transform for the current frame (camera + shake)
    view: { cx: 0, cy: 0, z: 1 },

    pixBufs: [], pixN: 0,
    draw(ctx, G) {
      const W = this.W, H = this.H, cam = G.cam, z = cam.zoom, p = G.p, A = G.arena;
      this.pixN = 0;
      const set = RS.Save.s, Post = RS.Post, shadows = set.shadows | 0;
      this.labels.length = 0;
      // section timings for tools/bot.js (RS.Prof.on = true); free when off
      const PF = RS.Prof && RS.Prof.on ? RS.Prof.t : null;
      let pt = PF ? performance.now() : 0;
      const lap = PF ? (k) => { const n = performance.now(); PF[k] = (PF[k] || 0) + n - pt; pt = n; } : null;
      // integer device-pixel camera so cached floor chunks, sprites and the HUD projection line up exactly
      // The hero is snapped to whole device pixels and the camera offset is built from that snapped position plus the
      // rounded camera lag: the floor still moves in whole pixels, and the hero holds still on screen while walking
      // instead of wobbling by a pixel against the rounded camera.
      const cx = cam.x + FX.shakeX, cy = cam.y + FX.shakeY;
      const hxq = Math.round(p.x * z), hyq = Math.round(p.y * z);
      const ex = Math.round(W / 2) - hxq + Math.round((p.x - cx) * z), ey = Math.round(H / 2) - hyq + Math.round((p.y - cy) * z);
      this.hsx = hxq / z; this.hsy = hyq / z;
      this.ex = ex; this.ey = ey; this.z = z;
      const vcx = (W / 2 - ex) / z, vcy = (H / 2 - ey) / z;
      this.view.cx = vcx; this.view.cy = vcy; this.view.z = z;
      Post.begin(vcx, vcy, z, W, H);
      Post.hurt = Math.min(1, FX.hurtA * 1.4);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = A.def.bg; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(z, 0, 0, z, ex, ey);
      ctx.imageSmoothingEnabled = false;
      const v = G.view();
      const pulse = RS.Audio.music.pulse();

      // visible, y-sorted entities (gathered first: reflections and cast shadows need them)
      draws.length = 0;
      RS.Arena.propDrawables(G, v, draws);
      for (const e of G.enemies.list) if (!e.dead && e.x > v.x0 - 80 && e.x < v.x1 + 80 && e.y > v.y0 - 80 && e.y < v.y1 + 120) draws.push(e);
      let crowd = 0;
      for (const d of draws) { d._sy = d.P ? d.y + (d.hh || d.P.circle || 10) : d.y + d.r * 0.9; if (!d.P) crowd++; }
      this.crowd = crowd; // LOD: huge crowds skip the per-enemy lean transform (measured ~1.3 ms at 400+ on screen)
      draws.sort((a, b) => a._sy - b._sy);
      if (lap) lap('gather+sort');

      RS.Arena.drawFloor(ctx, G, v);
      if (lap) lap('floor');
      if (set.reflections) this.drawReflections(ctx, G, v);
      if (lap) lap('reflections');
      this.drawLife(ctx, G, v);
      this.drawEventMarkers(ctx, G);
      // (a pixel pass with nothing to draw is skipped: no clear, no blit)
      if (G.zones.list.some((z) => !z.dead && !OVER_ZONES[z.kind]) || (!p.dead && p.weapons.some((w) => w.def.under))) {
        const gx = this.pixBegin();
        this.drawZones(gx, G, v, false);
        if (!p.dead) for (const w of p.weapons) if (w.def.under) w.def.under(gx, w, p, G); // auras on the ground, under everyone
        this.pixEnd(ctx);
      }
      FX.drawGround(ctx, v);
      if (lap) lap('life+zones+groundFx');
      if (shadows >= 2) this.castShadows(ctx, G);
      if (lap) lap('castShadows');
      RS.Plug.draw(ctx, G, this);
      RS.Stash.drawAltars(ctx, G, this);
      this.drawPickups(ctx, G, v, pulse);
      if (lap) lap('pickups');

      this.crowdShadows(ctx, G);
      for (const d of draws) {
        if (d.P) RS.Arena.drawProp(ctx, G, d);
        else if (d.boss) this.drawBoss(ctx, G, d);
        else this.drawEnemy(ctx, G, d);
      }
      if (lap) lap('entities');
      // the player always renders above the crowd so you never lose yourself
      const px0 = p.x, py0 = p.y; p.x = this.hsx; p.y = this.hsy; // drawn at the pixel-locked position
      try {
        if (!p.dead || S.heroSheets[p.id]) this.drawPlayer(ctx, G, p); // sheet heroes play a death animation
        // weapon overlays (orbiting crosses, clouds)
        if (!p.dead) for (const w of p.weapons) if (w.def.draw) w.def.draw(ctx, w, p, G);
      } finally { p.x = px0; p.y = py0; }
      if (lap) lap('player+weapons');
      const fx = this.pixBegin();
      this.drawZones(fx, G, v, true);
      this.drawProjectiles(fx, G, v);
      if (lap) lap('projectiles');
      FX.noBoom = true; FX.draw(fx, v); FX.noBoom = false;
      this.pixEnd(ctx);
      FX.drawBooms(ctx, v); // the explosions are pixel sprites already: drawn at their own integer scale on top
      if (lap) lap('fx');

      // lighting: GPU light map + bloom queue, or the Canvas 2D fallback
      RS.Arena.lights(G, v);
      this.registerLights(G, v);
      // NIGHT / STORM: on the GPU path the compositor's ambient level drops (the light map, with a strong light around
      // the hero, brings the scene back); on the Canvas 2D path lightPass paints the dark layer with light holes
      const nightK = RS.Weather.dark(G);
      Post.amb = 1 - nightK; Post.ambTint = nightK > 0 ? G.mapMode.ambTint : WHITE3;
      if (!Post.active) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.lightPass(ctx, G);
        ctx.setTransform(z, 0, 0, z, ex, ey);
        Post.drawFallback(ctx);
      }
      if (G.mapMode && (G.mapMode.rain || G.mapMode.lightning)) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (G.mapMode.rain) RS.Weather.drawRain(ctx, W, H, G.fdt || 0, cam.x, cam.y, z);
        RS.Weather.drawStrike(ctx, W, H);
        ctx.setTransform(z, 0, 0, z, ex, ey);
      }
      if (lap) lap('lights');
      // threats always readable on top
      if (G.teles.length || G.eshots.list.some((s) => !s.dead)) {
        const tx = this.pixBegin();
        this.drawTelegraphs(tx, G);
        this.drawEnemyShots(tx, G, v);
        this.pixEnd(ctx);
      }
      // damage numbers + world labels are drawn later by the HUD on the sharp canvas

      // screen-space post (the GPU compositor adds its own vignette + grading)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!Post.active) {
        ctx.drawImage(this.vignSoft, 0, 0);
        if (Post.trip > 0.01) { ctx.globalAlpha = Math.min(0.6, Post.trip); ctx.drawImage(this.tripVign(Post.tripCol), 0, 0); ctx.globalAlpha = 1; } // LOW: tinted edges stand in for the shader warp
        if (set.crt > 0.01) { ctx.globalAlpha = set.crt * 0.3; ctx.drawImage(this.scanlines(W, H), 0, 0); ctx.globalAlpha = 1; } // CRT without the shader
      }
      if (pulse > 0 && set.screenFx) { ctx.globalAlpha = pulse * 0.12; ctx.drawImage(this.pulseV, 0, 0); ctx.globalAlpha = 1; }
      const low = p.hp / p.s.maxHp;
      if (low < 0.3 && !p.dead) { ctx.globalAlpha = (0.3 - low) * 1.6 * (0.6 + Math.sin(G.time * 6) * 0.4); ctx.drawImage(this.hurtV, 0, 0); ctx.globalAlpha = 1; }
      if (FX.hurtA > 0) { ctx.globalAlpha = Math.min(1, FX.hurtA); ctx.drawImage(this.hurtV, 0, 0); ctx.globalAlpha = 1; }
      if (FX.flashA > 0) { ctx.globalAlpha = FX.flashA * 0.6; ctx.fillStyle = FX.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (set.screenFx) this.postFx(ctx, G);
      if (lap) lap('telegraphs+screenPost');
    },

    resetT(ctx) { ctx.setTransform(this.z, 0, 0, this.z, this.ex, this.ey); },
    // CRT scanlines for the Canvas 2D path (the GPU compositor draws its own): ~270 lines, built once per screen size
    scanlines(W, H) {
      const k = W + 'x' + H;
      if (this.scanK === k) return this.scanC;
      const c = S.cv(W, H), x = c.getContext('2d'), sp = Math.max(2, Math.round(H / 270));
      x.fillStyle = '#000';
      for (let y = 0; y < H; y += sp) x.fillRect(0, y, W, Math.max(1, sp >> 1));
      this.scanK = k; this.scanC = c;
      return c;
    },
    // Pixel FX layer: zones, auras, projectiles, lasers, particles, attack warnings and enemy shots draw into a
    // low-res buffer (1 buffer pixel = about one explosion pixel) that is scaled up nearest-neighbour, so every effect
    // gets the same hard square pixels as the explosions instead of smooth vector edges. The buffer grid is anchored to
    // the world (whole buffer pixels of camera offset, the rest is applied when it is blitted), so edges do not crawl
    // while the camera moves. pixBegin() swaps in the buffer transform (rotAt / resetT follow it); pixEnd() blits it.
    // Every pass of a frame gets its own buffer: clearing a buffer that was just blitted makes the GPU wait for that
    // blit (measured ~2.3 ms per frame with three passes sharing one buffer, ~0.25 ms with one buffer each).
    pixBegin() {
      const P = this.pixP = Math.max(2, Math.round(this.z * 2.6)), w = Math.ceil(this.W / P) + 2, h = Math.ceil(this.H / P) + 2;
      const i = this.pixN++ & 7; let b = this.pixBufs[i];
      if (!b || b.c.width !== w || b.c.height !== h) { const c = S.cv(w, h); b = this.pixBufs[i] = { c, x: c.getContext('2d') }; }
      this.pix = b.c; this.pctx = b.x;
      const x = this.pctx, bx = Math.floor(this.ex / P) + 1, by = Math.floor(this.ey / P) + 1;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
      this._pv = [this.z, this.ex, this.ey, this.ex - bx * P, this.ey - by * P];
      this.z /= P; this.ex = bx; this.ey = by;
      x.setTransform(this.z, 0, 0, this.z, bx, by);
      x.imageSmoothingEnabled = false;
      return x;
    },
    pixEnd(ctx) {
      const P = this.pixP, sv = this._pv;
      this.z = sv[0]; this.ex = sv[1]; this.ey = sv[2];
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.pix, sv[3], sv[4], this.pix.width * P, this.pix.height * P);
      this.resetT(ctx);
    },
    tripVign(col) {
      if (this._tvCol !== col || !this._tv || this._tv.width !== this.W || this._tv.height !== this.H) {
        const c = this._tv && this._tv.width === this.W && this._tv.height === this.H ? this._tv : S.cv(this.W, this.H), x = c.getContext('2d');
        x.clearRect(0, 0, this.W, this.H);
        const g = x.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.hypot(this.W, this.H) / 2);
        g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(1, U.rgba(col, 0.55));
        x.fillStyle = g; x.fillRect(0, 0, this.W, this.H);
        this._tv = c; this._tvCol = col;
      }
      return this._tv;
    },
    rotAt(ctx, px, py, ang) {
      const z = this.z, c = Math.cos(ang) * z, s = Math.sin(ang) * z;
      ctx.setTransform(c, s, -s, c, px * z + this.ex, py * z + this.ey);
    },

    // ------------------------------------------------------------ shadows
    // soft elliptical contact shadow; `ao` adds a wide, faint occlusion pool for props
    shadowImg: null,
    contact(ctx, x, y, rx, ry, a, ao) {
      // one shared gradient sprite for every contact shadow: batches far better than per-entity ellipse paths
      if (!(RS.Save.s.shadows | 0)) ao = false;
      if (!this.shadowImg) {
        const c = S.cv(64, 64), x2 = c.getContext('2d'), g = x2.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x2.fillStyle = g; x2.fillRect(0, 0, 64, 64); this.shadowImg = c;
      }
      const img = this.shadowImg;
      ctx.globalAlpha = Math.min(1, a * 1.2);
      ctx.drawImage(img, x - rx * 1.3, y - ry * 1.3, rx * 2.6, ry * 2.6);
      if (ao) { ctx.globalAlpha = a * 0.45; ctx.drawImage(img, x - rx * 2, y - ry * 1.9, rx * 4, ry * 3.8); }
      ctx.globalAlpha = 1;
    },
    // contact shadows of every visible enemy in one pass, before any of them is drawn (they all sit on the ground)
    crowdShadows(ctx, G) {
      if (!this.shadowA) {
        this.contact(ctx, -1e5, -1e5, 1, 1, 0); // builds shadowImg
        const mk = (a) => { const c = S.cv(64, 64), x = c.getContext('2d'); x.globalAlpha = a; x.drawImage(this.shadowImg, 0, 0); return c; };
        this.shadowA = mk(Math.min(1, 0.42 * 1.2)); this.shadowGhost = mk(0.42 * 0.6 * 1.2);
      }
      const t = G.time;
      for (const e of draws) {
        if (e.P || e.boss || e.spawning > 0) continue;
        const def = e.def, hover = def.ghost ? 10 + Math.sin(t * 3 + e.ph) * 4 : 0, air = Math.max(0, 1 - ((e.z || 0) + hover) / 160);
        if (air <= 0) continue;
        const rx = e.r * 1.05 * air, ry = e.r * 0.38 * air, fy = e.y + e.r * 0.9;
        ctx.drawImage(def.ghost ? this.shadowGhost : this.shadowA, e.x - rx * 1.3, fy - ry * 1.3, rx * 2.6, ry * 2.6);
      }
    },
    // hallucination look (pink + cyan ghosts around the sprite) pre-composited per frame and ghost offset:
    // one drawImage instead of three per hallucination
    ghostImg(es, img, left, step) {
      let arr = ghostCache.get(img);
      if (!arr) { arr = []; ghostCache.set(img, arr); }
      let c = arr[step];
      if (!c) {
        const off = [1.2, 2.5, 3.8][step] / (es.gsc || 1), pad = 5, iw = img.width, ih = img.height;
        c = S.cv(iw + pad * 2, ih + pad * 2); c._pad = pad;
        const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
        x.globalAlpha = 0.38;
        x.drawImage(left ? es.pinkL : es.pink, pad - off, pad); x.drawImage(left ? es.cyanL : es.cyan, pad + off, pad + 0.4);
        x.globalAlpha = 1; x.drawImage(img, pad, pad);
        arr[step] = c;
      }
      return c;
    },
    // pre-blurred black silhouette per sprite frame (built once, cached on a WeakMap)
    shadowOf(img) {
      let c = shadowCache.get(img);
      if (!c) {
        c = S.cv(img.width + 6, img.height + 6);
        const x = c.getContext('2d');
        if ('filter' in x) x.filter = 'blur(1.2px)';
        x.drawImage(S.silhouette(img, '#000000'), 3, 3);
        shadowCache.set(img, c);
      }
      return c;
    },
    // sun from the upper left: silhouettes are flipped and sheared onto the ground towards the lower right
    castShadow(ctx, img, x, footY, w, h, a, flat) {
      const sh = this.shadowOf(img), pad = 3 * w / img.width;
      ctx.globalAlpha = a;
      if (flat) { ctx.drawImage(sh, x - w / 2 - pad + 7, footY - h - pad + 9, w + pad * 2, h + pad * 2); ctx.globalAlpha = 1; return; }
      const z = this.z; // camera * translate(foot) * shear: one setTransform instead of save/restore
      ctx.setTransform(z, 0, -0.55 * z, -0.42 * z, x * z + this.ex, footY * z + this.ey);
      ctx.drawImage(sh, -w / 2 - pad, -h - pad, w + pad * 2, h + pad * 2);
      this.resetT(ctx); ctx.globalAlpha = 1;
    },
    castShadows(ctx, G) {
      for (const d of draws) {
        if (!d.P && !d.boss && !d.elite) continue;
        const f = this.frameOf(d, G);
        if (f) this.castShadow(ctx, f.img, f.x, f.foot, f.w, f.h, f.prop ? 0.26 : 0.2, f.flat);
      }
      const p = G.p;
      if (!p.dead) { const f = this.frameOf(p, G); if (f) this.castShadow(ctx, f.img, f.x, f.foot - (p.z || 0) * 0, f.w, f.h, 0.24); }
    },
    // current sprite frame + placement of any drawable (props, enemies, bosses, player); shared by shadows + reflections
    frameOf(d, G) {
      const F = this._f || (this._f = {});
      if (d.P) {
        let img = S.props[d.P.sprite]; if (Array.isArray(img)) img = img[d.var % img.length];
        const sc = this.pixK(img._sc || d.P.scale); // same whole-pixel scale as Arena.drawProp
        F.img = img; F.w = img.width * sc; F.h = img.height * sc; F.x = d.x; F.foot = d.y + (d.hh || d.P.circle || 10) + (d.P.oy || 0) + 6;
        F.prop = true; F.flat = d.P.sprite === 'carV' || d.P.sprite === 'pallet';
        return F;
      }
      F.prop = false; F.flat = false;
      if (d === G.p) {
        const HF = this.heroFrame(d, G);
        if (HF) { F.img = HF.img; F.w = HF.w; F.h = HF.h; F.x = d.x - HF.fx + HF.w / 2; F.foot = d.y + 25; return F; }
        const spr = d.spr, moving = d.moving || d.dash.t > 0, fr = Math.floor(d.anim) % 4;
        const img = (moving ? (d.facing < 0 ? spr.runL : spr.run) : (d.facing < 0 ? spr.idleL : spr.idle))[fr];
        F.img = img; F.w = img.width * HERO_SCALE; F.h = img.height * HERO_SCALE; F.x = d.x; F.foot = d.y + 26;
        return F;
      }
      if (d.spawning > 0) return null;
      if (d.boss) {
        const B = d.bdef; if (!B.sprite) return null;
        const bs = S.bosses[B.sprite], sc = d.scale;
        F.img = G.p.x < d.x ? bs.imgL : bs.img; F.w = bs.w * sc; F.h = bs.h * sc; F.x = d.x; F.foot = d.y + d.r * 0.9;
        return F;
      }
      const ea = this.enemyArt(d);
      if (ea) { // painted enemy: its current frame cut out once into its own canvas (cast shadows, puddles)
        const k = (ea.A.body * (d.scale / d.def.scale)) / ea.sh.body, P = this.enemyPose(d, G, ea.A, ea.sh), f = P.f, fl = P.flip;
        const key = fl ? 'cL' : 'c';
        if (!f[key]) {
          const c = S.cv(f.w, f.h), x = c.getContext('2d');
          x.drawImage(S.enemyAtlas(ea.sh, 0, fl), fl ? ea.sh.W - f.x - f.w : f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
          f[key] = c;
        }
        F.img = f[key]; F.w = f.w * k; F.h = f.h * k; F.foot = d.y + d.r * 0.9 + (f.h - f.ay) * k;
        F.x = d.x - ((fl ? f.w - f.ax : f.ax) - f.w / 2) * k; // centre of the frame box
        return F;
      }
      const es = S.enemies[d.type], T = es.tiers[d.tier] || es.tiers[0], sc = d.scale;
      F.img = (d.facing < 0 ? T.framesL : T.frames)[Math.floor(d.anim) % 4]; F.w = es.w * sc; F.h = es.h * sc; F.x = d.x; F.foot = d.y + d.r * 0.9 + 3;
      return F;
    },

    // ------------------------------------------------------------ wet asphalt
    // puddles mirror whatever stands above them: flipped, squashed, wobbling sprites clipped to the water
    drawReflections(ctx, G, v) {
      const A = G.arena;
      if (!A.puddles) return;
      const t = G.time, p = G.p;
      for (const d of A.puddles) {
        const b = d.box;
        if (b[2] < v.x0 || b[0] > v.x1 || b[3] < v.y0 || b[1] > v.y1 || !d.path) continue;
        ctx.save(); ctx.clip(d.path);
        ctx.globalAlpha = 0.36;
        const reflect = (f) => {
          if (f.flat) return;
          const top = f.foot + f.h * 0.75;
          if (f.foot > b[3] + 4 || top < b[1] || f.x + f.w / 2 < b[0] || f.x - f.w / 2 > b[2]) return;
          const img = f.img, sh = img.height / 3;
          ctx.save(); ctx.translate(f.x, f.foot + 1); ctx.scale(1, -0.75);
          for (let k = 0; k < 3; k++) {
            const dx = Math.sin(t * 2.2 + f.foot * 0.07 + k * 1.7) * 1.3;
            ctx.drawImage(img, 0, k * sh, img.width, sh, -f.w / 2 + dx, -f.h + (k * f.h) / 3, f.w, f.h / 3 + 0.6);
          }
          ctx.restore();
        };
        // only bodies standing near this puddle can show in it: a cheap position check first (a frame's feet sit 12-55
        // below its y, it is at most ~180 tall and ~160 wide), so a crowd of 300 no longer cuts out 300 frames a puddle
        // (measured 2.9 ms a frame with three puddles on screen)
        for (const e of draws) {
          if (e.y > b[3] + 4 || e.y + 400 < b[1] || e.x + 250 < b[0] || e.x - 250 > b[2]) continue;
          const f = this.frameOf(e, G); if (f) reflect(f);
        }
        if (!p.dead) reflect(this.frameOf(p, G));
        // murky water tint, then two expanding drip ripples
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(24,34,52,0.16)'; ctx.fill(d.path);
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.42 + d.ph + k * 0.5) % 1, bl = d.blobs[k % d.blobs.length], r = 3 + ph * 24;
          ctx.strokeStyle = 'rgba(235,242,255,' + (0.28 * (1 - ph)) + ')'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(d.x + bl[0] * 0.5, d.y + bl[1] * 0.5, r, r * 0.38, 0, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
    },
    // small signs of life: glinting glass
    drawLife(ctx, G, v) {
      const A = G.arena, t = G.time;
      if (A.glass) for (const d of A.glass) {
        if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
        const tw = Math.sin(t * 2.3 + d.ph * 7);
        if (tw < 0.9) continue;
        const k = (tw - 0.9) * 10, x = d.x + d.pts[0], y = d.y + d.pts[1];
        ctx.globalAlpha = k; ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 3, y - 0.5, 6, 1); ctx.fillRect(x - 0.5, y - 3, 1, 6);
        RS.Post.glow(x, y, 7, '#ffffff', k * 0.9);
      }
      ctx.globalAlpha = 1;
    },
    // dynamic light sources (GPU path)
    registerLights(G, v) {
      const Post = RS.Post, p = G.p;
      if (!Post.active) return;
      const M = G.mapMode, night = RS.Weather.dark(G) > 0;
      if (!p.dead) Post.light(p.x, p.y, 300, '#fff4dc', 0.22);
      if (night) {
        // the hero's own glow carries the night (ambient is down to 1 - dark): bright core, soft falloff to the dark
        Post.light(p.x, p.y, M.heroLight, '#e4ecff', 3); // ~full brightness to 150 px, 60% at 300, ambient by heroLight
        // threats keep their full colour: every live attack warning and elite lights itself up
        let q = 0;
        for (const t of G.teles) {
          if (q > 48) break;
          if (t.kind === 'circle') { Post.light(t.x, t.y, t.r * 1.4 + 30, t.col, 1.6); q++; }
          else if (t.kind === 'line') {
            const n = Math.min(8, Math.ceil(t.len / 130)), c = Math.cos(t.ang), s = Math.sin(t.ang), r = Math.max(80, t.w * 1.8);
            for (let i = 0; i <= n; i++) { Post.light(t.x + c * t.len * i / n, t.y + s * t.len * i / n, r, t.col, 1.2); q++; }
          } else if (t.kind === 'rect') { Post.light(t.x + t.w / 2, t.y + t.h / 2, Math.max(t.w, t.h) * 0.8, t.col, 1.2); q++; }
        }
        for (const e of G.enemies.list) if (!e.dead && e.elite && e.x > v.x0 - 60 && e.x < v.x1 + 60 && e.y > v.y0 - 60 && e.y < v.y1 + 60) Post.light(e.x, e.y, 110, '#ffd75a', 0.8);
        if (G.plug && !(G.plug.leaving > 0)) Post.light(G.plug.x, G.plug.y - 20, 200, '#9cff35', 1.2);
      }
      for (let i = G.lightsFrame.length - 1; i >= 0; i--) {
        const l = G.lightsFrame[i];
        Post.light(l.x, l.y, l.r * 1.2, '#ffb35a', Math.min(1, l.t * 4));
        l.t -= 1 / 60;
        if (l.t <= 0) G.lightsFrame.splice(i, 1);
      }
      let n = 0;
      for (const pr of G.projs.list) { if (pr.dead || n++ > 40) continue; Post.light(pr.x, pr.y, pr.kind === 'bass' ? 160 : 80, pr.col, 0.22); }
      for (const z2 of G.zones.list) if (!z2.dead && z2.kind !== 'slash' && z2.kind !== 'stab' && z2.kind !== 'cone' && z2.kind !== 'mine') Post.light(z2.x, z2.y, Math.max(80, z2.r * 1.3), z2.kind === 'fire' ? '#ff7a1a' : z2.col, 0.3);
      for (const b of G.bosses) Post.light(b.x, b.y, 300, b.bdef.col || '#ff2448', 0.35);
      for (const k of G.pickups.list) if (k.kind === 'stash') Post.light(k.x, k.y, 110, RS.Data.RARITY[k.tier].col, 0.4);
      for (const k of G.pickups.list) if (k.kind === 'chest' || k.kind === 'thumb') Post.light(k.x, k.y, 130, k.kind === 'thumb' ? '#ff4f6e' : k.tier === 'boss' ? '#ff2448' : k.tier === 'legendary' ? '#ffcf3f' : '#e3ece6', 0.45);
      n = 0;
      for (const s2 of G.eshots.list) { if (s2.dead || n++ > 40) continue; Post.light(s2.x, s2.y, night ? 70 : 60, s2.col, night ? 1.1 : 0.35); }
    },
    // muzzle point of the held pistol (matches drawGun)
    muzzlePos(p, ang) {
      const SH = S.heroSheets[p.id];
      if (SH) {
        // the barrel tip of the frame that will be on screen for this shot (same pick as heroFrame)
        // the body always faces the move heading (guns fire inside a cone around it), so pick the row from that
        const gx = Math.cos(ang), d = this.heroDir(p, p.aimX || 0, p.aimY === undefined ? 1 : p.aimY, RS.Game.time);
        let f, fl = false;
        if (p.moving || p.dash.t > 0 || Math.hypot(p.vx || 0, p.vy || 0) > 70) {
          const set = SH['walk_' + d];
          const k = set ? Math.floor(p.anim * set.length * 0.15) : 0;
          f = set && set[((k % set.length) + set.length) % set.length];
        } else {
          const set = SH[d === 'down' ? 'shoot_down' : d === 'up' ? 'shoot_up' : 'shoot_right'];
          f = set && set[1]; fl = d === 'left' || ((d === 'down' || d === 'up') && gx < 0);
        }
        if (f && f.mx >= 0) {
          const K = SHEET_K * (f.s || 1);
          return { x: p.x + ((fl ? f.w - f.mx : f.mx) - (fl ? f.fxL : f.fx)) * K, y: p.y + 25 + (f.my - f.fy) * K - (p.z || 0) };
        }
        const y = p.y + 22 - 66 * 0.6 - (p.z || 0);
        return { x: p.x + Math.cos(ang) * 32, y: y + Math.sin(ang) * 10 };
      }
      const img = p.spr.idle[0], h = img.height * HERO_SCALE, y = p.y + 22 - h * 0.42 - (p.z || 0);
      return { x: p.x + Math.cos(ang) * 8 + Math.cos(ang) * 24, y: y + Math.sin(ang) * 4 + Math.sin(ang) * 24 - 1 };
    },

    postFx(ctx, G, scanA) {
      const W = this.W, H = this.H;
      if (!this.scan) this.scan = ctx.createPattern(this.scanCanvas, 'repeat');
      ctx.globalAlpha = scanA === undefined ? 0.06 : scanA; ctx.fillStyle = this.scan; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      // VHS specks and glitch slices re-roll on a fixed 24 Hz tick, not per rendered frame (no high-refresh flicker)
      const tk = Math.floor(performance.now() / 41.67) * 16, hs = U.hash;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 3; i++) ctx.fillRect(hs(tk + i * 3) * W, hs(tk + i * 3 + 1) * H, 20 + hs(tk + i * 3 + 2) * 100, 1);
      if (FX.glitchT > 0) {
        const n = 3 + Math.floor(FX.glitchT * 10);
        for (let i = 0; i < n; i++) {
          const q = tk + 101 + i * 5, y = hs(q) * H, h = 4 + hs(q + 1) * 26, dx = (hs(q + 2) - 0.5) * 60;
          ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
        }
        ctx.globalAlpha = 0.1; ctx.fillStyle = hs(tk + 7) < 0.5 ? '#ff2448' : '#e3ece6';
        ctx.fillRect(0, hs(tk + 9) * H, W, 2 + hs(tk + 11) * 8); ctx.globalAlpha = 1;
      }
    },

    // ------------------------------------------------------------ lighting
    // Canvas 2D path (no WebGL or LOW lighting); NIGHT / STORM raise the darkness and tint it
    lightPass(ctx, G, gpu) {
      const L = this.light, lx = this.lctx, cam = G.cam, z = cam.zoom, W = this.W, H = this.H, A = G.arena, p = G.p;
      const k = 0.25, M = G.mapMode, nightK = RS.Weather.dark(G), dark = Math.max(A.def.dark, nightK > 0 ? Math.min(0.85, nightK + 0.12) : 0); // +0.12: the 2D layer has no light-map contrast to lean on
      // bright maps (dark < 0.08) skip the full-screen darkness layer entirely: it cost a full-screen blit for a 5% dim
      if (dark < 0.08) { if (!gpu) { G.lightsFrame.length = 0; this.lampGlows(ctx, G); } return; }
      lx.globalCompositeOperation = 'source-over';
      lx.clearRect(0, 0, L.width, L.height);
      lx.fillStyle = 'rgba(' + (nightK > 0 ? M.tint : '3,2,8') + ',' + dark.toFixed(3) + ')';
      lx.fillRect(0, 0, L.width, L.height);
      lx.globalCompositeOperation = 'destination-out';
      const sx = (x) => ((x - cam.x) * z + W / 2) * k, sy = (y) => ((y - cam.y) * z + H / 2) * k;
      const hole = (x, y, r, a) => {
        const rr = r * z * k;
        const X = sx(x), Y = sy(y);
        if (X < -rr || Y < -rr || X > L.width + rr || Y > L.height + rr) return;
        lx.globalAlpha = a;
        lx.drawImage(this.cut, X - rr, Y - rr, rr * 2, rr * 2);
      };
      const nightOn = nightK > 0;
      hole(p.x, p.y, nightOn ? M.heroLight : 330, 1);
      for (const lm of A.lamps) {
        let a = nightOn ? 0.65 : 0.75;
        if (lm.flick) a *= Math.sin(G.time * 13 + lm.ph) > -0.6 ? 1 : 0.2;
        hole(lm.x, lm.y, nightOn ? 210 : 190, a);
      }
      for (let i = G.lightsFrame.length - 1; i >= 0; i--) {
        const l = G.lightsFrame[i];
        hole(l.x, l.y, l.r, Math.min(1, l.t * 4));
        if (gpu) continue;
        l.t -= 1 / 60;
        if (l.t <= 0) G.lightsFrame.splice(i, 1);
      }
      if (nightOn) {
        // at night the things you need to find glow on their own: toxic crates, hazard lights, THE PLUG,
        // elites (chest carriers)
        const v = G.view();
        for (const pr of A.props) {
          if (pr.dead || pr.x < v.x0 - 200 || pr.x > v.x1 + 200 || pr.y < v.y0 - 200 || pr.y > v.y1 + 200) continue;
          if (pr.P.glow) hole(pr.x, pr.y, 120, 0.6);
          else if (pr.haz && ((G.time * 1.6 + pr.hazPh) % 1) < 0.5) hole(pr.x, pr.y, 90, 0.4);
        }
        if (G.plug && !(G.plug.leaving > 0)) hole(G.plug.x, G.plug.y - 20, 170, 0.85);
        for (const a of G.altars || []) if (a.state !== 'done') hole(a.x, a.y - 30, 190, 0.85);
        for (const e of G.enemies.list) if (!e.dead && e.elite && e.x > v.x0 - 60 && e.x < v.x1 + 60 && e.y > v.y0 - 60 && e.y < v.y1 + 60) hole(e.x, e.y, 90, 0.55);
      }
      let n = 0;
      for (const pr of G.projs.list) { if (n++ > 50) break; hole(pr.x, pr.y, pr.kind === 'bass' ? 120 : 60, 0.6); }
      for (const z2 of G.zones.list) if (z2.kind !== 'slash' && z2.kind !== 'stab' && z2.kind !== 'cone') hole(z2.x, z2.y, Math.max(60, z2.r * 1.3), 0.5);
      for (const b of G.bosses) hole(b.x, b.y, 260, 0.8);
      for (const k2 of G.pickups.list) if (k2.kind === 'chest' || k2.kind === 'thumb' || k2.kind === 'stash') hole(k2.x, k2.y, 110, 0.8);
      for (const pr of A.props) if (pr.P.hazard === 'panel' && pr.active > 0) hole(pr.x, pr.y, 200, 0.9);
      lx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(L, 0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      if (!gpu) this.lampGlows(ctx, G);
    },
    // A top-down snapshot of the real deck around the start point for the pregame map cards: the arena is built from
    // a fixed seed and its floor and props are drawn once at a small zoom (Canvas 2D, cached per size). The normalised
    // positions of the aisle lights ride along on the canvas (_lamps) for the night previews.
    mapPreview(w, h) {
      if (this._mp && this._mp.width === w && this._mp.height === h) return this._mp;
      const keep = { W: this.W, H: this.H, ex: this.ex, ey: this.ey, z: this.z }, rnd = Math.random;
      let seed = 2021;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const c = S.cv(w, h), ctx = c.getContext('2d');
      try {
        const A = RS.Arena.build(RS.Data.ARENAS.garage), z = h / 760, cx = A.w / 2, cy = A.h / 2;
        this.W = w; this.H = h; this.z = z; this.ex = Math.round(w / 2 - cx * z); this.ey = Math.round(h / 2 - cy * z);
        const G = { arena: A, cam: { zoom: z }, time: 0, p: { x: cx, y: cy } };
        const v = { x0: cx - w / 2 / z, x1: cx + w / 2 / z, y0: cy - h / 2 / z, y1: cy + h / 2 / z };
        ctx.fillStyle = A.def.bg; ctx.fillRect(0, 0, w, h);
        RS.Arena.drawFloor(ctx, G, v);
        ctx.setTransform(z, 0, 0, z, this.ex, this.ey);
        const list = [];
        RS.Arena.propDrawables(G, v, list);
        list.sort((a, b) => (a.y + (a.hh || a.P.circle || 10)) - (b.y + (b.hh || b.P.circle || 10)));
        for (const pr of list) RS.Arena.drawProp(ctx, G, pr);
        const toN = (x, y) => [(x * z + this.ex) / w, (y * z + this.ey) / h];
        c._lamps = A.lamps.map((l) => toN(l.x, l.y)).filter(([x, y]) => x > -0.1 && x < 1.1 && y > -0.1 && y < 1.1);
      } finally {
        Math.random = rnd; Object.assign(this, keep);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      this._mp = c;
      return c;
    },
    // colored lamp glow (Canvas 2D path)
    lampGlows(ctx, G) {
      const cam = G.cam, z = cam.zoom, W = this.W, H = this.H, A = G.arena;
      ctx.save();
      ctx.setTransform(z, 0, 0, z, this.ex, this.ey);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1;
      const g = S.glow(A.def.light, 110);
      const v = G.view();
      for (const lm of A.lamps) {
        if (lm.x < v.x0 - 120 || lm.x > v.x1 + 120 || lm.y < v.y0 - 120 || lm.y > v.y1 + 120) continue;
        if (lm.flick && Math.sin(G.time * 13 + lm.ph) < -0.6) continue;
        ctx.drawImage(g, lm.x - 110, lm.y - 110);
      }
      ctx.restore();
    },

    // ------------------------------------------------------------ player
    // Hand-drawn hero sheet: pick the frame for the current state. Priority: death > hurt > drink / pick-up >
    // walk (4 directions, from the move heading) > shoot (aimed at the target, mirrored for the left side) >
    // TOO TURNT "geeked" loop > idle. Returns null for heroes without a sheet (procedural sprite path).
    heroFrame(p, G) {
      const SH = S.heroSheets[p.id];
      if (!SH) return null;
      // the walk plays until the hero has really slowed down, so no idle pose slides over the floor
      const t = G.time, moving = p.moving || p.dash.t > 0 || Math.hypot(p.vx || 0, p.vy || 0) > 70;
      const dir = () => this.heroDir(p, p.aimX || 0, p.aimY === undefined ? 1 : p.aimY, t);
      let set, i = 0, fl = false;
      // the gun stays up between shots (GLOCK fires every 0.6 s): a shorter window flipped the pose every shot
      const since = p.gunT !== undefined ? t - p.gunT : 9, hot = since < 1.1;
      if (p.dead) { set = SH.death; i = Math.min(3, Math.floor((performance.now() - (p.deadAt || 0)) / 170)); fl = p.facing < 0; }
      else if (p.hurtFlash > 0) { set = SH.hurt; i = p.hurtFlash > 0.11 ? 0 : 1; fl = p.facing < 0; }
      else if (p.drinkT > 0 && !moving) { set = SH.drink; i = Math.min(4, Math.floor((0.9 - p.drinkT) / 0.18)); fl = p.facing < 0; }
      else if (p.pickT > 0 && !moving) { set = SH.pickup; i = Math.min(4, Math.floor((0.5 - p.pickT) / 0.1)); fl = p.facing < 0; }
      else if (moving) {
        // walk + aim cycle (gun up the whole time): always faces and steps the way you walk. Guns fire inside a
        // cone around that heading, so the gun never points behind the body and there is no backpedal / moonwalk.
        set = SH['walk_' + dir()];
        const k = Math.floor(p.anim * set.length * 0.15); // one cycle every ~0.74 s at full speed, whatever the frame count
        i = ((k % set.length) + set.length) % set.length;
      }
      else if (hot) {
        // shoot rows aim down (front), right (side) or up (back); the left side is the right row mirrored.
        // The row comes from the facing (last move heading), the same as the walk, so stopping never turns the hero.
        const d = dir();
        set = SH[d === 'down' ? 'shoot_down' : d === 'up' ? 'shoot_up' : 'shoot_right'];
        i = since < 0.05 ? 1 : since < 0.15 ? 2 : since < 0.45 ? 0 : 3;
        // the front / back rows hold the gun in the right hand: mirrored when the target is on the left (with hysteresis)
        const cx = Math.cos(p.gunAng);
        p._sfl = p._sfl ? cx < 0.12 : cx < -0.12;
        fl = d === 'left' || ((d === 'down' || d === 'up') && p._sfl);
      }
      else if (p.ability.t > 0 && p.id === 'twizzy') { set = SH.geeked; i = Math.floor(t * 8) % 5; fl = p.facing < 0; }
      else set = SH['idle_' + dir()];
      const f = set[i % set.length], K = SHEET_K * (f.s || 1);
      const R2 = this._hf || (this._hf = {});
      R2.img = fl ? f.imgL : f.img; R2.fx = (fl ? f.fxL : f.fx) * K; R2.fy = f.fy * K; R2.w = f.w * K; R2.h = f.h * K;
      return R2;
    },
    // 4-way facing with hysteresis: the current side keeps a bonus, and a new side has to hold for 0.2 s, so an
    // auto-aim target near a diagonal (or a stick wobble) never flickers the sprite between rows
    heroDir(p, x, y, t) {
      const prev = p._hd, l = Math.hypot(x, y) || 1;
      let best = 'down', bs = -1e9;
      for (let i = 0; i < 4; i++) {
        const k = DIRS[i], s = (i === 0 ? x * 1.15 : i === 1 ? -x * 1.15 : i === 2 ? y : -y) + (k === prev ? 0.3 * l : 0);
        if (s > bs) { bs = s; best = k; }
      }
      if (prev && best !== prev && t - (p._hdT || 0) < 0.2) return prev;
      if (best !== prev) { p._hd = best; p._hdT = t; }
      return best;
    },
    drawHeroSheet(ctx, G, p, HF) {
      const zz = p.z || 0, footY = p.y + 22;
      if (!p.dead) {
        if (p.ability.t > 0 && p.id === 'twizzy') RS.Post.glow(p.x, footY - HF.h * 0.45, 46, '#b45cff', 0.55); // geeked aura
        this.contact(ctx, p.x, footY, 17 * (1 - zz / 260), 6 * (1 - zz / 260), 0.5);
        ctx.strokeStyle = U.rgba(p.char.color, 0.75); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, footY, 22, 8, 0, 0, TAU); ctx.stroke();
      }
      // body language: lean into the run, stretch on a dash, squash on a landing (pivot at the feet)
      const sq = p.sq || 0, lean = p.dead ? 0 : U.clamp(p.vx / 2600, -0.07, 0.07);
      const sx = 1 + Math.abs(sq) * (sq < 0 ? 0.8 : 0.6), sy = 1 - Math.abs(sq) * (sq < 0 ? 1 : 0.45);
      const posed = lean !== 0 || sq !== 0;
      if (posed) { ctx.save(); ctx.translate(p.x, footY); ctx.rotate(lean); ctx.scale(sx, sy); ctx.translate(-p.x, -footY); }
      const x = p.x - HF.fx, y = footY + 3 - HF.fy - zz;
      ctx.imageSmoothingEnabled = true; // the sheet is drawn at ~0.6x: filtered downscale keeps it clean
      if (!p.dead && (p.dash.t > 0 || (p.ability.t > 0 && p.id === 'twizzy'))) {
        for (let i = 2; i < p.trail.length; i += 2) {
          const t = p.trail[i];
          ctx.globalAlpha = 0.28 - i * 0.025;
          ctx.drawImage(HF.img, t.x - HF.fx, t.y + 25 - HF.fy - zz, HF.w, HF.h);
        }
        ctx.globalAlpha = 1;
      }
      // invulnerable after a hit: a soft 3 Hz pulse instead of the old 10 Hz on/off blink
      ctx.globalAlpha = p.invuln > 0 && p.hurtFlash <= 0 && p.dash.t <= 0 && !p.dead ? 0.62 + 0.23 * Math.cos(G.time * 18.85) : 1;
      ctx.drawImage(HF.img, x, y, HF.w, HF.h);
      if (p.hurtFlash > 0 && !p.dead) {
        let wh = whiteCache.get(HF.img);
        if (!wh) { wh = S.silhouette(HF.img, '#ffffff'); whiteCache.set(HF.img, wh); }
        ctx.globalAlpha = p.hurtFlash * 3; ctx.drawImage(wh, x, y, HF.w, HF.h);
      }
      ctx.globalAlpha = 1;
      if (posed) ctx.restore();
      ctx.imageSmoothingEnabled = false;
      if (p.dead) return;
      if (p.shield > 0) {
        ctx.strokeStyle = 'rgba(230,235,243,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y - zz, 34 + Math.sin(G.time * 5) * 2, 0, TAU); ctx.stroke();
      }
      if (p.highGround) R.label(p.x, footY - HF.h - 6 - zz, 'HIGH GROUND', '#ffe14a', 10);
    },
    drawPlayer(ctx, G, p) {
      const HF = this.heroFrame(p, G);
      if (HF) {
        const haze = p.buffs.find((b) => b.aura);
        if (haze && !p.dead) { ctx.fillStyle = 'rgba(155,77,255,0.13)'; ctx.beginPath(); ctx.arc(p.x, p.y, haze.aura, 0, TAU); ctx.fill(); }
        this.drawHeroSheet(ctx, G, p, HF);
        return;
      }
      if (p.dead) return;
      const spr = p.spr, sc = HERO_SCALE;
      const moving = p.moving || p.dash.t > 0;
      const fr = Math.floor(p.anim) % 4;
      const set = moving ? (p.facing < 0 ? spr.runL : spr.run) : (p.facing < 0 ? spr.idleL : spr.idle);
      const img = set[fr];
      const w = img.width * sc, h = img.height * sc;
      const zz = p.z || 0;
      const footY = p.y + 22;
      // aura / haze under player
      if (p.ability.t > 0 && p.id === 'schmunk') {
        const R = p.auraRadius();
        ctx.fillStyle = 'rgba(156,255,53,0.06)'; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(156,255,53,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.arc(p.x, p.y, R, G.time * 2, G.time * 2 + TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      const haze = p.buffs.find((b) => b.aura);
      if (haze) { ctx.fillStyle = 'rgba(155,77,255,0.13)'; ctx.beginPath(); ctx.arc(p.x, p.y, haze.aura, 0, TAU); ctx.fill(); }
      this.contact(ctx, p.x, footY, 17 * (1 - zz / 260), 6 * (1 - zz / 260), 0.5);
      ctx.strokeStyle = U.rgba(p.char.color, 0.75); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, footY, 22, 8, 0, 0, TAU); ctx.stroke();
      // afterimages
      if (p.dash.t > 0 || (p.ability.t > 0 && p.id === 'twizzy')) {
        for (let i = 2; i < p.trail.length; i += 2) {
          const t = p.trail[i];
          const s2 = (t.fl ? spr.runL : spr.run)[t.f];
          ctx.globalAlpha = 0.28 - i * 0.025;
          ctx.drawImage(s2, t.x - w / 2 - 3, t.y + 22 - h + 4 - zz, w, h);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = p.invuln > 0 && p.hurtFlash <= 0 && p.dash.t <= 0 ? 0.62 + 0.23 * Math.cos(G.time * 18.85) : 1;
      ctx.drawImage(img, p.x - w / 2, footY - h + 4 - zz, w, h);
      this.drawGun(ctx, G, p, footY - h * 0.42 - zz);
      if (p.hurtFlash > 0) { ctx.globalAlpha = p.hurtFlash * 3; ctx.drawImage(p.facing < 0 ? spr.whiteL : spr.white, p.x - w / 2, footY - h + 4 - zz, w, h); }
      ctx.globalAlpha = 1;
      if (p.shield > 0) {
        ctx.strokeStyle = 'rgba(230,235,243,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y - zz, 34 + Math.sin(G.time * 5) * 2, 0, TAU); ctx.stroke();
      }
      if (p.highGround) R.label(p.x, footY - h - 6 - zz, 'HIGH GROUND', '#ffe14a', 10);
    },

    // pistol held at arm's length, aimed at the last target, with a short muzzle flash
    drawGun(ctx, G, p, y) {
      if (S.heroSheets[p.id]) return; // the sheet draws its own pistol
      const w = p.weapons.find((x) => x.def.id === 'glock' || x.def.id === 'gold_glock');
      if (!w) return;
      const recent = p.gunT !== undefined && G.time - p.gunT < 1.2;
      const ang = recent ? p.gunAng : (p.facing < 0 ? Math.PI : 0);
      const gold = w.def.id === 'gold_glock';
      ctx.save();
      ctx.translate(p.x + Math.cos(ang) * 8, y + Math.sin(ang) * 4);
      ctx.rotate(ang);
      if (Math.cos(ang) < 0) ctx.scale(1, -1);
      ctx.fillStyle = '#050505'; ctx.fillRect(3, -4, 18, 7); ctx.fillRect(4, 1, 6, 9);
      ctx.fillStyle = gold ? '#ffd23f' : '#2c2f2b'; ctx.fillRect(4, -3, 16, 5); ctx.fillRect(5, 1, 4, 8);
      ctx.fillStyle = gold ? '#fff2b0' : '#5a5e58'; ctx.fillRect(4, -3, 16, 1);
      if (G.time - p.gunT < 0.05) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(20, -2, 4, 3); }
      ctx.restore();
    },

    // ------------------------------------------------------------ enemies
    // ------------------------------------------------------------ painted enemies
    // which sheet each enemy wears (tools/build_enemies.py). body = world height from feet to head top;
    // attack(e, since) maps the AI state to 0..1 through the attack row, or -1 = not attacking.
    ENEMY_ART: {
      npc: { sheet: 'fan_bat', body: 46, attack: (e, s) => e.state === 'windup' ? 0.45 * Math.min(1, s / 0.42) : e.state === 'lunge' ? 0.45 + 0.3 * Math.min(1, s / 0.2) : e.state === 'recover' ? 0.75 + 0.25 * Math.min(1, s / 0.45) : -1 },
      clip: { sheet: 'zombie', body: 44 },
      fiend: { sheet: 'thug', body: 48, attack: (e, s) => e.state === 'windup' ? 0.45 * Math.min(1, s / 0.6) : -1 },
      stalker: { sheet: 'fan_gun', body: 46, attack: (e, s) => e.state === 'aim' ? 0.4 * Math.min(1, s / 0.75) : e._prev === 'aim' && e.state === 'move' && s < 0.4 ? 0.4 + 0.6 * s / 0.4 : -1 },
      guard: { sheet: 'riot_vis', body: 56, still: (e) => e.state === 'aim' },
      exec: { sheet: 'riot_blk', body: 58 },
      glitch: { sheet: 'tvhead', body: 46 },
      bruiser: { sheet: 'uni_man', body: 66, still: (e) => e.state === 'windup' },
      pony: { tiers: ['uni_pink', 'uni_white', 'uni_dark'], elite: 'uni_gold', body: 44 },
      stretch: { sheet: 'hood_cross', body: 48 },
      dancer: { sheet: 'shadow', body: 48 },
    },
    // world height of the drawn body (feet to head top) - used for the hit capsule and for aiming at the chest
    enemyBodyH(e) {
      const A = this.ENEMY_ART[e.type];
      if (A && this.enemyArt(e)) return A.body * (e.scale / e.def.scale);
      const es = S.enemies[e.type];
      return es ? es.h * e.scale : e.r * 2;
    },
    enemyArt(e) {
      const A = this.ENEMY_ART[e.type];
      if (!A) return null;
      const key = A.tiers ? (e.elite && A.elite ? A.elite : A.tiers[e.tier] || A.tiers[0]) : A.sheet;
      const sh = S.enemySheets[key];
      return sh ? (this._ea || (this._ea = {}), this._ea.A = A, this._ea.sh = sh, this._ea.variant = A.tiers ? 0 : (e.tier || 0), this._ea) : null;
    },
    // current frame of a painted enemy: { f, flip }
    enemyPose(e, G, A, sh) {
      if (e._ls !== e.state) { e._prev = e._ls; e._ls = e.state; e._lt = G.time; }
      const since = G.time - (e._lt || 0), an = sh.anims, P = this._pose || (this._pose = {});
      const atk = A.attack && an.attack ? A.attack(e, since) : -1;
      if (atk >= 0) { // attacks always face the player, whatever the jitter of the wind-up does to vx
        const n = an.attack.length;
        P.f = an.attack[Math.min(n - 1, Math.floor(atk * n))]; P.flip = G.p.x < e.x;
        return P;
      }
      const sp = Math.hypot(e.vx || 0, e.vy || 0);
      P.flip = e.facing < 0;
      e._idle = e._idle ? sp < 22 : sp < 12; // idle <-> walk with hysteresis (no flicker around one speed)
      if (an.idle && (e._idle || (A.still && A.still(e)))) { P.f = an.idle[Math.floor(G.time * 5 + e.ph * 3) % an.idle.length]; if (A.still && A.still(e)) P.flip = G.p.x < e.x; return P; }
      const w = an.walk || an.idle, n = w.length;
      if (n <= 3) { const i = Math.floor(e.anim * 0.8) % 4; P.f = w[i === 3 ? 1 : i % n]; } // ping-pong through short cycles
      else if (n === 4) P.f = w[Math.floor(e.anim * 0.8) % 4]; // 4-step cycles (step, pass, step, pass) at the same pace
      else P.f = w[Math.floor(e.anim * 1.6) % n];
      return P;
    },
    // Pixel-art enemy sheets (tools/pixelize_enemies.py): every art pixel is a whole number of device pixels (D) and the
    // sprite's anchor sits on the device pixel grid, so the squares stay sharp and equal at any zoom; no smoothing.
    pixK(k) { const D = Math.max(1, Math.round(k * this.z)); return D / this.z; },
    snap(v) { return Math.round(v * this.z) / this.z; },
    drawEnemySheet(ctx, G, e, ea) {
      const { A, sh, variant } = ea, def = e.def;
      const k = this.pixK((A.body * (e.scale / def.scale)) / sh.body);
      const P = this.enemyPose(e, G, A, sh), f = P.f, fl = P.flip;
      const footY = e.y + e.r * 0.9;
      const hover = def.ghost ? 10 + Math.round(Math.sin(G.time * 3 + e.ph) * 2) * k : 0, zz = (e.z || 0) + hover;
      let kx = k, ky = k;
      if (e.type === 'stretch') ky = this.pixK(k * (e.state === 'windup' ? 1.18 + (0.8 - e.st) * 0.4 : 1 + Math.round(Math.sin(G.time * 2.4 + e.ph)) * 0.08));
      const ax = fl ? f.w - f.ax : f.ax, sx = fl ? sh.W - f.x - f.w : f.x;
      // hit recoil: while the white hit flash shows, the body sits one art pixel back along the knockback
      const recoil = e.flash > 0 && !e.boss ? Math.sign(e.kvx || 0) * kx : 0;
      const w = f.w * kx, h = f.h * ky, x = this.snap(e.x) - ax * kx + recoil, y = this.snap(footY - zz) - f.ay * ky;
      const src = (v) => S.enemyAtlas(sh, v, fl, 1);
      const draw = (img, dx, dy, dw, dh) => ctx.drawImage(img, sx, f.y, f.w, f.h, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = false;
      if (e.spawning > 0) { // quietly rises out of its own shadow, a whole pixel row at a time
        const kk = Math.ceil((1 - e.spawning / 0.7) * f.h) / f.h;
        this.contact(ctx, e.x, footY, e.r * 1.1 * kk, e.r * 0.4 * kk, 0.35);
        ctx.globalAlpha = kk * 0.7;
        ctx.drawImage(def.halluc ? src(0) : src('white'), sx, f.y, f.w, Math.max(1, Math.round(f.h * kk)), x, this.snap(footY) - f.ay * ky, w, Math.max(1, Math.round(f.h * kk)) * ky);
        ctx.globalAlpha = 1;
        return;
      }
      if (def.halluc && RS.Post.minor()) RS.Post.glow(e.x, y + h * 0.5, Math.max(w, h) * 0.5, def.cols[0], 0.22);
      if (e.elite) { // gold pixel rim: the gold silhouette one pixel out on every side, slowly pulsing
        ctx.globalAlpha = 0.6 + Math.sin(G.time * 4) * 0.25;
        const g = src('gold');
        draw(g, x - kx, y, w, h); draw(g, x + kx, y, w, h); draw(g, x, y - ky, w, h); draw(g, x, y + ky, w, h);
        ctx.globalAlpha = 1;
      }
      // pixel sprites only turn for the big readable moves (pony rearing / galloping, the dancer's spin), no idle lean
      let rot = 0, pivotY = footY - zz;
      if (e.type === 'pony' && (e.state === 'windup' || e.state === 'charge' || e.aiOver)) rot = e.state === 'windup' ? -0.35 * (e.facing || 1) : 0.12 * (e.facing || 1);
      if (e.type === 'dancer' && e.spinT > 0) { rot = (0.45 - e.spinT) * 14; pivotY = y + h / 2; }
      const shake = e.state === 'windup' && e.type !== 'fiend' && e.type !== 'npc' ? Math.round(Math.sin(G.time * 70 + e.ph * 5)) * kx : 0;
      const img = src(variant);
      if (e.type === 'glitch' && (e.glitchT > 0 || U.hash(Math.floor(G.time * 15) * 7919 + (e.id | 0)) < 0.06)) {
        ctx.globalAlpha = 0.5; draw(img, x - 2 * kx, y, w, h); draw(img, x + 2 * kx, y + ky, w, h); ctx.globalAlpha = 1;
        if (e.state === 'blinkwarn') { ctx.globalAlpha = 0.35; draw(src('white'), this.snap(e.bx) - ax * kx, this.snap(e.by + e.r * 0.9) - f.ay * ky, w, h); ctx.globalAlpha = 1; }
      }
      const flash = e.flash > 0 ? 0.85 : (e.freezeT > 0 || e.iceT > 0) ? 0.45 : 0;
      if (rot === 0) {
        draw(img, x + shake, y, w, h);
        if (flash) { ctx.globalAlpha = flash; draw(src('white'), x + shake, y, w, h); ctx.globalAlpha = 1; }
      } else {
        this.rotAt(ctx, e.x + shake, pivotY, rot);
        draw(img, x - e.x, y - pivotY, w, h);
        if (flash) { ctx.globalAlpha = flash; draw(src('white'), x - e.x, y - pivotY, w, h); ctx.globalAlpha = 1; }
        this.resetT(ctx);
      }
      if (e.type === 'stretch' && e.reachT > 0) { // the arm still snaps out along the attack line
        const k2 = Math.min(1, (0.3 - e.reachT) * 8), L = 320 * (1 - Math.abs(k2 - 0.5) * 0.6);
        ctx.save(); ctx.translate(e.x, e.y - 10); ctx.rotate(e.ang);
        ctx.fillStyle = '#1a0a30'; ctx.fillRect(0, -6, L, 12); ctx.fillStyle = '#b9a7ff'; ctx.fillRect(0, -2, L, 4);
        ctx.fillStyle = '#1a0a30'; ctx.fillRect(L - 8, -8, 16, 16); ctx.fillStyle = '#efe7ff'; ctx.fillRect(L - 6, -6, 12, 12);
        ctx.restore();
      }
      if (e.type === 'leak') RS.Post.glow(e.x, e.y, 40, '#ffcf3f', 1);
      // a painted body is taller than its head top in the frame box: overlays sit above the head
      this.enemyOverlays(ctx, G, e, footY - A.body * (e.scale / def.scale) * (ky / k) - zz, h, w);
    },
    enemyOverlays(ctx, G, e, y, h, w) {
      if (e.vulnT > 0 || e.distortT > 0) {
        ctx.fillStyle = e.distortT > 0 ? '#ff2448' : '#9aa3b2';
        ctx.fillRect(e.x - 3, y - 8, 6, 6);
      }
      if ((e.elite || e.def.isElite || e.type === 'bruiser' || e.type === 'bigshoe' || e.type === 'guard' || e.type === 'leak') && e.hp < e.maxHp) {
        const bw = Math.max(30, e.r * 2.2);
        ctx.fillStyle = '#000'; ctx.fillRect(e.x - bw / 2 - 1, y - 9, bw + 2, 6);
        ctx.fillStyle = e.elite ? '#ffd75a' : e.type === 'leak' ? '#ffcf3f' : '#ff2448';
        ctx.fillRect(e.x - bw / 2, y - 8, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
      if (e.type === 'dancer' && e.charged && e.windT > 0) {
        const k = e.windT / 0.4, cy = y + h * 0.5;
        ctx.strokeStyle = U.rgba('#3ff2ff', 0.95 - k * 0.5); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(e.x, cy, 22 + k * 46, 0, TAU); ctx.stroke();
        RS.Post.glow(e.x, cy, 26, '#3ff2ff', 0.9 - k * 0.6);
      }
      if (e.type === 'stalker' && e.state === 'aim') RS.Post.glow(e.x + 14 * (G.p.x < e.x ? -1 : 1), y + h * 0.35, 22, '#ff2448', 1);
      if (e.type === 'guard') { // flashlight lens, brighter while aiming
        const lx = e.x + (e.facing < 0 ? -1 : 1) * w * 0.44, ly = y + h * 0.65;
        RS.Post.glow(lx, ly, e.state === 'aim' ? 34 : 12, '#fff6c8', e.state === 'aim' ? 1 : 0.5);
      }
    },
    // code-drawn enemies: the types without a painted sheet (THE LEAK, GIANT SNEAKER, the smileys)
    drawEnemy(ctx, G, e) {
      const ea = this.enemyArt(e);
      if (ea) return this.drawEnemySheet(ctx, G, e, ea);
      const es = S.enemies[e.type], def = e.def;
      const sc = this.pixK(e.scale); // whole device pixels per art pixel, like the sheet enemies
      let w = es.w * sc, h = es.h * sc;
      const footY = e.y + e.r * 0.9;
      if (e.spawning > 0) {
        const k = 1 - e.spawning / 0.7;
        if (def.halluc) { // hallucinations simply fade in (no sparkle ring or glow per spawn)
          ctx.globalAlpha = k * 0.7; ctx.drawImage(es.pink, e.x - w / 2, footY - h, w, h); ctx.globalAlpha = 1;
          return;
        }
        this.contact(ctx, e.x, footY, e.r * 1.1 * k, e.r * 0.4 * k, 0.35); // rises out of its own shadow, no red ring
        ctx.globalAlpha = k * 0.6;
        ctx.drawImage(es.white, e.x - w / 2, footY - h * k, w, h * k);
        ctx.globalAlpha = 1;
        return;
      }
      // floaters hover, the giant sneaker leaves the ground and stretches on the hop
      const hover = def.ghost ? 10 + Math.sin(G.time * 3 + e.ph) * 4 : 0, zz = (e.z || 0) + hover;
      // (contact shadow already drawn by crowdShadows)
      if (e.type === 'bigshoe' && e.z > 0) { w *= 1 - e.z / 900; h *= 1 + e.z / 700; }
      const T = es.tiers[e.tier] || es.tiers[0];
      const fr = Math.floor(e.anim) % 4;
      const img = (e.facing < 0 ? T.framesL : T.frames)[fr];
      const bob = fr % 2 ? -sc : 0; // one art pixel
      const x = this.snap(e.x) - Math.round(es.w / 2) * sc, y = this.snap(footY - zz) - h + Math.round(3 / sc) * sc + bob;
      let ghosted = false;
      if (def.halluc) {
        // chromatic ghosting (pre-composited with the sprite) + a soft theme-coloured halo
        const special = this.crowd <= 220 && ((e.lean || 0) > 0.01 || (e.lean || 0) < -0.01);
        if (!special) {
          es.gsc = sc;
          const step = Math.min(2, Math.max(0, Math.round((Math.sin(G.time * 5 + e.ph) + 1)))), Gi = this.ghostImg(es, img, e.facing < 0, step), s2 = w / img.width, pd = Gi._pad * s2;
          ctx.drawImage(Gi, x - pd, y - pd, Gi.width * s2, Gi.height * s2);
          ghosted = true;
        } else {
          const off = 2.5 + Math.sin(G.time * 5 + e.ph) * 1.5;
          ctx.globalAlpha = 0.38;
          ctx.drawImage(e.facing < 0 ? es.pinkL : es.pink, x - off, y, w, h);
          ctx.drawImage(e.facing < 0 ? es.cyanL : es.cyan, x + off, y + 1, w, h);
          ctx.globalAlpha = 1;
        }
        if (RS.Post.minor()) RS.Post.glow(e.x, y + h * 0.5, Math.max(w, h) * 0.5, def.cols[0], 0.22);
      }
      if (e.elite) {
        ctx.globalAlpha = 0.55 + Math.sin(G.time * 6) * 0.25;
        const g = 1.14;
        ctx.drawImage(es.gold, e.x - (w * g) / 2, footY - h * g + 3, w * g, h * g);
        ctx.globalAlpha = 1;
      }
      if (e.type === 'leak') RS.Post.glow(e.x, e.y, 40, '#ffcf3f', 1);
      const shake = e.state === 'windup' && e.type !== 'fiend' ? Math.sin(G.time * 70 + e.ph * 5) * 2 : 0, lean = this.crowd > 220 ? 0 : e.lean || 0;
      if (ghosted) { /* sprite already drawn inside the ghost composite */ }
      else if (lean > -0.01 && lean < 0.01) ctx.drawImage(img, x + shake, y, w, h);
      else { this.rotAt(ctx, e.x + shake, footY, lean); ctx.drawImage(img, x - e.x, y - footY, w, h); this.resetT(ctx); }
      if (e.flash > 0) { ctx.globalAlpha = 0.85; ctx.drawImage(es.white, x, y, w, h); ctx.globalAlpha = 1; }
      else if (e.freezeT > 0 || e.iceT > 0) { ctx.globalAlpha = 0.45; ctx.drawImage(es.white, x, y, w, h); ctx.globalAlpha = 1; }
      this.enemyOverlays(ctx, G, e, y, h, w);
    },

    drawBoss(ctx, G, e) {
      const B = e.bdef;
      if (e.spawning > 0) {
        const k = 1 - e.spawning;
        ctx.strokeStyle = U.rgba(B.col, 0.8); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (2 - k), 0, TAU); ctx.stroke();
        return;
      }
      this.contact(ctx, e.x, e.y + e.r * 0.9, e.r * 1.2, e.r * 0.4, 0.55, true);
      if (e.phase === 3 || e.shieldUp) RS.Post.glow(e.x, e.y - e.r * 0.3, e.r * 2, e.shieldUp ? '#ffffff' : B.col, 0.85);
      // the two bosses drawn in code render through the pixel buffer, so they get the same square pixels as the rest
      if (B.draw === 'label' || !B.sprite) {
        const bx = this.pixBegin();
        if (B.draw === 'label') this.drawLabel(bx, G, e); else this.drawAlgorithm(bx, G, e);
        this.pixEnd(ctx);
        return;
      }
      const bs = S.bosses[B.sprite];
      const sc = this.pixK(e.scale), w = bs.w * sc, h = bs.h * sc; // whole device pixels per art pixel
      const face = G.p.x < e.x ? -1 : 1;
      const bob = Math.round(Math.sin(G.time * 4)) * sc; // one art pixel up / down
      const x = this.snap(e.x) - Math.round(bs.w / 2) * sc, y = this.snap(e.y + e.r * 0.9) - h + bob;
      let ox = 0;
      if (e.state === 'windup') ox = Math.round(Math.sin(G.time * 64)) * sc; // one-pixel tremble
      ctx.drawImage(face < 0 ? bs.imgL : bs.img, x + ox, y, w, h);
      if (e.flash > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(bs.white, x + ox, y, w, h); ctx.globalAlpha = 1; }
      if (e.freezeT > 0) { ctx.globalAlpha = 0.4; ctx.drawImage(bs.white, x, y, w, h); ctx.globalAlpha = 1; }
      if (e.shieldUp) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y - 20, e.r * 1.5, 0, TAU); ctx.stroke(); }
    },
    // THE MAJOR LABEL: a black contract monolith with gold trim, a red eye slit and a spinning gold record behind it
    drawLabel(ctx, G, e) {
      const t = G.time, r = e.r, w = r * 1.5, h = r * 3.1, foot = e.y + r * 0.9, bob = Math.sin(t * 3) * 3;
      const x0 = e.x - w / 2, y0 = foot - h + bob;
      // gold record halo, grooves and a slow spin
      ctx.save(); ctx.translate(e.x, y0 + h * 0.32); ctx.rotate(t * 1.6);
      ctx.fillStyle = '#16120a'; ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,207,63,0.35)'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + i * 0.2), 0.2, 2.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + i * 0.2), 3.4, 5.8); ctx.stroke(); }
      ctx.fillStyle = '#ffcf3f'; ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, TAU); ctx.fill();
      ctx.fillStyle = '#16120a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.08, 0, TAU); ctx.fill();
      ctx.restore();
      // the monolith: black slab, gold bevel, contract lines
      ctx.fillStyle = '#07070a'; ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = '#1a1a22'; ctx.fillRect(x0 + 4, y0 + 4, w * 0.18, h - 8); // left light edge
      ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 3; ctx.strokeRect(x0 + 1.5, y0 + 1.5, w - 3, h - 3);
      ctx.fillStyle = 'rgba(227,236,230,0.22)';
      for (let i = 0; i < 7; i++) ctx.fillRect(x0 + w * 0.22, y0 + h * (0.42 + i * 0.07), w * (i % 3 === 2 ? 0.38 : 0.56), 2);
      ctx.fillStyle = '#ffcf3f'; ctx.fillRect(x0 + w * 0.22, y0 + h * 0.9, w * 0.3, 3); // the signature line
      // red eye slit that tracks you
      const ea = Math.atan2(G.p.y - e.y, G.p.x - e.x), ex = e.x + Math.cos(ea) * w * 0.12, ey = y0 + h * 0.2;
      ctx.fillStyle = '#ff2448'; ctx.fillRect(x0 + w * 0.14, ey - 4, w * 0.72, 8);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - 5, ey - 2, 10, 4);
      RS.Post.glow(e.x, ey, r * 0.9, '#ff2448', 0.6);
      if (e.phase === 2) { // renegotiated: red cracks run down the slab
        ctx.strokeStyle = '#ff2448'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(x0 + w * 0.7, y0 + 6); ctx.lineTo(x0 + w * 0.55, y0 + h * 0.35); ctx.lineTo(x0 + w * 0.75, y0 + h * 0.6); ctx.lineTo(x0 + w * 0.6, y0 + h - 6);
        ctx.moveTo(x0 + w * 0.3, y0 + h * 0.5); ctx.lineTo(x0 + w * 0.45, y0 + h * 0.7); ctx.stroke();
      }
      if (e.flash > 0) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, w, h); ctx.globalAlpha = 1; }
      if (e.shieldUp) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, y0 + h / 2, r * 1.9, 0, TAU); ctx.stroke(); }
    },
    drawAlgorithm(ctx, G, e) {
      const t = G.time, r = e.r;
      ctx.save();
      ctx.translate(e.x, e.y - 30 + Math.sin(t * 2) * 6);
      // orbiting feed icons
      for (let i = 0; i < 6; i++) {
        const a = t * 1.3 + (i / 6) * TAU;
        const ox = Math.cos(a) * r * 1.9, oy = Math.sin(a) * r * 1.1;
        ctx.fillStyle = i % 3 === 0 ? '#ff2448' : i % 3 === 1 ? '#ff4f6e' : '#e3ece6';
        if (i % 3 === 0) { ctx.beginPath(); ctx.moveTo(ox - 7, oy - 9); ctx.lineTo(ox + 9, oy); ctx.lineTo(ox - 7, oy + 9); ctx.fill(); }
        else if (i % 3 === 1) { ctx.beginPath(); ctx.arc(ox - 4, oy - 2, 5, 0, TAU); ctx.arc(ox + 4, oy - 2, 5, 0, TAU); ctx.moveTo(ox - 9, oy); ctx.lineTo(ox, oy + 10); ctx.lineTo(ox + 9, oy); ctx.fill(); }
        else { ctx.fillRect(ox - 8, oy - 8, 16, 16); ctx.fillStyle = '#050507'; ctx.fillRect(ox - 4, oy - 4, 8, 8); }
      }
      // core diamond
      ctx.rotate(Math.sin(t) * 0.2);
      const d = r * 1.25;
      ctx.fillStyle = '#0a0614'; ctx.strokeStyle = '#e3ece6'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, -d); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.lineTo(-d, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ff4f6e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -d * 0.7); ctx.lineTo(d * 0.7, 0); ctx.lineTo(0, d * 0.7); ctx.lineTo(-d * 0.7, 0); ctx.closePath(); ctx.stroke();
      // eye tracks the player
      const ea = Math.atan2(G.p.y - e.y, G.p.x - e.x);
      ctx.fillStyle = '#e6ebf3'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r * 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = e.phase === 2 ? '#ff2448' : '#9cff35'; ctx.beginPath(); ctx.arc(Math.cos(ea) * r * 0.25, Math.sin(ea) * r * 0.12, r * 0.26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#050507'; ctx.beginPath(); ctx.arc(Math.cos(ea) * r * 0.3, Math.sin(ea) * r * 0.14, r * 0.11, 0, TAU); ctx.fill();
      if (e.flash > 0) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -d); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.lineTo(-d, 0); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
      if (U.per(0.2, RS.Game.fdt)) FX.burst(e.x + U.rand(-r, r), e.y - 30 + U.rand(-r, r), ['#e3ece6', '#ff4f6e'], 1, 40, { size: 4, life: 0.3 });
    },

    // ------------------------------------------------------------ pickups
    drawPickups(ctx, G, v, pulse) {
      const t = G.time;
      for (const k of G.pickups.list) {
        if (k.x < v.x0 || k.x > v.x1 || k.y < v.y0 || k.y > v.y1) continue;
        if (k.kind === 'xp') {
          const T = RS.GEM_TIERS[k.tier];
          const r = T.r * (1 + pulse * 0.15);
          if (RS.Post.minor()) RS.Post.glow(k.x, k.y, r * 2.8, T.col, 0.3);
          ctx.fillStyle = T.col;
          ctx.beginPath(); ctx.moveTo(k.x, k.y - r * 1.3); ctx.lineTo(k.x + r, k.y); ctx.lineTo(k.x, k.y + r * 1.3); ctx.lineTo(k.x - r, k.y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(k.x - 1.5, k.y - r * 0.6, 2, 3);
        } else if (k.kind === 'ruby') {
          this.drawRuby(ctx, G, k, t);
        } else if (k.kind === 'stash') {
          RS.Stash.drawPickup(ctx, this, k, t);
        } else if (k.kind === 'coin') {
          const sx = Math.abs(Math.sin(t * 5 + k.x));
          const ci = RS.Icons.get('coin'), cw = 18 * Math.max(0.18, sx);
          ctx.drawImage(ci, k.x - cw / 2, k.y - 9, cw, 18);
        } else {
          const id = k.kind === 'cons' ? k.id2 : k.kind === 'thumb' ? 'thumb_mixtape' : 'chest' + ({ boss: '_boss', legendary: '_legendary', supply: '_supply' }[k.tier] || '');
          const col = k.kind === 'chest' ? (k.tier === 'boss' ? '#ff2448' : k.tier === 'legendary' ? '#ffcf3f' : k.tier === 'supply' ? '#e3ece6' : '#cfd6e3') : k.kind === 'thumb' ? '#ff4f6e' : '#ffe14a';
          const size = k.kind === 'chest' ? 48 : k.kind === 'thumb' ? 40 : 30;
          const bob = Math.sin(t * 3 + k.x) * 4;
          this.contact(ctx, k.x, k.y + size * 0.42, size * 0.42, size * 0.13, 0.4);
          RS.Post.glow(k.x, k.y + bob, size * (k.kind === 'cons' ? 0.8 : 1), col, k.kind === 'chest' && k.tier === 'normal' ? 0.45 : 0.85);
          if (k.kind === 'thumb') {
            ctx.strokeStyle = 'rgba(255,0,170,0.5)'; ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) { const a = t + (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(k.x + Math.cos(a) * 26, k.y + Math.sin(a) * 26 + bob); ctx.lineTo(k.x + Math.cos(a) * 40, k.y + Math.sin(a) * 40 + bob); ctx.stroke(); }
          }
          ctx.drawImage(RS.Icons.get(id), k.x - size / 2, k.y - size / 2 + bob, size, size);
          if (k === G.nearChest) { // in reach: pulsing ring + a clear key prompt (drawn full-res on the HUD canvas)
            const a = 0.6 + Math.sin(t * 8) * 0.3;
            ctx.strokeStyle = U.rgba('#9cff35', a); ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(k.x, k.y + 18, 34, 12, 0, 0, TAU); ctx.stroke();
            R.label(k.x, k.y - 48 + bob, '[E]  OPEN CHEST', '#9cff35', 14);
          } else if (k.kind === 'chest' && (k.tier === 'boss' || k.tier === 'legendary' || k.tier === 'supply')) {
            R.label(k.x, k.y - 34 + bob, k.tier === 'boss' ? 'BOSS CHEST' : k.tier === 'legendary' ? 'LEGENDARY' : 'SUPPLY', col, 10);
          }
        }
      }
    },

    // ------------------------------------------------------------ zones
    // ---- ground zones drawn in code: crisp shapes on a faint fill, the glow comes from bloom (no painted sprites)
    zoneEdge(ctx, z, col, fade, w) { // the area outline every zone shares: a crisp ring + a soft bloom ring
      ctx.strokeStyle = U.rgba(col, 0.85 * fade); ctx.lineWidth = w || 2.5;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r, 0, 0, TAU); ctx.stroke();
      RS.Post.ring(z.x, z.y, z.r, 10, col, 0.35 * fade);
    },
    // MOSH PIT (red) / its evolution fog (purple): shock ripples running out from the centre on a beat
    // RED DIAMOND: a baked 13 x 13 pixel gem (dark outline, 4 red facets, white top-left shine) at 4 world units per
    // pixel, a slow orbiting pixel sparkle and a red glow. In its last 15 s a countdown ring shrinks around it and it
    // dims slowly (1.4 Hz, far under the 3 / s flash limit) so you can see it is about to go.
    rubySprite() {
      if (this._ruby) return this._ruby;
      const rows = [
        '.....ooo.....',
        '....oWWho....',
        '...oWWhhho...',
        '..oWhhhhhRo..',
        '.oWhhhhhRRRo.',
        'ohhhhhhRRRRRo',
        'oHHHHHHMMMMMo',
        '.oHHHHMMMMMo.',
        '..oHHHMMMMo..',
        '...oHHMMMo...',
        '....oHMMo....',
        '.....oMo.....',
        '......o......',
      ];
      const pal = { o: '#2a0710', W: '#ffffff', h: '#ff5a74', R: '#e8173a', H: '#c2102e', M: '#7d0a1f' };
      const c = S.cv(13, 13), x = c.getContext('2d');
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
      return (this._ruby = c);
    },
    drawRuby(ctx, G, k, t) {
      const K = 4, left = RS.Data.LOOT.rubyLife - k.age, img = this.rubySprite();
      const bob = Math.round(Math.sin(t * 2.4 + k.x) * 1.5) * K;
      const x = Math.round(k.x / K) * K - 6 * K, y = Math.round(k.y / K) * K - 6 * K + bob;
      this.contact(ctx, k.x, k.y + 28, 18, 6, 0.5);
      RS.Post.glow(k.x, k.y + bob, 30, '#ff2448', 0.5);
      RS.Post.light(k.x, k.y, 160, '#ff2448', 0.35);
      const dim = left < 15 ? 0.6 + 0.4 * Math.cos((15 - left) * TAU * 1.4) : 1;
      ctx.globalAlpha = dim;
      ctx.drawImage(img, x, y, 13 * K, 13 * K);
      // sparkle: a 4-point pixel star that hops between three spots on the facets
      const sp = [[3, 2], [9, 5], [5, 8]][Math.floor(t * 1.5 + k.x) % 3];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + sp[0] * K, y + (sp[1] - 1) * K, K, 3 * K); ctx.fillRect(x + (sp[0] - 1) * K, y + sp[1] * K, 3 * K, K);
      ctx.globalAlpha = 1;
      if (left < 15) { // countdown ring
        ctx.strokeStyle = U.rgba('#ff2448', 0.8); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(k.x, k.y + bob, 38, -Math.PI / 2, -Math.PI / 2 + TAU * (left / 15)); ctx.stroke();
      }
      R.label(k.x, k.y + 46, 'RED DIAMOND', '#ff2448', 11, dim);
    },
    drawMoshZone(ctx, z, fade) {
      const col = z.col, a = z.age, fog = col === '#9b4dff';
      ctx.fillStyle = U.rgba(col, (fog ? 0.16 : 0.1) * fade); ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { // ripples
        const k = (a * 1.6 + i / 3) % 1;
        ctx.strokeStyle = U.rgba(i % 2 ? '#ffffff' : col, (1 - k) * 0.75 * fade); ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * k, z.r * k, 0, 0, TAU); ctx.stroke();
      }
      if (fog) { // drifting haze lumps
        ctx.fillStyle = U.rgba('#c9a0ff', 0.16 * fade); ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const an = a * 0.8 + i * 1.26, rr = z.r * 0.45, br = z.r * (0.28 + 0.06 * Math.sin(a * 3 + i));
          const bx = z.x + Math.cos(an) * rr, by = z.y + Math.sin(an) * rr;
          ctx.moveTo(bx + br, by); ctx.ellipse(bx, by, br, br, 0, 0, TAU);
        }
        ctx.fill();
      }
      // dashed spinning border
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -a * 60;
      this.zoneEdge(ctx, z, col, fade, 3);
      ctx.setLineDash([]);
      RS.Post.glow(z.x, z.y, z.r * 0.8, col, 0.35 * fade);
    },
    // fire patch: a ring of crisp flame tongues (red -> orange -> yellow) that flicker, embers rising
    drawFireZone(ctx, z, fade) {
      const a = z.age, n = 11;
      ctx.fillStyle = U.rgba('#ff7a1a', 0.14 * fade); ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r, 0, 0, TAU); ctx.fill();
      const cols = ['#ff2448', '#ff7a1a', '#ffd23f'];
      for (let L = 0; L < 3; L++) {
        ctx.fillStyle = cols[L]; ctx.globalAlpha = fade; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const an = (i / n) * TAU + L * 0.3, rr = z.r * (0.92 - L * 0.18);
          const bx = z.x + Math.cos(an) * rr, by = z.y + Math.sin(an) * rr;
          const hgt = z.r * (0.45 - L * 0.12) * (0.75 + 0.35 * Math.sin(a * 13 + i * 2.1 + L));
          const wd = z.r * (0.16 - L * 0.035);
          ctx.moveTo(bx - wd, by); ctx.quadraticCurveTo(bx - wd * 0.3, by - hgt * 0.5, bx + Math.sin(a * 9 + i) * wd * 0.4, by - hgt);
          ctx.quadraticCurveTo(bx + wd * 0.3, by - hgt * 0.5, bx + wd, by); ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = U.rgba('#ffe14a', 0.9 * fade); // embers on a fixed loop, no particles needed
      for (let i = 0; i < 7; i++) {
        const k = (a * 0.9 + U.hash(i * 7 + 3)) % 1, an = U.hash(i * 13) * TAU, rr = z.r * 0.7 * U.hash(i * 5 + 1);
        ctx.fillRect(z.x + Math.cos(an) * rr - 1.5, z.y + Math.sin(an) * rr - k * z.r * 1.1 - 1.5, 3, 3);
      }
      RS.Post.glow(z.x, z.y - z.r * 0.2, z.r * 1.1, '#ff7a1a', 0.7 * fade);
      RS.Post.light(z.x, z.y, z.r * 2.4, '#ff7a1a', 0.35 * fade);
    },
    // GLITCH GLOCK static: a crackling grid of glitch squares that re-roll 15x a second, inside a sharp ring
    drawStaticZone(ctx, z, fade) {
      const col = z.col, tk = Math.floor(z.age * 15) * 97 + (z.x | 0);
      ctx.fillStyle = U.rgba(col, 0.1 * fade); ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = U.rgba(col, 0.9 * fade);
      for (let i = 0; i < 16; i++) {
        const an = U.hash(tk + i * 3) * TAU, rr = z.r * Math.sqrt(U.hash(tk + i * 3 + 1)), sz = 3 + U.hash(tk + i * 3 + 2) * 6;
        ctx.fillRect(z.x + Math.cos(an) * rr - sz / 2, z.y + Math.sin(an) * rr - sz / 2, sz, i % 3 ? sz : 2);
      }
      ctx.fillStyle = U.rgba('#9cff35', 0.85 * fade);
      for (let i = 0; i < 4; i++) { const yy = z.y + (U.hash(tk + 50 + i) - 0.5) * z.r * 1.1; const ww = z.r * (0.4 + U.hash(tk + 60 + i) * 0.8); ctx.fillRect(z.x - ww / 2, yy, ww, 2); }
      this.zoneEdge(ctx, z, col, fade, 2);
      RS.Post.glow(z.x, z.y, z.r * 0.7, '#9cff35', 0.3 * fade);
    },
    // TWIZZY TORNADO / SCHMUNK STORM, drawn in code and see-through: a swirl on the ground that shows the pull area,
    // and a funnel made only of thin spinning rings (no fill), so the hero and the enemies stay visible through it.
    // (The painted sprite was an opaque grey cone 2x the radius wide and hid everything under it.)
    drawTornado(ctx, z, t, fade) {
      const r = z.r, col = z.col, spin = z.age * 9, grow = Math.min(1, z.age * 5);
      // ground: faint disk + four swirl arms spiralling inwards
      ctx.fillStyle = U.rgba(col, 0.07 * fade); ctx.beginPath(); ctx.ellipse(z.x, z.y, r, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = U.rgba(col, 0.7 * fade); ctx.lineWidth = 4;
        ctx.beginPath();
        for (let k = 0; k <= 14; k++) {
          const f = k / 14, a = spin + i * (TAU / 4) + f * 2.4, rr = r * grow * (1 - f * 0.8);
          const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr * 0.55;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      // funnel: stacked rings, narrow at the ground and widening upwards, each spinning with a gap in it
      const H = r * 1.25 * grow, n = 7;
      for (let j = 0; j < n; j++) {
        const f = j / (n - 1), rx = r * (0.16 + 0.5 * f), cy = z.y - H * f + Math.sin(z.age * 6 + j) * 3;
        const sway = Math.sin(z.age * 2.3 + f * 2) * r * 0.12 * f, a0 = -spin * (1.4 - f * 0.6) + j;
        ctx.strokeStyle = U.rgba(j % 2 ? '#e6ebf3' : col, (0.72 - f * 0.3) * fade); ctx.lineWidth = 3.5 - f;
        ctx.beginPath(); ctx.ellipse(z.x + sway, cy, rx, rx * 0.28, 0, a0, a0 + TAU * 0.78); ctx.stroke();
      }
      // a few chunks of debris riding the wind (tiny, they never cover anything)
      ctx.fillStyle = U.rgba('#cfd6e3', 0.8 * fade);
      for (let i = 0; i < 6; i++) {
        const a = spin * 1.3 + i * 1.05, f = (i % 3) / 3 + 0.15, rr = r * (0.25 + 0.55 * f);
        ctx.fillRect(z.x + Math.cos(a) * rr - 2, z.y - H * f + Math.sin(a) * rr * 0.28 - 2, 4, 4);
      }
      if (RS.Post.minor()) RS.Post.glow(z.x, z.y, r * 0.6, col, 0.25 * fade);
      ctx.lineCap = 'butt';
    },
    // SWITCHBLADE / BUTTERFLY FLIP: a small knife (about half the hero's height) held at chest height. The arm jabs
    // it out on an ease-out, it glides a little across the hit wedge and eases back in, so the motion is one
    // continuous curve instead of a pop. Two faint ghost copies, a hairline along the tip's path and a short
    // reach streak (tip -> real reach) give the motion blur; no wide bands. The hit area (z.r, z.arc) is unchanged.
    stabPose(z, t) {
      const ease = (x) => 1 - Math.pow(1 - x, 3), sine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
      const out = t < 0.36 ? ease(t / 0.36) : 1 - sine((t - 0.36) / 0.64) * 0.9; // jab out fast, glide home
      const sweep = (z.flip ? -1 : 1) * z.arc * 0.32 * (sine(Math.min(1, t / 0.6)) * 2 - 1); // small arc across the wedge
      const a = z.ang + sweep, L = 22, d = 8 + out * 24; // stays in the hand: the arm reaches, the knife does not fly
      return { a, d, L, out, x: z.x + Math.cos(a) * d, y: z.y - 14 + Math.sin(a) * d };
    },
    drawStab(ctx, z, t) {
      const red = z.col === '#ff2448';
      const f = Math.max(0, (t - 0.72) / 0.28), fade = 1 - f * f * (3 - 2 * f); // smoothstep fade-out at the end
      if (fade <= 0) return;
      const P = this.stabPose(z, t);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // hairline along the path the tip travelled (shows the cut without covering the enemies)
      const tipAt = (q) => { const Q = this.stabPose(z, Math.max(0, q)); return [Q.x + Math.cos(Q.a) * Q.L, Q.y + Math.sin(Q.a) * Q.L]; };
      ctx.strokeStyle = U.rgba(red ? '#ff6a80' : '#ffffff', 0.5 * fade); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const [x, y] = tipAt(t - 0.12 + i * 0.02); ctx[i ? 'lineTo' : 'moveTo'](x, y); }
      ctx.stroke();
      // two ghost blades just behind the real one
      for (let j = 2; j >= 1; j--) {
        const G2 = this.stabPose(z, Math.max(0, t - j * 0.035));
        this.knife(ctx, G2.x, G2.y, G2.a, G2.L, red, 0.16 * fade / j, true);
      }
      const tx = P.x + Math.cos(P.a) * P.L, ty = P.y + Math.sin(P.a) * P.L;
      if (t > 0.18 && t < 0.62) { // reach streak: a thin tapered line from the tip out to the real reach, gone in ~0.1 s
        const q = 1 - Math.abs(t - 0.36) / 0.26, reach = z.r * 0.92 - (P.d + P.L);
        if (reach > 4) {
          const ex = tx + Math.cos(P.a) * reach * q, ey = ty + Math.sin(P.a) * reach * q;
          const gr = ctx.createLinearGradient(tx, ty, ex, ey);
          gr.addColorStop(0, U.rgba(red ? '#ff6a80' : '#ffffff', 0.7 * q * fade)); gr.addColorStop(1, U.rgba(red ? '#ff6a80' : '#ffffff', 0));
          ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
        }
      }
      this.knife(ctx, P.x, P.y, P.a, P.L, red, fade, false);
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      if (RS.Post.minor()) RS.Post.glow(tx, ty, 9, red ? '#ff2448' : '#e6ebf3', 0.4 * fade);
    },
    // knife in local space along +x: handle -12..-1, a small guard, blade 0..L with a straight spine and curved edge
    knife(ctx, x, y, a, L, red, alpha, ghost) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const bladeP = () => { ctx.beginPath(); ctx.moveTo(0, -2.3); ctx.lineTo(L * 0.76, -2.3); ctx.lineTo(L, 0); ctx.quadraticCurveTo(L * 0.55, 2.8, 0, 2.3); ctx.closePath(); };
      if (ghost) { ctx.fillStyle = U.rgba(red ? '#ff8a9c' : '#ffffff', alpha); bladeP(); ctx.fill(); ctx.restore(); return; }
      ctx.strokeStyle = 'rgba(8,9,12,' + (0.85 * alpha) + ')'; ctx.lineWidth = 2.5; bladeP(); ctx.stroke(); // outline
      ctx.fillStyle = U.rgba(red ? '#ffd9df' : '#c9d0dc', alpha); bladeP(); ctx.fill();
      ctx.strokeStyle = U.rgba('#ffffff', 0.95 * alpha); ctx.lineWidth = 1; // spine highlight
      ctx.beginPath(); ctx.moveTo(1, -1.4); ctx.lineTo(L * 0.74, -1.4); ctx.stroke();
      ctx.fillStyle = 'rgba(8,9,12,' + (0.9 * alpha) + ')'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-13, -3.4, 13, 6.8, 2.5) : ctx.rect(-13, -3.4, 13, 6.8); ctx.fill();
      ctx.fillStyle = U.rgba(red ? '#ff2448' : '#4a4d58', alpha); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-12, -2.4, 11, 4.8, 2) : ctx.rect(-12, -2.4, 11, 4.8); ctx.fill();
      ctx.fillStyle = U.rgba(red ? '#ffe14a' : '#9aa3b2', alpha); // rivets / guard
      ctx.fillRect(-9, -0.8, 1.6, 1.6); ctx.fillRect(-5, -0.8, 1.6, 1.6); ctx.fillRect(-1.2, -3.6, 1.8, 7.2);
      ctx.restore();
    },
    drawWhip(ctx, z, t) {
      const ice = z.col === '#9fe9ff', R = z.r * 0.82, a0 = z.ang - z.arc / 2, span = z.arc;
      const head = a0 + span * (1 - Math.pow(1 - Math.min(1, t * 1.9), 3)); // ease-out snap
      const tail = a0 + span * Math.max(0, Math.min(1, (t - 0.45) * 1.8));
      if (head - tail < 0.02) return;
      const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25, main = ice ? '#9fe9ff' : '#e6ebf3';
      ctx.lineCap = 'round';
      // motion trail: a wide soft band behind the head, then a thin bright edge
      const trail0 = Math.max(tail, head - 1.6);
      ctx.strokeStyle = U.rgba(main, 0.22 * fade); ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(z.x, z.y, R, trail0, head); ctx.stroke();
      ctx.strokeStyle = U.rgba('#ffffff', 0.75 * fade); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, R + 9, Math.max(tail, head - 0.9), head); ctx.stroke();
      // chain links every ~11 world px from tail to head, alternating face-on / edge-on, dark outline for contrast
      const step = 11 / R, n = Math.min(90, Math.floor((head - tail) / step));
      for (let i = 0; i <= n; i++) {
        const a = head - i * step, x = z.x + Math.cos(a) * R, y = z.y + Math.sin(a) * R, side = i % 2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
        ctx.strokeStyle = 'rgba(8,9,12,' + (0.85 * fade) + ')'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 6.5, side ? 1.6 : 3.6, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = U.rgba(side ? (ice ? '#5fc8f0' : '#9aa3b2') : main, fade); ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(0, 0, 6.5, side ? 1.6 : 3.6, 0, 0, TAU); ctx.stroke();
        if (!side) { ctx.fillStyle = U.rgba('#ffffff', 0.9 * fade); ctx.fillRect(-3, -3.2, 2.5, 1.2); } // chrome glint
        ctx.restore();
        if (ice && i % 4 === 0) { ctx.fillStyle = U.rgba('#ffffff', fade); ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 5, y - 1, 10, 2); } // diamond sparkle
      }
      // tip: a bright hook at the head of the chain
      const hx = z.x + Math.cos(head) * R, hy = z.y + Math.sin(head) * R;
      ctx.fillStyle = U.rgba('#ffffff', fade);
      ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, TAU); ctx.fill();
      if (RS.Post.active) { RS.Post.glow(hx, hy, 26, main, 0.8 * fade); RS.Post.streak(hx, hy, head + Math.PI / 2, 40, 10, main, 0.5 * fade); }
      ctx.lineCap = 'butt';
    },
    drawZones(ctx, G, v, overlay) {
      const t = G.time;
      for (const z of G.zones.list) {
        if (z.dead) continue;
        const isOver = !!OVER_ZONES[z.kind];
        if (isOver !== overlay) continue;
        if (z.x < v.x0 - z.r - 50 || z.x > v.x1 + z.r + 50 || z.y < v.y0 - z.r - 50 || z.y > v.y1 + z.r + 50) continue;
        const k = z.life / z.max;
        const fade = Math.min(1, z.life * 4, z.age * 6);
        switch (z.kind) {
          case 'tornado': this.drawTornado(ctx, z, t, fade); break;
          case 'mosh': this.drawMoshZone(ctx, z, fade); break;
          case 'deadair': {
            ctx.fillStyle = U.rgba(z.col, 0.14 * fade); ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
            ctx.fillStyle = U.rgba('#ffffff', 0.25 * fade);
            const zt = Math.floor(G.time * 20) * 31 + (z.x | 0); // static snow re-rolls 20x a second
            for (let i = 0; i < 14; i++) { const a = U.hash(zt + i * 2) * TAU, rr = U.hash(zt + i * 2 + 1) * z.r; ctx.fillRect(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, 3, 1); }
            this.zoneEdge(ctx, z, z.col, fade, 2.5); RS.Post.glow(z.x, z.y, z.r * 0.6, z.col, 0.25 * fade);
            ctx.drawImage(RS.Icons.get(z.col === '#ff2448' ? 'silent_violence' : 'dead_air'), z.x - 14, z.y - 14, 28, 28);
            break;
          }
          case 'fire': this.drawFireZone(ctx, z, fade); break;
          case 'static': this.drawStaticZone(ctx, z, fade); break;
          case 'mine': {
            const armed = z.age > z.arm;
            if (RS.FXS.ready) RS.FXS.draw(ctx, 'cassette', 0, z.x, z.y, 0, 0.36, 1, z.col === '#ff7a1a' ? RS.FXS.filterFor('#ff2448', '#ff7a1a') : '');
            else ctx.drawImage(RS.Icons.get(z.col === '#ff7a1a' ? 'fire_mixtape' : 'cassette_mines'), z.x - 13, z.y - 13, 26, 26);
            if (armed && Math.floor(t * (z.life < 1 ? 12 : 4)) % 2) { ctx.fillStyle = '#ff2448'; ctx.fillRect(z.x - 2, z.y - 16, 4, 4); }
            break;
          }
          case 'wave': {
            // 808 shockwave drawn in code: a faint filled disc, the hot front ring, a white inner edge, a trailing
            // echo ring and dust ticks thrown off the front; bloom rings the front
            const R0 = Math.max(4, z.r);
            ctx.fillStyle = U.rgba(z.col, 0.08 * k); ctx.beginPath(); ctx.arc(z.x, z.y, R0, 0, TAU); ctx.fill();
            ctx.strokeStyle = U.rgba(z.col, 0.95 * k); ctx.lineWidth = 3 + 9 * k;
            ctx.beginPath(); ctx.arc(z.x, z.y, R0, 0, TAU); ctx.stroke();
            ctx.strokeStyle = U.rgba('#ffffff', 0.85 * k); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(1, R0 - 4 - 4 * k), 0, TAU); ctx.stroke();
            ctx.strokeStyle = U.rgba(z.col, 0.35 * k); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(z.x, z.y, R0 * 0.7, 0, TAU); ctx.stroke();
            ctx.strokeStyle = U.rgba('#ffffff', 0.6 * k); ctx.lineWidth = 2; ctx.beginPath();
            for (let i = 0; i < 16; i++) { const a = i * TAU / 16 + z.max * 7, d0 = R0 + 3, d1 = R0 + 3 + 10 * k; ctx.moveTo(z.x + Math.cos(a) * d0, z.y + Math.sin(a) * d0); ctx.lineTo(z.x + Math.cos(a) * d1, z.y + Math.sin(a) * d1); }
            ctx.stroke();
            if (RS.Post.active) RS.Post.ring(z.x, z.y, R0, 14, z.col, 0.7 * k);
            break;
          }
          case 'slash': {
            // CHROME WHIP / ICED OUT: crisp vector chain sweeping over the real hit arc (centred on z.ang, z.arc wide).
            // The head races out along the arc, the tail follows and reels the chain back in; links, trail and tip
            // are drawn as sharp strokes, so the swing reads clearly at any zoom.
            this.drawWhip(ctx, z, 1 - k);
            break;
          }
          case 'stab': this.drawStab(ctx, z, 1 - k); break;
          case 'cone': {
            const a0 = z.ang - z.arc / 2, a1 = z.ang + z.arc / 2;
            const grow = 1 - k;
            if (RS.FXS.ready) { // painted sound waves fill the cone as it opens, then fade through the thinner frames
              const X = RS.FXS, n = X.count('sound_cone'), i = Math.min(n - 1, Math.floor(grow * n)), f = X.frame('sound_cone', i);
              const rc = z.r * (0.35 + grow * 0.65), kx = rc / f[2], ky = (rc * Math.tan(Math.min(z.arc / 2, 1.2))) / (f[3] / 2);
              ctx.globalCompositeOperation = 'lighter'; // the grey painting reads as sound light, not smoke, on the asphalt
              X.draw(ctx, 'sound_cone', i, z.x, z.y, z.ang, kx, Math.min(1, k * 3), z.col === '#e3ece6' ? '' : X.colorize(z.col), ky);
              ctx.globalCompositeOperation = 'source-over';
              break;
            }
            ctx.fillStyle = U.rgba(z.col, 0.22 * k);
            ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.arc(z.x, z.y, z.r * (0.3 + grow * 0.7), a0, a1); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = U.rgba(z.col, 0.8 * k); ctx.lineWidth = 3;
            for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (i / 3) * (0.3 + grow * 0.7), a0, a1); ctx.stroke(); }
            break;
          }
          default: RS.Stash.drawZone(ctx, z, fade); // stash kinds: toxic cloud
        }
      }
    },

    // ------------------------------------------------------------ projectiles
    // painted look for a projectile (RS.FXS); false = no sprite for it, draw the procedural one
    drawProjSprite(ctx, pr, a) {
      if (pr.kind === 'bolt') { this.drawRageBolt(ctx, pr, a); return true; }
      const X = RS.FXS;
      if (!X.ready) return false;
      switch (pr.kind) {
        case 'bullet':
          if (RS.Post.active) RS.Post.streak(pr.x - Math.cos(a) * pr.r * 2.5, pr.y - Math.sin(a) * pr.r * 2.5, a, pr.r * 9, pr.r * 3, pr.col, 0.6);
          X.draw(ctx, 'bullet', 0, pr.x, pr.y, a, pr.r * 0.17);
          return true;
        case 'bolt':
          RS.Post.glow(pr.x, pr.y, pr.r * 2.6, pr.col, 0.5);
          X.draw(ctx, 'rage_fly', 0, pr.x, pr.y, a, pr.r * 0.055, 1, X.filterFor('#ff2448', pr.col));
          return true;
        case 'shard': // glitch glock paints purple; evolutions and child shards take their own colour
          X.draw(ctx, 'glitch_fly', Math.floor(pr.age * 14), pr.x, pr.y, a, pr.r * 0.1, 1, pr.col === '#9cff35' ? '' : X.filterFor('#b45cff', pr.col));
          return true;
        case 'bass': {
          const evo = pr.col !== '#ff2448';
          RS.Post.glow(pr.x, pr.y, pr.r * 2.1, evo ? pr.col : '#9cff35', 0.55);
          X.draw(ctx, 'bass_fly', Math.floor(pr.age * 10), pr.x, pr.y, a, pr.r * 0.04 * (1 + Math.sin(pr.age * 20) * 0.05), 1, evo ? X.filterFor('#9cff35', pr.col) : '');
          return true;
        }
        case 'rocket':
          RS.Post.glow(pr.x - Math.cos(a) * 14, pr.y - Math.sin(a) * 14, pr.small ? 14 : 22, '#ff9a3a', 0.9);
          X.draw(ctx, 'rocket_fly', Math.floor(pr.age * 16), pr.x, pr.y, a, pr.small ? 0.26 : 0.42);
          return true;
        case 'cd': { // the painted frames already spin in perspective, so they are not rotated
          const rec = pr.w && pr.w.def && pr.w.def.id === 'platinum_plaque';
          X.draw(ctx, rec ? 'record_spin' : 'cd_spin', Math.floor(pr.age * 16), pr.x, pr.y, 0, pr.r * (rec ? 0.045 : 0.042));
          return true;
        }
      }
      return false;
    },
    // RAGE BURST bolt, drawn in code: a tapered speed trail, two fading afterimages, a crisp neon chevron with a dark
    // rim (reads on the bright floor) and a white-hot core. One small bloom dot is the only soft part.
    rageTrail(col) {
      const c = this._rageTrail || (this._rageTrail = {});
      if (!c[col]) { // unit-length gradient, scaled per bolt, so nothing is allocated per frame
        const g = RS.Main.ctx.createLinearGradient(-1, 0, 0, 0);
        g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(0.7, U.rgba(col, 0.35)); g.addColorStop(1, U.rgba(col, 0.75));
        c[col] = g;
      }
      return c[col];
    },
    drawRageBolt(ctx, pr, a) {
      const r = pr.r * (pr.child ? 0.85 : 1), col = pr.col;
      const pulse = 1 + Math.sin(pr.age * 48) * 0.07, L = r * 1.6 * pulse, W = r * 0.78;
      RS.Post.glow(pr.x, pr.y, r * 2.4, col, 0.7);
      // lozenge: front tip at x+f, back tip at x-b with a shallow notch, half-width w
      const loz = (x, f, b, w) => { ctx.beginPath(); ctx.moveTo(x + f, 0); ctx.lineTo(x, -w); ctx.lineTo(x - b, -w * 0.25); ctx.lineTo(x - b * 0.75, 0); ctx.lineTo(x - b, w * 0.25); ctx.lineTo(x, w); ctx.closePath(); };
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
      const tl = Math.min(r * 7.5, 6 + pr.age * 1100); // grows out of the muzzle in the first frames
      ctx.save(); ctx.scale(tl, W * 0.75); ctx.fillStyle = this.rageTrail(col);
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(0, -1); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill(); ctx.restore();
      // afterimages: smaller lozenges spaced back along the path, the rhythm reads as speed
      ctx.fillStyle = col;
      for (let i = 1; i <= 2; i++) {
        const o = -L * 1.25 * i, k = 1 - i * 0.25;
        ctx.globalAlpha = 0.6 - i * 0.2; loz(o, L * 0.7 * k, L * 0.55 * k, W * 0.75 * k); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // body: dark rim, neon lozenge with a forward chevron notch cut in the back, white-hot core
      ctx.fillStyle = '#2a0610'; loz(0, L * 1.18, L * 0.95, W * 1.25); ctx.fill();
      ctx.fillStyle = col; loz(0, L, L * 0.8, W); ctx.fill();
      ctx.fillStyle = U.rgba('#ffffff', 0.55); loz(L * 0.05, L * 0.8, L * 0.55, W * 0.62); ctx.fill();
      ctx.fillStyle = '#ffffff'; loz(L * 0.12, L * 0.62, L * 0.32, W * 0.34); ctx.fill();
      ctx.restore();
    },
    // a projectile is gone: play the painted break / pop of its sheet row
    projEnd(pr) {
      if (pr.x === undefined) return;
      const a = Math.atan2(pr.vy, pr.vx);
      switch (pr.kind) {
        case 'bolt': if (pr.life <= 0 && !pr.child) FX.rage(1, pr.x, pr.y, a, pr.col, 0.45); break; // ran out: small fizzle (hits pop in combat)
        case 'shard': if (!pr.child) FX.pop(pr.x, pr.y, 20, [pr.col, '#ffffff'], 'glitch'); break;
        case 'bass': FX.pop(pr.x, pr.y, pr.r * 2.2, [pr.col, '#ffffff'], 'bass'); break;
        case 'rocket': FX.smoke(pr.x, pr.y, pr.small ? 2 : 3, pr.small ? 9 : 14, '#6e6a66', { spd: 30, vy: -20, life: 0.8, grow: 1.5, alpha: 0.35 }); break;
        case 'cd': {
          const rec = pr.w && pr.w.def && pr.w.def.id === 'platinum_plaque';
          FX.pop(pr.x, pr.y, pr.r * 2.6, rec ? ['#ffffff', '#ffe14a'] : ['#d8dee8', '#ff4f6e'], 'shatter');
          break;
        }
      }
    },
    drawProjectiles(ctx, G, v) {
      for (const pr of G.projs.list) {
        if (pr.dead || pr.x < v.x0 || pr.x > v.x1 || pr.y < v.y0 || pr.y > v.y1) continue;
        const a = Math.atan2(pr.vy, pr.vx);
        if (this.drawProjSprite(ctx, pr, a)) continue;
        switch (pr.kind) {
          case 'bolt': {
            RS.Post.glow(pr.x, pr.y, pr.r * 2.6, pr.col, 0.7);
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
            ctx.fillStyle = pr.col; ctx.fillRect(-pr.r * 2.6, -pr.r * 0.55, pr.r * 3.2, pr.r * 1.1);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(-pr.r * 1.2, -pr.r * 0.25, pr.r * 1.8, pr.r * 0.5);
            ctx.restore();
            break;
          }
          case 'bullet': {
            // tracer: warm streak + hot white core (+ bloom streak)
            if (RS.Post.active) RS.Post.streak(pr.x - Math.cos(a) * pr.r * 2.5, pr.y - Math.sin(a) * pr.r * 2.5, a, pr.r * 9, pr.r * 3, pr.col, 0.8);
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
            ctx.globalAlpha = 0.45; ctx.fillStyle = pr.col; ctx.fillRect(-pr.r * 6, -pr.r * 0.45, pr.r * 6, pr.r * 0.9); ctx.globalAlpha = 1;
            ctx.fillStyle = pr.col; ctx.fillRect(-pr.r * 2.2, -pr.r * 0.6, pr.r * 3.2, pr.r * 1.2);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(-pr.r * 0.6, -pr.r * 0.3, pr.r * 1.6, pr.r * 0.6);
            ctx.restore();
            break;
          }
          case 'shard': {
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.spin);
            ctx.fillStyle = pr.col; ctx.fillRect(-pr.r, -pr.r, pr.r * 2, pr.r * 2);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(-pr.r * 0.4, -pr.r * 0.4, pr.r * 0.8, pr.r * 0.8);
            ctx.restore();
            break;
          }
          case 'spin': {
            if (RS.Post.active) RS.Post.glow(pr.x, pr.y, pr.r * 1.8, pr.col, 0.35);
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.spin);
            ctx.fillStyle = pr.col; ctx.beginPath(); ctx.arc(0, 0, pr.r, 0, TAU); ctx.fill();
            ctx.fillStyle = '#14101c'; ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.72, 0, TAU); ctx.fill();
            ctx.fillStyle = pr.col; ctx.fillRect(-pr.r * 0.45, -pr.r * 0.35, pr.r * 0.25, pr.r * 0.25); ctx.fillRect(pr.r * 0.2, -pr.r * 0.35, pr.r * 0.25, pr.r * 0.25);
            ctx.strokeStyle = pr.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.4, 0.3, Math.PI - 0.3); ctx.stroke();
            ctx.restore();
            if (pr.bonusNow > 0) { ctx.fillStyle = '#9cff35'; ctx.fillRect(pr.x - 2, pr.y - pr.r - 6, 4, 4); }
            break;
          }
          case 'bass': {
            const pulse = 1 + Math.sin(pr.age * 20) * 0.08;
            RS.Post.glow(pr.x, pr.y, pr.r * 2.1, pr.col, 0.65);
            ctx.fillStyle = U.rgba('#050507', 0.8); ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.7 * pulse, 0, TAU); ctx.fill();
            ctx.strokeStyle = pr.col; ctx.lineWidth = 3;
            for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * (0.35 + i * 0.22) * pulse, 0, TAU); ctx.stroke(); }
            break;
          }
          case 'rocket': {
            RS.Post.glow(pr.x - Math.cos(a) * 14, pr.y - Math.sin(a) * 14, pr.small ? 14 : 22, '#ff9a3a', 0.9);
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
            const s = pr.small ? 0.6 : 1;
            ctx.fillStyle = '#cfd6e3'; ctx.fillRect(-10 * s, -3 * s, 16 * s, 6 * s);
            ctx.fillStyle = pr.col; ctx.fillRect(6 * s, -3 * s, 5 * s, 6 * s);
            ctx.fillStyle = '#ffe14a'; ctx.fillRect(-15 * s, -2 * s, 5 * s, 4 * s);
            ctx.restore();
            break;
          }
          case 'cd': {
            ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.spin);
            ctx.fillStyle = '#d8dee8'; ctx.beginPath(); ctx.arc(0, 0, pr.r, 0, TAU); ctx.fill();
            ctx.strokeStyle = pr.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.7, 0, 1.6); ctx.stroke();
            ctx.strokeStyle = '#e3ece6'; ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.7, 3, 4.4); ctx.stroke();
            ctx.fillStyle = '#0b0b0e'; ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.25, 0, TAU); ctx.fill();
            ctx.restore();
            break;
          }
          case 'heart': {
            RS.Post.glow(pr.x, pr.y, 18, pr.col, 0.6);
            ctx.fillStyle = pr.col;
            ctx.beginPath(); ctx.arc(pr.x - 4, pr.y - 2, 5, 0, TAU); ctx.arc(pr.x + 4, pr.y - 2, 5, 0, TAU); ctx.moveTo(pr.x - 9, pr.y); ctx.lineTo(pr.x, pr.y + 10); ctx.lineTo(pr.x + 9, pr.y); ctx.fill();
            break;
          }
          default: RS.Stash.drawProj(ctx, pr, a); // stash kinds: spike, ghost, bob, soul, energy
        }
      }
    },
    drawEnemyShots(ctx, G, v) {
      const vis = [];
      for (const s of G.eshots.list) if (!s.dead && s.x > v.x0 && s.x < v.x1 && s.y > v.y0 && s.y < v.y1) vis.push(s);
      if (!vis.length) return;
      if (RS.Post.active) for (const s of vis) RS.Post.glow(s.x, s.y, s.r * 2.8, s.col, 0.8);
      else {
        ctx.globalCompositeOperation = 'lighter';
        for (const s of vis) ctx.drawImage(S.glow(s.col, Math.round(s.r * 2.6)), s.x - s.r * 2.6, s.y - s.r * 2.6);
        ctx.globalCompositeOperation = 'source-over';
      }
      for (const s of vis) { ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#050507';
      ctx.beginPath();
      for (const s of vis) { ctx.moveTo(s.x + s.r * 0.5, s.y); ctx.arc(s.x, s.y, s.r * 0.5, 0, TAU); }
      ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const s of vis) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU); }
      ctx.stroke();
    },
    // Attack warnings, all drawn in code. Every enemy family has its own shape (t.look) so you can read WHO is about to
    // hit you, not just where. Nothing strobes: brightness only ramps up with the wind-up (k) and motion is slow
    // scrolling, so the screen never flashes more than the 3-per-second photosensitivity limit.
    drawTelegraphs(ctx, G) {
      const t0 = G.time;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const t of G.teles) {
        const k = Math.min(1, t.t / t.warn);
        if (t.kind === 'circle') this.teleCircle(ctx, t, k, t0);
        else if (t.kind === 'rect') {
          ctx.fillStyle = U.rgba(t.col, 0.06 + k * 0.12); ctx.fillRect(t.x, t.y, t.w, t.h); // fainter square warnings
          ctx.strokeStyle = U.rgba(t.col, 0.75); ctx.lineWidth = 2.5; ctx.strokeRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
          ctx.fillStyle = U.rgba(t.col, 0.18); ctx.fillRect(t.x + t.w / 2 * (1 - k), t.y + t.h / 2 * (1 - k), t.w * k, t.h * k);
        } else if (t.kind === 'line') {
          const X = RS.FXS, x1 = t.x + Math.cos(t.ang) * t.len, y1 = t.y + Math.sin(t.ang) * t.len;
          if (t.fx === 'flashlight' && X.ready) { // SECURITY: painted light cone fades in while aiming, flares when it fires
            ctx.globalCompositeOperation = 'lighter';
            X.drawStrip(ctx, 'flash_cone', t.x, t.y, x1, y1, t.w * 2.2, t.fired ? 0.95 : (0.22 + k * 0.6) * 0.65, '', 0, 0.12);
            ctx.globalCompositeOperation = 'source-over';
            if (!t.fired) { // a scanning sweep crosses the cone so it reads as "about to spot you"
              ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
              const sx = t.len * (0.15 + 0.85 * k), sw = t.w * (0.3 + 0.9 * sx / t.len);
              ctx.strokeStyle = U.rgba('#fff6c8', 0.35 + k * 0.5); ctx.lineWidth = 3;
              ctx.beginPath(); ctx.moveTo(sx, -sw); ctx.lineTo(sx, sw); ctx.stroke();
              ctx.restore();
            }
            continue;
          }
          if (t.fx === 'laser' && X.ready && t.fired && t.active > 0) { // boss laser: the painted beam with its charge rings
            X.drawStrip(ctx, 'laser_beam', t.x, t.y, x1, y1, t.w * (1.5 + Math.sin(t0 * 9) * 0.06), 1, '', 0);
            continue;
          }
          if (t.sight) { // ranged enemy's locked aim: thin dashed sight line that fills in, target tick at the end
            if (t.fired || (t.src && (t.src.dead || t.src.state !== 'aim'))) continue; // shooter dropped or was knocked out of its aim
            ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
            ctx.strokeStyle = U.rgba(t.col, 0.3 + k * 0.4); ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t0 * 60;
            ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(t.len, 0); ctx.stroke(); ctx.setLineDash([]);
            ctx.strokeStyle = U.rgba(t.col, 0.5 + k * 0.45); ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(18 + (t.len - 18) * k, 0); ctx.stroke();
            const e = t.len, q = 7 + (1 - k) * 8; // crosshair closing on the end point
            ctx.beginPath(); ctx.arc(e, 0, q, 0, TAU); ctx.moveTo(e - q - 5, 0); ctx.lineTo(e - q + 3, 0); ctx.moveTo(e + q - 3, 0); ctx.lineTo(e + q + 5, 0);
            ctx.moveTo(e, -q - 5); ctx.lineTo(e, -q + 3); ctx.moveTo(e, q - 3); ctx.lineTo(e, q + 5); ctx.stroke();
            ctx.restore();
            continue;
          }
          this.teleLane(ctx, t, k, t0);
        } else if (t.kind === 'ring') {
          if (t.t < t.warn) {
            ctx.strokeStyle = U.rgba(t.col, 0.35 + k * 0.4); ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.arc(t.x, t.y, (t.r0 || 40) + 30, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          } else {
            ctx.strokeStyle = U.rgba(t.col, 0.35); ctx.lineWidth = t.w + 10; ctx.beginPath(); ctx.arc(t.x, t.y, t.rad, 0, TAU); ctx.stroke();
            ctx.strokeStyle = t.col; ctx.lineWidth = t.w * 0.5; ctx.beginPath(); ctx.arc(t.x, t.y, t.rad, 0, TAU); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, t.rad, 0, TAU); ctx.stroke();
          }
        }
      }
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    },
    // circle warnings: the exact hit radius always has a solid edge; the inside says who is coming
    //   slam  (bruiser)  subwoofer cone: rings pump in toward the dust cap, cracks run out from it
    //   stomp (big shoe) the falling shoe's shadow darkens and lock-on brackets close in
    //   anything else (bosses) dashed inner ring, four ticks and a "!"
    teleCircle(ctx, t, k, t0) {
      const x = t.x, y = t.y, r = t.r, col = t.col, look = t.look, hot = k > 0.8;
      ctx.fillStyle = U.rgba(col, 0.07 + k * 0.1); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (look === 'slam') {
        ctx.fillStyle = U.rgba(col, 0.22); ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.fill();
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { // speaker rings sliding inward, fading as they reach the middle
          const q = (i / 3 + t0 * 0.9) % 1, rr = r * (0.92 - q * 0.6);
          ctx.strokeStyle = U.rgba('#ffffff', (0.15 + 0.35 * k) * (1 - q)); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = U.rgba('#120a0e', 0.55); ctx.beginPath(); ctx.arc(x, y, r * 0.26, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgba(col, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * 0.26, 0, TAU); ctx.stroke();
        ctx.strokeStyle = U.rgba(col, 0.45 + k * 0.4); ctx.lineWidth = 2.5; ctx.beginPath(); // cracks grow with the wind-up
        for (let i = 0; i < 7; i++) {
          let a = i * TAU / 7 + 0.4, d = r * 0.28;
          ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          for (let j = 0; j < 3; j++) { d += r * 0.22 * k; a += (((i * 7 + j * 3) % 5) - 2) * 0.12; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
        }
        ctx.stroke();
      } else if (look === 'stomp') {
        ctx.fillStyle = U.rgba('#06040a', 0.15 + k * 0.4); // the shadow gets darker and tighter as the shoe falls
        ctx.beginPath(); ctx.ellipse(x, y, r * (0.45 + 0.5 * k), r * (0.3 + 0.35 * k), 0, 0, TAU); ctx.fill();
        const d = r * (1.4 - 0.32 * k), q = r * 0.28, rot = t0 * 0.5;
        ctx.strokeStyle = U.rgba(col, 0.55 + k * 0.4); ctx.lineWidth = 3.5; ctx.beginPath();
        for (let i = 0; i < 4; i++) { // four L brackets
          const a = rot + i * Math.PI / 2 + Math.PI / 4, cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
          const a1 = a + Math.PI * 0.75, a2 = a - Math.PI * 0.75;
          ctx.moveTo(cx + Math.cos(a1) * q, cy + Math.sin(a1) * q); ctx.lineTo(cx, cy); ctx.lineTo(cx + Math.cos(a2) * q, cy + Math.sin(a2) * q);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = U.rgba(col, 0.26); ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgba('#ffffff', 0.5); ctx.lineWidth = 1.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t0 * 40;
        ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = U.rgba(col, 0.9); ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; ctx.moveTo(x + Math.cos(an) * r * 1.08, y + Math.sin(an) * r * 1.08); ctx.lineTo(x + Math.cos(an) * r * 0.86, y + Math.sin(an) * r * 0.86); }
        ctx.stroke();
      }
      if (look !== 'slam' && look !== 'stomp') { // the "!" mark
        const ex = Math.max(8, r * 0.12);
        ctx.fillStyle = U.rgba('#ffffff', 0.7 + k * 0.3);
        ctx.fillRect(x - ex * 0.28, y - ex * 1.6, ex * 0.56, ex * 2.1); ctx.fillRect(x - ex * 0.3, y + ex * 0.8, ex * 0.6, ex * 0.6);
      }
      ctx.strokeStyle = U.rgba(col, 0.8 + k * 0.2); ctx.lineWidth = hot ? 4 : 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      if (hot) { ctx.strokeStyle = U.rgba('#ffffff', (k - 0.8) * 4); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 3, 0, TAU); ctx.stroke(); }
      RS.Post.ring(x, y, r, 12, col, (0.35 + k * 0.4) * (look === 'stomp' ? 0.45 : 1)); // the green shoe ring blooms far brighter than red
    },
    // lane warnings, drawn in the lane's own frame (x runs along the attack)
    //   lunge  (street chasers) three chevrons streaming at you, no box
    //   charge (fiend, king)    neon rails with fast chevrons and an arrowhead; t.trim colours the rails
    //   gallop (pink pony)      a rainbow of three dashed stripes with sparkles riding it
    //   whip   (stretch man)    a wavy arm that pulls straight as the whip is ready, a hand at the end
    //   laser  (algorithm)      a hairline that swells to the beam width
    teleLane(ctx, t, k, t0) {
      const L = t.len, hw = t.w / 2, col = t.col, look = t.look || 'lunge';
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
      if (t.fired) {
        if (t.active > 0) {
          ctx.fillStyle = U.rgba(col, 0.5); ctx.fillRect(0, -hw - 6, L, t.w + 12);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -hw / 2, L, hw);
        }
        ctx.restore(); return;
      }
      // lane warnings sit at 58% of their old strength: still readable, no longer a solid slab over the fight
      ctx.globalAlpha = 0.58;
      if (look === 'laser') {
        const w = 2 + (t.w * 0.55 - 2) * k * k;
        ctx.fillStyle = U.rgba(col, 0.05 + k * 0.1); ctx.fillRect(0, -hw, L, t.w);
        ctx.strokeStyle = U.rgba(col, 0.45 + k * 0.45); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
        ctx.strokeStyle = U.rgba('#ffffff', 0.35 + k * 0.55); ctx.lineWidth = Math.max(1, w * 0.3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      } else if (look === 'whip') {
        ctx.fillStyle = U.rgba(col, 0.06 + k * 0.08); ctx.fillRect(0, -hw, L, t.w);
        ctx.strokeStyle = U.rgba(col, 0.35); ctx.lineWidth = 1.5; ctx.setLineDash([4, 10]);
        ctx.beginPath(); ctx.moveTo(0, -hw); ctx.lineTo(L, -hw); ctx.moveTo(0, hw); ctx.lineTo(L, hw); ctx.stroke(); ctx.setLineDash([]);
        const amp = hw * 0.75 * (1 - k) + 1.5, reach = L * (0.35 + 0.65 * k);
        ctx.strokeStyle = U.rgba(col, 0.5 + k * 0.45); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0);
        for (let x = 10; x <= reach; x += 10) ctx.lineTo(x, Math.sin(x / 24 - t0 * 7) * amp * (x / L));
        ctx.stroke();
        ctx.strokeStyle = U.rgba('#ffffff', 0.4 + k * 0.4); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = U.rgba('#efe7ff', 0.6 + k * 0.4); ctx.beginPath(); ctx.arc(reach, Math.sin(reach / 24 - t0 * 7) * amp * (reach / L), hw * 0.42, 0, TAU); ctx.fill();
      } else if (look === 'gallop') {
        ctx.fillStyle = U.rgba(col, 0.16); ctx.fillRect(0, -hw, L * k, t.w);
        const stripes = ['#ff6ad5', '#3ff2ff', '#fff36a'];
        ctx.lineWidth = 3.5; ctx.setLineDash([18, 12]); ctx.lineDashOffset = -t0 * 140;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = U.rgba(stripes[i], 0.35 + k * 0.5);
          ctx.beginPath(); ctx.moveTo(0, (i - 1) * hw * 0.55); ctx.lineTo(L, (i - 1) * hw * 0.55); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = U.rgba('#ffffff', 0.5 + k * 0.4);
        for (let i = 0; i < 5; i++) { // little four-point sparkles riding the rainbow
          const sx = ((i / 5 + t0 * 0.45) % 1) * L, sy = Math.sin(i * 2.1) * hw * 0.75, s = 4 + k * 4;
          ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s * 0.3, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s * 0.3, sy); ctx.closePath();
          ctx.moveTo(sx - s, sy); ctx.lineTo(sx, sy + s * 0.3); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy - s * 0.3); ctx.closePath(); ctx.fill();
        }
      } else { // lunge / charge
        const charge = look === 'charge';
        const g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, U.rgba(col, charge ? 0.26 : 0.3)); g.addColorStop(1, U.rgba(col, charge ? 0.03 : 0.08));
        ctx.fillStyle = g; ctx.fillRect(0, -hw, L, t.w);
        ctx.fillStyle = U.rgba(col, charge ? 0.22 : 0.3); ctx.fillRect(0, -hw, L * k, t.w);
        if (!charge) { // the short fan lunge was easy to miss: a dark outline makes the chevrons pop off any floor
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 7;
          const q0 = hw * 0.7;
          for (let i = 0; i < 3; i++) { const cx = ((i + (t0 * 1.3) % 1) / 3) * (L - q0) + q0 * 0.5; ctx.beginPath(); ctx.moveTo(cx - q0 * 0.6, -q0); ctx.lineTo(cx, 0); ctx.lineTo(cx - q0 * 0.6, q0); ctx.stroke(); }
        }
        if (charge) {
          ctx.strokeStyle = U.rgba(t.trim || col, 0.6 + k * 0.4); ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(0, -hw); ctx.lineTo(L - hw * 0.9, -hw); ctx.lineTo(L, 0); ctx.lineTo(L - hw * 0.9, hw); ctx.lineTo(0, hw); ctx.stroke();
        }
        const n = charge ? 5 : 3, off = (t0 * (charge ? 1.8 : 1.3)) % 1, q = hw * (charge ? 0.55 : 0.7);
        ctx.lineWidth = charge ? 4 : 3.5;
        for (let i = 0; i < n; i++) {
          const cx = ((i + off) / n) * (L - q) + q * 0.5, fade = Math.sin(Math.PI * cx / L);
          ctx.strokeStyle = U.rgba(i / n < k ? '#ffffff' : col, (charge ? 0.3 + k * 0.6 : 0.55 + k * 0.45) * fade);
          ctx.beginPath(); ctx.moveTo(cx - q * 0.6, -q); ctx.lineTo(cx, 0); ctx.lineTo(cx - q * 0.6, q); ctx.stroke();
        }
      }
      if (look !== 'laser') { // the timing front: a white bar that sweeps to the end of the lane
        ctx.strokeStyle = U.rgba('#ffffff', 0.3 + k * 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(L * k, -hw); ctx.lineTo(L * k, hw); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
    drawEventMarkers(ctx, G) {
      const D2 = RS.Director, t = G.time;
      const c = D2.cypher;
      if (c) {
        ctx.fillStyle = U.rgba('#ffcf3f', c.state === 'fight' ? 0.06 : 0.12); ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 4; ctx.setLineDash([16, 10]);
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r, t, t + TAU); ctx.stroke(); ctx.setLineDash([]);
        if (c.state === 'wait') {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * (c.t / 2.5)); ctx.stroke();
          R.label(c.x, c.y - c.r - 14, 'CYPHER · ' + Math.ceil(c.life) + 's', '#ffcf3f', 13);
        }
      }
      const s = D2.supply;
      if (s) {
        const k = 1 - s.t / 5;
        ctx.strokeStyle = U.rgba('#e3ece6', 0.8); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, 140 - k * 100, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x - 20, s.y); ctx.lineTo(s.x + 20, s.y); ctx.moveTo(s.x, s.y - 20); ctx.lineTo(s.x, s.y + 20); ctx.stroke();
        R.label(s.x, s.y - 150 + k * 100, 'SUPPLY DROP ' + Math.ceil(s.t), '#e3ece6', 13);
      }
    },
  };

  RS.Render = R;
})(window.RS);
