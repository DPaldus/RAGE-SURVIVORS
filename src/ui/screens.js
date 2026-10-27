'use strict';
// Out-of-run DOM screens: main menu, character select, collection, upgrades shop, settings, credits.
// Look: cinematic underground (src/gfx/scene.js paints the backdrop), chrome logo, GTA-style menu bars.
(function (RS) {
  const U = RS.U, D = RS.Data, I = RS.Icons, esc = U.esc;
  const ui = () => document.getElementById('ui');
  const Save = () => RS.Save;
  const VERSION = 'v1.1 · 30 MIN';
  const SLOGANS = ['SURVIVE THE LEAK<br>RAGE FOREVER', 'NO FEATURES<br>NO SKIPS', 'STAY GEEKED<br>STAY SCHMUNKED', 'CDQ ONLY<br>NO LQ', 'DROPPING SOON<br>(TRUST)', 'BELLS ON<br>ALWAYS', 'OUT THE MUD<br>INTO THE PIT'];

  const enemyImg = {};
  function enemyURL(type) {
    if (!enemyImg[type]) enemyImg[type] = RS.Sprites.enemies[type].tiers[0].frames[0].toDataURL();
    return enemyImg[type];
  }
  function bossURL(id) {
    const key = 'boss_' + id;
    if (!enemyImg[key]) {
      const B = D.BOSSES[id];
      enemyImg[key] = B.sprite ? RS.Sprites.bosses[B.sprite].img.toDataURL() : I.url('eye');
    }
    return enemyImg[key];
  }
  const heroImg = {};
  function heroURL(id) {
    if (!heroImg[id] && RS.HERO_ART && RS.HERO_ART[id]) heroImg[id] = RS.HERO_ART[id].src;
    if (!heroImg[id]) {
      const sh = RS.Sprites.heroSheets && RS.Sprites.heroSheets[id];
      heroImg[id] = sh && sh.idle_down ? sh.idle_down[0].img.toDataURL() : RS.Portraits.get(id, Screens.cosFor(id)).frames[0].toDataURL();
    }
    return heroImg[id];
  }
  const clout = () => `<span class="clout">${Save().data.clout}</span>`;
  const LOCK = '<span class="lockico"></span>';
  const SVG = (vb, body, cls) => `<svg class="${cls || ''}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  const ICO = {
    bolt: SVG('0 0 16 22', '<path d="M10 0 1 13h6l-2 9 10-14H9z" fill="currentColor"/>'),
    plus: SVG('0 0 20 20', '<path d="M7 0h6v7h7v6h-7v7H7v-7H0V7h7z" fill="currentColor"/>'),
    arrow: SVG('0 0 22 16', '<path d="M8 0 0 8l8 8 2-2-4.5-4.5H22v-3H5.5L10 2z" fill="currentColor"/>'),
    tri: SVG('0 0 12 14', '<path d="M0 0l12 7-12 7z" fill="currentColor"/>'),
    chevL: SVG('0 0 14 22', '<path d="M11 0 0 11l11 11 3-3-8-8 8-8z" fill="currentColor"/>'),
    chevR: SVG('0 0 14 22', '<path d="M3 0l11 11L3 22l-3-3 8-8-8-8z" fill="currentColor"/>'),
    crown: SVG('0 0 64 46', '<path d="M4 38 2 8l15 16L31 3l14 21L62 6l-4 32M3 43l57-1" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 40v5M33 41v4M50 41v5" stroke="currentColor" stroke-width="2"/>', 'crown-doodle'),
  };
  // stat row icons for the character sheet
  const STAT_ICO = {
    HEALTH: SVG('0 0 24 22', '<path d="M12 21 2.6 11.6A5.6 5.6 0 0 1 12 3.7a5.6 5.6 0 0 1 9.4 7.9z" fill="currentColor"/>'),
    SPEED: SVG('0 0 24 24', '<circle cx="15" cy="3.5" r="2.6" fill="currentColor"/><path d="m9 22 3-7 3 3v6h2.4v-7.4l-3-3 1-4.2 1.8 2.6H22V9.6h-3.6l-2.7-4.1c-.5-.7-1.3-1.1-2.2-1L8 6v5h2.3V7.7l1.6-.4L9.4 18H4v2.4h5z" fill="currentColor"/>'),
    'ATK SPEED': SVG('0 0 24 24', '<path d="M4 8c0-3 1.5-6 2-6s2 3 2 6v14H4zM10 8c0-3 1.5-6 2-6s2 3 2 6v14h-4zM16 8c0-3 1.5-6 2-6s2 3 2 6v14h-4z" fill="currentColor"/>'),
    DEFENSE: SVG('0 0 22 24', '<path d="M11 0 1 4v7c0 6.5 4.3 11 10 13 5.7-2 10-6.5 10-13V4zm0 3 7 2.8V11c0 4.6-2.9 8-7 9.7z" fill="currentColor"/>'),
    LUCK: SVG('0 0 24 24', '<path d="M12 11C9 11 5 9.6 5 6.5S8.5 2 12 6c3.5-4 7-2.6 7 .5S15 11 12 11zm0 2c3 0 7 1.4 7 4.5S15.5 22 12 18c-3.5 4-7 2.6-7-.5S9 13 12 13zm-1-1c0 3-1.4 7-4.5 7S2 15.5 6 12c-4-3.5-2.6-7 .5-7S11 9 11 12zm2 0c0-3 1.4-7 4.5-7S22 8.5 18 12c4 3.5 2.6 7-.5 7S13 15 13 12z" fill="currentColor"/>'),
  };
  // arcade cabinet header: the best survival time as the HI-SCORE, runs played as the credit counter
  function stamp() {
    const d = Save().data;
    return `HI-SCORE ${U.fmtTime(d.bestTime || 0)}  CREDIT ${String(Math.min(99, d.runs || 0)).padStart(2, '0')}`;
  }
  const logo = (cls) => `<img class="${cls}" src="${RS.LOGO.src}" width="${RS.LOGO.w}" height="${RS.LOGO.h}" alt="RÄGË SURV1VÖRS" draggable="false">`;
  // shared screen frame: camcorder clock + REC top-right, tagline bottom-left, records bottom-right
  const clockTR = (dot) => `<div class="chrome-tr"><span class="date" id="clock">${stamp()}</span><span class="rec ${dot || ''}">FREE PLAY</span></div>`;
  const tagBL = () => '<div class="chrome-bl">SURVIVE THE LEAK<br>RAGE FOREVER</div>';
  const recordsBR = () => { const d = Save().data; return `<div class="chrome-br">BEST ${U.fmtTime(d.bestTime)}<span>RUNS ${d.runs}</span><span>WINS ${d.wins}</span></div>`; };
  const cashPill = () => `<div class="cash-pill" title="CL0UT"><img src="${I.url('clout_stack')}" alt="">${clout()}</div>`;
  const back = (act) => `<button class="btn-back" data-act="${act || 'back'}">${ICO.arrow}<span>BACK</span></button>`;
  // big page header used by every sub screen
  const head = (title, sub, right) => `<header class="page-head">
      <div class="ph-l"><h1 class="title-xl" data-t="${title}">${title}</h1>${sub ? `<div class="psub">${sub}</div>` : ''}</div>
      <div class="ph-r">${right || ''}${cashPill()}${back('main')}</div>
    </header>`;
  const tabs = (list, cur, act) => `<nav class="ptabs">${list.map(([k, n]) => `<button class="ptab ${cur === k ? 'active' : ''}" data-act="${act}" data-arg="${k}"><span>${n}</span></button>`).join('')}</nav>`;

  // theme: the logo doubles as a mask for its neon glow; grunge is a generated grain/scratch tile (multiply)
  (function theme() {
    const root = document.documentElement.style;
    // the logo arrives at full resolution with its retro pass baked in (tools/build_logo.py: 4-bit colour); the red +
    // black extrusion is CSS (.lglow) and its aspect ratio follows the image
    if (RS.LOGO) {
      root.setProperty('--logo', `url("${RS.LOGO.src}")`);
      root.setProperty('--logo-ar', `${RS.LOGO.w} / ${RS.LOGO.h}`);
      // boot screen: the logo replaces the text title for the rest of the loading
      const boot = document.querySelector('#boot .boot-logo');
      if (boot) { boot.classList.add('lglow'); boot.innerHTML = logo('logo-img'); }
    }
    try {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'), r = Math.random;
      x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 14; i++) {
        const cx = r() * 256, cy = r() * 256, rad = 20 + r() * 60;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
          const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
          g.addColorStop(0, `rgba(0,0,0,${0.06 + r() * 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
        }
      }
      for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.32})`; const sz = r() < 0.9 ? 1 : 2 + r() * 2; x.fillRect(r() * 256, r() * 256, sz, sz); }
      x.lineWidth = 1;
      for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.14})`; const sx = r() * 256, sy = r() * 256, a = r() * 6.28, l = 10 + r() * 50; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
      root.setProperty('--grunge', `url(${c.toDataURL()})`);
    } catch (e) { /* plain panels */ }
  })();

  const Screens = {
    current: null,
    anim: null,
    clockT: null,
    stageFlash: 0,
    show(name, arg) {
      if (this.anim) { clearInterval(this.anim); this.anim = null; }
      const prev = this.current;
      this.current = name;
      this.back = arg && arg.back;
      const fn = this['s_' + name];
      const switching = !!ui().firstElementChild;
      ui().innerHTML = fn.call(this, arg || {});
      // moving between screens sweeps a wipe across; staying on the same screen (buying, tabs) does not replay intros
      const scr = ui().firstElementChild;
      if (switching && prev !== name) this.wipe();
      else if (switching && scr) scr.classList.add('same');
      this.bind(ui());
      if (this['after_' + name]) this['after_' + name](arg || {});
      if (!this.clockT) this.clockT = setInterval(() => { const c = document.getElementById('clock'); if (c) c.textContent = stamp(); }, 15000);
    },
    hide() { if (this.anim) { clearInterval(this.anim); this.anim = null; } this.current = null; ui().innerHTML = ''; },
    wipe() {
      let w = document.getElementById('wipe');
      if (!w) {
        w = document.createElement('div'); w.id = 'wipe'; w.innerHTML = '<i></i><i></i><i></i>'; document.body.appendChild(w);
        // once the last bar is across, drop the sweep: the bars go back to hidden instead of resting at their end frame
        w.lastChild.addEventListener('animationend', () => w.classList.remove('go'));
      }
      w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    },
    bind(root) {
      root.querySelectorAll('[data-act]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (el.disabled) return;
          RS.Audio.resume();
          RS.Audio.sfx('ui');
          el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); // press flash (visible on in-place actions)
          this.act(el.dataset.act, el.dataset.arg, el);
        });
        el.addEventListener('mouseenter', () => RS.Audio.sfx('hover'));
      });
      // main menu: hovering moves the highlight bar
      root.querySelectorAll('.main-menu .mi').forEach((el, i, all) => el.addEventListener('mouseenter', () => all.forEach((x) => x.classList.toggle('on', x === el))));
    },
    // arrow keys / enter on the main menu, left/right on character select
    onKey(e) {
      if (this.current === 'mapsel') {
        const ids = Object.keys(D.MAPMODES), d = Save().data, at = Math.max(0, ids.indexOf(d.selected.map));
        const pick = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        // arrows step over locked maps; a number key on a locked one shakes its card
        const step = (dir) => { for (let k = 1; k < ids.length; k++) { const i = (at + dir * k + ids.length * k) % ids.length; if (D.mapOpen(ids[i])) return i; } return at; };
        let to = -1;
        if (pick !== undefined) to = pick;
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') to = step(-1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') to = step(1);
        else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.act('mapStart'); return; }
        else if (e.code === 'Escape') { e.preventDefault(); this.show('main'); return; }
        if (to >= 0 && ids[to]) { e.preventDefault(); this.act('mapPick', ids[to]); }
        return;
      }
      if (this.current === 'chars' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        const b = document.querySelector(e.code === 'ArrowLeft' ? '.cs-arrow.l' : '.cs-arrow.r');
        if (b) { e.preventDefault(); b.click(); }
        return;
      }
      if (this.current !== 'main') return;
      const items = Array.from(document.querySelectorAll('.main-menu .mi'));
      if (!items.length) return;
      let i = items.findIndex((x) => x.classList.contains('on'));
      if (e.code === 'ArrowDown' || e.code === 'KeyS') i = (i + 1) % items.length;
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') i = (i - 1 + items.length) % items.length;
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); items[Math.max(0, i)].click(); return; }
      else return;
      e.preventDefault();
      items.forEach((x, k) => x.classList.toggle('on', k === i));
      items[i].focus({ preventScroll: true });
      RS.Audio.sfx('hover');
    },
    act(a, arg, el) {
      const S = Save(), d = S.data;
      switch (a) {
        case 'main': this.show('main'); break;
        case 'play': this.show('mapsel'); break; // pregame map + difficulty pick, then the run
        case 'mapPick':
          if (D.mapOpen(arg)) { d.selected.map = arg; S.save(); this.markMap(); } else if (D.MAPMODES[arg]) this.denyMap(arg);
          break;
        case 'mapStart': RS.Main.startRun(); break;
        case 'chars': this.show('chars', { back: arg || 'main', sel: d.selected.char }); break;
        case 'collection': this.show('collection', { tab: arg || 'weapons' }); break;
        case 'shop': this.show('shop', { tab: arg || 'perks' }); break;
        case 'settings': this.show('settings', { back: arg || 'main' }); break;
        case 'credits': this.show('credits'); break;
        case 'back':
          if (this.back === 'pause') { this.current = null; RS.Overlays.pause(); }
          else this.show(this.back || 'main');
          break;
        case 'start': RS.Main.startRun(); break;
        // character select
        case 'charTab': this.stageFlash = 1; this.show('chars', { back: this.back, sel: arg }); break;
        case 'charSelect': if (!D.charPlayable(arg)) { RS.Audio.sfx('hurt'); break; } d.selected.char = arg; S.save(); this.show(this.back || 'main'); break;
        case 'buyChar': if (D.CHARACTERS[arg] && !D.CHARACTERS[arg].soon && S.spend(D.CHARACTERS[arg].unlock.cost)) { S.unlock('chars', arg); S.save(); RS.Audio.sfx('rare'); this.stageFlash = 1; } else RS.Audio.sfx('hurt'); this.show('chars', { back: this.back, sel: arg }); break;
        case 'cos': {
          const [char, cid] = arg.split('|');
          const c = D.COSMETICS.find((x) => x.id === cid);
          if (!S.isUnlocked('cosmetics', cid) && !c.free) { RS.Audio.sfx('hurt'); break; }
          d.selected.cos[char] = Object.assign({}, d.selected.cos[char] || {}, { [c.kind]: cid });
          S.save(); this.show('chars', { back: this.back, sel: char }); break;
        }
        case 'stage':
          d.selected.mods = arg === 'nomercy' && S.isUnlocked('mods', 'nomercy') ? ['nomercy'] : [];
          S.save(); this.show('chars', { back: this.back, sel: this.stageId || d.selected.char }); break;
        case 'startw': {
          const [char, wid] = arg.split('|');
          d.selected.startWeapon[char] = wid; S.save(); this.show('chars', { back: this.back, sel: char }); break;
        }
        // collection / shop tabs
        case 'ctab': this.show('collection', { tab: arg }); break;
        case 'stab': this.show('shop', { tab: arg }); break;
        case 'buyPerk': {
          const pk = D.PERKS.find((x) => x.id === arg), lv = S.perk(arg);
          if (lv < pk.max && (!pk.req || pk.req(S)) && S.spend(pk.cost[lv])) { d.perks[arg] = lv + 1; S.save(); RS.Audio.sfx('levelup'); } else RS.Audio.sfx('hurt');
          this.show('shop', { tab: 'perks' }); break;
        }
        case 'buyUnlock': {
          const u = D.UNLOCKS.find((x) => x.kind + ':' + x.id === arg);
          if (u && D.unlockOffered(u) && !S.isUnlocked(u.kind, u.id) && S.spend(u.cost)) { S.unlock(u.kind, u.id); S.save(); RS.Audio.sfx('rare'); } else RS.Audio.sfx('hurt');
          this.show('shop', { tab: 'unlocks' }); break;
        }
        case 'buyCos': {
          const c = D.COSMETICS.find((x) => x.id === arg);
          if (c && c.cost > 0 && !S.isUnlocked('cosmetics', c.id) && S.spend(c.cost)) { S.unlock('cosmetics', c.id); S.save(); RS.Audio.sfx('rare'); } else RS.Audio.sfx('hurt');
          this.show('shop', { tab: c && c.kind === 'mask' ? 'cos' : 'drip' }); break;
        }
        // settings
        case 'gfxPreset': RS.GFX.nextPreset(); S.save(); this.show('settings', { back: this.back }); break;
        case 'gfxCycle': RS.GFX.cycle(arg); S.save(); this.show('settings', { back: this.back }); break;
        case 'toggle': d.settings[arg] = !d.settings[arg]; S.save(); RS.Main.applySettings(); this.show('settings', { back: this.back }); break;
        case 'reset': this.show('confirm', { back: 'settings' }); break;
        case 'fullscreen': {
          const done = () => this.show('settings', { back: this.back });
          const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (req && req.then) req.then(done, done); else done();
          break;
        }
        case 'resetYes': S.reset(); RS.Main.applySettings(); this.show('main'); break;
      }
    },

    // ------------------------------------------------------------ main
    s_main() {
      const items = [['play', 'PLAY'], ['chars', 'CHARACTER SELECT'], ['collection', 'COLLECTION'], ['shop', 'UPGRADES'], ['settings', 'SETTINGS'], ['credits', 'CREDITS']];
      return `<div class="screen s-main" id="s-main">
        ${clockTR('red')}
        <div class="ff">
          <div class="main-logo lglow">${logo('logo-img')}<i class="glint g1"></i><i class="glint g2"></i><i class="glint g3"></i></div>
          <nav class="main-menu">${items.map(([a, n], i) => `<button class="mi ${i === 0 ? 'on' : ''}" data-act="${a}" style="--i:${i}"><span class="mi-tri">${ICO.tri}</span><span class="mi-t">${n}</span></button>`).join('')}</nav>
        </div>
        <div class="chrome-bl">${VERSION.toUpperCase()}<br>LOCAL BUILD</div>
        <div class="chrome-br tag">${U.pick(SLOGANS)}</div>
        <div class="ff" style="pointer-events:none"><div class="press-start">PRESS <b>ENTER</b> TO START</div></div>
      </div>`;
    },

    // ------------------------------------------------------------ pregame map select
    // NORMAL / NIGHT / STORM (D.MAPMODES): a live preview of the real deck under each condition, the cash multiplier,
    // a 3-step difficulty meter and what changes. The pick is saved, so RETRY / RESTART keep the same conditions.
    // NIGHT and STORM start locked: 30:00 on the map before opens them (the card says which), until then their preview
    // runs dimmed behind a lock so you can see what you are playing for.
    s_mapsel() {
      const d = Save().data, cur = D.mapOpen(d.selected.map) ? d.selected.map : 'normal';
      const pct = (k) => '+' + Math.round((k - 1) * 100) + '%';
      const cards = Object.values(D.MAPMODES).map((M, i) => {
        const fx = M.id === 'normal' ? ['Baseline enemy HP, damage and spawns', '+20% item power · bosses go down faster', 'Full deck lighting']
          : [pct(M.hp) + ' enemy HP · ' + pct(M.bossHp) + ' boss HP', pct(M.dmg) + ' damage taken', pct(M.rate) + ' spawns · elites ' + pct(1 / M.eliteGap) + ' more often',
            M.rain ? 'Night, rain and lightning (visual only)' : 'Night: aisle lights and your own glow'];
        const open = D.mapOpen(M.id);
        const lock = open ? '' : `<span class="mc-lock"><span class="mc-lk">${LOCK}LOCKED</span><span class="mc-req">CLEAR ALL ${D.WAVES} WAVES ON ${D.MAPMODES[M.after].name}</span></span>`;
        return `<button class="map-card ${cur === M.id ? 'sel' : ''} ${open ? '' : 'locked'}" data-act="mapPick" data-arg="${M.id}" style="--mc:${M.col}" ${open ? '' : 'aria-disabled="true"'}>
          <span class="mc-prev"><canvas data-map="${M.id}"></canvas><span class="mc-key">${i + 1}</span><span class="mc-tag">${esc(M.tagline)}</span>${lock}</span>
          <span class="mc-row"><span class="mc-name">${M.name}</span><span class="mc-cash">${M.cash}× CASH</span></span>
          <span class="mc-diff"><span class="mc-dl">DIFFICULTY</span><span class="pips">${[1, 2, 3].map((k) => `<i class="${k <= M.diff ? 'on' : ''}"></i>`).join('')}</span><b>${['', 'BASELINE', 'HARD', 'HARDEST'][M.diff]}</b></span>
          <span class="mc-desc">${esc(M.desc)}</span>
          <span class="mc-fx">${fx.map((f) => `<span>${esc(f)}</span>`).join('')}</span>
        </button>`;
      }).join('');
      return `<div class="screen s-chars s-maps"><div class="ff">
        <div class="corner-logo lglow">${logo('logo-img')}</div>
        <button class="btn-tape" data-act="main">${ICO.arrow}<span>BACK</span></button>
        <div class="cs-head"><h1 class="cs-title"><span>SELECT MAP</span>${ICO.crown}</h1></div>
        <div class="ms-sub">PARKING DECK B2 · PICK YOUR CONDITIONS · MORE RISK, MORE CL0UT</div>
        <div class="map-cards">${cards}</div>
        <div class="ms-foot">
          <button class="btn-select ms-go" data-act="mapStart">${ICO.tri}<span>START · <b class="ms-cur">${D.MAPMODES[cur].name}</b></span></button>
          <div class="ms-hint">1 · 2 · 3 OR ← → TO PICK · ENTER TO START · ESC BACK</div>
        </div>
        ${cashPill().replace('cash-pill', 'cash-pill cs-cash')}
      </div></div>`;
    },
    after_mapsel() {
      this.mapCv = Array.from(document.querySelectorAll('.map-card canvas'));
      this.mapSt = {};
    },
    // selection changes in place (no re-render, the previews keep running)
    markMap() {
      const cur = Save().data.selected.map;
      document.querySelectorAll('.map-card').forEach((el) => el.classList.toggle('sel', el.dataset.arg === cur));
      const c = document.querySelector('.ms-cur');
      if (c) c.textContent = D.MAPMODES[cur].name;
    },
    // a locked card refuses with a short shake (no sound)
    denyMap(id) {
      const el = document.querySelector(`.map-card[data-arg="${id}"]`);
      if (!el) return;
      el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny');
    },
    // called from the menu loop while the map screen is up
    drawMaps(dt) {
      if (!this.mapCv || !this.mapCv.length || !this.mapCv[0].isConnected) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const c of this.mapCv) {
        const r = c.getBoundingClientRect(), w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const M = D.MAPMODES[c.dataset.map], st = this.mapSt[M.id] = this.mapSt[M.id] || {};
        RS.Weather.preview(c.getContext('2d'), w, h, M, RS.Render.mapPreview(w, h), dt, st);
      }
    },

    startWeaponFor(charId) {
      const S = Save(), C = D.CHARACTERS[charId];
      const want = S.data.selected.startWeapon[charId];
      if (want && want !== C.weapon && S.isUnlocked('startWeapons', charId + ':' + want)) return want;
      return C.weapon;
    },
    cosFor(charId) {
      const S = Save(), c = Object.assign({ mask: 'mask_black', chain: 'chain_silver' }, S.data.selected.cos[charId] || {});
      if (!S.isUnlocked('cosmetics', c.mask)) c.mask = 'mask_black';
      if (c.chain !== 'chain_none' && !S.isUnlocked('cosmetics', c.chain)) c.chain = 'chain_silver';
      return c;
    },

    // ------------------------------------------------------------ character select
    s_chars(arg) {
      const S = Save(), d = S.data;
      const id = D.CHARACTERS[arg.sel] ? arg.sel : D.charPlayable(d.selected.char) ? d.selected.char : 'twizzy';
      const C = D.CHARACTERS[id];
      const ids = Object.keys(D.CHARACTERS), at = ids.indexOf(id);
      const prev = ids[(at - 1 + ids.length) % ids.length], next = ids[(at + 1) % ids.length];
      const unlocked = S.isUnlocked('chars', id);
      const tabsH = Object.values(D.CHARACTERS).map((c) => `<button class="cs-tab ${c.id === id ? 'active' : ''}" data-act="charTab" data-arg="${c.id}">${c.soon ? '???' : c.name}${c.soon || S.isUnlocked('chars', c.id) ? '' : LOCK}${c.soon ? LOCK : ''}</button>`).join('');
      if (C.soon) return this.charSoon(tabsH, prev, next);
      const bars = Object.entries(C.bars).map(([k, v]) => `<div class="si">${STAT_ICO[k] || ''}</div><div class="sk">${k === 'ATK SPEED' ? 'ATTACK SPEED' : k}</div><div class="bar"><i style="--w:${v * 100}%"></i></div>`).join('');
      const cos = this.cosFor(id);
      const sw = this.startWeaponFor(id);
      const swatch = (kind) => D.COSMETICS.filter((c) => c.kind === kind).map((c) => {
        const own = S.isUnlocked('cosmetics', c.id) || c.free;
        return `<button class="swatch ${cos[kind] === c.id ? 'sel' : ''} ${own ? '' : 'locked'}" title="${c.name}${own ? '' : c.cost > 0 ? ' · ' + c.cost + ' CL0UT in UPGRADES' : ' · ' + (c.cond || '')}" style="background:${c.col}" data-act="cos" data-arg="${id}|${c.id}"></button>`;
      }).join('');
      // starting weapon: the pick sits in the red box, the alternatives are icon tiles beside it
      const alts = [C.weapon].concat(C.altWeapons).map((w) => {
        const ok = w === C.weapon || S.isUnlocked('startWeapons', id + ':' + w);
        return `<button class="walt ${sw === w ? 'on' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-act="startw" data-arg="${id}|${w}"` : 'disabled'} title="${D.WEAPONS[w].name}${ok ? '' : ' · unlock in UPGRADES'}"><img src="${I.url(w)}" alt="">${ok ? '' : LOCK}</button>`;
      }).join('');
      const weaps = `<div class="cs-weap sel"><img src="${I.url(sw)}" alt=""><div class="wt"><div class="n">${D.WEAPONS[sw].name}</div><div class="d">${esc(D.WEAPONS[sw].desc)}</div></div><div class="walts">${alts}</div></div>`;
      const best = d.bestTimeByChar[id] ? U.fmtTime(d.bestTimeByChar[id]) : '--:--';
      const sig = { twizzy: 'Twizzy<br>Rich', schmunk: 'Mr.<br>Schmunk' }[id] || esc(C.name);
      return `<div class="screen s-chars"><div class="ff">
        <div class="corner-logo lglow">${logo('logo-img')}</div>
        <button class="btn-tape" data-act="back">${ICO.arrow}<span>BACK</span></button>
        <div class="cs-head">
          <h1 class="cs-title"><span>CHARACTER SELECT</span>${ICO.crown}</h1>
          <div class="cs-tabs">${tabsH}</div>
        </div>
        <div class="cs-body">
          <div class="cs-left">
            <div class="cs-deco">
              <div class="sig">${sig}</div>
              <div class="polaroid p1"><img src="${heroURL(id)}" alt=""></div>
              <div class="polaroid p2"><img src="${heroURL(id)}" alt=""></div>
            </div>
            <button class="cs-arrow l" data-act="charTab" data-arg="${prev}" aria-label="Previous character">${ICO.chevL}</button>
            <button class="cs-arrow r" data-act="charTab" data-arg="${next}" aria-label="Next character">${ICO.chevR}</button>
            <div class="cs-stage">
              <canvas id="charStage"></canvas>
              ${unlocked ? `<button class="btn-select" data-act="charSelect" data-arg="${id}">${ICO.tri}<span>SELECT ${C.name}</span></button>`
                : `<div class="lock"><div class="lk">LOCKED</div><div class="lc">${C.unlock.cost} CL0UT ${esc(C.unlock.cond || '')}</div>
                  <button class="btn-select red" data-act="buyChar" data-arg="${id}" ${d.clout >= C.unlock.cost ? '' : 'disabled'}><span>UNLOCK · ${C.unlock.cost} CL0UT</span></button></div>`}
            </div>
          </div>
          <div class="cs-info">
            <div class="cs-best">BEST ${best}</div>
            ${ICO.crown.replace('crown-doodle', 'crown-doodle bg')}
            <div class="cs-name">${C.name}</div>
            <div class="cs-theme">${C.theme}</div>
            <div class="cs-bio">${esc(C.bio)}</div>
            <div class="cs-stats">${bars}</div>
            <div class="cs-ab"><div class="ico">${ICO.plus}</div><div><div class="h"><b>PASSIVE</b> — ${C.passive.name}</div><div class="d">${esc(C.passive.desc)}</div></div></div>
            <div class="cs-ab"><div class="ico">${ICO.bolt}</div><div><div class="h"><b>ACTIVE</b> — ${C.active.name}<span class="cd">[ F ] - ${C.active.cd}S CD</span></div><div class="d">${esc(C.active.desc)}</div></div></div>
            <div class="cs-lbl">STARTING WEAPON</div>
            <div class="cs-weaps">${weaps}</div>
            <div class="cs-drip"><span class="cs-lbl">MASK</span><div class="swatches">${swatch('mask')}</div><span class="cs-lbl">CHAIN</span><div class="swatches">${swatch('chain')}</div></div>
            ${this.stageRow()}
          </div>
        </div>
        ${cashPill().replace('cash-pill', 'cash-pill cs-cash')}
      </div></div>`;
    },
    // a character held back for a future update: the slot is there, everything about who it is stays hidden
    charSoon(tabsH, prev, next) {
      return `<div class="screen s-chars"><div class="ff">
        <div class="corner-logo lglow">${logo('logo-img')}</div>
        <button class="btn-tape" data-act="back">${ICO.arrow}<span>BACK</span></button>
        <div class="cs-head">
          <h1 class="cs-title"><span>CHARACTER SELECT</span>${ICO.crown}</h1>
          <div class="cs-tabs">${tabsH}</div>
        </div>
        <div class="cs-body">
          <div class="cs-left">
            <button class="cs-arrow l" data-act="charTab" data-arg="${prev}" aria-label="Previous character">${ICO.chevL}</button>
            <button class="cs-arrow r" data-act="charTab" data-arg="${next}" aria-label="Next character">${ICO.chevR}</button>
            <div class="cs-stage cs-soon"><div class="lock"><div class="lk">${LOCK}LOCKED</div><div class="lc">COMING IN A FUTURE UPDATE</div></div></div>
          </div>
          <div class="cs-info">
            ${ICO.crown.replace('crown-doodle', 'crown-doodle bg')}
            <div class="cs-name">???</div>
            <div class="cs-theme">COMING IN A FUTURE UPDATE</div>
            <div class="cs-bio">A new character is on the way. Not playable yet: stay tuned for the next drop.</div>
          </div>
        </div>
        ${cashPill().replace('cash-pill', 'cash-pill cs-cash')}
      </div></div>`;
    },
    // stage variant: NORMAL or the NO MERCY stage that THE RAGE KING unlocks (saved with the selection)
    stageRow() {
      const S = Save(), d = S.data, hard = d.selected.mods.includes('nomercy'), open = S.isUnlocked('mods', 'nomercy');
      const M = D.MODIFIERS.find((m) => m.id === 'nomercy');
      return `<div class="cs-lbl" style="display:block;margin:1.8cqh 0 0.8cqh">STAGE</div>
        <div class="cs-drip" style="margin-top:0">
          <button class="toggle ${hard ? '' : 'on'}" data-act="stage" data-arg="normal">NORMAL</button>
          <button class="toggle ${hard ? 'on' : ''} ${open ? '' : 'locked'}" data-act="stage" data-arg="nomercy" ${open ? '' : 'disabled'} title="${esc(M.desc)}">NO MERCY${open ? ' · +60% CL0UT' : LOCK}</button>
          <span class="cs-lbl" style="letter-spacing:0.1em">${open ? '+60% ENEMY HP · +25% DAMAGE' : 'DEFEAT THE RAGE KING (25:00) TO UNLOCK'}</span>
        </div>`;
    },
    after_chars(arg) {
      this.stageId = arg.sel || Save().data.selected.char;
      this.stageCv = document.getElementById('charStage'); // none on a COMING SOON slot: nothing is drawn there
    },
    // called from the menu loop: keeps the stage canvas sized to its box and repaints it
    drawStage(time, pulse, dt) {
      const c = this.stageCv;
      if (!c || !c.isConnected) return;
      const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.stageFlash = Math.max(0, this.stageFlash - (dt || 0.016) * 3.5);
      RS.Scene.drawStage(c, this.stageId, this.cosFor(this.stageId), time, pulse, this.stageFlash);
    },

    // ------------------------------------------------------------ collection
    s_collection(arg) {
      const S = Save(), tab = arg.tab;
      const tabsH = tabs([['weapons', 'WEAPONS'], ['evos', 'EVOLUTIONS'], ['synergies', 'SYNERGIES'], ['items', 'ITEMS'], ['stash', 'STASH'], ['thumbs', 'RAGE THUMBS'], ['enemies', 'ENEMIES'], ['bosses', 'BOSSES'], ['challenges', 'CHALLENGES']], tab, 'ctab');
      let entries = '', count = '';
      const entry = (img, name, desc, known, cls) => `<div class="ucard entry ${known ? '' : 'locked'} ${cls || ''}"><img class="uico" src="${img}" alt=""><div class="ubody"><div class="un">${known ? esc(name) : '???'}</div><div class="ud">${known ? desc : 'Not discovered yet.'}</div></div></div>`;
      if (tab === 'weapons') {
        const list = Object.values(D.WEAPONS).filter((w) => !w.evolved);
        entries = list.map((w) => entry(I.url(w.id), w.name, esc(w.desc) + '<br><span class="muted">' + esc(w.role) + (w.sonic ? ' · SONIC' : '') + '</span>', S.isDiscovered('weapons', w.id))).join('');
        count = list.filter((w) => S.isDiscovered('weapons', w.id)).length + ' / ' + list.length;
      } else if (tab === 'evos') {
        entries = D.EVOLUTIONS.map((r) => {
          const ev = D.WEAPONS[r.result], known = S.isDiscovered('evos', r.result);
          const recipe = known ? `<span class="green">${D.WEAPONS[r.weapon].name} (MAX) + ${D.PASSIVES[r.item].name}</span><br>` : '<span class="muted">??? (MAX) + ???</span><br>';
          return `<div class="ucard entry evo ${known ? '' : 'locked'}"><img class="uico" src="${I.url(r.result)}" alt=""><div class="ubody"><div class="un">${known ? ev.name : '???'}</div><div class="ud">${recipe}${known ? esc(ev.desc) : 'Max out a weapon and hold the right passive item, then open a chest.'}</div></div></div>`;
        }).join('');
        count = D.EVOLUTIONS.filter((r) => S.isDiscovered('evos', r.result)).length + ' / ' + D.EVOLUTIONS.length;
      } else if (tab === 'synergies') {
        const nameOf = (id) => (D.TAPES[id] ? D.TAPES[id].name + ' LV 3' : (D.STASH[id] || D.PASSIVES[id] || D.WEAPONS[id]).name);
        entries = D.SYNERGIES.map((sy) => {
          const known = S.isDiscovered('synergies', sy.id);
          const recipe = known ? `<span class="green">${sy.needs.map((n) => esc(nameOf(n))).join(' + ')}</span><br>` : `<span class="muted">${sy.needs.map(() => '???').join(' + ')}</span><br>`;
          // an undiscovered synergy gives nothing away: no piece icon, no piece count
          return `<div class="ucard entry evo ${known ? '' : 'locked'}"><img class="uico" src="${I.url(known ? sy.needs[0] : 'lock')}" alt=""><div class="ubody"><div class="un">${known ? esc(sy.name) : '???'}</div><div class="ud">${known ? recipe + esc(sy.desc) : 'Not discovered yet.'}</div></div></div>`;
        }).join('');
        count = D.SYNERGIES.filter((sy) => S.isDiscovered('synergies', sy.id)).length + ' / ' + D.SYNERGIES.length;
      } else if (tab === 'items') {
        const ps = Object.values(D.PASSIVES), cs = Object.values(D.CONSUMABLES), tp = Object.values(D.TAPES);
        entries = ps.map((p) => entry(I.url(p.id), p.name, esc(p.desc) + '<br><span class="muted">PER LEVEL: ' + esc(p.per) + '</span>', S.isDiscovered('items', p.id))).join('') +
          tp.map((t) => entry(I.url(t.id), t.name, `<span class="mono" style="font-size:10.5px;color:${t.col}">TAPE · LV ${t.max} MAX</span> · ` + esc(t.desc) + '<br><span class="muted">PER LEVEL: ' + esc(t.card.fmt(1)) + ' (more at higher rarity)</span>', S.isDiscovered('items', t.id))).join('') +
          cs.map((c) => entry(I.url(c.id), c.name, '<span class="green mono" style="font-size:10.5px">CONSUMABLE</span> · ' + esc(c.desc), S.isDiscovered('items', c.id))).join('');
        count = ps.concat(cs, tp).filter((p) => S.isDiscovered('items', p.id)).length + ' / ' + (ps.length + cs.length + tp.length);
      } else if (tab === 'stash') {
        // loot items by rarity; they drop from chests, altars, elites, props and THE PLUG and stack per copy
        const ss = Object.values(D.STASH).sort((a, b) => a.rarity - b.rarity);
        entries = ss.map((t) => entry(I.url(t.id), t.name, `<span class="mono" style="font-size:10.5px;color:${D.RARITY[t.rarity].col}">${D.RARITY[t.rarity].name} STASH</span> · ${esc(t.desc)}<br><span class="muted">EVERY EXTRA COPY: ${esc(t.per)}</span>`, S.isDiscovered('stash', t.id))).join('');
        count = ss.filter((t) => S.isDiscovered('stash', t.id)).length + ' / ' + ss.length;
      } else if (tab === 'thumbs') {
        const ts = Object.values(D.THUMBS);
        entries = ts.map((t) => entry(I.url(t.id), t.name, `<span class="mono" style="font-size:10.5px;color:${D.RARITY[t.rarity].col}">${D.RARITY[t.rarity].name}</span> · ${esc(t.desc)}<br><span class="red">− ${esc(t.down)}</span>`, S.isDiscovered('thumbs', t.id))).join('');
        count = ts.filter((t) => S.isDiscovered('thumbs', t.id)).length + ' / ' + ts.length;
      } else if (tab === 'enemies') {
        const es = Object.values(D.ENEMIES);
        entries = es.map((e) => entry(enemyURL(e.id), e.name, esc(e.desc), S.isDiscovered('enemies', e.id))).join('');
        count = es.filter((e) => S.isDiscovered('enemies', e.id)).length + ' / ' + es.length;
      } else if (tab === 'bosses') {
        const bs = Object.values(D.BOSSES);
        entries = bs.map((b) => entry(bossURL(b.id), b.name, '<i>“' + esc(b.title) + '”</i><br>' + esc(b.desc), S.isDiscovered('bosses', b.id))).join('');
        count = bs.filter((b) => S.isDiscovered('bosses', b.id)).length + ' / ' + bs.length;
      } else {
        const chs = D.CHALLENGES.filter(D.challengeOffered);
        entries = chs.map((c) => {
          const done = S.hasChallenge(c.id);
          return `<div class="ucard entry ${done ? 'owned' : ''}"><img class="uico" src="${I.url(done ? 'crown' : 'lock')}" alt=""><div class="ubody"><div class="un">${esc(c.name)}</div><div class="ud">${esc(c.desc)}<br><span class="${done ? 'green' : 'muted'} mono" style="font-size:10.5px">${done ? 'DONE' : 'REWARD'} · ${c.reward} CL0UT</span></div></div></div>`;
        }).join('');
        count = chs.filter((c) => S.hasChallenge(c.id)).length + ' / ' + chs.length;
      }
      return `<div class="screen s-page">${clockTR('green')}
        <div class="ff">${head('COLLECTION', 'EVERYTHING YOU HAVE FOUND IN THE UNDERGROUND', `<div class="count-pill">${count}</div>`)}
        ${tabsH}
        <div class="pscroll"><div class="pgrid small">${entries}</div></div></div>
        ${tagBL()}${recordsBR()}
      </div>`;
    },

    // ------------------------------------------------------------ shop
    s_shop(arg) {
      const S = Save(), d = S.data, tab = arg.tab;
      const tabsH = tabs([['perks', 'PERMANENT PERKS'], ['unlocks', 'UNLOCKS'], ['drip', 'DRIP'], ['cos', 'COSMETICS']], tab, 'stab');
      const cash = I.url('clout_stack');
      const price = (act, a, label, off) => `<button class="price" data-act="${act}" data-arg="${a}" ${off ? 'disabled' : ''}>${typeof label === 'number' ? `<img src="${cash}" alt=""><span>${label}</span>` : `<span class="pl">${label}</span>`}</button>`;
      const perkIcon = { hp: 'st_hp', regen: 'st_regen', might: 'st_dmg', speed: 'st_speed', magnet: 'st_magnet', growth: 'st_xp', luck: 'st_luck', greed: 'clout_stack', reroll: 'reroll', banish: 'skull', dash: 'st_dash', armor: 'st_armor', slot: 'glock', bside: 'tape_dmg' };
      let body = '';
      if (tab === 'perks') {
        body = D.PERKS.map((pk) => {
          const lv = S.perk(pk.id), maxed = lv >= pk.max, cost = maxed ? 0 : pk.cost[lv], locked = !maxed && pk.req && !pk.req(S);
          const pips = Array.from({ length: pk.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
          return `<div class="ucard ${maxed ? 'owned' : ''}"><img class="uico" src="${I.url(perkIcon[pk.id] || 'gem')}" alt=""><div class="ubody"><div class="un">${pk.name}</div><div class="ud">${esc(pk.desc)}</div><div class="pips">${pips}</div></div>
            ${price('buyPerk', pk.id, maxed ? 'MAX' : locked ? pk.reqText : cost, maxed || locked || d.clout < cost)}</div>`;
        }).join('');
      } else if (tab === 'unlocks') {
        body = D.UNLOCKS.filter(D.unlockOffered).map((u) => {
          const own = S.isUnlocked(u.kind, u.id);
          return `<div class="ucard ${own ? 'owned' : ''}"><img class="uico" src="${I.url(u.icon)}" alt=""><div class="ubody"><div class="un">${esc(u.name)}</div><div class="ud">${esc(u.desc)}</div></div>
            ${price('buyUnlock', u.kind + ':' + u.id, own ? 'OWNED' : u.cost, own || d.clout < u.cost)}</div>`;
        }).join('');
      } else {
        const kind = tab === 'cos' ? 'mask' : 'chain';
        body = D.COSMETICS.filter((c) => !c.free && c.kind === kind).map((c) => {
          const own = S.isUnlocked('cosmetics', c.id);
          const label = own ? 'OWNED' : c.cost < 0 ? 'CHALLENGE' : c.cost;
          return `<div class="ucard ${own ? 'owned' : ''}"><div class="uico swatch-ico" style="--c:${c.col}"></div><div class="ubody"><div class="un">${c.kind.toUpperCase()} · ${c.name}</div><div class="ud">${c.cond ? esc(c.cond) : 'Equip it in CHARACTER SELECT.'}</div></div>
            ${price('buyCos', c.id, label, own || c.cost < 0 || d.clout < c.cost)}</div>`;
        }).join('');
      }
      return `<div class="screen s-page">${clockTR('green')}
        <div class="ff">${head('UPGRADES', 'SPEND CL0UT <b>•</b> EARNED EVERY RUN, EVEN WHEN YOU LOSE')}
        ${tabsH}
        <div class="pscroll"><div class="pgrid">${body}</div></div></div>
        ${tagBL()}${recordsBR()}
      </div>`;
    },

    // ------------------------------------------------------------ settings
    s_settings() {
      const s = Save().s;
      const slider = (k, name) => `<div class="setting"><label>${name}</label><input type="range" min="0" max="100" value="${Math.round(s[k] * 100)}" data-set="${k}" style="--v:${Math.round(s[k] * 100)}%"><span class="v" id="v-${k}">${Math.round(s[k] * 100)}</span></div>`;
      const toggle = (k, name) => `<div class="setting"><label>${name}</label><button class="toggle ${s[k] ? 'on' : ''}" data-act="toggle" data-arg="${k}">${s[k] ? 'ON' : 'OFF'}</button><span></span></div>`;
      const fs = !!document.fullscreenElement;
      return `<div class="screen s-page ${this.back === 'pause' ? 'dim' : ''}">${clockTR('green')}
        <div class="ff"><header class="page-head"><div class="ph-l"><h1 class="title-xl" data-t="SETTINGS">SETTINGS</h1><div class="psub">AUDIO <b>•</b> SCREEN <b>•</b> CONTROLS</div></div><div class="ph-r">${back()}</div></header>
        <div class="pscroll set"><div class="set-grid">
          <section class="spanel"><div class="sp-h">AUDIO</div>
            ${slider('master', 'MASTER VOLUME')}${slider('menuMusic', 'MENU MUSIC')}${slider('runMusic', 'IN-GAME MUSIC')}${slider('sfx', 'SOUND FX')}
            <div class="sp-h" style="margin-top:18px">SCREEN</div>
            ${slider('shake', 'SCREEN SHAKE')}${slider('crt', 'CRT FILTER')}
            ${toggle('dmgNumbers', 'DAMAGE NUMBERS')}${toggle('reduceFlash', 'REDUCE FLASHING')}
            <div class="setting"><label>FULLSCREEN</label><button class="toggle ${fs ? 'on' : ''}" data-act="fullscreen">${fs ? 'ON' : 'OFF'}</button><span></span></div>
            <div class="setting-hint">Graphics quality adjusts itself: if the frame rate drops below 60 for a few seconds, detail steps down automatically.</div>
          </section>
          <section class="spanel"><div class="sp-h">CONTROLS</div>
            <div class="keys"><span><kbd>WASD</kbd> / arrows move</span><span><kbd>SPACE</kbd> dash</span><span><kbd>F</kbd> <kbd>Q</kbd> <kbd>SHIFT</kbd> ability</span><span><kbd>E</kbd> open chest</span><span><kbd>ESC</kbd> pause</span><span><kbd>A</kbd> <kbd>D</kbd> + <kbd>E</kbd> or <kbd>1–4</kbd> pick card</span><span><kbd>R</kbd> reroll</span><span>gamepad supported</span></div>
            <div class="row" style="margin-top:24px"><button class="btn small danger" data-act="reset">RESET ALL PROGRESS</button></div>
          </section>
        </div></div></div>
        ${tagBL()}
      </div>`;
    },
    after_settings() {
      document.querySelectorAll('[data-set]').forEach((el) => {
        el.addEventListener('input', () => {
          const k = el.dataset.set;
          Save().s[k] = el.value / 100;
          document.getElementById('v-' + k).textContent = el.value;
          el.style.setProperty('--v', el.value + '%');
          RS.Main.applySettings();
        });
        el.addEventListener('change', () => { Save().save(); RS.Audio.sfx('ui'); });
      });
    },
    s_confirm() {
      return `<div class="screen s-page s-confirm"><div class="spanel confirm-box">
        <div class="title-xl r" data-t="RESET?">RESET?</div>
        <p>This wipes all CL0UT, unlocks, perks, discoveries and records. It cannot be undone.</p>
        <div class="row center"><button class="btn" data-act="settings">CANCEL</button><button class="btn danger primary" data-act="resetYes">WIPE IT</button></div>
      </div></div>`;
    },

    // ------------------------------------------------------------ credits
    s_credits() {
      return `<div class="screen s-page s-credits">${clockTR('green')}
        <div class="ff"><div class="ph-r abs">${back('main')}</div>
        <div class="credits">
          <div class="credits-logo lglow">${logo('logo-img')}</div>
          <section class="spanel">
            <div class="sp-h">GAME DIRECTION</div><div class="cr-name">DPLDS</div>
            <div class="muted">Design, code, procedural art &amp; audio · built together with Claude</div>
            <div class="hr"></div>
            <p class="muted">Heroes, enemies and floors are generated in code at startup; item icons, props and the TWIZZYRICH animation sheet are cut from the game's own pixel-art sheets.<br>Every beat, 808 and sound effect is synthesized live with the Web Audio API. No samples, no copyrighted tracks, no real artists.</p>
            <p class="muted">Inspired by the survivor-like genre, chaotic build-crafting roguelites and 2021 underground rage culture. All characters, enemies and items are fictional.</p>
            <div class="hr"></div>
            <div class="sp-h green">THANKS FOR PLAYING · STAY TURNT · STAY SCHMUNKED</div>
          </section>
        </div></div>
        ${tagBL()}
      </div>`;
    },
  };

  window.addEventListener('keydown', (e) => Screens.onKey(e));
  Screens.logo = logo; // the chrome logo <img>, shared with the run overlays (pause)
  RS.Screens = Screens;
})(window.RS);
