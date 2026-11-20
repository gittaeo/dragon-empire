import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addExperience, stageForLevel, stageScale, xpToNext } from '../progression.js';
test('성장 경험치는 여러 레벨을 넘을 때 보존된다', () => {
  assert.deepEqual(addExperience({level: 1, xp: 0}, xpToNext(1) + xpToNext(2) + 7), {level: 3, xp: 7});
});
test('진화 단계는 10, 20, 30 레벨에서 바뀐다', () => {
  assert.deepEqual([1,9,10,19,20,29,30].map(stageForLevel), [1,1,2,2,3,3,4]);
  assert.deepEqual([1,10,20,30].map(stageScale), [1,1.8,3,4.5]);
});
test('최종 레벨은 30에서 멈춘다', () => {
  assert.deepEqual(addExperience({level: 29, xp: 0}, 100000), {level: 30, xp: 0});
});
