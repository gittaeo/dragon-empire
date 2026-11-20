// Test-only instrumentation is appended to the served module; game.js is never changed.
// Run while `node server.cjs` is running, with Playwright in NODE_PATH.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
 try {
  for(const routeName of ['flame','storm']){
   const context=await browser.newContext({viewport:{width:1280,height:720}});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/game.js',async route=>{
    const src=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
    const instrument=`\nwindow.__testRun={kill(){if(!enemies.length)spawnEnemy(spawnIndex++);killEnemy(enemies[0])},get state(){return {level,xp,kills,path,paused,over,finale,coins}},finishSoon(){if(finale>=0)finale=.001}};`;
    await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:src+instrument});
   });
   await page.goto('http://127.0.0.1:4178/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>Boolean(window.__testRun),null,{timeout:30000});
   await page.evaluate(()=>localStorage.removeItem('dragonEmpireCoins'));
   await page.locator('#begin').click();
   await page.evaluate(()=>{while(window.__testRun.state.level<10)window.__testRun.kill()});
   assert.equal(await page.locator('#choice').isVisible(),true,'진화 선택 화면');
   await page.locator(`[data-path="${routeName}"]`).click();
   let state=await page.evaluate(()=>window.__testRun.state);
   assert.equal(state.path,routeName);assert.equal(state.paused,false);
   await page.evaluate(()=>{while(window.__testRun.state.level<30)window.__testRun.kill();window.__testRun.finishSoon()});
   await page.waitForFunction(()=>window.__testRun.state.over,null,{timeout:15000});
   state=await page.evaluate(()=>window.__testRun.state);
   assert.equal(state.level,30);assert.equal(state.coins,100+state.kills*5);
   assert.match(await page.locator('#result-title').innerText(),/드래곤 엠페러/);
   assert.equal(Number(await page.evaluate(()=>localStorage.getItem('dragonEmpireCoins'))),state.coins);
   await page.reload();await page.waitForFunction(()=>Boolean(window.__testRun),null,{timeout:30000});
   assert.equal(Number(await page.locator('#coins').innerText()),state.coins,'새로고침 후 보상 보존');
   assert.deepEqual(errors,[],'브라우저 예외');
   console.log(`${routeName}: level ${state.level}, kills ${state.kills}, coins ${state.coins}, 재접속 유지`);
   await context.close();
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
