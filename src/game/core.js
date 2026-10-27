'use strict';
// RS.Game: run state, main update orchestration, spatial helpers, run end + meta payout.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data;

  const G = {
    state: 'menu',          // menu | intro | run | levelup | chest | thumb | paused | dying | gameover | victory
    time: 0, timeScale: 1, hitstop: 0, slowmo: 0,
    p: null, cfg: null, arenaDef: null, arena: null,
    enemies: new RS.Pool(() => ({})),
    projs: new RS.Pool(() => ({ hits: [] })),
    eshots: new RS.Pool(() => ({})),
    zones: new RS.Pool(() => ({})),
    pickups: new RS.Pool(() => ({})),
    teles: [],
    timers: [],
    grid: null,
    cam: { x: 0, y: 0, zoom: 1, vw: 1280, vh: 720 },
    uid: 1,
    mods: {},
    flags: {},
    stats: null,
    modalQueue: [],
    bosses: [],
    enemyRage: 0, freezeT: 0, surgeT: 0,
    lightsFrame: [],
    results: null,

    // ------------------------------------------------------------ lifecycle
    start(cfg) {
      this.cfg = cfg;
      this.mods = {};
      for (const m of cfg.mods || []) this.mods[m] = true;
      this.flags = {};
      this.time = 0; this.hitstop = 0; this.hitstopAt = undefined; this.dmgHist = []; this.dmgT = 0; this.slowmo = 0; this.timeScale = 1;
      this.enemyRage = 0; this.freezeT = 0; this.surgeT = 0; this.fireTok = 2;
      this.tagN = 0; this.tagT = -9; this.followers = 0; // PRODUCER TAG shot counter, follower milestones (kill count)
      this.waveNo = 1; // the numbered wave (Director)
      this.ponyNext = 0; // PINK PONY shared gallop cooldown (Combat.ponyOk)
      this.uid = 1;
      this.enemies.clear(); this.projs.clear(); this.eshots.clear(); this.zones.clear(); this.pickups.clear();
      this.teles.length = 0; this.timers.length = 0; this.modalQueue.length = 0; this.bosses.length = 0;
      FX.reset();
      this.stats = {
        kills: 0, damage: 0, damageTaken: 0, bossesKilled: [], evolutions: [], itemsCollected: 0, chests: 0,
        coins: 0, maxLevel: 1, thumbs: 0, leaks: 0, firstHurt: -1, newDiscoveries: 0, cypher: 0,
      };
      this.runClout = 0;
      RS.Stash.reset(this); // stash DoTs, altars, proc budgets (game/stash.js)
      this.plug = null; this.plugBuys = 0; this.plugNext = undefined; this.plugSeen = false; this.nearPlug = false; this.plugLast = null;
      this.arenaDef = D.ARENAS[cfg.arena] || D.ARENAS.garage;
      this.mapMode = D.MAPMODES[cfg.map] || D.MAPMODES.normal; // NORMAL / NIGHT / STORM: difficulty, pay and look for the whole run
      RS.Weather.reset(this);
      this.arena = RS.Arena.build(this.arenaDef);
      this.grid = new RS.Grid(this.arena.w, this.arena.h, 64);
      this.p = new RS.Player(cfg.char, cfg);
      this.p.x = this.arena.w / 2; this.p.y = this.arena.h / 2;
      this.cam.x = this.p.x; this.cam.y = this.p.y;
      this.p.addWeapon(cfg.startWeapon || D.CHARACTERS[cfg.char].weapon).starter = true; // the hero's own gun (Progression: no focus, not a 'recent' pick)
      RS.Director.reset(this);
      RS.Post.trip = 0;
      RS.Trip.start(this);
      this.won = false;
      RS.Save.data.runs++;
      RS.Save.save();
      RS.Audio.music.play(this.arenaDef.music);
      RS.Audio.music.setIntensity(1);
      RS.Audio.muffle(false);
      // the run opens with the drink cut-scene; RS.Intro switches to 'run' (and shows the arena banner) when it ends
      this.state = 'intro';
      RS.Intro.start(this);
    },

    // ------------------------------------------------------------ main update
    update(rawDt) {
      this.fdt = 0; // sim time of this frame (render-time particle spawns scale by it; 0 while paused)
      if (this.state !== 'run' && this.state !== 'dying') return;
      let dt = rawDt;
      // hitstop freezes the world AND the camera (a camera still catching up would slide the frozen hero on screen)
      if (this.hitstop > 0) { this.hitstop -= rawDt; FX.update(rawDt * 0.2); this.fdt = rawDt * 0.2; return; }
      if (this.state === 'dying') {
        this.slowmo -= rawDt;
        dt = rawDt * 0.25;
        if (this.slowmo <= 0) { this.finishRun(false); return; }
      }
      this.time += dt; this.fdt = dt;
      // scheduled callbacks
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
      }
      if (this.enemyRage > 0) this.enemyRage -= dt;
      if (this.freezeT > 0) this.freezeT -= dt;
      if (this.surgeT > 0) this.surgeT -= dt;

      const p = this.p;
      const PF = RS.Prof && RS.Prof.on ? RS.Prof.t : null; // section timings for tools/bot.js
      let pt = PF ? performance.now() : 0;
      const lap = PF ? (k) => { const n = performance.now(); PF[k] = (PF[k] || 0) + n - pt; pt = n; } : null;
      if (this.state === 'run') p.update(dt, this);
      RS.Director.update(this, dt);
      if (lap) lap('u.player+director');
      // spatial grid
      this.grid.clear();
      for (const e of this.enemies.list) if (!e.dead) this.grid.insert(e);
      if (lap) lap('u.grid');
      this.updateEnemies(dt);
      if (lap) lap('u.enemies');
      this.updateProjectiles(dt);
      if (lap) lap('u.projectiles');
      this.updateFireBudget(dt);
      this.updateEnemyShots(dt);
      this.updateZones(dt);
      this.updateTelegraphs(dt);
      this.updatePickups(dt);
      this.updatePlug(dt);
      RS.Stash.update(this, dt);
      if (lap) lap('u.shots+zones+pickups');
      RS.Arena.update(this, dt);
      RS.Weather.update(this, dt);
      FX.update(dt);
      if (lap) lap('u.arena+fx');
      this.enemies.sweep(); this.projs.sweep(); this.eshots.sweep(); this.zones.sweep(); this.pickups.sweep();
      this.updateCamera(dt);
      this.updateMusic();
      this.checkRunChallenges();
      // damage dealt per second over the last 20 s (bosses size their health from it)
      if (this.time >= (this.dmgT || 0)) { this.dmgT = this.time + 1; (this.dmgHist || (this.dmgHist = [])).push(this.stats.damage); if (this.dmgHist.length > 21) this.dmgHist.shift(); }
      if (this.state === 'run' && p.pendingLevels > 0 && !this.modalQueue.some((m) => m.type === 'levelup')) this.modalQueue.push({ type: 'levelup' });
      if (this.state === 'run' && this.modalQueue.length) this.openNextModal();
    },
    updateCamera(dt) {
      const p = this.p;
      const k = 1 - Math.exp(-8.6 * dt); // exponential follow: same lag at any frame rate
      // the camera stops at the map edges, so the view never shows the empty void past the wall
      const A = this.arena, c = this.cam;
      const tx = A && A.w > c.vw ? U.clamp(p.x, c.vw / 2, A.w - c.vw / 2) : (A ? A.w / 2 : p.x);
      const ty = A && A.h > c.vh ? U.clamp(p.y, c.vh / 2, A.h - c.vh / 2) : (A ? A.h / 2 : p.y);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    },
    updateMusic() {
      const n = this.enemies.count;
      let I = n > 160 ? 3 : n > 45 || this.time > 90 ? 2 : 1;
      if (this.bosses.length) I = 3;
      RS.Audio.music.setIntensity(I);
    },
    view() {
      const c = this.cam;
      return { x0: c.x - c.vw / 2 - 60, x1: c.x + c.vw / 2 + 60, y0: c.y - c.vh / 2 - 80, y1: c.y + c.vh / 2 + 80 };
    },
    onScreen(x, y, pad) {
      const c = this.cam; pad = pad || 0;
      return Math.abs(x - c.x) < c.vw / 2 + pad && Math.abs(y - c.y) < c.vh / 2 + pad;
    },

    // ------------------------------------------------------------ modals
    openNextModal() {
      const m = this.modalQueue.shift();
      if (!m) return;
      if (m.type === 'levelup') { this.state = 'levelup'; RS.Overlays.levelUp(); }
      else if (m.type === 'chest') { this.state = 'chest'; RS.Overlays.chest(m.tier); }
      else if (m.type === 'thumb') { this.state = 'thumb'; RS.Overlays.thumb(m.n || 2); }
      else if (m.type === 'plug') { this.state = 'plug'; RS.Overlays.plug(); }
      else if (m.type === 'victory') { this.state = 'victory'; RS.Overlays.victory(); }
      RS.Audio.muffle(true);
    },
    closeModal() {
      RS.Overlays.hide();
      this.state = 'run';
      RS.Audio.muffle(false);
      if (this.p.pendingLevels > 0) this.modalQueue.unshift({ type: 'levelup' });
      if (this.modalQueue.length) this.openNextModal();
    },
    pause() {
      if (this.state !== 'run') return;
      this.state = 'paused';
      RS.Audio.muffle(true);
      RS.Overlays.pause();
    },
    resume() {
      if (this.state !== 'paused') return;
      RS.Overlays.hide();
      this.state = 'run';
      RS.Audio.muffle(false);
    },

    // ------------------------------------------------------------ helpers
    later(t, fn) { this.timers.push({ t, fn }); },
    sfx(name, opts) { RS.Audio.sfx(name, opts); },
    nearest(x, y, maxR, skip) {
      let best = null, bd = maxR * maxR;
      const list = this.enemies.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.spawning > 0) continue;
        if (skip && (skip === e || (Array.isArray(skip) && skip.includes(e.id)))) continue;
        const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    // ---- auto targeting
    // Enemy hit area: a vertical capsule from the feet circle (e.x, e.y, e.r) up to the middle of the drawn body,
    // so shots that visibly pass through the chest or head connect. lift = how far the capsule reaches up.
    bodyLift(e) {
      if (e.boss) return 0;
      if (e._lift !== undefined) return e._lift;
      const H = RS.Render.enemyBodyH(e);
      return (e._lift = Math.max(0, H * 0.5 - e.r * 0.9));
    },
    // angle from (ox, oy) that intercepts e's body centre at the projectile speed, using its current velocity
    aimAt(ox, oy, e, speed) {
      const tx = e.x, ty = e.y - this.bodyLift(e), vx = (e.vx || 0) + (e.kvx || 0), vy = (e.vy || 0) + (e.kvy || 0);
      let px = tx, py = ty;
      if (speed && isFinite(speed)) {
        let t = Math.hypot(tx - ox, ty - oy) / speed;
        for (let i = 0; i < 3; i++) { t = Math.min(0.6, t); px = tx + vx * t; py = ty + vy * t; t = Math.hypot(px - ox, py - oy) / speed; }
      }
      return Math.atan2(py - oy, px - ox);
    },
    // random spread that can never steer a shot off its target: capped to ±60% of the target's angular half-size
    aimJitter(ox, oy, e, spread) {
      const d = Math.max(1, Math.hypot(e.x - ox, e.y - oy)), cap = Math.atan2(e.r * 0.6, d);
      return U.clamp((Math.random() - 0.5) * spread, -cap, cap);
    },
    // a gun shot: aim from the barrel tip (which moves with the pose / angle), so the round flies at the target
    // and not parallel to a line from the body centre. Returns { a, m } (angle, muzzle point).
    gunAim(p, e, speed, spread) {
      let a = this.aimAt(p.x, p.y, e, speed), m;
      for (let i = 0; i < 2; i++) { m = RS.Render.muzzlePos(p, a); a = this.aimAt(m.x, m.y, e, speed); }
      m = RS.Render.muzzlePos(p, a);
      return { a: a + this.aimJitter(m.x, m.y, e, spread || 0), m };
    },
    // weapons only ever pick enemies you can see: inside the camera view (a few px in from the edge)
    seen(e) { return this.onScreen(e.x, e.y, -8); },
    nearestSeen(x, y, maxR, skip) {
      let best = null, bd = maxR * maxR;
      for (const e of this.enemies.list) {
        if (e.dead || e.spawning > 0 || !this.seen(e)) continue;
        if (skip && (skip === e || (Array.isArray(skip) && skip.includes(e.id)))) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    // Aim in the direction the hero faces (p.aimX / aimY = the last move heading). Aim assist only inside a cone
    // of +-cone rad around it: the best visible enemy there (close and near the centre line). Enemies on screen but
    // none in the cone: { t: null, a } fires straight ahead, so positioning and facing matter. Nothing visible in
    // range: null, the weapon holds fire.
    facingAim(p, range, cone) {
      const fa = Math.atan2(p.aimY, p.aimX);
      let best = null, bs = Infinity, any = false;
      for (const e of this.enemies.list) {
        if (e.dead || e.spawning > 0 || e.hp <= 0 || (e.z || 0) > 60 || !this.seen(e)) continue;
        const dx = e.x - p.x, dy = e.y - this.bodyLift(e) - p.y, d = Math.hypot(dx, dy);
        if (d > range) continue;
        any = true;
        const da = Math.abs(U.angDiff(fa, Math.atan2(dy, dx)));
        if (da > cone + Math.atan2(e.r, Math.max(1, d))) continue;
        const sc = d * (1 + da * 1.2) * (e.boss ? 0.6 : 1) * ((e.pend || 0) >= e.hp ? 1.8 : 1); // skip the already doomed
        if (sc < bs) { bs = sc; best = e; }
      }
      if (best) return { t: best, a: this.aimAt(p.x, p.y, best, 0) };
      if (!any) return null;
      // standing still with nothing in front: plant and turn to the closest visible enemy (the body turns with it,
      // so there is never a walk one way / shoot the other moonwalk). On the move, shots stay straight ahead.
      if (!p.moving && p.dash.t <= 0) {
        const n = this.target(p.x, p.y, range * 0.75);
        if (n) {
          const a = this.aimAt(p.x, p.y, n, 0);
          p.aimX = Math.cos(a); p.aimY = Math.sin(a);
          if (Math.abs(p.aimX) > 0.15) p.facing = p.aimX < 0 ? -1 : 1;
          return { t: n, a };
        }
      }
      return { t: null, a: fa };
    },
    // nearest valid target: alive, spawned in, on screen, not airborne out of reach
    // nearest enemy that still needs a hit (shots already in flight would not kill it); if every enemy in range is
    // already covered, the plain nearest one
    target(x, y, maxR, skip) {
      let best = null, bd = maxR * maxR, any = null, ad = bd;
      const list = this.enemies.list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.spawning > 0 || e.hp <= 0 || (e.z || 0) > 60 || !this.seen(e)) continue;
        if (skip && (skip === e || (Array.isArray(skip) && skip.includes(e.id)))) continue;
        // a boss counts as a bit closer than it is, so in a thick crowd the guns still work on it
        const dx = e.x - x, dy = e.y - this.bodyLift(e) - y, d = (dx * dx + dy * dy) * (e.boss ? 0.45 : 1);
        if (d < ad) { ad = d; any = e; }
        if (d < bd && (e.pend || 0) < e.hp) { bd = d; best = e; }
      }
      return best || any;
    },
    randomNear(x, y, r, skip) { // weapons only: random visible enemy in range
      const list = this.inRadius(x, y, r);
      const c = list.filter((e) => e !== skip && this.seen(e));
      return c.length ? c[Math.floor(Math.random() * c.length)] : null;
    },
    inRadius(x, y, r) {
      const out = [];
      this.grid.query(x, y, r, out);
      for (let i = out.length - 1; i >= 0; i--) if (out[i].spawning > 0) out.splice(i, 1);
      return out;
    },
    densest(x, y, r) {
      const cand = this.inRadius(x, y, r);
      if (!cand.length) return null;
      let best = null, bn = -1;
      for (let i = 0; i < 8; i++) {
        const e = cand[Math.floor(Math.random() * cand.length)];
        const n = this.inRadius(e.x, e.y, 90).length;
        if (n > bn) { bn = n; best = e; }
      }
      return best ? { x: best.x, y: best.y } : null;
    },
    heal(n) {
      const p = this.p;
      const amt = n * p.s.healMult;
      const before = p.hp;
      p.hp = Math.min(RS.Stash.cap(p), p.hp + amt); // overheal room from CHONK DRIP / GASSED
      this.healAcc = (this.healAcc || 0) + p.hp - before; // HOLY RAGE sears with it
      if (p.hp - before >= 1) { if (p.hp - before >= 5) FX.text(p.x, p.y - 30, '+' + Math.round(p.hp - before), '#9cff35', 14, { always: true }); this.sfx('heal'); } // small trickles (regen procs) heal without a number
    },
    vacuum(r) {
      const p = this.p;
      for (const k of this.pickups.list) {
        if (k.kind !== 'xp' && k.kind !== 'coin') continue;
        if (U.dist2(k.x, k.y, p.x, p.y) < r * r) k.attract = true;
      }
    },
    airhorn() {
      const p = this.p;
      FX.flash('#ffffff', 0.5); FX.shake(0.5); FX.glitch(0.3);
      FX.ring(p.x, p.y, 700, '#ffe14a', 0.6, 8);
      this.sfx('airhorn');
      for (const e of this.enemies.list) {
        if (e.dead || !this.onScreen(e.x, e.y, 40)) continue;
        this.damage(e, 60 + this.time * 0.15, { knock: 500, kx: e.x - p.x, ky: e.y - p.y, noCrit: true, src: 'airhorn' });
      }
    },
    freezeAll(t, silent) {
      for (const e of this.enemies.list) if (!e.dead) e.freezeT = Math.max(e.freezeT || 0, e.boss ? t * 0.35 : t);
      if (!silent) { FX.flash('#ffffff', 0.85); this.sfx('flash'); }
      else { FX.flash('#9aa3b2', 0.25); this.sfx('deadair'); }
    },
    addRunClout(n) { this.runClout += n; this.stats.coins += n; },
    // short freezes punctuate big moments; in a brawl they must not stack up into stutter, so small ones are rate
    // limited (boss phase / death freezes always play)
    recentDps() { const h = this.dmgHist || []; return h.length > 1 ? (h[h.length - 1] - h[0]) / (h.length - 1) : 0; },
    addHitstop(t) {
      if (t < 0.1 && this.time - (this.hitstopAt === undefined ? -9 : this.hitstopAt) < 0.9) return;
      this.hitstop = Math.max(this.hitstop, t); this.hitstopAt = this.time;
    },

    // ------------------------------------------------------------ challenges during the run
    checkRunChallenges() {
      const s = this.stats, t = this.time;
      if (t >= D.SLOT_WAVE * D.WAVE_LEN) this.unlockSlot();
      if (s.kills >= 100) this.challenge('kills100');
      if (s.kills >= 2000) this.challenge('kills2000');
      if (t >= 180) this.challenge('survive3');
      if (t >= 300) this.challenge('survive5');
      if (t >= 600) this.challenge('survive10');
      if (t >= 1200) this.challenge('survive20');
      if (t >= RS.Data.RUN_LENGTH) { this.challenge('survive30'); this.unlockNextMap(); }
      if (t >= 180 && s.firstHurt < 0) this.challenge('untouched');
      if (this.p.level >= 40) this.challenge('level40');
      if (this.p.thumbs.length >= 3) this.challenge('thumbs3');
      if (s.evolutions.length >= 1) this.challenge('evolve1');
      if (s.evolutions.length >= 3) this.challenge('evolve3');
    },
    challenge(id) {
      const S = RS.Save;
      if (S.hasChallenge(id)) return;
      const c = D.CHALLENGES.find((x) => x.id === id);
      if (!c || !D.challengeOffered(c)) return;
      S.data.challenges.push(id);
      S.addClout(c.reward);
      this.stats.challengeClout = (this.stats.challengeClout || 0) + c.reward;
      (this.stats.newChallenges = this.stats.newChallenges || []).push(c.name);
            if (id === 'boss_king' && S.unlock('cosmetics', 'mask_leaked')) (this.stats.unlocks = this.stats.unlocks || []).push('LEAKED mask');
      S.save();
      FX.banner('CHALLENGE: ' + c.name, '+' + c.reward + ' CL0UT', '#9cff35', 2.4);
      this.sfx('rare');
    },
    // clearing WAVE 15 opens the 4th weapon slot for good, and right away in this run
    unlockSlot() {
      if (!RS.Save.unlock('slots', 'slot4')) return;
      this.p.maxWeapons++;
      (this.stats.unlocks = this.stats.unlocks || []).push('4th weapon slot (WAVE ' + D.SLOT_WAVE + ' cleared)');
      RS.Save.save();
      FX.banner('4TH WEAPON SLOT UNLOCKED', 'WAVE ' + D.SLOT_WAVE + ' CLEARED · YOURS IN EVERY RUN NOW', '#9cff35', 3.2);
      this.sfx('evolve');
    },
    // 30:00 on a map opens the next one (NORMAL -> NIGHT -> STORM, D.MAPMODES[].after); once, then it stays open
    unlockNextMap() {
      const M = this.mapMode || D.MAPMODES.normal;
      const next = Object.values(D.MAPMODES).find((x) => x.after === M.id);
      if (!next || !RS.Save.unlock('maps', next.id)) return;
      (this.stats.unlocks = this.stats.unlocks || []).push(next.name + ' map (' + next.cash + '× CASH)');
      RS.Save.save();
      // 30:00 already shows its own banners (30:00, THE MAJOR LABEL, the challenge) and only 3 fit, so this one waits
      this.later(6, () => FX.banner('MAP UNLOCKED: ' + next.name, next.cash + '× CASH · PICK IT ON SELECT MAP', next.col, 3));
    },
    discover(kind, id) {
      if (RS.Save.discover(kind, id)) { this.stats.newDiscoveries++; return true; }
      return false;
    },

    // ------------------------------------------------------------ run end
    finishRun(victory, quit) {
      if (this.state === 'gameover') return;
      const reason = victory ? 'DEFEATED THE MAJOR LABEL' : quit ? 'QUIT THE RUN' : 'TAKEN OUT BY ' + (this.stats.lastHitBy || 'THE CROWD');
      const S = RS.Save, d = S.data, p = this.p, st = this.stats;
      if (this.time >= D.RUN_LENGTH) this.unlockNextMap(); // in case the run ends in the same frame it reached 30:00
      this.state = 'gameover';
      let mult = p.s.greed;
      for (const m of D.MODIFIERS) if (this.mods[m.id]) mult += m.clout;
      const base = Math.floor(this.time / 15) + Math.floor(st.kills / 150) + st.bossesKilled.length * 30 + Math.floor(p.level / 2) + st.newDiscoveries * 3;
      const MM = this.mapMode || D.MAPMODES.normal;
      const earned = Math.round((base + this.runClout * 0.5) * mult * MM.cash * (1 + (p.s.difficulty || 0))); // NIGHT pays x2, STORM x3; DEMON TAX
      S.addClout(earned);
      d.totalKills += st.kills;
      d.bestTime = Math.max(d.bestTime, this.time);
      d.bestKills = Math.max(d.bestKills, st.kills);
      d.bestTimeByChar[this.cfg.char] = Math.max(d.bestTimeByChar[this.cfg.char] || 0, this.time);
      if (victory) d.wins++;
      // the weapons this run picked up (not the starter): the next runs offer them a little less, so builds rotate
      const picked = p.weapons.filter((w) => !w.starter).map((w) => w.def.from || w.def.id);
      d.recentWeapons = [picked].concat(Array.isArray(d.recentWeapons) ? d.recentWeapons : []).slice(0, D.BUILD.recentRuns);
      S.save();
      this.results = {
        victory, reason, survived30: this.time >= D.RUN_LENGTH, coins: Math.round(this.runClout), stage: this.mods.nomercy ? 'NO MERCY' : 'NORMAL',
        waves: Math.min(D.WAVES, Math.floor(this.time / D.WAVE_LEN)), // waves cleared
        map: MM.id, mapName: MM.name, cash: MM.cash,
        time: this.time, kills: st.kills, level: p.level, damage: st.damage, bosses: st.bossesKilled.slice(),
        evolutions: st.evolutions.slice(), items: st.itemsCollected, clout: earned, challengeClout: st.challengeClout || 0,
        challenges: (st.newChallenges || []).slice(), unlocks: (st.unlocks || []).slice(), discoveries: st.newDiscoveries,
        weapons: p.weapons.map((w) => ({ id: w.def.id, name: w.def.name, level: w.level, evolved: !!w.def.evolved, dmg: w.dmgDealt, kills: w.kills, mods: w.mods || 0 })),
        tapes: p.tapes.map((t) => ({ id: t.id, name: t.def.name, level: t.level })),
        passives: p.passives.map((x) => ({ id: x.def.id, name: x.def.name, level: x.level })),
        thumbs: p.thumbs.map((t) => t.def.id), stash: p.stashOrder.map((id) => ({ id, name: D.STASH[id].name, n: p.stash[id], rarity: D.STASH[id].rarity })), synergies: p.syn.map((sy) => sy.name), char: this.cfg.char, arena: this.arenaDef.name, damageTaken: st.damageTaken,
      };
      RS.Audio.music.play('menu');
      RS.Audio.music.setIntensity(0);
      RS.Audio.muffle(false);
      RS.Overlays.results(this.results);
    },
    quitToMenu() {
      this.state = 'menu';
      RS.Overlays.hide();
      RS.Audio.muffle(false);
      RS.Audio.music.play('menu');
      RS.Audio.music.setIntensity(0);
      RS.Screens.show('main');
    },
  };

  RS.Game = G;
})(window.RS);
