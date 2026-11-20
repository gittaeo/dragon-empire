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
import {createAudio} from './audio.js';
import {createGround, activeSlot, listSlots, MAX_SLOTS, ACTIVE_SLOT_KEY} from './ground.js';
import {createSkillSystem, skillFor, fireTrait, SLOT_UNLOCK, COMBO_WINDOW, comboLabel, ULT_PER_KILL, ULT_PER_SEC} from './skills.js';

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
const XP_TEST_MUL = Math.min(20, Math.max(1, +params.get('xp') || 1)); // 테스트 전용: ?xp=8 이면 성장 경험치 8배(진화 확인용)
if (params.get('live')) import('./live-reload.js'); // 개발용: 옆 창에서 저장 즉시 반영
const animCam = params.get('animcam'), animDist = +(params.get('animdist') || 16), camOff = new T.Vector3();

// ---------- 상태 ----------
let playing = false, paused = false, over = false, path = '', level = 1, xp = 0, kills = 0, lateKills = 0, rank = 0, rankXp = 0;
let hp = maxHpForLevel(1), maxHp = hp, invuln = 0, hitTimer = 0, yaw = 0, pitch = 0, fireTimer = 0, time = 0, runTime = 0;
let mouseDown = false, orbiting = false, flySpeed = 0, idleTime = 0, gliding = false, scaleNow = 1, camDistNow = STAGE.camDist[0];
let combo = 0, comboTimer = 0, hitStopT = 0, slowT = 0, slowK = 1, shakeAmp = 0, diveTime = 0, shockCd = 0;
let coronation = -1, coronationT = 0, ult = 0, spawnBudget = 0, dashTimer = 6, shotTokens = 3, bannerTimer = 0;
const store = {get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }};
let coins = Number(store.get('dragonEmpireCoins') || 0); $('#coins').textContent = coins;
const stage = () => stageForLevel(level);
// ---------- 사운드 (Codex audio.js). 위치는 플레이어 기준 상대 좌표를 카메라 방향으로 돌려 좌우 팬이 맞게 ----------
const audio = createAudio();
function sfx(name, pos, volume = 1) {
  if (!pos) return audio.play(name, {volume});
  const rx = pos.x - player.position.x, ry = pos.y - player.position.y, rz = pos.z - player.position.z, c = Math.cos(yaw), sn = Math.sin(yaw);
  return audio.play(name, {x: rx * c - rz * sn, y: ry, z: -(rx * sn + rz * c), volume});
}
let ambStage = 0;
// 테스트 전용: ?lv=20&path=storm 으로 해당 레벨에서 시작 (Lv30은 대관식 없이 엠페러 상태)
{ const lv = Math.round(+params.get('lv') || 1); if (lv > 1) { level = Math.min(MAX_LEVEL, lv); if (level >= 10) path = params.get('path') === 'storm' ? 'storm' : 'flame'; hp = maxHpForLevel(level) * 1.1; scaleNow = stageScale(level); camDistNow = STAGE.camDist[stageForLevel(level) - 1]; } }

// ---------- 적 (한 개의 템플릿을 clone → 지오메트리·재질 공유, 처치 시 dispose 불필요) ----------
// M3 적 등급: 등불 나방(약·빠름) / 등불 기수(표준) / 사슬 기사(단단함, 3단계부터). 승인된 GLB가 manifest에 있으면 사용, 없으면 색을 바꾼 절차적 드래곤.
const ENEMY_KINDS = {
  moth: {hp: .6, xp: .7, speed: 1.25, id: 'enemy_lantern_moth', len: 5.5, fallback: [0x8a6233, 0xe8b25e, .85]},
  rider: {hp: 1, xp: 1, speed: 1, id: 'enemy_lantern_rider', len: 7, fallback: [0x493c54, 0x66516d, 1.15]},
  knight: {hp: 2, xp: 2, speed: .8, id: 'enemy_chain_knight', len: 6.5, fallback: [0x3d3a40, 0x9b3328, 1.45]},
};
const ENEMY_GROW = [1, 1.3, 1.65, 2];
const KIND_MIX = [[.7, .3, 0], [.4, .6, 0], [.3, .5, .2], [.3, .4, .3]];
const enemyTemplates = {};
for (const [k, d] of Object.entries(ENEMY_KINDS)) { const t = dragon(d.fallback[0], d.fallback[1]); t.userData = {}; t.scale.setScalar(d.fallback[2]); enemyTemplates[k] = t; }
const enemies = [];
const enemyBolts = [], enemyBoltGeometry = new T.SphereGeometry(.8, 8, 6), enemyBoltMaterial = new T.MeshBasicMaterial({color: 0xc08bff}), lanternBoltMaterial = new T.MeshBasicMaterial({color: 0xffb547});
function pickKind() { const m = KIND_MIX[stage() - 1], r = Math.random(); return r < m[0] ? 'moth' : r < m[0] + m[1] ? 'rider' : 'knight'; }
function makeEnemy(x, y, z, kind = pickKind()) {
  const K = ENEMY_KINDS[kind], e = enemyTemplates[kind].clone(), wings = [];
  e.traverse(o => { if (o.name === 'wing') wings.push(o); });
  e.position.set(x, y, z);
  const grow = ENEMY_GROW[stage() - 1]; e.scale.multiplyScalar(grow); // 플레이어가 커져도 적이 점처럼 보이지 않게
  e.userData = {kind, grow, wings, hp: STAGE.enemyHp[stage() - 1] * K.hp, xp: K.xp, speed: K.speed, glb: !!e.userData.glb, phase: Math.random() * 6.28, shootCd: 1.5 + Math.random() * 2.5, dash: 0, dashDir: new T.Vector3(), orbit: Math.random() < .5 ? 1 : -1};
  scene.add(e); enemies.push(e); return e;
}

// ---------- 엘리트: 황금 등불 대장 (2단계부터 70초마다, 나방 호위 6) ----------
let eliteCd = params.get('elite') ? 4 : 70, elite = null;
const ELITE_GOLD = new T.Color(0xffc24a);
function spawnElite() {
  groupCenter(_c); const e = makeEnemy(_c.x, _c.y, _c.z, 'knight'), u = e.userData;
  e.scale.multiplyScalar(1.6); u.hp *= 8; u.xp = 12; u.elite = true; u.speed = .9; u.grow = (u.grow || 1) * 1.6;
  e.traverse(o => { if (!o.isMesh) return; o.material = o.material.clone(); o.material.emissive = ELITE_GOLD.clone(); o.material.emissiveIntensity = .55; });
  for (let i = 0; i < 6; i++) makeEnemy(_c.x + (Math.random() - .5) * 40, _c.y + (Math.random() - .5) * 15, _c.z + (Math.random() - .5) * 40, 'moth');
  elite = e; sfx('elite_spawn', e.position); const ang = Math.atan2(-(_c.x - player.position.x), -(_c.z - player.position.z)) - yaw, side = Math.sin(ang) > .3 ? '왼쪽' : Math.sin(ang) < -.3 ? '오른쪽' : Math.cos(ang) > 0 ? '정면' : '후방';
  banner('황금 등불 대장 출현', `${side} 하늘 · 처치 시 경험치 대량·생명력·ULT 충전`, 2.6);
}
function updateElite(dt) {
  if (elite && !elite.parent) elite = null;
  if (elite) { if (Math.random() < .5) spark(elite.position, 0xffd27a, _pv.set(0, 6, 0), 6 * (elite.userData.grow || 1), .6); return; }
  if (stage() >= 2 && coronation < 0 && !boss && (eliteCd -= dt) <= 0) { eliteCd = 70; spawnElite(); }
}

// ---------- 보스: 등불의 여왕 루세르나 (엠페러 이후) ----------
let boss = null, bossCountdown = params.get('boss') ? 3 : 45, bossKills = 0, bossModel = null;
const bossBolts = [];
function bossFallback() { const g = dragon(0x3b2430, 0xffa94a); g.scale.setScalar(7); return g; }
function spawnBoss() {
  const o = bossModel ? bossModel.clone() : bossFallback();
  o.position.copy(player.position).add(tmp.set(-Math.sin(yaw) * 260, 40, -Math.cos(yaw) * 260));
  o.position.y = Math.max(o.position.y, ground(o.position.x, o.position.z) + 70);
  const maxHpB = Math.round(20000 * (1 + .1 * rank));
  o.userData = {hp: maxHpB, maxHp: maxHpB, radius: 24, phase: 0, volleyCd: 4, summonCd: 10, orbit: 1, wings: []};
  o.traverse(c => { if (c.name === 'wing') o.userData.wings.push(c); });
  scene.add(o); boss = o; sfx('boss_roar', o.position);
  banner('등불의 여왕 루세르나', '수천 개의 등불이 하늘을 덮습니다', 3);
  $('#bossbar').hidden = false; refreshBoss();
}
function refreshBoss() { if (boss) $('#bossbar i span').style.width = Math.max(0, boss.userData.hp / boss.userData.maxHp * 100) + '%'; }
function damageBoss(amount, at) {
  boss.userData.hp -= amount; refreshBoss(); burst(at, 0xffc56b, 10, 20, Math.min(fxScale(), 1.5));
  if (boss.userData.hp > 0) return;
  const p = boss.position.clone(); scene.remove(boss); boss = null; bossKills++; bossCountdown = 120; $('#bossbar').hidden = true;
  for (let i = 0; i < 4; i++) burst(tmp.copy(p).add(tmp2.set((Math.random() - .5) * 40, (Math.random() - .5) * 20, (Math.random() - .5) * 40)), i % 2 ? 0xffdc88 : 0xff8a2a, 120, 55, 3);
  kills++; const before = rank; ({rank, rankXp} = addRankExperience({rank, rankXp}, 1500));
  markProgress(); hp = maxHp; banner('루세르나 격파!', `위계 경험치 +1500 · 귀환 보상 +150${rank > before ? ' · 위계 ' + ROMAN(rank) : ''}`, 3.5); refresh();
}
function updateBoss(dt) {
  if (!boss) {
    if (level >= MAX_LEVEL && coronation < 0 && (bossCountdown -= dt) <= 0) spawnBoss();
    return;
  }
  const u = boss.userData; u.phase += dt;
  tmp.subVectors(player.position, boss.position); const d = tmp.length(); tmp.divideScalar(d || 1);
  // 플레이어와 110~170m를 유지하며 천천히 선회, 플레이어보다 30m 위
  boss.position.addScaledVector(tmp, (d - 140) * .35 * dt).add(tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(u.orbit * 14 * dt));
  const wantY = Math.max(player.position.y + 30, ground(boss.position.x, boss.position.z) + 60);
  boss.position.y += (wantY - boss.position.y) * (1 - Math.exp(-.8 * dt)) + Math.sin(u.phase * 1.3) * 3 * dt;
  boss.lookAt(player.position); boss.rotateY(Math.PI); boss.rotation.z += Math.sin(u.phase * .7) * .08;
  if (u.wings.length) { u.wings[0].rotation.z = Math.sin(u.phase * 2) * .25; u.wings[1].rotation.z = -u.wings[0].rotation.z; }
  // 등불 부채꼴 탄막(7발) 3.2초마다, 나방 4마리 소환 14초마다
  if ((u.volleyCd -= dt) <= 0 && coronation < 0) {
    u.volleyCd = 3.2; sfx('boss_volley', boss.position, .8); tmp2.subVectors(player.position, boss.position).normalize();
    for (let i = -3; i <= 3; i++) {
      const o = mesh(enemyBoltGeometry, lanternBoltMaterial); o.position.copy(boss.position); o.scale.setScalar(2.2);
      const v = tmp2.clone().applyAxisAngle(T.Object3D.DEFAULT_UP, i * .12).multiplyScalar(55);
      bossBolts.push({o, v, life: 5});
    }
  }
  if ((u.summonCd -= dt) <= 0) {
    u.summonCd = 14;
    for (let i = 0; i < 4; i++) makeEnemy(boss.position.x + (Math.random() - .5) * 60, boss.position.y - 10, boss.position.z + (Math.random() - .5) * 60, 'moth');
  }
  if (d < u.radius + 3.2 * scaleNow && hitTimer <= 0) { hurt(maxHp * .08); hitTimer = 1; }
  const pr2 = (2.5 * scaleNow + 4) ** 2;
  for (let i = bossBolts.length - 1; i >= 0; i--) {
    const b = bossBolts[i]; b.o.position.addScaledVector(b.v, dt); b.life -= dt;
    if (Math.random() < .3) spark(b.o.position, 0xffa13a, _pv.set(0, 0, 0), 5, .35);
    if (b.o.position.distanceToSquared(player.position) < pr2) { hurt(maxHp * .04); burst(b.o.position, 0xffb54a, 16, 18); b.life = 0; }
    if (b.life <= 0) { scene.remove(b.o); bossBolts.splice(i, 1); }
  }
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
const touch = createTouchControls({onLook: (dx, dy) => { if (playing && !paused) look(dx, dy, .005, .004); }, onSkill: slot => castSkill(slot)}); touch.setVisible(false);
function clearInput() { for (const key in keys) keys[key] = false; mouseDown = false; orbiting = false; touch.reset(); }
window.addEventListener('keydown', e => { if (!e.repeat) { if (playing && !paused && !over && groundKey(e.code)) { e.preventDefault(); return; } if (e.code === 'KeyQ') castSkill('skill1'); if (e.code === 'KeyE') castSkill('skill2'); if (e.code === 'KeyR') castSkill('ult'); } keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); if (e.code === 'Escape' && playing && $('#choice').hidden) pause(); });
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
function showCombo() {
  const el = $('#combo'); if (combo < 3) { el.classList.remove('on'); return; }
  el.querySelector('b').textContent = combo; el.querySelector('small').textContent = comboLabel(combo, stage()) || 'COMBO';
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('on', 'pop'); el.classList.toggle('max', combo >= 30 && stage() >= 4);
}
// 스킬 바 HUD (매 프레임, 변화 있을 때만 DOM 갱신)
const slotEls = {}; let skillHudKey = '';
function updateSkillHud() {
  const st = stage();
  for (const slot of ['skill1', 'skill2', 'ult']) {
    const el = slotEls[slot] ||= $(`#skills [data-slot=${slot}]`); if (!el) continue;
    const sk = skillFor(path, slot, st), cd = skills.cooldowns[slot];
    const frac = !sk ? 1 : slot === 'ult' ? 1 - ult / 100 : cd / sk.cd;
    const key = (sk ? sk.name : 'x') + Math.round(frac * 40);
    if (el.dataset.key === key) continue; el.dataset.key = key;
    el.classList.toggle('locked', !sk); el.classList.toggle('ready', !!sk && frac <= 0);
    el.style.setProperty('--cd', Math.max(0, frac));
    el.querySelector('em').textContent = sk ? sk.name : `${SLOT_UNLOCK[slot]}단계 해금`;
    const tb = document.querySelector(`.tc-skills [data-s=${slot}]`); if (tb) { tb.style.setProperty('--cd', Math.max(0, frac)); tb.classList.toggle('locked', !sk); }
  }
  const fireEl = $('#skills [data-slot=fire] em'), fname = fireTrait(path, st).name;
  if (fireEl.textContent !== fname) fireEl.textContent = fname;
}
function banner(title, sub = '', sec = 2.2) { $('#banner b').textContent = title; $('#banner small').textContent = sub; $('#banner').classList.add('on'); bannerTimer = sec; }
function hurt(amount) {
  if (invuln > 0 || coronation >= 0 || over) return;
  amount *= 1 - skills.damageReduce(); hp -= amount; sfx('player_hurt', null, .8); refresh(); document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt');
  if (hp <= 0) finish(level >= MAX_LEVEL ? 'fall' : 'fail');
}

// ---------- 진행 ----------
let prewarmed = false;
function start() { sfx('ui_click'); ambStage = stage(); audio.startAmbience(ambStage); if (!prewarmed) { prewarmed = true; try { skills.prewarm(renderer, camera); } catch (e) { console.warn(e); } } playing = true; paused = false; $('#start').hidden = true; $('#hud').hidden = false; touch.setVisible(true); refresh(); }
function pause() { audio.stopAmbience(); paused = true; clearInput(); touch.setVisible(false); $('#start').hidden = false; $('#begin').textContent = '비행 계속하기 ↗'; refresh(); }
$('#begin').onclick = start; $('#restart').onclick = () => location.reload();
$('#return').onclick = () => finish('return'); $('#pause-return').onclick = () => finish('return');
document.querySelectorAll('[data-path]').forEach(b => b.onclick = () => {
  if (over) return; sfx('ui_click');
  markProgress(); path = b.dataset.path; for (const m of stageModels) if (m) setDragonPathVisual(m, path); document.body.classList.toggle('storm', path === 'storm');
  player.userData.skin.color.set(pathColor(0xda5639, 0x477fbc)); player.userData.wing.color.set(pathColor(0xffb653, 0x8fd5ed));
  refresh(); hp = maxHp; $('#choice').hidden = true; paused = false; touch.setVisible(true); refresh();
  burst(player.position, pathColor(0xffa326, 0x63dcff), 100, 32, fxScale());
});
function finish(kind) {
  if (!TEST_RUN) gnd.saveDragon(progressSnapshot());
  if (over) return; over = true; playing = false; touch.setVisible(false); document.exitPointerLock?.();
  audio.stopAmbience(); skills.reset(); $('#combo').classList.remove('on');
  for (const b of bolts) scene.remove(b.o); bolts.length = 0; for (const b of enemyBolts) scene.remove(b.o); enemyBolts.length = 0; for (const b of bossBolts) scene.remove(b.o); bossBolts.length = 0; $('#bossbar').hidden = true;
  const reward = crystalReward({level, kills, rank, lateKills, boss: bossKills > 0}); coins += reward; store.set('dragonEmpireCoins', coins); $('#coins').textContent = coins;
  const emperor = level >= MAX_LEVEL, mm = Math.floor(runTime / 60), ss = String(Math.floor(runTime % 60)).padStart(2, '0');
  $('#result-label').textContent = emperor ? 'DRAGON EMPEROR' : 'FLIGHT ENDED';
  $('#result-title').textContent = kind === 'return' ? '드래곤 엠페러의 귀환' : kind === 'fall' ? '드래곤 엠페러, 잠시 휴식' : '다시 하늘을 향해';
  const pathName = path === 'storm' ? '폭풍 혈통' : path === 'flame' ? '화염 혈통' : '혈통 미선택';
  $('#result-desc').textContent = `${pathName} · Lv.${level}${rank ? ' · 황제 위계 ' + rank : ''} · ${kills}마리 처치 · ${mm}:${ss}. 용의 결정 ${reward}개 획득 (보유 ${coins}).${emperor ? '' : ' Lv.30 전 실패는 보상 절반.'}`;
  $('#return').hidden = true; $('#result').hidden = false;
}
function startCoronation() {
  sfx('coronation');
  coronation = 4; coronationT = 0; hp = maxHp; invuln = 3; ult = 100;
  for (const e of [...enemies]) if (e.position.distanceTo(player.position) < 90) killEnemy(e);
  banner('드래곤 엠페러 대관', 'ULT 충전 완료 · 황제의 하늘이 열립니다', 3.5); refresh();
}
function killEnemy(e) {
  combo = comboTimer > 0 ? combo + 1 : 1; comboTimer = COMBO_WINDOW; showCombo();
  if (stage() >= 4 && coronation < 0) ult = Math.min(100, ult + ULT_PER_KILL);
  if (e.userData.elite) { elite = null; for (let i = 0; i < 3; i++) burst(e.position, i ? 0xffd27a : 0xffffff, 90, 50, 2.2); shakeAmp = Math.max(shakeAmp, .9); hitStopT = Math.max(hitStopT, .09); hp = maxHp; ult = Math.min(100, ult + 30); banner('황금 등불 대장 격파!', '생명력 회복 · ULT +30', 2); }
  sfx(e.userData.elite ? 'multikill' : 'kill', e.position, .8);
  removeEnemy(e); burst(e.position, pathColor(0xffa33d, 0x66ddff), 40, 30, Math.min(fxScale(), 1.6)); kills++;
  hp = Math.min(maxHp, hp + maxHp * .02);
  if (level >= MAX_LEVEL) {
    if (rank >= 10) lateKills++;
    const before = rank; ({rank, rankXp} = addRankExperience({rank, rankXp}, Math.round(killExperience(MAX_LEVEL) * (e.userData.xp || 1))));
    if (rank > before) { hp = Math.min(maxHp, hp + maxHp * .2); burst(player.position, 0xffdc88, 90, 40, fxScale()); banner(`황제 위계 ${ROMAN(rank)}`, `피해 +${Math.min(rank, 20) * 2}%`); }
    markProgress(); refresh(); return;
  }
  const beforeLevel = level, beforeStage = stage();
  ({level, xp} = addExperience({level, xp}, Math.round(killExperience(level) * (e.userData.xp || 1) * XP_TEST_MUL)));
  if (level > beforeLevel) { refresh(); hp = Math.min(maxHp, hp + maxHp * .15); if (stage() === beforeStage) sfx('levelup'); }
  if (stage() > beforeStage) {
    if (stage() < 4) sfx('evolve'); ambStage = stage(); audio.startAmbience(ambStage);
    refresh(); hp = maxHp; invuln = 2; burst(player.position, 0xffdc88, 100, 35, fxScale());
    if (stage() < 4) banner(STAGE_NAMES()[stage() - 1] + '(으)로 진화', '생명력 회복 · 2초 무적');
  }
  refresh();
  markProgress();
  if (level >= 10 && !path) { paused = true; clearInput(); document.exitPointerLock?.(); touch.setVisible(false); $('#choice').hidden = false; }
  else if (level >= MAX_LEVEL && coronation < 0 && beforeLevel < MAX_LEVEL) startCoronation();
}

// ---------- 진화 외형: 단계마다 날개 폭·용암 발광·후광이 달라짐 (승인된 모델 1종을 단계별로 변형) ----------
const STAGE_LOOK = {wing: [1, 1.12, 1.24, 1.38], glow: [1, 1.6, 2.3, 3.2], tail: [1, 1.05, 1.12, 1.2]};
const halo = new T.Mesh(new T.TorusGeometry(1, .06, 8, 48), new T.MeshBasicMaterial({color: 0xffc85a, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false}));
const haloInner = new T.Mesh(new T.RingGeometry(.55, 1, 48), new T.MeshBasicMaterial({color: 0xffa23a, transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false}));
halo.add(haloInner); halo.position.set(0, 2.6, -1.9); halo.rotation.x = Math.PI / 2; player.add(halo); // 머리 위에 눕힌 왕관형 후광(조준선을 가리지 않게)
const STAGE_MODEL_IDS = ['dragon_hatchling', 'dragon_drake', 'dragon_wyrm', 'dragon_emperor'], stageModels = [null, null, null, null];
let lookStage = 0, lookT = 1;
function updateStageLook(raw) {
  const st = stage(), mdl = player.userData.model;
  if (st !== lookStage) { lookStage = st; lookT = 0; }
  lookT = Math.min(1, lookT + raw * .8);
  const k = i => STAGE_LOOK[i][st - 1];
  // 날개 폭(X)과 몸 길이(Z)를 단계별로 키움 → 같은 모델이라도 실루엣이 달라짐
  const own = mdl && mdl.userData.stageIndex === stage() - 1 && stage() > 1; // 전용 단계 모델이면 늘이지 않음
  const sx = own ? 1 : k('wing'), sz = own ? 1 : k('tail');
  if (mdl) { mdl.scale.x += (mdl.userData.baseScale * sx - mdl.scale.x) * Math.min(1, raw * 3); mdl.scale.z += (mdl.userData.baseScale * sz - mdl.scale.z) * Math.min(1, raw * 3); }
  if (mdl && !mdl.userData.glowMats) { mdl.userData.glowMats = []; mdl.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.emissive) mdl.userData.glowMats.push(m); }); }
  for (const m of mdl?.userData.glowMats || []) { const base = m.userData.dragonOriginal?.emissiveIntensity ?? 1; const want = (m.userData.mapGlow ? .16 + .06 * (st - 1) : Math.max(base, path ? .55 : base) * k('glow')) * (1 + .15 * Math.sin(time * 3)); m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, raw * 2); }
  // 엠페러: 머리 뒤 금빛 후광(콘셉트 아트의 헤일로)
  const on = st >= 4 && !own ? 1 : 0; halo.material.opacity += (on * .9 - halo.material.opacity) * Math.min(1, raw * 2); haloInner.material.opacity = halo.material.opacity * .18;
  halo.visible = halo.material.opacity > .01; halo.rotation.z += raw * .6; halo.scale.setScalar(.75 + .05 * Math.sin(time * 2));
  halo.material.color.set(path === 'storm' ? 0x9ff0ff : 0xffc85a); haloInner.material.color.set(path === 'storm' ? 0x63dcff : 0xffa23a);
  if (st >= 4 && !own && Math.random() < .35) spark(tmp.copy(halo.position).applyMatrix4(player.matrixWorld), path === 'storm' ? 0xbff6ff : 0xffd27a, _pv.set((Math.random() - .5) * 6, 4 + Math.random() * 6, (Math.random() - .5) * 6), 2.5 * scaleNow, .8);
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
  // 아치·탑·떠 있는 섬 충돌 (Codex world/obstacles.js): 겹치면 법선 방향으로 밀어냄, 최대 3회 반복
  if (terrain.obstacleAt) for (let i = 0; i < 3; i++) {
    const o = terrain.obstacleAt(player.position.x, player.position.y, player.position.z, 3.2 * sc); if (!o || !o.hit) break;
    player.position.x += o.normal.x * o.depth; player.position.y += o.normal.y * o.depth; player.position.z += o.normal.z * o.depth;
    if (i === 0 && flySpeed > base * .8) { flySpeed *= .7; shakeAmp = Math.max(shakeAmp, .25); }
  }
  player.position.x = T.MathUtils.clamp(player.position.x, -2700, 2700); player.position.z = T.MathUtils.clamp(player.position.z, -2700, 2700);
  // 급강하 후 끌어올리기 → 충격파 (3단계부터)
  shockCd -= dt;
  if (st >= 3 && pitch < -.45 && flySpeed > base * .9) diveTime += dt;
  else if (diveTime > .6 && pitch > -.15 && shockCd <= 0) {
    diveTime = 0; shockCd = 2.5; const r = 16 + 7 * sc; sfx('dive_shockwave');
    skills.ring(player.position, r * 1.3, pathColor(0xffd27a, 0xbff6ff), .5); burst(player.position, pathColor(0xffa33d, 0x9ff0ff), 70, 50, fxScale());
    shakeAmp = Math.max(shakeAmp, .8); banner('급강하 충격파', '', .8);
    let killed = 0; for (const e of [...enemies]) if (e.position.distanceTo(player.position) < r + 2 * ((e.userData.grow || 1) - 1)) killed += damageEnemy(e, boltDamage(level, path, rank) * 4) ? 1 : 0;
    if (boss && boss.position.distanceTo(player.position) < r + boss.userData.radius) damageBoss(boltDamage(level, path, rank) * 4, player.position);
    if (killed >= 2) hitStopT = Math.max(hitStopT, .06);
  } else if (pitch > -.3) diveTime = 0;
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
  if (boss) { tmp2.subVectors(boss.position, camera.position); const t = tmp2.dot(camDir), rr = Math.sqrt(lockR2) + boss.userData.radius; if (t > camDistNow * .8 && t < far + 200 && tmp2.lengthSq() - t * t < rr * rr) far = Math.min(far, Math.max(camDistNow, t - boss.userData.radius * .5)); }
  aimPoint.copy(camera.position).addScaledVector(camDir, far);
  const aim = new T.Vector3().subVectors(aimPoint, player.position).normalize();
  const b = mesh(boltGeometry, path === 'storm' ? boltMaterials.storm : boltMaterials.fire);
  b.position.copy(player.position).addScaledVector(aim, 4.8 * s); b.scale.setScalar(.6 + .4 * s);
  aim.subVectors(aimPoint, b.position).normalize();
  const speed = 140 * k;
  bolts.push({o: b, prev: b.position.clone(), v: aim.clone().multiplyScalar(speed), life: Math.min(3, 650 / speed), dmg: boltDamage(level, path, rank), r: 4.5 + .55 * (.6 + .4 * s), pierce: fireTrait(path, stage()).pierce || 0});
  anim.fire(); sfx(path === 'storm' ? 'breath_storm' : 'breath_flame', null, .55);
  for (let j = 0; j < 6; j++) { _pv.copy(aim).multiplyScalar((30 + Math.random() * 35) * k).add(tmp2.set((Math.random() - .5) * 9, (Math.random() - .5) * 9, (Math.random() - .5) * 9)); spark(b.position, path === 'storm' ? (j % 3 ? 0x64d9ff : 0xffffff) : (j % 3 ? 0xff7a21 : 0xffe49e), _pv, (2 + Math.random() * 4) * k, .25 + Math.random() * .35); }
}

// 적 피해 공통 처리. 처치되면 true
function damageEnemy(e, dmg, color, quiet = false) {
  if (!e.parent) return false;
  e.userData.hp -= dmg;
  if (!quiet) { burst(e.position, color || 0xffa54c, 10, 20, Math.min(fxScale(), 1.5)); sfx('hit', e.position, .6); }
  if (e.userData.hp <= 0) { killEnemy(e); return true; }
  return false;
}
const fwdTmp = new T.Vector3();
const skills = createSkillSystem({scene, camera, player,
  enemies: () => enemies, boss: () => boss, damageEnemy, damageBoss: (d, at) => { if (boss) damageBoss(d, at); },
  boltDamage: () => boltDamage(level, path, rank), burst, spark,
  shake: a => { shakeAmp = Math.max(shakeAmp, a); }, hitStop: t => { if (hitStopT <= 0) sfx('multikill', null, .7); hitStopT = Math.max(hitStopT, t); }, slowmo: (t, k) => { slowT = t; slowK = k; },
  forward: () => fwdTmp.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)),
  aimPoint: d => { const c = camera.getWorldDirection(new T.Vector3()); let far = d;
    for (const e of enemies) { tmp2.subVectors(e.position, camera.position); const t = tmp2.dot(c); if (t > camDistNow && t < far && tmp2.lengthSq() - t * t < 900) far = t; }
    if (boss) { tmp2.subVectors(boss.position, camera.position); const t = tmp2.dot(c); if (t > camDistNow && t < far + 150 && tmp2.lengthSq() - t * t < (boss.userData.radius + 20) ** 2) far = t; }
    return camera.position.clone().addScaledVector(c, far); },
  banner: (t, sub, sec) => banner(t, sub, sec), ult: () => ult, setUlt: v => { ult = v; },
  clearBoltsNear: (pos, r) => { for (const list of [enemyBolts, bossBolts]) for (let i = list.length - 1; i >= 0; i--) if (list[i].o.position.distanceTo(pos) < r) { spark(list[i].o.position, 0xfff1c1, _pv.set(0, 0, 0), 6, .3); scene.remove(list[i].o); list.splice(i, 1); } },
});
function castSkill(slot) {
  if (!playing || paused || over || coronation >= 0 || (gnd && gnd.mode !== 'air')) return;
  const st = stage(), sk = skillFor(path, slot, st);
  if (!sk) { if (st < SLOT_UNLOCK[slot]) banner('아직 잠긴 스킬', `${SLOT_UNLOCK[slot]}단계 진화 후 해금`, 1); return; }
  if (skills.cast(slot, path, st)) sfx(({meteor: 'skill_meteor', tornado: 'skill_tornado', strike: 'skill_lightning', cloud: 'skill_lightning', aura: 'skill_shield', pillars: path === 'storm' ? 'ult_storm' : 'ult_flame'})[sk.kind] || 'ui_click');
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.prev.copy(b.o.position); b.o.position.addScaledVector(b.v, dt); b.life -= dt;
    if (Math.random() < .7) { _pv.copy(b.v).multiplyScalar(-.08).add(tmp2.set((Math.random() - .5) * 7, (Math.random() - .5) * 7, (Math.random() - .5) * 7)); spark(b.o.position, path === 'storm' ? 0x77dfff : 0xff8a2a, _pv, (2 + Math.random() * 3) * fxScale(), .3 + Math.random() * .25); }
    let hit = null;
    for (const e of enemies) { if (b.hitSet?.has(e)) continue; const rr = b.r + 2 * ((e.userData.grow || 1) - 1); if (segDistSq(e.position, b.prev, b.o.position) < rr * rr) { hit = e; break; } }
    if (!hit && boss) { const rr = b.r + boss.userData.radius; if (segDistSq(boss.position, b.prev, b.o.position) < rr * rr) { damageBoss(b.dmg, b.o.position); skills.onBoltHit(path, stage(), null, b.o.position, b.dmg); b.life = 0; } }
    if (hit) {
      const at = b.o.position.clone(); damageEnemy(hit, b.dmg, path === 'storm' ? 0x7de6ff : 0xffa54c);
      skills.onBoltHit(path, stage(), hit.parent ? hit : null, at, b.dmg);
      // 화염 3단계: 관통(남은 관통 수만큼 계속 날아감)
      if (b.pierce > 0) { b.pierce--; (b.hitSet ||= new Set()).add(hit); } else b.life = 0;
    }
    if (b.o.position.y < ground(b.o.position.x, b.o.position.z)) b.life = 0;
    if (b.life <= 0) { scene.remove(b.o); bolts.splice(i, 1); }
  }
}

function updateEnemies(dt) {
  const st = stage(), sc = scaleNow, cap = STAGE.enemyCap[st - 1];
  // 무리 스폰: 초당 스폰 속도만큼 예산 적립 → 4마리 이상 모이면 4~6마리 무리로
  const maxGroup = st >= 4 ? 9 : st === 3 ? 7 : 6;
  spawnBudget = Math.min(maxGroup, spawnBudget + STAGE.spawnRate[st - 1] * dt);
  if (spawnBudget >= 4 && enemies.length + 4 <= cap && coronation < 0) { const n = Math.min(Math.floor(spawnBudget), cap - enemies.length, maxGroup); spawnGroup(n); spawnBudget -= n; }
  shotTokens = Math.min(STAGE.shooters[st - 1], shotTokens + STAGE.shooters[st - 1] / 3 * dt);
  dashTimer -= dt;
  const contactR = 3.2 * sc + 4 + 2 * (ENEMY_GROW[st - 1] - 1);
  for (const e of [...enemies]) {
    const u = e.userData; tmp.subVectors(player.position, e.position); const d = tmp.length(); tmp.divideScalar(d || 1);
    if (d > 450) { groupCenter(_c); e.position.set(_c.x + (Math.random() - .5) * 50, _c.y, _c.z + (Math.random() - .5) * 50); continue; }
    if (u.dash > 0) { u.dash -= dt; e.position.addScaledVector(u.dashDir, 60 * dt); }
    else if (d > 60) e.position.addScaledVector(tmp, 16 * u.speed * dt);
    else { // 30~60m에서 선회
      tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(u.orbit * 10 * u.speed * dt); e.position.add(tmp2).addScaledVector(tmp, (d - 45) * .5 * dt);
    }
    if (dashTimer <= 0 && u.dash <= 0 && d < 150) { u.dash = 1.5; u.dashDir.copy(tmp); dashTimer = 6; }
    e.position.y = Math.max(e.position.y + Math.sin(time * 2 + u.phase) * dt * 2, ground(e.position.x, e.position.z) + 6);
    e.lookAt(player.position); e.rotateY(Math.PI);
    if (u.wings.length) { u.wings[0].rotation.z = Math.sin(time * (u.dash > 0 ? 9 : 4) + u.phase) * .22; u.wings[1].rotation.z = -u.wings[0].rotation.z; }
    else { const f = Math.sin(time * (u.kind === 'moth' ? 14 : 5) + u.phase); e.rotation.z += f * (u.kind === 'moth' ? .05 : .12); if (u.kind === 'moth') e.scale.x = e.scale.z * (1 + f * .12); }
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
  const lift = 3 + 2.1 * s, dist = camDistNow; // 큰 용일수록 카메라를 낮고 가깝게 → 날개가 화면을 채움
  // 대관식 동안 카메라가 드래곤 주위를 돌았다가 돌아옴
  const spin = coronation >= 0 ? Math.PI * .9 * Math.sin(Math.PI * Math.min(1, coronationT / 4)) : 0, vy = yaw + spin;
  viewDir.set(-Math.sin(vy) * Math.cos(pitch), Math.sin(pitch), -Math.cos(vy) * Math.cos(pitch));
  viewUp.set(Math.sin(vy) * Math.sin(pitch), Math.cos(pitch), Math.cos(vy) * Math.sin(pitch));
  pivot.copy(player.position).addScaledVector(viewUp, lift * .4);
  desired.copy(pivot).addScaledVector(viewDir, -dist).addScaledVector(viewUp, lift * .6);
  // 드래곤→카메라 사이 8점 검사: 능선에 가리면 카메라를 앞으로 당김(상하 무제한 피치 유지)
  let safe = 1;
  for (let i = 1; i <= 8; i++) { tmp.lerpVectors(pivot, desired, i / 8); if (tmp.y < ground(tmp.x, tmp.z) + 2 + .6 * s) { safe = (i - 1) / 8; break; } }
  if (terrain.raycastObstacles) { const hit = terrain.raycastObstacles(pivot, desired); if (hit && hit.fraction < safe) safe = Math.max(0, hit.fraction - .05); }
  if (safe < 1) desired.lerpVectors(pivot, desired, Math.max(safe, 5.5 * s / dist));
  desired.y = Math.max(desired.y, ground(desired.x, desired.z) + 3);
  camera.position.lerp(desired, 1 - Math.exp(-(safe < 1 ? 25 : 10) * dt));
  camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 3);
  camera.up.copy(viewUp);
  // 조준점이 큰 몸에 가리지 않도록 시선 높이를 단계에 비례
  camera.lookAt(tmp.copy(player.position).addScaledVector(viewDir, 10 + 7 * s).addScaledVector(viewUp, 1 + .7 * s));
  const fov = 60 + 3 * (s - 1) + (boosting ? 8 : 0) + (gliding && pitch < -.3 ? 6 : 0);
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
  if (hitStopT > 0) { hitStopT -= raw; dt = 0; }
  if (slowT > 0) { slowT -= raw; dt *= slowK; }
  if (playing && !paused && !over) {
    if ((comboTimer -= dt) <= 0 && combo) { combo = 0; $('#combo').classList.remove('on'); }
    if (stage() >= 4 && coronation < 0) ult = Math.min(100, ult + ULT_PER_SEC * dt);
    skills.update(dt, raw);
    runTime += dt; invuln = Math.max(0, invuln - dt); hitTimer -= dt;
    const grounded = gnd.mode !== 'air' || gnd.animating;
    if (!grounded) { const f = updateFlight(dt); boosting = f.boosting; fireBreath(dt, f.firing); updateEnemies(dt); if (!over) updateBoss(dt); if (!over) updateElite(dt); if (!over) updateBolts(dt); }
    else { player.rotation.x *= Math.exp(-6 * raw); player.rotation.y = yaw; flySpeed = 0; animIn.fwd = animIn.side = 0; animIn.up = animIn.down = animIn.boost = false; }
    gnd.update(dt, raw, keys, touch.state, camera); updateQuestHud();
    if (progressDirty && (progressSaveT -= raw) <= 0) { progressSaveT = 2; if (gnd.saveDragon(progressSnapshot()) === true) progressDirty = false; }
  }
  if (bannerTimer > 0 && (bannerTimer -= raw) <= 0) $('#banner').classList.remove('on');
  updateParticles(raw);
  if (!(playing && !paused && !over)) { animIn.fwd = animIn.side = 0; animIn.up = animIn.down = animIn.boost = false; }
  const targetScale = stageScale(level); scaleNow += (targetScale - scaleNow) * (1 - Math.exp(-3 * raw)); player.scale.setScalar(scaleNow * gnd.dragonMul);
  syncStageModel(); updateStageLook(raw);
  anim.rate = T.MathUtils.clamp(1 / Math.sqrt(scaleNow), .45, 1); animIn.yaw = yaw; anim.update(raw, animIn); player.rotation.z = anim.bankAngle;
  const mdl = player.userData.model;
  if (mdl && mdl.userData.rig) { anim.applyUniforms(mdl.userData.rig); anim.applyPose(mdl, mdl.userData.unit); }
  else player.userData.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (.05 - anim.wingUp * .45));
  if (gnd.mode === 'human') gnd.updateCamera(camera, raw); else updateCamera(raw, boosting);
  if (shakeAmp > .01) { const a = shakeAmp * (1.2 + .6 * scaleNow); camera.position.add(tmp.set((Math.random() - .5) * a, (Math.random() - .5) * a, (Math.random() - .5) * a)); shakeAmp *= Math.exp(-7 * raw); }
  if (playing && !over) updateSkillHud();
  tod.update(raw, player.position); terrain.setSunDirection(tod.sunDirection); terrain.update(camera.position, raw); clouds.update(raw, camera, tod);
  renderer.render(scene, camera);
}

// ---------- 지상 시제품 (gnd.js): 착륙·폴리모프·채집·제작·수리·저장 ----------
// ---------- 영구 성장 (사용자 확정 2026-11-20: 성장은 영구 저장, 새로 하려면 새 슬롯) ----------
const SLOT = activeSlot(store), TEST_RUN = ['lv', 'xp', 'boss', 'elite'].some(k => params.has(k)); // 테스트 주소는 성장을 저장하지 않음
let progressDirty = false, progressSaveT = 0;
const progressSnapshot = () => ({level, xp, path, rank, rankXp, kills, lateKills, bossKills, savedAt: Date.now()});
function markProgress() { if (!TEST_RUN) progressDirty = true; }
function applySavedDragon(d) {
  if (!d || TEST_RUN) return;
  level = T.MathUtils.clamp(d.level | 0, 1, MAX_LEVEL); xp = Math.max(0, d.xp | 0);
  path = ['flame', 'storm'].includes(d.path) ? d.path : ''; rank = Math.max(0, d.rank | 0); rankXp = Math.max(0, d.rankXp | 0);
  kills = Math.max(0, d.kills | 0); lateKills = Math.max(0, d.lateKills | 0); bossKills = Math.max(0, d.bossKills | 0);
  hp = maxHpForLevel(level) * (path === 'storm' ? 1.1 : 1); scaleNow = stageScale(level); camDistNow = STAGE.camDist[stage() - 1];
}
const gnd = createGround({scene, terrain, player, store, banner, burst, spark, sfx, slot: SLOT, loadModel,
  shake: a => { shakeAmp = Math.max(shakeAmp, a); }, fx: () => fxScale(), scale: () => scaleNow, path: () => path, pathColor,
  getYaw: () => yaw, getPitch: () => pitch, setYaw: v => { yaw = v; pitch = 0; }, time: () => time,
  onLandStart: () => { // 착륙 시 주변 적·탄 정리 (임시: 안전 구역에는 전투 없음)
    for (const e of [...enemies]) removeEnemy(e); for (const list of [enemyBolts, bossBolts]) { for (const b of list) scene.remove(b.o); list.length = 0; }
    for (const b of bolts) scene.remove(b.o); bolts.length = 0; skills.reset(); mouseDown = false; },
  onModeChange: m => { document.body.dataset.form = m; if (m === 'air') { pitch = .25; flySpeed = STAGE.speed[stage() - 1]; } refresh(); },
});
function groundKey(code) {
  const m = gnd.mode;
  if (code === 'KeyG' && m === 'air') { if (boss) banner('착륙 불가', '루세르나가 하늘에 있습니다', 1.4); else if (coronation >= 0) {} else gnd.tryLand(); return true; }
  if (code === 'KeyH' && m === 'landed') { gnd.toHuman(); return true; }
  if (code === 'KeyH' && m === 'human') { gnd.toDragon(); return true; }
  if (code === 'KeyE' && m !== 'air') { gnd.interact(); return true; }
  if (code === 'Space' && m === 'landed' && !gnd.talking) { gnd.takeoff(); return true; }
  return m !== 'air' && ['KeyQ', 'KeyR', 'KeyF'].includes(code); // 지상에서는 스킬·브레스 막음
}
let questKey = '';
function updateQuestHud() { const t = gnd.objective(); if (t !== questKey) { questKey = t; $('#quest').textContent = t ? '임무 · ' + t : ''; $('#quest').hidden = !t; } }
loadManifest().then(() => gnd.loadHero()).catch(e => console.warn('[hero]', e)); // 여성 폴리모프 모델
applySavedDragon(gnd.world.dragon);
gnd.restore();
// 시작 화면: 슬롯 목록 · 이어하기 · 새 용으로 시작
const STAGE_SHORT = ['해츨링', '드레이크', '웜', '드래곤 엠페러'];
function slotLabel(d) { if (!d) return '새 해츨링'; const st = stageForLevel(d.level || 1); return `Lv.${d.level} ${d.path === 'storm' ? '폭풍 ' : d.path === 'flame' ? '화염 ' : ''}${STAGE_SHORT[st - 1]}${d.rank ? ' · 위계 ' + d.rank : ''}`; }
function renderSlots() {
  const slots = listSlots(store), el = $('#slots'), cur = slots.find(x => x.slot === SLOT), d = cur?.world.dragon;
  if (!TEST_RUN && d) $('#begin').innerHTML = `이어하기 · ${slotLabel(d)} <span>↗</span>`;
  const rows = slots.map(x => `<button class="slot${x.slot === SLOT ? ' on' : ''}" data-slot="${x.slot}"><b>슬롯 ${x.slot}</b><span>${slotLabel(x.world.dragon)}</span><small>${x.world.step >= 8 ? '첫 임무 완료' : x.world.step > 0 ? '첫 임무 진행 중' : ''}</small></button>`).join('');
  const free = [1, 2, 3].find(n => !slots.some(x => x.slot === n) && n !== SLOT);
  el.innerHTML = rows + (free && slots.length ? `<button class="slot new" data-new="${free}"><b>+</b><span>새 용으로 시작</span><small>기존 용은 슬롯에 그대로 남습니다</small></button>` : '');
  el.hidden = !slots.length;
  el.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { const n = +b.dataset.slot; if (n === SLOT) return; store.set(ACTIVE_SLOT_KEY, String(n)); location.reload(); });
  el.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { if (!confirm(`슬롯 ${b.dataset.new}에서 새 해츨링으로 시작할까요? 지금 용은 슬롯 ${SLOT}에 그대로 남습니다.`)) return; store.set(ACTIVE_SLOT_KEY, b.dataset.new); location.reload(); });
}
renderSlots();

// 첫 무리 2개를 시작 방향(-Z) 앞에 배치
if (gnd.mode === 'air') for (let i = 0; i < 2; i++) spawnGroup(5);
document.body.classList.toggle('storm', path === 'storm');
refresh(); loop();
// 단계별 드래곤 모델: 1 해츨링(필수) · 2 드레이크 · 3 웜 · 4 엠페러 (manifest에 없으면 아래 단계 모델을 계속 사용)
function addStageModel(i, m) {
  if (!m) return; m.userData.baseScale = m.scale.x; m.userData.stageIndex = i;
  // 발광 맵이 없는 단계 모델은 색 텍스처를 약하게 자체발광시켜 용암 균열이 빛나 보이게
  m.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) if (mt.map && !mt.emissiveMap) { mt.emissiveMap = mt.map; mt.emissive = new T.Color(0xffffff); mt.emissiveIntensity = .2; mt.userData.mapGlow = true; mt.needsUpdate = true; } }); m.visible = false; player.add(m); stageModels[i] = m; setDragonPathVisual(m, path);
  if (i === 0) player.children.forEach(c => { if (c !== halo && !stageModels.includes(c)) c.visible = false; });
}
function syncStageModel() {
  let want = null; for (let i = stage() - 1; i >= 0 && !want; i--) want = stageModels[i];
  const cur = player.userData.model; if (!want || want === cur) return;
  if (cur) cur.visible = false; want.visible = true; player.userData.model = want; setDragonPathVisual(want, path);
}
loadManifest().then(async () => {
  addStageModel(0, await loadModel(STAGE_MODEL_IDS[0], {length: 9, rig: true}));
  for (let i = 1; i < 4; i++) addStageModel(i, await loadModel(STAGE_MODEL_IDS[i], {length: 9, rig: true}));
}).catch(e => console.warn('[assets]', e));
// 승인된 적·보스 GLB (manifest에 없으면 절차적 도형 유지). 텍스처를 약하게 자체발광시켜 등불이 보이게 함
function glow(root, k) { root.traverse(o => { if (!o.isMesh || !o.material?.map) return; o.material.emissive = new T.Color(0xffffff); o.material.emissiveMap = o.material.map; o.material.emissiveIntensity = k; o.material.needsUpdate = true; }); }
loadManifest().then(async () => {
  for (const [k, d] of Object.entries(ENEMY_KINDS)) {
    const m = await loadModel(d.id, {length: d.len}); if (!m) continue;
    glow(m, .35); m.userData.glb = true; enemyTemplates[k] = m;
    for (const e of [...enemies]) if (e.userData.kind === k) { const q = e.position.clone(); removeEnemy(e); makeEnemy(q.x, q.y, q.z, k); }
  }
  bossModel = await loadModel('boss_lucerna', {length: 70}); if (bossModel) glow(bossModel, .45);
}).catch(e => console.warn('[assets] enemies', e));
if (touch.isTouch) document.querySelector('.help')?.remove();
// 디버그·테스트 훅 (읽기 전용 상태)
window.__game = {camera, get hud() { return {level, xp, hp, maxHp, kills, path, paused, over, playing, yaw, pitch, coins, rank, rankXp, coronation, gliding, flySpeed, runTime, stage: stage(), invuln}; },
  get player() { return player; }, anim, get enemies() { return enemies; }, get enemyBolts() { return enemyBolts; }, get boss() { return boss; }, spawnBoss, ground: gnd, skills, castSkill, get combo() { return combo; }, get ult() { return ult; }, fillUlt() { ult = 100; }, spawnElite, get elite() { return elite; }, terrain, tod, touch, start};
