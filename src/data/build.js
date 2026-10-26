'use strict';
// The build layer of level-ups (inspired by Megabonk): limited weapon and TAPE slots, weapon MODS and TAPES.
//  - Slots: 3 weapons and 2 TAPES per run, 6 passives. Clearing WAVE 15 once opens the 4th weapon slot for good, FEATURE
//    SLOT (UPGRADES, after that) a 5th; B-SIDE up to 2 more TAPES.
//    Levelling a TAPE you hold never takes a slot; only a new one does.
//  - MODS: a level-up card can upgrade one stat of a weapon you hold (damage, attack speed, projectiles, size,
//    range, crit, pierce, ricochet, chain, duration or the weapon's own special effect). Mods have no cap on count,
//    they keep a maxed or evolved weapon growing, and they carry over into its evolution.
//  - TAPES: the stat upgrades (they were loose STAT BOOST cards) as slotted items you level up to LV 10. Once your
//    TAPE slots are full only your own TAPES come up, so a run commits to a few stats.
// Offers (Progression.candidates) lean on what you hold: upgrades for your weapons and tapes come first, a weapon you
// just picked up is favoured for a few levels, new weapons show up less the fuller your slots are (never when full).
(function (RS) {
  const D = RS.Data;
  const pct = (v) => Math.round(v * 100) + '%';

  D.BUILD = {
    weaponSlots: 3, tapeSlots: 2, passiveSlots: 6,
    tapeMax: 10,
    perCard: 1,            // cards for one weapon in an offer (or in THE PLUG): one, never a GLOCK next to a GLOCK
    focusLevels: 6,        // a new weapon's upgrades come up twice as often, fading over this many levels
    tapeSynLevel: 3,       // a TAPE counts for synergies (and resonance) from this level
  };

  // ------------------------------------------------------------ TAPES (one per stat card in D.STATCARDS)
  const TAPES = {};
  const tape = (id, card, name, col, tags, desc, max) => {
    const sc = D.STATCARDS.find((c) => c.id === card);
    TAPES[id] = { id, card: sc, name, col, tags, desc, max: max || D.BUILD.tapeMax, minR: sc.minR || 0, type: 'tape' };
  };
  tape('tape_dmg', 'st_dmg', 'DAMAGE TAPE', '#ff7a1a', ['blast'], 'Every track is a diss track. More damage from everything.');
  tape('tape_cd', 'st_cd', 'TEMPO TAPE', '#9cff35', ['tempo'], 'Sped up past the point of reason. Every weapon fires faster.');
  tape('tape_hp', 'st_hp', 'HEALTH TAPE', '#ff2448', ['blood'], 'Recorded in one take, survived anyway. More max HP.');
  tape('tape_speed', 'st_speed', 'SPEED TAPE', '#3ff2ff', ['motion'], 'Driving music. You move faster.');
  tape('tape_crit', 'st_crit', 'CRIT TAPE', '#ffe14a', ['crit'], 'Every bar lands. More critical hits.');
  tape('tape_critdmg', 'st_critdmg', 'KILLSHOT TAPE', '#ffd23f', ['crit'], 'The diss that ends careers. Crits hit harder.');
  tape('tape_area', 'st_area', 'AREA TAPE', '#b052ff', ['blast'], 'Mixed for stadiums. Bigger blasts, zones and auras.');
  tape('tape_magnet', 'st_magnet', 'MAGNET TAPE', '#5dff6a', ['hustle'], 'Everyone wants a copy. Bigger pickup range.');
  tape('tape_luck', 'st_luck', 'LUCK TAPE', '#e3ece6', ['chaos'], 'Found it in a thrift store. Rarer cards and loot.');
  tape('tape_dash', 'st_dash', 'DASH TAPE', '#cfd6e3', ['motion'], 'All skips, no filler. Shorter dash cooldown.');
  tape('tape_dur', 'st_duration', 'DURATION TAPE', '#9b4dff', ['blast'], 'The extended version. Every timed effect lasts longer.');
  tape('tape_armor', 'st_armor', 'ARMOR TAPE', '#9aa3b2', ['blood'], 'Bulletproof bars. More armor.');
  tape('tape_regen', 'st_regen', 'REGEN TAPE', '#ff6ad5', ['blood'], 'Recovery music. You heal over time.');
  tape('tape_xp', 'st_xp', 'XP TAPE', '#c8ff7d', ['hustle'], 'Study beats. More XP from everything.');
  tape('tape_amount', 'st_amount', 'PROJECTILE TAPE', '#ff2448', ['tempo'], 'A double album. One more projectile on every weapon (EPIC and LEGENDARY only).', 2);
  D.TAPES = TAPES;
  for (const t of Object.values(TAPES)) D.ITEM_TAGS[t.id] = t.tags;

  // ------------------------------------------------------------ weapon special effects (one per weapon family)
  // kind: what a proc does (RS.Progression.weaponFx); chance per mod pick by rarity, 40% at most
  D.WEAPON_FX = {
    glock: ['bleed', 'HOLLOW TIPS'], rage_burst: ['burn', 'TRACER ROUNDS'], schmunk_spin: ['curse', 'SCHMUNK HEX'],
    bass_cannon: ['stun', 'SUBSONIC'], opium_orbit: ['bleed', 'THORN HALO'], twizzy_tornado: ['chill', 'COLD FRONT'],
    glitch_glock: ['shock', 'OVERCLOCK'], cloud_nine: ['shock', 'STATIC'], shock_808: ['stun', 'BLOWN EARS'],
    chrome_whip: ['bleed', 'BARBED CHAIN'], mosh_pit: ['stun', 'ELBOWS OUT'], soundwave: ['chill', 'FROST WAVE'],
    dead_air: ['curse', 'BAD SIGNAL'], rage_rocket: ['burn', 'NAPALM'], burned_cd: ['bleed', 'JAGGED EDGE'],
    aux_cord: ['stun', 'SHORT CIRCUIT'], cassette_mines: ['burn', 'HOT WAX'], bad_vibes: ['poison', 'TOXIC ENERGY'],
    switchblade: ['bleed', 'SERRATED'],
  };
  const FX_TEXT = {
    bleed: 'can make enemies bleed (40% of the hit over 3s)', burn: 'can set enemies on fire (40% of the hit over 3s)',
    poison: 'can poison enemies (40% of the hit over 3s)', curse: 'can curse enemies (2% of max HP per second for 3s)',
    stun: 'can stun enemies for 0.6s', chill: 'can chill enemies (-45% speed for 2s)', shock: 'can arc to 2 nearby enemies (40% of the hit)',
  };
  D.fxOf = (def) => D.WEAPON_FX[def.from || def.id] || ['bleed', 'EDGE'];

  // ------------------------------------------------------------ weapon MODS
  // ok(def, w): can this weapon take it now; v[rarity]: value at COMMON .. LEGENDARY; minR: lowest rarity it shows at
  const R5 = (a) => a; // values per rarity index 0-4
  D.WEAPON_MODS = [
    { id: 'dmg', name: 'DAMAGE', w: 3, v: R5([0.2, 0.3, 0.42, 0.6, 0.9]), ok: () => true,
      fmt: (v) => '+' + pct(v) + ' damage', apply: (w, v) => { w.bonus.dmg += v; } },
    { id: 'rate', name: 'ATTACK SPEED', w: 2.5, v: R5([0.1, 0.13, 0.17, 0.22, 0.3]), ok: (d, w) => d.base.cd !== undefined && w.bonus.cd > 0.51,
      fmt: (v, d) => '+' + pct(v) + (d.persistent && d.base.hitCd ? ' spin and hit rate' : ' attack speed'), apply: (w, v) => { w.bonus.cd = Math.max(0.5, w.bonus.cd * (1 - v)); } },
    { id: 'amount', name: 'PROJECTILES', w: 1, minR: 1, v: R5([1, 1, 1, 1, 1]), ok: (d, w) => d.base.amount !== undefined && w.bonus.amount < 3,
      fmt: (v, d) => '+1 ' + (d.persistent && d.base.hitCd ? 'orbiting blade' : d.base.maxMines ? 'mine per throw' : d.base.radius && d.base.dur ? 'zone' : 'projectile'),
      apply: (w) => { w.bonus.amount = Math.min(3, w.bonus.amount + 1); } },
    { id: 'size', name: 'SIZE', w: 1.6, v: R5([0.12, 0.18, 0.24, 0.32, 0.42]), ok: (d) => d.base.area !== undefined,
      fmt: (v) => '+' + pct(v) + ' size', apply: (w, v) => { w.bonus.area += v; } },
    { id: 'reach', name: 'RANGE', w: 1.3, v: R5([0.15, 0.2, 0.26, 0.34, 0.45]), ok: (d, w) => (d.base.speed > 50 || d.base.range || d.base.jump) && w.bonus.reach < 2,
      fmt: (v) => '+' + pct(v) + ' range and projectile speed', apply: (w, v) => { w.bonus.reach += v; } },
    { id: 'crit', name: 'CRIT', w: 1.3, v: R5([0.06, 0.09, 0.12, 0.16, 0.22]), ok: (d, w) => d.base.crit !== undefined && w.bonus.crit < 0.45,
      fmt: (v) => '+' + pct(v) + ' crit chance', apply: (w, v) => { w.bonus.crit = Math.min(0.5, w.bonus.crit + v); } },
    { id: 'pierce', name: 'PIERCE', w: 1.2, minR: 1, v: R5([1, 1, 1, 1, 2]), ok: (d, w) => d.base.pierce !== undefined && w.bonus.pierce < 3,
      fmt: (v) => '+' + v + ' pierce', apply: (w, v) => { w.bonus.pierce = Math.min(3, w.bonus.pierce + v); } },
    { id: 'bounce', name: 'RICOCHET', w: 1.2, v: R5([1, 1, 1, 2, 2]), ok: (d, w) => d.base.bounce !== undefined && w.bonus.bounce < 4,
      fmt: (v) => '+' + v + ' ricochet', apply: (w, v) => { w.bonus.bounce = Math.min(4, w.bonus.bounce + v); } },
    { id: 'chain', name: 'CHAIN', w: 1.2, v: R5([1, 1, 1, 2, 2]), ok: (d, w) => d.base.chains !== undefined && w.bonus.chains < 4,
      fmt: (v) => '+' + v + ' chain jump', apply: (w, v) => { w.bonus.chains = Math.min(4, w.bonus.chains + v); } },
    { id: 'dur', name: 'DURATION', w: 1.2, v: R5([0.2, 0.28, 0.36, 0.48, 0.65]), ok: (d, w) => d.base.dur !== undefined && w.bonus.dur < 2,
      fmt: (v) => '+' + pct(v) + ' duration', apply: (w, v) => { w.bonus.dur += v; } },
    { id: 'fx', name: 'SPECIAL', w: 1.1, v: R5([0.08, 0.11, 0.14, 0.18, 0.24]), ok: (d, w) => w.bonus.fxC < 0.4,
      label: (d) => D.fxOf(d)[1],
      fmt: (v, d) => '+' + pct(v) + ' chance: hits ' + FX_TEXT[D.fxOf(d)[0]], apply: (w, v) => { w.bonus.fxC = Math.min(0.4, w.bonus.fxC + v); } },
  ];

  // ------------------------------------------------------------ synergies: weapons x TAPES (x passives)
  // a TAPE counts once it is at LV 3 (D.BUILD.tapeSynLevel); s.wmods[weapon] multiplies that weapon's own stats
  const wm = (s, id, o) => { const m = s.wmods[id] || (s.wmods[id] = { dmg: 1, cd: 1, area: 1, amount: 0, pierce: 0, bounce: 0, chains: 0, reach: 1, dur: 1, crit: 0 });
    for (const k in o) { if (k === 'amount' || k === 'pierce' || k === 'bounce' || k === 'chains' || k === 'crit') m[k] += o[k]; else m[k] *= o[k]; } };
  const syn = (id, name, needs, col, desc, apply) => D.SYNERGIES.push({ id, name, needs, col, desc, apply });
  syn('syn_hollow', 'HOLLOW POINTS', ['glock', 'tape_dmg'], '#ffe9a8', 'The sidearm finally hits like it means it. GLOCK +30% damage and +1 pierce.',
    (s) => wm(s, 'glock', { dmg: 1.3, pierce: 1 }));
  syn('syn_tracer', 'TRACER FIRE', ['rage_burst', 'tape_cd'], '#ff2448', 'Bursts back to back. RAGE BURST fires 15% faster and hits 15% harder.',
    (s) => wm(s, 'rage_burst', { cd: 0.87, dmg: 1.15 }));
  syn('syn_spincycle', 'SPIN CYCLE', ['schmunk_spin', 'tape_luck'], '#c8ff7d', 'It never lands where you think. SCHMUNK SPIN +2 ricochets and +10% damage.',
    (s) => wm(s, 'schmunk_spin', { bounce: 2, dmg: 1.1 }));
  syn('syn_subwoofer', 'SUBWOOFER', ['bass_cannon', 'tape_area'], '#9cff35', 'The trunk rattles three blocks away. BASS CANNON +25% size and +20% damage.',
    (s) => wm(s, 'bass_cannon', { area: 1.25, dmg: 1.2 }));
  syn('syn_halo', 'BLOOD HALO', ['opium_orbit', 'tape_hp'], '#ff2448', 'Red crosses spinning around a body that will not drop. OPIUM ORBIT +1 blade, +20 max HP.',
    (s) => { wm(s, 'opium_orbit', { amount: 1 }); s.maxHp += 20; });
  syn('syn_eye', 'EYE OF THE STORM', ['twizzy_tornado', 'tape_dur'], '#3ff2ff', 'Calm in the middle, chaos around it. TWIZZY TORNADO lasts 40% longer and hits 15% harder.',
    (s) => wm(s, 'twizzy_tornado', { dur: 1.4, dmg: 1.15 }));
  syn('syn_overclock', 'OVERCLOCKED', ['glitch_glock', 'tape_crit'], '#ff4f6e', 'Running hot on purpose. GLITCH GLOCK +12% crit chance and +15% damage.',
    (s) => wm(s, 'glitch_glock', { crit: 0.12, dmg: 1.15 }));
  syn('syn_forecast', 'FORECAST', ['cloud_nine', 'tape_magnet'], '#b39ddb', 'Cloudy with a chance of you. CLOUD NINE +1 strike and +20% range.',
    (s) => wm(s, 'cloud_nine', { amount: 1, reach: 1.2 }));
  syn('syn_blowout', 'BLOWOUT', ['shock_808', 'headphones', 'tape_area'], '#9cff35', 'The speaker gave up before you did. 808 SHOCKWAVE +30% damage and +15% size.',
    (s) => wm(s, 'shock_808', { dmg: 1.3, area: 1.15 }));
  syn('syn_lash', 'CHROME LASH', ['chrome_whip', 'tape_critdmg'], '#cfd6e3', 'Every swing leaves a mark. CHROME WHIP +25% damage and +10% crit chance.',
    (s) => wm(s, 'chrome_whip', { dmg: 1.25, crit: 0.1 }));
  syn('syn_circlepit', 'CIRCLE PIT', ['mosh_pit', 'tape_armor'], '#ff7a1a', 'Elbows up, nobody falls. +2 armor and MOSH PIT +20% size.',
    (s) => { s.armor += 2; wm(s, 'mosh_pit', { area: 1.2 }); });
  syn('syn_feedback', 'FEEDBACK LOOP', ['soundwave', 'tape_cd'], '#3ff2ff', 'The mic is too close to the speaker. SOUNDWAVE fires 20% faster and hits 15% harder.',
    (s) => wm(s, 'soundwave', { cd: 0.83, dmg: 1.15 }));
  syn('syn_radio', 'RADIO SILENCE', ['dead_air', 'tape_dur'], '#5a6070', 'Nothing on any frequency. DEAD AIR zones last 40% longer and are 20% wider.',
    (s) => wm(s, 'dead_air', { dur: 1.4, area: 1.2 }));
  syn('syn_payload', 'PAYLOAD', ['rage_rocket', 'stage_pyro', 'tape_dmg'], '#ff7a1a', 'Too much powder in every round. RAGE ROCKET +35% damage and +15% size.',
    (s) => wm(s, 'rage_rocket', { dmg: 1.35, area: 1.15 }));
  syn('syn_repeat', 'ON REPEAT', ['burned_cd', 'tape_speed'], '#ff4f6e', 'Same song all summer. BURNED CD +25% damage and +20% range.',
    (s) => wm(s, 'burned_cd', { dmg: 1.25, reach: 1.2 }));
  syn('syn_livewire', 'LIVE WIRE', ['aux_cord', 'tape_cd'], '#3ff2ff', 'Nobody touches the aux. AUX CORD +2 chain jumps and fires 15% faster.',
    (s) => wm(s, 'aux_cord', { chains: 2, cd: 0.87 }));
  syn('syn_traphouse', 'TRAP HOUSE', ['cassette_mines', 'tape_dash'], '#ff2448', 'Every door is rigged. CASSETTE MINES +30% damage and +1 mine per throw.',
    (s) => wm(s, 'cassette_mines', { dmg: 1.3, amount: 1 }));
  syn('syn_badco', 'BAD COMPANY', ['bad_vibes', 'tape_regen'], '#ff6ad5', 'They drain everyone but you. BAD VIBES +25% damage, +0.5 HP regen per second.',
    (s) => { wm(s, 'bad_vibes', { dmg: 1.25 }); s.regen += 0.5; });
  syn('syn_shank', 'SHANK', ['switchblade', 'tape_speed'], '#e3ece6', 'In and out before they turn around. SWITCHBLADE +25% damage and 10% faster.',
    (s) => wm(s, 'switchblade', { dmg: 1.25, cd: 0.9 }));
  syn('syn_hype', 'HYPE TRAIN', ['backstage_pass', 'tape_xp'], '#c8ff7d', 'Everyone wants to be on it. +10% XP and elites give 25% more XP.',
    (s) => { s.growth += 0.1; s.eliteBonus += 0.25; });
  syn('syn_jackpot', 'JACKPOT', ['vip_wristband', 'tape_luck'], '#ffd23f', 'The wristband gets you into every room. +10% luck and rarer level-up cards.',
    (s) => { s.luck += 0.1; s.rarityLuck += 0.15; });
  syn('syn_headshot', 'HEADSHOT', ['red_laser', 'tape_critdmg'], '#ff2448', 'Dot on the forehead. +5% crit chance and +30% crit damage.',
    (s) => { s.critChance += 0.05; s.critMult += 0.3; });
  syn('syn_marathon', 'MARATHON', ['deadstock', 'tape_dash'], '#e3ece6', 'Laced up for the long run. -15% dash cooldown and +10% damage while moving.',
    (s) => { s.dashCd *= 0.85; s.momentumDmg += 0.1; });
})(window.RS);
