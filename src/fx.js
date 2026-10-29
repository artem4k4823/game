import * as THREE from 'three';
import { rand, randDir, UP } from './util.js';

const PV = `#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aCol; attribute float aSize;
uniform float uScale;
varying vec4 vCol;
void main(){
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 900.0);
  #include <logdepthbuf_vertex>
}`;
const PF = `#include <logdepthbuf_pars_fragment>
varying vec4 vCol;
uniform float uSoft;
void main(){
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, uSoft, d);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.pos = F(3); this.vel = F(3); this.c0 = F(3); this.c1 = F(3);
    this.a0 = F(1); this.life = F(1); this.ml = F(1); this.s0 = F(1); this.s1 = F(1); this.drag = F(1); this.grav = F(1);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(F(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(F(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(F(1), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: additive ? 0.0 : 0.25 } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, r1, g1, b1, a, drag = 0, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.a0[i] = a; this.life[i] = 0; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag; this.grav[i] = grav;
  }

  _copy(i, j) {
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k]; this.vel[i3 + k] = this.vel[j3 + k];
      this.c0[i3 + k] = this.c0[j3 + k]; this.c1[i3 + k] = this.c1[j3 + k];
    }
    this.a0[i] = this.a0[j]; this.life[i] = this.life[j]; this.ml[i] = this.ml[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }

  clear() { this.n = 0; }

  update(dt, g) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.ml[i]) { this._copy(i, --this.n); continue; }
      const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - g * this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      i++;
    }
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4, t = this.life[i] / this.ml[i];
      P[i3] = this.pos[i3]; P[i3 + 1] = this.pos[i3 + 1]; P[i3 + 2] = this.pos[i3 + 2];
      C[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      C[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      C[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      const fin = t < 0.08 ? t / 0.08 : 1;
      C[i4 + 3] = this.a0[i] * fin * (1 - t) * (1 - t * 0.5);
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

class Debris {
  constructor(max) {
    this.max = max; this.n = 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c);
    this.mesh.count = 0;
    const F = (k) => new Float32Array(max * k);
    this.pos = F(3); this.vel = F(3); this.rot = F(3); this.av = F(3); this.size = F(3); this.life = F(1); this.ml = F(1);
    this.col = F(3); this.glow = F(1);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  emit(p, v, size, color, life = rand(4, 7)) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.rot[i3] = rand(0, 6); this.rot[i3 + 1] = rand(0, 6); this.rot[i3 + 2] = rand(0, 6);
    this.av[i3] = rand(-8, 8); this.av[i3 + 1] = rand(-8, 8); this.av[i3 + 2] = rand(-8, 8);
    this.size[i3] = size * rand(0.6, 1.3); this.size[i3 + 1] = size * rand(0.4, 1.1); this.size[i3 + 2] = size * rand(0.6, 1.3);
    this.life[i] = 0; this.ml[i] = life;
    this._c.set(color);
    const k = rand(0.75, 1.1);
    this.col[i3] = this._c.r * k; this.col[i3 + 1] = this._c.g * k; this.col[i3 + 2] = this._c.b * k;
    this.mesh.setColorAt(i, this._c.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]));
    this.mesh.instanceColor.needsUpdate = true;
  }

  _copy(i, j) {
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k]; this.vel[i3 + k] = this.vel[j3 + k]; this.rot[i3 + k] = this.rot[j3 + k];
      this.av[i3 + k] = this.av[j3 + k]; this.size[i3 + k] = this.size[j3 + k]; this.col[i3 + k] = this.col[j3 + k];
    }
    this.life[i] = this.life[j]; this.ml[i] = this.ml[j];
    this.mesh.setColorAt(i, this._c.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]));
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  update(dt, g, groundAt) {
    let i = 0, recolor = false;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.ml[i]) { this._copy(i, --this.n); recolor = true; continue; }
      const i3 = i * 3;
      this.vel[i3 + 1] -= g * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i3] += this.av[i3] * dt; this.rot[i3 + 1] += this.av[i3 + 1] * dt; this.rot[i3 + 2] += this.av[i3 + 2] * dt;
      if (((i + this._frame) & 1) === 0) {
        const gy = groundAt(this.pos[i3], this.pos[i3 + 2]) + this.size[i3 + 1] * 0.4;
        if (this.pos[i3 + 1] < gy) {
          this.pos[i3 + 1] = gy;
          if (this.vel[i3 + 1] < 0) this.vel[i3 + 1] *= -0.25;
          this.vel[i3] *= 0.55; this.vel[i3 + 2] *= 0.55;
          this.av[i3] *= 0.5; this.av[i3 + 1] *= 0.5; this.av[i3 + 2] *= 0.5;
        }
      }
      const t = this.life[i] / this.ml[i], sc = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      this._p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      this._q.setFromEuler(this._e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]));
      this._s.set(this.size[i3] * sc, this.size[i3 + 1] * sc, this.size[i3 + 2] * sc);
      this.mesh.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      i++;
    }
    this._frame = (this._frame || 0) + 1;
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (recolor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.add = new Particles(7000, true);
    this.norm = new Particles(6000, false);
    this.debris = new Debris(1800);
    this.group.add(this.add.points, this.norm.points, this.debris.mesh);

    // rings / shockwaves
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 64);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 4;
      this.group.add(m);
      this.rings.push({ m, t: 0, life: 1, r0: 1, r1: 10, a: 1 });
    }
    // flash lights
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 400, 1.6);
      this.group.add(l);
      this.lights.push({ l, t: 0, life: 1, i0: 0 });
    }
    this.li = 0;
    // heat beams
    this.beams = [];
    const bg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    bg.translate(0, 0.5, 0);
    for (let i = 0; i < 2; i++) {
      const core = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.2, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const glow = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.05), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.visible = glow.visible = false;
      core.renderOrder = glow.renderOrder = 5;
      this.group.add(core, glow);
      this.beams.push({ core, glow });
    }
    // generic enemy beams (reusable)
    this.eBeams = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.renderOrder = 5;
      this.group.add(m);
      this.eBeams.push(m);
    }
    // lightning bolts
    this.bolts = [];
    // speed streaks
    this.streakN = 220;
    const sg = new THREE.BufferGeometry();
    this.streakPos = new Float32Array(this.streakN * 6);
    const sc = new Float32Array(this.streakN * 6);
    for (let i = 0; i < this.streakN; i++) { sc.set([1, 1, 1, 0, 0, 0], i * 6); }
    sg.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
    this.streakP = [];
    for (let i = 0; i < this.streakN; i++) this.streakP.push(new THREE.Vector3(1e9, 0, 0));

    this.slabs = [];
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  clear() {
    this.add.clear(); this.norm.clear(); this.debris.clear();
    for (const r of this.rings) { r.m.visible = false; r.t = r.life; }
    for (const s of this.slabs) { s.mesh.parent?.remove(s.mesh); s.mesh.material.dispose(); }
    this.slabs.length = 0;
    for (const b of this.bolts) { b.line.parent?.remove(b.line); b.line.geometry.dispose(); }
    this.bolts.length = 0;
    for (const b of this.eBeams) b.visible = false;
    for (const s of this.streakP) s.set(1e9, 0, 0);
  }

  // ----- emitters -----
  burst(p, n, o) {
    const sys = o.add ? this.add : this.norm;
    const v = this._v;
    for (let i = 0; i < n; i++) {
      randDir(v).multiplyScalar(rand(o.spd0 ?? 0, o.spd ?? 10));
      if (o.dir) v.addScaledVector(o.dir, rand(0.3, 1) * (o.dirSpd ?? 0));
      if (o.up) v.y += o.up * rand(0.3, 1);
      const r = o.rad ?? 0;
      const c0 = o.c0, c1 = o.c1 ?? o.c0;
      const j = o.jit ?? 0.08;
      const k = 1 + rand(-j, j);
      sys.emit(p.x + rand(-r, r), p.y + rand(-r, r) * (o.flat ? 0.2 : 1), p.z + rand(-r, r), v.x, v.y, v.z,
        rand(o.l0 ?? 0.5, o.l1 ?? 1), (o.s0 ?? 1) * rand(0.7, 1.3), (o.s1 ?? 3) * rand(0.7, 1.3),
        c0[0] * k, c0[1] * k, c0[2] * k, c1[0], c1[1], c1[2], o.a ?? 1, o.drag ?? 0.5, o.grav ?? 0);
    }
  }

  explosion(p, scale = 1, color = null) {
    const s = scale;
    this.burst(p, Math.min(80, 26 * s + 10), { add: true, spd: 22 * s, c0: color ?? [3, 1.6, 0.5], c1: [1.2, 0.15, 0.02], s0: 3 * s, s1: 9 * s, l0: 0.35, l1: 0.9, drag: 2.5, rad: s });
    this.burst(p, Math.min(60, 18 * s + 6), { add: true, spd: 60 * s, spd0: 15 * s, c0: [4, 3, 1.5], c1: [2, 0.4, 0.05], s0: 0.5 * s, s1: 0.2, l0: 0.4, l1: 1.2, drag: 1, grav: 1 });
    this.burst(p, Math.min(50, 14 * s + 4), { spd: 10 * s, c0: [0.25, 0.23, 0.22], c1: [0.4, 0.38, 0.36], s0: 4 * s, s1: 16 * s, l0: 1.5, l1: 3.5, drag: 1.2, grav: -0.05, a: 0.7, rad: s * 2 });
    this.flash(p, color ? new THREE.Color(...color).getHex() : 0xffaa55, 30 * s, 60 + 80 * s, 0.35);
    this.ring(p, UP, 3 * s, 30 * s, 0.5, 0xffb070, 0.7);
  }

  dust(p, n, spread, col = [0.55, 0.5, 0.42], size = 6, up = 4) {
    this.burst(p, n, { spd: spread, c0: col, c1: col.map((c) => c * 1.15), s0: size * 0.5, s1: size * 2.2, l0: 1.5, l1: 4, drag: 1.4, up, grav: -0.02, a: 0.55, rad: spread * 0.15, flat: true });
  }

  sparks(p, n, col = [4, 2.5, 1], spd = 40, dir = null) {
    this.burst(p, n, { add: true, spd, c0: col, c1: [1.5, 0.2, 0.0], s0: 0.35, s1: 0.1, l0: 0.25, l1: 0.8, drag: 1.5, grav: 1, dir, dirSpd: spd * 0.6 });
  }

  fire(p, size = 3, n = 2) {
    this.burst(p, n, { add: true, spd: size * 0.6, up: size * 3, c0: [3, 1.2, 0.25], c1: [0.8, 0.1, 0], s0: size, s1: size * 0.3, l0: 0.5, l1: 1.2, drag: 1, rad: size * 0.6 });
    if (Math.random() < 0.5) this.burst(p, 1, { spd: size * 0.3, up: size * 3, c0: [0.12, 0.11, 0.1], c1: [0.3, 0.3, 0.3], s0: size * 1.5, s1: size * 6, l0: 2, l1: 4, drag: 0.5, a: 0.5, rad: size * 0.5 });
  }

  steam(p, size = 3) {
    this.burst(p, 2, { spd: size * 0.5, up: size * 2, c0: [0.85, 0.88, 0.92], c1: [1, 1, 1], s0: size, s1: size * 4, l0: 1, l1: 2.5, drag: 1, a: 0.4, rad: size });
  }

  debrisBurst(p, n, color, spd = 20, size = 1, up = 10) {
    const v = this._v2;
    for (let i = 0; i < n; i++) {
      randDir(v).multiplyScalar(rand(spd * 0.2, spd));
      v.y += rand(0, up);
      this.debris.emit(p, v, size * rand(0.4, 1.4), color);
    }
  }

  ring(p, normal, r0, r1, life, color, alpha = 0.8) {
    const r = this.rings.find((x) => x.t >= x.life) ?? this.rings[0];
    r.t = 0; r.life = life; r.r0 = r0; r.r1 = r1; r.a = alpha;
    r.m.position.copy(p);
    r.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    r.m.material.color.set(color);
    r.m.visible = true;
  }

  flash(p, color, intensity, range, life) {
    const L = this.lights[this.li++ % this.lights.length];
    L.l.position.copy(p); L.l.color.set(color); L.l.distance = range; L.i0 = intensity * 40; L.t = 0; L.life = life;
  }

  bolt(a, b, color = 0xbfd8ff, life = 0.25, jag = 0.12) {
    const pts = [];
    const d = this._v.copy(b).sub(a);
    const len = d.length();
    const segs = Math.max(6, Math.min(30, (len / 8) | 0));
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const q = a.clone().addScaledVector(d, t);
      if (i < segs) q.add(randDir(new THREE.Vector3()).multiplyScalar(len * jag * Math.sin(t * Math.PI) * rand(0.3, 1)));
      pts.push(prev, q);
      if (Math.random() < 0.15 && i < segs - 1) {
        const br = q.clone().add(randDir(new THREE.Vector3()).multiplyScalar(len * 0.12));
        pts.push(q.clone(), br);
      }
      prev = q;
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    this.group.add(line);
    this.bolts.push({ line, t: 0, life });
  }

  setBeams(on, eyes, target, power = 1) {
    for (let i = 0; i < 2; i++) {
      const b = this.beams[i];
      b.core.visible = b.glow.visible = on;
      if (!on) continue;
      const e = eyes[i];
      const d = this._v.copy(target).sub(e);
      const len = d.length();
      d.divideScalar(len);
      this._q.setFromUnitVectors(UP, d);
      const w = (0.035 + Math.random() * 0.01) * power;
      b.core.position.copy(e); b.core.quaternion.copy(this._q); b.core.scale.set(w, len, w);
      b.glow.position.copy(e); b.glow.quaternion.copy(this._q); b.glow.scale.set(w * 3.5, len, w * 3.5);
    }
  }

  setEnemyBeam(i, on, a, b, color, width) {
    const m = this.eBeams[i];
    m.visible = on;
    if (!on) return;
    const d = this._v.copy(b).sub(a);
    const len = d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    m.scale.set(width, len, width);
    m.material.color.set(color).multiplyScalar(3);
  }

  // falling chunk of a building
  spawnSlab(material, color, center, size, vel, angVel) {
    const mat = material.clone();
    mat.color.set(color);
    const m = new THREE.Mesh(this.slabGeo ??= new THREE.BoxGeometry(1, 1, 1), mat);
    m.position.copy(center);
    m.scale.copy(size);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    this.slabs.push({ mesh: m, vel: vel.clone(), av: angVel.clone(), size: size.clone(), color, t: 0, hit: new Set() });
  }

  updateSlabs(dt, world) {
    const g = world.gravity;
    for (let i = this.slabs.length - 1; i >= 0; i--) {
      const s = this.slabs[i];
      s.t += dt;
      s.vel.y -= g * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const q = this._q.setFromAxisAngle(this._v.copy(s.av).normalize(), s.av.length() * dt);
      if (s.av.lengthSq() > 0) s.mesh.quaternion.premultiply(q);
      const p = s.mesh.position;
      const ext = Math.max(s.size.x, s.size.y, s.size.z) * 0.5;
      // crush other buildings
      if (world.terrain) {
        world.terrain.forStructsNear(p.x, p.z, ext * 0.7, (st) => {
          if (s.hit.has(st)) return;
          if (p.y - ext * 0.4 < st.y0 + st.h && p.y + ext > st.y0) {
            s.hit.add(st);
            world.terrain.damageStruct(st, 250 + s.size.x * s.size.y * s.size.z * 0.02, p, s.vel, { noCut: false });
            s.vel.multiplyScalar(0.7);
          }
        });
      }
      const gy = world.groundAt(p.x, p.z);
      if (p.y - ext * 0.45 < gy || s.t > 12) {
        const vol = s.size.x * s.size.y * s.size.z;
        const n = Math.min(70, 10 + vol / 60);
        const ip = this._v2.set(p.x, Math.max(gy, p.y - ext * 0.4) + 2, p.z);
        this.debrisBurst(ip, n, s.color, 25, Math.min(5, 1 + Math.cbrt(vol) * 0.12), 15);
        this.dust(ip, Math.min(40, 10 + vol / 400), 25 + ext, world.dustColor ?? [0.55, 0.52, 0.48], 8 + ext * 0.2, 6);
        this.ring(ip, UP, ext * 0.5, ext * 4, 0.8, 0xc8b8a0, 0.35);
        world.game.shake(Math.min(0.8, 0.1 + vol / 40000), ip);
        world.game.audio.boom(Math.min(1, 0.3 + vol / 30000), ip);
        world.damageArea?.(ip, ext * 1.4, 120, { knock: 30, noPlayer: true });
        this.group.remove(s.mesh);
        s.mesh.material.dispose();
        this.slabs.splice(i, 1);
      }
    }
  }

  updateStreaks(dt, cam, vel, speed) {
    const n = this.streakN, P = this.streakPos;
    const k = Math.min(1, Math.max(0, (speed - 120) / 400));
    this.streaks.material.opacity = k * 0.45;
    if (k <= 0) return;
    const dir = this._v.copy(vel).normalize();
    const len = Math.min(60, speed * 0.035);
    const cp = cam.position;
    const side = this._v2;
    for (let i = 0; i < n; i++) {
      const p = this.streakP[i];
      const rel = side.copy(p).sub(cp);
      const along = rel.dot(dir);
      if (along < -10 || rel.lengthSq() > 250 * 250) {
        // respawn ahead in a cylinder around motion axis
        randDir(side);
        side.addScaledVector(dir, -side.dot(dir)).normalize().multiplyScalar(rand(6, 60));
        p.copy(cp).addScaledVector(dir, rand(40, 220)).add(side);
      }
      P[i * 6] = p.x; P[i * 6 + 1] = p.y; P[i * 6 + 2] = p.z;
      P[i * 6 + 3] = p.x - dir.x * len; P[i * 6 + 4] = p.y - dir.y * len; P[i * 6 + 5] = p.z - dir.z * len;
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  update(dt, world, cam) {
    const g = world.gravity ?? 9.8;
    this.add.update(dt, g);
    this.norm.update(dt, g);
    this.debris.update(dt, g, world.groundAt);
    this.updateSlabs(dt, world);
    for (const r of this.rings) {
      if (r.t >= r.life) continue;
      r.t += dt;
      const t = Math.min(1, r.t / r.life);
      const e = 1 - Math.pow(1 - t, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = r.a * (1 - t);
      if (r.t >= r.life) r.m.visible = false;
    }
    for (const L of this.lights) {
      if (L.t >= L.life) { L.l.intensity = 0; continue; }
      L.t += dt;
      L.l.intensity = L.i0 * Math.max(0, 1 - L.t / L.life);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.line.material.opacity = Math.random() < 0.3 ? 0.2 : 1 - b.t / b.life;
      if (b.t >= b.life) { this.group.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.bolts.splice(i, 1); }
    }
    const scale = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    this.add.mat.uniforms.uScale.value = scale;
    this.norm.mat.uniforms.uScale.value = scale;
  }
}
