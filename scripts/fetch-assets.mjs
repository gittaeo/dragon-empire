// Higgsfield 에셋 다운로드: node scripts/fetch-assets.mjs  (Node 18+)
// assets/remote-assets.json 의 URL을 assets/<path> 로 받는다. 이미 있으면 건너뜀.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const { assets } = JSON.parse(await readFile(join(root, 'remote-assets.json'), 'utf8'));
let ok = 0, skip = 0, fail = 0;
for (const a of assets) {
  const out = join(root, a.path);
  try { await access(out); skip++; continue; } catch {}
  try {
    const r = await fetch(a.url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(await r.arrayBuffer()));
    ok++; console.log('✓', a.id, '→', a.path);
  } catch (e) { fail++; console.warn('✗', a.id, e.message); }
}
console.log(`done: ${ok} downloaded, ${skip} skipped, ${fail} failed`);
if (fail) process.exitCode = 1;
