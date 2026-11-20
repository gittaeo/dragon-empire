// 개발용 자동 새로고침: 주소에 ?live=1 이 있을 때만 game.js가 불러온다.
// 소스 파일을 1.5초마다 다시 받아 내용이 바뀌면 같은 주소로 새로고침(서버 수정 불필요).
const FILES = ['index.html', 'style.css', 'game.js', 'skills.js', 'progression.js', 'touch.js', 'assets-loader.js', 'dragon-anim.js', 'assets/manifest.json'];
const seen = new Map();
async function sig(f) { const r = await fetch(f + '?t=' + Date.now(), {cache: 'no-store'}); const t = await r.text(); let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h + ':' + t.length; }
async function tick() {
  try {
    for (const f of FILES) {
      const s = await sig(f);
      if (seen.has(f) && seen.get(f) !== s) { console.info('[live] 변경 감지 → 새로고침', f); location.reload(); return; }
      seen.set(f, s);
    }
  } catch {}
  setTimeout(tick, 1500);
}
tick();
const tag = document.createElement('div');
tag.textContent = 'LIVE';
tag.style.cssText = 'position:fixed;left:50%;top:4px;transform:translateX(-50%);z-index:99;font:700 9px system-ui;letter-spacing:.2em;color:#7dffb0;background:#0008;padding:2px 8px;border-radius:8px;pointer-events:none';
document.body.append(tag);
