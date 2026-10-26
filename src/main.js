'use strict';
// Boot, resize, main loop, menu backdrop and settings plumbing.
(function (RS) {
  const U = RS.U, G = RS.Game, Input = RS.Input;
  const STILL = { paused: 1, levelup: 1, chest: 1, thumb: 1 };

  const Main = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1, last: 0,
    // the HUD canvas renders at full device resolution so all type stays sharp
    hud: null, hctx: null, HW: 0, HH: 0, hdpr: 1, hudDirty: true,

    boot() {
      RS.Save.load();
      Input.init();
      RS.Sprites.init();
      RS.Overlays.init();
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      RS.Post.init(this.canvas); // WebGL compositor on top of the 2D scene (falls back silently)
      this.hud = document.getElementById('hud');
      this.hctx = this.hud.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      Input.onBlur = () => { if (G.state === 'run') G.pause(); };
      document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'run') G.pause(); });
      const unlock = () => {
        RS.Audio.init(); RS.Audio.resume(); this.applySettings();
        // play() is idempotent; calling it on every input also retries a song the browser blocked before the first click
        if (G.state === 'menu' || G.state === 'gameover') { RS.Audio.music.play('menu'); RS.Audio.music.setIntensity(0); }
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      this.applySettings();
      RS.Screens.show('main');
      document.getElementById('boot').classList.add('gone');
      this.last = performance.now();
      RS.bootMs = Math.round(this.last); // ms from page start to the first menu frame (for load-time checks)
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      // at least 1 px: a tab opened in the background can report a 0 x 0 window, and drawImage throws on 0-size canvases
      const W = Math.max(1, Math.floor(window.innerWidth * this.dpr)), H = Math.max(1, Math.floor(window.innerHeight * this.dpr));
      this.canvas.width = W; this.canvas.height = H;
      this.W = W; this.H = H;
      this.hdpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.HW = Math.max(1, Math.floor(window.innerWidth * this.hdpr)); this.HH = Math.max(1, Math.floor(window.innerHeight * this.hdpr));
      this.hud.width = this.HW; this.hud.height = this.HH;
      this.hudDirty = true; this.stillDrawn = null;
      const z = Math.sqrt((W * H) / (1260 * 710)) * 1.12; // gameplay view zoomed in a touch (same follow camera)
      G.cam.zoom = U.clamp(z, 0.45, 3);
      G.cam.vw = W / G.cam.zoom; G.cam.vh = H / G.cam.zoom;
      RS.Render.resize(W, H);
      RS.Post.resize(W, H);
    },

    applySettings() {
      const s = RS.Save.s;
      RS.Audio.setVolumes(s);
    },

    startRun() {
      const S = RS.Save, sel = S.data.selected;
      if (!RS.Data.charPlayable(sel.char)) sel.char = 'twizzy'; // locked or held back for a future update
      // one map and the 30-minute mode; the only stage modifier is NO MERCY, once THE RAGE KING has unlocked it
      sel.arena = 'garage';
      sel.mods = (sel.mods || []).filter((m) => m === 'nomercy' && S.isUnlocked('mods', 'nomercy'));
      if (!RS.Data.mapOpen(sel.map)) sel.map = 'normal'; // NORMAL / NIGHT / STORM from the pregame map screen, if unlocked
      RS.Screens.hide();
      RS.Overlays.hide();
      RS.Audio.init(); RS.Audio.resume();
      this.applySettings();
      G.start({
        char: sel.char, arena: sel.arena, map: sel.map, mods: sel.mods.slice(),
        cos: RS.Screens.cosFor(sel.char), startWeapon: RS.Screens.startWeaponFor(sel.char),
      });
    },

    // world + HUD for one frame (also used by the test harness)
    drawGame(dt) {
      RS.Render.draw(this.ctx, G);
      const gpu = RS.Post.active;
      if (gpu) RS.Post.present(this.canvas);
      RS.Post.show(gpu);
      const h = this.hctx;
      h.setTransform(1, 0, 0, 1, 0, 0);
      h.clearRect(0, 0, this.HW, this.HH);
      if (G.state === 'intro') RS.Intro.draw(h, this.HW, this.HH);
      else RS.HUD.draw(h, G, this.HW, this.HH, dt);
      this.hudDirty = true;
    },

    loop(t) {
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      try {
        Input.pollPad();
        if (G.state === 'run' && Input.pressed('pause')) G.pause();
        if (G.state === 'intro') RS.Intro.update(dt);
        if (G.state === 'run') RS.GFX.autoTick(dt);
        G.update(dt);
        // a world frozen under a menu (pause, level up, chest, thumb pick) is drawn once, not every refresh: the
        // menu's own animations get the whole frame budget
        const still = STILL[G.state] === 1;
        if (G.p && G.state !== 'menu') { if (!still || this.stillDrawn !== G.state) { this.drawGame(dt); this.stillDrawn = still ? G.state : null; } }
        else {
          if (this.hudDirty) { this.hctx.setTransform(1, 0, 0, 1, 0, 0); this.hctx.clearRect(0, 0, this.HW, this.HH); this.hudDirty = false; }
          RS.Post.show(false);
          this.drawMenu(dt, t / 1000);
        }
      } catch (err) {
        console.error(err);
      }
      Input.endFrame();
      requestAnimationFrame((tt) => this.loop(tt));
    },

    drawMenu(dt, time) {
      const ctx = this.ctx, W = this.W, H = this.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
      const pulse = RS.Audio.music.pulse();
      const cur = RS.Screens.current;
      // main menu = parking deck with the hero, character select = same deck blurred, the rest = the red lot
      const mode = !cur || cur === 'main' ? 'main' : cur === 'chars' || cur === 'mapsel' ? 'chars' : 'yard';
      let hero = null;
      if (cur === 'main' && W > H * 0.9) {
        const sel = RS.Save.data.selected;
        const id = RS.Data.charPlayable(sel.char) ? sel.char : 'twizzy';
        hero = { id, cos: RS.Screens.cosFor(id) };
      }
      RS.Scene.draw(ctx, W, H, time, pulse, mode, hero);
      if (mode === 'main') {
        // readability: darken the left side where the logo + menu live
        const lg = ctx.createLinearGradient(0, 0, W * 0.5, 0);
        lg.addColorStop(0, 'rgba(4,4,5,0.72)'); lg.addColorStop(0.6, 'rgba(4,4,5,0.35)'); lg.addColorStop(1, 'rgba(4,4,5,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W * 0.5, H);
      }
      if (cur === 'chars') RS.Screens.drawStage(time, pulse, dt);
      if (cur === 'mapsel') RS.Screens.drawMaps(dt);
      if (RS.Render.vign.width && RS.Render.vign.height) ctx.drawImage(RS.Render.vign, 0, 0); // 0 x 0 while the window is collapsed
      if (RS.Save.s.screenFx) RS.Render.postFx(ctx, G, 0.1);
    },
  };

  RS.Main = Main;
  // sprite atlas is a data: URI, so it decodes in a few ms; boot only once it is sliced
  const go = () => RS.Atlas.load().then(() => RS.Sprites.loadHeroSheets()).then(() => RS.FXS.load()).then(() => RS.Sprites.loadEnemySheets()).then(() => RS.Scene.loadArt()).then(() => Main.boot());
  // make sure the canvas fonts are ready before the first HUD frame
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all(['400 32px "Bebas Neue"', '400 32px "Jersey 10"', '400 14px "Silkscreen"', '700 14px "Silkscreen"', '400 14px "Pixelify Sans"', '400 14px "Press Start 2P"'].map((f) => document.fonts.load(f).catch(() => null)))
    : null;
  if (fontsReady) {
    let started = false;
    const start = () => { if (!started) { started = true; go(); } };
    fontsReady.then(() => document.fonts.ready).then(start, start);
    setTimeout(start, 2000);
  } else window.addEventListener('load', go);
})(window.RS);
