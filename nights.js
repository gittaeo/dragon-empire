// 「풍향탑의 세 밤」 (docs/PIVOT_THREE_NIGHTS.md, 사용자 승인 2026-11-21) — 1주차: 낮 → 밤 → 탑 승패 → 재시작
// 낮: 여성 폴리모프로 공터에서 재료를 모아 작업대에서 '탑 수리' 또는 '방향 방어막'을 만든다.
// 밤: 용으로 이륙해, 예보된 방향에서 풍향탑으로 날아드는 등불 군단(습격자)을 요격한다. 탑 HP 0 → 패배.
// 아침: 진화(1밤 → 드레이크, 2밤 → 웜). 세 번째 밤을 버티면 승리(루세르나·엠페러는 2주차).
import * as T from './vendor/three.module.js';
import {PAD} from './ground.js';

export const NIGHTS_TOTAL = 3;
export const DIRS = [{id: 'n', name: '북쪽', a: 0}, {id: 'e', name: '동쪽', a: Math.PI / 2}, {id: 's', name: '남쪽', a: Math.PI}, {id: 'w', name: '서쪽', a: -Math.PI / 2}];
// 밤 n(1~3)의 웨이브: 웨이브 수·크기·간격·속도·습격자 비율
export const NIGHT_PLAN = n => ({waves: 3 + n, size: 4 + n, interval: 22 - 2 * n, speed: 15 + 3 * n, hunters: n});
// 하루 재료: 수리(가지2·돌1)와 방어막(가지1·돌2·파편1)을 동시에 만들 수 없게 → 택일 (Codex 리뷰). 남은 재료는 다음 날로 이월
export const DAY_ITEMS = [['branch', 2], ['stone', 2], ['shard', 1]];
export const DAY_SEC = 60, TOWER_MAX = 100, RAID_DAMAGE = 8, SHIELD_CHARGES = 6, SHIELD_R = 95;
export const RECIPES_N = {
  repair: {name: '탑 수리', items: {branch: 2, stone: 1}, desc: '풍향탑 +30'},
  shield: {name: '방어막', items: {branch: 1, stone: 2, shard: 1}, desc: '그 방향 습격 6회 막음'},
};
// 예보: 밤마다 서로 다른 두 방향 (판마다 무작위)
export function forecast(rand = Math.random) { const i = Math.floor(rand() * 4), j = (i + 1 + Math.floor(rand() * 3)) % 4; return [DIRS[i], DIRS[j]]; }
export function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }

export function createNights(ctx) {
  const {scene, gnd, tod} = ctx, towerPos = gnd.positions.tower.clone(), v = new T.Vector3();
  const S = {phase: 'day', night: 1, t: DAY_SEC, towerHp: TOWER_MAX, dirs: forecast(), shields: {}, waveI: 0, waveT: 0, raiders: 0, over: false, crafted: 0, best: null};
  // 탑 HP 바
  const bar = document.createElement('div'); bar.id = 'towerbar'; bar.innerHTML = '<b>풍향탑</b><i><span></span></i><small></small>'; document.getElementById('hud').appendChild(bar);
  const setBar = () => { bar.querySelector('span').style.width = Math.max(0, S.towerHp) + '%'; bar.querySelector('small').textContent = Math.ceil(Math.max(0, S.towerHp)) + ' / ' + TOWER_MAX; bar.classList.toggle('low', S.towerHp < 35); };
  // 방어막 표시(방향별 반구 조각)
  const shieldMesh = {};
  function makeShield(dir) {
    const g = new T.Mesh(new T.SphereGeometry(SHIELD_R, 24, 10, -dir.a - Math.PI / 2 - Math.PI / 4, Math.PI / 2, 0, Math.PI / 2), new T.MeshBasicMaterial({color: 0x7fe0ff, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending}));
    g.position.copy(towerPos); scene.add(g); shieldMesh[dir.id] = g;
  }
  // 예보 표시: 하늘에 방향별 붉은 등불 기둥
  const omen = [];
  function showOmens() { for (const o of omen) scene.remove(o); omen.length = 0; for (const d of S.dirs) { const p = towerPos.clone().addScaledVector(dirVec(d.a).clone(), 520); const m = new T.Mesh(new T.CylinderGeometry(4, 4, 500, 10, 1, true), new T.MeshBasicMaterial({color: 0xff5a2a, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false})); m.position.set(p.x, ctx.groundAt(p.x, p.z) + 250, p.z); scene.add(m); omen.push(m); } }
  // 방향 벡터: a=0 이면 북쪽(-Z)
  const dirVec = a => v.set(Math.sin(a), 0, -Math.cos(a)); // 북=-Z, 동=+X (Codex 리뷰로 동서 반전 수정)

  // 낮: 재료 재배치
  function startDay() {
    S.phase = 'day'; S.t = DAY_SEC; S.crafted = 0; S.dirs = forecast(); showOmens();
    tod.setHour(10); ctx.banner(`${S.night}번째 낮`, `오늘 밤 ${S.dirs.map(d => d.name).join('·')}에서 온다 — 작업대에서 준비하세요`, 3.2);
    let k = 0; for (const [type, n] of DAY_ITEMS) for (let i = 0; i < n; i++, k++) { const a = k / 5 * Math.PI * 2 + S.night, r = 14 + (k % 3) * 6; gnd.addGather(`n${S.night}_${type}${i}`, type, -8 + Math.cos(a) * r, -6 + Math.sin(a) * r); }
    ctx.onPhase?.('day');
  }
  function startNight() {
    S.phase = 'dusk'; S.t = 2.2; tod.setHour(19); ctx.banner(`${S.night}번째 밤`, `${S.dirs.map(d => d.name).join('·')}에서 등불 군단이 온다`, 2.4); ctx.sfx?.('boss_roar');
    S.retry = 0; // 실제 변신·이륙은 update의 dusk 단계에서 게임 시간으로 재시도
  }
  function beginWaves() { S.phase = 'night'; tod.setHour(22); S.waveI = 0; S.waveT = 1.5; S.raiders = 0; ctx.onPhase?.('night'); }
  function spawnWave() {
    const plan = NIGHT_PLAN(S.night), d = S.dirs[S.waveI % S.dirs.length], base = dirVec(d.a).clone();
    for (let i = 0; i < plan.size; i++) {
      const side = (i - plan.size / 2) * 18, p = towerPos.clone().addScaledVector(base, 620 + Math.random() * 60).add(v.set(-base.z * side, 0, base.x * side));
      p.y = ctx.groundAt(p.x, p.z) + 70 + Math.random() * 40;
      const hunter = i < plan.hunters, e = ctx.makeEnemy(p.x, p.y, p.z, hunter ? 'rider' : 'moth');
      if (!hunter) { e.userData.raid = {dir: d, speed: plan.speed * (.9 + Math.random() * .2)}; S.raiders++; }
      e.userData.nightWave = true;
    }
    ctx.banner(`습격 ${S.waveI + 1} / ${plan.waves}`, `${d.name}에서 ${plan.size}마리`, 1.4);
    S.waveI++;
  }
  // game.js updateEnemies에서 호출: 습격자 이동·방어막·탑 피해. true면 일반 AI 건너뜀
  function raidStep(e, dt) {
    const u = e.userData, r = u.raid; if (!r) return false;
    const to = v.copy(towerPos).add(new T.Vector3(0, 10, 0)).sub(e.position), d = to.length(); to.divideScalar(d || 1);
    e.position.addScaledVector(to, r.speed * dt); e.position.y = Math.max(e.position.y, ctx.groundAt(e.position.x, e.position.z) + 8);
    e.lookAt(towerPos); e.rotateY(Math.PI);
    const sh = S.shields[r.dir.id];
    if (sh > 0 && d < SHIELD_R) { S.shields[r.dir.id]--; ctx.burst(e.position, 0x9ff0ff, 30, 20, 1); ctx.removeEnemy(e); S.raiders--; ctx.sfx?.('skill_shield'); if (S.shields[r.dir.id] <= 0) { scene.remove(shieldMesh[r.dir.id]); ctx.banner('방어막 소진', r.dir.name, 1.2); } return true; }
    if (d < 22) { S.towerHp -= RAID_DAMAGE; setBar(); ctx.burst(e.position, 0xff6a2a, 50, 25, 1.4); ctx.shake(.5); ctx.sfx?.('player_hurt', e.position); ctx.removeEnemy(e); S.raiders--; if (S.towerHp <= 0) lose('풍향탑이 무너졌습니다'); return true; }
    return true;
  }
  function onKill(e) { if (e.userData.raid) S.raiders--; }
  function lose(why) { if (S.over) return; S.over = true; ctx.end(false, why, S); }
  function win() { if (S.over) return; S.over = true; ctx.end(true, `${NIGHTS_TOTAL}번째 밤까지 풍향탑을 지켰습니다`, S); }

  // 작업대·풍향탑 상호작용 (ground.js onInteract 훅)
  function onInteract(kind) {
    if (S.phase !== 'day') { if (kind === 'bench' || kind === 'tower') { ctx.banner('밤에는 만들 수 없습니다', '', 1); return true; } return false; }
    if (kind === 'bench') { openCraft(); return true; }
    if (kind === 'tower') { ctx.banner('풍향탑', `${Math.ceil(S.towerHp)} / ${TOWER_MAX}`, 1.2); return true; }
    if (kind === 'sera') { gnd.say([{who: '세라', text: `오늘 밤엔 ${S.dirs.map(d => d.name).join('과 ')}이야. 방어막은 한쪽만 칠 수 있어.`}]); return true; }
    return false;
  }
  function promptFor(kind) { if (S.phase !== 'day') return null; if (kind === 'bench') return 'E — 준비하기 (탑 수리 / 방어막)'; if (kind === 'sera') return 'E — 세라에게 오늘 밤 묻기'; if (kind === 'tower') return `풍향탑 ${Math.ceil(S.towerHp)}/${TOWER_MAX}`; return null; }
  // 제작 메뉴 (간단한 버튼 패널)
  const menu = document.createElement('div'); menu.id = 'craftmenu'; menu.hidden = true; document.body.appendChild(menu);
  const has = items => Object.entries(items).every(([k, n]) => (gnd.world.bag[k] || 0) >= n);
  const pay = items => { for (const [k, n] of Object.entries(items)) gnd.world.bag[k] -= n; };
  const NAME = {branch: '나뭇가지', stone: '돌', shard: '숨결 파편'};
  function openCraft() {
    const opts = [['repair', null], ...S.dirs.map(d => ['shield', d])];
    menu.innerHTML = '<b>밤 준비</b>' + opts.map(([id, d], i) => { const r = RECIPES_N[id], ok = has(r.items) && !(id === 'repair' && S.towerHp >= TOWER_MAX) && !(d && S.shields[d.id] > 0);
      return `<button data-i="${i}" ${ok ? '' : 'disabled'}><span>${r.name}${d ? ' · ' + d.name : ''}</span><small>${Object.entries(r.items).map(([k, n]) => NAME[k] + ' ' + n).join(' · ')} — ${r.desc}</small></button>`; }).join('') + '<button data-x>닫기</button>';
    menu.hidden = false;
    menu.querySelectorAll('[data-i]').forEach(bt => bt.onclick = () => { const [id, d] = opts[+bt.dataset.i]; const r = RECIPES_N[id]; if (!has(r.items)) return; pay(r.items);
      if (id === 'repair') { S.towerHp = Math.min(TOWER_MAX, S.towerHp + 30); setBar(); ctx.burst(towerPos.clone().add(v.set(0, 6, 0)), 0xffd27a, 50, 10, .8); }
      else { S.shields[d.id] = SHIELD_CHARGES; makeShield(d); }
      ctx.sfx?.('levelup'); S.crafted++; menu.hidden = true; ctx.banner(r.name + (d ? ' · ' + d.name : ''), r.desc, 1.6); gnd.save(); });
    menu.querySelector('[data-x]').onclick = () => { menu.hidden = true; };
  }

  function update(dt) {
    if (S.over) return;
    if (S.phase === 'day') {
      S.t -= dt; if (S.t <= 0) { menu.hidden = true; startNight(); }
    } else if (S.phase === 'dusk') {
      S.t -= dt; S.retry -= dt;
      if (S.retry <= 0 && !gnd.busy) { // 1초마다: 인간형이면 착륙장으로 옮겨 변신, 착륙한 용이면 이륙
        S.retry = 1;
        if (gnd.mode === 'human') { const h = gnd.human.pos; h.x = PAD.x; h.z = PAD.z; h.y = ctx.groundAt(PAD.x, PAD.z); gnd.toDragon(); }
        else if (gnd.mode === 'landed') gnd.takeoff();
      }
      if (S.t <= 0 && gnd.mode === 'air') beginWaves();
    }
    else if (S.phase === 'night') {
      const plan = NIGHT_PLAN(S.night);
      if (S.waveI < plan.waves) { S.waveT -= dt; if (S.waveT <= 0) { spawnWave(); S.waveT = plan.interval; } }
      else if (ctx.nightEnemies() === 0) { // 밤 끝 → 아침
        for (const k in shieldMesh) scene.remove(shieldMesh[k]); S.shields = {};
        if (S.night >= NIGHTS_TOTAL) return win();
        S.phase = 'morning'; S.t = 3; tod.setHour(6.5); ctx.morning(S.night); S.night++;
      }
    } else if (S.phase === 'morning') { S.t -= dt; if (S.t <= 0) { S.phase = 'await'; ctx.banner('아침', '공터에 착륙해 인간형으로 낮 준비를 하세요 (금빛 기둥)', 3); } }
    else if (S.phase === 'await') { if (gnd.mode === 'human') startDay(); }
  }
  function objective() {
    const ds = S.dirs.map(d => d.name).join('·');
    if (S.phase === 'day') return `${S.night}번째 낮 · ${Math.ceil(S.t)}초 · 오늘 밤 ${ds} — 재료를 모아 작업대에서 준비`;
    if (S.phase === 'dusk') return '해질녘 · 용으로 이륙';
    if (S.phase === 'night') { const p = NIGHT_PLAN(S.night); return `${S.night}번째 밤 · 습격 ${Math.min(S.waveI, p.waves)}/${p.waves} · 남은 적 ${ctx.nightEnemies()} — 탑으로 오는 등불을 막으세요`; }
    if (S.phase === 'morning' || S.phase === 'await') return '아침 · 금빛 기둥(공터)에 착륙해 변신';
    return '';
  }
  setBar(); startDay();
  const canLand = () => !(S.phase === 'night' || S.phase === 'dusk');
  return {update, raidStep, canLand, onKill, onInteract, promptFor, objective, get state() { return S; }, towerPos, debug: {startNight, win, lose}};
}
