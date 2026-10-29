import * as THREE from 'three';
import { clamp, damp, smoothstep, rand, coneDir, randDir, UP } from './util.js';
import { setXray } from './enemies.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();

function basisQuat(out, up, fwd) {
  Y.copy(up).normalize();
  Z.copy(fwd).addScaledVector(Y, -fwd.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize();
  X.crossVectors(Y, Z).normalize();
  _m.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m);
}

const SPEEDS = {
  surface: { cruise: 55, boost: 330, hyper: 1450 },
  space: { cruise: 70, boost: 900, hyper: 16000 },
};

export class Player {
  constructor(game, hero) {
    this.game = game; this.hero = hero;
    this.pos = hero.root.position;
    this.vel = new THREE.Vector3();
    this.mode = 'fly';
    this.health = 100; this.energy = 100; this.maxEnergy = 100;
    this.overcharge = 0;
    this.yaw = 0; this.pitch = -0.1;
    this.camFwd = new THREE.Vector3(0, 0, -1);
    this.camRight = new THREE.Vector3(1, 0, 0);
    this.flyBlend = 0;
    this.shiftT = 0;
    this.hurtT = 10; this.invuln = 0;
    this.heat = false; this.freezing = false; this.xray = false; this.slow = false;
    this.holding = null; this.throwables = [];
    this.dash = null; this.slamming = false; this.slamCD = 0; this.punchCD = 0;
    this.charge = 0; this.charging = false;
    this.aim = new THREE.Vector3(); this.aimHit = null; this.lock = null;
    this.machOn = false;
    this.smashed = new Map();
    this.camDist = 7;
    this.trauma = 0;
    this.eyes = [new THREE.Vector3(), new THREE.Vector3()];
    this.heatFxT = 0;
    this.dead = false;
    this.solar = 1;
  }

  get world() { return this.game.world; }
  get inSpace() { return this.game.world?.kind === 'space'; }

  reset(pos, vel) {
    this.pos.copy(pos); this.vel.copy(vel);
    this.mode = 'fly'; this.dash = null; this.slamming = false;
    this.dropHeld();
    for (const t of this.throwables) t.mesh.parent?.remove(t.mesh);
    this.throwables.length = 0;
    this.smashed.clear();
    this.machOn = this.vel.length() > 343;
    if (this.xray) this.toggleXray();
    if (this.slow) this.toggleSlow();
  }

  damage(amount, from, continuous = false) {
    if (this.invuln > 0 || this.dead) return;
    this.health -= amount;
    this.hurtT = 0;
    this.game.hurtFlash(continuous ? 0.25 : Math.min(1, 0.25 + amount / 25));
    if (!continuous) this.trauma = Math.min(1, this.trauma + amount / 40);
    if (this.health <= 0) { this.health = 0; this.dead = true; this.game.knockout(); }
  }

  // ---------- input-driven ability triggers ----------
  onMouseDown(b) {
    if (b === 0) { this.charging = true; this.charge = 0; }
  }
  onMouseUp(b) {
    if (b === 0 && this.charging) { this.charging = false; this.doPunch(1 + 2 * clamp((this.charge - 0.15) / 0.85, 0, 1)); }
  }

  toggleXray() {
    if (!this.xray && this.energy < 5) return;
    this.xray = !this.xray;
    setXray(this.xray);
    this.world?.setXray?.(this.xray);
    this.game.setXrayFx(this.xray);
  }
  toggleSlow() {
    if (!this.slow && this.energy < 8) return;
    this.slow = !this.slow;
    this.game.timeScale = this.slow ? 0.22 : 1;
    this.game.setSlowFx(this.slow);
    this.game.audio.whoosh(0.5);
  }

  useEnergy(n) {
    if (this.overcharge > 0 || this.world?.cfg?.overcharge) return true;
    if (this.energy < n) return false;
    this.energy -= n;
    return true;
  }

  // ---------- update ----------
  update(dt, input, cam) {
    const w = this.world;
    if (!w) return;
    const fx = this.game.fx;
    this.hurtT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    this.punchCD -= dt; this.slamCD -= dt;
    if (this.overcharge > 0) { this.overcharge -= dt; this.energy = this.maxEnergy; }

    // camera angles
    const sens = 0.0022 * (this.game.settings.sens ?? 1);
    this.yaw -= input.mdx * sens;
    this.pitch = clamp(this.pitch - input.mdy * sens, -1.5, 1.5);
    const cp = Math.cos(this.pitch);
    this.camFwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.camRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.dead) { this.vel.multiplyScalar(0.95); this._camera(dt, cam); return; }

    // energy & health regen
    this.solar = w.solarFactor ? w.solarFactor(this.pos) : 1;
    if (w.cfg?.overcharge) this.energy = this.maxEnergy;
    this.energy = Math.min(this.maxEnergy, this.energy + (1.2 + 7 * this.solar) * dt);
    if (this.hurtT > 3) this.health = Math.min(100, this.health + 7 * dt);
    if (this.xray && !this.useEnergy(3 * dt)) this.toggleXray();
    if (this.slow && !this.useEnergy(10 * dt)) this.toggleSlow();
    if (this.charging) this.charge = Math.min(1, this.charge + dt);

    // aim
    const aimO = cam.position, aimD = _v.copy(this.camFwd);
    this.aimHit = w.raycast ? w.raycast(aimO, aimD, 1800, { ignore: this.holding?.e }) : null;
    if (this.aimHit) this.aim.copy(this.aimHit.point);
    else this.aim.copy(aimO).addScaledVector(aimD, 1800);
    this.lock = this._findLock(cam);

    this._move(dt, input);
    this._abilities(dt, input);
    this._updateThrowables(dt);
    this._orient(dt);
    this._camera(dt, cam);

    // hero animation
    const sp = this.vel.length();
    const camYawRel = Math.atan2(this.camFwd.x, this.camFwd.z);
    const heroYaw = Math.atan2(_v.set(0, 0, 1).applyQuaternion(this.hero.root.quaternion).x, _v.z);
    let hy = camYawRel - heroYaw; while (hy > Math.PI) hy -= Math.PI * 2; while (hy < -Math.PI) hy += Math.PI * 2;
    this.hero.eyeGlow = damp(this.hero.eyeGlow, this.heat ? 1 : 0, 20, dt);
    this.hero.animate(dt, {
      mode: this.mode, speed: sp, flyBlend: this.flyBlend, carry: !!this.holding,
      walkSpeed: this.mode === 'ground' ? Math.hypot(this.vel.x, this.vel.z) : 0, headYaw: hy, headPitch: this.pitch,
    }, this.vel, w.gravity ?? 0);
  }

  _findLock(cam) {
    const w = this.world;
    if (!w.enemies) return null;
    let best = null, bs = 0;
    for (const e of w.enemies.list) {
      if (!e.alive || e.state === 'grabbed' || e.state === 'thrown') continue;
      const d = e.center.distanceTo(this.pos);
      if (d > 140) continue;
      const to = _v2.copy(e.center).sub(cam.position).normalize();
      const dot = to.dot(this.camFwd);
      const lim = Math.cos(Math.min(0.35, 0.12 + e.hitR / Math.max(d, 1)));
      if (dot < lim) continue;
      const score = dot - d / 2000;
      if (score > bs) { bs = score; best = e; }
    }
    return best;
  }

  // ---------- movement ----------
  _move(dt, input) {
    const w = this.world, fx = this.game.fx, cfg = w.cfg ?? {};
    const space = this.inSpace;
    const S = space ? SPEEDS.space : SPEEDS.surface;
    const ground = w.groundAt(this.pos.x, this.pos.z);
    const hasGround = ground > -1e8;

    if (this.dash) {
      this._dashUpdate(dt);
      return;
    }

    if (this.mode === 'ground') {
      const f = _v.copy(this.camFwd); f.y = 0; f.normalize();
      const wish = _v2.copy(f).multiplyScalar(input.f).addScaledVector(this.camRight, input.r);
      if (wish.lengthSq() > 1) wish.normalize();
      const sp = input.shift ? 34 : 8;
      this.vel.x = damp(this.vel.x, wish.x * sp, 8, dt);
      this.vel.z = damp(this.vel.z, wish.z * sp, 8, dt);
      this.vel.y = 0;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      const sup = this._support(this.pos.x, this.pos.z, this.pos.y);
      this._collideStructs(this.pos, 3);
      if (sup < this.pos.y - 0.95 - 3) { this.mode = 'fly'; }
      else this.pos.y = sup + 0.95;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 20 && Math.random() < 0.5) fx.dust(_v.copy(this.pos).setY(this.pos.y - 0.9), 1, 2, w.dustColor ?? [0.6, 0.55, 0.5], 1.5, 1);
      if (w.waterLevel != null && this.pos.y < w.waterLevel + 0.95) { this.pos.y = w.waterLevel + 0.95; if (hs > 10) fx.burst(this.pos, 2, { spd: 4, up: 6, c0: [0.85, 0.92, 1], s0: 0.5, s1: 1.5, l0: 0.4, l1: 0.8, grav: 1, a: 0.6 }); }
      if (input.jumpPressed || input.u > 0) {
        this.mode = 'fly';
        this.vel.y = 28;
        this.game.audio.whoosh(0.35);
        fx.ring(_v.copy(this.pos).setY(this.pos.y - 0.9), UP, 1, 12, 0.5, 0xffffff, 0.4);
        fx.dust(_v, 10, 8, w.dustColor ?? [0.6, 0.55, 0.5], 3, 3);
      }
      return;
    }

    // ---- flight ----
    const wish = _v.copy(this.camFwd).multiplyScalar(input.f).addScaledVector(this.camRight, input.r).addScaledVector(UP, input.u);
    if (wish.lengthSq() > 1) wish.normalize();
    const boosting = input.shift && wish.lengthSq() > 0.01;
    if (boosting) this.shiftT += dt; else this.shiftT = 0;
    let target = S.cruise;
    if (boosting) {
      const hk = smoothstep(0.9, 3.2, this.shiftT);
      target = S.boost + (S.hyper - S.boost) * hk * hk;
      if (!space && hk > 0 && !this.useEnergy(3 * hk * dt)) target = S.boost;
    }
    if (space && w.speedLimit) target = Math.min(target, w.speedLimit(this.pos));
    if (this.slamming) {
      target = 0;
      this.vel.y = Math.min(this.vel.y - 900 * dt, -60);
    } else {
      const desired = _v2.copy(wish).multiplyScalar(target);
      if (cfg.sink) desired.y -= cfg.sink * (input.u > 0 ? 0 : 1);
      const k = wish.lengthSq() < 0.01 ? 2.2 : boosting ? 1.6 : 3.2;
      this.vel.lerp(desired, 1 - Math.exp(-k * dt));
      if (w.wind && w.wind.lengthSq() > 0) this.vel.addScaledVector(w.wind, dt * (boosting ? 0.25 : 1.1));
    }
    const speed = this.vel.length();

    // sonic boom
    if (!space && !cfg.sky?.space && !this.dash) {
      if (speed > 343 && !this.machOn) {
        this.machOn = true;
        const d = _v3.copy(this.vel).normalize();
        fx.ring(this.pos, d, 2, 45, 0.7, 0xffffff, 0.8);
        fx.ring(this.pos, d, 1, 25, 0.5, 0xbfe0ff, 0.6);
        fx.burst(this.pos, 40, { spd: 25, c0: [0.95, 0.97, 1], s0: 2, s1: 6, l0: 0.3, l1: 0.8, a: 0.5, drag: 3 });
        this.game.audio.sonic();
        this.game.shake(0.3);
        this.game.hint('ЗВУКОВОЙ БАРЬЕР!');
        if (w.terrain && this.pos.y - ground < 120) w.damageArea(this.pos, 40, 0, { noPlayer: true });
      } else if (speed < 300) this.machOn = false;
    }

    // integrate with substeps (structures / ground)
    const steps = Math.min(30, Math.max(1, Math.ceil(speed * dt / 5)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(this.vel, h);
      if (w.terrain) this._collideStructs(this.pos, speed);
      if (!hasGround) continue;
      const g = this._support(this.pos.x, this.pos.z, this.pos.y);
      if (this.pos.y - 0.95 < g) {
        if (this.slamming) { this.pos.y = g + 0.95; this._slamImpact(1 + Math.min(1.2, -this.vel.y / 500)); break; }
        const impact = -this.vel.y;
        if (speed > 200 && impact > 70) {
          this.pos.y = g + 0.95;
          const R = Math.min(30, 6 + speed * 0.012);
          this._crater(this.pos.x, this.pos.z, R, R * 0.4);
          w.damageArea(this.pos, R * 2.5, 60 + speed * 0.05, { knock: 70, lift: true, noPlayer: true });
          fx.ring(_v3.copy(this.pos).setY(g + 1), UP, 2, R * 4, 0.9, 0xfff0d0, 0.6);
          fx.dust(this.pos, 40, R * 2, w.dustColor ?? [0.6, 0.55, 0.5], 8, 8);
          fx.debrisBurst(this.pos, 30, this._groundColor(), 30, 1.2, 25);
          this.game.shake(0.9); this.game.audio.boom(1, this.pos); this.game.hitstop(0.06);
          this.vel.set(0, 0, 0); this.mode = 'ground'; this.hero.landT = 0.8;
          break;
        }
        this.pos.y = g + 0.95;
        if (input.u <= 0 && Math.hypot(this.vel.x, this.vel.z) < 50 && !boosting) {
          this.mode = 'ground';
          if (impact > 20) { this.hero.landT = 0.55; fx.dust(this.pos, 16, 8, w.dustColor ?? [0.6, 0.55, 0.5], 3, 2); fx.ring(_v3.copy(this.pos).setY(g + 0.2), UP, 1, 14, 0.5, 0xffffff, 0.3); this.game.shake(0.2); }
          this.vel.set(0, 0, 0);
          break;
        }
        if (this.vel.y < 0) this.vel.y = 0;
        if (speed > 60 && Math.random() < 0.6) fx.dust(_v3.copy(this.pos).setY(g + 0.5), 2, 4, w.dustColor ?? [0.6, 0.55, 0.5], 3, 3);
      }
    }
    // water skim / splash
    if (w.waterLevel != null && !w.cfg.water?.lava) {
      const dy = this.pos.y - w.waterLevel;
      if (dy < 3 && dy > -1.5 && speed > 60) {
        fx.burst(_v3.copy(this.pos).setY(w.waterLevel + 0.3), 3, { spd: 5, up: 12 + speed * 0.02, c0: [0.85, 0.92, 1], s0: 1, s1: 3.5, l0: 0.5, l1: 1.1, grav: 1, a: 0.6, rad: 1.5 });
      }
      if ((this.prevY ?? this.pos.y) > w.waterLevel !== this.pos.y > w.waterLevel && speed > 25) {
        fx.burst(_v3.copy(this.pos).setY(w.waterLevel), 40, { spd: 10, up: 25, c0: [0.85, 0.92, 1], s0: 1.5, s1: 4, l0: 0.6, l1: 1.4, grav: 1, a: 0.7 });
        fx.ring(_v3, UP, 1, 20, 0.8, 0xffffff, 0.5);
        this.game.audio.whoosh(0.3);
      }
    }
    this.prevY = this.pos.y;
  }

  _support(x, z, y) {
    const w = this.world;
    let g = w.groundAt(x, z);
    if (w.terrain) w.terrain.forStructsNear(x, z, 0.3, (s) => { const top = s.y0 + s.h; if (s.type === 'box' && y >= top - 1.5 + 0.95 && top > g) g = top; });
    return g;
  }

  _groundColor() {
    const w = this.world, c = w.dustColor ?? [0.5, 0.45, 0.4];
    return new THREE.Color(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8).getHex();
  }

  _collideStructs(p, speed) {
    const w = this.world, T = w.terrain, fx = this.game.fx;
    const now = performance.now();
    T.forStructsNear(p.x, p.z, 0.7, (s) => {
      const top = s.y0 + s.h;
      if (p.y < s.y0 - 0.5 || p.y > top + 0.9) return;
      if (s.floating) { const c = _v3.set(s.x, s.y0 + s.h * 0.5, s.z); if (c.distanceTo(p) > Math.max(s.w, s.h) * 0.48 + 0.7) return; }
      const smash = speed > 150 || this.dash;
      if (smash && !s.onlyHeat) {
        const last = this.smashed.get(s);
        if (last && now - last < 400) return;
        this.smashed.set(s, now);
        const dir = _v3.copy(this.vel).normalize();
        T.damageStruct(s, 350 + speed * 1.2, p, dir, { cut: true, force: Math.min(2.5, speed / 250) });
        fx.debrisBurst(p, 20, s.color, 30 + speed * 0.03, 1, 6);
        fx.dust(p, 6, 8, [0.65, 0.62, 0.58], 4, 2);
        this.game.shake(Math.min(0.6, 0.15 + speed / 2000));
        this.game.audio.punch(0.8);
        this.vel.multiplyScalar(0.9);
        return;
      }
      // solid push-out
      const hw = s.w * 0.5 + 0.7, hd = s.d * 0.5 + 0.7;
      const px1 = p.x - (s.x - hw), px2 = s.x + hw - p.x, pz1 = p.z - (s.z - hd), pz2 = s.z + hd - p.z, py = top + 0.95 - p.y;
      const m = Math.min(px1, px2, pz1, pz2, py);
      if (m === py) { p.y = top + 0.95; if (this.vel.y < 0) this.vel.y = 0; }
      else if (m === px1) { p.x = s.x - hw; this.vel.x = Math.min(0, this.vel.x); }
      else if (m === px2) { p.x = s.x + hw; this.vel.x = Math.max(0, this.vel.x); }
      else if (m === pz1) { p.z = s.z - hd; this.vel.z = Math.min(0, this.vel.z); }
      else { p.z = s.z + hd; this.vel.z = Math.max(0, this.vel.z); }
    });
  }

  _crater(x, z, R, D) {
    const w = this.world;
    if (!w.terrain?.hasGround) return;
    w.terrain.addCrater(x, z, R, D);
    w.onCrater?.(x, z, R);
  }

  // ---------- abilities ----------
  _abilities(dt, input) {
    const w = this.world, fx = this.game.fx, au = this.game.audio;
    const power = (w.cfg?.overcharge ? 3 : 1) * (this.overcharge > 0 ? 1.5 : 1);

    // heat vision
    const wantHeat = !!input.rmb && !this.inSpace;
    this.heat = wantHeat && this.useEnergy(20 * dt);
    au.setBeam(this.heat);
    this.hero.eyeWorld(0, this.eyes[0]); this.hero.eyeWorld(1, this.eyes[1]);
    fx.setBeams(this.heat, this.eyes, this.aim, power > 1 ? 1.8 : 1);
    if (this.heat) {
      const hit = this.aimHit;
      this.heatFxT -= dt;
      if (hit) {
        const p = hit.point;
        if (Math.random() < 0.7) fx.sparks(p, 3, [4, 1.5, 0.4], 25);
        if (this.heatFxT <= 0) { this.heatFxT = 0.08; fx.flash(p, 0xff5020, 6 * power, 30, 0.12); fx.fire(p, 1.5 * power, 1); }
        if (hit.kind === 'enemy') hit.target.hit(75 * power * dt, this.camFwd, 0, { heat: true });
        else if (hit.kind === 'struct') w.terrain.damageStruct(hit.s, 150 * power * dt, p, null, { heat: true });
        else if (hit.kind === 'ground') { w.terrain?.flattenTrees(p.x, p.z, 5, true); if (Math.random() < 0.15) fx.burst(p, 1, { spd: 2, up: 4, c0: [0.15, 0.13, 0.12], c1: [0.3, 0.3, 0.3], s0: 2, s1: 8, l0: 1.5, l1: 3, a: 0.5 }); }
        else if (hit.kind === 'water') fx.steam(p, 3);
      }
    }

    // freeze breath
    const wantFreeze = !!input.keys.KeyF && !this.inSpace;
    this.freezing = wantFreeze && this.useEnergy(15 * dt);
    au.setFreeze(this.freezing);
    if (this.freezing) {
      const head = this.hero.head.getWorldPosition(_v2).addScaledVector(this.camFwd, 0.4);
      head.y += 0.06;
      for (let i = 0; i < 6; i++) {
        coneDir(_v3, this.camFwd, 0.14).multiplyScalar(rand(45, 70));
        _v3.add(this.vel);
        fx.norm.emit(head.x, head.y, head.z, _v3.x, _v3.y, _v3.z, rand(0.6, 1.1), 0.3, rand(3, 6), 0.85, 0.95, 1, 0.75, 0.9, 1, 0.55, 1.2, 0);
      }
      if (w.enemies) for (const e of w.enemies.list) {
        if (!e.alive) continue;
        const to = _v3.copy(e.center).sub(head);
        const d = to.length();
        if (d < 75 + e.hitR && to.normalize().dot(this.camFwd) > Math.cos(0.2 + Math.atan(e.hitR / Math.max(d, 1)))) e.freeze(dt * 1.4);
      }
      const hit = this.aimHit;
      if (hit && hit.t < 80 + this.camDist) { w.freezeAt(hit.point, dt); if (Math.random() < 0.3) fx.burst(hit.point, 2, { spd: 4, c0: [0.85, 0.95, 1], s0: 1.5, s1: 4, l0: 0.5, l1: 1.2, a: 0.5 }); }
      for (let k = 1; k <= 3; k++) w.terrain?.extinguish(_v3.copy(head).addScaledVector(this.camFwd, k * 20), 10);
    }

    // slam / dive
    if (input.pressed.KeyQ && this.slamCD <= 0 && !this.inSpace) {
      if (this.useEnergy(12)) {
        this.slamCD = 1.0;
        const g = w.groundAt(this.pos.x, this.pos.z);
        if (this.mode === 'ground') this._slamImpact(0.7);
        else if (g > -1e8 && this.pos.y - g < 3000) { this.slamming = true; this.dash = null; this.game.audio.whoosh(0.6); this.vel.x *= 0.3; this.vel.z *= 0.3; }
        else this._airBlast(power);
      }
    }

    // grab / throw
    if (input.pressed.KeyE && !this.inSpace) {
      if (this.holding) this._throw(power);
      else this._grab();
    }
    if (this.holding) {
      const hp = _v2.copy(this.pos).addScaledVector(_v3.set(0, 1, 0).applyQuaternion(this.hero.root.quaternion), 1.7 + this.holding.r);
      if (this.holding.kind === 'enemy') { const e = this.holding.e; if (!e.alive) this.holding = null; else { e.pos.copy(hp); e.pos.y -= e.height * 0.5; e.vel.set(0, 0, 0); e.obj.rotation.z += dt * 2; } }
      else this.holding.mesh.position.copy(hp);
    }
  }

  doPunch(power) {
    if (this.punchCD > 0 || this.dead) return;
    const w = this.world, fx = this.game.fx;
    if (this.inSpace) return;
    this.punchCD = 0.3;
    this.useEnergy(2 * power);
    const pw = power * (w.cfg?.overcharge ? 1.5 : 1) * (this.overcharge > 0 ? 1.5 : 1);
    if (this.holding) { this._throw(pw); return; }
    const reach = 70 * (1 + (power - 1) * 0.6);
    let target = null;
    if (this.lock && this.lock.center.distanceTo(this.pos) < reach) target = { kind: 'enemy', e: this.lock, point: this.lock.center };
    else if (this.aimHit && (this.aimHit.kind === 'struct' || this.aimHit.kind === 'ground') && this.aimHit.point.distanceTo(this.pos) < 45 * (1 + (power - 1) * 0.5)) {
      target = { kind: this.aimHit.kind, s: this.aimHit.s, point: this.aimHit.point.clone() };
    }
    this.hero.punch();
    if (target) {
      this.dash = { ...target, power: pw, t: 0 };
      this.mode = 'fly';
      this.slamming = false;
      this.game.audio.whoosh(0.5);
      return;
    }
    // air punch: shockwave + projectile deflect
    const dir = this.camFwd;
    const n = w.enemies?.deflect(this.pos, dir, 12) ?? 0;
    if (n) this.game.hint('Снаряд отбит!');
    fx.ring(_v.copy(this.pos).addScaledVector(dir, 2), dir, 0.5, 6 * pw, 0.35, 0xffffff, 0.6);
    fx.burst(_v, 10, { spd: 15 * pw, dir, dirSpd: 40 * pw, c0: [0.9, 0.92, 0.95], s0: 0.5, s1: 2, l0: 0.2, l1: 0.5, a: 0.4, drag: 3 });
    if (w.enemies) for (const e of w.enemies.list) {
      if (!e.alive) continue;
      const to = _v2.copy(e.center).sub(this.pos); const d = to.length();
      if (d < 22 * pw && to.normalize().dot(dir) > 0.75) e.hit(14 * pw, to, 50 * pw);
    }
    this.game.audio.whoosh(0.35);
  }

  _dashUpdate(dt) {
    const d = this.dash, fx = this.game.fx, w = this.world;
    d.t += dt;
    const tp = d.kind === 'enemy' ? d.e.center : d.point;
    const to = _v.copy(tp).sub(this.pos);
    const dist = to.length();
    const reach = d.kind === 'enemy' ? d.e.hitR + 1.6 : 2;
    if ((d.kind === 'enemy' && !d.e.alive) || d.t > 1.4) { this.dash = null; return; }
    to.normalize();
    const sp = 260 + 140 * d.power;
    const step = sp * dt;
    if (dist - reach <= step) {
      this.pos.addScaledVector(to, Math.max(0, dist - reach));
      this.dash = null;
      this._impact(d, to);
      return;
    }
    this.vel.copy(to).multiplyScalar(sp);
    this.pos.addScaledVector(to, step);
    if (Math.random() < 0.5) fx.burst(this.pos, 1, { spd: 1, c0: [0.9, 0.93, 1], s0: 0.8, s1: 2, l0: 0.2, l1: 0.4, a: 0.3 });
    if (w.terrain && d.kind !== 'struct') this._collideStructs(this.pos, sp);
  }

  _impact(d, dir) {
    const w = this.world, fx = this.game.fx, P = d.power;
    const p = _v2.copy(this.pos).addScaledVector(dir, 1.2);
    this.hero.punch();
    fx.ring(p, dir, 0.5, 6 + 5 * P, 0.35, 0xfff4d8, 0.35);
    fx.sparks(p, 10 + 10 * P, [4, 3, 2], 30 + 20 * P, dir);
    fx.flash(p, 0xfff0d0, 8 * P, 40, 0.15);
    fx.burst(p, 12, { spd: 12, c0: [0.9, 0.9, 0.9], s0: 1, s1: 4, l0: 0.3, l1: 0.6, a: 0.5, drag: 3 });
    this.game.audio.punch(Math.min(1.5, 0.6 + P * 0.3));
    this.game.shake(Math.min(1, 0.25 + 0.2 * P), p);
    this.game.hitstop(0.035 + 0.025 * P);
    if (d.kind === 'enemy') {
      d.e.hit(45 * P, dir, 100 * P);
      if (P > 2) w.damageArea(p, 15, 30 * P, { ignore: d.e, knock: 50, noPlayer: true });
    } else if (d.kind === 'struct') {
      w.terrain.damageStruct(d.s, 280 * P, p, dir, { cut: true, force: P });
      fx.debrisBurst(p, 15 + 10 * P, d.s.color, 25 * P, 1.2, 8);
    } else {
      this._crater(p.x, p.z, 3 + 3 * P, 1.2 * P);
      w.damageArea(p, 10 * P, 25 * P, { knock: 40, noPlayer: true });
      fx.dust(p, 12 * P, 6 * P, w.dustColor ?? [0.6, 0.55, 0.5], 4, 5);
      fx.debrisBurst(p, 10 * P, this._groundColor(), 20, 0.8, 18);
    }
    this.vel.copy(dir).multiplyScalar(-12);
  }

  _slamImpact(power) {
    const w = this.world, fx = this.game.fx;
    this.slamming = false;
    const p = _v2.copy(this.pos); p.y -= 0.9;
    const R = 10 + 8 * power;
    this._crater(p.x, p.z, R, R * 0.38);
    w.damageArea(p, R * 3.2, 70 * power, { knock: 80 * power, lift: true, noPlayer: true });
    fx.ring(_v3.copy(p).setY(p.y + 1.5), UP, 2, R * 6, 1.0, 0xfff0c8, 0.8);
    fx.ring(_v3, UP, 1, R * 3.5, 0.7, 0xffffff, 0.5);
    fx.dust(p, 50, R * 2.2, w.dustColor ?? [0.6, 0.55, 0.5], 8 + R * 0.3, 10);
    fx.debrisBurst(p, 40, this._groundColor(), 25 + 10 * power, 1.4, 35 / Math.max(0.5, Math.sqrt(w.gravity / 9.8)));
    fx.flash(p, 0xffe0b0, 10, 120, 0.3);
    this.game.shake(1); this.game.audio.boom(1.2, p); this.game.hitstop(0.08);
    this.vel.set(0, 0, 0);
    this.mode = 'ground';
    this.hero.landT = 0.75;
  }

  _airBlast(power) {
    const w = this.world, fx = this.game.fx;
    w.damageArea(this.pos, 80, 60 * power, { knock: 120, noPlayer: true });
    fx.ring(this.pos, UP, 2, 120, 0.8, 0xffffff, 0.7);
    fx.ring(this.pos, this.camFwd, 2, 80, 0.8, 0xbfe0ff, 0.5);
    fx.burst(this.pos, 50, { spd: 60, c0: [0.9, 0.93, 1], s0: 2, s1: 6, l0: 0.4, l1: 0.9, a: 0.5, drag: 2 });
    this.game.shake(0.6); this.game.audio.boom(0.9, this.pos);
  }

  _grab() {
    const w = this.world, fx = this.game.fx;
    const e = w.enemies?.nearest(this.pos, 16, (e) => !e.def.heavy && e.state !== 'thrown');
    if (e) {
      e.state = 'grabbed';
      this.holding = { kind: 'enemy', e, r: e.radius };
      this.game.hint(`Схвачен: ${e.name}. Брось — E или ЛКМ`);
      this.game.audio.punch(0.5);
      return;
    }
    const g = w.groundAt(this.pos.x, this.pos.z);
    let r = 0, color = this._groundColor();
    if (g > -1e8 && this.pos.y - g < 14) {
      const f = _v.copy(this.camFwd); f.y = 0; f.normalize();
      const x = this.pos.x + f.x * 3, z = this.pos.z + f.z * 3;
      r = 2.6;
      this._crater(x, z, 6, 3);
      fx.dust(_v.set(x, g, z), 20, 8, w.dustColor ?? [0.6, 0.55, 0.5], 4, 6);
      fx.debrisBurst(_v, 12, color, 12, 0.7, 14);
      this.game.shake(0.3);
    } else if (w.terrain) {
      let best = null, bd = 25;
      w.terrain.forStructsNear(this.pos.x, this.pos.z, 25, (s) => {
        if (s.type !== 'rock' || s.special) return;
        const d = _v3.set(s.x, s.y0 + s.h * 0.5, s.z).distanceTo(this.pos) - s.w * 0.5;
        if (d < bd && s.w < 40) { bd = d; best = s; }
      });
      if (best) {
        r = clamp(best.w * 0.35, 1.5, 6);
        color = best.color;
        best.state = 3; best.h = 0; w.terrain._upd(best); w.terrain._save(best);
      }
    }
    if (!r) { this.game.hint('Нечего схватить — подлети к врагу или к земле'); return; }
    this.rockGeo ??= new THREE.DodecahedronGeometry(1, 1);
    const m = new THREE.Mesh(this.rockGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
    m.scale.set(r, r * 0.85, r * 1.1);
    m.castShadow = true;
    w.scene.add(m);
    this.holding = { kind: 'rock', mesh: m, r };
    this.game.audio.punch(0.6);
    this.game.hint('Скала вырвана! Брось — E или ЛКМ');
  }

  _throw(power) {
    const h = this.holding;
    if (!h) return;
    this.holding = null;
    const from = h.kind === 'enemy' ? h.e.center : h.mesh.position;
    const dir = _v.copy(this.aim).sub(from).normalize();
    if (this.lock) dir.copy(this.lock.center).sub(from).normalize();
    const sp = 200 + 60 * power;
    this.hero.punch();
    this.game.audio.whoosh(0.7);
    if (h.kind === 'enemy') {
      h.e.state = 'thrown'; h.e.thrownT = 0; h.e.vel.copy(dir).multiplyScalar(sp);
    } else {
      this.throwables.push({ mesh: h.mesh, vel: dir.clone().multiplyScalar(sp), r: h.r, t: 0, spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), power });
    }
  }

  dropHeld() {
    if (!this.holding) return;
    if (this.holding.kind === 'enemy') { this.holding.e.state = 'tumble'; this.holding.e.tumble = 1; this.holding.e.spin = new THREE.Vector3(); }
    else this.holding.mesh.parent?.remove(this.holding.mesh);
    this.holding = null;
  }

  _updateThrowables(dt) {
    const w = this.world, fx = this.game.fx;
    const tdt = dt * this.game.timeScale;
    for (let i = this.throwables.length - 1; i >= 0; i--) {
      const t = this.throwables[i], p = t.mesh.position;
      t.t += tdt;
      t.vel.y -= (w.gravity ?? 0) * 0.25 * tdt;
      const steps = Math.max(1, Math.ceil(t.vel.length() * tdt / 3));
      let boom = false;
      for (let k = 0; k < steps && !boom; k++) {
        p.addScaledVector(t.vel, tdt / steps);
        if (w.enemies) for (const e of w.enemies.list) {
          if (e.alive && e.center.distanceTo(p) < e.hitR + t.r) { e.hit(220 * t.power, _v.copy(t.vel).normalize(), 120); boom = true; break; }
        }
        if (!boom && w.terrain) {
          const s = w.terrain.structAt(p, t.r * 0.5);
          if (s) { w.terrain.damageStruct(s, 700 * t.power, p, _v.copy(t.vel).normalize(), { cut: true, force: 1.5 }); boom = true; }
        }
        if (!boom && p.y - t.r < w.groundAt(p.x, p.z)) {
          boom = true;
          this._crater(p.x, p.z, 7 + t.r, 3);
        }
        if (!boom && w.waterLevel != null && p.y < w.waterLevel) {
          fx.burst(p, 60, { spd: 15, up: 40, c0: [0.85, 0.92, 1], s0: 2, s1: 5, l0: 0.8, l1: 1.8, grav: 1, a: 0.7 });
          fx.ring(_v.copy(p).setY(w.waterLevel + 0.3), UP, 2, 35, 1, 0xffffff, 0.6);
          this.game.audio.boom(0.4, p);
          t.mesh.parent?.remove(t.mesh);
          this.throwables.splice(i, 1);
          boom = null; break;
        }
      }
      if (boom === null) continue;
      t.mesh.rotation.x += t.spin.x * tdt; t.mesh.rotation.y += t.spin.y * tdt;
      if (boom || t.t > 6) {
        if (boom) {
          fx.explosion(p, 1.6);
          fx.debrisBurst(p, 25, t.mesh.material.color.getHex(), 30, 1.2, 15);
          w.damageArea(p, 22 + t.r * 2, 120 * t.power, { knock: 70, noPlayer: true });
          this.game.shake(0.5, p); this.game.audio.boom(0.9, p);
        }
        t.mesh.parent?.remove(t.mesh);
        this.throwables.splice(i, 1);
      }
    }
  }

  // ---------- orientation & camera ----------
  _orient(dt) {
    const sp = this.vel.length();
    const flying = this.mode === 'fly';
    const fbT = this.dash || this.slamming ? 1 : flying ? smoothstep(14, 50, sp) : 0;
    this.flyBlend = damp(this.flyBlend, fbT, 6, dt);
    const flat = _v.copy(this.camFwd); flat.y = 0;
    if (this.mode === 'ground') {
      const hv = _v2.set(this.vel.x, 0, this.vel.z);
      if (hv.lengthSq() > 4) flat.copy(hv);
    }
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    basisQuat(_q, UP, flat);
    if (this.flyBlend > 0.01 && sp > 1) {
      const vd = _v2.copy(this.vel).normalize();
      const chest = _v3.set(0, -1, 0).addScaledVector(vd, vd.y);
      chest.addScaledVector(flat, 0.35);
      basisQuat(_q2, vd, chest);
      _q.slerp(_q2, this.flyBlend);
    }
    this.hero.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 9));
    // reentry / overcharge aura
    const aura = this.hero.aura.material;
    const want = this.game.reentry > 0 ? this.game.reentry : this.overcharge > 0 ? 0.25 : 0;
    aura.opacity = damp(aura.opacity, want, 4, dt);
    aura.color.set(this.overcharge > 0 && !this.game.reentry ? 0xffe070 : 0xff6a20);
  }

  _camera(dt, cam) {
    const sp = this.vel.length();
    const space = this.inSpace;
    const fast = space ? smoothstep(200, 12000, sp) : smoothstep(80, 1300, sp);
    const want = 6.5 + fast * 9 + (this.holding ? 3 + this.holding.r : 0) + (this.mode === 'ground' ? -1 : 0);
    this.camDist = damp(this.camDist, want, 3, dt);
    const tgt = _v.copy(this.pos); tgt.y += this.mode === 'ground' ? 0.9 : 0.6;
    cam.position.copy(tgt).addScaledVector(this.camFwd, -this.camDist).addScaledVector(UP, 0.8);
    const w = this.world;
    if (!space) {
      const g = w.groundAt(cam.position.x, cam.position.z);
      if (cam.position.y < g + 1.2) cam.position.y = g + 1.2;
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    if (s > 0.001) {
      cam.position.x += (Math.random() - 0.5) * s * 1.2;
      cam.position.y += (Math.random() - 0.5) * s * 1.2;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.06;
    }
    const fov = 68 + fast * 26 + (this.dash ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 4, dt); cam.updateProjectionMatrix(); }
  }
}
