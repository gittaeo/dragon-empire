// M1 first-night input bot: daytime teleports to resources/build sites; night uses
// input-pilot's synthetic keyboard/mouse events without game-state writes.
// Start server.cjs; NODE_PATH must include playwright. Set SEED; use NIGHT=1.
// First night only; collect and build using real inputs, with daytime teleport shortcuts.
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
const seed = process.env.SEED || '1', prep = 'shield', targetNight = 1, aim = process.env.AIM || 'precise', jitter = Number(process.env.AIM_JITTER || .025), bossJitter = Number(process.env.BOSS_JITTER || .3), fireGate = Number(process.env.AIM_GATE || .06), rev=process.env.GAME_REV || null;
if (!/^\d{1,10}$/.test(seed) || Number(seed) > 0xffffffff || !['shield', 'repair'].includes(prep) || ![1,2,3].includes(targetNight) || !['precise','human'].includes(aim) || !Number.isFinite(jitter) || jitter<0 || jitter>1 || !Number.isFinite(bossJitter) || bossJitter<0 || bossJitter>1 || !Number.isFinite(fireGate) || fireGate<=0 || fireGate>1) throw Error('invalid SEED, PREP, NIGHT, AIM, AIM_JITTER, BOSS_JITTER or AIM_GATE');
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1280,height:720}}), page = await context.newPage(), errors=[];
  page.on('pageerror', e => errors.push(e.message));
  try {
    // Test-only instrumentation observes launches and unique direct projectile hits.
    // It does not mutate gameplay state or count splash/skill damage as extra hits.
    if (rev) await page.route('**/nights.js', async route => {const src=execFileSync('git',['show',`${rev}:nights.js`],{cwd:path.join(__dirname,'..'),encoding:'utf8'});await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:src});});
    await page.route('**/game.js', async route => {
      let src=rev ? execFileSync('git',['show',`${rev}:game.js`],{cwd:path.join(__dirname,'..'),encoding:'utf8'}) : fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
      const replace=(a,b)=>{if(!src.includes(a))throw Error('telemetry anchor missing: '+a);src=src.replace(a,b)};
      replace('bolts.push({o: b, prev:', 'window.__shots.fired++; bolts.push({o: b, prev:');
      replace('{ damageBoss(b.dmg, b.o.position); skills.onBoltHit', '{ window.__shots.hit(b); damageBoss(b.dmg, b.o.position); skills.onBoltHit');
      replace('const at = b.o.position.clone(); damageEnemy(hit, b.dmg,', 'window.__shots.hit(b); const at = b.o.position.clone(); damageEnemy(hit, b.dmg,');
      replace('hitEnemy: (e, n) => { autoHit = true;', "hitEnemy: (e, n, source) => { if (source === 'soldier' && e.userData.hp <= n) window.__soldierKills++; autoHit = true;");
      src='window.__soldierKills=0; window.__shots={fired:0,hits:0,seen:new WeakSet(),hit(b){if(!this.seen.has(b)){this.seen.add(b);this.hits++}}};\n'+src;
      await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:src});
    });
    await page.goto(`http://127.0.0.1:4178/?mode=nights&seed=${seed}`);
    await page.waitForFunction(() => !!window.__game?.nights, null, {timeout:60000});
    await page.locator('#begin').click();
    const ids=['n1_branch0','n1_branch1','n1_branch2','n1_branch3','n1_branch4','n1_stone0','n1_stone1','n1_stone2'];
    for(const id of ids){await page.evaluate(id=>{const g=window.__game,s=g.ground.spots.find(x=>x.id===id);if(!s)throw Error('missing '+id);g.ground.human.pos.copy(s.pos)},id);await page.keyboard.press('e');await page.waitForFunction(id=>window.__game.ground.world.collected.includes(id),id,{timeout:10000});}
    const dir=await page.evaluate(()=>window.__game.nights.state.dirs[0].id);
    for(const id of ['barracks','gate_'+dir]){await page.evaluate(id=>{const g=window.__game;g.ground.human.pos.copy(g.nights.base.pad(id).pos)},id);await page.keyboard.press('e');await page.waitForFunction(id=>window.__game.nights.base.pad(id).level===1,id,{timeout:30000});}
    await page.evaluate(()=>{const g=window.__game;g.ground.human.pos.copy(g.ground.positions.tower)});await page.keyboard.press('e');await page.locator('#craftmenu [data-night]').click();
    const crafted=true, note='standard barracks+gate A; daytime teleports';
    const nights=[];
    for (let n=1;n<=targetNight;n++) {
      await page.waitForFunction(n => {const g=window.__game;return g.hud.over || (g.nights.state.phase==='night' && g.nights.state.night===n);},n,{timeout:180000});
      if (await page.evaluate(() => window.__game.hud.over)) break;
      await page.evaluate(() => {window.__m1Frames=[];window.__m1Ground={samples:0,under:0,above:0,maxOffset:0}; let prev=0; window.__m1Raf=true; const tick=t=>{if(!window.__m1Raf)return;if(prev)window.__m1Frames.push(t-prev);prev=t;const g=window.__game;for(const e of g.enemies.filter(x=>x.userData.raid?.ground)){const h=Math.max(g.terrain.heightAt(e.position.x,e.position.z),g.terrain.waterLevel),delta=e.position.y-e.userData.foot-h;if(Number.isFinite(delta)){window.__m1Ground.samples++;if(delta<-.05)window.__m1Ground.under++;if(delta>.35)window.__m1Ground.above++;window.__m1Ground.maxOffset=Math.max(window.__m1Ground.maxOffset,Math.abs(delta));}}requestAnimationFrame(tick)};requestAnimationFrame(tick);});
      const start=await page.evaluate(() => window.__game.hud.runTime);
      const startKills=await page.evaluate(() => window.__game.hud.kills), shotStart=await page.evaluate(() => ({fired:window.__shots.fired,hits:window.__shots.hits}));
      await page.evaluate(() => {window.__nightMin=window.__game.nights.state.towerHp;window.__nightMeter=setInterval(()=>{window.__nightMin=Math.min(window.__nightMin,window.__game.nights.state.towerHp)},50)});
      await page.evaluate(async ({aim,jitter,fireGate}) => {const pilot=await import('/tests/input-pilot.js');pilot.startPilot({path:'flame',aim,jitter,fireGate});},{aim,jitter,fireGate});
      await page.waitForFunction(() => {const g=window.__game;return g.hud.over || g.nights.state.phase!=='night';},null,{timeout:360000});
      const sample=await page.evaluate(async ({n,start,startKills,shotStart}) => {const g=window.__game;clearInterval(window.__nightMeter);const pilot=await import('/tests/input-pilot.js');pilot.stopPilot();return {night:n,minTower:Math.max(0,Math.min(window.__nightMin,g.nights.state.towerHp)),runMinTower:g.nights.state.stats.minTower,kills:g.hud.kills-startKills,dragonDied:g.hud.over && g.hud.hp<=0,over:g.hud.over,phase:g.nights.state.phase,nightSeconds:+(g.hud.runTime-start).toFixed(1),level:g.hud.level,blocked:g.nights.state.stats.blocked,fired:window.__shots.fired-shotStart.fired,hits:window.__shots.hits-shotStart.hits};},{n,start,startKills,shotStart});
      sample.shotsPerMinute=sample.nightSeconds ? +(sample.fired*60/sample.nightSeconds).toFixed(1) : null;
      sample.hitPercent=sample.fired ? +(sample.hits*100/sample.fired).toFixed(1) : null;
      const measurements=await page.evaluate(()=>{window.__m1Raf=false;const a=window.__m1Frames.slice().sort((x,y)=>x-y);return {ground:window.__m1Ground,frames:a.length,p95FrameMs:a.length?+a[Math.floor((a.length-1)*.95)].toFixed(2):null}});Object.assign(sample,measurements); sample.soldierKills=await page.evaluate(()=>window.__soldierKills); sample.soldierKillPercent=sample.kills ? +(100*sample.soldierKills/sample.kills).toFixed(1) : null; nights.push(sample);
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
        const start=await page.evaluate(() => window.__game.hud.runTime), bossShots=await page.evaluate(() => ({fired:window.__shots.fired,hits:window.__shots.hits}));
        await page.evaluate(({aim,jitter,fireGate}) => {
          // Synthetic input only; read targets and camera, never mutate game state.
          const g=window.__game, canvas=document.querySelector('#world');
          const mouse=(type,button,extra={}) => (type==='mousedown'?canvas:window).dispatchEvent(new MouseEvent(type,{button,bubbles:true,...extra}));
          let firing=false, lastTarget=null, since=0; mouse('mousedown',2);
          window.__bossPilot=setInterval(() => {
            const target=g.enemies.find(e=>e.userData.assault) || g.boss;
            if (!target || g.hud.over) return;
            if(target!==lastTarget){lastTarget=target;since=performance.now()}
            const cp=g.camera.position, cf=g.camera.getWorldDirection(cp.clone()), dx=target.position.x-cp.x, dy=target.position.y-cp.y, dz=target.position.z-cp.z, d=Math.hypot(dx,dy,dz)||1;
            const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
            const t=performance.now()/1000,delay=aim==='human' && performance.now()-since<450;
            const yaw=wrap(Math.atan2(-dx,-dz)-Math.atan2(-cf.x,-cf.z))+(aim==='human'?jitter*Math.sin(t*1.7):0), pitch=Math.asin(dy/d)-Math.asin(Math.max(-1,Math.min(1,cf.y)))+(aim==='human'?jitter*.82*Math.sin(t*2.1):0);
            if(!delay) mouse('mousemove',0,{movementX:Math.max(-80,Math.min(80,-yaw/.004*.5)),movementY:Math.max(-80,Math.min(80,-pitch/.003*.5))});
            const shoot=!delay && d<(aim==='human'?180:420) && Math.hypot(yaw,pitch)<(aim==='human'?fireGate:.12);
            if (shoot!==firing) {mouse(shoot?'mousedown':'mouseup',0);firing=shoot;}
            window.dispatchEvent(new KeyboardEvent(d>120?'keydown':'keyup',{code:'KeyW',bubbles:true}));
          },50);
        },{aim,jitter:bossJitter,fireGate});
        try {await page.waitForFunction(() => window.__game.hud.over,null,{timeout:300000});}
        catch { /* Preserve timeout as an incomplete result, not a victory. */ }
        boss=await page.evaluate(({start,bossShots}) => {clearInterval(window.__bossPilot);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));const g=window.__game,s=g.nights.state;return {seconds:+(g.hud.runTime-start).toFixed(1),finished:g.hud.over,won:g.hud.over && document.querySelector('#result-title').textContent.includes('지켰'),title:g.hud.over?document.querySelector('#result-title').textContent:null,minTower:s.stats.minTower,towerHp:s.towerHp,warnings:s.assault?.id||0,intercepted:s.stats.intercepted,impacts:s.stats.impacts,fired:window.__shots.fired-bossShots.fired,hits:window.__shots.hits-bossShots.hits};},{start,bossShots});
        boss.shotsPerMinute=boss.seconds ? +(boss.fired*60/boss.seconds).toFixed(1) : null;
        boss.hitPercent=boss.fired ? +(boss.hits*100/boss.fired).toFixed(1) : null;
      }
    }
    const result=await page.evaluate(() => {const g=window.__game;return {minTower:g.nights.state.stats.minTower,over:g.hud.over,phase:g.nights.state.phase,level:g.hud.level,crafted:g.nights.state.stats.crafted};});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({seed:Number(seed),rev,requested:"barracks+gateA",prepared:crafted,note,targetNight,aim,jitter,bossJitter,fireGate,nights,...result,boss,shots:await page.evaluate(()=>({fired:window.__shots.fired,hits:window.__shots.hits}))}));
  } finally {await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
