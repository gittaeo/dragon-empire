import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {addExperience, killExperience, stageForLevel, MAX_LEVEL, STAGE, boltDamage, boltInterval, addRankExperience, rankXpToNext, crystalReward} from '../progression.js';

test('일반 적 경험치로 모든 성장 단계와 최종 레벨에 도달하고, 처치 수가 10분 페이스 범위다', () => {
  let state = {level: 1, xp: 0}; const reached = new Set([1]); const killsPerStage = [0, 0, 0];
  let kills = 0;
  while (state.level < MAX_LEVEL && kills < 1000) {
    const award = killExperience(state.level);
    assert.ok(Number.isFinite(award) && award > 0);
    killsPerStage[stageForLevel(state.level) - 1]++;
    state = addExperience(state, award); reached.add(stageForLevel(state.level)); kills++;
  }
  assert.equal(state.level, MAX_LEVEL);
  assert.deepEqual([...reached], [1, 2, 3, 4]);
  // 스폰 속도(0.5/0.6/0.7 마리/초)가 처치 속도 상한 → 단계별 최소 시간
  const minSeconds = killsPerStage.reduce((s, k, i) => s + k / STAGE.spawnRate[i], 0);
  assert.ok(kills >= 150 && kills <= 300, `완주 처치 수 ${kills}`);
  assert.ok(minSeconds >= 300, `스폰 한도상 최단 완주 ${Math.round(minSeconds)}초는 5분 이상이어야 함`);
});

test('일반 적 처치 타수: 1단계 3발 내외, 엠페러 1발', () => {
  for (const path of ['flame', 'storm']) {
    const s1 = Math.ceil(STAGE.enemyHp[0] / boltDamage(1, path)), s4 = Math.ceil(STAGE.enemyHp[3] / boltDamage(30, path));
    assert.ok(s1 >= 2 && s1 <= 4, `${path} 1단계 ${s1}발`); assert.equal(s4, 1, `${path} 엠페러 한 방`);
    assert.ok(boltInterval(30, path) > 0);
  }
});

test('황제 위계는 여러 단계를 넘을 때 경험치를 보존한다', () => {
  assert.deepEqual(addRankExperience({rank: 0, rankXp: 0}, rankXpToNext(0) + rankXpToNext(1) + 9), {rank: 2, rankXp: 9});
});

test('보상: Lv30 미달 실패는 절반, 위계 10 초과 처치는 절반 가치', () => {
  const win = crystalReward({level: 30, kills: 200, rank: 3});
  assert.equal(win, Math.floor(20 + 120 + 300 + 120 + 45));
  assert.equal(crystalReward({level: 15, kills: 60}), Math.floor((20 + 60 + 90 + 40) * .5));
  assert.ok(crystalReward({level: 30, kills: 400, rank: 12, lateKills: 100}) < crystalReward({level: 30, kills: 400, rank: 12, lateKills: 0}));
});
