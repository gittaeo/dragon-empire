// 드래곤 엠파이어 — 메인 게임 루프 (M1: 밸런스 재조정 + 엠페러 이후 계속 비행)
import {addExperience, xpToNext, stageForLevel, stageScale, killExperience, maxHpForLevel, addRankExperience, rankXpToNext,
  STAGE, boltDamage, boltInterval, crystalReward, MAX_LEVEL} from './progression.js';
import * as T from './vendor/three.module.js';
import {createTerrain} from './world/terrain.js';
import {createTimeOfDay} from './world/timeofday.js';
import {createClouds} from './world/clouds.js';
import {loadEnvAssets} from './world/env-assets.js';
import {createTouchControls} from './touch.js';
import {loadManifest, loadModel, setDragonPathVisual} from './assets-loader.js';
import {FlightAnimator} from './dragon-anim.js';

const $ = s => document.querySelector(s), canvas = $('#world');
const scene = new T.Scene(); // 하늘·안개는 world/timeofday.js 가 관리
const renderer = new T.WebGLRenderer({canvas, antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputColorSpace = T.SRGBColorSpace;
const camera = new T.PerspectiveCamera(60, innerWidth / innerHeight, .3, 12000);
const terrain = createTerrain({scene, renderer, seed: 7, clouds: false, detail: true});
loadEnvAssets('assets/approved/env/', {renderer}).then(e => terrain.applyEnv(e, {camera})).catch(e => console.warn('[env] 폴백', e));
const tod = createTimeOfDay({scene, renderer, camera, startHour: 6, dayLengthSec: 660});
const clouds = createClouds({scene});
const ground = (x, z) => Math.max(terrain.heightAt(x, z), terrain.waterLevel);

const mat = (c, extra = {}) => new T.MeshStandardMaterial({color: c, roughness: .8, ...extra});
function mesh(geo, material, parent = scene, x = 0, y = 0, z = 0) { const o = new T.Mesh(geo, material); o.position.set(x, y, z); parent.add(o); return o; }
function dragon(color = 0xbd5141, wingColor = 0xdb995f) {
  const g = new T.Group(), skin = mat(color), wing = mat(wingColor, {side: T.DoubleSide}), horn = mat(0xe7c99e);
  const body = mesh(new T.SphereGeometry(1, 12, 8), skin, g, 0, 0, 0); body.scale.set(1.05, .8, 2);
  const head = mesh(new T.SphereGeometry(.75, 10, 8), skin, g, 0, .55, -2); head.scale.set(.8, .75, 1.25);
  mesh(new T.ConeGeometry(.23, 1.1, 6), horn, g, -.48, 1.2, -1.9).rotation.z = -.3;
  mesh(new T.ConeGeometry(.23, 1.1, 6), horn, g, .48, 1.2, -1.9).rotation.z = .3;
  for (let i = 0; i < 5; i++) { const s = mesh(new T.SphereGeometry(.65 - i * .09, 8, 6), skin, g, 0, -.15 - i * .08, 1.6 + i * .65); s.scale.z = 1.4; }
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new T.Group(); pivot.name = 'wing'; pivot.position.set(side * .8, .3, .25); g.add(pivot);
    const shape = new T.Shape(); shape.moveTo(0, 0); shape.lineTo(side * 3, -.15); shape.lineTo(side * 5, 1.25); shape.lineTo(side * 3.8, -1.5); shape.lineTo(side * 1.6, -2.5); shape.lineTo(0, -1);
    const w = mesh(new T.ShapeGeometry(shape), wing, pivot); w.rotation.x = -Math.PI / 2.6; wings.push(pivot);
  }
  g.userData = {wings, skin, wing};
  return g;
}

// ---------- 플레이어 ----------
const player = dragon(); scene.add(player);
const S = terrain.spawnPoint; player.position.copy(S); player.rotation.order = 'YXZ'; player.rotation.y = 0;
const anim = new FlightAnimator(), animIn = {fwd: 0, side: 0, up: false, down: false, boost: false, yaw: 0};
// 테스트 전용 디버그 카메라: ?animcam=side|front|back|top|tq|tqb (&animdist=거리)
const params = new URLSearchParams(location.search);
const animCam = params.get('animcam'), animDist = +(params.get('animdist') || 16), camOff = new T.Vector3();

// ---------- 상태 ----------
let playing = false, paused = false, over = false, path = '', level = 1, xp = 0, kills = 0, lateKills = 0, rank = 0, rankXp = 0;
let hp = maxHpForLevel(1), maxHp = hp, invuln = 0, hitTimer = 0, yaw = 0, pitch = 0, fireTimer = 0, time = 0, runTime = 0;
let mouseDown = false, orbiting = false, flySpeed = 0, idleTime = 0, gliding = false, scaleNow = 1, camDistNow = STAGE.camDist[0];
let coronation = -1, coronationT = 0, ult = 0, spawnBudget = 0, dashTimer = 6, shotTokens = 3, bannerTimer = 0;
const store = {get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }};
let coins = Number(store.get('dragonEmpireCoins') || 0); $('#coins').textContent = coins;
const stage = () => stageForLevel(level);
// 테스트 전용: ?lv=20&path=storm 으로 해당 레벨에서 시작 (Lv30은 대관식 없이 엠페러 상태)
{ const lv = Math.round(+params.get('lv') || 1); if (lv > 1) { level = Math.min(MAX_LEVEL, lv); if (level >= 10) path = params.get('path') === 'storm' ? 'storm' : 'flame'; hp = maxHpForLevel(level) * 1.1; scaleNow = stageScale(level); camDistNow = STAGE.camDist[stageForLevel(level) - 1]; } }

// ---------- 적 (한 개의 템플릿을 clone → 지오메트리·재질 공유, 처치 시 dispose 불필요) ----------
const enemies = [], enemyTemplate = dragon(0x493c54, 0x66516d); enemyTemplate.userData = {}; enemyTemplate.scale.setScalar(1.15);
const enemyBolts = [], enemyBoltGeometry = new T.SphereGeometry(.8, 8, 6), enemyBoltMaterial = new T.MeshBasicMaterial({color: 0xc08bff});
function makeEnemy(x, y, z) {
  const e = enemyTemplate.clone(), wings = [];
  e.traverse(o => { if (o.name === 'wing') wings.push(o); });
  e.position.set(x, y, z);
  e.userData = {wings, hp: STAGE.enemyHp[stage() - 1], phase: Math.random() * 6.28, shootCd: 1.5 + Math.random() * 2.5, dash: 0, dashDir: new T.Vector3(), orbit: Math.random() < .5 ? 1 : -1};
  scene.add(e); enemies.push(e); return e;
}
// 4~6마리 무리를 반경 25m로 묶어 진행 방향 ±60°(70%) 또는 임의 방향, 150~300m에 배치
function groupCenter(out) {
  const a = Math.random() < .7 ? yaw + (Math.random() - .5) * 2 * Math.PI / 3 : Math.random() * Math.PI * 2, d = 150 + Math.random() * 150;
  out.x = T.MathUtils.clamp(player.position.x - Math.sin(a) * d, -2600, 2600);
  out.z = T.MathUtils.clamp(player.position.z - Math.cos(a) * d, -2600, 2600);
  out.y = Math.max(player.position.y + (Math.random() - .5) * 60, ground(out.x, out.z) + 35);
  return out;
}
const _c = new T.Vector3();
function spawnGroup(count) {
  groupCenter(_c);
  for (let i = 0; i < count; i++) {
    const x = _c.x + (Math.random() - .5) * 50, z = _c.z + (Math.random() - .5) * 50;
    makeEnemy(x, Math.max(_c.y + (Math.random() - .5) * 30, ground(x, z) + 25), z);
  }
}
function removeEnemy(e) { scene.remove(e); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); }

// ---------- 파티클 (고정 크기 GPU 풀) ----------
const bolts = [];
const maxParticles = 900, particlePositions = new Float32Array(maxParticles * 3), particleColors = new Float32Array(maxParticles * 3), particleSizes = new Float32Array(maxParticles), particleData = Array.from({length: maxParticles}, () => ({life: 0, total: 1, size: 0, v: new T.Vector3()}));
const particleGeometry = new T.BufferGeometry();
particleGeometry.setAttribute('position', new T.BufferAttribute(particlePositions, 3).setUsage(T.DynamicDrawUsage));
particleGeometry.setAttribute('color', new T.BufferAttribute(particleColors, 3).setUsage(T.DynamicDrawUsage));
particleGeometry.setAttribute('size', new T.BufferAttribute(particleSizes, 1).setUsage(T.DynamicDrawUsage));
const particleMaterial = new T.ShaderMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
  vertexShader: `attribute float size; varying vec3 vColor; void main(){vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(120.0,size*300.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `varying vec3 vColor; void main(){float d=length(gl_PointCoord-.5)*2.0; float a=pow(max(0.0,1.0-d),2.2); gl_FragColor=vec4(vColor,a);}`});
const particleCloud = new T.Points(particleGeometry, particleMaterial); particleCloud.frustumCulled = false; scene.add(particleCloud);
let particleCursor = 0, particlesAlive = false; const _col = new T.Color(), _pv = new T.Vector3();
function spark(pos, color, velocity, size = 2, life = .7) {
  const n = particleCursor++ % maxParticles, p = particleData[n], j = n * 3; _col.set(color);
  particlePositions[j] = pos.x; particlePositions[j + 1] = pos.y; particlePositions[j + 2] = pos.z;
  particleColors[j] = _col.r; particleColors[j + 1] = _col.g; particleColors[j + 2] = _col.b;
  particleSizes[n] = size; p.v.copy(velocity); p.life = p.total = life; p.size = size; particlesAlive = true;
}
// 큰 드래곤에서도 보이도록 k(=카메라 거리 비율)로 크기·속도를 키운다
function burst(pos, color, count = 30, force = 22, k = 1) {
  for (let i = 0; i < count; i++) {
    _pv.set((Math.random() - .5) * 2, (Math.random() - .35) * 2, (Math.random() - .5) * 2).normalize().multiplyScalar(force * k * (.3 + Math.random()));
    spark(pos, i % 4 === 0 ? 0xffffff : color, _pv, (2 + Math.random() * 5) * k, .4 + Math.random() * .8);
  }
}
function updateParticles(dt) {
  if (!particlesAlive) return; let alive = false;
  for (let i = 0; i < maxParticles; i++) {
    const p = particleData[i]; if (p.life <= 0) continue; p.life -= dt; const j = i * 3;
    particlePositions[j] += p.v.x * dt; particlePositions[j + 1] += p.v.y * dt; particlePositions[j + 2] += p.v.z * dt;
    p.v.multiplyScalar(Math.max(0, 1 - dt * .9)); particleSizes[i] = p.life > 0 ? p.size * p.life / p.total : 0; if (p.life > 0) alive = true;
  }
  particlesAlive = alive;
  for (const a of Object.values(particleGeometry.attributes)) a.needsUpdate = true;
}
const boltGeometry = new T.SphereGeometry(.55, 8, 6), boltMaterials = {fire: new T.MeshBasicMaterial({color: 0xffdd8b}), storm: new T.MeshBasicMaterial({color: 0xb8f5ff})};
const fxScale = () => .75 + .25 * scaleNow;
const pathColor = (flame, storm) => path === 'storm' ? storm : flame;

// ---------- 입력 ----------
const keys = {};
function look(dx, dy, kx, ky) { yaw -= dx * kx * (Math.cos(pitch) < 0 ? -1 : 1); pitch -= dy * ky; pitch = T.MathUtils.euclideanModulo(pitch + Math.PI, 2 * Math.PI) - Math.PI; } // 상하 무제한(사용자 요청)
const touch = createTouchControls({onLook: (dx, dy) => { if (playing && !paused) look(dx, dy, .005, .004); }}); touch.setVisible(false);
function clearInput() { for (const key in keys) keys[key] = false; mouseDown = false; orbiting = false; touch.reset(); }
window.addEventListener('keydown', e => { keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); if (e.code === 'Escape' && playing && $('#choice').hidden) pause(); });
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('blur', () => { clearInput(); if (playing && !over && $('#choice').hidden) pause(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (!playing || paused) return; if (e.button === 0) mouseDown = true; if (e.button === 2) { orbiting = true; e.preventDefault(); } });
window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) orbiting = false; });
window.addEventListener('mousemove', e => { if (orbiting && playing && !paused) look(e.movementX, e.movementY, .004, .003); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight); });

// ---------- HUD ----------
const STAGE_NAMES = () => [path === 'storm' ? '돌풍 해츨링' : '불씨 해츨링', path === 'storm' ? '뇌운 드레이크' : '화염 드레이크', path === 'storm' ? '템페스트 웜' : '화염 웜', '드래곤 엠페러'];
const ROMAN = n => ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'][n] || String(n);
function refresh() {
  const st = stage(); maxHp = Math.round(maxHpForLevel(level) * (path === 'storm' ? 1.1 : 1)); hp = Math.min(hp, maxHp);
  $('#stage').textContent = STAGE_NAMES()[st - 1];
  $('#level').textContent = level < MAX_LEVEL ? 'LV. ' + level : rank ? `LV. 30 · 위계 ${ROMAN(rank)}` : 'LV. 30';
  if (level < MAX_LEVEL) { const need = xpToNext(level); $('#xp').style.width = xp / need * 100 + '%'; $('#xptext').textContent = `성장 경험치 ${xp} / ${need}`; }
  else { const need = rankXpToNext(rank); $('#xp').style.width = rankXp / need * 100 + '%'; $('#xptext').textContent = `황제 위계 경험치 ${rankXp} / ${need}`; }
  $('#hp').style.width = Math.max(0, hp / maxHp * 100) + '%';
  $('#kills').textContent = '처치 ' + kills;
  $('#objective').textContent = level >= MAX_LEVEL ? '황제의 하늘 · 사냥하며 위계를 올리세요 (귀환 시 보상)' : st === 3 ? 'Lv.30 드래곤 엠페러로 진화하세요' : st === 2 ? 'Lv.20 3단계 진화까지 성장하세요' : 'Lv.10 진화의 갈림길까지 성장하세요';
  $('#return').hidden = level < MAX_LEVEL || over; $('#pause-return').hidden = level < MAX_LEVEL;
}
function banner(title, sub = '', sec = 2.2) { $('#banner b').textContent = title; $('#banner small').textContent = sub; $('#banner').classList.add('on'); bannerTimer = sec; }
function hurt(amount) {
  if (invuln > 0 || coronation >= 0 || over) return;
  hp -= amount; refresh(); document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt');
  if (hp <= 0) finish(level >= MAX_LEVEL ? 'fall' : 'fail');
}

// ---------- 진행 ----------
function start() { playing = true; paused = false; $('#start').hidden = true; $('#hud').hidden = false; touch.setVisible(true); refresh(); }
function pause() { paused = true; clearInput(); touch.setVisible(false); $('#start').hidden = false; $('#begin').textContent = '비행 계속하기 ↗'; refresh(); }
$('#begin').onclick = start; $('#restart').onclick = () => location.reload();
$('#return').onclick = () => finish('return'); $('#pause-return').onclick = () => finish('return');
document.querySelectorAll('[data-path]').forEach(b => b.onclick = () => {
  if (over) return;
  path = b.dataset.path; setDragonPathVisual(player.userData.model, path);
  player.userData.skin.color.set(pathColor(0xda5639, 0x477fbc)); player.userData.wing.color.set(pathColor(0xffb653, 0x8fd5ed));
  refresh(); hp = maxHp; $('#choice').hidden = true; paused = false; touch.setVisible(true); refresh();
  burst(player.position, pathColor(0xffa326, 0x63dcff), 100, 32, fxScale());
});
function finish(kind) {
  if (over) return; over = true; playing = false; touch.setVisible(false); document.exitPointerLock?.();
  for (const b of bolts) scene.remove(b.o); bolts.length = 0; for (const b of enemyBolts) scene.remove(b.o); enemyBolts.length = 0;
  const reward = crystalReward({level, kills, rank, lateKills}); coins += reward; store.set('dragonEmpireCoins', coins); $('#coins').textContent = coins;
  const emperor = level >= MAX_LEVEL, mm = Math.floor(runTime / 60), ss = String(Math.floor(runTime % 60)).padStart(2, '0');
  $('#result-label').textContent = emperor ? 'DRAGON EMPEROR' : 'FLIGHT ENDED';
  $('#result-title').textContent = kind === 'return' ? '드래곤 엠페러의 귀환' : kind === 'fall' ? '드래곤 엠페러, 잠시 휴식' : '다시 하늘을 향해';
  const pathName = path === 'storm' ? '폭풍 혈통' : path === 'flame' ? '화염 혈통' : '혈통 미선택';
  $('#result-desc').textContent = `${pathName} · Lv.${level}${rank ? ' · 황제 위계 ' + rank : ''} · ${kills}마리 처치 · ${mm}:${ss}. 용의 결정 ${reward}개 획득 (보유 ${coins}).${emperor ? '' : ' Lv.30 전 실패는 보상 절반.'}`;
  $('#return').hidden = true; $('#result').hidden = false;
}
function startCoronation() {
  coronation = 4; coronationT = 0; hp = maxHp; invuln = 3; ult = 100;
  for (const e of [...enemies]) if (e.position.distanceTo(player.position) < 90) killEnemy(e);
  banner('드래곤 엠페러 대관', 'ULT 충전 완료 · 황제의 하늘이 열립니다', 3.5); refresh();
}
function killEnemy(e) {
  removeEnemy(e); burst(e.position, pathColor(0xffa33d, 0x66ddff), 40, 30, Math.min(fxScale(), 1.6)); kills++;
  hp = Math.min(maxHp, hp + maxHp * .02);
  if (level >= MAX_LEVEL) {
    if (rank >= 10) lateKills++;
    const before = rank; ({rank, rankXp} = addRankExperience({rank, rankXp}, killExperience(MAX_LEVEL)));
    if (rank > before) { hp = Math.min(maxHp, hp + maxHp * .2); burst(player.position, 0xffdc88, 90, 40, fxScale()); banner(`황제 위계 ${ROMAN(rank)}`, `피해 +${Math.min(rank, 20) * 2}%`); }
    refresh(); return;
  }
  const beforeLevel = level, beforeStage = stage();
  ({level, xp} = addExperience({level, xp}, killExperience(level)));
  if (level > beforeLevel) { refresh(); hp = Math.min(maxHp, hp + maxHp * .15); }
  if (stage() > beforeStage) {
    refresh(); hp = maxHp; invuln = 2; burst(player.position, 0xffdc88, 100, 35, fxScale());
    if (stage() < 4) banner(STAGE_NAMES()[stage() - 1] + '(으)로 진화', '생명력 회복 · 2초 무적');
  }
  refresh();
  if (level >= 10 && !path) { paused = true; clearInput(); document.exitPointerLock?.(); touch.setVisible(false); $('#choice').hidden = false; }
  else if (level >= MAX_LEVEL && coronation < 0 && beforeLevel < MAX_LEVEL) startCoronation();
}

// ---------- 루프 (임시 벡터 재사용) ----------
const clock = new T.Clock(), dir = new T.Vector3(), right = new T.Vector3(), viewDir = new T.Vector3(), viewUp = new T.Vector3(), pivot = new T.Vector3(), desired = new T.Vector3(), tmp = new T.Vector3(), tmp2 = new T.Vector3(), aimPoint = new T.Vector3();
const CLR = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
// 드래곤 몸(날개폭)과 진행 방향 앞뒤를 고려한 최저 고도
function clearanceHeight(x, z, s, fx, fz) {
  const r = 4.6 * s; let h = terrain.waterLevel;
  for (const [dx, dz] of CLR) h = Math.max(h, terrain.heightAt(x + dx * r, z + dz * r));
  h = Math.max(h, terrain.heightAt(x + fx * 5 * s, z + fz * 5 * s), terrain.heightAt(x - fx * 5 * s, z - fz * 5 * s));
  return h + 8 * s;
}
function segDistSq(p, a, b) { // 점 p와 선분 a→b 사이 거리²
  tmp2.subVectors(b, a); const l = tmp2.lengthSq(); let t = l ? tmp.subVectors(p, a).dot(tmp2) / l : 0; t = Math.max(0, Math.min(1, t));
  return tmp.copy(a).addScaledVector(tmp2, t).distanceToSquared(p);
}

function updateFlight(dt) {
  const st = stage(), sc = scaleNow, storm = path === 'storm' ? 1.2 : 1, ts = touch.state;
  const base = STAGE.speed[st - 1] * storm, boostSp = STAGE.boost[st - 1] * storm, boosting = !!(keys.ShiftLeft || keys.ShiftRight || ts.boost);
  dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const fwdAmt = T.MathUtils.clamp((keys.KeyW ? 1 : 0) - (keys.KeyS ? .6 : 0) + ts.moveY, -.6, 1), sideAmt = T.MathUtils.clamp((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + ts.moveX, -1, 1);
  const up = !!(keys.Space || ts.up), down = !!(keys.KeyC || ts.down), moving = Math.abs(fwdAmt) + Math.abs(sideAmt) > .05;
  idleTime = moving || up || down ? 0 : idleTime + dt;
  // 활공: 2단계부터 이동 입력을 놓으면 속도를 유지한 채 관성으로 미끄러지며 하강. 기수를 내리면 가속(최대 1.6배)
  gliding = st >= 2 && idleTime > 0 && flySpeed > base * .3;
  let target;
  if (moving) target = (boosting ? boostSp : base) * fwdAmt;
  else if (gliding) target = base * T.MathUtils.clamp(.7 - pitch * 1.6, .45, 1.6);
  else target = 0;
  flySpeed += (target - flySpeed) * (1 - Math.exp(-(gliding ? 1.2 : 4) * dt));
  player.position.addScaledVector(dir, flySpeed * dt).addScaledVector(right, base * .7 * sideAmt * dt);
  if (gliding && pitch > -.2) player.position.y -= 4 * dt;
  if (up) player.position.y += base * .65 * dt; if (down) player.position.y -= base * .65 * dt;
  // 지형 최저 고도: 즉시 스냅하지 않고 빠르게 따라 올라가되 몸 여백(2.5×scale) 이상 파고들지 않음
  const hl = Math.hypot(dir.x, dir.z) || 1, floorY = clearanceHeight(player.position.x, player.position.z, sc, dir.x / hl, dir.z / hl);
  if (player.position.y < floorY) player.position.y = Math.max(player.position.y + (floorY - player.position.y) * (1 - Math.exp(-14 * dt)), floorY - 2.5 * sc);
  player.position.x = T.MathUtils.clamp(player.position.x, -2700, 2700); player.position.z = T.MathUtils.clamp(player.position.z, -2700, 2700);
  const firing = mouseDown || keys.KeyF || ts.fire;
  if (moving || firing || gliding || Math.abs(flySpeed) > 1) { player.rotation.y = yaw; player.rotation.x = pitch; }
  animIn.fwd = gliding ? .6 : fwdAmt; animIn.side = sideAmt; animIn.up = up; animIn.down = down || (gliding && pitch > -.2); animIn.boost = boosting && moving;
  return {firing, boosting: boosting && moving};
}

function fireBreath(dt, firing) {
  fireTimer -= dt; if (!firing || fireTimer > 0) return;
  fireTimer = boltInterval(level, path);
  const s = scaleNow, k = fxScale(), camDir = camera.getWorldDirection(tmp), lockR2 = (7 * (.6 + .4 * s)) ** 2;
  let far = 600;
  for (const e of enemies) { tmp2.subVectors(e.position, camera.position); const t = tmp2.dot(camDir); if (t > camDistNow * .8 && t < far && tmp2.lengthSq() - t * t < lockR2) far = t; }
  aimPoint.copy(camera.position).addScaledVector(camDir, far);
  const aim = new T.Vector3().subVectors(aimPoint, player.position).normalize();
  const b = mesh(boltGeometry, path === 'storm' ? boltMaterials.storm : boltMaterials.fire);
  b.position.copy(player.position).addScaledVector(aim, 4.8 * s); b.scale.setScalar(.6 + .4 * s);
  aim.subVectors(aimPoint, b.position).normalize();
  const speed = 140 * k;
  bolts.push({o: b, prev: b.position.clone(), v: aim.clone().multiplyScalar(speed), life: Math.min(3, 650 / speed), dmg: boltDamage(level, path, rank), r: 4.5 + .55 * (.6 + .4 * s)});
  anim.fire();
  for (let j = 0; j < 6; j++) { _pv.copy(aim).multiplyScalar((30 + Math.random() * 35) * k).add(tmp2.set((Math.random() - .5) * 9, (Math.random() - .5) * 9, (Math.random() - .5) * 9)); spark(b.position, path === 'storm' ? (j % 3 ? 0x64d9ff : 0xffffff) : (j % 3 ? 0xff7a21 : 0xffe49e), _pv, (2 + Math.random() * 4) * k, .25 + Math.random() * .35); }
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.prev.copy(b.o.position); b.o.position.addScaledVector(b.v, dt); b.life -= dt;
    if (Math.random() < .7) { _pv.copy(b.v).multiplyScalar(-.08).add(tmp2.set((Math.random() - .5) * 7, (Math.random() - .5) * 7, (Math.random() - .5) * 7)); spark(b.o.position, path === 'storm' ? 0x77dfff : 0xff8a2a, _pv, (2 + Math.random() * 3) * fxScale(), .3 + Math.random() * .25); }
    let hit = null; const r2 = b.r * b.r;
    for (const e of enemies) if (segDistSq(e.position, b.prev, b.o.position) < r2) { hit = e; break; }
    if (hit) { hit.userData.hp -= b.dmg; burst(b.o.position, path === 'storm' ? 0x7de6ff : 0xffa54c, 14, 22, Math.min(fxScale(), 1.5)); if (hit.userData.hp <= 0) killEnemy(hit); b.life = 0; }
    if (b.o.position.y < ground(b.o.position.x, b.o.position.z)) b.life = 0;
    if (b.life <= 0) { scene.remove(b.o); bolts.splice(i, 1); }
  }
}

function updateEnemies(dt) {
  const st = stage(), sc = scaleNow, cap = STAGE.enemyCap[st - 1];
  // 무리 스폰: 초당 스폰 속도만큼 예산 적립 → 4마리 이상 모이면 4~6마리 무리로
  spawnBudget = Math.min(6, spawnBudget + STAGE.spawnRate[st - 1] * dt);
  if (spawnBudget >= 4 && enemies.length + 4 <= cap && coronation < 0) { const n = Math.min(Math.floor(spawnBudget), cap - enemies.length, 6); spawnGroup(n); spawnBudget -= n; }
  shotTokens = Math.min(STAGE.shooters[st - 1], shotTokens + STAGE.shooters[st - 1] / 3 * dt);
  dashTimer -= dt;
  const contactR = 3.2 * sc + 4;
  for (const e of [...enemies]) {
    const u = e.userData; tmp.subVectors(player.position, e.position); const d = tmp.length(); tmp.divideScalar(d || 1);
    if (d > 450) { groupCenter(_c); e.position.set(_c.x + (Math.random() - .5) * 50, _c.y, _c.z + (Math.random() - .5) * 50); continue; }
    if (u.dash > 0) { u.dash -= dt; e.position.addScaledVector(u.dashDir, 60 * dt); }
    else if (d > 60) e.position.addScaledVector(tmp, 16 * dt);
    else { // 30~60m에서 선회
      tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(u.orbit * 10 * dt); e.position.add(tmp2).addScaledVector(tmp, (d - 45) * .5 * dt);
    }
    if (dashTimer <= 0 && u.dash <= 0 && d < 150) { u.dash = 1.5; u.dashDir.copy(tmp); dashTimer = 6; }
    e.position.y = Math.max(e.position.y + Math.sin(time * 2 + u.phase) * dt * 2, ground(e.position.x, e.position.z) + 6);
    e.lookAt(player.position); e.rotateY(Math.PI);
    u.wings[0].rotation.z = Math.sin(time * (u.dash > 0 ? 9 : 4) + u.phase) * .22; u.wings[1].rotation.z = -u.wings[0].rotation.z;
    // 사격: 토큰이 있을 때 140m 안에서 플레이어 예상 위치로 보랏빛 탄
    u.shootCd -= dt;
    if (u.shootCd <= 0 && d < 140 && shotTokens >= 1 && enemyBolts.length < 12 && u.dash <= 0 && coronation < 0) {
      u.shootCd = 2.5 + Math.random() * 1.5; shotTokens -= 1;
      const o = mesh(enemyBoltGeometry, enemyBoltMaterial); o.position.copy(e.position);
      tmp2.copy(player.position).addScaledVector(dir, flySpeed * d / 45 * .5).sub(e.position).normalize().multiplyScalar(45);
      enemyBolts.push({o, v: tmp2.clone(), life: 4});
    }
    // 접촉: 엠페러는 몸에 닿은 일반 적을 터뜨림(위압), 그 외에는 피해
    if (d < contactR) {
      if (st === 4) { if (u.dash > 0) hurt(maxHp * STAGE.contactDamagePct[3]); killEnemy(e); continue; }
      if (hitTimer <= 0) { hurt(maxHp * STAGE.contactDamagePct[st - 1]); hitTimer = 1; u.dash = 0; e.position.addScaledVector(tmp, -15); }
    }
  }
  const pr2 = (2.5 * sc + 2) ** 2;
  for (let i = enemyBolts.length - 1; i >= 0; i--) {
    const b = enemyBolts[i]; b.o.position.addScaledVector(b.v, dt); b.life -= dt;
    if (Math.random() < .3) spark(b.o.position, 0xb27cff, _pv.set(0, 0, 0), 3, .3);
    if (b.o.position.distanceToSquared(player.position) < pr2) { hurt(maxHp * STAGE.shotDamagePct[st - 1]); burst(b.o.position, 0xc79bff, 12, 14); b.life = 0; }
    if (b.life <= 0) { scene.remove(b.o); enemyBolts.splice(i, 1); }
  }
}

function updateCamera(dt, boosting) {
  const s = scaleNow; camDistNow += (STAGE.camDist[stage() - 1] - camDistNow) * (1 - Math.exp(-2 * dt));
  const lift = 4 + 3 * s, dist = camDistNow;
  // 대관식 동안 카메라가 드래곤 주위를 돌았다가 돌아옴
  const spin = coronation >= 0 ? Math.PI * .9 * Math.sin(Math.PI * Math.min(1, coronationT / 4)) : 0, vy = yaw + spin;
  viewDir.set(-Math.sin(vy) * Math.cos(pitch), Math.sin(pitch), -Math.cos(vy) * Math.cos(pitch));
  viewUp.set(Math.sin(vy) * Math.sin(pitch), Math.cos(pitch), Math.cos(vy) * Math.sin(pitch));
  pivot.copy(player.position).addScaledVector(viewUp, lift * .4);
  desired.copy(pivot).addScaledVector(viewDir, -dist).addScaledVector(viewUp, lift * .6);
  // 드래곤→카메라 사이 8점 검사: 능선에 가리면 카메라를 앞으로 당김(상하 무제한 피치 유지)
  let safe = 1;
  for (let i = 1; i <= 8; i++) { tmp.lerpVectors(pivot, desired, i / 8); if (tmp.y < ground(tmp.x, tmp.z) + 2 + .6 * s) { safe = (i - 1) / 8; break; } }
  if (safe < 1) desired.lerpVectors(pivot, desired, Math.max(safe, 5.5 * s / dist));
  desired.y = Math.max(desired.y, ground(desired.x, desired.z) + 3);
  camera.position.lerp(desired, 1 - Math.exp(-(safe < 1 ? 25 : 10) * dt));
  camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 3);
  camera.up.copy(viewUp);
  // 조준점이 큰 몸에 가리지 않도록 시선 높이를 단계에 비례
  camera.lookAt(tmp.copy(player.position).addScaledVector(viewDir, 6 + 5 * s).addScaledVector(viewUp, 3 * s));
  const fov = 60 + (boosting ? 8 : 0) + (gliding && pitch < -.3 ? 6 : 0);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
  if (animCam) {
    const o = {side: [1, .12, 0], front: [0, .12, -1], back: [0, .3, 1], top: [0, 1, .02], tq: [.8, .4, -.8], tqb: [.75, .45, .85]}[animCam] || [1, .12, 0];
    camOff.set(o[0], o[1], o[2]).normalize().multiplyScalar(animDist * player.scale.x).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw);
    camera.position.copy(player.position).add(camOff); camera.up.set(0, 1, 0); camera.lookAt(player.position);
  }
}

function loop() {
  requestAnimationFrame(loop);
  const raw = Math.min(clock.getDelta(), .05); time += raw;
  let dt = raw, boosting = false;
  if (coronation >= 0) { // 대관식 4초: 처음 0.6초 슬로모션, 금빛 폭발 3회
    const t0 = coronationT; coronationT += raw; dt = coronationT < .6 ? raw * .3 : raw;
    for (const at of [0, .5, 1]) if (t0 <= at && coronationT > at) burst(player.position, 0xffdc88, 100, 35, fxScale());
    coronation -= raw; if (coronation < 0) coronation = -1;
  }
  if (playing && !paused && !over) {
    runTime += dt; invuln = Math.max(0, invuln - dt); hitTimer -= dt;
    const f = updateFlight(dt); boosting = f.boosting;
    fireBreath(dt, f.firing); updateEnemies(dt); if (!over) updateBolts(dt);
  }
  if (bannerTimer > 0 && (bannerTimer -= raw) <= 0) $('#banner').classList.remove('on');
  updateParticles(raw);
  if (!(playing && !paused && !over)) { animIn.fwd = animIn.side = 0; animIn.up = animIn.down = animIn.boost = false; }
  const targetScale = stageScale(level); scaleNow += (targetScale - scaleNow) * (1 - Math.exp(-3 * raw)); player.scale.setScalar(scaleNow);
  animIn.yaw = yaw; anim.update(raw, animIn); player.rotation.z = anim.bankAngle;
  const mdl = player.userData.model;
  if (mdl && mdl.userData.rig) { anim.applyUniforms(mdl.userData.rig); anim.applyPose(mdl, mdl.userData.unit); }
  else player.userData.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (.05 - anim.wingUp * .45));
  updateCamera(raw, boosting);
  tod.update(raw, player.position); terrain.setSunDirection(tod.sunDirection); terrain.update(camera.position, raw); clouds.update(raw, camera, tod);
  renderer.render(scene, camera);
}

// 첫 무리 2개를 시작 방향(-Z) 앞에 배치
for (let i = 0; i < 2; i++) spawnGroup(5);
refresh(); loop();
loadManifest().then(() => loadModel('dragon_hatchling', {length: 9, rig: true})).then(m => {
  if (!m) return; player.children.forEach(c => c.visible = false); player.add(m); player.userData.model = m; setDragonPathVisual(m, path);
}).catch(e => console.warn('[assets]', e));
if (touch.isTouch) document.querySelector('.help')?.remove();
// 디버그·테스트 훅 (읽기 전용 상태)
window.__game = {camera, get hud() { return {level, xp, hp, maxHp, kills, path, paused, over, playing, yaw, pitch, coins, rank, rankXp, coronation, gliding, flySpeed, runTime, stage: stage(), invuln}; },
  get player() { return player; }, anim, get enemies() { return enemies; }, get enemyBolts() { return enemyBolts; }, terrain, tod, touch, start};
