'use strict';
// Boss spawning, multi-phase AI and loot explosions.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data, TAU = U.TAU;
  // target fight length in seconds
  const FIGHT = { plant: 55, algorithm: 40, king: 90, label: 150 }, BOSS_SHARE = (t) => U.clamp(0.1 - 0.003 * t / 60, 0.05, 0.1); // measured: a boss takes 5-12% of your damage by build, less in later, thicker crowds

  const toward = (e, tx, ty, spd) => {
    const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1;
    e.vx = (dx / l) * spd; e.vy = (dy / l) * spd;
    return l;
  };

  const Bosses = {
    spawn(G, id, extraMul) {
      const B = D.BOSSES[id];
      const p = G.p, A = G.arena;
      let x = 0, y = 0;
      for (let i = 0; i < 12; i++) {
        const a = U.rand(TAU);
        x = U.clamp(p.x + Math.cos(a) * 430, 120, A.w - 120); y = U.clamp(p.y + Math.sin(a) * 430, 120, A.h - 120);
        if (Math.hypot(x - p.x, y - p.y) > 300 && !RS.Arena.solidAt(A, x, y, B.r)) break;
      }
      const e = G.enemies.spawn();
      e.id = G.uid++;
      e.boss = true; e.bid = id; e.bdef = B; e.type = id;
      e.def = { id, name: B.name, cols: [B.col, '#ffffff', '#101015'], ai: 'boss' };
      e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.kvx = 0; e.kvy = 0;
      e.r = B.r; e.scale = B.scale; e.mass = 50; e.anchored = true;
      // Health comes from how hard YOU are hitting right now (damage per second over the last 20 s), so a fight lasts
      // about FIGHT seconds whatever the build: level / evolution formulas gave anything from 15 s to almost 4 minutes.
      // The boss only takes part of that damage (the crowd soaks the rest), hence the share factor. Floor = base HP.
      e.spawnT = G.time;
      const MM = G.mapMode || {}, dps = G.recentDps(), fight = (id === 'label' && MM.labelFight) || FIGHT[id] || 50; // NORMAL: a shorter last fight
      e.fight = fight;
      e.dpsAtSpawn = Math.round(dps);
      // THE MAJOR LABEL: sized like the others from your crowd DPS (a full crowd DPS on one target was 13 M HP, i.e.
      // unbeatable) but with a long fight: ~3x THE RAGE KING. It speeds up, so only a strong build gets there.
      const share = BOSS_SHARE(G.time);
      e.maxHp = e.hp = Math.max(B.hp * 0.6, dps * share * fight) * (extraMul || 1) * G.arenaDef.hpMul * (G.mods.nomercy ? 1.6 : 1) * (G.mapMode ? G.mapMode.bossHp : 1);
      e.spd = B.spd; e.dmgMul = G.mods.nomercy ? 1.25 : 1; e.dmg = B.dmg * e.dmgMul; e.xp = B.xp;
      e.armor = 0; e.tier = 0; e.elite = false;
      e.flash = 0; e.slowT = 0; e.slowAmt = 0; e.vulnT = 0; e.vulnAmt = 0; e.distort = 0; e.distortT = 0; e.freezeT = 0; e.iceT = 0;
      e.dPo = e.tPo = e.dBl = e.tBl = e.dBu = e.tBu = e.cuK = e.tCu = 0; e.chillT = 0; e.skyT = 0; e.shatT = 0; e.dotOn = false; e.mark = false; // stash statuses
      e.hitCd = 0; e.anim = 0; e.facing = 1; e.lastHit = -9; e.glitchT = 0; e.life = 0;
      e.state = 'idle'; e.st = 2.2; e.atkI = 0; e.phase = 1; e.shieldUp = false;
      e.spawning = 1.0;
      G.bosses.push(e);
      G.discover('bosses', id);
      FX.banner(B.name, B.title, B.col, 3.4);
      FX.flash(B.col, 0.35); FX.shake(0.5); FX.glitch(0.5);
      FX.ring(x, y, 160, B.col, 0.8, 8, 0.25);
      G.sfx('boss');
      RS.Audio.music.play('boss');
      return e;
    },

    update(G, e, dt, frozen) {
      if (frozen) { e.vx = 0; e.vy = 0; return; }
      const fn = this[e.bid];
      if (fn) fn.call(this, G, e, dt);
      e.x = U.clamp(e.x, e.r, G.arena.w - e.r); e.y = U.clamp(e.y, e.r, G.arena.h - e.r);
    },

    // ------------------------------------------------------------ INDUSTRY PLANT
    plant(G, e, dt) {
      const p = G.p;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > 250) toward(e, p.x, p.y, e.spd);
      else if (d < 150) toward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.spd * 0.7);
      else { const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2; e.vx = Math.cos(a) * e.spd * 0.6; e.vy = Math.sin(a) * e.spd * 0.6; }
      const ph2 = e.hp < e.maxHp * 0.5;
      if (ph2 && e.phase === 1) { e.phase = 2; this.phaseShift(G, e, 'OVERPROMOTED'); }
      e.st -= dt;
      if (e.st > 0) return;
      e.st = ph2 ? 1.7 : 2.4;
      const atk = ['summon', 'aoe', 'spray', 'aoe'][e.atkI++ % 4];
      if (atk === 'summon') {
        const n = ph2 ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          G.spawnEnemy(i % 4 === 0 && ph2 ? 'fiend' : 'npc', e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120, { tier: RS.Director.tierFor(G), hpMul: RS.Director.hpMul(G), telegraph: true });
        }
        FX.text(e.x, e.y - 90, 'INDUSTRY PLANTS!', '#3fbf4f', 15, { always: true, life: 1.2 });
        G.sfx('warning');
      } else if (atk === 'aoe') {
        const n = ph2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const ox = i ? U.rand(-170, 170) : p.vx * 0.5, oy = i ? U.rand(-170, 170) : p.vy * 0.5;
          G.telegraph({ kind: 'circle', x: p.x + ox, y: p.y + oy, r: 105, warn: 1.2, dmg: e.dmg, col: '#3fbf4f',
            onFire: (t) => { FX.burst(t.x, t.y, ['#3fbf4f', '#2a8a3a', '#f8ff9a'], 12, 240); G.aoe(t.x, t.y, t.r, 0.01, { noCrit: true }); G.sfx('slam'); } });
        }
        G.sfx('telegraph');
      } else {
        const n = ph2 ? 24 : 16;
        const ring = (off) => { for (let i = 0; i < n; i++) G.eshot({ boss: true, x: e.x, y: e.y, angle: (i / n) * TAU + off, speed: 175, dmg: 12 * e.dmgMul, r: 10, col: '#3fbf4f', life: 5 }); };
        ring(0);
        if (ph2) G.later(0.35, () => { if (!e.dead) ring(Math.PI / n); });
        G.sfx('shoot_e');
      }
    },

    // ------------------------------------------------------------ THE ALGORITHM
    algorithm(G, e, dt) {
      const p = G.p;
      e.anim += dt;
      const tx = p.x + Math.cos(G.time * 0.5) * 260, ty = p.y + Math.sin(G.time * 0.5) * 200;
      toward(e, tx, ty, e.state === 'lasers' ? 0 : 75);
      const ph2 = e.hp < e.maxHp * 0.5;
      if (ph2 && e.phase === 1) { e.phase = 2; this.phaseShift(G, e, 'ALGORITHM UPDATE 2.0'); }
      e.st -= dt;
      if (e.st > 0) return;
      const atk = ['teleport', 'grid', 'lasers', 'rewire', 'teleport', 'lasers', 'grid'][e.atkI++ % 7];
      e.state = atk;
      e.st = ph2 ? 1.6 : 2.3;
      if (atk === 'teleport') {
        const a = U.rand(TAU);
        const nx = U.clamp(p.x + Math.cos(a) * 300, 100, G.arena.w - 100), ny = U.clamp(p.y + Math.sin(a) * 300, 100, G.arena.h - 100);
        G.telegraph({ kind: 'circle', x: nx, y: ny, r: 70, warn: 0.7, dmg: e.dmg, col: '#e3ece6',
          onFire: () => { if (e.dead) return; FX.burst(e.x, e.y, ['#e3ece6', '#ff4f6e'], 14, 220); e.x = nx; e.y = ny; FX.glitch(0.25); G.sfx('teleport'); } });
      } else if (atk === 'grid') {
        const cell = 110, n = ph2 ? 11 : 7;
        const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
        const used = new Set();
        for (let i = 0; i < n; i++) {
          const gx = i === 0 ? cx : cx + U.randi(-3, 3), gy = i === 0 ? cy : cy + U.randi(-2, 2);
          const k = gx + ',' + gy; if (used.has(k)) continue; used.add(k);
          G.telegraph({ kind: 'rect', x: gx * cell, y: gy * cell, w: cell, h: cell, warn: 1.0, dmg: e.dmg, col: '#ff4f6e' });
        }
        G.sfx('telegraph');
      } else if (atk === 'lasers') {
        const n = ph2 ? 8 : 5, base = U.rand(TAU);
        for (let i = 0; i < n; i++) {
          G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: base + (i / n) * TAU, len: 1000, w: 28, warn: 1.0, active: 0.35, dmg: e.dmg, col: '#e3ece6', follow: e, fx: 'laser', look: 'laser' });
        }
        G.sfx('telegraph');
        e.st = ph2 ? 1.9 : 2.5;
      } else if (atk === 'rewire') {
        G.surgeT = 12;
        RS.Arena.surge(G);
        FX.banner('THE ALGORITHM CHANGED THE RULES', 'POWER SURGE · HAZARDS ONLINE', '#e3ece6', 2.6);
        for (let i = 0; i < (ph2 ? 8 : 5); i++) {
          const a = U.rand(TAU);
          G.spawnEnemy('glitch', p.x + Math.cos(a) * 340, p.y + Math.sin(a) * 340, { tier: RS.Director.tierFor(G), hpMul: RS.Director.hpMul(G), telegraph: true });
        }
        G.sfx('warning');
      }
    },

    // ------------------------------------------------------------ THE RAGE KING
    king(G, e, dt) {
      const p = G.p;
      const frac = e.hp / e.maxHp;
      const ph = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
      if (ph > e.phase) { e.phase = ph; this.phaseShift(G, e, ph === 2 ? 'PHASE II · THE CROWN SLIPS' : 'PHASE III · PURE RAGE'); e.state = 'walk'; e.st = 1.4; return; }
      const enr = e.phase === 3 ? 1.3 : 1;
      e.st -= dt;
      if (e.state === 'walk' || e.state === 'idle') {
        toward(e, p.x, p.y, e.spd * enr);
        if (e.st <= 0) this.kingNext(G, e);
      } else if (e.state === 'windup') {
        e.vx = 0; e.vy = 0;
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.55; G.sfx('dash'); }
      } else if (e.state === 'charge') {
        e.vx = Math.cos(e.ang) * 760 * enr; e.vy = Math.sin(e.ang) * 760 * enr;
        if (U.per(0.8, dt)) FX.burst(e.x, e.y + 30, ['#ff2448', '#ff7a1a', '#2a2a2a'], 2, 120, { size: 5, life: 0.3 });
        if (e.st <= 0) {
          e.vx = 0; e.vy = 0;
          if (e.charges > 0) { e.charges--; this.kingCharge(G, e, 0.45); }
          else { e.state = 'walk'; e.st = 1.1; }
        }
      } else if (e.state === 'stomp' || e.state === 'cast') {
        e.vx *= U.damp(0.8, dt); e.vy *= U.damp(0.8, dt);
        if (e.st <= 0) { e.state = 'walk'; e.st = 1.2; }
      }
    },
    kingNext(G, e) {
      const ph = e.phase;
      const seq = ph === 1 ? ['charge', 'shock', 'charge', 'shock'] : ph === 2 ? ['charge', 'shock', 'summon', 'charge', 'shock'] : ['charge', 'spiral', 'shock', 'summon', 'charge', 'spiral'];
      const atk = seq[e.atkI++ % seq.length];
      if (atk === 'charge') { e.charges = ph === 3 ? 2 : ph === 2 ? 1 : 0; this.kingCharge(G, e, 0.8); }
      else if (atk === 'shock') {
        e.state = 'stomp'; e.st = 1.0;
        G.telegraph({ kind: 'circle', x: e.x, y: e.y, r: 100, warn: 0.55, dmg: e.dmg, col: '#ff2448',
          look: 'slam', onFire: () => { FX.shake(0.4); G.sfx('slam'); } });
        const rings = ph === 1 ? 1 : 2;
        for (let i = 0; i < rings; i++) G.telegraph({ kind: 'ring', x: e.x, y: e.y, warn: 0.55 + i * 0.5, speed: 330, maxR: 680, w: 30, dmg: e.dmg * 0.8, col: '#ff2448', r0: 40 });
      } else if (atk === 'summon') {
        e.state = 'cast'; e.st = 0.9;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          G.spawnEnemy('fiend', e.x + Math.cos(a) * 150, e.y + Math.sin(a) * 150, { tier: RS.Director.tierFor(G), hpMul: RS.Director.hpMul(G), telegraph: true });
        }
        FX.text(e.x, e.y - 110, 'RISE, FIENDS', '#ff2448', 15, { always: true, life: 1.2 });
        G.sfx('warning');
      } else if (atk === 'spiral') {
        e.state = 'cast'; e.st = 2.4;
        let base = U.rand(TAU);
        for (let k = 0; k < 22; k++) {
          G.later(k * 0.1, () => {
            if (e.dead) return;
            for (let i = 0; i < 3; i++) G.eshot({ boss: true, x: e.x, y: e.y, angle: base + (i / 3) * TAU, speed: 210, dmg: 14 * e.dmgMul, r: 10, col: '#ff2448', life: 4 });
            base += 0.33;
          });
        }
      }
    },
    kingCharge(G, e, warn) {
      const p = G.p;
      e.state = 'windup'; e.st = warn;
      e.ang = Math.atan2(p.y - e.y, p.x - e.x);
      G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.ang, len: 480, w: e.r * 2, warn, dmg: 0, col: '#ff2448', trim: '#ffcf3f', look: 'charge' });
      G.sfx('telegraph');
    },

    // ------------------------------------------------------------ THE MAJOR LABEL (30:00)
    // The final fight: walks straight at you and gets faster every second, hits hard on contact and keeps the floor
    // busy with readable gold telegraphs. Under half HP it attacks faster and signs two security guards at a time.
    // Its speed tops out just under yours (phase 2: level with you), so a run that got here can kite it with dashes
    // (playtest: uncapped it reached 520 vs your ~190 and caught every lv 85+ build within 20 s).
    label(G, e, dt) {
      const p = G.p, age = G.time - e.spawnT, ph2 = e.hp < e.maxHp * 0.5;
      if (ph2 && e.phase === 1) { e.phase = 2; this.phaseShift(G, e, 'RENEGOTIATING'); }
      const cap = (ph2 ? 1 : 0.92) * ((G.mapMode && G.mapMode.labelSpd) || 1); // NORMAL: a step slower than you, so it can be kited
      const sp = Math.min(178 * p.s.moveSpeed * cap, e.spd * (1 + age / 30)); // 178 = the hero's base speed (player.js)
      toward(e, p.x, p.y, e.state === 'cast' ? sp * 0.3 : sp);
      e.anim += dt;
      e.st -= dt;
      if (e.state === 'cast' && e.st <= 0.9) e.state = 'walk';
      if (e.st > 0) return;
      e.st = ph2 ? 1.8 : 2.6;
      const atk = ['contracts', 'royalty', 'contracts', 'drop', ph2 ? 'sign' : 'royalty'][e.atkI++ % 5];
      if (atk === 'contracts') { // contract stamps raining around you and where you are heading
        const n = ph2 ? 6 : 4; // was 9 / 6: they carpeted the floor around you
        for (let i = 0; i < n; i++) {
          const lead = i === 0 ? 0.6 : 0, a = U.rand(TAU), d = i === 0 ? 0 : U.rand(110, 260);
          G.telegraph({ kind: 'circle', x: p.x + p.vx * lead + Math.cos(a) * d, y: p.y + p.vy * lead + Math.sin(a) * d, r: 78, warn: 0.95, dmg: e.dmg * 0.7, knock: 300, col: '#ffcf3f',
            onFire: (t) => { FX.boom(t.x, t.y, 70, 'gold'); FX.shake(0.15); } });
        }
        G.sfx('telegraph');
      } else if (atk === 'royalty') { // three royalty beams fanned at you
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        for (const off of [-0.35, 0, 0.35]) G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: base + off, len: 1000, w: 30, warn: 0.85, active: 0.3, dmg: e.dmg * 0.8, col: '#ffcf3f', follow: e, fx: 'laser', look: 'laser' });
        e.state = 'cast'; e.st = Math.max(e.st, 1.2);
        G.sfx('telegraph');
      } else if (atk === 'drop') { // the floor drops: a slam under it and shockwave rings rolling out
        G.telegraph({ kind: 'circle', x: e.x, y: e.y, r: 120, warn: 0.6, dmg: e.dmg, col: '#ff2448', look: 'slam', onFire: () => { FX.shake(0.4); G.sfx('slam'); } });
        for (let i = 0; i < (ph2 ? 3 : 2); i++) G.telegraph({ kind: 'ring', x: e.x, y: e.y, warn: 0.6 + i * 0.45, speed: 360, maxR: 760, w: 30, dmg: e.dmg * 0.6, col: '#ffcf3f', r0: 50 });
      } else if (atk === 'sign') { // two signed guards step out beside you
        for (const s of [-1, 1]) {
          const a = Math.atan2(p.y - e.y, p.x - e.x) + s * Math.PI / 2;
          G.spawnEnemy('guard', p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240, { tier: 2, hpMul: RS.Director.hpMul(G), telegraph: true, noChest: true });
        }
        FX.text(e.x, e.y - 100, 'SIGNED', '#ffcf3f', 15, { always: true, life: 1.1 });
      }
    },

    // ------------------------------------------------------------ shared
    phaseShift(G, e, text) {
      FX.banner(e.bdef.name, text, e.bdef.col, 2.4);
      FX.flash(e.bdef.col, 0.4); FX.shake(0.5); FX.glitch(0.4);
      G.addHitstop(0.15);
      G.sfx('boss');
      e.shieldUp = true;
      G.later(1.2, () => { e.shieldUp = false; });
      for (const o of G.enemies.list) {
        if (o.boss || o.dead) continue;
        const dx = o.x - e.x, dy = o.y - e.y, l = Math.hypot(dx, dy) || 1;
        if (l < 400) { o.kvx += (dx / l) * 500; o.kvy += (dy / l) * 500; }
      }
      G.eshots.clear();
    },

    onDeath(G, e) {
      const i = G.bosses.indexOf(e);
      if (i >= 0) G.bosses.splice(i, 1);
      G.stats.bossesKilled.push(e.bid);
      (G.stats.bossFights = G.stats.bossFights || []).push([e.bid, Math.round(G.time - e.spawnT), Math.round(e.maxHp), e.dpsAtSpawn]);
      G.challenge('boss_' + e.bid);
      FX.banner(e.bdef.name + ' DEFEATED', 'LOOT DROP · +40 CL0UT', '#9cff35', 3);
      FX.flash('#ffffff', 0.8); FX.shake(0.8); FX.glitch(0.8);
      G.addHitstop(0.25);
      G.sfx('bossDie');
      for (let k = 0; k < 4; k++) G.later(k * 0.15, () => FX.ring(e.x, e.y, 120 + k * 80, e.bdef.col, 0.5, 6));
      // loot explosion
      const n = 22;
      for (let k = 0; k < n; k++) G.dropXp(e.x, e.y, e.xp / n, true);
      G.dropCoin(e.x, e.y, 12);
      G.dropConsumable(e.x, e.y);
      G.dropConsumable(e.x, e.y);
      G.dropChest(e.x, e.y, 'boss');
      G.addRunClout(40);
      G.eshots.clear();
      G.teles.length = 0;
      if (!G.bosses.length) RS.Audio.music.play(G.arenaDef.music);
      if (e.bid === 'king') { // the 25:00 major boss: unlocks the harder stage for every future run
        if (RS.Save.unlock('mods', 'nomercy')) (G.stats.unlocks = G.stats.unlocks || []).push('NO MERCY stage (harder variant, +60% CL0UT)');
        RS.Save.save();
        if (G.cfg.char === 'twizzy') G.challenge('win_twizzy');
        if (G.cfg.char === 'schmunk') G.challenge('win_schmunk');
      }
      if (e.bid === 'label' && !G.won) { // beating the run ender wins the run
        G.won = true;
        G.addRunClout(200);
        G.later(2.4, () => { if (G.state === 'run' || G.state === 'levelup' || G.state === 'chest' || G.state === 'plug') G.modalQueue.push({ type: 'victory' }); });
      }
    },
  };

  RS.Bosses = Bosses;
})(window.RS);
