import * as THREE from 'three';
import { damp, clamp } from './util.js';

function emblemTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const shield = () => {
    g.beginPath();
    g.moveTo(s * 0.2, s * 0.12); g.lineTo(s * 0.8, s * 0.12); g.lineTo(s * 0.98, s * 0.38);
    g.lineTo(s * 0.5, s * 0.95); g.lineTo(s * 0.02, s * 0.38); g.closePath();
  };
  shield(); g.fillStyle = '#c4161c'; g.fill();
  g.save(); g.translate(s * 0.5, s * 0.52); g.scale(0.84, 0.84); g.translate(-s * 0.5, -s * 0.52); shield(); g.fillStyle = '#f6c337'; g.fill(); g.restore();
  g.fillStyle = '#c4161c';
  g.font = `italic 900 ${s * 0.5}px "Russo One", "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('S', s * 0.5, s * 0.47);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// pose library: joint -> [x, y, z] euler angles
const POSES = {
  stand: {
    spine: [0, 0, 0], neck: [0, 0, 0],
    shL: [0.15, 0, 0.8], elL: [-0.25, 0, -2.0], shR: [0.15, 0, -0.8], elR: [-0.25, 0, 2.0],
    hipL: [0, 0, 0.1], knL: [0, 0, 0], hipR: [0, 0, -0.1], knR: [0, 0, 0],
  },
  hover: {
    spine: [0.04, 0, 0], neck: [0, 0, 0],
    shL: [0.15, 0, 0.28], elL: [-0.4, 0, 0], shR: [0.15, 0, -0.28], elR: [-0.4, 0, 0],
    hipL: [-0.05, 0, 0.05], knL: [0.15, 0, 0], hipR: [0.25, 0, -0.04], knR: [0.6, 0, 0],
  },
  fly: {
    spine: [0, 0, 0], neck: [-1.05, 0, 0],
    shL: [0.1, 0, 0.12], elL: [-0.15, 0, 0], shR: [0.25, 0, -3.0], elR: [0, 0, 0],
    hipL: [0, 0, 0.05], knL: [0.08, 0, 0], hipR: [0.05, 0, -0.03], knR: [0.4, 0, 0],
  },
  flyFast: {
    spine: [0, 0, 0], neck: [-1.1, 0, 0],
    shL: [0.25, 0, 3.0], elL: [0, 0, 0], shR: [0.25, 0, -3.0], elR: [0, 0, 0],
    hipL: [0, 0, 0.04], knL: [0.02, 0, 0], hipR: [0, 0, -0.04], knR: [0.05, 0, 0],
  },
  carry: {
    spine: [-0.05, 0, 0], neck: [0.1, 0, 0],
    shL: [0, 0, 2.75], elL: [0, 0, 0.5], shR: [0, 0, -2.75], elR: [0, 0, -0.5],
    hipL: [-0.05, 0, 0.12], knL: [0.1, 0, 0], hipR: [0.05, 0, -0.12], knR: [0.2, 0, 0],
  },
  land: {
    spine: [0.45, 0, 0], neck: [-0.35, 0, 0],
    shL: [0.2, 0, 0.5], elL: [-0.3, 0, 0], shR: [-0.9, 0, -0.15], elR: [-0.2, 0, 0],
    hipL: [-1.55, 0, 0.2], knL: [1.7, 0, 0], hipR: [-0.25, 0, -0.15], knR: [2.3, 0, 0],
  },
};
const JOINTS = ['spine', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];

class Cape {
  constructor(hero, mat) {
    this.hero = hero;
    const W = this.W = 9, H = this.H = 15;
    this.n = W * H;
    this.p = new Float32Array(this.n * 3);
    this.o = new Float32Array(this.n * 3);
    this.len = 1.32;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.n * 3), uv = new Float32Array(this.n * 2), idx = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      uv[(j * W + i) * 2] = i / (W - 1); uv[(j * W + i) * 2 + 1] = 1 - j / (H - 1);
      if (i < W - 1 && j < H - 1) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.anchorsLocal = [];
    for (let i = 0; i < W; i++) {
      const t = i / (W - 1);
      this.anchorsLocal.push(new THREE.Vector3(-0.19 + 0.38 * t, 0.56 - Math.sin(t * Math.PI) * 0.02, -0.115 - Math.sin(t * Math.PI) * 0.03));
    }
    // constraints
    this.cons = [];
    const add = (a, b) => this.cons.push(a, b, 0);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = j * W + i;
      if (i < W - 1) add(a, a + 1);
      if (j < H - 1) add(a, a + W);
      if (i < W - 1 && j < H - 1) { add(a, a + W + 1); add(a + 1, a + W); }
      if (j < H - 2) add(a, a + 2 * W);
    }
    this.inited = false;
    this._v = new THREE.Vector3();
    this.anchors = this.anchorsLocal.map(() => new THREE.Vector3());
    this.t = 0;
  }

  _restLengths() {
    const W = this.W, H = this.H, c = this.cons;
    const colX = (i, j) => { const top = 0.38 + 0.0, bot = 0.95; const w = top + (bot - top) * (j / (H - 1)); return -w / 2 + w * (i / (W - 1)); };
    const seg = this.len / (H - 1);
    for (let k = 0; k < c.length; k += 3) {
      const a = c[k], b = c[k + 1];
      const ai = a % W, aj = (a / W) | 0, bi = b % W, bj = (b / W) | 0;
      const dx = colX(ai, aj) - colX(bi, bj), dy = (aj - bj) * seg;
      c[k + 2] = Math.hypot(dx, dy);
    }
  }

  update(dt, velLocal, gravLocal, speed) {
    const W = this.W, H = this.H, P = this.p, O = this.o;
    const hero = this.hero;
    hero.root.updateMatrixWorld(true);
    const inv = this._inv ??= new THREE.Matrix4();
    inv.copy(hero.root.matrixWorld).invert();
    for (let i = 0; i < W; i++) {
      this.anchors[i].copy(this.anchorsLocal[i]).applyMatrix4(hero.j.spine.matrixWorld).applyMatrix4(inv);
    }
    if (!this.inited) {
      this._restLengths();
      const seg = this.len / (H - 1);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const a = this.anchors[i], k = (j * W + i) * 3;
        P[k] = a.x * (1 + j * 0.05); P[k + 1] = a.y - j * seg; P[k + 2] = a.z - 0.05 - j * 0.01;
        O[k] = P[k]; O[k + 1] = P[k + 1]; O[k + 2] = P[k + 2];
      }
      this.inited = true;
    }
    this.t += dt;
    const steps = 2, h = Math.min(dt, 0.033) / steps;
    const air = this._v.copy(velLocal).multiplyScalar(-1);
    const al = air.length();
    if (al > 45) air.multiplyScalar(45 / al);
    const flutter = Math.min(1, speed / 60);
    for (let s = 0; s < steps; s++) {
      for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) {
        const k = (j * W + i) * 3;
        const x = P[k], y = P[k + 1], z = P[k + 2];
        const vx = (x - O[k]) / h, vy = (y - O[k + 1]) / h, vz = (z - O[k + 2]) / h;
        const fl = Math.sin(this.t * 22 + j * 0.9 + i * 0.4) * flutter;
        const ax = gravLocal.x + (air.x - vx) * 2.4 + fl * 9 * (i / W - 0.5);
        const ay = gravLocal.y + (air.y - vy) * 2.4 + fl * 6;
        const az = gravLocal.z + (air.z - vz) * 2.4 + Math.cos(this.t * 17 + j * 1.1) * flutter * 8;
        O[k] = x; O[k + 1] = y; O[k + 2] = z;
        P[k] = x + vx * h * 0.985 + ax * h * h;
        P[k + 1] = y + vy * h * 0.985 + ay * h * h;
        P[k + 2] = z + vz * h * 0.985 + az * h * h;
      }
      for (let i = 0; i < W; i++) {
        const k = i * 3, a = this.anchors[i];
        P[k] = a.x; P[k + 1] = a.y; P[k + 2] = a.z; O[k] = a.x; O[k + 1] = a.y; O[k + 2] = a.z;
      }
      const c = this.cons;
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < c.length; k += 3) {
          const a = c[k] * 3, b = c[k + 1] * 3, rest = c[k + 2];
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (d - rest) / d * 0.5;
          const pa = a >= W * 3 ? 1 : 0, pb = b >= W * 3 ? 1 : 0;
          const wa = pa && pb ? 1 : pa ? 2 : 0, wb = pa && pb ? 1 : pb ? 2 : 0;
          P[a] += dx * diff * wa; P[a + 1] += dy * diff * wa; P[a + 2] += dz * diff * wa;
          P[b] -= dx * diff * wb; P[b + 1] -= dy * diff * wb; P[b + 2] -= dz * diff * wb;
        }
        // body collision (ellipse around torso / legs axis)
        for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) {
          const k = (j * W + i) * 3;
          const y = P[k + 1];
          if (y > 0.75 || y < -1.0) continue;
          const rx = y > -0.05 ? 0.27 : 0.2, rz = y > -0.05 ? 0.17 : 0.13;
          const ex = P[k] / rx, ez = P[k + 2] / rz;
          const e = ex * ex + ez * ez;
          if (e < 1) {
            const f = 1 / Math.sqrt(e || 1e-4);
            P[k] *= f; P[k + 2] *= f;
            if (P[k + 2] > -0.02 && Math.abs(P[k]) < 0.18) P[k + 2] = -rz;
          }
        }
      }
    }
    const pos = this.geo.attributes.position.array;
    pos.set(P);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export class Hero {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const M = this.mats = {
      suit: new THREE.MeshStandardMaterial({ color: 0x1c46c4, roughness: 0.42, metalness: 0.12 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc8151d, roughness: 0.5, metalness: 0.05 }),
      cape: new THREE.MeshStandardMaterial({ color: 0xb3121a, roughness: 0.75, side: THREE.DoubleSide }),
      skin: new THREE.MeshStandardMaterial({ color: 0xe2b28a, roughness: 0.62 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.35, metalness: 0.25 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xf6c337, roughness: 0.3, metalness: 0.65 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x2a4a88, emissive: 0x000000, roughness: 0.2 }),
      white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    };
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const joint = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    const j = this.j = {};

    // pelvis / trunks / belt
    const trunks = mesh(new THREE.CylinderGeometry(0.175, 0.15, 0.2, 18), M.red, this.body, 0, -0.03, 0);
    trunks.scale.z = 0.74;
    const belt = mesh(new THREE.CylinderGeometry(0.181, 0.181, 0.05, 18), M.gold, this.body, 0, 0.075, 0);
    belt.scale.z = 0.76;
    mesh(new THREE.BoxGeometry(0.07, 0.055, 0.02), M.gold, this.body, 0, 0.075, 0.135);

    // torso
    j.spine = joint(this.body, 0, 0.08, 0);
    const prof = [[0.16, 0], [0.175, 0.08], [0.205, 0.2], [0.24, 0.34], [0.255, 0.44], [0.245, 0.52], [0.18, 0.585], [0.075, 0.63]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const torso = mesh(new THREE.LatheGeometry(prof, 24), M.suit, j.spine);
    torso.scale.set(1.22, 1, 0.7);
    for (const s of [-1, 1]) {
      const pec = mesh(new THREE.SphereGeometry(0.1, 16, 12), M.suit, j.spine, s * 0.085, 0.4, 0.105);
      pec.scale.set(1.15, 0.78, 0.5);
      const ab = mesh(new THREE.SphereGeometry(0.07, 12, 8), M.suit, j.spine, s * 0.045, 0.2, 0.1);
      ab.scale.set(0.9, 1.3, 0.45);
      const lat = mesh(new THREE.SphereGeometry(0.1, 12, 10), M.suit, j.spine, s * 0.16, 0.38, -0.04);
      lat.scale.set(0.7, 1.4, 0.8);
    }
    const emb = mesh(new THREE.PlaneGeometry(0.2, 0.17), new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, alphaTest: 0.3, roughness: 0.4 }), j.spine, 0, 0.415, 0.168);
    emb.rotation.x = -0.12; emb.castShadow = false;

    // neck / head
    mesh(new THREE.CylinderGeometry(0.058, 0.065, 0.12, 12), M.skin, j.spine, 0, 0.66, 0.0);
    j.neck = joint(j.spine, 0, 0.66, 0.0);
    const head = new THREE.Group(); j.neck.add(head); this.head = head;
    const skull = mesh(new THREE.SphereGeometry(0.118, 24, 18), M.skin, head, 0, 0.14, 0);
    skull.scale.set(0.86, 1.05, 0.96);
    const jaw = mesh(new THREE.SphereGeometry(0.09, 16, 12), M.skin, head, 0, 0.075, 0.025);
    jaw.scale.set(0.95, 0.75, 0.95);
    const hair = mesh(new THREE.SphereGeometry(0.124, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair, head, 0, 0.152, -0.008);
    hair.scale.set(0.9, 1.04, 1.02); hair.rotation.x = -0.25;
    const curl = mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12, Math.PI * 1.5), M.hair, head, 0.015, 0.225, 0.1);
    curl.rotation.set(0.3, 0.4, 0);
    mesh(new THREE.BoxGeometry(0.022, 0.035, 0.03), M.skin, head, 0, 0.125, 0.112);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.022, 8, 6), M.skin, head, s * 0.1, 0.135, 0);
      ear.scale.set(0.5, 1, 0.8);
    }
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.013, 8, 6), M.eye, head, s * 0.038, 0.152, 0.098);
      e.castShadow = false;
      this.eyes.push(e);
    }
    const brow = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.02), M.hair, head, 0, 0.175, 0.1);
    brow.rotation.x = -0.2;

    // arms
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const sh = j['sh' + side] = joint(j.spine, s * 0.25, 0.53, -0.01);
      const delt = mesh(new THREE.SphereGeometry(0.09, 14, 10), M.suit, sh);
      delt.scale.set(1, 0.9, 0.95);
      mesh(new THREE.CapsuleGeometry(0.064, 0.2, 4, 10), M.suit, sh, 0, -0.16, 0);
      const el = j['el' + side] = joint(sh, 0, -0.31, 0);
      mesh(new THREE.CapsuleGeometry(0.054, 0.18, 4, 10), M.suit, el, 0, -0.13, 0);
      const fist = mesh(new THREE.SphereGeometry(0.062, 12, 10), M.skin, el, 0, -0.29, 0.005);
      fist.scale.set(0.85, 1.12, 1);
      this['fist' + side] = fist;
    }
    // legs
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const hip = j['hip' + side] = joint(this.body, s * 0.095, -0.07, 0);
      mesh(new THREE.CapsuleGeometry(0.085, 0.27, 4, 10), M.suit, hip, 0, -0.2, 0);
      const kn = j['kn' + side] = joint(hip, 0, -0.43, 0);
      mesh(new THREE.CapsuleGeometry(0.064, 0.22, 4, 10), M.suit, kn, 0, -0.15, 0);
      mesh(new THREE.CylinderGeometry(0.076, 0.066, 0.27, 12), M.red, kn, 0, -0.27, 0);
      const rim = mesh(new THREE.CylinderGeometry(0.082, 0.078, 0.04, 12), M.red, kn, 0, -0.125, 0.005);
      rim.rotation.x = 0.15;
      const foot = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.2), M.red, kn, 0, -0.43, 0.05);
      foot.geometry.translate(0, 0, 0);
    }

    this.cape = new Cape(this, M.cape);
    this.root.add(this.cape.mesh);

    // reentry / energy aura
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.set(1, 1.6, 1);
    this.root.add(this.aura);

    this.pose = {};
    for (const k of JOINTS) this.pose[k] = [0, 0, 0];
    this.walkPhase = 0;
    this.punchT = 0; this.punchSide = 1;
    this.landT = 0;
    this.eyeGlow = 0;
    this._v = new THREE.Vector3(); this._g = new THREE.Vector3();
    this.setPoseInstant('hover');
  }

  setPoseInstant(name) {
    const p = POSES[name];
    for (const k of JOINTS) { this.pose[k][0] = p[k][0]; this.pose[k][1] = p[k][1]; this.pose[k][2] = p[k][2]; }
  }

  punch() { this.punchT = 0.28; this.punchSide *= -1; }

  // state: {mode, speed, flyBlend, carry, walkSpeed, headYaw, headPitch}
  animate(dt, st, velWorld, gravity) {
    const target = {};
    const fb = st.flyBlend;
    const fast = clamp((st.speed - 250) / 400, 0, 1);
    let base;
    if (this.landT > 0) { this.landT -= dt; base = POSES.land; }
    else if (st.carry) base = POSES.carry;
    else if (st.mode === 'ground') base = POSES.stand;
    else base = null;
    for (const k of JOINTS) {
      if (base) { target[k] = base[k].slice(); continue; }
      const h = POSES.hover[k], f = POSES.fly[k], ff = POSES.flyFast[k];
      const fx = f[0] + (ff[0] - f[0]) * fast, fy = f[1] + (ff[1] - f[1]) * fast, fz = f[2] + (ff[2] - f[2]) * fast;
      target[k] = [h[0] + (fx - h[0]) * fb, h[1] + (fy - h[1]) * fb, h[2] + (fz - h[2]) * fb];
    }
    // procedural walk / run
    if (st.mode === 'ground' && !st.carry && this.landT <= 0 && st.walkSpeed > 0.5) {
      const run = clamp(st.walkSpeed / 25, 0, 1);
      this.walkPhase += dt * (5 + st.walkSpeed * 0.35);
      const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
      const amp = 0.55 + run * 0.5;
      target.hipL = [-s * amp, 0, 0.05]; target.hipR = [s * amp, 0, -0.05];
      target.knL = [Math.max(0, c) * (0.6 + run * 0.9) + 0.1, 0, 0]; target.knR = [Math.max(0, -c) * (0.6 + run * 0.9) + 0.1, 0, 0];
      target.shL = [s * (0.5 + run * 0.6), 0, 0.12]; target.shR = [-s * (0.5 + run * 0.6), 0, -0.12];
      target.elL = [-0.4 - run * 0.9, 0, 0]; target.elR = [-0.4 - run * 0.9, 0, 0];
      target.spine = [0.08 + run * 0.35, 0, 0];
    }
    if (st.mode !== 'ground' && fb < 0.5) {
      const bob = Math.sin(performance.now() * 0.002);
      target.knR[0] += bob * 0.05; target.knL[0] += bob * 0.03;
    }
    // head look
    if (fb < 0.6 && this.landT <= 0) {
      target.neck[1] += clamp(st.headYaw, -0.9, 0.9) * (1 - fb);
      target.neck[0] += clamp(-st.headPitch * 0.6, -0.6, 0.5) * (1 - fb);
    }
    // punch overlay
    if (this.punchT > 0) {
      this.punchT -= dt;
      const k = Math.sin(clamp(1 - this.punchT / 0.28, 0, 1) * Math.PI);
      const sh = this.punchSide > 0 ? 'shR' : 'shL', el = this.punchSide > 0 ? 'elR' : 'elL';
      const sgn = this.punchSide > 0 ? -1 : 1;
      const pz = fb > 0.5 ? [0.2, 0, sgn * 3.05] : [-1.6, 0, sgn * 0.1];
      target[sh] = target[sh].map((v, i) => v + (pz[i] - v) * k);
      target[el] = target[el].map((v) => v * (1 - k));
      target.spine[1] += sgn * 0.35 * k * (1 - fb);
    }
    const rate = this.punchT > 0 ? 30 : 9;
    for (const k of JOINTS) {
      const p = this.pose[k], t = target[k];
      p[0] = damp(p[0], t[0], rate, dt); p[1] = damp(p[1], t[1], rate, dt); p[2] = damp(p[2], t[2], rate, dt);
      this.j[k].rotation.set(p[0], p[1], p[2]);
    }
    this.body.position.y = damp(this.body.position.y, this.landT > 0 ? -0.45 : 0, 10, dt);

    // eyes
    const eg = this.eyeGlow;
    this.mats.eye.emissive.setRGB(eg * 6, eg * 0.6, eg * 0.2);

    // cape physics in root-local frame
    const invQ = this._q ??= new THREE.Quaternion();
    invQ.copy(this.root.quaternion).invert();
    const vl = this._v.copy(velWorld).applyQuaternion(invQ);
    const gl = this._g.set(0, -Math.max(2.5, gravity), 0).applyQuaternion(invQ);
    this.cape.update(dt, vl, gl, st.speed);
  }

  eyeWorld(i, out) { return this.eyes[i].getWorldPosition(out); }
}
