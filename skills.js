// M2 스킬 진화 (docs/EMPEROR_MODE.md). 피해는 모두 "기본 브레스 한 발 피해(bolt)"의 배수라 레벨·위계에 따라 함께 성장한다.
// 반경은 월드 m (적이 무리로 50m 안에 퍼지고 단계마다 커지므로 설계안보다 넓게 잡음).
import * as T from './vendor/three.module.js';

// ---------- 데이터 (테스트 가능, 순수) ----------
// FIRE 진화: splash(범위·비율), pierce(추가 관통 수), burn(초당 bolt 배수·지속), chain(확률·횟수·거리·비율)
export const FIRE_TRAITS = {
  flame: [
    {name: '불씨 연사'},
    {name: '용암탄', splash: {r: 9, k: .5}},
    {name: '화염 빔탄', pierce: 2, burn: {k: .15, t: 3}},
    {name: '황금 태양불', splash: {r: 18, k: 1}},
  ],
  storm: [
    {name: '전격 연사', chain: {p: .35, n: 1, r: 26, k: .6}},
    {name: '구름 구슬', chain: {p: 1, n: 2, r: 30, k: .6}},
    {name: '갈래 번개', chain: {p: 1, n: 3, r: 36, k: .65}},
    {name: '천뢰', chain: {p: 1, n: 4, r: 46, k: .7}},
  ],
};
// 슬롯별 단계 해금: skill1 2단계, skill2 3단계, ult 4단계. 배열 index = 단계-1 (null = 잠김)
export const SKILLS = {
  flame: {
    skill1: [null,
      {name: '마그마 메테오', kind: 'meteor', cd: 8, count: 1, r: 24, k: 6},
      {name: '화염 토네이도', kind: 'tornado', cd: 9, dur: 4, r: 20, k: 1.6, tick: .4, speed: 45},
      {name: '유성우', kind: 'meteor', cd: 10, count: 8, spread: 55, r: 26, k: 4}],
    skill2: [null, null,
      {name: '화염 방패', kind: 'aura', cd: 16, dur: 5, r: 26, k: 1, tick: .5, reduce: .6, eatBolts: false},
      {name: '태양 갑주', kind: 'aura', cd: 16, dur: 7, r: 40, k: 2, tick: .5, reduce: .8, eatBolts: true}],
    ult: [null, null, null, {name: '선폴', kind: 'pillars', count: 8, r: 30, k: 12, spread: 120, slow: .45}],
  },
  storm: {
    skill1: [null,
      {name: '낙뢰 표식', kind: 'strike', cd: 8, targets: 4, range: 150, r: 10, k: 5},
      {name: '뇌운 소용돌이', kind: 'cloud', cd: 9, dur: 5, range: 75, targets: 2, k: 2.5, tick: .5},
      {name: '천둥 군림', kind: 'strike', cd: 10, targets: 99, range: 170, r: 14, k: 6}],
    skill2: [null, null,
      {name: '정전기 장막', kind: 'aura', cd: 16, dur: 5, r: 30, k: 1.2, tick: .45, reduce: .5, eatBolts: true},
      {name: '폭풍 후광', kind: 'aura', cd: 16, dur: 7, r: 46, k: 1.5, tick: .4, reduce: .7, eatBolts: true, zaps: 3}],
    ult: [null, null, null, {name: '천뢰 강림', kind: 'pillars', count: 12, r: 26, k: 10, spread: 130, slow: .45}],
  },
};
export const SLOT_UNLOCK = {skill1: 2, skill2: 3, ult: 4};
export const fireTrait = (path, stage) => FIRE_TRAITS[path === 'storm' ? 'storm' : 'flame'][stage - 1];
export const skillFor = (path, slot, stage) => (path ? SKILLS[path][slot][stage - 1] : null) || null;
// 콤보: 2.5초 안에 다음 처치 → 이어짐. 표시 문구
export const COMBO_WINDOW = 2.5;
export const comboLabel = (n, stage) => n >= 30 && stage >= 4 ? '섬멸!' : n >= 15 ? '압도!' : n >= 6 ? '연속 처치!' : '';
// ULT 충전: 처치 +2.5, 초당 +0.6 (대관식은 100)
export const ULT_PER_KILL = 2.5, ULT_PER_SEC = .6;

// ---------- 실행 (게임 상태는 ctx로 주입) ----------
export function createSkillSystem(ctx) {
  const {scene} = ctx, fx = [], cds = {skill1: 0, skill2: 0, ult: 0};
  let aura = null;
  const add = o => { scene.add(o); return o; };
  const addMat = (color, opacity = .8) => new T.MeshBasicMaterial({color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide});
  const ringGeo = new T.RingGeometry(.86, 1, 48), sphereGeo = new T.SphereGeometry(1, 16, 12), pillarGeo = new T.CylinderGeometry(1, 1, 1, 20, 1, true);
  const _v = new T.Vector3(), _w = new T.Vector3();

  // 바닥이 아니라 하늘에서 싸우므로 충격파 링은 카메라를 바라보는 원판으로
  function ring(pos, radius, color, life = .45) {
    const m = add(new T.Mesh(ringGeo, addMat(color, .9))); m.position.copy(pos); m.lookAt(ctx.camera.position);
    fx.push({o: m, t: 0, life, update(f, a) { m.scale.setScalar(radius * (.25 + .75 * Math.sqrt(a))); m.material.opacity = .9 * (1 - a); }});
  }
  function pillar(pos, radius, height, color, life = .7) {
    const op = height > 100 ? .45 : .75, m = add(new T.Mesh(pillarGeo, addMat(color, op))); m.position.copy(pos); m.scale.set(radius * .45, height, radius * .45);
    fx.push({o: m, t: 0, life, update(f, a) { const w = radius * (.45 + .35 * Math.sin(Math.min(1, a * 2) * Math.PI / 2)); m.scale.set(w * (1 - a * .6), height, w * (1 - a * .6)); m.material.opacity = op * (1 - a); }});
  }
  // 지그재그 번개 선
  function bolt(a, b, color = 0xbff6ff, life = .18) {
    const pts = [], n = 8; for (let i = 0; i <= n; i++) { _v.lerpVectors(a, b, i / n); if (i && i < n) _v.add(_w.set((Math.random() - .5) * 6, (Math.random() - .5) * 6, (Math.random() - .5) * 6)); pts.push(_v.clone()); }
    const l = add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({color, transparent: true, blending: T.AdditiveBlending})));
    fx.push({o: l, t: 0, life, geo: true, update(f, a2) { l.material.opacity = 1 - a2; }});
  }

  // 범위 피해: 일반 적 + 보스. 처치 수 반환
  function aoe(center, radius, mult, color) {
    const dmg = ctx.boltDamage() * mult; let killed = 0;
    for (const e of [...ctx.enemies()]) { const r = radius + 2 * ((e.userData.grow || 1) - 1); if (e.position.distanceToSquared(center) < r * r) killed += ctx.damageEnemy(e, dmg, color) ? 1 : 0; }
    const b = ctx.boss(); if (b && b.position.distanceTo(center) < radius + b.userData.radius) ctx.damageBoss(dmg, center);
    if (killed >= 2) ctx.hitStop(.06);
    return killed;
  }
  function nearest(from, range, count, exclude) {
    const list = []; const r2 = range * range;
    for (const e of ctx.enemies()) { if (exclude?.has(e)) continue; const d = e.position.distanceToSquared(from); if (d < r2) list.push([d, e]); }
    return list.sort((a, b) => a[0] - b[0]).slice(0, count).map(x => x[1]);
  }

  // ---------- FIRE 진화: 브레스 명중 시 호출 ----------
  function onBoltHit(path, stage, hit, pos, dmg) {
    const t = fireTrait(path, stage);
    if (t.splash) { ring(pos, t.splash.r, stage >= 4 ? 0xffd27a : 0xff7a2a, .35); aoe(pos, t.splash.r, t.splash.k * dmg / ctx.boltDamage(), 0xff8a2a); }
    if (t.burn && hit) hit.userData.burn = {k: t.burn.k * dmg, t: t.burn.t, acc: 0};
    if (t.chain && Math.random() < t.chain.p) {
      const seen = new Set(hit ? [hit] : []); let from = pos.clone();
      for (let i = 0; i < t.chain.n; i++) {
        const [e] = nearest(from, t.chain.r, 1, seen); if (!e) break;
        seen.add(e); bolt(from, e.position); ctx.damageEnemy(e, dmg * t.chain.k, 0x9ff0ff); from = e.position.clone();
      }
    }
  }
  // 화상 지속 피해
  function updateBurns(dt) {
    for (const e of [...ctx.enemies()]) {
      const b = e.userData.burn; if (!b) continue;
      b.t -= dt; b.acc += dt; if (b.acc >= .5) { b.acc -= .5; ctx.damageEnemy(e, b.k * .5, 0xff6a1a, true); }
      if (b.t <= 0) e.userData.burn = null;
    }
  }

  // ---------- 스킬 시전 ----------
  function cast(slot, path, stage) {
    const s = skillFor(path, slot, stage);
    if (!s || cds[slot] > 0) return false;
    if (slot === 'ult') { if (ctx.ult() < 100) return false; ctx.setUlt(0); }
    else cds[slot] = s.cd;
    const P = ctx.player.position, aim = ctx.aimPoint(160), storm = path === 'storm';
    ctx.banner?.(s.name, slot === 'ult' ? '궁극기' : '', 1.1);
    if (s.kind === 'meteor') {
      for (let i = 0; i < s.count; i++) {
        const target = aim.clone(); if (s.spread) target.add(_v.set((Math.random() - .5) * 2 * s.spread, (Math.random() - .5) * s.spread * .5, (Math.random() - .5) * 2 * s.spread));
        const m = add(new T.Mesh(sphereGeo, addMat(0xffa23a, 1))); m.scale.setScalar(4 + s.r * .15);
        const start = target.clone().add(_v.set(30, 110, 30)), delay = i * .12;
        m.position.copy(start); m.visible = false;
        fx.push({o: m, t: -delay, life: .55, update(f, a) {
          if (f.t < 0) return; m.visible = true; m.position.lerpVectors(start, target, a);
          if (Math.random() < .8) ctx.spark(m.position, 0xff8a2a, _w.set(0, 20, 0), 8, .4);
        }, end() { ring(target, s.r, 0xffb04a, .5); pillar(target, s.r * .5, s.r * 2.2, 0xff7a1a, .4); ctx.burst(target, 0xffa33d, 60, 45, 2); ctx.shake(.6); aoe(target, s.r, s.k, 0xff8a2a); }});
      }
    } else if (s.kind === 'tornado') {
      const pos = P.clone().addScaledVector(ctx.forward(), 30), dir = ctx.forward().clone(), m = add(new T.Mesh(pillarGeo, addMat(0xff6a1a, .55)));
      m.scale.set(s.r * .5, s.r * 3, s.r * .5); let tick = 0;
      fx.push({o: m, t: 0, life: s.dur, update(f, a, dt) {
        pos.addScaledVector(dir, s.speed * dt); m.position.copy(pos); m.rotation.y += dt * 9; m.material.opacity = .55 * (1 - a * .6);
        for (const e of ctx.enemies()) { const d = e.position.distanceTo(pos); if (d < s.r * 2.2 && d > 2) e.position.lerp(pos, Math.min(1, dt * 1.6)); }
        if ((tick -= dt) <= 0) { tick = s.tick; aoe(pos, s.r, s.k, 0xff6a1a); for (let j = 0; j < 10; j++) ctx.spark(_v.copy(pos).add(_w.set((Math.random() - .5) * s.r, (Math.random() - .5) * s.r * 2, (Math.random() - .5) * s.r)), j % 2 ? 0xffd27a : 0xff5a1a, _w.set(0, 25, 0), 9, .6); }
      }});
      ctx.shake(.4);
    } else if (s.kind === 'strike') {
      const targets = nearest(P, s.range, s.targets); const b = ctx.boss();
      targets.forEach((e, i) => fx.push({o: null, t: -i * .05, life: .01, update() {}, end() {
        if (!e.parent) return; const top = e.position.clone().add(_v.set(0, 90, 0)); bolt(top, e.position, 0xe6fbff, .25); pillar(e.position, s.r, 60, 0x7fe0ff, .3);
        ctx.burst(e.position, 0x9ff0ff, 25, 30, 1.5); aoe(e.position, s.r, s.k, 0x9ff0ff); }}));
      if (b && b.position.distanceTo(P) < s.range + 60) { bolt(b.position.clone().add(_v.set(0, 120, 0)), b.position, 0xffffff, .3); ctx.damageBoss(ctx.boltDamage() * s.k * 2.5, b.position); }
      ctx.shake(stage >= 4 ? 1 : .5);
    } else if (s.kind === 'cloud') {
      const m = add(new T.Mesh(sphereGeo, addMat(0x5a6cff, .35))); m.scale.set(26, 8, 26); let tick = 0;
      fx.push({o: m, t: 0, life: s.dur, update(f, a, dt) {
        m.position.copy(ctx.player.position).add(_v.set(0, 28, 0)); m.rotation.y += dt;
        if ((tick -= dt) <= 0) { tick = s.tick; for (const e of nearest(ctx.player.position, s.range, s.targets)) { bolt(m.position, e.position); ctx.damageEnemy(e, ctx.boltDamage() * s.k, 0x9ff0ff); }
          const b = ctx.boss(); if (b && b.position.distanceTo(ctx.player.position) < s.range + b.userData.radius) { bolt(m.position, b.position); ctx.damageBoss(ctx.boltDamage() * s.k, b.position); } }
      }});
    } else if (s.kind === 'aura') {
      const m = add(new T.Mesh(sphereGeo, addMat(storm ? 0x63dcff : 0xff8a2a, .16))); m.scale.setScalar(s.r);
      aura = {s, t: s.dur, tick: 0, m}; ring(P, s.r, storm ? 0x9ff0ff : 0xffb04a, .5);
    } else if (s.kind === 'pillars') {
      ctx.slowmo(s.slow, .3); ctx.shake(1.4); ctx.burst(P, storm ? 0xbff6ff : 0xffdc88, 140, 60, 3);
      const b = ctx.boss(), picks = nearest(P, s.spread * 1.3, s.count);
      for (let i = 0; i < s.count; i++) {
        const at = picks[i]?.position.clone() || P.clone().addScaledVector(ctx.forward(), 40 + Math.random() * s.spread).add(_v.set((Math.random() - .5) * s.spread, (Math.random() - .5) * 30, (Math.random() - .5) * s.spread));
        if (i === 0 && b && b.position.distanceTo(P) < 260) at.copy(b.position);
        fx.push({o: null, t: -.12 * i, life: .01, update() {}, end() {
          pillar(at, s.r, 160, storm ? 0x9ff0ff : 0xffc24a, .9); ring(at, s.r * 1.6, storm ? 0xe6fbff : 0xfff1c1, .6);
          if (storm) bolt(at.clone().add(_v.set(0, 160, 0)), at, 0xffffff, .3);
          ctx.burst(at, storm ? 0x9ff0ff : 0xffa33d, 50, 50, 2.5); ctx.shake(.5); aoe(at, s.r, s.k, storm ? 0x9ff0ff : 0xffb04a);
        }});
      }
    }
    return true;
  }

  function update(dt, realDt) {
    for (const k in cds) cds[k] = Math.max(0, cds[k] - dt);
    updateBurns(dt);
    if (aura) {
      const {s} = aura; aura.t -= dt; aura.m.position.copy(ctx.player.position); aura.m.material.opacity = .1 + .08 * Math.sin(aura.t * 8);
      if ((aura.tick -= dt) <= 0) {
        aura.tick = s.tick; const P = ctx.player.position;
        if (s.zaps) for (const e of nearest(P, s.r * 1.6, s.zaps)) { bolt(P, e.position); ctx.damageEnemy(e, ctx.boltDamage() * s.k, 0x9ff0ff); }
        aoe(P, s.r, s.k, 0xffb04a);
      }
      if (s.eatBolts) ctx.clearBoltsNear(ctx.player.position, s.r);
      if (aura.t <= 0) { scene.remove(aura.m); aura = null; }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt; if (f.t < 0) continue;
      const a = Math.min(1, f.t / f.life); f.update(f, a, dt);
      if (f.t >= f.life) { f.end?.(); if (f.o) { scene.remove(f.o); if (f.geo) f.o.geometry.dispose(); f.o.material?.dispose?.(); } fx.splice(i, 1); }
    }
  }
  // 첫 시전 끊김 방지: 스킬에 쓰는 재질·지오메트리를 미리 한 번 컴파일
  function prewarm(renderer, camera) {
    const g = new T.Group(), mats = [addMat(0xffffff), new T.LineBasicMaterial({color: 0xffffff, transparent: true, blending: T.AdditiveBlending})];
    for (const geo of [ringGeo, sphereGeo, pillarGeo]) g.add(new T.Mesh(geo, mats[0]));
    g.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 1, 0)]), mats[1]));
    g.position.copy(camera.position); scene.add(g);
    try { renderer.compile(scene, camera); } finally { scene.remove(g); }
  }
  const damageReduce = () => aura ? aura.s.reduce : 0;
  function reset() { for (const f of fx) if (f.o) scene.remove(f.o); fx.length = 0; if (aura) scene.remove(aura.m); aura = null; for (const k in cds) cds[k] = 0; }
  return {cast, update, onBoltHit, damageReduce, reset, prewarm, cooldowns: cds, ring, get auraActive() { return !!aura; }};
}
