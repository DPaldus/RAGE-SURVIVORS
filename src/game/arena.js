'use strict';
// Arena layout (the parking deck: platforms, props, aisle lamps, floor decals), collisions and environmental hazards.
(function (RS) {
  const U = RS.U, FX = RS.FX, S = RS.Sprites;
  const W = 3400, H = 3400;

  // prop catalogue: collider + behaviour
  const PROPS = {
    carV: { solid: true, rect: [46, 94], sprite: 'carV', scale: 2.4, oy: 2 }, // nose-in parked in a stall
    pillar: { solid: true, rect: [38, 28], sprite: 'pillar', scale: 2.2, tall: true },
    barrier: { solid: true, rect: [66, 18], sprite: 'barrier', scale: 2.3 },
    barrel: { solid: true, circle: 13, sprite: 'barrel', scale: 2.4, hp: 20, loot: true },
    toxic: { solid: true, circle: 15, sprite: 'toxic', scale: 2.3, hp: 26, loot: true, rich: true, glow: '#9cff35' },
    trash: { solid: true, circle: 14, sprite: 'trash', scale: 2.3, hp: 14, loot: true },
    crate: { solid: true, circle: 15, sprite: 'crate', scale: 2.3, hp: 14, loot: true },
    cone: { solid: false, circle: 8, sprite: 'cone', scale: 2.2, hp: 4 },
    speaker: { solid: true, circle: 18, sprite: 'speaker', scale: 2.3, hp: 40, hazard: 'explode' },
    amp: { solid: true, circle: 20, sprite: 'amp', scale: 2.3, hazard: 'pulse' },
    panel: { solid: true, circle: 14, sprite: 'panel', scale: 2.3, hazard: 'panel' },
    dumpster: { solid: true, rect: [72, 30], sprite: 'dumpster', scale: 2.3 },
    pallet: { solid: false, circle: 18, sprite: 'pallet', scale: 2.3 },
  };

  const Arena = {
    W, H,
    build(def) {
      const A = { w: W, h: H, def, props: [], platforms: [], lamps: [], decals: [], grid: new Map(), cell: 160, surgeT: 0 };
      const cx = W / 2, cy = H / 2;
      const free = (x, y, r) => {
        if (Math.hypot(x - cx, y - cy) < 260) return false;
        for (const q of A.props) if (Math.hypot(q.x - x, q.y - y) < r + q.rad + 30) return false;
        for (const pl of A.platforms) if (x > pl.x - r && x < pl.x + pl.w + r && y > pl.y - r && y < pl.y + pl.h + r) return false;
        return true;
      };
      // platforms (raised loading docks / stages)
      for (let i = 0; i < def.platforms; i++) {
        const w = U.randi(220, 340), h = U.randi(150, 220);
        for (let t = 0; t < 30; t++) {
          const x = U.rand(200, W - 200 - w), y = U.rand(200, H - 200 - h);
          if (Math.hypot(x + w / 2 - cx, y + h / 2 - cy) < 420) continue;
          if (A.platforms.some((o) => x < o.x + o.w + 120 && x + w + 120 > o.x && y < o.y + o.h + 120 && y + h + 120 > o.y)) continue;
          A.platforms.push({ x, y, w, h });
          break;
        }
      }
      // props
      this.layoutDeck(A, def, free);
      // a light over the start point (the aisle fluorescents come with the layout)
      A.lamps.push({ x: cx, y: cy - 60, ph: 0, flick: false });
      // floor decals: painted markings, oil, graffiti, ground wear
      // parking bays (laid out with the props so cars sit in the stalls)
      for (const b of A.bays || []) A.decals.push({ k: 'bay', x: b.x, y: b.y, len: b.len, gap: 120 });
      // road markings live on the drive aisles between the bay rows
      const aisles = [];
      for (let row = 0; row < 6; row++) { const y = 330 + row * 560 + 280; if (y < H - 120) aisles.push(y); }
      for (let i = 0; i < 6; i++) { const y = U.pick(aisles); A.decals.push({ k: 'zebra', x: U.rand(300, W - 500), y: y - 65, n: U.randi(4, 6), vert: false, b: null }); }
      for (let i = 0; i < 10; i++) A.decals.push({ k: 'arrow2', x: U.rand(260, W - 260), y: U.pick(aisles), rot: Math.PI / 2 * U.pick([1, -1]) });
      for (let i = 0; i < 8; i++) A.decals.push({ k: 'manhole', x: U.rand(200, W - 200), y: U.pick(aisles) + U.rand(-90, 90) });
      for (let i = 0; i < 8; i++) A.decals.push({ k: 'skid', x: U.rand(260, W - 260), y: U.pick(aisles), r: U.rand(110, 200), a0: U.rand(U.TAU), sweep: U.rand(1.2, 2.2) });
      // oil drips under the parked cars
      for (const pr of A.props) if (pr.type === 'carV' && Math.random() < 0.45) A.decals.push({ k: 'oil', x: pr.x + U.rand(-8, 8), y: pr.y + U.rand(-16, 16), r: U.rand(14, 30), r2: U.rand(8, 16) });
      for (let i = 0; i < 8; i++) A.decals.push({ k: 'splat', x: U.rand(150, W - 150), y: U.rand(150, H - 150), col: U.pick(['#9cff35', '#e2b934', '#f2f2ec']), n: U.randi(8, 18), r: U.rand(14, 32) });
      // a handful of big crew pieces near the walls and the stages, not all over the floor
      const words = [['RAGE', '#7fd12a', 'crown'], ['SLATT', '#e2b934', null], ['B2', '#ecebe4', null], ['TWIZZYRICH', '#ecebe4', 'cross'], ['SCHMUNK', '#9cff35', null], ['KUDLIS', '#ff2448', null], ['LEAK IT', '#ff4f6e', null]];
      const spots = A.platforms.map((pl) => [pl.x + pl.w / 2, pl.y + pl.h + 70]).concat([[U.rand(400, W - 400), 150], [U.rand(400, W - 400), H - 150], [160, U.rand(400, H - 400)], [W - 160, U.rand(400, H - 400)]]);
      U.shuffle(spots).slice(0, words.length).forEach((sp, i) => { const w = words[i % words.length]; A.decals.push({ k: 'graffiti', x: sp[0] + U.rand(-60, 60), y: sp[1], word: w[0], col: w[1], sym: w[2], rot: U.rand(-0.12, 0.12), size: U.rand(70, 95) }); });
      // ground material layers: big tonal blotches, repaired patches, mossy cracks, puddles, litter, gravel, glass, drains
      for (let i = 0; i < 36; i++) A.decals.push({ k: 'tone', x: U.rand(0, W), y: U.rand(0, H), r: U.rand(220, 520), dark: Math.random() < 0.6 });
      for (let i = 0; i < 12; i++) {
        const w = U.rand(120, 300), h = U.rand(60, 160), x = U.rand(150, W - 450), y = U.rand(150, H - 300), sp = [];
        for (let k = 0; k < 40; k++) sp.push(U.rand(w), U.rand(h), Math.random() < 0.5 ? 1 : 0);
        A.decals.push({ k: 'patch', x, y, w, h, sp, b: [x - 4, y - 4, x + w + 4, y + h + 4] });
      }
      for (let i = 0; i < 24; i++) {
        let x = U.rand(150, W - 150), y = U.rand(150, H - 150); const pts = [x, y], moss = [];
        let a = U.rand(U.TAU);
        for (let k = 0; k < 10; k++) { a += U.rand(-0.7, 0.7); x += Math.cos(a) * U.rand(10, 26); y += Math.sin(a) * U.rand(10, 26); pts.push(x, y); if (Math.random() < 0.55) moss.push(x + U.rand(-4, 4), y + U.rand(-3, 3), U.randi(2, 4), U.pick(['#4f7a2a', '#6d9a36', '#3d6020', '#88b544'])); }
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (let k = 0; k < pts.length; k += 2) { bx0 = Math.min(bx0, pts[k]); bx1 = Math.max(bx1, pts[k]); by0 = Math.min(by0, pts[k + 1]); by1 = Math.max(by1, pts[k + 1]); }
        A.decals.push({ k: 'crack', pts, moss, b: [bx0 - 8, by0 - 8, bx1 + 8, by1 + 8] });
      }
      const lampProps = A.lamps;
      for (let i = 0; i < 14; i++) {
        let x, y;
        if (i < 9 && lampProps.length) { const lp = U.pick(lampProps); x = lp.x + U.rand(-90, 90); y = lp.y + U.rand(40, 150); }
        else { x = U.rand(200, W - 200); y = U.rand(200, H - 200); }
        const blobs = [], n = U.randi(3, 5);
        for (let k = 0; k < n; k++) blobs.push([U.rand(-60, 60), U.rand(-16, 16), U.rand(26, 70), U.rand(10, 24)]);
        let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (const [ox, oy, rx, ry] of blobs) { bx0 = Math.min(bx0, x + ox - rx); bx1 = Math.max(bx1, x + ox + rx); by0 = Math.min(by0, y + oy - ry); by1 = Math.max(by1, y + oy + ry); }
        A.decals.push({ k: 'puddle', x, y, blobs, ph: U.rand(10), b: [bx0 - 6, by0 - 6, bx1 + 6, by1 + 6], box: [bx0, by0, bx1, by1] });
      }
      const LITTER = [['#e9e6da', 6, 4], ['#d8d2bd', 5, 5], ['#b8bcc0', 3, 6], ['#c8302f', 3, 6], ['#4f8a2a', 3, 6], ['#e2b934', 2, 2], ['#f2f2ec', 7, 5]];
      for (let i = 0; i < 50; i++) {
        const x = U.rand(120, W - 120), y = U.rand(120, H - 120), items = [];
        for (let k = U.randi(1, 3); k > 0; k--) { const t = U.pick(LITTER); items.push(U.rand(-14, 14), U.rand(-10, 10), U.rand(U.TAU), t[0], t[1], t[2]); }
        A.decals.push({ k: 'litter', x, y, items, b: [x - 24, y - 20, x + 24, y + 20] });
      }
      for (let i = 0; i < 28; i++) {
        const x = U.rand(120, W - 120), y = U.rand(120, H - 120), pts = [];
        for (let k = U.randi(8, 22); k > 0; k--) pts.push(U.rand(-18, 18), U.rand(-12, 12), U.pick([1, 2, 2, 3]), U.pick(['#7a7c7e', '#8f9193', '#3e3f42', '#a3a5a6']));
        A.decals.push({ k: 'gravel', x, y, pts, b: [x - 22, y - 16, x + 22, y + 16] });
      }
      for (let i = 0; i < 12; i++) {
        const x = U.rand(160, W - 160), y = U.rand(160, H - 160), pts = [];
        for (let k = U.randi(5, 10); k > 0; k--) pts.push(U.rand(-16, 16), U.rand(-10, 10), U.rand(U.TAU), U.rand(2, 5));
        A.decals.push({ k: 'glass', x, y, pts, ph: U.rand(10), b: [x - 22, y - 16, x + 22, y + 16] });
      }
      for (let i = 0; i < 8; i++) { const x = U.rand(200, W - 200), y = U.rand(200, H - 200); A.decals.push({ k: 'drain', x, y, b: [x - 30, y - 16, x + 30, y + 16] }); }
      const order = { tone: -3, patch: -2, crack: -1, bay: 0, zebra: 0, arrow2: 0, drain: 0.5, manhole: 1, oil: 1, puddle: 1.5, skid: 2, gravel: 2.5, splat: 3, litter: 3.5, glass: 3.5, graffiti: 4 };
      A.decals.sort((a, b) => (order[a.k] || 0) - (order[b.k] || 0));
      A.blood = [];
      A.puddles = A.decals.filter((d) => d.k === 'puddle');
      A.glass = A.decals.filter((d) => d.k === 'glass');
      A.manholes = A.decals.filter((d) => d.k === 'manhole' && Math.random() < 0.6);
      A.chunks = new Map(); A.chunkFree = []; A.chunkZ = 0; A.chunkBuilds = 0;
      // a few parked cars left with their hazard lights blinking
      for (const pr of A.props) if ((pr.type === 'car' || pr.type === 'carV') && Math.random() < 0.12) { pr.haz = true; pr.hazPh = U.rand(1); }
      // spatial index for props
      for (const pr of A.props) {
        const k = Math.floor(pr.x / A.cell) + ',' + Math.floor(pr.y / A.cell);
        if (!A.grid.has(k)) A.grid.set(k, []);
        A.grid.get(k).push(pr);
      }
      return A;
    },
    // Structured parking-deck layout: cars parked in the stalls, columns at the end of every bay spine, speaker stacks
    // in front of the loading-dock stages, service clutter (dumpsters, bags, barrels) against the walls and a few
    // coned-off barrier closures on the drive aisles. The aisles themselves stay open so fights read clearly.
    layoutDeck(A, def, free) {
      const cap = Object.assign({}, def.props);
      cap.carV = cap.car; delete cap.car;
      const add = (type, x, y, extra) => {
        if (cap[type] !== undefined) { if (cap[type] <= 0) return null; cap[type]--; }
        const P = PROPS[type], rad = P.rect ? Math.hypot(P.rect[0], P.rect[1]) / 2 : P.circle;
        const pr = { type, P, x, y, rad, hp: P.hp || 0, maxHp: P.hp || 0, dead: false, t: U.rand(3, 7), cd: 0, active: 0, var: U.randi(0, 1000), flash: 0, respawn: 0 };
        if (P.rect) { pr.hw = P.rect[0] / 2; pr.hh = P.rect[1] / 2; }
        if (extra) Object.assign(pr, extra);
        A.props.push(pr);
        return pr;
      };
      const radOf = (type) => { const P = PROPS[type]; return P.rect ? Math.hypot(P.rect[0], P.rect[1]) / 2 : P.circle; };
      const tryAdd = (type, x, y) => (free(x, y, radOf(type)) ? add(type, x, y) : null);
      const onPlat = (x, y, m) => A.platforms.some((pl) => x > pl.x - m && x < pl.x + pl.w + m && y > pl.y - m && y < pl.y + pl.h + m);
      const nearCenter = (x, y, r) => Math.hypot(x - W / 2, y - H / 2) < r;
      const cluster = (cx, cy, types, n, spread) => {
        for (let i = 0; i < n; i++) for (let k = 0; k < 14; k++) if (tryAdd(U.pick(types), cx + U.rand(-spread, spread), cy + U.rand(-spread, spread) * 0.6)) break;
      };
      // bay rows and their stalls
      A.bays = [];
      const stalls = [];
      for (let row = 0; row < 6; row++) {
        const y = 330 + row * 560;
        for (let x = 220; x < W - 520; x += 900) {
          const len = U.pick([4, 5, 6]) * 120;
          A.bays.push({ x, y, len });
          for (const px of [x - 46, x + len + 46]) if (!onPlat(px, y, 40) && !nearCenter(px, y, 200)) add('pillar', px, y);
          for (let sx = x + 60; sx < x + len; sx += 120) for (const side of [-1, 1]) stalls.push([sx, y + side * 64, side]);
        }
      }
      // roughly half the stalls are taken; colours repeat in believable proportions
      for (const [sx, sy, side] of U.shuffle(stalls)) {
        if (Math.random() > 0.55 || onPlat(sx, sy, 70) || nearCenter(sx, sy, 300)) continue;
        add('carV', sx + U.rand(-5, 5), sy + U.rand(-3, 3), { var: 2 * U.pick([0, 0, 1, 1, 2, 3, 4]) + (side < 0 ? 1 : 0) });
      }
      // stages: speaker stacks flank the front of each loading dock, an amp in the middle, pallets on the side
      for (const pl of A.platforms) {
        add('speaker', pl.x + 26, pl.y + pl.h + 42); add('speaker', pl.x + pl.w - 26, pl.y + pl.h + 42);
        add('amp', pl.x + pl.w / 2, pl.y + pl.h + 46);
        tryAdd('pallet', pl.x - 60, pl.y + pl.h * 0.4);
        cluster(pl.x + pl.w + 70, pl.y + pl.h * 0.5, ['barrel', 'toxic', 'crate'], 2, 40);
      }
      // service clutter against the walls
      const wallSpot = () => {
        const s = U.randi(0, 3), t = U.rand(300, 3100);
        return s === 0 ? [t, 104] : s === 1 ? [W - 104, t] : s === 2 ? [t, H - 104] : [104, t];
      };
      for (let i = 0; i < 6; i++) {
        const [x, y] = wallSpot();
        if (!tryAdd('dumpster', x, y)) continue;
        cluster(x, y, ['trash', 'trash', 'barrel', 'crate'], 2, 110);
      }
      for (let i = 0; i < 5; i++) { const [x, y] = wallSpot(); cluster(x, y, ['barrel', 'barrel', 'toxic'], U.randi(2, 3), 60); }
      for (let i = 0; i < 8 && cap.panel > 0; i++) { const [x, y] = wallSpot(); tryAdd('panel', x, y); }
      // ceiling fluorescents light the drive aisles; a few closures with barriers and cones
      const aisles = [];
      for (let row = 0; row < 6; row++) { const y = 330 + row * 560 + 280; if (y < H - 120) aisles.push(y); }
      for (const y of aisles) for (let x = 260; x < W - 200; x += 430) A.lamps.push({ x: x + U.rand(-30, 30), y, ph: U.rand(10), flick: Math.random() < 0.12 });
      for (let i = 0; i < 10 && cap.barrier > 1; i++) {
        const y = U.pick(aisles) + U.rand(-60, 60), x = U.rand(400, W - 480);
        if (!free(x, y, 80) || !free(x + 76, y, 80)) continue;
        add('barrier', x, y); add('barrier', x + 76, y);
        tryAdd('cone', x - 64, y + U.rand(-30, 30)); tryAdd('cone', x + 140, y + U.rand(-30, 30)); tryAdd('cone', x + 38, y + 56);
      }
    },
    // props in the 3x3 cells around (x, y). The prop grid never changes after layout (dead props are skipped by
    // the callers), so each cell's neighbourhood is merged once and reused: no string keys, no garbage per call.
    near(A, x, y) {
      const cx = Math.floor(x / A.cell), cy = Math.floor(y / A.cell), key = (cx + 64) * 4096 + cy + 64;
      const nc = A.nearCache || (A.nearCache = new Map());
      let out = nc.get(key);
      if (out) return out;
      out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const l = A.grid.get(cx + dx + ',' + (cy + dy));
        if (l) for (const p of l) out.push(p);
      }
      nc.set(key, out);
      return out;
    },
    // push a circle entity out of solid props
    collide(A, ent, isPlayer) {
      const list = this.near(A, ent.x, ent.y);
      for (const pr of list) {
        if (pr.dead || !pr.P.solid) continue;
        if (pr.hw) {
          const nx = U.clamp(ent.x, pr.x - pr.hw, pr.x + pr.hw), ny = U.clamp(ent.y, pr.y - pr.hh, pr.y + pr.hh);
          const dx = ent.x - nx, dy = ent.y - ny, d2 = dx * dx + dy * dy;
          if (d2 < ent.r * ent.r) {
            if (d2 > 0.0001) { const d = Math.sqrt(d2); ent.x = nx + (dx / d) * ent.r; ent.y = ny + (dy / d) * ent.r; }
            else { // centre inside rect: push along shortest axis
              const ox = pr.hw - Math.abs(ent.x - pr.x), oy = pr.hh - Math.abs(ent.y - pr.y);
              if (ox < oy) ent.x += Math.sign(ent.x - pr.x || 1) * (ox + ent.r); else ent.y += Math.sign(ent.y - pr.y || 1) * (oy + ent.r);
            }
          }
        } else {
          const rr = ent.r + pr.P.circle;
          const dx = ent.x - pr.x, dy = ent.y - pr.y, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2); ent.x = pr.x + (dx / d) * rr; ent.y = pr.y + (dy / d) * rr; }
        }
      }
      if (isPlayer) { ent.x = U.clamp(ent.x, ent.r + 8, A.w - ent.r - 8); ent.y = U.clamp(ent.y, ent.r + 8, A.h - ent.r - 8); }
    },
    solidAt(A, x, y, r) {
      for (const pr of this.near(A, x, y)) {
        if (pr.dead || !pr.P.solid) continue;
        if (pr.hw) { if (Math.abs(x - pr.x) < pr.hw + r && Math.abs(y - pr.y) < pr.hh + r) return true; }
        else if (Math.hypot(x - pr.x, y - pr.y) < pr.P.circle + r) return true;
      }
      return false;
    },
    onPlatform(A, x, y) {
      for (const pl of A.platforms) if (x > pl.x && x < pl.x + pl.w && y > pl.y && y < pl.y + pl.h) return true;
      return false;
    },

    // ---------------------------------------------------------- destructibles + hazards
    hurtProp(G, pr, dmg) {
      if (pr.dead || !pr.maxHp) return;
      pr.hp -= dmg; pr.flash = 0.1;
      if (Math.random() < 0.5) FX.debris(pr.x, pr.y - 10, this.propCols(pr), 2, 120);
      if (pr.hp <= 0) this.breakProp(G, pr);
    },
    breakProp(G, pr) {
      pr.dead = true;
      FX.burst(pr.x, pr.y, ['#5a6070', '#2a2a33', '#9aa3b2', '#ff2448'], 6, 220, { size: 4 });
      FX.debris(pr.x, pr.y - 10, this.propCols(pr), 10, 240);
      FX.smoke(pr.x, pr.y - 6, 4, 14, '#bfc2bd', { spd: 50, vy: -14, life: 0.9, grow: 1.8, alpha: 0.3 });
      G.sfx('break');
      if (pr.P.hazard === 'explode') {
        pr.respawn = 60;
        G.telegraph({ kind: 'circle', x: pr.x, y: pr.y, r: 170, warn: 0.45, dmg: 10, col: '#ff7a1a', knock: 420,
          onFire: (t) => {
            G.aoe(t.x, t.y, t.r, 120 + G.time * 0.6, { knock: 520, ring: '#ff7a1a', fill: 0.35, boom: true, noCrit: true, src: 'env' });
            G.sfx('explode', { big: true });
            FX.shake(0.4);
          } });
      } else if (pr.P.loot) {
        pr.respawn = 60;
        RS.Stash.propDrop(G, pr); // now and then a stash item inside
        if (pr.P.rich) { G.dropXp(pr.x, pr.y, 8 + G.time / 30, true); if (Math.random() < 0.3) G.dropConsumable(pr.x + 20, pr.y); FX.burst(pr.x, pr.y, ['#9cff35', '#c8ff7d'], 14, 260, { size: 4 }); return; }
        const r = Math.random();
        if (r < 0.05) G.dropConsumable(pr.x, pr.y);
        else if (r < 0.2) G.dropCoin(pr.x, pr.y, 1);
        else if (r < 0.5) G.dropXp(pr.x, pr.y, 3 + G.time / 60, true);
      } else pr.respawn = 30;
    },
    propCols(pr) {
      return ({ barrel: ['#2a2c2f', '#4a4d52', '#8a2330'], toxic: ['#2f5a1c', '#9cff35', '#1e2a16'], trash: ['#141516', '#2a2d2f', '#5a7a2a'],
        crate: ['#7a5230', '#a4743f', '#4a3220'], cone: ['#ff6a1a', '#f2f2ec'], speaker: ['#141418', '#3a3a44', '#ff2448'] })[pr.type] || ['#5a6070', '#2a2a33', '#9aa3b2'];
    },
    damageProps(G, x, y, r, dmg) {
      for (const pr of this.near(G.arena, x, y)) {
        if (pr.dead || !pr.maxHp) continue;
        if (Math.hypot(pr.x - x, pr.y - y) < r + pr.rad * 0.6) this.hurtProp(G, pr, dmg);
      }
    },
    projHitsProps(G, pr) {
      if (pr.noHitDmg && pr.kind !== 'rocket') return;
      for (const q of this.near(G.arena, pr.x, pr.y)) {
        if (q.dead || !q.maxHp) continue;
        if (Math.hypot(q.x - pr.x, q.y - pr.y) < pr.r + q.rad * 0.7) {
          if (q.hitBy === pr) continue;
          q.hitBy = pr;
          this.hurtProp(G, q, Math.max(pr.dmg, 6));
          if (pr.kind === 'rocket') { pr.dead = true; return; }
        }
      }
    },
    surge(G) { for (const pr of G.arena.props) if (pr.P.hazard === 'panel') { pr.active = 6; pr.cd = 0; } },

    update(G, dt) {
      const A = G.arena, p = G.p;
      // ambient life: steam curling out of some manholes (skipped on LOW particles)
      if (A.manholes && RS.GFX && RS.Save.s.particles > 0) {
        A.steamT = (A.steamT || 0) - dt;
        if (A.steamT <= 0) {
          A.steamT = 0.14;
          for (const d of A.manholes) if (G.onScreen(d.x, d.y, 80) && U.per(0.4, dt)) FX.smoke(d.x + U.rand(-14, 14), d.y - 4, 1, 11, '#eef0f2', { spd: 6, vx: 6, vy: -20, life: 1.8, grow: 2.6, alpha: 0.13 });
        }
      }
      for (const pr of A.props) {
        pr.flash -= dt;
        if (pr.dead) {
          pr.respawn -= dt;
          if (pr.respawn <= 0 && Math.hypot(pr.x - p.x, pr.y - p.y) > 500 && !G.onScreen(pr.x, pr.y, 60)) { pr.dead = false; pr.hp = pr.maxHp; }
          continue;
        }
        const hz = pr.P.hazard;
        if (hz === 'pulse') {
          pr.t -= dt * (G.surgeT > 0 ? 3 : 1);
          if (pr.t <= 0) {
            pr.t = U.rand(5, 7);
            if (Math.hypot(pr.x - p.x, pr.y - p.y) < 900) {
              G.later(0.45, () => {
                G.aoe(pr.x, pr.y, 150, 30 + G.time * 0.12, { knock: 380, ring: '#9cff35', fill: 0.25, noCrit: true, sonic: true, src: 'env' });
                G.sfx('wave808');
              });
              FX.ring(pr.x, pr.y, 150, '#9cff35', 0.45, 2, 0.08);
            }
          }
        } else if (hz === 'panel') {
          pr.cd -= dt;
          if (pr.active > 0) {
            pr.active -= dt;
            pr.t -= dt;
            if (pr.t <= 0) {
              pr.t = 0.25;
              const list = G.inRadius(pr.x, pr.y, 150);
              for (const e of list) {
                G.damage(e, 10 + G.time * 0.05, { noCrit: true, src: 'env', color: '#ffe14a' });
                if (U.per(0.3, dt)) FX.arc([pr.x, pr.y - 20, e.x, e.y], '#ffe14a', 0.1, 1.5);
              }
              if (U.per(0.6, dt)) FX.burst(pr.x + U.rand(-120, 120), pr.y + U.rand(-120, 120), ['#ffe14a', '#ffffff'], 2, 120, { kind: 'line', life: 0.2 });
            }
          } else if (pr.cd <= 0 && Math.hypot(pr.x - p.x, pr.y - p.y) < 60) {
            pr.active = 5; pr.cd = 18; pr.t = 0;
            G.sfx('zap');
          }
        }
      }
    },

    // ---------------------------------------------------------- drawing
    // Static ground is baked into 384px chunk canvases at the current zoom (LRU cached) and blitted at integer
    // device positions; only blood, pads, live hazards and (on the Canvas 2D path) light pools are drawn per frame.
    CHUNK: 384,
    drawFloor(ctx, G, v) {
      const A = G.arena, def = A.def, z = G.cam.zoom, R = RS.Render, P = this.CHUNK;
      if (A.chunkZ !== z || A.chunkW !== R.W || A.chunkH !== R.H) {
        for (const c of A.chunks.values()) A.chunkFree.push(c);
        A.chunks.clear(); A.chunkZ = z; A.chunkW = R.W; A.chunkH = R.H;
        A.chunkCap = Math.ceil((Math.ceil(R.W / P) + 2) * (Math.ceil(R.H / P) + 2) * 1.8);
      }
      const ex = R.ex, ey = R.ey, nx = Math.ceil(A.w * z / P), ny = Math.ceil(A.h * z / P);
      const cx0 = Math.max(-1, Math.floor(-ex / P)), cx1 = Math.min(nx, Math.floor((R.W - ex) / P));
      const cy0 = Math.max(-1, Math.floor(-ey / P)), cy1 = Math.min(ny, Math.floor((R.H - ey) / P));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      const built = A.chunkBuilds;
      for (let j = cy0; j <= cy1; j++) for (let i = cx0; i <= cx1; i++) ctx.drawImage(this.floorChunk(A, i, j, z), i * P + ex, j * P + ey);
      ctx.restore();
      if (A.chunkBuilds === built) this.prefetchChunk(A, z, cx0, cx1, cy0, cy1, nx, ny);
      // kill splats (fade out)
      for (let i = A.blood.length - 1; i >= 0; i--) {
        const b = A.blood[i], k = Math.min(1, (b.t - G.time) / 4);
        if (k <= 0) { A.blood.splice(i, 1); continue; }
        if (b.x < v.x0 - 60 || b.x > v.x1 + 60 || b.y < v.y0 - 60 || b.y > v.y1 + 60) continue;
        ctx.fillStyle = 'rgba(138,20,36,' + (0.55 * k) + ')';
        for (let j = 0; j < b.pts.length; j += 3) ctx.fillRect(b.pts[j], b.pts[j + 1], b.pts[j + 2], b.pts[j + 2]);
      }
      // Canvas 2D path only: green spill around toxic crates (the GPU path lights these)
      if (!RS.Post.active) {
        ctx.globalCompositeOperation = 'lighter';
        for (const pr of A.props) {
          if (pr.dead || !pr.P.glow) continue;
          if (pr.x < v.x0 - 200 || pr.x > v.x1 + 200 || pr.y < v.y0 - 200 || pr.y > v.y1 + 200) continue;
          ctx.globalAlpha = 0.22 + Math.sin(G.time * 3 + pr.x) * 0.05;
          ctx.drawImage(S.glow(pr.P.glow, 90), pr.x - 90, pr.y + 10 - 72, 180, 144);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      // live panels (ground layer)
      for (const pr of A.props) {
        if (pr.dead || pr.P.hazard !== 'panel' || pr.active <= 0) continue;
        ctx.fillStyle = 'rgba(255,225,74,0.07)'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 150, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,74,0.5)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pr.x, pr.y, 150, G.time, G.time + U.TAU); ctx.stroke(); ctx.setLineDash([]);
      }
    },
    // bake one missing chunk from the ring around the view (nearest to the walking direction first)
    prefetchChunk(A, z, cx0, cx1, cy0, cy1, nx, ny) {
      const cam = RS.Game.cam, vx = cam.x - (A.lastCamX === undefined ? cam.x : A.lastCamX), vy = cam.y - (A.lastCamY === undefined ? cam.y : A.lastCamY);
      A.lastCamX = cam.x; A.lastCamY = cam.y;
      const ox = vx > 0.5 ? 1 : vx < -0.5 ? -1 : 0, oy = vy > 0.5 ? 1 : vy < -0.5 ? -1 : 0;
      let best = null, bs = -1e9;
      for (let j = cy0 - 1; j <= cy1 + 1; j++) for (let i = cx0 - 1; i <= cx1 + 1; i++) {
        if (i >= cx0 && i <= cx1 && j >= cy0 && j <= cy1) continue;
        if (i < -1 || j < -1 || i > nx || j > ny || A.chunks.has(i * 1000 + j)) continue;
        const s = (i < cx0 ? -1 : i > cx1 ? 1 : 0) * ox + (j < cy0 ? -1 : j > cy1 ? 1 : 0) * oy;
        if (s > bs) { bs = s; best = [i, j]; }
      }
      if (best) this.floorChunk(A, best[0], best[1], z);
    },
    floorChunk(A, i, j, z) {
      const key = i * 1000 + j;
      let c = A.chunks.get(key);
      if (c) { A.chunks.delete(key); A.chunks.set(key, c); return c; } // LRU touch
      const P = this.CHUNK;
      c = A.chunkFree.pop() || S.cv(P, P);
      const x = c.getContext('2d'), sw = P / z, wx0 = i * sw, wy0 = j * sw;
      x.setTransform(z, 0, 0, z, -i * P, -j * P);
      x.imageSmoothingEnabled = false;
      this.paintStatic(x, A, c, wx0, wy0, wx0 + sw, wy0 + sw);
      A.chunks.set(key, c); A.chunkBuilds++;
      while (A.chunks.size > A.chunkCap) { const k0 = A.chunks.keys().next().value; A.chunkFree.push(A.chunks.get(k0)); A.chunks.delete(k0); }
      return c;
    },
    paintStatic(ctx, A, canvas, x0, y0, x1, y1) {
      const def = A.def;
      ctx.fillStyle = def.bg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (!A.pats || A.pats.floor !== def.floor) A.pats = { floor: def.floor, pat: ctx.createPattern(S.floors[def.floor], 'repeat'), curb: ctx.createPattern(S.hazardTile(), 'repeat'), slab: ctx.createPattern(S.floors.slab, 'repeat') };
      const pats = A.pats;
      ctx.fillStyle = pats.pat;
      const ax0 = Math.max(0, x0), ay0 = Math.max(0, y0), ax1 = Math.min(A.w, x1), ay1 = Math.min(A.h, y1);
      if (ax1 > ax0 && ay1 > ay0) ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
      // arena edge: hazard-striped curb with a soft occlusion band on the inside
      if (x0 < 60 || y0 < 60 || x1 > A.w - 60 || y1 > A.h - 60) {
        const ao = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => { const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh); };
        ao(0, 0, 40, 0, 0, 0, 40, A.h); ao(A.w, 0, A.w - 40, 0, A.w - 40, 0, 40, A.h); ao(0, 0, 0, 40, 0, 0, A.w, 40); ao(0, A.h, 0, A.h - 40, 0, A.h - 40, A.w, 40);
        ctx.strokeStyle = pats.curb; ctx.lineWidth = 16; ctx.strokeRect(-8, -8, A.w + 16, A.h + 16);
        ctx.strokeStyle = U.rgba(def.accent, 0.35); ctx.lineWidth = 2; ctx.strokeRect(1, 1, A.w - 2, A.h - 2);
      }
      for (const d of A.decals) {
        const b = this.bounds(d);
        if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
        this.drawDecal(ctx, d, A);
      }
      // platforms: raised concrete loading docks with a soft drop shadow and a hazard-striped lip
      for (const pl of A.platforms) {
        if (pl.x - 60 > x1 || pl.x + pl.w + 60 < x0 || pl.y - 60 > y1 || pl.y + pl.h + 90 < y0) continue;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 22 * A.chunkZ; ctx.shadowOffsetX = 6 * A.chunkZ; ctx.shadowOffsetY = 16 * A.chunkZ;
        ctx.fillStyle = '#5e5c56'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h + 18);
        ctx.restore();
        ctx.fillStyle = pats.slab; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.fillStyle = '#b4b2a9'; ctx.fillRect(pl.x, pl.y, pl.w, 3);
        ctx.fillStyle = '#0b0c0b'; ctx.fillRect(pl.x, pl.y + pl.h - 2, pl.w, 2);
        for (let x = pl.x; x < pl.x + pl.w; x += 24) { ctx.fillStyle = ((x - pl.x) / 24) % 2 ? '#d8b21e' : '#121212'; ctx.fillRect(x, pl.y + pl.h, Math.min(12, pl.x + pl.w - x), 5); }
        // painted chevrons mark the high ground
        ctx.fillStyle = 'rgba(226,185,52,0.75)';
        for (let i = 0; i < 3; i++) {
          const cx = pl.x + 26 + i * 22, cy = pl.y + 22;
          ctx.beginPath(); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx + 18, cy + 8); ctx.lineTo(cx + 18, cy + 13); ctx.lineTo(cx + 9, cy + 5); ctx.lineTo(cx, cy + 13); ctx.fill();
        }
      }
    },
    // world-space bounds of a decal (cached) so chunks only paint what overlaps them
    bounds(d) {
      if (d.b) return d.b;
      let r;
      switch (d.k) {
        case 'bay': d.b = [d.x - 12, d.y - 125, d.x + d.len + 12, d.y + 125]; break;
        case 'zebra': d.b = d.vert ? [d.x - 2, d.y - 2, d.x + 132, d.y + d.n * 36 + 2] : [d.x - 2, d.y - 2, d.x + d.n * 36 + 2, d.y + 132]; break;
        case 'graffiti': if (!d.img) d.img = this.graffitiImg(d); r = Math.hypot(d.img.width, d.img.height) / 4 + 12; d.b = [d.x - r, d.y - r, d.x + r, d.y + r]; break;
        case 'tone': d.b = [d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r]; break;
        default: r = (d.r || 0) + 70; d.b = [d.x - r, d.y - r, d.x + r, d.y + r];
      }
      return d.b;
    },
    drawDecal(ctx, d, A) {
      switch (d.k) {
        case 'bay': this.drawBay(ctx, d); break;
        case 'zebra': ctx.fillStyle = 'rgba(236,235,228,0.62)'; for (let i = 0; i < d.n; i++) { if (d.vert) ctx.fillRect(d.x, d.y + i * 36, 130, 18); else ctx.fillRect(d.x + i * 36, d.y, 18, 130); } break;
        case 'arrow2': this.drawArrow2(ctx, d); break;
        case 'manhole': {
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(d.x + 2, d.y + 3, 32, 0, U.TAU); ctx.fill();
          ctx.fillStyle = '#3c3e40'; ctx.beginPath(); ctx.arc(d.x, d.y, 30, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = '#6b6d6f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, 27, 0, U.TAU); ctx.stroke();
          ctx.strokeStyle = '#2c2d2f'; ctx.lineWidth = 2;
          for (let k = -18; k <= 18; k += 9) { ctx.beginPath(); ctx.moveTo(d.x + k, d.y - 20); ctx.lineTo(d.x + k, d.y + 20); ctx.moveTo(d.x - 20, d.y + k); ctx.lineTo(d.x + 20, d.y + k); ctx.stroke(); }
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, 29, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
          break;
        }
        case 'skid': ctx.strokeStyle = 'rgba(20,20,22,0.38)'; ctx.lineWidth = 7; for (const o of [0, 22]) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r + o, d.a0, d.a0 + d.sweep); ctx.stroke(); } break;
        case 'oil': // dark stain with a faint petrol-rainbow rim
          ctx.fillStyle = 'rgba(20,20,22,0.28)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r2, 0, 0, U.TAU); ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(155,77,255,0.10)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.8, d.r2 * 0.75, 0, 0, U.TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(80,210,180,0.09)'; ctx.beginPath(); ctx.ellipse(d.x + 1, d.y - 1, d.r * 0.62, d.r2 * 0.55, 0, 0, U.TAU); ctx.stroke();
          break;
        case 'splat':
          if (!d.pts) { d.pts = []; for (let i = 0; i < d.n; i++) { const a = U.rand(U.TAU), r = Math.pow(Math.random(), 1.6) * d.r; d.pts.push(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r, U.rand(2, 6)); } }
          ctx.fillStyle = U.rgba(d.col, 0.55);
          for (let i = 0; i < d.pts.length; i += 3) ctx.fillRect(d.pts[i], d.pts[i + 1], d.pts[i + 2], d.pts[i + 2]);
          break;
        case 'graffiti': this.drawGraffiti(ctx, d); break;
        case 'tone': {
          const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
          g.addColorStop(0, d.dark ? 'rgba(20,20,24,0.10)' : 'rgba(255,250,235,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
          break;
        }
        case 'patch': // newer, darker asphalt with sealed seams
          ctx.fillStyle = 'rgba(38,40,43,0.15)'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          for (let i = 0; i < d.sp.length; i += 3) if (d.sp[i + 2]) ctx.fillRect(d.x + d.sp[i], d.y + d.sp[i + 1], 2, 2);
          ctx.strokeStyle = 'rgba(22,23,25,0.32)'; ctx.lineWidth = 2; ctx.strokeRect(d.x, d.y, d.w, d.h);
          break;
        case 'crack': {
          ctx.strokeStyle = 'rgba(28,29,31,0.6)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(d.pts[0], d.pts[1]); for (let i = 2; i < d.pts.length; i += 2) ctx.lineTo(d.pts[i], d.pts[i + 1]); ctx.stroke();
          for (let i = 0; i < d.moss.length; i += 4) { ctx.fillStyle = d.moss[i + 3]; ctx.fillRect(d.moss[i], d.moss[i + 1], d.moss[i + 2], d.moss[i + 2]); }
          break;
        }
        case 'puddle': {
          if (!d.path) { d.path = new Path2D(); for (const [ox, oy, rx, ry] of d.blobs) { d.path.moveTo(d.x + ox + rx, d.y + oy); d.path.ellipse(d.x + ox, d.y + oy, rx, ry, 0, 0, U.TAU); } }
          // the union of the blobs is filled (never stroked) so overlapping ellipses read as one body of water
          const z = A.chunkZ || 1;
          ctx.save(); ctx.shadowColor = 'rgba(8,10,14,0.45)'; ctx.shadowBlur = 10 * z; // soft damp edge
          ctx.fillStyle = 'rgba(52,56,62,0.55)'; ctx.fill(d.path); ctx.restore();
          ctx.save(); ctx.translate(0, -1.6); ctx.fillStyle = 'rgba(225,235,245,0.32)'; ctx.fill(d.path); ctx.restore(); // far-edge highlight
          ctx.fillStyle = '#383e47'; ctx.fill(d.path);
          ctx.save(); ctx.clip(d.path);
          const g = ctx.createLinearGradient(0, d.box[1], 0, d.box[3]);
          g.addColorStop(0, 'rgba(178,204,232,0.30)'); g.addColorStop(0.55, 'rgba(110,135,170,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0.08)');
          ctx.fillStyle = g; ctx.fillRect(d.box[0], d.box[1], d.box[2] - d.box[0], d.box[3] - d.box[1]);
          ctx.restore();
          break;
        }
        case 'litter':
          for (let i = 0; i < d.items.length; i += 6) {
            ctx.save(); ctx.translate(d.x + d.items[i], d.y + d.items[i + 1]); ctx.rotate(d.items[i + 2]);
            const w = d.items[i + 4], h = d.items[i + 5];
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w, h);
            ctx.fillStyle = d.items[i + 3]; ctx.fillRect(-w / 2, -h / 2, w, h);
            if (w > 4) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 1); }
            ctx.restore();
          }
          break;
        case 'gravel':
          for (let i = 0; i < d.pts.length; i += 4) { ctx.fillStyle = d.pts[i + 3]; ctx.fillRect(d.x + d.pts[i], d.y + d.pts[i + 1], d.pts[i + 2], d.pts[i + 2]); }
          break;
        case 'glass':
          for (let i = 0; i < d.pts.length; i += 4) {
            const x = d.x + d.pts[i], y = d.y + d.pts[i + 1], a = d.pts[i + 2], r = d.pts[i + 3];
            ctx.fillStyle = 'rgba(205,232,240,0.55)';
            ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a + 2.2) * r * 0.7, y + Math.sin(a + 2.2) * r * 0.7); ctx.lineTo(x + Math.cos(a + 4) * r * 0.6, y + Math.sin(a + 4) * r * 0.6); ctx.fill();
          }
          break;
        case 'drain':
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(d.x - 26, d.y - 10, 54, 22);
          ctx.fillStyle = '#2e3032'; ctx.fillRect(d.x - 25, d.y - 11, 50, 20);
          ctx.fillStyle = '#121314'; for (let k = -21; k < 22; k += 6) ctx.fillRect(d.x + k, d.y - 8, 3, 14);
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(d.x - 25, d.y - 11, 50, 1);
          break;
      }
    },
    drawBay(ctx, d) {
      ctx.fillStyle = 'rgba(226,185,52,0.85)';
      ctx.fillRect(d.x, d.y - 3, d.len, 6);
      for (let x = d.x; x <= d.x + d.len; x += d.gap) ctx.fillRect(x - 3, d.y - 118, 6, 236);
      // concrete wheel stops at the head of each stall
      for (let x = d.x + d.gap / 2; x < d.x + d.len; x += d.gap) for (const yy of [d.y - 104, d.y + 96]) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 28, yy + 3, 58, 8);
        ctx.fillStyle = '#a8a59c'; ctx.fillRect(x - 30, yy, 60, 8);
        ctx.fillStyle = '#cfccc2'; ctx.fillRect(x - 30, yy, 60, 2);
        ctx.fillStyle = '#d8b21e'; ctx.fillRect(x - 22, yy + 3, 8, 3); ctx.fillRect(x + 14, yy + 3, 8, 3);
      }
    },
    drawArrow2(ctx, d) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = 'rgba(236,235,228,0.6)';
      ctx.beginPath();
      ctx.moveTo(0, -60); ctx.lineTo(24, -30); ctx.lineTo(9, -30); ctx.lineTo(9, 30); ctx.lineTo(24, 30); ctx.lineTo(0, 60);
      ctx.lineTo(-24, 30); ctx.lineTo(-9, 30); ctx.lineTo(-9, -30); ctx.lineTo(-24, -30); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    // spray-painted wordmarks: smooth vector type with drips and a dark under-spray
    drawGraffiti(ctx, d) {
      if (!d.img) d.img = this.graffitiImg(d);
      const wasSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.globalAlpha = 0.82; ctx.drawImage(d.img, -d.img.width / 4, -d.img.height / 4, d.img.width / 2, d.img.height / 2);
      ctx.restore(); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = wasSmooth;
    },
    graffitiImg(d) {
      const size = d.size * 2;
      const font = '400 ' + Math.round(size) + 'px "Bebas Neue", Impact, sans-serif';
      const m = S.cv(10, 10).getContext('2d');
      m.font = font;
      const tw = d.word ? m.measureText(d.word).width : size * 0.9;
      const c = S.cv(Math.ceil(tw + size * 0.8), Math.ceil(size * 1.9)), y = c.getContext('2d');
      const cx = c.width / 2, base = size * 1.25;
      y.font = font; y.textAlign = 'center'; y.textBaseline = 'alphabetic'; y.lineJoin = 'round';
      if (d.word) {
        y.save(); y.translate(cx, base); y.transform(1, 0, -0.12, 1, 0, 0);
        y.strokeStyle = 'rgba(15,15,16,0.55)'; y.lineWidth = size * 0.09; y.strokeText(d.word, 4, 4);
        y.fillStyle = d.col; y.fillText(d.word, 0, 0);
        y.strokeStyle = U.mixHex(d.col, '#ffffff', 0.35); y.lineWidth = size * 0.018; y.strokeText(d.word, 0, 0);
        y.restore();
        y.fillStyle = d.col;
        for (let i = 0; i < 6; i++) { const dx = U.rand(-tw / 2, tw / 2); y.fillRect(cx + dx, base - 4, size * 0.025, U.rand(size * 0.08, size * 0.3)); }
      }
      if (d.sym === 'crown') {
        const w = size * 0.7, h = size * 0.42, x0 = cx + (d.word ? tw * 0.28 : -w / 2), y0 = d.word ? size * 0.05 : base - h;
        y.strokeStyle = d.col; y.lineWidth = size * 0.05; y.lineJoin = 'miter';
        y.beginPath(); y.moveTo(x0, y0 + h); y.lineTo(x0, y0 + h * 0.2); y.lineTo(x0 + w * 0.25, y0 + h * 0.6); y.lineTo(x0 + w * 0.5, y0); y.lineTo(x0 + w * 0.75, y0 + h * 0.6); y.lineTo(x0 + w, y0 + h * 0.2); y.lineTo(x0 + w, y0 + h); y.closePath(); y.stroke();
      } else if (d.sym === 'cross') {
        y.fillStyle = d.col; y.fillRect(cx - size * 0.03, base + size * 0.08, size * 0.06, size * 0.5); y.fillRect(cx - size * 0.16, base + size * 0.2, size * 0.32, size * 0.06);
      }
      return c;
    },
    splat(G, x, y, r) {
      const A = G.arena;
      if (!A.blood) return;
      const pts = [], n = 5 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) { const a = U.rand(U.TAU), d = Math.pow(Math.random(), 1.4) * r * 1.3; pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, U.rand(3, 7)); }
      A.blood.push({ x, y, pts, t: G.time + 7 }); // 7 s and 90 at most: a late crowd used to paint the floor red
      if (A.blood.length > 90) A.blood.shift();
    },
    // colored lights for the aisle lamps, toxic crates, live hazards and blinking cars (wider margin than the sprites)
    lights(G, v) {
      const Post = RS.Post;
      if (!Post.active) return;
      const t = G.time;
      // overhead fluorescents: soft pools along the drive aisles
      for (const lm of G.arena.lamps) {
        if (lm.x < v.x0 - 300 || lm.x > v.x1 + 300 || lm.y < v.y0 - 300 || lm.y > v.y1 + 300) continue;
        if (lm.flick && Math.sin(t * 13 + lm.ph) < -0.6) continue;
        Post.light(lm.x, lm.y, 300, '#fff4dc', 0.3);
      }
      for (const pr of G.arena.props) {
        if (pr.dead || pr.x < v.x0 - 260 || pr.x > v.x1 + 260 || pr.y < v.y0 - 260 || pr.y > v.y1 + 300) continue;
        const P = pr.P;
        if (P.glow) Post.light(pr.x, pr.y, 150, P.glow, 0.42 + Math.sin(t * 3 + pr.x) * 0.08);
        else if (P.hazard === 'pulse' && pr.t < 0.5) Post.light(pr.x, pr.y, 220, '#9cff35', 0.7);
        else if (P.hazard === 'panel' && pr.active > 0) Post.light(pr.x, pr.y, 230, '#ffe14a', 0.45 + Math.sin(t * 24) * 0.1);
        else if (P.sprite === 'pillar') Post.light(pr.x, pr.y - 40, 110, '#9cff35', 0.18);
        else if (pr.haz && ((t * 1.6 + pr.hazPh) % 1) < 0.5) Post.light(pr.x, pr.y, 120, '#ffb020', 0.35);
      }
    },
    // props are pushed into the y-sorted entity list
    propDrawables(G, v, out) {
      for (const pr of G.arena.props) {
        if (pr.dead) continue;
        if (pr.x < v.x0 - 120 || pr.x > v.x1 + 120 || pr.y < v.y0 - 120 || pr.y > v.y1 + 160) continue;
        out.push(pr);
      }
    },
    drawProp(ctx, G, pr) {
      const P = pr.P;
      let img = S.props[P.sprite];
      if (Array.isArray(img)) img = img[pr.var % img.length];
      // pixel-art props: whole device pixels per art pixel, the sprite snapped to the pixel grid, no smoothing
      const R = RS.Render, sc = R.pixK(img._sc || P.scale);
      const w = img.width * sc, h = img.height * sc;
      const baseY = pr.y + (pr.hh || P.circle || 10);
      R.contact(ctx, pr.x, baseY, w * 0.5, Math.max(8, w * 0.15), 0.42, true);
      ctx.imageSmoothingEnabled = false;
      const dx = R.snap(pr.x) - Math.round(img.width / 2) * sc, dy = R.snap(baseY + (P.oy || 0) + 6) - h;
      ctx.drawImage(img, dx, dy, w, h);
      if (P.sprite === 'pillar') { // lit B2 sign; dims when the hero stands right next to it so its bloom never covers him
        const hd = Math.hypot(G.p.x - pr.x, G.p.y - pr.y);
        RS.Post.glow(pr.x, baseY - h * 0.62, 20, '#9cff35', 0.35 * U.clamp((hd - 40) / 80, 0.25, 1));
      }
      if (pr.flash > 0) { // hit flash follows the sprite outline instead of a white box
        if (!img._white) img._white = S.silhouette(img, '#ffffff');
        ctx.globalAlpha = 0.6; ctx.drawImage(img._white, dx, dy, w, h); ctx.globalAlpha = 1;
      }
      if (P.hazard === 'pulse' && pr.t < 0.5) RS.Post.glow(pr.x, pr.y - 10, 60, '#9cff35', 0.9);
      if (pr.haz && ((G.time * 1.6 + pr.hazPh) % 1) < 0.5) { // blinking hazard lights on a parked car
        const top = baseY - h + (P.oy || 0) + 6;
        for (const [fx, fy] of [[0.04, 0.22], [0.96, 0.22], [0.04, 0.78], [0.96, 0.78]]) RS.Post.glow(pr.x - w / 2 + fx * w, top + fy * h, 9, '#ffb020', 1);
      }
      if (P.hazard === 'explode' && pr.hp < pr.maxHp) {
        ctx.fillStyle = '#000'; ctx.fillRect(pr.x - 18, baseY - h, 36, 5);
        ctx.fillStyle = '#ff7a1a'; ctx.fillRect(pr.x - 17, baseY - h + 1, 34 * (pr.hp / pr.maxHp), 3);
      }
      if (P.hazard === 'panel' && pr.cd <= 0 && pr.active <= 0) {
        RS.Render.label(pr.x, baseY - h - 8, 'STEP ON', '#ffe14a', 10, 0.6 + Math.sin(G.time * 6) * 0.4);
      }
    },
  };

  RS.Arena = Arena;
})(window.RS);
