import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLanding, migrateWorld, loadWorld, saveWorld, emptyWorld, canAfford, pay, RECIPES, GATHER_GOAL, ZONE, SAVE_KEY} from '../ground.js';

const flat = (h = 20, extra = {}) => ({waterLevel: 10, heightAt: () => h, obstacleAt: () => ({hit: false, normal: {x: 0, y: 0, z: 0}, depth: 0, obstacle: null}), raycastObstacles: () => null, ...extra});
const memStore = () => { const m = new Map(); return {get: k => m.has(k) ? m.get(k) : null, set: (k, v) => m.set(k, String(v)), m}; };

test('landing: flat dry ground inside the zone at low altitude is ok', () => {
  const r = evaluateLanding(flat(), ZONE.x, 40, ZONE.z, 1);
  assert.equal(r.ok, true); assert.equal(r.y, 20);
});
test('landing: rejected outside zone, over water, on steep slope, too high, under an island, blocked by obstacle', () => {
  assert.equal(evaluateLanding(flat(), ZONE.x + ZONE.r + 5, 40, ZONE.z, 1).ok, false);
  assert.match(evaluateLanding(flat(5), ZONE.x, 30, ZONE.z, 1).reason, /물/);
  assert.match(evaluateLanding(flat(0, {heightAt: (x) => 20 + (x - ZONE.x) * 2}), ZONE.x, 60, ZONE.z, 1).reason, /경사/);
  assert.match(evaluateLanding(flat(), ZONE.x, 400, ZONE.z, 1).reason, /낮게/);
  assert.match(evaluateLanding(flat(20, {raycastObstacles: () => ({hit: true, fraction: .5})}), ZONE.x, 50, ZONE.z, 1).reason, /섬|아치/);
  assert.match(evaluateLanding(flat(20, {obstacleAt: () => ({hit: true, normal: {x: 1, y: 0, z: 0}, depth: 2})}), ZONE.x, 40, ZONE.z, 1).reason, /공간/);
});
test('landing: bigger dragons sample a wider area and allow higher approach', () => {
  // 중심에서 8m 떨어진 곳에 물 → 해츨링(반경 4.6)은 OK, 엠페러(반경 20.7)는 물 판정
  const terr = flat(0, {heightAt: (x, z) => Math.hypot(x - ZONE.x, z - ZONE.z) > 8 ? 5 : 20});
  assert.equal(evaluateLanding(terr, ZONE.x, 40, ZONE.z, 1).ok, true);
  assert.equal(evaluateLanding(terr, ZONE.x, 60, ZONE.z, 4.5).ok, false);
  assert.equal(evaluateLanding(flat(), ZONE.x, 20 + 100, ZONE.z, 4.5).ok, true);
});
test('save: round trip keeps progress and writes a backup of the previous save', () => {
  const s = memStore(), w = emptyWorld(); w.bag.branch = 2; w.step = 3; w.collected.push('branch0');
  saveWorld(s, w); w.step = 4; saveWorld(s, w);
  const {world, from} = loadWorld(s); assert.equal(from, SAVE_KEY); assert.equal(world.step, 4); assert.equal(world.bag.branch, 2);
  assert.equal(JSON.parse(s.get(SAVE_KEY + '.bak')).step, 3);
});
test('save: corrupt main save falls back to backup, then to defaults; coins key untouched', () => {
  const s = memStore(); s.set('dragonEmpireCoins', '777');
  s.set(SAVE_KEY, '{broken'); s.set(SAVE_KEY + '.bak', JSON.stringify({...emptyWorld(), step: 5}));
  assert.equal(loadWorld(s).world.step, 5); assert.equal(loadWorld(s).from, SAVE_KEY + '.bak');
  s.set(SAVE_KEY + '.bak', 'nope'); assert.equal(loadWorld(s).from, null); assert.equal(loadWorld(s).world.step, 0);
  assert.equal(s.get('dragonEmpireCoins'), '777');
});
test('save: migration fills missing fields and clamps bad values', () => {
  const w = migrateWorld({version: 0, form: 'swimming', step: 99, bag: {branch: 1}, collected: 'x'});
  assert.equal(w.form, 'air'); assert.equal(w.bag.stone, 0); assert.equal(w.bag.branch, 1); assert.deepEqual(w.collected, []); assert.ok(w.step <= 8);
});
test('recipes: gather goal covers workbench + kit exactly', () => {
  const bag = {...GATHER_GOAL, kit: 0};
  assert.ok(canAfford(bag, RECIPES.workbench)); pay(bag, RECIPES.workbench);
  assert.ok(canAfford(bag, RECIPES.kit)); pay(bag, RECIPES.kit);
  assert.deepEqual(bag, {branch: 0, stone: 0, shard: 0, kit: 0});
});
test('landing: rejected when the dragon body overlaps a placed prop (wind tower)', () => {
  const props = [{name: '풍향탑', x: ZONE.x + 10, z: ZONE.z, r: 2.5}];
  assert.equal(evaluateLanding(flat(), ZONE.x, 40, ZONE.z, 1, {props}).ok, true);            // 해츨링 반경 4.6 → 떨어져 있음
  assert.match(evaluateLanding(flat(), ZONE.x, 120, ZONE.z, 4.5, {props}).reason, /풍향탑/); // 엠페러 반경 20.7 → 겹침
});
