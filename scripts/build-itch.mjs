// itch.io HTML5 출시 빌드 (docs/RELEASE_ITCH.md, Codex 체크리스트) — Claude 담당
// 사용: node scripts/build-itch.mjs  → dist/itch/ (폴더) + dist/dragon-empire-three-nights.zip
// - index.html에 window.DE_RELEASE = {mode: 'nights'} 주입 → 쿼리 없이 세 밤으로 바로 시작 (itch iframe이 쿼리를 보장하지 않음)
// - 런타임에 필요한 파일만 복사: 개발용(live-reload·리뷰 페이지·tests·docs·assets/pending·vendor/package) 제외
// - 이 스크립트는 업로드하지 않는다. 공개·업로드는 사용자 결정.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = path.join(root, 'dist', 'itch');
const zip = path.join(root, 'dist', 'dragon-empire-three-nights.zip');

// 1) 진입점에서 정적 import를 따라가며 JS 수집 (동적 import live-reload는 제외)
const js = new Set();
const walk = rel => {
  const norm = path.posix.normalize(rel); if (js.has(norm)) return; js.add(norm);
  const src = fs.readFileSync(path.join(root, norm), 'utf8');
  for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) walk(path.posix.join(path.posix.dirname(norm), m[1]));
  for (const m of src.matchAll(/^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(path.posix.join(path.posix.dirname(norm), m[1]));
};
walk('game.js');

// 2) 정적 파일·에셋 (매니페스트가 가리키는 approved 폴더 전체)
const listDir = dir => fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(d => d.isDirectory() ? listDir(path.posix.join(dir, d.name)) : [path.posix.join(dir, d.name)]);
const files = new Set(['index.html', 'style.css', 'assets/manifest.json', 'vendor/THREE-LICENSE.txt', ...js, ...listDir('assets/approved')]);
for (const f of files) if (/^(assets\/pending|tests|docs|vendor\/package)\//.test(f) || /live-reload|review|server\.cjs/.test(f)) { console.error('제외 대상이 포함됨: ' + f); process.exit(1); }

// 3) 복사
fs.rmSync(out, {recursive: true, force: true});
let total = 0, largest = ['', 0];
for (const f of [...files].sort()) {
  const dst = path.join(out, f); fs.mkdirSync(path.dirname(dst), {recursive: true});
  if (f === 'index.html') {
    let html = fs.readFileSync(path.join(root, f), 'utf8');
    const tag = '<script type="module" src="game.js"></script>';
    if (!html.includes(tag)) { console.error('index.html 진입 스크립트를 찾지 못함'); process.exit(1); }
    html = html.replace(tag, `<script>window.DE_RELEASE = {mode: 'nights'};</script>\n${tag}`)
      .replace(/<title>[^<]*<\/title>/, '<title>Dragon Empire · 풍향탑의 세 밤</title>');
    fs.writeFileSync(dst, html);
  } else fs.copyFileSync(path.join(root, f), dst);
  const sz = fs.statSync(dst).size; total += sz; if (sz > largest[1]) largest = [f, sz];
}
const mb = n => (n / 1048576).toFixed(2) + 'MB';
const glbs = [...files].filter(f => f.endsWith('.glb'));
const glbTotal = glbs.reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
const longest = [...files].reduce((a, f) => f.length > a.length ? f : a, '');

// 4) ZIP (Windows: PowerShell Compress-Archive)
fs.rmSync(zip, {force: true});
let zipSize = null;
try {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], {stdio: 'inherit'});
  zipSize = fs.statSync(zip).size;
} catch (e) { console.warn('ZIP 생성 실패(폴더 빌드는 완료): ' + e.message); }

// 5) itch 한도 점검 (1000개·500MB·단일 200MB·경로 240자) — 게시 직전 공식 문서 재확인 필요
const report = {files: files.size, total: mb(total), zip: zipSize ? mb(zipSize) : null, largest: `${largest[0]} ${mb(largest[1])}`, glb: `${glbs.length}개 ${mb(glbTotal)}`, longestPath: `${longest.length}자`};
const ok = files.size <= 1000 && total <= 500 * 1048576 && largest[1] <= 200 * 1048576 && longest.length <= 240;
console.log(JSON.stringify(report, null, 1));
console.log(ok ? 'itch 한도 이내' : 'itch 한도 초과 — 확인 필요');
if (!ok) process.exitCode = 1;
