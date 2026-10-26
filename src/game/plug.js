'use strict';
// THE PLUG: a dealer who is in every run. A few seconds in he sets up at a random spot on the map (off screen, never
// right next to you) and stays there; a cash icon on the minimap points at him (playtest: in the old version he
// showed up far off screen for 70 s at a time and nobody ever met him). Walk up and press E: the game pauses on his
// offer of 3 cards (the level-up card pool). Buying one costs run CL0UT (the coins you picked up this run); he packs
// up and sets up again somewhere else on the map. Every deal this run makes the next one dearer and stronger: the
// rarity floor climbs (UNCOMMON -> RARE -> EPIC -> LEGENDARY) and every card adds THE PLUG'S CUT (+damage) that grows
// with each deal; past LEGENDARY the stat cards keep scaling.
(function (RS) {
  const U = RS.U, FX = RS.FX;
  const REACH = 80; // world px from the hero within which E works
  const FIRST = 4, LEAVE = 2.2, MOVE = 1.5; // first set-up (s into the run), packing up after a deal, gap before the new spot
  const K = 3; // world units per art pixel

  // 20 x 28 art px: hooded dealer in a puffer, gas mask with green lenses, gold chain, an open briefcase of glowing
  // goods at his feet. Rows 0-15 (head + torso) breathe one pixel down and up.
  const PAL = {
    o: '#0a080c', h: '#1d2026', H: '#343944', d: '#101115', m: '#0b0d0b', g: '#9cff35', c: '#ffd23f', r: '#ff2448',
    p: '#16171c', P: '#24262d', w: '#e9e9e4', b: '#3b2a1d', B: '#5c4330', G: '#9cff35', y: '#ffe14a', s: '#6b737e',
  };
  const ART = [
    '....oooooo..........',
    '...oHHHHHHo.........',
    '..oHhhhhhhHo........',
    '..ohhmmmmhho........',
    '..ohmgmmgmho........',
    '..ohmmssmmho........',
    '..odhmmmmhdo........',
    '.oohhhhhhhhoo.......',
    'ohhHhcchhhHhho......',
    'ohhHhhcchhHhho......',
    'ohdHhhhcchHdho......',
    'ohdHhhhhhhHdho......',
    'ohdHhrrrrhHdho......',
    'ohdHhhhhhhHdho......',
    'oHdhhhhhhhhdHo......',
    'oHddhhhhhhddHo......',
    '.oodhhhhhhdoo.ooooo.',
    '..oPppppppPo..oBBBo.',
    '..opppppppppo.oBGBo.',
    '..oppppoppppo.oBBBo.',
    '..oppppoppppoobbbbbo',
    '..oppppoppppooGyGGGo',
    '..oppppoppppoobbbbbo',
    '..oppppoppppoobBBBbo',
    '..oppo..oppo.ooooooo',
    '..oppo..oppo........',
    '.owwwo..owwwo.......',
    '.ooooo..ooooo.......',
  ];
  let sprite = null;
  function bake() {
    const c = RS.Sprites.cv(20, 28), x = c.getContext('2d');
    ART.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const col = PAL[row[i]]; if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } } });
    return c;
  }
  const LINES = ['PLEASURE DOING BUSINESS', "YOU DIDN'T GET IT FROM ME", 'NEXT ONE COSTS MORE', 'STAY GEEKED', 'SAME TIME NEXT WEEK'];

  Object.assign(RS.Game, {
    // the deal tier = deals already made this run; it drives the price, the rarity floor and THE PLUG'S CUT
    plugFloor() { return Math.min(4, 1 + (this.plugBuys || 0)); },
    plugCut() { return 4 + 4 * (this.plugBuys || 0); }, // +% damage added by every card he sells
    plugPrice(rar) { return Math.round((12 + 2 * this.p.level) * Math.pow(1.6, this.plugBuys || 0) * (1 + 0.2 * Math.max(0, (rar | 0) - this.plugFloor())) * this.p.s.plugCost); }, // plugCost: GREEN FLAG
    // a random spot anywhere on the map: off screen, clear of props, and away from the spot he just left
    placePlug() {
      const A = this.arena, p = this.p, c = this.cam, last = this.plugLast;
      const minD = Math.max(c.vw, c.vh) * 0.75;
      let pos = null;
      for (let i = 0; i < 60 && !pos; i++) {
        const x = U.rand(260, A.w - 260), y = U.rand(260, A.h - 260);
        if (Math.hypot(x - p.x, y - p.y) < minD) continue;
        if (last && i < 40 && Math.hypot(x - last.x, y - last.y) < 900) continue;
        if (RS.Arena.solidAt(A, x, y, 60) || RS.Arena.solidAt(A, x + 40, y, 40)) continue; // his briefcase stands to his right
        pos = { x, y };
      }
      if (!pos) pos = RS.Director.eventPos(this, minD, minD * 2);
      this.plug = { x: pos.x, y: pos.y, leaving: 0, cards: null, sig: '', ph: Math.random() * 6 };
      this.plugLast = pos;
      if (!this.plugSeen) { this.plugSeen = true; FX.banner('THE PLUG IS ON THE DECK', 'cash icon on your minimap · E to deal', '#9cff35', 2.6, true); }
    },
    updatePlug(dt) {
      const p = this.p;
      if (this.plugNext === undefined) this.plugNext = FIRST;
      const pl = this.plug;
      if (!pl) { this.nearPlug = false; if (this.time >= this.plugNext && this.state === 'run') this.placePlug(); return; }
      if (pl.leaving > 0) {
        pl.leaving -= dt;
        if (pl.leaving <= 0) { FX.pop(pl.x, pl.y - 30, 26, ['#9cff35', '#ffffff'], 'glitch'); this.plug = null; this.plugNext = this.time + MOVE; }
        this.nearPlug = false;
        return;
      }
      this.nearPlug = !p.dead && U.dist2(p.x, p.y, pl.x, pl.y) < REACH * REACH; // he stays put until you deal
    },
    usePlug() {
      const pl = this.plug;
      if (!pl || pl.leaving > 0 || this.state !== 'run') return;
      this.modalQueue.unshift({ type: 'plug' });
      this.openNextModal();
    },
    // the 3 offers of this spot: rolled once and then fixed (same goods, same prices) until you buy and he moves on.
    // If the build changed between two visits (a level-up), each card is rebuilt for the SAME item so its "LV 3 -> 4"
    // line is current; only a slot whose item cannot be offered any more (maxed, slots full) gets a new card.
    // (playtest: every visit after a level-up showed new goods at new prices, it looked like opening him rerolled)
    plugCards() {
      const pl = this.plug, p = this.p, P = RS.Progression;
      const sig = p.weapons.map((w) => w.def.id + w.level).join() + '|' + p.passives.map((i) => i.id + i.level).join();
      if (pl.cards && pl.sig === sig) return pl.cards;
      const floor = this.plugFloor(), boost = 1 + 0.35 * Math.max(0, (this.plugBuys || 0) - 3);
      if (!pl.slots) pl.slots = [0, 1, 2].map((i) => {
        const rar = Math.max(floor, P.rollRarity(p)), sl = { rar, price: this.plugPrice(rar), id: null, card: null };
        if (i === 2 && Math.random() < 0.35) sl.stashId = RS.Stash.pickId(p, rar); // the third slot can hold a stash item
        return sl;
      });
      // three DIFFERENT items, whatever their rarity (never a COMMON GLOCK next to a RARE GLOCK: a weapon's level, MODS
      // and evolution are one type, a TAPE and the stat card of its stat are one type), and at most two of them weapons
      const used = new Set(), out = [], cut = this.plugCut(), per = {}, types = new Set();
      let guns = 0;
      const fits = (c) => !!c && !types.has(P.typeOf(c)) && !(guns >= 2 && c.kind.startsWith('weapon'));
      for (const sl of pl.slots) {
        let c = null;
        if (sl.stashId) c = RS.Stash.plugCard(this, sl.stashId);
        else if (sl.card && (sl.card.kind === 'stat' || sl.card.kind === 'special' || sl.card.kind === 'weapon_mod')) c = sl.card; // these do not depend on the build
        else if (sl.key) { const same = P.candidates(this, used, per, sl.rar).find((x) => x.key === sl.key); if (same) c = P.cardFor(this, same, sl.rar, boost); }
        if (!fits(c)) c = null;
        for (let k = 0; k < 8 && !c; k++) { const d = P.makeCard(this, used, sl.rar, boost, per); if (!d) break; if (fits(d)) c = d; else used.add(d.key); }
        if (!c) continue;
        used.add(c.key); types.add(P.typeOf(c));
        if (c.wid) per[c.wid] = (per[c.wid] || 0) + 1;
        if (c.kind === 'weapon_new') per.__new = 1;
        if (c.kind.startsWith('weapon')) guns++;
        if (c !== sl.card) {
          const base = c.apply;
          c.effects.push('+' + cut + '% damage (plug cut)');
          c.apply = () => { base(); p.bonus.might += cut / 100; p.recalc(); };
        }
        c.price = sl.price;
        sl.id = c.id; sl.key = c.key; sl.card = c;
        out.push(c);
      }
      pl.cards = out; pl.sig = sig;
      return out;
    },
    buyPlug(c) {
      const pl = this.plug, p = this.p;
      if (!pl || !c || this.runClout < c.price) return false;
      this.runClout -= c.price; // stats.coins keeps what you picked up
      c.apply();
      p.recalc();
      this.plugBuys = (this.plugBuys || 0) + 1;
      this.stats.plugDeals = (this.stats.plugDeals || 0) + 1;
      pl.leaving = LEAVE; pl.cards = null; pl.slots = null;
      RS.Stash.onInteract(this, p); // GHOST TOWN
      FX.text(pl.x, pl.y - 110, U.pick(LINES), '#9cff35', 16, { always: true, life: 2 });
      FX.ring(p.x, p.y, 90, RS.Data.RARITY[c.rarity].col, 0.4, 5, 0.15);
      FX.burst(pl.x, pl.y - 30, ['#9cff35', '#ffe14a', '#ffffff'], 12, 280, { kind: 'line' });
      this.sfx(c.rarity >= 3 ? 'rare' : 'pickup');
      return true;
    },
  });

  // world drawing: the dealer as pixel art on the same whole-pixel rules as the props; labels on the crisp HUD layer
  RS.Plug = {
    draw(ctx, G, R) {
      const pl = G.plug;
      if (!pl) return;
      const v = G.view();
      if (pl.x < v.x0 - 80 || pl.x > v.x1 + 80 || pl.y < v.y0 - 120 || pl.y > v.y1 + 80) return;
      if (!sprite) sprite = bake();
      const t = G.time, sc = R.pixK(K), out = pl.leaving > 0 ? U.clamp(pl.leaving / LEAVE, 0, 1) : 1;
      const X = R.snap(pl.x) - 10 * sc, Y = R.snap(pl.y + 8) - 28 * sc; // feet on pl.y + 8
      R.contact(ctx, pl.x + 6, pl.y + 8, 40, 10, 0.5);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = out;
      const breathe = Math.sin(t * 2.2 + pl.ph) > 0.2 ? 1 : 0; // ~0.35 Hz, slow
      ctx.drawImage(sprite, 0, 16, 20, 12, X, Y + 16 * sc, 20 * sc, 12 * sc);
      ctx.drawImage(sprite, 0, 0, 20, 16, X, Y + breathe * sc, 20 * sc, 16 * sc);
      ctx.globalAlpha = 1;
      // the goods glow softly (a slow pulse, never a blink) and light the floor around him
      const glow = 0.45 + 0.15 * Math.sin(t * 2.6 + pl.ph);
      RS.Post.glow(X + 16.5 * sc, Y + 21 * sc, 34, '#9cff35', glow * out);
      RS.Post.light(pl.x, pl.y, 190, '#9cff35', 0.32 * out);
      if (pl.leaving > 0) { R.label(pl.x, Y - 10, 'PACKING UP…', '#8a9095', 12, out); return; }
      R.label(pl.x, Y - 10, 'THE PLUG', '#9cff35', 13);
      if (G.nearPlug) R.label(pl.x, Y - 30, '[E]  DEAL · FROM $' + (pl.slots ? Math.min(...pl.slots.map((q) => q.price)) : G.plugPrice(G.plugFloor())), '#ffe14a', 14);
    },
  };
})(window.RS);
