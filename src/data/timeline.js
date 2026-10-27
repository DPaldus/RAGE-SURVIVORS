'use strict';
// The 30-minute run in one place. Every curve is a list of [minute, value] keyframes; the director interpolates
// linearly between them, so difficulty only ever ramps (no hidden jumps). Tune the run here, not in the code.
//
//  0-1   a trickle of AGGRO FANS + CLIP FARMERS, the first level-ups
//  1-3   more of them, the first fast / ranged / flanking types, the first elite (chest) around 1:30
//  3-5   durable types (SECURITY, STRETCHED MAN), bigger groups, the first boss at 5:00
//  5-10  faster spawns, special waves, events (cypher, supply drop, power surge), boss 2 at 10:00
// 10-15  tier-2 variants take over (more HP, speed, damage, XP), stronger elites, boss 1 returns at 15:00
// 15-20  dense crowds to push through, heavy formations (bruisers in the walls), boss 2 returns at 20:00
// 20-25  the most dangerous mixes, elites every ~45 s, THE RAGE KING at 25:00 (unlocks the NO MERCY stage)
// 25-30  the heaviest regular waves
// 30:00  regular waves stop, THE MAJOR LABEL walks in to end the run. Beat it and the run is won.
(function (RS) {
  const D = RS.Data = RS.Data || {};
  D.RUN_LENGTH = 1800;
  // The run is 30 numbered waves of a minute: WAVE n runs from minute n-1 to n, and its last WAVE_REST seconds bring
  // no new enemies (a breather before the next wave; the ones already out keep coming). Clearing WAVE 15 (15:00) once
  // opens the 4th weapon slot for good (SLOT_WAVE). 30:00 is THE MAJOR LABEL, the final fight.
  D.WAVES = 30; D.WAVE_LEN = 60; D.WAVE_REST = 3; D.SLOT_WAVE = 15;
  D.waveAt = (t) => Math.min(D.WAVES, Math.floor(t / D.WAVE_LEN) + 1);
  D.waveRest = (t) => t < D.RUN_LENGTH && t % D.WAVE_LEN >= D.WAVE_LEN - D.WAVE_REST;

  D.TIMELINE = {
    // late game: a full 6+6 build kills ~1000 / min at 20:00, so the trickle has to outgrow it to keep a real crowd
    // minutes 3-4 are ~30% lighter than before (playtest: too many enemies and overlapping attacks to dodge),
    // the curve catches up again by 6:00
    // the climb after 4:00 is spread to 8:00 (playtest: the 5:00-7:00 jump was where nearly every run ended)
    rate: [[0, 0.8], [1, 1.6], [2.5, 2.6], [3, 2.4], [4, 3.1], [5, 4.0], [6, 5.2], [8, 7.6], [10, 10.5], [15, 16], [20, 22], [25, 28], [30, 34]], // spawns / s
    maxAlive: [[0, 34], [2, 85], [3, 80], [4, 100], [5, 120], [6, 145], [8, 210], [10, 270], [15, 360], [20, 440], [25, 500], [30, 540]],
    // live attack warnings (telegraphs) the regular crowd may have at once; a full budget makes an enemy hold its attack.
    // Playtest 2026-10-26: from 8:00 the floor was covered in lanes, stomps, slams and flares with nowhere left to step
    // (the cap used to climb to 11 at 10:00 and 22 at 30:00). Now a handful at most: the crowd itself is the pressure
    attackCap: [[0, 5], [2.5, 5], [3, 4], [8, 5], [10, 5], [20, 6], [30, 7]],
    // enemy HP multiplier; from 15:00 ~15-20% above the old curve (15: 4.9, 20: 6.8, 25: 8.8, 30: 11): with the richer
    // level-up rarity and early XP, testers without any perks walked from 10:00 to 30:00 untouched
    hp: [[0, 1], [1, 1], [5, 1.75], [7, 2.4], [10, 3.3], [15, 5.6], [20, 8.0], [25, 10.6], [30, 13.2]],
    tier1: [[0, 0], [3.5, 0], [8, 0.8], [30, 0.8]], // share of tier-1 variants (x2.2 HP, faster, more XP)
    tier2: [[0, 0], [9, 0], [15, 0.45], [22, 0.75], [30, 0.85]], // share of tier-2 variants (x5 HP)
    waveGap: [[0, 36], [3, 32], [10, 28], [20, 24], [30, 20]], // seconds between formations
    eliteGap: [[0, 48], [10, 42], [20, 36], [30, 30]], // seconds between elite (chest) carriers
    eventGap: [[0, 85], [10, 80], [20, 70], [30, 60]], // seconds between arena events
    // XP gem value multiplier on top of D.LOOT.xpMul: the first minutes level you much faster (playtest: from 5:00 the
    // build was too thin), from 15:00 it is the old rate again (a flat boost let late builds snowball into easy wins)
    // 2026-10-27: from 14:00 it keeps falling, to 0.62 at 30:00 (NORMAL with all perks reached LV 98 at 30:00; bot runs
    // now end around LV 75-86). Until 14:00 unchanged: a thinner mid-run build ended STORM test runs at 11-13:00
    xp: [[0, 1.45], [6, 1.45], [10, 1.15], [14, 1], [20, 0.78], [30, 0.62]],
    // how many regular enemy types share the map at once (the director's lineup rotates every 60-80 s; it used to be
    // every type unlocked so far: 10 at 5:00, 13 from 7:30)
    types: [[0, 2], [1, 3], [2.5, 4], [12, 4], [18, 5], [30, 5]],
    waveSize: [[0, 0.75], [2.5, 0.75], [3, 0.52], [4.5, 0.55], [5.5, 0.75], [8, 1], [15, 1.25], [30, 1.5]], // formation size multiplier
  };

  // loot: every kill drops its own XP gem (100%), worth xpMul x the enemy's base XP; chests from elites, the
  // EXEC (isElite) and, rarely, from tougher regular variants. earlyChestGap = min seconds between dropped chests
  // before 5:00 (extras become coins), so a lucky start cannot snowball.
  D.LOOT = {
    xpMul: 1.55, // x D.TIMELINE.xp by minute (the early-game boost)
    eliteExecChest: 0.65, // chance an EXEC drops a chest (elites always do)
    tierChest: [0, 0.0015, 0.003], // chest chance per regular kill by tier (0 / 1 / 2)
    earlyChestGap: 35,
    // from 5:00 dropped chests (elite / EXEC / tougher variant) still need chestGap s between them; extras become coins.
    // Earned chests (cypher, supply drop, boss) are never held back
    chestGap: 18,
    execGap: 40, // min seconds between two LABEL EXECUTIVES (and only one alive at a time)
    // RED DIAMOND: ~1 in 100 regular kills (x sqrt luck) drops one, worth half of the current level's XP. Only one can
    // lie on the map at a time and a new one needs rubyGap s after the last, so the late-game kill rate (1000 / min)
    // cannot turn it into a level-up fountain. It vanishes after rubyLife s.
    ruby: 0.01, rubyGap: 60, rubyLife: 60,
  };

  // enemy roster: minute a type starts to appear and its spawn weight by minute m (a new type fades in over ~45 s)
  D.ROSTER = [
    { id: 'npc', from: 0, w: (m) => Math.max(2.5, 10 - m * 1.4) },
    { id: 'clip', from: 0.4, w: (m) => 4 + m * 0.12 },
    { id: 'smiley', from: 1.0, halluc: true, w: (m) => 1.6 },
    { id: 'fiend', from: 1.5, w: (m) => 1.8 + m * 0.1 },
    { id: 'glitch', from: 2.0, w: (m) => 2.6 + m * 0.08 },
    { id: 'stalker', from: 2.5, w: (m) => 1.5 + m * 0.05 },
    { id: 'pony', from: 2.6, halluc: true, w: (m) => 1.0 },
    { id: 'dancer', from: 2.9, halluc: true, w: (m) => 1.3 },
    // heavy: durable / hard-hitting bodies; a lineup holds at most one of them (director.js)
    { id: 'guard', from: 3.3, heavy: true, w: (m) => 1.4 + m * 0.05 },
    { id: 'stretch', from: 3.8, halluc: true, heavy: true, w: (m) => 1.2 },
    { id: 'bruiser', from: 5.5, heavy: true, w: (m) => 0.9 + m * 0.06 },
    { id: 'exec', from: 5.5, w: (m) => 0.22 + m * 0.012 },
    { id: 'bigshoe', from: 7.5, halluc: true, heavy: true, w: (m) => 0.4 + m * 0.01 },
  ];

  // formations that can roll, by the minute they join the pool
  D.WAVE_KINDS = [[0, ['stream', 'pack']], [1.5, ['stream', 'wall', 'pack']], [5, ['stream', 'wall', 'pincer', 'pack', 'ring', 'stream']]]; // rings / pincers from 5:00
  // melee types that make up the walls / pincers, by minute (heavier bodies later)
  D.WAVE_MELEE = [[0, ['npc']], [1.5, ['npc', 'fiend']], [2, ['npc', 'fiend', 'glitch']], [12, ['fiend', 'glitch', 'guard']], [16, ['fiend', 'glitch', 'guard', 'bruiser']]];

  // bosses: `pick` 0 / 1 = the two mid bosses in a random order per run, they return stronger; then the fixed ones
  D.BOSS_SCHEDULE = [
    { t: 300, pick: 0, mul: 1 },
    { t: 600, pick: 1, mul: 2.0 },
    { t: 900, pick: 0, mul: 3.2 },
    { t: 1200, pick: 1, mul: 4.5 },
    { t: 1500, id: 'king', mul: 1 }, // major boss: defeating it unlocks the NO MERCY stage for good
    { t: 1800, id: 'label', mul: 1, final: true }, // the run ender
  ];

  // THREAT: every `every` minutes the whole regular crowd steps up on top of the curves above (THREAT LV 1 at 4:00, 2 at
  // 8:00 … 7 at 28:00, called out with a banner). A step fades in over `fade` minutes, so it is felt without a wall.
  // Each table is the multiplier at THREAT LV 0-7 for enemy HP, the damage their hits and shots deal, spawns per second,
  // enemies alive at once and walk speed. The early steps are small (a run without perks already ends around 11-14:00),
  // the late ones carry the weight: bot runs with all perks on every map and stage took no damage at all from 14:00 to
  // 30:00, the crowd melted as it spawned (2026-10-27). Each map scales the steps by MAPMODES[].threat (NIGHT / STORM
  // start harder, so they climb a bit less). Bosses size their HP from your DPS and are left out.
  D.THREAT = {
    every: 4, fade: 0.5,
    hp: [1, 1.03, 1.07, 1.18, 1.5, 2.2, 3.4, 5.0],
    dmg: [1, 1.02, 1.04, 1.08, 1.2, 1.36, 1.56, 1.78],
    rate: [1, 1.02, 1.04, 1.08, 1.16, 1.26, 1.36, 1.45],
    cap: [1, 1.02, 1.04, 1.08, 1.16, 1.26, 1.36, 1.45],
    spd: [1, 1, 1, 1.01, 1.03, 1.06, 1.1, 1.15],
  };
  // the THREAT level at minute m as a fraction (2.5 = halfway into the third step)
  D.threatLevel = (m) => {
    const T = D.THREAT, n = Math.floor(Math.min(m, D.RUN_LENGTH / 60) / T.every);
    return n < 1 ? 0 : n - 1 + Math.min(1, (m - n * T.every) / T.fade);
  };
  // the THREAT multiplier for one stat (k = hp / dmg / rate / cap / spd) right now. While a boss is up the crowd that
  // keeps coming is one THREAT LV lower (bot runs died within 10 s of THE RAGE KING at 25:00 with the full step on top)
  D.threat = (G, k) => {
    const M = G.mapMode, s = M && M.threat !== undefined ? M.threat : 1, T = D.THREAT[k], top = T.length - 1;
    const L = Math.max(0, Math.min(top, D.threatLevel(G.time / 60)) - (G.bosses && G.bosses.length ? 1 : 0));
    const i = Math.floor(L), v = T[i] + (T[Math.min(top, i + 1)] - T[i]) * (L - i);
    return 1 + (v - 1) * s;
  };

  // linear interpolation of a keyframe curve at minute m
  D.curve = (keys, m) => {
    if (m <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [m1, v1] = keys[i];
      if (m <= m1) { const [m0, v0] = keys[i - 1]; return v0 + (v1 - v0) * (m - m0) / (m1 - m0); }
    }
    return keys[keys.length - 1][1];
  };
  // the newest entry of a [minute, value] step table that has started by minute m
  D.step = (keys, m) => { let v = keys[0][1]; for (const k of keys) if (m >= k[0]) v = k[1]; return v; };
})(window.RS);
