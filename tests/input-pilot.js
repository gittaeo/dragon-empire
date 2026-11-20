// 실제 입력 경로 플레이테스트 파일럿 (브라우저 콘솔/에이전트용).
// 게임 내부 함수를 직접 호출하지 않고 keydown/keyup, 마우스 좌클릭 유지, 우클릭 드래그(mousemove)
// 이벤트만 보내 비행·조준·공격한다. 게임 상태는 window.__game 에서 읽기만 한다.
// 사용: const m=await import('/tests/input-pilot.js'); m.startPilot({path:'flame'}); ... m.report()
// 주의: 사람이 손으로 조작한 것은 아니다(합성 DOM 이벤트). 창 포커스를 잃으면 게임이 일시정지된다.
const V = (x = 0, y = 0, z = 0) => ({x, y, z});
let pilot = null;

function key(code, down) {
  if (!pilot) return;
  if (!!pilot.held[code] === down) return;
  pilot.held[code] = down;
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles: true}));
}
function mouse(type, button, extra = {}) {
  const target = type === 'mousedown' ? document.querySelector('#world') : window;
  target.dispatchEvent(new MouseEvent(type, {button, bubbles: true, ...extra}));
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function startPilot({path = 'flame', engageRange = 420, standoff = 55} = {}) {
  stopPilot();
  const g = window.__game;
  pilot = {path, held: {}, firing: false, orbit: false, t0: performance.now(), samples: [], events: [],
    minClear: Infinity, minCamClear: Infinity, minCamBody: Infinity, terrainHits: 0, camUnder: 0, camInBody: 0,
    pauses: 0, frames: 0, lastLevel: 1, hpMin: 100, done: false};
  const begin = document.querySelector('#begin');
  if (!document.querySelector('#start').hidden) begin.click();
  pilot.timer = setInterval(() => tick(g, engageRange, standoff), 50);
  return pilot;
}

function tick(g, engageRange, standoff) {
  const p = pilot, h = g.hud, now = (performance.now() - p.t0) / 1000;
  if (!document.querySelector('#result').hidden) {
    if (!p.done) { p.done = true; p.events.push({t: now, ev: 'result', title: document.querySelector('#result-title').textContent, desc: document.querySelector('#result-desc').textContent, coins: h.coins}); releaseAll(); }
    return;
  }
  if (!document.querySelector('#choice').hidden) {
    releaseAll();
    p.events.push({t: now, ev: 'choice', level: h.level, kills: h.kills});
    document.querySelector(`[data-path="${p.path}"]`).click();
    return;
  }
  if (!document.querySelector('#start').hidden) { // blur/ESC 일시정지 → 재개
    releaseAll(); p.pauses++; document.querySelector('#begin').click(); return;
  }
  if (h.level !== p.lastLevel) { p.events.push({t: now, ev: 'level', level: h.level, kills: h.kills, hp: Math.round(h.hp)}); p.lastLevel = h.level; }
  if (h.finale >= 0 && !p.finaleAt) { p.finaleAt = now; p.events.push({t: now, ev: 'finale-start', kills: h.kills}); }
  p.hpMin = Math.min(p.hpMin, h.hp);

  // --- 충돌/카메라 측정 ---
  const pl = g.player.position, sc = g.player.scale.x, cam = g.camera.position, tr = g.terrain;
  const ground = (x, z) => Math.max(tr.heightAt(x, z), tr.waterLevel);
  // 날개 끝(반 날개폭 4.5m×scale)과 머리/꼬리(±4.5m×scale) 지점의 지형 관통 측정
  let minClear = Infinity; const R = 4.5 * sc, yaw = g.player.rotation.y;
  for (const [f, s] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = pl.x - Math.sin(yaw) * f * R + Math.cos(yaw) * s * R, z = pl.z - Math.cos(yaw) * f * R - Math.sin(yaw) * s * R;
    minClear = Math.min(minClear, pl.y - 1.2 * sc - ground(x, z));
  }
  p.minClear = Math.min(p.minClear, minClear); if (minClear < 0) p.terrainHits++;
  const camClear = cam.y - ground(cam.x, cam.z); p.minCamClear = Math.min(p.minCamClear, camClear); if (camClear < 0.3) p.camUnder++;
  const camBody = Math.hypot(cam.x - pl.x, cam.y - pl.y, cam.z - pl.z) / sc; p.minCamBody = Math.min(p.minCamBody, camBody); if (camBody < 3) p.camInBody++;
  p.frames++;
  if (p.frames % 20 === 0) p.samples.push({t: +now.toFixed(1), lv: h.level, hp: Math.round(h.hp), k: h.kills, y: Math.round(pl.y), clr: +minClear.toFixed(1), cam: +camClear.toFixed(1), n: g.enemies.length});

  // --- 조종: 가장 가까운 적을 향해 시점 회전(우클릭 드래그) ---
  let best = null, bd = Infinity;
  for (const e of g.enemies) { const d = Math.hypot(e.position.x - pl.x, e.position.y - pl.y, e.position.z - pl.z); if (d < bd) { bd = d; best = e; } }
  if (!p.orbit) { mouse('mousedown', 2); p.orbit = true; }
  if (best) {
    // 사람처럼 화면 십자선(카메라 정면)을 적에게 맞춘다
    const cf = g.camera.getWorldDirection(g.camera.position.clone()), cp = g.camera.position;
    const dx = best.position.x - cp.x, dy = best.position.y - cp.y, dz = best.position.z - cp.z, dc = Math.hypot(dx, dy, dz) || 1;
    const dyaw = wrap(Math.atan2(-dx, -dz) - Math.atan2(-cf.x, -cf.z)), dp = Math.asin(dy / dc) - Math.asin(Math.max(-1, Math.min(1, cf.y)));
    const mx = Math.max(-80, Math.min(80, -dyaw / .004 * .5)), my = Math.max(-80, Math.min(80, -dp / .003 * .5));
    if (Math.abs(mx) > .5 || Math.abs(my) > .5) mouse('mousemove', 0, {movementX: mx, movementY: my});
    const aimErr = Math.hypot(dyaw, dp);
    const shouldFire = bd < engageRange && aimErr < .12;
    if (shouldFire !== p.firing) { mouse(shouldFire ? 'mousedown' : 'mouseup', 0); p.firing = shouldFire; }
    key('KeyW', bd > standoff); key('KeyS', bd < standoff * .6);
  } else { key('KeyW', true); }
  // 피날레 중에는 그냥 앞으로 비행
  if (h.finale >= 0) { key('KeyW', true); key('ShiftLeft', true); }
}

function releaseAll() {
  if (!pilot) return;
  for (const c of Object.keys(pilot.held)) key(c, false);
  if (pilot.firing) { mouse('mouseup', 0); pilot.firing = false; }
  if (pilot.orbit) { mouse('mouseup', 2); pilot.orbit = false; }
}
export function stopPilot() { if (pilot) { clearInterval(pilot.timer); releaseAll(); } }
export function report() {
  if (!pilot) return null; const p = pilot, h = window.__game.hud;
  return {path: p.path, t: +((performance.now() - p.t0) / 1000).toFixed(1), level: h.level, kills: h.kills, hp: Math.round(h.hp), hpMin: Math.round(p.hpMin), pauses: p.pauses,
    minClear: +p.minClear.toFixed(2), terrainHitTicks: p.terrainHits, minCamClear: +p.minCamClear.toFixed(2), camUnderTicks: p.camUnder, minCamBodyRatio: +p.minCamBody.toFixed(2), camInBodyTicks: p.camInBody, ticks: p.frames, done: p.done, events: p.events};
}
export const samples = () => pilot?.samples;

// 활공 테스트: forwardMs 동안 W(+선택 pitch) 후 모든 입력을 놓고 sampleMs 간격으로 상태 기록
export async function glideTest({forwardMs = 2500, samples: n = 10, sampleMs = 400, divePitch = null} = {}) {
  const g = window.__game, sleep = ms => new Promise(r => setTimeout(r, ms));
  if (pilot) { clearInterval(pilot.timer); releaseAll(); } pilot = pilot || {held: {}};
  if (divePitch !== null) { mouse('mousedown', 2); for (let i = 0; i < 20; i++) { mouse('mousemove', 0, {movementY: -(divePitch - g.hud.pitch) / .003 / 4}); await sleep(30); } mouse('mouseup', 2); }
  key('KeyW', true); await sleep(forwardMs); key('KeyW', false);
  const p0 = g.player.position.clone(), out = [];
  for (let i = 0; i < n; i++) { await sleep(sampleMs); const h = g.hud; out.push({gl: h.gliding, v: +h.flySpeed.toFixed(1), y: Math.round(g.player.position.y)}); }
  return {pitch: +g.hud.pitch.toFixed(2), dist: Math.round(g.player.position.distanceTo(p0)), out};
}

// 지형 스트레스: 파일럿 자동 조종을 멈추고 target(x,z) 방향으로 최저 고도(C 유지)+가속으로 돌진.
// 매 프레임 날개끝/머리/꼬리 관통, 카메라 지하, 카메라→드래곤 시야가 지형에 막히는지, 고도 튐을 측정.
export async function terrainRun({x, z, seconds = 8, dive = true, lookPitch = -0.15} = {}) {
  const g = window.__game, tr = g.terrain, ground = (a, b) => Math.max(tr.heightAt(a, b), tr.waterLevel);
  if (pilot) { clearInterval(pilot.timer); releaseAll(); }
  pilot = pilot || {held: {}};
  mouse('mousedown', 2); pilot.orbit = true;
  const out = {frames: 0, clipFrames: 0, worstClip: 0, camUnder: 0, losBlocked: 0, maxStepY: 0, minCamDist: Infinity, scale: g.player.scale.x};
  let lastY = g.player.position.y; const t0 = performance.now();
  await new Promise(res => {
    function f() {
      const h = g.hud, pl = g.player.position, sc = g.player.scale.x, cam = g.camera.position;
      if (!h.playing || h.paused || h.over) return res();
      const wantYaw = Math.atan2(-(x - pl.x), -(z - pl.z)), dyaw = wrap(wantYaw - h.yaw), dp = lookPitch - h.pitch;
      mouse('mousemove', 0, {movementX: Math.max(-60, Math.min(60, -dyaw / .004 * .3)), movementY: Math.max(-60, Math.min(60, -dp / .003 * .3))});
      key('KeyW', true); key('ShiftLeft', true); key('KeyC', dive);
      const yaw = g.player.rotation.y, R = 4.5 * sc; let worst = 0;
      for (const [fw, s] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.5, .5], [.5, -.5]]) {
        const px = pl.x - Math.sin(yaw) * fw * R + Math.cos(yaw) * s * R, pz = pl.z - Math.cos(yaw) * fw * R - Math.sin(yaw) * s * R;
        worst = Math.min(worst, pl.y - 1.2 * sc - ground(px, pz));
      }
      if (worst < 0) { out.clipFrames++; out.worstClip = Math.min(out.worstClip, worst); }
      if (cam.y < ground(cam.x, cam.z) + .3) out.camUnder++;
      let blocked = false; for (let i = 1; i < 10; i++) { const k = i / 10, sx = cam.x + (pl.x - cam.x) * k, sy = cam.y + (pl.y - cam.y) * k, sz = cam.z + (pl.z - cam.z) * k; if (sy < ground(sx, sz)) { blocked = true; break; } }
      if (blocked) out.losBlocked++;
      out.minCamDist = Math.min(out.minCamDist, Math.hypot(cam.x - pl.x, cam.y - pl.y, cam.z - pl.z) / sc);
      out.maxStepY = Math.max(out.maxStepY, Math.abs(pl.y - lastY)); lastY = pl.y; out.frames++;
      if (performance.now() - t0 > seconds * 1000) return res();
      requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  });
  for (const c of Object.keys(pilot.held)) key(c, false);
  out.end = {x: Math.round(g.player.position.x), y: Math.round(g.player.position.y), z: Math.round(g.player.position.z), ground: Math.round(ground(g.player.position.x, g.player.position.z))};
  out.minCamDist = +out.minCamDist.toFixed(2); out.worstClip = +out.worstClip.toFixed(2); out.maxStepY = +out.maxStepY.toFixed(2);
  return out;
}
export function resumePilot(opts) { const keep = pilot; const p = startPilot(opts); if (keep?.events) { p.events = keep.events; p.t0 = keep.t0; p.samples = keep.samples; p.lastLevel = keep.lastLevel; p.hpMin = keep.hpMin; } return p; }
