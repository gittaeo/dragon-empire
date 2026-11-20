// 지상 시제품 (2026-11-20): 착륙 → 인간형 폴리모프 → 걷기·채집·제작·수리 → 용 복귀 → 이륙, 저장/복구.
// 첫 임무 '꺼진 등불, 남은 숨결'. 확정되지 않은 규칙(변신 제약 등)은 "임시"로 표시하고 HANDOFF/사용자에게 보고한다.
import * as T from './vendor/three.module.js';
import {MISSION01} from './mission01.js';

// ---------- 순수 데이터·함수 (단위 테스트 대상) ----------
export const ZONE = {x: -116.5, z: 1410, r: 220, name: '풍향탑 공터'}; // 스폰 앞 강가의 평평한 공터
export const SAVE_KEY = 'dragonEmpireWorld', SAVE_VERSION = 2, ACTIVE_SLOT_KEY = 'dragonEmpireActiveSlot', MAX_SLOTS = 3;
// 저장 슬롯: 슬롯 1은 기존 키 그대로(이전 저장 자동 이어받기), 슬롯 2·3은 접미사. 용의 결정(dragonEmpireCoins)은 슬롯 공용(미정 → 현행 유지)
export const slotKey = n => n <= 1 ? SAVE_KEY : SAVE_KEY + '.s' + n;
export function activeSlot(store) { const n = parseInt(store.get(ACTIVE_SLOT_KEY) || '1', 10); return n >= 1 && n <= MAX_SLOTS ? n : 1; }
export function listSlots(store) { const out = []; for (let n = 1; n <= MAX_SLOTS; n++) { const {world, from} = loadWorld(store, n); if (from) out.push({slot: n, world}); } return out; }
export const RECIPES = {workbench: {branch: 2, stone: 2}, kit: {branch: 1, stone: 1, shard: 1}};
export const ITEM_NAMES = {branch: '나뭇가지', stone: '돌', shard: '숨결 파편', kit: '수리 키트'};
// 퀘스트 단계 (HUD 문구는 mission01.js)
export const STEPS = ['land', 'polymorph', 'meet', 'gather', 'workbench', 'kit', 'repair', 'takeoff', 'done'];
export const GATHER_GOAL = {branch: 3, stone: 3, shard: 1};
export const LAND = {maxSlope: .35, maxAltitude: 45, sampleRadius: 4.6};

// 착륙(또는 용으로 돌아갈) 자리 판정. 떠 있는 섬·아치 위는 지원하지 않음(지형 heightAt 기준만 신뢰)
// props: 공터에 직접 배치한 소품(풍향탑·작업대·NPC) [{x,z,r}] — 지형 장애물 API에 없으므로 따로 검사 (Codex 리뷰로 발견)
export function evaluateLanding(terrain, x, y, z, scale, {checkAltitude = true, zone = ZONE, props = []} = {}) {
  if (Math.hypot(x - zone.x, z - zone.z) > zone.r) return {ok: false, reason: '시제품에서는 풍향탑 공터 안에서만 착륙할 수 있습니다'};
  const r = LAND.sampleRadius * scale, W = terrain.waterLevel;
  let mn = Infinity, mx = -Infinity, wet = 0, n = 0;
  for (let a = 0; a < 12; a++) for (const k of [0, .5, 1]) {
    const h = terrain.heightAt(x + Math.cos(a / 12 * Math.PI * 2) * r * k, z + Math.sin(a / 12 * Math.PI * 2) * r * k);
    mn = Math.min(mn, h); mx = Math.max(mx, h); if (h < W + 1) wet++; n++;
  }
  const center = terrain.heightAt(x, z);
  if (wet > n * .15) return {ok: false, reason: '물 위에는 착륙할 수 없습니다'};
  const slope = (mx - mn) / Math.max(1, 2 * r);
  if (slope > LAND.maxSlope) return {ok: false, reason: '경사가 너무 가파릅니다', slope};
  if (checkAltitude && y - center > LAND.maxAltitude * Math.max(1, scale * .6)) return {ok: false, reason: '더 낮게 내려가야 착륙할 수 있습니다', altitude: y - center};
  const groundY = Math.max(center, mx - r * .1);
  for (const q of props) if (Math.hypot(x - q.x, z - q.z) < r + q.r) return {ok: false, reason: `${q.name || '구조물'}과 겹쳐 착륙할 수 없습니다`};
  if (terrain.obstacleAt) {
    const o = terrain.obstacleAt(x, groundY + 3 * scale, z, 3.2 * scale);
    if (o.hit) return {ok: false, reason: '바위·탑에 가로막혀 공간이 부족합니다'};
    if (checkAltitude && terrain.raycastObstacles && y > groundY + 2) {
      const hit = terrain.raycastObstacles({x, y, z}, {x, y: groundY + 1, z});
      if (hit) return {ok: false, reason: '아래에 섬·아치가 있어 내려갈 수 없습니다'};
    }
  }
  return {ok: true, y: groundY, slope};
}

export const emptyWorld = () => ({version: SAVE_VERSION, dragon: null, form: 'air', pos: null, dragonPos: null, yaw: 0, bag: {branch: 0, stone: 0, shard: 0, kit: 0}, collected: [], built: {workbench: false, tower: false}, step: 0, talked: 0, savedAt: 0});
// 저장 형식이 깨졌거나 버전이 다르면 백업 → 기본값 순서로 복구. 알 수 없는 필드는 보존
export function migrateWorld(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const w = {...emptyWorld(), ...raw, bag: {...emptyWorld().bag, ...(raw.bag || {})}, built: {...emptyWorld().built, ...(raw.built || {})}};
  if (!Array.isArray(w.collected)) w.collected = [];
  if (!['air', 'landed', 'human'].includes(w.form)) w.form = 'air';
  w.step = Math.max(0, Math.min(STEPS.length - 1, w.step | 0));
  w.version = SAVE_VERSION;
  return w;
}
export function loadWorld(store, slot = 1) {
  const KEY = slotKey(slot);
  for (const key of [KEY, KEY + '.bak']) {
    try { const s = store.get(key); if (!s) continue; const w = migrateWorld(JSON.parse(s)); if (w) return {world: w, from: key}; } catch {}
  }
  return {world: emptyWorld(), from: null};
}
// 저장: 직전 값이 정상일 때만 백업으로 옮김(손상된 주 저장이 정상 백업을 덮던 문제 — Codex QA 발견),
// 쓴 뒤 다시 읽어 확인하고 성공 여부를 돌려줌(저장소 차단·용량 부족을 숨기지 않음)
export function saveWorld(store, world, slot = 1) {
  const KEY = slotKey(slot), prev = store.get(KEY);
  if (prev) { try { if (migrateWorld(JSON.parse(prev))) store.set(KEY + '.bak', prev); } catch { /* 손상된 주 저장은 백업으로 옮기지 않음 */ } }
  const text = JSON.stringify({...world, version: SAVE_VERSION, savedAt: Date.now()});
  store.set(KEY, text);
  return store.get(KEY) === text;
}
export function canAfford(bag, recipe) { return Object.entries(recipe).every(([k, v]) => (bag[k] || 0) >= v); }
export function pay(bag, recipe) { for (const [k, v] of Object.entries(recipe)) bag[k] -= v; }

// ---------- 실행 ----------
export function createGround(ctx) {
  const {scene, terrain, player, store} = ctx, W = terrain.waterLevel, hAt = (x, z) => terrain.heightAt(x, z);
  const slot = ctx.slot || 1;
  let {world, from} = loadWorld(store, slot), saveFailNotified = false;
  let mode = 'air', anim = null, dragonMul = 1, saveTimer = 0, prompt = null, dialog = null, human = null;
  const hp = {pos: new T.Vector3(), vel: new T.Vector3(), yaw: 0, onGround: true, walkT: 0};
  const v = new T.Vector3(), v2 = new T.Vector3();
  const mat = (c, e = {}) => new T.MeshStandardMaterial({color: c, roughness: .75, ...e});
  const groundAt = (x, z) => Math.max(hAt(x, z), W);

  // --- 장소: 공터 중심 기준 배치 (물·경사 피해서 지면에 놓음)
  function placeOnGround(dx, dz) {
    let x = ZONE.x + dx, z = ZONE.z + dz;
    for (let i = 0; i < 10 && hAt(x, z) < W + 1.2; i++) { x -= dx * .12; z -= dz * .12; } // 물이면 중심 쪽으로 당김
    return new T.Vector3(x, hAt(x, z), z);
  }
  const root = new T.Group(); scene.add(root);
  // 표식 기둥(하늘에서 공터 찾기용)
  const beacon = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 600, 16, 1, true), new T.MeshBasicMaterial({color: 0xffd27a, transparent: true, opacity: .14, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide}));
  beacon.position.set(ZONE.x, hAt(ZONE.x, ZONE.z) + 300, ZONE.z); root.add(beacon);
  const zoneRing = new T.Mesh(new T.RingGeometry(ZONE.r - 2, ZONE.r, 96), new T.MeshBasicMaterial({color: 0xffd27a, transparent: true, opacity: .0, side: T.DoubleSide, depthWrite: false}));
  zoneRing.rotation.x = -Math.PI / 2; zoneRing.position.set(ZONE.x, hAt(ZONE.x, ZONE.z) + 3, ZONE.z); root.add(zoneRing);

  // 풍향탑 (고장): 기둥 + 날개 + 꺼진 등불
  const towerPos = placeOnGround(14, -10);
  const tower = new T.Group(); tower.position.copy(towerPos); root.add(tower);
  const wood = mat(0x6b4a2e), iron = mat(0x4a4a52, {metalness: .6, roughness: .5});
  const pole = new T.Mesh(new T.CylinderGeometry(.35, .55, 9, 8), wood); pole.position.y = 4.5; tower.add(pole);
  const vaneHub = new T.Group(); vaneHub.position.set(0, 8.6, .5); tower.add(vaneHub);
  for (let i = 0; i < 4; i++) { const b = new T.Mesh(new T.BoxGeometry(.25, 3.2, .06), wood); b.position.y = 1.6; const arm = new T.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); vaneHub.add(arm); }
  vaneHub.rotation.z = .5; vaneHub.children[1].rotation.z += .7; // 부러져 비뚤어진 날개
  const lanternMat = mat(0x2a2a30, {emissive: 0x000000, metalness: .3});
  const lantern = new T.Mesh(new T.SphereGeometry(.55, 12, 10), lanternMat); lantern.position.set(0, 7.2, .7); tower.add(lantern);
  const cage = new T.Mesh(new T.OctahedronGeometry(.8, 0), new T.MeshBasicMaterial({color: 0x8a6a2b, wireframe: true})); cage.position.copy(lantern.position); tower.add(cage);
  const towerLight = new T.PointLight(0xffb04a, 0, 40, 1.6); towerLight.position.copy(lantern.position); tower.add(towerLight);

  // 작업대 터 / 작업대
  const benchPos = placeOnGround(-8, -6);
  const benchSite = new T.Mesh(new T.RingGeometry(1.1, 1.4, 24), new T.MeshBasicMaterial({color: 0xffd27a, transparent: true, opacity: .7, side: T.DoubleSide}));
  benchSite.rotation.x = -Math.PI / 2; benchSite.position.copy(benchPos).add(v.set(0, .08, 0)); root.add(benchSite);
  const bench = new T.Group(); bench.position.copy(benchPos); bench.visible = false; root.add(bench);
  { const top = new T.Mesh(new T.BoxGeometry(2.2, .18, 1.1), wood); top.position.y = .95; bench.add(top);
    for (const [x, z] of [[-1, -.45], [1, -.45], [-1, .45], [1, .45]]) { const l = new T.Mesh(new T.BoxGeometry(.14, .95, .14), wood); l.position.set(x, .47, z); bench.add(l); }
    const anvil = new T.Mesh(new T.BoxGeometry(.5, .3, .35), iron); anvil.position.set(.5, 1.2, 0); bench.add(anvil); }

  // NPC 세라 (절차적 인물)
  function person(cloak, skin = 0xe9c3a0, hair = 0x3a2418) {
    const g = new T.Group();
    const body = new T.Mesh(new T.CapsuleGeometry(.28, .7, 4, 10), mat(cloak)); body.position.y = 1.05; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(.22, 14, 12), mat(skin)); head.position.y = 1.72; g.add(head);
    const hairM = new T.Mesh(new T.SphereGeometry(.235, 14, 12, 0, Math.PI * 2, 0, Math.PI * .55), mat(hair)); hairM.position.y = 1.75; g.add(hairM);
    const legs = []; for (const s of [-1, 1]) { const l = new T.Mesh(new T.CapsuleGeometry(.1, .5, 3, 6), mat(0x2b2b33)); l.position.set(s * .13, .38, 0); g.add(l); legs.push(l); }
    const arms = []; for (const s of [-1, 1]) { const a = new T.Mesh(new T.CapsuleGeometry(.08, .5, 3, 6), mat(cloak)); a.position.set(s * .38, 1.15, 0); g.add(a); arms.push(a); }
    g.userData = {legs, arms, body};
    return g;
  }
  const seraPos = placeOnGround(10, -4);
  const props = [{name: '풍향탑', x: towerPos.x, z: towerPos.z, r: 2.5}, {name: '작업대', x: benchPos.x, z: benchPos.z, r: 1.8}, {name: '세라', x: seraPos.x, z: seraPos.z, r: 1.2}];
  const sera = person(0x3f6b6a, 0xe6bf9a, 0x6a3a22); sera.position.copy(seraPos); root.add(sera);
  const seraLamp = new T.Mesh(new T.SphereGeometry(.12, 8, 6), new T.MeshBasicMaterial({color: 0xffc24a})); seraLamp.position.set(.42, .85, .1); sera.add(seraLamp);

  // 채집물: 필요량보다 많이 배치(진행 막힘 방지). id는 저장용
  const spots = [
    ...[[-20, 8], [-28, -14], [6, 22], [-14, 26], [24, 16]].map((p, i) => ({id: 'branch' + i, type: 'branch', d: p})),
    ...[[18, -26], [-6, -24], [30, -2], [-30, 4], [2, 30]].map((p, i) => ({id: 'stone' + i, type: 'stone', d: p})),
    ...[[20, -14], [-22, -24]].map((p, i) => ({id: 'shard' + i, type: 'shard', d: p})),
  ];
  const branchGeo = new T.CylinderGeometry(.06, .09, 1.4, 6), stoneGeo = new T.DodecahedronGeometry(.38, 0), shardGeo = new T.OctahedronGeometry(.32, 0);
  const shardMat = new T.MeshStandardMaterial({color: 0xffc85a, emissive: 0xff8a2a, emissiveIntensity: 1.4});
  for (const s of spots) {
    const p = placeOnGround(s.d[0], s.d[1]); let m;
    if (s.type === 'branch') { m = new T.Group(); for (let k = 0; k < 3; k++) { const b = new T.Mesh(branchGeo, wood); b.rotation.set(Math.PI / 2, 0, k * .8); b.position.y = .1 + k * .05; m.add(b); } }
    else if (s.type === 'stone') { m = new T.Mesh(stoneGeo, mat(0x8b8780)); m.position.y = .25; const g = new T.Group(); g.add(m); m = g; }
    else { m = new T.Group(); const c = new T.Mesh(shardGeo, shardMat); c.position.y = .7; c.scale.y = 1.6; m.add(c); }
    m.position.copy(p); root.add(m); s.mesh = m; s.pos = p; m.visible = !world.collected.includes(s.id);
  }

  // 인간형 주인공 (같은 주인공의 다른 모습: 망토 색은 혈통 색)
  human = person(0x7a2a1a, 0xeec9a5, 0x2a1a12); human.visible = false; scene.add(human);
  const ember = new T.Mesh(new T.SphereGeometry(.07, 8, 6), new T.MeshBasicMaterial({color: 0xffa23a})); ember.position.set(0, 1.25, -.29); human.add(ember);
  // --- 승인된 여성 폴리모프 모델(Codex 제작, manifest 'polymorph_female'). 클립이 없어 뼈대를 절차적으로 움직여 걷게 함
  let hero = null, heroAmt = 0; const bones = {}, rest = {}, axis = {};
  const BONES = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
  async function loadHero() {
    if (!ctx.loadModel || hero) return false;
    const m = await ctx.loadModel('polymorph_female', {height: 1.75, feet: true}); if (!m) return false;
    m.updateMatrixWorld(true);
    m.traverse(o => { if (o.isBone && BONES.includes(o.name)) bones[o.name] = o; });
    const qp = new T.Quaternion();
    for (const [n, b] of Object.entries(bones)) { // 몸의 좌우축(모델 X)을 각 뼈 부모 좌표계로 바꿔 둠 → 앞뒤 흔들기 축
      rest[n] = b.quaternion.clone(); b.parent.getWorldQuaternion(qp); axis[n] = new T.Vector3(1, 0, 0).applyQuaternion(qp.invert()).normalize();
    }
    for (const c of human.children) c.visible = false;
    human.add(m); hero = m; return true;
  }
  const _q = new T.Quaternion();
  function pose(n, ang) { const b = bones[n]; if (b) b.quaternion.copy(rest[n]).premultiply(_q.setFromAxisAngle(axis[n], ang)); }
  function animateHero(t, moving, dt, run) {
    heroAmt += ((moving ? 1 : 0) - heroAmt) * Math.min(1, dt * 8);
    const a = heroAmt, sw = Math.sin(t), k = run ? 1.25 : 1;
    pose('LeftUpLeg', .5 * k * sw * a); pose('RightUpLeg', -.5 * k * sw * a);
    pose('LeftLeg', -.75 * k * a * Math.max(0, Math.sin(t - 1.2))); pose('RightLeg', -.75 * k * a * Math.max(0, Math.sin(t + Math.PI - 1.2)));
    pose('LeftArm', -.35 * k * sw * a); pose('RightArm', .35 * k * sw * a);
    pose('LeftForeArm', -.2 * a); pose('RightForeArm', -.2 * a);
    const breath = Math.sin(ctx.time() * 1.6) * .03 * (1 - a);
    pose('Spine02', breath + .06 * a * (run ? 1.5 : 1)); pose('Hips', .04 * a);
    if (bones.Hips) bones.Hips.position.y = bones.Hips.userData.y0 ?? (bones.Hips.userData.y0 = bones.Hips.position.y);
  }
  function tintHuman() { const c = ctx.path() === 'storm' ? 0x2a5a8a : 0x7a2a1a; human.userData.body.material.color.set(c); for (const a of human.userData.arms) a.material.color.set(c); ember.material.color.set(ctx.path() === 'storm' ? 0x9ff0ff : 0xffa23a); }

  // --- 저장된 진행 반영
  function applyWorldVisuals() {
    bench.visible = world.built.workbench; benchSite.visible = !world.built.workbench;
    const lit = world.built.tower; lanternMat.emissive.set(lit ? 0xffa23a : 0x000000); lanternMat.emissiveIntensity = lit ? 2.2 : 0; towerLight.intensity = lit ? 60 : 0;
    if (lit) { vaneHub.children[1].rotation.z = Math.PI / 2; }
    for (const s of spots) s.mesh.visible = !world.collected.includes(s.id);
  }
  applyWorldVisuals();

  // --- HUD (상황별 버튼은 PC 클릭·모바일 터치 공용)
  const hud = document.createElement('div'); hud.id = 'ground-hud';
  hud.innerHTML = `<div class="g-prompt" hidden></div>
    <div class="g-bag" hidden></div>
    <div class="g-actions"><button data-a="land" hidden>착륙 <kbd>G</kbd></button><button data-a="morph" hidden>인간형으로 <kbd>H</kbd></button><button data-a="dragon" hidden>용으로 돌아가기 <kbd>H</kbd></button><button data-a="interact" hidden>상호작용 <kbd>E</kbd></button><button data-a="takeoff" hidden>이륙 <kbd>SPACE</kbd></button></div>
    <div class="g-help" hidden><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 걷기 · <kbd>SHIFT</kbd> 달리기 · <kbd>우클릭 드래그</kbd> 시점 · <kbd>E</kbd> 상호작용 · <kbd>H</kbd> 변신</div>
    <div class="g-dialog" hidden><b></b><p></p><small>E / 클릭으로 계속</small></div>`;
  document.body.appendChild(hud);
  const $h = s => hud.querySelector(s);
  hud.querySelectorAll('[data-a]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); action(b.dataset.a); }));
  $h('.g-dialog').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); nextLine(); });

  function action(a) {
    if (a === 'land') tryLand(); else if (a === 'morph') toHuman(); else if (a === 'dragon') toDragon();
    else if (a === 'interact') interact(); else if (a === 'takeoff') takeoff();
  }
  // --- 대화
  function say(lines, done) { dialog = {lines: lines.slice(), i: 0, done}; showLine(); }
  function showLine() { const l = dialog.lines[dialog.i]; $h('.g-dialog').hidden = false; $h('.g-dialog b').textContent = l.who || ''; $h('.g-dialog p').textContent = l.text; }
  function nextLine() { if (!dialog) return; dialog.i++; if (dialog.i >= dialog.lines.length) { const d = dialog.done; dialog = null; $h('.g-dialog').hidden = true; d?.(); } else showLine(); }

  function setStep(name) { const i = STEPS.indexOf(name); if (i > world.step) { world.step = i; save(); } }
  const step = () => STEPS[world.step];
  function save() { if (anim) return; world.terrain = 'seed7-v1'; world.form = mode; world.pos = mode === 'human' ? {x: hp.pos.x, y: hp.pos.y, z: hp.pos.z} : null; world.dragonPos = mode !== 'air' ? {x: player.position.x, y: player.position.y, z: player.position.z} : world.dragonPos; world.yaw = ctx.getYaw(); let ok = false; try { ok = saveWorld(store, world, slot); } catch (e) { console.warn('[save]', e); } if (!ok && !saveFailNotified) { saveFailNotified = true; ctx.banner('저장 실패', '브라우저 저장소를 쓸 수 없습니다 — 진행이 유지되지 않을 수 있습니다', 3); } else if (ok) saveFailNotified = false; return ok; }

  // --- 착륙
  let landCheck = {ok: false, reason: ''};
  function tryLand() {
    if (mode !== 'air' || anim) return false;
    landCheck = evaluateLanding(terrain, player.position.x, player.position.y, player.position.z, ctx.scale(), {props});
    if (!landCheck.ok) { ctx.banner('착륙 불가', landCheck.reason, 1.6); ctx.sfx?.('ui_click'); return false; }
    const from = player.position.clone(), to = new T.Vector3(player.position.x, landCheck.y + 2.2 * ctx.scale(), player.position.z);
    anim = {t: 0, dur: 1.2, from, to, kind: 'land'}; ctx.onLandStart?.(); return true;
  }
  function finishLand() { mode = 'landed'; ctx.onModeChange(mode); ctx.burst(player.position, 0xd9c8a0, 40, 18, ctx.fx()); ctx.shake(.35); const first = world.step === 0; if (first) setStep('polymorph'); save(); ctx.banner('착륙', world.step <= 1 ? 'H — 인간형으로 변신' : 'SPACE 이륙 · H 변신', 1.6); if (first) say(MISSION01.arrive); }
  function takeoff() {
    if (mode !== 'landed' || anim) return false;
    anim = {t: 0, dur: .8, from: player.position.clone(), to: player.position.clone().add(v.set(0, 14 * ctx.scale(), 0)), kind: 'takeoff'}; return true;
  }
  function finishTakeoff() { mode = 'air'; ctx.onModeChange(mode); if (step() === 'takeoff') { setStep('done'); ctx.banner(MISSION01.titles.done, '임무 완료 · 진행 상황이 저장되었습니다', 3); } save(); }

  // --- 변신 (임시 규칙: 착륙한 상태에서만, 공터 안에서만)
  function freeSpotNear(center, radius) {
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = center.x + Math.cos(a) * radius, z = center.z + Math.sin(a) * radius, y = hAt(x, z);
      if (y < W + .5) continue; if (Math.abs(y - hAt(center.x, center.z)) > radius * .6) continue;
      if (terrain.obstacleAt && terrain.obstacleAt(x, y + 1, z, .6).hit) continue;
      return new T.Vector3(x, y, z);
    }
    return null;
  }
  function toHuman() {
    if (mode !== 'landed' || anim) return false;
    const spot = freeSpotNear(player.position, 2 + 2 * ctx.scale()) || freeSpotNear(player.position, 6 + 3 * ctx.scale());
    if (!spot) { ctx.banner('변신 실패', '인간형이 설 자리가 없습니다', 1.5); return false; }
    hp.pos.copy(spot); hp.vel.set(0, 0, 0); hp.yaw = ctx.getYaw(); tintHuman();
    anim = {t: 0, dur: .55, kind: 'toHuman'}; ctx.burst(player.position, ctx.pathColor(0xffa33d, 0x9ff0ff), 90, 30, ctx.fx()); ctx.sfx?.('evolve'); ctx.shake(.4); return true;
  }
  function finishToHuman() {
    mode = 'human'; human.visible = true; human.position.copy(hp.pos); player.visible = false; ctx.onModeChange(mode);
    ctx.burst(hp.pos.clone().add(v.set(0, 1, 0)), ctx.pathColor(0xffd27a, 0xbff6ff), 40, 6, .5);
    if (world.step <= 2) { setStep('meet'); say(MISSION01.meet, () => setStep('gather')); } save();
  }
  function toDragon() {
    if (mode !== 'human' || anim) return false;
    const c = evaluateLanding(terrain, hp.pos.x, hp.pos.y, hp.pos.z, ctx.scale(), {checkAltitude: false, props});
    if (!c.ok) { ctx.banner('용으로 돌아갈 수 없음', c.reason === '시제품에서는 풍향탑 공터 안에서만 착륙할 수 있습니다' ? '공터 안으로 돌아가세요' : c.reason + ' — 넓은 곳으로 이동하세요', 1.8); return false; }
    player.position.set(hp.pos.x, c.y + 2.2 * ctx.scale(), hp.pos.z);
    anim = {t: 0, dur: .55, kind: 'toDragon'}; ctx.burst(hp.pos.clone().add(v.set(0, 1, 0)), ctx.pathColor(0xffa33d, 0x9ff0ff), 90, 30, 1.2); ctx.sfx?.('evolve'); ctx.shake(.5); return true;
  }
  function finishToDragon() {
    mode = 'landed'; human.visible = false; player.visible = true; ctx.onModeChange(mode);
    ctx.burst(player.position, ctx.pathColor(0xffd27a, 0xbff6ff), 120, 40, ctx.fx());
    if (step() === 'takeoff') ctx.banner('용의 모습', 'SPACE — 이륙', 1.6);
    save();
  }

  // --- 상호작용
  function nearest() {
    if (mode !== 'human') return null;
    let best = null, bd = 2.8;
    const consider = (kind, pos, extra = {}) => { const d = Math.hypot(pos.x - hp.pos.x, pos.z - hp.pos.z); if (d < bd) { bd = d; best = {kind, pos, ...extra}; } };
    for (const s of spots) if (!world.collected.includes(s.id)) consider('gather', s.pos, {spot: s});
    consider('sera', seraPos); consider(world.built.workbench ? 'bench' : 'site', benchPos); consider('tower', towerPos);
    return best;
  }
  function interact() {
    if (dialog) { nextLine(); return; }
    const n = nearest(); if (!n) return;
    const bag = world.bag, st = step();
    if (n.kind === 'gather') {
      const s = n.spot; world.collected.push(s.id); bag[s.type]++; s.mesh.visible = false;
      ctx.burst(s.pos.clone().add(v.set(0, .6, 0)), s.type === 'shard' ? 0xffc85a : 0xd9c8a0, 18, 5, .4); ctx.sfx?.(s.type === 'shard' ? 'levelup' : 'ui_click');
      ctx.banner(`${ITEM_NAMES[s.type]} +1`, MISSION01.pickup[s.type] || '', 1.2);
      if (st === 'meet' || st === 'gather') { setStep('gather'); if (canAfford(bag, GATHER_GOAL) || (bag.branch >= 3 && bag.stone >= 3 && bag.shard >= 1)) { setStep('workbench'); say(MISSION01.gathered); } }
      save(); return;
    }
    if (n.kind === 'sera') { const t = {meet: MISSION01.meet, gather: MISSION01.hint, workbench: MISSION01.hintBench, kit: MISSION01.hintKit, repair: MISSION01.hintRepair, takeoff: MISSION01.farewell, done: MISSION01.after}[st] || MISSION01.meet; say(t, () => { if (st === 'meet') setStep('gather'); }); return; }
    if (n.kind === 'site') {
      if (!canAfford(bag, RECIPES.workbench)) { ctx.banner('재료 부족', `작업대: 나뭇가지 2 · 돌 2 (보유 ${bag.branch}·${bag.stone})`, 1.6); say([{who: '세라', text: MISSION01.blocked.materials}]); return; }
      pay(bag, RECIPES.workbench); world.built.workbench = true; applyWorldVisuals(); ctx.burst(benchPos.clone().add(v.set(0, 1, 0)), 0xffd27a, 50, 8, .6); ctx.sfx?.('skill_shield');
      if (world.step <= STEPS.indexOf('workbench')) setStep('kit'); say(MISSION01.benchBuilt); save(); return;
    }
    if (n.kind === 'bench') {
      if (bag.kit > 0 || world.built.tower) { ctx.banner('작업대', bag.kit > 0 ? '수리 키트를 이미 가지고 있습니다' : '지금 만들 것이 없습니다', 1.2); return; }
      if (!canAfford(bag, RECIPES.kit)) { ctx.banner('재료 부족', `수리 키트: 나뭇가지 1 · 돌 1 · 숨결 파편 1`, 1.6); return; }
      pay(bag, RECIPES.kit); bag.kit = 1; ctx.burst(benchPos.clone().add(v.set(0, 1.2, 0)), 0xffc85a, 40, 6, .5); ctx.sfx?.('levelup');
      if (world.step <= STEPS.indexOf('kit')) setStep('repair'); say(MISSION01.kitMade); save(); return;
    }
    if (n.kind === 'tower') {
      if (world.built.tower) { ctx.banner('풍향탑', '바람이 다시 돌고 있습니다', 1.2); return; }
      if (!bag.kit) { ctx.banner('수리 키트가 필요합니다', world.built.workbench ? '작업대에서 수리 키트를 만드세요' : '먼저 작업대를 지으세요', 1.6); if (!world.built.workbench) say([{who: '세라', text: MISSION01.blocked.workbench}]); return; }
      bag.kit = 0; world.built.tower = true; applyWorldVisuals(); ctx.burst(towerPos.clone().add(v.set(0, 7.5, 0)), 0xffd27a, 120, 20, 1); ctx.shake(.5); ctx.sfx?.('coronation');
      setStep('takeoff'); say(MISSION01.repaired, () => say(MISSION01.farewell)); save(); return;
    }
  }

  // --- 매 프레임
  const camV = new T.Vector3(), camT = new T.Vector3();
  function updateHuman(dt, keys, ts) {
    const yaw = ctx.getYaw();
    const fx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + ts.moveX, fz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + ts.moveY;
    const len = Math.min(1, Math.hypot(fx, fz)), run = keys.ShiftLeft || keys.ShiftRight || ts.boost ? 1.8 : 1, speed = 4.2 * run;
    if (dialog) { /* 대화 중에는 정지 */ }
    else if (len > .05) {
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw), rX = Math.cos(yaw), rZ = -Math.sin(yaw);
      const mx = (fwdX * fz + rX * fx) / Math.max(1, Math.hypot(fx, fz)), mz = (fwdZ * fz + rZ * fx) / Math.max(1, Math.hypot(fx, fz));
      const nx = hp.pos.x + mx * speed * dt, nz = hp.pos.z + mz * speed * dt, ny = hAt(nx, nz), cy = hAt(hp.pos.x, hp.pos.z);
      const climb = (ny - cy) / Math.max(.001, speed * dt);
      // 물(깊이 0.5m 이상)·급경사(>1.2)·공터 밖 반경+120m 은 막음
      const blocked = ny < W - .5 || climb > 1.2 || Math.hypot(nx - ZONE.x, nz - ZONE.z) > ZONE.r + 120;
      if (!blocked) { hp.pos.x = nx; hp.pos.z = nz; }
      hp.yaw = Math.atan2(-mx, -mz); hp.walkT += dt * speed * 1.6;
    }
    hp.vel.y -= 20 * dt; hp.pos.y += hp.vel.y * dt;
    const gy = groundAt(hp.pos.x, hp.pos.z); if (hp.pos.y <= gy) { hp.pos.y = gy; hp.vel.y = 0; hp.onGround = true; }
    if (terrain.obstacleAt) { const o = terrain.obstacleAt(hp.pos.x, hp.pos.y + .9, hp.pos.z, .4); if (o.hit) { hp.pos.x += o.normal.x * o.depth; hp.pos.z += o.normal.z * o.depth; } }
    for (const q of props) { const dx = hp.pos.x - q.x, dz = hp.pos.z - q.z, d = Math.hypot(dx, dz), min = q.r * .45 + .35; if (d < min) { const k = d > 1e-4 ? 1 / d : 0; hp.pos.x = q.x + (k ? dx * k : 1) * min; hp.pos.z = q.z + dz * k * min; } }
    // 낙하 안전장치
    if (!(hp.pos.y > -50) || !isFinite(hp.pos.x)) { const sp = placeOnGround(0, 0); hp.pos.copy(sp); }
    human.position.copy(hp.pos); human.rotation.y = hp.yaw;
    const sw = len > .05 && !dialog ? Math.sin(hp.walkT) * .6 : 0;
    human.userData.legs[0].rotation.x = sw; human.userData.legs[1].rotation.x = -sw; human.userData.arms[0].rotation.x = -sw * .7; human.userData.arms[1].rotation.x = sw * .7;
    human.userData.body.position.y = 1.05 + Math.abs(sw) * .04;
    if (hero) animateHero(hp.walkT, len > .05 && !dialog, dt, run > 1);
  }
  function updateCameraHuman(camera, dt) {
    const yaw = ctx.getYaw(), pitch = ctx.getPitch(), dist = 4.2;
    const dir = camV.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const up = new T.Vector3(Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch));
    const target = camT.copy(hp.pos).add(v2.set(0, 1.45, 0));
    const desired = target.clone().addScaledVector(dir, -dist).addScaledVector(up, .8);
    desired.y = Math.max(desired.y, groundAt(desired.x, desired.z) + .6);
    camera.position.lerp(desired, 1 - Math.exp(-12 * dt)); camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + .5);
    camera.up.copy(up); camera.lookAt(target.addScaledVector(dir, 2));
    if (Math.abs(camera.fov - 62) > .05) { camera.fov += (62 - camera.fov) * (1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
  }

  function update(dt, raw, keys, ts, camera) {
    beacon.material.opacity = (world.built.tower ? .05 : .14) * (mode === 'air' ? 1 : .3);
    zoneRing.material.opacity = mode === 'air' && Math.hypot(player.position.x - ZONE.x, player.position.z - ZONE.z) < ZONE.r + 150 ? .35 : 0;
    if (world.built.tower) { vaneHub.rotation.z += dt * 2.2; lanternMat.emissiveIntensity = 2 + .4 * Math.sin(ctx.time() * 3); }
    for (const s of spots) if (s.type === 'shard' && s.mesh.visible) s.mesh.rotation.y += dt * 1.5;
    sera.rotation.y = mode === 'human' ? Math.atan2(hp.pos.x - seraPos.x, hp.pos.z - seraPos.z) : sera.rotation.y;
    // 애니메이션(착륙·이륙·변신)
    if (anim) {
      anim.t += dt; const a = Math.min(1, anim.t / anim.dur), e = a * a * (3 - 2 * a);
      if (anim.kind === 'land' || anim.kind === 'takeoff') player.position.lerpVectors(anim.from, anim.to, e);
      if (anim.kind === 'toHuman') dragonMul = Math.max(.02, 1 - e);
      if (anim.kind === 'toDragon') { player.visible = true; dragonMul = Math.max(.02, e); human.scale.setScalar(Math.max(.02, 1 - e)); }
      if (a >= 1) { const k = anim.kind; anim = null; dragonMul = 1; human.scale.setScalar(1); ({land: finishLand, takeoff: finishTakeoff, toHuman: finishToHuman, toDragon: finishToDragon})[k](); }
    }
    if (mode === 'human' && !anim) updateHuman(dt, keys, ts);
    if (mode === 'landed' && !anim) { const gy = hAt(player.position.x, player.position.z); player.position.y += (Math.max(gy, W) + 2.2 * ctx.scale() - player.position.y) * Math.min(1, dt * 4); }
    // 착륙 가능 여부 미리보기(공중, 공터 근처)
    if (mode === 'air' && !anim) landCheck = Math.hypot(player.position.x - ZONE.x, player.position.z - ZONE.z) < ZONE.r + 60 ? evaluateLanding(terrain, player.position.x, player.position.y, player.position.z, ctx.scale(), {props}) : {ok: false, reason: 'far'};
    prompt = nearest();
    refreshHud();
    if ((saveTimer -= raw) <= 0 && mode !== 'air' && !anim) { saveTimer = 5; save(); }
  }

  let hudKey = '';
  function refreshHud() {
    const P = player.position, far = Math.hypot(P.x - ZONE.x, P.z - ZONE.z), st = step(), bag = world.bag;
    const show = {land: mode === 'air' && far < ZONE.r + 60, morph: mode === 'landed', dragon: mode === 'human', interact: mode === 'human' && !!prompt, takeoff: mode === 'landed'};
    const p = mode === 'human' && prompt ? promptText(prompt) : mode === 'air' && far < ZONE.r + 60 ? (landCheck.ok ? '착륙할 수 있습니다 — G' : landCheck.reason) : '';
    const bagTxt = mode !== 'air' || st !== 'land' ? `나뭇가지 ${bag.branch} · 돌 ${bag.stone} · 숨결 파편 ${bag.shard}${bag.kit ? ' · 수리 키트 1' : ''}` : '';
    const key = JSON.stringify([show, p, bagTxt, landCheck.ok]);
    if (key === hudKey) return; hudKey = key;
    for (const [a, on] of Object.entries(show)) hud.querySelector(`[data-a=${a}]`).hidden = !on;
    hud.querySelector('[data-a=land]').classList.toggle('bad', !landCheck.ok);
    $h('.g-prompt').hidden = !p; $h('.g-prompt').textContent = p; $h('.g-prompt').classList.toggle('bad', mode === 'air' && !landCheck.ok);
    $h('.g-help').hidden = mode !== 'human'; $h('.g-bag').hidden = !bagTxt; $h('.g-bag').textContent = bagTxt;
  }
  function promptText(n) {
    if (n.kind === 'gather') return `E — ${ITEM_NAMES[n.spot.type]} 줍기`;
    if (n.kind === 'sera') return 'E — 세라와 대화';
    if (n.kind === 'site') return 'E — 작업대 짓기 (나뭇가지 2 · 돌 2)';
    if (n.kind === 'bench') return 'E — 수리 키트 만들기 (나뭇가지 1 · 돌 1 · 숨결 파편 1)';
    if (n.kind === 'tower') return world.built.tower ? '풍향탑 — 수리 완료' : 'E — 풍향탑 수리';
    return '';
  }
  // 임무 목표 문구 (게임 HUD의 #objective에 사용)
  function objective() {
    const st = step(), t = MISSION01.titles, bag = world.bag, far = Math.round(Math.hypot(player.position.x - ZONE.x, player.position.z - ZONE.z));
    if (st === 'land') return `${t.land} · 금빛 기둥까지 ${far}m`;
    if (st === 'gather') return `${t.gather} (가지 ${Math.min(3, bag.branch + (world.built.workbench ? 2 : 0))}/3 · 돌 ${Math.min(3, bag.stone + (world.built.workbench ? 2 : 0))}/3 · 파편 ${Math.min(1, bag.shard)}/1)`;
    return t[st] || '';
  }

  // 저장된 상태로 시작 (위치 검증: 지면 아래·물·공터 밖이면 공터 중앙으로)
  function restore() {
    if (world.form === 'air' || !world.dragonPos) return;
    if (world.terrain && world.terrain !== 'seed7-v1') { world.form = 'air'; return; } // 지형이 바뀐 저장은 위치만 무시(진행은 유지)
    const d = world.dragonPos, c = evaluateLanding(terrain, d.x, d.y, d.z, ctx.scale(), {checkAltitude: false, props});
    const base = c.ok ? new T.Vector3(d.x, c.y + 2.2 * ctx.scale(), d.z) : placeOnGround(0, 0).add(v.set(0, 2.2 * ctx.scale(), 0));
    player.position.copy(base); ctx.setYaw?.(world.yaw || 0);
    mode = 'landed';
    if (world.form === 'human') {
      const p = world.pos; let hpos = p && isFinite(p.x) ? new T.Vector3(p.x, hAt(p.x, p.z), p.z) : null;
      if (!hpos || hpos.y < W - .3 || Math.hypot(hpos.x - ZONE.x, hpos.z - ZONE.z) > ZONE.r + 120) hpos = freeSpotNear(player.position, 4);
      if (hpos) { hp.pos.copy(hpos); tintHuman(); mode = 'human'; human.visible = true; human.position.copy(hpos); player.visible = false; }
    }
    ctx.onModeChange(mode);
  }
  return {
    saveDragon(d) { world.dragon = d; return save(); }, slot, loadHero, get heroLoaded() { return !!hero; },
    update, restore, tryLand, takeoff, toHuman, toDragon, interact, objective, save,
    get mode() { return mode; }, get animating() { return !!anim; }, get dragonMul() { return dragonMul; }, get talking() { return !!dialog; }, get busy() { return !!anim || !!dialog; }, get world() { return world; }, get loadedFrom() { return from; },
    get human() { return hp; }, get landCheck() { return landCheck; }, spots, positions: {tower: towerPos, bench: benchPos, sera: seraPos},
    hideHud(v) { hud.hidden = v; }, updateCamera: updateCameraHuman,
  };
}
