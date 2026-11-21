// Playwright: live interactions with test-only position/time shortcuts; not a human playtest.
// Start server.cjs and set NODE_PATH to Playwright before running this file.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']});
  const context = await browser.newContext({viewport: {width: 1280, height: 720}}), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.route('**/game.js', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
      const hook = `\nwindow.__onboardTest = {
        state: () => ({tutorial:nights.debug.tutorial, phase:nights.state.phase, time:nights.state.t, bag:{...gnd.world.bag}}),
        goSpot: id => { const s=gnd.spots.find(x=>x.id===id); if(!s) throw Error('missing spot '+id); gnd.human.pos.copy(s.pos); },
        goTower: () => gnd.human.pos.copy(gnd.positions.tower),
        goWall: () => gnd.human.pos.copy(nights.base.pads.find(p => p.type === "wall").pos),
        lose: () => nights.debug.lose('test')
      };`;
      await route.fulfill({status: 200, contentType: 'text/javascript; charset=utf-8', body: source + hook});
    });
    const state = () => page.evaluate(() => window.__onboardTest.state());
    const waitStep = n => page.waitForFunction(n => window.__onboardTest.state().tutorial.step === n, n, {timeout: 30000});
    await page.goto('http://127.0.0.1:4178/?mode=nights&seed=1');
    await page.waitForFunction(() => !!window.__onboardTest);
    await page.locator('#begin').click();
    await waitStep(1);
    assert.match((await state()).tutorial.text, /재료/);
    for (const [id, step] of [['n1_branch0', 2], ['n1_branch1', 2], ['n1_stone0', 3]]) {
      await page.evaluate(id => window.__onboardTest.goSpot(id), id);
      await page.keyboard.press('e'); await waitStep(step);
    }
    await page.evaluate(() => window.__onboardTest.goWall());
    await page.keyboard.press('e'); await waitStep(4);
    await page.evaluate(() => window.__onboardTest.goTower());
    await page.keyboard.press('e');
    await page.locator('#craftmenu [data-night]').click(); await waitStep(6);
    await waitStep(7);
    await page.evaluate(() => window.__onboardTest.lose());
    await page.locator('#restart').click();
    await page.waitForFunction(() => !!window.__onboardTest);
    await page.locator('#begin').click(); await waitStep(1);
    await page.evaluate(() => window.__onboardTest.goTower());
    await page.keyboard.press('e');
    await page.locator('#craftmenu [data-night]').click(); await waitStep(6);
    assert.equal((await state()).phase, 'dusk', 'player can start night without gathering');
    await waitStep(7);
    assert.deepEqual(errors, []);
    console.log('PASS: 1→2→3→4→6→7; restart→1 and manual night start without gathering; test teleports');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
