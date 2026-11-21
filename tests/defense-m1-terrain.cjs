// M1 terrain reconnaissance only: samples straight proposed lanes, not live knight paths.
// node tests/defense-m1-terrain.cjs; requires Playwright and local server :4178.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:4178/?mode=nights&seed=1');
    await page.waitForFunction(() => window.__game?.terrain && window.__game?.nights?.towerPos, null, {timeout:60000});
    const result = await page.evaluate(() => {
      const {terrain,nights}=window.__game, t=nights.towerPos, out=[];
      for (const [id,dx,dz] of [['n',0,-1],['e',1,0],['s',0,1],['w',-1,0]]) {
        let previous=null, steep=0, underWater=0, maxSlope=0, worst=null;
        for(let r=9;r<=150;r++) {
          const x=t.x+dx*r,z=t.z+dz*r,h=terrain.heightAt(x,z);
          if(!Number.isFinite(h)) throw Error(`nonfinite terrain ${id} ${r}`);
          if(h<terrain.waterLevel) underWater++;
          if(previous!==null){const slope=Math.atan(Math.abs(h-previous))*180/Math.PI;if(slope>25)steep++;if(slope>maxSlope){maxSlope=slope;worst=r}}
          previous=h;
        }
        out.push({direction:id, samples:142, steepSegments:steep, submergedSamples:underWater, maxSlopeDegrees:+maxSlope.toFixed(2), worstRadius:worst});
      }
      return out;
    });
    assert.deepEqual(errors,[],'browser exceptions');
    console.table(result);
    console.log('RECONNAISSANCE ONLY: terrain samples on proposed straight centerlines, not live paths, collision or actor ground adherence; >25° and water are reported, not passed.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
