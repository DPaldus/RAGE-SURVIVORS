'use strict';
// Particles, damage numbers, rings, lightning arcs, screen shake / flash / glitch, banners.
(function (RS) {
  const U = RS.U;
  const NUM_CAP = 12, CRIT_CAP = 18, CALL_CAP = 3; // floating text budgets (FX.text)
  const BANNER_CAP = 2; // banners on screen at once (FX.banner)

  const FX = {
    numN: 0, // damage numbers alive (counted in update)
    parts: new RS.Pool(() => ({})),
    texts: new RS.Pool(() => ({})),
    rings: new RS.Pool(() => ({})),
    arcs: [],
    trauma: 0, shakeX: 0, shakeY: 0,
    flashA: 0, flashCol: '#ffffff',
    hurtA: 0,
    glitchT: 0,
    banners: [],
    reset() {
      this.parts.clear(); this.texts.clear(); this.rings.clear(); this.arcs.length = 0;
      this.trauma = 0; this.flashA = 0; this.hurtA = 0; this.glitchT = 0; this.banners.length = 0; this.numN = 0;
    },
    settings() { return RS.Save.s; },

    // ---- spawners
    burst(x, y, col, n, spd, opts) {
      opts = opts || {};
      const cap = RS.GFX ? RS.GFX.particleCap() : 1400;
      if (this.parts.count > cap) n = Math.min(n, 1);
      else if (n > 2 && RS.GFX) n = Math.max(1, Math.round(n * RS.GFX.particleMul()));
      for (let i = 0; i < n; i++) {
        const p = this.parts.spawn();
        const a = opts.angle !== undefined ? opts.angle + U.rand(-(opts.spread || 0.6), opts.spread || 0.6) : U.rand(U.TAU);
        const s = U.rand(spd * 0.3, spd);
        p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
        p.life = p.max = U.rand(opts.life || 0.35, (opts.life || 0.35) * 1.8);
        p.col = Array.isArray(col) ? U.pick(col) : col;
        p.size = opts.size || U.rand(2, 4);
        p.kind = opts.kind || 'sq';
        p.drag = opts.drag !== undefined ? opts.drag : 4;
        p.grav = opts.grav || 0;
        p.add = !!opts.add; p.glow = opts.glow || 0; p.z = 0; p.vz = 0;
      }
    },
    // pooled particle with sane defaults for the specialised spawners below
    one(kind, x, y, vx, vy, life, col, size) {
      const p = this.parts.spawn();
      p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.col = col; p.size = size;
      p.drag = 4; p.grav = 0; p.add = false; p.glow = 0; p.z = 0; p.vz = 0; p.rot = 0; p.vr = 0; p.grow = 0;
      return p;
    },
    room(n) { return this.parts.count + n <= (RS.GFX ? RS.GFX.particleCap() : 1400); },
    // hot streaks that bloom (impacts, ricochets, muzzle)
    sparks(x, y, ang, n, col, spd, spread) {
      n = Math.max(1, Math.round(n * (RS.GFX ? RS.GFX.particleMul() : 1)));
      if (!this.room(n)) return;
      for (let i = 0; i < n; i++) {
        const a = ang + U.rand(-(spread || 0.9), spread || 0.9), sp = U.rand(0.35, 1) * (spd || 380);
        const p = this.one('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.12, 0.26), col, U.rand(1.6, 2.6));
        p.drag = 7; p.glow = 1;
      }
    },
    // soft rising puffs: gunsmoke, explosion clouds, manhole steam, dust
    smoke(x, y, n, size, col, o) {
      o = o || {};
      if (!this.room(n)) return;
      for (let i = 0; i < n; i++) {
        const a = U.rand(U.TAU), sp = U.rand(0.2, 1) * (o.spd || 40);
        const p = this.one('smoke', x + U.rand(-size, size) * 0.4, y + U.rand(-size, size) * 0.3, Math.cos(a) * sp + (o.vx || 0), Math.sin(a) * sp * 0.5 + (o.vy === undefined ? -18 : o.vy), U.rand(0.7, 1.3) * (o.life || 0.9), col || '#c9ccd0', size * U.rand(0.7, 1.2));
        p.drag = 1.6; p.grow = o.grow || 1.6; p.alpha = o.alpha || 0.32; p.rot = U.rand(U.TAU);
      }
    },
    // brass ejected from the pistol: tumbles, bounces on the asphalt, then lies there for a moment
    casing(x, y, ang) {
      if (!this.room(1)) return;
      const a = ang + Math.PI * 0.5 * (Math.cos(ang) < 0 ? -1 : 1) + U.rand(-0.4, 0.4), sp = U.rand(70, 120);
      const p = this.one('casing', x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, U.rand(1.6, 2.4), '#e2b934', 3);
      p.z = 14; p.vz = U.rand(90, 150); p.vr = U.rand(-20, 20); p.drag = 2.2;
    },
    // chunks of a broken prop: same bounce physics, take the prop palette
    debris(x, y, cols, n, spd) {
      n = Math.max(1, Math.round(n * (RS.GFX ? RS.GFX.particleMul() : 1)));
      if (!this.room(n)) return;
      for (let i = 0; i < n; i++) {
        const a = U.rand(U.TAU), sp = U.rand(0.3, 1) * (spd || 200);
        const p = this.one('chunk', x + U.rand(-8, 8), y + U.rand(-6, 6), Math.cos(a) * sp, Math.sin(a) * sp * 0.6, U.rand(1.2, 2.2), U.pick(cols), U.rand(2.5, 5));
        p.z = U.rand(6, 22); p.vz = U.rand(60, 220); p.vr = U.rand(-12, 12); p.drag = 2.4;
      }
    },
    // one painted sprite animation (RS.FXS) played once over `dur` seconds; k = world px per sprite px
    anim(name, x, y, ang, k, dur, filter, light) {
      if (!RS.FXS.ok(name) || !this.room(1)) return null;
      const p = this.one('anim', x, y, 0, 0, dur, light || '#ffffff', k);
      p.drag = 0; p.rot = ang; p.name = name; p.filter = filter || ''; p.light = light || ''; p.ky = 0; p.ground = false;
      return p;
    },
    // painted death row of an enemy sheet: plays at ~13 fps, holds the last pose, then fades. Bodies stay on
    // the ground layer (under the living crowd); in a dense crowd fewer of them linger.
    corpse(e) {
      const R = RS.Render, ea = R.enemyArt(e);
      if (!ea || !ea.sh.anims.death || !this.room(1)) return null;
      const n = ea.sh.anims.death.length, play = n * 0.075, hold = this.parts.count > 700 ? 0.2 : 0.9;
      const p = this.one('corpse', e.x, e.y + e.r * 0.9, 0, 0, play + hold, '#ffffff', (ea.A.body * (e.scale / e.def.scale)) / ea.sh.body);
      p.drag = 0; p.sh = ea.sh; p.variant = ea.variant; p.flip = R.enemyPose(e, RS.Game, ea.A, ea.sh).flip; p.play = play;
      return p;
    },
    muzzle(x, y, ang, col) {
      // star flash drawn in code (+ bloom and a floor light), sparks and a puff of gun smoke
      const p = this.one('flash', x, y, 0, 0, 0.06, col || '#ffd27a', 1);
      p.rot = ang; p.drag = 0;
      this.sparks(x, y, ang, 2, '#ffe9a8', 420, 0.35);
      if (Math.random() < 0.6) this.smoke(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6, 1, 6, '#d8dad6', { spd: 20, vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30 - 12, life: 0.5, grow: 2.2, alpha: 0.22 });
    },
    // bullet / bolt impact: sparks back along the shot and a quick pop
    impact(x, y, ang, col) {
      if (!this.room(6)) return;
      this.sparks(x, y, ang + Math.PI, 3, col || '#ffe9a8', 300, 0.8);
      this.pop(x, y, 13, [col || '#ffe9a8', '#ffffff'], 'spark', ang);
    },
    // Explosion drawn in code (replaces the painted fireball): white flash, a fireball of stacked crisp discs that
    // burns from core colour to rim colour and shrinks, a sharp shock ring, flying chunks and a few dark smoke puffs
    // that rise after. Bloom does the soft part. pal: 'fire' | 'gold' | 'toxic'
    BOOM_PAL: {
      fire: ['#fff3b0', '#ffc21a', '#ff6a14', '#e8173a', '#3a2a2a'],
      gold: ['#fffbd0', '#ffe14a', '#ffb81a', '#e07a10', '#3a3222'],
      toxic: ['#eaffc0', '#b8ff4a', '#6ee02a', '#1f8a3c', '#22301e'],
    },
    // 16-bit arcade explosion: an 8-frame pixel-art puff baked once per palette into a tiny canvas strip (40 px
    // frames, hard 1-px dark outline, 4-tone ramp, dithered smoke), drawn with nearest-neighbour scaling at an
    // integer pixel size, so every pixel stays a sharp square at any zoom. Frames step at 18 fps like a sprite.
    // Bigger blasts chain 2-3 smaller puffs around the first (the classic badnik pop), plus square pixel debris.
    // Bloom adds only a short hot glow on top; nothing in the explosion itself is soft.
    BOOM_F: 8, BOOM_S: 40, BOOM_FPS: 18,
    boomStrip(P) {
      const key = P.join(''), C = this._boomStrips || (this._boomStrips = {});
      if (C[key]) return C[key];
      const S = this.BOOM_S, N = this.BOOM_F, cv = document.createElement('canvas');
      cv.width = S * N; cv.height = S;
      const g = cv.getContext('2d'), img = g.createImageData(S * N, S), d = img.data;
      const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const W = rgb('#ffffff'), cols = P.map(rgb), OUT = [28, 10, 14];
      const put = (fx, x, y, c, a) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S * N + fx * S + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a === undefined ? 255 : a; };
      // frame recipes: blobs [dx, dy, radius] and the colour ramp from rim to core (index into [white, ...pal])
      // 0 = white, 1..5 = palette (hot yellow -> smoke); each list runs rim -> core
      const ramp = [[0, 0], [1, 0], [2, 1, 0], [3, 2, 1], [4, 3, 2], [4, 3], [5, 4], [5]];
      const blobs = [
        [[0, 0, 5]], [[0, 0, 9]], [[0, 0, 13]], [[0, 0, 16]],
        [[-7, -5, 10], [7, -4, 9], [-5, 7, 9], [6, 6, 10]],
        [[-10, -8, 8], [10, -7, 7], [-8, 10, 7], [9, 9, 8]],
        [[-12, -12, 6], [12, -11, 5], [-10, 11, 5], [11, 10, 6]],
        [[-13, -15, 4], [13, -14, 3], [-11, 12, 3], [12, 11, 4]],
      ];
      for (let f = 0; f < N; f++) {
        const R = ramp[f], B = blobs[f], c = S / 2;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          let best = -1, inside = false, rim = false;
          for (const [bx, by, br] of B) {
            const dd = Math.hypot(x + 0.5 - (c + bx), y + 0.5 - (c + by));
            if (dd <= br) { inside = true; const k = 1 - dd / br; best = Math.max(best, k); }
            else if (dd <= br + 1.2) rim = true;
          }
          if (inside) {
            const band = Math.min(R.length - 1, Math.floor(best * R.length * 1.05)); // rim colour outside, core inside
            const ci = R[band], col = ci === 0 ? W : cols[ci - 1];
            if (f >= 6 && (x + y) % 2) continue; // late frames: dithered, the smoke breaks up
            put(f, x, y, col);
          } else if (rim && f >= 1 && f <= 5) put(f, x, y, OUT, 230); // hard dark outline
        }
      }
      g.putImageData(img, 0, 0);
      return (C[key] = cv);
    },
    // Explosion sprites share a budget of ~3 a second (4 at once): an item build with blast procs, mines and rockets
    // set off 9-10 a second from 8:00 and the screen read as "everything explodes". Blasts past the budget still deal
    // their damage, they just skip the sprite (Game.aoe then skips its sparks and shake too); only the huge ones
    // (r >= 150: boss slams, exploding speakers) always show.
    boomTok: 4,
    // budgeted: true = a player weapon's blast, which always spends the budget (only hazards / boss slams skip it)
    boom(x, y, r, pal, budgeted) {
      if (r < 150 || budgeted) {
        const cost = budgeted && r >= 120 ? 2 : 1; // a big weapon blast counts double: ~1.5 screen-sized fireballs a second at most
        if (this.boomTok < cost) return null;
        this.boomTok -= cost;
      }
      const p = this.one('boom', x, y, 0, 0, 0.62, '#ffffff', r);
      p.drag = 0; p.pal = this.BOOM_PAL[pal] || this.BOOM_PAL.fire; p.seed = Math.random() * 1000;
      // chain: blasts bigger than a hand grenade pop 2-3 extra smaller puffs around the first, slightly later
      const h = U.hash, sd = p.seed, n = r > 110 ? 3 : r > 55 ? 2 : 0;
      p.subs = [{ dx: 0, dy: 0, s: 1, d: 0 }];
      for (let i = 0; i < n; i++) { const a = h(sd + i) * U.TAU; p.subs.push({ dx: Math.cos(a) * r * 0.4, dy: Math.sin(a) * r * 0.34, s: 0.5, d: 0.06 + i * 0.05 }); }
      return p;
    },
    drawBoom(ctx, p, t) {
      const r = p.size, P = p.pal, Post = RS.Post, x = p.x, y = p.y, sd = p.seed, h = U.hash;
      const strip = this.boomStrip(P), S = this.BOOM_S, N = this.BOOM_F;
      const was = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1; // the sprite frames carry their own fade (dither); the particle loop's alpha would wash them out
      for (const s of p.subs) {
        const lt = t - s.d;
        if (lt < 0) continue;
        const f = Math.floor(lt * this.BOOM_FPS);
        if (f >= N) continue;
        // integer pixel size: sharp squares. The sprite spans ~2x the blast radius (it was 2.5x, and with the chained
        // puffs a big blast painted ~3.5x its real area over the hero and the crowd)
        const px = Math.max(1, Math.round((r * s.s) / 20)), size = S * px;
        const cx = Math.round(x + s.dx), cy = Math.round(y + s.dy - lt * r * 0.18); // the puff drifts up a touch
        ctx.drawImage(strip, f * S, 0, S, S, cx - size / 2, cy - size / 2, size, size);
      }
      // pixel debris: hot squares thrown out on a fixed grid, they cool to the rim colour and drop
      if (t < 0.4) {
        const px = Math.max(2, Math.round(r / 20)), k = t / 0.4;
        for (let i = 0; i < 10; i++) {
          const a = h(sd + 30 + i) * U.TAU, sp = r * (0.9 + 0.9 * h(sd + 40 + i));
          const dx = Math.cos(a) * sp * k, dy = Math.sin(a) * sp * k + k * k * r * 0.6;
          ctx.fillStyle = k < 0.35 ? '#ffffff' : k < 0.7 ? P[1] : P[3];
          ctx.fillRect(Math.round((x + dx) / px) * px, Math.round((y + dy) / px) * px, px, px);
        }
      }
      ctx.imageSmoothingEnabled = was;
      // bloom: only a short hot glow while the fireball is bright, plus a floor light
      const hot = Math.max(0, 1 - t / 0.25);
      if (hot > 0) Post.glow(x, y, r * 0.8, P[1], 0.45 * hot);
      if (t < 0.3) Post.light(x, y, r * 2.6, P[2], 0.5 * (1 - t / 0.3));
    },
    // Small bursts drawn in code (they replace every painted death puff, pop, shatter and spark sprite).
    // Crisp shapes on top, the soft part comes from bloom. style:
    //   'death'  enemy goes down: white flash, a ring in its colour, 7 rays and a few square chips
    //   'halluc' hallucination pops: a spinning star, pink / cyan sparkles, a double ring
    //   'glitch' digital pop: offset squares and scan bars that jump at 15 Hz
    //   'bass'   sonic pop: three thin rings rolling out
    //   'shatter' disc / tape breaks: triangle shards flying out and spinning
    //   'zap'    electric hit: jagged short bolts and a hot core
    //   'spark'  bullet hit: a 4-point star and short rays
    pop(x, y, r, cols, style, ang) {
      if (!this.room(1)) return null;
      const life = style === 'spark' ? 0.16 : style === 'zap' ? 0.22 : style === 'death' ? 0.32 : 0.38;
      const p = this.one('pop', x, y, 0, 0, life, Array.isArray(cols) ? cols[0] : cols, r);
      p.drag = 0; p.style = style || 'death'; p.cols = Array.isArray(cols) ? cols : [cols, '#ffffff']; p.seed = Math.random() * 1000; p.rot = ang || 0;
      return p;
    },
    drawPop(ctx, p, t) { // t = 0..1 through the burst
      const r = p.size, x = p.x, y = p.y, c0 = p.cols[0], c1 = p.cols[1] || '#ffffff', sd = p.seed, h = U.hash, Post = RS.Post;
      const out = 1 - Math.pow(1 - t, 3), fade = 1 - t, TAU = U.TAU;
      ctx.lineCap = 'round';
      switch (p.style) {
        case 'spark': {
          const s = r * (0.6 + 0.6 * out);
          ctx.globalAlpha = fade; ctx.fillStyle = '#fff6d8';
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot + sd);
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.22, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.22, 0); ctx.closePath();
          ctx.moveTo(-s * 0.7, 0); ctx.lineTo(0, s * 0.16); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, -s * 0.16); ctx.closePath(); ctx.fill();
          ctx.restore();
          if (Post.minor()) Post.glow(x, y, r * 1.6, c0, 0.6 * fade);
          break;
        }
        case 'zap': {
          ctx.globalAlpha = fade; ctx.strokeStyle = c0; ctx.lineWidth = Math.max(1.5, r * 0.08);
          const tick = Math.floor(t * 12); // short forked sparks that re-roll 12x a second
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            let a = (i / 7) * TAU + h(sd + i + tick * 7) * 0.8, d = r * 0.15;
            ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
            for (let j = 1; j <= 2; j++) { d += r * 0.22 * (0.7 + out * 0.5); a += (h(sd + i * 3 + j + tick) - 0.5) * 1.4; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
          }
          ctx.stroke();
          ctx.lineWidth = 1.5; ctx.strokeStyle = c1; ctx.beginPath(); ctx.arc(x, y, r * (0.2 + out * 0.45), 0, TAU); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.22 * fade, 0, TAU); ctx.fill();
          Post.glow(x, y, r * 1.2, c0, 0.7 * fade);
          break;
        }
        case 'bass': {
          for (let i = 0; i < 3; i++) {
            const k = U.clamp(t * 1.3 - i * 0.15, 0, 1);
            if (k <= 0 || k >= 1) continue;
            ctx.globalAlpha = 1 - k; ctx.strokeStyle = i ? c0 : c1; ctx.lineWidth = Math.max(1.5, r * 0.09 * (1 - k));
            ctx.beginPath(); ctx.arc(x, y, r * (0.25 + k * 0.9), 0, TAU); ctx.stroke();
          }
          if (Post.active) Post.ring(x, y, r * (0.3 + out * 0.8), 10, c0, 0.5 * fade);
          break;
        }
        case 'glitch': {
          const tick = Math.floor(t * 15);
          ctx.globalAlpha = fade;
          for (let i = 0; i < 7; i++) {
            const a = h(sd + i) * TAU, d = r * (0.2 + out * 0.8) * h(sd + i + 5), s = r * (0.12 + 0.18 * h(sd + i + tick * 3));
            ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 2 ? c0 : c1;
            ctx.fillRect(x + Math.cos(a) * d - s / 2 + (h(sd + tick + i) - 0.5) * 6, y + Math.sin(a) * d - s / 2, s, s);
          }
          ctx.fillStyle = c0; ctx.fillRect(x - r * out, y - 1 + (h(sd + tick) - 0.5) * r * 0.6, r * 2 * out, 2);
          Post.glow(x, y, r, c0, 0.55 * fade);
          break;
        }
        case 'shatter': {
          ctx.globalAlpha = Math.min(1, fade * 1.6);
          for (let i = 0; i < 8; i++) {
            const a = h(sd + i) * TAU, d = r * (0.15 + out * (0.7 + 0.5 * h(sd + i + 3))), s = r * (0.14 + 0.1 * h(sd + i + 7)), sp = t * 9 * (h(sd + i + 11) - 0.5) + a;
            const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
            ctx.fillStyle = i % 2 ? c0 : c1;
            ctx.beginPath(); ctx.moveTo(px + Math.cos(sp) * s, py + Math.sin(sp) * s); ctx.lineTo(px + Math.cos(sp + 2.3) * s * 0.7, py + Math.sin(sp + 2.3) * s * 0.7); ctx.lineTo(px + Math.cos(sp + 4) * s * 0.5, py + Math.sin(sp + 4) * s * 0.5); ctx.closePath(); ctx.fill();
          }
          if (t < 0.2) { ctx.globalAlpha = 1 - t / 0.2; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill(); }
          Post.glow(x, y, r * 0.9, c0, 0.5 * fade);
          break;
        }
        case 'halluc': {
          const s = r * (0.22 + 0.32 * out); // a thin spinning star outline with a white core, not a solid sticker
          ctx.globalAlpha = fade; ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.lineJoin = 'round';
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + sd);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * 0.4 : s, a = i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, TAU); ctx.fill();
          ctx.restore(); ctx.lineJoin = 'miter';
          ctx.lineWidth = 2; ctx.strokeStyle = c0; ctx.beginPath(); ctx.arc(x, y, r * (0.4 + out * 0.9), 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#3ff2ff'; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + out * 0.7), 0, TAU); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 6; i++) { const a = h(sd + i) * TAU, d = r * (0.4 + out * 0.9) * (0.7 + 0.4 * h(sd + i + 2)), q = 2.5 * fade + 1; ctx.fillRect(x + Math.cos(a) * d - q / 2, y + Math.sin(a) * d - q * 1.5, q, q * 3); ctx.fillRect(x + Math.cos(a) * d - q * 1.5, y + Math.sin(a) * d - q / 2, q * 3, q); }
          Post.glow(x, y, r * 1.2, c0, 0.6 * fade);
          break;
        }
        default: { // 'death'
          if (t < 0.25) { ctx.globalAlpha = 1 - t / 0.25; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.42 * (1 - t / 0.25 * 0.5), 0, TAU); ctx.fill(); }
          ctx.globalAlpha = fade; ctx.strokeStyle = c0; ctx.lineWidth = Math.max(1.5, r * 0.12 * fade);
          ctx.beginPath(); ctx.arc(x, y, r * (0.3 + out * 0.75), 0, TAU); ctx.stroke();
          ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1.2, r * 0.07);
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = h(sd + i) * TAU, d0 = r * (0.25 + out * 0.7), d1 = d0 + r * 0.28 * fade;
            ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0); ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
          }
          ctx.stroke();
          if (Post.minor()) Post.glow(x, y, r * 1.1, c0, 0.5 * fade);
        }
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },
    // RAGE BURST flashes drawn in code: sub 0 = muzzle snap, 1 = impact pop
    rage(sub, x, y, ang, col, size) {
      if (!this.room(4)) return;
      const p = this.one('rage', x, y, 0, 0, sub ? 0.24 : 0.1, col, size || 1);
      p.drag = 0; p.rot = ang; p.sub = sub; p.seed = Math.random() * U.TAU;
      if (sub) this.sparks(x, y, ang + Math.PI, 3, col, 320, 0.75);
    },
    drawRage(ctx, p, t) {
      const s = p.size, col = p.col, Post = RS.Post, k = 1 - t;
      const star = (L, B, W, H) => { // 4-point star: long forward spike L, back spike B, side spikes H, waist W
        ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(W, -W); ctx.lineTo(0, -H); ctx.lineTo(-W, -W); ctx.lineTo(-B, 0);
        ctx.lineTo(-W, W); ctx.lineTo(0, H); ctx.lineTo(W, W); ctx.closePath(); ctx.fill();
      };
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.sub === 0) { // muzzle: a stretched star along the shot and a snap ring
        ctx.globalAlpha = 1;
        ctx.fillStyle = col; star(22 * s * (0.5 + 0.5 * k), 6 * s, 2.6 * s, 8 * s * k);
        ctx.fillStyle = '#ffffff'; star(13 * s * k, 3 * s, 1.4 * s, 4 * s * k);
        ctx.strokeStyle = col; ctx.lineWidth = 2 * k + 0.5;
        ctx.beginPath(); ctx.arc(0, 0, (4 + 12 * t) * s, 0, U.TAU); ctx.stroke();
        ctx.restore();
        Post.glow(p.x, p.y, 14 * s, col, 0.7 * k);
        return;
      }
      // impact: crisp diamond shockwave + a white cross flash + three flying chips
      const e = 1 - k * k, d = (5 + 22 * e) * s;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 4 * s * k);
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(0, -d); ctx.lineTo(-d, 0); ctx.lineTo(0, d); ctx.closePath(); ctx.stroke();
      if (t < 0.5) {
        const d2 = d * 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(d2, 0); ctx.lineTo(0, -d2); ctx.lineTo(-d2, 0); ctx.lineTo(0, d2); ctx.closePath(); ctx.stroke();
      }
      if (t < 0.4) {
        const f = 1 - t / 0.4; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
        ctx.rotate(Math.PI / 4); star(16 * s * f, 16 * s * f, 2.2 * s, 16 * s * f); ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = col; star(9 * s * f, 9 * s * f, 1.5 * s, 9 * s * f);
      }
      ctx.fillStyle = col; ctx.globalAlpha = k;
      for (let i = 0; i < 3; i++) {
        const a = p.seed + i * 2.1, rr = d * 1.25, c = 2.2 * s;
        ctx.save(); ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr); ctx.rotate(a); ctx.fillRect(-c * 1.6, -c / 2, c * 3.2, c); ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = 1;
      Post.glow(p.x, p.y, 22 * s * k, col, 0.8 * k);
      if (t < 0.3) Post.light(p.x, p.y, 110 * s, col, 0.35 * (1 - t / 0.3));
    },
    pixelDeath(x, y, cols, n) {
      this.burst(x, y, cols, n || 10, 220, { size: 3.5, life: 0.4, drag: 5 });
    },
    ring(x, y, r, col, dur, width, fill) {
      const o = this.rings.spawn();
      o.x = x; o.y = y; o.r0 = r * 0.15; o.r = r; o.col = col; o.t = 0; o.dur = dur || 0.35; o.w = width || 4; o.fill = fill || 0;
      return o;
    },
    // lightning between points; tex = painted strip ('lightning' red, 'aux' green), recoloured towards col
    arc(points, col, life, width, tex) {
      tex = tex || 'lightning';
      const filter = RS.FXS.ready ? RS.FXS.filterFor(tex === 'aux' ? '#9cff35' : '#ff2448', col) : '';
      this.arcs.push({ pts: points, col, life: life || 0.14, max: life || 0.14, w: width || 2, tex, filter, seed: Math.random() });
    },
    // Floating text has two budgets (2026-10-27 UI pass: 40+ numbers and stacked callouts covered the fight):
    //  - damage numbers: at most NUM_CAP alive, crits get a little extra room (CRIT_CAP), the rest are dropped; they
    //    rise and fade in 0.55 s
    //  - callouts (`always`: DODGE, heals, item procs, boss lines): never the same text twice at once and at most
    //    CALL_CAP alive; the hero's own damage taken ("-12") always shows
    text(x, y, str, col, size, opts) {
      const always = !!(opts && opts.always), crit = !!(opts && opts.crit);
      if (!always) {
        if (!this.settings().dmgNumbers) return;
        if (this.numN >= (crit ? CRIT_CAP : NUM_CAP)) return;
      } else if (!(typeof str === 'string' && str[0] === '-')) {
        let n = 0;
        for (const o of this.texts.list) if (!o.dead && o.call) { if (o.str === str) return; n++; }
        if (n >= CALL_CAP) return;
      }
      const t = this.texts.spawn();
      t.x = x + U.rand(-6, 6); t.y = y - 10; t.vy = -60 - (crit ? 30 : 0); t.str = str; t.col = col; t.size = size || 14;
      t.life = t.max = (opts && opts.life) || (always ? 0.7 : 0.55); t.crit = crit; t.owner = 0; t.val = 0; t.call = always;
      if (!always) this.numN++;
      return t;
    },
    // damage number that merges: a hit on the same enemy within 0.2 s adds to the number already rising from it
    // (a dozen weapons on one target used to stack a dozen overlapping numbers)
    dmgText(e, dmg, col, size) {
      const o = e.numT;
      if (o && !o.dead && o.owner === e.id && o.max - o.life < 0.2 && o.col === col) {
        o.val += dmg; o.str = o.val < 10 ? (Math.round(o.val * 10) / 10).toString().replace(/\.0$/, '') : Math.round(o.val);
        o.size = Math.min(size + 6, size + Math.round(Math.log2(1 + o.val / 40) * 2)); // whole sizes: the HUD caches each text bitmap
        return o;
      }
      const t = this.text(e.x, e.y - e.r - 6, dmg < 10 ? (Math.round(dmg * 10) / 10).toString().replace(/\.0$/, '') : Math.round(dmg), col, size);
      if (t) { t.owner = e.id; t.val = dmg; e.numT = t; }
      return t;
    },
    // trauma model; cap keeps a stream of small weapon thumps from piling up into a constant screen buzz
    shake(amount, cap) { cap = cap || 1; if (this.trauma < cap) this.trauma = Math.min(cap, this.trauma + amount); },
    flash(col, a) {
      if (this.settings().reduceFlash) a *= 0.3;
      this.flashCol = col; this.flashA = Math.max(this.flashA, a);
    },
    glitch(t) { if (this.settings().screenFx && !this.settings().reduceFlash) this.glitchT = Math.max(this.glitchT, t); },
    // big banners for bosses / evolutions; anything shown for less than 2.5s renders smaller
    // At most BANNER_CAP at once, never the same title twice, and a minor (small) banner waits for nothing: it is
    // dropped while a big one (boss, evolution, synergy, wave milestone) has the screen, since minor ones (THREAT LV,
    // CYPHER, follower milestones...) also have their own pointer, label or HUD readout
    banner(title, sub, col, dur, small) {
      dur = dur || 2.6;
      small = small !== undefined ? small : dur < 2.5;
      if (this.banners.some((b) => b.title === title)) return;
      if (small && this.banners.some((b) => !b.small && b.t < b.dur - 0.4)) return;
      this.banners.push({ title, sub: sub || '', col: col || '#ff2448', t: 0, dur, small });
      while (this.banners.length > BANNER_CAP) {
        const i = this.banners.findIndex((b) => b.small); // a minor banner makes room first
        this.banners.splice(i >= 0 && i < this.banners.length - 1 ? i : 0, 1);
      }
    },

    update(dt) {
      this.boomTok = Math.min(4, this.boomTok + dt * 3);
      for (const p of this.parts.list) {
        p.life -= dt;
        if (p.life <= 0) { p.dead = true; continue; }
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy = p.vy * d + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'casing' || p.kind === 'chunk') { // tiny height sim: fall, bounce, settle
          if (p.z > 0 || p.vz > 0) {
            p.vz -= 620 * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
            if (p.z <= 0) { p.z = 0; if (p.vz < -40) { p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; } else { p.vz = 0; p.vr = 0; } }
          } else { p.vx *= Math.exp(-8 * dt); p.vy *= Math.exp(-8 * dt); }
        }
      }
      this.parts.sweep();
      let nums = 0;
      for (const t of this.texts.list) {
        t.life -= dt; if (t.life <= 0) { t.dead = true; continue; }
        t.y += t.vy * dt; t.vy *= Math.exp(-5 * dt);
        if (!t.call) nums++;
      }
      this.texts.sweep();
      this.numN = nums;
      for (const r of this.rings.list) { r.t += dt; if (r.t >= r.dur) r.dead = true; }
      this.rings.sweep();
      for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
      for (let i = this.banners.length - 1; i >= 0; i--) { this.banners[i].t += dt; if (this.banners[i].t > this.banners[i].dur) this.banners.splice(i, 1); }
      // shake
      const s = this.settings().shake;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const k = this.trauma * this.trauma * 18 * s;
      // smooth 7-13 Hz rumble (two detuned sines per axis) instead of fresh noise every frame, which buzzed at
      // high refresh rates and read as stutter
      const n = (this.shakeT = (this.shakeT || 0) + dt);
      this.shakeX = (Math.sin(n * 47 + 1.3) * 0.6 + Math.sin(n * 83 + 4.1) * 0.4) * k;
      this.shakeY = (Math.sin(n * 53 + 2.7) * 0.6 + Math.sin(n * 71 + 0.4) * 0.4) * k;
      this.flashA = Math.max(0, this.flashA - dt * 3.5);
      this.hurtA = Math.max(0, this.hurtA - dt * 2.2);
      this.glitchT = Math.max(0, this.glitchT - dt);
    },

    // ground layer (casings, debris) drawn under the entities
    drawGround(ctx, view) {
      for (const p of this.parts.list) {
        if (p.kind === 'corpse') {
          if (p.x < view.x0 - 80 || p.x > view.x1 + 80 || p.y < view.y0 - 40 || p.y > view.y1 + 80) continue;
          const D = p.sh.anims.death, age = p.max - p.life, f = D[Math.min(D.length - 1, Math.floor(age / 0.075))], R = RS.Render, k = R.pixK(p.size);
          const ax = p.flip ? f.w - f.ax : f.ax, sx = p.flip ? p.sh.W - f.x - f.w : f.x;
          ctx.globalAlpha = Math.min(1, p.life / 0.45);
          ctx.imageSmoothingEnabled = false; // pixel-art body: whole device pixels, on the pixel grid
          ctx.drawImage(RS.Sprites.enemyAtlas(p.sh, p.variant, p.flip), sx, f.y, f.w, f.h, R.snap(p.x) - ax * k, R.snap(p.y) - f.ay * k, f.w * k, f.h * k);
          ctx.globalAlpha = 1;
          continue;
        }
        if (p.kind === 'anim' && p.ground) { // ground decals (impact cracks) under the entities
          const n = RS.FXS.count(p.name);
          RS.FXS.draw(ctx, p.name, Math.min(n - 1, Math.floor((1 - p.life / p.max) * n)), p.x, p.y, 0, p.size, Math.min(1, (p.life / p.max) * 3), p.filter, p.ky || undefined);
          continue;
        }
        if (p.kind !== 'casing' && p.kind !== 'chunk') continue;
        if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
        const a = Math.min(1, p.life * 2);
        ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#000';
        ctx.fillRect(p.x - p.size * 0.6, p.y + 1, p.size * 1.2, 2);
        ctx.globalAlpha = a; ctx.fillStyle = p.col;
        ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot);
        if (p.kind === 'casing') { ctx.fillRect(-2, -1, 4, 2); ctx.fillStyle = '#fff2b0'; ctx.fillRect(-2, -1, 2, 1); }
        else { ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-p.size / 2, p.size * 0.05, p.size, p.size * 0.15); }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
    // world-space draw (camera transform already applied); also feeds the bloom / light queue
    draw(ctx, view) {
      const Post = RS.Post;
      // rings
      for (const r of this.rings.list) {
        const k = r.t / r.dur, rad = U.lerp(r.r0, r.r, U.easeOut(k));
        if (rad + 20 < 0) continue;
        if (Post.active) Post.ring(r.x, r.y, rad + r.w * 2, r.w * 3, r.col, (1 - k) * 0.4);
        ctx.globalAlpha = (1 - k) * 0.9;
        if (r.fill) { ctx.fillStyle = U.rgba(r.col, r.fill * (1 - k)); ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, U.TAU); ctx.fill(); }
        ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, U.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // particles
      for (const p of this.parts.list) {
        if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
        const a = p.life / p.max;
        if (p.kind === 'casing' || p.kind === 'chunk' || p.kind === 'corpse') continue;
        if (p.kind === 'smoke') { if (!this.noBoom) this.drawSmoke(ctx, p, a); continue; } // pixel sprite, full resolution
        if (p.kind === 'anim') { if (p.ground) continue; // painted sprite animation, fades over its last third
          const n = RS.FXS.count(p.name), t = 1 - a;
          RS.FXS.draw(ctx, p.name, Math.min(n - 1, Math.floor(t * n)), p.x, p.y, p.rot, p.size, Math.min(1, a * 3), p.filter, p.ky || undefined);
          if (p.light && t < 0.3) { Post.glow(p.x, p.y, 18, p.light, 0.5 * (1 - t / 0.3)); Post.light(p.x, p.y, 150, p.light, 0.45 * (1 - t / 0.3)); }
          continue;
        }
        if (p.kind === 'rage') { this.drawRage(ctx, p, 1 - a); continue; }
        if (p.kind === 'boom') { if (!this.noBoom) this.drawBoom(ctx, p, (p.max - p.life)); continue; }
        if (p.kind === 'pop') { this.drawPop(ctx, p, 1 - a); continue; }
        if (p.kind === 'flash') { // star-shaped muzzle / impact flash + its light
          const s = p.size;
          ctx.globalAlpha = 1; ctx.fillStyle = '#fff6d8';
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(0, -4 * s); ctx.lineTo(16 * s, 0); ctx.lineTo(0, 4 * s); ctx.lineTo(4 * s, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(-2 * s, -7 * s); ctx.lineTo(2 * s, 0); ctx.lineTo(-2 * s, 7 * s); ctx.lineTo(6 * s, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
          Post.glow(p.x, p.y, 16 * s, p.col, 0.5);
          Post.light(p.x, p.y, 150 * s, p.col, 0.45);
          continue;
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        if (p.kind === 'spark') {
          ctx.strokeStyle = p.col; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
          if (Post.minor()) Post.streak(p.x - p.vx * 0.015, p.y - p.vy * 0.015, Math.atan2(p.vy, p.vx), 14 + Math.hypot(p.vx, p.vy) * 0.03, 7, p.col, a * 0.45);
          continue;
        }
        if (p.glow && Post.minor()) Post.glow(p.x, p.y, p.size * 3, p.col, a * 0.4);
        if (p.kind === 'line') {
          ctx.strokeStyle = p.col; ctx.lineWidth = p.size * 0.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
        } else {
          const s = p.size * (0.5 + a * 0.5);
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
      // lightning arcs
      ctx.lineCap = 'round';
      for (const a of this.arcs) {
        const k = a.life / a.max;
        const strip = a.tex === 'aux' ? 'aux_beam' : 'lightning';
        if (RS.FXS.ok(strip)) { // painted strip per segment; the window jumps every few frames so it crackles
          const X = RS.FXS, thick = a.w * (a.tex === 'aux' ? 11 : 9);
          const flick = Math.floor((a.max - a.life) * 40);
          for (let i = 2; i < a.pts.length; i += 2) {
            const x0 = a.pts[i - 2], y0 = a.pts[i - 1], x1 = a.pts[i], y1 = a.pts[i + 1];
            if (Post.active) Post.streak((x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0) + 20, 9 * a.w, a.col, k * 0.45);
            X.drawStrip(ctx, strip, x0, y0, x1, y1, thick * (0.85 + 0.15 * k), Math.min(1, k * 1.6), a.filter, (a.seed + i * 0.37 + flick * 0.21) % 1);
          }
          continue;
        }
        ctx.globalAlpha = k;
        if (Post.active) for (let i = 2; i < a.pts.length; i += 2) {
          const x0 = a.pts[i - 2], y0 = a.pts[i - 1], x1 = a.pts[i], y1 = a.pts[i + 1];
          Post.streak((x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0) + 20, 11 * a.w, a.col, k * 0.6);
        }
        ctx.strokeStyle = a.col; ctx.lineWidth = a.w * 2.4; ctx.globalAlpha = k * 0.35;
        this.strokeJagged(ctx, a.pts);
        ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = a.w;
        this.strokeJagged(ctx, a.pts);
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },
    // the explosions and smoke on their own (Render draws the other particles into its pixel buffer; these are pixel
    // sprites already and draw at their own whole-pixel scale)
    drawBooms(ctx, view) {
      for (const p of this.parts.list) {
        if (p.dead || p.x < view.x0 - 200 || p.x > view.x1 + 200 || p.y < view.y0 - 200 || p.y > view.y1 + 200) continue;
        if (p.kind === 'boom') this.drawBoom(ctx, p, p.max - p.life);
        else if (p.kind === 'smoke') this.drawSmoke(ctx, p, p.life / p.max);
      }
      ctx.globalAlpha = 1;
    },
    // Pixel smoke: a 6-frame 16 x 16 puff baked once per colour, same recipe as the explosion strip (lumpy blobs, hard
    // 1-px outline, light top / shaded underside), the last frames break up in a checker dither instead of blurring out.
    SMOKE_F: 6, SMOKE_S: 16,
    smokeStrip(col) {
      const C = this._smokeStrips || (this._smokeStrips = {});
      if (C[col]) return C[col];
      const S = this.SMOKE_S, N = this.SMOKE_F, cv = document.createElement('canvas');
      cv.width = S * N; cv.height = S;
      const g = cv.getContext('2d'), hi = U.mixHex(col, '#ffffff', 0.45), lo = U.mixHex(col, '#1a1c22', 0.35), line = U.mixHex(col, '#0c0d10', 0.72);
      const blobs = [[[0, 0, 3]], [[0, 0, 4.5], [-2, 1, 3]], [[0, -1, 5], [-3, 1, 3.6], [3, 1, 3.4]], [[0, -2, 5.6], [-4, 1, 4], [4, 1, 3.8]],
        [[0, -3, 5.6], [-4, 0, 4.4], [4, 0, 4.2]], [[0, -4, 5], [-5, -1, 4], [5, -1, 3.8]]];
      for (let f = 0; f < N; f++) {
        const B = blobs[f], c = S / 2;
        const inside = (x, y) => B.some(([bx, by, r]) => Math.hypot(x + 0.5 - (c + bx), y + 0.5 - (c + by)) <= r);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          if (inside(x, y)) {
            if (f === 4 && (x + y) % 2 === 0 && !inside(x, y - 2)) continue; // the rim starts to break up
            if (f === 5 && (x + y) % 2) continue;                              // last frame: checker dither
            g.fillStyle = !inside(x, y - 1) ? hi : !inside(x, y + 2) ? lo : col;
            g.fillRect(f * S + x, y, 1, 1);
          } else if (f < 4 && (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))) {
            g.fillStyle = line; g.fillRect(f * S + x, y, 1, 1);
          }
        }
      }
      return (C[col] = cv);
    },
    drawSmoke(ctx, p, a) {
      const R = RS.Render, S = this.SMOKE_S, N = this.SMOKE_F;
      const size = p.size * (1 + (1 - a) * p.grow) * 1.6; // world width of the puff
      const k = R.pixK(size / S), f = Math.min(N - 1, Math.floor((1 - a) * N));
      const was = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.min(0.85, p.alpha * 2.6);
      ctx.drawImage(this.smokeStrip(p.col), f * S, 0, S, S, R.snap(p.x) - S / 2 * k, R.snap(p.y) - S / 2 * k, S * k, S * k);
      ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = was;
    },
    strokeJagged(ctx, pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const t = s / segs;
          const j = s === segs ? 0 : 9;
          ctx.lineTo(U.lerp(x0, x1, t) + U.rand(-j, j), U.lerp(y0, y1, t) + U.rand(-j, j));
        }
      }
      ctx.stroke();
    },
  };

  RS.FX = FX;
})(window.RS);
