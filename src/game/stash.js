'use strict';
// RS.Stash: runtime of the stash items (data/stash.js). Inventory and hook lists on the player, the shared effects
// the items call (poison / bleed / burn / curse DoTs, freeze, knock-ups, spikes, ghosts, lightning, explosions,
// rockets, energy balls, toxic clouds), drops and pickups, the chest / PLUG / prop hooks, and the ALTARS (stand in
// the ring to charge one, it pays out a stash item).
// Cost: DoTs tick twice a second over a list of afflicted enemies only (never the whole crowd), and every proc
// that spawns something goes through a per-proc token bucket (ok(id, rate)), so a 500-hits-a-second late game
// cannot carpet the screen with explosions or lightning.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data;
  const TICK = 0.5;
  const HOOKS = ['hit', 'crit', 'kill', 'hurt', 'tick', 'dash', 'dodge', 'chest', 'interact', 'mul'];
  const ALTAR_R = 95, ALTAR_CHARGE = 5, ALTAR_GAP = 70, K = 3; // ring radius, seconds to charge, respawn gap, world px per art px
  const RAR_COL = (r) => D.RARITY[r].col;
  const SOFT = 2.5; // stash damage multiplier soft cap (applyAll)

  // 22 x 26 art px: a speaker cabinet turned shrine, a skull with green eyes on top, two red candles burning
  const PAL = { o: '#0a080c', K: '#2b2b33', k: '#17161c', c: '#3a3a44', g: '#9cff35', r: '#ff2448', R: '#8f1626',
    w: '#e9e9e4', y: '#ffe14a', Y: '#ff7a1a', s: '#cfd6e3', S: '#8a9095' };
  const W0 = 'kooook', W1 = 'occcco', W2 = 'ocggco';
  const wf = (w) => 'oKk' + w + 'kkkk' + w + 'kKo';
  const ART = [
    '...y..............y...', '..yYy............yYy..', '..oYo...oooooo...oYo..', '..owo..osssssso..owo..',
    '..owo.osssssssso.owo..', '..owo.osggssggso.owo..', '..owo.osggssggso.owo..', '..owo.osssSSssso.owo..',
    '..owo..oSsSsSSo..owo..', '..owo...oSSSSo...owo..', 'oooooooooooooooooooooo', 'oKKKKKKKKKKKKKKKKKKKKo',
    'oKkkkkkkkkkkkkkkkkkkKo', wf(W0), wf(W1), wf(W2), wf(W2), wf(W1), wf(W0), 'oKkkkkkkkkkkkkkkkkkkKo',
    'oKrrrrrrrrrrrrrrrrrrKo', 'oKRRRRRRRRRRRRRRRRRRKo', 'oKkkkkkkkkkkkkkkkkkkKo', 'oKKKKKKKKKKKKKKKKKKKKo',
    'oooooooooooooooooooooo', '..oo..............oo..',
  ];
  let altarImg = null;
  function bakeAltar() {
    const c = RS.Sprites.cv(22, 26), x = c.getContext('2d');
    ART.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const col = PAL[row[i]]; if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } } });
    return c;
  }

  const X = {
    // ------------------------------------------------------------ run state
    reset(G) {
      G.dots = []; G.sky = []; G.poisonN = 0; G.dotT = 0; G.stashTok = {};
      G.altars = []; G.altarNext = 120; G.burgerT = -9; G.stashDropT = -99; G.holyT = 0; G.healAcc = 0;
      G.stats.stash = 0;
    },
    initPlayer(p) {
      p.stash = {}; p.stashOrder = []; p.stashSt = {}; p.stashH = {};
      for (const h of HOOKS) p.stashH[h] = [];
      p.lsBud = 0; p.luvBud = 0; p.stillT = 0; p.movedNow = 0; p.sprintK = 0; p.cloakArm = 0; p.hangT = 0;
    },
    // the s.* fields the stash items read or write (Player.recalc resets them every frame)
    stats(s) {
      s.altarSpeed = 0; s.altarLuck = 0; s.altarHeal = 0; s.altarExtra = 0; s.altarWide = 1; s.difficulty = 0; s.keyChance = 0;
      s.dashIframe = 0; s.hang = 0.35; s.hop = 0; s.airBonus = 0;
      s.spikeArmor = 0; s.spikeBoom = 0; s.spikeMul = 1; s.spikeExtra = 0;
      s.overheal = 0; s.lifesteal = 0; s.lsMark = 0; s.markHeal = 0; s.luvCap = 0; s.holy = 0; s.tonka = 0;
      s.megaChance = 0; s.procRolls = 1; s.plugCost = 1; s.poisonMul = 1; s.poisonSlow = 0; s.bleedMul = 1;
      s.freezeMul = 1; s.frozenVuln = 0; s.curseSpread = 0; s.shatter = 0; s.ghostLife = 1; s.walkPay = 1;
      s.arcExtra = 0; s.boltStun = 0; s.flagMul = 1; s.kevinPay = 0; s.kevinHype = 1; s.demonCap = 0;
    },
    count(p, id) { return (p.stash && p.stash[id]) || 0; },
    total(p) { let n = 0; for (const id of p.stashOrder || []) n += p.stash[id]; return n; },
    add(p, id) {
      const def = D.STASH[id];
      if (!def) return;
      if (!p.stash[id]) { p.stash[id] = 0; p.stashOrder.push(id); p.stashSt[id] = {}; }
      p.stash[id]++;
      this.rebuild(p);
      const G = RS.Game;
      G.discover('stash', id);
      G.stats.stash = (G.stats.stash || 0) + 1;
      G.stats.itemsCollected++;
      if (def.pick) def.pick(p, G, p.stash[id], p.stashSt[id]);
      p.recalc();
    },
    remove(p, id) {
      if (!p.stash[id]) return;
      if (--p.stash[id] <= 0) { delete p.stash[id]; p.stashOrder.splice(p.stashOrder.indexOf(id), 1); }
      this.rebuild(p);
      p.recalc();
    },
    rebuild(p) {
      for (const h of HOOKS) p.stashH[h].length = 0;
      for (const id of p.stashOrder) {
        const def = D.STASH[id], e = [def, p.stash[id], p.stashSt[id]];
        for (const h of HOOKS) if (def[h]) p.stashH[h].push(e);
      }
    },
    // Player.recalc: after the passives (synergies and thumbs come after, so they can build on these).
    // The stash damage multipliers multiply each other (GYM RAT x DEMON TIME x RED FLAG x STAND STILL...): past x2.5
    // in total every further step counts half, so a lucky pile of them cannot run away with the run.
    applyAll(s, p) {
      const m0 = s.might;
      for (const id of p.stashOrder) { const def = D.STASH[id]; if (def.apply) def.apply(s, p.stash[id], p, p.stashSt[id]); }
      const r = s.might / m0;
      if (r > SOFT) s.might = m0 * (SOFT + (r - SOFT) * 0.5);
    },
    // Player.recalc, once every other source is in: stats derived from finished ones
    post(s, p) {
      if (s.tonka) s.might *= 1 + Math.min(1.5, s.tonka * s.maxHp / 100); // BIG TONKA
    },
    cap(p) { return p.s.maxHp * (1 + (p.s.overheal || 0)); },
    airborne(p) { return p.dash.t > 0 || p.hangT > 0; },
    pw(p) { return 1 + 0.08 * (p.level - 1); }, // item damage grows with the hero's level like the weapons do
    roll(p, c) { return Math.random() < 1 - Math.pow(1 - c, p.s.procRolls || 1); }, // TOO OP: one more roll per copy
    // token bucket per proc kind: at most `rate` a second, bursts up to one second's worth
    ok(id, rate) {
      const G = RS.Game, T = G.stashTok;
      let t = T[id];
      if (!t) t = T[id] = { n: rate, at: G.time };
      t.n = Math.min(rate, t.n + (G.time - t.at) * rate); t.at = G.time;
      if (t.n < 1) return false;
      t.n--;
      return true;
    },

    // ------------------------------------------------------------ hooks called from the core
    mul(G, p, e, o) {
      let m = 1;
      for (const h of p.stashH.mul) m *= h[0].mul(p, G, e, h[1], h[2]);
      return m > SOFT ? SOFT + (m - SOFT) * 0.5 : m; // same soft cap as the flat multipliers
    },
    onHit(G, p, e, dmg, crit, o) {
      const s = p.s;
      for (const h of p.stashH.hit) h[0].hit(p, G, e, dmg, h[1], h[2]);
      // lifesteal (CHONK DRIP, BLOOD ON ME): a hit may heal 1 HP, from a per-second budget
      if (s.lifesteal > 0 && p.lsBud >= 1 && Math.random() < s.lifesteal && p.hp < this.cap(p)) {
        p.lsBud--;
        this.heal(G, 1, true);
        if (s.lsMark && !e.dead && Math.random() < s.lsMark) this.bleed(G, e, dmg * 0.6 * s.bleedMul, 3, true);
      }
    },
    onCrit(G, p, e, dmg) { for (const h of p.stashH.crit) h[0].crit(p, G, e, dmg, h[1], h[2]); },
    onKill(G, p, e) {
      const s = p.s;
      if (e.mark && e.tBl > 0 && p.markBud >= 1) { p.markBud--; this.heal(G, 2 + s.markHeal, true); } // a BLOODMARKED enemy died (1.5 heals a second at most)
      if (e.tCu > 0 && s.curseSpread) { const n = G.nearest(e.x, e.y, 220, e); if (n) this.curse(G, n, e.cuK, 4); }
      for (const h of p.stashH.kill) h[0].kill(p, G, e, h[1], h[2]);
    },
    onHurt(G, p, d, sx, sy) { for (const h of p.stashH.hurt) h[0].hurt(p, G, h[1], d, sx, sy, h[2]); },
    onDash(G, p) { for (const h of p.stashH.dash) h[0].dash(p, G, h[1], h[2]); },
    onDodge(G, p) { for (const h of p.stashH.dodge) h[0].dodge(p, G, h[1], h[2]); },
    onChest(G, p) { for (const h of p.stashH.chest) h[0].chest(p, G, h[1], h[2]); this.onInteract(G, p); },
    onInteract(G, p) { for (const h of p.stashH.interact) h[0].interact(p, G, h[1], h[2]); },
    // OPËM CLOAK: the next weapon shot hits harder (combat.fireWeapon spends it)
    cloak(p, n) {
      p.cloakArm = Math.max(p.cloakArm, 2 + 0.5 * (n - 1));
      p.addBuff({ id: 'opem_cloak', name: 'OPËM CLOAK', icon: 'opem_cloak', col: '#cfd6e3', t: 2 + (n - 1),
        apply: (s) => { s.cooldown /= 1.2; s.moveSpeed *= 1.15; } });
    },
    // HEAVY METAL: every level a weapon gains rolls one bonus per copy
    onWeaponLevel(G, w, levels) {
      const p = G.p, n = this.count(p, 'heavy_metal');
      if (!n || levels <= 0) return;
      const names = [];
      for (let i = 0; i < levels * n; i++) {
        const r = Math.random();
        if (r < 0.4) { w.bonus.dmg += 0.1; names.push('+10% DMG'); }
        else if (r < 0.7) { w.bonus.area += 0.08; names.push('+8% AREA'); }
        else { w.bonus.cd *= 0.94; names.push('-6% CD'); }
      }
      FX.text(p.x, p.y - 64, 'HEAVY METAL: ' + names.slice(0, 3).join(' '), '#cfd6e3', 12, { always: true, life: 1.4 });
    },
    // ZA WARUDO (combat.playerDown): spend one copy instead of dying
    lastStand(G, p) {
      if (!this.count(p, 'za_warudo')) return false;
      this.remove(p, 'za_warudo');
      p.hp = Math.max(1, p.s.maxHp * 0.3);
      p.invuln = 2;
      G.freezeAll(10, true);
      for (const e of G.enemies.list) if (!e.dead && e.boss) e.freezeT = Math.max(e.freezeT, 4); // bosses shake it off sooner
      G.eshots.clear(); G.teles.length = 0;
      p.addBuff({ id: 'za_warudo', name: 'TIME STOPPED', icon: 'za_warudo', col: '#ffd23f', t: 10, apply: () => {} });
      FX.banner('ZA WARUDO', 'TIME STOPS · 10 SECONDS', '#ffd23f', 2.6);
      FX.ring(p.x, p.y, 600, '#ffd23f', 0.9, 6, 0.08);
      FX.flash('#ffd23f', 0.5);
      G.sfx('evolve');
      return true;
    },
    kevin(G, p, n) {
      const s = p.s, d = Math.max(1, Math.round(s.maxHp * 0.05));
      if (p.dead || G.state !== 'run') return;
      p.hp = Math.max(1, p.hp - d); // KËVIN never takes the last point
      p.hurtFlash = 0.22;
      G.stats.damageTaken += d;
      FX.text(p.x, p.y - 58, 'KËVIN!', '#ffe14a', 15, { always: true, life: 1 });
      FX.text(p.x, p.y - 36, '-' + d, '#ff2448', 14, { always: true });
      FX.burst(p.x + 10, p.y - 20, ['#ffe14a', '#ffffff'], 5, 160, { kind: 'line', life: 0.18 });
      G.sfx('hurt');
      const k = 0.3 * n;
      p.addBuff({ id: 'kevin', name: 'KËVIN HYPE', icon: 'kevin', col: '#ffe14a', t: 4 * s.kevinHype, apply: (ss) => { ss.might *= 1 + k; } });
      if (s.kevinPay) G.addRunClout(s.kevinPay);
      for (const it of p.passives) if (it.def.onHurt) it.def.onHurt(p, G, it.level, p.passiveState[it.id]);
      this.onHurt(G, p, d, p.x + 20, p.y);
    },
    geeked(G, p) {
      for (const e of G.enemies.list) if (!e.dead) { e.slowT = Math.max(e.slowT, 4); e.slowAmt = Math.max(e.slowAmt, e.boss ? 0.25 : 0.5); }
      p.addBuff({ id: 'geeked', name: 'GEEKED MODE', icon: 'geeked_mode', col: '#ff2448', t: 8, apply: (s) => { s.might *= 2; } });
      FX.banner('GEEKED MODE', 'EVERYTHING SLOWS DOWN', '#ff2448', 2);
      FX.ring(p.x, p.y, 420, '#ff2448', 0.7, 5, 0.1);
      FX.glitch(0.3);
      G.sfx('ability');
    },

    // ------------------------------------------------------------ healing
    // every heal goes through here (and G.heal): up to the overheal cap, and HOLY RAGE banks it for its sear
    heal(G, amt, quiet) {
      if (amt <= 0) return;
      const p = G.p;
      if (quiet) {
        const before = p.hp;
        p.hp = Math.min(this.cap(p), p.hp + amt * p.s.healMult);
        G.healAcc += p.hp - before;
      } else G.heal(amt);
    },

    // ------------------------------------------------------------ statuses
    track(G, e) { if (!e.dotOn) { e.dotOn = true; e.dotId = e.id; G.dots.push(e); } },
    poison(G, e, amt, t) { if (e.dead || !(amt > 0)) return; e.dPo += amt; e.tPo = Math.max(e.tPo, t); this.track(G, e); },
    bleed(G, e, amt, t, mark) { if (e.dead || !(amt > 0)) return; e.dBl += amt; e.tBl = Math.max(e.tBl, t); if (mark) e.mark = true; this.track(G, e); },
    burn(G, e, amt, t) { if (e.dead || !(amt > 0)) return; e.dBu += amt; e.tBu = Math.max(e.tBu, t); this.track(G, e); },
    curse(G, e, k, t) { if (e.dead) return; e.cuK = Math.max(e.cuK, k); e.tCu = Math.max(e.tCu, t); this.track(G, e); },
    freeze(G, e, t) {
      if (e.dead) return;
      t *= G.p.s.freezeMul;
      if (e.boss) { e.slowT = Math.max(e.slowT, t); e.slowAmt = Math.max(e.slowAmt, 0.35); return; }
      if (e.elite || e.def.isElite) t *= 0.5; // elites shake it off: no freeze-lock on a chest carrier
      e.freezeT = Math.max(e.freezeT, t); e.iceT = Math.max(e.iceT, t);
      if (this.ok('icefx', 10)) FX.burst(e.x, e.y - e.r, ['#9fe9ff', '#ffffff'], 4, 120, { size: 3, life: 0.3 });
    },
    // SKY WALKER: the enemy pops up, hangs helpless for 0.8s and lands (render.js already draws e.z)
    launch(G, e) {
      if (e.skyT > 0 || (e.z || 0) > 0 || e.anchored || e.elite || e.def.isElite) return; // elites stay on the ground
      e.skyT = 0.8; e.freezeT = Math.max(e.freezeT, 0.8);
      G.sky.push(e);
      if (this.ok('skyfx', 8)) FX.ring(e.x, e.y, 26, '#3ff2ff', 0.25, 2);
    },
    updateDots(G, dt) {
      // knocked-up enemies: a smooth arc, 70 px at the top
      for (let i = G.sky.length - 1; i >= 0; i--) {
        const e = G.sky[i];
        e.skyT -= dt;
        if (e.dead || e.skyT <= 0) { e.z = 0; e.skyT = 0; G.sky.splice(i, 1); if (!e.dead && G.onScreen(e.x, e.y, 20)) FX.smoke(e.x, e.y + e.r * 0.6, 2, e.r * 0.7, '#c9ccc4', { spd: 30, vy: -8, life: 0.4, grow: 1.4, alpha: 0.25 }); continue; }
        e.z = Math.sin(Math.PI * (1 - e.skyT / 0.8)) * 70;
      }
      G.dotT -= dt;
      if (G.dotT > 0) return;
      G.dotT += TICK;
      const p = G.p, s = p.s, L = G.dots;
      let pois = 0;
      for (let i = L.length - 1; i >= 0; i--) {
        const e = L[i];
        if (e.dead || e.id !== e.dotId) { e.dotOn = false; L[i] = L[L.length - 1]; L.pop(); continue; }
        const vis = G.onScreen(e.x, e.y, 20);
        if (e.tPo > 0) {
          pois++;
          const d = e.dPo * Math.min(1, TICK / e.tPo); e.dPo -= d; e.tPo -= TICK;
          if (s.poisonSlow && !e.boss) { e.slowT = Math.max(e.slowT, 0.6); e.slowAmt = Math.max(e.slowAmt, s.poisonSlow); }
          G.damage(e, d, { flat: true, noCrit: true, quiet: true, src: 'poison', color: '#9cff35' });
          if (vis && Math.random() < 0.35) FX.burst(e.x + U.rand(-6, 6), e.y - e.r, ['#9cff35', '#3d6b12'], 1, 30, { size: 3, life: 0.5, grav: -60 });
          if (e.tPo <= 0) e.dPo = 0;
        }
        if (!e.dead && e.tBl > 0) {
          const d = e.dBl * Math.min(1, TICK / e.tBl); e.dBl -= d; e.tBl -= TICK;
          G.damage(e, d, { flat: true, noCrit: true, quiet: true, src: 'bleed', color: '#ff4f6e' });
          if (vis && Math.random() < 0.4) FX.burst(e.x, e.y - e.r * 0.5, ['#ff2448', '#7a0a16'], 2, 60, { size: 3, life: 0.4, grav: 260 });
          if (e.tBl <= 0) { e.dBl = 0; e.mark = false; }
        }
        if (!e.dead && e.tBu > 0) {
          const d = e.dBu * Math.min(1, TICK / e.tBu); e.dBu -= d; e.tBu -= TICK;
          G.damage(e, d, { flat: true, noCrit: true, quiet: true, src: 'burn', color: '#ff9a3a' });
          if (vis) FX.burst(e.x + U.rand(-8, 8), e.y - e.r * 0.4, ['#ff7a1a', '#ffe14a', '#ff2448'], 2, 50, { size: 4, life: 0.35, grav: -220 });
          if (e.tBu <= 0) e.dBu = 0;
        }
        if (!e.dead && e.tCu > 0) {
          e.tCu -= TICK;
          // bosses lose a sliver: a % of max HP would melt them
          G.damage(e, e.maxHp * e.cuK * TICK * (e.boss ? 0.03 : 1), { flat: true, noCrit: true, quiet: true, src: 'curse', color: '#c79bff' });
          if (vis && Math.random() < 0.3) FX.burst(e.x, e.y - e.r * 1.4, ['#b052ff', '#2a0f36'], 1, 30, { size: 3, life: 0.5, grav: -40 });
          if (e.tCu <= 0) e.cuK = 0;
        }
        if (e.dead || (e.tPo <= 0 && e.tBl <= 0 && e.tBu <= 0 && e.tCu <= 0)) { e.dotOn = false; L[i] = L[L.length - 1]; L.pop(); }
      }
      G.poisonN = pois;
    },

    // ------------------------------------------------------------ effects
    // lightning from the sky onto e: dmg to it, half of that to whatever stands in r
    strike(G, e, dmg, o) {
      if (e.dead) return;
      const p = G.p, flat = !!o.flat;
      FX.arc([e.x + U.rand(-40, 40), e.y - 300, e.x + U.rand(-16, 16), e.y - 140, e.x, e.y - 10], '#3ff2ff', 0.18, 3);
      FX.pop(e.x, e.y, 28, ['#3ff2ff', '#ffffff'], 'zap');
      G.sfx('zap');
      const stun = Math.max(o.stun || 0, p.s.boltStun);
      const near = o.r ? G.inRadius(e.x, e.y, o.r) : [];
      G.damage(e, dmg, { flat, noCrit: true, quiet: true, src: 'bolt', color: '#9fe9ff' });
      if (stun && !e.boss) e.freezeT = Math.max(e.freezeT || 0, stun);
      const sp = o.splash === undefined ? 0.5 : o.splash;
      for (const n of near) if (n !== e && !n.dead) G.damage(n, dmg * sp, { flat, noCrit: true, quiet: true, src: 'bolt', color: '#9fe9ff' });
    },
    // PLUGGED IN: chain from e to the nearest others
    arcs(G, e, dmg, n) {
      const hit = [e.id];
      let cur = e;
      const pts = [e.x, e.y - 12];
      for (let i = 0; i < n; i++) {
        const nx = G.nearest(cur.x, cur.y, 150, hit);
        if (!nx) break;
        hit.push(nx.id); pts.push(nx.x, nx.y - 12);
        G.damage(nx, dmg, { flat: true, noCrit: true, quiet: true, src: 'arc', color: '#9fe9ff' });
        if (G.p.s.boltStun && !nx.boss) nx.freezeT = Math.max(nx.freezeT || 0, G.p.s.boltStun);
        cur = nx;
      }
      if (pts.length > 2) { FX.arc(pts, '#3ff2ff', 0.14, 2, 'aux'); if (this.ok('arcsfx', 6)) G.sfx('zap'); }
    },
    boom(G, x, y, r, dmg, big) {
      for (const e of G.inRadius(x, y, r)) if (!e.dead) G.damage(e, dmg, { flat: true, noCrit: true, quiet: true, src: 'boom', color: '#ffb36a', knock: big ? 600 : 120, kx: e.x - x, ky: e.y - y });
      if (big) { FX.boom(x, y, r * 0.75, 'fire'); FX.ring(x, y, r, '#ff6ad5', 0.35, 4); FX.shake(0.12, 0.35); G.sfx('explode', { big: true }); }
      else { FX.boom(x, y, r * 0.7, 'fire'); if (this.ok('boomsfx', 4)) G.sfx('explode'); }
      G.lightsFrame.push({ x, y, r: r * 2, t: 0.2 });
    },
    // DRAGON MODE: a jet of fire from the hero onto the target, the area there burns
    dragon(G, p, e, dmg) {
      const a = Math.atan2(e.y - p.y, e.x - p.x), dist = Math.hypot(e.x - p.x, e.y - p.y);
      for (let i = 0; i < 6; i++) {
        const k = 0.25 + i * 0.15, x = p.x + Math.cos(a) * dist * k, y = p.y - 20 + Math.sin(a) * dist * k;
        FX.burst(x, y, ['#ff7a1a', '#ffe14a', '#ff2448'], 2, 90, { size: 5, life: 0.3, grav: -120 });
      }
      for (const n of G.inRadius(e.x, e.y, 80)) {
        if (n.dead) continue;
        G.damage(n, dmg * (n === e ? 1 : 0.5), { flat: true, noCrit: true, quiet: true, src: 'dragon', color: '#ff9a3a' });
        this.burn(G, n, dmg * 0.35, 3);
      }
      FX.boom(e.x, e.y, 46, 'fire');
      if (this.ok('dragonsfx', 3)) G.sfx('explode');
    },
    // radial spikes from the hero (SPIKY DRIP, QUIN'S VISION); SPIKE VEST scales them with armor
    spikes(G, p, n) {
      const s = p.s, dmg = 16 * this.pw(p) * (1 + s.spikeArmor * Math.max(0, s.armor)) * s.spikeMul;
      const a0 = Math.random() * U.TAU;
      for (let i = 0; i < n; i++) {
        G.proj({ x: p.x, y: p.y - 18, angle: a0 + (i / n) * U.TAU, speed: 560, r: 6, dmg, pierce: 1, life: 0.55, kind: 'spike', col: '#e3ece6', src: 'spike',
          onHit: (pr, e, G2) => { if (s.spikeBoom && Math.random() < s.spikeBoom && this.ok('spikeboom', 10)) this.boom(G2, e.x, e.y, 50, pr.dmg * s.might, false); } });
      }
      G.sfx('whip');
    },
    // homing spirits: GHOST TOWN ghosts, DEAD HOMIE's BOB, SOUL SNATCHER souls
    ghosts(G, x, y, n, base, life, look) {
      look = look || 'ghost';
      const p = G.p, soul = look === 'soul', bob = look === 'bob';
      if (soul && G.projs.list.filter((q) => !q.dead && q.kind === 'soul').length > 36) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU;
        G.proj({ x: x + Math.cos(a) * 14, y: y - 20 + Math.sin(a) * 14, angle: a, speed: soul ? 340 : bob ? 230 : 210, r: bob ? 15 : soul ? 7 : 11,
          dmg: base * this.pw(p), pierce: soul ? 0 : 999, hitCd: soul ? 0 : 0.6, life, kind: look === 'ghost' ? 'ghost' : look, col: soul ? '#b39ddb' : '#e3ece6',
          homing: soul ? 9 : 5, src: 'ghost' });
      }
    },
    rockets(G, x, y, n, dmg) {
      for (let i = 0; i < n; i++) {
        G.proj({ x, y: y - 10, angle: -Math.PI / 2 + (i - (n - 1) / 2) * 0.7, speed: 430, r: 7, dmg: 0, pierce: 0, life: 1.6, kind: 'rocket', small: true, col: '#ff7a1a',
          homing: 5, noHitDmg: true, src: 'freak',
          onEnd: (pr, G2) => G2.aoe(pr.x, pr.y, 60, dmg, { noCrit: true, src: 'freak', boom: true }) });
      }
      G.sfx('rocket');
    },
    energy(G, p, n) {
      const skip = [];
      for (let i = 0; i < n; i++) {
        const t = G.nearestSeen(p.x, p.y, 520, skip);
        if (!t) break;
        skip.push(t.id);
        const a = Math.atan2(t.y - G.bodyLift(t) - p.y + 20, t.x - p.x);
        G.proj({ x: p.x, y: p.y - 20, angle: a, speed: 560, r: 8, dmg: 28 * this.pw(p), pierce: 0, bounce: 1, bounceRange: 260, life: 1.6, kind: 'energy', col: '#c8ff7d', homing: 6, target: t, src: 'energy' });
      }
      if (skip.length) G.sfx('spin');
    },
    // TOXIC GLOVES: a green cloud that poisons what stands in it
    cloud(G, x, y, n) {
      let live = 0;
      for (const z of G.zones.list) if (!z.dead && z.kind === 'toxic') live++;
      if (live >= 1 + n) return;
      const p = G.p, R = 64 * Math.min(1.6, p.s.area);
      G.zone({ kind: 'toxic', x, y, r: R, life: 2.5, noDamage: true, col: '#9cff35',
        onUpdate: (z, G2, dt) => {
          z.pt = (z.pt || 0) - dt;
          if (z.pt > 0) return;
          z.pt = 0.5;
          const amt = 3 * this.pw(p) * p.s.might * p.s.poisonMul * (1 + 0.5 * (n - 1));
          for (const e of G2.inRadius(z.x, z.y, z.r)) this.poison(G2, e, amt, 2);
        } });
    },
    burger(G, x, y) {
      if (G.time - G.burgerT < 8) return; // at most one burger every 8 s, three on the floor
      let n = 0;
      for (const k of G.pickups.list) if (!k.dead && k.kind === 'cons' && k.id2 === 'twizzy_burger') n++;
      if (n >= 3) return;
      G.burgerT = G.time;
      G.dropConsumable(x, y, 'twizzy_burger');
    },
    killXp(G, e) { return e.xp / (e.elite ? 12 : 1) * D.LOOT.xpMul * D.curve(D.TIMELINE.xp, G.time / 60); },

    // ------------------------------------------------------------ per frame
    tick(G, p, dt) {
      const s = p.s;
      const lx = p.lastX === undefined ? p.x : p.lastX, ly = p.lastY === undefined ? p.y : p.lastY;
      p.movedNow = Math.min(60, Math.hypot(p.x - lx, p.y - ly));
      p.lastX = p.x; p.lastY = p.y;
      const v = Math.hypot(p.vx, p.vy);
      p.stillT = !p.moving && v < 25 && p.dash.t <= 0 ? p.stillT + dt : 0;
      p.sprintK = p.dash.t > 0 ? 1 : U.clamp(v / (178 * s.moveSpeed), 0, 1);
      if (p.hangT > 0) p.hangT -= dt;
      // FLOATIN': the dash is a hop (a whole arc through the dash and the hang time after it)
      if (s.hop) {
        const T = 0.16 + s.hang, el = p.dash.t > 0 ? 0.16 - p.dash.t : p.hangT > 0 ? 0.16 + s.hang - p.hangT : -1;
        p.z = el >= 0 ? Math.sin(Math.PI * U.clamp(el / T, 0, 1)) * 26 : 0;
      }
      p.lsBud = Math.min(2 + 10 * s.lifesteal, (p.lsBud || 0) + (2 + 10 * s.lifesteal) * dt);
      p.luvBud = Math.min(s.luvCap, (p.luvBud || 0) + s.luvCap * dt);
      p.markBud = Math.min(3, (p.markBud || 0) + 1.5 * dt);
      for (const h of p.stashH.tick) h[0].tick(p, G, h[1], dt, h[2]);
    },
    // world-side update: DoTs, HOLY RAGE sear, SHATTERED gems, altars
    update(G, dt) {
      if (!G.dots) return;
      const p = G.p, s = p.s;
      this.updateDots(G, dt);
      // HOLY RAGE: what you healed in the last half second burns the crowd around you
      G.holyT -= dt;
      if (G.holyT <= 0) {
        G.holyT = 0.5;
        if (s.holy && G.healAcc >= 0.5) {
          const amt = Math.min(40, G.healAcc) * (4 + 0.2 * p.level) * s.holy * s.might;
          for (const e of G.inRadius(p.x, p.y, 180)) G.damage(e, amt, { flat: true, noCrit: true, quiet: true, src: 'holy', color: '#fff1a0' });
          FX.ring(p.x, p.y, 180, '#fff1a0', 0.35, 3, 0.06);
        }
        G.healAcc = 0;
      }
      // SHATTERED: crystals on their way to you cut what they fly through (every 0.1 s, at most 80 crystals a pass)
      if (s.shatter) {
        G.shatT = (G.shatT || 0) - dt;
        if (G.shatT <= 0) {
          G.shatT = 0.1;
          const dmg = 10 * this.pw(p) * s.shatter;
          let n = 0;
          for (const k of G.pickups.list) {
            if (k.dead || k.kind !== 'xp' || !k.attract) continue;
            if (++n > 80) break;
            for (const e of G.inRadius(k.x, k.y, 16)) {
              if (e.shatT > G.time) continue;
              e.shatT = G.time + 0.25;
              G.damage(e, dmg, { noCrit: true, quiet: true, src: 'shatter', color: '#c8ff7d' });
            }
          }
        }
      }
      this.updateAltars(G, dt);
    },

    // ------------------------------------------------------------ drops
    rollRarity(p, luck, floor) {
      const f = Math.max(0.5, p.s.luck + (luck || 0));
      const r = U.weighted(D.STASH_RARITY, (R, i) => R.w * Math.pow(f, D.STASH_RARITY.indexOf(R)));
      return Math.max(floor || 0, r ? r.id : 0);
    },
    // a random item of that rarity; copies you already hold get a little rarer (variety first)
    pickId(p, rar) {
      if (rar === 3) rar = 2;
      const pool = Object.values(D.STASH).filter((d) => d.rarity === rar);
      const d = U.weighted(pool, (d) => 1 / (1 + 0.35 * this.count(p, d.id)));
      return d ? d.id : null;
    },
    drop(G, x, y, o) {
      o = o || {};
      const p = G.p, rar = o.rar !== undefined ? o.rar : this.rollRarity(p, o.luck, o.floor), id = o.id || this.pickId(p, rar);
      if (!id) return null;
      ({ x, y } = G.lootSpot(x, y));
      const k = G.pickup('stash', x, y, 0);
      k.id2 = id; k.tier = D.STASH[id].rarity;
      FX.ring(x, y, 60, RAR_COL(k.tier), 0.6, 4);
      if (k.tier >= 2) G.sfx('rare');
      return k;
    },
    collect(G, k) {
      const p = G.p, def = D.STASH[k.id2];
      if (!def) return;
      this.add(p, def.id);
      const n = p.stash[def.id], col = RAR_COL(def.rarity);
      FX.text(p.x, p.y - 54, def.name + (n > 1 ? ' x' + n : ''), U.mixHex(col, '#ffffff', 0.35), 16, { always: true, life: 1.5 });
      FX.ring(p.x, p.y, 80, col, 0.4, 4, 0.12);
      if (def.rarity >= 4) FX.banner('LEGENDARY STASH', def.name, col, 2.2, true);
      G.sfx(def.rarity >= 2 ? 'stash' : 'pickup');
      p.pickT = 0.5;
    },
    // a chest's stash share, added to its rolled result (Progression.openChest); MASTER KEY can add one more
    chestLoot(G, tier, res) {
      const p = G.p, s = p.s;
      const one = (floor) => {
        const rar = this.rollRarity(p, 0, floor), id = this.pickId(p, rar);
        if (!id) return;
        const def = D.STASH[id];
        res.push({ type: 'stash', rarity: def.rarity, icon: id, name: def.name, desc: D.RARITY[def.rarity].name + ' STASH · ' + def.desc, apply: () => this.add(p, id) });
      };
      const base = { elite: 0.25, supply: 0.4, legendary: 1, boss: 1 }[tier] || 0;
      if (Math.random() < base) one(tier === 'boss' ? 2 : tier === 'legendary' ? 1 : 0);
      if (s.keyChance && Math.random() < s.keyChance) one(0);
    },
    // THE PLUG: one of his slots can hold a stash item instead of a card
    plugCard(G, id, rar) {
      const p = G.p, def = D.STASH[id], n = this.count(p, id);
      return { key: 'stash:' + id, id, kind: 'stash', rarity: def.rarity, icon: id, name: def.name, type: 'STASH ITEM · STACKS',
        desc: def.desc, lvl: n ? 'HELD x' + n + ' → x' + (n + 1) : 'NEW', isNew: !n, effects: n ? ['+1 copy: ' + def.per] : [],
        apply: () => this.add(p, id) };
    },
    propDrop(G, pr) {
      const c = pr.P.rich ? 0.04 : 0.01;
      if (Math.random() < c * Math.sqrt(G.p.s.luck) && G.time - G.stashDropT > 25) { G.stashDropT = G.time; this.drop(G, pr.x, pr.y); }
    },
    enemyDrop(G, e) {
      const p = G.p;
      if (e.elite || e.def.isElite) { if (Math.random() < 0.06 + p.s.eliteBonus * 0.05) this.drop(G, e.x - 22, e.y); return; }
      if (G.time - G.stashDropT > 60 && Math.random() < 0.00025 * Math.sqrt(p.s.luck)) { G.stashDropT = G.time; this.drop(G, e.x, e.y); }
    },

    // ------------------------------------------------------------ ALTARS
    // From 2:00 one altar stands somewhere on the map, two from 15:00. RAGE ALTAR adds two more from 10:00. Stand in
    // the ring and it charges (5 s, it drains slowly while you are out); charged, it pays a stash item and burns out.
    altarTarget(G) {
      const t = G.time, s = G.p.s;
      if (t < 120) return 0;
      return (t >= 900 ? 2 : 1) + (t >= 600 ? s.altarExtra : 0);
    },
    placeAltar(G) {
      const A = G.arena, p = G.p, c = G.cam, minD = Math.max(c.vw, c.vh) * 0.6;
      for (let i = 0; i < 60; i++) {
        const x = U.rand(240, A.w - 240), y = U.rand(240, A.h - 240);
        if (Math.hypot(x - p.x, y - p.y) < minD) continue;
        if (G.plug && Math.hypot(x - G.plug.x, y - G.plug.y) < 500) continue;
        if (G.altars.some((a) => Math.hypot(x - a.x, y - a.y) < 900)) continue;
        if (RS.Arena.solidAt(A, x, y, ALTAR_R) || RS.Arena.solidAt(A, x, y - 40, 40)) continue;
        G.altars.push({ x, y, charge: 0, state: 'idle', healT: 0, fade: 0, ph: Math.random() * 6 });
        if (!G.altarSeen) { G.altarSeen = true; FX.banner('AN ALTAR APPEARED', 'stand in its ring to charge it · it pays out STASH', '#ff2448', 2.6, true); }
        return true;
      }
      return false;
    },
    updateAltars(G, dt) {
      const p = G.p, s = p.s;
      const live = G.altars.filter((a) => a.state === 'idle').length;
      if (G.state === 'run' && live < this.altarTarget(G) && G.time >= G.altarNext) { if (!this.placeAltar(G)) G.altarNext = G.time + 5; }
      for (let i = G.altars.length - 1; i >= 0; i--) {
        const a = G.altars[i], d2 = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
        if (a.state === 'idle') {
          const inside = !p.dead && d2 < ALTAR_R * ALTAR_R;
          a.inside = inside;
          if (inside) a.charge = Math.min(1, a.charge + dt * (1 + s.altarSpeed) / ALTAR_CHARGE);
          else a.charge = Math.max(0, a.charge - dt * 0.08);
          if (inside && G.onScreen(a.x, a.y) && U.per(6, dt)) FX.burst(a.x + U.rand(-ALTAR_R, ALTAR_R) * 0.8, a.y + U.rand(-30, 20), ['#ff2448', '#ffe14a'], 1, 40, { size: 3, life: 0.6, grav: -140 });
          if (a.charge >= 1) this.fireAltar(G, a);
        } else if (a.state === 'heal') {
          a.healT -= dt;
          const R = ALTAR_R * 1.3 * s.altarWide;
          if (d2 < R * R && !p.dead) this.heal(G, s.maxHp * (0.05 + 0.02 * (s.altarHeal - 1)) * dt, true);
          if (a.healT <= 0) a.state = 'done';
        } else {
          a.fade += dt;
          if (a.fade > 1.2) G.altars.splice(i, 1);
        }
      }
    },
    fireAltar(G, a) {
      const p = G.p, s = p.s;
      a.charge = 1;
      a.state = s.altarHeal ? 'heal' : 'done';
      a.healT = 8 + 4 * (s.altarHeal - 1);
      this.drop(G, a.x, a.y + 46, { luck: s.altarLuck });
      G.stats.altars = (G.stats.altars || 0) + 1;
      G.altarNext = G.time + ALTAR_GAP;
      FX.ring(a.x, a.y, ALTAR_R * 1.6, '#ff2448', 0.6, 5, 0.12);
      FX.burst(a.x, a.y - 40, ['#ff2448', '#ffe14a', '#ffffff'], 18, 300, { kind: 'line' });
      FX.text(a.x, a.y - 96, 'ALTAR CHARGED', '#ff2448', 16, { always: true, life: 1.6 });
      G.sfx('altar');
      this.onInteract(G, p);
    },
    drawAltars(ctx, G, R) {
      if (!G.altars || !G.altars.length) return;
      const v = G.view(), t = G.time, s = G.p.s;
      if (!altarImg) altarImg = bakeAltar();
      for (const a of G.altars) {
        if (a.x < v.x0 - 120 || a.x > v.x1 + 120 || a.y < v.y0 - 160 || a.y > v.y1 + 120) continue;
        const out = a.state === 'done' ? U.clamp(1 - a.fade / 1.2, 0, 1) : 1;
        // the ring on the floor: dim when idle, the charge as a red arc, the heal zone in green
        ctx.save();
        ctx.globalAlpha = out;
        if (a.state === 'heal') {
          const RR = ALTAR_R * 1.3 * s.altarWide, k = 0.5 + 0.2 * Math.sin(t * 3);
          ctx.fillStyle = U.rgba('#9cff35', 0.08 + 0.04 * k); ctx.beginPath(); ctx.ellipse(a.x, a.y, RR, RR * 0.55, 0, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = U.rgba('#9cff35', 0.7); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(a.x, a.y, RR, RR * 0.55, 0, 0, U.TAU); ctx.stroke();
          RS.Post.light(a.x, a.y, RR * 1.4, '#9cff35', 0.35);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, ALTAR_R, ALTAR_R * 0.55, 0, 0, U.TAU); ctx.fill();
          ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 18;
          ctx.strokeStyle = U.rgba('#ff2448', a.inside ? 0.9 : 0.45); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(a.x, a.y, ALTAR_R, ALTAR_R * 0.55, 0, 0, U.TAU); ctx.stroke();
          ctx.setLineDash([]);
          if (a.charge > 0) {
            ctx.strokeStyle = '#ff2448'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.ellipse(a.x, a.y, ALTAR_R, ALTAR_R * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + U.TAU * a.charge); ctx.stroke();
            ctx.strokeStyle = '#ffd0d6'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(a.x, a.y, ALTAR_R, ALTAR_R * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + U.TAU * a.charge); ctx.stroke();
          }
          RS.Post.light(a.x, a.y - 30, 160, '#ff2448', (0.25 + 0.35 * a.charge) * out);
        }
        ctx.restore();
        // the shrine: pixel art on the prop grid, candles and eyes glow softly (a slow pulse, no blinking)
        const sc = R.pixK(K), X0 = R.snap(a.x) - 11 * sc, Y0 = R.snap(a.y + 6) - 26 * sc;
        R.contact(ctx, a.x, a.y + 6, 36, 10, 0.5);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = out * (a.state === 'idle' ? 1 : 0.75);
        ctx.drawImage(altarImg, X0, Y0, 22 * sc, 26 * sc);
        ctx.globalAlpha = 1;
        const glow = (0.5 + 0.15 * Math.sin(t * 2.4 + a.ph)) * out * (a.state === 'idle' ? 1 : 0.4);
        RS.Post.glow(X0 + 3.5 * sc, Y0 + 1 * sc, 16, '#ffb347', glow);
        RS.Post.glow(X0 + 18.5 * sc, Y0 + 1 * sc, 16, '#ffb347', glow);
        RS.Post.glow(X0 + 11 * sc, Y0 + 5.5 * sc, 18, '#9cff35', glow * (0.6 + a.charge));
        if (a.state === 'idle') {
          R.label(a.x, Y0 - 10, a.inside ? 'CHARGING ' + Math.floor(a.charge * 100) + '%' : 'ALTAR', a.inside ? '#ffe14a' : '#ff2448', 13);
          if (!a.inside && Math.hypot(G.p.x - a.x, G.p.y - a.y) < ALTAR_R * 2.4) R.label(a.x, Y0 - 28, 'STAND IN THE RING', '#cfd6e3', 11);
        } else if (a.state === 'heal') R.label(a.x, Y0 - 10, 'HEALING ' + Math.ceil(a.healT) + 'S', '#9cff35', 13);
      }
    },

    // ------------------------------------------------------------ drawing
    // new projectile kinds (render.drawProjectiles falls through to here)
    drawProj(ctx, pr, a) {
      const t = pr.age;
      switch (pr.kind) {
        case 'spike': {
          ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
          ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -4.5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 4.5); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e3ece6'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -2.8); ctx.lineTo(-3, 0); ctx.lineTo(-5, 2.8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(1, -0.8, 6, 1.6);
          ctx.restore();
          return;
        }
        case 'ghost': case 'bob': case 'soul': {
          const bob = pr.kind === 'bob', soul = pr.kind === 'soul', r = pr.r, wob = Math.sin(t * 9 + pr.spin) * 2;
          const fade = Math.min(1, pr.life / 0.4, t / 0.15);
          RS.Post.glow(pr.x, pr.y, r * 2.6, soul ? '#b39ddb' : '#cfe9ff', 0.5 * fade);
          ctx.save(); ctx.globalAlpha = (soul ? 0.85 : 0.8) * fade; ctx.translate(pr.x, pr.y + wob);
          if (soul) { // a wisp: bright head, tapering tail against the flight
            ctx.rotate(a);
            ctx.fillStyle = '#6b54a6'; ctx.beginPath(); ctx.moveTo(-r * 3, 0); ctx.quadraticCurveTo(-r, -r, r, 0); ctx.quadraticCurveTo(-r, r, -r * 3, 0); ctx.fill();
            ctx.fillStyle = '#e8dcff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, U.TAU); ctx.fill();
          } else { // a sheet ghost (BOB wears a cap), black eyes, wavy hem
            const fl = Math.cos(a) < 0 ? -1 : 1;
            ctx.scale(fl, 1);
            ctx.fillStyle = '#0b0910';
            ctx.beginPath(); ctx.arc(0, -r * 0.2, r + 1.5, Math.PI, 0); ctx.lineTo(r + 1.5, r * 0.9);
            for (let i = 0; i <= 4; i++) ctx.lineTo(r + 1.5 - (i * (2 * r + 3)) / 4, r * 0.9 + (i % 2 ? -3 : 2));
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = bob ? '#f2f2ec' : '#dfe7ef';
            ctx.beginPath(); ctx.arc(0, -r * 0.2, r, Math.PI, 0); ctx.lineTo(r, r * 0.8);
            for (let i = 0; i <= 4; i++) ctx.lineTo(r - (i * 2 * r) / 4, r * 0.8 + (i % 2 ? -3 : 1.5));
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#0b0910'; ctx.fillRect(r * 0.05, -r * 0.45, r * 0.22, r * 0.36); ctx.fillRect(r * 0.45, -r * 0.45, r * 0.22, r * 0.36);
            if (bob) { // red cap, brim forward
              ctx.fillStyle = '#ff2448'; ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.95, Math.PI, 0); ctx.fill();
              ctx.fillRect(0, -r * 0.62, r * 1.45, r * 0.22);
            }
          }
          ctx.restore();
          return;
        }
        case 'energy': {
          const pulse = 1 + Math.sin(t * 30) * 0.12;
          RS.Post.glow(pr.x, pr.y, pr.r * 3, '#c8ff7d', 0.7);
          ctx.fillStyle = '#0b0910'; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 1.15 * pulse, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#9cff35'; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * pulse, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#efffd8'; ctx.beginPath(); ctx.arc(pr.x - 1.5, pr.y - 1.5, pr.r * 0.5, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(pr.x - pr.r * 0.6, pr.y + 1); ctx.lineTo(pr.x, pr.y - pr.r * 0.4); ctx.lineTo(pr.x + 1, pr.y + pr.r * 0.3); ctx.lineTo(pr.x + pr.r * 0.7, pr.y - 1); ctx.stroke();
          return;
        }
      }
    },
    // new zone kinds (render zone pass falls through to here)
    drawZone(ctx, z, fade) {
      if (z.kind !== 'toxic') return;
      const k = Math.min(1, z.age / 0.25) * fade, t = z.age;
      ctx.fillStyle = U.rgba('#3d6b12', 0.32 * k); ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.62, 0, 0, U.TAU); ctx.fill();
      for (let i = 0; i < 5; i++) { // slow bubbling puffs inside the cloud
        const a = i * 1.26 + t * 0.6, rr = z.r * (0.25 + 0.45 * ((i * 37) % 10) / 10);
        ctx.fillStyle = U.rgba(i % 2 ? '#9cff35' : '#5f9a1c', 0.22 * k);
        ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6 - 6, z.r * 0.32, 0, U.TAU); ctx.fill();
      }
      ctx.strokeStyle = U.rgba('#9cff35', 0.55 * k); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.62, 0, 0, U.TAU); ctx.stroke();
      RS.Post.light(z.x, z.y, z.r * 1.4, '#9cff35', 0.25 * k);
    },
    // a stash item lying in the world: its icon, a rarity glow and a slow orbiting spark
    drawPickup(ctx, R, k, t) {
      const col = RAR_COL(k.tier), size = 34, bob = Math.sin(t * 3 + k.x) * 4;
      R.contact(ctx, k.x, k.y + size * 0.42, size * 0.42, size * 0.13, 0.4);
      RS.Post.glow(k.x, k.y + bob, size * (k.tier >= 2 ? 1.1 : 0.85), col, 0.8);
      ctx.strokeStyle = U.rgba(col, 0.75); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(k.x, k.y + size * 0.42, size * 0.55, size * 0.18, 0, 0, U.TAU); ctx.stroke();
      const a = t * 2.2 + k.x;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(k.x + Math.cos(a) * size * 0.62 - 1.5, k.y + bob + Math.sin(a) * size * 0.3 - 1.5, 3, 3);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(RS.Icons.get(k.id2), k.x - size / 2, k.y - size / 2 + bob, size, size);
    },
  };

  RS.Stash = X;
})(window.RS);
