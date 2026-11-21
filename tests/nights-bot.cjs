// First-night input bot: daytime only teleports to resources/bench; night uses
// input-pilot's synthetic keyboard/mouse events without game-state writes.
// Start server.cjs; NODE_PATH must include playwright. Optional SEED, PREP=shield|repair, NIGHT=1|2|3.
// NIGHT>1 plays all earlier nights and teleports to the landing pad in morning.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const seed = process.env.SEED || '1', prep = process.env.PREP || 'shield', targetNight = Number(process.env.NIGHT || 1), aim = process.env.AIM || 'precise';
if (!/^\d{1,10}$/.test(seed) || Number(seed) > 0xffffffff || !['shield', 'repair'].includes(prep) || ![1,2,3].includes(targetNight) || !['precise','human'].includes(aim)) throw Error('invalid SEED, PREP, NIGHT or AIM');
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
    const nights=[];
    for (let n=1;n<=targetNight;n++) {
      await page.waitForFunction(n => {const g=window.__game;return g.hud.over || (g.nights.state.phase==='night' && g.nights.state.night===n);},n,{timeout:180000});
      if (await page.evaluate(() => window.__game.hud.over)) break;
      const start=await page.evaluate(() => window.__game.hud.runTime);
      const startKills=await page.evaluate(() => window.__game.hud.kills);
      await page.evaluate(() => {window.__nightMin=window.__game.nights.state.towerHp;window.__nightMeter=setInterval(()=>{window.__nightMin=Math.min(window.__nightMin,window.__game.nights.state.towerHp)},50)});
      await page.evaluate(async aim => {const pilot=await import('/tests/input-pilot.js');pilot.startPilot({path:'flame',aim});},aim);
      await page.waitForFunction(() => {const g=window.__game;return g.hud.over || g.nights.state.phase!=='night';},null,{timeout:360000});
      const sample=await page.evaluate(async ({n,start,startKills}) => {const g=window.__game;clearInterval(window.__nightMeter);const pilot=await import('/tests/input-pilot.js');pilot.stopPilot();return {night:n,minTower:Math.min(window.__nightMin,g.nights.state.towerHp),runMinTower:g.nights.state.stats.minTower,kills:g.hud.kills-startKills,dragonDied:g.hud.over && g.hud.hp<=0,over:g.hud.over,phase:g.nights.state.phase,nightSeconds:+(g.hud.runTime-start).toFixed(1),level:g.hud.level,blocked:g.nights.state.stats.blocked};},{n,start,startKills});
      nights.push(sample);
      console.log('NIGHT',JSON.stringify(sample));
      if (sample.over || n===targetNight) break;
      await page.waitForFunction(() => window.__game.hud.over || window.__game.nights.state.phase==='await',null,{timeout:60000});
      if (await page.evaluate(() => window.__game.hud.over)) break;
      // Morning position shortcut only; landing and polymorph use their actual input path.
      await page.evaluate(async () => {const g=window.__game;const {PAD}=await import('/ground.js');g.player.position.set(PAD.x,g.terrain.heightAt(PAD.x,PAD.z)+10,PAD.z);});
      await page.keyboard.press('g');
      await page.waitForFunction(() => window.__game.ground.mode==='landed' && !window.__game.ground.busy,null,{timeout:30000});
      await page.keyboard.press('h');
      await page.waitForFunction(() => window.__game.ground.mode==='human' && window.__game.nights.state.phase==='day',null,{timeout:30000});
      // Subsequent days: no extra crafting, so this measures carry-over risk.
    }
    let boss = null;
    if (targetNight === 3 && !await page.evaluate(() => window.__game.hud.over)) {
      await page.waitForFunction(() => window.__game.hud.over || window.__game.nights.state.phase==='boss',null,{timeout:60000});
      if (!await page.evaluate(() => window.__game.hud.over)) {
        const start=await page.evaluate(() => window.__game.hud.runTime);
        await page.evaluate(() => {
          // Synthetic input only; read targets and camera, never mutate game state.
          const g=window.__game, canvas=document.querySelector('#world');
          const mouse=(type,button,extra={}) => (type==='mousedown'?canvas:window).dispatchEvent(new MouseEvent(type,{button,bubbles:true,...extra}));
          let firing=false; mouse('mousedown',2);
          window.__bossPilot=setInterval(() => {
            const target=g.enemies.find(e=>e.userData.assault) || g.boss;
            if (!target || g.hud.over) return;
            const cp=g.camera.position, cf=g.camera.getWorldDirection(cp.clone()), dx=target.position.x-cp.x, dy=target.position.y-cp.y, dz=target.position.z-cp.z, d=Math.hypot(dx,dy,dz)||1;
            const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
            const yaw=wrap(Math.atan2(-dx,-dz)-Math.atan2(-cf.x,-cf.z)), pitch=Math.asin(dy/d)-Math.asin(Math.max(-1,Math.min(1,cf.y)));
            mouse('mousemove',0,{movementX:Math.max(-80,Math.min(80,-yaw/.004*.5)),movementY:Math.max(-80,Math.min(80,-pitch/.003*.5))});
            const shoot=d<420 && Math.hypot(yaw,pitch)<.12;
            if (shoot!==firing) {mouse(shoot?'mousedown':'mouseup',0);firing=shoot;}
            window.dispatchEvent(new KeyboardEvent(d>120?'keydown':'keyup',{code:'KeyW',bubbles:true}));
          },50);
        });
        try {await page.waitForFunction(() => window.__game.hud.over,null,{timeout:300000});}
        catch { /* Preserve timeout as an incomplete result, not a victory. */ }
        boss=await page.evaluate(start => {clearInterval(window.__bossPilot);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));const g=window.__game;return {seconds:+(g.hud.runTime-start).toFixed(1),finished:g.hud.over,won:g.hud.over && document.querySelector('#result-title').textContent.includes('지켰'),minTower:g.nights.state.stats.minTower,intercepted:g.nights.state.stats.intercepted,impacts:g.nights.state.stats.impacts};},start);
      }
    }
    const result=await page.evaluate(() => {const g=window.__game;return {minTower:g.nights.state.stats.minTower,over:g.hud.over,phase:g.nights.state.phase,level:g.hud.level,crafted:g.nights.state.stats.crafted};});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({seed:Number(seed),requested:prep,prepared:crafted,note,targetNight,aim,nights,...result,boss}));
  } finally {await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
