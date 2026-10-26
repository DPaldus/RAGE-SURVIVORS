'use strict';
// RAGE THUMBS: rare, build-defining run modifiers with an upside, a limitation and a visual.
(function (RS) {
  const U = RS.U;
  const T = {};
  const def = (o) => { o.type = 'thumb'; T[o.id] = o; };

  def({ id: 'thumb_twizzy', name: 'TWIZZY THUMB', rarity: 2, col: '#ff2448',
    desc: 'Every 5th kill in a streak fires 8 rage bolts in all directions.',
    down: 'Breaking the kill streak resets the counter.',
    onKill(p, G) {
      if (p.streak > 0 && p.streak % 5 === 0) {
        for (let i = 0; i < 8; i++) G.proj({ x: p.x, y: p.y, angle: (i / 8) * U.TAU, speed: 600, r: 7, dmg: 14 * p.s.might, pierce: 2, life: 0.7, kind: 'bolt', col: '#ff2448', w: null, src: 'thumb' });
        RS.FX.ring(p.x, p.y, 60, '#ff2448', 0.3, 3);
      }
    } });
  def({ id: 'thumb_schmunk', name: 'SCHMUNK THUMB', rarity: 3, col: '#9cff35',
    desc: 'Every 8s one random weapon goes feral: x2 damage and 30% faster.',
    down: 'At the same time another weapon is nerfed to 70% damage.',
    tick(p, G, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t < 8) return;
      st.t = 0;
      for (const w of p.weapons) { w.thumbDmg = 1; w.thumbCd = 1; w.thumbTag = ''; }
      if (!p.weapons.length) return;
      const ws = U.shuffle(p.weapons.slice());
      ws[0].thumbDmg = 2; ws[0].thumbCd = 0.7; ws[0].thumbTag = 'up';
      if (ws[1]) { ws[1].thumbDmg = 0.7; ws[1].thumbTag = 'down'; }
      RS.FX.text(p.x, p.y - 44, ws[0].def.name + ' x2', '#9cff35', 12, { always: true, life: 1.3 });
    } });
  def({ id: 'thumb_opium', name: 'OPIUM THUMB', rarity: 3, col: '#cfd6e3',
    desc: 'Critical hits detonate into dark energy explosions (40% of the hit).',
    down: '-20% max health.',
    apply(s) { s.maxHp *= 0.8; },
    onCrit(p, G, e, dmg, st) {
      if (G.time - (st.last || 0) < 0.12) return;
      st.last = G.time;
      G.aoe(e.x, e.y, 52, dmg * 0.4, { noCrit: true, ring: '#9cff35', fill: 0.35, src: 'thumb', skipThumbs: true });
    } });
  def({ id: 'thumb_cloudchase', name: 'CLOUDCHASE THUMB', rarity: 2, col: '#b39ddb',
    desc: '+4% damage for every second you go without getting hit (max +80%).',
    down: 'Taking any damage resets the bonus to zero.',
    tick(p, G, dt, st) { st.t = (st.t || 0) + dt; },
    onHurt(p, G, st) { st.t = 0; },
    dmgMul(p, G, e, o, st) { return 1 + Math.min(0.8, 0.04 * (st.t || 0)); },
    hud(p, st) { return '+' + Math.round(Math.min(0.8, 0.04 * (st.t || 0)) * 100) + '%'; } });
  def({ id: 'thumb_rage', name: 'RAGE THUMB', rarity: 2, col: '#ff3b55',
    desc: 'Every kill adds +1% damage (max +60%) while you keep killing.',
    down: 'All stacks drop after 3s without a kill.',
    onKill(p, G, e, st) { st.n = Math.min(60, (st.n || 0) + 1); st.t = 3; },
    tick(p, G, dt, st) { st.t = (st.t || 0) - dt; if (st.t <= 0) st.n = 0; },
    dmgMul(p, G, e, o, st) { return 1 + 0.01 * (st.n || 0); },
    hud(p, st) { return (st.n || 0) + 'x'; } });
  def({ id: 'thumb_bass', name: 'BASS THUMB', rarity: 3, col: '#ff7a1a',
    desc: 'Sonic weapons deal +60% damage and knock enemies twice as far.',
    down: 'Non-sonic weapons deal 25% less damage.',
    dmgMul(p, G, e, o) { return o.sonic ? 1.6 : 0.75; },
    knockMul(o) { return o.sonic ? 2 : 1; } });
  def({ id: 'thumb_glitch', name: 'GLITCH THUMB', rarity: 3, col: '#ff4f6e',
    desc: 'Every level-up duplicates a random passive item at half strength.',
    down: 'You gain 8% less XP.',
    apply(s) { s.growth *= 0.92; },
    onLevel(p, G) {
      if (!p.passives.length) return;
      const it = U.pick(p.passives);
      it.ghost = (it.ghost || 0) + 0.5;
      RS.FX.text(p.x, p.y - 44, 'GLITCH: ' + it.def.name, '#ff4f6e', 12, { always: true, life: 1.3 });
    } });
  def({ id: 'thumb_mosh', name: 'MOSH THUMB', rarity: 2, col: '#7a0a16',
    desc: '+2.5% damage for every enemy near you (max +75%).',
    down: 'Take 30% more damage when no enemy is near you.',
    tick(p, G, dt, st) { st.t = (st.t || 0) - dt; if (st.t <= 0) { st.t = 0.25; st.n = G.inRadius(p.x, p.y, 150).length; st.lonely = !G.nearest(p.x, p.y, 220); } },
    apply(s, p, st) { if (st && st.lonely) s.dmgTaken *= 1.3; },
    dmgMul(p, G, e, o, st) { return 1 + Math.min(0.75, 0.025 * (st.n || 0)); },
    hud(p, st) { return '+' + Math.round(Math.min(0.75, 0.025 * (st.n || 0)) * 100) + '%'; } });
  def({ id: 'thumb_chrome', name: 'CHROME THUMB', rarity: 2, col: '#cfd6e3',
    desc: 'Rare, epic and legendary upgrades become far more common.',
    down: 'Healing from pickups is 60% weaker.',
    apply(s) { s.rarityLuck += 0.7; s.healMult *= 0.4; } });
  def({ id: 'thumb_deadair', name: 'DEAD AIR THUMB', rarity: 3, col: '#3a3a44',
    desc: 'Every 12s every enemy freezes in place for 2s.',
    down: 'After the freeze, enemies move 30% faster for 4s.',
    tick(p, G, dt, st) {
      st.t = (st.t || 0) + dt;
      if (st.t >= 12) { st.t = 0; G.freezeAll(2, true); G.enemyRage = 6; }
    } });
  def({ id: 'thumb_leak', name: 'LEAK THUMB', rarity: 2, col: '#ffcf3f',
    desc: 'THE LEAK shows up 3x as often and always drops a chest.',
    down: 'Elite enemies have 25% more health.',
    onPick(p, G) { G.flags.leakBoost = true; } });
  def({ id: 'thumb_mixtape', name: 'MIXTAPE THUMB', rarity: 4, col: '#e3ece6',
    desc: '+1 projectile / amount for every weapon.',
    down: '-15% damage.',
    apply(s) { s.amount += 1; s.might *= 0.85; } });

  RS.Data.THUMBS = T;
})(window.RS);
