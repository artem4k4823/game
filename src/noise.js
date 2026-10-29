// Seeded simplex noise + hashing helpers

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2i(x, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const grad3 = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1]);
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class Noise {
  constructor(seed = 1) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.pm12[i] = this.perm[i] % 12;
    }
  }

  // 2D simplex noise in [-1, 1]
  n2(xin, yin) {
    const perm = this.perm, pm = this.pm12;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm[ii + perm[jj]] * 2; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  fbm(x, y, oct, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }

  // ridged multifractal in [0, 1]
  ridged(x, y, oct) {
    let a = 1, f = 1, s = 0, n = 0, prev = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(this.n2(x * f, y * f));
      v *= v;
      s += a * v * prev;
      prev = Math.min(1, v * 1.4);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  }
}

// crater cross-section: t = distance / radius. Returns height factor (bowl + rim)
export function craterProfile(t) {
  if (t < 1) return t * t - 1 + 0.3 * t * t * t * t;
  if (t < 1.8) { const k = 1 - (t - 1) / 0.8; return 0.3 * k * k; }
  return 0;
}

// procedural crater field, one crater candidate per cell
export function craterField(x, z, cell, prob, rmin, rmax, depth, seed) {
  const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
  let s = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const a = ci + di, b = cj + dj;
      if (hash2i(a, b, seed) > prob) continue;
      const cx = (a + 0.2 + 0.6 * hash2i(a, b, seed + 1)) * cell;
      const cz = (b + 0.2 + 0.6 * hash2i(a, b, seed + 2)) * cell;
      const R = rmin + (rmax - rmin) * hash2i(a, b, seed + 3);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R * 3.3) continue;
      s += craterProfile(Math.sqrt(d2) / R) * R * depth;
    }
  }
  return s;
}
