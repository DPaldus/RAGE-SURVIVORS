'use strict';
// Persistent progression + settings in localStorage.
(function (RS) {
  const KEY = 'rage_survivors_30_save_v1';
  // older keys, newest first, read once when KEY is empty so progress carries over: the 30-minute version's first
  // key (renamed 2026-10-26, the old name used a typo of the title) and the 15-minute version
  const OLD_KEYS = ['raid_survivors_new_save_v1', 'rage_survivors_save_v1'];

  function defaults() {
    return {
      v: 1,
      clout: 0,
      lifetimeClout: 0,
      totalKills: 0,
      runs: 0,
      wins: 0,
      bestTime: 0,
      bestTimeByChar: {},
      bestKills: 0,
      perks: {},                 // perkId -> level
      unlocked: {                // purchased / earned content
        chars: ['twizzy'],
        weapons: [],
        items: [],
        thumbs: [],
        arenas: ['garage'],
        cosmetics: ['mask_black', 'chain_silver'],
        startWeapons: [],
        mods: [],                // stage modifiers (NO MERCY: beat THE RAGE KING)
        maps: ['normal'],        // map modes (D.MAPMODES): reach 30:00 on one to open the next
        slots: [],               // 'slot4': the 4th weapon slot, earned by clearing WAVE 15 once
      },
      discovered: { weapons: [], items: [], evos: [], thumbs: [], enemies: [], bosses: [], synergies: [], stash: [] },
      challenges: [],
      eggs: [],                  // easter eggs found (src/ui/eggs.js), each pays out once
      selected: { char: 'twizzy', arena: 'garage', mode: 'standard', map: 'normal', mods: [], cos: {}, startWeapon: {} }, // map: D.MAPMODES id
      settings: {
        master: 0.8, music: 0.55, menuMusic: 0.5, runMusic: 0.5, sfx: 0.75, // music: old single slider, unused
        shake: 0.8, screenFx: true, dmgNumbers: true, reduceFlash: false, crt: 0.5,
        // graphics quality (preset + individual knobs, see RS.GFX)
        gfx: 'high', lighting: 2, shadows: 2, particles: 2, reflections: true, bloom: 0.75,
      },
    };
  }

  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in src)) continue;
      const b = base[k], s = src[k];
      if (Array.isArray(b)) base[k] = Array.isArray(s) ? s.slice() : b;
      else if (b && typeof b === 'object') base[k] = merge(b, s);
      else if (typeof s === typeof b) base[k] = s;
    }
    return base;
  }

  const Save = {
    data: defaults(),
    load() {
      try {
        let raw = localStorage.getItem(KEY);
        for (const k of OLD_KEYS) if (!raw) raw = localStorage.getItem(k);
        if (!raw) this.data = defaults();
        else {
          const parsed = JSON.parse(raw);
          const d = defaults();
          this.data = merge(d, parsed);
          // dictionaries with dynamic keys
          this.data.perks = Object.assign({}, parsed.perks || {});
          this.data.bestTimeByChar = Object.assign({}, parsed.bestTimeByChar || {});
          this.data.selected.cos = Object.assign({}, (parsed.selected && parsed.selected.cos) || {});
          this.data.selected.startWeapon = Object.assign({}, (parsed.selected && parsed.selected.startWeapon) || {});
          // saves from before the map locks: until 2026-10-25 every run was NORMAL, so a 30:00 run already opens NIGHT
          if (!(parsed.unlocked && Array.isArray(parsed.unlocked.maps)) && this.data.bestTime >= 1800) this.data.unlocked.maps.push('night');
          // the 4th weapon slot (2026-10-26) goes to every save that has already lasted 15:00
          if (this.data.bestTime >= 900 && !this.data.unlocked.slots.includes('slot4')) this.data.unlocked.slots.push('slot4');
        }
      } catch (e) {
        console.warn('Save load failed, starting fresh', e);
        this.data = defaults();
      }
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    },
    reset() {
      this.data = defaults();
      this.save();
    },
    get s() { return this.data.settings; },
    addClout(n) {
      n = Math.max(0, Math.round(n));
      this.data.clout += n;
      this.data.lifetimeClout += n;
    },
    spend(n) {
      if (this.data.clout < n) return false;
      this.data.clout -= n;
      this.save();
      return true;
    },
    isUnlocked(kind, id) { return this.data.unlocked[kind].includes(id); },
    unlock(kind, id) {
      if (this.isUnlocked(kind, id)) return false;
      this.data.unlocked[kind].push(id);
      return true;
    },
    isDiscovered(kind, id) { return this.data.discovered[kind].includes(id); },
    // returns true the first time something is seen
    discover(kind, id) {
      if (this.isDiscovered(kind, id)) return false;
      this.data.discovered[kind].push(id);
      return true;
    },
    perk(id) { return this.data.perks[id] || 0; },
    hasChallenge(id) { return this.data.challenges.includes(id); },
  };

  RS.Save = Save;
})(window.RS);
