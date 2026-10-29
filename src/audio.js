// Fully synthesized sound effects (WebAudio, no assets)
export class Audio {
  constructor() { this.ctx = null; this.listener = null; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(this.master); this.out = comp;
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // wind loop
    this.wind = this._noise(true);
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF).connect(this.windG).connect(this.out);
    this.wind.start();

    // heat vision hum
    this.beamG = ctx.createGain(); this.beamG.gain.value = 0;
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 1400;
    for (const f of [92, 184, 277]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bf); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 300;
    lfo.connect(lg).connect(bf.frequency); lfo.start();
    bf.connect(this.beamG).connect(this.out);

    // freeze breath hiss
    this.frz = this._noise(true);
    const ff = ctx.createBiquadFilter(); ff.type = 'highpass'; ff.frequency.value = 2500;
    this.frzG = ctx.createGain(); this.frzG.gain.value = 0;
    this.frz.connect(ff).connect(this.frzG).connect(this.out); this.frz.start();

    // ambient drone (planet mood)
    this.amb = ctx.createOscillator(); this.amb.type = 'sine'; this.amb.frequency.value = 55;
    this.amb2 = ctx.createOscillator(); this.amb2.type = 'sine'; this.amb2.frequency.value = 82.4;
    this.ambG = ctx.createGain(); this.ambG.gain.value = 0;
    this.amb.connect(this.ambG); this.amb2.connect(this.ambG); this.ambG.connect(this.out);
    this.amb.start(); this.amb2.start();
  }

  _noise(loop) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s;
  }

  _vol(pos) {
    if (!pos || !this.listener) return 1;
    const d = pos.distanceTo(this.listener);
    return 1 / (1 + d / 120);
  }

  setWind(speed, inSpace) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = inSpace ? 0 : Math.min(0.5, speed / 600);
    this.windG.gain.setTargetAtTime(v, t, 0.1);
    this.windF.frequency.setTargetAtTime(250 + Math.min(2500, speed * 2), t, 0.1);
  }
  setBeam(on) { if (this.ctx) this.beamG.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.04); }
  setFreeze(on) { if (this.ctx) this.frzG.gain.setTargetAtTime(on ? 0.25 : 0, this.ctx.currentTime, 0.05); }
  setAmbient(freq, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.frequency.setTargetAtTime(freq, t, 1); this.amb2.frequency.setTargetAtTime(freq * 1.498, t, 1);
    this.ambG.gain.setTargetAtTime(vol, t, 1);
  }

  boom(size = 1, pos = null) {
    if (!this.ctx) return;
    const v = this._vol(pos) * Math.min(1.2, size);
    if (v < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(false);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(80, t + 1.2 * size);
    const g = ctx.createGain(); g.gain.setValueAtTime(v * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4 + 1.2 * size);
    n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + 2.5);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(v * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.9);
  }

  punch(power = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7 * power, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
    const n = this._noise(false); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5 * power, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f).connect(ng).connect(this.out); n.start(t); n.stop(t + 0.2);
  }

  whoosh(v = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noise(false); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(v, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + 0.7);
  }

  sonic() {
    if (!this.ctx) return;
    this.boom(0.7);
    this.whoosh(0.6);
  }

  zap(pos, freq = 900) {
    if (!this.ctx) return;
    const v = this._vol(pos) * 0.25;
    if (v < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.25, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.22);
  }

  thunder(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.1;
    const n = this._noise(false); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.6 * this._vol(pos) + 0.1, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    n.connect(f).connect(g).connect(this.out); n.start(t); n.stop(t + 2.6);
  }

  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t + i * 0.09); g.gain.linearRampToValueAtTime(0.25, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 1.2);
      o.connect(g).connect(this.out); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1.3);
    });
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.2);
  }
}
