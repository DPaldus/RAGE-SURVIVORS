'use strict';
// Easter eggs: words typed on any menu screen (and the old cheat code). Each one pays a little CL0UT the first time
// (RS.Save.data.eggs) and shows a toast; nothing here touches a run.
(function (RS) {
  const CODES = {
    SLATT: { t: 'SLATT SLATT SLATT', s: 'the whole pit heard that' },
    TWIZZY: { t: 'TWIZZY TWIZZY TWIZZY', s: 'say it three times and the bells answer', sfx: 'bell' },
    SCHMUNK: { t: 'WHO IS SCHMUNK?', s: 'nobody knows. not even him', col: '#9cff35' },
    TONKA: { t: 'BUILT TONKA', s: 'fall down, bounce back, run it back', col: '#ffd23f' },
    LEAK: { t: 'LEAKING ALBUM... 99%', s: 'connection lost. classic.', col: '#3ff2ff' },
    VAMP: { t: 'VAMP HOURS', s: 'the menus stay red and black for a minute', fn: () => vamp() },
    DPLDS: { t: 'DPLDS ON THE BEAT', s: 'thanks for playing for real', col: '#9cff35' },
    BELLS: { t: 'YOU KNOW WHICH ONES', s: 'ding', col: '#ffe9a8', sfx: 'bell' },
  };
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  const longest = Math.max.apply(null, Object.keys(CODES).map((k) => k.length));
  let typed = '', seq = [], vampT = 0;

  function vamp() {
    document.body.classList.add('vamp');
    clearTimeout(vampT);
    vampT = setTimeout(() => document.body.classList.remove('vamp'), 60000);
  }

  function toast(t, s, col, pay) {
    const el = document.createElement('div');
    el.className = 'egg-toast';
    el.style.setProperty('--c', col || '#ff2448');
    el.innerHTML = '<b></b><span></span>' + (pay ? '<em>+' + pay + ' CL0UT · FIRST TIME</em>' : '');
    el.querySelector('b').textContent = t;
    el.querySelector('span').textContent = s;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function found(id, egg, reward) {
    const S = RS.Save, d = S.data;
    const first = !d.eggs.includes(id);
    if (first) { d.eggs.push(id); d.clout += reward; d.lifetimeClout += reward; S.save(); }
    toast(egg.t, egg.s, egg.col, first ? reward : 0);
    RS.Audio.resume();
    RS.Audio.sfx(egg.sfx || (first ? 'rare' : 'thumb'));
    if (egg.fn) egg.fn();
  }

  window.addEventListener('keydown', (e) => {
    if (!RS.Screens || !RS.Screens.current || e.repeat) return; // menus only, never mid-run
    seq.push(e.code); if (seq.length > KONAMI.length) seq.shift();
    if (seq.join() === KONAMI.join()) { seq = []; found('konami', { t: 'CHEAT CODES ARE FOR NPCS', s: 'here is some CL0UT anyway', col: '#9cff35' }, 30); return; }
    if (!/^Key[A-Z]$/.test(e.code)) return;
    typed = (typed + e.code[3]).slice(-longest);
    for (const k in CODES) if (typed.endsWith(k)) { typed = ''; found(k, CODES[k], 15); return; }
  });

  RS.Eggs = { toast };
})(window.RS);
