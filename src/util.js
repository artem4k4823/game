import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const UP = new THREE.Vector3(0, 1, 0);

export function randDir(out) {
  const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

// random direction inside a cone around `dir`
export function coneDir(out, dir, angle) {
  const t = Math.random() * Math.PI * 2, c = Math.cos(angle * Math.sqrt(Math.random()));
  const s = Math.sqrt(1 - c * c);
  const a = Math.abs(dir.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, a).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);
  return out.copy(dir).multiplyScalar(c).addScaledVector(u, Math.cos(t) * s).addScaledVector(v, Math.sin(t) * s);
}

// ray vs axis aligned box; returns entry distance or -1
export function rayBox(o, d, minX, minY, minZ, maxX, maxY, maxZ, maxT) {
  let t0 = 0, t1 = maxT;
  const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
  let a = (minX - o.x) * ix, b = (maxX - o.x) * ix;
  if (a > b) { const t = a; a = b; b = t; }
  t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  a = (minY - o.y) * iy; b = (maxY - o.y) * iy;
  if (a > b) { const t = a; a = b; b = t; }
  t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  a = (minZ - o.z) * iz; b = (maxZ - o.z) * iz;
  if (a > b) { const t = a; a = b; b = t; }
  t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  return t0;
}

// ray vs sphere; returns distance or -1
export function raySphere(o, d, c, r, maxT) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  if (t > maxT) return -1;
  return t < 0 ? (cc < 0 ? 0 : -1) : t;
}

export function fmtInt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
