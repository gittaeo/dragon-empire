// 「풍향탑의 세 밤」 (docs/PIVOT_THREE_NIGHTS.md, 사용자 승인 2026-11-21) — 1주차: 낮 → 밤 → 탑 승패 → 재시작
// 낮: 여성 폴리모프로 공터에서 재료를 모아 작업대에서 '탑 수리' 또는 '방향 방어막'을 만든다.
// 밤: 용으로 이륙해, 예보된 방향에서 풍향탑으로 날아드는 등불 군단(습격자)을 요격한다. 탑 HP 0 → 패배.
// 아침: 진화(1밤 → 드레이크, 2밤 → 웜). 세 번째 밤을 버티면 승리(루세르나·엠페러는 2주차).
import * as T from './vendor/three.module.js';
import {PAD} from './ground.js';

export const NIGHTS_TOTAL = 3;
export const DIRS = [{id: 'n', name: '북쪽', a: 0}, {id: 'e', name: '동쪽', a: Math.PI / 2}, {id: 's', name: '남쪽', a: Math.PI}, {id: 'w', name: '서쪽', a: -Math.PI / 2}];
// 밤 n(1~3)의 웨이브: 웨이브 수·크기·간격·속도·습격자 비율
export const NIGHT_PLAN = n => ({waves: 3 + n, size: 4 + n, interval: 22 - 2 * n, speed: 15 + 3 * n, hunters: n - 1}); // 첫 밤은 사냥꾼 없음(Codex QA: 1밤 처치 0으로 사망)
// 하루 재료: 수리(가지2·돌1)와 방어막(가지1·돌2·파편1)을 동시에 만들 수 없게 → 택일 (Codex 리뷰). 남은 재료는 다음 날로 이월
export const DAY_ITEMS = [['branch', 2], ['stone', 2], ['shard', 1]];
// 셋째 밤 피날레 (NIGHTS_WEEK2.md P0): 웨이브 정리 → 엠페러 진화·대관식 → 루세르나(세 밤 전용 HP) → 격파 시 승리
// 보스 HP 가설: Codex 입력 봇(거의 완벽 조준) 15000HP → 11.1초 ≈ 1350 DPS. 사람 명중률 ~30% 가정 시 ~400 DPS × 목표 90~150초(NIGHTS_BOSS.md) ≈ 45000. 사람 플레이테스트로 조정
export const FINALE = {bossHp: 45000, boltDamage: .015}; // boltDamage: 보스 탄 1발 = 최대 HP 비율 (탐험 모드 .04 → 봇 비회피 21초 사망, Codex 보스 봇)
// 탑은 지난 습격으로 손상된 채 시작 → 첫 낮부터 수리/방어막 택일이 성립 (Codex 입력 봇: HP 100이면 수리 불가)
export const TOWER_START = 80;
export const DAY_SEC = 60, TOWER_MAX = 100, RAID_DAMAGE = 8, SHIELD_CHARGES = 6, SHIELD_R = 95;
export const RECIPES_N = {
  repair: {name: '탑 수리', items: {branch: 2, stone: 1}, desc: '풍향탑 +30'},
  shield: {name: '방어막', items: {branch: 1, stone: 2, shard: 1}, desc: '그 방향 습격 6회 막음'},
};
// 예보: 밤마다 서로 다른 두 방향 (판마다 무작위)
export function forecast(rand = Math.random) { const i = Math.floor(rand() * 4), j = (i + 1 + Math.floor(rand() * 3)) % 4; return [DIRS[i], DIRS[j]]; }
// ── 시드 기반 웨이브 (docs/NIGHTS_WAVES.md, Codex 설계) ──
// PRNG: mulberry32. 스트림 시드: FNV-1a 32비트로 `${runSeed}:${night}:${tag}` 해시 (버전 1 고정)
export const WAVES_VERSION = 1;
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function streamSeed(runSeed, night, tag) { let h = 0x811c9dc5; for (const c of `${runSeed >>> 0}:${night}:${tag}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
export const rngFor = (runSeed, night, tag) => mulberry32(streamSeed(runSeed, night, tag));
export function parseSeed(str) { if (str == null || !/^\d{1,10}$/.test(str)) return null; const n = Number(str); return n <= 0xffffffff ? n : null; }
// 패턴: alternate(A,B,A,B…) · focus(A,A,B,A… 한쪽 집중) / 수정자: escort(사냥꾼 호위, 2밤~) · rush(마지막 파 한 방향 돌진 ×1.15, 2밤~)
export const RUSH_SPEED = 1.15;
export function buildWaves({night, runSeed, dirs}) {
  const plan = NIGHT_PLAN(night), r = rngFor(runSeed, night, 'pattern');
  const pattern = night === 1 ? 'alternate' : (r() < .5 ? 'alternate' : 'focus');
  const main = r() < .5 ? 0 : 1, other = 1 - main;
  const escort = night >= 2 && r() < .5, rush = night >= 2 && r() < .6;
  const waves = [];
  for (let i = 0; i < plan.waves; i++) {
    let di = pattern === 'alternate' ? (i + main) % 2 : (i === 2 ? other : main);
    const last = i === plan.waves - 1;
    if (rush && last) di = main;
    waves.push({index: i, dir: dirs[di].id, count: plan.size, hunters: plan.hunters, speedMultiplier: rush && last ? RUSH_SPEED : 1,
      modifier: rush && last ? 'rush' : escort && plan.hunters > 0 ? 'escort' : null});
  }
  return {version: WAVES_VERSION, seed: runSeed >>> 0, pattern, waves};
}
// ── 루세르나의 풍향탑 공격: 등불 낙하 (docs/NIGHTS_BOSS.md, Codex 설계 · 수치는 가설) ──
export const TOWER_ASSAULT = {initialDelay: 10, cooldown: 20, telegraph: 4, travel: 5, damage: 12, projectileHp: 300, maxActive: 1, shieldPolicy: 'no-block'};
// 순수 상태 머신: idle → telegraph → travel → (resolve) → idle. 쿨다운은 해결 시점부터.
export function createAssault(cfg = TOWER_ASSAULT) { return {cfg, state: 'idle', t: cfg.initialDelay, id: 0, results: {}}; }
export function assaultStep(A, dt) {
  const ev = [];
  if (A.state === 'idle') { A.t -= dt; if (A.t <= 0) { A.state = 'telegraph'; A.id++; A.t = A.cfg.telegraph; ev.push({kind: 'tower_assault', id: A.id, phase: 'telegraph', remaining: A.t}); } }
  else if (A.state === 'telegraph') { A.t -= dt; if (A.t <= 0) { A.state = 'travel'; A.t = A.cfg.travel; ev.push({kind: 'tower_assault', id: A.id, phase: 'travel', remaining: A.t}); } }
  return ev;
}
// id별 결과는 한 번만 (중복 피해 금지). 반환: 이벤트 또는 null
export function assaultResolve(A, id, result) {
  if (A.state !== 'travel' || id !== A.id || A.results[id]) return null;
  A.results[id] = result; A.state = 'idle'; A.t = A.cfg.cooldown;
  return {kind: 'tower_assault', id, phase: 'resolved', result};
}
export function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }

export function createNights(ctx) {
  const {scene, gnd, tod} = ctx, towerPos = gnd.positions.tower.clone(), v = new T.Vector3();
  const runSeed = (ctx.seed ?? Math.floor(Math.random() * 0x100000000)) >>> 0;
  const S = {phase: 'day', night: 1, t: DAY_SEC, towerHp: TOWER_START, dirs: forecast(rngFor(runSeed, 1, 'forecast')), shields: {}, waveI: 0, waveT: 0, raiders: 0, over: false, crafted: 0, best: null, seed: runSeed, plan: null, assault: null,
    stats: {minTower: TOWER_START, blocked: 0, raidHits: 0, intercepted: 0, impacts: 0, crafted: []}}; // 플레이테스트 기록용 (PLAYTEST_KIT.md)
  console.info(`[세 밤] seed=${runSeed} waves v${WAVES_VERSION}`);
  // 탑 HP 바
  const bar = document.createElement('div'); bar.id = 'towerbar'; bar.innerHTML = '<b>풍향탑</b><i><span></span></i><small></small>'; document.getElementById('hud').appendChild(bar);
  const setBar = () => {
    S.stats.minTower = Math.min(S.stats.minTower, Math.max(0, Math.ceil(S.towerHp)));
    bar.querySelector('span').style.width = Math.max(0, S.towerHp) + '%'; bar.classList.toggle('low', S.towerHp < 35);
    const sh = Object.entries(S.shields).filter(([, n]) => n > 0).map(([id, n]) => `방어막 ${DIRS.find(d => d.id === id).name} ${'●'.repeat(n)}${'○'.repeat(SHIELD_CHARGES - n)}`).join(' · ');
    bar.querySelector('small').textContent = Math.ceil(Math.max(0, S.towerHp)) + ' / ' + TOWER_MAX + (sh ? ' · ' + sh : '');
  };
  const raidOrbGeo = new T.SphereGeometry(1.1, 10, 8), raidOrbMat = new T.MeshBasicMaterial({color: 0xff3a2a, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false});
  // 습격자 위치 표시: 화면 안이면 붉은 표식, 밖이면 화면 가장자리 화살표 (가까운 8마리)
  const marks = document.createElement('div'); marks.id = 'raidmarks'; document.body.appendChild(marks);
  const pool = Array.from({length: 8}, () => { const d = document.createElement('i'); marks.appendChild(d); return d; });
  const pv = new T.Vector3();
  function updateMarks() {
    const cam = ctx.camera, list = S.phase === 'night' || S.phase === 'boss' ? ctx.raiders() : [];
        list.sort((a, b) => (b.userData.assault ? 1 : 0) - (a.userData.assault ? 1 : 0) || a.position.distanceToSquared(towerPos) - b.position.distanceToSquared(towerPos));
    const W = innerWidth, H = innerHeight, m = 64, mt = W > 520 ? 130 : 150; // 위 여백: 제목·탑 바·패널 아래
    pool.forEach((el, i) => {
      const e = list[i]; if (!e) { el.style.display = 'none'; return; }
      pv.copy(e.position).project(cam); const behind = pv.z > 1;
      let x = (pv.x * .5 + .5) * W, y = (-pv.y * .5 + .5) * H; const on = !behind && x > m && x < W - m && y > mt && y < H - m;
      if (!on) { let dx = x - W / 2, dy = y - H / 2; if (behind) { dx = -dx; dy = -dy; } const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - (dy < 0 ? mt : m)) / Math.abs(dy || 1e-3)); x = W / 2 + dx * k; y = H / 2 + dy * k; el.style.transform = `translate(${x}px,${y}px) rotate(${Math.atan2(dy, dx)}rad)`; el.className = 'edge' + (e.userData.assault ? ' as' : ''); }
      else { el.style.transform = `translate(${x}px,${y}px)`; el.className = 'on' + (e.userData.assault ? ' as' : ''); }
      el.style.display = 'block';
    });
  }
  const warnRing = new T.Mesh(new T.RingGeometry(40, 50, 64), new T.MeshBasicMaterial({color: 0xff8a1a, transparent: true, opacity: .7, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending}));
  warnRing.rotation.x = -Math.PI / 2; warnRing.visible = false; scene.add(warnRing);
  const warnBeam = new T.Mesh(new T.CylinderGeometry(7, 7, 420, 12, 1, true), new T.MeshBasicMaterial({color: 0xff8a1a, transparent: true, opacity: .35, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending}));
  warnBeam.visible = false; scene.add(warnBeam);
  const pathGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const pathLine = new T.Line(pathGeo, new T.LineBasicMaterial({color: 0xffa31a, transparent: true, opacity: .85, depthWrite: false, blending: T.AdditiveBlending}));
  pathLine.frustumCulled = false; pathLine.visible = false; scene.add(pathLine);
  const setWarn = on => { warnRing.visible = warnBeam.visible = on; if (!on) pathLine.visible = false; };
  const assaultOrbMat = new T.MeshBasicMaterial({color: 0xff9a1a, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false});
  const towerTop = () => towerPos.clone().add(new T.Vector3(0, 14, 0));
  function onAssaultEvent(ev) {
    if (!ev) return;
    if (ev.phase !== 'telegraph') ctx.stopSfx?.('assault_warn');
    if (ev.phase === 'telegraph') { warnRing.position.set(towerPos.x, ctx.groundAt(towerPos.x, towerPos.z) + 1.5, towerPos.z); warnBeam.position.set(towerPos.x, warnRing.position.y + 210, towerPos.z); setWarn(true); ctx.banner('루세르나가 풍향탑을 노린다', '곧 등불이 떨어진다 — 날아오는 주황 등불을 요격하세요', 2.2); ctx.sfx?.('assault_warn'); }
    else if (ev.phase === 'travel') {
      const bp = ctx.bossPos?.(); if (!bp) { onAssaultEvent(assaultResolve(S.assault, ev.id, 'cancelled')); return; }
      const e = ctx.makeEnemy(bp.x, bp.y - 6, bp.z, 'moth'); e.scale.multiplyScalar(1.6);
      e.userData.hp = e.userData.maxHp = S.assault.cfg.projectileHp; e.userData.nightWave = true;
      e.userData.assault = {id: ev.id, t: 0, start: e.position.clone()};
      const orb = new T.Mesh(raidOrbGeo, assaultOrbMat); orb.scale.setScalar(4 / Math.max(.5, e.scale.y)); e.add(orb);
    }
    else if (ev.phase === 'resolved') {
      setWarn(false);
      if (ev.result === 'intercepted') { ctx.banner('요격!', '풍향탑을 지켰다', 1.2); ctx.sfx?.('assault_intercept'); }
    }
  }
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
    S.phase = 'day'; S.dayCue = true; S.t = DAY_SEC; S.crafted = 0; S.dirs = forecast(rngFor(runSeed, S.night, 'forecast')); showOmens();
    tod.setHour(10); ctx.banner(`${S.night}번째 낮`, `오늘 밤 ${S.dirs.map(d => d.name).join('·')}에서 온다 — 작업대에서 준비하세요`, 3.2);
    let k = 0; for (const [type, n] of DAY_ITEMS) for (let i = 0; i < n; i++, k++) { const a = k / 5 * Math.PI * 2 + S.night, r = 14 + (k % 3) * 6; gnd.addGather(`n${S.night}_${type}${i}`, type, -8 + Math.cos(a) * r, -6 + Math.sin(a) * r); }
    ctx.onPhase?.('day');
    if (S.night === 1) { TU.bag0 = bagSum(); tutorStep(canCraft() ? 3 : 1); } else tutorStep(99);
  }
  function startNight() {
    S.phase = 'dusk'; S.t = 2.2; tod.setHour(19); ctx.banner(`${S.night}번째 밤`, `${S.dirs.map(d => d.name).join('·')}에서 등불 군단이 온다`, 2.4); ctx.sfx?.('dusk');
    if (S.night === 1) tutorStep(6);
    S.retry = 0; // 실제 변신·이륙은 update의 dusk 단계에서 게임 시간으로 재시도
  }
  function beginWaves() { if (S.night === 1) tutorStep(7); S.phase = 'night'; tod.setHour(22); S.waveI = 0; S.waveT = 1.5; S.raiders = 0; S.plan = buildWaves({night: S.night, runSeed, dirs: S.dirs}); S.spawnRng = rngFor(runSeed, S.night, 'spawn'); ctx.onPhase?.('night'); }
  function spawnWave() {
    const plan = NIGHT_PLAN(S.night), w = S.plan.waves[S.waveI], d = DIRS.find(x => x.id === w.dir), base = dirVec(d.a).clone(), rnd = S.spawnRng;
    const escort = w.modifier === 'escort';
    for (let i = 0; i < w.count; i++) {
      const hunter = i < w.hunters, side = (i - w.count / 2) * 18;
      // 호위: 사냥꾼이 무리 앞(탑 쪽)에서 출발
      const p = towerPos.clone().addScaledVector(base, (hunter && escort ? 560 : 620) + rnd() * 60).add(v.set(-base.z * side, 0, base.x * side));
      p.y = ctx.groundAt(p.x, p.z) + 70 + rnd() * 40;
      const e = ctx.makeEnemy(p.x, p.y, p.z, hunter ? 'rider' : 'moth');
      if (!hunter) { e.userData.raid = {dir: d, speed: plan.speed * w.speedMultiplier * (.9 + rnd() * .2)}; S.raiders++; const orb = new T.Mesh(raidOrbGeo, raidOrbMat); orb.position.y = 3.2 / Math.max(.5, e.scale.y); orb.scale.setScalar(1 / Math.max(.5, e.scale.y)); e.add(orb); }
      e.userData.nightWave = true;
    }
    const tag = w.modifier === 'rush' ? ' · 돌진!' : escort ? ' · 사냥꾼 호위' : '';
    ctx.banner(`습격 ${S.waveI + 1} / ${S.plan.waves.length}${tag}`, `${d.name}에서 ${w.count}마리${w.modifier === 'rush' ? ' — 빠르다, 서둘러 막아라' : ''}`, w.modifier === 'rush' ? 2 : 1.4);
    if (w.modifier === 'rush') { ctx.shake?.(.3); ctx.sfx?.('wave_rush'); }
    S.waveI++;
  }
  // game.js updateEnemies에서 호출: 습격자 이동·방어막·탑 피해. true면 일반 AI 건너뜀
  function raidStep(e, dt) {
    const u = e.userData;
    if (u.assault) {
      const a = u.assault, cfg = S.assault.cfg; a.t += dt; const k = Math.min(1, a.t / cfg.travel);
      e.position.lerpVectors(a.start, towerTop(), k); e.lookAt(towerPos); e.rotateY(Math.PI);
      pathGeo.attributes.position.setXYZ(0, e.position.x, e.position.y, e.position.z); const tt = towerTop(); pathGeo.attributes.position.setXYZ(1, tt.x, tt.y, tt.z); pathGeo.attributes.position.needsUpdate = true; pathLine.visible = true;
      if (k >= 1) { const ev = assaultResolve(S.assault, a.id, 'impact'); ctx.removeEnemy(e);
        if (ev) { S.stats.impacts++; S.towerHp -= cfg.damage; setBar(); ctx.burst(towerTop(), 0xff8a1a, 80, 30, 1.8); ctx.shake(.8); ctx.sfx?.('tower_hit', towerPos); onAssaultEvent(ev); if (S.towerHp <= 0) lose('루세르나의 등불이 풍향탑을 무너뜨렸습니다'); } }
      return true;
    }
    const r = u.raid; if (!r) return false;
    const to = v.copy(towerPos).add(new T.Vector3(0, 10, 0)).sub(e.position), d = to.length(); to.divideScalar(d || 1);
    e.position.addScaledVector(to, r.speed * dt); e.position.y = Math.max(e.position.y, ctx.groundAt(e.position.x, e.position.z) + 8);
    e.lookAt(towerPos); e.rotateY(Math.PI);
    const sh = S.shields[r.dir.id];
    if (sh > 0 && d < SHIELD_R) { tutorTower(true); S.stats.blocked++; S.shields[r.dir.id]--; const m = shieldMesh[r.dir.id]; if (m) m.material.opacity = .6; setBar(); ctx.burst(e.position, 0x9ff0ff, 30, 20, 1); ctx.removeEnemy(e); S.raiders--; ctx.sfx?.('shield_block', e.position); if (S.shields[r.dir.id] <= 0) { scene.remove(shieldMesh[r.dir.id]); ctx.banner('방어막 소진', r.dir.name, 1.2); } return true; }
    if (d < 22) { tutorTower(false); S.stats.raidHits++; S.towerHp -= RAID_DAMAGE; setBar(); ctx.burst(e.position, 0xff6a2a, 50, 25, 1.4); ctx.shake(.5); ctx.sfx?.('tower_hit', e.position); ctx.removeEnemy(e); S.raiders--; if (S.towerHp <= 0) lose('풍향탑이 무너졌습니다'); return true; }
    return true;
  }
  function startFinale() {
    S.phase = 'crown'; tod.setHour(23.5); ctx.clearNightEnemies(); ctx.crown(); // 엠페러 진화 + 기존 대관식 연출
  }
  function onKill(e) { tutorKill(); if (e.userData.raid) S.raiders--; if (e.userData.assault && S.assault) { S.stats.intercepted++; } if (e.userData.assault && S.assault) onAssaultEvent(assaultResolve(S.assault, e.userData.assault.id, 'intercepted')); }
  function lose(why) { if (S.over) return; S.over = true; ctx.stopSfx?.('assault_warn'); setWarn(false); ctx.end(false, why, S); }
  function win() { if (S.over) return; S.over = true; ctx.stopSfx?.('assault_warn'); setWarn(false); ctx.end(true, `${NIGHTS_TOTAL}번째 밤까지 풍향탑을 지켰습니다`, S); }

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
    menu.hidden = false; tutorMenuOpened();
    menu.querySelectorAll('[data-i]').forEach(bt => bt.onclick = () => { const [id, d] = opts[+bt.dataset.i]; const r = RECIPES_N[id]; if (!has(r.items)) return; pay(r.items);
      if (id === 'repair') { S.towerHp = Math.min(TOWER_MAX, S.towerHp + 30); setBar(); ctx.burst(towerPos.clone().add(v.set(0, 6, 0)), 0xffd27a, 50, 10, .8); }
      else { S.shields[d.id] = SHIELD_CHARGES; makeShield(d); setBar(); }
      ctx.sfx?.('levelup'); S.crafted++; S.stats.crafted.push(`${S.night}:${id === 'repair' ? '수리' : d.name}`); menu.hidden = true; tutorCrafted(id, d); ctx.banner(r.name + (d ? ' · ' + d.name : ''), r.desc, 1.6); gnd.save(); });
    menu.querySelector('[data-x]').onclick = () => { menu.hidden = true; tutorMenuClosed(); };
  }

  // ── 첫 낮·밤 안내 (docs/NIGHTS_ONBOARDING.md, Codex 설계) — 실제 행동으로만 진행, 시간은 멈추지 않음. 1번째 낮·밤에만 ──
  const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const K = TOUCH ? {move: '왼쪽 조이스틱 이동', look: '오른쪽 화면 드래그 시점', use: '상호작용 버튼', breath: 'FIRE(브레스) 버튼'} : {move: 'WASD 이동', look: '마우스 오른쪽 드래그 시점', use: 'E', breath: '클릭/F 브레스'};
  const tutorEl = document.createElement('div'); tutorEl.id = 'tutor'; tutorEl.hidden = true; document.getElementById('hud').appendChild(tutorEl);
  const TU = {step: 0, hide: 0, bag0: 0, hit: false, block: false};
  const bagSum = () => Object.values(gnd.world.bag || {}).reduce((a, n) => a + (n || 0), 0);
  const canCraft = () => has(RECIPES_N.shield.items) || (has(RECIPES_N.repair.items) && S.towerHp < TOWER_MAX);
  function tutor(html, sec = 0) { tutorEl.innerHTML = html; tutorEl.hidden = false; TU.hide = sec; }
  function tutorOff() { tutorEl.hidden = true; TU.hide = 0; }
  const need = () => { const b = gnd.world.bag || {}, f = (k, n) => `${NAME[k]} ${Math.min(b[k] || 0, n)}/${n}`;
    return `방어막: ${Object.entries(RECIPES_N.shield.items).map(([k, n]) => f(k, n)).join(' · ')}<br>수리: ${Object.entries(RECIPES_N.repair.items).map(([k, n]) => f(k, n)).join(' · ')}`; };
  function tutorStep(step) {
    if (S.night !== 1) { TU.step = 99; tutorOff(); return; }
    TU.step = step;
    if (step === 1) tutor(`<b>${K.move} · ${K.look}</b>빛나는 재료에 다가가 <kbd>${K.use}</kbd>`);
    else if (step === 2) tutor(`<b>재료를 모으세요</b>${need()}`);
    else if (step === 3) tutor(`<b>작업대로 가서 <kbd>${K.use}</kbd></b>오늘은 방어막 또는 수리 중 하나를 고르세요`);
    else if (step === 4) tutor(`<b>방어막</b> 예보 방향 습격 ${SHIELD_CHARGES}회 차단<br><b>수리</b> 풍향탑 HP +30${S.towerHp >= TOWER_MAX ? ' (탑이 가득 차 지금은 수리 불가)' : ''}`);
    else if (step === 6) tutor('<b>시간 종료!</b>자동으로 용이 되어 이륙합니다', 5);
    else if (step === 7) tutor(`<b>예보 방향에서 오는 붉은 등불을 막으세요</b>${K.look} · ${K.breath}`, 8);
  }
  function tutorUpdate(dt) {
    if (TU.hide > 0 && (TU.hide -= dt) <= 0) tutorOff();
    if (S.phase !== 'day' || S.night !== 1) return;
    if (TU.step === 1 && bagSum() > TU.bag0) tutorStep(canCraft() ? 3 : 2);
    else if (TU.step === 2) { if (canCraft()) tutorStep(3); else tutorEl.innerHTML = `<b>재료를 모으세요</b>${need()}`; }
  }
  const tutorCrafted = (id, d) => { if (TU.step > 5 || S.night !== 1) return; TU.step = 5; tutor(id === 'repair' ? '<b>풍향탑 수리 완료</b>' : `<b>${d.name} 방어막 준비</b>남은 방향을 먼저 지키세요`, 4); };
  const tutorMenuOpened = () => { if (TU.step >= 1 && TU.step <= 3 && S.night === 1) tutorStep(4); };
  const tutorMenuClosed = () => { if (TU.step === 4) tutorStep(canCraft() ? 3 : 2); };
  const tutorKill = () => { if (TU.step === 7) tutorOff(); };
  const tutorTower = blocked => { if (S.night !== 1) return;
    if (blocked && !TU.block) { TU.block = true; tutor('<b>방어막이 막았습니다</b>남은 횟수는 위 풍향탑 표시', 4); }
    if (!blocked && !TU.hit) { TU.hit = true; tutor('<b>풍향탑이 공격받고 있어요!</b>붉은 등불을 막으세요', 4); } };

  function update(dt) {
    if (S.over) { marks.hidden = true; tutorOff(); return; }
    tutorUpdate(dt);
    if (S.dayCue && S.phase === 'day') { S.dayCue = false; ctx.sfx?.('day_start'); }
    updateMarks();
    for (const k in shieldMesh) { const m = shieldMesh[k]; m.material.opacity += (.16 - m.material.opacity) * Math.min(1, dt * 3); }
    if (S.phase === 'day') {
      S.t -= dt; if (S.t <= 0) { if (!menu.hidden) { menu.hidden = true; } startNight(); }
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
      if (S.waveI < S.plan.waves.length) { S.waveT -= dt; if (S.waveT <= 0) { spawnWave(); S.waveT = plan.interval; } }
      else if (ctx.nightEnemies() === 0) { // 밤 끝 → 아침
        for (const k in shieldMesh) { scene.remove(shieldMesh[k]); delete shieldMesh[k]; } S.shields = {}; setBar();
        if (S.night >= NIGHTS_TOTAL) { startFinale(); return; }
        S.phase = 'morning'; S.t = 3; tod.setHour(6.5); ctx.morning(S.night); S.night++;
      }
    } else if (S.phase === 'morning') { S.t -= dt; if (S.t <= 0) { S.phase = 'await'; ctx.banner('아침', '공터에 착륙해 인간형으로 낮 준비를 하세요 (금빛 기둥)', 3); } }
    else if (S.phase === 'await') { if (gnd.mode === 'human') startDay(); }
    else if (S.phase === 'crown') { if (!ctx.coronationActive()) { S.phase = 'boss'; S.bossSpawned = true; ctx.spawnFinaleBoss(FINALE.bossHp); S.assault = createAssault(); } }
    else if (S.phase === 'boss') {
      if (S.bossSpawned && !ctx.bossAlive()) { setWarn(false); return win(); }
      if (!ctx.coronationActive()) for (const ev of assaultStep(S.assault, dt)) onAssaultEvent(ev);
      if (warnRing.visible) { const p = 1 + Math.sin(performance.now() / 120) * .06; warnRing.scale.setScalar(p); warnBeam.material.opacity = .1 + .12 * Math.abs(Math.sin(performance.now() / 160)); }
    }
  }
  function objective() {
    const ds = S.dirs.map(d => d.name).join('·');
    if (S.phase === 'day') return `${S.night}번째 낮 · ${Math.ceil(S.t)}초 · 오늘 밤 ${ds} — 재료를 모아 작업대에서 준비`;
    if (S.phase === 'dusk') return '해질녘 · 용으로 이륙';
    if (S.phase === 'night') { const n = S.plan ? S.plan.waves.length : NIGHT_PLAN(S.night).waves; return `${S.night}번째 밤 · 습격 ${Math.min(S.waveI, n)}/${n} · 남은 적 ${ctx.nightEnemies()} — 탑으로 오는 등불을 막으세요`; }
    if (S.phase === 'morning' || S.phase === 'await') return '아침 · 금빛 기둥(공터)에 착륙해 변신';
    if (S.phase === 'crown') return '드래곤 엠페러 대관 — 하늘이 응답한다';
    if (S.phase === 'boss') { const A = S.assault, w = A && A.state === 'telegraph' ? ` · ⚠ 탑 공격 ${Math.ceil(A.t)}초` : A && A.state === 'travel' ? ' · ⚠ 주황 등불을 요격!' : '';
      return '등불의 여왕 루세르나를 쓰러뜨리세요 · 풍향탑을 지키며' + w; }
    return '';
  }
  setBar(); startDay();
  const canLand = () => !(S.phase === 'night' || S.phase === 'dusk' || S.phase === 'crown' || S.phase === 'boss');
  const bossQuiet = () => S.phase === 'boss' && !!S.assault && S.assault.state === 'telegraph'; // 예고 중엔 새 탄막·소환 금지
  return {update, raidStep, canLand, bossQuiet, onKill, onInteract, promptFor, objective, get state() { return S; }, towerPos, debug: {startNight, win, lose, startFinale, get tutorial() { return {step: TU.step, shown: !tutorEl.hidden, text: tutorEl.textContent}; }}};
}
