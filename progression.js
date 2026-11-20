// 성장·밸런스 공식 (M1, 2026-11-20). XP 곡선은 BALANCE.md, 나머지는 엠페러 모드 설계안 기준 초기값.
// 플레이테스트로 조정한다. 숫자 표는 단계(1 해츨링 ~ 4 엠페러) 순서.
export const MAX_LEVEL = 30;
const round5 = v => Math.round(v / 5) * 5;
export const xpToNext = level => round5(30 + 8 * level + 0.6 * level * level);
export const stageForLevel = level => level >= 30 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
export const stageStartLevel = stage => [1, 10, 20, 30][stage - 1];
export const stageScale = level => [1, 1.8, 3, 4.5][stageForLevel(level) - 1];
export function addExperience(state, amount) {
  let { level, xp } = state;
  xp += Math.max(0, amount);
  while (level < MAX_LEVEL && xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
  if (level === MAX_LEVEL) xp = 0;
  return { level, xp };
}
// 처치 경험치: 일반 1, 나방 2, 기수 5, 엘리트 12 (등급은 M3에서 사용)
export const killExperience = (level, tier = 1) => round5(8 + 2 * level) * tier;
export const maxHpForLevel = level => 100 + 10 * (level - 1);

// 엠페러(Lv30) 이후 황제 위계. rank는 0부터, 다음 위계 필요량 1200 + 300·rank
export const rankXpToNext = rank => 1200 + 300 * rank;
export function addRankExperience(state, amount) {
  let { rank, rankXp } = state;
  rankXp += Math.max(0, amount);
  while (rankXp >= rankXpToNext(rank)) { rankXp -= rankXpToNext(rank); rank++; }
  return { rank, rankXp };
}
export const rankDamageBonus = rank => 1 + 0.02 * Math.min(rank, 20);

// 단계별 비행·전투 표
export const STAGE = {
  speed: [32, 38, 44, 52], boost: [65, 80, 95, 120], camDist: [22, 30, 42, 58],
  enemyHp: [30, 70, 120, 150], enemyCap: [12, 16, 20, 24], spawnRate: [0.5, 0.6, 0.7, 0.9],
  shooters: [3, 4, 5, 6], shotDamagePct: [0.06, 0.07, 0.08, 0.05], contactDamagePct: [0.10, 0.12, 0.12, 0.06],
};
const BOLT = { flame: { dmg: [12, 25, 45, 180], rate: [6, 5, 6, 4] }, storm: { dmg: [10, 21, 38, 150], rate: [5, 6, 6, 5] } };
// 기본 브레스 한 발 피해: 단계 표 × 단계 안 레벨 보정(+3%/Lv) × 위계 보너스. 경로 선택 전(1단계)은 화염 기준.
export function boltDamage(level, path, rank = 0) {
  const stage = stageForLevel(level), b = BOLT[path === 'storm' ? 'storm' : 'flame'];
  return b.dmg[stage - 1] * (1 + 0.03 * (level - stageStartLevel(stage))) * rankDamageBonus(rank);
}
export const boltInterval = (level, path) => 1 / BOLT[path === 'storm' ? 'storm' : 'flame'].rate[stageForLevel(level) - 1];

// 용의 결정 보상. Lv30 미달 실패는 ×0.5. 위계 10 초과 구간의 처치·위계 보상은 ×0.5(무한 파밍 억제).
export function crystalReward({ level, kills, rank = 0, lateKills = 0, boss = false }) {
  const stage = stageForLevel(level), earlyKills = kills - lateKills, rankTerm = Math.min(rank, 10) * 15 + Math.max(0, rank - 10) * 7.5;
  const base = 20 + level * 4 + Math.floor(earlyKills * 1.5 + lateKills * 0.75) + (stage - 1) * 40 + rankTerm + (boss ? 150 : 0);
  return Math.floor(base * (level >= MAX_LEVEL ? 1 : 0.5));
}
