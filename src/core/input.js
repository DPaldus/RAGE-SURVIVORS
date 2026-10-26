'use strict';
// Keyboard / mouse / gamepad input with per-frame "pressed" edges.
(function (RS) {
  const BIND = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    dash: ['Space'],
    ability: ['KeyF', 'KeyQ', 'ShiftLeft', 'ShiftRight'], // F (was E): E is only the chest key now
    interact: ['KeyE'], // next to a chest E opens it instead of firing the ability
    pause: ['Escape', 'KeyP'],
    confirm: ['Enter', 'NumpadEnter'],
    reroll: ['KeyR'],
    one: ['Digit1', 'Numpad1'], two: ['Digit2', 'Numpad2'], three: ['Digit3', 'Numpad3'], four: ['Digit4', 'Numpad4'],
  };

  const Input = {
    keys: new Set(),
    pressedKeys: new Set(),
    pad: { x: 0, y: 0, buttons: [], prev: [] },
    lastDevice: 'kb',
    onBlur: null,
    init() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' && e.target.type !== 'range') return;
        this.keys.add(e.code);
        this.pressedKeys.add(e.code);
        this.lastDevice = 'kb';
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        if (RS.Audio) RS.Audio.resume();
      });
      window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
      window.addEventListener('blur', () => { this.keys.clear(); if (this.onBlur) this.onBlur(); });
      window.addEventListener('pointerdown', () => { if (RS.Audio) RS.Audio.resume(); });
    },
    down(action) {
      const codes = BIND[action];
      for (const c of codes) if (this.keys.has(c)) return true;
      return this.padDown(action);
    },
    pressed(action) {
      const codes = BIND[action];
      for (const c of codes) if (this.pressedKeys.has(c)) return true;
      return this.padPressed(action);
    },
    move() {
      let x = 0, y = 0;
      if (this.down('left')) x -= 1;
      if (this.down('right')) x += 1;
      if (this.down('up')) y -= 1;
      if (this.down('down')) y += 1;
      // stick: radial dead zone rescaled to 0..1, so a light push walks slowly and diagonals are not squared off
      const pm = Math.hypot(this.pad.x, this.pad.y);
      if (pm > 0.18) { const k = Math.min(1, (pm - 0.18) / 0.77) / pm; x = this.pad.x * k; y = this.pad.y * k; }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    // gamepad: A=dash, B/X=ability, Start=pause
    PAD: { dash: [0], ability: [1, 2], interact: [2], pause: [9], confirm: [0], reroll: [3] },
    pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && Array.from(pads).find((p) => p && p.connected);
      this.pad.prev = this.pad.buttons;
      if (!gp) { this.pad.buttons = []; this.pad.x = this.pad.y = 0; return; }
      this.pad.buttons = gp.buttons.map((b) => b.pressed);
      let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      if (gp.buttons[14] && gp.buttons[14].pressed) x = -1;
      if (gp.buttons[15] && gp.buttons[15].pressed) x = 1;
      if (gp.buttons[12] && gp.buttons[12].pressed) y = -1;
      if (gp.buttons[13] && gp.buttons[13].pressed) y = 1;
      this.pad.x = x; this.pad.y = y;
      if (this.pad.buttons.some((b) => b) || Math.hypot(x, y) > 0.3) this.lastDevice = 'pad';
    },
    padDown(action) {
      const b = this.PAD[action]; if (!b) return false;
      return b.some((i) => this.pad.buttons[i]);
    },
    padPressed(action) {
      const b = this.PAD[action]; if (!b) return false;
      return b.some((i) => this.pad.buttons[i] && !this.pad.prev[i]);
    },
    endFrame() { this.pressedKeys.clear(); },
  };

  RS.Input = Input;
})(window.RS);
