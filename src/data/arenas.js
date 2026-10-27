'use strict';
(function (RS) {
  RS.Data.ARENAS = {
    garage: {
      id: 'garage', name: 'PARKING DECK B2', short: 'B2',
      desc: 'Underground parking deck turned rave: cars in their bays, loading docks as stages, speaker stacks and live electrical panels.',
      floor: 'garage', bg: '#2b2c2e', dark: 0.05, light: '#fff1c4', accent: '#e2b934', music: 'garage',
      // Arena.layoutDeck places everything structurally; counts are caps (car = cars parked in the stalls)
      props: { car: 34, barrier: 8, barrel: 14, toxic: 6, trash: 8, crate: 6, cone: 12, speaker: 6, amp: 3, panel: 4, dumpster: 6, pallet: 3 },
      platforms: 3,
      bias: {}, hpMul: 1,
    },
  };

  // Pregame map modes (Screens 'mapsel'), the same deck under different conditions. Everything a mode changes is here:
  //   cash   x the CL0UT paid out at the end of the run (in-run coins and THE PLUG's prices stay the same)
  //   hp / dmg / rate / cap / eliteGap / bossHp   enemy HP, damage taken by the hero, spawns per second, enemies
  //          alive at once, seconds between elites, boss HP (Director, Combat, Bosses read them). Boss HP is already sized
  //          from your DPS, so its extra is small (bot test: +25 / +50% made the 5:00 boss the end of most NIGHT / STORM runs)
  //   dark / tint / ambTint / heroLight   night: how dark (GPU ambient = 1 - dark, Canvas 2D: dark layer alpha), the
  //          colour of the dark (2D layer / GPU ambient tint) and the radius of the light around the hero
  //   rain / lightning          STORM visuals (RS.Weather), visual only: lightning never hurts and makes no sound
  //   after                     locked until a run on that map reaches 30:00 (NORMAL -> NIGHT -> STORM, Save unlocked.maps)
  //   ease                      a mid-run relief (NORMAL only): fades in between minute `from` and `to`, then holds. hp /
  //          rate / cap / dmg / xp multiply enemy HP, spawns, enemies alive, damage the hero takes and XP from kills
  //          (RS.Data.mapEase). NORMAL from 5:00 is ~30% easier: ~30% less enemy HP coming at you per second, hits
  //          18% softer, 30% more XP a kill (~10% more XP a minute from the thinner crowd). Bot runs, 5:00-11:00:
  //          damage taken -36%, 6 of 6 alive at 12:00 (was 3 of 6)
  //   push                      a late-run step back up (NORMAL only), same fade as `ease` and multiplied on top of it.
  //          NORMAL from 8:00 to 10:00: +15% spawns and +10% enemies alive (2026-10-26, playtest: the deck felt empty
  //          from 8:00). Attack warnings keep their own cap (TIMELINE.attackCap), so the extra bodies add crowd, not
  //          more floor to dodge, and HP / damage stay as they were
  //   threat                    x the size of every THREAT LV step (data/timeline.js D.THREAT, one every 4:00). NIGHT and
  //          STORM start with a tougher crowd (STORM bot runs died between 11:00 and 18:00 with bigger steps), so their
  //          steps are 25% / 50% smaller and the three maps keep their gaps instead of drifting apart late. NORMAL's
  //          `ease` XP bonus went 1.3 -> 1.15 (2026-10-27: LV 98 at 30:00)
  //   xp                        x the XP every kill drops (NIGHT 0.96, STORM 0.94): their denser crowds bring more kills,
  //          and bot runs there reached LV 90-98 at 30:00 like NORMAL; the reward for them is the cash multiplier
  //   itemPower                 x every passive item's level (Player.recalc; MR.SCHMUNK's ability stacks on top)
  //   labelFight / labelSpd     THE MAJOR LABEL's fight length (s of your damage, 150 elsewhere) and its top speed as a
  //          share of the cap elsewhere. NORMAL (2026-10-26): bot runs with half or all perks walked through 30:00
  //          untouched and then lost to THE LABEL within 10 s, a run without perks fell to THE RAGE KING at 25:00
  RS.Data.MAPMODES = {
    normal: {
      id: 'normal', name: 'NORMAL', cash: 1, diff: 1, col: '#9cff35', tagline: 'LIGHTS ON',
      desc: 'Parking Deck B2 as you know it. Baseline crowd, baseline pay. Your items hit 20% harder here.',
      hp: 1, dmg: 1, rate: 1, cap: 1, eliteGap: 1, bossHp: 0.8, dark: 0, itemPower: 1.2, labelFight: 80, labelSpd: 0.9,
      ease: { from: 4, to: 5, hp: 0.92, rate: 0.85, cap: 0.85, dmg: 0.82, xp: 1.15 }, // hp 0.82 -> 0.92 (2026-10-27: one-hit kills at 5:00) threat: 1,
      push: { from: 8, to: 10, rate: 1.15, cap: 1.1 },
    },
    night: {
      id: 'night', name: 'NIGHT', cash: 2, diff: 2, col: '#7fb2ff', tagline: 'LIGHTS OUT',
      desc: 'Same deck after closing. Only the aisle lights and your own glow. Tougher crowd, double pay.',
      hp: 1.3, dmg: 1.15, rate: 1.12, cap: 1.1, eliteGap: 0.92, bossHp: 1.1,
      dark: 0.62, tint: '6,10,28', ambTint: [0.8, 0.92, 1.3], heroLight: 400, after: 'normal', threat: 0.75, xp: 0.96,
    },
    storm: {
      id: 'storm', name: 'STORM', cash: 3, diff: 3, col: '#c9a8ff', tagline: 'RAIN ON THE RAMP',
      desc: 'Night, rain blowing in, lightning over the deck. The hardest crowd, triple pay.',
      hp: 1.6, dmg: 1.3, rate: 1.25, cap: 1.2, eliteGap: 0.85, bossHp: 1.2,
      dark: 0.66, tint: '5,8,24', ambTint: [0.76, 0.88, 1.32], heroLight: 380, rain: true, lightning: true, after: 'night', threat: 0.5, xp: 0.94,
    },
  };
  // the map mode's mid-run relief and late push for one multiplier (k = hp / rate / cap / dmg / xp), 1 where neither applies
  const ramp = (E, k, m) => (!E || E[k] === undefined ? 1 : 1 + (E[k] - 1) * RS.U.clamp((m - E.from) / (E.to - E.from), 0, 1));
  RS.Data.mapEase = (G, k) => {
    const M = G.mapMode, m = G.time / 60;
    return M ? ramp(M.ease, k, m) * ramp(M.push, k, m) : 1;
  };
  // can this map be picked? (a map without `after` is always open)
  RS.Data.mapOpen = (id) => {
    const M = RS.Data.MAPMODES[id];
    return !!M && (!M.after || RS.Save.isUnlocked('maps', id));
  };
})(window.RS);
