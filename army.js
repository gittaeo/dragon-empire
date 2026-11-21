// 세 밤 병사·주민 (DEFENSE_V2_DECISION.md §3.6, M1) — Claude
// 집 → 주민, 막사 → 주민을 창병으로. 병사 = min(주민, 막사 정원). 남는 주민 = 일꾼(아침 수입, M2 연출).
// 병사 AI 4상태: idle(슬롯 대기) → engage(슬롯 8m 안 지상 적 추격·공격) → return → down(쓰러짐, 아침 복귀). 경로 탐색 없음.
import * as T from './vendor/three.module.js';

export const SOLDIER = {hp: 80, hpLv2: 110, dmg: 8, rate: .8, reach: 2.5, leash: 8, speed: 5.5, slotR: 38, spacing: 2.5};

export function createArmy({scene, groundAt, towerPos, hitEnemy, burst, sfx}) {
  const skin = new T.MeshStandardMaterial({color: 0xe6bf9a, roughness: .8});
  const tunic = new T.MeshStandardMaterial({color: 0x2f5a8a, roughness: .8}), steel = new T.MeshStandardMaterial({color: 0xb8bcc4, metalness: .6, roughness: .35});
  const wood = new T.MeshStandardMaterial({color: 0x6a4424, roughness: .9}), helm = new T.MeshStandardMaterial({color: 0x8a8f98, metalness: .5, roughness: .4});
  const cloth = [0x8a5a3a, 0x5a7a4a, 0x7a4a6a, 0x4a6a8a, 0x9a7a3a, 0x6a4a3a];
  const bodyGeo = new T.CapsuleGeometry(.26, .7, 4, 8), headGeo = new T.SphereGeometry(.2, 10, 8), legGeo = new T.CapsuleGeometry(.09, .5, 3, 6);
  const spearGeo = new T.CylinderGeometry(.03, .03, 2.4, 5), tipGeo = new T.ConeGeometry(.07, .3, 6), helmGeo = new T.SphereGeometry(.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const ringGeo = new T.RingGeometry(.35, .45, 16), hpMat = new T.MeshBasicMaterial({color: 0x7fe07f, side: T.DoubleSide});

  function personMesh(soldier, color) {
    const g = new T.Group();
    const body = new T.Mesh(bodyGeo, soldier ? tunic : new T.MeshStandardMaterial({color, roughness: .85})); body.position.y = 1.0; g.add(body);
    const head = new T.Mesh(headGeo, skin); head.position.y = 1.62; g.add(head);
    const legs = [-1, 1].map(s => { const l = new T.Mesh(legGeo, wood); l.position.set(s * .12, .36, 0); g.add(l); return l; });
    if (soldier) {
      const h = new T.Mesh(helmGeo, helm); h.position.y = 1.66; g.add(h);
      const sp = new T.Group(); const shaft = new T.Mesh(spearGeo, wood); sp.add(shaft); const tip = new T.Mesh(tipGeo, steel); tip.position.y = 1.35; sp.add(tip);
      sp.position.set(.34, 1.1, -.1); sp.rotation.x = -.25; g.add(sp); g.userData.spear = sp;
      const bar = new T.Mesh(new T.PlaneGeometry(.6, .07), hpMat.clone()); bar.position.y = 2.1; g.add(bar); g.userData.bar = bar;
    }
    g.userData.legs = legs; return g;
  }

  // ── 주민 (낮에만, 집 주변 배회) ──
  const folk = [];
  function setResidents(homes) { // homes: [{pos, count}]
    const want = []; for (const h of homes) for (let i = 0; i < h.count; i++) want.push(h.pos);
    while (folk.length > want.length) scene.remove(folk.pop().mesh);
    want.forEach((home, i) => {
      let f = folk[i];
      if (!f) { const m = personMesh(false, cloth[i % cloth.length]); scene.add(m); f = folk[i] = {mesh: m, home, t: Math.random() * 6, to: null};
        const p = home.clone().add(new T.Vector3(1.5, 0, 2.2)); m.position.set(p.x, groundAt(p.x, p.z), p.z); burst?.(m.position.clone().add(new T.Vector3(0, 1, 0)), 0xffd27a, 12, 4, .3); }
      f.home = home;
    });
  }
  function updateFolk(dt, visible) {
    for (const f of folk) {
      f.mesh.visible = visible; if (!visible) continue;
      f.t -= dt; const m = f.mesh;
      if (!f.to || f.t <= 0) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; f.to = f.home.clone().add(new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); f.t = 3 + Math.random() * 4; }
      const d = new T.Vector3(f.to.x - m.position.x, 0, f.to.z - m.position.z), L = d.length();
      if (L > .2) { const s = Math.min(L, 1.4 * dt); m.position.addScaledVector(d.divideScalar(L), s); m.rotation.y = Math.atan2(d.x, d.z); f.walk = (f.walk || 0) + dt * 7; }
      m.position.y = groundAt(m.position.x, m.position.z);
      const sw = L > .2 ? Math.sin(f.walk) * .5 : 0; m.userData.legs[0].rotation.x = sw; m.userData.legs[1].rotation.x = -sw;
    }
  }

  // ── 병사 ──
  const soldiers = [];
  let rally = null; // 막사 위치(낮 대기)
  const dirPos = (a, r) => { const x = towerPos.x + Math.sin(a) * r, z = towerPos.z - Math.cos(a) * r; return new T.Vector3(x, groundAt(x, z), z); };
  function setSoldiers(n, maxHp, barracksPos) {
    rally = barracksPos;
    while (soldiers.length > n) scene.remove(soldiers.pop().mesh);
    for (let i = soldiers.length; i < n; i++) {
      const m = personMesh(true); const p = barracksPos.clone().add(new T.Vector3((i % 3 - 1) * 1.3, 0, 2 + Math.floor(i / 3) * 1.3));
      m.position.set(p.x, groundAt(p.x, p.z), p.z); scene.add(m); burst?.(m.position.clone().add(new T.Vector3(0, 1, 0)), 0x9fd0ff, 14, 4, .3);
      soldiers.push({mesh: m, hp: maxHp, max: maxHp, state: 'idle', slot: p.clone(), cd: 0, target: null, idx: i});
    }
    for (const s of soldiers) { s.max = maxHp; }
  }
  // 해질녘 배치: 병사 ≤3 → 지상 적 많은 방향 전원, ≥4 → ⌈n/2⌉ / ⌊n/2⌋
  function deploy(dirA, dirB) {
    const n = soldiers.length, nA = n <= 3 || !dirB ? n : Math.ceil(n / 2);
    soldiers.forEach((s, i) => { const dir = i < nA ? dirA : dirB, k = i < nA ? i : i - nA, cnt = i < nA ? nA : n - nA;
      const off = (k - (cnt - 1) / 2) * SOLDIER.spacing, base = dirPos(dir.a, SOLDIER.slotR), side = new T.Vector3(Math.cos(dir.a), 0, Math.sin(dir.a));
      s.slot = base.clone().addScaledVector(side, off); s.slot.y = groundAt(s.slot.x, s.slot.z); s.dir = dir; s.state = s.hp > 0 ? 'return' : 'down'; });
  }
  // 아침: 전원 복귀(부상 회복) → 막사 앞
  function morning() {
    soldiers.forEach((s, i) => { s.hp = s.max; s.state = 'idle'; s.target = null; s.mesh.visible = true; s.mesh.rotation.z = 0;
      const p = (rally || towerPos).clone().add(new T.Vector3((i % 3 - 1) * 1.3, 0, 2 + Math.floor(i / 3) * 1.3)); s.slot = p; s.mesh.position.set(p.x, groundAt(p.x, p.z), p.z); s.mesh.traverse(o => { if (o.material?.transparent) o.material.opacity = 1; }); });
  }
  function hurt(s, n) {
    if (s.state === 'down') return; s.hp -= n; burst?.(s.mesh.position.clone().add(new T.Vector3(0, 1.2, 0)), 0xff6a4a, 8, 4, .3);
    if (s.hp <= 0) { s.hp = 0; s.state = 'down'; s.downT = 0; sfx?.('player_hurt', s.mesh.position); }
  }
  function moveTo(s, p, dt, speed) {
    const m = s.mesh, d = new T.Vector3(p.x - m.position.x, 0, p.z - m.position.z), L = d.length();
    if (L > .15) { m.position.addScaledVector(d.divideScalar(L), Math.min(L, speed * dt)); m.rotation.y = Math.atan2(d.x, d.z); s.walk = (s.walk || 0) + dt * 9; }
    m.position.y = groundAt(m.position.x, m.position.z);
    const sw = L > .15 ? Math.sin(s.walk) * .6 : 0; m.userData.legs[0].rotation.x = sw; m.userData.legs[1].rotation.x = -sw;
    return L;
  }
  function update(dt, {ground = [], night = false} = {}) {
    for (const s of soldiers) {
      const m = s.mesh; m.userData.bar.visible = night && s.state !== 'down'; m.userData.bar.scale.x = Math.max(.01, s.hp / s.max);
      if (s.state === 'down') { s.downT += dt; m.rotation.z = Math.min(1.4, s.downT * 3); if (s.downT > 1.2) m.visible = false; continue; }
      s.cd -= dt;
      if (!night) { moveTo(s, s.slot, dt, 3); continue; }
      // 표적: 슬롯 8m 안 가장 가까운 지상 적
      if (!s.target || !s.target.parent || s.target.position.distanceTo(s.slot) > SOLDIER.leash + 2) {
        s.target = null; let bd = SOLDIER.leash;
        for (const e of ground) { const d = Math.hypot(e.position.x - s.slot.x, e.position.z - s.slot.z); if (d < bd && e.parent) { bd = d; s.target = e; } }
      }
      if (s.target) {
        s.state = 'engage'; const L = moveTo(s, s.target.position, dt, SOLDIER.speed);
        if (L < SOLDIER.reach + (s.target.userData.radius || 1.2) && s.cd <= 0) { s.cd = SOLDIER.rate; hitEnemy?.(s.target, SOLDIER.dmg, 'soldier'); const sp = m.userData.spear; sp.position.z = -.5; setTimeout(() => { sp.position.z = -.1; }, 120); }
      } else { s.state = moveTo(s, s.slot, dt, SOLDIER.speed) > .3 ? 'return' : 'idle'; }
    }
  }
  return {setResidents, updateFolk, setSoldiers, deploy, morning, hurt, update, get soldiers() { return soldiers; }, get alive() { return soldiers.filter(s => s.state !== 'down').length; }};
}
