'use strict';
// Weapons runtime, damage pipeline, projectiles, zones, enemy shots, telegraphed attacks, player damage.
(function (RS) {
  const ESHOT_CAP = 22, FIRE_TOK_MAX = 6; // live regular enemy shots / burst size of the shared fire budget
  const U = RS.U, FX = RS.FX, D = RS.Data;
  const RES = { amount: 0, crit: false, killed: false };
  const NOTEMP = { dmg: 1, cd: 1, area: 1, amount: 0 };
  const NOMOD = { dmg: 1, cd: 1, area: 1, amount: 0, pierce: 0, bounce: 0, chains: 0, reach: 1, dur: 1, crit: 0 };
  const TMP = [];
  const ZONE_CAP = 10; // lasting zones one weapon may have on the floor at once (Game.zone)
  // PRODUCER TAG shouts (fictional producers; DPLDS made this game)
  // kill-count milestones, announced as follower counts
  const FOLLOW = [[100, '100 FOLLOWERS', 'MOM FOLLOWED TOO'], [1000, '1K FOLLOWERS', 'BUYING A RING LIGHT'], [5000, '5K FOLLOWERS', 'FAN PAGES STARTED'],
    [10000, '10K FOLLOWERS', 'VERIFIED (NOT REALLY)'], [25000, '25K FOLLOWERS', 'THE LABEL IS WATCHING'], [40000, '40K FOLLOWERS', 'TOO BIG FOR THE UNDERGROUND'], [Infinity]];
  const TAGS = ['DPLDS ON THE BEAT', 'SCHMUNK ON THE TRACK', 'TURN THE 808 UP', 'RUN IT BACK', 'NO MIXING NEEDED', 'WE OUTSIDE', 'LOUDER IN THE CAR', 'TAGGED'];
  // does the moving point (x0,y0)->(x1,y1) come within R of the vertical segment x=cx, y in [top, bot]?
  function segHitsCapsule(x0, y0, x1, y1, cx, top, bot, R) {
    const n = Math.min(8, Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(4, R * 0.6))));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      const dy = y < top ? y - top : y > bot ? y - bot : 0, dx = x - cx;
      if (dx * dx + dy * dy <= R * R) return true;
    }
    return false;
  }

  Object.assign(RS.Game, {
    // ------------------------------------------------------------ weapons
    makeWeapon(id) {
      const def = D.WEAPONS[id];
      // bonus: level-up rarity bonuses and weapon MODS (data/build.js); they stay through an evolution
      const w = { uid: this.uid++, def, level: 1, ls: {}, S: {}, t: 0.35, mods: 0, gotLevel: 0,
        bonus: { dmg: 1, cd: 1, area: 1, amount: 0, reach: 0, dur: 0, crit: 0, pierce: 0, bounce: 0, chains: 0, fxC: 0 },
        temp: null, tempT: 0, thumbDmg: 1, thumbCd: 1, dmgDealt: 0, kills: 0 };
      this.computeLs(w);
      return w;
    },
    computeLs(w) {
      const ls = Object.assign({}, w.def.base);
      for (let i = 0; i < w.level - 1 && i < w.def.lv.length; i++) {
        const delta = w.def.lv[i][0];
        for (const k in delta) ls[k] = (ls[k] || 0) + delta[k];
      }
      w.ls = ls;
    },
    levelWeapon(w, n) {
      const from = w.level;
      w.level = Math.min(w.def.max, w.level + n);
      this.computeLs(w);
      if (w.level > from && this.p) RS.Stash.onWeaponLevel(this, w, w.level - from); // HEAVY METAL
    },
    resolve(w, p) {
      const ls = w.ls, s = p.s, S = w.S, def = w.def, b = w.bonus;
      for (const k in ls) S[k] = ls[k];
      const t = w.temp || NOTEMP, m = s.wmods[def.from || def.id] || NOMOD; // m: weapon synergies (data/build.js)
      S.dmg = (ls.dmg || 0) * b.dmg * t.dmg * (w.thumbDmg || 1) * m.dmg;
      S.cd = Math.max(0.1, (ls.cd || 1) * s.cooldown * b.cd * t.cd * (w.thumbCd || 1) * m.cd);
      S.amount = Math.max(1, Math.round((ls.amount || 1) + s.amount + b.amount + t.amount + m.amount));
      // at most 2.6x a weapon's size: radii scale the covered ground with the square, and a stacked sonic / area build
      // used to blanket the whole screen (build bench)
      S.area = Math.min(2.6, (ls.area || 1) * s.area * b.area * t.area * m.area * (def.sonic ? s.sonicArea : 1));
      // RANGE mods: projectile speed (bullets fly a fixed time, so further), melee / strike range, chain jump
      const reach = (1 + b.reach) * m.reach;
      S.speed = (ls.speed || 0) * s.projSpeed * (ls.speed > 50 ? reach : 1);
      if (def.persistent && ls.hitCd) { S.speed /= b.cd * m.cd; S.hitCd = ls.hitCd * b.cd * m.cd; } // orbits: attack speed = spin and hit rate
      if (ls.range) S.range = ls.range * reach;
      if (ls.jump) S.jump = ls.jump * reach;
      // at most 2.5x a weapon's duration: DURATION MODS, TAPE and synergies used to stretch zones to ~4x, so they piled up
      S.dur = (ls.dur || 0) * Math.min(2.5, s.duration * (1 + b.dur) * m.dur);
      S.knock = ls.knock || 0;
      S.crit = (ls.crit || 0) + b.crit + m.crit;
      if (ls.pierce !== undefined && ls.pierce < 50) S.pierce = ls.pierce + s.pierce + b.pierce + m.pierce; // STUDIO MIC (not the endless-pierce weapons)
      if (ls.bounce !== undefined) S.bounce = ls.bounce + b.bounce + m.bounce;
      if (ls.chains !== undefined) S.chains = ls.chains + b.chains + m.chains;
      return S;
    },
    updateWeapon(w, p, dt) {
      if (w.tempT > 0) { w.tempT -= dt; if (w.tempT <= 0) { w.temp = null; w.tempName = ''; } }
      const S = this.resolve(w, p);
      const def = w.def;
      if (def.update) def.update(w, p, this, S, dt);
      if (def.fire && !def.persistent) {
        w.t -= dt;
        if (w.t <= 0) {
          w.t = S.cd; w.cdMax = S.cd; // HUD reload ring
          this.fireWeapon(w, p, S);
        }
      }
    },
    fireWeapon(w, p, S) {
      if (p.cloakArm > 0) { // OPËM CLOAK: the first shot after a dash / dodge
        w.def.fire(w, p, this, Object.assign({}, S, { dmg: S.dmg * p.cloakArm }));
        p.cloakArm = 0;
        FX.burst(p.x, p.y - 24, ['#cfd6e3', '#ffffff', '#0b0910'], 6, 160, { kind: 'line', life: 0.2 });
      } else w.def.fire(w, p, this, S);
      if (p.s.echo > 0 && Math.random() < p.s.echo) {
        const E = Object.assign({}, S, { dmg: S.dmg * p.s.echoPow }); // a full copy at 50% damage (80% at GLITCHED III); it used to halve the amount too
        this.later(0.16, () => { if (this.p.weapons.includes(w)) { w.def.fire(w, p, this, E); FX.glitch(0.05); } });
      }
    },
    canEvolve(w, p) {
      const def = w.def;
      if (def.evolved || !def.evo || w.level < def.max) return false;
      return !!p.hasPassive(def.evoWith);
    },
    evolveWeapon(w) {
      const ndef = D.WEAPONS[w.def.evo];
      w.def = ndef; w.level = 1;
      w.orbs = null; w.clouds = null; w.t = 0.2;
      this.computeLs(w);
      this.stats.evolutions.push(ndef.id);
      const isNew = this.discover('evos', ndef.id);
      FX.banner('EVOLUTION', ndef.name + (isNew ? '  ·  NEW RECIPE' : ''), '#ff2448', 3);
      FX.flash('#ff2448', 0.45); FX.shake(0.4); FX.glitch(0.4);
      this.sfx('evolve');
      return ndef;
    },
    giveRandomWeapon(level) {
      const p = this.p;
      const P = RS.Progression, pool = P.weaponPool(p).filter((id) => !p.hasWeapon(id) && !p.banished.has(id));
      if (!pool.length || p.weapons.length >= p.maxWeapons) return;
      const w = p.addWeapon(U.weighted(pool, (id) => P.freshness(id))); // FEATURE VERSE: same run-to-run variety as the offers
      this.levelWeapon(w, (level || 1) - 1);
    },

    // ------------------------------------------------------------ damage
    damage(e, base, o) {
      o = o || {};
      RES.amount = 0; RES.crit = false; RES.killed = false;
      if (!e || e.dead || e.spawning > 0) return RES;
      const p = this.p, s = p.s;
      let dmg = base;
      // o.flat: stash procs built from a hit that already went through all of this (poison, explosions, BONK...)
      if (!o.flat) {
        dmg *= s.might;
        if (o.sonic) dmg *= s.sonicDmg;
        if (p.movingT > 1) dmg *= 1 + s.momentumDmg;
        if (p.highGround) dmg *= 1.15;
        if (!o.skipThumbs) for (const th of p.thumbs) if (th.def.dmgMul) dmg *= th.def.dmgMul(p, this, e, o, th.st);
        if (p.stashH.mul.length) dmg *= RS.Stash.mul(this, p, e, o);
      }
      let vul = 1;
      if (e.vulnT > 0) vul += e.vulnAmt;
      if (e.distortT > 0) vul += e.distort * 0.08;
      if (s.reverb > 0 && e.slowT > 0) vul += s.reverb; // SLOWED + REVERB
      if (s.bossDmg > 0 && (e.boss || e.elite)) vul += s.bossDmg; // HEADLINER
      dmg *= vul;
      let crit = false, mega = false;
      if (!o.noCrit) {
        const cc = s.critChance + (o.crit || 0);
        if (Math.random() < cc) {
          crit = true; dmg *= s.critMult;
          // BIG FORK: a megacrit applies crit damage twice; crit chance past 100% counts toward it
          const mc = s.megaChance > 0 ? s.megaChance + Math.max(0, cc - 1) : 0;
          if (mc > 0 && Math.random() < mc) { mega = true; dmg *= s.critMult; }
        }
      }
      if (e.armor) dmg *= 1 - e.armor;
      if (e.boss && e.shieldUp) dmg *= 0.25;
      // a boss fight that runs past its target length wears the boss down (+100% damage taken per 12 s over), so a
      // build that barely touches it (area weapons in a thick crowd) still finishes it in reasonable time
      if (e.boss && e.fight) dmg *= 1 + Math.max(0, this.time - e.spawnT - e.fight) / 12;
      dmg *= 0.92 + Math.random() * 0.16;
      if (dmg < 0.5) dmg = 0.5;
      e.hp -= dmg;
      e.flash = 0.09;
      e.lastHit = this.time;
      this.stats.damage += dmg;
      if (o.w) o.w.dmgDealt += dmg;
      // knockback
      let kb = (o.knock || 0) * s.knockback;
      for (const th of p.thumbs) if (th.def.knockMul) kb *= th.def.knockMul(o);
      if (s.knockProc > 0 && Math.random() < s.knockProc) kb += 260;
      if (kb > 0 && !e.boss && !e.anchored) {
        let kx = o.kx, ky = o.ky;
        if (kx === undefined) { kx = e.x - p.x; ky = e.y - p.y; }
        const l = Math.hypot(kx, ky) || 1;
        const f = kb / (e.mass || 1);
        e.kvx += (kx / l) * f; e.kvy += (ky / l) * f;
      }
      if (o.freezeOnCrit && crit) { e.slowT = 1.5; e.slowAmt = 0.8; e.iceT = 1.5; }
      if (o.sonic && s.sonicSlow && !e.boss) { e.slowT = Math.max(e.slowT, 0.8); e.slowAmt = Math.max(e.slowAmt, 0.15); } // LOUD PACK III
      if (o.distort) { e.distort = Math.min(10, (e.distort || 0) + 1); e.distortT = 4; }
      // feedback
      const col = mega ? '#d58cff' : crit ? '#ffe14a' : o.color || (o.sonic ? '#d6ffb0' : '#ffffff');
      if (crit) FX.text(e.x, e.y - e.r - 6, (mega ? 'MEGA ' : '') + (dmg < 10 ? (Math.round(dmg * 10) / 10).toString().replace(/\.0$/, '') : Math.round(dmg)), col, mega ? 20 : 17, { crit });
      else if (!o.quiet || FX.numN < 4) FX.dmgText(e, dmg, col, 12); // DoT / proc ticks only show while the fight is quiet
      if (crit) {
        this.sfx('crit');
        if (p.stashH.crit.length) RS.Stash.onCrit(this, p, e, dmg);
        FX.burst(e.x, e.y, ['#ffe14a', '#ffffff'], 3, 180, { kind: 'line', life: 0.18 });
        for (const th of p.thumbs) if (th.def.onCrit && !o.skipThumbs) th.def.onCrit(p, this, e, dmg, th.st);
        if (p.flags.grillz && p.grillzHeal > 0 && p.hp < RS.Stash.cap(p)) { p.grillzHeal--; RS.Stash.heal(this, 1, true); }
        if (s.critCoin && Math.random() < s.critCoin) this.dropCoin(e.x, e.y, 1); // DRIPPED IN ICE
        // DEADEYE III: a crit can land twice (the second hit at half, never a crit itself)
        if (s.critEcho && !o.echoHit && e.hp > 0 && Math.random() < s.critEcho) this.damage(e, base * 0.6 * (o.sonic ? s.sonicDmg : 1), { w: o.w, noCrit: true, skipThumbs: true, echoHit: true, color: '#fff3b0' });
      } else if (!o.quiet) this.sfx('hit');
      if (e.boss && dmg > 0) { if (crit && Math.random() < 0.3) this.addHitstop(0.025); }
      let killed = false;
      if (e.hp <= 0) { this.kill(e, o); killed = true; }
      // stash on-hit items: weapon damage only (procs carry no o.w, so they never chain into more procs)
      if (o.w && !o.echoHit && p.stashH.hit.length + (s.lifesteal > 0 ? 1 : 0)) RS.Stash.onHit(this, p, e, dmg, crit, o);
      if (o.w && !o.echoHit && o.w.bonus && o.w.bonus.fxC > 0) RS.Progression.weaponFx(this, p, e, dmg, o.w); // weapon SPECIAL mods
      RES.amount = dmg; RES.crit = crit; RES.killed = killed; // procs above reuse RES: set it last
      return RES;
    },
    aoe(x, y, r, dmg, o) {
      o = o || {};
      const list = this.inRadius(x, y, r);
      for (const e of list) {
        if (e.dead) continue;
        this.damage(e, dmg, { w: o.w, knock: o.knock, kx: e.x - x, ky: e.y - y, sonic: o.sonic, noCrit: o.noCrit, crit: o.crit, src: o.src, skipThumbs: o.skipThumbs, color: o.color });
      }
      if (o.ring) { FX.ring(x, y, r, o.ring, 0.32, 4, o.fill || 0); }
      // fireball drawn in code (boom: true = fire, 'boom_gold' / 'boom_toxic' pick the palette); a blast over the
      // explosion budget (FX.boom) skips its sparks, light and shake as well
      // a weapon's blast (o.w) always goes through the budget, however big its area bonuses made it: the "huge blasts
      // always show" rule is for boss slams and arena hazards (a late RAGE ROCKET at r 180 set off ~5 screen-filling
      // fireballs a second over the hero, 2026-10-27)
      if (o.boom && FX.boom(x, y, r, o.boom === 'boom_gold' ? 'gold' : o.boom === 'boom_toxic' ? 'toxic' : 'fire', !!o.w)) {
        FX.sparks(x, y, 0, 10, '#ffd27a', 520, Math.PI);
        this.lightsFrame.push({ x, y, r: r * 2.2, t: 0.25 });
        FX.shake(0.08, 0.3);
      }
      // destructible props in range
      RS.Arena.damageProps(this, x, y, r, dmg);
      return list.length;
    },

    kill(e, o) {
      if (e.dead) return;
      e.dead = true;
      e.hp = 0;
      const p = this.p, st = this.stats;
      st.kills++;
      if (st.kills >= FOLLOW[this.followers][0]) { const f = FOLLOW[this.followers++]; FX.banner(f[1], f[2], '#9cff35', 1.8, true); }
      if (o && o.w) o.w.kills++;
      const cols = e.def.cols || ['#ffffff'];
      // painted death burst (hallucinations pop into a purple skull); fewer coloured pixels on top keep the enemy's palette
      const big = e.elite || e.boss;
      // enemies with a painted sheet play their own death row and leave the body on the ground for a moment
      const painted = FX.corpse(e);
      FX.pop(e.x, e.y - e.r * 0.3, e.r * (big ? 2.4 : 1.7), e.def.halluc ? ['#ff6ad5', '#fff36a'] : [big ? '#ffd75a' : '#ff2448', '#ffffff'], e.def.halluc ? 'halluc' : 'death');
      FX.pixelDeath(e.x, e.y, cols, painted ? (big ? 12 : 3) : (big ? 26 : 9));
      if (Math.random() < 0.35) FX.smoke(e.x, e.y + e.r * 0.6, 1, e.r * 0.8, '#c9ccc4', { spd: 20, vy: -8, life: 0.6, grow: 1.4, alpha: 0.22 });
      RS.Arena.splat(this, e.x, e.y + e.r * 0.5, e.r);
      if (e.elite) { FX.ring(e.x, e.y, 90, '#ffd75a', 0.4, 5); this.addHitstop(0.06); FX.shake(0.2); }
      this.sfx('kill');
      if (e.boss) { RS.Bosses.onDeath(this, e); }
      else {
        let xp = e.xp * D.LOOT.xpMul * D.curve(D.TIMELINE.xp, this.time / 60); // every kill drops its own gem (data/timeline.js)
        if (e.elite || e.def.isElite) xp *= 1 + p.s.eliteBonus;
        if (p.s.difficulty) xp *= 1 + p.s.difficulty; // DEMON TAX pays back in XP
        xp *= D.mapEase(this, 'xp'); // NORMAL from 5:00: faster level-ups
        xp /= Math.sqrt(D.threat(this, 'rate')); // THREAT LV: the denser crowd pays only part of its extra bodies in XP
        if (this.mapMode && this.mapMode.xp) xp *= this.mapMode.xp; // NIGHT / STORM: more bodies, a bit less XP each
        this.dropXp(e.x, e.y, xp);
        this.rollDrops(e);
      }
      if (e.def.split && !e.boss && this.enemies.count < 560) { // melting smiley pops into smaller copies
        const sp = e.def.split;
        for (let i = 0; i < sp.n; i++) {
          const a = U.rand(U.TAU), n = this.spawnEnemy(sp.type, e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, { tier: e.tier, hpMul: RS.Director.hpMul(this) });
          n.kvx = Math.cos(a) * 260; n.kvy = Math.sin(a) * 260;
        }
        FX.burst(e.x, e.y, ['#ffe14a', '#ff6ad5', '#ffffff'], 10, 200);
      }
      if (e.def.halluc) FX.burst(e.x, e.y - 10, ['#ff6ad5', '#3ff2ff', '#fff36a', '#ffffff'], 8, 160, { size: 3, life: 0.5 });
      if (e.def.id === 'leak') { this.challenge('leak'); st.leaks++; }
      if (this.discover('enemies', e.def.id)) { /* first kill */ }
      p.onKill(e);
    },

    // ------------------------------------------------------------ player damage
    hurtPlayer(dmg, sx, sy, o) {
      const p = this.p;
      o = o || {};
      if (p.dead || this.state !== 'run') return false;
      if (p.invuln > 0) return false;
      if (Math.random() < p.s.evasion) {
        FX.text(p.x, p.y - 34, 'DODGE', '#cfd6e3', 13, { always: true });
        this.sfx('dodge'); p.invuln = 0.25;
        RS.Stash.onDodge(this, p);
        return false;
      }
      if (p.shield > 0) {
        p.shield--; p.invuln = 0.5;
        FX.ring(p.x, p.y, 60, '#e6ebf3', 0.35, 4);
        this.sfx('shield');
        return false;
      }
      let d = dmg * p.s.dmgTaken;
      if (this.mods.nomercy) d *= 1.25;
      if (this.mapMode) d *= this.mapMode.dmg * D.mapEase(this, 'dmg'); // NIGHT / STORM: every hit lands a bit harder; NORMAL from 5:00 softer
      if (p.s.difficulty) d *= 1 + p.s.difficulty * 0.5; // DEMON TAX / CURSED UP
      d = Math.max(1, d - p.s.armor);
      p.hp -= d;
      p.invuln = 0.5;
      p.hurtFlash = 0.22;
      this.stats.damageTaken += d;
      if (this.stats.firstHurt < 0) this.stats.firstHurt = this.time;
      const l = Math.hypot(p.x - sx, p.y - sy) || 1;
      const kb = (o.knock || 240) * (1 - p.s.knockResist);
      p.kvx += ((p.x - sx) / l) * kb; p.kvy += ((p.y - sy) / l) * kb;
      FX.shake(0.28); FX.hurtA = 0.7; FX.glitch(0.12);
      FX.text(p.x, p.y - 36, '-' + Math.round(d), '#ff2448', 16, { always: true });
      const who = o.who !== undefined ? o.who : this.nearestEnemyName(sx, sy);
      this.stats.lastHitBy = who || (o.who === '' ? 'ENEMY FIRE' : 'AN ATTACK'); // the results screen names your killer
      if (l > 20) { // hit direction for the HUD: an arc around the hero pointing at the source, the attacker's name on big hits
        this.hitMarks.push({ a: Math.atan2(sy - p.y, sx - p.x), at: this.time, big: d >= 9, who });
        if (this.hitMarks.length > 6) this.hitMarks.shift();
      }
      this.sfx('hurt');
      this.addHitstop(0.045);
      for (const th of p.thumbs) if (th.def.onHurt) th.def.onHurt(p, this, th.st);
      if (p.hp > 0) for (const it of p.passives) if (it.def.onHurt) it.def.onHurt(p, this, it.level, p.passiveState[it.id]);
      if (p.hp > 0) RS.Stash.onHurt(this, p, d, sx, sy);
      if (p.hp <= 0) this.playerDown();
      return true;
    },
    hitMarks: [],
    nearestEnemyName(x, y) {
      let best = null, bd = 70 * 70;
      for (const e of this.enemies.list) {
        if (e.dead) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best ? (best.bdef ? best.bdef.name : best.def.name) : '';
    },
    playerDown() {
      const p = this.p;
      if (RS.Stash.lastStand(this, p)) return; // ZA WARUDO
      if (p.revives > 0) {
        p.revives--;
        p.hp = p.s.maxHp * 0.5;
        p.invuln = 2;
        FX.banner('SECOND VERSE', 'REVIVED', '#9cff35', 2);
        FX.flash('#ffffff', 0.7);
        this.aoe(p.x, p.y, 320, 200, { knock: 700, noCrit: true, ring: '#9cff35', fill: 0.3 });
        this.eshots.clear(); this.teles.length = 0;
        this.sfx('evolve');
        return;
      }
      p.hp = 0;
      p.dead = true; p.deadAt = performance.now(); // real time: the death animation plays through the slow-mo
      this.state = 'dying';
      this.slowmo = 1.4;
      FX.flash('#ff2448', 0.6); FX.glitch(1.2); FX.shake(0.6);
      FX.pixelDeath(p.x, p.y, ['#ff2448', '#101015', '#cfd6e3'], 40);
      this.sfx('death');
      RS.Audio.music.stop();
    },

    // ------------------------------------------------------------ projectiles
    proj(o) {
      const pr = this.projs.spawn();
      pr.x = o.x; pr.y = o.y;
      const sp = o.speed || 0;
      if (o.vx !== undefined) { pr.vx = o.vx; pr.vy = o.vy; } else { pr.vx = Math.cos(o.angle) * sp; pr.vy = Math.sin(o.angle) * sp; }
      pr.speed = sp;
      pr.r = o.r || 6; pr.dmg = o.dmg || 0; pr.hitsLeft = (o.pierce || 0) + 1;
      pr.life = o.life || 1; pr.max = pr.life; pr.age = 0;
      pr.kind = o.kind || 'bolt'; pr.col = o.col || '#ffffff'; pr.w = o.w || null;
      pr.knock = o.knock || 0; pr.crit = o.crit || 0; pr.sonic = !!o.sonic;
      pr.hits.length = 0; if (o.skipId) pr.hits.push(o.skipId);
      pr.bounce = o.bounce || 0; pr.bounceRange = o.bounceRange || 250; pr.bonusPer = o.bonusPer || 0; pr.bonusCap = o.bonusCap || 0;
      pr.bonusNow = 0; pr.bounceCount = 0; pr.chain = pr.chain || []; pr.chain.length = 0;
      pr.homing = o.homing || 0; pr.target = o.target || null;
      pr.boom = o.boomerang || null; pr.phase = 0; pr.traveled = 0; pr.loops = pr.boom ? pr.boom.loops : 0;
      pr.wallBounce = !!o.wallBounce;
      pr.hitCd = o.hitCd || 0;
      if (pr.hitCd) { if (!pr.hitMap) pr.hitMap = new Map(); pr.hitMap.clear(); }
      pr.onHit = o.onHit || null; pr.onEnd = o.onEnd || null; pr.onTick = o.onTick || null; pr.onBounce = o.onBounce || null;
      pr.child = !!o.child; pr.noHitDmg = !!o.noHitDmg; pr.small = !!o.small; pr.src = o.src || null;
      // PRODUCER TAG: every Nth shot a weapon fires (not splits, echoes or item procs) is tagged
      const ps = this.p && this.p.s;
      if (ps && ps.tagEvery && pr.w && !pr.child && !pr.src && pr.dmg > 0 && ++this.tagN >= ps.tagEvery) {
        this.tagN = 0;
        pr.dmg *= 3; pr.r *= 1.35; pr.col = '#ffd23f'; pr.hitsLeft += ps.tagPierce; pr.crit = 1; // a tagged shot always crits
        if (this.time - this.tagT > 10) { this.tagT = this.time; FX.text(this.p.x, this.p.y - 48, U.pick(TAGS), '#ffd23f', 12, { always: true, life: 1.2 }); }
      }
      // auto-targeted shot: reserve its damage on the target so the next shots pick someone not already doomed
      pr.aim = o.aim || null; pr.pend = 0;
      if (pr.aim) { pr.aimId = pr.aim.id; pr.pend = pr.dmg; pr.aim.pend = (pr.aim.pend || 0) + pr.pend; }
      pr.spin = Math.random() * 6; pr.pulse = o.pulse || 0; pr.pulseT = 0; pr.ended = false;
      return pr;
    },
    releaseAim(pr) { const t = pr.aim; if (t && t.id === pr.aimId) t.pend = Math.max(0, (t.pend || 0) - pr.pend); pr.aim = null; pr.pend = 0; },
    updateProjectiles(dt) {
      const A = this.arena, p = this.p;
      for (const pr of this.projs.list) {
        if (pr.dead) continue;
        pr.age += dt; pr.life -= dt;
        if (pr.onTick) pr.onTick(pr, this, dt);
        if (pr.aim) { // guided auto-target: follow the target's body; if it dies first, take the nearest one ahead
          let t = pr.aim;
          if (t.dead || t.spawning > 0 || t.id !== pr.aimId) { // killed by something else (pool may have reused it): retarget
            this.releaseAim(pr); t = this.target(pr.x, pr.y, 320);
            if (t) { pr.aim = t; pr.aimId = t.id; pr.pend = pr.dmg; t.pend = (t.pend || 0) + pr.pend; pr.life = Math.max(pr.life, Math.hypot(t.x - pr.x, t.y - pr.y) / (Math.hypot(pr.vx, pr.vy) || 1) + 0.15); }
          }
          if (t && !t.dead) {
            const want = Math.atan2(t.y - this.bodyLift(t) - pr.y, t.x - pr.x), cur = Math.atan2(pr.vy, pr.vx);
            // gentle far away, sharp up close: a fixed turn rate would orbit a near target (radius = speed / rate)
            const dist = Math.hypot(t.x - pr.x, t.y - this.bodyLift(t) - pr.y), rate = dist < 160 ? 60 : 9;
            const na = cur + U.clamp(U.angDiff(cur, want), -rate * dt, rate * dt), sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
          }
        }
        if (pr.homing) {
          if (!pr.target || pr.target.dead) pr.target = this.nearestSeen(pr.x, pr.y, 420);
          if (pr.target) {
            const want = Math.atan2(pr.target.y - this.bodyLift(pr.target) - pr.y, pr.target.x - pr.x);
            const cur = Math.atan2(pr.vy, pr.vx);
            const d = U.angDiff(cur, want);
            const na = cur + U.clamp(d, -pr.homing * dt, pr.homing * dt);
            const sp = Math.hypot(pr.vx, pr.vy);
            pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
          }
        }
        if (pr.boom) {
          if (pr.phase === 0) {
            pr.traveled += pr.speed * dt;
            const k = pr.traveled / pr.boom.range;
            if (k > 0.7) { const f = Math.max(0.25, 1 - (k - 0.7) * 2.2); const a = Math.atan2(pr.vy, pr.vx); pr.vx = Math.cos(a) * pr.speed * f; pr.vy = Math.sin(a) * pr.speed * f; }
            if (pr.traveled >= pr.boom.range) { pr.phase = 1; if (pr.hitMap) pr.hitMap.clear(); }
          } else {
            const dx = p.x - pr.x, dy = p.y - pr.y, l = Math.hypot(dx, dy) || 1;
            const sp = pr.speed * 1.15;
            pr.vx += ((dx / l) * sp - pr.vx) * Math.min(1, dt * 6);
            pr.vy += ((dy / l) * sp - pr.vy) * Math.min(1, dt * 6);
            if (l < 26) {
              if (pr.loops > 1) {
                pr.loops--; pr.phase = 0; pr.traveled = 0;
                const a = U.rand(U.TAU); pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed;
              } else pr.dead = true;
            }
            pr.life = Math.max(pr.life, 0.5);
          }
        }
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        pr.spin += dt * 14;
        if (pr.x < 0 || pr.y < 0 || pr.x > A.w || pr.y > A.h) {
          if (pr.wallBounce) {
            if (pr.x < 0 || pr.x > A.w) pr.vx = -pr.vx;
            if (pr.y < 0 || pr.y > A.h) pr.vy = -pr.vy;
            pr.x = U.clamp(pr.x, 1, A.w - 1); pr.y = U.clamp(pr.y, 1, A.h - 1);
          } else if (!pr.boom) pr.dead = true;
        }
        // shots never fly on to hit enemies you cannot see: they end a little past the screen edge (CDs come back)
        if (!pr.boom && !this.onScreen(pr.x, pr.y, 40)) pr.dead = true;
        if (pr.kind === 'rocket' && Math.random() < 0.5) {
          FX.burst(pr.x, pr.y, ['#ff7a1a', '#ffe14a'], 1, 40, { size: 3, life: 0.2 });
          FX.smoke(pr.x, pr.y, 1, 6, '#b9bbb7', { spd: 10, vy: -6, life: 0.6, grow: 2, alpha: 0.28 });
        }
        RS.Arena.projHitsProps(this, pr);
        if (!pr.dead) {
          // broad phase wide enough for the tallest body, then the exact capsule test (feet circle up to the chest),
          // swept along this frame's travel so fast rounds cannot tunnel through a target between two frames
          this.grid.query(pr.x, pr.y, pr.r + 48 + Math.hypot(pr.vx, pr.vy) * dt, TMP);
          const px0 = pr.x - pr.vx * dt, py0 = pr.y - pr.vy * dt;
          for (let i = 0; i < TMP.length; i++) {
            const e = TMP[i];
            if (e.dead || e.spawning > 0) continue;
            if (!segHitsCapsule(px0, py0, pr.x, pr.y, e.x, e.y - this.bodyLift(e) * 2, e.y, pr.r + e.r)) continue;
            if (pr.hitCd) {
              const t = pr.hitMap.get(e.id);
              if (t !== undefined && this.time - t < pr.hitCd) continue;
              pr.hitMap.set(e.id, this.time);
            } else if (pr.hits.includes(e.id)) continue;
            if (pr.noHitDmg) { pr.dead = true; break; }
            if (pr.aim) this.releaseAim(pr); // first contact: the shot did its job, it flies straight from here (pierce)
            if (!pr.hitCd) pr.hits.push(e.id);
            const res = this.damage(e, pr.dmg * (1 + pr.bonusNow), { w: pr.w, crit: pr.crit, knock: pr.knock, kx: pr.vx, ky: pr.vy, sonic: pr.sonic, src: pr.src });
            const crit = res.crit, killed = res.killed;
            if (pr.onHit) pr.onHit(pr, e, this, { crit, killed });
            if (pr.kind === 'bolt') { FX.rage(1, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), pr.col, pr.child ? 0.7 : 1); }
            else if (pr.kind === 'shard') FX.burst(pr.x, pr.y, [pr.col, '#ffffff'], 2, 140, { size: 3, life: 0.15 });
            if (pr.kind === 'bullet' || pr.kind === 'shard') FX.impact(pr.x, pr.y, Math.atan2(pr.vy, pr.vx), pr.kind === 'bullet' ? '#ffe9a8' : pr.col);
            if (pr.bounce > 0) {
              // a ricochet never returns to an enemy it already hit (it used to ping-pong between a boss and one add)
              pr.chain.push(e.id);
              const nx = this.nearestSeen(e.x, e.y, pr.bounceRange, pr.chain);
              if (nx) {
                const a = Math.atan2(nx.y - e.y, nx.x - e.x);
                const sp = Math.hypot(pr.vx, pr.vy) || pr.speed;
                pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp;
                pr.bounce--; pr.bounceCount++;
                pr.bonusNow = Math.min(pr.bonusCap, pr.bonusNow + pr.bonusPer);
                pr.hits.length = 0; pr.hits.push(e.id);
                pr.life = Math.max(pr.life, 0.9);
                if (pr.onBounce) pr.onBounce(pr, e, this);
                break;
              }
            }
            if (--pr.hitsLeft <= 0) { pr.dead = true; break; }
          }
        }
        if (pr.life <= 0) pr.dead = true;
        if (pr.dead && pr.aim) this.releaseAim(pr);
        if (pr.dead && !pr.ended) { pr.ended = true; if (pr.onEnd) pr.onEnd(pr, this); RS.Render.projEnd(pr); }
      }
    },

    // ------------------------------------------------------------ enemy shots
    // Regular enemies share a small fire budget (tokens refill over time, slower while a boss is up) and a cap on
    // live shots, so the screen holds a few readable volleys instead of a bullet carpet. Boss patterns are exempt.
    canFire(cost) {
      if (this.regShots() + cost > ESHOT_CAP) return false;
      if (this.fireTok < cost) return false;
      this.fireTok -= cost;
      return true;
    },
    regShots() { let n = 0; for (const s of this.eshots.list) if (!s.dead && !s.boss) n++; return n; },
    updateFireBudget(dt) {
      const rate = this.bosses.length ? 0.5 : 1.4 + Math.min(1, this.time / 900) * 0.8;
      this.fireTok = Math.min(FIRE_TOK_MAX, (this.fireTok || 0) + rate * dt);
    },
    eshot(o) {
      const s = this.eshots.spawn();
      s.boss = !!o.boss;
      s.x = o.x; s.y = o.y;
      s.vx = Math.cos(o.angle) * o.speed; s.vy = Math.sin(o.angle) * o.speed;
      s.r = o.r || 8; s.dmg = o.dmg || 8; s.life = o.life || 4; s.col = o.col || '#ff2448'; s.age = 0;
      return s;
    },
    updateEnemyShots(dt) {
      const p = this.p, A = this.arena;
      for (const s of this.eshots.list) {
        s.age += dt; s.life -= dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.life <= 0 || s.x < -50 || s.y < -50 || s.x > A.w + 50 || s.y > A.h + 50) { s.dead = true; continue; }
        if (s.age > 0.5 && !this.onScreen(s.x, s.y, 160)) { s.dead = true; continue; } // left the screen: no stray shots from off-camera
        const rr = s.r + p.r * 0.7;
        if (U.dist2(s.x, s.y, p.x, p.y) < rr * rr) {
          if (this.hurtPlayer(s.dmg * this.enemyDmgMul(), s.x, s.y, { knock: 160, who: '' }) || p.invuln > 0) { s.dead = true; FX.burst(s.x, s.y, [s.col, '#ffffff'], 5, 120); }
        }
      }
    },
    clearEnemyShots(x, y, r) {
      for (const s of this.eshots.list) {
        if (!s.dead && U.dist2(s.x, s.y, x, y) < r * r) { s.dead = true; FX.burst(s.x, s.y, ['#e6ebf3', s.col], 4, 100); }
      }
    },
    // contact / shot damage scale: gentle opening (50% at 0:00 -> 100% at 5:00; the crowd now reaches you), then +35% per 10 min, cap 160%
    enemyDmgMul() { const t = this.time; return t < 480 ? 0.5 + 0.5 * (t / 480) : Math.min(1.6, 1 + (t - 480) / 600 * 0.35); }, // full strength at 8:00, not with everything else at 5:00

    // ------------------------------------------------------------ zones
    zone(o) {
      // lasting zones (pits, fogs, fields: 1.5 s+) are capped per weapon: a new one past ZONE_CAP sends the oldest into
      // a quick fade. A maxed MOSH PIT with 24 MODS (+3 pits, x2 duration, 0.9 s cooldown) kept 100+ pits alive at once
      // and their fills merged into one red-pink sheet over the whole screen (2026-10-27)
      if (o.w && (o.life || 1) >= 1.5) {
        let n = 0, old = null;
        for (const q of this.zones.list) if (!q.dead && q.w === o.w && q.max >= 1.5 && q.life > 0.3) { n++; if (!old || q.age > old.age) old = q; }
        if (n >= ZONE_CAP && old) old.life = Math.min(old.life, 0.3);
      }
      const z = this.zones.spawn();
      z.kind = o.kind; z.x = o.x; z.y = o.y; z.r = o.r || 50; z.maxR = o.maxR || z.r;
      z.life = o.life || 1; z.max = z.life; z.age = 0;
      z.tick = o.tick || 0; z.tickT = 0.05; z.ticks = 0;
      z.dmg = o.dmg || 0; z.w = o.w || null; z.col = o.col || '#ff2448';
      z.slow = o.slow || 0; z.vuln = o.vuln || 0; z.pull = o.pull || 0; z.ramp = o.ramp || 0;
      z.knock = o.knock || 0; z.sonic = !!o.sonic; z.follow = !!o.follow; z.ang = o.ang || 0; z.arc = o.arc || 0;
      z.noDamage = !!o.noDamage; z.arm = o.arm || 0; z.seek = o.seek || 0; z.flip = o.flip || 0;
      z.onUpdate = o.onUpdate || null; z.onEnd = o.onEnd || null;
      z.count = 0; z.ended = false;
      if (z.kind === 'wave') { if (!z.waveHits) z.waveHits = new Set(); z.waveHits.clear(); z.r = 0; }
      return z;
    },
    updateZones(dt) {
      const p = this.p;
      for (const z of this.zones.list) {
        if (z.dead) continue;
        z.age += dt; z.life -= dt;
        if (z.follow) { z.x = p.x; z.y = p.y; }
        if (z.seek) {
          const t = this.nearestSeen(z.x, z.y, 500);
          if (t) { const a = Math.atan2(t.y - z.y, t.x - z.x); z.x += Math.cos(a) * z.seek * dt; z.y += Math.sin(a) * z.seek * dt; }
        }
        if (z.kind === 'wave') {
          z.r = z.maxR * U.easeOut(Math.min(1, z.age / z.max));
          const list = this.inRadius(z.x, z.y, z.r);
          for (const e of list) {
            if (z.waveHits.has(e.id)) continue;
            z.waveHits.add(e.id); z.count++;
            this.damage(e, z.dmg, { w: z.w, knock: z.knock, kx: e.x - z.x, ky: e.y - z.y, sonic: z.sonic });
          }
        } else if (!z.noDamage && z.tick) {
          z.tickT -= dt;
          if (z.tickT <= 0) {
            z.tickT += z.tick;
            z.ticks++;
            const list = this.inRadius(z.x, z.y, z.r);
            const dmg = z.dmg * (1 + z.ramp * z.ticks);
            for (const e of list) {
              if (z.slow) { e.slowT = Math.max(e.slowT, z.tick + 0.15); e.slowAmt = Math.max(e.slowAmt, z.slow); }
              if (z.vuln) { e.vulnT = Math.max(e.vulnT, z.tick + 0.15); e.vulnAmt = Math.max(e.vulnAmt, z.vuln); }
              if (dmg > 0) this.damage(e, dmg, { w: z.w, knock: z.knock, kx: e.x - z.x, ky: e.y - z.y, sonic: z.sonic, crit: 0 });
            }
          }
        }
        if (z.pull) {
          const list = this.inRadius(z.x, z.y, z.r * 1.15);
          for (const e of list) {
            if (e.boss) continue;
            const dx = z.x - e.x, dy = z.y - e.y, l = Math.hypot(dx, dy) || 1;
            if (l < 8) continue;
            const f = z.pull * dt / (e.mass || 1);
            e.x += (dx / l) * f; e.y += (dy / l) * f;
          }
        }
        if (z.onUpdate) z.onUpdate(z, this, dt);
        if (z.life <= 0) {
          z.dead = true;
          if (!z.ended) { z.ended = true; if (z.onEnd) z.onEnd(z, this); if (z.kind === 'mine') RS.FX.pop(z.x, z.y, 34, [z.col, '#ffe14a'], 'shatter'); }
        }
      }
    },

    // ------------------------------------------------------------ telegraphed enemy attacks
    // shared attack budget: regular enemies only start a telegraphed attack while fewer than attackCap warnings are
    // live (data/timeline.js), so attacks do not stack into unreadable, undodgeable overlaps
    attackOk() { return this.teles.length < D.curve(D.TIMELINE.attackCap, this.time / 60); },
    // the same budget for an attack aimed at a spot: on top of the cap, only one live warning may cover that spot
    // (110 px around it), so a second enemy waits and there is always ground to step onto (it used to allow two, and
    // a lane plus a slam plus a stomp boxed the hero in). A PINK PONY gallop also wants the spot clear (cap 1)
    attackOkAt(x, y, cap) {
      if (!this.attackOk()) return false;
      let n = 0;
      cap = cap || 1;
      for (const t of this.teles) if (!t.boss && this.inTele(t, x, y, 110) && (n += t.look === 'gallop' ? 2 : 1) >= cap) return false;
      return true;
    },
    // PINK PONY rainbow gallops share one budget: only ONE pony rears or gallops at a time, the next one waits a shared
    // cooldown after that gallop ends (G.ponyNext, set in Enemies.gallop), and none starts while the TRIP PEAK
    // stampede herd is on screen. Two ponies used to line up two crossing rainbows on you, plus whatever else landed.
    ponyOk() {
      if (this.time < (this.ponyNext || 0)) return false;
      for (const e of this.enemies.list) {
        if (e.dead || e.type !== 'pony') continue;
        if (e.state === 'windup' || e.state === 'charge') return false;
        if (e.aiOver === 'stream' && this.onScreen(e.x, e.y, 60)) return false;
      }
      return true;
    },
    telegraph(o) {
      const t = Object.assign({ t: 0, warn: 0.8, active: 0, dmg: 10, col: '#ff2448', done: false, w: 30, len: 600, knock: 300 }, o);
      this.teles.push(t);
      return t;
    },
    updateTelegraphs(dt) {
      const p = this.p;
      for (let i = this.teles.length - 1; i >= 0; i--) {
        const t = this.teles[i];
        t.t += dt;
        if (t.follow && !t.t0) { t.x = t.follow.x; t.y = t.follow.y; }
        if (t.kind === 'ring') {
          if (t.t >= t.warn) {
            t.rad = (t.r0 || 0) + (t.t - t.warn) * t.speed;
            if (!t.done && Math.abs(Math.hypot(p.x - t.x, p.y - t.y) - t.rad) < t.w / 2 + p.r * 0.6) {
              if (this.hurtPlayer(t.dmg, t.x, t.y, { knock: t.knock })) t.done = true;
            }
            if (t.rad > t.maxR) this.teles.splice(i, 1);
          }
          continue;
        }
        if (t.t >= t.warn && !t.fired) {
          t.fired = true;
          if (t.onFire) t.onFire(t);
          if (t.kind === 'circle' && t.dmg > 0 && t.boss) { // painted cracks where a boss ground attack lands
            const q = RS.FXS.ready && FX.anim('cracks', t.x, t.y, 0, (2.2 * t.r) / RS.FXS.frame('cracks', 4)[2], 0.9);
            if (q) { q.ground = true; q.ky = q.size * 1.6; }
          }
          if (t.dmg > 0 && this.inTele(t, p.x, p.y, p.r * 0.5)) this.hurtPlayer(t.dmg, t.x, t.y, { knock: t.knock });
          if (t.boss) FX.flash(t.col, 0.05); // regular attacks no longer tint the screen (2-3 tints a second from 8:00)
          if (t.kind === 'circle') FX.ring(t.x, t.y, t.r, t.col, 0.25, 5, 0.3);
        }
        if (t.fired && t.active > 0 && t.t < t.warn + t.active && !t.hitOnce && t.dmg > 0) {
          if (this.inTele(t, p.x, p.y, p.r * 0.5)) { if (this.hurtPlayer(t.dmg, t.x, t.y, { knock: t.knock })) t.hitOnce = true; }
        }
        if (t.t >= t.warn + t.active) this.teles.splice(i, 1);
      }
    },
    inTele(t, x, y, pad) {
      if (t.kind === 'circle') return Math.hypot(x - t.x, y - t.y) < t.r + pad;
      if (t.kind === 'rect') return x > t.x - pad && x < t.x + t.w + pad && y > t.y - pad && y < t.y + t.h + pad;
      if (t.kind === 'line') {
        const dx = Math.cos(t.ang), dy = Math.sin(t.ang);
        const px = x - t.x, py = y - t.y;
        const along = px * dx + py * dy;
        if (along < 0 || along > t.len) return false;
        return Math.abs(px * dy - py * dx) < t.w / 2 + pad;
      }
      return false;
    },
  });
})(window.RS);
