// 세 밤 건설 연출 — 규칙(방어막 횟수·수리량)은 nights.js 그대로, 여기서는 '보이는 것'만 담당 (Claude)
// 참고: 낮에 짓고 밤에 지키는 디펜스(Thronefall·Kingdom Two Crowns류)처럼 지은 것이 실물로 서고 부서지게.
// - 목책 방벽: 방향별 90° 호, SEGMENTS 구간 = 방어막 횟수. 땅에서 말뚝이 차례로 솟고, 막을 때마다 한 구간이 쓰러짐
// - 풍향탑 상태: HP 낮으면 연기, 더 낮으면 불씨
// - 수리: 비계가 솟고 망치 불꽃 → 비계 내려감
// - 재료 운반: 주인공 → 공사 지점으로 재료가 포물선으로 날아감
import * as T from './vendor/three.module.js';

const STAKE_H = 10, STAKES_PER_SEG = 6, RISE = .45, SEG_DELAY = .22;
const ITEM_COLOR = {branch: 0x8a5a2b, stone: 0x9a968e, shard: 0x8fe8ff};

export function createFortify({scene, groundAt, towerPos, radius, segments, burst, sfx}) {
  const wood = new T.MeshStandardMaterial({color: 0x7a4e2a, roughness: .9});
  const woodDark = new T.MeshStandardMaterial({color: 0x5a3a1e, roughness: .95});
  const stakeGeo = new T.CylinderGeometry(.6, .75, STAKE_H, 6); stakeGeo.translate(0, STAKE_H / 2, 0);
  const tipGeo = new T.ConeGeometry(.68, 1.8, 6); tipGeo.translate(0, STAKE_H + .9, 0);
  const railGeo = new T.BoxGeometry(1, .35, .3);
  const anims = []; // {t, dur, step(k), done?}
  const add = (dur, step, done) => { const a = {t: 0, dur, step, done}; anims.push(a); return a; };
  const ease = k => 1 - (1 - k) ** 3;

  // ── 목책 방벽 ──
  const walls = {}; // dirId → {group, segs:[{group, stakes:[...]}]}
  const arcPoint = (a, r) => new T.Vector3(towerPos.x + Math.sin(a) * r, 0, towerPos.z - Math.cos(a) * r);
  function buildWall(dir, delay = 0, segCount = segments) {
    clearWall(dir.id);
    const group = new T.Group(); scene.add(group); const segs = [];
    const span = Math.PI / 2 * .92, n = segCount * STAKES_PER_SEG;
    let prev = null;
    for (let s = 0; s < segCount; s++) {
      const sg = new T.Group(); group.add(sg); const seg = {group: sg, stakes: [], broken: false};
      for (let i = 0; i < STAKES_PER_SEG; i++) {
        const j = s * STAKES_PER_SEG + i, a = dir.a - span / 2 + span * (j + .5) / n, p = arcPoint(a, radius + (j % 2 ? .6 : -.6));
        const gy = groundAt(p.x, p.z), h = .8 + ((j * 37) % 7) / 20; // 말뚝 높이 조금씩 다르게
        const st = new T.Group(); st.position.set(p.x, gy - STAKE_H * h - 1.5, p.z); st.rotation.y = -a; st.scale.y = h;
        st.add(new T.Mesh(stakeGeo, wood), new T.Mesh(tipGeo, woodDark)); sg.add(st);
        st.userData = {y0: gy, a}; seg.stakes.push(st);
        if (prev && i > 0) { // 가로대 2줄
          for (const ry of [3, 6.5]) { const r = new T.Mesh(railGeo, woodDark), m = prev.position.clone().add(st.position).multiplyScalar(.5);
            r.scale.x = prev.position.distanceTo(st.position) + .6; r.position.set(m.x, 0, m.z); r.rotation.y = -a; r.userData = {ry, from: prev, to: st}; r.visible = false; sg.add(r); seg.rails = seg.rails || []; seg.rails.push(r); }
        }
        prev = st;
      }
      segs.push(seg);
      // 구간별로 순서대로 솟아오름
      const start = delay + s * SEG_DELAY;
      add(start + RISE + STAKES_PER_SEG * .04, t => {
        seg.stakes.forEach((st, i) => { const k = Math.max(0, Math.min(1, (t - start - i * .04) / RISE)); st.position.y = st.userData.y0 - (1 - ease(k)) * (STAKE_H * st.scale.y + 1.5); });
        for (const r of seg.rails || []) { const k = Math.max(0, Math.min(1, (t - start - STAKES_PER_SEG * .04) / RISE)); r.visible = k > 0; r.position.y = (r.userData.from.position.y + r.userData.to.position.y) / 2 + r.userData.ry * k; }
      }, () => { const c = seg.stakes[STAKES_PER_SEG >> 1].position; burst?.(new T.Vector3(c.x, c.y + .5, c.z), 0xb89366, 14, 8, .5); if (s === 0) sfx?.('build_rise', c); });
    }
    walls[dir.id] = {group, segs};
  }
  // 남은 횟수에 맞춰 바깥 구간부터 쓰러뜨림
  function hitWall(dirId, remaining) {
    const w = walls[dirId]; if (!w) return;
    const alive = w.segs.filter(s => !s.broken), toBreak = alive.length - Math.max(0, remaining);
    for (let i = 0; i < toBreak; i++) {
      const seg = alive[(i % 2 ? alive.length - 1 - (i >> 1) : i >> 1)] || alive[i]; if (!seg || seg.broken) continue; seg.broken = true;
      const c = seg.stakes[STAKES_PER_SEG >> 1].position.clone().add(new T.Vector3(0, 4, 0));
      burst?.(c, 0x9a6a3a, 40, 18, .8); sfx?.('wood_break', c);
      const tilt = seg.stakes.map(() => (Math.random() * .6 + .9) * (Math.random() < .5 ? -1 : 1));
      add(1.4, t => { const k = Math.min(1, t / 1.4); seg.stakes.forEach((st, j) => { st.rotation.x = tilt[j] * ease(Math.min(1, k * 1.6)) * 1.2; st.position.y = st.userData.y0 - k * k * 3; });
        for (const r of seg.rails || []) r.visible = k < .2; }, () => { seg.group.visible = false; });
    }
  }
  function clearWall(id) { const w = walls[id]; if (!w) return; scene.remove(w.group); delete walls[id]; }
  function clearWalls() { for (const id in walls) { const w = walls[id], g = w.group; // 아침: 남은 목책은 땅으로 가라앉음
      add(1.2, t => { g.position.y = -ease(Math.min(1, t / 1.2)) * (STAKE_H + 2); }, () => scene.remove(g)); delete walls[id]; } }

  // ── 풍향탑 연기·불씨 (스프라이트 풀) ──
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64); const puffTex = new T.CanvasTexture(cv);
  const puffs = [];
  for (let i = 0; i < 40; i++) { const fire = i >= 28; const sp = new T.Sprite(new T.SpriteMaterial({map: puffTex, color: fire ? 0xff8a2a : 0x3a3532, transparent: true, depthWrite: false, opacity: 0, blending: fire ? T.AdditiveBlending : T.NormalBlending}));
    sp.visible = false; sp.userData = {fire, life: 0, max: 1, vel: new T.Vector3()}; scene.add(sp); puffs.push(sp); }
  let hpFrac = 1, emitSmoke = 0, emitFire = 0;
  const top = () => new T.Vector3(towerPos.x, towerPos.y + 8.5, towerPos.z);
  function emit(fire) { const sp = puffs.find(p => !p.visible && p.userData.fire === fire); if (!sp) return; const u = sp.userData, p = top();
    sp.position.set(p.x + (Math.random() - .5) * 1.4, p.y - (fire ? 1.5 : 0) + Math.random(), p.z + (Math.random() - .5) * 1.4);
    u.life = 0; u.max = fire ? .7 + Math.random() * .4 : 2.4 + Math.random(); u.vel.set((Math.random() - .5) * .8 + .6, fire ? 2.5 : 1.8, (Math.random() - .5) * .8); sp.visible = true; }
  function setTowerHp(frac) { hpFrac = frac; }

  // ── 수리: 비계 + 망치 불꽃 ──
  let scaffold = null;
  function repair(dur = 2.2) {
    if (scaffold) scene.remove(scaffold);
    const g = new T.Group(), H = 10, w = 2.2; g.position.copy(towerPos);
    const post = new T.CylinderGeometry(.12, .12, H, 5); post.translate(0, H / 2, 0);
    for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]]) { const m = new T.Mesh(post, wood); m.position.set(x, 0, z); g.add(m); }
    for (const y of [2.5, 5, 7.5, 9.6]) for (let i = 0; i < 4; i++) { const b = new T.Mesh(railGeo, woodDark); const a = i * Math.PI / 2; b.scale.set(w * 2, .5, .5); b.position.set(Math.sin(a) * w, y, Math.cos(a) * w); b.rotation.y = a + Math.PI / 2; g.add(b); }
    for (let i = 0; i < 4; i++) { const b = new T.Mesh(railGeo, wood), a = i * Math.PI / 2; b.scale.set(Math.hypot(w * 2, 5), .4, .4); b.position.set(Math.sin(a) * w, 5, Math.cos(a) * w); b.rotation.set(0, a + Math.PI / 2, Math.atan2(5, w * 2)); g.add(b); }
    g.scale.y = .01; scene.add(g); scaffold = g;
    let nextHit = .5, hits = 0;
    add(dur + 1.1, t => {
      g.scale.y = t < .5 ? Math.max(.01, ease(t / .5)) : t > dur + .5 ? Math.max(.01, 1 - ease((t - dur - .5) / .6)) : 1;
      if (t > nextHit && t < dur + .3) { nextHit = t + .35 + Math.random() * .2; const p = top().add(new T.Vector3((Math.random() - .5) * 3, -2 - Math.random() * 5, (Math.random() - .5) * 3));
        burst?.(p, 0xffd27a, 10, 6, .25); if (hits++ === 0) sfx?.('hammer', p); }
    }, () => { scene.remove(g); if (scaffold === g) scaffold = null; burst?.(top(), 0xffe6a0, 30, 10, .6); });
  }

  // ── 재료 운반: from → to 포물선, 순서대로 ──
  const itemGeo = {branch: new T.BoxGeometry(.25, .25, 1.1), stone: new T.DodecahedronGeometry(.35), shard: new T.OctahedronGeometry(.35)};
  function carry(from, to, items, onArrive) {
    const list = Object.entries(items).flatMap(([k, n]) => Array(n).fill(k)); let left = list.length;
    if (!left) { onArrive?.(); return; }
    const far = from.distanceTo(to), dur = Math.min(1.6, .6 + far / 60), arcH = 3 + far * .25;
    list.forEach((k, i) => { const m = new T.Mesh(itemGeo[k] || itemGeo.stone, new T.MeshBasicMaterial({color: ITEM_COLOR[k] || 0xffffff})); m.visible = false; scene.add(m);
      const delay = i * .12, a = from.clone().add(new T.Vector3(0, 1.2, 0)), b = to.clone();
      add(delay + dur, t => { const k2 = Math.max(0, (t - delay) / dur); m.visible = k2 > 0; m.position.lerpVectors(a, b, k2); m.position.y += Math.sin(Math.PI * k2) * arcH; m.rotation.x += .2; m.rotation.y += .15; },
        () => { scene.remove(m); burst?.(b, ITEM_COLOR[k] || 0xffffff, 6, 5, .3); if (--left === 0) onArrive?.(); }); });
  }

  function update(dt) {
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.step(Math.min(a.t, a.dur)); if (a.t >= a.dur) { anims.splice(i, 1); a.done?.(); } }
    // 탑 상태: 60% 미만 연기, 30% 미만 불씨 (낮을수록 진하게)
    if (hpFrac < .6) { emitSmoke -= dt; if (emitSmoke <= 0) { emit(false); emitSmoke = hpFrac < .3 ? .12 : .3; } }
    if (hpFrac < .3) { emitFire -= dt; if (emitFire <= 0) { emit(true); emitFire = .09; } }
    for (const sp of puffs) { if (!sp.visible) continue; const u = sp.userData; u.life += dt; const k = u.life / u.max;
      if (k >= 1) { sp.visible = false; continue; }
      sp.position.addScaledVector(u.vel, dt); const s = u.fire ? 2.2 * (1 - k) + .6 : 2 + k * 6; sp.scale.set(s, s, 1);
      sp.material.opacity = u.fire ? .9 * (1 - k) : .75 * Math.sin(Math.PI * k); }
  }
  return {buildWall, hitWall, clearWalls, clearWall, repair, carry, setTowerHp, update, get walls() { return walls; }, get scaffold() { return scaffold; }, get busy() { return anims.length; }};
}
