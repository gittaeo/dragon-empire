// Boss-only setup uses test hooks to advance directly to finale; combat uses synthetic inputs only.
// SEED=1|1234 STRATEGY=boss|intercept; start server.cjs and configure NODE_PATH for Playwright.
const {chromium}=require('playwright'), fs=require('node:fs'), path=require('node:path');
const {execFileSync}=require('node:child_process');
const seed=process.env.SEED||'1', strategy=process.env.STRATEGY||'intercept', aim=process.env.AIM||'precise', jitter=Number(process.env.BOSS_JITTER||.3), rev=process.env.GAME_REV||null;
if (!/^\d{1,10}$/.test(seed)||Number(seed)>0xffffffff||!['boss','intercept'].includes(strategy)||!['human','precise'].includes(aim)||!Number.isFinite(jitter)||jitter<0||jitter>1) throw Error('invalid seed, strategy, aim or jitter');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  if(rev)await page.route('**/nights.js',async route=>{const src=execFileSync('git',['show',`${rev}:nights.js`],{cwd:path.join(__dirname,'..'),encoding:'utf8'});await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:src});});
  await page.route('**/game.js',async route=>{let src=rev?execFileSync('git',['show',`${rev}:game.js`],{cwd:path.join(__dirname,'..'),encoding:'utf8'}):fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');const rep=(a,b)=>{if(!src.includes(a))throw Error('telemetry anchor missing');src=src.replace(a,b)};rep('bolts.push({o: b, prev:','window.__shots.fired++; bolts.push({o: b, prev:');rep('{ damageBoss(b.dmg, b.o.position); skills.onBoltHit','{ window.__shots.hit(b); damageBoss(b.dmg, b.o.position); skills.onBoltHit');rep('const at = b.o.position.clone(); damageEnemy(hit, b.dmg,','window.__shots.hit(b); const at = b.o.position.clone(); damageEnemy(hit, b.dmg,');src='window.__shots={fired:0,hits:0,seen:new WeakSet(),hit(b){if(!this.seen.has(b)){this.seen.add(b);this.hits++}}};\n'+src+'\nwindow.__bossSetup={dragon:()=>gnd.toDragon(),takeoff:()=>gnd.takeoff(),finale:()=>nights.debug.startFinale()};';await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:src});});
  await page.goto(`http://127.0.0.1:4178/?mode=nights&seed=${seed}`);await page.waitForFunction(()=>!!window.__bossSetup);await page.locator('#begin').click();
  await page.evaluate(()=>{const g=window.__game;g.ground.human.pos.copy(g.ground.placeOnGround(50,0));if(!window.__bossSetup.dragon())throw Error('cannot transform');});
  await page.waitForFunction(()=>window.__game.ground.mode==='landed'&&!window.__game.ground.busy,null,{timeout:30000});
  await page.evaluate(()=>{if(!window.__bossSetup.takeoff())throw Error('cannot take off')});
  await page.waitForFunction(()=>window.__game.ground.mode==='air',null,{timeout:30000});
  await page.evaluate(()=>window.__bossSetup.finale());
  await page.waitForFunction(()=>window.__game.nights.state.phase==='boss',null,{timeout:60000});
  await page.evaluate(({strategy,aim,jitter})=>{
   const g=window.__game,canvas=document.querySelector('#world'), mouse=(type,button,extra={})=>(type==='mousedown'?canvas:window).dispatchEvent(new MouseEvent(type,{button,bubbles:true,...extra}));
   const s=g.nights.state;window.__bossMetrics={start:g.hud.runTime,startHp:s.towerHp,minHp:s.towerHp,maxWarningId:0,fireTicks:0};let firing=false,lastTarget=null,since=0;mouse('mousedown',2);
   window.__bossTimer=setInterval(()=>{
    const m=window.__bossMetrics,st=g.nights.state;m.minHp=Math.min(m.minHp,st.towerHp);m.maxWarningId=Math.max(m.maxWarningId,st.assault?.id||0);
    const target=(strategy==='intercept'&&g.enemies.find(e=>e.userData.assault))||g.boss;if(!target||g.hud.over)return;if(target!==lastTarget){lastTarget=target;since=performance.now()}
    const cp=g.camera.position,cf=g.camera.getWorldDirection(cp.clone()),dx=target.position.x-cp.x,dy=target.position.y-cp.y,dz=target.position.z-cp.z,d=Math.hypot(dx,dy,dz)||1;
    const t=performance.now()/1000,delay=aim==='human'&&performance.now()-since<450,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),yaw=wrap(Math.atan2(-dx,-dz)-Math.atan2(-cf.x,-cf.z))+(aim==='human'?jitter*Math.sin(t*1.7):0),pitch=Math.asin(dy/d)-Math.asin(Math.max(-1,Math.min(1,cf.y)))+(aim==='human'?jitter*.82*Math.sin(t*2.1):0);
    if(!delay)mouse('mousemove',0,{movementX:Math.max(-80,Math.min(80,-yaw/.004*.5)),movementY:Math.max(-80,Math.min(80,-pitch/.003*.5))});
    const shoot=!delay&&d<(aim==='human'?180:420)&&Math.hypot(yaw,pitch)<(aim==='human'?.06:.12);if(shoot)m.fireTicks++;if(shoot!==firing){mouse(shoot?'mousedown':'mouseup',0);firing=shoot;}
    window.dispatchEvent(new KeyboardEvent(d>120?'keydown':'keyup',{code:'KeyW',bubbles:true}));
   },50);
  },{strategy,aim,jitter});
  try {await page.waitForFunction(()=>window.__game.hud.over,null,{timeout:180000});} catch(e){if(e.name!=='TimeoutError')throw e;}
  const result=await page.evaluate(()=>{clearInterval(window.__bossTimer);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));const g=window.__game,m=window.__bossMetrics,s=g.nights.state;return {seconds:+(g.hud.runTime-m.start).toFixed(1),finished:g.hud.over,won:g.hud.over&&document.querySelector('#result-title').textContent.includes('지켰'),resultTitle:g.hud.over?document.querySelector('#result-title').textContent:null,playerHp:g.hud.hp,bossHp:g.boss?.userData.hp??null,warnings:m.maxWarningId,intercepted:s.stats.intercepted,impacts:s.stats.impacts,startHp:m.startHp,minHp:Math.min(m.minHp,s.towerHp),endHp:s.towerHp,fireTicks:m.fireTicks,fired:window.__shots.fired,hits:window.__shots.hits};});
  if(errors.length)throw Error(JSON.stringify(errors));console.log(JSON.stringify({seed:Number(seed),rev,strategy,aim,jitter,setup:'test-only finale jump',...result}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
