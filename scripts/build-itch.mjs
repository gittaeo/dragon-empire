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

// 4) ZIP — PowerShell(실행 정책 우회) → Windows tar(bsdtar) 순으로 시도. 못 만들면 빌드 실패 (Codex 출시 QA)
fs.rmSync(zip, {force: true});
// tar(bsdtar) 우선: Windows PowerShell 5.1 Compress-Archive는 ZIP 항목 경로를 '\'로 저장해 리눅스 서버(itch)에서 경로가 깨질 수 있음
// (PATH의 tar는 Git의 GNU tar일 수 있어 'D:'를 원격 호스트로 해석 → Windows 내장 bsdtar 경로를 우선 사용)
const winTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const zippers = [
  [fs.existsSync(winTar) ? winTar : 'bsdtar', ['-a', '-c', '-f', zip, ...fs.readdirSync(out)], {cwd: out}],
  ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], {}],
];
// ZIP 중앙 디렉터리의 항목 이름 (경로 구분자 검사용)
const zipNames = file => { const b = fs.readFileSync(file), names = []; for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) { let p = b.readUInt32LE(i + 16); const n = b.readUInt16LE(i + 10); for (let k = 0; k < n; k++) { const ln = b.readUInt16LE(p + 28), ex = b.readUInt16LE(p + 30), cm = b.readUInt16LE(p + 32); names.push(b.subarray(p + 46, p + 46 + ln).toString()); p += 46 + ln + ex + cm; } break; } return names; };
let zipSize = null;
for (const [cmd, args, opt] of zippers) {
  try {
    execFileSync(cmd, args, {stdio: 'pipe', ...opt});
    const names = fs.existsSync(zip) ? zipNames(zip) : [];
    const bad = names.filter(n => n.includes('\\'));
    if (!names.includes('index.html')) throw new Error('최상위 index.html 없음');
    if (bad.length) throw new Error(`역슬래시 경로 ${bad.length}개 (예: ${bad[0]})`);
    zipSize = fs.statSync(zip).size; console.log(`ZIP: ${path.basename(cmd)} · 항목 ${names.length}개`); break;
  } catch (e) { console.warn(`ZIP 실패(${path.basename(cmd)}): ${String(e.stderr || e.message).split(/\r?\n/)[0]}`); fs.rmSync(zip, {force: true}); }
}
if (!zipSize) { console.error('ZIP을 만들지 못했습니다 — 출시 산출물 불완전'); process.exitCode = 1; }

// 5) itch 한도 점검 (1000개·500MB·단일 200MB·경로 240자) — 게시 직전 공식 문서 재확인 필요
const report = {files: files.size, total: mb(total), zip: zipSize ? mb(zipSize) : null, largest: `${largest[0]} ${mb(largest[1])}`, glb: `${glbs.length}개 ${mb(glbTotal)}`, longestPath: `${longest.length}자`};
const ok = !!zipSize && files.size <= 1000 && total <= 500 * 1048576 && largest[1] <= 200 * 1048576 && longest.length <= 240;
console.log(JSON.stringify(report, null, 1));
console.log(ok ? 'itch 한도 이내' : 'itch 한도 초과 — 확인 필요');
if (!ok) process.exitCode = 1;
