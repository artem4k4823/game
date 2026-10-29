import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Hero } from './hero.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD, buildSolarMap } from './hud.js';
import { SurfaceWorld } from './surface.js';
import { SpaceWorld, PLANETS } from './space.js';
import { WORLD_ORDER } from './worlds.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'superman-steel-horizon-v1';

class Game {
  constructor() {
    this.settings = { sens: 1 };
    this.quality = document.querySelector('input[name=q]:checked')?.value ?? 'mid';
    this.timeScale = 1;
    this.stopT = 0;
    this.reentry = 0;
    this.save = new Set();
    try { JSON.parse(localStorage.getItem(SAVE_KEY) || '[]').forEach((id) => this.save.add(id)); } catch { /* storage unavailable */ }

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    $('game').appendChild(r.domElement);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 400000);
    this.camera.rotation.order = 'YXZ';

    this.audio = new Audio();
    this.input = new Input(r.domElement);
    this.hud = new HUD(this);
    this.hero = new Hero();
    this.player = new Player(this, this.hero);
    this.fx = new FX(this);
    this.space = null;
    this.world = null;
    this.state = 'menu';
    this.transition = null;

    this._setupComposer();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();

    this.input.handlers.down.push((b) => this.state === 'play' && this.player.onMouseDown(b));
    this.input.handlers.up.push((b) => this.state === 'play' && this.player.onMouseUp(b));
    this.input.handlers.key.push((c) => this.onKey(c));
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'play') this.pause(true);
    });
    r.domElement.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked) this.input.lock(); });

    this.hud.updateCrystals(this.save);
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  _setupComposer() {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.55, 0.85);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  applyQuality() {
    const q = this.quality;
    const pr = q === 'low' ? 0.75 : q === 'mid' ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  // ---------- flow ----------
  start() {
    this.quality = document.querySelector('input[name=q]:checked')?.value ?? 'mid';
    this.applyQuality();
    this.audio.init();
    $('menu').classList.add('hidden');
    this.hud.show(true);
    if (!this.world) {
      this.space = new SpaceWorld(this);
      this.loadSurface('earth');
      this.toast('Добро пожаловать, Супермен. Взлети выше облаков — и дальше, в космос.', true);
    }
    this.state = 'play';
    this.input.lock();
    this.clock.getDelta();
  }

  pause(on) {
    if (on) {
      if (this.state !== 'play') return;
      this.state = 'pause';
      $('pause').classList.remove('hidden');
      buildSolarMap(this, (id) => this.pickTarget(id));
      this.audio.setBeam(false); this.audio.setFreeze(false);
      this.input.lmb = this.input.rmb = false;
      this.player.charging = false;
    } else {
      $('pause').classList.add('hidden');
      this.state = 'play';
      this.input.lock();
      this.clock.getDelta();
    }
  }

  pickTarget(id) {
    if (!this.space) return;
    this.space.target = this.space.planet(id);
    this.toast(`Цель: ${this.space.target.def.name}${this.world?.kind === 'space' ? ' — нажми T для автопилота' : ' — сначала вылети в космос'}`);
  }

  onKey(code) {
    if (this.state !== 'play') return;
    const P = this.player;
    if (code === 'KeyX') P.toggleXray();
    if (code === 'KeyZ') P.toggleSlow();
    if (code === 'KeyM') { document.exitPointerLock(); }
    if (code === 'Tab' && this.world?.kind === 'space') {
      const list = this.space.planets;
      const i = list.indexOf(this.space.target);
      this.space.target = list[(i + 1) % list.length];
      this.hint(`Цель: ${this.space.target.def.name}`);
    }
    if (code === 'KeyT' && this.world?.kind === 'space') {
      if (!this.space.target) this.space.target = this.space.planets.find((p) => !this.save.has(p.def.id)) ?? this.space.planets[0];
      P.autopilot = !P.autopilot;
      this.hint(P.autopilot ? `Автопилот: ${this.space.target.def.name}` : 'Автопилот выключен');
    }
  }

  _attach(scene) {
    scene.add(this.hero.root);
    scene.add(this.fx.group);
    this.renderPass.scene = scene;
  }

  loadSurface(id, fromSpace = false) {
    const old = this.world;
    if (old && old.kind === 'surface') { old.scene.remove(this.hero.root, this.fx.group); old.dispose(); }
    this.fx.clear();
    const w = new SurfaceWorld(this, id);
    this.world = w;
    this._attach(w.scene);
    const sp = w.spawnPoint(fromSpace);
    w.prewarm(sp);
    this.player.reset(sp, new THREE.Vector3(0, fromSpace ? -90 : -5, fromSpace ? -60 : 0));
    this.player.yaw = 0; this.player.pitch = fromSpace ? -0.35 : -0.15;
    this.camera.far = 400000; this.camera.near = 0.3; this.camera.updateProjectionMatrix();
    this.hud.setWorld(w.cfg.name, w.cfg.sub);
    this.audio.setAmbient(...(w.cfg.ambient ?? [50, 0]));
    this.toast(w.cfg.intro);
    if (this.save.has(id)) this.hint('Кристалл этой планеты уже у тебя');
  }

  enterSpace() {
    const from = this.world;
    const id = from.id;
    from.scene.remove(this.hero.root, this.fx.group);
    from.dispose();
    this.fx.clear();
    this.world = this.space;
    this._attach(this.space.scene);
    this.space.spawnFrom(id, this.player, this.camera);
    this.camera.near = 0.3; this.camera.far = 3.5e6; this.camera.updateProjectionMatrix();
    this.hud.setWorld('Открытый космос', `Покинута планета: ${from.cfg.name}`);
    this.audio.setAmbient(30, 0.06);
    if (!this.space.target) this.space.target = this.space.planets.find((p) => !this.save.has(p.def.id) && p.def.id !== id) ?? null;
  }

  leaveToSpace() {
    if (this.transition) return;
    this.player.dropHeld();
    this.transition = { phase: 'out', t: 0, dur: 0.7, color: '#000', text: `Выход на орбиту<small>${this.world.cfg.name} остаётся позади</small>`, act: () => this.enterSpace() };
  }

  enterPlanet(id) {
    if (this.transition) return;
    const pl = PLANETS.find((p) => p.id === id);
    this.player.autopilot = false;
    this.transition = {
      phase: 'out', t: 0, dur: 0.8, color: pl.atmo ? '#ffb070' : '#fff',
      text: `${pl.atmo ? 'Вход в атмосферу' : 'Посадка'}<small>${pl.name}</small>`,
      act: () => { this.loadSurface(id, true); this.reentry = pl.atmo ? 1.5 : 0; },
    };
  }

  knockout() {
    this.player.dropHeld();
    this.transition = {
      phase: 'out', t: 0, dur: 1.4, color: '#000', text: 'Ты повержен…<small>Солнечный свет возвращает силы</small>',
      act: () => {
        const P = this.player;
        P.health = 100; P.energy = P.maxEnergy; P.dead = false; P.invuln = 3;
        if (this.world.kind === 'surface') { const sp = this.world.spawnPoint(); P.reset(sp, new THREE.Vector3()); }
        else P.reset(new THREE.Vector3(26000, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -4.1).add(new THREE.Vector3(0, 900, 0)), new THREE.Vector3());
      },
    };
  }

  collect(id) {
    this.save.add(id);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify([...this.save])); } catch { /* storage unavailable */ }
    this.hud.updateCrystals(this.save);
    this.audio.chime();
    this.fx.burst(this.player.pos, 80, { add: true, spd: 30, c0: [0.5, 1.6, 2.4], s0: 1, s1: 0.2, l0: 0.6, l1: 1.6 });
    this.fx.ring(this.player.pos, new THREE.Vector3(0, 1, 0), 2, 60, 1, 0x60e0ff, 0.9);
    const n = this.save.size;
    this.toast(`◆ Кристалл Криптона получен! (${n}/9)`, true);
    if (n >= WORLD_ORDER.length) setTimeout(() => this.toast('ВСЕ 9 КРИСТАЛЛОВ СОБРАНЫ! Крепость Одиночества восстановлена. Солнечная система под защитой.', true), 2500);
    else setTimeout(() => this.toast('Лети к следующей планете: взлети вверх до космоса'), 2000);
  }

  // ---------- small fx helpers ----------
  shake(a) { this.player.trauma = Math.min(1, this.player.trauma + a); }
  hitstop(t) { this.stopT = Math.max(this.stopT, t); }
  toast(msg, big) { this.hud.toast(msg, big); }
  hint(msg) { this.hud.hint(msg); }
  hurtFlash(k) { this.dmgK = Math.max(this.dmgK ?? 0, k); }
  setXrayFx(on) { $('fx-xray').style.opacity = on ? 1 : 0; }
  setSlowFx(on) { $('fx-slowmo').style.opacity = on ? 1 : 0; this.renderer.domElement.style.filter = on ? 'saturate(0.55) contrast(1.08)' : ''; }
  setUnderwater(on) { if (on !== this._uw) { this._uw = on; $('fx-water').style.opacity = on ? 1 : 0; } }

  // ---------- main loop ----------
  loop() {
    requestAnimationFrame(this.loop);
    const real = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.state === 'play' || this.transition) this.tick(real);
    this.composer.render();
  }

  tick(dt) {
    const w = this.world;
    if (!w) return;
    const input = this.input;
    input.frame();
    if (w.kind === 'space' && this.player.autopilot) { input.f = 1; input.shift = true; }
    if (this.transition) { input.f = 0; input.r = 0; input.u = 0; input.shift = false; }

    let pdt = dt, wdt = dt * this.timeScale;
    if (this.stopT > 0) { this.stopT -= dt; pdt = dt * 0.05; wdt = 0; }
    this.audio.listener = this.player.pos;
    this.player.update(pdt, input, this.camera);
    w.update(wdt, this.camera);
    this.fx.update(wdt, w, this.camera);
    const sp = this.player.vel.length();
    this.fx.updateStreaks(dt, this.camera, this.player.vel, w.kind === 'space' ? sp / 25 : sp);
    this.audio.setWind(sp, w.kind === 'space' || w.cfg.sky?.space);
    this.reentry = Math.max(0, this.reentry - dt * 0.6);
    if (this.reentry > 0.05 && Math.random() < this.reentry) {
      const p = this.player.pos;
      this.fx.burst(p, 2, { add: true, spd: 4, dir: this.player.vel.clone().normalize().negate(), dirSpd: 25, c0: [3, 1.2, 0.3], c1: [1, 0.15, 0], s0: 2, s1: 0.5, l0: 0.2, l1: 0.5 });
    }
    this.hud.update(dt);
    this.dmgK = Math.max(0, (this.dmgK ?? 0) - dt * 1.5);
    $('fx-dmg').style.opacity = this.dmgK + (this.player.health < 30 ? 0.25 + 0.15 * Math.sin(performance.now() * 0.008) : 0);

    // transitions
    const tr = this.transition;
    if (tr) {
      tr.t += dt;
      const fade = $('fx-fade');
      if (tr.phase === 'out') {
        fade.style.background = tr.color;
        $('fade-text').innerHTML = tr.text;
        $('fade-text').style.color = tr.color === '#000' ? '#dfe8ff' : '#10204a';
        fade.style.opacity = clamp(tr.t / tr.dur, 0, 1);
        if (tr.t >= tr.dur) { tr.act(); tr.phase = 'in'; tr.t = 0; this.clock.getDelta(); }
      } else {
        fade.style.opacity = clamp(1 - (tr.t - 0.3) / 0.9, 0, 1);
        if (tr.t >= 1.2) { this.transition = null; fade.style.opacity = 0; }
      }
    }
    input.endFrame();
  }
}

const game = new Game();
window.__game = game;
const play = $('play');
play.disabled = false;
play.textContent = 'ИГРАТЬ';
play.addEventListener('click', () => game.start());
$('resume').addEventListener('click', () => game.pause(false));
$('reset-progress').addEventListener('click', () => {
  if (!confirm('Сбросить все найденные кристаллы?')) return;
  game.save.clear();
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  game.hud.updateCrystals(game.save);
  buildSolarMap(game, (id) => game.pickTarget(id));
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.state === 'pause') game.pause(false);
});
