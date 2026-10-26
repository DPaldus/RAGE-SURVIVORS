'use strict';
// Shared namespace + small math / pooling / spatial helpers.
window.RS = window.RS || {};

(function (RS) {
  const TAU = Math.PI * 2;

  const U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    // frame-rate independent versions of per-frame constants tuned at 60 Hz:
    // damp(0.9, dt) = what `v *= 0.9` does per 60 Hz frame; per(0.5, dt) = a 50% chance per 60 Hz frame
    damp: (c, dt) => Math.pow(c, dt * 60),
    // stable pseudo-random 0..1 for an integer; draw code uses hash(tick) so screen noise changes at a fixed rate
    // instead of on every rendered frame (which flickered 2-4x faster on high refresh monitors)
    hash: (n) => { let h = Math.imul(n | 0, 374761393); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; },
    per: (p, dt) => dt > 0 && Math.random() < 1 - Math.pow(1 - p, dt * 60),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    sign: (v) => (v < 0 ? -1 : 1),
    dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    angDiff: (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },
    easeOut: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    },
    // pick from array using weight function
    weighted(arr, wfn) {
      let total = 0;
      for (const it of arr) total += Math.max(0, wfn(it));
      if (total <= 0) return null;
      let r = Math.random() * total;
      for (const it of arr) { r -= Math.max(0, wfn(it)); if (r <= 0) return it; }
      return arr[arr.length - 1];
    },
    fmtTime(s) {
      s = Math.max(0, Math.floor(s));
      const m = Math.floor(s / 60), r = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    },
    fmtNum(n) {
      n = Math.round(n);
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
      return String(n);
    },
    pct: (v) => Math.round(v * 100) + '%',
    hexToRgb(hex) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    rgba(hex, a) { const [r, g, b] = U.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; },
    mixHex(a, b, t) {
      const A = U.hexToRgb(a), B = U.hexToRgb(b);
      const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
      return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    },
    esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
  };

  // Object pool: list holds live objects, dead ones are swept back into free.
  class Pool {
    constructor(factory) { this.factory = factory; this.list = []; this.free = []; }
    spawn() {
      const o = this.free.length ? this.free.pop() : this.factory();
      o.dead = false;
      this.list.push(o);
      return o;
    }
    sweep() {
      const l = this.list;
      for (let i = l.length - 1; i >= 0; i--) {
        const o = l[i];
        if (o.dead) { l[i] = l[l.length - 1]; l.pop(); this.free.push(o); }
      }
    }
    clear() { for (const o of this.list) { o.dead = true; this.free.push(o); } this.list.length = 0; }
    get count() { return this.list.length; }
  }

  // Uniform grid for broad-phase queries over a bounded arena.
  class Grid {
    constructor(w, h, cell) {
      this.cell = cell;
      this.cols = Math.ceil(w / cell) + 2;
      this.rows = Math.ceil(h / cell) + 2;
      this.cells = new Array(this.cols * this.rows);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
      this.used = [];
    }
    clear() { for (const i of this.used) this.cells[i].length = 0; this.used.length = 0; }
    idx(x, y) {
      const cx = U.clamp(Math.floor(x / this.cell) + 1, 0, this.cols - 1);
      const cy = U.clamp(Math.floor(y / this.cell) + 1, 0, this.rows - 1);
      return cy * this.cols + cx;
    }
    insert(o) {
      const i = this.idx(o.x, o.y);
      const c = this.cells[i];
      if (c.length === 0) this.used.push(i);
      c.push(o);
    }
    // objects whose circle overlaps (x,y,r)
    query(x, y, r, out) {
      out.length = 0;
      const cs = this.cell;
      const x0 = U.clamp(Math.floor((x - r - 40) / cs) + 1, 0, this.cols - 1);
      const x1 = U.clamp(Math.floor((x + r + 40) / cs) + 1, 0, this.cols - 1);
      const y0 = U.clamp(Math.floor((y - r - 40) / cs) + 1, 0, this.rows - 1);
      const y1 = U.clamp(Math.floor((y + r + 40) / cs) + 1, 0, this.rows - 1);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = this.cells[cy * this.cols + cx];
          for (let k = 0; k < c.length; k++) {
            const o = c[k];
            if (o.dead) continue;
            const rr = r + o.r;
            const dx = o.x - x, dy = o.y - y;
            if (dx * dx + dy * dy <= rr * rr) out.push(o);
          }
        }
      }
      return out;
    }
  }

  RS.U = U;
  RS.Pool = Pool;
  RS.Grid = Grid;
})(window.RS);
