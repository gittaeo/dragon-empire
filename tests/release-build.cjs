// Separate Playwright smoke test. Runs build-itch.mjs; this overwrites dist/itch and the release ZIP.
// NODE_PATH must include playwright. RELEASE_AUDIT=slow|webgl runs a diagnostic instead.
const {chromium} = require('playwright');
const {execFileSync} = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist', 'itch');
const audit = process.env.RELEASE_AUDIT || '';
if (audit && !['slow', 'webgl'].includes(audit)) throw Error('RELEASE_AUDIT must be slow or webgl');
execFileSync(process.execPath, [path.join(root, 'scripts/build-itch.mjs')], {cwd: root, stdio: 'inherit'});
const zip = path.join(root, 'dist', 'dragon-empire-three-nights.zip');
assert.ok(fs.existsSync(zip), 'release build must produce the ZIP');
// Read central-directory names directly: tar may normalize backslashes during listing.
const data = fs.readFileSync(zip); let end = -1;
for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
  if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break; }
}
assert.ok(end >= 0, 'ZIP end-of-central-directory exists');
const count = data.readUInt16LE(end + 10), entries = []; let pos = data.readUInt32LE(end + 16);
for (let i = 0; i < count; i++) {
  assert.equal(data.readUInt32LE(pos), 0x02014b50, 'ZIP central entry signature');
  const nameLen = data.readUInt16LE(pos + 28), extraLen = data.readUInt16LE(pos + 30), commentLen = data.readUInt16LE(pos + 32);
  entries.push(data.subarray(pos + 46, pos + 46 + nameLen).toString('utf8'));
  pos += 46 + nameLen + extraLen + commentLen;
}
assert.ok(entries.includes('index.html'), 'index.html is at ZIP root');
assert.ok(entries.every(name => !name.includes('\\')), 'ZIP entry names use forward slashes');
const diskFiles = dir => fs.readdirSync(path.join(dist, dir), {withFileTypes: true}).flatMap(e => e.isDirectory() ? diskFiles(path.posix.join(dir, e.name)) : [path.posix.join(dir, e.name)]);
const archiveFiles = entries.filter(name => !name.endsWith('/'));
assert.equal(new Set(archiveFiles).size, archiveFiles.length, 'ZIP has no duplicate files');
assert.deepEqual([...archiveFiles].sort(), diskFiles('').sort(), 'ZIP file names and count match release directory');
console.log(`ZIP verified: ${archiveFiles.length} files, ${entries.length - archiveFiles.length} directory entries`);
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') { res.writeHead(200, {'Content-Type': 'text/html'}); return res.end('<!doctype html><title>Embed smoke</title><iframe title="game" src="/game/index.html" style="width:1280px;height:720px;border:0"></iframe>'); }
  if (!pathname.startsWith('/game/')) { res.writeHead(404); return res.end(); }
  const target = path.resolve(dist, '.' + decodeURIComponent(pathname.slice(5)));
  if (!target.startsWith(dist + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(target, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream'}); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const flags = audit === 'webgl' ? ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: [...flags, '--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}}), failures = [], errors = [];
    page.on('requestfailed', r => failures.push(`${r.url()} ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
    page.on('pageerror', e => errors.push(e.message));
    if (audit === 'slow') await page.route('**/game/*.js', async r => { await new Promise(resolve => setTimeout(resolve, 4000)); await r.continue(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'commit'});
    const frame = page.frameLocator('iframe');
    if (audit === 'slow') {
      await frame.locator('#begin').waitFor({state: 'visible', timeout: 15000});
      await page.waitForTimeout(1000); await page.screenshot({path: path.join(os.tmpdir(), 'dragon-release-slow.png')});
      await frame.getByRole('button', {name: /첫 낮 시작/}).waitFor({state: 'visible', timeout: 90000});
      await frame.locator('#begin:enabled').waitFor({state: 'visible', timeout: 90000});
      console.log('SLOW screenshot:', path.join(os.tmpdir(), 'dragon-release-slow.png'), 'start enabled after delayed scripts');
    } else if (audit === 'webgl') {
      await page.waitForTimeout(5000); await page.screenshot({path: path.join(os.tmpdir(), 'dragon-release-webgl.png')});
      assert.match(await frame.locator('body').innerText(), /WebGL/);
      console.log('WEBGL screenshot:', path.join(os.tmpdir(), 'dragon-release-webgl.png'), 'errors:', JSON.stringify(errors));
    } else {
      await frame.getByRole('button', {name: /첫 낮 시작/}).waitFor({state: 'visible', timeout: 60000});
      assert.equal(await frame.locator('#explore-link').isVisible(), false);
      await frame.locator('#begin').click();
      const gameFrame = page.frames().find(f => f.url().includes('/game/index.html'));
      await gameFrame.waitForFunction(() => window.__game?.ground?.human);
      await gameFrame.evaluate(() => window.__game.ground.human.pos.copy(window.__game.ground.positions.tower));
      await page.keyboard.press('e');
      await frame.locator('#craftmenu [data-night]').click();
      await frame.getByText(/1번째 밤 · 습격/).waitFor({state: 'visible', timeout: 120000});
      await page.waitForTimeout(2000);
      assert.deepEqual(failures, [], 'failed HTTP or network requests');
      assert.deepEqual(errors, [], 'uncaught browser exceptions');
      console.log('PASS: same-origin iframe, start → first night; failed requests 0, page errors 0; test teleports to tower; no time skips');
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
