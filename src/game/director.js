'use strict';
// Spawn director: enemy waves, elites, THE LEAK, arena events, boss schedule, scaling past 30:00.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data;

  // the roster, curves and boss schedule live in data/timeline.js. Ordered by unlock time: elites are picked from
  // the newest few. `halluc` weights scale with the trip level.
  const TYPES = D.ROSTER, TL = D.TIMELINE, EXEC = TYPES.find((t) => t.id === 'exec');
  const SHOOTER_CAP = { stalker: (m) => Math.min(6, 3 + Math.floor(m / 4)), dancer: (m) => Math.min(5, 2 + Math.floor(m / 5)) };
  const EVENTS = ['horde', 'cypher', 'supply', 'surge', 'rush', 'horde', 'supply'];

  const Director = {
    reset(G) {
      this.acc = 0;
      this.nextElite = U.rand(65, 80); // first chest carrier just after the opening minute
      this.nextLeak = 100;
      this.nextEvent = U.rand(100, 120);
      this.nextWave = 35;
      this.rushT = 0;
      this.execT = -1e9;
      this.laneT = -1; this.laneA = 0;
      this.cypher = null;
      this.supply = null;
      this.warned = {};
      const mids = U.shuffle(['plant', 'algorithm']);
      this.final = false;
      this.schedule = D.BOSS_SCHEDULE.map((b) => ({ t: b.t, id: b.id || mids[b.pick], mul: b.mul, final: !!b.final }));
      this.lastEvents = [];
      this.seenTypes = new Set(['npc']);
      this.set = null; this.setIds = null; this.setT = 0; this.base = 'npc'; this.intro = new Map(); // enemy lineup
      this.threatN = 0; // THREAT LV called out so far (data/timeline.js)
      // short tips for the first few runs
      // three, spaced out, never while a crowd is in your face (see update)
      this.tips = RS.Save.data.runs <= 3 ? [
        [5, 'AIM BY MOVING', 'your guns fire the way you face'],
        [45, 'SPACE = DASH', 'brief invulnerability · F = character ability'],
        [150, 'EVOLVE YOUR WEAPONS', 'max a weapon + hold its partner item, then open a chest'],
      ] : [];
    },
    minutes(G) { return G.time / 60; },
    hpMul(G, noThreat) { // noThreat: a boss's summoned adds (the boss fight is sized from your DPS, not the clock)
      const t = G.time;
      let m = D.curve(TL.hp, t / 60) * G.arenaDef.hpMul * (G.mods.nomercy ? 1.6 : 1) * (G.mapMode ? G.mapMode.hp : 1);
      if (t > D.RUN_LENGTH) m *= 1 + (t - D.RUN_LENGTH) / 160; // past 30:00, while THE MAJOR LABEL still stands
      if (G.p && G.p.s.difficulty) m *= 1 + G.p.s.difficulty; // DEMON TAX / CURSED UP (stash)
      m *= D.mapEase(G, 'hp'); // NORMAL from 5:00 (data/arenas.js)
      if (!noThreat) m *= D.threat(G, 'hp'); // THREAT LV, a step every 4:00 (data/timeline.js)
      return m;
    },
    tierFor(G) {
      const m = G.time / 60;
      const t2 = D.curve(TL.tier2, m), t1 = D.curve(TL.tier1, m);
      const r = Math.random();
      if (r < t2) return 2;
      if (r < t2 + t1 * (1 - t2)) return 1;
      return 0;
    },
    // ----- lineup: the regular crowd comes from a few enemy types at a time (D.TIMELINE.types), not from everything
    // unlocked so far (playtest: at 5:00 ten kinds of attack shared the screen). The lineup changes every 60-80 s; a type
    // that has just unlocked always gets a slot (and keeps it for 45 s) so it is introduced on its own; every lineup
    // keeps one basic body (AGGRO FAN or CLIP FARMER), at most two hallucinations and at most one heavy type (SECURITY,
    // STRETCHED MAN, MOSH PIT BRUISER, GIANT SNEAKER: `heavy` in D.ROSTER). THE EXEC (a chest carrier) and
    // THE LEAK stay outside the count.
    lineup(G) {
      const m = G.time / 60, fav = G.trip ? G.trip.theme.fav : [];
      const open = TYPES.filter((t) => t.id !== 'exec' && m >= this.from(t, fav));
      const fresh = open.find((t) => !this.intro.has(t.id));
      if (this.set && G.time < this.setT && !fresh) return this.set;
      const bias = G.arenaDef.bias || {}, prev = this.set || [];
      const w = (t) => t.w(m) * (bias[t.id] || 1) * (t.halluc ? RS.Trip.weight(G, t.id) : 1) * (prev.includes(t) ? 0.35 : 1); // rotate
      const n = Math.round(D.curve(TL.types, m)), base = open.filter((t) => t.id === 'npc' || t.id === 'clip');
      let set = prev.filter((t) => G.time - this.intro.get(t.id) < 45); // still being introduced
      if (fresh) {
        // one heavy body per lineup: a newly unlocked heavy type replaces the one still being introduced (testers: SECURITY
        // and STRETCHED MAN unlock 30 s apart and together made a third of the 3:50-5:00 crowd; every early death)
        if (fresh.heavy) set = set.filter((t) => !t.heavy);
        set.push(fresh); this.intro.set(fresh.id, G.time);
      }
      if (!set.some((t) => base.includes(t))) set.push(U.weighted(base, (t) => t.w(m)));
      let pool = open.filter((t) => !set.includes(t));
      while (set.length < n && pool.length) {
        const two = set.filter((t) => t.halluc).length >= 2, heavy = set.some((t) => t.heavy);
        const c = U.weighted(pool.filter((t) => (!two || !t.halluc) && (!heavy || !t.heavy)), w);
        if (!c) break;
        set.push(c); pool = pool.filter((t) => t !== c);
      }
      this.set = set; this.setT = G.time + U.rand(60, 80);
      this.setIds = new Set(set.map((t) => t.id));
      if (this.setIds.has('smiley')) this.setIds.add('minismile'); // the halves a MELTING SMILEY splits into
      this.base = set.find((t) => base.includes(t)).id;
      return set;
    },
    inLineup(id) { return !this.setIds || this.setIds.has(id) || id === 'exec' || id === 'leak'; },
    // the run's favourite hallucinations show up earlier
    from(t, fav) { return t.from * (fav.includes(t.id) ? 0.8 : 1); },
    pickType(G) {
      const m = this.minutes(G);
      const bias = G.arenaDef.bias || {};
      const fav = G.trip ? G.trip.theme.fav : [];
      const pool = this.lineup(G).slice();
      // THE EXEC carries a chest, so it is rationed: one alive at a time and one per D.LOOT.execGap s. It used to join
      // every regular roll (~1 in 40 spawns at 7:00, 7+ chests a minute); slow and armored, they bunched up in the crowd
      // and a single blast emptied a pile of chests onto one spot
      if (m >= EXEC.from && G.time - this.execT >= D.LOOT.execGap && !this.alive(G, 'exec')) pool.push(EXEC);
      // a newly unlocked type fades in over ~45 s (a straggler or two first, then its normal share), so it arrives
      // naturally instead of all at once
      const c = U.weighted(pool, (t) => t.w(m) * U.clamp(0.08 + (m - this.from(t, fav)) / 0.75, 0.08, 1) * (bias[t.id] || 1) * (this.rushT > 0 && t.id === 'clip' ? 3 : 1) * (t.halluc ? RS.Trip.weight(G, t.id) : 1));
      if (c && SHOOTER_CAP[c.id] && this.alive(G, c.id) >= SHOOTER_CAP[c.id](m)) return this.base; // a few shooters, not a firing line
      if (c === EXEC) this.execT = G.time;
      if (c && this.seenTypes) this.seenTypes.add(c.id); // no banner: a new type just starts showing up (weight ramps in)
      return c ? c.id : this.base;
    },
    alive(G, id) { let n = 0; for (const e of G.enemies.list) if (!e.dead && e.type === id) n++; return n; },
    // ----- escape lane: the emptiest of 12 directions around the hero (enemies within 520 px, nearer ones count more;
    // a tie goes to the way you are heading), re-read twice a second. Regular spawns stay out of it and every closing
    // formation (SURROUNDED, rings, trip-peak rings) leaves it open, so there is always a way out (playtest 4:00-5:00:
    // full circles of spawns plus a ring closing in left nowhere to go)
    lane(G) {
      if (G.time - this.laneT < 0.5 && this.laneT <= G.time) return this.laneA;
      const p = G.p, N = 12, w = new Array(N).fill(0);
      let near = 0;
      for (const e of G.enemies.list) {
        if (e.dead || e.ghost) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > 520 * 520) continue;
        if (d2 < 320 * 320 && !e.boss) near++;
        const s = Math.floor(((Math.atan2(dy, dx) + U.TAU) % U.TAU) / U.TAU * N) % N;
        w[s] += 1 + 300 / (Math.sqrt(d2) + 60);
      }
      const head = Math.hypot(p.vx || 0, p.vy || 0) > 50 ? Math.atan2(p.vy, p.vx) : null;
      let best = 0, bs = 1e9;
      for (let s = 0; s < N; s++) {
        const a = (s + 0.5) / N * U.TAU, sc = w[s] + w[(s + 1) % N] * 0.5 + w[(s + N - 1) % N] * 0.5 + (head === null ? 0 : -0.6 * Math.cos(a - head));
        if (sc < bs) { bs = sc; best = a; }
      }
      this.laneT = G.time; this.laneA = best; this.laneCrowd = near; // enemies within 320 px (Game.updateEnemies keeps the door)
      return best;
    },
    inLane(G, a, half) { return Math.abs(U.angDiff(a, this.lane(G))) < (half || 0.45); },
    // the door is held open (enemies stay out of the lane) once the hero is crowded: 8+ enemies within 320 px
    doorOn(G) { this.lane(G); return (this.laneCrowd || 0) >= 8; },
    // a point an enemy wants to blink / dash to is in the open door: it has to pick another spot
    inDoor(G, x, y) { return this.doorOn(G) && this.inLane(G, Math.atan2(y - G.p.y, x - G.p.x), 0.7) && Math.hypot(x - G.p.x, y - G.p.y) < 360; },
    // off-screen spawn point inside the arena, never right on top of the player and never in the escape lane
    spawnPos(G, minD) {
      const p = G.p, A = G.arena, c = G.cam;
      const hw = c.vw / 2, hh = c.vh / 2; // just past the screen edge in that direction, not on the far diagonal circle
      minD = minD || 330;
      const sp = Math.hypot(p.vx || 0, p.vy || 0), ahead = sp > 60 ? Math.atan2(p.vy, p.vx) : null;
      for (let i = 0; i < 10; i++) {
        // running: 70% of spawns land in front of you (Vampire Survivors keeps the crowd ahead too), but off to the
        // sides of your line (0.35-1.35 rad), not straight into the path you are running
        const a = ahead !== null && Math.random() < 0.7 ? ahead + (Math.random() < 0.5 ? -1 : 1) * U.rand(0.35, 1.35) : U.rand(U.TAU);
        if (i < 8 && this.inLane(G, a)) continue;
        const ca = Math.abs(Math.cos(a)) || 1e-3, sa = Math.abs(Math.sin(a)) || 1e-3, r = Math.min(hw / ca, hh / sa) + U.rand(50, 130);
        const x = U.clamp(p.x + Math.cos(a) * r, 40, A.w - 40), y = U.clamp(p.y + Math.sin(a) * r, 40, A.h - 40);
        if (Math.hypot(x - p.x, y - p.y) < minD) continue;
        if (RS.Arena.solidAt(A, x, y, 16)) continue;
        return { x, y, tele: G.onScreen(x, y, 0) };
      }
      return null;
    },
    spawnOne(G, type, opts) {
      const pos = this.spawnPos(G);
      if (!pos) return null;
      return G.spawnEnemy(type, pos.x, pos.y, Object.assign({ tier: this.tierFor(G), hpMul: this.hpMul(G), telegraph: pos.tele }, opts || {}));
    },

    update(G, dt) {
      const t = G.time, p = G.p;
      const m = t / 60;
      if (this.tips.length && t >= this.tips[0][0] && !FX.banners.length && G.inRadius(p.x, p.y, 200).length < 6) { const tip = this.tips.shift(); FX.banner(tip[1], tip[2], '#9cff35', 3, true); }
      // ----- bosses (first: at 30:00 the final encounter shuts every regular spawn below off)
      for (const b of this.schedule) {
        if (!b.warned && t >= b.t - 4) { b.warned = true; FX.banner('⚠ INCOMING', D.BOSSES[b.id].name, '#ff2448', 3); G.sfx('warning'); }
        if (!b.spawned && t >= b.t) {
          b.spawned = true;
          if (b.final) this.startFinal(G);
          RS.Bosses.spawn(G, b.id, b.mul);
        }
      }
      if (this.final) return; // 30:00+: only THE MAJOR LABEL
      // ----- numbered waves (data/timeline.js): a new one every minute, the last seconds of each bring nobody new
      const wn = D.waveAt(t);
      if (wn !== G.waveNo) { G.waveNo = wn; if (wn > 1) G.sfx('chestTick'); }
      const tn = Math.floor(m / D.THREAT.every);
      if (tn > this.threatN) { this.threatN = tn; FX.banner('THREAT LV ' + tn, 'the crowd hits harder', '#ff2448', 2.2, true); }
      const rest = D.waveRest(t);
      if (rest) { this.acc = 0; this.updateCypher(G, dt); this.updateSupply(G, dt); RS.Trip.update(G, dt); return; }
      // ----- regular spawns (rates, caps and HP all come from D.TIMELINE)
      const MM = G.mapMode || D.MAPMODES.normal;
      let rate = D.curve(TL.rate, m) * MM.rate * (1 + 0.7 * (G.p.s.difficulty || 0)) * D.mapEase(G, 'rate') * D.threat(G, 'rate');
      if (G.bosses.length) rate *= 0.45;
      if (this.rushT > 0) { this.rushT -= dt; rate *= 2.2; }
      if (t > D.RUN_LENGTH) rate *= 1 + (t - D.RUN_LENGTH) / 600; // past 30:00
      const maxAlive = Math.min(560, D.curve(TL.maxAlive, m) * MM.cap * D.mapEase(G, 'cap') * D.threat(G, 'cap'));
      this.acc += rate * dt;
      let guard = 0;
      while (this.acc >= 1 && guard++ < 20) {
        this.acc -= 1;
        if (G.enemies.count >= maxAlive) { this.acc = Math.min(this.acc, 3); break; }
        this.spawnOne(G, this.pickType(G));
      }
      // ----- elites
      if (t >= this.nextElite) {
        this.nextElite = t + D.curve(TL.eliteGap, m) * U.rand(0.85, 1.15) * (G.bosses.length ? 1.5 : 1) * MM.eliteGap;
        // an elite of one of the lineup's own types (not the basic body when there is anything else)
        const pool = this.lineup(G).map((x) => x.id).filter((id) => id !== this.base);
        // from 20:00 elites come in pairs (only one of them carries the chest, see noChest)
        for (let i = 0; i < (m >= 20 ? 2 : 1); i++) {
          const type = pool.length ? U.pick(pool) : this.base;
          this.spawnOne(G, type, { elite: true, noChest: i > 0 }); // no banner: the gold rim and chest pointer say enough
        }
      }
      // ----- the leak
      if (t >= this.nextLeak) {
        this.nextLeak = t + 40;
        const ch = G.flags.leakBoost ? 0.75 : 0.25;
        if (Math.random() < ch && !G.enemies.list.some((e) => e.type === 'leak' && !e.dead)) {
          const a = U.rand(U.TAU);
          const x = U.clamp(p.x + Math.cos(a) * 380, 80, G.arena.w - 80), y = U.clamp(p.y + Math.sin(a) * 380, 80, G.arena.h - 80);
          G.spawnEnemy('leak', x, y, { hpMul: this.hpMul(G) * 0.6, telegraph: true });
          FX.banner('LEAK DETECTED', 'catch it before it vanishes (15s)', '#ffcf3f', 2, true);
          G.sfx('warning');
        }
      }
      // ----- attack waves (Vampire Survivors style swarms that cross the screen)
      if (t >= this.nextWave && !G.bosses.length) {
        this.nextWave = t + D.curve(TL.waveGap, m) * U.rand(0.85, 1.15);
        const kinds = D.step(D.WAVE_KINDS, m);
        let k = U.pick(kinds);
        if (k === this.lastWave) k = U.pick(kinds);
        this.lastWave = k;
        this.wave(G, k);
      }
      // ----- events
      if (t >= this.nextEvent && !G.bosses.length) {
        this.nextEvent = t + D.curve(TL.eventGap, m) * U.rand(0.9, 1.15);
        let ev = U.pick(EVENTS.filter((e) => !this.lastEvents.includes(e)));
        if (!ev) ev = 'horde';
        this.lastEvents.push(ev); if (this.lastEvents.length > 2) this.lastEvents.shift();
        this.startEvent(G, ev);
      }
      this.updateCypher(G, dt);
      this.updateSupply(G, dt);
      RS.Trip.update(G, dt);
    },
    // 30:00: the regular crowd scatters (no drops), events end, and the run's last fight begins
    startFinal(G) {
      this.final = true;
      this.cypher = null; this.supply = null; this.rushT = 0;
      for (const e of G.enemies.list) {
        if (e.dead || e.boss) continue;
        e.dead = true; e.hp = 0;
        if (G.onScreen(e.x, e.y, 60) && FX.room(1)) FX.pop(e.x, e.y - e.r * 0.3, e.r * 1.4, ['#101015', '#ff2448'], 'glitch');
      }
      G.eshots.clear(); G.teles.length = 0;
      FX.banner('30:00', 'THE MAJOR LABEL WANTS ITS MONEY BACK', '#ff2448', 3);
    },

    startEvent(G, ev) {
      const p = G.p;
      if (ev === 'horde') {
        // a circle with a door: the escape lane stays open (~75 deg), and the size follows the formation curve
        // (it ignored it: 34 bodies at 4:00, the worst trap of the 4:00-5:00 stretch)
        const n = Math.round(Math.min(60, 22 + Math.floor(G.time / 20)) * Math.max(0.65, D.curve(TL.waveSize, G.time / 60)));
        const type = G.time > 240 ? U.pick(['npc', 'clip', 'glitch']) : 'npc';
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU;
          if (this.inLane(G, a, 0.65)) continue;
          const x = U.clamp(p.x + Math.cos(a) * 520, 30, G.arena.w - 30), y = U.clamp(p.y + Math.sin(a) * 420, 30, G.arena.h - 30);
          G.spawnEnemy(type, x, y, { tier: this.tierFor(G), hpMul: this.hpMul(G), telegraph: true });
        }
        FX.banner('SURROUNDED', '', '#ff2448', 1.6, true);
        G.sfx('warning');
      } else if (ev === 'cypher') {
        const pos = this.eventPos(G, 520, 760);
        this.cypher = { x: pos.x, y: pos.y, r: 110, t: 0, life: 40, state: 'wait', ids: [] };
        FX.banner('CYPHER CIRCLE', 'step inside to challenge the elites', '#ffcf3f', 2.4, true);
        G.sfx('rare');
      } else if (ev === 'supply') {
        const pos = this.eventPos(G, 480, 700);
        this.supply = { x: pos.x, y: pos.y, t: 5 };
        FX.banner('SUPPLY DROP', '', '#e3ece6', 1.8, true);
        G.sfx('warning');
      } else if (ev === 'surge') {
        G.surgeT = 20;
        RS.Arena.surge(G);
        FX.banner('POWER SURGE', 'enemies faster', '#ffe14a', 1.8, true);
        G.sfx('zap');
      } else if (ev === 'rush') {
        this.rushT = 20;
        FX.banner('RUSH HOUR', '', '#ff7a1a', 1.8, true);
        G.sfx('warning');
      }
    },
    // formations. All of them come from where you are heading and aim at where you will be, so running away
    // from a wave just runs you into it:
    //   'stream' = a fast column of clip farmers that steers toward you until it has passed (dodge sideways or dash)
    //   'pack'   = a loose swarm that hunts you, flowing around like a flock
    //   'wall'   = a line of fans wider than the screen marching at you (cut through it)
    //   'pincer' = two walls from opposite sides
    //   'ring'   = a full circle closing in
    wave(G, kind) {
      const p = G.p, c = G.cam, A = G.arena;
      const sp = Math.hypot(p.vx || 0, p.vy || 0);
      const head = sp > 50 ? Math.atan2(p.vy, p.vx) : U.rand(U.TAU);
      const lvl = this.hpMul(G) * 0.8, tier = this.tierFor(G), m = this.minutes(G);
      const R = Math.hypot(c.vw, c.vh) / 2 + 60;
      const inA = (x, y) => x > 30 && y > 30 && x < A.w - 30 && y < A.h - 30;
      const make = (type, x, y, o) => {
        if (!inA(x, y)) return null;
        return G.spawnEnemy(type, x, y, Object.assign({ tier, hpMul: lvl }, o));
      };
      // melee bodies for walls and rings come from the timeline (heavier types later) and must be in the current lineup
      // (else the lineup's basic body); sizes scale with waveSize
      this.lineup(G);
      const inSet = (id) => this.setIds.has(id);
      let melee = D.step(D.WAVE_MELEE, m).filter(inSet);
      if (!melee.length) melee = [this.base];
      const fodder = inSet('clip') ? 'clip' : this.base, ws = D.curve(TL.waveSize, m);
      const size = (cap, base) => Math.round(Math.min(cap, base) * ws);
      if (kind === 'stream') {
        const n = size(44, 12 + Math.floor(G.time / 13));
        // starts ahead of you, slightly off your line; leads your position by the time it takes to arrive
        const a = head + U.rand(-0.5, 0.5), sx = p.x + Math.cos(a) * R, sy = p.y + Math.sin(a) * R;
        const spd = 290, eta = R / spd;
        const tx = p.x + (p.vx || 0) * eta * 0.8, ty = p.y + (p.vy || 0) * eta * 0.8;
        const dir = Math.atan2(ty - sy, tx - sx), dx = Math.cos(dir), dy = Math.sin(dir);
        for (let i = 0; i < n; i++) {
          const lag = i * 24 + U.rand(-6, 6), jit = U.rand(-40, 40);
          const e = make(fodder, sx - dx * lag - dy * jit, sy - dy * lag + dx * jit, { ai: 'stream', dirX: dx, dirY: dy, ttl: 10 });
          if (e) { e.spd = spd * U.rand(0.95, 1.05); e.facing = dx < 0 ? -1 : 1; e.turn = 1.1; }
        }
      } else if (kind === 'pack') {
        const n = size(40, 8 + Math.floor(G.time / 11)); // 18 at 1:50 (a weak early build drowned in 24)
        const a = head + U.rand(-0.7, 0.7), sx = p.x + Math.cos(a) * R, sy = p.y + Math.sin(a) * R;
        const type = m >= 1.3 && Math.random() < 0.5 && inSet('minismile') ? 'minismile' : fodder;
        for (let i = 0; i < n; i++) {
          const r = Math.sqrt(Math.random()) * 90, b = U.rand(U.TAU);
          const e = make(type, sx + Math.cos(b) * r, sy + Math.sin(b) * r, { ai: 'pack', ttl: 22 });
          if (e) { e.spd = (type === 'clip' ? 172 : 182) * U.rand(0.9, 1.1); e.ph = U.rand(U.TAU); }
        }
      } else if (kind === 'ring') {
        const n = size(52, 16 + Math.floor(G.time / 12)); // 31 at 3:00, 41 at 5:00 (was 38 already at 2:00)
        const rx = c.vw / 2 + 70, ry = c.vh / 2 + 70;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU;
          if (this.inLane(G, a, 0.6)) continue; // the ring closes with a gap in it
          const e = make(U.pick(melee), U.clamp(p.x + Math.cos(a) * rx, 40, A.w - 40), U.clamp(p.y + Math.sin(a) * ry, 40, A.h - 40), { ai: 'close', ttl: 24 });
          if (e) e.spd = 70;
        }
      } else {
        // walls face you from your heading (pincer: also from behind), 1.8x the screen wide, bending slowly toward you
        const sides = kind === 'pincer' ? [head, head + Math.PI] : [head + U.rand(-0.3, 0.3)];
        const type = U.pick(melee), heavy = type === 'guard' || type === 'bruiser';
        const n = Math.round(size(34, 16 + Math.floor(G.time / 22)) * (heavy ? 0.5 : 1)), span = Math.max(c.vw, c.vh) * 1.8;
        for (const a of sides) {
          const cx = p.x + Math.cos(a) * R, cy = p.y + Math.sin(a) * R, dx = -Math.cos(a), dy = -Math.sin(a);
          for (let i = 0; i < n; i++) {
            const o = -span / 2 + (i / (n - 1)) * span;
            const e = make(type, cx - dy * o, cy + dx * o, { ai: 'stream', dirX: dx, dirY: dy, ttl: 16 });
            if (e) { e.spd = 105 * U.rand(0.95, 1.05); e.facing = dx < 0 ? -1 : 1; e.turn = 0.28; }
          }
        }
      }
      G.sfx('warning');
    },
    eventPos(G, a, b) {
      const p = G.p;
      for (let i = 0; i < 20; i++) {
        const ang = U.rand(U.TAU), r = U.rand(a, b);
        const x = U.clamp(p.x + Math.cos(ang) * r, 200, G.arena.w - 200), y = U.clamp(p.y + Math.sin(ang) * r, 200, G.arena.h - 200);
        if (!RS.Arena.solidAt(G.arena, x, y, 60)) return { x, y };
      }
      return { x: G.arena.w / 2, y: G.arena.h / 2 };
    },
    updateCypher(G, dt) {
      const c = this.cypher;
      if (!c) return;
      const p = G.p;
      c.life -= dt;
      if (c.state === 'wait') {
        const inside = Math.hypot(p.x - c.x, p.y - c.y) < c.r;
        c.t = inside ? c.t + dt : Math.max(0, c.t - dt);
        if (c.t >= 2.5) {
          c.state = 'fight';
          const m = this.minutes(G);
          const pool = this.lineup(G).map((x) => x.id); // the circle's elites come from the current lineup too
          const n = 4 + Math.min(4, Math.floor(m / 3));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * U.TAU;
            // cypher elites carry no chests of their own: the circle pays out once, with the legendary chest
            const e = G.spawnEnemy(U.pick(pool), c.x + Math.cos(a) * 220, c.y + Math.sin(a) * 220, { elite: true, noChest: true, tier: this.tierFor(G), hpMul: this.hpMul(G) * 0.6, telegraph: true });
            c.ids.push(e);
          }
          G.sfx('boss');
        } else if (c.life <= 0) this.cypher = null;
      } else if (c.state === 'fight') {
        if (c.ids.every((e) => e.dead)) {
          G.dropChest(c.x, c.y, 'legendary');
          G.stats.cypher++;
          G.challenge('cypher');
          FX.banner('CYPHER WON', '', '#ffcf3f', 1.8, true);
          G.sfx('win');
          this.cypher = null;
        }
      }
    },
    updateSupply(G, dt) {
      const s = this.supply;
      if (!s) return;
      s.t -= dt;
      if (s.t <= 0) {
        this.supply = null;
        FX.shake(0.3); FX.ring(s.x, s.y, 140, '#e3ece6', 0.5, 6, 0.3);
        G.sfx('slam');
        G.dropChest(s.x, s.y, 'supply');
        G.dropConsumable(s.x + 30, s.y);
        G.dropConsumable(s.x - 30, s.y);
        G.dropCoin(s.x, s.y, 6);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * U.TAU;
          G.spawnEnemy(this.pickType(G), s.x + Math.cos(a) * 160, s.y + Math.sin(a) * 160, { tier: this.tierFor(G), hpMul: this.hpMul(G), telegraph: true });
        }
      }
    },
  };

  RS.Director = Director;
})(window.RS);
