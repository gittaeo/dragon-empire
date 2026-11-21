import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, angleDiff, DIRS, NIGHT_PLAN, RECIPES_N, DAY_ITEMS, NIGHTS_TOTAL, DAY_SEC, TOWER_MAX, RAID_DAMAGE, SHIELD_CHARGES, SHIELD_R } from '../nights.js';

test('forecast covers all twelve ordered pairs of distinct directions', () => {
  const pairs = new Set();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const values = [(i + .5) / 4, (j + .5) / 3];
    const result = forecast(() => values.shift());
    assert.equal(result.length, 2);
    assert.notEqual(result[0].id, result[1].id);
    result.forEach(d => assert.ok(DIRS.includes(d)));
    pairs.add(result.map(d => d.id).join(''));
  }
  assert.equal(pairs.size, 12);
});

test('angleDiff wraps around the circle symmetrically', () => {
  for (const [a, b, expected] of [[0, 0, 0], [0, Math.PI, Math.PI], [Math.PI - .1, -Math.PI + .1, .2], [0, 4 * Math.PI + .3, .3]]) {
    assert.ok(Math.abs(angleDiff(a, b) - expected) < 1e-10);
    assert.ok(Math.abs(angleDiff(a, b) - angleDiff(b, a)) < 1e-10);
  }
});

test('night plans progress while preserving at least one raider', () => {
  let previous = null;
  for (let night = 1; night <= NIGHTS_TOTAL; night++) {
    const p = NIGHT_PLAN(night);
    assert.ok(Number.isInteger(p.waves) && p.waves > 0);
    assert.ok(Number.isInteger(p.size) && p.size > p.hunters && p.hunters >= 0);
    assert.ok(Number.isInteger(p.hunters), 'hunter count must be a non-negative integer');
    if (night === 1) assert.equal(p.hunters, 0, 'first night has no hunters');
    assert.ok(p.interval > 0 && p.speed > 0);
    if (previous) { assert.ok(p.waves > previous.waves); assert.ok(p.size > previous.size); assert.ok(p.speed > previous.speed); assert.ok(p.interval < previous.interval); }
    previous = p;
  }
});

test('preparation costs fit the materials available per day', () => {
  const daily = Object.fromEntries(DAY_ITEMS);
  for (const recipe of Object.values(RECIPES_N)) for (const [item, amount] of Object.entries(recipe.items)) {
    assert.ok(Number.isInteger(amount) && amount > 0);
    assert.ok(item in daily && amount <= daily[item]);
  }
  assert.equal(NIGHTS_TOTAL, 3);
  assert.ok(DAY_SEC > 0 && TOWER_MAX > RAID_DAMAGE && RAID_DAMAGE > 0);
  assert.ok(SHIELD_CHARGES > 0 && SHIELD_R > 0);
});
