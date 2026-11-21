// First-night input bot: daytime only teleports to resources/bench; night uses
// input-pilot's synthetic keyboard/mouse events without game-state writes.
// Start server.cjs; NODE_PATH must include playwright. Optional SEED, PREP=shield|repair.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const seed = process.env.SEED || '1', prep = process.env.PREP || 'shield';
if (!/^\d{1,10}$/.test(seed) || Number(seed) > 0xffffffff || !['shield', 'repair'].includes(prep)) throw Error('invalid SEED or PREP');
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1280,height:720}}), page = await context.newPage(), errors=[];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:4178/?mode=nights&seed=${seed}`);
    await page.waitForFunction(() => !!window.__game?.nights, null, {timeout:60000});
    await page.locator('#begin').click();
    const ids = prep === 'shield' ? ['n1_branch0','n1_stone0','n1_stone1','n1_shard0'] : ['n1_branch0','n1_branch1','n1_stone0'];
    for (const id of ids) {
      await page.evaluate(id => { const g=window.__game; if(g.nights.state.phase!=='day') throw Error('teleport only allowed during day'); const s=g.ground.spots.find(x=>x.id===id); if(!s) throw Error('missing '+id); g.ground.human.pos.copy(s.pos); }, id);
      await page.keyboard.press('e');
      await page.waitForFunction(id => window.__game.ground.world.collected.includes(id), id, {timeout:10000});
    }
    await page.evaluate(() => {const g=window.__game;if(g.nights.state.phase!=='day') throw Error('day expired');g.ground.human.pos.copy(g.ground.positions.bench)});
    await page.keyboard.press('e');
    await page.locator('#craftmenu').waitFor({state:'visible'});
    const button=page.locator(prep==='shield' ? '#craftmenu [data-i="1"]' : '#craftmenu [data-i="0"]');
    let crafted=false, note='';
    if(await button.isEnabled()) {await button.click();crafted=true;} else { note='repair unavailable at full tower HP'; await page.locator('#craftmenu [data-x]').click(); }
    await page.waitForFunction(() => window.__game.nights.state.phase==='night',null,{timeout:120000});
    const start=await page.evaluate(() => window.__game.hud.runTime);
    await page.evaluate(async () => {const pilot=await import('/tests/input-pilot.js');pilot.startPilot({path:'flame'});});
    await page.waitForFunction(() => {const g=window.__game;return g.hud.over || g.nights.state.phase!=='night';},null,{timeout:300000});
    const result=await page.evaluate(async start => {const g=window.__game;const pilot=await import('/tests/input-pilot.js');pilot.stopPilot();return {minTower:g.nights.state.stats.minTower,kills:g.hud.kills,dragonDied:g.hud.over && g.hud.hp<=0,over:g.hud.over,phase:g.nights.state.phase,nightSeconds:+(g.hud.runTime-start).toFixed(1),blocked:g.nights.state.stats.blocked,crafted:g.nights.state.stats.crafted};},start);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({seed:Number(seed),requested:prep,prepared:crafted,note,...result}));
  } finally {await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
