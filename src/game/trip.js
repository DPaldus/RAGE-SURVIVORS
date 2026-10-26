'use strict';
// The trip: every run starts with the hero downing a fictional party drink. From then on a "geek" level rises,
// the screen slowly warps and hallucinations join the crowd as real enemies. Each run rolls a theme that decides
// which hallucinations dominate and what the periodic TRIP PEAK looks like.
(function (RS) {
  const U = RS.U, FX = RS.FX;

  // fictional, cartoon consumables (no real brands, doses or preparation)
  const DRINKS = {
    cup: { id: 'cup', name: 'DOUBLE CUP', verb: 'SIPS THE', col: '#b45cff', line: 'one sip. the floor starts breathing.' },
    pill: { id: 'pill', name: 'SMILEY PERC', verb: 'POPS A', col: '#9fe9ff', line: 'it smiled back. that was the first problem.' },
  };
  const THEMES = {
    stampede: { id: 'stampede', name: 'PINK STAMPEDE', sub: 'the ponies are not stopping', col: '#ff6ad5', fav: ['pony', 'smiley'], peak: 'stampede' },
    ghosts: { id: 'ghosts', name: 'AFTERPARTY GHOSTS', sub: 'everyone is dancing. nobody is real', col: '#3ff2ff', fav: ['dancer', 'stretch'], peak: 'ring' },
    giant: { id: 'giant', name: 'EVERYTHING IS HUGE', sub: 'the drip got way too big', col: '#ffe14a', fav: ['bigshoe', 'stretch'], peak: 'stomp' },
    smile: { id: 'smile', name: 'SMILE LOOP', sub: 'they keep multiplying', col: '#ffd23f', fav: ['smiley', 'dancer'], peak: 'rain' },
  };
  // every character has a go-to drink and leans toward certain trips
  const CHAR = {
    twizzy: { drinks: ['cup', 'cup', 'pill'], themes: ['stampede', 'ghosts', 'giant', 'smile', 'stampede'] },
    schmunk: { drinks: ['pill', 'pill', 'cup'], themes: ['smile', 'giant', 'ghosts', 'stampede', 'smile'] },
  };
  const HALLUC = ['pony', 'stretch', 'dancer', 'bigshoe', 'smiley'];

  const Trip = {
    DRINKS, THEMES, HALLUC,
    roll(charId) {
      const c = CHAR[charId] || CHAR.twizzy;
      return { drink: DRINKS[U.pick(c.drinks)], theme: THEMES[U.pick(c.themes)] };
    },
    start(G, roll) {
      const r = roll || this.roll(G.cfg.char);
      G.trip = { drink: r.drink, theme: r.theme, peak: 0, nextPeak: U.rand(100, 115), shown: 0 };
    },
    // 0..1.5: base ramp over the first 9 minutes plus a bump during a peak
    level(G) {
      const T = G.trip;
      if (!T) return 0;
      return Math.min(1.5, 0.3 + G.time / 540 * 0.7 + (T.peak > 0 ? 0.55 * Math.min(1, T.peak / 2) : 0));
    },
    // spawn weight multiplier for a hallucination type
    weight(G, id) {
      const T = G.trip;
      if (!T) return 0;
      return this.level(G) * (T.theme.fav.includes(id) ? 2.6 : 1) * (T.peak > 0 ? 1.8 : 1);
    },
    update(G, dt) {
      const T = G.trip;
      if (!T) return;
      if (T.peak > 0) T.peak -= dt;
      if (G.time >= T.nextPeak && !G.bosses.length) {
        T.nextPeak = G.time + U.rand(95, 125);
        this.peak(G);
      }
      // feed the screen warp
      const P = RS.Post, k = this.level(G);
      P.trip = U.clamp((k - 0.2) * 0.55, 0, 0.75) * (RS.Save.s.reduceFlash ? 0.4 : 1);
      P.tripCol = T.theme.col;
      P.tt = G.time;
    },
    peak(G) {
      const T = G.trip, th = T.theme, p = G.p, D = RS.Director;
      T.peak = 16;
      FX.banner('TRIP PEAK', th.name + ' · ' + th.sub, th.col, 2.6);
      FX.flash(th.col, 0.3); FX.glitch(0.25);
      G.sfx('trip');
      const tier = D.tierFor(G), hp = D.hpMul(G);
      const ring = (type, n, R) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * U.TAU;
          if (D.inLane(G, a, 0.6)) continue; // never a closed circle: the escape lane stays open
          const x = U.clamp(p.x + Math.cos(a) * R, 40, G.arena.w - 40), y = U.clamp(p.y + Math.sin(a) * R * 0.8, 40, G.arena.h - 40);
          G.spawnEnemy(type, x, y, { tier, hpMul: hp, telegraph: true });
        }
      };
      if (th.peak === 'stampede') {
        // a herd of ponies galloping across the screen in a lane: dodge out of it
        const c = G.cam, horiz = Math.random() < 0.6, dir = Math.random() < 0.5 ? 1 : -1, n = Math.min(24, 6 + Math.floor(G.time / 30));
        const off = U.rand(-0.2, 0.2) * (horiz ? c.vh : c.vw);
        for (let i = 0; i < n; i++) {
          const lag = i * 46 + U.rand(-10, 10), jit = U.rand(-70, 70);
          const x = horiz ? p.x - dir * (c.vw / 2 + 120 + lag) : p.x + off + jit, y = horiz ? p.y + off + jit : p.y - dir * (c.vh / 2 + 120 + lag);
          if (x < 30 || y < 30 || x > G.arena.w - 30 || y > G.arena.h - 30) continue;
          const e = G.spawnEnemy('pony', x, y, { tier, hpMul: hp * 0.7, ai: 'stream', dirX: horiz ? dir : 0, dirY: horiz ? 0 : dir, ttl: 9 });
          e.spd = 420 * U.rand(0.92, 1.08); e.facing = horiz ? dir : 1;
        }
      } else if (th.peak === 'ring') ring('dancer', Math.min(14, 4 + Math.floor(G.time / 60)), 440);
      else if (th.peak === 'stomp') { if (G.time < 300) ring('smiley', 6, 480); else ring('bigshoe', Math.min(5, 1 + Math.floor(G.time / 180)), 470); } // giants only once the run is warm
      else ring('smiley', Math.min(18, 6 + Math.floor(G.time / 50)), 480);
    },
  };
  RS.Trip = Trip;
})(window.RS);
