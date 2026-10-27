'use strict';
// Weapon + evolution definitions. Behaviour functions receive (w, p, G, S):
//   w = weapon instance, p = player, G = RS.Game, S = resolved stats for this shot.
(function (RS) {
  const U = RS.U, TAU = U.TAU;
  const WEAPONS = {};
  const def = (o) => { o.type = 'weapon'; o.max = o.evolved ? 1 : 8; o.lv = o.lv || []; WEAPONS[o.id] = o; };
  const aimAngle = (p) => Math.atan2(p.aimY, p.aimX);
  const angTo = (p, e) => (e ? Math.atan2(e.y - p.y, e.x - p.x) : aimAngle(p));
  const GUN_CONE = 0.6, MELEE_CONE = 0.95; // aim-assist half angles (rad) around the facing direction
  // a gun shot along the facing direction: aim assist onto f.t if there is one, otherwise straight ahead from the barrel
  function facingShot(G, p, f, speed, spread) {
    if (f.t) return G.gunAim(p, f.t, speed, spread);
    const m = RS.Render.muzzlePos(p, f.a);
    return { a: f.a + (Math.random() - 0.5) * spread * 0.5, m };
  }

  // ---------------------------------------------------------------- GLOCK (starting weapon)
  // A plain sidearm: one slow, weak round at the nearest enemy. Early levels make it feel good.
  function pistol(w, p, G, S, evo) {
    if (!G.facingAim(p, 470, GUN_CONE)) return; // nothing visible in range: hold fire
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.09, () => {
        const f = G.facingAim(p, 470, GUN_CONE);
        if (!f) return;
        // fired where the hero faces; aim assist (lead, capped spread) only onto an enemy inside the facing cone
        const { a, m } = facingShot(G, p, f, S.speed, S.spread * p.s.accuracy), t = f.t;
        p.gunAng = a; p.gunT = G.time;
        G.proj({
          x: m.x, y: m.y, angle: a, speed: S.speed, r: 4 * S.area, dmg: S.dmg, pierce: S.pierce, aim: t,
          life: 0.8 * p.s.range, kind: 'bullet', col: evo ? '#ffd23f' : '#ffe9a8', w, knock: S.knock, crit: S.crit,
          bounce: evo ? 1 : 0, bounceRange: 260,
        });
        RS.FX.muzzle(m.x, m.y, a, evo ? '#ffd23f' : '#ffd27a');
        RS.FX.casing(m.x - Math.cos(a) * 14, m.y - Math.sin(a) * 14, a);
        G.sfx('glock');
      });
    }
  }
  def({
    id: 'glock', name: 'GLOCK', role: 'Starter · single target',
    desc: 'A plain pistol. Fires a single round at the nearest enemy that can pass through one target.',
    // a starter: two bullets and one extra pierce at most, so it stops carrying the run (it did 69% of a run's damage)
    base: { dmg: 10, cd: 0.5, amount: 1, speed: 780, pierce: 1, area: 1, knock: 30, crit: 0.05, spread: 0.08 },
    lv: [[{ dmg: 2 }, '+2 damage'], [{ cd: -0.06 }, '-0.06s cooldown'], [{ amount: 1 }, '+1 bullet'], [{ dmg: 2 }, '+2 damage'],
      [{ pierce: 1 }, '+1 pierce'], [{ cd: -0.06 }, '-0.06s cooldown'], [{ dmg: 3 }, '+3 damage']],
    evo: 'gold_glock', evoWith: 'vip_wristband',
    fire: (w, p, G, S) => pistol(w, p, G, S, false),
  });
  def({
    id: 'gold_glock', name: 'GOLD GLOCK', evolved: true, from: 'glock', role: 'Evolution',
    desc: 'Gold-plated and full auto. Rounds pierce and ricochet into the next target.',
    // build bench: the old numbers (16 dmg, 2 shots, pierce 1) were 1.06x a level 8 GLOCK, every other evolution is 2-8x
    base: { dmg: 26, cd: 0.3, amount: 3, speed: 940, pierce: 2, area: 1.2, knock: 50, crit: 0.2, spread: 0.12 },
    fire: (w, p, G, S) => pistol(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- RAGE BURST
  function rageBurst(w, p, G, S, evo) {
    if (!G.facingAim(p, 560, GUN_CONE)) return;
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.065, () => {
        const f = G.facingAim(p, 560, GUN_CONE);
        if (!f) return;
        const t = f.t, a = t ? G.aimAt(p.x, p.y - 6, t, S.speed) + G.aimJitter(p.x, p.y - 6, t, 0.14 * p.s.accuracy) : f.a + U.rand(-0.04, 0.04);
        RS.FX.rage(0, p.x + Math.cos(a) * 12, p.y - 6 + Math.sin(a) * 12, a, evo ? '#ffe14a' : '#ff2448', 1);
        G.proj({
          x: p.x, y: p.y - 6, angle: a, speed: S.speed, r: 7 * S.area, dmg: S.dmg, pierce: S.pierce, life: 0.95 * p.s.range, aim: t,
          kind: 'bolt', col: evo ? '#ffe14a' : '#ff2448', w, knock: S.knock, crit: S.crit,
          onHit: evo ? overdriveHit : null,
        });
        G.sfx('rage');
      });
    }
  }
  function overdriveHit(pr, e, G, res) {
    if (!pr.child) {
      const a = Math.atan2(pr.vy, pr.vx);
      for (const off of [-0.5, 0.5]) {
        G.proj({ x: e.x, y: e.y, angle: a + off, speed: 640, r: 5, dmg: pr.dmg * 0.6, pierce: 0, life: 0.35, kind: 'bolt', col: '#ff8a3d', w: pr.w, child: true, skipId: e.id });
      }
    }
    if (res.crit) {
      G.aoe(e.x, e.y, 58 * (pr.w.S.area || 1), pr.dmg * 0.7, { w: pr.w, noCrit: true, ring: '#ffe14a', knock: 120, boom: 'boom_gold' });
    }
  }
  def({
    id: 'rage_burst', name: 'RAGE BURST', role: 'Single target · fast',
    desc: 'Rapid bursts of compressed red energy at the nearest enemy.',
    base: { dmg: 9, cd: 1.05, amount: 3, speed: 620, pierce: 1, area: 1, knock: 40, crit: 0.05 },
    lv: [[{ amount: 1 }, '+1 shot per burst'], [{ dmg: 3 }, '+3 damage'], [{ cd: -0.1 }, '-0.1s cooldown'], [{ pierce: 1 }, '+1 pierce'],
      [{ amount: 1 }, '+1 shot per burst'], [{ dmg: 4 }, '+4 damage'], [{ amount: 1, cd: -0.1 }, '+1 shot, -0.1s cooldown']],
    evo: 'twizzy_overdrive', evoWith: 'chrome_chain',
    fire: (w, p, G, S) => rageBurst(w, p, G, S, false),
  });
  def({
    id: 'twizzy_overdrive', name: 'TWIZZY OVERDRIVE', evolved: true, from: 'rage_burst', role: 'Evolution',
    desc: 'Bolts split on impact. Critical hits detonate into golden explosions.',
    base: { dmg: 18, cd: 0.6, amount: 6, speed: 720, pierce: 2, area: 1.2, knock: 60, crit: 0.15 },
    fire: (w, p, G, S) => rageBurst(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- SCHMUNK SPIN
  function schmunkSpin(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.12, () => {
        const t = i === 0 ? G.target(p.x, p.y, 520) : G.randomNear(p.x, p.y, 460);
        const a = t ? G.aimAt(p.x, p.y, t, S.speed) : U.rand(TAU);
        G.proj({
          x: p.x, y: p.y, angle: a, speed: S.speed, r: 9 * S.area, dmg: S.dmg, pierce: 0, life: 2.6 * p.s.range,
          kind: 'spin', col: evo ? '#ff4f6e' : '#c8ff7d', w, knock: S.knock, crit: S.crit,
          bounce: S.bounce, bounceRange: 300, bonusPer: S.bonusPer, bonusCap: S.bonusCap, wallBounce: true,
          onBounce: (pr, e, G2) => {
            G2.sfx('bounce', { n: pr.bounceCount });
            if (evo) for (let k = 0; k < 2; k++) G2.proj({ x: e.x, y: e.y, angle: U.rand(TAU), speed: 520, r: 4, dmg: pr.dmg * 0.4, pierce: 0, life: 0.45, kind: 'shard', col: '#e3ece6', w: pr.w, skipId: e.id });
          },
        });
        G.sfx('spin');
      });
    }
  }
  def({
    id: 'schmunk_spin', name: 'SCHMUNK SPIN', role: 'Crowd · ricochet',
    desc: 'A grinning disc that ricochets between enemies. Each bounce hits harder.',
    base: { dmg: 11, cd: 1.35, amount: 1, speed: 430, bounce: 3, area: 1, knock: 30, crit: 0.05, bonusPer: 0.12, bonusCap: 0.6 },
    lv: [[{ bounce: 1 }, '+1 bounce'], [{ amount: 1 }, '+1 disc'], [{ dmg: 4 }, '+4 damage'], [{ bounce: 2 }, '+2 bounces'],
      [{ amount: 1 }, '+1 disc'], [{ cd: -0.15 }, '-0.15s cooldown'], [{ dmg: 5, bounce: 1 }, '+5 damage, +1 bounce']],
    evo: 'schmunk_exe', evoWith: 'lost_usb',
    fire: (w, p, G, S) => schmunkSpin(w, p, G, S, false),
  });
  def({
    id: 'schmunk_exe', name: 'SCHMUNK.EXE', evolved: true, from: 'schmunk_spin', role: 'Evolution',
    desc: 'Three corrupted discs, twelve bounces each. Every bounce sprays glitch shards.',
    // build bench: 12 bounces at +15% each (cap +150%) made it 6x any other weapon on a few targets (a boss and two adds)
    base: { dmg: 18, cd: 1.0, amount: 3, speed: 520, bounce: 8, area: 1.25, knock: 40, crit: 0.1, bonusPer: 0.1, bonusCap: 0.8 },
    fire: (w, p, G, S) => schmunkSpin(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- BASS CANNON
  function bassCannon(w, p, G, S, evo) {
    const f = G.facingAim(p, 600, GUN_CONE);
    if (!f) return;
    const base = f.t ? G.aimAt(p.x, p.y, f.t, S.speed) : f.a;
    for (let i = 0; i < S.amount; i++) {
      const a = base + (i - (S.amount - 1) / 2) * 0.32;
      G.proj({
        x: p.x, y: p.y, angle: a, speed: S.speed, r: 18 * S.area, dmg: S.dmg, pierce: 999, life: 2.2 * p.s.range,
        kind: 'bass', col: evo ? '#ffe14a' : '#ff2448', w, knock: S.knock, sonic: true, crit: 0,
        pulse: evo ? 0.3 : 0, // build bench: 0.22 s pulses of 90 x area covered the whole crowd in a sonic build
        onTick: evo ? (pr, G2, dt) => {
          pr.pulseT = (pr.pulseT || 0) - dt;
          if (pr.pulseT <= 0) { pr.pulseT = pr.pulse; G2.aoe(pr.x, pr.y, 64 * S.area, pr.dmg * 0.25, { w: pr.w, sonic: true, knock: 200, ring: '#ff2448', noCrit: true }); }
        } : null,
        onEnd: evo ? (pr, G2) => { G2.aoe(pr.x, pr.y, 115 * S.area, pr.dmg * 0.8, { w: pr.w, sonic: true, knock: 420, ring: '#ffe14a', fill: 0.25 }); G2.sfx('wave808'); } : null,
      });
    }
    G.sfx('bass');
    RS.FX.shake(0.06, 0.3);
  }
  def({
    id: 'bass_cannon', name: 'BASS CANNON', role: 'Pierce · knockback', sonic: true,
    desc: 'A slow sonic blob that pierces everything and shoves enemies back.',
    base: { dmg: 32, cd: 2.6, amount: 1, speed: 240, area: 1, knock: 300 },
    lv: [[{ dmg: 10 }, '+10 damage'], [{ area: 0.25 }, '+25% size'], [{ cd: -0.3 }, '-0.3s cooldown'], [{ amount: 1 }, '+1 cannon'],
      [{ dmg: 12 }, '+12 damage'], [{ knock: 120, area: 0.15 }, '+knockback, +15% size'], [{ amount: 1 }, '+1 cannon']],
    evo: 'bass_apocalypse', evoWith: 'energy_808',
    fire: (w, p, G, S) => bassCannon(w, p, G, S, false),
  });
  def({
    id: 'bass_apocalypse', name: 'BASS APOCALYPSE', evolved: true, from: 'bass_cannon', role: 'Evolution', sonic: true,
    desc: 'Massive blasts that drop secondary shockwaves along their path and erupt at the end.',
    base: { dmg: 50, cd: 1.9, amount: 2, speed: 260, area: 1.8, knock: 400 }, // was 70, end blast 170 x area: a sonic build was 2-17x every other
    fire: (w, p, G, S) => bassCannon(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- OPIUM ORBIT
  function orbitUpdate(w, p, G, S, dt, evo) {
    w.ang = (w.ang || 0) + S.speed * dt;
    const n = Math.max(1, Math.round(S.amount)), R = S.radius * S.area;
    if (!w.orbs) w.orbs = [];
    while (w.orbs.length < n) w.orbs.push({ x: 0, y: 0 });
    w.orbs.length = n;
    if (!w.hitMap || G.time - (w.mapT || 0) > 2) { w.hitMap = new Map(); w.mapT = G.time; }
    const hr = 13 * S.area * (evo ? 1.3 : 1);
    for (let i = 0; i < n; i++) {
      const a = w.ang + (i * TAU) / n;
      const o = w.orbs[i];
      o.x = p.x + Math.cos(a) * R; o.y = p.y + Math.sin(a) * R; o.a = a;
      const hits = G.inRadius(o.x, o.y, hr);
      for (const e of hits) {
        const last = w.hitMap.get(e.id);
        if (last !== undefined && G.time - last < S.hitCd) continue;
        w.hitMap.set(e.id, G.time);
        G.damage(e, S.dmg, { w, knock: S.knock, kx: e.x - p.x, ky: e.y - p.y, crit: S.crit });
      }
      if (evo) G.clearEnemyShots(o.x, o.y, hr + 6);
    }
    if (evo) {
      w.shieldT = (w.shieldT || 0) - dt;
      if (w.shieldT <= 0) { w.shieldT = 10; if (p.shield < 1) { p.shield = 1; RS.FX.ring(p.x, p.y, 50, '#e6ebf3', 0.4, 3); G.sfx('shield'); } }
    }
  }
  function orbitDraw(ctx, w, p, G, evo) {
    if (!w.orbs) return;
    const img = RS.Icons.get(evo ? 'masked_ascension' : 'opium_orbit');
    const s = (evo ? 30 : 24) * (w.S.area || 1);
    for (const o of w.orbs) {
      ctx.globalCompositeOperation = 'lighter';
      const g = RS.Sprites.glow(evo ? '#9cff35' : '#cfd6e3', 22);
      ctx.drawImage(g, o.x - 22, o.y - 22);
      ctx.globalCompositeOperation = 'source-over';
      // painted chrome cross stays upright and shimmers through its silver frames; the evolved star spins
      if (RS.FXS.ready) RS.FXS.draw(ctx, evo ? 'star' : 'cross', evo ? 0 : [0, 2, 4][Math.floor(G.time * 6 + o.a) % 3 | 0], o.x, o.y, evo ? o.a * 0.5 : 0, s * (evo ? 1.5 : 1.35) / 64);
      else { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a * 0.5); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore(); }
    }
  }
  def({
    id: 'opium_orbit', name: 'OPIUM ORBIT', role: 'Defense · close range', persistent: true,
    desc: 'Chrome crosses circle you and cut anything that gets close.',
    base: { dmg: 10, amount: 2, area: 1, speed: 3.0, radius: 78, hitCd: 0.45, knock: 70, crit: 0.05, cd: 1 },
    lv: [[{ amount: 1 }, '+1 cross'], [{ dmg: 5 }, '+5 damage'], [{ area: 0.2 }, '+20% radius'], [{ amount: 1 }, '+1 cross'],
      [{ speed: 1.0 }, '+33% rotation speed'], [{ dmg: 6 }, '+6 damage'], [{ amount: 1 }, '+1 cross']],
    evo: 'masked_ascension', evoWith: 'balaclava',
    update: (w, p, G, S, dt) => orbitUpdate(w, p, G, S, dt, false),
    draw: (ctx, w, p, G) => orbitDraw(ctx, w, p, G, false),
  });
  def({
    id: 'masked_ascension', name: 'MASKED ASCENSION', evolved: true, from: 'opium_orbit', role: 'Evolution', persistent: true,
    desc: 'Seven chrome stars at high speed. They eat enemy shots and grant a shield every 10s.',
    base: { dmg: 26, amount: 7, area: 1.5, speed: 4.6, radius: 92, hitCd: 0.3, knock: 110, crit: 0.1, cd: 1 },
    update: (w, p, G, S, dt) => orbitUpdate(w, p, G, S, dt, true),
    draw: (ctx, w, p, G) => orbitDraw(ctx, w, p, G, true),
  });

  // ---------------------------------------------------------------- TWIZZY TORNADO
  function tornado(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      const c = G.densest(p.x, p.y, 380) || { x: p.x + p.aimX * 140, y: p.y + p.aimY * 140 };
      const ox = i ? U.rand(-90, 90) : 0, oy = i ? U.rand(-90, 90) : 0;
      G.zone({
        kind: 'tornado', x: c.x + ox, y: c.y + oy, r: S.radius * S.area, life: S.dur, tick: 0.25, dmg: S.dmg, pull: S.pull, w,
        col: evo ? '#9cff35' : '#ff3b55', seek: evo ? 70 : 0,
        onUpdate: evo ? (z, G2, dt) => {
          z.emitT = (z.emitT || 0) - dt;
          if (z.emitT <= 0) {
            z.emitT = 0.3;
            G2.proj({ x: z.x, y: z.y, angle: U.rand(TAU), speed: 380, r: 6, dmg: 12 * p.s.might, pierce: 0, life: 1.2, kind: 'spin', col: '#c8ff7d', w: z.w, bounce: 2, bounceRange: 220, bonusPer: 0.1, bonusCap: 0.3 });
          }
        } : null,
        onEnd: (z, G2) => { G2.aoe(z.x, z.y, z.r * 1.5, S.blast, { w: z.w, knock: 280, ring: z.col, fill: 0.2 }); G2.sfx('explode'); },
      });
    }
    G.sfx('tornado');
  }
  def({
    id: 'twizzy_tornado', name: 'TWIZZY TORNADO', role: 'Crowd control · pull',
    desc: 'Spawns a vortex in the thickest crowd that sucks enemies in, then blasts them out.',
    // 2026-10-26: radius 85 -> 75, blast 26 / +12 / +14 -> 18 / +9 / +10, tick +3 -> +2, size steps 20 / 25 -> 15 / 15%.
    // Build bench (15:00 crowd, LV 8 alone, 3 seeds): 3.8x the damage of a CHROME WHIP / RAGE ROCKET level weapon, now
    // ~2.8x (-25% damage, -32% kills); the pull still groups the crowd for everything else
    base: { dmg: 4, cd: 4.2, area: 1, dur: 1.6, pull: 150, blast: 15, amount: 1, radius: 75 }, // blast was 18: the strongest base weapon on the bench (2026-10-27)
    lv: [[{ area: 0.15 }, '+15% size'], [{ blast: 9 }, '+9 blast damage'], [{ cd: -0.5 }, '-0.5s cooldown'], [{ dur: 0.5 }, '+0.5s duration'],
      [{ amount: 1 }, '+1 vortex'], [{ dmg: 2, blast: 10 }, '+2 tick, +10 blast damage'], [{ area: 0.15 }, '+15% size']],
    evo: 'schmunk_storm', evoWith: 'double_cup',
    fire: (w, p, G, S) => tornado(w, p, G, S, false),
  });
  def({
    id: 'schmunk_storm', name: 'SCHMUNK STORM', evolved: true, from: 'twizzy_tornado', role: 'Evolution',
    desc: 'A huge wandering storm that hunts crowds and spits bouncing discs.',
    base: { dmg: 6, cd: 3.4, area: 1.8, dur: 4.0, pull: 210, blast: 48, amount: 1, radius: 90 }, // was 8 / 75, then blast 55 (2026-10-27): still a top-3 evolution and in most winning bot runs
    fire: (w, p, G, S) => tornado(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- GLITCH GLOCK
  function glock(w, p, G, S, evo) {
    if (!G.facingAim(p, 480, GUN_CONE)) return;
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.045, () => {
        const f = G.facingAim(p, 480, GUN_CONE);
        if (!f) return;
        const { a, m } = facingShot(G, p, f, S.speed, S.spread * 2 * p.s.accuracy), t = f.t;
        p.gunAng = a; p.gunT = G.time;
        RS.FX.muzzle(m.x, m.y, a, evo ? '#ff4f6e' : '#b45cff');
        G.proj({
          x: m.x, y: m.y, angle: a, speed: S.speed, r: 4.5 * S.area, dmg: S.dmg, pierce: S.pierce, aim: t,
          life: 0.7 * p.s.range, kind: 'shard', col: evo ? '#ff4f6e' : '#9cff35', w, knock: 25, crit: S.crit,
          bounce: evo ? 2 : 0, bounceRange: 240,
          onHit: evo ? anarchyHit : null,
        });
        G.sfx('glock');
      });
    }
  }
  function anarchyHit(pr, e, G) {
    if (!pr.child && Math.random() < 0.5) {
      G.proj({ x: e.x, y: e.y, angle: U.rand(TAU), speed: 700, r: 4, dmg: pr.dmg * 0.7, pierce: 0, life: 0.5, kind: 'shard', col: '#e3ece6', w: pr.w, child: true, skipId: e.id });
    }
    if (Math.random() < 0.2) {
      const t = G.randomNear(e.x, e.y, 320, e);
      if (t) {
        RS.FX.arc([e.x, e.y, t.x, t.y], '#ff4f6e', 0.12, 2);
        RS.FX.burst(t.x, t.y, ['#ff4f6e', '#e3ece6'], 5, 160);
        G.damage(t, pr.dmg * 0.8, { w: pr.w, crit: pr.crit });
        G.sfx('teleport');
      }
    }
  }
  def({
    id: 'glitch_glock', name: 'GLITCH GLOCK', role: 'Rapid fire · crits',
    desc: 'Sprays a rapid string of digital bursts at the closest enemy. High crit chance.',
    // was dmg 5 (2026-10-26): the weakest weapon on the build bench by far, 44% of the starting GLOCK; now ~65%, it is
    // the crit build's gun (CRIT TAPE, mods)
    base: { dmg: 6, cd: 0.95, amount: 4, speed: 820, pierce: 0, crit: 0.12, spread: 0.12, area: 1 }, // 8 -> 6 (2026-10-27): the bench bot faces away from its targets, so guns measured weak; an aiming player shredded the 5:00 crowd
    lv: [[{ amount: 1 }, '+1 burst'], [{ dmg: 2 }, '+2 damage'], [{ cd: -0.12 }, '-0.12s cooldown'], [{ amount: 2 }, '+2 bursts'],
      [{ pierce: 1 }, '+1 pierce'], [{ dmg: 3 }, '+3 damage'], [{ amount: 2, crit: 0.08 }, '+2 bursts, +8% crit']],
    evo: 'digital_anarchy', evoWith: 'glitch_chip',
    fire: (w, p, G, S) => glock(w, p, G, S, false),
  });
  def({
    id: 'digital_anarchy', name: 'DIGITAL ANARCHY', evolved: true, from: 'glitch_glock', role: 'Evolution',
    desc: 'Shots duplicate, ricochet and sometimes teleport straight into another target.',
    base: { dmg: 15, cd: 0.6, amount: 8, speed: 900, pierce: 1, crit: 0.25, spread: 0.16, area: 1.2 }, // was 12
    fire: (w, p, G, S) => glock(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- CLOUD NINE
  function cloudUpdate(w, p, G, S, dt, evo) {
    const n = Math.max(1, Math.round(S.amount));
    if (!w.clouds) w.clouds = [];
    while (w.clouds.length < n) w.clouds.push({ x: p.x, y: p.y - 80, t: U.rand(0.2, S.cd), ph: U.rand(TAU) });
    w.clouds.length = n;
    w.ang = (w.ang || 0) + dt * 0.6;
    w.clouds.forEach((c, i) => {
      const a = w.ang + (i * TAU) / n;
      const tx = p.x + Math.cos(a) * 80, ty = p.y - 70 + Math.sin(a) * 30;
      c.x += (tx - c.x) * Math.min(1, dt * 4); c.y += (ty - c.y) * Math.min(1, dt * 4);
      c.t -= dt;
      if (c.t <= 0) {
        c.t = S.cd;
        const t = G.randomNear(c.x, c.y + 70, S.range);
        if (!t) { c.t = 0.3; return; }
        strike(w, p, G, S, c, t, evo);
      }
    });
  }
  function strike(w, p, G, S, c, t, evo) {
    const R = 34 * S.area;
    RS.FX.arc([t.x + U.rand(-30, 30), t.y - 260, t.x + U.rand(-10, 10), t.y - 120, t.x, t.y], evo ? '#e3ece6' : '#ff2448', 0.16, 3);
    RS.FX.pop(t.x, t.y, 30, evo ? ['#e3ece6', '#ffffff'] : ['#ff2448', '#ffffff'], 'zap');
    RS.FX.ring(t.x, t.y, R, evo ? '#e3ece6' : '#ff2448', 0.25, 3);
    RS.FX.burst(t.x, t.y, [evo ? '#e3ece6' : '#ff2448', '#ffffff'], 6, 200, { kind: 'line' });
    G.aoe(t.x, t.y, R, S.dmg, { w, knock: 80 });
    G.sfx('zap');
    if (evo) {
      const hit = [t.id];
      let cur = t; const pts = [t.x, t.y];
      for (let k = 0; k < 4; k++) {
        const nx = G.nearestSeen(cur.x, cur.y, 170, hit);
        if (!nx) break;
        hit.push(nx.id); pts.push(nx.x, nx.y);
        G.damage(nx, S.dmg * 0.7, { w });
        cur = nx;
      }
      if (pts.length > 2) RS.FX.arc(pts, '#e3ece6', 0.18, 2);
      G.zone({ kind: 'static', x: t.x, y: t.y, r: 46 * S.area, life: 2, tick: 0.3, dmg: S.dmg * 0.15, w, col: '#e3ece6' });
    }
  }
  // Pixel-art cloud baked once per palette (like the explosion strips): a 28 x 15 grid of puffs with a hard dark
  // outline, a 3-tone ramp lit from the top and a dithered underside, 2 frames that swap slowly so it breathes.
  // Drawn nearest-neighbour at a whole number of world units per pixel, so it stays sharp squares.
  const CLOUD_PAL = { base: ['#f1e6ff', '#b39ddb', '#7d63b8', '#2a1840'], evo: ['#f4ffe6', '#d6ffb0', '#8fbf6a', '#241a34'] };
  const cloudSprites = {};
  function cloudSprite(evo) {
    const key = evo ? 'evo' : 'base';
    if (cloudSprites[key]) return cloudSprites[key];
    const PW = 28, PH = 15, cv = document.createElement('canvas');
    cv.width = PW * 2; cv.height = PH;
    const g = cv.getContext('2d'), P = CLOUD_PAL[key];
    // puffs [x, y, r]: a bumpy top of 4 rounds over a flat, lumpy belly
    const top = [[5, 9, 3], [9.5, 6.4, 3.6], [15.5, 5, 4.6], [21.5, 6.8, 3.4], [25, 9.4, 2.4]];
    const belly = [[5, 10.2, 2.6], [9, 10.6, 3], [14, 10.6, 3.2], [19, 10.6, 3], [23, 10.4, 2.6]];
    const frames = [top.concat(belly), top.map(([x, y, r], i) => [x, y + (i % 2 ? 0.45 : -0.35), r + (i % 2 ? -0.15 : 0.15)]).concat(belly)];
    frames.forEach((B, f) => {
      const inside = (x, y) => B.some(([bx, by, r]) => Math.hypot(x + 0.5 - bx, y + 0.5 - by) <= r);
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        if (inside(x, y)) {
          // light from the top: highlight where the pixel above is open air, shadow on the lower band
          const lit = !inside(x, y - 1) || !inside(x, y - 2), low = y >= 11 || !inside(x, y + 1);
          let c = lit ? P[0] : low ? P[2] : P[1];
          if (y === 10 && (x + f) % 2 && c === P[1]) c = P[2]; // dithered step into the underside
          g.fillStyle = c; g.fillRect(f * PW + x, y, 1, 1);
        } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
          g.fillStyle = P[3]; g.fillRect(f * PW + x, y, 1, 1); // hard outline
        }
      }
    });
    return (cloudSprites[key] = { cv, PW, PH });
  }
  function cloudDraw(ctx, w, p, G, evo) {
    if (!w.clouds) return;
    const sp = cloudSprite(evo), K = 3, was = ctx.imageSmoothingEnabled; // K world units per cloud pixel
    ctx.imageSmoothingEnabled = false;
    for (const c of w.clouds) {
      const bob = Math.round(Math.sin(G.time * 2 + c.ph) * 1) * K; // bobs a whole pixel at a time
      const x = Math.round((c.x - sp.PW * K / 2) / K) * K, y = Math.round((c.y - sp.PH * K / 2) / K) * K + bob;
      // stepped pixel shadow on the floor (3 rows: narrow, wide, narrow)
      ctx.fillStyle = 'rgba(10,6,20,0.32)';
      const sy = Math.round((c.y + 74) / K) * K, mx = x + sp.PW * K / 2;
      ctx.fillRect(mx - 5 * K, sy, 10 * K, K); ctx.fillRect(mx - 7 * K, sy + K, 14 * K, K); ctx.fillRect(mx - 5 * K, sy + 2 * K, 10 * K, K);
      const f = Math.floor(G.time * 1.2 + c.ph) & 1;
      ctx.drawImage(sp.cv, f * sp.PW, 0, sp.PW, sp.PH, x, y, sp.PW * K, sp.PH * K);
      if (c.t < 0.25) { // charged: a pixel bolt hangs under the cloud
        const bolt = [[15, 15], [14, 16], [15, 16], [14, 17], [13, 18], [14, 18], [13, 19]]; // zigzag under the belly
        ctx.fillStyle = '#2a1840'; for (const [bx, by] of bolt) ctx.fillRect(x + (bx + 1) * K, y + (by + 1) * K, K, K);
        ctx.fillStyle = '#ffe14a'; for (const [bx, by] of bolt) ctx.fillRect(x + bx * K, y + by * K, K, K);
        RS.Post.glow(c.x, c.y + 40, 14, '#ffe14a', 0.4);
      }
    }
    ctx.imageSmoothingEnabled = was;
  }
  def({
    id: 'cloud_nine', name: 'CLOUD NINE', role: 'Random strikes · area', persistent: true,
    desc: 'Purple clouds follow you and drop lightning on enemies around you.',
    base: { dmg: 18, cd: 1.7, amount: 1, area: 1, range: 320 },
    lv: [[{ amount: 1 }, '+1 cloud'], [{ dmg: 6 }, '+6 damage'], [{ cd: -0.25 }, '-0.25s cooldown'], [{ amount: 1 }, '+1 cloud'],
      [{ area: 0.3 }, '+30% strike radius'], [{ dmg: 8 }, '+8 damage'], [{ amount: 1 }, '+1 cloud']],
    evo: 'cloudchase', evoWith: 'sound_cloud',
    update: (w, p, G, S, dt) => cloudUpdate(w, p, G, S, dt, false),
    draw: (ctx, w, p, G) => cloudDraw(ctx, w, p, G, false),
  });
  def({
    id: 'cloudchase', name: 'CLOUDCHASE', evolved: true, from: 'cloud_nine', role: 'Evolution', persistent: true,
    desc: 'Lightning chains through 4 more enemies and leaves crackling static zones.',
    base: { dmg: 34, cd: 1.1, amount: 4, area: 1.3, range: 360 },
    update: (w, p, G, S, dt) => cloudUpdate(w, p, G, S, dt, true),
    draw: (ctx, w, p, G) => cloudDraw(ctx, w, p, G, true),
  });

  // ---------------------------------------------------------------- 808 SHOCKWAVE
  function shock808(w, p, G, S, evo) {
    for (let k = 0; k < S.pulses; k++) {
      G.later(k * 0.24, () => {
        G.zone({
          kind: 'wave', x: p.x, y: p.y, r: 0, maxR: S.radius * S.area, life: 0.45, dmg: S.dmg, knock: S.knock, sonic: true, w,
          col: evo ? '#ffe14a' : '#ff2448',
          onEnd: evo ? (z, G2) => {
            if (z.count >= 8) {
              if (p.shield < 1) { p.shield = 1; G2.sfx('shield'); }
              G2.heal(2);
            }
          } : null,
        });
        G.sfx('wave808');
        RS.FX.shake(0.05, 0.3);
      });
    }
  }
  def({
    id: 'shock_808', name: '808 SHOCKWAVE', role: 'Crowd · knockback', sonic: true,
    desc: 'Rings of bass energy expand out from you and throw enemies back.',
    base: { dmg: 14, cd: 3.0, area: 1, radius: 150, knock: 240, pulses: 1 },
    lv: [[{ area: 0.2 }, '+20% radius'], [{ dmg: 6 }, '+6 damage'], [{ cd: -0.4 }, '-0.4s cooldown'], [{ pulses: 1 }, '+1 pulse'],
      [{ knock: 120 }, '+50% knockback'], [{ dmg: 8 }, '+8 damage'], [{ area: 0.25 }, '+25% radius']],
    evo: 'blown_speaker', evoWith: 'the_bells', // rings on the beat + rings of bass (was DESIGNER PUFFER, which BAD VIBES also wants)
    fire: (w, p, G, S) => shock808(w, p, G, S, false),
  });
  def({
    id: 'blown_speaker', name: 'BLOWN SPEAKER', evolved: true, from: 'shock_808', role: 'Evolution', sonic: true,
    desc: 'Triple pulse. A wave that hits 8+ enemies grants a shield and heals you.',
    base: { dmg: 31, cd: 2.2, area: 1.7, radius: 150, knock: 330, pulses: 3 }, // knock was 420: a sonic build took no damage at all at 20:00
    fire: (w, p, G, S) => shock808(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- CHROME WHIP
  function whip(w, p, G, S, evo) {
    const f = G.facingAim(p, S.range * S.area * 1.3, MELEE_CONE);
    if (!f) return;
    const dir = f.a; // swings where you face (assist onto a close enemy in front)
    const swing = (a) => {
      const R = S.range * S.area;
      const list = G.inRadius(p.x, p.y, R);
      for (const e of list) {
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        const tol = Math.atan2(e.r, d);
        if (Math.abs(U.angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) <= S.arc / 2 + tol) {
          G.damage(e, S.dmg, { w, crit: S.crit, knock: S.knock, kx: e.x - p.x, ky: e.y - p.y, freezeOnCrit: evo });
        }
      }
      G.zone({ kind: 'slash', x: p.x, y: p.y, r: R, life: 0.26, ang: a, arc: S.arc, // visual only: damage already landed above
        follow: true, col: evo ? '#9fe9ff' : '#e6ebf3', w, noDamage: true });
      G.sfx('whip');
    };
    swing(dir);
    for (let i = 1; i < S.amount; i++) G.later(i * 0.12, () => swing(dir + (i % 2 ? Math.PI : Math.PI / 2 * (i - 1))));
  }
  def({
    id: 'chrome_whip', name: 'CHROME WHIP', role: 'Melee · arc',
    desc: 'A chain of chrome energy whips a wide arc toward the closest threat.',
    base: { dmg: 16, cd: 1.4, area: 1, range: 125, arc: 2.4, knock: 150, amount: 1, crit: 0.05 },
    lv: [[{ amount: 1 }, '+1 swing (behind)'], [{ dmg: 6 }, '+6 damage'], [{ area: 0.2 }, '+20% range'], [{ cd: -0.2 }, '-0.2s cooldown'],
      [{ dmg: 8 }, '+8 damage'], [{ crit: 0.1 }, '+10% crit'], [{ area: 0.25, dmg: 6 }, '+25% range, +6 damage']],
    evo: 'iced_out', evoWith: 'red_laser',
    fire: (w, p, G, S) => whip(w, p, G, S, false),
  });
  def({
    id: 'iced_out', name: 'ICED OUT', evolved: true, from: 'chrome_whip', role: 'Evolution',
    desc: 'A full 360° diamond-chain spin. Crits freeze enemies solid.',
    base: { dmg: 56, cd: 1.1, area: 1.6, range: 125, arc: TAU, knock: 200, amount: 1, crit: 0.3 }, // was 45
    fire: (w, p, G, S) => whip(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- MOSH PIT
  function mosh(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      let x = p.x, y = p.y;
      if (i === 0 && !G.nearest(p.x, p.y, S.radius * S.area)) { const c = G.densest(p.x, p.y, 260); if (c) { x = c.x; y = c.y; } }
      if (i > 0) { const t = G.randomNear(p.x, p.y, 300); if (t) { x = t.x; y = t.y; } else { x += U.rand(-150, 150); y += U.rand(-150, 150); } }
      G.zone({ kind: 'mosh', x, y, r: S.radius * S.area, life: S.dur, tick: S.tick, dmg: S.dmg, knock: S.knock, w,
        col: evo ? '#9b4dff' : '#ff2448', slow: evo ? 0.5 : 0, pull: evo ? 110 : 0 });
    }
    G.sfx('mosh');
  }
  def({
    id: 'mosh_pit', name: 'MOSH PIT', role: 'Zone · sustained',
    desc: 'Opens a violent pit on the ground that keeps hurting everyone inside.',
    base: { dmg: 5, cd: 4.0, area: 1, radius: 72, dur: 3.0, tick: 0.3, amount: 1, knock: 30 },
    // 2026-10-26: base damage 6 -> 5, +1s duration -> +0.5s, +4 -> +3 damage, last radius step 30 -> 20%. Build bench:
    // -22% damage, -35% kills; still a top crowd weapon, no longer 3x the middle of the field
    lv: [[{ area: 0.2 }, '+20% radius'], [{ dmg: 3 }, '+3 damage'], [{ dur: 0.5 }, '+0.5s duration'], [{ cd: -0.6 }, '-0.6s cooldown'],
      [{ amount: 1 }, '+1 pit'], [{ dmg: 3 }, '+3 damage'], [{ area: 0.2 }, '+20% radius']],
    evo: 'purple_haze', evoWith: 'lean',
    fire: (w, p, G, S) => mosh(w, p, G, S, false),
  });
  def({
    id: 'purple_haze', name: 'PURPLE HAZE', evolved: true, from: 'mosh_pit', role: 'Evolution',
    desc: 'Huge purple pits that slow enemies and keep dragging them into the center.',
    base: { dmg: 10, cd: 3.5, area: 1.7, radius: 72, dur: 5, tick: 0.3, amount: 2, knock: 10 }, // was 14 / 2.0: two pits covered half the screen; dmg 11 until 2026-10-27
    fire: (w, p, G, S) => mosh(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- SOUNDWAVE
  function soundwave(w, p, G, S, evo) {
    const R = S.range * S.area;
    const f = G.facingAim(p, R * 1.2, MELEE_CONE);
    if (!f) return;
    const dir = f.a; // blasts where you face
    const cone = (a) => {
      const list = G.inRadius(p.x, p.y, R);
      for (const e of list) {
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (Math.abs(U.angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) <= S.angle / 2 + Math.atan2(e.r, d)) {
          G.damage(e, S.dmg, { w, knock: S.knock, kx: Math.cos(a), ky: Math.sin(a), sonic: true, distort: evo });
        }
      }
      G.zone({ kind: 'cone', x: p.x, y: p.y, r: R, life: 0.3, ang: a, arc: S.angle, follow: true, col: evo ? '#ff2448' : '#e3ece6', w, noDamage: true });
    };
    cone(dir);
    if (S.amount >= 2) G.later(0.1, () => cone(dir + Math.PI));
    G.sfx('sonic');
  }
  def({
    id: 'soundwave', name: 'SOUNDWAVE', role: 'Cone · knockback', sonic: true,
    desc: 'A cone-shaped sonic blast toward the nearest enemy. Gets wider every level.',
    base: { dmg: 21, cd: 1.9, angle: 0.7, range: 220, area: 1, knock: 180, amount: 1 }, // was 14, then 19: still the weakest weapon on the bench (2026-10-27)
    lv: [[{ angle: 0.2 }, 'Wider cone'], [{ dmg: 6 }, '+6 damage'], [{ area: 0.2 }, '+20% range'], [{ cd: -0.3 }, '-0.3s cooldown'],
      [{ angle: 0.25 }, 'Wider cone'], [{ dmg: 8 }, '+8 damage'], [{ amount: 1 }, 'Also blasts backward']],
    evo: 'clip_distortion', evoWith: 'headphones',
    fire: (w, p, G, S) => soundwave(w, p, G, S, false),
  });
  def({
    id: 'clip_distortion', name: 'CLIP DISTORTION', evolved: true, from: 'soundwave', role: 'Evolution', sonic: true,
    desc: 'Massive clipped waves both ways. Each hit stacks +8% damage taken (max 10).',
    base: { dmg: 34, cd: 1.4, angle: 2.1, range: 230, area: 1.5, knock: 220, amount: 2 }, // was 30: bottom-3 evolution on the bench (2026-10-27)
    fire: (w, p, G, S) => soundwave(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- DEAD AIR
  function deadAir(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      const c = (i === 0 ? G.densest(p.x, p.y, 420) : G.randomNear(p.x, p.y, 420)) || { x: p.x + U.rand(-120, 120), y: p.y + U.rand(-120, 120) };
      G.zone({ kind: 'deadair', x: c.x, y: c.y, r: S.radius * S.area, life: S.dur, tick: S.tick, dmg: S.dmg, slow: S.slow, vuln: S.vuln,
        ramp: S.ramp || 0, w, col: evo ? '#ff2448' : '#9aa3b2' });
    }
    G.sfx('deadair');
  }
  def({
    id: 'dead_air', name: 'DEAD AIR', role: 'Control · debuff',
    desc: 'A zone of silence. Enemies inside are slowed and take extra damage from everything.',
    base: { cd: 6, area: 1, radius: 90, dur: 4, vuln: 0.25, slow: 0.6, dmg: 3, tick: 0.5, amount: 1 },
    lv: [[{ area: 0.2 }, '+20% radius'], [{ vuln: 0.1 }, '+10% damage taken'], [{ dur: 1.5 }, '+1.5s duration'], [{ cd: -1 }, '-1s cooldown'],
      [{ amount: 1 }, '+1 zone'], [{ area: 0.25 }, '+25% radius'], [{ vuln: 0.15, dmg: 3 }, '+15% damage taken, +3 damage']],
    evo: 'silent_violence', evoWith: 'studio_mic',
    fire: (w, p, G, S) => deadAir(w, p, G, S, false),
  });
  def({
    id: 'silent_violence', name: 'SILENT VIOLENCE', evolved: true, from: 'dead_air', role: 'Evolution',
    desc: 'Enemies trapped in the silence take damage that grows every tick.',
    base: { cd: 5, area: 1.8, radius: 90, dur: 6, vuln: 0.4, slow: 0.7, dmg: 8, tick: 0.4, amount: 1, ramp: 0.16 }, // was vuln 0.5, ramp 0.25, then ramp 0.18 (2026-10-27: top evolution on the bench)
    fire: (w, p, G, S) => deadAir(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- RAGE ROCKET
  function rocket(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.15, () => {
        const t = G.randomNear(p.x, p.y, 600);
        if (!t) return; // rockets only launch at something you can see
        G.proj({
          x: p.x, y: p.y - 8, angle: t ? angTo(p, t) + U.rand(-0.5, 0.5) : U.rand(TAU), speed: S.speed, r: 8, dmg: 0, pierce: 0, life: 1.8,
          kind: 'rocket', col: '#ff7a1a', w, homing: 3.8, target: t, noHitDmg: true,
          onEnd: (pr, G2) => rocketBoom(pr, G2, S, evo),
        });
        G.sfx('rocket');
      });
    }
  }
  function rocketBoom(pr, G, S, evo) {
    const R = S.radius * S.area;
    G.aoe(pr.x, pr.y, R, S.dmg, { w: pr.w, knock: 220, ring: '#ff7a1a', fill: 0.3, boom: true });
    G.sfx('explode');
    for (let i = 0; i < S.shards; i++) {
      const a = (i / S.shards) * TAU + U.rand(-0.2, 0.2);
      if (evo) {
        const t = G.randomNear(pr.x, pr.y, 340);
        G.proj({ x: pr.x, y: pr.y, angle: a, speed: 300, r: 5, dmg: 0, pierce: 0, life: 1.1, kind: 'rocket', small: true, col: '#ffe14a', w: pr.w,
          homing: 6, target: t, noHitDmg: true,
          onEnd: (q, G2) => { G2.aoe(q.x, q.y, 38 * S.area, S.dmg * 0.35, { w: q.w, knock: 120, ring: '#ffe14a', noCrit: false }); } });
      } else {
        G.proj({ x: pr.x, y: pr.y, angle: a, speed: 430, r: 4, dmg: S.dmg * S.shardDmg, pierce: 0, life: 0.38, kind: 'shard', col: '#ff7a1a', w: pr.w });
      }
    }
  }
  def({
    id: 'rage_rocket', name: 'RAGE ROCKET', role: 'Burst · area',
    desc: 'A homing rocket that explodes and scatters smaller energy shards.',
    base: { dmg: 30, cd: 2.6, amount: 1, speed: 380, area: 1, radius: 70, shards: 4, shardDmg: 0.4 },
    lv: [[{ shards: 2 }, '+2 shards'], [{ dmg: 10 }, '+10 damage'], [{ area: 0.2 }, '+20% blast radius'], [{ cd: -0.4 }, '-0.4s cooldown'],
      [{ amount: 1 }, '+1 rocket'], [{ dmg: 12 }, '+12 damage'], [{ shards: 3 }, '+3 shards']],
    evo: 'missile_swarm', evoWith: 'mixing_board',
    fire: (w, p, G, S) => rocket(w, p, G, S, false),
  });
  def({
    id: 'missile_swarm', name: 'MISSILE SWARM', evolved: true, from: 'rage_rocket', role: 'Evolution',
    desc: 'Three rockets, each bursting into twelve homing mini-missiles.',
    base: { dmg: 50, cd: 2.0, amount: 3, speed: 400, area: 1.4, radius: 70, shards: 12, shardDmg: 0.35 },
    fire: (w, p, G, S) => rocket(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- BURNED CD
  function burnedCd(w, p, G, S, evo) {
    const f = G.facingAim(p, 500, GUN_CONE);
    if (!f) return;
    const base = f.t ? G.aimAt(p.x, p.y, f.t, S.speed) : f.a; // thrown where you face
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.08, () => {
        const a = base + (i - (S.amount - 1) / 2) * (TAU / Math.max(3, S.amount * 1.6));
        G.proj({
          x: p.x, y: p.y, angle: a, speed: S.speed, r: 10 * S.area, dmg: S.dmg, pierce: 999, life: 6, kind: 'cd', col: evo ? '#ffe14a' : '#ff4f6e', w,
          knock: S.knock, hitCd: 0.3, boomerang: { range: S.range * p.s.range, loops: S.loops || 1 }, crit: 0.05,
          onHit: evo ? (pr, e, G2, res) => { if (res.killed && Math.random() < 0.2) G2.dropCoin(e.x, e.y, 1); } : null,
        });
        G.sfx('cd');
      });
    }
  }
  def({
    id: 'burned_cd', name: 'BURNED CD', role: 'Returning · pierce',
    desc: 'Throws a spinning burned CD that flies out and comes back through everything.',
    base: { dmg: 12, cd: 1.7, amount: 1, speed: 520, range: 260, area: 1, knock: 60 },
    lv: [[{ amount: 1 }, '+1 disc'], [{ dmg: 5 }, '+5 damage'], [{ speed: 120, range: 40 }, 'Faster, longer throw'], [{ area: 0.3 }, '+30% size'],
      [{ amount: 1 }, '+1 disc'], [{ dmg: 6 }, '+6 damage'], [{ cd: -0.3 }, '-0.3s cooldown']],
    evo: 'platinum_plaque', evoWith: 'bootleg_merch',
    fire: (w, p, G, S) => burnedCd(w, p, G, S, false),
  });
  def({
    id: 'platinum_plaque', name: 'PLATINUM PLAQUE', evolved: true, from: 'burned_cd', role: 'Evolution',
    desc: 'Four huge platinum records that loop twice. Kills can drop CL0UT.',
    base: { dmg: 28, cd: 1.3, amount: 4, speed: 600, range: 300, area: 1.6, knock: 90, loops: 2 },
    fire: (w, p, G, S) => burnedCd(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- AUX CORD
  function auxCord(w, p, G, S, evo) {
    for (let i = 0; i < S.amount; i++) {
      G.later(i * 0.1, () => {
        const hit = [];
        const first = i === 0 ? G.nearestSeen(p.x, p.y, 380) : G.randomNear(p.x, p.y, 380);
        if (!first) return;
        const chain = (start, from, n, pts) => {
          let cur = start;
          for (let c = 0; c <= n && cur; c++) {
            hit.push(cur.id); pts.push(cur.x, cur.y);
            G.damage(cur, S.dmg, { w, knock: 30, kx: cur.x - from.x, ky: cur.y - from.y });
            if (evo && Math.random() < S.fork) {
              const f = G.nearestSeen(cur.x, cur.y, S.jump, hit);
              if (f) { const fp = [cur.x, cur.y]; chain(f, cur, 2, fp); RS.FX.arc(fp, '#ffe14a', 0.14, 1.5, 'aux'); }
            }
            from = cur;
            cur = G.nearestSeen(cur.x, cur.y, S.jump, hit);
          }
        };
        const pts = [p.x, p.y - 6];
        chain(first, p, S.chains, pts);
        RS.FX.arc(pts, evo ? '#ffe14a' : '#9cff35', 0.15, 2, 'aux');
        // the painted jack plugs into the first enemy; every further hop gets a spark node
        const tint = evo ? RS.FXS.filterFor('#9cff35', '#ffe14a') : '';
        RS.FX.anim('aux_plug', pts[2], pts[3], Math.atan2(pts[3] - pts[1], pts[2] - pts[0]), 0.3, 0.2, tint);
        for (let i = 4; i < pts.length; i += 2) RS.FX.pop(pts[i], pts[i + 1], 22, [evo ? '#ffe14a' : '#9cff35', '#ffffff'], 'zap');
        G.sfx('zap');
      });
    }
  }
  def({
    id: 'aux_cord', name: 'AUX CORD', role: 'Chain lightning',
    desc: 'Plugs into the nearest enemy and arcs current through the crowd.',
    base: { dmg: 13, cd: 1.5, chains: 3, jump: 140, amount: 1, fork: 0 },
    lv: [[{ chains: 1 }, '+1 chain'], [{ dmg: 5 }, '+5 damage'], [{ cd: -0.2 }, '-0.2s cooldown'], [{ chains: 2 }, '+2 chains'],
      [{ jump: 40 }, '+40 jump range'], [{ dmg: 6 }, '+6 damage'], [{ amount: 1 }, '+1 cord']],
    evo: 'high_voltage', evoWith: 'sound_engineer',
    fire: (w, p, G, S) => auxCord(w, p, G, S, false),
  });
  def({
    id: 'high_voltage', name: 'HIGH VOLTAGE', evolved: true, from: 'aux_cord', role: 'Evolution',
    desc: 'Two cords, twelve chains each, and the current keeps forking.',
    base: { dmg: 21, cd: 0.8, chains: 12, jump: 200, amount: 2, fork: 0.25 }, // was 24 (8x its base in a crowd)
    fire: (w, p, G, S) => auxCord(w, p, G, S, true),
  });

  // ---------------------------------------------------------------- CASSETTE MINES
  function dropMine(w, p, G, S, evo, x, y) {
    if ((w.mines || 0) >= S.maxMines) return;
    w.mines = (w.mines || 0) + 1;
    G.zone({
      kind: 'mine', x, y, r: 22 * S.area, life: S.fuse, arm: S.arm, w, noDamage: true, col: evo ? '#ff7a1a' : '#ff2448',
      onUpdate: (z, G2) => {
        if (z.age > z.arm && G2.nearest(z.x, z.y, z.r)) z.life = 0;
      },
      onEnd: (z, G2) => {
        w.mines = Math.max(0, (w.mines || 1) - 1);
        G2.aoe(z.x, z.y, S.radius * S.area, S.dmg, { w, knock: 240, ring: z.col, fill: 0.3, boom: evo ? 'boom' : 'boom_toxic' });
        G2.sfx('explode');
        if (evo) G2.zone({ kind: 'fire', x: z.x, y: z.y, r: 60 * S.area, life: 2, tick: 0.3, dmg: S.dmg * 0.12, w, col: '#ff7a1a' });
      },
    });
    G.sfx('mine');
  }
  def({
    id: 'cassette_mines', name: 'CASSETTE MINES', role: 'Traps · delayed blast',
    desc: 'Drops rigged cassette tapes that explode when touched or when the fuse runs out.',
    base: { dmg: 35, cd: 2.0, amount: 1, area: 1, radius: 80, arm: 0.5, fuse: 4, maxMines: 6 },
    // 2026-10-26: +10 / +12 -> +8 / +9 damage, last radius step 25 -> 15% (build bench: -23% damage, -30% kills)
    lv: [[{ dmg: 8 }, '+8 damage'], [{ area: 0.2 }, '+20% blast radius'], [{ cd: -0.4 }, '-0.4s cooldown'], [{ amount: 1 }, '+1 mine per drop'],
      [{ dmg: 9 }, '+9 damage'], [{ area: 0.15 }, '+15% blast radius'], [{ amount: 1, maxMines: 4 }, '+1 mine, +4 max mines']],
    evo: 'fire_mixtape', evoWith: 'deadstock',
    fire: (w, p, G, S) => { for (let i = 0; i < S.amount; i++) dropMine(w, p, G, S, false, p.x + U.rand(-30, 30) * (i ? 1 : 0), p.y + U.rand(-30, 30) * (i ? 1 : 0)); },
  });
  def({
    id: 'fire_mixtape', name: 'FIRE MIXTAPE', evolved: true, from: 'cassette_mines', role: 'Evolution',
    desc: 'You leave a trail of fire tapes as you move. Blasts leave burning ground.',
    base: { dmg: 46, cd: 0.9, amount: 1, area: 1.4, radius: 80, arm: 0.3, fuse: 3, maxMines: 14 }, // was 60, then 50 (2026-10-27: top-4 evolution on the bench)
    fire: (w, p, G, S) => dropMine(w, p, G, S, true, p.x, p.y),
    update: (w, p, G, S, dt) => {
      w.trail = (w.trail || 0) + Math.hypot(p.vx, p.vy) * dt;
      if (w.trail > 90) { w.trail = 0; dropMine(w, p, G, S, true, p.x - p.aimX * 20, p.y - p.aimY * 20); }
    },
  });

  // ---------------------------------------------------------------- BAD VIBES (damage aura)
  // A ring of hostile energy around you: every tick it hurts, slows and nudges back whatever is inside.
  function auraUpdate(w, p, G, S, dt, evo) {
    const R = S.radius * S.area;
    w.R = R; w.pulse = Math.max(0, (w.pulse || 0) - dt * 2.6);
    w.tk = (w.tk || 0) - dt;
    if (w.tk > 0) return;
    w.tk = S.cd; w.pulse = 1;
    let kills = 0;
    for (const e of G.inRadius(p.x, p.y, R)) {
      if (e.dead) continue;
      const r = G.damage(e, S.dmg, { w, knock: S.knock, kx: e.x - p.x, ky: e.y - p.y, crit: S.crit, color: evo ? '#d6ffb0' : '#ffb3c0' });
      if (S.slow && !e.boss) { e.slowT = Math.max(e.slowT, S.cd + 0.15); e.slowAmt = Math.max(e.slowAmt, S.slow); }
      if (r.killed) kills++;
    }
    if (evo && kills) G.heal(1); // WORST VIBES: a kill inside the aura heals 1 HP per tick
  }
  function auraDraw(ctx, w, p, G, evo) {
    const R = w.R || 0;
    if (!R) return;
    const col = evo ? '#9cff35' : '#ff2448', t = G.time, k = w.pulse || 0;
    const x = RS.Render.hsx != null ? RS.Render.hsx : p.x, y = RS.Render.hsy != null ? RS.Render.hsy : p.y;
    ctx.fillStyle = U.rgba(col, 0.06 + k * 0.06);
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = U.rgba(col, 0.6 + k * 0.3); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba('#ffffff', 0.3); ctx.lineWidth = 1.5; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -t * 34;
    ctx.beginPath(); ctx.arc(x, y, R * 0.84, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (k > 0.02) { // tick pulse: a bright ring that rolls out to the edge
      ctx.strokeStyle = U.rgba(col, k * 0.8); ctx.lineWidth = 3 + k * 3;
      ctx.beginPath(); ctx.arc(x, y, R * (1 - k * 0.55), 0, TAU); ctx.stroke();
    }
    // motes drifting around inside: little diamonds, half turning each way
    ctx.fillStyle = U.rgba(evo ? '#e6ffc8' : '#ffd0d8', 0.85);
    const n = evo ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const a = t * (0.5 + U.hash(i * 7 + 3) * 0.9) * (i % 2 ? 1 : -1) + i * 2.4, rr = R * (0.3 + 0.62 * U.hash(i * 13 + 1));
      const mx = x + Math.cos(a) * rr, my = y + Math.sin(a) * rr, sz = 2.2 + 1.6 * U.hash(i * 5 + 9);
      ctx.beginPath(); ctx.moveTo(mx, my - sz * 1.6); ctx.lineTo(mx + sz, my); ctx.lineTo(mx, my + sz * 1.6); ctx.lineTo(mx - sz, my); ctx.closePath(); ctx.fill();
    }
    if (RS.Post.active) RS.Post.ring(x, y, R, 10, col, 0.3 + k * 0.4);
  }
  def({
    id: 'bad_vibes', name: 'BAD VIBES', role: 'Melee · aura', persistent: true,
    desc: 'A ring of pure hostility around you. Anything inside keeps taking damage and slows down.',
    base: { dmg: 7, cd: 0.6, area: 1, radius: 72, knock: 22, slow: 0.15, crit: 0 }, // was 5
    lv: [[{ area: 0.15 }, '+15% radius'], [{ dmg: 3 }, '+3 damage'], [{ cd: -0.08 }, 'ticks 0.08s faster'], [{ slow: 0.1 }, '+10% slow'],
      [{ area: 0.15, dmg: 2 }, '+15% radius, +2 damage'], [{ dmg: 4 }, '+4 damage'], [{ area: 0.2, cd: -0.07 }, '+20% radius, faster ticks']],
    evo: 'worst_vibes', evoWith: 'designer_puffer',
    update: (w, p, G, S, dt) => auraUpdate(w, p, G, S, dt, false),
    under: (ctx, w, p, G) => auraDraw(ctx, w, p, G, false),
  });
  def({
    id: 'worst_vibes', name: 'WORST VIBES', evolved: true, from: 'bad_vibes', role: 'Evolution', persistent: true,
    desc: 'A huge toxic aura. Heavy slow, harder hits, and kills inside it heal you.',
    base: { dmg: 24, cd: 0.4, area: 1.6, radius: 90, knock: 40, slow: 0.4, crit: 0.05 }, // was 16 / 80: only 1.9x its base
    update: (w, p, G, S, dt) => auraUpdate(w, p, G, S, dt, true),
    under: (ctx, w, p, G) => auraDraw(ctx, w, p, G, true),
  });

  // ---------------------------------------------------------------- SWITCHBLADE (quick melee stabs)
  // Fast, short thrusts at the closest enemy. Extra amount = extra stabs fanning out around the first.
  function blade(w, p, G, S, evo) {
    const R = S.range * S.area;
    const f = G.facingAim(p, R * 1.6, MELEE_CONE);
    if (!f) return;
    const dir = f.a; // stabs where you face
    const stab = (a, i) => {
      const half = S.arc / 2;
      for (const e of G.inRadius(p.x, p.y, R)) {
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (Math.abs(U.angDiff(a, Math.atan2(e.y - p.y, e.x - p.x))) > half + Math.atan2(e.r, d)) continue;
        G.damage(e, S.dmg, { w, crit: S.crit, knock: S.knock, kx: Math.cos(a), ky: Math.sin(a) });
        if (evo) { e.vulnT = Math.max(e.vulnT, 2); e.vulnAmt = Math.max(e.vulnAmt, 0.2); } // butterfly cuts leave enemies exposed
      }
      G.zone({ kind: 'stab', x: p.x, y: p.y, r: R, life: 0.24, ang: a, arc: S.arc, follow: true, col: evo ? '#ff2448' : '#e6ebf3', w, noDamage: true, flip: i % 2 });
      G.sfx('whip');
    };
    stab(dir, 0);
    for (let i = 1; i < S.amount; i++) {
      const off = Math.ceil(i / 2) * 0.55 * (i % 2 ? 1 : -1); // fan: +0.55, -0.55, +1.1 ...
      G.later(i * 0.07, () => stab(dir + off, i));
    }
    if (evo) G.later(0.18, () => stab(dir + Math.PI, 1)); // the flip: one backhand cut behind you
  }
  def({
    id: 'switchblade', name: 'SWITCHBLADE', role: 'Melee · fast stabs',
    desc: 'Quick knife thrusts at whoever gets closest. Short reach, very fast.',
    base: { dmg: 12, cd: 0.5, area: 1, range: 92, arc: 0.85, knock: 60, amount: 1, crit: 0.1 },
    lv: [[{ dmg: 4 }, '+4 damage'], [{ amount: 1 }, '+1 stab'], [{ area: 0.15 }, '+15% reach'], [{ crit: 0.1 }, '+10% crit'],
      [{ dmg: 5 }, '+5 damage'], [{ amount: 1 }, '+1 stab'], [{ cd: -0.08, dmg: 4 }, 'faster, +4 damage']],
    evo: 'butterfly_flip', evoWith: 'sped_up', // a faster knife (was CHROME CHAIN, which RAGE BURST also wants)
    fire: (w, p, G, S) => blade(w, p, G, S, false),
  });
  def({
    id: 'butterfly_flip', name: 'BUTTERFLY FLIP', evolved: true, from: 'switchblade', role: 'Evolution',
    desc: 'A spinning butterfly knife. Stab fans plus a backhand cut; every cut leaves enemies taking +20% damage.',
    base: { dmg: 40, cd: 0.38, area: 1.35, range: 96, arc: 1.0, knock: 90, amount: 3, crit: 0.25 }, // was 34
    fire: (w, p, G, S) => blade(w, p, G, S, true),
  });

  RS.Data = RS.Data || {};
  RS.Data.WEAPONS = WEAPONS;
  RS.Data.EVOLUTIONS = Object.values(WEAPONS).filter((d) => d.evo).map((d) => ({ weapon: d.id, item: d.evoWith, result: d.evo }));
})(window.RS);
