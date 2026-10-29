import * as THREE from 'three';
import { PLANETS } from './space.js';
import { WORLD_ORDER } from './worlds.js';
import { fmtInt, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const UNIT_KM = 37000;
const C_UNITS = 300000 / UNIT_KM;
const SHORT = { mercury: 'Мер', venus: 'Вен', earth: 'Зем', moon: 'Луна', mars: 'Мар', jupiter: 'Юп', saturn: 'Сат', uranus: 'Уран', neptune: 'Неп' };

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.hp = document.querySelector('.bar.hp i'); this.en = document.querySelector('.bar.en i'); this.enBar = document.querySelector('.bar.en');
    this.hpNum = $('hp-num'); this.enNum = $('en-num'); this.solar = $('solar');
    this.speed = $('speed'); this.mach = $('mach'); this.alt = $('alt'); this.speedLbl = document.querySelector('#flight .lbl');
    this.obj = $('objective'); this.wname = $('world-name'); this.wsub = $('world-sub');
    this.boss = $('boss'); this.bossName = $('boss-name'); this.bossBar = document.querySelector('#boss .bar i');
    this.cross = $('crosshair'); this.charge = $('charge'); this.chargeBar = document.querySelector('#charge i');
    this.markers = $('markers'); this.toasts = $('toasts'); this.hintEl = $('hint');
    this.ab = {};
    document.querySelectorAll('.ab').forEach((e) => (this.ab[e.dataset.ab] = e));
    this.pool = [];
    this.crystals = $('crystals');
    WORLD_ORDER.forEach((id) => {
      const d = document.createElement('div');
      d.className = 'cr'; d.dataset.id = id;
      d.innerHTML = `<span>${SHORT[id]}</span>`;
      this.crystals.appendChild(d);
    });
    this.slowT = 0; this.hintT = 0; this.lastObj = '';
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setWorld(name, sub) { this.wname.textContent = name; this.wsub.textContent = sub ?? ''; }

  updateCrystals(save) {
    this.crystals.querySelectorAll('.cr').forEach((d) => d.classList.toggle('on', save.has(d.dataset.id)));
  }

  toast(msg, big = false) {
    const d = document.createElement('div');
    d.className = 'toast' + (big ? ' big' : '');
    d.innerHTML = msg;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), big ? 4200 : 3200);
    setTimeout(() => d.remove(), big ? 4900 : 3900);
  }

  hint(msg) { this.hintEl.textContent = msg; this.hintT = 2.5; }

  _marker(i) {
    let m = this.pool[i];
    if (!m) { m = document.createElement('div'); this.markers.appendChild(m); this.pool[i] = m; }
    m.style.display = '';
    return m;
  }

  // project world point -> screen; returns null if behind
  _proj(p, cam, clampEdge = false) {
    _v.copy(p).project(cam);
    const behind = _v.z > 1;
    let x = _v.x, y = _v.y;
    if (behind) { x = -x; y = -y; }
    const W = innerWidth, H = innerHeight;
    const on = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1;
    if (!on && !clampEdge) return null;
    if (!on) {
      const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88);
      x *= k; y *= k;
    }
    return { x: (x * 0.5 + 0.5) * W, y: (-y * 0.5 + 0.5) * H, on };
  }

  update(dt) {
    const g = this.game, P = g.player, w = g.world, cam = g.camera;
    if (!w) return;
    this.hp.style.width = `${P.health}%`;
    this.en.style.width = `${(P.energy / P.maxEnergy) * 100}%`;
    this.hpNum.textContent = Math.round(P.health);
    this.enNum.textContent = Math.round(P.energy);
    const over = P.overcharge > 0 || w.cfg?.overcharge;
    this.enBar.classList.toggle('over', !!over);
    this.solar.textContent = P.overcharge > 0 ? `☀ СОЛНЕЧНАЯ ПЕРЕГРУЗКА · ${Math.ceil(P.overcharge)} с` : w.cfg?.overcharge ? '☀ СОЛНЕЧНАЯ ПЕРЕГРУЗКА (Меркурий)' : `Солнечная подзарядка ×${P.solar.toFixed(P.solar < 1 ? 2 : 1)}`;

    const sp = P.vel.length();
    if (w.kind === 'space') {
      const c = sp / C_UNITS;
      this.speed.textContent = c >= 1 ? (c < 100 ? c.toFixed(1) : fmtInt(c)) : fmtInt(sp * UNIT_KM);
      this.speedLbl.textContent = c >= 1 ? 'скоростей света' : 'км/с';
      this.mach.textContent = P.autopilot ? 'АВТОПИЛОТ' : '';
      let best = null, bd = 1e12;
      for (const p of w.planets) { const d = p.pos.distanceTo(P.pos) - p.def.R; if (d < bd) { bd = d; best = p; } }
      const ds = P.pos.length() - 2600;
      if (ds < bd) { bd = ds; best = { def: { name: 'Солнце' } }; }
      this.alt.textContent = `${best.def.name}: ${fmtDist(bd)}`;
    } else {
      this.speed.textContent = fmtInt(sp * 3.6);
      this.speedLbl.textContent = 'км/ч';
      this.mach.textContent = sp > 250 ? `МАХ ${(sp / 343).toFixed(1)}` : '';
      const gnd = w.groundAt(P.pos.x, P.pos.z);
      this.alt.textContent = gnd > -1e8 ? `Высота ${fmtInt(Math.max(0, P.pos.y - Math.max(gnd, w.waterLevel ?? -1e9) - 0.95))} м` : `Высота ${fmtInt(P.pos.y)} м`;
      if (w.cfg.wind) this.alt.textContent += ` · ветер ${fmtInt(w.wind.length() * 3.6 * 6)} км/ч`;
    }

    // objective
    let text = w.kind === 'space'
      ? (w.target ? `Цель: <b>${w.target.def.name}</b> — ${fmtDist(w.target.pos.distanceTo(P.pos) - w.target.def.R)}<br>Держи <b>W + Shift</b> для гиперскорости или включи автопилот (<b>T</b>). <b>Tab</b> — сменить цель.`
        : 'Выбери планету: <b>Tab</b> или карта (<b>M</b>). Подлети вплотную — начнётся вход в атмосферу.<br>Пролети рядом с Солнцем — получишь <b>солнечную перегрузку</b>.')
      : w.objective?.text ?? '';
    if (text !== this.lastObj) { this.obj.innerHTML = text; this.lastObj = text; }

    // boss bar
    const boss = w.objective?.boss;
    if (boss && boss.alive && boss.center.distanceTo(P.pos) < 900) {
      this.boss.classList.remove('hidden');
      this.bossName.textContent = boss.name;
      this.bossBar.style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
    } else this.boss.classList.add('hidden');

    // abilities
    const ab = this.ab;
    ab.heat.classList.toggle('on', !!P.heat);
    ab.freeze.classList.toggle('on', !!P.freezing);
    ab.xray.classList.toggle('on', !!P.xray);
    ab.slow.classList.toggle('on', !!P.slow);
    ab.grab.classList.toggle('on', !!P.holding);
    ab.punch.classList.toggle('on', P.charging && P.charge > 0.15);
    ab.slam.classList.toggle('cd', P.slamCD > 0);
    ab.slam.style.setProperty('--cd', `${clamp(P.slamCD / 1.0, 0, 1) * 100}%`);
    for (const k of ['heat', 'freeze', 'slam', 'grab', 'punch']) ab[k].classList.toggle('na', w.kind === 'space');
    ab.grab.querySelector('span').textContent = P.holding ? 'Бросить' : 'Схватить';

    this.cross.classList.toggle('lock', !!P.lock);
    this.charge.style.opacity = P.charging && P.charge > 0.15 ? 1 : 0;
    this.chargeBar.style.width = `${clamp((P.charge - 0.15) / 0.85, 0, 1) * 100}%`;

    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hintEl.textContent = ''; }

    // markers
    let n = 0;
    if (w.kind === 'space') {
      for (const p of w.planets) {
        const s = this._proj(p.pos, cam, p === w.target);
        if (!s) continue;
        const m = this._marker(n++);
        m.className = 'mk planet' + (p === w.target ? ' sel' : '') + (s.on ? '' : ' edge');
        const d = p.pos.distanceTo(P.pos) - p.def.R;
        const html = `${p.def.name}${g.save.has(p.def.id) ? ' ◆' : ''}<small>${fmtDist(d)}</small>`;
        if (m._h !== html) { m.innerHTML = html; m._h = html; }
        m.style.left = `${s.x}px`; m.style.top = `${s.y + 18}px`;
      }
    } else {
      if (w.enemies) for (const e of w.enemies.list) {
        if (!e.alive || e.state === 'grabbed') continue;
        const d = e.center.distanceTo(P.pos);
        if (d > 1200) continue;
        const s = this._proj(e.center, cam, e.boss || d < 250);
        if (!s) continue;
        const m = this._marker(n++);
        m.className = 'mk enemy' + (e.boss || e.def.mini ? ' boss' : '') + (e.frozen > 0 ? ' frozen' : '') + (s.on ? '' : ' off');
        if (m._h) { m.innerHTML = ''; m._h = ''; }
        m.style.left = `${s.x}px`; m.style.top = `${s.y}px`;
        if (!s.on) {
          const ang = Math.atan2(s.y - innerHeight / 2, s.x - innerWidth / 2);
          m.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
        } else m.style.transform = '';
      }
      const mk = w.objective?.marker;
      if (mk) {
        const s = this._proj(mk, cam, true);
        if (s) {
          const m = this._marker(n++);
          m.className = 'mk obj' + (s.on ? '' : ' edge');
          m.style.transform = '';
          const html = `${fmtInt(mk.distanceTo(P.pos))} м`;
          if (m._h !== html) { m.innerHTML = html; m._h = html; }
          m.style.left = `${s.x}px`; m.style.top = `${s.y}px`;
        }
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }
}

export function fmtDist(u) {
  const km = Math.max(0, u) * UNIT_KM;
  if (km > 1e6) return `${(km / 1e6).toFixed(km > 1e8 ? 0 : 1)} млн км`;
  if (km > 1000) return `${fmtInt(km)} км`;
  return `${Math.round(km)} км`;
}

export function buildSolarMap(game, onPick) {
  const el = $('solar-map');
  el.innerHTML = '';
  const W = el.clientWidth || 900;
  const items = PLANETS;
  const sizes = { mercury: 12, venus: 20, earth: 21, moon: 9, mars: 15, jupiter: 52, saturn: 44, uranus: 28, neptune: 27 };
  const cols = { mercury: '#9a9088', venus: '#e8c888', earth: '#3a7ad8', moon: '#b0b0ac', mars: '#c4643c', jupiter: '#d8b890', saturn: '#e8d6a8', uranus: '#9fe0e8', neptune: '#3a5ad8' };
  const here = game.world?.kind === 'surface' ? game.world.id : null;
  items.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'sm-p' + (game.save.has(p.id) ? ' done' : '') + (game.space?.target?.def.id === p.id ? ' sel' : '') + (here === p.id ? ' here' : '');
    const x = 0.1 + (i / (items.length - 1)) * 0.86;
    d.style.left = `${x * 100}%`;
    if (p.id === 'moon') d.style.top = '72%';
    const s = sizes[p.id];
    d.innerHTML = `<div class="dot" style="width:${s}px;height:${s}px;background:${cols[p.id]}${p.ring ? ';box-shadow:0 0 0 3px rgba(230,210,160,.35), inset -6px -4px 10px rgba(0,0,0,.6)' : ''}"></div><div class="nm">${p.name}</div><div class="st">${p.info}</div>`;
    d.addEventListener('click', () => { onPick(p.id); buildSolarMap(game, onPick); });
    el.appendChild(d);
  });
}
