'use strict';
// Enemy spawning + AI behaviours + movement / separation / contact damage.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data;
  const NB = [];
  const TIER_HP = [1, 2.6, 6], TIER_DMG = [1, 1.25, 1.5], TIER_SPD = [1, 1.08, 1.15], TIER_XP = [1, 1.5, 2.2];
  const PONY_REST = 2.4; // s every PINK PONY waits after a gallop ends before the next one may rear (Game.ponyOk)

  Object.assign(RS.Game, {
    spawnEnemy(type, x, y, o) {
      o = o || {};
      const def = D.ENEMIES[type];
      const e = this.enemies.spawn();
      const tier = o.tier || 0;
      const elite = !!o.elite;
      const hpMul = (o.hpMul || 1) * TIER_HP[tier] * (elite ? (this.flags.leakBoost ? 12.5 : 10) : 1);
      e.id = this.uid++;
      e.def = def; e.type = type; e.boss = false;
      e.x = x; e.y = y; e.kvx = 0; e.kvy = 0;
      e.tier = tier; e.elite = elite; e.noChest = !!o.noChest;
      e.scale = def.scale * (elite ? 1.4 : 1);
      e.r = def.r * (elite ? 1.4 : 1);
      e.maxHp = e.hp = def.hp * hpMul;
      // THREAT LV (data/timeline.js) makes contact hits, shots and attacks land harder every 4:00 (not a boss's adds)
      const thr = (k) => (o.noThreat ? 1 : D.threat(this, k));
      e.spd = def.spd * TIER_SPD[tier] * (elite ? 0.9 : 1) * U.rand(0.92, 1.08) * thr('spd');
      e.dmgMul = TIER_DMG[tier] * (elite ? 1.3 : 1) * (this.mods.nomercy ? 1.25 : 1) * thr('dmg');
      e.dmg = def.dmg * e.dmgMul;
      e.xp = def.xp * TIER_XP[tier] * (elite ? 12 : 1);
      e.mass = (def.mass || 1) * (elite ? 3 : 1);
      e.armor = def.armor || 0;
      e.flash = 0; e.slowT = 0; e.slowAmt = 0; e.vulnT = 0; e.vulnAmt = 0; e.distort = 0; e.distortT = 0; e.freezeT = 0; e.iceT = 0;
      e.hitCd = 0; e._lift = undefined; e.pend = 0; e._ls = e._prev = undefined; e.anim = U.rand(10); e.facing = 1; e.lean = 0; e.vx = 0; e.vy = 0;
      e.state = 'move'; e.st = 0; e.cd = U.rand(0.5, 2.5);
      e.ang = U.rand(U.TAU); e.flank = U.rand(U.TAU);
      // movement personality: walk straight in, circle to the flank, or cut you off
      const rs = Math.random();
      e.style = rs < 0.45 ? 'direct' : rs < 0.78 ? 'flank' : 'intercept';
      e.ph = U.rand(U.TAU); e.side = Math.random() < 0.5 ? -1 : 1;
      e.aiOver = o.ai || null; e.dirX = o.dirX || 0; e.dirY = o.dirY || 0; e.ttl = o.ttl || 0; e.turn = 0;
      e.lungeCd = U.rand(1.5, 4);
      e.spawning = o.telegraph ? 0.7 : 0;
      e.life = def.life || 0;
      e.anchored = false;
      e.lastHit = -9;
      e.glitchT = 0;
      e.z = 0; e.beat = -1; e.spinT = 0; e.reachT = 0; e.faceT = 0; e._idle = false; e.windT = 0; e.charged = false;
      // stash statuses (game/stash.js): DoT pools + timers, chill, knock-up, list membership
      e.dPo = e.tPo = e.dBl = e.tBl = e.dBu = e.tBu = e.cuK = e.tCu = 0; e.chillT = 0; e.skyT = 0; e.shatT = 0; e.dotOn = false; e.mark = false;
      this.discover('enemies', type);
      return e;
    },

    updateEnemies(dt) {
      const p = this.p, A = this.arena;
      const rageMul = this.enemyRage > 0 && this.freezeT <= 0 ? 1.3 : 1;
      const surgeMul = this.surgeT > 0 ? 1.15 : 1;
      const list = this.enemies.list;
      const SEP = (1 - Math.pow(0.4, dt * 60)) / 0.6; // overlap pushed out per step, same per second at any frame rate
      // the door: once 8+ enemies are within 320 px, regular walkers near the hero that stand in the escape lane
      // (RS.Director.lane) hold back and slide out of it sideways, so chasers closing in from every side cannot seal
      // the last way out (probe 4:00-8:00, struggling build: the hero was fully boxed in up to half the time)
      const Dr = RS.Director, doorOn = Dr.doorOn(this), door = Dr.laneA;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) continue;
        if (e.spawning > 0) { e.spawning -= dt; continue; }
        e.flash -= dt; e.slowT -= dt; e.vulnT -= dt; e.distortT -= dt; e.hitCd -= dt; e.iceT -= dt; e.chillT -= dt;
        if (e.slowT <= 0) e.slowAmt = 0;
        if (e.vulnT <= 0) e.vulnAmt = 0;
        if (e.distortT <= 0) e.distort = 0;
        const frozen = e.freezeT > 0;
        if (frozen) e.freezeT -= dt;
        if (e.boss) { RS.Bosses.update(this, e, dt, frozen); }
        else if (!frozen) {
          const speedMul = (1 - e.slowAmt) * rageMul * surgeMul * (RS.Arena.onPlatform(A, e.x, e.y) ? 0.6 : 1);
          const pvx = e.vx, pvy = e.vy;
          AI[e.aiOver || e.def.ai](this, e, p, dt, speedMul);
          if (doorOn && !e.elite && e.aiOver !== 'stream' && (!e.state || e.state === 'move') && e.def.ai !== 'flee') { // wave columns and walls just pass by
            const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
            if (d2 < 340 * 340 && d2 > 1) {
              // ~50 deg stays clear plus the angle the body itself covers, so a body next to the hero cannot lean into the
              // door either (a fixed width closed up once the crowd reached arm's length)
              const da = U.angDiff(door, Math.atan2(dy, dx)), d = Math.sqrt(d2), half = 0.45 + Math.asin(Math.min(1, (e.r + p.r + 6) / d));
              if (da < half && da > -half) {
                const s = da >= 0 ? 1 : -1, sp = Math.max(e.spd, 80) * speedMul * (d < 160 ? 1.1 : 0.75);
                const keep = d < 160 ? 0 : 0.3; // up close it only slides aside, it no longer steps in
                e.vx = e.vx * keep + (-dy / d) * s * sp; e.vy = e.vy * keep + (dx / d) * s * sp;
              }
            }
          }
          // steer toward the desired velocity instead of snapping to it
          const acc = e.state === 'charge' || e.state === 'lunge' || e.state === 'dash' ? 14 : e.def.accel || 4.5;
          const kk = 1 - Math.exp(-acc * dt);
          e.vx = pvx + (e.vx - pvx) * kk; e.vy = pvy + (e.vy - pvy) * kk;
        } else { e.vx = 0; e.vy = 0; }
        if (e.dead) continue;
        // integrate
        const kd = Math.exp(-7 * dt);
        e.kvx *= kd; e.kvy *= kd;
        const kspd2 = e.kvx * e.kvx + e.kvy * e.kvy;
        e.x += ((e.vx || 0) + e.kvx) * dt;
        e.y += ((e.vy || 0) + e.kvy) * dt;
        // separation (cheap, neighbours only)
        if (!e.boss) {
          this.grid.query(e.x, e.y, e.r, NB);
          let n = 0;
          for (let k = 0; k < NB.length && n < 6; k++) {
            const o = NB[k];
            if (o === e || o.dead || o.boss || o.spawning > 0) continue;
            const dx = e.x - o.x, dy = e.y - o.y;
            const rr = (e.r + o.r) * 0.8;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 0.01) {
              const d = Math.sqrt(d2), push = (rr - d) * 0.5 * SEP;
              const mr = o.mass / (e.mass + o.mass);
              e.x += (dx / d) * push * mr * 1.2; e.y += (dy / d) * push * mr * 1.2;
              n++;
              // knocked-back enemies bowl into others
              if (kspd2 > 380 * 380 && (o.bowlT || 0) < this.time) {
                o.bowlT = this.time + 0.3;
                this.damage(o, Math.sqrt(kspd2) * 0.03, { knock: 180, kx: e.kvx, ky: e.kvy, noCrit: true, src: 'bowl', color: '#cfd6e3' });
              }
            }
          }
          if (!e.aiOver && !e.def.ghost && !(e.z > 0)) RS.Arena.collide(A, e, false);
        }
        e.x = U.clamp(e.x, e.r, A.w - e.r); e.y = U.clamp(e.y, e.r, A.h - e.r);
        // facing with hysteresis: a sideways wobble or a crowd shove must not flip the sprite every few frames
        const fvx = e.vx || 0;
        if (fvx * (e.facing || 1) < -12) { e.faceT = (e.faceT || 0) + dt; if (e.faceT > 0.12 || fvx * fvx > 40000) { e.facing = fvx < 0 ? -1 : 1; e.faceT = 0; } }
        else e.faceT = 0;
        const sp = Math.hypot(e.vx || 0, e.vy || 0);
        e.anim += frozen ? 0 : dt * U.clamp(sp / 11, 2.5, 12);
        e.lean += ((U.clamp((e.vx || 0) / 900, -0.12, 0.12)) - e.lean) * (1 - Math.exp(-11 * dt));
        // contact damage
        if (e.dmg > 0 && !frozen && e.hitCd <= 0 && !(e.z > 24)) {
          const rr = e.r + p.r - 6;
          if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
            // a boss body-check throws you clear and waits longer before it can hit again (testers: THE MAJOR LABEL
            // pinned lv 80+ heroes and landed 4-6 contact hits of ~65 in a row)
            if (this.hurtPlayer(e.dmg * this.enemyDmgMul(), e.x, e.y, e.boss ? { knock: 620 } : undefined)) e.hitCd = e.boss ? 1.2 : 0.8;
          }
        }
        // recycle stragglers far away (keeps the pressure on you)
        if (!e.boss && !e.elite && !e.aiOver && e.type !== 'leak' && e.type !== 'exec' && e.state !== 'air') {
          if (Math.abs(e.x - p.x) > this.cam.vw * 0.72 + 90 || Math.abs(e.y - p.y) > this.cam.vh * 0.72 + 90) {
            // a straggler from an earlier enemy lineup leaves quietly off screen; the director refills with current types
            if (!RS.Director.inLineup(e.type)) { e.dead = true; continue; }
            const pos = RS.Director.spawnPos(this);
            if (pos) { e.x = pos.x; e.y = pos.y; e.kvx = e.kvy = 0; }
          }
        }
        if (e.ttl > 0) { e.ttl -= dt; if (e.ttl <= 0) { e.dead = true; continue; } }
        if (e.life > 0) {
          e.life -= dt;
          if (e.life <= 0) {
            e.dead = true;
            FX.burst(e.x, e.y, ['#ffcf3f', '#9cff35'], 16, 200);
            FX.banner('THE LEAK GOT AWAY', '', '#ffcf3f', 1.8);
            this.sfx('teleport');
          }
        }
      }
    },
  });

  // ---------------------------------------------------------------- behaviours
  const toward = (e, tx, ty, spd) => {
    const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1;
    e.vx = (dx / l) * spd; e.vy = (dy / l) * spd;
    return l;
  };

  const AI = {
    chase(G, e, p, dt, m) {
      e.lungeCd -= dt;
      if (e.state === 'windup') {
        e.st -= dt; e.vx = -Math.cos(e.ang) * 25; e.vy = -Math.sin(e.ang) * 25;
        if (e.st <= 0) { e.state = 'lunge'; e.st = 0.2; }
        return;
      }
      if (e.state === 'lunge') {
        e.st -= dt; e.vx = Math.cos(e.ang) * e.spd * 3.6 * m; e.vy = Math.sin(e.ang) * e.spd * 3.6 * m;
        if (e.st <= 0) { e.state = 'recover'; e.st = 0.45; }
        return;
      }
      if (e.state === 'recover') { e.st -= dt; e.vx *= U.damp(0.9, dt); e.vy *= U.damp(0.9, dt); if (e.st <= 0) e.state = 'move'; return; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      // shambling cadence: speed breathes a little; off screen and far behind they jog to catch up
      const spd = e.spd * m * (0.82 + 0.18 * Math.sin(G.time * 3.1 + e.ph)) * (d > 520 && !G.onScreen(e.x, e.y, 0) ? 1.45 : 1);
      let tx = p.x, ty = p.y;
      if (e.style === 'flank' && d > 120) {
        // aim at a point beside the player; it slides in as the enemy closes the distance
        const a = Math.atan2(-dy, -dx) + e.side * U.clamp((d - 120) / 400, 0, 1) * 1.1;
        tx = p.x + Math.cos(a) * Math.min(d * 0.55, 220); ty = p.y + Math.sin(a) * Math.min(d * 0.55, 220);
      } else if (e.style === 'intercept' && d > 90) {
        const lead = U.clamp(d / 260, 0, 1.1);
        tx = p.x + (p.vx || 0) * lead; ty = p.y + (p.vy || 0) * lead;
      }
      const a = Math.atan2(ty - e.y, tx - e.x) + Math.sin(G.time * 1.7 + e.ph) * 0.22;
      e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
      if (d < 80 && e.lungeCd <= 0 && G.onScreen(e.x, e.y, 0)) {
        if (!G.attackOkAt(p.x, p.y)) { e.lungeCd = U.rand(0.6, 1.2); return; } // attack budget full: keep walking, try again soon
        e.state = 'windup'; e.st = 0.42; e.ang = Math.atan2(dy, dx); e.lungeCd = U.rand(2.6, 4.5);
        G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.ang, len: 120, w: e.r * 1.6, warn: 0.42, dmg: 0, col: '#ff2448', follow: e, look: 'lunge' });
      }
    },
    // wave units: march along a heading that bends toward you (e.turn rad/s) until they have passed you
    stream(G, e, p, dt, m) {
      const tx = p.x - e.x, ty = p.y - e.y;
      if (e.turn && tx * e.dirX + ty * e.dirY > 40) { // still in front: steer
        const cur = Math.atan2(e.dirY, e.dirX), want = Math.atan2(ty, tx);
        const a = cur + U.clamp(U.angDiff(cur, want), -e.turn * dt, e.turn * dt);
        e.dirX = Math.cos(a); e.dirY = Math.sin(a);
      }
      e.vx = e.dirX * e.spd * m; e.vy = e.dirY * e.spd * m;
    },
    // flock that hunts you: aims a little ahead of you and swirls, so it wraps around instead of queueing up
    pack(G, e, p, dt, m) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const lead = U.clamp(d / 300, 0, 0.8);
      const tx = p.x + (p.vx || 0) * lead, ty = p.y + (p.vy || 0) * lead;
      const a = Math.atan2(ty - e.y, tx - e.x) + Math.sin(G.time * 2.3 + e.ph) * 0.5 * U.clamp(d / 200, 0.2, 1);
      const spd = e.spd * m * (d > 500 ? 1.35 : 1);
      e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
    },
    // closing ring: walk straight at you, all at the same pace, so the circle stays a circle
    close(G, e, p, dt, m) { toward(e, p.x, p.y, e.spd * m * (Math.hypot(p.x - e.x, p.y - e.y) > 600 ? 1.5 : 1)); },

    burst(G, e, p, dt, m) {
      e.st -= dt;
      if (e.state === 'move') {
        e.vx *= Math.exp(-8 * dt); e.vy *= Math.exp(-8 * dt);
        if (e.st <= 0) {
          e.state = 'dash'; e.st = 0.32;
          if (RS.Director.inDoor(G, p.x + Math.cos(e.flank) * 70, p.y + Math.sin(e.flank) * 70)) e.flank += (Math.random() < 0.5 ? -1 : 1) * 1.3; // dash beside the way out, not into it
          const tx = p.x + Math.cos(e.flank) * 70, ty = p.y + Math.sin(e.flank) * 70;
          toward(e, tx, ty, e.spd * m);
          e.flank += U.rand(-0.6, 0.6);
        }
      } else if (e.st <= 0) { e.state = 'move'; e.st = U.rand(0.45, 0.9); }
    },

    charger(G, e, p, dt, m) {
      e.cd -= dt; e.st -= dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (e.state === 'move') {
        toward(e, p.x, p.y, e.spd * m);
        if (d < 270 && e.cd <= 0 && !G.attackOkAt(p.x, p.y)) e.cd = U.rand(0.6, 1.2);
        else if (d < 270 && e.cd <= 0) {
          e.state = 'windup'; e.st = 0.7;
          e.ang = Math.atan2(p.y - e.y, p.x - e.x);
          G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.ang, len: 230, w: e.r * 2.2, warn: 0.7, dmg: 0, col: '#ff7a1a', trim: '#ffcf3f', follow: e, look: 'charge' });
        }
      } else if (e.state === 'windup') {
        e.vx = Math.sin(G.time * 47 + e.ph) * 30; e.vy = Math.cos(G.time * 41 + e.ph) * 30; // wind-up tremble (smooth, not per-frame noise)
        if (e.st <= 0) { e.state = 'charge'; e.st = 0.42; }
      } else if (e.state === 'charge') {
        e.vx = Math.cos(e.ang) * 520 * m; e.vy = Math.sin(e.ang) * 520 * m;
        if (U.per(0.5, dt)) FX.burst(e.x, e.y + 10, ['#ff2448', '#ff7a1a'], 1, 60, { size: 3, life: 0.2 });
        if (e.st <= 0) { e.state = 'recover'; e.st = 0.6; }
      } else {
        e.vx *= U.damp(0.9, dt); e.vy *= U.damp(0.9, dt);
        if (e.st <= 0) { e.state = 'move'; e.cd = U.rand(2.2, 3.5); }
      }
    },

    ranged(G, e, p, dt, m) {
      const sh = e.def.shot;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      e.cd -= dt;
      if (e.state === 'aim') { // planted: the aim line is locked at wind-up start, so a sidestep dodges it
        e.vx *= U.damp(0.85, dt); e.vy *= U.damp(0.85, dt);
        e.st -= dt;
        if (e.st <= 0) {
          e.state = 'move'; e.cd = sh.cd * U.rand(0.9, 1.25);
          const a = e.ang, spd = sh.speed * Math.min(1.35, 1 + G.time / 1200);
          G.eshot({ x: e.x, y: e.y - 6, angle: a, speed: spd, dmg: sh.dmg * e.dmgMul, r: 9, col: e.tier === 2 ? '#ff7a1a' : '#ff2448', life: 4 });
          if (e.elite) for (const off of [-0.3, 0.3]) G.eshot({ x: e.x, y: e.y - 6, angle: a + off, speed: spd * 0.9, dmg: sh.dmg * e.dmgMul, r: 8, col: '#ff2448', life: 4 });
          G.sfx('shoot_e');
        }
        return;
      }
      if (d > sh.range) toward(e, p.x, p.y, e.spd * m);
      else if (d < sh.range - 90) toward(e, e.x - (p.x - e.x), e.y - (p.y - e.y), e.spd * m * 0.8);
      else { const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2; e.vx = Math.cos(a) * e.spd * 0.5 * m; e.vy = Math.sin(a) * e.spd * 0.5 * m; }
      // fires only from fully on screen, not point blank, and only when the shared fire budget allows it
      if (e.cd <= 0 && d > 130 && d < sh.range + 80 && G.onScreen(e.x, e.y, -40)) {
        if (!G.attackOk() || !G.canFire(e.elite ? 3 : 1)) e.cd = U.rand(0.6, 1.2);
        else {
          e.state = 'aim'; e.st = 0.75;
          e.ang = Math.atan2(p.y - e.y, p.x - e.x);
          G.telegraph({ kind: 'line', x: e.x, y: e.y - 6, ang: e.ang, len: Math.min(d + 60, 420), w: 5, warn: 0.75, dmg: 0, col: '#ff2448', sight: true, src: e });
        }
      }
    },

    summoner(G, e, p, dt, m) {
      toward(e, p.x, p.y, e.spd * m);
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 6.5;
        if (G.enemies.count < 560) {
          for (let i = 0; i < 3; i++) {
            const a = U.rand(U.TAU);
            const n = G.spawnEnemy('npc', e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, { tier: e.tier, hpMul: RS.Director.hpMul(G), telegraph: true });
            n.kvx = Math.cos(a) * 150; n.kvy = Math.sin(a) * 150;
          }
          FX.ring(e.x, e.y, 70, '#d0142c', 0.4, 3);
          FX.text(e.x, e.y - 40, 'SIGNED!', '#ff2448', 12, { always: true, life: 0.9 });
        }
      }
    },

    blink(G, e, p, dt, m) {
      e.cd -= dt;
      if (e.state === 'blinkwarn') {
        e.st -= dt; e.vx = 0; e.vy = 0; e.glitchT = 0.1;
        if (e.st <= 0) {
          FX.burst(e.x, e.y, ['#c81e3c', '#e3ece6'], 6, 120);
          e.x = e.bx; e.y = e.by;
          FX.burst(e.x, e.y, ['#c81e3c', '#e3ece6'], 6, 120);
          e.state = 'move'; e.cd = U.rand(1.6, 3);
          G.sfx('teleport');
        }
        return;
      }
      toward(e, p.x, p.y, e.spd * m);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (e.cd <= 0 && d > 140 && d < 700) {
        const a = Math.atan2(p.y - e.y, p.x - e.x) + U.rand(-0.5, 0.5);
        const jump = Math.min(d - 80, U.rand(110, 160));
        e.bx = U.clamp(e.x + Math.cos(a) * jump, 30, G.arena.w - 30);
        e.by = U.clamp(e.y + Math.sin(a) * jump, 30, G.arena.h - 30);
        if (RS.Director.inDoor(G, e.bx, e.by)) { e.cd = U.rand(0.4, 0.8); return; } // never blink into the hero's way out
        e.state = 'blinkwarn'; e.st = 0.38;
      }
    },

    slammer(G, e, p, dt, m) {
      e.cd -= dt;
      if (e.state === 'windup') {
        e.vx = 0; e.vy = 0; e.st -= dt;
        if (e.st <= 0) { e.state = 'move'; e.cd = U.rand(2.6, 3.6); }
        return;
      }
      toward(e, p.x, p.y, e.spd * m);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 125 && e.cd <= 0 && !G.attackOkAt(p.x, p.y)) e.cd = U.rand(0.6, 1.2);
      else if (d < 125 && e.cd <= 0) {
        e.state = 'windup'; e.st = 0.85;
        G.telegraph({ kind: 'circle', x: e.x, y: e.y, r: 108 * (e.elite ? 1.3 : 1), warn: 0.8, dmg: e.dmg * 1.1, knock: 520, col: '#ff2448', look: 'slam',
          onFire: (t) => { FX.shake(0.25); G.sfx('slam'); FX.burst(t.x, t.y, ['#5a4a3a', '#2a2a2a', '#ff2448'], 14, 260); } });
        G.sfx('telegraph');
      }
    },

    // security: closes in, plants its feet and sweeps a flashlight beam; getting caught slows you
    guard(G, e, p, dt, m) {
      e.cd -= dt;
      if (e.state === 'aim') { e.vx *= U.damp(0.8, dt); e.vy *= U.damp(0.8, dt); e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = U.rand(3.2, 4.6); } return; }
      toward(e, p.x, p.y, e.spd * m);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 330 && d > 90 && e.cd <= 0 && G.onScreen(e.x, e.y, -30) && G.attackOkAt(p.x, p.y)) {
        e.state = 'aim'; e.st = 0.95;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        G.telegraph({ kind: 'line', x: e.x, y: e.y - 6, ang, len: 380, w: 46, warn: 0.75, dmg: e.dmg * 0.45, knock: 90, col: '#fff1a0', fx: 'flashlight',
          onFire: (t) => {
            if (G.inTele(t, p.x, p.y, p.r * 0.5)) { p.slowT = 1.1; p.slowAmt = 0.3; FX.text(p.x, p.y - 46, 'SPOTTED', '#fff1a0', 13, { always: true, life: 0.8 }); }
            for (let k = 0; k < 6; k++) FX.burst(t.x + Math.cos(t.ang) * k * 60, t.y + Math.sin(t.ang) * k * 60, ['#fff6c8', '#ffffff'], 1, 40, { size: 3, life: 0.25 });
          } });
        G.sfx('telegraph');
      }
    },

    // pink pony: orbits you at a distance, rears up, then gallops through your position
    gallop(G, e, p, dt, m) {
      e.cd -= dt; e.st -= dt;
      if (e.state === 'windup') { e.vx *= U.damp(0.85, dt); e.vy *= U.damp(0.85, dt); if (e.st <= 0) { e.state = 'charge'; e.st = e.chargeT; G.sfx('neigh'); } return; }
      if (e.state === 'charge') {
        e.vx = Math.cos(e.ang) * 640 * m; e.vy = Math.sin(e.ang) * 640 * m;
        if (U.per(0.7, dt)) FX.burst(e.x, e.y + 8, ['#ff6ad5', '#9fe9ff', '#fff36a', '#ffffff'], 1, 50, { size: 3, life: 0.5 });
        if (e.st <= 0) { e.state = 'recover'; e.st = 0.5; }
        return;
      }
      if (e.state === 'recover') { e.vx *= U.damp(0.9, dt); e.vy *= U.damp(0.9, dt); if (e.st <= 0) { e.state = 'move'; e.cd = U.rand(4.5, 6.5); } return; }
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      // circle at ~280px, drifting in when far
      e.flank += dt * 0.9 * e.side;
      const R = d > 520 ? d * 0.6 : 280;
      toward(e, p.x + Math.cos(e.flank) * R, p.y + Math.sin(e.flank) * R, e.spd * m);
      if (e.cd <= 0 && d < 460 && G.onScreen(e.x, e.y, -20)) {
        // shared pony budget (Game.ponyOk): one gallop at a time, then a shared rest; the hero's spot must be free of
        // other warnings. The rest keep circling and try again a moment later
        if (!G.ponyOk() || !G.attackOkAt(p.x, p.y, 1)) { e.cd = U.rand(0.8, 1.6); return; }
        e.state = 'windup'; e.st = 0.75;
        e.ang = Math.atan2(p.y - e.y, p.x - e.x);
        const len = d + 260; e.chargeT = len / 640;
        G.ponyNext = G.time + e.st + e.chargeT + PONY_REST; // the next pony waits until this gallop is over, and a bit more
        G.telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.ang, len, w: e.r * 2.4, warn: 0.75, dmg: 0, col: '#ff6ad5', look: 'gallop' });
      }
    },

    // stretched man: shuffles closer, winds up and whips an absurdly long arm along a line
    reach(G, e, p, dt, m) {
      e.cd -= dt; e.st -= dt; e.reachT -= dt;
      if (e.state === 'windup') { e.vx = 0; e.vy = 0; if (e.st <= 0) { e.state = 'recover'; e.st = 0.55; e.reachT = 0.3; } return; }
      if (e.state === 'recover') { e.vx *= U.damp(0.8, dt); e.vy *= U.damp(0.8, dt); if (e.st <= 0) { e.state = 'move'; e.cd = U.rand(2.4, 3.6); } return; }
      toward(e, p.x, p.y, e.spd * m * (0.8 + 0.4 * Math.sin(G.time * 2 + e.ph)));
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 300 && e.cd <= 0 && G.onScreen(e.x, e.y, 0) && G.attackOkAt(p.x, p.y)) {
        e.state = 'windup'; e.st = 0.8;
        e.ang = Math.atan2(p.y - e.y, p.x - e.x);
        // 75% damage, softer shove: the arm was the top damage source in the NORMAL bot runs (it threw you into the crowd)
        G.telegraph({ kind: 'line', x: e.x, y: e.y - 10, ang: e.ang, len: 330, w: 34, warn: 0.8, dmg: e.dmg * 0.75, knock: 260, col: '#b9a7ff', look: 'whip',
          onFire: (t) => { G.sfx('whip'); FX.burst(t.x + Math.cos(t.ang) * 300, t.y + Math.sin(t.ang) * 300, ['#b9a7ff', '#efe7ff'], 8, 160); } });
      }
    },

    // shuffle ghost: snaps between dance steps on the beat; every 4th beat it spins out a ring of notes
    dance(G, e, p, dt, m) {
      const sh = e.def.shot, bt = G.time * 2.5 + e.ph, bi = Math.floor(bt), fr = bt - bi;
      e.spinT -= dt; e.windT = (e.windT || 0) - dt;
      if (bi !== e.beat) {
        e.beat = bi;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        e.ang = Math.atan2(p.y - e.y, p.x - e.x) + (d < 200 ? e.side * 1.4 : U.rand(-0.9, 0.9));
        const n = e.elite ? 10 : 6;
        if (bi % 8 === 7) e.windT = d < 560 && G.onScreen(e.x, e.y, -30) && G.canFire(n / 2) ? 0.4 : 0; // wind-up beat
        else if (bi % 8 === 0 && e.windT > -0.2 && e.charged) {
          e.spinT = 0.45;
          for (let i = 0; i < n; i++) G.eshot({ x: e.x, y: e.y - 8, angle: (i / n) * U.TAU + bi * 0.37, speed: sh.speed, dmg: sh.dmg * e.dmgMul, r: 7, col: '#3ff2ff', life: 3.5 });
          G.sfx('shoot_e');
        }
        e.charged = bi % 8 === 7 && e.windT > 0;
      }
      const go = fr < 0.42 && e.spinT <= 0 && !e.charged ? 1 : 0;
      e.vx = Math.cos(e.ang) * e.spd * m * go; e.vy = Math.sin(e.ang) * e.spd * m * go;
      e.anim = bi % 4 + 0.5; // dance pose follows the beat
    },

    // giant sneaker: hops toward you; the landing spot is telegraphed by its shadow and stomps on impact. The stomp
    // has its own soft thud ('stomp' in core/audio.js, one per 0.4 s for the whole herd): it used the boss 'slam', and a
    // trip-peak ring of five sneakers landing together hit like a wall of sub-bass
    hop(G, e, p, dt, m) {
      e.vx = 0; e.vy = 0;
      if (e.state === 'air') {
        e.st += dt * m;
        const k = Math.min(1, e.st / e.hopT);
        e.x = U.lerp(e.hx0, e.hx1, k); e.y = U.lerp(e.hy0, e.hy1, k);
        e.z = Math.sin(k * Math.PI) * 110;
        if (k >= 1) { e.z = 0; e.state = 'move'; e.cd = U.rand(0.45, 0.8); }
        return;
      }
      e.z = 0; e.cd -= dt * m;
      if (e.cd <= 0) {
        const d = Math.hypot(p.x - e.x, p.y - e.y), ang = Math.atan2(p.y - e.y, p.x - e.x), jump = Math.min(d, 250);
        e.hx0 = e.x; e.hy0 = e.y;
        e.hx1 = U.clamp(e.x + Math.cos(ang) * jump, 40, G.arena.w - 40); e.hy1 = U.clamp(e.y + Math.sin(ang) * jump, 40, G.arena.h - 40);
        e.hopT = 0.85; e.st = 0; e.state = 'air';
        // only a landing next to the hero stomps (hops across the screen used to dot the floor with green circles); a
        // crowded landing spot is a plain hop too
        if (Math.abs(p.x - e.hx1) > 2 && Math.hypot(p.x - e.hx1, p.y - e.hy1) < 200 && G.attackOkAt(e.hx1, e.hy1)) {
          G.telegraph({ kind: 'circle', x: e.hx1, y: e.hy1, r: 74 * (e.elite ? 1.3 : 1), warn: e.hopT / m, dmg: e.dmg, knock: 440, col: '#ff2448', look: 'stomp',
            onFire: (t) => { FX.shake(0.18); G.sfx('stomp'); FX.burst(t.x, t.y, ['#f2f2ec', '#9aa3b2', '#ff2448'], 10, 220); } });
        }
      }
    },

    // melting smiley: wobbly drift that sways side to side as it closes in
    drift(G, e, p, dt, m) {
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(G.time * 1.3 + e.ph) * 1.1;
      const spd = e.spd * m * (0.75 + 0.35 * Math.sin(G.time * 2.2 + e.ph));
      e.vx = Math.cos(a) * spd; e.vy = Math.sin(a) * spd;
    },

    flee(G, e, p, dt, m) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      e.ang += U.rand(-2, 2) * dt;
      if (d < 520) {
        const a = Math.atan2(e.y - p.y, e.x - p.x) + Math.sin(G.time * 2 + e.id) * 0.6;
        e.vx = Math.cos(a) * e.spd * m; e.vy = Math.sin(a) * e.spd * m;
      } else { e.vx = Math.cos(e.ang) * e.spd * 0.4; e.vy = Math.sin(e.ang) * e.spd * 0.4; }
      // bounce off walls by steering inward
      const A = G.arena;
      if (e.x < 120) e.vx = Math.abs(e.vx) + 40; if (e.x > A.w - 120) e.vx = -Math.abs(e.vx) - 40;
      if (e.y < 120) e.vy = Math.abs(e.vy) + 40; if (e.y > A.h - 120) e.vy = -Math.abs(e.vy) - 40;
      if (U.per(0.3, dt)) FX.burst(e.x, e.y + 14, ['#ffcf3f', '#d9a520'], 1, 20, { size: 3, life: 0.6, grav: 90 });
    },
  };
  RS.EnemyAI = AI;
})(window.RS);
