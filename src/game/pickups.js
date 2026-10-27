'use strict';
// XP orbs, CL0UT coins, consumables, chests and RAGE THUMB drops.
(function (RS) {
  const U = RS.U, FX = RS.FX, D = RS.Data;
  const CHEST_REACH = 64; // world px from the hero within which E opens a chest
  // XP stays toxic green at every size (bigger = brighter lime). The top tiers used to be near-white and white, and a
  // late floor of 200+ of them glowing read as sparkles / notifications all over the fight (2026-10-27 UI pass)
  const GEM_TIERS = [
    { max: 2.5, col: '#7fdc2a', r: 5 },
    { max: 9, col: '#9cff35', r: 6.5 },
    { max: 30, col: '#c4ff5a', r: 8 },
    { max: 1e9, col: '#e4ff7a', r: 10 },
  ];

  Object.assign(RS.Game, {
    pickup(kind, x, y, pop) {
      const k = this.pickups.spawn();
      k.kind = kind; k.x = x; k.y = y; k.attract = false; k.age = 0; k.v = 0; k.id2 = null; k.tier = 0;
      k.vx = 0; k.vy = 0; k.speed = 0;
      if (pop) { const a = U.rand(U.TAU), s = U.rand(120, pop); k.vx = Math.cos(a) * s; k.vy = Math.sin(a) * s; }
      return k;
    },
    dropXp(x, y, v, pop) {
      // every kill leaves a gem where it died. Only a drop practically on top of another gem (22 px) merges into it,
      // and in a flood (320+ gems) drops merge into the nearest gem within 260 px, never into one across the map
      // (that made kills look like they dropped nothing). XP is never lost.
      let gems = 0, near = null, nd = 22 * 22, flood = null, fd = 260 * 260, any = null, ad = 1e12;
      for (const k of this.pickups.list) {
        if (k.kind !== 'xp' || k.dead) continue;
        gems++;
        if (k.attract || pop) continue;
        const d = U.dist2(k.x, k.y, x, y);
        if (d < nd) { nd = d; near = k; }
        if (d < fd) { fd = d; flood = k; }
        if (d < ad) { ad = d; any = k; }
      }
      const into = near || (gems > 320 && flood) || (gems > 700 && any); // 700+: hard cap, the map is buried anyway
      if (into) { into.v += v; this.setGemTier(into); return into; }
      const k = this.pickup('xp', x + U.rand(-6, 6), y + U.rand(-6, 6), pop ? 380 : 0);
      k.v = v;
      this.setGemTier(k);
      return k;
    },
    setGemTier(k) { k.tier = GEM_TIERS.findIndex((t) => k.v <= t.max); if (k.tier < 0) k.tier = 3; },
    dropCoin(x, y, n) {
      for (let i = 0; i < n; i++) { const k = this.pickup('coin', x, y, 260); k.v = 1; }
    },
    dropConsumable(x, y, id) {
      const p = this.p;
      if (!id) {
        const pool = Object.values(D.CONSUMABLES);
        const c = U.weighted(pool, (c) => c.weight * (c.id === 'chicken_box' ? (p.hp < p.s.maxHp * 0.6 ? 2 : 0.6) * p.s.healMult : 1) * (c.rarity >= 2 ? Math.sqrt(p.s.luck) : 1));
        id = c.id;
      }
      const k = this.pickup('cons', x, y, 200);
      k.id2 = id;
      return k;
    },
    dropChest(x, y, tier, earned) {
      // pacing: at most one dropped (elite / EXEC / leak / tougher variant) chest every D.LOOT.earlyChestGap s before 5:00
      // and every D.LOOT.chestGap s after; extras turn into coins. Earned chests (cypher, supply drop, boss) always drop,
      // they only reset the timer.
      if (tier !== 'boss') {
        const gap = this.time < 300 ? D.LOOT.earlyChestGap : D.LOOT.chestGap;
        const recent = this.lastChestT !== undefined && this.lastChestT <= this.time && this.time - this.lastChestT < gap;
        if (recent && tier === 'elite' && !earned) { this.dropCoin(x, y, 4); return null; }
        this.lastChestT = this.time;
      }
      ({ x, y } = this.lootSpot(x, y));
      const k = this.pickup('chest', x, y, 0);
      k.tier = tier;
      FX.ring(x, y, 70, tier === 'boss' ? '#ff2448' : tier === 'legendary' ? '#ffcf3f' : '#cfd6e3', 0.6, 4);
      return k;
    },
    // RED DIAMOND: rare XP jackpot, see D.LOOT.ruby
    dropRuby(x, y) {
      const k = this.pickup('ruby', x, y, 180);
      this.lastRubyT = this.time;
      FX.ring(x, y, 60, '#ff2448', 0.6, 4);
      FX.burst(x, y, ['#ff2448', '#ffffff'], 10, 260, { kind: 'line' });
      this.sfx('thumb');
      return k;
    },
    rubyOk() {
      if (this.lastRubyT !== undefined && this.lastRubyT <= this.time && this.time - this.lastRubyT < D.LOOT.rubyGap) return false;
      for (const k of this.pickups.list) if (!k.dead && k.kind === 'ruby') return false;
      return true;
    },
    // chests and RAGE THUMBS do not pop: one dropped onto other loot is set down beside it instead (a spiral out to
    // ~150 px), so loot from a group dying together stays readable and every piece can be reached on its own
    lootSpot(x, y) {
      const big = [];
      for (const k of this.pickups.list) if (!k.dead && (k.kind === 'chest' || k.kind === 'thumb' || k.kind === 'cons' || k.kind === 'stash')) big.push(k);
      const free = (px, py) => !big.some((k) => (k.x - px) ** 2 + (k.y - py) ** 2 < 46 * 46) && !RS.Arena.solidAt(this.arena, px, py, 18);
      if (free(x, y)) return { x, y };
      for (let i = 1; i < 24; i++) {
        const a = i * 2.4, r = 30 + i * 5;
        const px = U.clamp(x + Math.cos(a) * r, 30, this.arena.w - 30), py = U.clamp(y + Math.sin(a) * r, 30, this.arena.h - 30);
        if (free(px, py)) return { x: px, y: py };
      }
      return { x, y };
    },
    dropThumb(x, y) {
      ({ x, y } = this.lootSpot(x, y));
      const k = this.pickup('thumb', x, y, 0);
      FX.ring(x, y, 80, '#ff4f6e', 0.6, 4);
      return k;
    },
    rollDrops(e) {
      const p = this.p, s = p.s;
      if (e.elite || e.def.isElite) {
        if (!e.noChest && (e.elite || Math.random() < D.LOOT.eliteExecChest + s.eliteBonus * 0.2)) this.dropChest(e.x, e.y, 'elite');
        if (Math.random() < 0.06 + s.eliteBonus * 0.05) this.dropThumb(e.x + 20, e.y);
        if (Math.random() < 0.5) this.dropConsumable(e.x, e.y);
        this.dropCoin(e.x, e.y, 3);
        RS.Stash.enemyDrop(this, e);
        return;
      }
      if (e.type === 'leak') {
        this.dropChest(e.x, e.y, 'elite', true); // THE LEAK: caught in time, it always pays out
        this.dropConsumable(e.x, e.y, 'perc');
        this.dropCoin(e.x, e.y, 6);
        if (this.flags.leakBoost || Math.random() < 0.25) this.dropThumb(e.x + 24, e.y);
        return;
      }
      if (Math.random() < s.coinChance * (1 + e.tier)) this.dropCoin(e.x, e.y, 1);
      if (Math.random() < D.LOOT.ruby * Math.sqrt(s.luck) && this.rubyOk()) this.dropRuby(e.x, e.y);
      if (Math.random() < (D.LOOT.tierChest[e.tier] || 0) * Math.sqrt(s.luck)) this.dropChest(e.x, e.y, 'elite'); // rare chest from tougher variants
      if (Math.random() < 0.008 * s.consumableChance * (1 + e.tier * 0.5)) this.dropConsumable(e.x, e.y);
      RS.Stash.enemyDrop(this, e);
    },

    updatePickups(dt) {
      const p = this.p;
      const mag2 = p.s.magnet * p.s.magnet;
      let combo = 0;
      // chests are not grabbed by walking over them: the closest one in reach waits for E (see Player / Render)
      let near = null, nearD = CHEST_REACH * CHEST_REACH;
      for (const k of this.pickups.list) {
        if (k.dead) continue;
        k.age += dt;
        if (k.vx || k.vy) {
          const d = Math.exp(-5 * dt);
          k.vx *= d; k.vy *= d;
          k.x += k.vx * dt; k.y += k.vy * dt;
          if (Math.abs(k.vx) + Math.abs(k.vy) < 5) k.vx = k.vy = 0;
          k.x = U.clamp(k.x, 20, this.arena.w - 20); k.y = U.clamp(k.y, 20, this.arena.h - 20);
        }
        const dx = p.x - k.x, dy = p.y - k.y, d2 = dx * dx + dy * dy;
        if (k.kind === 'ruby' && k.age > D.LOOT.rubyLife) { // gone: a small red pop where it lay
          k.dead = true; FX.pop(k.x, k.y, 22, ['#ff2448', '#5a0a18'], 'shatter'); continue;
        }
        const magnetic = k.kind === 'xp' || k.kind === 'coin' || k.kind === 'ruby';
        if (magnetic && !k.attract && d2 < mag2 && k.age > 0.25) k.attract = true;
        if (k.attract) {
          k.speed = Math.min(900, k.speed + 1400 * dt);
          const l = Math.sqrt(d2) || 1;
          k.x += (dx / l) * k.speed * dt; k.y += (dy / l) * k.speed * dt;
        }
        if (k.kind === 'chest') { if (d2 < nearD && !p.dead) { near = k; nearD = d2; } continue; }
        const grab = p.r + 10;
        if (d2 < grab * grab) {
          k.dead = true;
          this.collect(k, combo++);
        }
      }
      this.nearChest = near;
    },
    // E pressed next to a chest: open it (the overlay then spins, reveals and collects on further E presses)
    openChest(k) {
      if (!k || k.dead) return false;
      k.dead = true; this.nearChest = null;
      this.collect(k, 0);
      return true;
    },
    collect(k, combo) {
      const p = this.p;
      if (k.kind === 'xp') {
        p.gainXp(k.v);
        this.xpCombo = (this.xpComboT > this.time ? this.xpCombo + 1 : 0);
        this.xpComboT = this.time + 0.35;
        this.sfx('xp', { combo: this.xpCombo });
      } else if (k.kind === 'ruby') {
        const v = Math.round(p.xpNext * 0.5);
        p.gainXp(v / p.s.growth); // exactly half of the current level, whatever the growth stat
        this.stats.rubies = (this.stats.rubies || 0) + 1;
        FX.text(p.x, p.y - 56, 'RED DIAMOND +' + v + ' XP', '#ff2448', 17, { always: true, life: 1.6 });
        FX.ring(p.x, p.y, 90, '#ff2448', 0.45, 4);
        this.sfx('levelup');
      } else if (k.kind === 'coin') {
        this.addRunClout(k.v);
        this.sfx('coin');
      } else if (k.kind === 'cons') {
        const c = D.CONSUMABLES[k.id2];
        c.use(p, this);
        if (k.id2 === 'rage_juice' || k.id2 === 'perc' || k.id2 === 'tap_water') p.drinkT = 0.9; else p.pickT = 0.5; // hero sheet: drink / pick-up pose
        this.discover('items', c.id);
        FX.text(p.x, p.y - 50, c.name, '#ffe14a', 15, { always: true, life: 1.2 });
        this.sfx('pickup');
        RS.Stash.onInteract(this, p); // GHOST TOWN
      } else if (k.kind === 'chest') {
        this.stats.chests++;
        p.pickT = 0.5;
        RS.Stash.onChest(this, p); // RED / GREEN FLAG, GHOST TOWN
        this.modalQueue.push({ type: 'chest', tier: k.tier });
        this.sfx('chest');
      } else if (k.kind === 'thumb') {
        this.modalQueue.push({ type: 'thumb', n: 2 });
        this.sfx('thumb');
      } else if (k.kind === 'stash') RS.Stash.collect(this, k);
    },
  });

  RS.GEM_TIERS = GEM_TIERS;
})(window.RS);
