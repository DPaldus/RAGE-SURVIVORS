'use strict';
// STASH: loot items (the 2026-10 drop). They never show up on level-up cards: they drop from chests, altars, elites,
// breakable props and THE PLUG, and every extra copy stacks (n = copies held). Rarity uses D.RARITY (COMMON 0,
// UNCOMMON 1, RARE 2, LEGENDARY 4; there is no EPIC stash item). Chances stack hyperbolically (1 - (1 - c)^n), so a
// pile of copies never reaches a sure thing; flat stats stack linearly and still meet the caps in Player.recalc
// (speed +45%, cooldown floor, evasion 60%). Proc damage built from a hit ("40% of the hit") is passed flat, so might,
// crits and thumbs are never counted twice. Shared runtime (DoTs, spikes, ghosts, lightning, altars, budgets) is
// RS.Stash in game/stash.js.
// Hooks: apply(s, n, p, st) every recalc · hit(p, G, e, d, n, st) weapon hits only (d = the damage dealt) ·
// crit / kill / hurt(p, G, n, d, sx, sy) / tick(p, G, n, dt, st) / dash / dodge / chest / interact ·
// mul(p, G, e, n, st) damage multiplier against e.
(function (RS) {
  const D = RS.Data;
  const STASH = {};
  const def = (o) => { o.type = 'stash'; STASH[o.id] = o; };
  const X = () => RS.Stash;
  const hyp = (c, n) => 1 - Math.pow(1 - c, n);

  // ================================================================ COMMON
  def({ id: 'rotten_lean', name: 'ROTTEN LEAN', rarity: 0, col: '#9b4dff',
    desc: 'Weapon hits have a 40% chance to poison: 30% of the hit again as damage over 3s.',
    per: 'more chance (toward 100%), +30% of the hit as poison',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.4, n))) X().poison(G, e, d * 0.3 * n * p.s.poisonMul, 3); } });
  def({ id: 'twizzy_meal', name: 'TWIZZY MEAL', rarity: 0, col: '#ffd23f',
    desc: 'Kills have a 2% chance to leave a TWIZZY BURGER that heals 8% max HP.',
    per: '+2% chance (max 10%)',
    kill(p, G, e, n) { if (Math.random() < Math.min(0.1, 0.02 * n)) X().burger(G, e.x, e.y); } });
  def({ id: 'plug_tool', name: 'PLUG TOOL', rarity: 0, col: '#9cff35',
    desc: 'Altars charge 30% faster and their loot rolls rarer.',
    per: '+30% charge speed, rarer altar loot',
    apply(s, n) { s.altarSpeed += 0.3 * n; s.altarLuck += 0.35 * n; } });
  def({ id: 'slatt_luck', name: 'SLATT LUCK', rarity: 0, col: '#9cff35',
    desc: '+7.5% luck: rarer upgrades, rarer loot, more procs from luck.', per: '+7.5% luck',
    apply(s, n) { s.luck += 0.075 * n; } });
  def({ id: 'time2die', name: 'TIME2DIE', rarity: 0, col: '#cfd6e3',
    desc: '+8% XP from everything.', per: '+8% XP',
    apply(s, n) { s.growth += 0.08 * n; } });
  def({ id: 'gym_rat', name: 'GYM RAT', rarity: 0, col: '#ff2448',
    desc: '+10% damage.', per: '+10% damage',
    apply(s, n) { s.might *= 1 + 0.1 * n; } });
  def({ id: 'big_body', name: 'BIG BODY', rarity: 0, col: '#ff2448',
    desc: '+25 max HP (and heals it when picked up).', per: '+25 max HP',
    apply(s, n) { s.maxHp += 25 * n; },
    pick(p, G) { G.heal(25); } });
  def({ id: 'percs_kit', name: 'PERCS KIT', rarity: 0, col: '#e3ece6',
    desc: '+0.3 HP regen per second.', per: '+0.3 HP/s',
    apply(s, n) { s.regen += 0.3 * n; } });
  def({ id: 'fast_lane', name: 'FAST LANE', rarity: 0, col: '#9cff35',
    desc: '+15% move speed (speed still stops at +45% in total).', per: '+15% move speed',
    apply(s, n) { s.moveSpeed += 0.15 * n; } });
  def({ id: 'opps_in_sight', name: 'OPPS IN SIGHT', rarity: 0, col: '#ff2448',
    desc: '+20% damage to enemies above 90% health.', per: '+20%',
    mul(p, G, e, n) { return e.hp >= e.maxHp * 0.9 ? 1 + 0.2 * n : 1; } });
  def({ id: 'fully_charged', name: 'FULLY CHARGED', rarity: 0, col: '#ffe14a',
    desc: '+8% attack speed.', per: '+8% attack speed',
    apply(s, n) { s.cooldown /= 1 + 0.08 * n; } });
  def({ id: 'bad_karma', name: 'BAD KARMA', rarity: 0, col: '#b052ff',
    desc: 'Every 2s the 3 nearest enemies are cursed: they lose 2% of their max HP per second for 4s (bosses far less).',
    per: '+1 target, +1% max HP per second',
    tick(p, G, n, dt, st) {
      st.t = (st.t || 0) - dt;
      if (st.t > 0) return;
      st.t = 2;
      const k = 0.02 + 0.01 * (n - 1), list = G.inRadius(p.x, p.y, 320).filter((e) => !e.dead);
      list.sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
      for (let i = 0; i < Math.min(list.length, 2 + n); i++) X().curse(G, list[i], k, 4);
    } });
  def({ id: 'pack_opps', name: 'PACK OPPS', rarity: 0, col: '#ffd75a',
    desc: '+15% damage to bosses and elites.', per: '+15%',
    mul(p, G, e, n) { return e.boss || e.elite || e.def.isElite ? 1 + 0.15 * n : 1; } });
  def({ id: 'master_key', name: 'MASTER KEY', rarity: 0, col: '#cfd6e3',
    desc: 'Chests have a 10% chance to hold one extra reward.', per: '+10% chance',
    apply(s, n) { s.keyChance += 0.1 * n; } });
  def({ id: 'ice_talk', name: 'ICE TALK', rarity: 0, col: '#9fe9ff',
    desc: 'Weapon hits have a 7.5% chance to freeze an enemy for 1.2s (bosses are slowed instead).',
    per: 'more chance (7.5% → 14% → 20%…)',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.075, n))) X().freeze(G, e, 1.2); } });
  def({ id: 'demon_tax', name: 'DEMON TAX', rarity: 0, col: '#ff2448',
    desc: '+7% difficulty: tougher enemies in bigger crowds. Pays back +7% XP and +7% CL0UT at the end of the run.',
    per: '+7% difficulty, +7% XP and CL0UT',
    apply(s, n) { s.difficulty += 0.07 * n; } });
  def({ id: 'ghost_town', name: 'GHOST TOWN', rarity: 0, col: '#e3ece6',
    desc: 'Opening a chest, charging an altar, dealing with THE PLUG or grabbing a consumable lets 3 ghosts loose for 5s.',
    per: '+2 ghosts',
    interact(p, G, n) { X().ghosts(G, p.x, p.y, 1 + 2 * n, 6, 5 * p.s.ghostLife); } });
  def({ id: 'spiky_drip', name: 'SPIKY DRIP', rarity: 0, col: '#cfd6e3',
    desc: 'Taking a hit fires 8 spikes around you.', per: '+4 spikes',
    hurt(p, G, n) { X().spikes(G, p, 4 + 4 * n + p.s.spikeExtra); } });

  // ================================================================ UNCOMMON
  def({ id: 'red_flag', name: 'RED FLAG', rarity: 1, col: '#ff2448',
    desc: '+2.5% damage for every chest you open from now on (up to +50%).', per: '+2.5% per chest, cap +50%',
    chest(p, G, n, st) { st.c = (st.c || 0) + p.s.flagMul; },
    apply(s, n, p, st) { s.might *= 1 + Math.min(0.5 * n, 0.025 * n * (st.c || 0)); } });
  def({ id: 'gold_plate', name: 'GOLD PLATE', rarity: 1, col: '#ffd23f',
    desc: 'Taking damage pays you: +1 run CL0UT for every 4 damage taken (at least 2).', per: 'x2, x3… the pay',
    hurt(p, G, n, d) { const v = Math.max(2, Math.round(d / 4)) * n; G.addRunClout(v); RS.FX.text(p.x + 26, p.y - 46, '+$' + v, '#ffd23f', 12, { always: true, life: 0.9 }); } });
  def({ id: 'thunder_hands', name: 'THUNDER HANDS', rarity: 1, col: '#3ff2ff',
    desc: 'Weapon hits have a 6% chance to call down lightning: 120% of the hit to the target and a small blast around it.',
    per: 'more chance',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.06, n)) && X().ok('strike', 4)) X().strike(G, e, d * 1.2, { r: 40, flat: true, splash: 0.35 }); } });
  def({ id: 'floatin', name: "FLOATIN'", rarity: 1, col: '#e3ece6',
    desc: 'Your dash becomes a jump: 25% further, 0.1s more untouchable, and you hang in the air a moment after it.',
    per: '+25% dash distance, longer airtime',
    apply(s, n) { s.dashDist += 0.25 * n; s.dashIframe += 0.1 * n; s.hang += 0.25 * n; s.hop = 1; } });
  def({ id: 'plugged_in', name: 'PLUGGED IN', rarity: 1, col: '#3ff2ff',
    desc: 'Weapon hits have a 10% chance to arc to 2 nearby enemies for 60% of the hit.', per: 'more chance, +1 arc',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.1, n)) && X().ok('arc', 12)) X().arcs(G, e, d * 0.6, 1 + n + p.s.arcExtra); } });
  def({ id: 'run_thru', name: 'RUN THRU', rarity: 1, col: '#9cff35',
    desc: '+5% move speed. Getting hit gives +25% move speed for 2s.', per: '+5% speed, +10% burst',
    apply(s, n) { s.moveSpeed += 0.05 * n; },
    hurt(p, G, n) { const k = 0.25 + 0.1 * (n - 1); p.addBuff({ id: 'run_thru', name: 'RUN THRU', icon: 'run_thru', col: '#9cff35', t: 2, apply: (s) => { s.moveSpeed *= 1 + k; } }); } });
  def({ id: 'bad_blood', name: 'BAD BLOOD', rarity: 1, col: '#ff2448',
    desc: 'Weapon hits have a 15% chance to BLOODMARK: the enemy bleeds 60% of the hit over 3s, and if it dies marked you heal 2 HP.',
    per: 'more chance',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.15, n))) X().bleed(G, e, d * 0.6 * p.s.bleedMul, 3, true); } });
  def({ id: 'lean_gut', name: 'LEAN GUT', rarity: 1, col: '#9b4dff',
    desc: '+20% damage, but -5% max HP.', per: '+20% damage, -5% max HP',
    apply(s, n) { s.might *= 1 + 0.2 * n; s.maxHp *= Math.pow(0.95, n); } });
  def({ id: 'rage_altar', name: 'RAGE ALTAR', rarity: 1, col: '#ff2448',
    desc: 'A charged altar turns into a healing zone for 8s (5% max HP per second inside). From 10:00 two more altars stand on the map.',
    per: '+4s zone, +2% heal per second',
    apply(s, n) { s.altarHeal += n; s.altarExtra = 2; } });
  def({ id: 'opem_cloak', name: 'OPËM CLOAK', rarity: 1, col: '#cfd6e3',
    desc: 'After a dash or a dodge your next weapon shot deals double damage, and you get +20% attack speed and +15% move speed for 2s.',
    per: '+50% on the cloaked shot, +1s',
    dash(p, G, n) { X().cloak(p, n); }, dodge(p, G, n) { X().cloak(p, n); } });
  def({ id: 'after_hours', name: 'AFTER HOURS', rarity: 1, col: '#9b4dff',
    desc: 'Standing still heals 1.5% max HP per second.', per: '+1% per second',
    tick(p, G, n, dt) { if (p.stillT > 0.4 && p.hp < X().cap(p)) X().heal(G, p.s.maxHp * (0.015 + 0.01 * (n - 1)) * dt, true); } });
  def({ id: 'knuckle_up', name: 'KNUCKLE UP', rarity: 1, col: '#ff7a1a',
    desc: '+20% damage to enemies within 150px of you.', per: '+20%',
    mul(p, G, e, n) { return (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 22500 ? 1 + 0.2 * n : 1; } });
  def({ id: 'demon_luv', name: 'DEMON LUV', rarity: 1, col: '#ff4f6e',
    desc: 'Critical hits have a 25% chance to heal 1 HP (up to 4 HP per second).', per: 'more chance, +2 HP/s cap',
    apply(s, n) { s.luvCap += 4 + 2 * (n - 1); },
    crit(p, G, e, d, n) { if (p.luvBud >= 1 && X().roll(p, hyp(0.25, n))) { p.luvBud--; X().heal(G, 1, true); } } });
  def({ id: 'blood_money', name: 'BLOOD MONEY', rarity: 1, col: '#ff2448',
    desc: 'Every 25 kills: +1 max HP for the rest of the run (up to +60).', per: 'twice as fast, cap +60 more',
    kill(p, G, e, n, st) { st.k = (st.k || 0) + n; while (st.k >= 25) { st.k -= 25; st.hp = Math.min(60 * n, (st.hp || 0) + 1); } },
    apply(s, n, p, st) { s.maxHp += st.hp || 0; } });
  def({ id: 'echo_trip', name: 'ECHO TRIP', rarity: 1, col: '#9cff35',
    desc: 'Kills have a 12% chance to drop an extra XP crystal.', per: '+12% (max 60%)',
    kill(p, G, e, n) { if (Math.random() < Math.min(0.6, 0.12 * n)) G.dropXp(e.x + RS.U.rand(-14, 14), e.y + RS.U.rand(-14, 14), X().killXp(G, e)); } });
  def({ id: 'toxic_gloves', name: 'TOXIC GLOVES', rarity: 1, col: '#9cff35',
    desc: 'Weapon hits have a 4% chance to leave a toxic cloud for 2.5s that poisons everything inside.', per: 'more chance, +1 cloud at once',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.04, n))) X().cloud(G, e.x, e.y, n); } });
  def({ id: 'rich_walk', name: 'RICH WALK', rarity: 1, col: '#ffd23f',
    desc: 'Walking pays: +1 run CL0UT for every 1000px you move.', per: '+1 CL0UT per 1000px',
    tick(p, G, n, dt, st) {
      st.d = (st.d || 0) + p.movedNow * n * p.s.walkPay;
      while (st.d >= 1000) { st.d -= 1000; G.addRunClout(1); if (G.time - (st.fx || -9) > 2) { st.fx = G.time; RS.FX.text(p.x, p.y - 44, '+$1', '#ffd23f', 11, { life: 0.8 }); } }
    } });
  def({ id: 'stand_still', name: 'STAND STILL', rarity: 1, col: '#e3ece6',
    desc: 'Every second you stand still adds +25% damage, up to +100%. Moving drains it fast.', per: 'builds up faster',
    tick(p, G, n, dt, st) { st.k = p.stillT > 0.15 ? Math.min(1, (st.k || 0) + 0.25 * n * dt) : Math.max(0, (st.k || 0) - 2 * dt); },
    apply(s, n, p, st) { s.might *= 1 + (st.k || 0); },
    hud(st) { return st.k > 0.02 ? '+' + Math.round(st.k * 100) + '%' : ''; } });
  def({ id: 'drained', name: 'DRAINED', rarity: 1, col: '#5a6070',
    desc: '+50 max HP, but your regen is halved.', per: '+50 max HP, regen halved again',
    apply(s, n) { s.maxHp += 50 * n; s.regen *= Math.pow(0.5, n); },
    pick(p, G) { G.heal(50); } });
  def({ id: 'kevin', name: 'KËVIN', rarity: 1, col: '#ffe14a',
    desc: 'KËVIN sometimes smacks you (5% max HP, never lethal). Every smack counts as a hit for your items and hypes you up: +30% damage for 4s.',
    per: '+30% hype',
    tick(p, G, n, dt, st) {
      if (st.t === undefined) st.t = RS.U.rand(6, 12);
      st.t -= dt;
      if (st.t > 0 || !p.weapons.length) return;
      st.t = RS.U.rand(8, 14);
      X().kevin(G, p, n);
    } });

  // ================================================================ RARE
  def({ id: 'big_tonka', name: 'BIG TONKA', rarity: 2, col: '#ffd23f',
    desc: '+20% damage for every 100 max HP you have (up to +150%).', per: '+20% per 100 max HP',
    apply(s, n) { s.tonka += 0.2 * n; } });
  def({ id: 'green_flag', name: 'GREEN FLAG', rarity: 2, col: '#9cff35',
    desc: '+2% luck for every chest you open from now on (up to +40%), but THE PLUG charges 15% more.', per: '+2% luck per chest, +15% plug prices',
    chest(p, G, n, st) { st.c = (st.c || 0) + p.s.flagMul; },
    apply(s, n, p, st) { s.luck += Math.min(0.4 * n, 0.02 * n * (st.c || 0)); s.plugCost *= 1 + 0.15 * n; } });
  def({ id: 'spike_vest', name: 'SPIKE VEST', rarity: 2, col: '#cfd6e3',
    desc: '+1 armor. Your spikes deal +30% damage for every point of armor you have.', per: '+1 armor, +30% per armor',
    apply(s, n) { s.armor += n; s.spikeArmor += 0.3 * n; } });
  def({ id: 'airwalk', name: 'AIRWALK', rarity: 2, col: '#3ff2ff',
    desc: '+50% damage while you are in the air: during a dash and a moment after.', per: '+50%',
    mul(p, G, e, n) { return X().airborne(p) ? 1 + 0.5 * n + p.s.airBonus : 1; } });
  def({ id: 'slurp_season', name: 'SLURP SEASON', rarity: 2, col: '#9b4dff',
    desc: 'Every 10s a syrup splash hits everything within 170px and heals you 7.5% max HP.', per: 'more damage, +2.5% heal, 1s sooner',
    tick(p, G, n, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t < Math.max(6, 11 - n)) return;
      st.t = 0;
      const R = 170 * p.s.area;
      G.aoe(p.x, p.y, R, 14 * X().pw(p) * (1 + 0.5 * (n - 1)), { noCrit: true, knock: 220, src: 'slurp', color: '#c79bff', ring: '#9b4dff', fill: 0.25 });
      X().heal(G, p.s.maxHp * Math.min(0.15, 0.075 + 0.025 * (n - 1)));
      RS.FX.burst(p.x, p.y, ['#9b4dff', '#c79bff', '#ffffff'], 14, 260, { size: 4, life: 0.45 });
      G.sfx('deadair');
    } });
  def({ id: 'turbo_twizzy', name: 'TURBO TWÏZZY', rarity: 2, col: '#ff2448',
    desc: 'The faster you move, the faster you attack: up to +40% attack speed at full sprint.', per: '+40% at full sprint',
    apply(s, n, p) { s.cooldown /= 1 + 0.4 * n * (p.sprintK || 0); } });
  def({ id: 'freak_pack', name: 'FREAK PACK', rarity: 2, col: '#ff7a1a',
    desc: 'Kills have a 20% chance to fire 2 homing rockets.', per: 'more chance, harder rockets',
    kill(p, G, e, n) { if (X().roll(p, hyp(0.2, n)) && X().ok('rocket', 2.5)) X().rockets(G, e.x, e.y, 2, 6 * X().pw(p) * (1 + 0.4 * (n - 1))); } });
  def({ id: 'shattered', name: 'SHATTERED', rarity: 2, col: '#c8ff7d',
    desc: 'XP crystals flying to you cut through every enemy on the way.', per: 'harder cuts',
    apply(s, n) { s.shatter += n; } });
  def({ id: 'quins_vision', name: "QUIN'S VISION", rarity: 2, col: '#ff7a1a',
    desc: 'Spikes have a 50% chance to explode. Every 5s you fire 8 spikes on your own.', per: 'more explosions, +4 spikes',
    apply(s, n) { s.spikeBoom = Math.max(s.spikeBoom, hyp(0.5, n)); },
    tick(p, G, n, dt, st) { st.t = (st.t || 0) + dt; if (st.t >= 5) { st.t = 0; X().spikes(G, p, 4 + 4 * n + p.s.spikeExtra); } } });
  def({ id: 'toxic_drip', name: 'TOXIC DRIP', rarity: 2, col: '#9cff35',
    desc: 'Taking a hit poisons every enemy within 220px (heavy poison over 4s).', per: 'stronger poison',
    hurt(p, G, n) {
      const dmg = 20 * X().pw(p) * n * p.s.poisonMul;
      for (const e of G.inRadius(p.x, p.y, 220)) X().poison(G, e, dmg * p.s.might, 4);
      RS.FX.ring(p.x, p.y, 220, '#9cff35', 0.4, 3, 0.12);
    } });
  def({ id: 'gassed', name: 'GASSED', rarity: 2, col: '#9cff35',
    desc: 'Enemies that hit you get poisoned. For every 6 poisoned enemies: +1 armor and room to overheal 4% past max HP (up to +4 armor, +40%).',
    per: 'higher caps',
    apply(s, n) { const k = Math.floor((RS.Game.poisonN || 0) / 6); s.armor += Math.min(4 * n, k); s.overheal += Math.min(0.4 * n, 0.04 * k); },
    hurt(p, G, n, d, sx, sy) { for (const e of G.inRadius(sx, sy, 70)) X().poison(G, e, 12 * X().pw(p) * n * p.s.might, 4); } });
  def({ id: 'locked_in', name: 'LOCKED IN', rarity: 2, col: '#ff2448',
    desc: 'The lower your health, the harder you hit: up to +60% damage.', per: '+60% at the edge',
    apply(s, n, p) { s.might *= 1 + 0.6 * n * (1 - RS.U.clamp(p.hp / Math.max(1, s.maxHp), 0, 1)); } });
  def({ id: 'sky_walker', name: 'SKY WALKER', rarity: 2, col: '#3ff2ff',
    desc: 'Weapon hits have a 6% chance to launch an enemy (not elites or bosses) into the air for 0.8s. +66% damage to enemies in the air.', per: '+66%, more launches',
    hit(p, G, e, d, n) { if (!e.boss && !e.dead && X().roll(p, hyp(0.06, n))) X().launch(G, e); },
    mul(p, G, e, n) { return e.skyT > 0 ? 1 + 0.66 * n : 1; } });
  def({ id: 'demon_time', name: 'DEMON TIME', rarity: 2, col: '#ff2448',
    desc: 'Every kill adds +0.05% damage for the rest of the run, up to +100%.', per: 'builds up faster',
    kill(p, G, e, n, st) { st.k = Math.min(1 + p.s.demonCap, (st.k || 0) + 0.0005 * n); },
    apply(s, n, p, st) { s.might *= 1 + (st.k || 0); },
    hud(st) { return st.k > 0 ? '+' + Math.round(st.k * 100) + '%' : ''; } });
  def({ id: 'dead_homie', name: 'DEAD HOMIE', rarity: 2, col: '#e3ece6',
    desc: 'Every 1400px you move, BOB shows up and fights by your side for 6s.', per: '+1 BOB',
    tick(p, G, n, dt, st) {
      st.d = (st.d || 0) + p.movedNow;
      if (st.d < 1400) return;
      st.d = 0;
      X().ghosts(G, p.x, p.y, n, 28, 6 * p.s.ghostLife, 'bob');
      RS.FX.text(p.x, p.y - 52, 'BOB PULLED UP', '#e3ece6', 12, { always: true, life: 1.1 });
    } });
  def({ id: 'cursed_up', name: 'CURSED UP', rarity: 2, col: '#b052ff',
    desc: '+10% difficulty and -20% max HP, but weapon hits have a 10% chance to curse: 3% of max HP per second for 4s.',
    per: 'more curses, more difficulty',
    apply(s, n) { s.difficulty += 0.1 * n; s.maxHp *= Math.pow(0.8, n); },
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.1, n))) X().curse(G, e, 0.03, 4); } });

  // ================================================================ LEGENDARY
  def({ id: 'too_op', name: 'TOO OP', rarity: 4, col: '#ffe14a',
    desc: 'Every on-hit item rolls one more time: poison, freeze, lightning, explosions, all of it.', per: '+1 roll',
    apply(s, n) { s.procRolls += n; } });
  def({ id: 'za_warudo', name: 'ZA WARUDO', rarity: 4, col: '#ffd23f',
    desc: 'When you would die, time stops for 10s and you get back up at 30% HP. Used up after.', per: '+1 use',
    apply() {} }); // the save itself: RS.Stash.lastStand (combat.playerDown)
  def({ id: 'big_bonk', name: 'BIG BONK', rarity: 4, col: '#ffd23f',
    desc: 'Weapon hits have a 2% chance to BONK for 20x damage.', per: 'more chance',
    hit(p, G, e, d, n) {
      if (e.dead || !X().roll(p, hyp(0.02, n))) return;
      G.damage(e, d * 19, { flat: true, noCrit: true, src: 'bonk', color: '#ffd23f', knock: 500 });
      RS.FX.text(e.x, e.y - e.r - 26, 'BONK!', '#ffd23f', 22, { always: true, life: 0.9 });
      RS.FX.ring(e.x, e.y, 46, '#ffd23f', 0.25, 4);
      G.sfx('slam');
    } });
  def({ id: 'hot_shot', name: 'HOT SHOT', rarity: 4, col: '#ff7a1a',
    desc: 'Weapon hits have a 25% chance to explode: 50% of the hit to everything within 60px.', per: 'more explosions',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.25, n)) && X().ok('hot', 8)) X().boom(G, e.x, e.y, 60, d * 0.5, false); } });
  def({ id: 'ice_talk_2', name: 'ICE TALK 2', rarity: 4, col: '#9fe9ff',
    desc: 'Hits deal +15% ice damage and chill (-30% speed). Hitting a chilled enemy can freeze it, and frozen enemies take +30% damage.',
    per: '+15% ice damage, more freezes',
    mul(p, G, e, n) { return 1 + 0.15 * n + (e.freezeT > 0 ? 0.3 + p.s.frozenVuln : 0); },
    hit(p, G, e, d, n) {
      if (e.dead) return;
      if (e.chillT > 0 && X().roll(p, hyp(0.1, n))) X().freeze(G, e, 2);
      e.chillT = 2; e.slowT = Math.max(e.slowT, 2); e.slowAmt = Math.max(e.slowAmt, 0.3); e.iceT = Math.max(e.iceT, 0.25);
    } });
  def({ id: 'big_fork', name: 'BIG FORK', rarity: 4, col: '#b052ff',
    desc: '+15% crit chance. Crits have a 20% chance to turn into MEGACRITS (crit damage applies twice); crit chance past 100% becomes megacrit chance.',
    per: '+15% crit, more megacrits',
    apply(s, n) { s.critChance += 0.15 * n; s.megaChance += hyp(0.2, n); } });
  def({ id: 'power_trip', name: 'POWER TRIP', rarity: 4, col: '#ff6ad5',
    desc: 'Weapon hits have an 8% chance to set off a big blast: 80% of the hit within 130px, enemies thrown back.', per: 'more blasts',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.08, n)) && X().ok('power', 1.5)) X().boom(G, e.x, e.y, 130, d * 0.8, true); } });
  def({ id: 'thunder_plug', name: 'THUNDER PLUG', rarity: 4, col: '#3ff2ff',
    desc: 'Every 2.5s lightning strikes 3 enemies on screen and stuns them for 1s.', per: '+2 strikes, a bit faster',
    tick(p, G, n, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t < Math.max(1.4, 2.5 - 0.3 * (n - 1))) return;
      st.t = 0;
      const pool = G.enemies.list.filter((e) => !e.dead && e.spawning <= 0 && G.seen(e));
      for (let i = 0; i < 1 + 2 * n && pool.length; i++) {
        const e = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        X().strike(G, e, 30 * X().pw(p), { r: 40, stun: 1 });
      }
    } });
  def({ id: 'chonk_drip', name: 'CHONK DRIP', rarity: 4, col: '#ffd23f',
    desc: '+20% lifesteal (each weapon hit can heal 1 HP) and every heal can take you up to 175% max HP.', per: '+20% lifesteal, +25% more room',
    apply(s, n) { s.lifesteal += 0.2 * n; s.overheal += 0.75 + 0.25 * (n - 1); } });
  def({ id: 'dragon_mode', name: 'DRAGON MODE', rarity: 4, col: '#ff7a1a',
    desc: 'Weapon hits have a 15% chance to breathe dragon fire: the hit again around the target, and everything there burns for 3s.',
    per: 'more fire',
    hit(p, G, e, d, n) { if (X().roll(p, hyp(0.15, n)) && X().ok('dragon', 3.5)) X().dragon(G, p, e, d); } });
  def({ id: 'holy_rage', name: 'HOLY RAGE', rarity: 4, col: '#fff1a0',
    desc: '+100 max HP and +1.5 HP regen per second. Every heal sears the enemies near you.', per: '+100 max HP, +1.5 HP/s, hotter sear',
    apply(s, n) { s.maxHp += 100 * n; s.regen += 1.5 * n; s.holy += n; },
    pick(p, G) { G.heal(100); } });
  def({ id: 'geeked_mode', name: 'GEEKED MODE', rarity: 4, col: '#ff2448',
    desc: 'Dropping under 30% HP slows everything down for 4s and doubles your damage for 8s. Recharges in 45s.', per: 'recharges 8s faster',
    tick(p, G, n, dt, st) {
      st.cd = (st.cd || 0) - dt;
      if (st.cd > 0 || p.hp > p.s.maxHp * 0.3 || p.dead) return;
      st.cd = Math.max(21, 45 - 8 * (n - 1));
      X().geeked(G, p);
    } });
  def({ id: 'energy_drank', name: 'ENERGY DRANK', rarity: 4, col: '#c8ff7d',
    desc: 'Fires 2 energy balls at the nearest enemies every 1.1s. Each bounces to one more.', per: '+1 ball per volley',
    tick(p, G, n, dt, st) { st.t = (st.t || 0) + dt; if (st.t >= 1.1 * p.s.cooldown) { st.t = 0; X().energy(G, p, n + 1); } } });
  def({ id: 'heavy_metal', name: 'HEAVY METAL', rarity: 4, col: '#cfd6e3',
    desc: 'Every weapon level-up also adds a random bonus: +10% damage, +8% area or -6% cooldown.', per: '+1 bonus per level-up',
    apply() {} }); // RS.Stash.onWeaponLevel (combat.levelWeapon)
  def({ id: 'soul_snatcher', name: 'SOUL SNATCHER', rarity: 4, col: '#b39ddb',
    desc: 'Every kill sets 2 homing souls loose on the crowd.', per: 'harder souls',
    kill(p, G, e, n) { if (X().ok('soul', 6)) X().ghosts(G, e.x, e.y, 2, 8 * (1 + 0.5 * (n - 1)), 2.5, 'soul'); } });
  def({ id: 'joe_blade', name: 'JOË BLADE', rarity: 4, col: '#e3ece6',
    desc: 'Weapon hits have a 1% chance to kill outright (elites lose 20% HP, bosses are immune). Every one adds +1% damage (up to +40%).',
    per: '+1% chance, +40% cap',
    hit(p, G, e, d, n, st) {
      if (e.boss || e.dead || Math.random() >= Math.min(0.05, 0.01 * n)) return;
      G.damage(e, e.elite || e.def.isElite ? e.maxHp * 0.2 : e.hp * 20 + 50, { flat: true, noCrit: true, src: 'blade', color: '#e3ece6' });
      st.k = Math.min(40 * n, (st.k || 0) + 1);
      RS.FX.burst(e.x, e.y - 10, ['#e3ece6', '#ffffff', '#ff2448'], 6, 220, { kind: 'line', life: 0.2 });
    },
    apply(s, n, p, st) { s.might *= 1 + 0.01 * (st.k || 0); } });
  def({ id: 'blood_on_me', name: 'BLOOD ON ME', rarity: 4, col: '#ff2448',
    desc: '+10% lifesteal. Every lifesteal heal has a 50% chance to BLOODMARK the enemy you hit.', per: '+10% lifesteal, more marks',
    apply(s, n) { s.lifesteal += 0.1 * n; s.lsMark = Math.max(s.lsMark, hyp(0.5, n)); } });

  // consumable dropped by TWIZZY MEAL (never in the random consumable pool: weight 0)
  D.CONSUMABLES.twizzy_burger = { id: 'twizzy_burger', name: 'TWIZZY BURGER', rarity: 0, weight: 0, stash: true, desc: 'From a TWIZZY MEAL. Heals 8% max HP.',
    use(p, G) { G.heal(p.s.maxHp * 0.08); } };

  // drop odds per rarity at luck 1 (COMMON / UNCOMMON / RARE / LEGENDARY); luck tilts them like level-up cards
  D.STASH_RARITY = [{ id: 0, w: 58 }, { id: 1, w: 29 }, { id: 2, w: 11 }, { id: 4, w: 2 }];

  // stash synergies: hidden like the rest (data/synergies.js), stash pieces count while you hold at least one copy
  D.SYNERGIES.push(
    { id: 'syn_thorns', name: 'THORN BUSH', needs: ['spiky_drip', 'spike_vest'], col: '#cfd6e3',
      desc: 'Touch me and find out. +3 spikes in every volley and spikes hit 50% harder.',
      apply(s) { s.spikeExtra += 3; s.spikeMul *= 1.5; } },
    { id: 'syn_hazmat', name: 'HAZMAT SEASON', needs: ['rotten_lean', 'toxic_gloves'], col: '#9cff35',
      desc: 'Something in the cup is glowing. Poison deals 40% more and slows what it eats.',
      apply(s) { s.poisonMul *= 1.4; s.poisonSlow = 0.2; } },
    { id: 'syn_bloodbath', name: 'BLOOD BATH', needs: ['bad_blood', 'blood_on_me'], col: '#ff2448',
      desc: 'Red everywhere. Bleeds deal 50% more and every marked kill heals 2 HP more.',
      apply(s) { s.bleedMul *= 1.5; s.markHeal += 2; } },
    { id: 'syn_subzero', name: 'SUB ZERO', needs: ['ice_talk', 'ice_talk_2'], col: '#9fe9ff',
      desc: 'Wrist so cold it hurts. Freezes last 50% longer and frozen enemies take 20% more.',
      apply(s) { s.freezeMul *= 1.5; s.frozenVuln += 0.2; } },
    { id: 'syn_storm', name: 'PERFECT STORM', needs: ['thunder_hands', 'plugged_in'], col: '#3ff2ff',
      desc: 'Hands full of voltage. Arcs jump to 2 more enemies and every lightning strike stuns for 0.5s.',
      apply(s) { s.arcExtra += 2; s.boltStun = Math.max(s.boltStun, 0.5); } },
    { id: 'syn_flags', name: 'MIXED SIGNALS', needs: ['red_flag', 'green_flag'], col: '#ffe14a',
      desc: 'Red flag, green flag, same chest. Every chest counts twice for both.',
      apply(s) { s.flagMul = 2; } },
    { id: 'syn_kevin', name: "KËVIN'S FAULT", needs: ['kevin', 'gold_plate'], col: '#ffe14a',
      desc: 'He says sorry with cash. Every KËVIN smack pays 6 CL0UT and the hype lasts twice as long.',
      apply(s) { s.kevinPay += 6; s.kevinHype *= 2; } },
    { id: 'syn_afterparty', name: 'AFTER PARTY', needs: ['after_hours', 'stand_still'], col: '#9b4dff',
      desc: 'Nobody leaves, nobody moves. Standing still also gives +3 armor.',
      apply(s, p) { if (p.stillT > 0.4) s.armor += 3; } },
    { id: 'syn_flyer', name: 'FREQUENT FLYER', needs: ['floatin', 'airwalk'], col: '#3ff2ff',
      desc: 'More air miles than ground miles. Airtime lasts 0.4s longer and AIRWALK hits 25% harder.',
      apply(s) { s.hang += 0.4; s.airBonus += 0.25; } },
    { id: 'syn_hexed', name: 'HEXED', needs: ['bad_karma', 'cursed_up'], col: '#b052ff',
      desc: 'Bad luck travels. A cursed enemy that dies passes the curse to the nearest enemy.',
      apply(s) { s.curseSpread = 1; } },
    { id: 'syn_thicc', name: 'THICC', needs: ['big_body', 'big_tonka'], col: '#ffd23f',
      desc: 'Weight class of your own. +15% max HP.',
      apply(s) { s.maxHp *= 1.15; } },
    { id: 'syn_demonic', name: 'DEMONIC', needs: ['demon_tax', 'demon_time'], col: '#ff2448',
      desc: 'The tax pays for itself. DEMON TIME goes up to +150%.',
      apply(s) { s.demonCap = Math.max(s.demonCap, 0.5); } },
    { id: 'syn_moneymoves', name: 'MONEY MOVES', needs: ['rich_walk', 'fast_lane'], col: '#ffd23f',
      desc: 'Every step is a transaction. RICH WALK pays twice as fast.',
      apply(s) { s.walkPay *= 2; } },
    { id: 'syn_haunted', name: 'HAUNTED HOUSE', needs: ['ghost_town', 'dead_homie'], col: '#e3ece6',
      desc: 'The whole block is dead. Ghosts and BOB stay 60% longer.',
      apply(s) { s.ghostLife *= 1.6; } },
    { id: 'syn_plugged', name: 'FULLY PLUGGED', needs: ['plug_tool', 'rage_altar'], col: '#9cff35',
      desc: 'The altar knows you. Altars charge 50% faster and their healing zone is twice as wide.',
      apply(s) { s.altarSpeed += 0.5; s.altarWide = 2; } },
  );

  D.STASH = STASH;
})(window.RS);
