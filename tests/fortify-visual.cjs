// Browser regression: real craft and raidStep, with test-only daytime teleports,
// raid positioning and wave-timer shortcuts. Not a human or balance playtest.
// Start server.cjs; NODE_PATH must include Playwright.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1280,height:720}}), page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.route('**/game.js',async route=>{
      const source=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
      const hook=`\nwindow.__fortTest={
        moveSpot(id){const s=gnd.spots.find(x=>x.id===id);if(!s)throw Error('missing '+id);gnd.human.pos.copy(s.pos)},
        moveBench(){gnd.human.pos.copy(gnd.positions.bench)},
        dayEnd(){nights.state.t=.01},
        prepareRaid(id){const e=enemies.find(x=>x.userData.raid?.dir.id===id);if(!e){nights.state.waveT=0;return false} e.position.copy(nights.towerPos).add(new T.Vector3(0,10,40));return true},
        finishNight(){nights.state.waveI=nights.state.plan.waves;for(const e of [...enemies])if(e.userData.nightWave)killEnemy(e)},
        smoke(){return scene.children.filter(o=>o.isSprite&&o.visible&&o.material.color.getHex()===0x3a3532).length},
        setHp(frac){nights.fort.setTowerHp(frac)},
        get state(){const f=nights.fort,s=nights.state;return {phase:s.phase,dirs:s.dirs.map(d=>d.id),shields:{...s.shields},walls:Object.fromEntries(Object.entries(f.walls).map(([id,w])=>[id,{count:w.segs.length,broken:w.segs.filter(x=>x.broken).length,visible:w.segs.filter(x=>x.group.visible).length,heights:w.segs.flatMap(x=>x.stakes.map(st=>st.position.y-st.userData.y0))}])),busy:f.busy,scaffold:!!f.scaffold,smoke:this.smoke()}}
      };`;
      await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:source+hook});
    });
    const state=()=>page.evaluate(()=>window.__fortTest.state);
    await page.goto('http://127.0.0.1:4178/?mode=nights&seed=1');
    await page.waitForFunction(()=>!!window.__fortTest);await page.locator('#begin').click();
    for(const id of ['n1_branch0','n1_stone0','n1_stone1','n1_shard0']) {await page.evaluate(id=>window.__fortTest.moveSpot(id),id);await page.keyboard.press('e');await page.waitForFunction(id=>window.__game.ground.world.collected.includes(id),id);}
    await page.evaluate(()=>window.__fortTest.moveBench());await page.keyboard.press('e');
    await page.locator('#craftmenu [data-i="1"]').click();
    const dir=(await state()).dirs[0];
    await page.waitForFunction(id=>window.__fortTest.state.walls[id]?.count===6,dir,{timeout:30000});
    await page.waitForFunction(()=>window.__fortTest.state.busy===0,null,{timeout:30000});
    let s=await state();assert.ok(s.walls[dir].heights.every(y=>Math.abs(y)<.01),'stakes finished rising');assert.equal(s.walls[dir].broken,0);
    await page.screenshot({path:path.join(os.tmpdir(),'dragon-fortify-wall.png')});
    await page.evaluate(()=>window.__fortTest.dayEnd());
    await page.waitForFunction(()=>window.__fortTest.state.phase==='night',null,{timeout:30000});
    for(let i=1;i<=6;i++) {
      let found=false;for(let j=0;j<20&&!found;j++){found=await page.evaluate(id=>window.__fortTest.prepareRaid(id),dir);if(!found)await page.waitForTimeout(100);}
      assert.ok(found,'real raid spawned on defended direction');
      await page.waitForFunction(({id,i})=>window.__fortTest.state.walls[id]?.broken===i && (window.__fortTest.state.shields[id]||0)===6-i,{id:dir,i},{timeout:15000});
    }
    s=await state();assert.equal(s.walls[dir].broken,6);
    await page.screenshot({path:path.join(os.tmpdir(),'dragon-fortify-broken.png')});
    await page.evaluate(()=>window.__fortTest.finishNight());
    await page.waitForFunction(()=>window.__fortTest.state.phase==='morning',null,{timeout:30000});
    assert.deepEqual(Object.keys((await state()).walls),[],'morning clears wall registry');
    // Separate independent day: real crafting path for repair, not a direct repair() call.
    await page.reload();await page.waitForFunction(()=>!!window.__fortTest);await page.locator('#begin').click();
    for(const id of ['n1_branch0','n1_branch1','n1_stone0']) {await page.evaluate(id=>window.__fortTest.moveSpot(id),id);await page.keyboard.press('e');await page.waitForFunction(id=>window.__game.ground.world.collected.includes(id),id);}
    await page.evaluate(()=>window.__fortTest.moveBench());await page.keyboard.press('e');await page.locator('#craftmenu [data-i="0"]').click();
    await page.waitForFunction(()=>window.__fortTest.state.scaffold,null,{timeout:30000});
    await page.screenshot({path:path.join(os.tmpdir(),'dragon-fortify-repair.png')});
    await page.waitForFunction(()=>!window.__fortTest.state.scaffold,null,{timeout:30000});
    await page.evaluate(()=>window.__fortTest.setHp(.6));await page.waitForTimeout(800);
    assert.equal((await state()).smoke,0,'no smoke at exactly 60%');
    await page.evaluate(()=>window.__fortTest.setHp(.59));
    await page.waitForFunction(()=>window.__fortTest.state.smoke>0,null,{timeout:15000});
    assert.deepEqual(errors,[]);
    console.log('PASS: craft→6 rising segments→6 real raid blocks→morning cleanup; repair scaffold lifecycle; low-HP smoke. Position and wave timing instrumented.');
  } finally {await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
