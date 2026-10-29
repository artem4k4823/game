import * as THREE from 'three';
import { makePlanetMaterial, makeAtmoMaterial, makeSunMaterial, makeRingMaterial, makeGlowTexture, NOISE3 } from './shaders.js';
import { mulberry32 } from './noise.js';
import { clamp, smoothstep, rand } from './util.js';

export const SUN_R = 2600;
export const PLANETS = [
  { id: 'mercury', name: 'Меркурий', type: 'rocky', R: 170, orbit: 12000, angle: 0.6, c1: 0x8a8078, c2: 0x5a524c, c3: 0x6a625a, info: 'Солнечная перегрузка · Монолит' },
  { id: 'venus', name: 'Венера', type: 'venus', R: 380, orbit: 18500, angle: 2.2, c1: 0xe8c888, c2: 0xc89a58, c3: 0xf2e2b4, atmo: 0xffd890, info: 'Вулканы · кислотный дождь' },
  { id: 'earth', name: 'Земля', type: 'earth', R: 420, orbit: 26000, angle: 4.1, c3: 0x6fb2ff, atmo: 0x5aa2ff, info: 'Города · дроны · «Титан»' },
  { id: 'moon', name: 'Луна', type: 'moon', R: 115, parent: 'earth', orbit: 1700, angle: 1.0, c1: 0xb0b0ac, c2: 0x7a7a78, c3: 0x4a4a4c, info: 'Низкая гравитация · тайник' },
  { id: 'mars', name: 'Марс', type: 'mars', R: 240, orbit: 35000, angle: 5.3, c1: 0xc4643c, c2: 0x8a3a22, c3: 0x5a2a1a, atmo: 0xffa070, info: 'Олимп · треноги · бури' },
  { id: 'jupiter', name: 'Юпитер', type: 'jupiter', R: 1900, orbit: 56000, angle: 1.25, c1: 0xdcc09a, c2: 0xa87850, c3: 0xf4e6d0, atmo: 0xffe0b0, info: 'Газовый гигант · вихрь' },
  { id: 'saturn', name: 'Сатурн', type: 'saturn', R: 1600, orbit: 76000, angle: 3.05, c1: 0xe8d6a8, c2: 0xc8a870, c3: 0xf2e6c8, ring: [2050, 3700], atmo: 0xffe8c0, tilt: 0.45, info: 'Кольца · ледяной астероид' },
  { id: 'uranus', name: 'Уран', type: 'uranus', R: 850, orbit: 96000, angle: 5.0, c1: 0xa4e4ec, c2: 0x86ccd8, c3: 0xcdf4f8, atmo: 0xa0f0ff, tilt: 1.7, ring: [1200, 1550], info: 'Алмазный дождь' },
  { id: 'neptune', name: 'Нептун', type: 'neptune', R: 820, orbit: 116000, angle: 0.25, c1: 0x3456cc, c2: 0x2140a0, c3: 0x7090ff, atmo: 0x5080ff, info: 'Ураганы · Страж Бури' },
];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class SpaceWorld {
  constructor(game) {
    this.game = game; this.kind = 'space'; this.id = 'space'; this.name = 'Открытый космос';
    this.cfg = { sky: { space: 1 } };
    this.scene = new THREE.Scene();
    this.gravity = 0; this.waterLevel = null; this.terrain = null; this.enemies = null;
    this.groundAt = () => -1e9;
    this.time = 0;
    this.target = null;

    // background: milky way + stars
    const bg = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
      vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>\n${NOISE3}\nvarying vec3 vD;
        void main(){\n#include <logdepthbuf_fragment>\n vec3 d = normalize(vD);
          vec3 gp = normalize(vec3(0.3, 1.0, 0.2));
          float band = exp(-pow(dot(d, gp) * 4.0, 2.0));
          float n = fbm3(d * 4.0) * 0.5 + 0.5; float n2 = fbm3(d * 12.0 + 3.0) * 0.5 + 0.5;
          float dust = smoothstep(0.45, 0.7, fbm3(d * 7.0 + 9.0) * 0.5 + 0.5);
          vec3 c = vec3(0.0015, 0.002, 0.006);
          c += band * (vec3(0.05, 0.045, 0.06) * n + vec3(0.07, 0.05, 0.04) * n2 * n) * (1.0 - dust * 0.7);
          c += vec3(0.02, 0.008, 0.03) * smoothstep(0.55, 0.8, fbm3(d * 2.0 + 20.0) * 0.5 + 0.5);
          c += vec3(0.0, 0.012, 0.025) * smoothstep(0.55, 0.85, fbm3(d * 2.5 - 11.0) * 0.5 + 0.5);
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false,
    }));
    bg.scale.setScalar(1.6e6); bg.renderOrder = -10; bg.frustumCulled = false;
    this.bg = bg;
    this.scene.add(bg);
    const sg = new THREE.BufferGeometry();
    const N = 9000, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    const r = mulberry32(5);
    for (let i = 0; i < N; i++) {
      const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      sp.set([s * Math.cos(t) * 1.4e6, u * 1.4e6, s * Math.sin(t) * 1.4e6], i * 3);
      const k = Math.pow(r(), 3) * 1.6 + 0.25, tint = r();
      sc.set([k * (tint < 0.2 ? 1 : 0.85 + tint * 0.15), k * 0.92, k * (tint > 0.8 ? 1.25 : 1)], i * 3);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    this.scene.add(this.stars);

    // sun
    this.sunMat = makeSunMaterial();
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 96, 64), this.sunMat);
    this.scene.add(this.sun);
    const glowTex = makeGlowTexture('rgba(255,250,230,1)', 'rgba(255,170,60,0.4)');
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(2.2, 1.6, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    corona.scale.setScalar(SUN_R * 7);
    const corona2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.6, 0.35, 0.15), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    corona2.scale.setScalar(SUN_R * 22);
    this.scene.add(corona, corona2);
    this.light = new THREE.PointLight(0xfff2e0, 3.2, 0, 0);
    this.scene.add(this.light);
    this.scene.add(new THREE.AmbientLight(0x223355, 0.35));

    // planets
    this.planets = PLANETS.map((p) => this._makePlanet(p));
    for (const p of this.planets) {
      if (p.def.parent) {
        const par = this.planets.find((q) => q.def.id === p.def.parent);
        p.pos.copy(par.pos).add(_v.set(Math.cos(p.def.angle) * p.def.orbit, 120, Math.sin(p.def.angle) * p.def.orbit));
        p.group.position.copy(p.pos);
      }
    }
    // orbit lines
    const om = new THREE.LineBasicMaterial({ color: 0x3a5a9a, transparent: true, opacity: 0.18, depthWrite: false });
    for (const p of PLANETS) {
      if (p.parent) continue;
      const pts = [];
      for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit)); }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), om));
    }
    // asteroid belt
    const belt = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x7a6e62, roughness: 0.95, flatShading: true }), 3000);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    for (let i = 0; i < 3000; i++) {
      const a = r() * Math.PI * 2, rad = 43000 + r() * 6000 + Math.sin(a * 7) * 600;
      pp.set(Math.cos(a) * rad, (r() - 0.5) * 900, Math.sin(a) * rad);
      q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      const k = 4 + Math.pow(r(), 4) * 70;
      s.set(k, k * (0.6 + r() * 0.5), k * (0.7 + r() * 0.5));
      belt.setMatrixAt(i, m.compose(pp, q, s));
    }
    belt.computeBoundingSphere();
    this.belt = belt;
    this.scene.add(belt);
    // comets
    this.comets = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(30, 1), new THREE.MeshStandardMaterial({ color: 0xcfd8e0, roughness: 0.6, flatShading: true })));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(260, 9000, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.7, 1.0), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      tail.rotation.x = Math.PI / 2; tail.position.z = 4500;
      const tailHolder = new THREE.Group(); tailHolder.add(tail); g.add(tailHolder);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.8, 1.2, 1.6), blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(900); g.add(sp);
      this.scene.add(g);
      this.comets.push({ g, tailHolder, a: rand(0, 6.28), r: rand(30000, 90000), sp: rand(0.004, 0.01), y: rand(-6000, 6000) });
    }
  }

  _makePlanet(def) {
    const g = new THREE.Group();
    const pos = new THREE.Vector3(Math.cos(def.angle) * def.orbit, 0, Math.sin(def.angle) * def.orbit);
    g.position.copy(pos);
    const tiltG = new THREE.Group(); tiltG.rotation.z = def.tilt ?? 0.2; g.add(tiltG);
    const mat = makePlanetMaterial(def.type, { c1: def.c1, c2: def.c2, c3: def.c3, seed: def.R * 0.01, amb: 0.015 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.R, 128, 96), mat);
    tiltG.add(mesh);
    const mats = [mat];
    if (def.atmo) {
      const am = makeAtmoMaterial(def.atmo, def.type === 'venus' ? 1.6 : 1.1);
      tiltG.add(new THREE.Mesh(new THREE.SphereGeometry(def.R * 1.035, 96, 64), am));
      mats.push(am);
    }
    let ringMat = null;
    if (def.ring) {
      ringMat = makeRingMaterial(def.ring[0], def.ring[1], def.id === 'uranus' ? 0x8090a0 : 0xc8b890, def.id === 'uranus' ? 0xb0c8d8 : 0xf0e2c0, def.id === 'uranus' ? 0.35 : 0.95);
      ringMat.uniforms.uR.value = def.R;
      const ring = new THREE.Mesh(new THREE.RingGeometry(def.ring[0], def.ring[1], 192, 6), ringMat);
      ring.rotation.x = -Math.PI / 2;
      tiltG.add(ring);
      mats.push(ringMat);
    }
    this.scene.add(g);
    return { def, group: g, mesh, pos, mats, ringMat };
  }

  planet(id) { return this.planets.find((p) => p.def.id === id); }

  // max speed near bodies (makes planets "grow" gradually)
  speedLimit(p) {
    let d = p.length() - SUN_R;
    for (const pl of this.planets) d = Math.min(d, pl.pos.distanceTo(p) - pl.def.R);
    return Math.max(70, d * 1.3);
  }

  solarFactor(p) {
    const d = p.length() / 26000;
    return clamp(1 / (d * d), 0.08, 25);
  }

  raycast() { return null; }
  damageArea() { return 0; }
  freezeAt() {}

  // place the hero near a planet after leaving its surface
  spawnFrom(id, player, cam) {
    const pl = this.planet(id);
    const toSun = _v.copy(pl.pos).negate().normalize();
    const side = _v2.crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize();
    const n = toSun.clone().multiplyScalar(0.55).addScaledVector(side, 0.65).add(new THREE.Vector3(0, 0.5, 0)).normalize();
    const p = pl.pos.clone().addScaledVector(n, pl.def.R * 1.12 + 40);
    const fwd = n.clone().addScaledVector(side, 0.6).normalize();
    player.reset(p, fwd.clone().multiplyScalar(120));
    // look back over the shoulder at the planet
    const look = _v.copy(pl.pos).sub(p).normalize().lerp(fwd, 0.55).normalize();
    player.yaw = Math.atan2(-look.x, -look.z);
    player.pitch = Math.asin(clamp(look.y, -1, 1));
    this.lastPlanet = id;
  }

  setXray() {}

  update(dt, cam) {
    this.time += dt;
    const P = this.game.player;
    this.bg.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.sunMat.uniforms.uTime.value = this.time;
    for (const p of this.planets) {
      p.mesh.rotation.y += dt * 0.01;
      for (const m of p.mats) {
        if (m.uniforms.uSunPos) m.uniforms.uSunPos.value.set(0, 0, 0);
        if (m.uniforms.uTime) m.uniforms.uTime.value = this.time;
        if (m.uniforms.uCenter) m.uniforms.uCenter.value.copy(p.pos);
      }
    }
    for (const c of this.comets) {
      c.a += dt * c.sp * 0.05;
      c.g.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r * 0.6);
      c.tailHolder.lookAt(_v.copy(c.g.position).multiplyScalar(2));
    }
    // sun: recharge + overcharge
    const ds = P.pos.length();
    if (ds < SUN_R * 1.6) {
      if (P.overcharge <= 0) this.game.toast('СОЛНЕЧНАЯ ПЕРЕГРУЗКА! Сила ×1.5, энергия бесконечна на 60 секунд', true);
      P.overcharge = 60;
      this.game.reentry = Math.max(this.game.reentry, 0.6);
    }
    if (ds < SUN_R * 1.08) { P.pos.setLength(SUN_R * 1.08); P.vel.multiplyScalar(0.5); }
    // approaching planets
    let entering = null;
    for (const p of this.planets) {
      const d = p.pos.distanceTo(P.pos) - p.def.R;
      if (p.def.atmo && d < p.def.R * 0.25) this.game.reentry = Math.max(this.game.reentry, 1 - d / (p.def.R * 0.25));
      if (d < Math.max(8, p.def.R * 0.025)) entering = p;
    }
    if (entering) this.game.enterPlanet(entering.def.id, entering.pos);
    // autopilot
    if (P.autopilot && this.target) {
      const to = _v.copy(this.target.pos).sub(P.pos);
      const want = to.normalize();
      P.yaw = Math.atan2(-want.x, -want.z);
      P.pitch = THREE.MathUtils.lerp(P.pitch, Math.asin(clamp(want.y, -1, 1)), 0.2);
    }
  }

  dispose() {}
}
