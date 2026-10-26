'use strict';
// Passive items (held, level 1-5) and consumables (world pickups with instant/timed effects).
(function (RS) {
  const U = RS.U;
  const PASSIVES = {};
  const def = (o) => { o.type = 'passive'; o.max = 5; PASSIVES[o.id] = o; };

  def({ id: 'energy_808', name: '808 ENERGY', desc: 'Sonic weapons hit harder and wider.', per: '+10% sonic damage, +5% sonic area',
    apply(s, L) { s.sonicDmg += 0.10 * L; s.sonicArea += 0.05 * L; } });
  def({ id: 'double_cup', name: 'DOUBLE CUP', desc: 'Temporary effects last longer; consumables drop more often.', per: '+10% duration, +15% consumable chance',
    apply(s, L) { s.duration += 0.10 * L; s.consumableChance += 0.15 * L; } });
  def({ id: 'chrome_chain', name: 'CHROME CHAIN', desc: 'Iced-out crits and a chance to smack enemies back.', per: '+20% crit damage, +4% knockback proc',
    apply(s, L) { s.critMult += 0.2 * L; s.knockProc += 0.04 * L; } });
  def({ id: 'designer_puffer', name: 'DESIGNER PUFFER', desc: 'More max health and less knockback taken.', per: '+20 max HP, -12% knockback taken (+1 armor at lv 3 and 5)',
    apply(s, L, l) { s.maxHp += 20 * L; s.knockResist += 0.12 * L; s.armor += (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0); } });
  def({ id: 'balaclava', name: 'BALACLAVA', desc: 'Harder to pin down. Chance to fully dodge a hit.', per: '+4% evasion',
    apply(s, L) { s.evasion += 0.04 * L; } });
  def({ id: 'sound_cloud', name: 'SOUND CLOUD', desc: 'Bigger pickup radius. Every 10s it pulls in nearby XP.', per: '+20% pickup range',
    apply(s, L) { s.magnet *= 1 + 0.2 * L; },
    tick(p, G, l, dt, st) { st.t = (st.t || 0) + dt; if (st.t >= 10) { st.t = 0; G.vacuum(380 + 40 * l); } } });
  def({ id: 'studio_mic', name: 'STUDIO MIC', desc: 'Projectiles fly faster, further and straighter, and punch through.', per: '+10% projectile speed and range, -15% spread (+1 pierce at lv 3 and 5)',
    apply(s, L, l) { s.projSpeed += 0.1 * L; s.range += 0.1 * L; s.accuracy *= Math.max(0.2, 1 - 0.15 * L); s.pierce += (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0); } }); // pierce: bench had it at +7%
  def({ id: 'headphones', name: 'DISTORTED HEADPHONES', desc: 'Faster attacks, louder sonic weapons.', per: '-3% cooldowns, +5% sonic damage',
    apply(s, L) { s.cooldown *= 1 - 0.03 * L; s.sonicDmg += 0.05 * L; } });
  def({ id: 'red_laser', name: 'RED LASER', desc: 'Laser sight. More critical hits.', per: '+5% crit chance',
    apply(s, L) { s.critChance += 0.05 * L; } });
  def({ id: 'backstage_pass', name: 'BACKSTAGE PASS', desc: 'Chests can hold more items; elites give more XP.', per: '+15% extra-item chance, +20% elite XP',
    apply(s, L) { s.chestBonus += 0.15 * L; s.eliteBonus += 0.2 * L; } });
  // the bench had the old +2 amount at lv 4 at +117% damage (every 1-shot weapon doubled): one amount, then damage
  def({ id: 'mixing_board', name: 'MIXING BOARD', desc: 'More projectiles, discs, clouds and zones from every weapon.', per: '+1 amount, then +4% damage per level',
    apply(s, L, l) { s.amount += 1; s.might *= 1 + 0.04 * Math.max(0, L - 1); } });
  def({ id: 'deadstock', name: 'DEADSTOCK SNEAKERS', desc: 'Move faster, dash further, hit harder while moving.', per: '+4% speed, +10% dash distance, +5% moving damage',
    apply(s, L) { s.moveSpeed += 0.04 * L; s.dashDist += 0.1 * L; s.momentumDmg += 0.05 * L; } });
  def({ id: 'sound_engineer', name: 'SOUND ENGINEER', desc: 'Shorter weapon, ability and dash cooldowns.', per: '-3.5% weapon cooldown, -8% ability cooldown',
    apply(s, L) { s.cooldown *= 1 - 0.035 * L; s.abilityCd *= 1 - 0.08 * L; s.dashCd *= 1 - 0.04 * L; } });
  def({ id: 'lost_usb', name: 'LOST USB', desc: 'Every level-up plugs in a random temporary bonus.', per: 'Stronger and longer bonuses',
    apply() {},
    onLevel(p, G, l) {
      const dur = (10 + 3 * l) * p.s.duration;
      const k = 1 + 0.15 * l;
      const opts = [
        { id: 'usb_dmg', name: 'USB: DAMAGE', col: '#ff2448', apply: (s) => { s.might *= 1 + 0.25 * k; } },
        { id: 'usb_spd', name: 'USB: SPEED', col: '#9cff35', apply: (s) => { s.moveSpeed *= 1 + 0.2 * k; } },
        { id: 'usb_crit', name: 'USB: CRIT', col: '#ffe14a', apply: (s) => { s.critChance += 0.15 * k; } },
        { id: 'usb_cd', name: 'USB: TEMPO', col: '#e3ece6', apply: (s) => { s.cooldown *= 1 - 0.15 * k; } },
      ];
      const o = U.pick(opts);
      p.addBuff({ id: 'lost_usb_buff', name: o.name, icon: 'lost_usb', col: o.col, t: dur, apply: o.apply });
      if (Math.random() < 0.3) G.vacuum(9999);
    } });
  def({ id: 'glitch_chip', name: 'GLITCH CHIP', desc: 'Attacks can repeat themselves as weaker glitch copies.', per: '+6% echo chance (50% damage copy)',
    apply(s, L) { s.echo += 0.06 * L; } });
  def({ id: 'chaos_usb', name: 'CHAOS USB', desc: 'Periodically corrupts a random weapon with a wild temporary property.', per: 'More often, stronger',
    apply() {},
    tick(p, G, l, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t * p.s.chaosFast < 15 - l) return;
      st.t = 0;
      const ws = p.weapons.filter((w) => !w.def.persistent || w.def.update);
      if (!ws.length) return;
      const w = U.pick(ws);
      const k = 1 + 0.12 * l;
      const mods = [
        ['+DAMAGE', { dmg: 1 + 0.6 * k }], ['+AMOUNT', { amount: 2 }], ['OVERCLOCK', { cd: 1 / (1 + 0.5 * k) }], ['+AREA', { area: 1 + 0.4 * k }],
      ];
      const m = U.pick(mods);
      w.temp = Object.assign({ dmg: 1, cd: 1, area: 1, amount: 0 }, m[1]);
      w.tempT = 6 * p.s.duration;
      w.tempName = m[0];
      RS.FX.text(p.x, p.y - 40, w.def.name + ' ' + m[0], '#ff4f6e', 12, { always: true, life: 1.4 });
      G.sfx('teleport');
    } });
  def({ id: 'bootleg_merch', name: 'BOOTLEG MERCH', desc: 'Fans pay up. More CL0UT from everything.', per: '+15% CL0UT, +0.4% coin drop chance',
    apply(s, L) { s.greed += 0.15 * L; s.coinChance += 0.004 * L; } });
  def({ id: 'vip_wristband', name: 'VIP WRISTBAND', desc: 'Elites drop rare rewards more often. Slight luck bump.', per: '+25% elite rewards, +5% luck',
    apply(s, L) { s.eliteBonus += 0.25 * L; s.luck += 0.05 * L; } });
  def({ id: 'lean', name: 'LEAN', desc: 'Every 14s a purple haze surrounds you: less damage taken, nearby enemies slowed, you move a bit slower.', per: 'Longer haze, stronger reduction',
    apply() {},
    tick(p, G, l, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t < 14) return;
      st.t = 0;
      const dur = (3 + 0.5 * l) * p.s.duration;
      const red = 0.25 + 0.05 * l;
      p.addBuff({ id: 'lean_haze', name: 'PURPLE HAZE', icon: 'lean', col: '#9b4dff', t: dur, aura: 140,
        apply: (s) => { s.dmgTaken *= 1 - red; s.moveSpeed *= 0.9; } });
      G.sfx('deadair');
    } });

  // ---------------------------------------------------------------- the 2021 drop
  def({ id: 'slowed_reverb', name: 'SLOWED + REVERB', desc: 'Everything near you plays at 0.8x. Slowed enemies take extra damage.',
    per: '+5% slow in a 150px field, +6% damage to slowed enemies',
    apply(s, L) { s.reverb += 0.06 * L; s.reverbField += 0.05 * L; },
    tick(p, G, l, dt, st) {
      st.t = (st.t || 0) - dt;
      if (st.t > 0) return;
      st.t = 0.25; // the field refreshes four times a second, not every frame
      const amt = Math.min(0.6, 0.1 + p.s.reverbField), R = 150 * p.s.area * p.s.reverbWide;
      for (const e of G.inRadius(p.x, p.y, R)) if (!e.boss) { e.slowT = Math.max(e.slowT, 0.32); e.slowAmt = Math.max(e.slowAmt, amt); }
      st.r = (st.r || 0) + 1;
      if (st.r % 6 === 0) RS.FX.ring(p.x, p.y, R, '#b39ddb', 0.6, 1, 0.03); // a faint pulse every 1.5 s shows the edge, no constant circle
    } });
  def({ id: 'sped_up', name: 'SPED UP', desc: 'The nightcore edit nobody asked for. Everything you do is faster.',
    per: '+4% move speed, +4% attack speed, -3 max HP',
    apply(s, L) { s.moveSpeed += 0.04 * L; s.cooldown *= 1 - 0.04 * L; s.maxHp -= 3 * L; } });
  def({ id: 'the_bells', name: 'THE BELLS', desc: 'You know which bells. Every two bars they ring: damage, shove, stun.',
    per: '+8 bell damage, +12px ring',
    apply(s, L) { s.bellPow += L; },
    tick(p, G, l, dt, st) {
      const bi = Math.floor(G.time * 2.5 / p.s.bellEvery); // the run clock's 150 BPM grid (SHUFFLE GHOST dances to it too)
      if (st.b === undefined) st.b = bi;
      if (bi === st.b) return;
      st.b = bi;
      const L = p.s.bellPow, R = (130 + 12 * L) * p.s.area;
      G.aoe(p.x, p.y, R, (6 + 8 * L) * p.s.bellMul, { knock: 260, src: 'bells', sonic: true, color: '#ffe9a8' });
      for (const e of G.inRadius(p.x, p.y, R)) if (!e.boss) e.freezeT = Math.max(e.freezeT || 0, 0.25);
      RS.FX.ring(p.x, p.y, R, '#ffe9a8', 0.45, 3);
      RS.FX.ring(p.x, p.y, R * 0.55, '#ffd23f', 0.3, 2);
      G.sfx('bell');
    } });
  def({ id: 'vamp_fangs', name: 'VAMP FANGS', desc: 'Up all night, never sick. Every kill drains a little life back.',
    per: '+0.25 HP per kill (up to 2 HP/s, +0.5/s per level)',
    apply(s, L) { s.vamp += 0.25 * L; s.vampCap += 1.5 + 0.5 * L; } }); // the heal itself: Player.onKill
  def({ id: 'stage_pyro', name: 'STAGE PYRO', desc: 'Every headline set needs fire. Blasts, zones and auras get bigger and burn longer.',
    per: '+5% area, +4% duration',
    apply(s, L) { s.area *= 1 + 0.05 * L; s.duration += 0.04 * L; } });
  def({ id: 'burner_phone', name: 'BURNER PHONE', desc: 'New number, who dis. Taking a hit can send you private for a moment.',
    per: '+7% chance on hit: 1.2s untouchable, +30% speed',
    apply(s, L) { s.burner += 0.07 * L; },
    onHurt(p, G) {
      if (Math.random() >= p.s.burner) return;
      const t = 1.2 * p.s.burnerDur;
      p.invuln = Math.max(p.invuln, t);
      p.addBuff({ id: 'gone_private', name: 'GONE PRIVATE', icon: 'burner_phone', col: '#cfd6e3', t, apply: (s) => { s.moveSpeed *= 1.3; } });
      RS.FX.text(p.x, p.y - 52, 'GONE PRIVATE', '#cfd6e3', 13, { always: true, life: 1.1 });
      G.sfx('dodge');
    } });
  def({ id: 'group_buy', name: 'GROUP BUY', desc: 'The server chipped in. Every full CL0UT pot drops a random consumable.',
    per: 'pot of 45 CL0UT, 5 smaller per level',
    apply(s, L) { s.groupBuy = Math.max(20, 50 - 5 * L); },
    tick(p, G, l, dt, st) {
      if (st.got === undefined) st.got = G.stats.coins;
      if (G.stats.coins - st.got < p.s.groupBuy) return;
      st.got += p.s.groupBuy;
      G.dropConsumable(p.x + U.rand(-24, 24), p.y + U.rand(10, 30));
      RS.FX.text(p.x, p.y - 50, 'GROUP BUY FUNDED', '#9cff35', 12, { always: true, life: 1.2 });
      G.sfx('coin');
    } });
  def({ id: 'type_beat', name: 'TYPE BEAT', desc: '$20 lease, fits on anything. More weapons, more damage for all of them.',
    per: '+1% damage per weapon you carry',
    apply(s, L, l, p) { s.might *= 1 + 0.01 * L * (p ? p.weapons.length : 1); } });
  def({ id: 'producer_tag', name: 'PRODUCER TAG', desc: 'Every few shots one gets tagged: triple damage, and everyone hears it.',
    per: 'every 12th shot, one sooner per level (8th at lv 5)',
    apply(s, L) { s.tagEvery = Math.max(6, Math.round(13 - L)); } });

  // ---------------------------------------------------------------- consumables
  const CONSUMABLES = {
    perc: { id: 'perc', name: 'PERC', rarity: 3, weight: 2, desc: '8s: +40% attack speed, +10% speed, half dash cooldown. Then a 5s comedown (-25% speed).',
      use(p, G) {
        const dur = 8 * p.s.duration;
        p.addBuff({ id: 'perc', name: 'PERC', icon: 'perc', col: '#e3ece6', t: dur,
          apply: (s) => { s.cooldown *= 0.72; s.moveSpeed *= 1.1; s.dashCd *= 0.5; },
          onEnd: (pp) => pp.addBuff({ id: 'comedown', name: 'COMEDOWN', icon: 'perc', col: '#5a6070', t: 5, debuff: true, apply: (s) => { s.moveSpeed *= 0.75; } }) });
        G.sfx('perc');
      } },
    rage_juice: { id: 'rage_juice', name: 'RAGE JUICE', rarity: 2, weight: 4, desc: '10s: +50% damage, but you take 30% more damage and lose 3 armor.',
      use(p, G) {
        p.addBuff({ id: 'rage_juice', name: 'RAGE JUICE', icon: 'rage_juice', col: '#ff2448', t: 10 * p.s.duration,
          apply: (s) => { s.might *= 1.5; s.dmgTaken *= 1.3; s.armor -= 3; } });
        G.sfx('ability');
      } },
    // a flat 30 healed a third of the bar at 5:00 and a sixth at 25:00: the box grows with your max HP (playtests: "worn down" deaths)
    chicken_box: { id: 'chicken_box', name: 'CHICKEN BOX', rarity: 0, weight: 10, desc: 'Two-piece, extra sauce. Heals 30 HP or 20% max HP, whichever is more.',
      use(p, G) { G.heal(Math.max(30, p.s.maxHp * 0.2)); } },
    tap_water: { id: 'tap_water', name: 'TAP WATER', rarity: 0, weight: 4, desc: 'Stay hydrated, lil bro. Heals 15% max HP and clears every debuff.',
      use(p, G) {
        G.heal(p.s.maxHp * 0.15);
        p.buffs = p.buffs.filter((b) => !b.debuff); p.slowT = 0;
        RS.FX.burst(p.x, p.y - 10, ['#9fe8ff', '#ffffff'], 8, 140, { size: 3, life: 0.4, grav: 200 });
      } },
    snippet: { id: 'snippet', name: 'LQ SNIPPET', rarity: 1, weight: 4, desc: 'A song that is never coming out. 15s: +20% damage, +25% XP.',
      use(p, G) {
        p.addBuff({ id: 'snippet', name: 'SNIPPET ON LOOP', icon: 'snippet', col: '#9cff35', t: 15 * p.s.duration, apply: (s) => { s.might *= 1.2; s.growth *= 1.25; } });
        G.sfx('rare');
      } },
    // the album that is always dropping "this Friday": a countdown, sometimes pushed back once, then it really drops
    album_drop: { id: 'album_drop', name: 'ALBUM DROP', rarity: 3, weight: 1, desc: 'Dropping tonight. Trust. Hits everything on screen, pulls in all XP.',
      use(p, G) { // run timers (G.later) are cleared when a run ends, so a countdown never leaks into the next one
        const drop = () => {
          RS.FX.banner('IT ACTUALLY DROPPED', 'NO SKIPS', '#ffd23f', 2.4);
          G.airhorn();
          for (const e of G.enemies.list) if (!e.dead && G.onScreen(e.x, e.y, 40)) G.damage(e, 80 + G.time * 0.3, { noCrit: true, src: 'album', color: '#ffd23f' });
          G.vacuum(99999);
        };
        const count = (n, then) => {
          if (n > 0) { RS.FX.text(G.p.x, G.p.y - 60, 'DROPPING IN ' + n, '#ffd23f', 16, { always: true, life: 0.9 }); G.sfx('telegraph'); G.later(1, () => count(n - 1, then)); }
          else then();
        };
        RS.FX.banner('ALBUM DROP', 'TONIGHT. TRUST.', '#ffd23f', 1.6);
        if (Math.random() < 0.4) {
          count(3, () => { RS.FX.banner('PUSHED BACK', 'MIXING ISSUES. NEW DATE: SOON', '#ff2448', 1.8); G.sfx('warning'); G.later(3, () => count(2, drop)); });
        } else count(3, drop);
      } },
    free_wifi: { id: 'free_wifi', name: 'FREE WIFI', rarity: 1, weight: 6, desc: 'Pulls every XP orb on the map to you.',
      use(p, G) { G.vacuum(99999); G.sfx('rare'); } },
    airhorn: { id: 'airhorn', name: 'AIRHORN', rarity: 2, weight: 3, desc: 'BWAAAP. Damages and blasts back every enemy on screen.',
      use(p, G) { G.airhorn(); } },
    clout_stack: { id: 'clout_stack', name: 'CL0UT STACK', rarity: 1, weight: 5, desc: '+10 CL0UT.',
      use(p, G) { G.addRunClout(10); G.sfx('coin'); } },
    flash_cam: { id: 'flash_cam', name: 'FLASH CAM', rarity: 2, weight: 3, desc: 'Flash photo. Every enemy freezes for 4s.',
      use(p, G) { G.freezeAll(4 * p.s.duration); } },
  };

  RS.Data.PASSIVES = PASSIVES;
  RS.Data.CONSUMABLES = CONSUMABLES;
})(window.RS);
