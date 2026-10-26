'use strict';
// Fully procedural audio: synthesized SFX + a generative rage/cloud-rap sequencer.
(function (RS) {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ctx: null, master: null, musicBus: null, musicFilter: null, sfxBus: null,
    noiseBuf: null, distCurve: null, softCurve: null,
    last: {}, voices: 0, maxVoices: 40,
    vol: { master: 0.8, menuMusic: 0.5, runMusic: 0.5, sfx: 0.75 },

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 6;
      this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
      this.master = c.createGain();
      this.master.connect(this.comp); this.comp.connect(c.destination);
      this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
      this.musicBus = c.createGain(); this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
      // delay send for leads
      this.delay = c.createDelay(1.0); this.delay.delayTime.value = 0.3;
      this.delayFb = c.createGain(); this.delayFb.gain.value = 0.32;
      this.delayLp = c.createBiquadFilter(); this.delayLp.type = 'lowpass'; this.delayLp.frequency.value = 2400;
      this.delay.connect(this.delayLp); this.delayLp.connect(this.delayFb); this.delayFb.connect(this.delay);
      this.delayLp.connect(this.musicBus);
      // noise
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.distCurve = this.makeCurve(14);
      this.softCurve = this.makeCurve(3);
      this.applyVolumes();
    },
    makeCurve(k) {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
      return curve;
    },
    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setVolumes(s) { this.vol.master = s.master; this.vol.menuMusic = s.menuMusic; this.vol.runMusic = s.runMusic; this.vol.sfx = s.sfx; this.applyVolumes(); },
    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.vol.master, t, 0.02);
      // generative fallback music follows the slider of where you are (menu or run); 0.88 keeps the old level at 50%
      const m = this.music && this.music.id !== 'menu' ? this.vol.runMusic : this.vol.menuMusic;
      this.musicBus.gain.setTargetAtTime(m * 0.88, t, 0.02);
      this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.02);
      if (this.songs) this.songs.applyVolume();
    },
    muffle(on) {
      if (!this.ctx) return;
      this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.12);
      if (this.songs) this.songs.muffle(on);
    },

    // ---------- primitives ----------
    track(node, end, sfx) {
      if (sfx) { this.voices++; node.onended = () => { this.voices--; }; }
      node.stop(end);
    },
    tone(o) {
      const c = this.ctx, t0 = c.currentTime + (o.t || 0), d = o.d || 0.1;
      const osc = c.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + d * (o.slide || 1));
      if (o.detune) osc.detune.value = o.detune;
      const g = c.createGain();
      const a = o.a || 0.004;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.1), t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      let node = osc;
      if (o.dist) { const ws = c.createWaveShaper(); ws.curve = o.dist === 2 ? this.distCurve : this.softCurve; node.connect(ws); node = ws; }
      if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; node.connect(f); node = f; }
      node.connect(g); g.connect(o.dest || this.sfxBus);
      osc.start(t0); this.track(osc, t0 + d + 0.05, !o.dest);
    },
    noise(o) {
      const c = this.ctx, t0 = c.currentTime + (o.t || 0), d = o.d || 0.1;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      src.playbackRate.value = o.rate || 1;
      const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.f || 1000, t0);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t0 + d);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.1), t0 + (o.a || 0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfxBus);
      src.start(t0, Math.random() * 1.5); this.track(src, t0 + d + 0.05, !o.dest);
    },

    // ---------- sound effects ----------
    sfx(name, opts) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const def = SFX[name];
      if (!def) return;
      const now = this.ctx.currentTime;
      if (this.last[name] !== undefined && now - this.last[name] < def.gap) return;
      if (this.voices > this.maxVoices && !def.prio) return;
      this.last[name] = now;
      def.fn(this, opts || {});
    },
  };

  const SFX = {
    rage: { gap: 0.05, fn: (a) => { a.tone({ type: 'square', f: 900, f2: 380, d: 0.06, v: 0.07 }); a.noise({ ft: 'highpass', f: 3500, d: 0.035, v: 0.06 }); } },
    glock: { gap: 0.04, fn: (a) => { a.tone({ type: 'square', f: 1500 + Math.random() * 300, f2: 700, d: 0.035, v: 0.05 }); a.noise({ ft: 'bandpass', f: 5000, d: 0.025, v: 0.05, q: 3 }); } },
    spin: { gap: 0.08, fn: (a) => { a.tone({ type: 'triangle', f: 320, f2: 980, d: 0.13, v: 0.1 }); } },
    bounce: { gap: 0.05, fn: (a, o) => { a.tone({ type: 'triangle', f: 600 + (o.n || 0) * 90, f2: 1200 + (o.n || 0) * 90, d: 0.06, v: 0.06 }); } },
    bass: { gap: 0.15, fn: (a) => { a.tone({ type: 'sine', f: 130, f2: 38, d: 0.5, v: 0.45, dist: 2 }); a.noise({ f: 500, f2: 80, d: 0.25, v: 0.15 }); } },
    tornado: { gap: 0.3, fn: (a) => { a.noise({ ft: 'bandpass', f: 300, f2: 2200, d: 0.7, v: 0.16, q: 4, a: 0.2 }); } },
    zap: { gap: 0.05, fn: (a) => { a.tone({ type: 'sawtooth', f: 1900, f2: 180, d: 0.12, v: 0.07 }); a.noise({ ft: 'highpass', f: 2500, d: 0.09, v: 0.1 }); } },
    wave808: { gap: 0.18, fn: (a) => { a.tone({ type: 'sine', f: 96, f2: 34, d: 0.6, v: 0.55, dist: 1 }); a.tone({ type: 'square', f: 48, d: 0.08, v: 0.05 }); } },
    whip: { gap: 0.09, fn: (a) => { a.noise({ ft: 'bandpass', f: 700, f2: 5000, d: 0.13, v: 0.18, q: 2 }); a.tone({ type: 'triangle', f: 2400, f2: 900, d: 0.08, v: 0.04 }); } },
    mosh: { gap: 0.2, fn: (a) => { a.noise({ f: 700, f2: 120, d: 0.22, v: 0.2 }); a.tone({ type: 'square', f: 70, f2: 40, d: 0.18, v: 0.09, lp: 400 }); } },
    sonic: { gap: 0.15, fn: (a) => { a.tone({ type: 'sawtooth', f: 240, f2: 70, d: 0.3, v: 0.16, lp: 1400, dist: 1 }); a.noise({ ft: 'bandpass', f: 1200, f2: 300, d: 0.2, v: 0.08 }); } },
    deadair: { gap: 0.3, fn: (a) => { a.tone({ type: 'sine', f: 620, f2: 120, d: 0.5, v: 0.1 }); a.noise({ ft: 'bandpass', f: 900, f2: 100, d: 0.5, v: 0.08, q: 2 }); } },
    rocket: { gap: 0.15, fn: (a) => { a.noise({ ft: 'bandpass', f: 400, f2: 1400, d: 0.32, v: 0.14, q: 3 }); } },
    explode: { gap: 0.06, fn: (a, o) => { const s = o.big ? 1.4 : 1; a.noise({ f: 1400, f2: 90, d: 0.5 * s, v: 0.36 * s }); a.tone({ type: 'sine', f: 90, f2: 30, d: 0.4 * s, v: 0.45, dist: 1 }); } },
    cd: { gap: 0.1, fn: (a) => { a.noise({ ft: 'bandpass', f: 2200, f2: 1100, d: 0.16, v: 0.1, q: 5 }); a.tone({ type: 'triangle', f: 1300, f2: 1700, d: 0.08, v: 0.03 }); } },
    mine: { gap: 0.1, fn: (a) => { a.tone({ type: 'square', f: 1250, d: 0.025, v: 0.05 }); a.tone({ type: 'square', f: 900, d: 0.025, v: 0.04, t: 0.04 }); } },
    hit: { gap: 0.03, fn: (a) => { a.noise({ ft: 'highpass', f: 1800, d: 0.03, v: 0.05 }); a.tone({ type: 'square', f: 240, f2: 110, d: 0.04, v: 0.03 }); } },
    crit: { gap: 0.045, fn: (a) => { a.tone({ type: 'square', f: 1700, f2: 800, d: 0.07, v: 0.07 }); a.noise({ ft: 'highpass', f: 4000, d: 0.05, v: 0.08 }); } },
    kill: { gap: 0.03, fn: (a) => { a.tone({ type: 'triangle', f: 520, f2: 140, d: 0.07, v: 0.05 }); } },
    xp: { gap: 0.022, fn: (a, o) => { a.tone({ type: 'sine', f: 880 * Math.pow(1.03, Math.min(o.combo || 0, 30)), d: 0.06, v: 0.06 }); } },
    coin: { gap: 0.05, fn: (a) => { a.tone({ type: 'square', f: 1320, d: 0.05, v: 0.05 }); a.tone({ type: 'square', f: 1980, d: 0.1, v: 0.05, t: 0.05 }); } },
    // a struck bell: inharmonic partials (1, 2.76, 5.4, 8.9 x the strike) with long, staggered decays.
    // THE BELLS ring every bar or two for the whole run, so it sits quietly under everything: k = 0.25 (-12 dB) puts its
    // peak at a coin pickup's level (it used to peak at 2x the loudest pickup sound)
    bell: { gap: 0.4, prio: true, fn: (a) => {
      const f = 784 * (Math.random() < 0.5 ? 1 : 0.75), k = 0.25;
      [[1, 0.1, 1.6], [2.76, 0.05, 1.1], [5.4, 0.03, 0.6], [8.9, 0.018, 0.35], [0.5, 0.05, 1.4]].forEach(([m, v, d]) => a.tone({ type: 'sine', f: f * m, d, v: v * k }));
      a.noise({ ft: 'highpass', f: 5000, d: 0.05, v: 0.05 * k });
    } },
    heal: { gap: 0.2, fn: (a) => { [523, 659, 784, 1046].forEach((f, i) => a.tone({ type: 'sine', f, d: 0.18, v: 0.09, t: i * 0.05 })); } },
    hurt: { gap: 0.1, prio: true, fn: (a) => { a.tone({ type: 'sawtooth', f: 220, f2: 55, d: 0.22, v: 0.22, dist: 1 }); a.noise({ f: 900, f2: 100, d: 0.16, v: 0.18 }); } },
    dodge: { gap: 0.1, fn: (a) => { a.noise({ ft: 'highpass', f: 2000, f2: 6000, d: 0.12, v: 0.08 }); } },
    shield: { gap: 0.1, prio: true, fn: (a) => { a.tone({ type: 'triangle', f: 1800, f2: 1200, d: 0.25, v: 0.12 }); a.tone({ type: 'sine', f: 2700, d: 0.3, v: 0.06 }); } },
    dash: { gap: 0.08, prio: true, fn: (a) => { a.noise({ ft: 'bandpass', f: 500, f2: 3500, d: 0.2, v: 0.2, q: 1.5 }); a.tone({ type: 'sine', f: 300, f2: 950, d: 0.12, v: 0.06 }); } },
    levelup: { gap: 0.3, prio: true, fn: (a) => {
      [0, 3, 7, 10, 12, 15].forEach((n, i) => a.tone({ type: 'square', f: mtof(69 + n), d: 0.14, v: 0.07, t: i * 0.055, lp: 3500 }));
      a.tone({ type: 'sine', f: mtof(93), d: 0.6, v: 0.06, t: 0.3 });
    } },
    pickup: { gap: 0.06, fn: (a) => { a.tone({ type: 'triangle', f: 700, f2: 1500, d: 0.09, v: 0.1 }); } },
    chest: { gap: 0.3, prio: true, fn: (a) => { a.noise({ f: 300, d: 0.3, v: 0.2 }); [0, 4, 7, 12].forEach((n, i) => a.tone({ type: 'triangle', f: mtof(76 + n), d: 0.25, v: 0.08, t: 0.15 + i * 0.08 })); } },
    chestTick: { gap: 0.04, fn: (a) => { a.tone({ type: 'square', f: 1000 + Math.random() * 800, d: 0.03, v: 0.04 }); } },
    evolve: { gap: 0.5, prio: true, fn: (a) => {
      a.tone({ type: 'sawtooth', f: 90, f2: 2200, d: 1.1, v: 0.14, dist: 2, lp: 5000, slide: 0.9 });
      a.tone({ type: 'sine', f: 70, f2: 30, d: 0.9, v: 0.5, t: 0.9, dist: 1 });
      [0, 7, 12, 19, 24].forEach((n, i) => a.tone({ type: 'square', f: mtof(72 + n), d: 0.3, v: 0.05, t: 0.95 + i * 0.06, lp: 4000 }));
    } },
    // a stash item picked up: a short bright arpeggio over a soft shimmer
    stash: { gap: 0.25, prio: true, fn: (a) => { [0, 7, 12, 19].forEach((n, i) => a.tone({ type: 'triangle', f: mtof(79 + n), d: 0.16, v: 0.06, t: i * 0.045 })); a.noise({ ft: 'highpass', f: 7000, d: 0.3, v: 0.03 }); } },
    // an altar charged: a low hit, then a minor chord swelling up
    altar: { gap: 0.6, prio: true, fn: (a) => { a.tone({ type: 'sine', f: 82, f2: 41, d: 0.5, v: 0.32, dist: 1 }); [0, 3, 7].forEach((n, i) => a.tone({ type: 'sawtooth', f: mtof(57 + n), d: 0.7, v: 0.035, t: 0.05 + i * 0.03, lp: 1800 })); } },
    rare: { gap: 0.3, prio: true, fn: (a) => { a.tone({ type: 'sine', f: 1318, d: 0.5, v: 0.1 }); a.tone({ type: 'sine', f: 1975, d: 0.6, v: 0.08, t: 0.08 }); a.tone({ type: 'triangle', f: 2637, d: 0.6, v: 0.04, t: 0.16 }); } },
    boss: { gap: 1, prio: true, fn: (a) => {
      a.tone({ type: 'sawtooth', f: 55, d: 1.8, v: 0.22, lp: 600, a: 0.2, dist: 1 }); a.tone({ type: 'sawtooth', f: 58.3, d: 1.8, v: 0.18, lp: 600, a: 0.2 });
      a.tone({ type: 'sine', f: 80, f2: 28, d: 1.2, v: 0.5, t: 0.1, dist: 2 }); a.noise({ f: 800, f2: 60, d: 1.4, v: 0.2 });
    } },
    bossDie: { gap: 1, prio: true, fn: (a) => {
      for (let i = 0; i < 5; i++) { a.noise({ f: 1600, f2: 70, d: 0.6, v: 0.3, t: i * 0.18 }); a.tone({ type: 'sine', f: 100, f2: 28, d: 0.5, v: 0.4, t: i * 0.18, dist: 1 }); }
    } },
    death: { gap: 1, prio: true, fn: (a) => { a.tone({ type: 'sawtooth', f: 420, f2: 35, d: 1.4, v: 0.2, dist: 1, lp: 2000 }); a.noise({ f: 2000, f2: 60, d: 1.2, v: 0.15 }); } },
    win: { gap: 1, prio: true, fn: (a) => { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => a.tone({ type: 'square', f: mtof(64 + n), d: 0.3, v: 0.07, t: i * 0.09, lp: 3500 })); } },
    ui: { gap: 0.03, prio: true, fn: (a) => { a.tone({ type: 'square', f: 880, f2: 660, d: 0.035, v: 0.05 }); } },
    hover: { gap: 0.04, fn: (a) => { a.tone({ type: 'sine', f: 1500, d: 0.02, v: 0.025 }); } },
    ability: { gap: 0.3, prio: true, fn: (a) => {
      a.noise({ ft: 'bandpass', f: 200, f2: 4000, d: 0.5, v: 0.2, q: 2 }); a.tone({ type: 'sine', f: 110, f2: 40, d: 0.6, v: 0.5, t: 0.1, dist: 2 });
      a.tone({ type: 'sawtooth', f: 220, f2: 880, d: 0.4, v: 0.08, lp: 3000 });
    } },
    warning: { gap: 0.6, prio: true, fn: (a) => { for (let i = 0; i < 3; i++) { a.tone({ type: 'square', f: 880, d: 0.09, v: 0.06, t: i * 0.22 }); a.tone({ type: 'square', f: 660, d: 0.09, v: 0.06, t: i * 0.22 + 0.11 }); } } },
    thumb: { gap: 0.4, prio: true, fn: (a) => { a.tone({ type: 'sine', f: 440, f2: 880, d: 0.7, v: 0.12 }); a.tone({ type: 'triangle', f: 660, f2: 1320, d: 0.7, v: 0.07, t: 0.05 }); a.noise({ ft: 'highpass', f: 6000, d: 0.5, v: 0.05 }); } },
    perc: { gap: 0.3, prio: true, fn: (a) => { [0, 5, 10, 15, 20].forEach((n, i) => a.tone({ type: 'triangle', f: mtof(70 + n), d: 0.1, v: 0.08, t: i * 0.04 })); } },
    teleport: { gap: 0.15, fn: (a) => { for (let i = 0; i < 4; i++) a.tone({ type: 'square', f: 200 + Math.random() * 2000, d: 0.03, v: 0.04, t: i * 0.03 }); } },
    telegraph: { gap: 0.12, fn: (a) => { a.tone({ type: 'sawtooth', f: 160, f2: 320, d: 0.3, v: 0.07, lp: 1200 }); } },
    slam: { gap: 0.15, fn: (a) => { a.tone({ type: 'sine', f: 70, f2: 30, d: 0.35, v: 0.45, dist: 2 }); a.noise({ f: 600, f2: 60, d: 0.3, v: 0.25 }); } },
    // GIANT SNEAKER landing: a short soft thud. The gap is the shared timing for the whole herd: sneakers landing
    // together play it once (they used 'slam', the boss sound, up to ~7 times a second in a trip-peak ring)
    stomp: { gap: 0.4, fn: (a) => { a.tone({ type: 'sine', f: 95, f2: 48, d: 0.14, v: 0.08 }); a.noise({ f: 420, f2: 90, d: 0.1, v: 0.04 }); } },
    shoot_e: { gap: 0.08, fn: (a) => { a.tone({ type: 'sawtooth', f: 330, f2: 160, d: 0.12, v: 0.05, lp: 1500 }); } },
    break: { gap: 0.06, fn: (a) => { a.noise({ ft: 'bandpass', f: 1800, f2: 400, d: 0.15, v: 0.14, q: 1 }); } },
    airhorn: { gap: 0.5, prio: true, fn: (a) => { [0, 0.18, 0.36].forEach((t) => { a.tone({ type: 'sawtooth', f: 466, d: 0.16, v: 0.13, t, lp: 3000, dist: 1 }); a.tone({ type: 'sawtooth', f: 554, d: 0.16, v: 0.1, t, lp: 3000 }); }); } },
    // trip sounds: a toy whinny, a slurp, a gulp and the warped drop when it kicks in
    neigh: { gap: 0.25, fn: (a) => { for (let i = 0; i < 5; i++) a.tone({ type: 'square', f: 1100 - i * 120 + (i % 2) * 260, f2: 900 - i * 140, d: 0.07, v: 0.035, t: i * 0.06, lp: 2600 }); } },
    sip: { gap: 0.3, prio: true, fn: (a) => { a.noise({ ft: 'bandpass', f: 700, f2: 1900, d: 0.42, v: 0.16, q: 6 }); a.noise({ ft: 'bandpass', f: 1200, f2: 600, d: 0.25, v: 0.08, q: 8, t: 0.3 }); } },
    gulp: { gap: 0.3, prio: true, fn: (a) => { a.tone({ type: 'sine', f: 240, f2: 90, d: 0.16, v: 0.3 }); a.tone({ type: 'sine', f: 180, f2: 70, d: 0.14, v: 0.22, t: 0.14 }); } },
    trip: { gap: 1, prio: true, fn: (a) => {
      a.tone({ type: 'sawtooth', f: 880, f2: 55, d: 1.4, v: 0.1, lp: 2200, slide: 1 }); a.tone({ type: 'sawtooth', f: 890, f2: 57, d: 1.4, v: 0.08, lp: 2200 });
      a.tone({ type: 'sine', f: 70, f2: 30, d: 1.1, v: 0.5, t: 0.35, dist: 2 });
      [0, 7, 12, 19].forEach((n, i) => a.tone({ type: 'triangle', f: mtof(76 + n), d: 0.5, v: 0.05, t: 0.1 + i * 0.09 }));
    } },
    // the run intro's photos: a dry two-part camera shutter, kept quiet (three in a row)
    shutter: { gap: 0.15, prio: true, fn: (a) => {
      a.noise({ ft: 'highpass', f: 2600, d: 0.025, v: 0.06 });
      a.noise({ ft: 'bandpass', f: 1700, d: 0.04, v: 0.045, q: 2, t: 0.07 }); a.tone({ type: 'square', f: 150, f2: 90, d: 0.03, v: 0.02, t: 0.07, lp: 900 });
    } },
    flash: { gap: 0.5, prio: true, fn: (a) => { a.noise({ ft: 'highpass', f: 3000, d: 0.08, v: 0.2 }); a.tone({ type: 'sine', f: 4000, f2: 600, d: 0.6, v: 0.06, t: 0.05 }); } },
  };

  // ---------- generative music ----------
  const TRACKS = {
    menu: { bpm: 72, root: 45, prog: [0, 8, 3, 10], style: 'cloud' },
    garage: { bpm: 150, root: 42, prog: [0, 8, 3, 10], style: 'rage', lead: 'square' },
    afterparty: { bpm: 158, root: 44, prog: [0, 5, 8, 7], style: 'rage', lead: 'saw' },
    void: { bpm: 146, root: 40, prog: [0, 1, 8, 7], style: 'rage', lead: 'square' },
    boss: { bpm: 162, root: 41, prog: [0, 1, 0, 6], style: 'rage', lead: 'saw' },
  };
  const MINOR_PENTA = [0, 3, 5, 7, 10];

  // ---------- recorded songs (audio/) ----------
  // Add a song by putting the file in audio/ and its path in the list. One song in a list loops; several play one
  // after another and wrap around. The menu list starts on a random song every time you enter the menu.
  // A file that fails to load is skipped; if a whole list fails, the generative sequencer below plays instead.
  // "menu" plays on every out-of-run screen, "run" during a run (bosses included).
  // Loudness: every song is levelled to the same loudness (TARGET_LUFS, measured per ITU BS.1770). `lufs` is the
  // file's measured value; leave it out for a new song and the game measures it in the background the first time
  // it plays (it starts quiet and settles in ~2 s). The MENU MUSIC / IN-GAME MUSIC sliders (default 50%) scale it.
  const PLAYLISTS = {
    menu: [{ src: 'audio/menu.ogg', lufs: -6.53 }, { src: 'audio/ingame song 2.mp3', lufs: -19.24 }],
    run: [{ src: 'audio/ingame song 1.mp3', lufs: -19.43 }, { src: 'audio/ingame song 2.mp3', lufs: -19.24 }, { src: 'audio/ingame song 3.mp3', lufs: -9.46 }],
  };
  const TARGET_LUFS = -16; // loud enough at 50%, and even the quietest song stays below 0 dBFS peak at 100%
  const lufsCache = {};
  // integrated loudness (BS.1770: K-weighting, 400 ms blocks, -70 LUFS absolute and -10 LU relative gates)
  async function measureLufs(src) {
    const ab = await (await fetch(encodeURI(src))).arrayBuffer();
    const dec = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(ab);
    const sr = dec.sampleRate, n = dec.length, ch = dec.numberOfChannels;
    const oc = new OfflineAudioContext(ch, n, sr), bs = oc.createBufferSource(); bs.buffer = dec;
    const hs = oc.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1681; hs.gain.value = 4;
    const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
    bs.connect(hs); hs.connect(hp); hp.connect(oc.destination); bs.start();
    const kw = await oc.startRendering(), B = Math.round(sr * 0.4), H = Math.round(sr * 0.1), blocks = [], d = [];
    for (let c = 0; c < ch; c++) d.push(kw.getChannelData(c));
    for (let s = 0; s + B <= n; s += H) { let e = 0; for (const x of d) { let a = 0; for (let i = s; i < s + B; i++) a += x[i] * x[i]; e += a / B; } blocks.push(e); }
    const L = (e) => -0.691 + 10 * Math.log10(e), mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
    const g1 = blocks.filter((e) => L(e) > -70), g2 = g1.filter((e) => L(e) > L(mean(g1)) - 10);
    return L(mean(g2));
  }
  const Songs = {
    el: null, gain: null, an: null, bins: null, key: null, cur: null, idx: { menu: 0, run: 0 }, bad: {}, avg: 0, tok: 0,
    norm(s) { // gain that brings this song to TARGET_LUFS; an unmeasured song plays at -10 dB until it is measured
      const l = s.lufs !== undefined ? s.lufs : lufsCache[s.src];
      return l === undefined ? 0.32 : Math.min(4, Math.pow(10, (TARGET_LUFS - l) / 20));
    },
    level() { return this.cur ? this.norm(this.cur) * (this.key === 'menu' ? A.vol.menuMusic : A.vol.runMusic) : 0; },
    // Two outputs. Over http the song runs through Web Audio (master, pause muffle, beat pulse). Opened straight from
    // disk (file://) Chrome / Edge treat the file as cross-origin and a MediaElementSource outputs pure silence, so
    // there the element plays on its own and the volume, the master slider and the pause duck are set on el.volume.
    direct: location.protocol === 'file:', muffled: false, vtimer: null,
    fadeTo(v, sec) {
      if (!this.direct) {
        const t = A.ctx.currentTime;
        this.gain.gain.cancelScheduledValues(t); this.gain.gain.setTargetAtTime(v, t, sec);
        return;
      }
      const el = this.el, goal = Math.max(0, Math.min(1, v * A.vol.master * (this.muffled ? 0.35 : 1)));
      clearInterval(this.vtimer);
      const k = 1 - Math.exp(-0.03 / Math.max(0.01, sec));
      this.vtimer = setInterval(() => { el.volume += (goal - el.volume) * k; if (Math.abs(goal - el.volume) < 0.002) { el.volume = goal; clearInterval(this.vtimer); } }, 30);
    },
    setNow(v) { if (this.direct) { clearInterval(this.vtimer); this.el.volume = 0; } else { const t = A.ctx.currentTime; this.gain.gain.cancelScheduledValues(t); this.gain.gain.setValueAtTime(v, t); } },
    setup() {
      if (this.el || !A.ctx) return;
      const el = new Audio(); el.preload = 'auto';
      if (this.direct) el.volume = 0;
      else {
        this.gain = A.ctx.createGain(); this.gain.gain.value = 0;
        this.an = A.ctx.createAnalyser(); this.an.fftSize = 256; this.bins = new Uint8Array(this.an.frequencyBinCount);
        const src = A.ctx.createMediaElementSource(el);
        src.connect(this.gain); this.gain.connect(A.musicFilter); this.gain.connect(this.an); // musicFilter: pause muffle
      }
      el.addEventListener('ended', () => this.next());
      el.addEventListener('error', () => { if (!this.key) return; this.bad[el.dataset.src] = true; this.next(); });
      this.el = el;
    },
    live(key) { return (PLAYLISTS[key] || []).filter((s) => !this.bad[s.src]); },
    has(key) { return this.live(key).length > 0; },
    play(key) {
      this.setup();
      if (!this.el) return;
      if (this.key === key) { if (this.el.paused) this.el.play().catch(() => {}); return; } // same list: keep the song going
      this.key = key; this.tok++;
      if (key === 'menu') this.idx.menu = Math.floor(Math.random() * 64); // coming back to the menu starts on a random song
      this.load();
    },
    load() {
      const list = this.live(this.key);
      if (!list.length) { const k = this.key; this.stop(true); Music.fallback(k); return; }
      const i = this.idx[this.key] % list.length, el = this.el, song = list[i];
      this.cur = song;
      el.dataset.src = song.src; el.src = encodeURI(song.src); el.loop = list.length === 1;
      this.setNow(0); this.fadeTo(this.level(), 0.25); // fade in
      el.play().catch(() => {}); // blocked until the first click / key press; play(key) retries then
      if (song.lufs === undefined && !(song.src in lufsCache)) { // new song without a measured loudness: measure once
        lufsCache[song.src] = undefined;
        setTimeout(() => measureLufs(song.src).then((l) => { lufsCache[song.src] = l; if (this.cur === song) this.applyVolume(); }).catch(() => {}), 1500);
      }
    },
    next() {
      if (!this.key) return;
      this.idx[this.key]++;
      this.load();
    },
    stop(now) {
      if (!this.el || !this.key) return;
      this.key = null; this.cur = null;
      const tok = ++this.tok;
      this.fadeTo(0, now ? 0.01 : 0.12); // short fade out
      setTimeout(() => { if (this.tok === tok) this.el.pause(); }, now ? 30 : 600);
    },
    applyVolume() { if (this.el && this.key) this.fadeTo(this.level(), 0.05); },
    muffle(on) { this.muffled = on; if (this.direct) this.applyVolume(); }, // over Web Audio the music filter muffles
    // beat pulse for the visuals: low-band energy above its running average
    pulse() {
      if (!this.an || !this.key) return 0;
      this.an.getByteFrequencyData(this.bins);
      const e = (this.bins[1] + this.bins[2] + this.bins[3] + this.bins[4]) / 1020;
      this.avg = this.avg * 0.96 + e * 0.04;
      return Math.max(0, Math.min(1, (e - this.avg * 1.05) * 5));
    },
  };
  A.songs = Songs;

  const Music = {
    on: false, tr: null, step: 0, nextT: 0, timer: null, intensity: 0, kicks: [], lastKick: -10,
    leadPat: [], leadNotes: [], hatSeed: 0, song: null,
    play(id) {
      if (!A.ctx) return;
      const key = id === 'menu' ? 'menu' : 'run';
      if (Songs.has(key)) { // a recorded song replaces the generative track
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.on = true; this.id = id; this.song = key; this.tr = null;
        Songs.play(key);
        return;
      }
      if (this.on && this.tr === TRACKS[id]) return;
      this.stop();
      this.id = id; A.applyVolumes(); // the fallback sequencer takes the menu or in-game slider
      this.tr = TRACKS[id] || TRACKS.garage;
      this.id = id;
      this.on = true; this.step = 0; this.nextT = A.ctx.currentTime + 0.08;
      this.genPatterns();
      this.timer = setInterval(() => this.tick(), 25);
    },
    stop() { this.on = false; this.song = null; Songs.stop(); if (this.timer) clearInterval(this.timer); this.timer = null; },
    fallback(key) { if (this.song === key) { this.on = false; this.song = null; this.play(this.id); } }, // every file of a list failed
    setIntensity(n) { this.intensity = n; },
    genPatterns() {
      // a hooky 16-step lead rhythm + note contour that repeats every bar
      const pat = [], notes = [];
      for (let i = 0; i < 16; i++) {
        const strong = i % 4 === 0;
        pat.push(strong ? Math.random() < 0.85 : Math.random() < 0.45);
        notes.push(MINOR_PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.25 ? 12 : 0));
      }
      this.leadPat = pat; this.leadNotes = notes;
      this.p808 = [0, 3, 10, 16, 19, 26, 29].filter((s, i) => i < 3 || Math.random() < 0.8);
    },
    tick() {
      if (!this.on || !A.ctx) return;
      const spb = 60 / this.tr.bpm / 4;
      while (this.nextT < A.ctx.currentTime + 0.14) {
        this.schedule(this.step, this.nextT);
        this.nextT += spb; this.step++;
      }
    },
    pulse() {
      if (!A.ctx) return 0;
      if (this.song) return Songs.pulse();
      const now = A.ctx.currentTime;
      while (this.kicks.length && this.kicks[0] <= now) this.lastKick = this.kicks.shift();
      return Math.max(0, 1 - (now - this.lastKick) / 0.22);
    },
    // instruments write directly to musicBus at an absolute time
    at(t) { return t - A.ctx.currentTime; },
    schedule(step, t) {
      const tr = this.tr, I = this.intensity, s32 = step % 32, s16 = step % 16;
      const bar = Math.floor(step / 16) % 4;
      const chordRoot = tr.root + tr.prog[bar];
      const dest = A.musicBus, off = this.at(t);
      if (off < -0.05) return;
      const o = Math.max(0, off);

      if (tr.style === 'cloud') {
        if (s16 === 0) this.pad(chordRoot + 12, o, (60 / tr.bpm) * 4, 0.045);
        if (s16 % 4 === 2) A.noise({ ft: 'highpass', f: 7000, d: 0.04, v: 0.02, t: o, dest });
        if (I >= 1 && (s16 === 0 || s16 === 10)) { this.kick808(chordRoot - 12, o, 0.7, 0.25); }
        if (s16 % 3 === 0 && Math.random() < 0.6) {
          const n = chordRoot + 24 + MINOR_PENTA[(step * 7) % 5];
          A.tone({ type: 'sine', f: mtof(n), d: 0.6, v: 0.025, t: o, dest: A.delay });
          A.tone({ type: 'sine', f: mtof(n), d: 0.5, v: 0.02, t: o, dest });
        }
        return;
      }

      // pad always
      if (s16 === 0) this.pad(chordRoot + 12, o, (60 / tr.bpm) * 4, I >= 2 ? 0.03 : 0.045);
      // hats
      if (I >= 1 || s16 % 4 === 0) {
        const roll = I >= 2 && (s32 === 14 || s32 === 30) && Math.random() < 0.7;
        if (roll) {
          for (let k = 0; k < 3; k++) A.noise({ ft: 'highpass', f: 8000, d: 0.03, v: 0.03, t: o + k * (60 / tr.bpm / 6), dest });
        } else if (I >= 2 || s16 % 2 === 0) {
          A.noise({ ft: 'highpass', f: 7500, d: 0.035, v: s16 % 4 === 0 ? 0.045 : 0.025, t: o, dest });
        }
        if (I >= 3 && (s16 === 6 || s16 === 14)) A.noise({ ft: 'highpass', f: 6000, d: 0.2, v: 0.03, t: o, dest });
      }
      if (I >= 1) {
        // 808 + kick
        if (this.p808.includes(s32)) {
          const glide = s32 === 26 || s32 === 29;
          this.kick808(chordRoot - 12 + (glide ? 12 : 0), o, glide ? 0.25 : 0.55, 0.42, glide);
          this.kicks.push(t);
        }
        // clap on 3 (half-time)
        if (s16 === 8) {
          A.noise({ ft: 'bandpass', f: 1500, d: 0.18, v: 0.16, t: o, dest, q: 0.9 });
          A.noise({ ft: 'highpass', f: 3000, d: 0.08, v: 0.08, t: o + 0.012, dest });
          this.kicks.push(t);
        }
        if (I >= 3 && s32 === 31) A.noise({ ft: 'bandpass', f: 1800, d: 0.12, v: 0.1, t: o, dest });
      }
      if (I >= 2 && this.leadPat[s16]) {
        const n = chordRoot + 24 + this.leadNotes[s16];
        this.lead(n, o, 0.11, 0.05);
        if (I >= 3) this.lead(n + 12, o, 0.09, 0.022);
      }
    },
    pad(root, o, dur, v) {
      [0, 3, 7].forEach((iv, i) => {
        A.tone({ type: 'triangle', f: mtof(root + iv), d: dur, v, t: o, a: 0.4, lp: 1100, dest: A.musicBus, detune: (i - 1) * 6 });
      });
    },
    kick808(n, o, len, v, glide) {
      A.tone({ type: 'sine', f: mtof(n) * (glide ? 0.5 : 2.2), f2: mtof(n), d: len, v, t: o, dist: 1, dest: A.musicBus, slide: glide ? 0.4 : 0.06, a: 0.003 });
      A.tone({ type: 'square', f: 55, f2: 40, d: 0.05, v: 0.04, t: o, dest: A.musicBus, lp: 900 });
    },
    lead(n, o, d, v) {
      const type = this.tr.lead === 'saw' ? 'sawtooth' : 'square';
      A.tone({ type, f: mtof(n), d, v, t: o, lp: 3200, dist: 1, dest: A.musicBus, detune: -9 });
      A.tone({ type, f: mtof(n), d, v: v * 0.7, t: o, lp: 3200, dest: A.musicBus, detune: 9 });
      A.tone({ type: 'sine', f: mtof(n), d: d * 1.6, v: v * 0.6, t: o, dest: A.delay });
    },
  };

  A.music = Music;
  RS.Audio = A;
})(window.RS);
