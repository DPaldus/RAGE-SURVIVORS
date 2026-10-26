'use strict';
// In-run DOM overlays: level up, chest, RAGE THUMB choice, pause, victory, results.
(function (RS) {
  const U = RS.U, D = RS.Data, I = RS.Icons, esc = U.esc;
  const ui = () => document.getElementById('ui');
  const G = () => RS.Game;

  const TIPS = [
    'A maxed weapon plus its passive evolves in the next chest you open.',
    'Some things just work together. Nobody is going to tell you which.',
    'THE PLUG never stays long. Every deal costs more and hits harder.',
    'Hallucinations hit for real. Do not let the pony cook.',
    'Your dash goes through attacks for a split second. Dash through a telegraph, not around it.',
    'THE BELLS ring on the beat. Be in the middle of the crowd when they do.',
    'CHICKEN BOX heals 20% of your max HP once you have more than 150.',
    'CL0UT stays even when you lose. Spend it in UPGRADES.',
    'Gold telegraphs mean the label is paying attention. Keep moving.',
    'VAMP FANGS keeps you topped up in a crowd. Being worn down is the real killer.',
    'Type a few words on the main menu. Some of them do something.',
    'Stand in an ALTAR ring until it is charged. It always pays out a STASH item.',
    'STASH items stack. A second copy of the same one makes it stronger.',
    'You start with 3 weapon slots. Clear WAVE 15 once and the 4th is yours for good; FEATURE SLOT in UPGRADES adds a 5th.',
    'A maxed or evolved weapon still grows: take its MODS.',
    'Every wave lasts a minute. Its last 3 seconds bring nobody new: catch your breath, grab the XP.',
    'You start with 2 TAPE slots (B-SIDE in UPGRADES adds more). Once they are full only your own TAPES come up.',
  ];
  // stash icons with the copy count and the item text as a tooltip (pause and results)
  const stashRow = (list) => list.map((x) => {
    const def = D.STASH[x.id], col = D.RARITY[def.rarity].col;
    return `<span class="stash-ico" style="--c:${col}" title="${esc(def.name)}${x.n > 1 ? ' x' + x.n : ''} · ${esc(def.desc)}"><img src="${I.url(x.id)}" alt="">${x.n > 1 ? `<b>x${x.n}</b>` : ''}</span>`;
  }).join('');
  // one line under the results title: a verdict on the run, in the scene's own words
  function roast(r) {
    const why = (r.reason || '').toUpperCase();
    let lines;
    if (r.victory) lines = ['INDEPENDENT. 100% OF YOUR MASTERS. NO FEATURES.', 'THE LABEL FOLDED. YOU OWN EVERYTHING NOW.', 'FROM THE BASEMENT TO THE MAIN STAGE.'];
    else if (r.survived30) lines = ['360 DEAL SIGNED. THEY OWN YOUR SHADOW NOW.', 'SO CLOSE. THE FINE PRINT GOT YOU.', 'THIRTY MINUTES OF RAGE AND THEY STILL WANT A CUT.'];
    else if (r.time < 180) lines = ['LIL BRO LOGGED OFF EARLY.', 'SKILL ISSUE (AFFECTIONATE).', 'THAT WAS A SNIPPET, NOT A SONG.'];
    else if (/PONY/.test(why)) lines = ["RATIO'D BY A PINK PONY.", 'THE PONY COOKED.'];
    else if (/STRETCH|SMILEY|GHOST|SNEAKER/.test(why)) lines = ['TAKEN OUT BY SOMETHING THAT WAS NOT EVEN THERE.', 'THE TRIP WON THIS ONE.'];
    else if (/SECURITY/.test(why)) lines = ['ESCORTED OUT BY SECURITY. NO RE-ENTRY.', 'HI-VIS VEST ENERGY.'];
    else lines = ['IT IS OVER. (IT IS NEVER OVER.)', 'L + RATIO + RUN IT BACK.', 'FELL OFF. TIME FOR THE COMEBACK ARC.', 'THE CROWD WANTS AN ENCORE.', 'ONE MORE RUN. TRUST.'];
    return U.pick(lines);
  }

  const O = {
    kind: null, cards: [], thumbIds: [], banishMode: false, readyAt: 0, chestTimer: null,
    init() {
      window.addEventListener('keydown', (e) => this.onKey(e));
    },
    hide() {
      if (this.chestTimer) { clearTimeout(this.chestTimer); this.chestTimer = null; }
      ui().innerHTML = '';
      this.kind = null;
    },
    render(html, kind) {
      this.kind = kind;
      ui().innerHTML = html;
      ui().querySelectorAll('.title').forEach((el) => { el.dataset.t = el.textContent.trim(); }); // copy for the CSS shine / glitch layers
      ui().querySelectorAll('[data-act]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (el.disabled) return;
          this.act(el.dataset.act, el.dataset.arg);
        });
        el.addEventListener('mouseenter', () => RS.Audio.sfx('hover'));
      });
    },
    ready() { return performance.now() >= this.readyAt; },

    onKey(e) {
      if (!this.kind) return;
      const k = e.code;
      let used = true;
      if (this.kind === 'levelup') {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[k];
        if (n !== undefined && this.cards[n]) this.act('pick', String(n));
        else if (k === 'KeyR') this.act('reroll');
        else if (k === 'KeyB') this.act('banish');
        else used = false;
      } else if (this.kind === 'thumb') {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[k];
        if (n !== undefined && this.thumbIds[n]) this.act('thumbPick', String(n));
        else used = false;
      } else if (this.kind === 'plug') {
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[k];
        if (n !== undefined && this.cards[n]) this.act('plugBuy', String(n));
        else if ((k === 'KeyE' || k === 'Escape') && !e.repeat) this.act('plugLeave');
        else used = false;
      } else if (this.kind === 'chest') {
        if (k === 'KeyE' && !e.repeat) this.act('chestDone'); else used = false; // E: skip the spin, then collect
      } else if (this.kind === 'pause') {
        if (k === 'Escape' || k === 'KeyP') this.act('resume'); else used = false;
      } else if (this.kind === 'results') {
        if (k === 'Enter') this.act('retry'); else used = false;
      } else used = false;
      if (used) { RS.Input.pressedKeys.delete(k); e.preventDefault(); }
    },

    act(a, arg) {
      const g = G(), p = g.p;
      if (['pick', 'reroll', 'banish', 'skip', 'thumbPick', 'thumbSkip', 'chestDone', 'plugBuy', 'plugLeave'].includes(a) && !this.ready()) return;
      RS.Audio.sfx('ui');
      switch (a) {
        // ---- level up
        case 'pick': {
          const i = +arg, c = this.cards[i];
          if (!c) return;
          if (this.banishMode) {
            if (p.banishes <= 0) return;
            p.banishes--; p.banished.add(c.id);
            const nc = RS.Progression.refill(g, this.cards, i);
            if (nc) this.cards[i] = nc; else this.cards.splice(i, 1);
            this.banishMode = false;
            RS.Audio.sfx('break');
            this.drawLevelUp();
            return;
          }
          RS.Progression.pick(g, c);
          this.afterLevel();
          break;
        }
        case 'reroll':
          if (p.rerolls <= 0) return;
          p.rerolls--;
          this.cards = RS.Progression.choices(g);
          this.banishMode = false;
          RS.Audio.sfx('chestTick');
          this.drawLevelUp();
          break;
        case 'banish':
          if (p.banishes <= 0) return;
          this.banishMode = !this.banishMode;
          this.drawLevelUp();
          break;
        // ---- thumbs
        case 'thumbPick': {
          const id = this.thumbIds[+arg];
          if (!id) return;
          p.addThumb(id);
          RS.FX.banner(D.THUMBS[id].name, 'RAGE THUMB EQUIPPED', D.THUMBS[id].col, 2.4);
          RS.FX.glitch(0.3);
          RS.Audio.sfx('thumb');
          g.closeModal();
          break;
        }
        case 'thumbSkip': g.addRunClout(20); g.closeModal(); break;
        // ---- THE PLUG
        case 'plugBuy': {
          const c = this.cards[+arg];
          if (!c) return;
          if (!g.buyPlug(c)) { RS.Audio.sfx('hurt'); this.plugBroke = +arg; this.drawPlug(); return; }
          g.closeModal();
          break;
        }
        case 'plugLeave': g.closeModal(); break;
        // ---- chest
        case 'chestDone': if (this.chestStep === 'spin') this.revealChest(); else this.collectChest(); break;
        // ---- pause
        case 'resume': g.resume(); break;
        case 'restart': this.hide(); RS.Main.startRun(); break;
        case 'pSettings': RS.Screens.show('settings', { back: 'pause' }); this.kind = 'settings'; break;
        case 'menu': this.render(this.confirmQuit(), 'confirm'); break;
        case 'menuYes': this.hide(); g.finishRun(false, true); break;
        case 'pauseBack': this.pause(); break;
        // ---- victory
        case 'cashout': this.hide(); g.finishRun(true); break;
        // ---- results
        case 'retry': this.hide(); RS.Main.startRun(); break;
        case 'setup': this.hide(); g.quitToMenu(); RS.Screens.act('chars', 'main'); break;
        case 'mapsel': this.hide(); g.quitToMenu(); RS.Screens.act('play'); break;
        case 'toMenu': this.hide(); g.quitToMenu(); break;
      }
    },
    afterLevel() {
      const g = G();
      if (g.p.pendingLevels > 0) this.levelUp(true);
      else g.closeModal();
    },

    // ------------------------------------------------------------ level up
    levelUp(again) {
      const g = G();
      this.cards = RS.Progression.choices(g);
      // nothing left to offer: take the small consolation reward instead of an empty screen
      if (!this.cards.length) { RS.Progression.skip(g); this.afterLevel(); return; }
      this.banishMode = false;
      this.readyAt = performance.now() + (again ? 200 : 380);
      if (!again) RS.Audio.sfx('levelup');
      this.drawLevelUp();
    },
    // Level-up card: the rarity drives the whole frame (border weight, colour, header bar, pips; EPIC adds a glow and
    // a slow light sweep, LEGENDARY a slow breathing glow on top). The description is cut to its first sentence so
    // the card reads at a glance; the effect lines below say exactly what you get.
    cardHTML(c, i) {
      const R = D.RARITY[c.rarity];
      return `<div class="card r${c.rarity}" data-act="pick" data-arg="${i}">
        ${c.rarity >= 3 ? '<div class="sheen"></div>' : ''}
        ${c.isNew ? '<div class="hot">NEW</div>' : ''}
        <div class="rar"><span class="rn">${R.name}</span><span class="pips">${'<i></i>'.repeat(c.rarity + 1)}</span></div>
        <div class="type">${esc(c.type)}</div>
        <div class="iconbox"><img class="icon" src="${I.url(c.icon)}" alt=""></div>
        <div class="name">${esc(c.name)}</div>
        <div class="lvl">${esc(c.lvl || '')}</div>
        ${c.desc ? `<div class="desc">${esc(this.shortDesc(c.desc))}</div>` : ''}
        <div class="eff">${c.effects.map((e) => `<div>${esc(e)}</div>`).join('')}</div>
        ${c.syn ? `<div class="syn">${esc(c.syn)}</div>` : ''}
        <div class="keyhint">${i + 1}</div>
      </div>`;
    },
    shortDesc(t) {
      const m = t.match(/^[^.!?]*[.!?]/), s = m ? m[0] : t;
      return s.length > 90 ? s.slice(0, s.lastIndexOf(' ', 86)) + '…' : s;
    },
    drawLevelUp() {
      const g = G(), p = g.p;
      const html = `<div class="screen dim2 levelup">
        <div class="title">LEVEL <span class="g">UP</span></div>
        <div class="subtitle">LV ${p.level - p.pendingLevels + 1}${p.pendingLevels > 1 ? ' · ' + p.pendingLevels + ' LEVELS PENDING' : ''} · ${this.banishMode ? '<span class="red">CLICK A CARD TO BANISH IT FOR THIS RUN</span>' : 'CHOOSE ONE'}</div>
        <div class="cards ${this.banishMode ? 'banish' : ''}">${this.cards.map((c, i) => this.cardHTML(c, i)).join('')}</div>
        <div class="row center">
          <button class="btn" data-act="reroll" ${p.rerolls > 0 ? '' : 'disabled'}>REROLL (${p.rerolls}) <span class="k">R</span></button>
          <button class="btn ${this.banishMode ? 'primary' : ''}" data-act="banish" ${p.banishes > 0 ? '' : 'disabled'}>BANISH (${p.banishes}) <span class="k">B</span></button>
        </div>
      </div>`;
      this.render(html, 'levelup');
    },

    // ------------------------------------------------------------ THE PLUG
    // The dealer's offer: 3 level-up cards with a price tag each. 1-3 / click buys (he packs up and moves on),
    // E / Esc walks away (the offer stays while he stays at this spot).
    plug() {
      this.cards = G().plugCards();
      this.plugBroke = -1;
      this.readyAt = performance.now() + 350;
      RS.Audio.sfx('coin');
      this.drawPlug();
    },
    drawPlug() {
      const g = G(), deal = (g.plugBuys || 0) + 1, cash = Math.floor(g.runClout);
      const cards = this.cards.map((c, i) => {
        const can = cash >= c.price;
        return this.cardHTML(c, i).replace('data-act="pick"', 'data-act="plugBuy"')
          .replace(/<div class="keyhint">/, `<div class="plug-price ${can ? '' : 'no'} ${this.plugBroke === i ? 'shake' : ''}">$${c.price}${can ? '' : `<span class="need">NEED $${c.price - cash} MORE</span>`}</div><div class="keyhint">`);
      }).join('');
      const html = `<div class="screen dim2 levelup plugui">
        <div class="title">THE <span class="g">PLUG</span></div>
        <div class="subtitle">DEAL #${deal} · EVERY DEAL COSTS MORE AND HITS HARDER · YOU HAVE <span class="cash">RUN $${cash}</span></div>
        <div class="subtitle small">he only takes CL0UT picked up this run · your bank stays in the bank</div>
        <div class="cards">${cards}</div>
        <div class="row center"><button class="btn" data-act="plugLeave">WALK AWAY <span class="k">E</span></button></div>
      </div>`;
      this.render(html, 'plug');
    },

    // ------------------------------------------------------------ chest
    // Chest flow, all on E (or a click on the button): the chest was opened with E in the world ->
    //   1. SPIN   reels spin and slow down (~1.7 s), E skips straight to the result
    //   2. RESULT the rolled items are shown, nothing is granted yet, E collects them
    // Each step ignores E for a short moment so one press never runs through two steps.
    chest(tier) {
      const g = G();
      this.chestRes = RS.Progression.openChest(g, tier);
      this.chestStep = 'spin';
      this.readyAt = performance.now() + 200;
      const pool = g.p.weapons.map((w) => w.def.id).concat(g.p.passives.map((x) => x.id), ['gem', 'coin', 'chest']);
      const title = tier === 'boss' ? 'BOSS CHEST' : tier === 'legendary' ? 'LEGENDARY CHEST' : tier === 'supply' ? 'SUPPLY CRATE' : 'CHEST';
      const n = this.chestRes.length;
      const html = `<div class="screen dim2 chestui">
        <div class="title">${title}</div>
        <div class="subtitle">${n} ITEM${n > 1 ? 'S' : ''} INSIDE</div>
        <div class="slot-spin" id="spin">${[0, 1, 2].map(() => `<img src="${I.url(U.pick(pool))}">`).join('')}</div>
        <div class="row center"><button class="btn primary" data-act="chestDone">SKIP <span class="k">E</span></button></div>
        <div class="chest-hint">ROLLING… PRESS <b>E</b> TO SKIP</div>
      </div>`;
      this.render(html, 'chest');
      // reels tick fast, then slow down before they stop on the result
      let tick = 0, delay = 45;
      const spin = () => {
        const sp = document.getElementById('spin');
        if (!sp || this.chestStep !== 'spin') return;
        sp.querySelectorAll('img').forEach((im) => { im.src = I.url(U.pick(pool)); });
        RS.Audio.sfx('chestTick');
        tick++; delay = 45 + tick * tick * 0.6; // ~1.7 s in total
        if (tick > 16) { this.chestTimer = null; this.revealChest(); return; }
        this.chestTimer = setTimeout(spin, delay);
      };
      this.chestTimer = setTimeout(spin, delay);
    },
    revealChest() {
      if (this.chestStep !== 'spin') return;
      if (this.chestTimer) { clearTimeout(this.chestTimer); this.chestTimer = null; }
      this.chestStep = 'result';
      const res = this.chestRes;
      const hasEvo = res.some((r) => r.type === 'evo');
      const items = res.map((r, i) => `<div class="chest-item ${r.type === 'evo' ? 'evo' : r.type === 'stash' ? 'stash' : ''}" style="animation-delay:${i * 0.12}s${r.type === 'stash' ? ';--c:' + D.RARITY[r.rarity].col : ''}">
        <img src="${I.url(r.icon)}"><div class="n">${r.type === 'evo' ? 'EVOLVES: ' : ''}${esc(r.name)}</div><div class="d">${esc(r.desc)}</div></div>`).join('');
      const html = `<div class="screen dim2 chestui">
        <div class="title">${hasEvo ? '<span class="r">EVOLUTION</span>' : 'LOOT'}</div>
        <div class="subtitle">${res.length} ITEM${res.length > 1 ? 'S' : ''} · ADDED TO YOUR BUILD</div>
        <div class="chest-items">${items}</div>
        <div class="row center"><button class="btn primary" data-act="chestDone">COLLECT <span class="k">E</span></button></div>
        <div class="chest-hint">PRESS <b>E</b> TO COLLECT</div>
      </div>`;
      this.render(html, 'chest');
      RS.Audio.sfx(hasEvo ? 'evolve' : 'chest');
      this.readyAt = performance.now() + 350;
    },
    collectChest() {
      if (this.chestStep !== 'result') return;
      this.chestStep = null;
      const g = G();
      RS.Progression.collectChest(g, this.chestRes);
      RS.Audio.sfx('pickup');
      g.closeModal();
    },

    // ------------------------------------------------------------ thumbs
    thumb(n) {
      const g = G();
      this.thumbIds = RS.Progression.thumbOffer(g, n);
      if (!this.thumbIds.length) { g.addRunClout(25); RS.FX.banner('NO THUMBS LEFT', '+25 CL0UT', '#ff4f6e', 2); g.closeModal(); return; }
      this.readyAt = performance.now() + 400;
      const cards = this.thumbIds.map((id, i) => {
        const t = D.THUMBS[id], R = D.RARITY[t.rarity];
        return `<div class="card thumb r${t.rarity}" data-act="thumbPick" data-arg="${i}">
          <div class="rar"><span>${R.name}</span><span class="type">RAGE THUMB</span></div>
          <img class="icon" src="${I.url(id)}"><div class="name" style="color:${U.mixHex(t.col, '#ffffff', 0.45)}">${t.name}</div>
          <div class="eff"><div>${esc(t.desc)}</div></div><div class="downside">− ${esc(t.down)}</div>
          <div class="keyhint">${i + 1}</div></div>`;
      }).join('');
      this.render(`<div class="screen dim2">
        <div class="title">RAGE <span class="r">THUMB</span></div>
        <div class="subtitle">A BUILD-DEFINING MODIFIER · LASTS THE WHOLE RUN</div>
        <div class="cards">${cards}</div>
        <div class="row center"><button class="btn small" data-act="thumbSkip">LEAVE IT · +20 CL0UT</button></div>
      </div>`, 'thumb');
      RS.Audio.sfx('thumb');
    },

    // ------------------------------------------------------------ pause
    pause() {
      const g = G(), p = g.p, s = p.s;
      const build = p.weapons.map((w) => `<img class="${w.def.evolved ? 'ev' : ''}" title="${esc(w.def.name)} LV ${w.level}${w.mods ? ' · ' + w.mods + (w.mods > 1 ? ' MODS' : ' MOD') : ''}" src="${I.url(w.def.id)}">`).join('') +
        p.tapes.map((t) => `<img class="tp" style="--c:${t.def.col}" title="${esc(t.def.name)} LV ${t.level}" src="${I.url(t.id)}">`).join('') +
        p.passives.map((x) => `<img title="${esc(x.def.name)} LV ${x.level}" src="${I.url(x.id)}">`).join('') +
        p.thumbs.map((t) => `<img title="${esc(t.def.name)}" src="${I.url(t.id)}" class="th">`).join('');
      const stat = (k, v) => `<div class="k">${k}</div><div class="v">${v}</div>`;
      // what the build has become: synergies by name, resonance as tag name + tier (never the items behind it)
      const syn = p.syn.map((sy) => `<span style="--c:${sy.col}" title="${esc(sy.desc)}">${esc(sy.name)}</span>`).join('') +
        Object.keys(p.res || {}).filter((k) => p.res[k]).map((k) => `<span style="--c:${D.TAGS[k].col}">${D.TAGS[k].name} ${['', 'I', 'II', 'III'][p.res[k]]}</span>`).join('');
      const html = `<div class="screen dim">
        <div class="corner-logo lglow">${RS.Screens.logo('logo-img')}</div>
        <div class="title paused">PAUSED</div>
        <div class="subtitle">${U.fmtTime(g.time)} · LV ${p.level} · ${g.stats.kills} KILLS · ${esc(g.arenaDef.name)}</div>
        <div class="pause-build">${build}</div>
        ${p.stashOrder.length ? `<div class="pause-stash">${stashRow(p.stashOrder.map((id) => ({ id, n: p.stash[id] })))}</div>` : ''}
        ${syn ? `<div class="pause-syn">${syn}</div>` : ''}
        <div class="row center" style="align-items:flex-start;gap:20px">
          <div class="panel frame" style="min-width:320px"><i class="cb tl"></i><i class="cb tr"></i><i class="cb bl"></i><i class="cb br"></i><div class="label" style="margin-bottom:10px">RUN STATS</div><div class="kv">
            ${stat('MAX HP', s.maxHp)}${stat('DAMAGE', 'x' + s.might.toFixed(2))}${stat('COOLDOWN', 'x' + s.cooldown.toFixed(2))}
            ${stat('AREA', 'x' + s.area.toFixed(2))}${stat('MOVE SPEED', 'x' + s.moveSpeed.toFixed(2))}${stat('CRIT', U.pct(s.critChance) + ' · x' + s.critMult.toFixed(1))}
            ${stat('ARMOR', s.armor)}${stat('EVASION', U.pct(s.evasion))}${stat('REGEN', s.regen.toFixed(1) + '/s')}
            ${stat('LUCK', 'x' + s.luck.toFixed(2))}${stat('AMOUNT', '+' + s.amount)}${stat('PICKUP', Math.round(s.magnet))}
          </div></div>
          <div class="menu">
            <button class="btn primary" data-act="resume">RESUME <span class="k">ESC</span></button>
            <button class="btn" data-act="restart">RESTART RUN</button>
            <button class="btn" data-act="pSettings">SETTINGS</button>
            <button class="btn" data-act="menu">QUIT TO MENU</button>
          </div>
        </div>
        <div class="pause-tip"><b>TIP</b> · ${esc(U.pick(TIPS))}</div>
      </div>`;
      this.render(html, 'pause');
    },
    confirmQuit() {
      return `<div class="screen dim"><div class="panel confirm-box">
        <div class="title r" style="font-size:56px">QUIT RUN?</div>
        <p>You keep the CL0UT earned so far. The run ends here.</p>
        <div class="row center"><button class="btn" data-act="pauseBack">CANCEL</button><button class="btn danger primary" data-act="menuYes">END RUN</button></div>
      </div></div>`;
    },

    // ------------------------------------------------------------ victory
    victory() {
      this.readyAt = performance.now() + 500;
      RS.Audio.sfx('win');
      this.render(`<div class="screen dim victory">
        <div class="logo"><span class="l1" data-t="LABEL DOWN"><span class="tx">LABEL DOWN</span></span><span class="l3">${U.fmtTime(G().time)} · INDEPENDENT FOREVER</span></div>
        <div style="height:28px"></div>
        <div class="menu">
          <button class="btn primary" data-act="cashout">CASH OUT</button>
        </div>
      </div>`, 'victory');
    },

    // ------------------------------------------------------------ results
    results(r) {
      const C = D.CHARACTERS[r.char];
      const kv = (k, v) => `<div class="k">${k}</div><div class="v">${v}</div>`;
      const ws = r.weapons.slice().sort((a, b) => b.dmg - a.dmg).map((w) => `<tr><td><img src="${I.url(w.id)}"> ${esc(w.name)} ${w.evolved ? '<span class="tag red">EVO</span>' : '<span class="muted mono" style="font-size:11px">LV ' + w.level + '</span>'}${w.mods ? ' <span class="mono" style="font-size:11px;color:#ffd23f">+' + w.mods + (w.mods > 1 ? ' MODS' : ' MOD') + '</span>' : ''}</td><td class="r">${U.fmtNum(w.dmg)}</td><td class="r">${w.kills}</td></tr>`).join('');
      const unlocks = r.unlocks.map((u) => `<div>${esc(u)}</div>`).join('') + r.challenges.map((c) => `<div>CHALLENGE: ${esc(c)}</div>`).join('');
      const title = r.victory ? 'INDEPENDENT' : r.survived30 ? 'SIGNED' : 'WASTED'; // SIGNED: made it to 30:00, the label got you
      const html = `<div class="screen dim">
        <div class="wrap">
          <div class="title ${r.victory ? 'g' : 'r'}">${title}</div>
          <div class="subtitle">${C.name} · ${esc(r.arena)} · ${esc(r.mapName || 'NORMAL')}${r.stage !== 'NORMAL' ? ' · ' + r.stage + ' STAGE' : ''}</div>
          <div class="roast">${esc(roast(r))}</div>
          <div class="results">
            <div class="panel"><div class="kv">
              ${kv('RUN ENDED', esc(r.reason))}
              ${kv('SURVIVED', U.fmtTime(r.time) + (r.survived30 ? ' · FULL 30:00' : ''))}${kv('WAVES', (r.waves || 0) + ' / ' + RS.Data.WAVES)}${kv('KILLS', r.kills)}${kv('LEVEL', r.level)}${kv('CL0UT PICKED UP', r.coins)}${kv('DAMAGE DEALT', U.fmtNum(r.damage))}
              ${kv('DAMAGE TAKEN', U.fmtNum(r.damageTaken))}${kv('BOSSES', r.bosses.length ? r.bosses.map((b) => D.BOSSES[b].name.replace('THE ', '')).join(', ') : '—')}
              ${kv('EVOLUTIONS', r.evolutions.length ? r.evolutions.map((e) => D.WEAPONS[e].name).join(', ') : '—')}${kv('ITEMS COLLECTED', r.items)}
              ${kv('RAGE THUMBS', r.thumbs.length ? r.thumbs.map((t) => D.THUMBS[t].name.replace(' THUMB', '')).join(', ') : '—')}
              ${kv('SYNERGIES', r.synergies && r.synergies.length ? r.synergies.map(esc).join(', ') : '—')}
              ${kv('NEW DISCOVERIES', r.discoveries)}
            </div>
            <div class="hr"></div>
            <div class="row between"><span class="label" style="color:var(--text)">CL0UT EARNED</span><span class="disp green" style="font-size:40px;line-height:1">+${r.clout + r.challengeClout}</span></div>
            ${r.cash > 1 ? `<div class="muted mono" style="text-align:right;font-size:11px">${esc(r.mapName)} · ${r.cash}× CASH on the run payout</div>` : ''}
            ${r.challengeClout ? `<div class="muted mono" style="text-align:right;font-size:11px">(incl. ${r.challengeClout} from challenges)</div>` : ''}
            ${unlocks ? `<div class="hr"></div><div class="label" style="margin-bottom:6px">NEW UNLOCKS</div><div class="unlock-list">${unlocks}</div>` : ''}
            </div>
            <div class="panel"><div class="label" style="margin-bottom:8px">WEAPON DAMAGE</div>
              <table class="wtable"><tr class="muted"><td>WEAPON</td><td class="r">DMG</td><td class="r">KILLS</td></tr>${ws}</table>
              <div class="pause-build" style="justify-content:flex-start;margin-top:10px">${(r.tapes || []).map((t) => `<img class="tp" style="--c:${D.TAPES[t.id].col}" title="${esc(t.name)} LV ${t.level}" src="${I.url(t.id)}">`).join('')}${r.passives.map((x) => `<img title="${esc(x.name)} LV ${x.level}" src="${I.url(x.id)}">`).join('')}</div>
              ${r.stash && r.stash.length ? `<div class="pause-stash" style="justify-content:flex-start">${stashRow(r.stash)}</div>` : ''}
            </div>
          </div>
          <div class="row center" style="margin-top:14px">
            <button class="btn primary" data-act="retry">RETRY <span class="k">ENTER</span></button>
            <button class="btn" data-act="mapsel">CHANGE MAP</button>
            <button class="btn" data-act="setup">CHANGE CHARACTER</button>
            <button class="btn" data-act="toMenu">MAIN MENU</button>
          </div>
        </div></div>`;
      this.render(html, 'results');
    },
  };

  RS.Overlays = O;
})(window.RS);
