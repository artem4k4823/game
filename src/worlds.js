// World definitions: Earth + every planet of the Solar System
import { mulberry32, hash2i, craterField } from './noise.js';
import { clamp, smoothstep, lerp } from './util.js';

const set = (C, r, g, b) => { C.r = r; C.g = g; C.b = b; };
const mixC = (C, r, g, b, t) => { C.r += (r - C.r) * t; C.g += (g - C.g) * t; C.b += (b - C.b) * t; };

// generic scatter of structures inside a chunk
function scatter(cx, cz, x0, z0, size, seed, count, fn) {
  const r = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = fn(x0 + r() * size, z0 + r() * size, r);
    if (s) out.push(s);
  }
  return out;
}

// ======================= EARTH =======================
function earth() {
  const CELL = 2400;
  const cities = new Map();
  let N = null;
  const rawH = (x, z) => {
    const n = N;
    const c = n.fbm(x * 0.00011 + 11.3, z * 0.00011 - 7.1, 5);
    let h = c * 260 + 60;
    const mm = smoothstep(0.02, 0.38, n.fbm(x * 0.00018 - 40, z * 0.00018 + 90, 3));
    if (mm > 0) { const r = n.ridged(x * 0.0007, z * 0.0007, 5); h += mm * (r * r * 1150 + r * 140); }
    h += n.fbm(x * 0.0025, z * 0.0025, 3) * 18 * (0.4 + mm);
    const rv = Math.abs(n.n2(x * 0.00035 + 300, z * 0.00035 - 200) + 0.25 * n.n2(x * 0.0012, z * 0.0012));
    if (h > -6) { const t = smoothstep(0.012, 0.085, rv); h = -6 + (h + 6) * t * (0.15 + 0.85 * t); }
    return h;
  };
  const city = (ci, cj) => {
    const k = ci * 100003 + cj;
    if (cities.has(k)) return cities.get(k);
    let c = null;
    const r = mulberry32((ci * 9176) ^ (cj * 7919) ^ 4242);
    const force = ci === 0 && cj === 0;
    if (force || r() < 0.5) {
      const x = (ci + 0.25 + r() * 0.5) * CELL, z = (cj + 0.25 + r() * 0.5) * CELL;
      const h0 = rawH(x, z);
      let ok = h0 > 6 && h0 < 280;
      if (ok) {
        let mn = h0, mx = h0;
        for (let a = 0; a < 6; a++) { const hh = rawH(x + Math.cos(a) * 350, z + Math.sin(a) * 350); mn = Math.min(mn, hh); mx = Math.max(mx, hh); }
        ok = mx - mn < 140 && mn > -5;
      }
      if (ok) c = { x, z, h: Math.max(h0, 10), R: 320 + r() * 520, big: r() };
    }
    cities.set(k, c);
    return c;
  };
  const cityList = (x, z) => {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), out = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = city(ci + a, cj + b); if (c) out.push(c); }
    return out;
  };
  const height = (x, z, n) => {
    N = n;
    let h = rawH(x, z);
    for (const c of cityList(x, z)) {
      const dx = x - c.x, dz = z - c.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > c.R + 320) continue;
      const w = 1 - smoothstep(c.R * 0.85, c.R + 320, d);
      h = lerp(h, c.h, w);
    }
    return h;
  };
  const cityMask = (x, z) => {
    let m = 0;
    for (const c of cityList(x, z)) {
      const d = Math.hypot(x - c.x, z - c.z);
      m = Math.max(m, 1 - smoothstep(c.R * 0.92, c.R + 30, d));
    }
    return m;
  };
  const PAL = [0x8d939c, 0xb8b2a4, 0x6f8193, 0x9c6b52, 0xd8d2c4, 0x4b5b6c, 0xa9bacb, 0x7d6a5a, 0x5e6e78, 0xc2b8a0];
  return {
    id: 'earth', name: 'Земля', sub: 'Третья планета · дом',
    intro: 'Дроны-захватчики атакуют города. Защити Землю!',
    seed: 1337, gravity: 9.8, solar: 1.0, exitAlt: 4200, spaceFade: [1400, 3800],
    height, cityMask, cityList,
    findSpawn() { N = this._noise; for (let r = 0; r < 6; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const c = city(a, b); if (c) return { x: c.x, z: c.z, city: c }; } return { x: 0, z: 0 }; },
    color(h, sl, x, z, n, C) {
      if (h < -1) { const k = clamp(-h / 25, 0, 1); set(C, 0.5 - 0.22 * k, 0.46 - 0.18 * k, 0.34 - 0.08 * k); return; }
      if (h < 3.5) { set(C, 0.76, 0.7, 0.5); return; }
      const v = n.n2(x * 0.0035, z * 0.0035) * 0.5 + 0.5, v2 = n.n2(x * 0.0009 + 50, z * 0.0009) * 0.5 + 0.5;
      set(C, 0.2 + 0.1 * v, 0.36 + 0.1 * v, 0.12 + 0.03 * v);
      mixC(C, 0.5, 0.46, 0.24, smoothstep(0.55, 0.85, v2) * 0.8);
      mixC(C, 0.33, 0.34, 0.24, smoothstep(250, 420, h));
      mixC(C, 0.44, 0.41, 0.37, smoothstep(0.22, 0.45, sl));
      const snow = smoothstep(560, 640, h + v * 80) * (1 - smoothstep(0.55, 0.75, sl));
      mixC(C, 0.94, 0.96, 1.0, snow);
    },
    terrainRough: 0.95,
    water: { level: 0, deep: 0x07263e, alpha: 0.88 },
    trees: true,
    treeDensity: (x, z, n) => smoothstep(-0.15, 0.25, n.fbm(x * 0.0016, z * 0.0016, 2)) * 0.9,
    flammable: true,
    structures(cx, cz, x0, z0, size, T) {
      const out = [];
      const seen = new Set();
      for (const c of [...cityList(x0, z0), ...cityList(x0 + size, z0 + size)]) {
        if (seen.has(c)) continue; seen.add(c);
        const R = c.R * 0.9;
        const i0 = Math.floor(Math.max(x0, c.x - R) / 36), i1 = Math.floor(Math.min(x0 + size, c.x + R) / 36);
        const j0 = Math.floor(Math.max(z0, c.z - R) / 36), j1 = Math.floor(Math.min(z0 + size, c.z + R) / 36);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const lx = i * 36 + 22, lz = j * 36 + 22;
          if (lx < x0 || lx >= x0 + size || lz < z0 || lz >= z0 + size) continue;
          const d = Math.hypot(lx - c.x, lz - c.z);
          if (d > R) continue;
          const f = 1 - d / R;
          const r = mulberry32((i * 48611) ^ (j * 96769) ^ 77);
          const r1 = r(), r2 = r(), r3 = r();
          if (r1 > 0.92 - 0.25 * (1 - f)) continue; // parks / empty lots
          const col = PAL[(r() * PAL.length) | 0];
          const downtown = f > 0.55;
          if (!downtown && r2 < 0.45 && f < 0.45) {
            for (const [ox, oz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
              if (r() < 0.2) continue;
              out.push({ type: 'box', x: lx + ox, z: lz + oz, w: 9 + r() * 2, d: 9 + r() * 2, h: 5 + r() * 8, color: PAL[(r() * PAL.length) | 0], sink: 1 });
            }
            continue;
          }
          const big = 0.6 + c.big * 0.8;
          let h = downtown ? 35 + Math.pow(r3, 1.6) * 260 * f * big : 12 + r3 * 45 * f + r() * 10;
          const w = downtown ? 16 + r() * 9 : 14 + r() * 10, dd = downtown ? 16 + r() * 9 : 14 + r() * 10;
          const base = out.length;
          out.push({ type: 'box', x: lx, z: lz, w, d: dd, h, color: col });
          if (h > 90 && r() < 0.65) {
            out.push({ type: 'box', x: lx, z: lz, w: w * 0.65, d: dd * 0.65, h: h * (0.15 + r() * 0.2), color: col, tierOf: base });
            if (r() < 0.5) out.push({ type: 'box', x: lx, z: lz, w: 0.8, d: 0.8, h: 12 + r() * 20, color: 0x999999, tierOf: base + 1 });
          }
        }
      }
      return out;
    },
    sky: { zen: [0.16, 0.38, 0.8], hor: [0.62, 0.76, 0.92], ground: [0.3, 0.33, 0.35], sun: [1, 0.96, 0.88], sunSize: 0.013, stars: 0 },
    dayCycle: { length: 540, start: 0.27 },
    fog: 0.00022, light: { sun: 3.2, hemiSky: 0x9cc4ff, hemiGround: 0x4a4636, hemi: 1.1 },
    clouds: [{ alt: 1250, spread: 260, cover: 0.42, cell: 700, size: [280, 620], tint: [1, 1, 1], opacity: 0.85 }],
    enemies: { types: ['drone'], max: 7, interval: 3.5 },
    objective: 'earth',
    ambient: [55, 0.0],
    dustColor: [0.6, 0.57, 0.52],
  };
}

// ======================= MOON =======================
function moon() {
  return {
    id: 'moon', name: 'Луна', sub: 'Спутник Земли · гравитация 1/6',
    intro: 'Низкая гравитация: обломки и скалы летят далеко. Где-то под реголитом спрятан кристалл.',
    seed: 404, gravity: 1.62, solar: 1.25, exitAlt: 2600, spaceFade: [0, 1], view: 7,
    height(x, z, n) {
      let h = n.fbm(x * 0.00035, z * 0.00035, 4) * 90 + n.fbm(x * 0.003, z * 0.003, 3) * 7;
      h += craterField(x, z, 1500, 0.55, 200, 560, 0.18, 11);
      h += craterField(x, z, 380, 0.7, 40, 160, 0.22, 23);
      h += craterField(x, z, 95, 0.55, 8, 34, 0.25, 37);
      return h;
    },
    color(h, sl, x, z, n, C) {
      const m = smoothstep(0.0, 0.35, n.fbm(x * 0.00025 + 7, z * 0.00025, 3));
      const v = 0.55 + n.n2(x * 0.01, z * 0.01) * 0.04;
      set(C, v, v, v * 0.98);
      mixC(C, 0.3, 0.3, 0.31, m * 0.7);
      mixC(C, 0.68, 0.68, 0.66, smoothstep(0.35, 0.6, sl) * 0.5);
    },
    grain: 1.4,
    structures(cx, cz, x0, z0, size) {
      const out = scatter(cx, cz, x0, z0, size, 91, 26, (x, z, r) => {
        const s = 2 + Math.pow(r(), 3) * 18;
        return { type: 'rock', x, z, w: s * (0.8 + r() * 0.5), d: s * (0.8 + r() * 0.5), h: s * (0.6 + r() * 0.5), rot: r() * 6, color: 0x8a8a88, sink: s * 0.25 };
      });
      if (cx === 1 && cz === 0) {
        const bx = 700, bz = 260;
        for (let i = 0; i < 6; i++) out.push({ type: 'dome', x: bx + Math.cos(i) * 60, z: bz + Math.sin(i * 1.3) * 60, w: 24 + i * 4, d: 24 + i * 4, h: 14 + i * 2, color: 0xc8ccd4, sink: 1 });
      }
      return out;
    },
    sky: { zen: [0, 0, 0.004], hor: [0.01, 0.01, 0.02], ground: [0.1, 0.1, 0.1], sun: [1, 0.98, 0.95], sunSize: 0.012, stars: 1, space: 1 },
    sunDir: [0.5, 0.45, -0.3],
    fog: 0.00002, light: { sun: 3.6, hemiSky: 0x404858, hemiGround: 0x202020, hemi: 0.45 },
    skyBodies: [{ type: 'earth', dir: [-0.3, 0.16, -0.94], dist: 90000, radius: 6200, atmo: 0x6fb2ff }],
    enemies: { types: ['sentinel'], max: 4, interval: 6 },
    objective: 'moon',
    ambient: [41, 0.05],
    dustColor: [0.55, 0.55, 0.55],
  };
}

// ======================= MERCURY =======================
function mercury() {
  return {
    id: 'mercury', name: 'Меркурий', sub: 'Ближайшая к Солнцу планета',
    intro: 'СОЛНЕЧНАЯ ПЕРЕГРУЗКА: энергия бесконечна, тепловое зрение в 3 раза сильнее.',
    seed: 808, gravity: 3.7, solar: 6, overcharge: true, exitAlt: 2600, spaceFade: [0, 1],
    height(x, z, n) {
      let h = n.fbm(x * 0.0003, z * 0.0003, 4) * 140;
      const sc = n.ridged(x * 0.0005 + 3, z * 0.0002, 3);
      h += smoothstep(0.75, 0.95, sc) * 90;
      h += craterField(x, z, 1300, 0.6, 180, 520, 0.2, 51);
      h += craterField(x, z, 320, 0.7, 30, 130, 0.24, 61);
      h += n.fbm(x * 0.004, z * 0.004, 2) * 6;
      return h;
    },
    color(h, sl, x, z, n, C) {
      const v = n.n2(x * 0.002, z * 0.002) * 0.5 + 0.5;
      set(C, 0.42 + 0.08 * v, 0.37 + 0.06 * v, 0.33 + 0.04 * v);
      mixC(C, 0.25, 0.22, 0.2, smoothstep(0.2, 0.5, n.fbm(x * 0.0005, z * 0.0005, 2)) * 0.6);
      mixC(C, 0.6, 0.55, 0.5, smoothstep(0.4, 0.7, sl) * 0.4);
    },
    grain: 1.3,
    structures(cx, cz, x0, z0, size) {
      const out = scatter(cx, cz, x0, z0, size, 17, 14, (x, z, r) => {
        if (r() < 0.6) { const s = 3 + r() * 14; return { type: 'rock', x, z, w: s, d: s, h: s * 0.7, rot: r() * 6, color: 0x5a524c, sink: s * 0.2 }; }
        const h = 25 + r() * 70; return { type: 'spire', x, z, w: 8 + r() * 10, d: 8 + r() * 10, h, rot: r() * 6, color: 0x3a3330 };
      });
      if (cx === 0 && cz === -4) out.push({ type: 'box', x: 160, z: -1800, w: 34, d: 14, h: 150, color: 0x0d0d10, special: 'monolith', onlyHeat: true, hp: 5200 });
      return out;
    },
    spireRough: 0.6,
    sky: { zen: [0, 0, 0.002], hor: [0.02, 0.012, 0.01], ground: [0.1, 0.08, 0.07], sun: [1, 0.92, 0.75], sunSize: 0.075, stars: 0.8, space: 1 },
    sunDir: [0.3, 0.38, -0.87],
    fog: 0.00003, light: { sun: 7, hemiSky: 0x605040, hemiGround: 0x302020, hemi: 0.5 },
    enemies: { types: ['wisp'], max: 6, interval: 3 },
    objective: 'mercury',
    ambient: [62, 0.05],
    dustColor: [0.45, 0.4, 0.36],
  };
}

// ======================= VENUS =======================
function venus() {
  const VX = 0, VZ = -2600, VR = 2200, VH = 820;
  const volcanoes = (x, z) => {
    let h = 0;
    const cell = 3200, ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const i = ci + a, j = cj + b;
      if (hash2i(i, j, 5) > 0.45) continue;
      const vx = (i + 0.2 + 0.6 * hash2i(i, j, 6)) * cell, vz = (j + 0.2 + 0.6 * hash2i(i, j, 7)) * cell;
      if (Math.hypot(vx - VX, vz - VZ) < 2500) continue;
      const R = 700 + 600 * hash2i(i, j, 8), H = 300 + 400 * hash2i(i, j, 9);
      const d = Math.hypot(x - vx, z - vz);
      if (d < R) { const t = 1 - d / R; h += H * Math.pow(t, 1.5); if (d < R * 0.12) h -= H * 0.25 * (1 - (d / (R * 0.12)) ** 2); }
    }
    return h;
  };
  const cfg = {
    id: 'venus', name: 'Венера', sub: 'Адская теплица · 460 °C',
    intro: 'Кислотные облака, лавовые реки и извергающиеся вулканы. Кристалл утонул в лаве главного вулкана.',
    seed: 2077, gravity: 8.9, solar: 0.45, exitAlt: 4200, spaceFade: [2400, 4000],
    volcano: { x: VX, z: VZ, R: VR, H: VH },
    height(x, z, n) {
      let h = n.fbm(x * 0.00025, z * 0.00025, 4) * 140 + 30;
      h += n.ridged(x * 0.0012, z * 0.0012, 3) * 30;
      h += volcanoes(x, z);
      const d = Math.hypot(x - VX, z - VZ);
      if (d < VR) {
        const t = 1 - d / VR; h += VH * Math.pow(t, 1.4);
        const cr = 260;
        if (d < cr * 1.4) h -= VH * 0.22 * (1 - smoothstep(cr * 0.6, cr * 1.4, d));
      }
      return h;
    },
    color(h, sl, x, z, n, C) {
      const v = n.n2(x * 0.003, z * 0.003) * 0.5 + 0.5;
      set(C, 0.24 + 0.06 * v, 0.2 + 0.05 * v, 0.15 + 0.03 * v);
      mixC(C, 0.55, 0.48, 0.25, smoothstep(0.3, 0.7, n.fbm(x * 0.0012, z * 0.0012, 2)) * 0.5);
      mixC(C, 0.12, 0.09, 0.08, smoothstep(0.35, 0.6, sl));
      mixC(C, 0.45, 0.12, 0.04, smoothstep(14, 0, h));
    },
    water: { level: 0, lava: true },
    structures(cx, cz, x0, z0, size) {
      return scatter(cx, cz, x0, z0, size, 23, 18, (x, z, r) => {
        const s = 3 + Math.pow(r(), 2) * 16;
        return { type: 'rock', x, z, w: s, d: s * (0.7 + r() * 0.6), h: s * 0.8, rot: r() * 6, color: 0x3a2e26, sink: s * 0.2 };
      });
    },
    sky: { zen: [0.62, 0.48, 0.2], hor: [0.85, 0.66, 0.32], ground: [0.4, 0.28, 0.12], sun: [1, 0.8, 0.5], sunSize: 0.02, stars: 0 },
    sunDir: [0.2, 0.7, 0.3],
    fog: 0.0011, fogColor: [0.72, 0.55, 0.28], light: { sun: 1.4, hemiSky: 0xffcf80, hemiGround: 0x5a3010, hemi: 1.3 },
    clouds: [{ alt: 1700, spread: 500, cover: 0.85, cell: 600, size: [400, 900], tint: [1.0, 0.85, 0.55], opacity: 0.8 }],
    weather: { type: 'rain', color: [0.9, 0.85, 0.3], speed: 70, count: 900, acid: true },
    lightning: 0.12,
    enemies: { types: ['golem'], max: 5, interval: 5 },
    objective: 'venus',
    ambient: [48, 0.06],
    dustColor: [0.4, 0.3, 0.2],
  };
  return cfg;
}

// ======================= MARS =======================
function mars() {
  const OX = 3200, OZ = -3600;
  return {
    id: 'mars', name: 'Марс', sub: 'Красная планета',
    intro: 'Долина Маринера, вулкан Олимп и пылевые бури. Боевые треноги охраняют кристалл.',
    seed: 1977, gravity: 3.7, solar: 0.7, exitAlt: 3600, spaceFade: [1200, 3300],
    height(x, z, n) {
      let h = n.fbm(x * 0.0002, z * 0.0002, 5) * 160 + 40;
      h += n.ridged(x * 0.0018, z * 0.0018, 3) * 18;
      h += craterField(x, z, 900, 0.45, 80, 300, 0.15, 71);
      // Olympus Mons
      const d = Math.hypot(x - OX, z - OZ);
      if (d < 3400) { const t = 1 - d / 3400; h += 1500 * Math.pow(t, 1.6); if (d < 420) h -= 260 * (1 - (d / 420) ** 2); }
      // Valles Marineris
      const zc = 1500 + 420 * Math.sin(x * 0.00055) + 120 * Math.sin(x * 0.0021);
      const dz = Math.abs(z - zc);
      const k = 1 - smoothstep(180, 650, dz);
      if (k > 0) { const depth = 560 * k; let nh = h - depth; nh = Math.floor(nh / 45) * 45 + ((nh % 45) + 45) % 45 * 0.35; h = lerp(h - depth, nh, 0.6 * k); }
      return h;
    },
    color(h, sl, x, z, n, C) {
      const v = n.n2(x * 0.0025, z * 0.0025) * 0.5 + 0.5;
      set(C, 0.6 + 0.1 * v, 0.3 + 0.05 * v, 0.16 + 0.03 * v);
      mixC(C, 0.34, 0.17, 0.11, smoothstep(0.1, 0.45, n.fbm(x * 0.0006 + 9, z * 0.0006, 3)) * 0.6);
      mixC(C, 0.72, 0.45, 0.28, smoothstep(0.3, 0.55, sl) * 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(h * 0.14)) * smoothstep(0.35, 0.6, sl));
      mixC(C, 0.92, 0.88, 0.86, smoothstep(1350, 1500, h) * 0.6);
    },
    grain: 1.2,
    structures(cx, cz, x0, z0, size) {
      return scatter(cx, cz, x0, z0, size, 31, 22, (x, z, r) => {
        if (r() < 0.55) { const s = 2 + Math.pow(r(), 2.5) * 14; return { type: 'rock', x, z, w: s, d: s, h: s * 0.7, rot: r() * 6, color: 0x7a3c22, sink: s * 0.2 }; }
        const h = 18 + r() * 55; return { type: 'spire', x, z, w: 7 + r() * 9, d: 7 + r() * 9, h, rot: r() * 6, color: 0x8a4428 };
      });
    },
    spireRough: 0.85,
    sky: { zen: [0.42, 0.3, 0.24], hor: [0.85, 0.62, 0.45], ground: [0.4, 0.22, 0.14], sun: [1, 0.9, 0.8], sunSize: 0.009, stars: 0.05 },
    sunDir: [-0.5, 0.55, 0.35],
    fog: 0.00035, fogColor: [0.8, 0.58, 0.42], light: { sun: 2.4, hemiSky: 0xffc8a0, hemiGround: 0x5a2a18, hemi: 1.0 },
    weather: { type: 'dust', color: [0.75, 0.5, 0.3], speed: 30, count: 700 },
    dustStorm: true,
    skyBodies: [{ type: 'rocky', dir: [0.6, 0.35, 0.7], dist: 60000, radius: 900, c1: 0x6a5a4a, c2: 0x40342a, c3: 0x554433 }],
    enemies: { types: ['drone_m'], max: 3, interval: 8 },
    objective: 'mars',
    ambient: [44, 0.05],
    dustColor: [0.7, 0.42, 0.26],
  };
}

// ======================= JUPITER =======================
function jupiter() {
  return {
    id: 'jupiter', name: 'Юпитер', sub: 'Газовый гигант · нет поверхности',
    intro: 'Твёрдой поверхности нет — только бесконечные облака. Сильная гравитация тянет вниз, Большое Красное Пятно затягивает вихрем.',
    seed: 5150, gravity: 24.8, solar: 0.3, exitAlt: 4200, spaceFade: [2400, 4000], sink: 9, floorY: -1900,
    vortex: { x: 0, z: -5200, R: 2600, eyeY: -1250 },
    sky: { zen: [0.32, 0.27, 0.22], hor: [0.85, 0.7, 0.52], ground: [0.45, 0.25, 0.12], sun: [1, 0.95, 0.85], sunSize: 0.004, stars: 0.05 },
    sunDir: [0.4, 0.6, 0.5],
    fog: 0.0003, fogColor: [0.7, 0.5, 0.34], light: { sun: 2.0, hemiSky: 0xffe0b0, hemiGround: 0x8a4a20, hemi: 1.0 },
    clouds: [
      { alt: -1200, spread: 220, cover: 0.9, cell: 520, size: [400, 900], tint: [0.75, 0.42, 0.25], opacity: 0.85 },
      { alt: -400, spread: 260, cover: 0.55, cell: 560, size: [300, 700], tint: [0.95, 0.78, 0.6], opacity: 0.8 },
      { alt: 500, spread: 300, cover: 0.45, cell: 600, size: [300, 700], tint: [1.0, 0.95, 0.88], opacity: 0.8 },
      { alt: 1500, spread: 200, cover: 0.3, cell: 700, size: [300, 700], tint: [0.95, 0.85, 0.75], opacity: 0.7 },
    ],
    decks: [{ y: -1700, c1: [0.5, 0.25, 0.12], c2: [0.85, 0.55, 0.3] }],
    lightning: 0.35,
    skyBodies: [
      { type: 'rocky', dir: [0.5, 0.3, -0.8], dist: 90000, radius: 1400, c1: 0xe8d070, c2: 0xb07030, c3: 0xd09040 },
      { type: 'moon', dir: [-0.7, 0.45, -0.5], dist: 90000, radius: 1000, c1: 0xd8d0c0, c2: 0xa09080, c3: 0x907060 },
    ],
    enemies: { types: ['jelly'], max: 6, interval: 4 },
    objective: 'jupiter',
    ambient: [36, 0.08],
    dustColor: [0.8, 0.6, 0.4],
  };
}

// ======================= SATURN (rings) =======================
function saturn() {
  return {
    id: 'saturn', name: 'Кольца Сатурна', sub: 'Океан ледяных глыб в невесомости',
    intro: 'Ты внутри колец Сатурна. Невесомость, миллиарды ледяных глыб — и гигантский астероид с кристаллом внутри.',
    seed: 6060, gravity: 0, solar: 0.25, exitAlt: 2600, spaceFade: [0, 1], noFloor: true, view: 5,
    structures(cx, cz, x0, z0, size) {
      const out = scatter(cx, cz, x0, z0, size, 41, 60, (x, z, r) => {
        const s = 2 + Math.pow(r(), 3.2) * 55;
        const y = (r() - 0.5) * 2 * (60 + r() * 140);
        return { type: 'rock', x, z, y0: y - s * 0.45, w: s * (0.8 + r() * 0.5), d: s * (0.8 + r() * 0.5), h: s * (0.7 + r() * 0.5), rot: r() * 6, color: r() < 0.7 ? 0xdde6ee : 0xb8a890, floating: true, glass: true };
      });
      if (cx === 0 && cz === -6) out.push({ type: 'rock', x: 200, z: -2900, y0: -120, w: 260, d: 240, h: 230, rot: 0.4, color: 0xcfe2f0, floating: true, glass: true, special: 'giant', hp: 4500 });
      return out;
    },
    rockRough: 0.35,
    sky: { zen: [0, 0, 0.01], hor: [0.04, 0.035, 0.03], ground: [0.02, 0.02, 0.02], sun: [1, 0.96, 0.9], sunSize: 0.0035, stars: 1, space: 1 },
    sunDir: [0.75, 0.25, 0.4],
    fog: 0.00022, fogColor: [0.2, 0.19, 0.17], light: { sun: 2.6, hemiSky: 0xfff0d8, hemiGround: 0x403830, hemi: 0.6 },
    skyBodies: [{ type: 'saturn', dir: [-0.15, 0.0, -1], dist: 110000, radius: 52000, c1: 0xe8d6a8, c2: 0xc8a870, c3: 0xf0e4c4, ring: [62000, 135000], skipRingOnPlane: true }],
    enemies: { types: ['pirate'], max: 6, interval: 4 },
    objective: 'saturn',
    ambient: [33, 0.07],
    dustColor: [0.85, 0.88, 0.92],
  };
}

// ======================= URANUS =======================
function uranus() {
  return {
    id: 'uranus', name: 'Уран', sub: 'Ледяной гигант, лежащий на боку',
    intro: 'Здесь идёт алмазный дождь! Собери падающие алмазы — из них сложится кристалл.',
    seed: 1781, gravity: 8.7, solar: 0.15, exitAlt: 3000, spaceFade: [800, 2700],
    height(x, z, n) {
      let h = n.fbm(x * 0.0003, z * 0.0003, 4) * 70;
      const cr = n.ridged(x * 0.0012, z * 0.0012, 3);
      h -= smoothstep(0.82, 0.97, cr) * 60;
      h += n.fbm(x * 0.003, z * 0.003, 2) * 5;
      return h;
    },
    color(h, sl, x, z, n, C) {
      const v = n.n2(x * 0.002, z * 0.002) * 0.5 + 0.5;
      set(C, 0.68 + 0.1 * v, 0.88 + 0.06 * v, 0.92);
      mixC(C, 0.25, 0.55, 0.7, smoothstep(0.25, 0.6, sl));
      mixC(C, 0.4, 0.75, 0.85, smoothstep(-10, -45, h) * 0.6);
    },
    terrainRough: 0.35, grain: 0.6,
    structures(cx, cz, x0, z0, size) {
      return scatter(cx, cz, x0, z0, size, 53, 30, (x, z, r) => {
        const h = 6 + Math.pow(r(), 2) * 45;
        return { type: 'spire', x, z, w: h * 0.35, d: h * 0.35, h, rot: r() * 6, color: r() < 0.5 ? 0x9fe8ff : 0xd8f8ff, glass: true, sink: 1 };
      });
    },
    spireGlow: 0x0a3040, spireRough: 0.15,
    sky: { zen: [0.2, 0.5, 0.6], hor: [0.6, 0.85, 0.88], ground: [0.3, 0.5, 0.55], sun: [0.9, 0.95, 1], sunSize: 0.003, stars: 0.25 },
    sunDir: [0.85, 0.25, 0.1], skyRotate: 0.03,
    fog: 0.0004, fogColor: [0.55, 0.8, 0.85], light: { sun: 1.6, hemiSky: 0xbff4ff, hemiGround: 0x3a6a78, hemi: 1.3 },
    clouds: [{ alt: 1400, spread: 300, cover: 0.5, cell: 700, size: [300, 700], tint: [0.8, 0.98, 1.0], opacity: 0.6 }],
    weather: { type: 'snow', color: [0.9, 0.98, 1], speed: 6, count: 1200 },
    diamonds: true,
    skyBodies: [{ type: 'moon', dir: [-0.5, 0.5, -0.7], dist: 80000, radius: 1500, c1: 0xa0a0a8, c2: 0x707078, c3: 0x606068 }],
    enemies: { types: ['crystal'], max: 5, interval: 5 },
    objective: 'uranus',
    ambient: [58, 0.05],
    dustColor: [0.85, 0.95, 1],
  };
}

// ======================= NEPTUNE =======================
function neptune() {
  return {
    id: 'neptune', name: 'Нептун', sub: 'Самые быстрые ветры в системе · 2000 км/ч',
    intro: 'Сверхзвуковые ветры сносят даже тебя. Используй ускорение (Shift), чтобы держать курс. Страж Бури ждёт.',
    seed: 1846, gravity: 11.2, solar: 0.1, exitAlt: 3400, spaceFade: [1000, 3100],
    height(x, z, n) {
      let h = n.fbm(x * 0.00025, z * 0.00025, 4) * 120;
      h += n.ridged(x * 0.0008, z * 0.0008, 4) * 160;
      return h;
    },
    color(h, sl, x, z, n, C) {
      const v = n.n2(x * 0.002, z * 0.002) * 0.5 + 0.5;
      set(C, 0.16 + 0.05 * v, 0.26 + 0.06 * v, 0.55 + 0.08 * v);
      mixC(C, 0.55, 0.7, 0.92, smoothstep(0.3, 0.6, sl) * 0.5);
      mixC(C, 0.8, 0.88, 1, smoothstep(140, 220, h) * 0.6);
    },
    terrainRough: 0.4, grain: 0.8,
    structures(cx, cz, x0, z0, size) {
      return scatter(cx, cz, x0, z0, size, 61, 16, (x, z, r) => {
        const h = 25 + Math.pow(r(), 1.5) * 110;
        return { type: 'spire', x, z, w: h * 0.22, d: h * 0.22, h, rot: r() * 6, color: r() < 0.5 ? 0x3a6cff : 0x7aa8ff, glass: true, sink: 2 };
      });
    },
    spireGlow: 0x061848, spireRough: 0.12,
    sky: { zen: [0.03, 0.08, 0.3], hor: [0.15, 0.3, 0.65], ground: [0.05, 0.1, 0.25], sun: [0.9, 0.95, 1], sunSize: 0.0025, stars: 0.35 },
    sunDir: [0.3, 0.5, 0.8],
    fog: 0.0006, fogColor: [0.14, 0.26, 0.55], light: { sun: 1.2, hemiSky: 0x6a8aff, hemiGround: 0x101a40, hemi: 1.2 },
    clouds: [{ alt: 900, spread: 400, cover: 0.55, cell: 600, size: [250, 600], tint: [0.75, 0.85, 1.0], opacity: 0.6 }],
    weather: { type: 'wind', color: [0.8, 0.9, 1], speed: 260, count: 900 },
    wind: true, lightning: 0.08,
    skyBodies: [{ type: 'moon', dir: [0.6, 0.4, -0.7], dist: 80000, radius: 1700, c1: 0xd0b8b0, c2: 0x988078, c3: 0xa09090 }],
    enemies: { types: ['crystal'], max: 5, interval: 4 },
    objective: 'neptune',
    ambient: [38, 0.07],
    dustColor: [0.7, 0.8, 1],
  };
}

export const WORLD_DEFS = { earth, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune };
export const WORLD_ORDER = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
