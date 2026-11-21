import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, angleDiff, DIRS, NIGHT_PLAN, RECIPES_N, DAY_ITEMS, NIGHTS_TOTAL, DAY_SEC, TOWER_MAX, RAID_DAMAGE, SHIELD_CHARGES, SHIELD_R, buildWaves, parseSeed, rngFor, WAVES_VERSION, RUSH_SPEED } from '../nights.js';

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

test('parseSeed accepts only unsigned 32-bit decimal strings', () => {
  for (const [input, expected] of [['0', 0], ['0001', 1], ['4294967295', 4294967295], [null, null], ['', null], ['-1', null], ['1.0', null], [' 1', null], ['4294967296', null], ['00000000000', null]]) assert.equal(parseSeed(input), expected, String(input));
});

test('seeded waves are deterministic and preserve forecast and night constraints', () => {
  const patterns = new Set();
  for (let seed = 0; seed < 2000; seed++) for (let night = 1; night <= 3; night++) {
    const dirs = forecast(rngFor(seed, night, 'forecast'));
    const args = {night, runSeed: seed, dirs};
    const result = buildWaves(args), plan = NIGHT_PLAN(night);
    assert.deepEqual(result, buildWaves(args));
    assert.equal(result.version, WAVES_VERSION);
    assert.equal(result.seed, seed);
    assert.equal(result.waves.length, plan.waves);
    patterns.add(result.pattern);
    result.waves.forEach((wave, i) => {
      assert.equal(wave.index, i);
      assert.ok(dirs.some(d => d.id === wave.dir));
      assert.equal(wave.count, plan.size);
      assert.equal(wave.hunters, plan.hunters);
      assert.ok(wave.hunters >= 0 && wave.hunters < wave.count);
      assert.ok([null, 'escort', 'rush'].includes(wave.modifier));
      assert.equal(wave.speedMultiplier, wave.modifier === 'rush' ? RUSH_SPEED : 1);
      if (wave.modifier === 'rush') assert.equal(i, plan.waves - 1);
      if (night === 1) { assert.equal(wave.hunters, 0); assert.equal(wave.modifier, null); }
    });
    if (night === 1) assert.equal(new Set(result.waves.map(w => w.dir)).size, 2);
  }
  assert.deepEqual([...patterns].sort(), ['alternate', 'focus']);
});

test('consuming forecast or spawn stream does not change the pattern stream', () => {
  for (const seed of [0, 1, 1234, 777, 0xffffffff]) for (let night = 1; night <= 3; night++) {
    const dirs = [DIRS[0], DIRS[1]], args = {night, runSeed: seed, dirs};
    const expected = buildWaves(args);
    const f = rngFor(seed, night, 'forecast'), s = rngFor(seed, night, 'spawn');
    for (let i = 0; i < 100; i++) { f(); s(); }
    assert.deepEqual(buildWaves(args), expected);
    const otherDirs = [DIRS[2], DIRS[3]];
    const changedForecast = buildWaves({...args, dirs: otherDirs});
    assert.equal(changedForecast.pattern, expected.pattern);
    assert.deepEqual(changedForecast.waves.map(({dir, ...rest}) => rest), expected.waves.map(({dir, ...rest}) => rest));
  }
});
