'use strict';
// 16x16 procedural icons for weapons, items, thumbs and UI. Cached as canvas + dataURL.
(function (RS) {
  const S = RS.Sprites, U = RS.U;
  const px = (x, X, Y, w, h, c) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };
  const circ = (x, X, Y, r, c) => { x.fillStyle = c; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill(); };
  const poly = (x, pts, c) => { x.fillStyle = c; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
  const line = (x, pts, c, w) => { x.strokeStyle = c; x.lineWidth = w || 1.5; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); };

  const SHAPES = {
    bolt(x, a, b) { poly(x, [9, 0, 3, 9, 7, 9, 5, 16, 13, 6, 9, 6, 11, 0], a); px(x, 8, 2, 1, 3, b); },
    burst(x, a, b) { for (let i = 0; i < 3; i++) { poly(x, [1 + i * 2, 12 - i * 4, 11 + i * 2, 7 - i * 4, 12 + i * 2, 9 - i * 4, 2 + i * 2, 14 - i * 4], a); } circ(x, 13, 3, 2, b); },
    spin(x, a, b) { circ(x, 8, 8, 7, a); circ(x, 8, 8, 5, '#14101c'); px(x, 5, 6, 2, 2, b); px(x, 9, 6, 2, 2, b); line(x, [4, 10, 6, 12, 8, 10, 10, 12, 12, 10], b, 1); },
    speaker(x, a, b) { px(x, 2, 1, 12, 14, '#141418'); circ(x, 8, 9, 5, a); circ(x, 8, 9, 3, '#050507'); circ(x, 8, 9, 1.5, b); circ(x, 8, 3.5, 1.5, a); },
    star(x, a, b) { poly(x, [8, 0, 10, 6, 16, 8, 10, 10, 8, 16, 6, 10, 0, 8, 6, 6], a); px(x, 7, 7, 2, 2, b); },
    cross(x, a, b) { px(x, 6, 0, 4, 16, a); px(x, 1, 4, 14, 4, a); px(x, 7, 1, 2, 14, b); px(x, 2, 5, 12, 2, b); },
    tornado(x, a, b) { for (let i = 0; i < 5; i++) px(x, 1 + i, 2 + i * 3, 14 - i * 2.4, 2, i % 2 ? a : b); },
    gun(x, a, b) { px(x, 1, 4, 13, 4, a); px(x, 2, 8, 4, 7, a); px(x, 6, 8, 3, 2, a); px(x, 13, 4, 2, 2, b); px(x, 3, 5, 9, 1, b); for (let i = 0; i < 3; i++) px(x, 2 + i * 4, 2, 2, 1, '#e3ece6'); },
    cloud(x, a, b) { circ(x, 5, 8, 4, a); circ(x, 10, 6, 5, a); circ(x, 12, 9, 3.5, a); px(x, 3, 9, 11, 3, a); poly(x, [8, 11, 5, 16, 8, 14, 7, 16, 11, 12], b); },
    wave(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; for (let r = 3; r <= 9; r += 3) { x.beginPath(); x.arc(8, 8, r, 0, Math.PI * 2); x.stroke(); } circ(x, 8, 8, 2, b); },
    chain(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(4 + i * 4, 4 + i * 4, 3, 2, Math.PI / 4, 0, Math.PI * 2); x.stroke(); } px(x, 12, 12, 3, 3, b); },
    whip(x, a, b) { line(x, [2, 14, 5, 6, 10, 2, 15, 3], a, 2); px(x, 1, 12, 3, 4, b); },
    pit(x, a, b) { circ(x, 8, 8, 7, a); circ(x, 8, 8, 5, '#120a12'); for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2; px(x, 8 + Math.cos(t) * 3 - 1, 8 + Math.sin(t) * 3 - 1, 2, 2, b); } },
    cone(x, a, b) { poly(x, [1, 8, 15, 1, 15, 15], a); poly(x, [4, 8, 13, 4, 13, 12], b); px(x, 0, 6, 3, 4, '#141418'); },
    mute(x, a, b) { px(x, 2, 5, 4, 6, a); poly(x, [6, 5, 10, 1, 10, 15, 6, 11], a); line(x, [11, 5, 15, 11], b, 2); line(x, [15, 5, 11, 11], b, 2); },
    rocket(x, a, b) { poly(x, [14, 2, 9, 3, 3, 9, 7, 13, 13, 7], a); poly(x, [3, 9, 1, 15, 7, 13], b); circ(x, 10, 6, 1.5, '#9fe9ff'); },
    cd(x, a, b) { circ(x, 8, 8, 7, a); circ(x, 8, 8, 2.5, '#0b0b0e'); x.strokeStyle = b; x.lineWidth = 1; x.beginPath(); x.arc(8, 8, 5, -1, 0.4); x.stroke(); },
    plug(x, a, b) { px(x, 4, 5, 8, 7, a); px(x, 5, 1, 2, 4, b); px(x, 9, 1, 2, 4, b); px(x, 7, 12, 2, 4, '#141418'); line(x, [1, 8, 3, 6, 1, 4], '#ffe14a', 1); },
    cassette(x, a, b) { px(x, 1, 3, 14, 10, a); px(x, 3, 5, 10, 4, '#141418'); circ(x, 5.5, 7, 1.5, b); circ(x, 10.5, 7, 1.5, b); px(x, 4, 10, 8, 3, U.mixHex(a, '#000000', 0.3)); },
    cup(x, a, b) { poly(x, [3, 2, 13, 2, 11, 15, 5, 15], a); poly(x, [4, 5, 12, 5, 11, 12, 5, 12], b); px(x, 3, 2, 10, 1, '#ffffff'); },
    cups(x, a, b) { poly(x, [1, 3, 9, 3, 8, 15, 2, 15], a); poly(x, [7, 1, 15, 1, 14, 13, 8, 13], U.mixHex(a, '#ffffff', 0.2)); poly(x, [8.5, 4, 14, 4, 13.5, 9, 8.8, 9], b); },
    puffer(x, a, b) { px(x, 2, 3, 12, 12, a); px(x, 0, 5, 3, 8, a); px(x, 13, 5, 3, 8, a); for (let i = 0; i < 3; i++) px(x, 2, 6 + i * 3, 12, 1, b); px(x, 5, 1, 6, 3, a); },
    mask(x, a, b) { circ(x, 8, 7, 6.5, a); px(x, 2, 7, 12, 8, a); px(x, 4, 6, 8, 3, '#d8a890'); px(x, 5, 7, 2, 1, b); px(x, 9, 7, 2, 1, b); },
    headphones(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; x.beginPath(); x.arc(8, 9, 6, Math.PI, 0); x.stroke(); px(x, 0, 8, 4, 7, b); px(x, 12, 8, 4, 7, b); px(x, 1, 9, 2, 5, a); px(x, 13, 9, 2, 5, a); },
    mic(x, a, b) { circ(x, 8, 5, 4.5, a); px(x, 7, 9, 2, 7, b); px(x, 4, 14, 8, 2, b); for (let i = 0; i < 3; i++) px(x, 5, 3 + i * 2, 6, 1, '#4a5060'); },
    laser(x, a, b) { px(x, 1, 6, 7, 4, '#2a2a33'); px(x, 7, 7, 9, 2, a); circ(x, 15, 8, 1.5, b); px(x, 2, 7, 2, 1, b); },
    pass(x, a, b) { px(x, 3, 1, 10, 14, a); px(x, 6, 0, 4, 2, '#141418'); px(x, 5, 4, 6, 4, b); px(x, 5, 10, 6, 1, '#141418'); px(x, 5, 12, 4, 1, '#141418'); },
    mixer(x, a, b) { px(x, 1, 2, 14, 12, a); for (let i = 0; i < 4; i++) { px(x, 3 + i * 3, 4, 1, 8, '#050507'); px(x, 2 + i * 3, 5 + (i * 3) % 6, 3, 2, b); } },
    sneaker(x, a, b) { poly(x, [1, 8, 6, 5, 9, 9, 15, 10, 15, 13, 1, 13], a); px(x, 1, 13, 15, 2, '#f0f0f0'); line(x, [3, 10, 12, 11], b, 1.5); },
    knob(x, a, b) { circ(x, 8, 8, 6.5, a); circ(x, 8, 8, 4, '#202028'); line(x, [8, 8, 11, 4], b, 2); for (let i = 0; i < 5; i++) { const t = Math.PI * 0.8 + i * 0.35; px(x, 8 + Math.cos(t) * 7.5, 8 + Math.sin(t) * 7.5, 1, 1, b); } },
    usb(x, a, b) { px(x, 4, 5, 8, 11, a); px(x, 5, 0, 6, 6, '#cfd6e3'); px(x, 6, 2, 1, 1, '#141418'); px(x, 9, 2, 1, 1, '#141418'); px(x, 6, 9, 4, 3, b); },
    chip(x, a, b) { px(x, 3, 3, 10, 10, a); for (let i = 0; i < 4; i++) { px(x, 1, 4 + i * 2.4, 2, 1, b); px(x, 13, 4 + i * 2.4, 2, 1, b); px(x, 4 + i * 2.4, 1, 1, 2, b); px(x, 4 + i * 2.4, 13, 1, 2, b); } px(x, 5, 5, 6, 6, '#141418'); px(x, 6, 7, 4, 1, '#ff4f6e'); },
    merch(x, a, b) { poly(x, [4, 1, 12, 1, 16, 5, 13, 7, 12, 6, 12, 15, 4, 15, 4, 6, 3, 7, 0, 5], a); px(x, 6, 5, 4, 4, b); },
    wrist(x, a, b) { x.strokeStyle = a; x.lineWidth = 3; x.beginPath(); x.ellipse(8, 8, 6, 4, 0, 0, Math.PI * 2); x.stroke(); px(x, 6, 2, 4, 3, b); },
    pill(x, a, b) { x.save(); x.translate(8, 8); x.rotate(-0.7); px(x, -6, -3, 6, 6, a); px(x, 0, -3, 6, 6, b); x.restore(); },
    juice(x, a, b) { px(x, 4, 4, 8, 12, a); px(x, 6, 1, 4, 3, '#cfd6e3'); px(x, 5, 8, 6, 4, b); px(x, 5, 5, 1, 9, '#ffffff'); },
    food(x, a, b) { poly(x, [2, 5, 14, 5, 12, 15, 4, 15], a); px(x, 3, 3, 3, 3, b); px(x, 7, 2, 3, 3, b); px(x, 10, 3, 3, 3, b); px(x, 4, 8, 8, 2, '#ffffff'); },
    wifi(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; for (let r = 4; r <= 12; r += 4) { x.beginPath(); x.arc(8, 14, r, Math.PI * 1.2, Math.PI * 1.8); x.stroke(); } circ(x, 8, 14, 1.8, b); },
    horn(x, a, b) { poly(x, [1, 6, 6, 6, 15, 1, 15, 15, 6, 10, 1, 10], a); px(x, 2, 7, 4, 2, b); },
    cash(x, a, b) { px(x, 1, 4, 14, 9, a); px(x, 3, 3, 14, 9, U.mixHex(a, '#ffffff', 0.15)); circ(x, 10, 7.5, 2.5, b); px(x, 4, 5, 2, 1, b); },
    camera(x, a, b) { px(x, 1, 4, 14, 10, a); px(x, 3, 2, 4, 3, a); circ(x, 9, 9, 3.5, '#141418'); circ(x, 9, 9, 2, b); px(x, 12, 5, 2, 2, '#ffffff'); },
    thumb(x, a, b) { px(x, 3, 4, 10, 12, a); px(x, 3, 4, 10, 2, U.mixHex(a, '#ffffff', 0.3)); px(x, 5, 0, 6, 5, '#cfd6e3'); px(x, 6, 1, 1, 2, '#141418'); px(x, 9, 1, 1, 2, '#141418'); px(x, 5, 8, 6, 5, b); px(x, 7, 9, 2, 3, '#ffffff'); },
    heart(x, a, b) { circ(x, 5, 6, 3.5, a); circ(x, 11, 6, 3.5, a); poly(x, [1.6, 7, 14.4, 7, 8, 15], a); px(x, 4, 4, 2, 1, b); },
    skull(x, a, b) { circ(x, 8, 7, 6, a); px(x, 4, 11, 8, 4, a); px(x, 4, 6, 3, 3, '#050507'); px(x, 9, 6, 3, 3, '#050507'); px(x, 6, 12, 1, 3, '#050507'); px(x, 9, 12, 1, 3, '#050507'); px(x, 5, 7, 1, 1, b); px(x, 10, 7, 1, 1, b); },
    chest(x, a, b) { px(x, 1, 6, 14, 9, a); px(x, 1, 3, 14, 4, U.mixHex(a, '#ffffff', 0.2)); px(x, 1, 7, 14, 1, '#141418'); px(x, 6, 6, 4, 4, b); },
    gem(x, a, b) { poly(x, [8, 1, 14, 6, 8, 15, 2, 6], a); poly(x, [8, 1, 11, 6, 8, 15], U.mixHex(a, '#ffffff', 0.35)); px(x, 6, 4, 2, 2, b); },
    coin(x, a, b) { circ(x, 8, 8, 6.5, a); circ(x, 8, 8, 4.5, U.mixHex(a, '#000000', 0.3)); px(x, 7, 5, 2, 6, b); },
    clock(x, a, b) { circ(x, 8, 8, 7, a); circ(x, 8, 8, 5.5, '#141418'); line(x, [8, 8, 8, 4], b, 1.5); line(x, [8, 8, 11, 9], b, 1.5); },
    lock(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; x.beginPath(); x.arc(8, 6, 4, Math.PI, 0); x.stroke(); px(x, 3, 6, 10, 9, a); px(x, 7, 9, 2, 3, b); },
    dice(x, a, b) { px(x, 2, 2, 12, 12, a); [[5, 5], [11, 5], [8, 8], [5, 11], [11, 11]].forEach(([X, Y]) => px(x, X - 1, Y - 1, 2, 2, b)); },
    fist(x, a, b) { px(x, 3, 4, 10, 9, a); for (let i = 0; i < 4; i++) px(x, 3 + i * 2.5, 3, 2, 3, a); px(x, 3, 6, 10, 1, b); px(x, 4, 13, 8, 3, b); },
    grill(x, a, b) { px(x, 1, 5, 14, 6, '#5a0a14'); for (let i = 0; i < 6; i++) px(x, 2 + i * 2.2, 6, 2, 4, i % 2 ? a : b); },
    eye(x, a, b) { x.fillStyle = a; x.beginPath(); x.ellipse(8, 8, 7.5, 4.5, 0, 0, Math.PI * 2); x.fill(); circ(x, 8, 8, 3, b); circ(x, 8, 8, 1.3, '#050507'); },
    crown(x, a, b) { poly(x, [1, 13, 1, 4, 5, 8, 8, 2, 11, 8, 15, 4, 15, 13], a); px(x, 7, 9, 2, 2, b); px(x, 1, 13, 14, 2, U.mixHex(a, '#000000', 0.3)); },
    knife(x, a, b) { poly(x, [15, 1, 6, 8, 8, 10], a); poly(x, [15, 1, 8, 10, 9, 8], U.mixHex(a, '#ffffff', 0.45)); px(x, 6, 8, 2, 2, '#141418'); line(x, [7, 9, 1, 15], b, 3); px(x, 2, 12, 2, 1, '#e3ece6'); },
    aura(x, a, b) { x.strokeStyle = a; x.lineWidth = 2; x.beginPath(); x.arc(8, 8, 6.5, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 0.35; circ(x, 8, 8, 6, a); x.globalAlpha = 1; for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2 + 0.4; px(x, 8 + Math.cos(t) * 3.5 - 1, 8 + Math.sin(t) * 3.5 - 1, 2, 2, b); } circ(x, 8, 8, 1.6, '#ffffff'); },
    plant(x, a, b) { poly(x, [4, 10, 12, 10, 11, 16, 5, 16], '#a0522d'); circ(x, 8, 6, 4, a); circ(x, 4, 5, 2.5, a); circ(x, 12, 5, 2.5, a); px(x, 6, 5, 1, 1, b); px(x, 9, 5, 1, 1, b); },
  };

  // id -> [shape, colorA, colorB, evolved?]
  const MAP = {
    // weapons
    glock: ['gun', '#3a3d39', '#ffd23f'], gold_glock: ['gun', '#ffd23f', '#ffffff', 1], rage_burst: ['burst', '#ff2448', '#ffd0d6'], schmunk_spin: ['spin', '#c8ff7d', '#9cff35'], bass_cannon: ['speaker', '#cfd6e3', '#ff2448'],
    opium_orbit: ['cross', '#9aa3b2', '#ffffff'], twizzy_tornado: ['tornado', '#ff3b55', '#cfd6e3'], glitch_glock: ['gun', '#2a2a33', '#9cff35'],
    cloud_nine: ['cloud', '#b39ddb', '#ffe14a'], shock_808: ['wave', '#ff2448', '#ffffff'], chrome_whip: ['whip', '#cfd6e3', '#3a3a44'],
    mosh_pit: ['pit', '#ff2448', '#ffffff'], soundwave: ['cone', '#e3ece6', '#e0fbff'], dead_air: ['mute', '#9aa3b2', '#ff2448'],
    rage_rocket: ['rocket', '#cfd6e3', '#ff7a1a'], burned_cd: ['cd', '#d8dee8', '#ff4f6e'], aux_cord: ['plug', '#2a2a33', '#cfd6e3'],
    cassette_mines: ['cassette', '#3a3444', '#ff2448'],
    bad_vibes: ['aura', '#ff2448', '#ffd0d8'], switchblade: ['knife', '#cfd6e3', '#3a3a44'],
    // evolutions
    twizzy_overdrive: ['burst', '#ffe14a', '#ff2448', 1], schmunk_exe: ['spin', '#ff4f6e', '#9cff35', 1], bass_apocalypse: ['speaker', '#ff2448', '#ffe14a', 1],
    masked_ascension: ['star', '#e6ebf3', '#9cff35', 1], schmunk_storm: ['tornado', '#9cff35', '#c8ff7d', 1], digital_anarchy: ['gun', '#ff4f6e', '#e3ece6', 1],
    cloudchase: ['cloud', '#d6ffb0', '#e3ece6', 1], blown_speaker: ['wave', '#ffe14a', '#ff2448', 1], iced_out: ['whip', '#9fe9ff', '#ffffff', 1],
    purple_haze: ['pit', '#9b4dff', '#e0c4ff', 1], clip_distortion: ['cone', '#ff2448', '#ffe14a', 1], silent_violence: ['mute', '#141418', '#ff2448', 1],
    missile_swarm: ['rocket', '#ff2448', '#ffe14a', 1], platinum_plaque: ['cd', '#ffffff', '#ffe14a', 1], high_voltage: ['plug', '#ffe14a', '#e3ece6', 1],
    fire_mixtape: ['cassette', '#ff7a1a', '#ffe14a', 1],
    worst_vibes: ['aura', '#9cff35', '#e6ffc8', 1], butterfly_flip: ['knife', '#ff2448', '#ffe14a', 1],
    // passives
    energy_808: ['speaker', '#ff2448', '#ffe14a'], double_cup: ['cups', '#f0f0f0', '#9b4dff'], chrome_chain: ['chain', '#cfd6e3', '#ff2448'],
    designer_puffer: ['puffer', '#1c1c24', '#3a3a48'], balaclava: ['mask', '#141418', '#ffffff'], sound_cloud: ['cloud', '#ff7a1a', '#ffffff'],
    studio_mic: ['mic', '#cfd6e3', '#3a3a44'], headphones: ['headphones', '#ff2448', '#141418'], red_laser: ['laser', '#ff2448', '#ffffff'],
    backstage_pass: ['pass', '#e6b422', '#ff2448'], mixing_board: ['mixer', '#2a2a33', '#e3ece6'], deadstock: ['sneaker', '#e8e8f0', '#ff2448'],
    sound_engineer: ['knob', '#9aa3b2', '#9cff35'], lost_usb: ['usb', '#3a3444', '#ffe14a'], glitch_chip: ['chip', '#2a8a3a', '#cfd6e3'],
    chaos_usb: ['usb', '#9cff35', '#ff4f6e'], bootleg_merch: ['merch', '#141418', '#ff2448'], vip_wristband: ['wrist', '#e6b422', '#ffffff'],
    lean: ['cup', '#9b4dff', '#e0c4ff'],
    // consumables
    perc: ['pill', '#e3ece6', '#ffffff'], rage_juice: ['juice', '#ff2448', '#ffe14a'], chicken_box: ['food', '#ff7a1a', '#e6b422'],
    free_wifi: ['wifi', '#e3ece6', '#ffffff'], airhorn: ['horn', '#ffe14a', '#ff2448'], clout_stack: ['cash', '#5a9e1c', '#c8ff7d'],
    flash_cam: ['camera', '#2a2a33', '#e3ece6'],
    // thumbs
    thumb_twizzy: ['thumb', '#ff2448', '#141418'], thumb_schmunk: ['thumb', '#9cff35', '#9cff35'], thumb_opium: ['thumb', '#141418', '#cfd6e3'],
    thumb_cloudchase: ['thumb', '#b39ddb', '#ffffff'], thumb_rage: ['thumb', '#ff3b55', '#ffe14a'], thumb_bass: ['thumb', '#ff7a1a', '#141418'],
    thumb_glitch: ['thumb', '#ff4f6e', '#e3ece6'], thumb_mosh: ['thumb', '#7a0a16', '#ff2448'], thumb_chrome: ['thumb', '#cfd6e3', '#3a3a44'],
    thumb_deadair: ['thumb', '#3a3a44', '#ff2448'], thumb_leak: ['thumb', '#ffcf3f', '#141418'], thumb_mixtape: ['thumb', '#e3ece6', '#ff2448'],
    // stat cards / ui
    st_hp: ['heart', '#ff2448', '#ffd0d6'], st_dmg: ['fist', '#cfd6e3', '#ff2448'], st_cd: ['clock', '#9aa3b2', '#9cff35'],
    st_speed: ['sneaker', '#9cff35', '#141418'], st_crit: ['laser', '#ffe14a', '#ffffff'], st_critdmg: ['skull', '#ffe14a', '#ff2448'],
    st_area: ['wave', '#9cff35', '#ffffff'], st_magnet: ['wifi', '#9cff35', '#ffffff'], st_luck: ['dice', '#f0f0f0', '#ff2448'],
    st_dash: ['sneaker', '#e3ece6', '#ffffff'], st_duration: ['cup', '#e3ece6', '#ffffff'], st_armor: ['puffer', '#5a6070', '#cfd6e3'],
    st_regen: ['heart', '#9cff35', '#ffffff'], st_xp: ['gem', '#9cff35', '#ffffff'], st_amount: ['mixer', '#ff2448', '#ffe14a'],
    st_revive: ['skull', '#cfd6e3', '#9cff35'], st_autotune: ['mic', '#ffe14a', '#ff2448'], st_grillz: ['grill', '#ffe14a', '#cfd6e3'],
    st_feature: ['mic', '#9cff35', '#ffffff'], st_viral: ['heart', '#ff4f6e', '#ffffff'], st_twizzy: ['bolt', '#ff2448', '#ffffff'],
    st_turnt: ['fist', '#ff2448', '#ffe14a'], st_schmunk: ['dice', '#9cff35', '#9cff35'], st_schmunkmode: ['spin', '#9cff35', '#c8ff7d'],
    chest_boss: ['chest', '#ff2448', '#ffe14a'], chest_legendary: ['chest', '#9cff35', '#ffe14a'], chest_supply: ['chest', '#e3ece6', '#3a3d39'],
    heart: ['heart', '#ff2448', '#ffd0d6'], skull: ['skull', '#e6ebf3', '#ff2448'], chest: ['chest', '#9aa3b2', '#ffe14a'],
    gem: ['gem', '#9cff35', '#ffffff'], coin: ['coin', '#9cff35', '#e8ffd0'], clock: ['clock', '#cfd6e3', '#ff2448'],
    lock: ['lock', '#5a6070', '#141418'], crown: ['crown', '#e6ebf3', '#ff2448'], eye: ['eye', '#e6ebf3', '#9cff35'], plant: ['plant', '#3fbf4f', '#f8ff9a'],
    reroll: ['dice', '#cfd6e3', '#141418'], skip: ['clock', '#5a6070', '#cfd6e3'],
  };

  // Cropped pixel-art sprites (src/gfx/atlas.js). Sliced into canvases once at boot; ids missing there fall back to SHAPES.
  const Atlas = {
    imgs: {}, ready: null,
    load() {
      if (this.ready) return this.ready;
      // RS.ATLAS: the painted sheet; RS.ATLAS_X / RS.ATLAS_S: icons for the items added later (atlas_x.js, atlas_s.js: stash)
      const one = (D) => new Promise((res) => {
        if (!D) return res();
        const im = new Image();
        im.onload = () => {
          for (const [id, [x, y, w, h]] of Object.entries(D.rects)) {
            const c = S.cv(w, h); c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h);
            c._src = [im, x, y]; // where it sits in the decoded sheet: RS.PropArt reads pixels there, not off the GPU
            this.imgs[id] = c;
          }
          res();
        };
        im.onerror = () => res();
        im.src = D.png;
      });
      this.ready = Promise.all([one(RS.ATLAS), one(RS.ATLAS_X), one(RS.ATLAS_S)]);
      return this.ready;
    },
    get(id) { return this.imgs[id] || null; },
  };
  RS.Atlas = Atlas;

  // square, centred icon from an atlas sprite; evolved ones keep the yellow/red corner ticks
  function fromAtlas(a, evo) {
    const n = Math.max(a.width, a.height) + 2;
    const c = S.cv(n, n), x = c.getContext('2d');
    x.drawImage(a, Math.floor((n - a.width) / 2), Math.floor((n - a.height) / 2));
    if (evo) {
      const t = Math.max(4, Math.round(n * 0.22));
      x.fillStyle = '#ffe14a'; x.fillRect(n - t, 0, t, 2); x.fillRect(n - 2, 0, 2, t);
      x.fillStyle = '#ff2448'; x.fillRect(0, n - 2, t, 2); x.fillRect(0, n - t, 2, t);
    }
    return c;
  }

  const cache = new Map(), urlCache = new Map();
  function build(id) {
    const a = Atlas.get(id);
    if (a) return fromAtlas(a, MAP[id] ? MAP[id][3] : 0);
    const def = MAP[id] || ['gem', '#ff4f6e', '#ffffff'];
    const c = S.cv(16, 16), x = c.getContext('2d');
    (SHAPES[def[0]] || SHAPES.gem)(x, def[1], def[2]);
    S.crisp(c);
    let out = S.outline(c, '#050507');
    if (def[3]) { // evolved: red glow ring corner tick
      const o = out.getContext('2d');
      o.fillStyle = '#ffe14a'; o.fillRect(14, 0, 4, 1); o.fillRect(17, 0, 1, 4);
      o.fillStyle = '#ff2448'; o.fillRect(0, 17, 4, 1); o.fillRect(0, 14, 1, 4);
    }
    return out;
  }

  const Icons = {
    get(id) { let c = cache.get(id); if (!c) { c = build(id); cache.set(id, c); } return c; },
    url(id) { let u = urlCache.get(id); if (!u) { u = this.get(id).toDataURL(); urlCache.set(id, u); } return u; },
    has(id) { return !!(MAP[id] || Atlas.get(id)); },
  };

  RS.Icons = Icons;
})(window.RS);
