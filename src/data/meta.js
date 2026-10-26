'use strict';
// Rarity, level-up stat cards, permanent perks, unlocks, cosmetics, challenges, run modifiers.
(function (RS) {
  const D = RS.Data;

  // level-up rarity odds at luck 1 (playtest: 62% of all cards were COMMON and EPIC+ came about once a run; a 5:00
  // build was too thin): COMMON 46%, UNCOMMON 31%, RARE 15%, EPIC 6%, LEGENDARY 1.5% (was 60 / 26 / 10 / 3.4 / 0.9).
  // Luck tilts it with exponent 1.0 (Progression.rollRarity; it was 1.2, and with these odds luck cards fed back into
  // 13% LEGENDARY runs)
  D.RARITY = [
    { id: 0, name: 'COMMON', col: '#b8c0cc', w: 46, mult: 1 },
    { id: 1, name: 'UNCOMMON', col: '#5dff6a', w: 31, mult: 1.5 },
    { id: 2, name: 'RARE', col: '#3fa9ff', w: 15, mult: 2 },
    { id: 3, name: 'EPIC', col: '#b052ff', w: 6, mult: 3 },
    { id: 4, name: 'LEGENDARY', col: '#ff3b3b', w: 1.5, mult: 5 },
  ];

  // generic stat upgrades; v(m) = value at rarity multiplier m
  D.STATCARDS = [
    { id: 'st_hp', name: 'MAX HEALTH', fmt: (m) => `+${Math.round(10 * m)} max HP (and heal it)`, apply: (p, m) => { p.bonus.maxHp += Math.round(10 * m); p.hp += Math.round(10 * m); } },
    { id: 'st_dmg', name: 'DAMAGE', fmt: (m) => `+${Math.round(5 * m)}% damage`, apply: (p, m) => { p.bonus.might += 0.05 * m; } },
    { id: 'st_cd', name: 'ATTACK SPEED', fmt: (m) => `-${(2.5 * m).toFixed(1)}% weapon cooldowns`, apply: (p, m) => { p.bonus.cooldown *= 1 - 0.025 * m; } },
    { id: 'st_speed', name: 'MOVE SPEED', fmt: (m) => `+${Math.round(3 * m)}% move speed`, apply: (p, m) => { p.bonus.moveSpeed += 0.03 * m; } },
    { id: 'st_crit', name: 'CRIT CHANCE', fmt: (m) => `+${Math.round(3 * m)}% crit chance`, apply: (p, m) => { p.bonus.critChance += 0.03 * m; } },
    { id: 'st_critdmg', name: 'CRIT DAMAGE', fmt: (m) => `+${Math.round(12 * m)}% crit damage`, apply: (p, m) => { p.bonus.critMult += 0.12 * m; } },
    { id: 'st_area', name: 'AREA', fmt: (m) => `+${Math.round(5 * m)}% area / size`, apply: (p, m) => { p.bonus.area += 0.05 * m; } },
    { id: 'st_magnet', name: 'PICKUP RANGE', fmt: (m) => `+${Math.round(12 * m)}% pickup range`, apply: (p, m) => { p.bonus.magnet += 0.12 * m; } },
    { id: 'st_luck', name: 'LUCK', fmt: (m) => `+${Math.round(6 * m)}% luck`, apply: (p, m) => { p.bonus.luck += 0.06 * m; } },
    { id: 'st_dash', name: 'DASH COOLDOWN', fmt: (m) => `-${Math.round(5 * m)}% dash cooldown`, apply: (p, m) => { p.bonus.dashCd *= 1 - 0.05 * m; } },
    { id: 'st_duration', name: 'DURATION', fmt: (m) => `+${Math.round(6 * m)}% effect duration`, apply: (p, m) => { p.bonus.duration += 0.06 * m; } },
    { id: 'st_armor', name: 'ARMOR', fmt: (m) => `+${Math.max(1, Math.floor(m * 0.6))} armor`, apply: (p, m) => { p.bonus.armor += Math.max(1, Math.floor(m * 0.6)); } },
    { id: 'st_regen', name: 'REGEN', fmt: (m) => `+${(0.2 * m).toFixed(1)} HP / sec`, apply: (p, m) => { p.bonus.regen += 0.2 * m; } },
    { id: 'st_xp', name: 'XP GAIN', fmt: (m) => `+${Math.round(5 * m)}% XP`, apply: (p, m) => { p.bonus.growth += 0.05 * m; } },
    { id: 'st_amount', name: 'PROJECTILES', minR: 3, fmt: () => '+1 projectile / amount on all weapons', apply: (p) => { p.bonus.amount += 1; } },
  ];
  // legendary-only specials with unusual mechanics
  D.SPECIALCARDS = [
    { id: 'st_revive', name: 'SECOND VERSE', fmt: () => 'Once this run: when you die, revive at 50% HP with a blast.', apply: (p) => { p.revives += 1; } },
    { id: 'st_autotune', name: 'AUTOTUNE', fmt: () => 'Every weapon you own gains +1 level.', apply: (p, m, G) => { for (const w of p.weapons) if (w.level < w.def.max) G.levelWeapon(w, 1); } },
    { id: 'st_grillz', name: 'GRILLZ OF GOD', fmt: () => 'Critical hits heal 1 HP (max 4 HP / sec).', apply: (p) => { p.flags.grillz = true; } },
    { id: 'st_feature', name: 'FEATURE VERSE', fmt: () => 'Instantly gain a random new weapon at level 3.', apply: (p, m, G) => { G.giveRandomWeapon(3); }, cond: (p) => p.weapons.length < p.maxWeapons },
    { id: 'st_viral', name: 'GONE VIRAL', fmt: () => 'Kills have a 4% chance to launch a homing heart that explodes.', apply: (p) => { p.flags.viral = true; } },
  ];
  D.CHARCARDS = {
    twizzy: [
      { id: 'st_twizzy', name: 'MOMENTUM+', fmt: (m) => `Momentum boost +${Math.round(3 * m)}% speed and lasts longer`, apply: (p, m) => { p.bonus.momentum += 0.03 * m; } },
      { id: 'st_turnt', name: 'STAY TURNT', fmt: (m) => `TOO TURNT lasts +${(0.6 * m).toFixed(1)}s, recharges ${Math.round(5 * m)}% faster`, apply: (p, m) => { p.bonus.abilityDur += 0.6 * m; p.bonus.abilityCd *= 1 - 0.05 * m; } },
    ],
    schmunk: [
      { id: 'st_schmunk', name: 'LUCKIER', fmt: (m) => `+${Math.round(8 * m)}% luck, bigger SCHMUNK LUCK XP bursts`, apply: (p, m) => { p.bonus.luck += 0.08 * m; p.bonus.luckBurst += 0.1 * m; } },
      { id: 'st_schmunkmode', name: 'DEEPER SCHMUNK', fmt: (m) => `SCHMUNK MODE aura +${Math.round(15 * m)}% size and damage`, apply: (p, m) => { p.bonus.auraMul += 0.15 * m; } },
    ],
  };

  D.PERKS = [
    { id: 'hp', name: 'THICK SKIN', desc: '+10 starting max HP per level', max: 5, cost: [30, 50, 80, 120, 170] },
    { id: 'regen', name: 'RECOVERY', desc: '+0.15 HP/s regen per level', max: 3, cost: [40, 80, 140] },
    { id: 'might', name: 'HARD HITTER', desc: '+5% damage per level', max: 5, cost: [40, 70, 110, 160, 230] },
    { id: 'speed', name: 'LIGHT FEET', desc: '+3% move speed per level', max: 3, cost: [35, 70, 120] },
    { id: 'magnet', name: 'MAGNETIC', desc: '+8% pickup range per level', max: 3, cost: [25, 50, 90] },
    { id: 'growth', name: 'CLOUT CHASER', desc: '+4% XP gain per level', max: 5, cost: [40, 70, 110, 160, 230] },
    { id: 'luck', name: 'LUCKY CHAIN', desc: '+5% luck per level', max: 3, cost: [50, 100, 170] },
    { id: 'greed', name: 'MERCH TABLE', desc: '+8% CL0UT earned per level', max: 5, cost: [30, 60, 100, 150, 220] },
    { id: 'reroll', name: 'REROLL', desc: '+1 reroll per run per level', max: 3, cost: [60, 120, 200] },
    { id: 'banish', name: 'BANISH', desc: '+1 banish per run per level', max: 3, cost: [60, 120, 200] },
    { id: 'dash', name: 'QUICK DASH', desc: '-5% dash cooldown per level', max: 3, cost: [40, 80, 130] },
    { id: 'armor', name: 'KEVLAR LINING', desc: '+1 armor per level', max: 2, cost: [90, 180] },
    { id: 'slot', name: 'FEATURE SLOT', desc: '+1 weapon slot in every run (4 -> 5). Opens once you have cleared WAVE 15.', max: 1, cost: [300],
      req: (S) => S.isUnlocked('slots', 'slot4'), reqText: 'CLEAR WAVE 15' },
    { id: 'bside', name: 'B-SIDE', desc: '+1 TAPE slot in every run per level (2 -> 4)', max: 2, cost: [180, 360] },
  ];

  // things that can be bought / earned with CL0UT
  D.UNLOCKS = [
    { kind: 'chars', id: 'schmunk', name: 'MR.SCHMUNK', desc: 'Second playable character. Also unlocked by surviving 3:00.', cost: 120, icon: 'st_schmunk' },
    { kind: 'weapons', id: 'aux_cord', name: 'AUX CORD', desc: 'Adds the chain-lightning weapon to the level-up pool.', cost: 60, icon: 'aux_cord' },
    { kind: 'weapons', id: 'burned_cd', name: 'BURNED CD', desc: 'Adds the boomerang disc weapon to the pool.', cost: 60, icon: 'burned_cd' },
    { kind: 'weapons', id: 'cassette_mines', name: 'CASSETTE MINES', desc: 'Adds the delayed-explosion trap weapon to the pool.', cost: 80, icon: 'cassette_mines' },
    { kind: 'weapons', id: 'dead_air', name: 'DEAD AIR', desc: 'Adds the silence/debuff zone weapon to the pool.', cost: 80, icon: 'dead_air' },
    { kind: 'items', id: 'chaos_usb', name: 'CHAOS USB', desc: 'Adds CHAOS USB to the passive pool.', cost: 50, icon: 'chaos_usb' },
    { kind: 'items', id: 'vip_wristband', name: 'VIP WRISTBAND', desc: 'Adds VIP WRISTBAND to the passive pool.', cost: 50, icon: 'vip_wristband' },
    { kind: 'items', id: 'lean', name: 'LEAN', desc: 'Adds LEAN (periodic purple haze) to the passive pool.', cost: 70, icon: 'lean' },
    { kind: 'items', id: 'burner_phone', name: 'BURNER PHONE', desc: 'Adds BURNER PHONE (getting hit can send you private) to the passive pool.', cost: 60, icon: 'burner_phone' },
    { kind: 'items', id: 'group_buy', name: 'GROUP BUY', desc: 'Adds GROUP BUY (CL0UT pot that pays out consumables) to the passive pool.', cost: 60, icon: 'group_buy' },
    { kind: 'items', id: 'type_beat', name: 'TYPE BEAT', desc: 'Adds TYPE BEAT (damage for every weapon you carry) to the passive pool.', cost: 80, icon: 'type_beat' },
    { kind: 'items', id: 'producer_tag', name: 'PRODUCER TAG', desc: 'Adds PRODUCER TAG (every Nth shot hits triple) to the passive pool.', cost: 90, icon: 'producer_tag' },
    { kind: 'thumbs', id: 'thumb_glitch', name: 'GLITCH THUMB', desc: 'Adds GLITCH THUMB to the RAGE THUMB pool.', cost: 90, icon: 'thumb_glitch' },
    { kind: 'thumbs', id: 'thumb_deadair', name: 'DEAD AIR THUMB', desc: 'Adds DEAD AIR THUMB to the RAGE THUMB pool.', cost: 90, icon: 'thumb_deadair' },
    { kind: 'thumbs', id: 'thumb_leak', name: 'LEAK THUMB', desc: 'Adds LEAK THUMB to the RAGE THUMB pool.', cost: 70, icon: 'thumb_leak' },
    { kind: 'thumbs', id: 'thumb_mixtape', name: 'MIXTAPE THUMB', desc: 'Adds the legendary MIXTAPE THUMB to the pool.', cost: 160, icon: 'thumb_mixtape' },
    { kind: 'startWeapons', id: 'twizzy:glitch_glock', name: 'TWIZZY ALT: GLITCH GLOCK', desc: 'TWIZZYRICH can start with GLITCH GLOCK.', cost: 70, icon: 'glitch_glock' },
    { kind: 'startWeapons', id: 'twizzy:chrome_whip', name: 'TWIZZY ALT: CHROME WHIP', desc: 'TWIZZYRICH can start with CHROME WHIP.', cost: 70, icon: 'chrome_whip' },
    { kind: 'startWeapons', id: 'schmunk:opium_orbit', name: 'SCHMUNK ALT: OPIUM ORBIT', desc: 'MR.SCHMUNK can start with OPIUM ORBIT.', cost: 70, icon: 'opium_orbit' },
    { kind: 'startWeapons', id: 'schmunk:mosh_pit', name: 'SCHMUNK ALT: MOSH PIT', desc: 'MR.SCHMUNK can start with MOSH PIT.', cost: 70, icon: 'mosh_pit' },
  ];

  D.COSMETICS = [
    { id: 'mask_black', kind: 'mask', name: 'BLACKOUT', cost: 0, col: '#101015' },
    { id: 'mask_blood', kind: 'mask', name: 'BLOOD', cost: 40, col: '#8f1626' },
    { id: 'mask_void', kind: 'mask', name: 'VOID', cost: 40, col: '#5a2a9a' },
    { id: 'mask_acid', kind: 'mask', name: 'ACID', cost: 40, col: '#5f9a1c' },
    { id: 'mask_chrome', kind: 'mask', name: 'CHROME', cost: 90, col: '#cfd6e3' },
    { id: 'mask_leaked', kind: 'mask', name: 'LEAKED', cost: -1, col: '#ffd75a', cond: 'Defeat THE RAGE KING' },
    { id: 'chain_silver', kind: 'chain', name: 'SILVER', cost: 0, col: '#cfd6e3' },
    { id: 'chain_gold', kind: 'chain', name: 'GOLD', cost: 60, col: '#e6b422' },
    { id: 'chain_iced', kind: 'chain', name: 'ICED', cost: 120, col: '#9fe9ff' },
    { id: 'chain_none', kind: 'chain', name: 'NO CHAIN', cost: 0, col: '#2a2a33', free: true },
  ];

  D.CHALLENGES = [
    { id: 'kills100', name: 'FIRST BLOOD', desc: 'Kill 100 enemies in one run.', reward: 20 },
    { id: 'survive3', name: 'STILL BREATHING', desc: 'Survive 3:00.', reward: 25 },
    { id: 'survive5', name: 'SURVIVOR', desc: 'Survive 5:00.', reward: 30 },
    { id: 'survive10', name: 'STILL HERE', desc: 'Survive 10:00.', reward: 60 },
    { id: 'boss_plant', name: 'PLANT KILLER', desc: 'Defeat THE INDUSTRY PLANT.', reward: 50 },
    { id: 'boss_algorithm', name: 'ALGORITHM BREAKER', desc: 'Defeat THE ALGORITHM.', reward: 80 },
    { id: 'boss_king', name: 'REGICIDE', desc: 'Defeat THE RAGE KING at 25:00. (Unlocks the NO MERCY stage + LEAKED mask)', reward: 150 },
    { id: 'survive20', name: 'VETERAN', desc: 'Survive 20:00.', reward: 100 },
    { id: 'survive30', name: 'LAST ONE STANDING', desc: 'Survive until THE MAJOR LABEL shows up at 30:00.', reward: 200 },
    { id: 'boss_label', name: 'INDEPENDENT', desc: 'Defeat THE MAJOR LABEL.', reward: 400 },
    { id: 'evolve1', name: 'EVOLVED', desc: 'Evolve a weapon.', reward: 40 },
    { id: 'evolve3', name: 'FULLY EVOLVED', desc: 'Evolve 3 weapons in one run.', reward: 120 },
    { id: 'thumbs3', name: 'THUMB COLLECTOR', desc: 'Hold 3 RAGE THUMBS in one run.', reward: 80 },
    { id: 'kills2000', name: 'MASS DESTRUCTION', desc: 'Kill 2000 enemies in one run.', reward: 100 },
    { id: 'leak', name: 'LEAK HUNTER', desc: 'Catch and kill THE LEAK.', reward: 30 },
    { id: 'untouched', name: 'UNTOUCHABLE', desc: 'Survive the first 3:00 without taking damage.', reward: 50 },
    { id: 'win_twizzy', name: 'TWIZZY RICH', desc: 'Defeat THE RAGE KING with TWIZZYRICH.', reward: 100, char: 'twizzy' },
    { id: 'win_schmunk', name: 'SCHMUNKED', desc: 'Defeat THE RAGE KING with MR.SCHMUNK.', reward: 100, char: 'schmunk' },
    { id: 'level40', name: 'TOO MANY LEVELS', desc: 'Reach level 40 in one run.', reward: 60 },
    { id: 'cypher', name: 'WON THE CYPHER', desc: 'Clear a CYPHER CIRCLE elite event.', reward: 40 },
  ];

  // what the shop and the challenge list offer: nothing that belongs to a character held back for a future update
  const soonChar = (id) => !!(D.CHARACTERS[id] && D.CHARACTERS[id].soon);
  D.unlockOffered = (u) => !(u.kind === 'chars' && soonChar(u.id)) && !(u.kind === 'startWeapons' && soonChar(u.id.split(':')[0]));
  D.challengeOffered = (c) => !(c.char && soonChar(c.char));

  D.MODIFIERS = [
    { id: 'nomercy', name: 'NO MERCY', desc: 'Harder stage: enemies have +60% HP and hit 25% harder. +60% CL0UT. Unlocked by defeating THE RAGE KING.', clout: 0.6, stage: true },
  ];
})(window.RS);
