'use strict';
(function (RS) {
  RS.Data = RS.Data || {};

  RS.Data.CHARACTERS = {
    twizzy: {
      id: 'twizzy',
      name: 'TWIZZYRICH',
      theme: 'AGGRESSIVE / FAST / FLASHY',
      color: '#ff2448',
      bio: 'Black balaclava, puffer two sizes too big, chain catching every strobe. Never stops moving, never stops shooting.',
      stats: { hp: 115, armor: 0, moveSpeed: 1.06, might: 1.0, cooldown: 0.95, luck: 1.0, regen: 0.1, knockResist: 0 },
      bars: { HEALTH: 0.5, SPEED: 0.92, 'ATK SPEED': 0.85, DEFENSE: 0.35, LUCK: 0.4 },
      weapon: 'glock',
      altWeapons: ['glitch_glock', 'chrome_whip'],
      passive: {
        name: 'TWIZZY MOMENTUM',
        desc: 'Every kill gives a short speed boost. Keep the kill streak alive and the boost lasts longer (up to 3s, +7% speed).',
      },
      active: {
        name: 'TOO TURNT', cd: 30, dur: 6,
        desc: '6s: +25% attack speed, +12% move speed, immune to knockback. Kills have a 35% chance to drop extra XP.',
      },
      unlock: { cost: 0 },
    },
    schmunk: {
      id: 'schmunk',
      name: 'MR.SCHMUNK',
      theme: 'STRANGE / TANKY / CHAOTIC',
      color: '#9cff35',
      bio: 'Nobody has seen what is under the stitched grin. Hunched, lucky, unbothered. His items hit different.',
      stats: { hp: 155, armor: 1, moveSpeed: 1.0, might: 1.0, cooldown: 1.0, luck: 1.3, regen: 0.25, knockResist: 0.25 },
      bars: { HEALTH: 0.85, SPEED: 0.6, 'ATK SPEED': 0.55, DEFENSE: 0.75, LUCK: 0.9 },
      weapon: 'glock',
      altWeapons: ['opium_orbit', 'mosh_pit'],
      passive: {
        name: 'SCHMUNK LUCK',
        desc: '+30% luck: rare upgrades and items show up more often. Rare-or-better picks burst out bonus XP.',
      },
      active: {
        name: 'SCHMUNK MODE', cd: 34, dur: 8,
        desc: '8s: all passive item effects +40% and a chaos aura shreds nearby enemies. The aura grows with every evolved weapon and RAGE THUMB.',
      },
      unlock: { cost: 120 },
      // held back for a future update: the select screen shows a locked COMING SOON slot (no name, art or model), the
      // shop does not sell him or his start weapons and an old save that owns him plays TWIZZYRICH (RS.Data.charPlayable)
      soon: true,
    },
  };
  // can this character be picked and played? (exists, not held back, unlocked in the save)
  RS.Data.charPlayable = (id) => {
    const C = RS.Data.CHARACTERS[id];
    return !!C && !C.soon && RS.Save.isUnlocked('chars', id);
  };
})(window.RS);
