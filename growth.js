// 영구 성장 페이싱 P0 (docs/PACING.md, 사용자 승인 2026-11-21: "Yes, build it")
// 가정(조정 가능): 하루 50~60분, 엠페러까지 170~210분, XP 원천 전투25/퀘스트40/탐험25/제작10,
// 전투 XP 예산(플레이 50분 창마다) 초과 시 10%, 휴식 숨결(접속 안 한 시간 → 전투 XP 2배, 최대 한 레벨분), 진화 시험.

// ---------- 레벨 곡선: 단계 구간 총량 1000 / 1200 / 1800, 구간 안에서는 초반이 빠르게 ----------
function ramp(total, n, k = .55) { // n개 레벨에 total을 나눔, 뒤로 갈수록 (1+k)배까지 증가
  const w = Array.from({length: n}, (_, i) => 1 + k * i / Math.max(1, n - 1)), s = w.reduce((a, b) => a + b, 0);
  const out = w.map(x => Math.round(total * x / s / 5) * 5); out[n - 1] += total - out.reduce((a, b) => a + b, 0); return out;
}
export const STAGE_TOTALS = [1000, 1200, 1800];
const CURVE = [0, ...ramp(STAGE_TOTALS[0], 9), ...ramp(STAGE_TOTALS[1], 10), ...ramp(STAGE_TOTALS[2], 10)]; // CURVE[L] = L→L+1
export const pacedXpToNext = level => CURVE[Math.max(1, Math.min(29, level))];

// ---------- XP 원천 ----------
export const KILL_BASE = 4; // 일반 적 4, 엘리트 12(등급 배수 3)
export const COMBAT_BUDGET = [250, 300, 450, Infinity]; // 단계별, 플레이 50분 창마다 100% 구간
export const COMBAT_FLOOR = .1, WINDOW_SEC = 3000;
export const REWARDS = { // 1회 지급 (퀘스트·제작·탐험). 단계 1 기준 — 이후 단계 콘텐츠는 아직 없음
  quest: {land: 30, meet: 40, repair: 160, done: 170, trial_drake: 0},
  craft: {workbench: 50, kit: 50},
  discovery: 30, // 장소 1곳당 × 단계 배수
};
export const DISCOVERY_STAGE_MUL = [1, 1.5, 2, 2];
// 발견 장소 (지형 seed 7 기준 좌표 — 오프라인 스캔 결과). r: 발견 반경(m, 용 크기 무관 기본값)
export const SITES = [
  {id: 'zone', name: '풍향탑 공터', x: -116.5, y: 30, z: 1410, r: 120},
  {id: 'arch', name: '골짜기 아치 바위', x: -22, y: 163, z: 1253, r: 150},
  {id: 'isle_mid', name: '안개 섬', x: -260, y: 211, z: 640, r: 150},
  {id: 'tower_w', name: '서쪽 감시탑', x: -360, y: 119, z: -360, r: 130},
  {id: 'isle_s', name: '등불 사슬 섬', x: 516, y: 160, z: -132, r: 160},
  {id: 'isle_e', name: '쌍둥이 섬', x: 156, y: 154, z: -1692, r: 170},
  {id: 'tower_e', name: '동쪽 감시탑', x: 1200, y: 127, z: -360, r: 140},
  {id: 'isle_n', name: '북쪽 끝 섬', x: -468, y: 205, z: -2304, r: 180},
  {id: 'peak', name: '하늘 지붕 봉우리', x: 2550, y: 1115, z: 2200, r: 260},
];

// ---------- 상태 (슬롯 dragon.growth에 저장) ----------
export const emptyGrowth = () => ({v: 1, trials: {drake: false, wyrm: false, emperor: false}, rewarded: {}, discovered: [], bySource: {combat: 0, quest: 0, discovery: 0, craft: 0},
  playSec: 0, window: {idx: 0, xp: 0}, rest: 0, pending: 0, stageAt: {1: 0}, lastSeen: 0});
export function migrateGrowth(g) {
  const e = emptyGrowth(); if (!g || typeof g !== 'object') return e;
  return {...e, ...g, trials: {...e.trials, ...(g.trials || {})}, bySource: {...e.bySource, ...(g.bySource || {})}, window: {...e.window, ...(g.window || {})},
    rewarded: {...(g.rewarded || {})}, discovered: Array.isArray(g.discovered) ? g.discovered : [], stageAt: {...e.stageAt, ...(g.stageAt || {})}};
}
// 접속하지 않은 시간 → 휴식 숨결(전투 XP 2배로 소모). 시간당 현재 레벨 필요량의 1/4, 최대 한 레벨분
export function accrueRest(g, now, level) {
  if (g.lastSeen > 0 && now > g.lastSeen) {
    const hours = (now - g.lastSeen) / 3.6e6, cap = pacedXpToNext(level);
    if (hours > .25) g.rest = Math.min(cap, g.rest + Math.round(hours * cap / 4));
  }
  g.lastSeen = now; return g.rest;
}
export function tickPlay(g, dt) {
  g.playSec += dt; const idx = Math.floor(g.playSec / WINDOW_SEC);
  if (idx !== g.window.idx) { g.window.idx = idx; g.window.xp = 0; }
}
// 처치 XP 계산(감쇠·휴식 반영). base = KILL_BASE × 등급
export function combatXp(g, base, stage, {budgetOff = false} = {}) {
  let xp = base;
  if (!budgetOff && g.window.xp >= COMBAT_BUDGET[stage - 1]) xp = base * COMBAT_FLOOR;
  g.window.xp += base;
  if (g.rest > 0) { const bonus = Math.min(g.rest, xp); g.rest -= bonus; xp += bonus; }
  return Math.max(0, Math.round(xp * 10) / 10);
}
// 1회 보상: 이미 받았으면 0
export function oneTime(g, key, amount) { if (g.rewarded[key]) return 0; g.rewarded[key] = 1; return amount; }
// 진화 시험이 필요한 경계: 9→10(드레이크). 웜·엠페러 시험은 콘텐츠가 없어 아직 잠그지 않음(PACING.md P1)
export const TRIAL_GATES = [{level: 10, trial: 'drake', name: '비행 시험'}];
export function gateFor(level, g) { return TRIAL_GATES.find(t => level >= t.level && !g.trials[t.trial]) || null; }
// 시험 대기 중 초과 XP는 한 레벨분까지만 보관
export function holdAtGate(state, g, gate) {
  if (state.level < gate.level) return state;
  let over = state.xp; for (let L = gate.level; L < state.level; L++) over += pacedXpToNext(L);
  g.pending = Math.min(pacedXpToNext(gate.level), g.pending + over);
  return {level: gate.level - 1, xp: pacedXpToNext(gate.level - 1)};
}
