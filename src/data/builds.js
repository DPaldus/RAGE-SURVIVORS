'use strict';
// Hidden build layer. Nothing here is shown to the player as a list: builds are meant to be found, not picked.
//  - TAGS: every weapon, passive and RAGE THUMB leans toward one or two play styles.
//  - Resonance: the tags you hold add up (a passive 1 point, +1 once it is maxed; a weapon 1, an evolved weapon 2; a
//    thumb 1). At 3 / 5 / 8 points of one tag its resonance tier switches on (Player.recalc). The tier shows only as
//    an unnamed banner the moment it switches on and as a chip in the pause screen, never with the items behind it.
//  - Affinity: level-up offers lean (a little) toward items that share a tag with what you already built
//    (Progression.candidates), so a direction you start tends to keep showing up, but nothing is guaranteed.
// The developer notes with the strongest builds and the full synergy matrix are in docs/dev/ (not shipped).
(function (RS) {
  const D = RS.Data;

  D.TAGS = {
    crit: { name: 'DEADEYE', col: '#ffe14a' },
    tempo: { name: 'NO BRAKES', col: '#9cff35' },
    blast: { name: 'BLOWN OUT', col: '#ff7a1a' },
    sonic: { name: 'LOUD PACK', col: '#3ff2ff' },
    motion: { name: 'OUTSIDE', col: '#e3ece6' },
    blood: { name: 'VAMPED', col: '#ff2448' },
    chaos: { name: 'GLITCHED', col: '#ff4f6e' },
    hustle: { name: 'BAG SECURED', col: '#5dff6a' },
  };
  D.RES_AT = [3, 5, 8]; // points for tier I / II / III

  D.ITEM_TAGS = {
    // weapons (an evolution keeps its base's tags and usually gains one)
    glock: ['tempo'], gold_glock: ['tempo', 'crit'],
    rage_burst: ['tempo', 'crit'], twizzy_overdrive: ['tempo', 'crit'],
    schmunk_spin: ['chaos'], schmunk_exe: ['chaos', 'tempo'],
    bass_cannon: ['sonic', 'blast'], bass_apocalypse: ['sonic', 'blast'],
    opium_orbit: ['blood'], masked_ascension: ['blood', 'motion'],
    twizzy_tornado: ['blast'], schmunk_storm: ['blast', 'chaos'],
    glitch_glock: ['crit', 'chaos'], digital_anarchy: ['crit', 'chaos'],
    cloud_nine: ['blast', 'chaos'], cloudchase: ['blast', 'chaos'],
    shock_808: ['sonic'], blown_speaker: ['sonic', 'blast'],
    chrome_whip: ['crit'], iced_out: ['crit', 'blast'],
    mosh_pit: ['blast', 'blood'], purple_haze: ['blast', 'blood'],
    soundwave: ['sonic'], clip_distortion: ['sonic', 'crit'],
    dead_air: ['chaos'], silent_violence: ['chaos', 'crit'],
    rage_rocket: ['blast'], missile_swarm: ['blast', 'tempo'],
    burned_cd: ['tempo'], platinum_plaque: ['tempo', 'hustle'],
    aux_cord: ['chaos'], high_voltage: ['chaos', 'tempo'],
    cassette_mines: ['motion', 'blast'], fire_mixtape: ['motion', 'blast'],
    bad_vibes: ['blood'], worst_vibes: ['blood', 'blast'],
    switchblade: ['crit', 'motion'], butterfly_flip: ['crit', 'motion'],
    // passives
    energy_808: ['sonic'], double_cup: ['blood', 'hustle'], chrome_chain: ['crit'], designer_puffer: ['blood'],
    balaclava: ['motion'], sound_cloud: ['hustle'], studio_mic: ['tempo'], headphones: ['tempo', 'sonic'],
    red_laser: ['crit'], backstage_pass: ['hustle'], mixing_board: ['tempo'], deadstock: ['motion'],
    sound_engineer: ['tempo'], lost_usb: ['chaos'], glitch_chip: ['chaos'], chaos_usb: ['chaos'],
    bootleg_merch: ['hustle'], vip_wristband: ['hustle', 'crit'], lean: ['blood'],
    slowed_reverb: ['sonic', 'blood'], sped_up: ['tempo', 'motion'], the_bells: ['sonic', 'blast'],
    vamp_fangs: ['blood'], burner_phone: ['motion'], group_buy: ['hustle'], type_beat: ['tempo'],
    producer_tag: ['crit'], stage_pyro: ['blast'],
    // RAGE THUMBS
    thumb_twizzy: ['tempo'], thumb_schmunk: ['chaos'], thumb_opium: ['crit'], thumb_cloudchase: ['motion'],
    thumb_rage: ['tempo'], thumb_bass: ['sonic'], thumb_glitch: ['chaos'], thumb_mosh: ['blast'], thumb_chrome: ['hustle'],
    thumb_deadair: ['chaos'], thumb_leak: ['hustle'], thumb_mixtape: ['tempo'],
  };

  // resonance effects by tier (1-3), applied after items and synergies. Flags read elsewhere:
  // critEcho (combat.damage), sonicSlow (combat.damage), dashHit (player.update), cloutDmg (player.recalc)
  D.RESONANCE = {
    crit(s, t) { s.critChance += 0.05; if (t >= 2) { s.critMult += 0.35; s.bossDmg += 0.2; } if (t >= 3) { s.critEcho = 0.4; s.bossDmg += 0.3; } }, // the boss killer
    tempo(s, t) { s.cooldown *= 0.96; if (t >= 2) s.amount += 1; if (t >= 3) { s.cooldown *= 0.94; s.cdFloor = 0.38; } },
    blast(s, t) { s.area *= 1.08; if (t >= 2) s.might *= 1.08; if (t >= 3) { s.area *= 1.12; s.might *= 1.06; } },
    sonic(s, t) { s.sonicDmg += 0.08; if (t >= 2) s.sonicArea *= 1.1; if (t >= 3) { s.sonicDmg += 0.08; s.sonicSlow = 1; } },
    motion(s, t) { s.moveSpeed *= 1.04; s.momentumDmg += 0.08; if (t >= 2) { s.dashCd *= 0.85; s.momentumDmg += 0.15; } if (t >= 3) { s.dashHit = 1; s.momentumDmg += 0.15; s.evasion += 0.06; } },
    blood(s, t) { s.regen += 0.3; if (t >= 2) s.maxHp *= 1.1; if (t >= 3) { s.dmgTaken *= 0.9; s.vamp += 0.5; s.vampCap += 3; } },
    chaos(s, t) { s.echo += 0.04; if (t >= 2) s.luck *= 1.15; if (t >= 3) s.echoPow = 0.7; },
    hustle(s, t) { s.greed *= 1.15; if (t >= 2) s.consumableChance *= 1.4; if (t >= 3) s.cloutDmg = 1; },
  };
})(window.RS);
