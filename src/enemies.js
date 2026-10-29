import * as THREE from 'three';
import { rand, clamp, damp, randDir, UP } from './util.js';

// ---------- material helpers ----------
const MATS = [];
const metal = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.75, ...o }); MATS.push(m); return m; };
const glow = (c, k = 3) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }); MATS.push(m); return m; };
const M = {};
function mats() {
  if (M.ok) return M;
  M.ok = true;
  M.dark = metal(0x2a2e36); M.steel = metal(0x6a7280); M.red = glow(0xff2020, 4); M.orange = glow(0xff7a20, 3);
  M.green = glow(0x40ff60, 3.5); M.cyan = glow(0x50e0ff, 3); M.grey = metal(0x9aa0a8, { roughness: 0.5 });
  M.olive = metal(0x4a5040, { roughness: 0.6 }); M.bronze = metal(0x8a5a30, { roughness: 0.45 }); M.alien = metal(0x3a2a40, { roughness: 0.3, metalness: 0.9 });
  M.rock = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.95, flatShading: true }); MATS.push(M.rock);
  M.lava = glow(0xff5a10, 3);
  M.jelly = new THREE.MeshStandardMaterial({ color: 0xff70c0, emissive: 0xa02080, emissiveIntensity: 1.4, transparent: true, opacity: 0.6, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }); MATS.push(M.jelly);
  M.crystal = new THREE.MeshStandardMaterial({ color: 0x9fefff, emissive: 0x2aa8ff, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.3, flatShading: true }); MATS.push(M.crystal);
  M.wisp = glow(0xffc070, 4);
  M.ice = new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1, emissive: 0x2a6080, flatShading: true });
  return M;
}
export function setXray(on) { for (const m of MATS) { m.depthTest = !on; } }

const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };

// ---------- builders ----------
function buildDrone(body, accent, sc = 1) {
  const g = new THREE.Group(), m = mats();
  const prof = [[0.01, -0.55], [1.1, -0.35], [2.0, -0.05], [1.5, 0.3], [0.7, 0.62], [0.01, 0.72]].map(([a, b]) => new THREE.Vector2(a, b));
  add(g, new THREE.LatheGeometry(prof, 20), body);
  const ring = add(g, new THREE.TorusGeometry(1.85, 0.07, 6, 32), accent); ring.rotation.x = Math.PI / 2;
  add(g, new THREE.SphereGeometry(0.42, 12, 8), accent, 0, -0.1, 1.45);
  const dome = add(g, new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.steel, 0, 0.55, 0);
  dome.scale.y = 0.7;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const fin = add(g, new THREE.BoxGeometry(0.12, 0.9, 1.0), body, Math.cos(a) * 1.6, -0.45, Math.sin(a) * 1.6);
    fin.rotation.y = -a;
  }
  g.scale.setScalar(sc);
  return g;
}

function buildMech() {
  const g = new THREE.Group(), m = mats();
  const rig = { legs: [] };
  const hips = add(g, new THREE.BoxGeometry(9, 4, 7), m.dark, 0, 18, 0);
  for (const s of [-1, 1]) {
    const th = new THREE.Object3D(); th.position.set(s * 5.2, 18, 0); g.add(th);
    add(th, new THREE.BoxGeometry(3.4, 10, 3.6), m.steel, 0, -5, 0);
    add(th, new THREE.SphereGeometry(2.2, 12, 10), m.dark);
    const kn = new THREE.Object3D(); kn.position.set(0, -10, 0); th.add(kn);
    add(kn, new THREE.SphereGeometry(1.8, 10, 8), m.dark);
    add(kn, new THREE.BoxGeometry(2.8, 8.5, 3), m.steel, 0, -4.4, -0.4);
    add(kn, new THREE.BoxGeometry(4.5, 1.6, 7), m.dark, 0, -8.6, 0.8);
    rig.legs.push({ th, kn, s });
  }
  const torso = new THREE.Group(); torso.position.y = 20; g.add(torso); rig.torso = torso;
  add(torso, new THREE.BoxGeometry(13, 9, 9), m.steel, 0, 5, 0);
  add(torso, new THREE.BoxGeometry(10, 5, 2), m.dark, 0, 6.5, 4.8);
  add(torso, new THREE.BoxGeometry(7, 1.2, 0.5), m.red, 0, 7.6, 5.9);
  const core = add(torso, new THREE.CylinderGeometry(1.4, 1.4, 0.6, 16), m.orange, 0, 3.4, 4.7); core.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const pod = add(torso, new THREE.BoxGeometry(3.5, 3.5, 6), m.dark, s * 8.2, 9, -0.5);
    for (let i = 0; i < 4; i++) add(pod, new THREE.CylinderGeometry(0.35, 0.35, 0.2, 8), m.red, (i % 2 - 0.5) * 1.4, ((i / 2 | 0) - 0.5) * 1.4, 3.05).rotation.x = Math.PI / 2;
    const arm = add(torso, new THREE.BoxGeometry(2.6, 7, 2.6), m.steel, s * 8.2, 3, 0);
    const gun = add(torso, new THREE.CylinderGeometry(0.8, 1.1, 6, 10), m.dark, s * 8.2, 0, 3); gun.rotation.x = Math.PI / 2;
    add(torso, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8), m.orange, s * 8.2, 0, 6.1).rotation.x = Math.PI / 2;
  }
  add(torso, new THREE.CylinderGeometry(0.15, 0.15, 6, 5), m.grey, 3, 12.5, -2);
  rig.eye = core;
  g.userData.rig = rig;
  return g;
}

function buildTripod() {
  const g = new THREE.Group(), m = mats();
  const head = new THREE.Group(); head.position.y = 30; g.add(head);
  const dome = add(head, new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.bronze);
  dome.scale.y = 0.6;
  add(head, new THREE.CylinderGeometry(6.4, 5, 2, 24), m.dark, 0, -0.8, 0);
  const eye = add(head, new THREE.SphereGeometry(1.3, 14, 10), m.green, 0, -0.2, 6);
  const cannon = add(head, new THREE.CylinderGeometry(0.5, 0.9, 4, 10), m.dark, 0, -2.5, 4.5); cannon.rotation.x = Math.PI / 2.4;
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const hip = new THREE.Object3D(); hip.position.set(Math.cos(a) * 3.5, -1.5, Math.sin(a) * 3.5); hip.rotation.y = -a + Math.PI / 2; head.add(hip);
    const up = new THREE.Object3D(); hip.add(up);
    add(up, new THREE.CylinderGeometry(0.6, 0.8, 17, 8), m.bronze, 0, -8.5, 0);
    const kn = new THREE.Object3D(); kn.position.y = -17; up.add(kn);
    add(kn, new THREE.SphereGeometry(1.1, 10, 8), m.dark);
    add(kn, new THREE.CylinderGeometry(0.3, 0.6, 16, 8), m.bronze, 0, -8, 0);
    legs.push({ up, kn, a });
  }
  for (let i = 0; i < 5; i++) {
    const t = add(head, new THREE.TorusGeometry(2 + i * 0.3, 0.12, 4, 16, Math.PI), m.dark, 0, -2 - i * 0.6, -2);
    t.rotation.x = Math.PI / 2;
  }
  g.userData.rig = { head, legs, eye };
  return g;
}

function buildGolem() {
  const g = new THREE.Group(), m = mats();
  const core = add(g, new THREE.IcosahedronGeometry(2.0, 0), m.lava, 0, 4.5, 0);
  const body = new THREE.Group(); g.add(body);
  for (let i = 0; i < 9; i++) {
    const r = add(body, new THREE.IcosahedronGeometry(rand(1.0, 1.6), 0), m.rock, rand(-1.6, 1.6), 4.5 + rand(-1.6, 1.8), rand(-1.4, 1.4));
    r.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Object3D(); sh.position.set(s * 2.6, 5.5, 0); g.add(sh);
    add(sh, new THREE.IcosahedronGeometry(1.1, 0), m.rock, 0, -1.2, 0);
    add(sh, new THREE.IcosahedronGeometry(1.3, 0), m.rock, 0, -3, 0.3);
    add(sh, new THREE.IcosahedronGeometry(0.5, 0), m.lava, 0, -2.1, 0.5);
    arms.push(sh);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Object3D(); hp.position.set(s * 1.2, 2.6, 0); g.add(hp);
    add(hp, new THREE.IcosahedronGeometry(1.0, 0), m.rock, 0, -1.4, 0);
    legs.push(hp);
  }
  add(g, new THREE.SphereGeometry(0.3, 6, 4), m.lava, -0.5, 6.6, 1.4);
  add(g, new THREE.SphereGeometry(0.3, 6, 4), m.lava, 0.5, 6.6, 1.4);
  g.userData.rig = { arms, legs, core };
  return g;
}

function buildJelly() {
  const g = new THREE.Group(), m = mats();
  const bell = add(g, new THREE.SphereGeometry(6, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), m.jelly);
  bell.scale.y = 0.75; bell.castShadow = false;
  add(g, new THREE.SphereGeometry(2.2, 14, 10), glow(0xff9ae0, 2.5), 0, 1.2, 0);
  const tents = [];
  const tm = new THREE.LineBasicMaterial({ color: new THREE.Color(0xff8ad8).multiplyScalar(2), transparent: true, opacity: 0.8 });
  for (let i = 0; i < 10; i++) {
    const pts = []; for (let k = 0; k < 14; k++) pts.push(new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, tm);
    line.frustumCulled = false;
    g.add(line);
    tents.push({ line, a: (i / 10) * Math.PI * 2, r: 3 + (i % 3) });
  }
  g.userData.rig = { bell, tents };
  return g;
}

function buildCrystal(sc = 1) {
  const g = new THREE.Group(), m = mats();
  const parts = [];
  const c = add(g, new THREE.OctahedronGeometry(1.6, 0), m.crystal); c.scale.y = 1.8; parts.push(c);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = add(g, new THREE.OctahedronGeometry(0.7, 0), m.crystal, Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
    s.scale.y = 1.6; parts.push(s);
  }
  g.scale.setScalar(sc);
  g.userData.rig = { parts };
  return g;
}

function buildWisp() {
  const g = new THREE.Group(), m = mats();
  add(g, new THREE.SphereGeometry(1.1, 14, 10), m.wisp).castShadow = false;
  add(g, new THREE.SphereGeometry(1.9, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 0.1), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })).castShadow = false;
  return g;
}

export const TYPES = {
  drone: { name: 'Дрон-захватчик', hp: 45, radius: 2.4, ai: 'flyer', speed: 60, orbit: 90, range: 320, fire: 1.5, proj: { color: 0xff3030, speed: 190, dmg: 4, size: 0.5 }, build: () => buildDrone(mats().dark, mats().red), metal: 0x40444c, cityAttack: true },
  sentinel: { name: 'Лунный страж', hp: 60, radius: 2.6, ai: 'flyer', speed: 50, orbit: 110, range: 340, fire: 1.8, proj: { color: 0x40ff80, speed: 170, dmg: 5, size: 0.6 }, build: () => buildDrone(mats().grey, mats().green, 1.2), metal: 0x9aa0a8 },
  pirate: { name: 'Пират колец', hp: 55, radius: 2.4, ai: 'flyer', speed: 75, orbit: 100, range: 330, fire: 1.3, proj: { color: 0xff8a20, speed: 210, dmg: 5, size: 0.5 }, build: () => buildDrone(mats().olive, mats().orange, 1.1), metal: 0x4a5040 },
  drone_m: { name: 'Марсианский разведчик', hp: 50, radius: 2.4, ai: 'flyer', speed: 55, orbit: 100, range: 300, fire: 1.7, proj: { color: 0x40ff60, speed: 180, dmg: 4, size: 0.5 }, build: () => buildDrone(mats().bronze, mats().green, 1.0), metal: 0x8a5a30 },
  mech: { name: 'Боевой робот «Титан»', hp: 2600, radius: 9, height: 32, ai: 'walker', speed: 9, boss: true, heavy: true, build: buildMech, metal: 0x5a6270, crush: true },
  tripod: { name: 'Марсианская тренога', hp: 1100, radius: 7, height: 30, ai: 'walker', speed: 12, heavy: true, mini: true, build: buildTripod, metal: 0x8a5a30, crush: true },
  golem: { name: 'Лавовый голем', hp: 180, radius: 3.2, height: 7, ai: 'walker', speed: 8, build: buildGolem, metal: 0x241a16, lob: true },
  jelly: { name: 'Облачная медуза', hp: 160, radius: 6, ai: 'floater', speed: 14, build: buildJelly, metal: 0xff70c0, zap: true },
  crystal: { name: 'Ледяной кристаллоид', hp: 80, radius: 2.6, ai: 'flyer', speed: 70, orbit: 80, range: 300, fire: 1.4, proj: { color: 0x80e8ff, speed: 200, dmg: 5, size: 0.6, ice: true }, build: () => buildCrystal(1), metal: 0x9fefff },
  warden: { name: 'Страж Бури', hp: 3400, radius: 14, ai: 'flyer', speed: 35, orbit: 170, range: 600, fire: 2.2, volley: 9, boss: true, heavy: true, proj: { color: 0x9fd8ff, speed: 160, dmg: 6, size: 1.2, ice: true }, build: () => buildCrystal(6), metal: 0x9fefff },
  wisp: { name: 'Солнечный дух', hp: 35, radius: 1.8, ai: 'kamikaze', speed: 85, build: buildWisp, metal: 0xffa040, fireTrail: true },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

class Enemy {
  constructor(mgr, type, pos) {
    this.mgr = mgr; this.type = type;
    const d = this.def = TYPES[type];
    this.obj = d.build();
    this.obj.position.copy(pos);
    this.pos = this.obj.position;
    this.vel = new THREE.Vector3();
    this.hp = this.maxHp = d.hp;
    this.radius = d.radius;
    this.height = d.height ?? 0;
    this.boss = !!d.boss; this.name = d.name;
    this.center = new THREE.Vector3();
    this.frozen = 0; this.freezeAcc = 0;
    this.state = 'normal'; this.tumble = 0;
    this.fireT = rand(1.5, 3.5); this.orbitA = rand(0, Math.PI * 2); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.t = rand(0, 10); this.alive = true;
    this.beamT = 0; this.beamCD = rand(3, 6); this.salvoT = 4; this.beamDir = new THREE.Vector3(0, 0, 1);
    this.hitR = this.height ? Math.max(this.radius, this.height * 0.45) : this.radius;
    const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(this.hitR * 1.25, 1), mats().ice);
    if (this.height) ice.position.y = this.height * 0.5;
    ice.visible = false;
    this.obj.add(ice);
    this.ice = ice;
    this.updCenter();
  }

  updCenter() {
    this.center.copy(this.pos);
    if (this.height) this.center.y += this.height * 0.55;
  }

  get world() { return this.mgr.world; }

  hit(dmg, dir, knock = 0, opts = {}) {
    if (!this.alive) return;
    const fx = this.world.game.fx;
    if (this.frozen > 0 && !opts.heat) {
      dmg *= 2.5;
      if (!this.boss && dmg > 25) { fx.debrisBurst(this.center, 18, 0xbfefff, 25, 0.8, 8); fx.sparks(this.center, 20, [1.5, 3, 4], 30); dmg = 9999; }
    }
    if (opts.heat && this.frozen > 0) { this.frozen = Math.max(0, this.frozen - 0.1); }
    this.hp -= dmg;
    this.flash = 0.12;
    if (knock > 0 && !this.def.heavy && this.state !== 'grabbed') {
      this.state = 'tumble'; this.tumble = 1.4;
      this.vel.copy(dir).multiplyScalar(knock); this.vel.y += knock * 0.25;
      this.spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    }
    if (this.hp <= 0) this.die();
  }

  freeze(amount) {
    if (!this.alive) return;
    this.freezeAcc += amount * (this.boss ? 0.25 : 1);
    if (this.freezeAcc >= 1) {
      this.freezeAcc = 0;
      if (this.frozen <= 0) this.world.game.fx.burst(this.center, 20, { spd: 8, c0: [0.8, 0.95, 1], s0: 1.5, s1: 3, l0: 0.6, l1: 1.2, a: 0.6 });
      this.frozen = this.boss ? 2.5 : 7;
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    const fx = this.world.game.fx;
    const s = this.boss ? 4 : this.def.heavy ? 3 : 1.3;
    fx.explosion(this.center, s, this.type === 'crystal' || this.type === 'warden' ? [1.5, 3, 4] : null);
    fx.debrisBurst(this.center, this.boss ? 70 : 16, this.def.metal, 25 * s, this.boss ? 2.5 : 0.7, 15);
    this.world.game.audio.boom(Math.min(1.3, 0.5 + s * 0.2), this.center);
    this.world.game.shake(this.boss ? 1 : 0.25, this.center);
    this.mgr.onKill(this);
  }

  update(dt) {
    this.t += dt;
    const w = this.world, P = w.game.player;
    if (this.flash > 0) this.flash -= dt;
    this.ice.visible = this.frozen > 0;
    if (this.frozen > 0) this.frozen -= dt;

    if (this.state === 'grabbed') { this.updCenter(); return; }
    if (this.state === 'thrown') { this._thrown(dt); this.updCenter(); return; }
    if (this.state === 'tumble') {
      this.tumble -= dt;
      this.vel.multiplyScalar(Math.max(0, 1 - 0.8 * dt));
      this.vel.y -= Math.max(w.gravity, 4) * dt * 0.5;
      this.pos.addScaledVector(this.vel, dt);
      this.obj.rotation.x += this.spin.x * dt; this.obj.rotation.z += this.spin.z * dt;
      this._collide(this.vel.length() * 0.6, false);
      if (this.tumble <= 0) { this.state = 'normal'; this.obj.rotation.set(0, this.obj.rotation.y, 0); }
      this.updCenter();
      return;
    }
    if (this.frozen > 0) {
      if (this.def.ai !== 'walker' && w.gravity > 0) {
        this.vel.y -= w.gravity * dt * 2;
        this.pos.addScaledVector(this.vel, dt);
        const g = w.groundAt(this.pos.x, this.pos.z);
        if (this.pos.y - this.radius < g) { this.pos.y = g + this.radius; this.hit(40, UP, 0); }
      }
      this.updCenter();
      return;
    }
    const ai = this.def.ai;
    if (ai === 'flyer') this._flyer(dt, P);
    else if (ai === 'kamikaze') this._kamikaze(dt, P);
    else if (ai === 'walker') this._walker(dt, P);
    else if (ai === 'floater') this._floater(dt, P);
    this.updCenter();
  }

  _avoidGround(min = 15) {
    const g = this.world.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < g + min) { this.vel.y += (g + min - this.pos.y) * 0.8; this.pos.y = Math.max(this.pos.y, g + 2); }
    const wl = this.world.waterLevel;
    if (wl != null && this.pos.y < wl + 6) this.vel.y += 10;
  }

  _flyer(dt, P) {
    const d = this.def;
    this.orbitA += dt * 0.35 * this.orbitDir * (60 / d.orbit);
    const tgt = _v.copy(P.pos);
    tgt.x += Math.cos(this.orbitA) * d.orbit; tgt.z += Math.sin(this.orbitA) * d.orbit;
    tgt.y += 25 + Math.sin(this.t * 0.7) * 20;
    const st = _v2.copy(tgt).sub(this.pos);
    const dist = st.length();
    st.normalize().multiplyScalar(d.speed * Math.min(1, dist / 40) * 1.4);
    this.vel.lerp(st, 1 - Math.exp(-dt * 1.5));
    if (this.vel.length() > d.speed * 1.5) this.vel.setLength(d.speed * 1.5);
    this._avoidGround();
    this.pos.addScaledVector(this.vel, dt);
    const toP = _v3.copy(P.pos).sub(this.pos);
    const pd = toP.length();
    // face the hero
    this.obj.lookAt(P.pos);
    if (this.type === 'crystal' || this.type === 'warden') {
      const rig = this.obj.userData.rig;
      rig.parts.forEach((p, i) => { p.rotation.y += dt * (i ? 3 : 1); });
      this.obj.rotation.y = this.t;
    } else this.obj.rotateZ(Math.sin(this.t * 2) * 0.15);
    this.fireT -= dt;
    if (this.fireT <= 0 && pd < d.range) {
      this.fireT = d.fire * rand(0.8, 1.3);
      let target = P.pos;
      if (d.cityAttack && Math.random() < 0.3 && this.world.terrain) {
        let pickS = null;
        this.world.terrain.forStructsNear(this.pos.x, this.pos.z, 200, (s) => { if (!pickS && s.type === 'box' && Math.random() < 0.1) pickS = s; });
        if (pickS) target = new THREE.Vector3(pickS.x, pickS.y0 + pickS.h * rand(0.3, 0.9), pickS.z);
      }
      const n = d.volley ?? 1;
      for (let i = 0; i < n; i++) {
        const lead = _v2.copy(target);
        if (target === P.pos) lead.addScaledVector(P.vel, pd / d.proj.speed * 0.8);
        const dir = lead.sub(this.pos).normalize();
        if (n > 1) dir.add(randDir(_v3).multiplyScalar(0.12)).normalize();
        this.mgr.shoot(this.pos, dir, d.proj, 'enemy');
      }
      this.world.game.audio.zap(this.pos, d.proj.ice ? 1600 : 900);
    }
  }

  _kamikaze(dt, P) {
    const toP = _v.copy(P.pos).sub(this.pos);
    const dist = toP.length();
    toP.normalize().multiplyScalar(this.def.speed);
    this.vel.lerp(toP, 1 - Math.exp(-dt * 1.2));
    this._avoidGround(5);
    this.pos.addScaledVector(this.vel, dt);
    this.world.game.fx.fire(this.pos, 1.6, 1);
    if (dist < 4) {
      P.damage(9, this.pos);
      this.die();
    }
  }

  _floater(dt, P) {
    const toP = _v.copy(P.pos).sub(this.pos);
    const dist = toP.length();
    if (dist > 45) this.vel.lerp(toP.normalize().multiplyScalar(this.def.speed), 1 - Math.exp(-dt * 0.5));
    else this.vel.multiplyScalar(0.98);
    this.vel.y += Math.sin(this.t * 1.3) * 2 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const rig = this.obj.userData.rig;
    const pulse = 1 + Math.sin(this.t * 3) * 0.08;
    rig.bell.scale.set(pulse, 0.75 / pulse, pulse);
    for (const tn of rig.tents) {
      const pa = tn.line.geometry.attributes.position;
      for (let k = 0; k < 14; k++) {
        const y = -k * 1.6;
        const sw = Math.sin(this.t * 2 + k * 0.5 + tn.a) * k * 0.15;
        pa.setXYZ(k, Math.cos(tn.a) * (tn.r + sw), y, Math.sin(tn.a) * (tn.r + sw));
      }
      pa.needsUpdate = true;
    }
    this.fireT -= dt;
    if (dist < 85 && this.fireT <= 0) {
      this.fireT = 2.4;
      this.world.game.fx.bolt(this.center, P.pos, 0xff9ae0, 0.3, 0.1);
      this.world.game.audio.zap(this.pos, 2400);
      P.damage(7, this.pos);
    }
  }

  _walker(dt, P) {
    const w = this.world, d = this.def, rig = this.obj.userData.rig;
    const toP = _v.copy(P.pos).sub(this.pos); toP.y = 0;
    const dist = toP.length();
    const keep = this.type === 'golem' ? 25 : 70;
    let moving = false;
    if (dist > keep) {
      toP.normalize();
      this.pos.addScaledVector(toP, d.speed * dt);
      moving = true;
    }
    const g = w.groundAt(this.pos.x, this.pos.z);
    this.pos.y = Math.max(g, w.waterLevel != null ? w.waterLevel - this.height * 0.3 : -1e9);
    const yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    let dy = yaw - this.obj.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.obj.rotation.y += dy * Math.min(1, dt * 1.5);
    const ph = this.t * (moving ? d.speed * 0.25 : 0.5);
    // crush buildings in our path
    if (d.crush && w.terrain && moving) {
      w.terrain.forStructsNear(this.pos.x, this.pos.z, this.radius, (s) => {
        if (s.y0 < this.pos.y + this.height) w.terrain.damageStruct(s, 900 * dt, _v2.set(s.x, Math.min(s.y0 + s.h, this.pos.y + this.height * 0.6), s.z), toP);
      });
      w.terrain.flattenTrees(this.pos.x, this.pos.z, this.radius * 1.2, false);
    }
    if (this.type === 'mech') {
      rig.legs.forEach((l, i) => {
        const s = Math.sin(ph + i * Math.PI);
        l.th.rotation.x = s * 0.45; l.kn.rotation.x = Math.max(0, -Math.cos(ph + i * Math.PI)) * 0.8;
      });
      rig.torso.rotation.z = Math.sin(ph * 2) * 0.03;
      if (moving && Math.sin(ph) * Math.sin(ph - dt * d.speed * 0.25) < 0) {
        w.game.shake(0.12, this.pos); w.game.fx.dust(this.pos, 6, 8, w.dustColor ?? [0.6, 0.55, 0.5], 5, 2);
      }
      this._mechAttacks(dt, P, dist);
    } else if (this.type === 'tripod') {
      rig.legs.forEach((l, i) => {
        l.up.rotation.x = -0.55 + Math.sin(ph + i * 2.1) * 0.25;
        l.kn.rotation.x = 0.9 + Math.cos(ph + i * 2.1) * 0.2;
      });
      rig.head.position.y = 30 + Math.sin(ph * 2) * 0.6;
      this._beamAttack(dt, P, 0x50ff70, 11, 0.9);
    } else if (this.type === 'golem') {
      rig.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + i * Math.PI) * 0.6; });
      rig.arms.forEach((a, i) => { a.rotation.x = Math.sin(ph + i * Math.PI + 1) * 0.5; });
      this.fireT -= dt;
      if (this.fireT <= 0 && dist < 260) {
        this.fireT = rand(2.5, 4);
        rig.arms[0].rotation.x = -2.5;
        const from = _v2.copy(this.pos); from.y += 8;
        const to = P.pos;
        const T = clamp(dist / 60, 1, 3);
        const vel = new THREE.Vector3((to.x - from.x) / T, 0, (to.z - from.z) / T);
        vel.y = (to.y - from.y) / T + 0.5 * w.gravity * T;
        this.mgr.shoot(from, vel.clone().normalize(), { color: 0xff6a10, speed: vel.length(), dmg: 8, size: 1.2, lava: true }, 'enemy');
      }
    }
  }

  _mechAttacks(dt, P, dist) {
    this.salvoT -= dt;
    if (this.salvoT <= 0 && dist < 700) {
      this.salvoT = rand(4.5, 6);
      for (let i = 0; i < 6; i++) {
        const s = i % 2 ? 1 : -1;
        const from = _v2.set(s * 8.2, 29, -0.5).applyEuler(this.obj.rotation).add(this.pos);
        const dir = new THREE.Vector3(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize();
        this.mgr.shoot(from, dir, { color: 0xffa040, speed: 70, dmg: 7, size: 0.7, homing: 1.6, missile: true }, 'enemy');
      }
    }
    this._beamAttack(dt, P, 0xff3030, 14, 1.3, _v3.set(0, 23.4, 5).applyEuler(this.obj.rotation).add(this.pos));
  }

  _beamAttack(dt, P, color, dps, width, from = null) {
    const w = this.world;
    this.beamCD -= dt;
    const src = from ?? _v3.set(0, 27.5, 6).applyEuler(this.obj.rotation).add(this.pos);
    if (this.beamT <= 0 && this.beamCD <= 0 && src.distanceTo(P.pos) < 500) { this.beamT = 3; this.beamCD = rand(5, 7); this.beamDir.copy(P.pos).sub(src).normalize(); }
    const slot = this.mgr.beamSlot(this);
    if (this.beamT > 0) {
      this.beamT -= dt;
      const want = _v2.copy(P.pos).sub(src).normalize();
      this.beamDir.lerp(want, 1 - Math.exp(-dt * 2.2)).normalize();
      const hit = w.raycast(src, this.beamDir, 700, { noEnemies: true, noWater: true });
      const end = hit ? hit.point : _v2.copy(src).addScaledVector(this.beamDir, 700);
      // player in beam?
      const rel = _v.copy(P.pos).sub(src);
      const along = rel.dot(this.beamDir);
      if (along > 0 && along < src.distanceTo(end) + 2) {
        const perp = rel.addScaledVector(this.beamDir, -along).length();
        if (perp < 2.2) P.damage(dps * dt, src, true);
      }
      if (slot >= 0) w.game.fx.setEnemyBeam(slot, true, src, end, color, width * (0.8 + Math.random() * 0.4));
      if (hit && Math.random() < 0.5) {
        w.game.fx.sparks(end, 2, [3, 2, 1], 20);
        if (hit.kind === 'struct') w.terrain.damageStruct(hit.s, 80 * dt, end, null, { heat: true });
        if (hit.kind === 'ground') w.game.fx.fire(end, 2, 1);
      }
    } else if (slot >= 0) w.game.fx.setEnemyBeam(slot, false);
  }

  _collide(speed, thrown) {
    const w = this.world;
    let hitSomething = false;
    if (w.terrain) {
      const s = w.terrain.structAt(this.pos, this.radius);
      if (s && speed > 15) {
        w.terrain.damageStruct(s, (thrown ? 700 : 150) + speed * 2, this.pos, _v.copy(this.vel).normalize(), { cut: thrown, force: 1.2 });
        this.vel.multiplyScalar(0.5);
        hitSomething = true;
      }
    }
    const g = w.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y - this.radius * 0.5 < g) {
      this.pos.y = g + this.radius * 0.5;
      if (this.vel.y < -12 || thrown) hitSomething = true;
      this.vel.y = Math.abs(this.vel.y) * 0.3;
      this.vel.multiplyScalar(0.6);
    }
    if (hitSomething && !thrown) this.hit(20 + speed * 0.3, UP, 0);
    return hitSomething;
  }

  _thrown(dt) {
    const w = this.world;
    this.vel.y -= Math.max(2, w.gravity) * 0.3 * dt;
    const steps = Math.ceil(this.vel.length() * dt / 3);
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      this.obj.rotation.x += 12 * dt / steps; this.obj.rotation.z += 9 * dt / steps;
      // hit other enemies
      for (const e of this.mgr.list) {
        if (e === this || !e.alive) continue;
        if (e.center.distanceTo(this.pos) < e.hitR + this.radius) { e.hit(150, _v.copy(this.vel).normalize(), 90); this._impact(); return; }
      }
      if (this._collide(this.vel.length(), true) || this.thrownT > 4) { this._impact(); return; }
    }
    this.thrownT = (this.thrownT ?? 0) + dt;
  }

  _impact() {
    const w = this.world;
    w.game.fx.explosion(this.pos, 2);
    w.damageArea(this.pos, 22, 120, { knock: 60, noPlayer: true });
    if (w.terrain?.hasGround && this.pos.y - w.groundAt(this.pos.x, this.pos.z) < 5) w.terrain.addCrater(this.pos.x, this.pos.z, 7, 3);
    this.hp = 0; this.die();
  }
}

export class Enemies {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.projs = [];
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.spawnT = 3;
    this.spawnOn = true;
    this.kills = 0;
    this.onKillCb = null;
    this.beamOwners = [null, null, null, null];
    this.projGeo = new THREE.SphereGeometry(1, 8, 6);
    this.projMats = new Map();
    mats();
  }

  dispose() {
    this.world.scene.remove(this.group);
    for (const p of this.projs) p.mesh.parent?.remove(p.mesh);
    for (const m of this.projMats.values()) m.dispose();
    this.projGeo.dispose();
    this.list.length = 0; this.projs.length = 0;
    for (let i = 0; i < 4; i++) this.world.game.fx.setEnemyBeam(i, false);
  }

  beamSlot(e) {
    let i = this.beamOwners.indexOf(e);
    if (i >= 0) return i;
    i = this.beamOwners.findIndex((o) => !o || !o.alive);
    if (i >= 0) this.beamOwners[i] = e;
    return i;
  }

  spawn(type, pos) {
    const e = new Enemy(this, type, pos);
    this.list.push(e);
    this.group.add(e.obj);
    return e;
  }

  spawnNear(type, dmin = 350, dmax = 650) {
    const P = this.world.game.player.pos;
    const a = rand(0, Math.PI * 2), d = rand(dmin, dmax);
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const g = this.world.groundAt(x, z);
    const def = TYPES[type];
    let y;
    if (def.ai === 'walker') y = g;
    else if (g < -1e8) y = P.y + rand(-60, 120);
    else y = Math.max(g, this.world.waterLevel ?? -1e9) + rand(60, 220);
    return this.spawn(type, new THREE.Vector3(x, y, z));
  }

  onKill(e) {
    this.kills++;
    this.onKillCb?.(e);
    const i = this.beamOwners.indexOf(e);
    if (i >= 0) { this.beamOwners[i] = null; this.world.game.fx.setEnemyBeam(i, false); }
  }

  shoot(from, dir, p, owner) {
    let mat = this.projMats.get(p.color);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(4) }); this.projMats.set(p.color, mat); }
    const mesh = new THREE.Mesh(this.projGeo, mat);
    mesh.position.copy(from);
    const s = p.size ?? 0.5;
    mesh.scale.set(s, s, s * (p.lava ? 1 : 4));
    this.group.add(mesh);
    this.projs.push({ mesh, pos: mesh.position, vel: dir.clone().multiplyScalar(p.speed), p, owner, life: p.lava ? 8 : 5 });
  }

  deflect(pos, dir, r) {
    let n = 0;
    for (const pr of this.projs) {
      if (pr.owner !== 'enemy' || pr.pos.distanceTo(pos) > r) continue;
      pr.owner = 'player';
      const sp = Math.max(150, pr.vel.length() * 1.5);
      pr.vel.copy(dir).multiplyScalar(sp);
      pr.p = { ...pr.p, homing: 0, lava: false, dmg: pr.p.dmg * 8 };
      n++;
    }
    return n;
  }

  nearest(pos, maxD, filter = null) {
    let best = null, bd = maxD;
    for (const e of this.list) {
      if (!e.alive || (filter && !filter(e))) continue;
      const d = e.center.distanceTo(pos) - e.hitR;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(dt) {
    const w = this.world, cfg = w.cfg.enemies;
    if (cfg && this.spawnOn) {
      this.spawnT -= dt;
      const active = this.list.filter((e) => e.alive && !TYPES[e.type].boss && !TYPES[e.type].mini).length;
      if (this.spawnT <= 0 && active < cfg.max) {
        this.spawnT = cfg.interval * rand(0.7, 1.3);
        this.spawnNear(cfg.types[(Math.random() * cfg.types.length) | 0]);
      }
    }
    const P = w.game.player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.alive) {
        e.update(dt);
        // despawn far stragglers
        if (!e.boss && !TYPES[e.type].mini && e.pos.distanceTo(P) > 2500) { e.alive = false; }
      }
      if (!e.alive) { this.group.remove(e.obj); this.list.splice(i, 1); }
    }
    this._updateProjs(dt);
  }

  _updateProjs(dt) {
    const w = this.world, fx = w.game.fx, P = w.game.player;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i], p = pr.p;
      pr.life -= dt;
      if (p.homing && pr.owner === 'enemy') {
        const want = _v.copy(P.pos).sub(pr.pos).normalize().multiplyScalar(pr.vel.length() + dt * 40);
        pr.vel.lerp(want, 1 - Math.exp(-dt * p.homing));
      }
      if (p.lava) pr.vel.y -= w.gravity * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      if (!p.lava) pr.mesh.lookAt(_v.copy(pr.pos).add(pr.vel));
      if (p.missile) fx.burst(pr.pos, 1, { spd: 1, c0: [0.35, 0.33, 0.32], c1: [0.6, 0.6, 0.6], s0: 1, s1: 4, l0: 0.8, l1: 1.6, a: 0.5 });
      if (p.lava) fx.fire(pr.pos, 1.5, 1);
      let boom = false;
      if (pr.owner === 'enemy') {
        if (pr.pos.distanceTo(P.pos) < 1.4 + (p.size ?? 0.5)) { P.damage(p.dmg, pr.pos); boom = true; }
      } else {
        for (const e of this.list) {
          if (e.alive && e.center.distanceTo(pr.pos) < e.hitR + 1) { e.hit(p.dmg, _v.copy(pr.vel).normalize(), 40); boom = true; break; }
        }
      }
      if (!boom && w.terrain) {
        const s = w.terrain.structAt(pr.pos, 0.5);
        if (s) { w.terrain.damageStruct(s, p.dmg * 10, pr.pos, null, { heat: !p.ice }); boom = true; }
      }
      if (!boom && pr.pos.y < w.groundAt(pr.pos.x, pr.pos.z)) boom = true;
      if (!boom && w.waterLevel != null && pr.pos.y < w.waterLevel) { fx.burst(pr.pos, 8, { spd: 6, up: 10, c0: [0.8, 0.9, 1], s0: 1, s1: 3, l0: 0.5, l1: 1, grav: 1, a: 0.7 }); boom = true; }
      if (boom || pr.life <= 0) {
        if (boom) {
          const big = p.missile || p.lava;
          if (big) { fx.explosion(pr.pos, p.lava ? 0.9 : 0.7); w.game.audio.boom(0.35, pr.pos); }
          else fx.sparks(pr.pos, 10, p.ice ? [1.5, 3, 4] : [4, 1.2, 0.6], 25);
          if (big) w.damageArea(pr.pos, 8, 0, { noPlayer: true });
        }
        this.group.remove(pr.mesh);
        this.projs.splice(i, 1);
      }
    }
  }
}
