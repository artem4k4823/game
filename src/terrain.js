import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash2i, craterProfile } from './noise.js';
import { VNOISE2 } from './shaders.js';
import { rayBox, rand, UP } from './util.js';

export const CHUNK = 512;
const LOD_SEG = [64, 32, 12];
const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const CR_CELL = 96;

// ---------- unit geometries for structures (base at y=0, height 1, footprint 1x1) ----------
function unitBox() { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }
function unitSpire() {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0.5, 0), new THREE.Vector2(0.42, 0.72), new THREE.Vector2(0, 1)], 6);
  return g.toNonIndexed();
}
function unitDome() { const g = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 2, 1); return g; }
function unitRock() {
  let g = new THREE.IcosahedronGeometry(0.5, 1);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const r = mulberry32(77);
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + r() * 0.4;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  g.translate(0, 0.45, 0);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
function treeGeometry() {
  const parts = [];
  const col = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a[i * 3] = cc.r * k; a[i * 3 + 1] = cc.g * k; a[i * 3 + 2] = cc.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3, 5); trunk.translate(0, 1.5, 0); parts.push(col(trunk, 0x4a3322));
  const c1 = new THREE.ConeGeometry(2.4, 5, 7); c1.translate(0, 5, 0); parts.push(col(c1, 0x2c5a24));
  const c2 = new THREE.ConeGeometry(1.8, 4, 7); c2.translate(0, 7.5, 0); parts.push(col(c2, 0x346b2a));
  const c3 = new THREE.ConeGeometry(1.1, 3, 7); c3.translate(0, 9.6, 0); parts.push(col(c3, 0x3d7a30));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
function broadleafGeometry() {
  const parts = [];
  const col = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { const k = 0.8 + Math.random() * 0.35; a[i * 3] = cc.r * k; a[i * 3 + 1] = cc.g * k; a[i * 3 + 2] = cc.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 4, 5); trunk.translate(0, 2, 0); parts.push(col(trunk, 0x5a3f2a));
  const b1 = new THREE.IcosahedronGeometry(2.6, 0); b1.translate(0, 5.6, 0); parts.push(col(b1, 0x4a7a2a));
  const b2 = new THREE.IcosahedronGeometry(1.8, 0); b2.translate(1.2, 6.8, 0.4); parts.push(col(b2, 0x5a8a30));
  const b3 = new THREE.IcosahedronGeometry(1.6, 0); b3.translate(-1.1, 6.4, -0.6); parts.push(col(b3, 0x3f6e26));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// ---------- materials ----------
function makeTerrainMaterial(cfg) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: cfg.terrainRough ?? 0.93, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrain = { value: cfg.grain ?? 1 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCity;\nvarying float vCity;\nvarying vec3 vWP;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCity = aCity;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGrain;\nvarying float vCity;\nvarying vec3 vWP;\n' + VNOISE2)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 wp = vWP.xz;
          float n = vn(wp * 0.07) * 0.45 + vn(wp * 0.31) * 0.33 + vn(wp * 1.6) * 0.22;
          diffuseColor.rgb *= 1.0 + (n - 0.5) * 0.55 * uGrain;
          if (vCity > 0.02) {
            vec2 q = mod(wp, 36.0);
            float rx = step(q.x, 8.0), rz = step(q.y, 8.0);
            float road = max(rx, rz);
            float walk = max(step(q.x, 9.6), step(q.y, 9.6)) * (1.0 - road) + max(step(34.4, q.x), step(34.4, q.y)) * (1.0 - road);
            vec3 lot = vec3(0.36, 0.36, 0.34) * (0.85 + 0.3 * vn(wp * 0.5));
            vec3 c = mix(lot, vec3(0.56, 0.55, 0.52), walk);
            vec3 asphalt = vec3(0.075, 0.078, 0.085) * (0.8 + 0.4 * vn(wp * 2.0));
            float dash = 0.0;
            if (rz > 0.5 && rx < 0.5) dash = step(abs(q.y - 4.0), 0.14) * step(fract(wp.x / 7.0), 0.5);
            if (rx > 0.5 && rz < 0.5) dash = step(abs(q.x - 4.0), 0.14) * step(fract(wp.y / 7.0), 0.5);
            asphalt = mix(asphalt, vec3(0.85, 0.75, 0.3), dash);
            c = mix(c, asphalt, road);
            diffuseColor.rgb = mix(diffuseColor.rgb, c, smoothstep(0.25, 0.65, vCity));
          }
        }`);
  };
  return mat;
}

export function makeBuildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = { value: 0 };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying vec3 vLN; varying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.291;
        #else
          vec3 isc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          vSeed = 3.7;
        #endif
        vLP = position * isc; vLN = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vLP; varying vec3 vLN; varying float vSeed; float gWin = 0.0; float gLit = 0.0;\nfloat bh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vLN.y) < 0.5) {
          float u = abs(vLN.x) > 0.5 ? vLP.z : vLP.x;
          float fl = vLP.y / 3.6, cu = u / 3.1;
          vec2 cell = vec2(floor(cu), floor(fl));
          vec2 f = vec2(fract(cu), fract(fl));
          float style = fract(vSeed * 7.13);
          float wx = style > 0.6 ? 0.06 : 0.2;
          gWin = step(wx, f.x) * step(f.x, 1.0 - wx) * step(0.28, f.y) * step(f.y, 0.88) * step(1.0, fl);
          float aa = clamp(1.6 - max(fwidth(cu), fwidth(fl)) * 3.0, 0.0, 1.0);
          gWin = mix(0.5, gWin, aa);
          float r = bh(cell + vec2(vSeed * 13.1, vLN.x * 7.0 + vLN.z * 3.0));
          vec3 glass = mix(vec3(0.05, 0.08, 0.12), vec3(0.32, 0.42, 0.52), r * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, gWin * 0.9);
          gLit = gWin * step(0.5, r) * uNight;
          diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(fl * 0.5));
        } else if (vLN.y > 0.5) {
          diffuseColor.rgb *= 0.55;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, gWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * gLit * 1.8;');
  };
  return mat;
}

export class Terrain {
  constructor(world, cfg) {
    this.world = world; this.cfg = cfg; this.noise = world.noise;
    this.group = new THREE.Group();
    this.chunks = new Map();
    this.hasGround = !!cfg.height;
    this.mat = makeTerrainMaterial(cfg);
    this.geos = { box: unitBox(), spire: unitSpire(), dome: unitDome(), rock: unitRock() };
    this.smats = {
      box: makeBuildingMaterial(),
      spire: new THREE.MeshStandardMaterial({ roughness: cfg.spireRough ?? 0.35, metalness: 0.1, flatShading: true, emissive: new THREE.Color(cfg.spireGlow ?? 0x000000) }),
      dome: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 }),
      rock: new THREE.MeshStandardMaterial({ roughness: cfg.rockRough ?? 0.9, metalness: 0.02, flatShading: true }),
    };
    if (cfg.trees) {
      this.treeGeos = [treeGeometry(), broadleafGeometry()];
      this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    }
    this.craters = []; this.crGrid = new Map();
    this.saved = new Map(); // persistent destruction states
    this.collapsing = [];
    this.burning = new Set();
    this.lastKey = null; this.pending = true;
    this._col = { r: 0, g: 0, b: 0 };
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._c = new THREE.Color();
    this.structCount = 0;
  }

  dispose() {
    for (const c of this.chunks.values()) this._disposeChunk(c);
    this.chunks.clear();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of Object.values(this.smats)) m.dispose();
    this.mat.dispose();
    this.treeGeos?.forEach((g) => g.dispose());
    this.treeMat?.dispose();
  }

  // ---------- heights ----------
  heightAt(x, z) {
    if (!this.hasGround) return -1e9;
    let h = this.cfg.height(x, z, this.noise);
    if (this.craters.length) h += this.craterAt(x, z);
    return h;
  }

  craterAt(x, z) {
    const list = this.crGrid.get(ckey(Math.floor(x / CR_CELL), Math.floor(z / CR_CELL)));
    if (!list) return 0;
    let s = 0;
    for (const c of list) {
      const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
      if (d2 > c.R * c.R * 3.3) continue;
      s += craterProfile(Math.sqrt(d2) / c.R) * c.D;
    }
    return s;
  }

  // fast lookup using generated chunk height grids (matches rendered mesh)
  groundAt(x, z) {
    if (!this.hasGround) return -1e9;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c || !c.hg) return this.heightAt(x, z);
    const seg = c.seg, step = CHUNK / seg;
    const lx = (x - cx * CHUNK) / step, lz = (z - cz * CHUNK) / step;
    const i = Math.min(seg - 1, Math.floor(lx)), j = Math.min(seg - 1, Math.floor(lz));
    const fx = lx - i, fz = lz - j, W = seg + 1, hg = c.hg;
    const ha = hg[j * W + i], hb = hg[j * W + i + 1], hc = hg[(j + 1) * W + i], hd = hg[(j + 1) * W + i + 1];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  addCrater(x, z, R, D) {
    if (!this.hasGround || this.craters.length > 400) return;
    const c = { x, z, R, D };
    this.craters.push(c);
    const r = R * 1.8;
    for (let i = Math.floor((x - r) / CR_CELL); i <= Math.floor((x + r) / CR_CELL); i++)
      for (let j = Math.floor((z - r) / CR_CELL); j <= Math.floor((z + r) / CR_CELL); j++) {
        const k = ckey(i, j);
        if (!this.crGrid.has(k)) this.crGrid.set(k, []);
        this.crGrid.get(k).push(c);
      }
    for (let i = Math.floor((x - r) / CHUNK); i <= Math.floor((x + r) / CHUNK); i++)
      for (let j = Math.floor((z - r) / CHUNK); j <= Math.floor((z + r) / CHUNK); j++) {
        const ch = this.chunks.get(ckey(i, j));
        if (ch) this._buildTerrain(ch);
      }
    this.flattenTrees(x, z, R * 1.5, false);
  }

  // ---------- chunk streaming ----------
  update(px, pz, alt, dt) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const R = (this.cfg.view ?? 7) + (alt > 700 ? 2 : 0) + (alt > 1800 ? 2 : 0);
    const key = pcx + ',' + pcz + ',' + R;
    if (key !== this.lastKey || this.pending) {
      this.lastKey = key;
      const want = new Map();
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R + 0.5) continue;
        const lod = d < 1.5 ? 0 : d < 3.3 ? 1 : 2;
        want.set(ckey(pcx + dx, pcz + dz), { cx: pcx + dx, cz: pcz + dz, lod, d });
      }
      for (const [k, c] of this.chunks) if (!want.has(k)) { this._disposeChunk(c); this.chunks.delete(k); }
      const todo = [];
      for (const [k, w] of want) {
        const c = this.chunks.get(k);
        if (!c || c.lod !== w.lod) todo.push(w);
      }
      todo.sort((a, b) => a.d - b.d);
      const t0 = performance.now();
      let built = 0;
      for (const w of todo) {
        if (built > 0 && performance.now() - t0 > (this.budget ?? 6)) break;
        const k = ckey(w.cx, w.cz);
        let c = this.chunks.get(k);
        if (!c) {
          c = { cx: w.cx, cz: w.cz, key: k, lod: w.lod, mesh: null, structs: [], smeshes: [], trees: null, treeMeshes: [] };
          this.chunks.set(k, c);
          this._genStructures(c);
        }
        c.lod = w.lod;
        this._buildTerrain(c);
        this._updateTrees(c);
        built++;
      }
      this.pending = built < todo.length;
    }
    this._updateCollapsing(dt);
    this._updateBurning(dt);
  }

  _disposeChunk(c) {
    if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
    for (const m of c.smeshes) { this.group.remove(m); m.dispose(); }
    for (const m of c.treeMeshes) { this.group.remove(m); m.dispose(); }
    for (const s of c.structs) { this.burning.delete(s); s.state = s.state < 2 ? s.state : s.state; s.dead = true; }
    this.collapsing = this.collapsing.filter((s) => !s.dead);
  }

  _buildTerrain(c) {
    if (!this.hasGround) return;
    const cfg = this.cfg, noise = this.noise;
    const seg = LOD_SEG[c.lod], N = seg + 3, step = CHUNK / seg;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = this.heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
    const V = N, nv = V * V;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), city = new Float32Array(nv);
    const W = seg + 1, hg = new Float32Array(W * W);
    const skirt = 30 + step;
    const C = this._col;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gi = Math.min(Math.max(i, 1), seg + 1), gj = Math.min(Math.max(j, 1), seg + 1);
      const lx = (gi - 1) * step, lz = (gj - 1) * step;
      const h = H[gj * N + gi];
      hg[(gj - 1) * W + (gi - 1)] = h;
      const isSkirt = i === 0 || j === 0 || i === V - 1 || j === V - 1;
      const hl = H[gj * N + gi - 1], hr = H[gj * N + Math.min(gi + 1, N - 1)];
      const hd = H[(gj - 1) * N + gi], hu = H[Math.min(gj + 1, N - 1) * N + gi];
      let nx = hl - hr, ny = 2 * step, nz = hd - hu;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      const v = j * V + i, v3 = v * 3;
      pos[v3] = lx; pos[v3 + 1] = isSkirt ? h - skirt : h; pos[v3 + 2] = lz;
      nor[v3] = nx; nor[v3 + 1] = ny; nor[v3 + 2] = nz;
      const wx = x0 + lx, wz = z0 + lz;
      cfg.color(h, 1 - ny, wx, wz, noise, C);
      col[v3] = C.r; col[v3 + 1] = C.g; col[v3 + 2] = C.b;
      city[v] = cfg.cityMask ? cfg.cityMask(wx, wz) : 0;
    }
    const idx = new Uint16Array((V - 1) * (V - 1) * 6);
    let k = 0;
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
      const a = j * V + i, b = a + 1, cc = a + V, d = cc + 1;
      idx[k++] = a; idx[k++] = cc; idx[k++] = b; idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aCity', new THREE.BufferAttribute(city, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = geo; }
    else {
      c.mesh = new THREE.Mesh(geo, this.mat);
      c.mesh.position.set(x0, 0, z0);
      c.mesh.receiveShadow = true;
      this.group.add(c.mesh);
    }
    c.hg = hg; c.seg = seg;
  }

  // ---------- structures ----------
  _genStructures(c) {
    if (!this.cfg.structures) return;
    const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    const specs = this.cfg.structures(c.cx, c.cz, x0, z0, CHUNK, this) || [];
    if (!specs.length) return;
    const byType = {};
    specs.forEach((s, i) => {
      if (s.y0 === undefined) {
        const hw = s.w * 0.45, hd = s.d * 0.45;
        s.y0 = Math.min(this.heightAt(s.x - hw, s.z - hd), this.heightAt(s.x + hw, s.z - hd), this.heightAt(s.x - hw, s.z + hd), this.heightAt(s.x + hw, s.z + hd), this.heightAt(s.x, s.z)) - (s.sink ?? 1.5);
      }
      if (s.tierOf !== undefined) s.y0 = specs[s.tierOf].y0 + specs[s.tierOf].h;
      (byType[s.type] ??= []).push(i);
    });
    const objs = new Array(specs.length);
    for (const type in byType) {
      const list = byType[type];
      const mesh = new THREE.InstancedMesh(this.geos[type], this.smats[type], list.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      list.forEach((si, idx) => {
        const s = specs[si];
        const o = {
          type, x: s.x, z: s.z, y0: s.y0, w: s.w, d: s.d, h: s.h, h0: s.h, rot: s.rot ?? 0,
          hp: s.hp ?? (type === 'box' ? 120 + s.w * s.d * s.h * 0.012 : 80 + s.w * s.h * 0.8), color: s.color,
          mesh, idx, chunk: c, state: 0, key: c.key + ':' + si, floating: !!s.floating, special: s.special ?? null,
          burn: 0, supports: [], baseOf: null, onlyHeat: !!s.onlyHeat, glass: !!s.glass,
        };
        o.maxHp = o.hp;
        const sv = this.saved.get(o.key);
        if (sv) { o.h = sv.h; o.state = sv.state; o.hp = sv.hp; o.color = sv.color ?? o.color; }
        objs[si] = o;
        mesh.setColorAt(idx, this._c.set(o.color));
        this._upd(o, false);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 300;
      this.group.add(mesh);
      c.smeshes.push(mesh);
    }
    specs.forEach((s, i) => {
      if (s.tierOf !== undefined) { objs[s.tierOf].supports.push(objs[i]); objs[i].baseOf = objs[s.tierOf]; }
    });
    c.structs = objs;
    for (const o of objs) {
      if (o.special) this.world.onSpecialStruct?.(o);
      if (o.state === 1) { o.state = 2; o.h = Math.min(o.h, 3); this._upd(o); }
    }
    this.structCount += objs.length;
  }

  _upd(s, flag = true) {
    this._p.set(s.x, s.y0, s.z);
    this._q.setFromAxisAngle(UP, s.rot);
    if (s.state === 3) this._s.set(0, 0, 0);
    else this._s.set(s.w, Math.max(0.01, s.h), s.d);
    s.mesh.setMatrixAt(s.idx, this._m.compose(this._p, this._q, this._s));
    if (flag) s.mesh.instanceMatrix.needsUpdate = true;
  }

  _save(s) { this.saved.set(s.key, { h: s.h, state: s.state, hp: s.hp, color: s.color }); }

  _tint(s, k) {
    this._c.set(s.color).multiplyScalar(k);
    s.color = this._c.getHex();
    s.mesh.setColorAt(s.idx, this._c);
    s.mesh.instanceColor.needsUpdate = true;
  }

  forStructsNear(x, z, r, fn) {
    const c0 = Math.floor((x - r - 150) / CHUNK), c1 = Math.floor((x + r + 150) / CHUNK);
    const d0 = Math.floor((z - r - 150) / CHUNK), d1 = Math.floor((z + r + 150) / CHUNK);
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
      const c = this.chunks.get(ckey(i, j));
      if (!c) continue;
      for (const s of c.structs) {
        if (s.state >= 2) continue;
        const hw = s.w * 0.5 + r, hd = s.d * 0.5 + r;
        if (x > s.x - hw && x < s.x + hw && z > s.z - hd && z < s.z + hd) fn(s);
      }
    }
  }

  // point inside the solid part of a structure?
  structAt(p, pad = 0) {
    let hit = null;
    this.forStructsNear(p.x, p.z, pad, (s) => {
      if (!hit && p.y > s.y0 - pad && p.y < s.y0 + s.h + pad) hit = s;
    });
    return hit;
  }

  raycastStructs(o, d, maxT) {
    let best = maxT, bs = null;
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    const minx = Math.min(o.x, ex), maxx = Math.max(o.x, ex), minz = Math.min(o.z, ez), maxz = Math.max(o.z, ez);
    for (let i = Math.floor((minx - 150) / CHUNK); i <= Math.floor((maxx + 150) / CHUNK); i++)
      for (let j = Math.floor((minz - 150) / CHUNK); j <= Math.floor((maxz + 150) / CHUNK); j++) {
        const c = this.chunks.get(ckey(i, j));
        if (!c) continue;
        for (const s of c.structs) {
          if (s.state >= 2) continue;
          const hw = s.w * (s.type === 'box' ? 0.5 : 0.4), hd = s.d * (s.type === 'box' ? 0.5 : 0.4);
          const t = rayBox(o, d, s.x - hw, s.y0, s.z - hd, s.x + hw, s.y0 + s.h * (s.type === 'spire' ? 0.8 : 1), s.z + hd, best);
          if (t >= 0 && t < best) { best = t; bs = s; }
        }
      }
    return bs ? { s: bs, t: best } : null;
  }

  damageStruct(s, amount, point, dir = null, opts = {}) {
    if (!s || s.state >= 2) return;
    if (s.onlyHeat && !opts.heat) { this.world.game.fx.sparks(point, 6, [3, 3, 3], 20); return; }
    const fx = this.world.game.fx;
    s.hp -= amount;
    const dcol = s.color;
    const n = Math.min(26, 2 + amount / 25) | 0;
    if (!opts.heat) fx.debrisBurst(point, n, dcol, 12 + amount * 0.04, s.type === 'box' ? 1.0 : 1.4, 8);
    if (opts.heat && this.cfg.flammable && s.type === 'box') { if (!s.burn) this.burning.add(s); s.burn = Math.min(30, s.burn + amount * 0.08); }
    if (s.type === 'box' && !opts.heat) this._tint(s, 0.985);
    // shear off the top of a tall building
    if (opts.cut && s.type === 'box' && s.state === 0 && s.h > 20 && point.y > s.y0 + 8 && point.y < s.y0 + s.h - 6 && amount >= 150) {
      this.cutStruct(s, point.y, dir ?? new THREE.Vector3(0, 0, 0), opts.force ?? 1);
      if (s.hp <= 0) s.hp = 1;
      this._save(s);
      return;
    }
    if (s.hp <= 0) this.collapse(s, dir);
    this._save(s);
  }

  cutStruct(s, y, dir, force = 1) {
    const top = s.y0 + s.h;
    const topH = top - y;
    if (topH < 3) return;
    const fx = this.world.game.fx;
    const center = this._v.set(s.x, y + topH / 2 + 0.5, s.z);
    const vel = new THREE.Vector3().copy(dir).multiplyScalar(18 * force).add(new THREE.Vector3(0, 4, 0));
    const av = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.25 + 0.4 * force).add(new THREE.Vector3(rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.1, 0.1)));
    fx.spawnSlab(this.smats.box, s.color, center, new THREE.Vector3(s.w, topH, s.d), vel, av);
    for (const t of s.supports) this._dropTier(t, dir);
    s.supports = [];
    s.h = y - s.y0 - 1;
    this._upd(s);
    fx.debrisBurst(this._v.set(s.x, y, s.z), 30, s.color, 25, 1.5, 6);
    fx.dust(this._v.set(s.x, y, s.z), 12, s.w, [0.6, 0.58, 0.55], 6, 2);
  }

  _dropTier(t, dir) {
    if (t.state >= 2) return;
    const fx = this.world.game.fx;
    const center = this._v.set(t.x, t.y0 + t.h / 2 + 1, t.z);
    fx.spawnSlab(this.smats.box, t.color, center, new THREE.Vector3(t.w, t.h, t.d), dir.clone().multiplyScalar(12).add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.3));
    t.state = 3; t.h = 0; this._upd(t); this._save(t);
    for (const u of t.supports) this._dropTier(u, dir);
  }

  collapse(s, dir) {
    if (s.state >= 1) return;
    const fx = this.world.game.fx;
    s.state = 1;
    s.cv = 0;
    this.burning.delete(s);
    if (s.floating || s.type === 'rock' || s.type === 'spire' || s.type === 'dome') {
      // shatter
      const c = this._v.set(s.x, s.y0 + s.h * 0.5, s.z);
      const sz = Math.max(s.w, s.h);
      fx.debrisBurst(c, Math.min(60, 12 + sz), s.color, 15 + sz * 0.3, Math.min(4, 0.6 + sz * 0.06), 8);
      fx.dust(c, Math.min(30, 6 + sz * 0.5), sz * 0.6, this.cfg.dustColor ?? [0.6, 0.55, 0.5], Math.max(3, sz * 0.25), 2);
      if (s.glass) fx.sparks(c, 30, [1.5, 3, 4], 30);
      this.world.game.audio.boom(Math.min(1, sz / 60), c);
      s.state = 3; s.h = 0;
      this._upd(s); this._save(s);
      this.world.onStructDestroyed?.(s);
      return;
    }
    for (const t of s.supports) this._dropTier(t, dir ?? new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize());
    s.supports = [];
    this.collapsing.push(s);
    this.world.game.audio.boom(Math.min(1.2, 0.4 + s.h / 150), this._v.set(s.x, s.y0, s.z));
    this.world.onStructDestroyed?.(s);
  }

  _updateCollapsing(dt) {
    const fx = this.world.game.fx;
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const s = this.collapsing[i];
      s.cv += dt * 22;
      s.h -= s.cv * dt;
      const top = s.y0 + s.h;
      if (Math.random() < 0.6) fx.debrisBurst(this._v.set(s.x + rand(-s.w, s.w) * 0.4, top, s.z + rand(-s.d, s.d) * 0.4), 2, s.color, 10, 1.2 + s.w * 0.03, 4);
      if (Math.random() < 0.7) fx.dust(this._v.set(s.x + rand(-s.w, s.w) * 0.6, s.y0 + 4, s.z + rand(-s.d, s.d) * 0.6), 2, s.w * 0.8, [0.62, 0.6, 0.56], 6 + s.w * 0.3, 3);
      if (s.h <= 3) {
        s.h = Math.min(3.5, s.h0);
        s.state = 2;
        s.w *= 1.15; s.d *= 1.15;
        this._tint(s, 0.5);
        fx.dust(this._v.set(s.x, s.y0 + 3, s.z), 20, s.w * 1.5, [0.6, 0.58, 0.55], 10 + s.w * 0.4, 4);
        this.world.game.shake(0.25, this._v);
        this.collapsing.splice(i, 1);
        this._save(s);
      }
      this._upd(s);
    }
  }

  _updateBurning(dt) {
    const fx = this.world.game.fx;
    for (const s of this.burning) {
      if (s.state >= 2) { this.burning.delete(s); continue; }
      s.burn -= dt * 0.15;
      s.hp -= dt * s.burn * 0.6;
      const k = Math.min(1, s.burn / 10);
      if (Math.random() < 0.5 + k) {
        const side = Math.random() < 0.5;
        const p = this._v.set(s.x + (side ? (Math.random() < 0.5 ? -1 : 1) * s.w * 0.5 : rand(-s.w, s.w) * 0.5), s.y0 + s.h * rand(0.3, 1), s.z + (!side ? (Math.random() < 0.5 ? -1 : 1) * s.d * 0.5 : rand(-s.d, s.d) * 0.5));
        fx.fire(p, 2 + k * 4, 2);
      }
      if (s.hp <= 0) this.collapse(s, null);
      if (s.burn <= 0) { s.burn = 0; this.burning.delete(s); }
    }
  }

  extinguish(p, r) {
    let n = 0;
    for (const s of this.burning) {
      const dx = p.x - s.x, dz = p.z - s.z;
      if (dx * dx + dz * dz < (r + s.w) * (r + s.w) && p.y > s.y0 - r && p.y < s.y0 + s.h + r) {
        s.burn -= 0.6;
        this.world.game.fx.steam(this._v.set(s.x, p.y, s.z), 4);
        if (s.burn <= 0) { s.burn = 0; this.burning.delete(s); n++; }
      }
    }
    return n;
  }

  // ---------- trees ----------
  _updateTrees(c) {
    if (!this.cfg.trees) return;
    const want = c.lod <= 1;
    if (!want) {
      for (const m of c.treeMeshes) { this.group.remove(m); m.dispose(); }
      c.treeMeshes = [];
      return;
    }
    if (!c.trees) {
      const r = mulberry32((c.cx * 92821) ^ (c.cz * 31337) ^ 5);
      const list = [];
      const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
      const tries = this.cfg.treeTries ?? 520;
      for (let i = 0; i < tries; i++) {
        const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK;
        const dens = this.cfg.treeDensity(x, z, this.noise);
        if (r() > dens) continue;
        const h = this.heightAt(x, z);
        if (h < 3 || h > 480) continue;
        const sl = Math.abs(this.heightAt(x + 4, z) - h) + Math.abs(this.heightAt(x, z + 4) - h);
        if (sl > 3.2) continue;
        if (this.cfg.cityMask && this.cfg.cityMask(x, z) > 0.05) continue;
        list.push({ x, y: h - 0.4, z, s: 0.7 + r() * 0.9, ry: r() * 6.28, kind: h > 220 || r() < 0.45 ? 0 : 1, alive: !this.saved.has('t' + c.key + ':' + list.length) });
      }
      c.trees = list;
    }
    if (c.treeMeshes.length) return;
    for (let kind = 0; kind < 2; kind++) {
      const items = c.trees.map((t, i) => [t, i]).filter(([t]) => t.kind === kind);
      if (!items.length) continue;
      const m = new THREE.InstancedMesh(this.treeGeos[kind], this.treeMat, items.length);
      m.castShadow = c.lod === 0;
      m.receiveShadow = true;
      items.forEach(([t], k) => { t.mesh = m; t.idx = k; this._updTree(t); });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      this.group.add(m);
      c.treeMeshes.push(m);
    }
  }

  _updTree(t) {
    this._p.set(t.x, t.y, t.z);
    if (t.alive) {
      this._q.setFromAxisAngle(UP, t.ry);
      if (t.lean) this._q.premultiply(new THREE.Quaternion().setFromAxisAngle(t.lean, 1.35));
      this._s.setScalar(t.s);
    } else this._s.setScalar(0);
    t.mesh?.setMatrixAt(t.idx, this._m.compose(this._p, this._q, this._s));
  }

  // knock down / burn trees in radius; burn=true -> fire and vanish
  flattenTrees(x, z, r, burn, fromX = x, fromZ = z) {
    if (!this.cfg.trees) return 0;
    const fx = this.world.game.fx;
    let n = 0;
    for (let i = Math.floor((x - r) / CHUNK); i <= Math.floor((x + r) / CHUNK); i++)
      for (let j = Math.floor((z - r) / CHUNK); j <= Math.floor((z + r) / CHUNK); j++) {
        const c = this.chunks.get(ckey(i, j));
        if (!c || !c.trees) continue;
        let dirty = new Set();
        c.trees.forEach((t, ti) => {
          if (!t.alive) return;
          const dx = t.x - x, dz = t.z - z;
          if (dx * dx + dz * dz > r * r) return;
          if (burn || t.lean) {
            t.alive = false;
            this.saved.set('t' + c.key + ':' + ti, 1);
            fx.fire(this._v.set(t.x, t.y + 5 * t.s, t.z), 4, 4);
            fx.burst(this._v, 6, { spd: 6, c0: [0.2, 0.35, 0.12], s0: 1, s1: 0.5, l0: 0.5, l1: 1.5, grav: 0.5 });
          } else {
            const ax = t.x - fromX, az = t.z - fromZ;
            const l = Math.hypot(ax, az) || 1;
            t.lean = new THREE.Vector3(az / l, 0, -ax / l);
            fx.burst(this._v.set(t.x, t.y + 6 * t.s, t.z), 8, { spd: 8, c0: [0.25, 0.4, 0.15], s0: 1.2, s1: 0.6, l0: 0.6, l1: 1.5, grav: 0.6 });
          }
          if (t.mesh) { this._updTree(t); dirty.add(t.mesh); }
          n++;
        });
        for (const m of dirty) m.instanceMatrix.needsUpdate = true;
      }
    return n;
  }
}
