// Automated state-transition smoke test, not a human playthrough or balance test.
// Start server.cjs, then run: node tests/nights-play.cjs
// Requires Playwright (NODE_PATH may point at an existing installation).
// Set NIGHTS_SEED to an unsigned 32-bit decimal seed for reproducibility.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const seed = process.env.NIGHTS_SEED;
  if (seed !== undefined && (!/^\d{1,10}$/.test(seed) || Number(seed) > 0xffffffff)) throw new Error('NIGHTS_SEED must be an unsigned 32-bit decimal integer');
  const started = Date.now();
  const args = process.env.SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args});
  const context = await browser.newContext({viewport: {width: 1280, height: 720}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.route('**/game.js', async route => {
      const src = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
      const hook = `\nlet testMinTower = nights.state.towerHp;
      const testUpdate = nights.update;
      nights.update = (...args) => { const result = testUpdate(...args); testMinTower = Math.min(testMinTower, nights.state.towerHp); return result; };
      window.__nightsTest = {
        state: () => ({phase:nights.state.phase, night:nights.state.night, wave:nights.state.waveI, level, over, boss:!!boss, form:gnd.mode, busy:gnd.busy, seed:nights.state.seed, tower:nights.state.towerHp, minTower:testMinTower, runTime}),
        shortenDay: () => { nights.state.t = 0; },
        clearWave: () => { for (const e of [...enemies]) if(e.userData.nightWave) killEnemy(e); nights.state.waveT = 0; },
        land: async () => { const {PAD} = await import('/ground.js'); player.position.set(PAD.x, ground(PAD.x,PAD.z)+10, PAD.z); return gnd.tryLand(); },
        morph: () => gnd.toHuman(),
        defeatBoss: () => { if (boss) damageBoss(boss.userData.hp + 1, boss.position); }
      };`;
      await route.fulfill({status: 200, contentType: 'text/javascript; charset=utf-8', body: src + hook});
    });
    const url = new URL('http://127.0.0.1:4178/?mode=nights');
    if (seed !== undefined) url.searchParams.set('seed', seed);
    await page.goto(url.href);
    await page.waitForFunction(() => !!window.__nightsTest);
    await page.locator('#begin').click();
    for (let night = 1; night <= 3; night++) {
      await page.waitForFunction(n => { const s = window.__nightsTest.state(); return s.phase === 'day' && s.night === n; }, night, {timeout: 30000});
      await page.evaluate(() => window.__nightsTest.shortenDay());
      try { await page.waitForFunction(() => window.__nightsTest.state().phase === 'night', null, {timeout: 60000}); }
      catch (error) { console.error('Night transition state:', await page.evaluate(() => window.__nightsTest.state())); throw error; }
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const state = await page.evaluate(() => { window.__nightsTest.clearWave(); return window.__nightsTest.state(); });
        if (state.phase !== 'night') break;
        await page.waitForTimeout(100);
      }
      const after = await page.evaluate(() => window.__nightsTest.state());
      assert.notEqual(after.phase, 'night', `night ${night} did not finish`);
      if (night < 3) {
        await page.waitForFunction(() => window.__nightsTest.state().phase === 'await', null, {timeout: 30000});
        assert.equal(await page.evaluate(() => window.__nightsTest.land()), true, 'landing at pad');
        await page.waitForFunction(() => { const s = window.__nightsTest.state(); return s.form === 'landed' && !s.busy; }, null, {timeout: 30000});
        assert.equal(await page.evaluate(() => window.__nightsTest.morph()), true, 'polymorph');
      }
    }
    await page.waitForFunction(() => window.__nightsTest.state().phase === 'boss', null, {timeout: 30000});
    assert.equal((await page.evaluate(() => window.__nightsTest.state())).level, 30, 'emperor before boss');
    await page.evaluate(() => window.__nightsTest.defeatBoss());
    await page.waitForFunction(() => window.__nightsTest.state().over, null, {timeout: 30000});
    assert.match(await page.locator('#result-title').innerText(), /지켰습니다/);
    assert.deepEqual(errors, []);
    const final = await page.evaluate(() => window.__nightsTest.state());
    if (seed !== undefined) assert.equal(final.seed, Number(seed));
    console.log(`PASS seed=${final.seed} wall_seconds=${((Date.now() - started) / 1000).toFixed(1)} game_seconds=${final.runTime.toFixed(1)} min_tower_hp=${final.minTower} final_tower_hp=${final.tower} (instrumented; no balance validation)`);
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
