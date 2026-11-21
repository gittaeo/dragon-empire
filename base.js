// 세 밤 기지 건설 — 탑 둘레 고정 '건설 자리'에 걸어가 E로 짓고/올린다 (Claude)
// 참고: 낮에 기지를 키우고 밤에 지키는 디펜스(Thronefall 실플레이 분석) — 지은 건물은 다음 날에도 남아 누적 성장.
// - 목책(4방향): 그 방향 습격을 N회 막음, 아침마다 자동 복구 (실물은 fortify.js)
// - 망루(4곳): 밤에 가까운 습격자를 자동 사격
// - 집(3곳): 아침마다 재료 수입
// 규칙 수치는 BUILD 표 하나에 모음 (가설값 — 플레이테스트로 조정)
import * as T from './vendor/three.module.js';

export const BUILD = {
  wall: {name: '목책', levels: [{cost: {branch: 2, stone: 1}, charges: 5, desc: '이 방향 습격 5회 막음 · 아침마다 복구'}, {cost: {stone: 2, shard: 1}, charges: 9, desc: '막는 횟수 5 → 9'}]},
  tower: {name: '망루', levels: [{cost: {branch: 2, stone: 1, shard: 1}, dmg: 14, rate: 1.4, range: 120, desc: '밤에 가까운 등불을 자동 사격'}, {cost: {stone: 2, shard: 2}, dmg: 24, rate: .8, range: 150, desc: '피해·연사·사거리 강화'}]},
  house: {name: '집', levels: [{cost: {branch: 2}, income: {branch: 1, stone: 1}, desc: '아침마다 가지 1 · 돌 1'}, {cost: {branch: 1, stone: 2}, income: {branch: 2, stone: 1, shard: 1}, desc: '아침마다 가지 2 · 돌 1 · 파편 1'}]},
};
export const ITEM_NAME = {branch: '나뭇가지', stone: '돌', shard: '숨결 파편'};
export const costText = c => Object.entries(c).map(([k, n]) => `${ITEM_NAME[k]} ${n}`).join(' · ');

// 탑 기준 배치 (a: 0=북(-Z), 시계방향) — 목책 자리는 해당 방향, 망루는 대각, 집은 안쪽
export function padLayout(DIRS) {
  const pads = [];
  for (const d of DIRS) pads.push({id: 'wall_' + d.id, type: 'wall', dir: d, a: d.a, r: 25});
  for (let k = 0; k < 4; k++) pads.push({id: 'tower_' + k, type: 'tower', a: Math.PI / 4 + k * Math.PI / 2, r: 17});
  for (const [k, a] of [[0, Math.PI * .62], [1, Math.PI * 1.38], [2, Math.PI * 1.88]]) pads.push({id: 'house_' + k, type: 'house', a, r: 10});
  return pads;
}

export function createBase({scene, groundAt, towerPos, DIRS, burst, sfx, hitEnemy}) {
  const wood = new T.MeshStandardMaterial({color: 0x7a4e2a, roughness: .9}), dark = new T.MeshStandardMaterial({color: 0x4e331c, roughness: .95});
  const stone = new T.MeshStandardMaterial({color: 0x9a948a, roughness: .95}), roofM = new T.MeshStandardMaterial({color: 0x8a3b2a, roughness: .8});
  const wallW = new T.MeshStandardMaterial({color: 0xd8c8a6, roughness: .9});
  const glow = new T.MeshBasicMaterial({color: 0xffc85a, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending});
  const ringGeo = new T.RingGeometry(1.9, 2.3, 40);
  const pads = padLayout(DIRS);
  const at = (a, r) => { const x = towerPos.x + Math.sin(a) * r, z = towerPos.z - Math.cos(a) * r; return new T.Vector3(x, groundAt(x, z), z); };
  for (const p of pads) {
    p.pos = at(p.a, p.r); p.level = 0;
    p.ring = new T.Mesh(ringGeo, glow.clone()); p.ring.rotation.x = -Math.PI / 2; p.ring.position.copy(p.pos).add(new T.Vector3(0, .08, 0)); scene.add(p.ring);
    // 빈 자리 표시: 말뚝 하나 + 깃발 (무엇을 지을 자리인지 색으로)
    const flag = new T.Group(); const pole = new T.Mesh(new T.CylinderGeometry(.06, .06, 2, 5), dark); pole.position.y = 1; flag.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(.8, .5), new T.MeshBasicMaterial({color: {wall: 0xc9a25a, tower: 0x5aa0c9, house: 0xc95a5a}[p.type], side: T.DoubleSide})); cloth.position.set(.4, 1.7, 0); flag.add(cloth);
    flag.position.copy(p.pos); flag.rotation.y = -p.a; scene.add(flag); p.flag = flag;
  }
  const anims = [], add = (dur, step, done) => anims.push({t: 0, dur, step, done});
  const ease = k => 1 - (1 - k) ** 3;

  // ── 건물 모델 (절차 지오메트리) ──
  function towerModel(lv) {
    const g = new T.Group(), H = lv > 1 ? 9 : 7;
    if (lv > 1) { const base = new T.Mesh(new T.CylinderGeometry(2.1, 2.4, 2.2, 8), stone); base.position.y = 1.1; g.add(base); }
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) { const l = new T.Mesh(new T.CylinderGeometry(.16, .2, H, 6), wood); l.position.set(x, H / 2, z); l.rotation.set(z * .04, 0, -x * .04); g.add(l); }
    const deck = new T.Mesh(new T.BoxGeometry(3.4, .3, 3.4), dark); deck.position.y = H; g.add(deck);
    for (let i = 0; i < 4; i++) { const r = new T.Mesh(new T.BoxGeometry(3.4, .7, .12), wood), a = i * Math.PI / 2; r.position.set(Math.sin(a) * 1.65, H + .5, Math.cos(a) * 1.65); r.rotation.y = a; g.add(r); }
    const roof = new T.Mesh(new T.ConeGeometry(2.6, 1.8, 4), roofM); roof.position.y = H + 2.6; roof.rotation.y = Math.PI / 4; g.add(roof);
    for (const [x, z] of [[-1.4, -1.4], [1.4, 1.4]]) { const p = new T.Mesh(new T.CylinderGeometry(.08, .08, 1.8, 4), wood); p.position.set(x, H + 1.1, z); g.add(p); }
    const eye = new T.Mesh(new T.SphereGeometry(.35, 10, 8), new T.MeshBasicMaterial({color: 0x9fe8ff})); eye.position.y = H + 1.1; g.add(eye);
    g.userData.muzzle = H + 1.1; g.userData.eye = eye; return g;
  }
  function houseModel(lv) {
    const g = new T.Group(), w = lv > 1 ? 4.2 : 3.4, h = lv > 1 ? 3.6 : 2.6;
    const body = new T.Mesh(new T.BoxGeometry(w, h, w * .8), wallW); body.position.y = h / 2; g.add(body);
    const roof = new T.Mesh(new T.ConeGeometry(w * .82, 1.9, 4), roofM); roof.position.y = h + .9; roof.rotation.y = Math.PI / 4; roof.scale.z = .85; g.add(roof);
    const door = new T.Mesh(new T.BoxGeometry(.8, 1.4, .1), dark); door.position.set(0, .7, w * .4 + .02); g.add(door);
    const win = new T.Mesh(new T.BoxGeometry(.6, .5, .1), new T.MeshBasicMaterial({color: 0xffd27a})); win.position.set(w * .3, h * .6, w * .4 + .02); g.add(win);
    const ch = new T.Mesh(new T.BoxGeometry(.5, 1.4, .5), stone); ch.position.set(-w * .3, h + 1.1, 0); g.add(ch);
    if (lv > 1) { const shed = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.6), wood); shed.position.set(w * .7, .8, 0); g.add(shed); }
    return g;
  }
  function gateModel(lv) { // 목책 자리: 문 기둥(목책 자체는 fortify.js 호)
    const g = new T.Group(); const m = lv > 1 ? stone : wood;
    for (const x of [-1.3, 1.3]) { const p = new T.Mesh(new T.CylinderGeometry(.35, .4, 4.2, 6), m); p.position.set(x, 2.1, 0); g.add(p); const t = new T.Mesh(new T.ConeGeometry(.42, .8, 6), dark); t.position.set(x, 4.6, 0); g.add(t); }
    const bar = new T.Mesh(new T.BoxGeometry(3, .35, .3), dark); bar.position.y = 3.5; g.add(bar);
    const lamp = new T.Mesh(new T.SphereGeometry(.25, 8, 6), new T.MeshBasicMaterial({color: 0xffb04a})); lamp.position.y = 3.05; g.add(lamp);
    return g;
  }
  function placeModel(p) {
    if (p.model) scene.remove(p.model);
    const m = ({tower: towerModel, house: houseModel, wall: gateModel})[p.type](p.level);
    m.position.copy(p.pos); m.rotation.y = -p.a + (p.type === 'house' ? Math.PI : 0); scene.add(m); p.model = m; p.flag.visible = false;
    m.scale.set(1, .01, 1); add(.9, t => { m.scale.y = Math.max(.01, ease(t / .9)); }, () => burst?.(p.pos.clone().add(new T.Vector3(0, .5, 0)), 0xc8a676, 24, 7, .5));
    burst?.(p.pos.clone().add(new T.Vector3(0, .5, 0)), 0xb89366, 20, 9, .5); sfx?.('build_rise', p.pos);
  }
  function build(id) { const p = pads.find(q => q.id === id); if (!p) return null; p.level++; placeModel(p); return p; }
  const info = p => BUILD[p.type].levels[p.level - 1];
  const next = p => BUILD[p.type].levels[p.level];

  // ── 망루 사격 ──
  const shots = [], shotGeo = new T.SphereGeometry(.35, 8, 6), shotMat = new T.MeshBasicMaterial({color: 0x9fe8ff});
  function fire(p, target) {
    const from = p.pos.clone().add(new T.Vector3(0, p.model.userData.muzzle, 0)), o = new T.Mesh(shotGeo, shotMat); o.position.copy(from); scene.add(o);
    shots.push({o, target, dmg: info(p).dmg, speed: 150}); burst?.(from, 0x9fe8ff, 5, 6, .3);
  }
  function updateTowers(dt, raiders, active) {
    for (const p of pads) {
      if (p.type !== 'tower' || !p.level) continue;
      const s = info(p); p.cd = (p.cd ?? 0) - dt;
      if (p.model?.userData.eye) p.model.userData.eye.material.color.setHex(active ? 0x9fe8ff : 0x4a6a78);
      if (!active || p.cd > 0) continue;
      let best = null, bd = s.range * s.range; for (const e of raiders) { const d = e.position.distanceToSquared(p.pos); if (d < bd && e.parent) { bd = d; best = e; } }
      if (best) { fire(p, best); p.cd = s.rate; }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i], tg = s.target; if (!tg.parent) { scene.remove(s.o); shots.splice(i, 1); continue; }
      const to = tg.position.clone().sub(s.o.position), d = to.length(), step = s.speed * dt;
      if (d <= step + 1.5) { hitEnemy?.(tg, s.dmg); scene.remove(s.o); shots.splice(i, 1); continue; }
      s.o.position.addScaledVector(to.divideScalar(d), step);
    }
  }
  function clearShots() { for (const s of shots) scene.remove(s.o); shots.length = 0; }

  // 아침 수입 (살아남은 집 — 지금은 집이 파괴되지 않으므로 지은 집 전부)
  function income() { const sum = {}; for (const p of pads) if (p.type === 'house' && p.level) for (const [k, n] of Object.entries(info(p).income)) sum[k] = (sum[k] || 0) + n; return sum; }

  function update(dt, {raiders = [], active = false, day = false} = {}) {
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.step(Math.min(a.t, a.dur)); if (a.t >= a.dur) { anims.splice(i, 1); a.done?.(); } }
    const pulse = .35 + .25 * Math.sin(performance.now() / 300);
    for (const p of pads) { p.ring.visible = day && (!p.level || !!next(p)); p.ring.material.opacity = p.level ? pulse * .5 : pulse; }
    updateTowers(dt, raiders, active);
  }
  return {pads, build, info, next, income, update, clearShots, get towers() { return pads.filter(p => p.type === 'tower' && p.level).length; }};
}
