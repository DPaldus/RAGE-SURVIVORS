'use strict';
// Player: stats aggregation, movement, dash, character abilities, XP and inventory.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data, Input = RS.Input;
  const BASE_SPEED = 178; // enemies must be able to keep up: a fan walks at ~half your speed, not a quarter

  function freshBonus() {
    return { maxHp: 0, might: 0, cooldown: 1, moveSpeed: 0, critChance: 0, critMult: 0, area: 0, magnet: 0, luck: 0, dashCd: 1,
      duration: 0, armor: 0, regen: 0, growth: 0, amount: 0, momentum: 0, abilityDur: 0, abilityCd: 1, luckBurst: 0, auraMul: 0 };
  }

  class Player {
    constructor(charId, cfg) {
      this.id = charId;
      this.char = D.CHARACTERS[charId];
      this.cos = cfg.cos || {};
      this.spr = RS.Sprites.hero(charId, this.cos);
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.kvx = 0; this.kvy = 0; this.r = 14;
      this.aimX = 1; this.aimY = 0; this.facing = 1;
      this.level = 1; this.xp = 0; this.xpNext = 12; this.pendingLevels = 0;
      this.weapons = []; this.passives = []; this.thumbs = []; this.buffs = []; this.syn = []; this.synSig = -1;
      this.tapes = []; // TAPES (data/build.js): { id, def, level }
      this.passiveState = {};
      this.bonus = freshBonus();
      this.s = {};
      this.dash = { cd: 0, t: 0, dx: 1, dy: 0, speed: 0 };
      this.ability = { cd: 8, t: 0, max: this.char.active.dur };
      this.invuln = 0; this.hurtFlash = 0; this.shield = 0; this.revives = 0; this.flags = {};
      this.streak = 0; this.streakT = 0; this.momentumT = 0; this.movingT = 0; this.bestStreak = 0;
      const perk = (id) => RS.Save.perk(id);
      this.maxWeapons = D.BUILD.weaponSlots + (RS.Save.isUnlocked('slots', 'slot4') ? 1 : 0) + perk('slot'); // WAVE 15, FEATURE SLOT perk
      this.maxTapes = D.BUILD.tapeSlots + perk('bside'); // B-SIDE perk
      this.rerolls = 2 + perk('reroll');
      this.banishes = 1 + perk('banish');
      this.banished = new Set();
      this.anim = 0; this.moving = false;
      this.trail = [];
      this.highGround = false;
      this.auraT = 0; this.grillzT = 0; this.grillzHeal = 0;
      this.dead = false;
      RS.Stash.initPlayer(this);
      this.recalc();
      this.hp = this.s.maxHp;
    }

    // ---------------------------------------------------------- stats
    recalc() {
      const C = this.char.stats, b = this.bonus, s = this.s, G = RS.Game;
      const perk = (id) => RS.Save.perk(id);
      s.maxHp = C.hp + perk('hp') * 10 + b.maxHp;
      s.regen = C.regen + perk('regen') * 0.15 + b.regen;
      s.armor = C.armor + perk('armor') + b.armor;
      s.evasion = 0;
      s.moveSpeed = C.moveSpeed * (1 + perk('speed') * 0.03 + b.moveSpeed);
      s.might = C.might * (1 + perk('might') * 0.05 + b.might);
      s.area = 1 + b.area;
      s.cooldown = C.cooldown * b.cooldown;
      s.duration = 1 + b.duration;
      s.amount = b.amount;
      s.projSpeed = 1; s.range = 1;
      s.magnet = 135 * (1 + perk('magnet') * 0.08 + b.magnet);
      s.luck = C.luck * (1 + perk('luck') * 0.05 + b.luck);
      s.growth = 1 + perk('growth') * 0.04 + b.growth;
      s.greed = 1 + perk('greed') * 0.08;
      s.critChance = 0.05 + b.critChance;
      s.critMult = 2 + b.critMult;
      s.knockback = 1;
      s.dashCd = 2.1 * (1 - perk('dash') * 0.05) * b.dashCd;
      s.dashDist = 1;
      s.sonicDmg = 1; s.sonicArea = 1;
      s.dmgTaken = 1;
      s.knockResist = C.knockResist;
      s.accuracy = 1;
      s.abilityCd = b.abilityCd;
      s.consumableChance = 1;
      s.chestBonus = 0; s.eliteBonus = 0;
      s.itemPower = (G && G.mapMode && G.mapMode.itemPower) || 1; // NORMAL: passive items +20% (data/arenas.js)
      s.echo = 0; s.momentumDmg = 0; s.knockProc = 0; s.coinChance = 0.02; s.healMult = 1; s.rarityLuck = 0;
      // the 2021 drop (data/items.js) and the synergies that read them (data/synergies.js)
      s.reverb = 0; s.reverbField = 0; s.reverbWide = 1; s.bellPow = 0; s.bellEvery = 8; s.bellMul = 1; s.vamp = 0; s.vampCap = 0;
      s.burner = 0; s.burnerDur = 1; s.groupBuy = 0; s.tagEvery = 0; s.tagPierce = 0; s.chaosFast = 1;
      // the hidden build layer (data/builds.js): resonance flags and the synergies that need a hook of their own
      s.pierce = 0; s.critEcho = 0; s.cdFloor = 0.45; s.sonicSlow = 0; s.dashHit = 0; s.echoPow = 0.5; s.cloutDmg = 0; s.bossDmg = 0; s.critCoin = 0; s.hazeHeal = 0;
      RS.Stash.stats(s); // stash items (data/stash.js)
      s.wmods = {}; // per-weapon multipliers from weapon synergies (data/build.js)
      if (this.ability.t > 0 && this.id === 'schmunk') s.itemPower *= 1.4;
      for (const it of this.passives) {
        const l = it.level + (it.ghost || 0);
        it.def.apply(s, l * s.itemPower, it.level, this);
      }
      RS.Stash.applyAll(s, this);
      this.checkBuild();
      for (const sy of this.syn) sy.apply(s, this);
      for (const k in this.res) if (this.res[k]) D.RESONANCE[k](s, this.res[k]);
      // BAG SECURED III: unspent run CL0UT is power (+1% damage per 20, up to +50%): hoard it or spend it at THE PLUG
      if (s.cloutDmg && G && G.p === this) s.might *= 1 + Math.min(0.5, (G.runClout || 0) / 2000);
      for (const th of this.thumbs) if (th.def.apply) th.def.apply(s, this, th.st);
      for (const bf of this.buffs) if (bf.apply) bf.apply(s);
      if (this.ability.t > 0 && this.id === 'twizzy') { s.cooldown *= 0.8; s.moveSpeed *= 1.12; s.knockResist = 1; }
      if (this.momentumT > 0) s.moveSpeed *= 1.07 + b.momentum;
      RS.Stash.post(s, this);
      s.evasion = Math.min(0.6, s.evasion);
      s.amount = Math.min(3, s.amount); // +3 projectiles / zones at most from all sources: past that every weapon just multiplied
      s.cooldown = Math.max(s.cdFloor, s.cooldown); // at most ~2.2x the base fire rate from stats (~2.6x at NO BRAKES III)
      s.moveSpeed = Math.min(s.moveSpeed, C.moveSpeed * 1.45); // speed stacking stops at +45%
      s.knockResist = U.clamp(s.knockResist, 0, 1);
      s.maxHp = Math.max(1, Math.round(s.maxHp));
      s.dashCd = Math.max(0.9, s.dashCd);
      const cap = s.maxHp * (1 + s.overheal); // CHONK DRIP / GASSED let healing go past max HP
      if (this.hp > cap) this.hp = cap;
    }

    // The hidden build layer, re-checked only when the inventory changes (count, levels, an evolution, a thumb):
    //  - a synergy switches on once every piece it needs is held (weapons count in their evolved form too);
    //  - resonance: tag points (data/builds.js) -> tier 1-3 per tag at D.RES_AT.
    checkBuild() {
      let sig = this.weapons.length * 1e6 + this.passives.length * 1e4 + this.thumbs.length * 100 + this.stashOrder.length * 1e8;
      for (const w of this.weapons) if (w.def.evolved) sig += 1000;
      for (const it of this.passives) sig += it.level;
      for (const t of this.tapes) sig += 1e5 + t.level * 31;
      if (sig === this.synSig) return;
      this.synSig = sig;
      const tapeOn = (t) => t && t.level >= Math.min(D.BUILD.tapeSynLevel, t.def.max); // a TAPE counts from LV 3
      const has = (id) => (D.TAPES[id] ? tapeOn(this.hasTape(id)) : D.STASH[id] ? !!this.stash[id] : D.PASSIVES[id] ? this.hasPassive(id) : this.hasWeapon(id));
      const G = RS.Game, live = G && G.p === this; // (also from a level-up card or chest: banners show once the run resumes)
      for (const sy of D.SYNERGIES || []) {
        if (this.syn.includes(sy) || !sy.needs.every(has)) continue;
        this.syn.push(sy);
        if (!live) continue;
        const first = G.discover('synergies', sy.id);
        FX.banner('SYNERGY' + (first ? ' · NEW' : ''), sy.name, sy.col, 2.4);
        FX.ring(this.x, this.y, 120, sy.col, 0.5, 5, 0.15);
        G.sfx('thumb');
        G.stats.synergies = (G.stats.synergies || 0) + 1;
      }
      const pts = this.resPts = {}, T = D.ITEM_TAGS || {};
      const add = (id, n) => { for (const t of T[id] || []) pts[t] = (pts[t] || 0) + n; };
      for (const w of this.weapons) add(w.def.id, w.def.evolved ? 2 : 1);
      for (const it of this.passives) add(it.id, it.level >= it.def.max ? 2 : 1);
      for (const th of this.thumbs) add(th.id, 1);
      for (const t of this.tapes) if (tapeOn(t)) add(t.id, 1);
      const res = this.res = this.res || {};
      for (const k in D.TAGS) {
        const at = D.RES_AT, n = pts[k] || 0, tier = n >= at[2] ? 3 : n >= at[1] ? 2 : n >= at[0] ? 1 : 0;
        if (tier > (res[k] || 0) && live) { // tiers only ever climb: the build is the build
          const tg = D.TAGS[k];
          FX.banner(tg.name + ' ' + ['', 'I', 'II', 'III'][tier], 'the build is cooking', tg.col, 2, true);
          FX.ring(this.x, this.y, 90 + 30 * tier, tg.col, 0.45, 4, 0.12);
          G.sfx('rare');
        }
        res[k] = Math.max(res[k] || 0, tier);
      }
    }

    addBuff(b) {
      const ex = this.buffs.find((x) => x.id === b.id);
      if (ex) { Object.assign(ex, b); ex.max = b.t; return; }
      b.max = b.t;
      this.buffs.push(b);
    }

    // ---------------------------------------------------------- inventory
    addWeapon(id) {
      const G = RS.Game;
      const w = G.makeWeapon(id);
      w.gotLevel = this.level; // its upgrades are favoured for a few levels (Progression.focus)
      this.weapons.push(w);
      G.discover('weapons', id);
      G.stats.itemsCollected++;
      return w;
    }
    addPassive(id) {
      const G = RS.Game;
      const def = D.PASSIVES[id];
      const it = { id, def, level: 1, ghost: 0 };
      this.passives.push(it);
      this.passiveState[id] = {};
      G.discover('items', id);
      G.stats.itemsCollected++;
      this.recalc();
      return it;
    }
    hasPassive(id) { return this.passives.find((x) => x.id === id); }
    addTape(id) {
      const G = RS.Game;
      const t = { id, def: D.TAPES[id], level: 0 };
      this.tapes.push(t);
      G.discover('items', id);
      G.stats.itemsCollected++;
      return t;
    }
    hasTape(id) { return this.tapes.find((x) => x.id === id); }
    hasWeapon(id) { return this.weapons.find((w) => w.def.id === id || w.def.from === id); }
    addThumb(id) {
      const G = RS.Game;
      const def = D.THUMBS[id];
      const th = { id, def, st: {} };
      this.thumbs.push(th);
      G.discover('thumbs', id);
      G.stats.thumbs++;
      if (def.onPick) def.onPick(this, G);
      this.recalc();
    }

    gainXp(v) {
      const G = RS.Game;
      this.xp += v * this.s.growth;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.pendingLevels++;
        // survivors pacing: quick first levels, then a steady climb (the bot reaches about level 12 at 5:00 with the denser crowd;
        // the older curves reached 15 there, or 26 before that, with level-ups in bursts)
        const L = this.level - 1;
        // 30-minute run: lv ~17 at 5:00 and ~33 at 10:00 with the early XP boost (D.TIMELINE.xp); was 15.7 / 31.7
        // from LV 30 each level costs a bit more on top (+15% at LV 60, +39% at LV 80): bot runs with all perks reached
        // LV 83-101 at 30:00 on NORMAL with the crowd melting on arrival (2026-10-27)
        const late = Math.max(0, L - 30);
        this.xpNext = Math.round(10 + 8 * L + 1.4 * L * L + 0.03 * late * late * late);
        G.stats.maxLevel = this.level;
        // every level-up patches you up a little (8% max HP): runs died "worn down" by chip hits with nothing to heal
        // them, so keeping up the kill pace now keeps you alive (~25-35 HP a minute at 5:00-9:00)
        G.heal(this.s.maxHp * 0.08);
        for (const it of this.passives) if (it.def.onLevel) it.def.onLevel(this, G, it.level);
        for (const th of this.thumbs) if (th.def.onLevel) th.def.onLevel(this, G, th.st);
      }
    }

    onKill(e) {
      const G = RS.Game;
      this.streak = this.streakT > 0 ? this.streak + 1 : 1;
      this.streakT = 1.6;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (this.id === 'twizzy') this.momentumT = Math.min(3, 0.9 + 0.08 * this.streak);
      if (this.id === 'twizzy' && this.ability.t > 0 && Math.random() < 0.35) G.dropXp(e.x + U.rand(-10, 10), e.y + U.rand(-10, 10), Math.max(1, e.xp));
      if (this.flags.viral && Math.random() < 0.04) {
        const t = G.nearest(e.x, e.y, 400, e);
        G.proj({ x: e.x, y: e.y, angle: U.rand(U.TAU), speed: 260, r: 7, dmg: 0, pierce: 0, life: 2, kind: 'heart', col: '#ff4f6e', w: null, homing: 7, target: t, noHitDmg: true,
          onEnd: (pr, G2) => G2.aoe(pr.x, pr.y, 60, 30 * this.s.might, { ring: '#ff4f6e', knock: 150, src: 'viral' }) });
      }
      for (const th of this.thumbs) if (th.def.onKill) th.def.onKill(this, G, e, th.st);
      for (const it of this.passives) if (it.def.onKill) it.def.onKill(this, G, e, it.level, this.passiveState[it.id]);
      // life on kill (VAMP FANGS, VAMP ANTHEM, VAMPED III) from a per-second budget, so a crowd melting at once is no full heal
      const s = this.s;
      if (s.vamp > 0 && this.vampBud > 0 && this.hp < RS.Stash.cap(this)) {
        const h = Math.min(s.vamp, this.vampBud);
        this.vampBud -= h; RS.Stash.heal(G, h, true);
        if (G.time - (this.vampFx || 0) > 0.45) { this.vampFx = G.time; FX.burst(this.x, this.y - 8, ['#ff2448', '#7a0a16'], 3, 70, { size: 3, life: 0.35, grav: -120 }); }
      }
      RS.Stash.onKill(G, this, e);
    }

    // ---------------------------------------------------------- abilities
    useAbility(G) {
      if (this.ability.cd > 0 || this.ability.t > 0) return;
      const A = this.char.active;
      this.ability.t = this.ability.max = A.dur + this.bonus.abilityDur;
      this.ability.cd = A.cd * this.s.abilityCd;
      G.sfx('ability');
      FX.shake(0.25); FX.glitch(0.25);
      if (this.id === 'twizzy') {
        FX.banner('TOO TURNT', '', '#ff2448', 1.4);
        FX.ring(this.x, this.y, 140, '#ff2448', 0.4, 6, 0.2);
        G.aoe(this.x, this.y, 120, 10, { knock: 400, noCrit: true, src: 'ability' });
      } else {
        FX.banner('SCHMUNK MODE', '', '#9cff35', 1.4);
        FX.ring(this.x, this.y, 160, '#9cff35', 0.45, 6, 0.2);
      }
    }
    auraRadius() { return (110 + 18 * this.synergyCount()) * (1 + this.bonus.auraMul) * this.s.area; }
    synergyCount() { return Math.min(8, this.weapons.filter((w) => w.def.evolved).length + this.thumbs.length); }

    startDash(G, mx, my) {
      let dx = mx, dy = my;
      if (Math.hypot(dx, dy) < 0.1) { dx = this.aimX; dy = this.aimY; }
      const l = Math.hypot(dx, dy) || 1;
      this.dash.dx = dx / l; this.dash.dy = dy / l;
      this.dash.t = 0.16;
      this.dash.speed = 980 * this.s.dashDist;
      this.dash.cd = this.s.dashCd;
      this.dashHits = this.dashHits || new Set(); this.dashHits.clear();
      this.invuln = Math.max(this.invuln, 0.12 + this.s.dashIframe);
      this.hangT = 0;
      RS.Stash.onDash(G, this);
      G.sfx('dash');
      FX.burst(this.x, this.y + 18, ['#cfd6e3', '#ff2448', '#e3ece6'], 8, 160, { size: 3, life: 0.25 });
    }

    // ---------------------------------------------------------- update
    update(dt, G) {
      const s = this.s;
      this.invuln -= dt; this.hurtFlash -= dt;
      this.sq = this.dash.t > 0 ? 0.14 : (this.sq || 0) * Math.exp(-13 * dt); // squash / stretch settles in ~0.2 s (render.js)
      this.streakT -= dt; if (this.streakT <= 0) this.streak = 0;
      this.momentumT -= dt;
      this.dash.cd -= dt;
      if (this.ability.t > 0) { this.ability.t -= dt; if (this.ability.t <= 0) this.ability.t = 0; }
      else this.ability.cd -= dt;
      for (let i = this.buffs.length - 1; i >= 0; i--) {
        const b = this.buffs[i];
        b.t -= dt;
        if (b.t <= 0) { this.buffs.splice(i, 1); if (b.onEnd) b.onEnd(this, G); }
      }
      this.recalc();
      if (s.regen > 0 && this.hp < RS.Stash.cap(this)) RS.Stash.heal(G, s.regen * dt / s.healMult, true); // regen is not scaled by heal power
      this.vampBud = Math.min(s.vampCap, (this.vampBud || 0) + s.vampCap * dt);

      // trail for afterimages
      this.trail.unshift({ x: this.x, y: this.y, t: G.time, f: this.frame(), fl: this.facing < 0 });
      if (this.trail.length > 8) this.trail.pop();

      const mv = Input.move();
      this.moving = Math.hypot(mv.x, mv.y) > 0.1;
      if (this.moving) {
        const l = Math.hypot(mv.x, mv.y);
        this.aimX = mv.x / l; this.aimY = mv.y / l;
        if (Math.abs(mv.x) > 0.15) this.facing = mv.x < 0 ? -1 : 1;
        this.movingT += dt;
      } else this.movingT = 0;

      // dash buffer: a press up to 0.2 s before the dash is ready (or during the previous dash) still fires it
      this.dashBuf = Input.pressed('dash') ? 0.2 : (this.dashBuf || 0) - dt;
      if (this.dashBuf > 0 && this.dash.cd <= 0 && this.dash.t <= 0) { this.dashBuf = 0; this.startDash(G, mv.x, mv.y); }
      if (G.nearChest && Input.pressed('interact')) G.openChest(G.nearChest); // E at a chest opens it, never the ability
      else if (G.nearPlug && Input.pressed('interact')) G.usePlug(); // E at THE PLUG opens his deal
      else if (Input.pressed('ability')) this.useAbility(G);

      const climb = 1;
      if (this.dash.t > 0) {
        this.dash.t -= dt;
        this.vx = this.dash.dx * this.dash.speed; this.vy = this.dash.dy * this.dash.speed;
        if (U.per(0.6, dt)) FX.burst(this.x, this.y + 16, ['#cfd6e3', '#ff2448'], 1, 60, { size: 3, life: 0.2 });
        if (s.dashHit) { // OUTSIDE III: the dash cuts through whatever it passes, once per enemy per dash
          for (const e of G.inRadius(this.x, this.y, this.r + 26)) {
            if (this.dashHits.has(e.id)) continue;
            this.dashHits.add(e.id);
            G.damage(e, 30 + this.level * 2, { knock: 320, kx: this.dash.dx, ky: this.dash.dy, src: 'dash', color: '#e3ece6' });
          }
        }
        if (this.dash.t <= 0) { this.vx *= 0.35; this.vy *= 0.35; this.sq = -0.1; this.hangT = s.hang; } // a small squash as the dash bites; airtime (stash) follows
      } else {
        // enemy debuffs (security flashlight, glitter trails) slow you down for a moment
        this.slowT = (this.slowT || 0) - dt;
        this.drinkT = (this.drinkT || 0) - dt; this.pickT = (this.pickT || 0) - dt;
        const sp = BASE_SPEED * s.moveSpeed * climb * (this.slowT > 0 ? 1 - (this.slowAmt || 0) : 1);
        const tx = mv.x * sp, ty = mv.y * sp;
        // exponential approach (frame-rate independent). Turning against your own momentum snaps faster than easing in,
        // so a dodge to the opposite side does not drift; letting go stops in ~0.15 s.
        const against = this.moving && tx * this.vx + ty * this.vy < 0;
        const acc = against ? 26 : this.moving ? 18 : 15;
        const k = 1 - Math.exp(-acc * dt);
        this.vx += (tx - this.vx) * k; this.vy += (ty - this.vy) * k;
      }
      const kd = Math.exp(-9 * dt);
      this.kvx *= kd; this.kvy *= kd;
      this.x += (this.vx + this.kvx) * dt;
      this.y += (this.vy + this.kvy) * dt;
      RS.Arena.collide(G.arena, this, true);

      // arena features
      this.highGround = RS.Arena.onPlatform(G.arena, this.x, this.y);

      // the walk cycle advances with the real speed: slowed, easing in or coasting to a stop, the feet keep pace
      const vrel = Math.hypot(this.vx, this.vy) / BASE_SPEED;
      this.anim += dt * (this.moving || vrel > 0.35 ? 9 * U.clamp(vrel, 0.45, 1.6) : 3);

      // character ability effects
      if (this.ability.t > 0) {
        if (this.id === 'schmunk') {
          this.auraT -= dt;
          if (this.auraT <= 0) {
            this.auraT = 0.3;
            const R = this.auraRadius();
            const dmg = (10 + this.level * 0.6) * (1 + 0.25 * this.synergyCount()) * (1 + this.bonus.auraMul);
            G.aoe(this.x, this.y, R, dmg, { knock: 60, src: 'aura', color: '#9cff35' });
          }
          if (U.per(0.5, dt)) FX.burst(this.x + U.rand(-60, 60), this.y + U.rand(-60, 60), ['#9cff35', '#9cff35', '#ff4f6e'], 1, 50, { size: 4, life: 0.4 });
        } else if (Math.random() < 0.7) {
          FX.burst(this.x + U.rand(-12, 12), this.y + U.rand(-10, 20), ['#ff2448', '#ff7a1a', '#ffe14a'], 1, 80, { size: 4, life: 0.35, grav: -200 });
        }
      }
      // lean haze aura slows
      const haze = this.buffs.find((b) => b.aura);
      if (haze) {
        for (const e of G.inRadius(this.x, this.y, haze.aura)) { e.slowT = Math.max(e.slowT, 0.2); e.slowAmt = Math.max(e.slowAmt, 0.4); }
        if (s.hazeHeal && this.hp < s.maxHp) this.hp = Math.min(s.maxHp, this.hp + s.hazeHeal * dt); // 3 AM
      }
      // grillz heal budget
      this.grillzT -= dt;
      if (this.grillzT <= 0) { this.grillzT = 1; this.grillzHeal = 4; }

      this.updateWeapons(dt, G);
      for (const it of this.passives) if (it.def.tick) it.def.tick(this, G, it.level, dt, this.passiveState[it.id]);
      for (const th of this.thumbs) if (th.def.tick) th.def.tick(this, G, dt, th.st);
      RS.Stash.tick(G, this, dt);
    }

    updateWeapons(dt, G) {
      for (const w of this.weapons) G.updateWeapon(w, this, dt);
    }

    frame() {
      const i = Math.floor(this.anim) % 4;
      return this.moving || this.dash.t > 0 ? i : i;
    }
  }

  RS.Player = Player;
})(window.RS);
