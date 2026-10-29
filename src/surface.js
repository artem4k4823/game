import * as THREE from 'three';
import { Noise, hash2i } from './noise.js';
import { Terrain } from './terrain.js';
import { Enemies, TYPES } from './enemies.js';
import { WORLD_DEFS } from './worlds.js';
import { makeSkyMaterial, makeWaterMaterial, makeCloudMaterial, makeCloudTexture, makePlanetMaterial, makeAtmoMaterial, makeRingMaterial, VNOISE2, makeGlowTexture } from './shaders.js';
import { clamp, lerp, smoothstep, rand, raySphere, randDir, UP } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
let CLOUD_TEX = null, GLOW_TEX = null;

// ---------------- clouds (instanced billboards on a world grid) ----------------
class CloudLayer {
  constructor(def) {
    this.def = def;
    CLOUD_TEX ??= makeCloudTexture();
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.RC = 7; this.per = 3;
    const max = (this.RC * 2 + 1) ** 2 * this.per;
    this.aCloud = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    geo.setAttribute('aCloud', this.aCloud);
    geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = 0;
    this.mat = makeCloudMaterial();
    this.mat.uniforms.map.value = CLOUD_TEX;
    this.mat.uniforms.uOpacity.value = def.opacity ?? 0.85;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.key = '';
  }
  update(cam, sunDir, lit, shade) {
    const d = this.def, cell = d.cell;
    const ci = Math.floor(cam.position.x / cell), cj = Math.floor(cam.position.z / cell);
    const key = ci + ',' + cj;
    this.mat.uniforms.uSunDir.value.copy(sunDir);
    this.mat.uniforms.uLit.value.copy(lit);
    this.mat.uniforms.uShade.value.copy(shade);
    if (key === this.key) return;
    this.key = key;
    const A = this.aCloud.array, T = this.aTint.array;
    let n = 0;
    for (let a = -this.RC; a <= this.RC; a++) for (let b = -this.RC; b <= this.RC; b++) {
      const i = ci + a, j = cj + b;
      if (hash2i(i, j, 991) > d.cover) continue;
      for (let k = 0; k < this.per; k++) {
        const h1 = hash2i(i, j, 100 + k), h2 = hash2i(i, j, 200 + k), h3 = hash2i(i, j, 300 + k), h4 = hash2i(i, j, 400 + k);
        A[n * 4] = (i + h1) * cell; A[n * 4 + 1] = d.alt + (h3 - 0.5) * d.spread; A[n * 4 + 2] = (j + h2) * cell;
        A[n * 4 + 3] = d.size[0] + (d.size[1] - d.size[0]) * h4;
        const t = d.tint, v = 0.9 + 0.2 * h3;
        T[n * 3] = t[0] * v; T[n * 3 + 1] = t[1] * v; T[n * 3 + 2] = t[2] * v;
        n++;
      }
    }
    this.mesh.geometry.instanceCount = n;
    this.aCloud.needsUpdate = true; this.aTint.needsUpdate = true;
  }
}

// ---------------- weather particles around the camera ----------------
class Weather {
  constructor(def) {
    this.def = def;
    const n = this.n = def.count;
    this.box = def.type === 'wind' ? 220 : 140;
    this.off = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.off[i] = (Math.random() - 0.5) * this.box;
    const lines = def.type === 'rain' || def.type === 'wind';
    this.lines = lines;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * (lines ? 6 : 3));
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const col = new THREE.Color(...def.color);
    if (lines) {
      this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: def.type === 'wind' ? 0.35 : 0.45, depthWrite: false }));
    } else {
      GLOW_TEX ??= makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)');
      this.mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: def.type === 'dust' ? 1.6 : 0.5, map: GLOW_TEX, transparent: true, opacity: def.type === 'dust' ? 0.35 : 0.85, depthWrite: false }));
    }
    this.mesh.frustumCulled = false;
    this.wind = new THREE.Vector3();
  }
  update(dt, cam, windVec, k = 1) {
    const d = this.def, B = this.box, h = B / 2, o = this.off, P = this.pos, cp = cam.position;
    const v = _v.set(0, 0, 0);
    if (d.type === 'rain') v.set(windVec.x * 0.3, -d.speed, windVec.z * 0.3);
    else if (d.type === 'snow') v.set(windVec.x * 0.3 + Math.sin(performance.now() * 0.0005) * 2, -d.speed, windVec.z * 0.3);
    else if (d.type === 'dust') v.set(windVec.x + d.speed, Math.sin(performance.now() * 0.001) * 2, windVec.z + d.speed * 0.4);
    else v.set(windVec.x, 0, windVec.z);
    const len = d.type === 'rain' ? 2.2 : d.type === 'wind' ? 0.08 : 0;
    for (let i = 0; i < this.n; i++) {
      let x = o[i * 3] + v.x * dt, y = o[i * 3 + 1] + v.y * dt, z = o[i * 3 + 2] + v.z * dt;
      // keep particles in a box that moves with the camera
      x = ((x + h) % B + B) % B - h; y = ((y + h) % B + B) % B - h; z = ((z + h) % B + B) % B - h;
      o[i * 3] = x; o[i * 3 + 1] = y; o[i * 3 + 2] = z;
      const ax = cp.x + x - (cp.x % B) * 0, ay = cp.y + y, az = cp.z + z;
      if (this.lines) {
        P[i * 6] = ax; P[i * 6 + 1] = ay; P[i * 6 + 2] = az;
        P[i * 6 + 3] = ax - v.x * len * 0.02 * (d.type === 'wind' ? 12 : 1); P[i * 6 + 4] = ay - v.y * len * 0.02; P[i * 6 + 5] = az - v.z * len * 0.02 * (d.type === 'wind' ? 12 : 1);
      } else { P[i * 3] = ax; P[i * 3 + 1] = ay; P[i * 3 + 2] = az; }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.material.opacity = (this.lines ? (d.type === 'wind' ? 0.35 : 0.45) : d.type === 'dust' ? 0.35 : 0.85) * k;
  }
}

// ---------------- Kryptonian crystal (the collectible artifact) ----------------
class Artifact {
  constructor(world, pos, hidden = false) {
    this.world = world;
    this.pos = pos.clone();
    this.hidden = hidden;
    this.collected = false;
    this.rise = 0;
    const g = this.group = new THREE.Group();
    g.position.copy(pos);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xd8fbff, emissive: 0x30c8ff, emissiveIntensity: 2.5, roughness: 0.1, metalness: 0.2, flatShading: true });
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), this.mat);
    c.scale.set(0.8, 2.4, 0.8);
    g.add(c);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), this.mat);
      s.position.set(Math.cos(i * 2.1) * 2, -1 + i * 0.4, Math.sin(i * 2.1) * 2);
      s.scale.set(0.7, 1.8, 0.7);
      g.add(s);
    }
    this.crystal = c;
    const pm = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0.4, 1.4, 2.0) } },
      vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>\nuniform vec3 uC; varying vec2 vUv; void main(){\n#include <logdepthbuf_fragment>\n float a = pow(1.0 - vUv.y, 2.0) * 0.5; gl_FragColor = vec4(uC * a, a); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1500, 16, 1, true), pm);
    this.pillar.position.y = 750;
    g.add(this.pillar);
    this.light = new THREE.PointLight(0x60d8ff, 60, 120, 1.5);
    g.add(this.light);
    world.scene.add(g);
    this.setHidden(hidden);
  }
  setHidden(h) {
    this.hidden = h;
    this.pillar.visible = !h;
    this.light.visible = !h;
    this.mat.depthTest = !h;
  }
  update(dt, xray) {
    const g = this.group;
    this.crystal.rotation.y += dt * 1.5;
    if (this.hidden) { g.visible = xray; return; }
    g.visible = true;
    if (this.rise > 0) { const s = Math.min(this.rise, dt * 8); g.position.y += s; this.rise -= s; }
    else g.position.y = this.pos.y + Math.sin(performance.now() * 0.002) * 0.6;
    if (Math.random() < 0.3) this.world.game.fx.burst(g.position, 1, { add: true, spd: 3, c0: [0.5, 1.6, 2.4], s0: 0.6, s1: 0.1, l0: 0.6, l1: 1.4, up: 4, rad: 1.5 });
    const P = this.world.game.player.pos;
    if (!this.collected && P.distanceTo(g.position) < 7) {
      this.collected = true;
      this.world.scene.remove(g);
      this.world.game.collect(this.world.id);
    }
  }
  reveal(riseTo) {
    this.setHidden(false);
    this.pos.y = riseTo;
    this.rise = riseTo - this.group.position.y;
    const fx = this.world.game.fx;
    fx.ring(_v.set(this.pos.x, riseTo, this.pos.z), UP, 2, 60, 1.2, 0x60e0ff, 0.9);
    fx.burst(this.group.position, 60, { add: true, spd: 25, c0: [0.5, 1.6, 2.4], s0: 1, s1: 0.2, l0: 0.6, l1: 1.6 });
  }
  dispose() { this.world.scene.remove(this.group); }
}

// ---------------- objectives ----------------
class Objective {
  constructor(w) { this.w = w; this.text = ''; this.marker = null; this.boss = null; this.artifact = null; this.done = w.game.save.has(w.id); this.stage = 0; }
  dropArtifact(pos, hidden = false) {
    this.artifact = new Artifact(this.w, pos, hidden);
    return this.artifact;
  }
  baseUpdate(dt) {
    if (this.artifact) {
      this.artifact.update(dt, this.w.game.player.xray);
      if (this.artifact.collected) { this.artifact = null; this.done = true; }
    }
    if (this.done) {
      this.text = 'Кристалл этой планеты найден ◆ Исследуй мир или лети к следующей планете';
      this.marker = null; this.boss = null;
    }
  }
}

function makeObjective(w) {
  const o = new Objective(w);
  const id = w.id, game = w.game, P = game.player;
  const ground = (x, z) => w.terrain ? w.terrain.heightAt(x, z) : 0;
  if (id === 'earth') {
    o.kills = 0;
    w.enemies.onKillCb = (e) => {
      if (e.type === 'drone') o.kills++;
      if (e === o.boss) {
        o.stage = 2;
        game.toast('Титан повержен! Кристалл Криптона освобождён', true);
        o.dropArtifact(e.pos.clone().add(new THREE.Vector3(0, 12, 0)));
        w.enemies.spawnOn = true;
      }
    };
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage === 0) {
          o.text = `Отрази атаку дронов-захватчиков: <b>${o.kills}/12</b>`;
          const n = w.enemies.nearest(P.pos, 4000);
          o.marker = null;
          if (o.kills >= 12) {
            o.stage = 1;
            const fwd = _v.copy(P.camFwd); fwd.y = 0; fwd.normalize();
            const x = P.pos.x + fwd.x * 420, z = P.pos.z + fwd.z * 420;
            o.boss = w.enemies.spawn('mech', new THREE.Vector3(x, ground(x, z), z));
            game.toast('ВНИМАНИЕ: в город вошёл боевой робот «Титан»!', true);
            game.shake(0.6);
          }
        } else if (o.stage === 1) {
          o.text = 'Победи боевого робота <b>«Титан»</b> — бей с разгона (ЛКМ), бросай в него обломки (E)';
          o.marker = o.boss?.alive ? o.boss.center : null;
        } else if (o.stage === 2) {
          o.text = 'Забери <b>кристалл Криптона</b>';
          o.marker = o.artifact?.group.position ?? null;
        }
      }
      o.baseUpdate(dt);
      const fires = w.terrain.burning.size;
      if (fires > 0) o.text += `<br>🔥 Пожаров в городе: <b>${fires}</b> — туши ледяным дыханием (F)`;
    };
  } else if (id === 'moon') {
    const x = 900, z = 650;
    if (!o.done) o.dropArtifact(new THREE.Vector3(x, ground(x, z) - 14, z), true);
    w.onCrater = (cx, cz, R) => {
      const a = o.artifact;
      if (a && a.hidden && Math.hypot(cx - a.pos.x, cz - a.pos.z) < R + 18) {
        a.reveal(ground(a.pos.x, a.pos.z) + 6);
        game.toast('Кристалл извлечён из реголита!', true);
      }
    };
    o.update = (dt) => {
      if (!o.done) {
        const a = o.artifact;
        if (a?.hidden) {
          o.text = 'Кристалл спрятан под реголитом. Включи <b>рентген (X)</b>, найди его и пробей грунт <b>ударом о землю (Q)</b> или вырви скалу (E)';
          o.marker = P.xray ? a.pos : null;
        } else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = a?.group.position ?? null; }
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'mercury') {
    const mp = new THREE.Vector3(160, 0, -1800);
    w.onSpecial.monolith = (s) => { o.mono = s; };
    w.onDestroyed = (s) => {
      if (s === o.mono && !o.done) {
        game.toast('Монолит расплавлен!', true);
        o.dropArtifact(new THREE.Vector3(s.x, s.y0 + 12, s.z));
        o.mono = null; o.stage = 2;
      }
    };
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage < 2) {
          const pct = o.mono ? Math.round(100 - (o.mono.hp / o.mono.maxHp) * 100) : 0;
          o.text = `Расплавь древний <b>Монолит</b> тепловым зрением (ПКМ): <b>${clamp(pct, 0, 100)}%</b><br>Удары его не берут — только солнечный жар.`;
          mp.y = o.mono ? o.mono.y0 + o.mono.h * 0.5 : ground(mp.x, mp.z) + 70;
          o.marker = mp;
        } else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; }
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'venus') {
    const V = w.cfg.volcano;
    const top = ground(V.x, V.z) + 30;
    o.pool = new THREE.Mesh(new THREE.CircleGeometry(300, 48).rotateX(-Math.PI / 2), w.makeLiquidMat(true));
    o.pool.position.set(V.x, top, V.z);
    w.scene.add(o.pool);
    o.frost = 0;
    o.center = new THREE.Vector3(V.x, top, V.z);
    w.freezeTargets.push({ center: o.center, r: 300, fn: (amt) => { if (o.stage === 0) o.frost = Math.min(1, o.frost + amt * 0.05); } });
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage === 0) {
          o.text = `Кристалл утонул в лаве главного вулкана. Заморозь лаву <b>ледяным дыханием (F)</b>: <b>${Math.round(o.frost * 100)}%</b>`;
          o.marker = o.center;
          o.pool.material.uniforms.uLava.value = 1;
          if (o.frost >= 1) {
            o.stage = 1;
            o.pool.material = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.9 });
            game.toast('Лава застыла! Кристалл поднимается', true);
            for (let i = 0; i < 30; i++) w.game.fx.steam(_v.set(V.x + rand(-200, 200), top + 5, V.z + rand(-200, 200)), 20);
            o.dropArtifact(new THREE.Vector3(V.x, top - 10, V.z)).reveal(top + 8);
          }
        } else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; }
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'mars') {
    o.tripods = [];
    if (!o.done) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.4, d = 900 + i * 300;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        o.tripods.push(w.enemies.spawn('tripod', new THREE.Vector3(x, ground(x, z), z)));
      }
    }
    w.enemies.onKillCb = (e) => {
      if (e.type === 'tripod') {
        const left = o.tripods.filter((t) => t.alive).length;
        if (left === 0 && !o.done) { game.toast('Последняя тренога уничтожена!', true); o.dropArtifact(e.pos.clone().add(new THREE.Vector3(0, 15, 0))); o.stage = 1; }
        else game.toast(`Тренога уничтожена! Осталось: ${left}`);
      }
    };
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage === 0) {
          const alive = o.tripods.filter((t) => t.alive);
          o.text = `Уничтожь марсианские треноги: <b>${3 - alive.length}/3</b><br>Их тепловые лучи прожигают всё. Сближайся и бей!`;
          let best = null, bd = 1e9;
          for (const t of alive) { const d = t.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = t; } }
          o.marker = best?.center ?? null;
          o.boss = best && bd < 300 ? best : null;
        } else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; o.boss = null; }
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'jupiter') {
    const V = w.cfg.vortex;
    if (!o.done) o.dropArtifact(new THREE.Vector3(V.x, V.eyeY, V.z));
    o.update = (dt) => {
      if (!o.done) {
        o.text = 'Кристалл в глазу <b>Большого Красного Пятна</b>. Пробейся сквозь вихрь вниз — держи <b>Shift</b>, вихрь затягивает!';
        o.marker = o.artifact?.group.position ?? null;
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'saturn') {
    const gp = new THREE.Vector3(330, 0, -2780);
    w.onSpecial.giant = (s) => { o.giant = s; };
    w.onDestroyed = (s) => {
      if (s === o.giant && !o.done) {
        game.toast('Гигантский астероид расколот!', true);
        game.shake(1);
        w.game.fx.explosion(gp, 8, [1.5, 3, 4]);
        o.dropArtifact(new THREE.Vector3(s.x, s.y0 + 110, s.z));
        o.giant = null; o.stage = 2;
      }
    };
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage < 2) {
          const pct = o.giant ? Math.round(100 - (o.giant.hp / o.giant.maxHp) * 100) : 0;
          o.text = `Расколи <b>гигантский ледяной астероид</b>: <b>${clamp(pct, 0, 100)}%</b><br>Бей с разгона, кидай в него глыбы (E), жги лучами.`;
          if (o.giant) gp.set(o.giant.x, o.giant.y0 + o.giant.h * 0.5, o.giant.z);
          o.marker = gp;
        } else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; }
      }
      o.baseUpdate(dt);
    };
  } else if (id === 'uranus') {
    o.got = 0;
    o.update = (dt) => {
      if (!o.done && o.stage === 0) {
        o.text = `Идёт алмазный дождь! Лови падающие алмазы: <b>${o.got}/25</b>`;
        o.marker = null;
        if (o.got >= 25) {
          o.stage = 1;
          game.toast('Алмазы сложились в кристалл!', true);
          const f = _v.copy(P.camFwd); f.y = 0; f.normalize().multiplyScalar(40).add(P.pos);
          o.dropArtifact(new THREE.Vector3(f.x, Math.max(P.pos.y, ground(f.x, f.z) + 8), f.z));
        }
      } else if (!o.done) { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; }
      o.baseUpdate(dt);
    };
    w.onDiamond = () => { o.got++; };
  } else if (id === 'neptune') {
    if (!o.done) o.boss = w.enemies.spawn('warden', new THREE.Vector3(500, ground(500, -400) + 220, -400));
    w.enemies.onKillCb = (e) => {
      if (e === o.boss) { game.toast('Страж Бури рассыпался!', true); o.dropArtifact(e.pos.clone()); o.stage = 1; }
    };
    o.update = (dt) => {
      if (!o.done) {
        if (o.stage === 0) { o.text = 'Победи <b>Стража Бури</b> — гигантский живой кристалл. Заморозь его (F) и разбей!'; o.marker = o.boss?.alive ? o.boss.center : null; }
        else { o.text = 'Забери <b>кристалл Криптона</b>'; o.marker = o.artifact?.group.position ?? null; o.boss = null; }
      }
      o.baseUpdate(dt);
    };
  } else o.update = (dt) => o.baseUpdate(dt);
  return o;
}

// ---------------- the world ----------------
export class SurfaceWorld {
  constructor(game, id) {
    this.game = game; this.id = id; this.kind = 'surface';
    const cfg = this.cfg = WORLD_DEFS[id]();
    this.noise = cfg._noise = new Noise(cfg.seed);
    this.name = cfg.name;
    this.scene = new THREE.Scene();
    this.gravity = cfg.gravity;
    this.waterLevel = cfg.water ? cfg.water.level : null;
    this.dustColor = cfg.dustColor;
    this.onSpecial = {};
    this.freezeTargets = [];
    this.ice = [];
    this.time = 0;

    this.terrain = cfg.height || cfg.structures ? new Terrain(this, cfg) : null;
    if (this.terrain) this.scene.add(this.terrain.group);
    this.groundAt = (x, z) => (this.terrain ? this.terrain.groundAt(x, z) : -1e9);

    // sky
    this.skyMat = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.skyMat);
    this.sky.scale.setScalar(180000);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.sunDir = new THREE.Vector3(...(cfg.sunDir ?? [0.4, 0.6, 0.3])).normalize();
    this.tod = cfg.dayCycle ? cfg.dayCycle.start : 0.4;
    this.skyRot = 0;

    // lights
    const q = game.quality;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = q !== 'low';
    const sm = q === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160; sc.near = 10; sc.far = 3000;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(cfg.light.hemiSky, cfg.light.hemiGround, cfg.light.hemi);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xffffff, cfg.fog);

    // liquid
    if (cfg.water) {
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.makeLiquidMat(!!cfg.water.lava));
      this.water.scale.set(60000, 1, 60000);
      this.water.position.y = cfg.water.level;
      this.water.renderOrder = 1;
      this.scene.add(this.water);
    }
    // clouds
    this.clouds = (cfg.clouds ?? []).map((d) => { const c = new CloudLayer(d); this.scene.add(c.mesh); return c; });
    // gas decks (Jupiter)
    this.decks = (cfg.decks ?? []).map((d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this._deckMat(d));
      m.scale.set(80000, 1, 80000); m.position.y = d.y;
      this.scene.add(m);
      return m;
    });
    // weather
    this.weather = cfg.weather ? new Weather(cfg.weather) : null;
    if (this.weather) this.scene.add(this.weather.mesh);
    this.wind = new THREE.Vector3();
    this.windA = rand(0, 6);
    // sky bodies
    this.bodies = (cfg.skyBodies ?? []).map((b) => this._makeBody(b));
    // special: Jupiter vortex
    if (cfg.vortex) this._makeVortex(cfg.vortex);

    this.enemies = new Enemies(this);
    this.objective = makeObjective(this);
    this.diamonds = [];
    this.diamondT = 0;
    this.lightT = rand(3, 8);
    this.eruptT = 6;
    this.stormT = 50; this.storm = 0;
    this.flashK = 0;
  }

  makeLiquidMat(lava) {
    const m = makeWaterMaterial();
    m.uniforms.uLava.value = lava ? 1 : 0;
    if (this.cfg.water?.deep) m.uniforms.uDeep.value.set(this.cfg.water.deep);
    if (this.cfg.water?.alpha) m.uniforms.uAlpha.value = this.cfg.water.alpha;
    if (lava) m.transparent = false;
    return m;
  }

  _deckMat(d) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uC1: { value: new THREE.Color(...d.c1) }, uC2: { value: new THREE.Color(...d.c2) } }]),
      vertexShader: `#include <common>\n#include <fog_pars_vertex>\n#include <logdepthbuf_pars_vertex>\nvarying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <logdepthbuf_vertex>\n#include <fog_vertex>\n}`,
      fragmentShader: `#include <common>\n#include <fog_pars_fragment>\n#include <logdepthbuf_pars_fragment>\n${VNOISE2}\nuniform float uT; uniform vec3 uC1; uniform vec3 uC2; varying vec3 vW;
        void main(){\n#include <logdepthbuf_fragment>\n vec2 p = vW.xz * 0.0015; vec2 q = p + vec2(vn(p * 2.0 + uT * 0.02), vn(p * 2.0 + 7.0)) * 1.5;
          float b = sin(q.y * 6.0 + vn(q * 3.0) * 3.0) * 0.5 + 0.5; float n = vn(q * 8.0) * 0.5 + vn(q * 30.0) * 0.2;
          vec3 c = mix(uC1, uC2, b * 0.7 + n * 0.5); gl_FragColor = vec4(c, 1.0);\n#include <fog_fragment>\n}`,
      fog: true, side: THREE.DoubleSide,
    });
  }

  _makeBody(b) {
    const g = new THREE.Group();
    const mat = makePlanetMaterial(b.type, { c1: b.c1, c2: b.c2, c3: b.c3 ?? b.atmo, seed: 2.3, amb: 0.02 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 96, 64), mat);
    g.add(m);
    const mats = [mat];
    if (b.atmo) {
      const am = makeAtmoMaterial(b.atmo, 1.2);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(b.radius * 1.03, 64, 48), am));
      mats.push(am);
    }
    if (b.ring) {
      const rm = makeRingMaterial(b.ring[0], b.ring[1], 0xd8c8a0, 0xf0e2c0, 0.9);
      rm.uniforms.uR.value = b.radius;
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.ring[0], b.ring[1], 128, 4), rm);
      ring.rotation.x = -Math.PI / 2 + 0.02;
      g.add(ring);
      mats.push(rm);
      g.userData.ringMat = rm;
    }
    g.userData = { ...g.userData, def: b, mats, dir: new THREE.Vector3(...b.dir).normalize() };
    this.scene.add(g);
    return g;
  }

  _makeVortex(V) {
    const geo = new THREE.CylinderGeometry(V.R, 180, 2200, 64, 12, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } },
      vertexShader: `#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>\n${VNOISE2}\nuniform float uT; varying vec2 vUv; varying vec3 vP;
        void main(){\n#include <logdepthbuf_fragment>\n float a = atan(vP.z, vP.x); float s = sin(a * 7.0 + vUv.y * 20.0 - uT * 1.5 + vn(vec2(a * 3.0, vUv.y * 10.0)) * 3.0);
          float k = smoothstep(-0.2, 1.0, s) * (0.25 + 0.75 * vUv.y) * smoothstep(0.0, 0.15, vUv.y);
          vec3 c = mix(vec3(0.7, 0.18, 0.06), vec3(1.0, 0.55, 0.3), s * 0.5 + 0.5);
          gl_FragColor = vec4(c, k * 0.55); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(V.x, V.eyeY + 1100, V.z);
    this.scene.add(m);
    this.vortexMesh = m;
  }

  solarFactor() { return this.cfg.solar * (this.cfg.dayCycle ? Math.max(0.15, this.dayK ?? 1) : 1) * (this.storm > 0 ? 1 - this.storm * 0.6 : 1); }

  setXray(on) {
    if (!this.terrain) return;
    for (const m of Object.values(this.terrain.smats)) {
      m.transparent = on; m.opacity = on ? 0.22 : 1; m.depthWrite = !on; m.needsUpdate = true;
    }
  }

  onSpecialStruct(s) { this.onSpecial[s.special]?.(s); }
  onStructDestroyed(s) { this.onDestroyed?.(s); }

  // hero entering this world
  spawnPoint(fromSpace = false) {
    const cfg = this.cfg;
    let x = 0, z = 0;
    if (cfg.findSpawn) { const s = cfg.findSpawn(); x = s.x; z = s.z + 250; }
    const g = this.terrain?.hasGround ? this.terrain.heightAt(x, z) : 0;
    const y = cfg.noFloor ? 200 : cfg.vortex ? 900 : Math.max(g, this.waterLevel ?? -1e9) + (fromSpace ? Math.min(1300, cfg.exitAlt * 0.4) : 160);
    return new THREE.Vector3(x, y, z);
  }

  prewarm(p) {
    if (!this.terrain) return;
    this.terrain.budget = 400;
    this.terrain.update(p.x, p.z, 0, 0);
    this.terrain.budget = 6;
  }

  // ---------- queries used by the player ----------
  raycast(o, d, maxT, opts = {}) {
    let best = { t: maxT, kind: null, point: new THREE.Vector3(), target: null, s: null };
    if (!opts.noEnemies) {
      for (const e of this.enemies.list) {
        if (!e.alive || e.state === 'grabbed' || e === opts.ignore) continue;
        const t = raySphere(o, d, e.center, e.hitR, best.t);
        if (t >= 0 && t < best.t) { best.t = t; best.kind = 'enemy'; best.target = e; }
      }
    }
    if (this.terrain) {
      const h = this.terrain.raycastStructs(o, d, best.t);
      if (h && h.t < best.t) { best.t = h.t; best.kind = 'struct'; best.s = h.s; best.target = h.s; }
      if (this.terrain.hasGround) {
        let t = 0, prev = 0, step = 3;
        while (t < best.t) {
          const y = o.y + d.y * t, gy = this.groundAt(o.x + d.x * t, o.z + d.z * t);
          if (y < gy) {
            let a = prev, b = t;
            for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (o.y + d.y * m < this.groundAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
            if (b < best.t) { best.t = b; best.kind = 'ground'; best.target = null; }
            break;
          }
          prev = t;
          step = Math.max(3, Math.min(40, (y - gy) * 0.5));
          t += step;
        }
      }
    }
    if (!opts.noWater && this.waterLevel != null && Math.abs(d.y) > 1e-4) {
      const t = (this.waterLevel - o.y) / d.y;
      if (t > 0 && t < best.t) { best.t = t; best.kind = 'water'; best.target = null; }
    }
    if (!best.kind) return null;
    best.point.copy(o).addScaledVector(d, best.t);
    return best;
  }

  damageArea(p, r, dmg, opts = {}) {
    let n = 0;
    for (const e of this.enemies.list) {
      if (!e.alive || e === opts.ignore) continue;
      const d = e.center.distanceTo(p) - e.hitR;
      if (d > r) continue;
      const f = 1 - Math.max(0, d) / r;
      const dir = _v.copy(e.center).sub(p).normalize();
      if (opts.lift) dir.y = Math.max(dir.y, 0.5);
      if (dmg > 0) e.hit(dmg * f, dir.normalize(), (opts.knock ?? 0) * f);
      n++;
    }
    if (this.terrain && !opts.noStructs) {
      this.terrain.forStructsNear(p.x, p.z, r, (s) => {
        if (p.y < s.y0 - r || p.y > s.y0 + s.h + r) return;
        const d = Math.max(0, Math.hypot(s.x - p.x, s.z - p.z) - Math.max(s.w, s.d) * 0.5);
        const f = 1 - d / (r + 1);
        const hp = _v2.set(s.x, clamp(p.y, s.y0, s.y0 + s.h), s.z);
        this.terrain.damageStruct(s, Math.max(dmg, 60) * 2.2 * f, hp, _v.copy(hp).sub(p).setY(0).normalize());
      });
      this.terrain.flattenTrees(p.x, p.z, r * 0.9, false, p.x, p.z);
    }
    if (!opts.noPlayer) {
      const pl = this.game.player;
      const d = pl.pos.distanceTo(p);
      if (d < r) pl.damage(dmg * 0.2 * (1 - d / r), p);
    }
    return n;
  }

  // freeze breath hitting a point
  freezeAt(p, amt) {
    for (const f of this.freezeTargets) if (p.distanceTo(f.center) < f.r + 20) f.fn(amt);
    if (this.terrain) this.terrain.extinguish(p, 14);
    if (this.waterLevel != null && Math.abs(p.y - this.waterLevel) < 2 && this.ice.length < 60 && Math.random() < amt * 6) {
      const lava = this.cfg.water.lava;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rand(4, 9), rand(5, 10), 1.2, 7), new THREE.MeshStandardMaterial({ color: lava ? 0x1a1412 : 0xdff6ff, roughness: lava ? 0.9 : 0.15, flatShading: true }));
      m.position.set(p.x + rand(-4, 4), this.waterLevel + 0.3, p.z + rand(-4, 4));
      m.rotation.y = rand(0, 6);
      m.receiveShadow = true;
      this.scene.add(m);
      this.ice.push(m);
      if (lava) this.game.fx.steam(m.position, 5);
    }
  }

  // ---------- per-frame ----------
  update(dt, cam) {
    const cfg = this.cfg, game = this.game, P = game.player, fx = game.fx;
    this.time += dt;
    const camAlt = cam.position.y - Math.max(this.groundAt(cam.position.x, cam.position.z), this.waterLevel ?? -1e9);
    const alt = P.pos.y - (this.terrain?.hasGround ? this.groundAt(P.pos.x, P.pos.z) : 0);

    if (this.terrain) this.terrain.update(P.pos.x, P.pos.z, Math.max(0, alt), dt);

    // --- time of day / sun ---
    let dayK = 1, sunsetK = 0;
    if (cfg.dayCycle) {
      this.tod = (this.tod + dt / cfg.dayCycle.length) % 1;
      const a = this.tod * Math.PI * 2 - Math.PI / 2;
      this.sunDir.set(Math.cos(a), Math.sin(a) * 0.92, 0.32).normalize();
      dayK = smoothstep(-0.1, 0.18, this.sunDir.y);
      sunsetK = (1 - smoothstep(0.0, 0.35, Math.abs(this.sunDir.y))) * smoothstep(-0.15, 0.0, this.sunDir.y);
    }
    this.dayK = dayK;
    if (cfg.skyRotate) this.skyRot += dt * cfg.skyRotate;
    const sk = cfg.sky;
    const fadeK = smoothstep(cfg.spaceFade[0], cfg.spaceFade[1], P.pos.y);
    const space = Math.max(sk.space ?? 0, fadeK);
    const night = 1 - dayK;
    const U = this.skyMat.uniforms;
    U.uZenith.value.setRGB(...sk.zen).lerp(_c.setRGB(0.004, 0.008, 0.03), night);
    U.uHorizon.value.setRGB(...sk.hor).lerp(_c.setRGB(1.0, 0.5, 0.25), sunsetK * 0.8).lerp(_c.setRGB(0.02, 0.035, 0.07), night);
    U.uGround.value.setRGB(...sk.ground).multiplyScalar(0.3 + 0.7 * dayK);
    U.uSunColor.value.setRGB(...sk.sun).lerp(_c.setRGB(1.0, 0.45, 0.15), sunsetK);
    U.uSunDir.value.copy(this.sunDir);
    U.uSunSize.value = sk.sunSize;
    U.uSpace.value = space;
    U.uStars.value = Math.max(sk.stars ?? 0, night, fadeK);
    U.uSkyRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationX(this.skyRot));
    this.sky.position.copy(cam.position);

    // lightning flash
    this.flashK = Math.max(0, this.flashK - dt * 4);
    if (cfg.lightning) {
      this.lightT -= dt;
      if (this.lightT <= 0) {
        this.lightT = rand(2, 9) / (cfg.lightning * 4);
        const a = rand(0, 6.28), d = rand(150, 900);
        const top = _v.set(P.pos.x + Math.cos(a) * d, P.pos.y + rand(150, 400), P.pos.z + Math.sin(a) * d);
        const gy = this.terrain?.hasGround ? this.groundAt(top.x, top.z) : P.pos.y - rand(200, 500);
        const bot = _v2.set(top.x + rand(-80, 80), gy, top.z + rand(-80, 80));
        fx.bolt(top, bot, cfg.id === 'jupiter' ? 0xffe0c0 : 0xd8e4ff, 0.3, 0.08);
        this.flashK = 1;
        game.audio.thunder(bot);
        if (P.pos.distanceTo(bot) < 40) P.damage(10, bot);
        if (this.terrain?.hasGround) fx.fire(bot, 4, 6);
      }
    }

    // sun & hemisphere lights
    const L = cfg.light;
    let sunInt = L.sun * dayK;
    if (cfg.dayCycle && dayK < 0.5) {
      this.sun.position.copy(P.pos).addScaledVector(_v.copy(this.sunDir).negate(), 1000);
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      sunInt = 0.5 * (1 - dayK * 2);
    } else {
      this.sun.position.copy(P.pos).addScaledVector(this.sunDir, 1000);
      this.sun.color.copy(U.uSunColor.value);
    }
    this.sun.intensity = sunInt * (this.storm > 0 ? 1 - this.storm * 0.6 : 1);
    this.sun.target.position.copy(P.pos);
    this.hemi.intensity = L.hemi * (0.25 + 0.75 * dayK) + this.flashK * 3;
    this.hemi.color.set(L.hemiSky);

    // fog
    const viewDist = ((cfg.view ?? 7) + (alt > 700 ? 2 : 0) + (alt > 1800 ? 2 : 0)) * 512;
    let dens = Math.max(cfg.fog, 1.45 / viewDist);
    dens *= 1 - fadeK * 0.85;
    if (cfg.fog > 0.0005) dens *= clamp(1.2 - camAlt / 4000, 0.3, 1.2);
    if (this.storm > 0) dens *= 1 + this.storm * 4;
    const fogC = this.scene.fog.color;
    if (cfg.fogColor) fogC.setRGB(...cfg.fogColor).multiplyScalar(0.25 + 0.75 * dayK);
    else fogC.copy(U.uHorizon.value);
    fogC.lerp(_c.setRGB(0.01, 0.01, 0.03), fadeK);
    fogC.lerp(_c.setRGB(1, 1, 1), this.flashK * 0.3);
    // underwater
    const under = this.waterLevel != null && cam.position.y < this.waterLevel && !cfg.water.lava;
    if (under) { fogC.setRGB(0.02, 0.12, 0.2); dens = 0.03; }
    game.setUnderwater(under);
    this.scene.fog.density = dens;

    // water
    if (this.water) {
      const wu = this.water.material.uniforms;
      wu.uTime.value = this.time;
      wu.uSunDir.value.copy(this.sunDir);
      wu.uSunColor.value.copy(U.uSunColor.value).multiplyScalar(dayK);
      wu.uSky.value.copy(U.uZenith.value);
      wu.uHor.value.copy(U.uHorizon.value);
      this.water.position.x = Math.round(cam.position.x / 100) * 100;
      this.water.position.z = Math.round(cam.position.z / 100) * 100;
    }
    for (const m of this.decks) { m.material.uniforms.uT.value = this.time; m.position.x = cam.position.x; m.position.z = cam.position.z; }
    const pool = this.objective.pool;
    if (pool?.material.uniforms) { pool.material.uniforms.uTime.value = this.time; }

    // clouds
    const lit = _c.copy(U.uSunColor.value).multiplyScalar(0.35 + 0.75 * dayK).lerp(_c2.setRGB(1, 1, 1), this.flashK * 0.6);
    const shade = _c2.copy(U.uZenith.value).multiplyScalar(0.6);
    shade.r += 0.45 * dayK; shade.g += 0.47 * dayK; shade.b += 0.52 * dayK;
    for (const c of this.clouds) c.update(cam, this.sunDir, lit, shade);

    // night lights in windows
    const bm = this.terrain?.smats.box;
    if (bm?.userData.shader) bm.userData.shader.uniforms.uNight.value = 1 - smoothstep(-0.05, 0.15, this.sunDir.y);

    // sky bodies (kept at fixed offset from the camera = "infinitely" far)
    for (const b of this.bodies) {
      const def = b.userData.def;
      b.position.copy(cam.position).addScaledVector(b.userData.dir, def.dist);
      const sp = _v.copy(cam.position).addScaledVector(this.sunDir, 2e6);
      for (const m of b.userData.mats) { if (m.uniforms.uSunPos) m.uniforms.uSunPos.value.copy(sp); if (m.uniforms.uTime) m.uniforms.uTime.value = this.time; }
      if (b.userData.ringMat) b.userData.ringMat.uniforms.uCenter.value.copy(b.position);
      b.rotation.y += dt * 0.003;
    }
    if (this.vortexMesh) this.vortexMesh.material.uniforms.uT.value = this.time;

    // weather & wind
    if (cfg.wind) {
      this.windA += dt * 0.05;
      const gust = 55 + 35 * Math.sin(this.time * 0.4) + 20 * Math.sin(this.time * 1.7);
      this.wind.set(Math.cos(this.windA), 0, Math.sin(this.windA)).multiplyScalar(gust);
    } else if (this.storm > 0) this.wind.set(40 * this.storm, 0, 15 * this.storm);
    else this.wind.set(0, 0, 0);
    if (this.weather) {
      const wk = cfg.dustStorm ? this.storm : 1;
      this.weather.mesh.visible = wk > 0.01 && camAlt < 1500;
      if (this.weather.mesh.visible) this.weather.update(dt, cam, this.wind, wk);
    }

    // world specials
    if (cfg.dustStorm) {
      this.stormT -= dt;
      if (this.stormT <= 0 && this.storm === 0) { this.stormOn = true; this.stormT = 22; game.toast('Надвигается пылевая буря!'); }
      if (this.stormOn) { this.storm = Math.min(1, this.storm + dt * 0.25); if (this.stormT <= 0) { this.stormOn = false; this.stormT = rand(50, 80); } }
      else this.storm = Math.max(0, this.storm - dt * 0.2);
    }
    if (cfg.volcano) this._erupt(dt);
    if (cfg.diamonds) this._diamonds(dt);
    if (cfg.vortex) this._vortex(dt);
    if (cfg.floorY != null && P.pos.y < cfg.floorY) {
      P.damage(18 * dt, null, true);
      P.vel.y += 60 * dt;
      if (Math.random() < 0.05) game.hint('Давление растёт — поднимайся!');
    }
    if (cfg.water?.lava && P.pos.y < this.waterLevel + 1.2 && P.mode !== 'space') { P.damage(25 * dt, null, true); P.vel.y += 30 * dt; fx.fire(P.pos, 2, 1); }

    this.enemies.update(dt * game.timeScale);
    this.objective.update(dt);

    // leave the planet
    if (P.pos.y > cfg.exitAlt && P.vel.y > 0) game.leaveToSpace();
    if (cfg.noFloor && P.pos.y < -cfg.exitAlt) game.leaveToSpace();
  }

  _erupt(dt) {
    const V = this.cfg.volcano, P = this.game.player, fx = this.game.fx;
    this.eruptT -= dt;
    const top = this.objective.center ?? _v.set(V.x, 800, V.z);
    if (Math.random() < 0.4) fx.burst(top, 1, { spd: 8, up: 30, c0: [0.25, 0.2, 0.18], c1: [0.4, 0.35, 0.3], s0: 30, s1: 120, l0: 5, l1: 9, a: 0.5, rad: 60 });
    if (this.eruptT > 0) return;
    this.eruptT = rand(5, 9);
    const near = P.pos.distanceTo(top) < 3000;
    if (!near) return;
    this.game.shake(0.3);
    this.game.audio.boom(0.8, top);
    fx.explosion(top, 6);
    for (let i = 0; i < 10; i++) {
      const dir = new THREE.Vector3(rand(-0.5, 0.5), 1, rand(-0.5, 0.5)).normalize();
      const from = _v2.copy(top); from.y += 15;
      this.enemies.shoot(from, dir, { color: 0xff6010, speed: rand(70, 140), dmg: 10, size: 2.5, lava: true }, 'enemy');
    }
  }

  _diamonds(dt) {
    const P = this.game.player, fx = this.game.fx;
    this.diamondT -= dt;
    if (this.diamondT <= 0 && this.diamonds.length < 30) {
      this.diamondT = 0.9;
      const a = rand(0, 6.28), d = rand(20, 280);
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d;
      this.diamondMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88ccff, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.5, flatShading: true });
      this.diamondGeo ??= new THREE.OctahedronGeometry(1.1, 0);
      const m = new THREE.Mesh(this.diamondGeo, this.diamondMat);
      m.position.set(x, P.pos.y + rand(120, 260), z);
      this.scene.add(m);
      this.diamonds.push({ m, life: 25, landed: false });
    }
    for (let i = this.diamonds.length - 1; i >= 0; i--) {
      const dm = this.diamonds[i], p = dm.m.position;
      dm.m.rotation.y += dt * 3;
      if (!dm.landed) {
        p.y -= 22 * dt;
        if (Math.random() < 0.4) fx.burst(p, 1, { add: true, spd: 1, c0: [1.5, 2, 2.6], s0: 0.5, s1: 0.1, l0: 0.4, l1: 0.8 });
        const g = this.groundAt(p.x, p.z);
        if (p.y < g + 1) { p.y = g + 1; dm.landed = true; fx.burst(p, 12, { add: true, spd: 10, c0: [1.5, 2, 2.6], s0: 0.4, s1: 0.1, l0: 0.3, l1: 0.6 }); }
      } else dm.life -= dt;
      if (p.distanceTo(P.pos) < 7) {
        this.onDiamond?.();
        this.game.audio.pickup();
        fx.burst(p, 20, { add: true, spd: 12, c0: [1.5, 2.2, 3], s0: 0.6, s1: 0.1, l0: 0.3, l1: 0.7 });
        this.scene.remove(dm.m); this.diamonds.splice(i, 1); continue;
      }
      if (dm.life <= 0) { this.scene.remove(dm.m); this.diamonds.splice(i, 1); }
    }
  }

  _vortex(dt) {
    const V = this.cfg.vortex, P = this.game.player, fx = this.game.fx;
    const dx = P.pos.x - V.x, dz = P.pos.z - V.z, d = Math.hypot(dx, dz);
    if (d < V.R * 1.3 && P.pos.y < V.eyeY + 2400) {
      const k = 1 - d / (V.R * 1.3);
      const tx = -dz / (d || 1), tz = dx / (d || 1);
      const swirl = 90 * k, pull = 25 * k;
      P.vel.x += (tx * swirl - dx / (d || 1) * pull) * dt * 1.2;
      P.vel.z += (tz * swirl - dz / (d || 1) * pull) * dt * 1.2;
      P.vel.y += (P.pos.y > V.eyeY + 100 ? -10 : 0) * k * dt;
      if (Math.random() < k) this.game.shake(0.05 * k);
    }
    if (Math.random() < 0.6) {
      const a = rand(0, 6.28), r = rand(200, V.R), y = V.eyeY + rand(0, 2000);
      fx.burst(_v.set(V.x + Math.cos(a) * r * (0.3 + (y - V.eyeY) / 2400), y, V.z + Math.sin(a) * r * (0.3 + (y - V.eyeY) / 2400)), 1,
        { spd: 5, c0: [0.75, 0.3, 0.15], c1: [0.9, 0.5, 0.3], s0: 60, s1: 140, l0: 3, l1: 6, a: 0.45, dir: _v2.set(-Math.sin(a), 0, Math.cos(a)), dirSpd: 80 });
    }
  }

  dispose() {
    this.enemies.dispose();
    this.objective.artifact?.dispose();
    this.terrain?.dispose();
    this.scene.traverse((o) => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose?.(); });
  }
}
