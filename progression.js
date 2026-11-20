// 초안 밸런스: XP 곡선은 BALANCE.md 기준, 적 보상은 플레이테스트 전 임시값.
export const MAX_LEVEL = 30;
export const xpToNext = level => Math.round((30 + 8 * level + 0.6 * level * level) / 5) * 5;
export const stageForLevel = level => level >= 30 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
export const stageScale = level => [1, 1.8, 3, 4.5][stageForLevel(level) - 1];
export function addExperience(state, amount) {
  let { level, xp } = state;
  xp += Math.max(0, amount);
  while (level < MAX_LEVEL && xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
  if (level === MAX_LEVEL) xp = 0;
  return { level, xp };
}
export const killExperience = level => Math.round((30 + level * 8) / 5) * 5;
