// M1 daytime build smoke. Test-only teleport; real E interactions and game state.
const {chromium}=require('playwright'); const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try { await page.goto('http://127.0.0.1:4178/?mode=nights&seed=1');await page.waitForFunction(()=>window.__game?.nights);await page.locator('#begin').click();
const state=()=>page.evaluate(()=>{const g=window.__game,s=g.nights.state;return {bag:{...g.ground.world.bag},residents:s.residents,workers:s.workers,cap:s.soldierCap,soldiers:g.nights.army.soldiers.length,barracks:g.nights.base.pad('barracks').level}});
const move=async id=>page.evaluate(id=>{const g=window.__game;g.ground.human.pos.copy(g.nights.base.pad(id).pos)},id);
let initial=await state();assert.equal(initial.residents,2);assert.equal(initial.soldiers,0);await move('barracks');await page.keyboard.press('e');await page.waitForTimeout(500);assert.deepEqual(await state(),initial,'insufficient resources leave state intact');
for(const id of ['n1_branch0','n1_branch1','n1_branch2','n1_branch3','n1_branch4','n1_stone0','n1_stone1','n1_stone2']){await page.evaluate(id=>{const g=window.__game;g.ground.human.pos.copy(g.ground.spots.find(s=>s.id===id).pos)},id);await page.keyboard.press('e');await page.waitForFunction(id=>window.__game.ground.world.collected.includes(id),id);}
const before=await state();await move('barracks');await page.keyboard.press('e');await page.waitForFunction(()=>window.__game.nights.base.pad('barracks').level===1,null,{timeout:30000});const after=await state();assert.equal(before.bag.branch-after.bag.branch,3);assert.equal(before.bag.stone-after.bag.stone,2);assert.equal(after.soldiers,Math.min(after.residents,after.cap));assert.equal(after.soldiers,2);assert.equal(after.workers,0);
assert.deepEqual(errors,[]); console.log('PASS: insufficient resources preserve state; barracks cost 3/2; two residents become two soldiers; test teleports');
} finally {await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
