import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS, FIRE_TRAITS, SLOT_UNLOCK, skillFor, fireTrait, comboLabel} from '../skills.js';

test('skill slots unlock at their stage and stay unlocked after', () => {
  for (const path of ['flame', 'storm']) for (const [slot, need] of Object.entries(SLOT_UNLOCK)) for (let st = 1; st <= 4; st++)
    assert.equal(!!skillFor(path, slot, st), st >= need, `${path} ${slot} stage ${st}`);
  assert.equal(skillFor('', 'skill1', 3), null);
});
test('every skill has a name, kind and damage multiplier; cooldowns positive except ult', () => {
  for (const path of Object.keys(SKILLS)) for (const [slot, list] of Object.entries(SKILLS[path])) for (const s of list) {
    if (!s) continue; assert.ok(s.name && s.kind, `${path} ${slot}`); assert.ok(s.k > 0);
    if (slot !== 'ult') assert.ok(s.cd > 0);
  }
});
test('FIRE evolves: flame splash/pierce, storm chain grows with stage', () => {
  assert.ok(fireTrait('flame', 2).splash && fireTrait('flame', 3).pierce === 2 && fireTrait('flame', 4).splash.r > fireTrait('flame', 2).splash.r);
  const n = [1, 2, 3, 4].map(st => fireTrait('storm', st).chain.n); assert.deepEqual(n, [1, 2, 3, 4]);
  assert.equal(FIRE_TRAITS.flame.length, 4);
});
test('combo labels', () => {
  assert.equal(comboLabel(2, 1), ''); assert.equal(comboLabel(6, 2), '연속 처치!'); assert.equal(comboLabel(30, 3), '압도!'); assert.equal(comboLabel(30, 4), '섬멸!');
});
