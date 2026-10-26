'use strict';
// Run intro: a ~4.6 s "photo dump" on the HUD canvas. Three flash photos land on a dark table one after another (the
// spot, the artist, the drink), each a live crop of the menu's parking deck that keeps moving inside its print. Then
// the trip hits: GEEKED slams in, the prints take on the trip's colour and pick up hallucination stickers. Finally the
// prints slide away and an iris opens onto the deck. Any key / click skips to the exit.
(function (RS) {
  const U = RS.U, TAU = Math.PI * 2;
  const DISP = '"Jersey 10", "Bebas Neue", Impact, sans-serif', MONO = '"Silkscreen", Consolas, monospace'; // arcade pixel fonts
  const MARK = '"Permanent Marker", "Comic Sans MS", cursive'; // handwriting on the prints
  const LEN = 4.6, KICK = 2.15, OUT = 3.6, LAND = 0.45;
  const QUIPS = {
    twizzy: ['TOO TURNT TO FEEL IT', 'NEVER STOPS MOVING', 'GLOCK IN ONE HAND'],
    schmunk: ['SCHMUNK SEES EVERYTHING', 'THE GRIN GETS WIDER', 'UNBOTHERED. UNWELL.'],
  };
  // the three prints in a 1600 x 900 frame: landing time, centre, picture size, tilt, the side they are tossed in from
  const SHOTS = [
    { at: 0.12, x: 300, y: 292, w: 400, h: 300, rot: -0.11, from: [-1, -0.5] },  // the spot: the SUV under the P2 sign
    { at: 0.62, x: 612, y: 470, w: 330, h: 420, rot: 0.07, from: [0.35, -1] },   // the artist on the stage
    { at: 1.12, x: 300, y: 652, w: 250, h: 250, rot: -0.09, from: [-1, 0.6] },   // the drink, close up
  ];
  const BORDER = 14, CHIN = 62; // polaroid paper around the picture
  const FPS = 24; // the pictures move like live photos, repainted at film rate (also keeps the intro cheap)
  if (document.fonts && document.fonts.load) document.fonts.load('400 30px "Permanent Marker"').catch(() => {});

  // big display text with a heavy outline; `split` adds an RGB ghost offset
  function disp(ctx, s, x, y, size, col, align, split, track) {
    ctx.font = '400 ' + Math.round(size) + 'px ' + DISP;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (track || 0) + 'px';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + size * 0.04, y + size * 0.06);
    if (split) {
      ctx.globalAlpha *= 0.75;
      ctx.fillStyle = '#ff2448'; ctx.fillText(s, x - split, y);
      ctx.fillStyle = '#3ff2ff'; ctx.fillText(s, x + split, y);
      ctx.globalAlpha /= 0.75;
    }
    ctx.strokeStyle = '#050505'; ctx.lineWidth = Math.max(2, size * 0.09); ctx.strokeText(s, x, y);
    ctx.fillStyle = col; ctx.fillText(s, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  function mono(ctx, s, x, y, size, col, align) {
    ctx.font = '600 ' + Math.round(size) + 'px ' + MONO; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (size * 0.22) + 'px';
    ctx.fillStyle = col; ctx.fillText(s, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  const ease = (k) => 1 - Math.pow(1 - U.clamp(k, 0, 1), 3);
  const back = (k) => { k = U.clamp(k, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  // a crop of the 1920 x 1080 menu scene, cover-fitted into w x h
  function crop(w, h, sx, sy, sw, sh) {
    const k = Math.max(w / sw, h / sh);
    return { k, ox: (w - sw * k) / 2 - sx * k, oy: (h - sh * k) / 2 - sy * k };
  }
  // a party pill seen up close: a glossy disc with a pressed smiley, lit by the camera flash
  function pill(x, cx, cy, r, col, rot) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.ellipse(r * 0.12, r * 0.5, r * 1.02, r * 0.7, 0, 0, TAU); x.fill();
    const side = x.createLinearGradient(0, -r * 0.4, 0, r * 0.62);
    side.addColorStop(0, '#5fb8d4'); side.addColorStop(1, '#1d5f78');
    x.fillStyle = side; x.beginPath(); x.ellipse(0, r * 0.2, r, r * 0.62, 0, 0, TAU); x.fill();          // the rim
    const top = x.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    top.addColorStop(0, '#f2fdff'); top.addColorStop(0.35, col); top.addColorStop(1, '#3d9fbf');
    x.fillStyle = top; x.beginPath(); x.ellipse(0, 0, r, r * 0.6, 0, 0, TAU); x.fill();                 // the face
    x.strokeStyle = 'rgba(20,70,90,0.75)'; x.lineWidth = r * 0.07; x.lineCap = 'round';
    x.beginPath(); x.ellipse(0, r * 0.06, r * 0.42, r * 0.22, 0, 0.3, Math.PI - 0.3); x.stroke();     // the pressed grin
    x.fillStyle = 'rgba(20,70,90,0.75)';
    x.beginPath(); x.ellipse(-r * 0.24, -r * 0.14, r * 0.07, r * 0.05, 0, 0, TAU); x.ellipse(r * 0.24, -r * 0.14, r * 0.07, r * 0.05, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(-r * 0.45, -r * 0.3, r * 0.2, r * 0.07, -0.4, 0, TAU); x.fill(); // flash glint
    x.restore();
  }

  const Intro = {
    t: 0, on: false, skip: false, G: null,
    start(G) {
      this.G = G; this.t = 0; this.on = true; this.skip = false; this.sipped = false; this.kicked = false; this.shot = 0;
      const T = G.trip, C = RS.Data.CHARACTERS[G.cfg.char];
      this.quip = U.pick(QUIPS[G.cfg.char] || QUIPS.twizzy);
      this.clock = String(U.randi(22, 24) % 24).padStart(2, '0') + ':' + String(U.randi(0, 59)).padStart(2, '0');
      const now = new Date();
      this.stamp = "'21 " + String(now.getMonth() + 1).padStart(2, '0') + ' ' + String(now.getDate()).padStart(2, '0'); // disposable-camera date
      const MM = G.mapMode;
      this.caps = ['b2 · ' + (MM && MM.id !== 'normal' ? MM.name.toLowerCase() : this.clock), C.name.toLowerCase()]; // + the drink's name
      // hallucination stickers slapped on the prints when it kicks in: the theme's favourites first
      const ids = T.theme.fav.concat(U.shuffle(RS.Trip.HALLUC.filter((h) => !T.theme.fav.includes(h)))).slice(0, 4);
      // shot, x / y in picture halves, height: corners and edges, clear of the hero's face and the date stamps
      const spots = [[0, 0.5, -0.5, 88], [1, 0.74, 0.12, 96], [2, 0.6, -0.58, 76], [1, -0.76, -0.72, 74]];
      this.stickers = spots.map(([shot, fx, fy, h], i) => ({ id: ids[i % ids.length], shot, fx, fy, h, at: KICK + 0.12 + i * 0.13, r: U.rand(-0.35, 0.35) }));
      this.cv = this.cv || SHOTS.map(() => document.createElement('canvas'));
      this.painted = SHOTS.map(() => -1);
      // build the scene / hero caches now, while the run is loading, not in the middle of the second print
      SHOTS.forEach((S, i) => this.paintShot(i, this.cv[i], 48, 48, 0, 0, false));
      RS.Audio.muffle(true);
      if (!this.keyFn) {
        this.keyFn = () => { if (this.on && this.t > 0.35) this.skip = true; };
        window.addEventListener('keydown', this.keyFn); window.addEventListener('pointerdown', this.keyFn);
      }
    },
    update(dt) {
      if (!this.on) return;
      this.t += dt;
      if (this.skip && this.t < OUT) { this.t = OUT; this.skip = false; this.kicked = true; this.sipped = true; this.shot = SHOTS.length; }
      // a quiet shutter as each print comes out, the drink sound on the third, the trip drop on the kick
      while (this.shot < SHOTS.length && this.t > SHOTS[this.shot].at) { this.shot++; RS.Audio.sfx('shutter'); }
      const drink = this.G.trip.drink;
      if (!this.sipped && this.t > 1.55) { this.sipped = true; RS.Audio.sfx(drink.id === 'cup' ? 'sip' : 'gulp'); }
      if (!this.kicked && this.t > KICK) { this.kicked = true; RS.Audio.sfx('trip'); }
      if (this.t >= LEN) this.finish();
    },
    finish() {
      if (!this.on) return;
      this.on = false;
      const G = this.G;
      G.state = 'run';
      RS.Audio.muffle(false);
      const th = G.trip.theme;
      const MM = G.mapMode;
      RS.FX.banner(G.arenaDef.name, (MM && MM.cash > 1 ? MM.name + ' · ' + MM.cash + '× CASH · ' : '') + (G.mods.nomercy ? 'NO MERCY · ' : '') + 'SURVIVE 30:00', MM && MM.cash > 1 ? MM.col : G.arenaDef.accent, 3.2);
      RS.FX.flash(th.col, 0.25);
    },

    // the picture inside print i, redrawn every frame (neon, fog and the hero keep moving), w x h device pixels
    paintShot(i, c, w, h, t, kick, calm) {
      const fr = Math.floor(t * FPS);
      if (c.width === w && c.height === h && this.painted[i] === fr) return;
      this.painted[i] = fr; t = fr / FPS;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const x = c.getContext('2d'), Sc = RS.Scene, M = Sc.get('main'), G = this.G, drink = G.trip.drink;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true;
      x.fillStyle = '#050505'; x.fillRect(0, 0, w, h);
      if (i === 1) Sc.drawStage(c, G.cfg.char, G.cfg.cos || {}, t, 0.3 + Math.sin(t * 4.2) * 0.2, 0);
      else if (i === 0) {
        // the SUV with its lights on under the P2 sign (kept in the left part the artist's print leaves uncovered)
        const m = crop(w, h, 560, 250, 680, 510);
        Sc.layer(x, M.base, m, 1); Sc.layer(x, M.glow, m, 0.9, true); Sc.layer(x, M.uni, m, Sc.flicker(t), true);
        Sc.fog(x, m, t, 640, 0.32, 16);
        const MM = G.mapMode;
        if (MM && MM.dark) { // NIGHT / STORM: the same spot after dark
          x.fillStyle = 'rgba(' + (MM.tint || '6,10,28') + ',0.55)'; x.fillRect(0, 0, w, h);
          Sc.layer(x, M.glow, m, 0.35, true); // the lights still cut through
          if (MM.rain) {
            x.strokeStyle = 'rgba(200,215,255,0.28)'; x.lineWidth = Math.max(1, w / 400); x.beginPath();
            for (let k = 0; k < 46; k++) {
              const rx = ((k * 97.13 + t * 260) % (w * 1.2)) - w * 0.1, ry = ((k * 53.7 + t * 900) % (h * 1.2)) - h * 0.1;
              x.moveTo(rx, ry); x.lineTo(rx - h * 0.03, ry + h * 0.09);
            }
            x.stroke();
          }
        }
      } else {
        // the drink on the floor of the deck, shot with the flash: the double cup where it stands in the menu scene,
        // or a couple of pills on the flight case next to it
        const cup = drink.id === 'cup';
        const m = cup ? crop(w, h, 125, 800, 250, 250) : crop(w, h, 330, 820, 220, 220);
        Sc.layer(x, M.base, m, 1); Sc.layer(x, M.glow, m, 0.9, true);
        if (cup) {
          Sc.cup(x, (250 * m.k + m.ox), (1000 * m.k + m.oy), 130 * m.k);
          // lean running down the side
          const cx = 250 * m.k + m.ox, top = (1000 - 130 * 1.02) * m.k + m.oy, dl = U.clamp((t - 1.4) / 1.2, 0, 1);
          x.fillStyle = drink.col; x.beginPath(); x.ellipse(cx + 36 * m.k, top + (8 + dl * 40) * m.k, 3.4 * m.k, (6 + dl * 10) * m.k, 0.08, 0, TAU); x.fill();
        } else {
          const r = w * 0.2;
          pill(x, w * 0.3, h * 0.42, r * 0.7, drink.col, 0.5);
          pill(x, w * 0.72, h * 0.36, r * 0.6, drink.col, -0.3);
          pill(x, w * 0.52, h * 0.62, r, drink.col, 0.15);
        }
      }
      // film print: lifted blacks, then a flash photo's hot centre and dark falloff to the corners
      x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgb(16,16,19)'; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      const v = x.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
      v.addColorStop(0, 'rgba(255,255,255,0.07)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
      x.fillStyle = v; x.fillRect(0, 0, w, h);
      // the trip gets into the photos too
      if (kick > 0) { // a two-tone grade, the trip's colour into magenta, drifting (one flat colour went olive on yellow trips)
        const col = G.trip.theme.col, sw = Math.sin(t * 1.3 + i) * 0.5;
        const gr = x.createLinearGradient(w * (0.5 - sw), 0, w * (0.5 + sw), h);
        gr.addColorStop(0, U.rgba(col, 0.6 * kick)); gr.addColorStop(1, U.rgba('#ff2bd6', 0.5 * kick));
        x.globalCompositeOperation = 'soft-light'; x.fillStyle = gr; x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'screen'; x.fillStyle = U.rgba(col, 0.1 * kick); x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'source-over';
      }
      // orange date stamp in the corner, like a disposable camera
      const fs = Math.max(9, Math.round(h * 0.055));
      x.font = '600 ' + fs + 'px ' + MONO; x.textAlign = i === 0 ? 'left' : 'right'; x.textBaseline = 'alphabetic'; // the spot's right edge sits under the artist
      x.shadowColor = 'rgba(255,120,20,0.9)'; x.shadowBlur = fs * 0.5;
      x.fillStyle = '#ffa23a'; x.fillText(this.stamp, i === 0 ? fs * 0.8 : w - fs * 0.8, h - fs * 0.7);
      x.shadowBlur = 0; x.shadowColor = 'transparent';
      // develops out of the flash (REDUCE FLASHING: out of the dark instead)
      const dev = ease((t - SHOTS[i].at - 0.1) / 0.55);
      if (dev < 1) { x.fillStyle = calm ? 'rgba(0,0,0,' + (1 - dev) * 0.85 + ')' : 'rgba(255,255,255,' + (1 - dev) * 0.9 + ')'; x.fillRect(0, 0, w, h); }
    },

    // one print: paper, picture, caption, stickers; tossed in, settles, slides off at the end
    drawShot(ctx, i, t, u, ox, oy, kick, calm) {
      const S = SHOTS[i], k = (t - S.at) / LAND;
      if (k <= 0) return;
      const e = ease(k), lift = 1 - e;
      const out = t > OUT ? ease((t - OUT - i * 0.07) / 0.55) : 0;
      const fw = S.w + BORDER * 2, fh = S.h + BORDER + CHIN;
      const cx = S.x + S.from[0] * 950 * lift, cy = S.y + S.from[1] * 750 * lift + out * 1150;
      const wob = kick * (calm ? 0.3 : 1);
      const rot = S.rot - S.from[0] * 0.45 * lift + out * (i % 2 ? 0.5 : -0.5) + Math.sin(t * 2.3 + i * 2.1) * 0.025 * wob;
      const sc = 1 + lift * 0.22; // in the air it is closer to the camera
      const pw = Math.round(S.w * u), ph = Math.round(S.h * u);
      this.paintShot(i, this.cv[i], pw, ph, t, kick, calm);
      ctx.save();
      ctx.translate(ox + cx * u, oy + cy * u); ctx.rotate(rot); ctx.scale(sc * u, sc * u);
      // RGB fringe around the print once the trip lands
      if (kick > 0) {
        const o = (5 + Math.sin(t * 6 + i) * 3) * wob;
        ctx.globalAlpha = 0.55 * kick;
        ctx.fillStyle = '#ff2bd6'; ctx.fillRect(-fw / 2 - o, -fh / 2, fw, fh);
        ctx.fillStyle = '#3ff2ff'; ctx.fillRect(-fw / 2 + o, -fh / 2, fw, fh);
        ctx.globalAlpha = 1;
      }
      // paper with a soft drop shadow (bigger and softer while it is still in the air)
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = (16 + lift * 40) * u; ctx.shadowOffsetX = (4 + lift * 16) * u; ctx.shadowOffsetY = (10 + lift * 34) * u;
      const paper = ctx.createLinearGradient(0, -fh / 2, 0, fh / 2);
      paper.addColorStop(0, '#f1f0ea'); paper.addColorStop(1, '#dddbd2');
      ctx.fillStyle = paper; ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      const ix = -S.w / 2, iy = -fh / 2 + BORDER;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.cv[i], ix, iy, S.w, S.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(ix, iy, S.w, S.h);
      // handwritten caption on the chin (the artist's on the right: the drink print covers his lower left corner)
      ctx.save(); ctx.translate(i === 1 ? S.w / 2 - 6 : -S.w / 2 + 6, fh / 2 - CHIN * 0.36); ctx.rotate(-0.025);
      ctx.font = '400 30px ' + MARK; ctx.textAlign = i === 1 ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#1b1b1d'; ctx.fillText(i === 2 ? this.G.trip.drink.name.toLowerCase() : this.caps[i], 0, 0);
      ctx.restore();
      // a strip of tape holds the artist down
      if (i === 1) {
        ctx.save(); ctx.translate(0, -fh / 2 + 2); ctx.rotate(-0.06);
        ctx.fillStyle = 'rgba(236,230,205,0.62)'; ctx.fillRect(-58, -16, 116, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-58, -16, 116, 6);
        ctx.restore();
      }
      // hallucination stickers: pixel art with a white die-cut edge, popped on at the kick
      for (const st of this.stickers) if (st.shot === i) this.drawSticker(ctx, st, S, iy, t, u * sc);
      ctx.restore();
    },
    drawSticker(ctx, st, S, iy, t, scr) {
      const k = (t - st.at) / 0.28;
      if (k <= 0) return;
      const es = RS.Sprites.enemies[st.id];
      if (!es || !es.tiers || !es.white) return;
      const img = es.tiers[0].frames[0];
      // whole art pixels on screen: pick the scale in screen pixels, then express it in print units
      const px = Math.max(2, Math.round(st.h * scr / img.height)) / scr;
      const w = img.width * px, h = img.height * px, o = 3.2; // die-cut edge, in print units
      const pop = back(k);
      ctx.save();
      ctx.translate(st.fx * S.w / 2 * 0.9, iy + S.h / 2 + st.fy * S.h / 2 * 0.9); ctx.rotate(st.r); ctx.scale(pop, pop);
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.drawImage(es.white, -w / 2 - o, -h / 2 - o, w + o * 2, h + o * 2); // one shadowed backing, then the crisp edge
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      for (let a = 0; a < 8; a++) ctx.drawImage(es.white, -w / 2 + Math.cos(a / 8 * TAU) * o, -h / 2 + Math.sin(a / 8 * TAU) * o, w, h);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    },

    draw(ctx, W, H) {
      if (!this.on) return;
      const G = this.G, T = G.trip, th = T.theme, drink = T.drink, t = this.t;
      const u = Math.min(W / 1600, H / 900), ox = (W - 1600 * u) / 2, oy = (H - 900 * u) / 2; // the 16:9 frame
      const C = RS.Data.CHARACTERS[G.cfg.char];
      const calm = RS.Save.s.reduceFlash;
      const kick = U.clamp((t - KICK) / 0.5, 0, 1); // how hard the trip has hit (0..1)
      ctx.save();
      // ---------- the table: near-black, a soft green / red spill like the menu, the trip's colour once it hits
      ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
      let g = ctx.createRadialGradient(ox + 420 * u, oy + 420 * u, 0, ox + 420 * u, oy + 420 * u, 760 * u);
      g.addColorStop(0, 'rgba(156,255,53,0.10)'); g.addColorStop(1, 'rgba(156,255,53,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(ox + 1250 * u, oy + 500 * u, 0, ox + 1250 * u, oy + 500 * u, 700 * u);
      g.addColorStop(0, 'rgba(255,36,72,0.09)'); g.addColorStop(1, 'rgba(255,36,72,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (kick > 0) {
        g = ctx.createRadialGradient(ox + 560 * u, oy + 470 * u, 0, ox + 560 * u, oy + 470 * u, Math.hypot(W, H) * 0.6);
        g.addColorStop(0, U.rgba(th.col, 0.26 * kick)); g.addColorStop(0.5, U.rgba('#b45cff', 0.12 * kick)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // slow rings out of the artist's print
        for (let i = 0; i < 4; i++) {
          const ph = ((t - KICK) * 0.45 + i / 4) % 1;
          ctx.strokeStyle = U.rgba(i % 2 ? th.col : '#3ff2ff', (1 - ph) * 0.22 * kick); ctx.lineWidth = (4 + ph * 18) * u;
          ctx.beginPath(); ctx.arc(ox + 580 * u, oy + 470 * u, ph * Math.hypot(W, H) * 0.7, 0, TAU); ctx.stroke();
        }
      }
      if (!this.grain) { // film grain tile, offset in steps so it shimmers without strobing
        const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'), d = x.createImageData(160, 160);
        for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
        x.putImageData(d, 0, 0); this.grain = ctx.createPattern(c, 'repeat');
      }

      // ---------- the prints
      for (let i = 0; i < SHOTS.length; i++) this.drawShot(ctx, i, t, u, ox, oy, kick, calm);

      // ---------- copy
      const tx = ox + 860 * u, ty = oy, fade = 1 - ease((t - OUT) / 0.45);
      const inA = ease((t - 0.35) / 0.5) * fade;
      const MM = G.mapMode;
      ctx.globalAlpha = inA;
      mono(ctx, G.arenaDef.name + ' · ' + this.clock + (MM && MM.id !== 'normal' ? ' · ' + MM.name : ''), tx, ty + 250 * u, 15 * u, '#9a9f98');
      disp(ctx, C.name, tx - (1 - inA) * 60 * u, ty + 336 * u, 104 * u, C.color === '#9cff35' ? '#9cff35' : '#f2f3ef', 'left', 0, 2 * u);
      ctx.globalAlpha = 1;
      // verb line types out as the drink print lands, the drink name in its colour
      const vk = U.clamp((t - SHOTS[2].at - 0.15) / 0.5, 0, 1);
      if (vk > 0) {
        ctx.globalAlpha = fade;
        const full = drink.verb + ' ' + drink.name, n = Math.ceil(full.length * vk), shown = full.slice(0, n);
        const vSize = 58 * u, verb = shown.slice(0, Math.min(n, drink.verb.length + 1));
        disp(ctx, verb, tx, ty + 408 * u, vSize, '#f2f3ef', 'left', 0, 1 * u);
        ctx.font = '400 ' + Math.round(vSize) + 'px ' + DISP;
        if ('letterSpacing' in ctx) ctx.letterSpacing = (1 * u) + 'px';
        const vw = ctx.measureText(drink.verb + ' ').width;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        if (n > drink.verb.length + 1) disp(ctx, shown.slice(drink.verb.length + 1), tx + vw, ty + 408 * u, vSize, drink.col, 'left', 0, 1 * u);
        ctx.globalAlpha = 1;
      }
      if (t > 1.5) {
        ctx.globalAlpha = ease((t - 1.5) / 0.3) * (1 - kick * 0.6) * fade;
        mono(ctx, drink.line.toUpperCase(), tx, ty + 446 * u, 14 * u, '#c3c6c1');
        ctx.globalAlpha = 1;
      }
      if (kick > 0) {
        // GEEKED slams in, then the trip theme
        const sk = back((t - KICK) / 0.38), size = 190 * u * (2.2 - 1.2 * sk);
        const jit = calm ? 0 : Math.sin(t * 40) * 2 * u;
        ctx.globalAlpha = U.clamp((t - KICK) / 0.12, 0, 1) * fade;
        disp(ctx, 'GEEKED', tx - 6 * u + jit, ty + 610 * u, size, '#ff2448', 'left', (7 + Math.sin(t * 9) * 3) * u * (calm ? 0.4 : 1), 4 * u);
        ctx.globalAlpha = ease((t - KICK - 0.35) / 0.35) * fade;
        mono(ctx, 'TRIP ·', tx, ty + 664 * u, 15 * u, '#9a9f98');
        ctx.font = '600 ' + Math.round(15 * u) + 'px ' + MONO;
        if ('letterSpacing' in ctx) ctx.letterSpacing = (15 * u * 0.22) + 'px';
        const tw = ctx.measureText('TRIP · ').width;
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        disp(ctx, th.name, tx + tw, ty + 670 * u, 44 * u, th.col, 'left', 0, 2 * u);
        mono(ctx, th.sub.toUpperCase(), tx, ty + 702 * u, 13 * u, '#c3c6c1');
        mono(ctx, '— ' + this.quip, tx, ty + 734 * u, 13 * u, '#9cff35');
        ctx.globalAlpha = 1;
      }

      // ---------- grain, vignette, a thin progress line and the skip hint
      ctx.save(); ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'overlay';
      const gs = Math.floor(t * 12); ctx.translate((gs * 37) % 160, (gs * 61) % 160);
      ctx.fillStyle = this.grain; ctx.fillRect(-160, -160, W + 320, H + 320);
      ctx.restore();
      g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#9cff35'; ctx.fillRect(0, 0, W * U.clamp(t / LEN, 0, 1), Math.max(2, 3 * u));
      if (t < OUT - 0.2) { ctx.globalAlpha = ease((t - 0.6) / 0.4); mono(ctx, 'PRESS ANY KEY TO SKIP', W - 34 * u, H - 30 * u, 12 * u, '#7c817a', 'right'); ctx.globalAlpha = 1; }

      // ---------- iris opens onto the run (punch a soft hole through the intro) while the prints slide away
      if (t > OUT) {
        const ik = ease((t - OUT - 0.1) / (LEN - OUT - 0.1)), R = ik * Math.hypot(W, H) * 0.6;
        ctx.globalCompositeOperation = 'destination-out';
        g = ctx.createRadialGradient(W / 2, H / 2, Math.max(0, R * 0.8), W / 2, H / 2, R + 1);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        if (ik > 0) { ctx.strokeStyle = U.rgba(th.col, 0.8 * (1 - ik)); ctx.lineWidth = 8 * u; ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 0.92, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    },
  };
  RS.Intro = Intro;
})(window.RS);
