'use strict';
(function (RS) {
  RS.Data.ENEMIES = {
    // ---- the real underground: fans, crews, industry, security
    npc: { id: 'npc', name: 'AGGRO FAN', desc: 'Masked kid from the front row. Shoves toward you and lunges when close. There are always more.',
      hp: 11, spd: 86, dmg: 8, r: 13, xp: 1, mass: 1, ai: 'chase', scale: 2.5, cols: ['#5d616d', '#8e8a84', '#2c3a55'] },
    clip: { id: 'clip', name: 'CLIP FARMER', desc: 'Moves in quick bursts, phone out, trying to circle you for the angle.',
      hp: 10, spd: 230, dmg: 6, r: 12, xp: 1, mass: 0.8, ai: 'burst', scale: 2.4, cols: ['#2fb36b', '#e3ece6', '#1d1d1d'] },
    fiend: { id: 'fiend', name: 'OPP CREW', desc: 'Rival crew in red ski masks. Winds up and charges straight at you.',
      hp: 22, spd: 94, dmg: 8, r: 14, xp: 2, mass: 1.2, ai: 'charger', scale: 2.5, cols: ['#c01428', '#1a1a1e', '#ff3b3b'] },
    stalker: { id: 'stalker', name: 'SOUNDCLOUD RAPPER', desc: 'Keeps his distance and spits slow red bars at you. Wants a feature, will not take no.',
      hp: 16, spd: 84, dmg: 8, r: 14, xp: 2, mass: 1, ai: 'ranged', scale: 2.5, cols: ['#2a2d2a', '#9cff35', '#ff2448'], shot: { dmg: 8, speed: 150, cd: 3.4, range: 330 } },
    guard: { id: 'guard', name: 'SECURITY', desc: 'Venue security in a hi-vis vest. Tough. Stops, sweeps a flashlight beam and slows you if it catches you.',
      hp: 48, spd: 78, dmg: 10, r: 16, xp: 4, mass: 2.4, ai: 'guard', scale: 2.5, cols: ['#e8ff3a', '#1b1d22', '#f2f2ec'] },
    exec: { id: 'exec', name: 'LABEL EXECUTIVE', desc: 'Armored elite. Blocks 40% of damage and keeps signing new NPCs.',
      hp: 170, spd: 54, dmg: 16, r: 20, xp: 14, mass: 3, ai: 'summoner', scale: 2.7, armor: 0.4, isElite: true, cols: ['#1c2333', '#9aa3b2', '#d0142c'] },
    glitch: { id: 'glitch', name: 'GLITCHED FAN', desc: 'Corrupted superfan. Blinks short distances toward you without warning... almost.',
      hp: 14, spd: 98, dmg: 9, r: 13, xp: 2, mass: 1, ai: 'blink', scale: 2.5, cols: ['#c81e3c', '#9cff35', '#1d201d'] },
    bruiser: { id: 'bruiser', name: 'MOSH PIT BRUISER', desc: 'Huge, slow, angry. Telegraphs a ground slam with massive knockback.',
      hp: 130, spd: 64, dmg: 14, r: 24, xp: 8, mass: 5, ai: 'slammer', scale: 2.6, cols: ['#1a1414', '#b07a5a', '#ff2448'] },
    leak: { id: 'leak', name: 'THE LEAKER', desc: 'Rare. Sprints off with a hard drive full of unreleased songs. Vanishes after 15 seconds.',
      hp: 70, spd: 150, dmg: 0, r: 13, xp: 20, mass: 1, ai: 'flee', scale: 2.6, cols: ['#ffcf3f', '#9cff35', '#d9a520'], life: 15 },

    // ---- hallucinations: what you see once the trip kicks in. Real hitboxes, real damage.
    pony: { id: 'pony', name: 'PINK PONY', halluc: true, desc: 'Floats over cars, circles you, then gallops straight through your position. Watch the pink lane.',
      hp: 30, spd: 150, dmg: 8, r: 16, xp: 3, mass: 1.2, ai: 'gallop', scale: 2.4, ghost: true, cols: ['#ff6ad5', '#ffd1f2', '#9fe9ff'] },
    stretch: { id: 'stretch', name: 'STRETCHED MAN', halluc: true, desc: 'A partygoer pulled like taffy. Slow, but its arm reaches across half the screen.',
      hp: 40, spd: 62, dmg: 11, r: 15, xp: 3, mass: 1.6, ai: 'reach', scale: 2.5, cols: ['#b9a7ff', '#efe7ff', '#5a3fd0'] },
    dancer: { id: 'dancer', name: 'SHUFFLE GHOST', halluc: true, desc: 'Dances in on the beat. Every fourth step it spins and throws a ring of notes.',
      hp: 26, spd: 140, dmg: 9, r: 13, xp: 3, mass: 1, ai: 'dance', scale: 2.5, ghost: true, accel: 12, cols: ['#3ff2ff', '#ffffff', '#ff6ad5'], shot: { dmg: 7, speed: 120 } },
    bigshoe: { id: 'bigshoe', name: 'GIANT SNEAKER', halluc: true, desc: 'Way too big, way too clean. Hops toward you and stomps where its shadow lands.',
      hp: 120, spd: 0, dmg: 13, r: 22, xp: 7, mass: 6, ai: 'hop', scale: 2.6, cols: ['#f2f2ec', '#ff2448', '#1a1a1e'] },
    smiley: { id: 'smiley', name: 'MELTING SMILEY', halluc: true, desc: 'Drifts in wobbling circles. Pop it and it splits into two faster little ones.',
      hp: 34, spd: 88, dmg: 10, r: 15, xp: 2, mass: 1, ai: 'drift', scale: 2.5, ghost: true, cols: ['#ffe14a', '#ff6ad5', '#1a1405'], split: { type: 'minismile', n: 2 } },
    minismile: { id: 'minismile', name: 'MINI SMILEY', halluc: true, desc: 'What is left of a Melting Smiley. Quick and twitchy.',
      hp: 10, spd: 150, dmg: 6, r: 10, xp: 1, mass: 0.6, ai: 'drift', scale: 1.7, ghost: true, cols: ['#ffe14a', '#ff6ad5', '#1a1405'] },
  };

  RS.Data.BOSSES = {
    plant: { id: 'plant', name: 'THE INDUSTRY PLANT', title: 'SIGNED. SEALED. DELIVERED.', desc: 'Manufactured hype. Summons waves of NPCs and drops huge telegraphed area attacks.',
      hp: 3200, r: 46, spd: 58, dmg: 18, xp: 160, sprite: 'plant', scale: 3.0, col: '#3fbf4f' },
    algorithm: { id: 'algorithm', name: 'THE ALGORITHM', title: 'YOU HAVE BEEN RECOMMENDED', desc: 'Teleports, fills the arena with danger zones, fires feed lasers and rewires the hazards.',
      hp: 3600, r: 40, spd: 0, dmg: 18, xp: 260, sprite: null, scale: 1, col: '#e3ece6' },
    king: { id: 'king', name: 'THE RAGE KING', title: 'BOW DOWN', desc: 'Three phases of charges, shockwaves and summoned fiends.',
      hp: 45000, r: 54, spd: 92, dmg: 28, xp: 420, sprite: 'king', scale: 3.2, col: '#ff2448' },
    // 30:00 run ender: drawn in code (render.drawLabel), relentless and faster every second you survive
    label: { id: 'label', name: 'THE MAJOR LABEL', title: 'YOU OWE US EVERYTHING', desc: 'Walks in at 30:00 to end the run. Speeds up the longer you last. Beat it and you are independent.',
      hp: 60000, r: 50, spd: 150, dmg: 40, xp: 0, sprite: null, draw: 'label', scale: 1, col: '#ffcf3f' },
  };
})(window.RS);
