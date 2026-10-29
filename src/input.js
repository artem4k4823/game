export class Input {
  constructor(el) {
    this.el = el;
    this.keys = {};
    this.pressed = {};
    this.mdx = 0; this.mdy = 0;
    this.lmb = false; this.rmb = false;
    this.locked = false;
    this.handlers = { down: [], up: [], key: [] };
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ControlLeft', 'KeyF', 'KeyE', 'KeyQ'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      for (const h of this.handlers.key) h(e.code);
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.lmb = this.rmb = false; });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.rmb = true;
      for (const h of this.handlers.down) h(e.button);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
      for (const h of this.handlers.up) h(e.button);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
  }

  lock() {
    try { this.el.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed right now */ }
  }

  frame() {
    const k = this.keys;
    this.f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    this.r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    this.u = (k.Space ? 1 : 0) - (k.ControlLeft || k.ControlRight || k.KeyC ? 1 : 0);
    this.shift = !!(k.ShiftLeft || k.ShiftRight);
    this.jumpPressed = !!this.pressed.Space;
  }

  endFrame() { this.pressed = {}; this.mdx = 0; this.mdy = 0; }
}
