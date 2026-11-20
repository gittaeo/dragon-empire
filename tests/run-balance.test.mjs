import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {emptyGrowth, combatXp, tickPlay, accrueRest, gateFor, holdAtGate, STAGE_TOTALS, KILL_BASE, WINDOW_SEC} from '../growth.js';
import {xpToNext, addExperience, killExperience, stageForLevel, MAX_LEVEL, STAGE, boltDamage, boltInterval, addRankExperience, rankXpToNext, crystalReward} from '../progression.js';

// 영구 성장 페이싱(docs/PACING.md, 2026-11-21 승인): 이전 '한 판 10분' 테스트를 대체
test('페이싱: 단계 구간 총량 1000/1200/1800, 성장 처치 XP 일반 4·엘리트 12, 엠페러 위계는 이전 값', () => {
  const tot = [0, 0, 0]; for (let L = 1; L < MAX_LEVEL; L++) tot[stageForLevel(L) - 1] += xpToNext(L);
  assert.deepEqual(tot, STAGE_TOTALS);
  assert.equal(killExperience(5), KILL_BASE); assert.equal(killExperience(15, 3), 12); assert.ok(killExperience(MAX_LEVEL) >= 60);
  for (let L = 2; L < 10; L++) assert.ok(xpToNext(L) >= xpToNext(L - 1), '구간 안에서는 뒤로 갈수록 필요량 증가');
});
test('페이싱: 전투만으로는 예산 뒤 10%로 줄어 1단계 XP의 대부분을 콘텐츠에서 얻어야 함', () => {
  const g = emptyGrowth(); let combat = 0; for (let i = 0; i < 200; i++) combat += combatXp(g, KILL_BASE, 1);
  assert.ok(combat < 0.4 * STAGE_TOTALS[0], `한 창에서 200처치 XP ${combat}`);
  tickPlay(g, WINDOW_SEC + 1); assert.equal(combatXp(g, KILL_BASE, 1), KILL_BASE, '50분 창이 바뀌면 예산 회복');
});
test('페이싱: 휴식 숨결은 쉰 시간만큼 쌓여 전투 XP를 2배로 하고 한 레벨분을 넘지 않음', () => {
  const g = emptyGrowth(); g.lastSeen = 1; accrueRest(g, 1 + 1e9, 5); assert.equal(g.rest, xpToNext(5));
  const xp = combatXp(g, KILL_BASE, 1); assert.equal(xp, KILL_BASE * 2);
});
test('페이싱: 드레이크 시험 전에는 Lv9에서 대기하고 초과 XP는 한 레벨분만 보관', () => {
  const g = emptyGrowth(); let st = addExperience({level: 9, xp: 0}, 5000); const gate = gateFor(st.level, g); assert.ok(gate);
  st = holdAtGate(st, g, gate); assert.equal(st.level, 9); assert.equal(g.pending, xpToNext(10));
  g.trials.drake = true; assert.equal(gateFor(12, g), null);
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
