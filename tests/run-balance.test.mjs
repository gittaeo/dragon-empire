import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {addExperience, killExperience, stageForLevel, MAX_LEVEL} from '../progression.js';

test('일반 적 경험치로 모든 성장 단계와 최종 레벨에 도달한다', () => {
  let state = {level: 1, xp: 0};
  const reached = new Set([stageForLevel(state.level)]);
  let kills = 0;
  while (state.level < MAX_LEVEL && kills < 200) {
    const award = killExperience(state.level);
    assert.ok(Number.isFinite(award) && award > 0);
    const next = addExperience(state, award);
    assert.ok(next.level >= state.level, '적 처치로 레벨이 낮아져서는 안 됨');
    state = next;
    reached.add(stageForLevel(state.level));
    kills++;
  }
  assert.equal(state.level, MAX_LEVEL);
  assert.deepEqual([...reached], [1, 2, 3, 4]);
  assert.ok(kills <= 100, `완주에 과도한 적 처치가 필요함: ${kills}`);
});
