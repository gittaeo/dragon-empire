// 세 밤 기지 건설 — 탑 둘레 고정 '건설 자리'에 걸어가 E로 짓고/올린다 (Claude)
// 설계: docs/design/DEFENSE_V2_DECISION.md (디렉터 결정 · 팀 토론 + Codex 검토). 수치는 플레이테스트 전 시작값.
// - 집(3): 주민 +2/+1 → 막사 정원만큼 병사, 남는 주민은 일꾼(아침 수입)
// - 막사(1): 병사 정원 4/6 — 해질녘 성문 앞으로 행군, 지상 적(사슬 기사)과 싸움
// - 성문(4): 지상 전용 HP 300/700, 아침 무료 복구 (공중 적은 무시)
// - 망루(4): 날것 담당, 사거리 60/75m, 조준 고도 지면+45m 이하, 지상 피해 ×0.5
import * as T from './vendor/three.module.js';

export const BUILD = {
  house: {name: '집', levels: [{cost: {branch: 2, stone: 1}, pop: 2, desc: '주민 +2 — 막사가 있으면 병사, 없으면 일꾼'}, {cost: {branch: 1, stone: 2, shard: 1}, pop: 3, desc: '주민 +1 (집당 3명)'}]},
  barracks: {name: '막사', levels: [{cost: {branch: 3, stone: 2}, cap: 4, hp: 80, desc: '주민을 창병으로 — 정원 4, 해질녘 성문 앞 집결'}, {cost: {stone: 2, shard: 2}, cap: 6, hp: 110, desc: '정원 6 · 병사 체력 80 → 110'}]},
  gate: {name: '성문', levels: [{cost: {branch: 2, stone: 1}, hp: 300, desc: '걸어오는 적을 막음(HP 300) · 아침마다 복구'}, {cost: {stone: 3, shard: 1}, hp: 700, desc: '성문 HP 300 → 700'}]},
  tower: {name: '망루', levels: [{cost: {branch: 2, stone: 2}, dmg: 14, rate: 1.4, range: 60, desc: '날아오는 등불을 자동 사격(60m)'}, {cost: {stone: 2, shard: 2}, dmg: 24, rate: .8, range: 75, desc: '피해·연사·사거리 강화(75m)'}]},
};
export const TOWER_AIM_ALT = 45, TOWER_GROUND_MUL = .5;
export const ITEM_NAME = {branch: '나뭇가지', stone: '돌', shard: '숨결 파편'};
export const costText = c => Object.entries(c).map(([k, n]) => `${ITEM_NAME[k]} ${n}`).join(' · ');
const DEG = Math.PI / 180;

// §3.1 배치 (a: 0=북(-Z), 시계방향)
export function padLayout(DIRS) {
  const pads = [];
  for (const d of DIRS) pads.push({id: 'gate_' + d.id, type: 'gate', dir: d, a: d.a, r: 30});
  for (const [id, deg] of [['ne', 45], ['se', 135], ['sw', 225], ['nw', 315]]) pads.push({id: 'tower_' + id, type: 'tower', a: deg * DEG, r: 30});
  for (const [id, deg] of [['1', 300], ['2', 60], ['3', 240]]) pads.push({id: 'house_' + id, type: 'house', a: deg * DEG, r: 16});
  pads.push({id: 'barracks', type: 'barracks', a: 120 * DEG, r: 18});
  return pads;
}

export function createBase({scene, groundAt, towerPos, DIRS, burst, sfx, hitEnemy}) {
  const wood = new T.MeshStandardMaterial({color: 0x7a4e2a, roughness: .9}), dark = new T.MeshStandardMaterial({color: 0x4e331c, roughness: .95});
  const stone = new T.MeshStandardMaterial({color: 0x9a948a, roughness: .95}), roofM = new T.MeshStandardMaterial({color: 0x8a3b2a, roughness: .8});
  const wallW = new T.MeshStandardMaterial({color: 0xd8c8a6, roughness: .9}), blueM = new T.MeshStandardMaterial({color: 0x2f5a8a, roughness: .8});
  const glow = new T.MeshBasicMaterial({color: 0xffc85a, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending});
  const ringGeo = new T.RingGeometry(1.9, 2.3, 40);
  const FLAG = {gate: 0xc9a25a, tower: 0x5aa0c9, house: 0xc95a5a, barracks: 0x5ac97a};
  const pads = padLayout(DIRS);
  const at = (a, r) => { const x = towerPos.x + Math.sin(a) * r, z = towerPos.z - Math.cos(a) * r; return new T.Vector3(x, groundAt(x, z), z); };
  for (const p of pads) {
    p.pos = at(p.a, p.r); p.level = 0;
    p.ring = new T.Mesh(ringGeo, glow.clone()); p.ring.rotation.x = -Math.PI / 2; p.ring.position.copy(p.pos).add(new T.Vector3(0, .08, 0)); scene.add(p.ring);
    const flag = new T.Group(); const pole = new T.Mesh(new T.CylinderGeometry(.06, .06, 2, 5), dark); pole.position.y = 1; flag.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(.8, .5), new T.MeshBasicMaterial({color: FLAG[p.type], side: T.DoubleSide})); cloth.position.set(.4, 1.7, 0); flag.add(cloth);
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
  function barracksModel(lv) {
    const g = new T.Group(), w = lv > 1 ? 6 : 5;
    const body = new T.Mesh(new T.BoxGeometry(w, 2.6, 3.4), wood); body.position.y = 1.3; g.add(body);
    const roof = new T.Mesh(new T.CylinderGeometry(1.9, 1.9, w + .4, 3, 1), blueM); roof.rotation.z = Math.PI / 2; roof.position.y = 3.1; g.add(roof);
    const door = new T.Mesh(new T.BoxGeometry(1.2, 1.8, .1), dark); door.position.set(0, .9, 1.72); g.add(door);
    for (const x of [-w / 2 - .6, w / 2 + .6]) { const p = new T.Mesh(new T.CylinderGeometry(.07, .07, 4.2, 5), dark); p.position.set(x, 2.1, 1.4); g.add(p);
      const f = new T.Mesh(new T.PlaneGeometry(.9, 1.3), new T.MeshBasicMaterial({color: 0x2f6ab0, side: T.DoubleSide})); f.position.set(x + .48, 3.5, 1.4); g.add(f); }
    const rack = new T.Mesh(new T.BoxGeometry(1.6, .1, .1), dark); rack.position.set(w / 2 - .9, 1.4, 1.9); g.add(rack);
    if (lv > 1) { const tw = new T.Mesh(new T.BoxGeometry(1.6, 2, 1.6), stone); tw.position.set(-w / 2 + .8, 3.6, 0); g.add(tw); }
    return g;
  }
  function gateModel(lv) { // 성문: 문 기둥 + 문짝 (목책 호는 fortify.js)
    const g = new T.Group(); const m = lv > 1 ? stone : wood;
    for (const x of [-2.4, 2.4]) { const p = new T.Mesh(new T.BoxGeometry(1, 5.2, 1), m); p.position.set(x, 2.6, 0); g.add(p); const t = new T.Mesh(new T.ConeGeometry(.75, 1, 4), dark); t.position.set(x, 5.7, 0); t.rotation.y = Math.PI / 4; g.add(t); }
    const lintel = new T.Mesh(new T.BoxGeometry(5.8, .6, .8), m); lintel.position.y = 4.6; g.add(lintel);
    const doors = new T.Group(); for (const x of [-.95, .95]) { const d = new T.Mesh(new T.BoxGeometry(1.9, 3.8, .25), dark); d.position.set(x, 1.9, 0); doors.add(d); } g.add(doors);
    const lamp = new T.Mesh(new T.SphereGeometry(.25, 8, 6), new T.MeshBasicMaterial({color: 0xffb04a})); lamp.position.y = 4.1; lamp.position.z = .5; g.add(lamp);
    g.userData.doors = doors; return g;
  }
  const MODEL = {tower: towerModel, house: houseModel, barracks: barracksModel, gate: gateModel};
  function placeModel(p, quiet = false) {
    if (p.model) scene.remove(p.model);
    const m = MODEL[p.type](p.level);
    m.position.copy(p.pos); m.rotation.y = -p.a + (p.type === 'house' || p.type === 'barracks' ? Math.PI : 0); scene.add(m); p.model = m; p.flag.visible = false;
    if (quiet) return;
    m.scale.set(1, .01, 1); add(.9, t => { m.scale.y = Math.max(.01, ease(t / .9)); }, () => burst?.(p.pos.clone().add(new T.Vector3(0, .5, 0)), 0xc8a676, 24, 7, .5));
    burst?.(p.pos.clone().add(new T.Vector3(0, .5, 0)), 0xb89366, 20, 9, .5); sfx?.('build_rise', p.pos);
  }
  function build(id, quiet = false) { const p = pads.find(q => q.id === id); if (!p) return null; p.level++; placeModel(p, quiet); return p; }
  const info = p => BUILD[p.type].levels[p.level - 1];
  const next = p => BUILD[p.type].levels[p.level];
  // 성문 붕괴/복구 연출: 문짝이 넘어짐
  function gateState(dirId, frac) {
    const p = pads.find(q => q.id === 'gate_' + dirId); const d = p?.model?.userData.doors; if (!d) return;
    d.rotation.x = frac <= 0 ? -1.45 : 0; d.position.z = frac <= 0 ? -1.8 : 0; d.position.y = frac <= 0 ? -1.6 : 0;
  }

  // ── 망루 사격: 공중 우선, 조준 고도 지면+45m 이하, 지상 ×0.5 ──
  const shots = [], shotGeo = new T.SphereGeometry(.35, 8, 6), shotMat = new T.MeshBasicMaterial({color: 0x9fe8ff});
  function fire(p, target, dmg) {
    const from = p.pos.clone().add(new T.Vector3(0, p.model.userData.muzzle, 0)), o = new T.Mesh(shotGeo, shotMat); o.position.copy(from); scene.add(o);
    shots.push({o, target, dmg, speed: 150}); burst?.(from, 0x9fe8ff, 5, 6, .3);
  }
  function updateTowers(dt, raiders, active) {
    for (const p of pads) {
      if (p.type !== 'tower' || !p.level) continue;
      const s = info(p); p.cd = (p.cd ?? 0) - dt;
      if (p.model?.userData.eye) p.model.userData.eye.material.color.setHex(active ? 0x9fe8ff : 0x4a6a78);
      if (!active || p.cd > 0) continue;
      let best = null, bscore = Infinity;
      for (const e of raiders) {
        if (!e.parent) continue; const d = e.position.distanceTo(p.pos); if (d > s.range) continue;
        const ground = !!e.userData.raid?.ground; if (!ground && e.position.y - groundAt(e.position.x, e.position.z) > TOWER_AIM_ALT) continue;
        const score = d + (ground ? 1000 : 0); if (score < bscore) { bscore = score; best = e; } // 공중 우선
      }
      if (best) { fire(p, best, s.dmg * (best.userData.raid?.ground ? TOWER_GROUND_MUL : 1)); p.cd = s.rate; }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i], tg = s.target; if (!tg.parent) { scene.remove(s.o); shots.splice(i, 1); continue; }
      const to = tg.position.clone().add(new T.Vector3(0, tg.userData.raid?.ground ? 1.5 : 0, 0)).sub(s.o.position), d = to.length(), step = s.speed * dt;
      if (d <= step + 1.5) { hitEnemy?.(tg, s.dmg, 'tower'); scene.remove(s.o); shots.splice(i, 1); continue; }
      s.o.position.addScaledVector(to.divideScalar(d), step);
    }
  }
  function clearShots() { for (const s of shots) scene.remove(s.o); shots.length = 0; }

  const sumLevel = (type, key) => pads.filter(p => p.type === type && p.level).reduce((a, p) => a + info(p)[key], 0);
  const residents = () => sumLevel('house', 'pop');
  const barracks = () => { const p = pads.find(q => q.type === 'barracks'); return p.level ? info(p) : null; };
  const homes = () => pads.filter(p => p.type === 'house' && p.level).map(p => ({pos: p.pos, count: info(p).pop}));

  function update(dt, {raiders = [], active = false, day = false} = {}) {
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.step(Math.min(a.t, a.dur)); if (a.t >= a.dur) { anims.splice(i, 1); a.done?.(); } }
    const pulse = .35 + .25 * Math.sin(performance.now() / 300);
    for (const p of pads) { p.ring.visible = day && (!p.level || !!next(p)); p.ring.material.opacity = p.level ? pulse * .5 : pulse; }
    updateTowers(dt, raiders, active);
  }
  return {pads, build, info, next, update, clearShots, gateState, residents, barracks, homes, pad: id => pads.find(p => p.id === id)};
}
