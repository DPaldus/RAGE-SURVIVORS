'use strict';
// Level-up offers (rarity-weighted), reroll / banish / skip, chest rewards, RAGE THUMB offers.
// The build layer (data/build.js): 3-5 weapon and 2-4 TAPE slots, weapon MODS and TAPES. Offers lean on what you hold
// (candidates): upgrades for your own weapons and tapes come first, a weapon you just got is favoured for a few
// levels, new weapons get rarer as the slots fill up (one per offer at most, none once the slots are full), and at
// most two cards in an offer are for the same weapon, so there is always a real choice.
(function (RS) {
  const U = RS.U, D = RS.Data, FX = RS.FX;
  const lockedOf = (kind) => D.UNLOCKS.filter((u) => u.kind === kind).map((u) => u.id);
  // does the player hold this piece for synergy purposes? A TAPE counts from LV 3 (D.BUILD.tapeSynLevel); `extra`
  // is a piece the card would add (a TAPE card adds one level)
  function holds(p, x, extra) {
    if (D.TAPES[x]) { const t = p.hasTape(x); return (t ? t.level : 0) + (x === extra ? 1 : 0) >= Math.min(D.BUILD.tapeSynLevel, D.TAPES[x].max); }
    if (x === extra) return true;
    if (D.STASH && D.STASH[x]) return !!p.stash[x];
    return D.PASSIVES[x] ? !!p.hasPassive(x) : !!p.hasWeapon(x);
  }
  // the synergy this card would complete (null if none)
  function completes(p, id) {
    for (const sy of D.SYNERGIES || []) {
      if (p.syn.includes(sy) || !sy.needs.includes(id)) continue;
      if (sy.needs.every((x) => holds(p, x, id))) return sy;
    }
    return null;
  }
  // would taking `id` complete a synergy you have already found in an earlier run? (an undiscovered one stays silent:
  // combinations are for the player to find, the game never points at them)
  function synergyHint(p, id) {
    const sy = completes(p, id);
    return sy && RS.Save.isDiscovered('synergies', sy.id) ? 'COMPLETES SYNERGY: ' + sy.name : '';
  }

  const P = {
    weaponPool() {
      const locked = lockedOf('weapons');
      return Object.values(D.WEAPONS).filter((w) => !w.evolved && (!locked.includes(w.id) || RS.Save.isUnlocked('weapons', w.id))).map((w) => w.id);
    },
    passivePool() {
      const locked = lockedOf('items');
      return Object.keys(D.PASSIVES).filter((id) => !locked.includes(id) || RS.Save.isUnlocked('items', id));
    },
    thumbPool() {
      const locked = lockedOf('thumbs');
      return Object.keys(D.THUMBS).filter((id) => !locked.includes(id) || RS.Save.isUnlocked('thumbs', id));
    },

    rollRarity(p) {
      const f = Math.max(0.5, p.s.luck + p.s.rarityLuck);
      const r = U.weighted(D.RARITY, (R) => R.w * Math.pow(f, R.id)); // see D.RARITY for the exponent
      return r ? r.id : 0;
    },

    // ------------------------------------------------------------ level up
    // the item type behind a card: the weapon (any level, MOD or evolution of it), the stat (a TAPE and the loose stat
    // card for the same stat), the stash item, the passive or perk. An offer never shows the same type twice
    typeOf(c) {
      const k = c.kind || '';
      if (k.startsWith('weapon')) { const d = D.WEAPONS[c.wid || c.id]; return 'w:' + ((d && d.from) || c.wid || c.id); }
      if (k.startsWith('tape')) return 's:' + D.TAPES[c.id].card.id;
      if (k === 'stat') return 's:' + c.id;
      if (k === 'stash') return 'x:' + c.id;
      return 'i:' + c.id;
    },
    choices(G) {
      const p = G.p;
      let n = 3;
      if (Math.random() < Math.max(0, (p.s.luck - 1) * 0.5)) n = 4;
      const out = [], used = new Set(), per = {}, types = new Set();
      const take = (c) => { out.push(c); used.add(c.key); types.add(this.typeOf(c)); if (c.wid) per[c.wid] = (per[c.wid] || 0) + 1; if (c.kind === 'weapon_new') per.__new = 1; };
      for (let i = 0; i < n; i++) {
        let c = null;
        for (let k = 0; k < 6 && !c; k++) { // a card of a type already on offer is drawn again
          const d = this.makeCard(G, used, undefined, undefined, per);
          if (!d) break;
          if (types.has(this.typeOf(d))) used.add(d.key); else c = d;
        }
        if (c) take(c);
      }
      for (const k of [...used]) if (!out.some((c) => c.key === k)) used.delete(k);
      // early safety net: until the third weapon, every offer includes a new weapon (a two-gun build drowns at 4:00)
      if (p.weapons.length < Math.min(3, p.maxWeapons) && out.length && !out.some((c) => c.kind === 'weapon_new')) {
        const i = out.findIndex((c) => c.kind !== 'weapon_up' && c.kind !== 'weapon_mod');
        const k = i < 0 ? out.length - 1 : i, old = out[k];
        if (old.wid) per[old.wid]--;
        used.delete(old.key);
        const news = this.candidates(G, used, per, old.rarity | 0).filter((c) => c.kind === 'weapon_new');
        const pick = news.length && U.weighted(news, (c) => c.weight);
        if (pick) { out[k] = this.itemCard(G, pick, old.rarity | 0); used.add(out[k].key); }
        else { used.add(old.key); if (old.wid) per[old.wid]++; }
      }
      return out;
    },
    // a new card for slot i of an offer (after a banish): same rules, no item type twice
    refill(G, cards, i) {
      const used = new Set(cards.map((c) => c.key)), per = {}, types = new Set();
      cards.forEach((c, j) => { if (j === i) return; types.add(this.typeOf(c)); if (c.wid) per[c.wid] = (per[c.wid] || 0) + 1; if (c.kind === 'weapon_new') per.__new = 1; });
      for (let k = 0; k < 6; k++) {
        const d = this.makeCard(G, used, undefined, undefined, per);
        if (!d) return null;
        if (!types.has(this.typeOf(d))) return d;
        used.add(d.key);
      }
      return null;
    },
    // hidden affinity (data/builds.js): a new item that shares a tag with what you built so far is offered a bit more
    // often (up to x1.7 for a build deep in that direction), so a path you start tends to keep showing up
    affinity(p, id) {
      const pts = p.resPts || {}, tags = (D.ITEM_TAGS || {})[id] || [];
      let a = 0;
      for (const t of tags) a += Math.min(1, (pts[t] || 0) / 5);
      return 1 + 0.45 * Math.min(1.5, a);
    },
    // a weapon you just picked up comes up twice as often for a few levels (D.BUILD.focusLevels)
    // (not the starting gun: it is not a fresh pick, and with the boost it filled the first offers of every run)
    focus(p, w) { return w.starter ? 1 : 1 + Math.max(0, 1 - (p.level - (w.gotLevel || 0)) / D.BUILD.focusLevels); },
    // run-to-run variety: a weapon you took in your last few runs comes up a bit less (D.BUILD.recentRuns / recentCut)
    freshness(id) {
      const runs = RS.Save.data.recentWeapons;
      if (!Array.isArray(runs)) return 1;
      let n = 0;
      for (const r of runs.slice(0, D.BUILD.recentRuns)) if (Array.isArray(r) && r.includes(id)) n++;
      return 1 - D.BUILD.recentCut * n;
    },
    // every card the offer can draw from, with its weight. per: cards per weapon already in this offer (+ __new)
    candidates(G, used, per, rar) {
      const p = G.p, B = D.BUILD, cands = [];
      per = per || {}; rar = rar | 0;
      const catalysts = new Set(p.weapons.filter((w) => !w.def.evolved && w.def.evoWith).map((w) => w.def.evoWith));
      const weaponsWanting = new Set(p.passives.map((x) => x.id));
      // the weapons you hold: their next level, and MODS (two stats each, so two cards for one weapon can differ)
      for (const w of p.weapons) {
        const id = w.def.id;
        if ((per[id] || 0) >= B.perCard) continue;
        // the starter gun steps back a little once there are three guns: it is in every run, so its cards were ~31% of
        // all weapon cards (2026-10-27 audit), the main reason GLOCK felt like it was everywhere
        const f = this.focus(p, w) * (w.starter && p.weapons.length >= 3 ? B.starterWeight : 1), maxed = w.def.evolved || w.level >= w.def.max;
        if (!maxed) cands.push({ kind: 'weapon_up', id, key: id, wid: id, w, weight: 4.5 * f });
        const mods = D.WEAPON_MODS.filter((m) => m.ok(w.def, w) && (!m.minR || rar >= m.minR) && !p.banished.has('mod:' + id + ':' + m.id));
        for (let k = 0; k < 2 && mods.length; k++) {
          const m = U.weighted(mods, (x) => x.w);
          mods.splice(mods.indexOf(m), 1);
          const key = 'mod:' + id + ':' + m.id;
          cands.push({ kind: 'weapon_mod', id: key, key, wid: id, w, mod: m, weight: (maxed ? B.maxedModWeight : 1.2) * f });
        }
      }
      // new weapons: only with a free slot, rarer the fuller the slots get, one per offer
      if (p.weapons.length < p.maxWeapons && !per.__new) {
        const free = (p.maxWeapons - p.weapons.length) / p.maxWeapons;
        for (const id of this.weaponPool()) {
          if (p.hasWeapon(id) || p.banished.has(id)) continue;
          const def = D.WEAPONS[id];
          cands.push({ kind: 'weapon_new', id, key: id, wid: id, weight: 1.15 * (0.4 + 0.6 * free) * (weaponsWanting.has(def.evoWith) ? 1.6 : 1.0) * this.affinity(p, id) * this.freshness(id) });
        }
      }
      for (const it of p.passives) {
        if (it.level >= it.def.max) continue;
        cands.push({ kind: 'passive_up', id: it.id, key: it.id, it, weight: 3.5 });
      }
      if (p.passives.length < D.BUILD.passiveSlots) {
        for (const id of this.passivePool()) {
          if (p.hasPassive(id) || p.banished.has(id)) continue;
          cands.push({ kind: 'passive_new', id, key: id, weight: (catalysts.has(id) ? 2 : 1) * this.affinity(p, id) });
        }
      }
      // TAPES: level the ones you hold; new ones only while a TAPE slot is free
      for (const t of p.tapes) {
        if (t.level >= t.def.max || p.banished.has(t.id) || rar < t.def.minR) continue;
        cands.push({ kind: 'tape_up', id: t.id, key: t.id, weight: 2.4 * this.affinity(p, t.id) });
      }
      if (p.tapes.length < p.maxTapes) {
        for (const id in D.TAPES) {
          if (p.hasTape(id) || p.banished.has(id) || rar < D.TAPES[id].minR) continue;
          cands.push({ kind: 'tape_new', id, key: id, weight: 0.8 * this.affinity(p, id) });
        }
      }
      // a card that would complete a synergy (found or not) comes up a little more often, without saying why
      for (const c of cands) if (c.kind !== 'weapon_mod' && completes(p, c.kind === 'weapon_up' ? '' : c.id)) c.weight *= 1.35;
      return cands.filter((c) => !used.has(c.key));
    },
    // rar: forced rarity (THE PLUG), boost: extra multiplier on stat values (THE PLUG past LEGENDARY)
    makeCard(G, used, rar, boost, per) {
      const p = G.p;
      if (rar === undefined) rar = this.rollRarity(p);
      // the legendary perks stay a rare surprise, the character cards an occasional one
      if (rar === 4 && Math.random() < 0.1) {
        const sp = D.SPECIALCARDS.filter((c) => (!c.cond || c.cond(p)) && !used.has(c.id) && !p.banished.has(c.id));
        if (sp.length) return this.statCard(G, used, rar, boost, sp);
      }
      const cc = D.CHARCARDS[p.id];
      if (cc && Math.random() < 0.08) {
        const pool = cc.filter((c) => !used.has(c.id) && !p.banished.has(c.id));
        if (pool.length) return this.statCard(G, used, rar, boost, pool);
      }
      const cands = this.candidates(G, used, per, rar);
      const c = cands.length ? U.weighted(cands, (x) => x.weight) : null;
      if (c) return this.cardFor(G, c, rar, boost);
      return this.statCard(G, used, rar, boost); // nothing left to upgrade at all: a loose stat boost
    },
    cardFor(G, c, rar, boost) {
      if (c.kind === 'weapon_mod') return this.modCard(G, c, rar, boost);
      if (c.kind === 'tape_up' || c.kind === 'tape_new') return this.tapeCard(G, c, rar, boost);
      return this.itemCard(G, c, rar);
    },
    itemCard(G, c, rar) {
      const p = G.p;
      const card = { key: c.key || c.id, id: c.id, wid: c.wid, kind: c.kind, rarity: rar, icon: c.id, effects: [] };
      if (c.kind === 'weapon_up' || c.kind === 'weapon_new') {
        const def = D.WEAPONS[c.id];
        card.name = def.name; card.type = 'WEAPON' + (def.sonic ? ' · SONIC' : '') + (c.kind === 'weapon_new' ? ' · SLOT ' + (p.weapons.length + 1) + ' / ' + p.maxWeapons : '');
        card.desc = def.desc;
        card.role = def.role;
        const from = c.kind === 'weapon_up' ? c.w.level : 0;
        const gain = c.kind === 'weapon_up' ? [1, 1, 1, 2, 2][rar] : [1, 1, 2, 3, 4][rar];
        const to = Math.min(def.max, from + gain);
        card.lvl = c.kind === 'weapon_new' ? 'NEW · LV ' + to : 'LV ' + from + ' → ' + to + ' / ' + def.max;
        card.isNew = c.kind === 'weapon_new';
        for (let l = Math.max(1, from); l < to; l++) if (def.lv[l - 1]) card.effects.push(def.lv[l - 1][1]);
        const bonus = [null, { dmg: 0.1 }, { dmg: 0.2, area: 0.1 }, { dmg: 0.25, amount: 1 }, { dmg: 0.4, amount: 1, cd: 0.85 }][rar];
        if (bonus) {
          card.effects.push('+' + Math.round(bonus.dmg * 100) + '% damage');
          if (bonus.area) card.effects.push('+10% area');
          if (bonus.amount) card.effects.push('+1 projectile');
          if (bonus.cd) card.effects.push('-15% cooldown');
        }
        const evo = D.WEAPONS[def.evo];
        if (evo) {
          const known = RS.Save.isDiscovered('evos', evo.id);
          card.syn = known ? 'EVOLVES WITH ' + D.PASSIVES[def.evoWith].name + ' → ' + evo.name : 'MAX LEVEL + ??? = EVOLUTION';
        }
        if (c.kind === 'weapon_new') card.syn = synergyHint(p, c.id) || card.syn;
        card.apply = () => {
          let w = c.kind === 'weapon_up' ? c.w : p.addWeapon(c.id);
          G.levelWeapon(w, to - w.level);
          if (bonus) {
            w.bonus.dmg += bonus.dmg;
            if (bonus.area) w.bonus.area += bonus.area;
            if (bonus.amount) w.bonus.amount = Math.min(3, w.bonus.amount + bonus.amount);
            if (bonus.cd) w.bonus.cd *= bonus.cd;
          }
        };
      } else {
        const def = D.PASSIVES[c.id];
        card.name = def.name; card.type = 'PASSIVE ITEM';
        card.desc = def.desc;
        const from = c.kind === 'passive_up' ? c.it.level : 0;
        const gain = c.kind === 'passive_up' ? [1, 1, 1, 2, 2][rar] : [1, 1, 2, 2, 3][rar];
        const to = Math.min(def.max, from + gain);
        card.lvl = c.kind === 'passive_new' ? 'NEW · LV ' + to : 'LV ' + from + ' → ' + to + ' / ' + def.max;
        card.isNew = c.kind === 'passive_new';
        card.effects.push(def.per + (to - from > 1 ? ' (x' + (to - from) + ')' : ''));
        const wantsMe = p.weapons.find((w) => !w.def.evolved && w.def.evoWith === c.id);
        if (wantsMe) { // only a recipe you have already found is named; an unknown one says nothing
          const evo = D.WEAPONS[wantsMe.def.evo];
          if (RS.Save.isDiscovered('evos', evo.id)) card.syn = 'EVOLVES ' + wantsMe.def.name + ' → ' + evo.name;
        }
        if (!card.syn && c.kind === 'passive_new') card.syn = synergyHint(p, c.id);
        card.apply = () => {
          const it = c.kind === 'passive_up' ? c.it : p.addPassive(c.id);
          it.level = to;
          p.recalc();
        };
      }
      return card;
    },
    // a weapon MOD: one stat of one weapon you hold, its size set by the rarity
    modValue(m, rar, boost) { const v = m.v[rar]; return m.id === 'amount' || m.id === 'pierce' || m.id === 'bounce' || m.id === 'chain' ? v : v * (boost || 1); },
    modCard(G, c, rar, boost) {
      const p = G.p, w = c.w, def = w.def, m = c.mod, v = this.modValue(m, rar, boost);
      return {
        key: c.key, id: c.id, wid: c.wid, kind: 'weapon_mod', rarity: rar, icon: def.id, name: def.name,
        type: 'WEAPON UPGRADE', lvl: (m.label ? m.label(def) : m.name) + ' · MOD ' + ((w.mods || 0) + 1),
        desc: '', effects: [m.fmt(v, def)], syn: def.evolved ? 'KEEPS GROWING AFTER THE EVOLUTION' : w.level >= def.max ? 'MAX LEVEL · MODS KEEP IT GROWING' : '',
        apply: () => { m.apply(w, v); w.mods = (w.mods || 0) + 1; p.recalc(); },
      };
    },
    // a TAPE: a stat upgrade that takes a TAPE slot and levels up to LV 10 (the size per level comes from the rarity)
    tapeCard(G, c, rar, boost) {
      const p = G.p, T = D.TAPES[c.id], mult = D.RARITY[rar].mult * (boost || 1), have = p.hasTape(c.id), from = have ? have.level : 0;
      return {
        key: c.key, id: c.id, kind: have ? 'tape_up' : 'tape_new', rarity: rar, icon: T.id, name: T.name,
        type: have ? 'TAPE' : 'TAPE · SLOT ' + (p.tapes.length + 1) + ' / ' + p.maxTapes, desc: T.desc,
        lvl: have ? 'LV ' + from + ' → ' + (from + 1) + ' / ' + T.max : 'NEW · LV 1', isNew: !have,
        effects: [T.card.fmt(mult)], syn: synergyHint(p, c.id),
        apply: () => { const t = have || p.addTape(c.id); t.level = Math.min(T.max, t.level + 1); T.card.apply(p, mult, G); p.recalc(); },
      };
    },
    // loose stat card: the legendary perks, the character cards, and the fallback once nothing is left to upgrade
    statCard(G, used, rar, boost, pool) {
      const p = G.p;
      const R = D.RARITY[rar], mult = R.mult * (boost || 1);
      if (!pool) {
        pool = D.STATCARDS.filter((c) => (!c.minR || rar >= c.minR) && !used.has(c.id) && !p.banished.has(c.id));
        if (!pool.length) pool = D.STATCARDS.filter((c) => !used.has(c.id) && !c.minR);
      }
      const sc = U.pick(pool);
      const special = D.SPECIALCARDS.includes(sc);
      return {
        key: sc.id, id: sc.id, kind: special ? 'special' : 'stat', rarity: rar, icon: sc.id, name: sc.name,
        type: special ? 'LEGENDARY PERK' : 'STAT BOOST', desc: '', lvl: special ? 'UNIQUE' : R.name,
        effects: [sc.fmt(mult)],
        apply: () => { sc.apply(p, mult, G); p.recalc(); },
      };
    },
    pick(G, card) {
      const p = G.p;
      card.apply();
      p.pendingLevels = Math.max(0, p.pendingLevels - 1);
      if (card.rarity >= 2) {
        G.sfx('rare');
        if (p.id === 'schmunk') {
          const burst = Math.round(p.xpNext * (0.12 + p.bonus.luckBurst));
          p.xp += burst;
          FX.text(p.x, p.y - 50, 'SCHMUNK LUCK +' + burst + ' XP', '#9cff35', 13, { always: true, life: 1.3 });
        }
      } else G.sfx('levelup');
      FX.ring(p.x, p.y, 90, D.RARITY[card.rarity].col, 0.4, 5, 0.15);
      p.recalc();
    },
    skip(G) {
      const p = G.p;
      p.pendingLevels = Math.max(0, p.pendingLevels - 1);
      G.addRunClout(5);
      G.heal(p.s.maxHp * 0.1);
      G.sfx('coin');
    },

    // ------------------------------------------------------------ weapon special effects (MOD "SPECIAL")
    // a weapon hit rolls its weapon's special (D.WEAPON_FX) at the chance its SPECIAL mods added up to
    weaponFx(G, p, e, dmg, w) {
      const X = RS.Stash;
      if (!X.roll(p, w.bonus.fxC)) return;
      switch (D.fxOf(w.def)[0]) {
        case 'bleed': X.bleed(G, e, dmg * 0.4 * p.s.bleedMul, 3); break;
        case 'burn': X.burn(G, e, dmg * 0.4, 3); break;
        case 'poison': X.poison(G, e, dmg * 0.4 * p.s.poisonMul, 3); break;
        case 'curse': X.curse(G, e, 0.02, 3); break;
        case 'stun':
          if (e.boss || e.dead) break;
          e.freezeT = Math.max(e.freezeT || 0, e.elite || e.def.isElite ? 0.3 : 0.6);
          if (X.ok('stunfx', 8)) FX.burst(e.x, e.y - e.r * 1.2, ['#ffe14a', '#ffffff'], 3, 90, { size: 3, life: 0.3 });
          break;
        case 'chill':
          if (e.dead) break;
          e.slowT = Math.max(e.slowT, 2); e.slowAmt = Math.max(e.slowAmt, e.boss ? 0.2 : 0.45); e.chillT = 2; e.iceT = Math.max(e.iceT, 0.3);
          break;
        case 'shock': if (X.ok('wfxarc', 10)) X.arcs(G, e, dmg * 0.4, 2); break;
      }
    },

    // ------------------------------------------------------------ chests
    // a random MOD for a random weapon you hold (chests hand these out once nothing else is left to level)
    randomMod(G) {
      const p = G.p, w = p.weapons.length ? U.pick(p.weapons) : null;
      if (!w) return null;
      const rar = this.rollRarity(p), mods = D.WEAPON_MODS.filter((m) => m.ok(w.def, w) && (!m.minR || rar >= m.minR));
      const m = mods.length && U.weighted(mods, (x) => x.w);
      if (!m) return null;
      const v = this.modValue(m, rar);
      return { type: 'up', icon: w.def.id, name: w.def.name, desc: (m.label ? m.label(w.def) : m.name) + ' · ' + m.fmt(v, w.def),
        apply: () => { m.apply(w, v); w.mods = (w.mods || 0) + 1; p.recalc(); } };
    },
    openChest(G, tier) {
      const p = G.p, s = p.s;
      let count = 1;
      const r = Math.random();
      const early = G.time < 240; // the first four minutes: one item per chest, so a lucky drop cannot snowball the run
      if (tier === 'elite') count = early ? 1 : r < 0.03 + s.chestBonus * 0.2 ? 5 : r < 0.12 + s.chestBonus ? 3 : 1;
      else if (tier === 'boss') count = r < 0.25 + s.chestBonus ? 5 : 3;
      else if (tier === 'legendary') count = G.time < 300 ? 3 : 5;
      else if (tier === 'supply') count = early ? 1 : 2;
      // rolled now, applied only when the player confirms (Overlays: E = collect). Levels are simulated so a
      // weapon picked twice shows LV +2 and never goes past its max.
      const res = [], lv = new Map(), evolving = new Set();
      const level = (o) => (lv.has(o) ? lv.get(o) : o.level);
      for (let i = 0; i < count; i++) {
        const evo = p.weapons.find((w) => !evolving.has(w) && G.canEvolve(w, p));
        if (evo) {
          evolving.add(evo);
          const nd = D.WEAPONS[evo.def.evo];
          res.push({ type: 'evo', icon: nd.id, name: nd.name, desc: evo.def.name + ' + ' + D.PASSIVES[evo.def.evoWith].name, apply: () => G.evolveWeapon(evo) });
          continue;
        }
        const ups = [];
        for (const w of p.weapons) if (!evolving.has(w) && !w.def.evolved && level(w) < w.def.max) ups.push({ w });
        for (const it of p.passives) if (level(it) < it.def.max) ups.push({ it });
        for (const t of p.tapes) if (level(t) < t.def.max && !t.def.minR) ups.push({ t });
        // a weapon MOD now and then, and always once there is nothing left to level
        const mod = (!ups.length || Math.random() < 0.25) && this.randomMod(G);
        if (mod) { res.push(mod); continue; }
        if (ups.length) {
          const u = U.pick(ups);
          if (u.w) {
            const w = u.w, l = level(w) + 1; lv.set(w, l);
            res.push({ type: 'up', icon: w.def.id, name: w.def.name, desc: 'LV ' + l + (l >= w.def.max ? ' · MAX' : ''), apply: () => G.levelWeapon(w, 1) });
          } else if (u.it) {
            const it = u.it, l = level(it) + 1; lv.set(it, l);
            res.push({ type: 'up', icon: it.id, name: it.def.name, desc: 'LV ' + l + (l >= it.def.max ? ' · MAX' : ''), apply: () => { it.level = Math.min(it.def.max, it.level + 1); p.recalc(); } });
          } else {
            const t = u.t, l = level(t) + 1; lv.set(t, l);
            res.push({ type: 'up', icon: t.id, name: t.def.name, desc: 'LV ' + l + ' · ' + t.def.card.fmt(1),
              apply: () => { t.level = Math.min(t.def.max, t.level + 1); t.def.card.apply(p, 1, G); p.recalc(); } });
          }
        } else {
          res.push({ type: 'gold', icon: 'clout_stack', name: 'CL0UT BAG', desc: '+12 CL0UT, +25 HP', apply: () => { G.addRunClout(12); G.heal(25); } });
        }
      }
      RS.Stash.chestLoot(G, tier, res); // a stash item on top (sometimes; always in boss / legendary chests)
      res.tier = tier;
      return res;
    },
    // grant a rolled chest (the player pressed E on the result screen)
    collectChest(G, res) {
      for (const r of res) r.apply();
      if (res.tier === 'boss' || res.tier === 'legendary') G.modalQueue.unshift({ type: 'thumb', n: res.tier === 'boss' ? 3 : 2 });
    },

    // ------------------------------------------------------------ RAGE THUMBS
    thumbOffer(G, n) {
      const p = G.p;
      const pool = this.thumbPool().filter((id) => !p.thumbs.some((t) => t.id === id));
      const out = [];
      const avail = pool.slice();
      for (let i = 0; i < n && avail.length; i++) {
        const id = U.weighted(avail, (id) => [0, 0, 5, 3, 1.3][D.THUMBS[id].rarity] * (D.THUMBS[id].rarity >= 3 ? Math.sqrt(p.s.luck) : 1));
        out.push(id);
        avail.splice(avail.indexOf(id), 1);
      }
      return out;
    },
  };

  RS.Progression = P;
})(window.RS);
