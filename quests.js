// 임무 실행기 (데이터 기반) + 웜 진화 '회피 시험'. 2단계 임무는 docs/MISSION_02.md(Codex 초안, 사용자 승인 2026-11-21).
// 단계 종류: talk(npc 대화) · gather(재료 확보) · craft(작업대 제작) · install(풍향탑 설치) · markers(하늘 표식 통과) · clear(임무 적 무리 정리)
// 땅 단계는 풍향탑 공터(ground.js)에서만, 하늘 단계는 용의 모습일 때만 진행. 진행 상태는 growth.quests(슬롯 저장).
import * as T from './vendor/three.module.js';
import {SITES} from './growth.js';

const S = t => ({who: '세라', text: t}), I = t => ({who: '이안', text: t}), P = t => ({who: '주인공', text: t});
const site = id => SITES.find(x => x.id === id);
export const M2 = [
  {id: 'm2_fog', title: '안개 속 신호', steps: [
    {t: 'talk', npc: 'sera', hud: '세라와 이야기', lines: [S('탑이 세 번 깜빡였어. 안개 섬부터 봐 줄래?'), S('렌즈를 만들면 안개 속 불빛도 구별돼.')]},
    {t: 'gather', hud: '렌즈 재료 모으기', items: {branch: 1, stone: 1, shard: 1}},
    {t: 'craft', hud: '신호 렌즈 제작', item: 'm2_signal_lens', name: '신호 렌즈', recipe: {branch: 1, stone: 1, shard: 1}, reward: ['craft', 'm2_signal_lens', 60]},
    {t: 'markers', hud: '안개 섬 신호 조사', points: [['arch', 1, 0], ['isle_mid', -1, 0], ['isle_mid', 1, 1]]},
    {t: 'clear', hud: '안개 섬 순찰 정리', at: 'isle_mid', count: 6, reward: ['discovery', 'm2_fog_route', 100]},
    {t: 'talk', npc: 'ian', hud: '인간형으로 보고', lines: [I('난 이안. 예전엔 이 항로의 불빛을 읽었어.'), I('네가 본 간격은 내 송신표와 달라.')], reward: ['quest', 'm2_fog_report', 140]},
  ]},
  {id: 'm2_chain', title: '둘로 갈린 불빛', steps: [
    {t: 'talk', npc: 'ian', hud: '이안의 송신표 확인', lines: [I('서쪽 탑에서 첫 점멸을 봐. 다음은 사슬 섬이야.'), I('등불이 깜빡이면 띠 밖으로 빠져.')]},
    {t: 'markers', hud: '감시탑·사슬 섬 조사', points: [['tower_w', 1, 0], ['isle_s', -1, 0], ['isle_s', 1, 1]]},
    {t: 'clear', hud: '사슬 섬 경비 정리', at: 'isle_s', count: 6, reward: ['discovery', 'm2_chain_route', 100]},
    {t: 'gather', hud: '개량 재료 모으기', items: {branch: 1, stone: 2}},
    {t: 'craft', hud: '렌즈 개량', item: 'm2_wind_lens', name: '바람맞춤 렌즈', recipe: {branch: 1, stone: 2, m2_signal_lens: 1}, reward: ['craft', 'm2_wind_lens', 60], lines: [S('떨리는 렌즈는 돌로 받치면 돼.')]},
    {t: 'talk', npc: 'ian', hud: '이안에게 보고', lines: [I('남은 불빛 둘은 쌍둥이 섬에서 보여.')], reward: ['quest', 'm2_chain_report', 160]},
  ]},
  {id: 'm2_twin', title: '바람길을 다시 잇다', steps: [
    {t: 'talk', npc: 'sera', hud: '세라에게 렌즈 보이기', lines: [S('섬 둘의 불빛을 같은 렌즈로 봐 줘.')]},
    {t: 'markers', hud: '쌍둥이 섬 표식 확인', points: [['isle_e', -1, 0], ['isle_e', 1, 1]]},
    {t: 'clear', hud: '마지막 호위대 정리', at: 'isle_e', count: 6, reward: ['discovery', 'm2_twin_route', 100]},
    {t: 'markers', hud: '아치 곁으로 귀환', points: [['arch', -1, 1]]},
    {t: 'install', hud: '인간형으로 렌즈 설치', item: 'm2_wind_lens', lines: [S('렌즈를 조금 왼쪽으로. 그래, 거기야.')]},
    {t: 'talk', npc: 'ian', hud: '이안과 신호 맞추기', lines: [I('탑의 불빛이 두 섬에 닿았어. 이제 길을 읽을 수 있어.'), I('사슬 섬에서 그 띠를 다시 만날 거야. 피한 뒤 핵을 노려.')], reward: ['quest', 'm2_twin_report', 180]},
  ]},
];
export const TRIAL_WYRM = {site: 'isle_s', limit: 90, hitsToFail: 3, telegraph: 1.5, fire: .8, core: 4, patterns: ['h', 'v', 'x'], name: '회피 시험'};

export function createQuests(ctx) {
  const {scene, terrain, player, gnd} = ctx, v = new T.Vector3(), w = new T.Vector3();
  const st = () => { const g = ctx.growth(); return g.quests ||= {m: 0, s: 0, n: 0}; };
  const cur = () => { const q = st(); return M2[q.m] ? M2[q.m].steps[q.s] : null; };
  const started = () => gnd.world.step >= 8 && ctx.growth().trials.drake && ctx.stage() >= 2;
  const allDone = () => st().m >= M2.length;

  // ---------- 하늘 표식 (장애물 밖에 놓음) ----------
  const rings = []; let ringKey = '';
  function markerPos([id, side, up]) {
    const s = site(id), ang = Math.atan2(s.x - (-116.5), s.z - 1410) + Math.PI / 2; // 공터에서 본 측면
    const p = new T.Vector3(s.x + Math.sin(ang) * side * s.r * .85, s.y + 40 + 50 * up, s.z + Math.cos(ang) * side * s.r * .85);
    p.y = Math.max(p.y, Math.max(terrain.heightAt(p.x, p.z), terrain.waterLevel) + 45);
    for (let i = 0; i < 30 && terrain.obstacleAt && terrain.obstacleAt(p.x, p.y, p.z, 18).hit; i++) p.y += 15;
    return p;
  }
  function syncRings() {
    const c = cur(), key = c && c.t === 'markers' ? st().m + ':' + st().s : '';
    if (key === ringKey) return; ringKey = key;
    for (const r of rings) scene.remove(r); rings.length = 0;
    if (!key) return;
    for (const pt of c.points) { const m = new T.Mesh(new T.TorusGeometry(14, 1, 10, 40), new T.MeshBasicMaterial({color: 0x7fe0ff, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false})); m.position.copy(markerPos(pt)); m.lookAt(player.position); scene.add(m); rings.push(m); }
  }

  // ---------- 임무 적 무리 ----------
  let spawnedFor = '';
  function ensureGroup(c) {
    const key = st().m + ':' + st().s; if (spawnedFor === key) return;
    const s = site(c.at); if (player.position.distanceTo(v.set(s.x, s.y, s.z)) > s.r + 450) return; // 가까이 오면 배치
    const left = c.count - st().n;
    for (let i = 0; i < left; i++) {
      const a = i / Math.max(1, left) * Math.PI * 2, x = s.x + Math.cos(a) * (s.r * .7), z = s.z + Math.sin(a) * (s.r * .7);
      const y = Math.max(s.y + 30, Math.max(terrain.heightAt(x, z), terrain.waterLevel) + 40);
      const e = ctx.makeEnemy(x, y, z, i % 3 === 2 ? 'knight' : 'rider'); e.userData.questTag = key;
    }
    spawnedFor = key; ctx.banner(c.hud, `임무 적 ${left}마리`, 1.6);
  }

  // ---------- 진행 ----------
  function reward(c) { if (!c.reward) return; const [src, key, amt] = c.reward; const a = ctx.oneTime(src + '_' + key, amt); if (a) ctx.gainXp(a, src, c.hud); }
  function advance() {
    const c = cur(); reward(c); const q = st(); q.s++; q.n = 0;
    if (q.s >= M2[q.m].steps.length) { ctx.banner('임무 완료 · ' + M2[q.m].title, q.m + 1 < M2.length ? '다음 임무: ' + M2[q.m + 1].title : '회피 시험이 열립니다', 3); q.m++; q.s = 0; ctx.sfx?.('coronation'); }
    ctx.markProgress(true); setupStep();
  }
  // 이안 (임무 2 시작 후 공터에 등장)
  let ian = null;
  function setupStep() {
    if (!started()) return;
    if (!ian) {
      ian = gnd.makePerson(0x5a4a2a, 0xd8b090, 0x2a2a2a); const p = gnd.placeOnGround(4, -12); ian.position.copy(p);
      gnd.addInteract({id: 'ian', pos: p, label: 'E — 이안과 대화', onUse: () => talkTo('ian')});
    }
    const c = cur(); if (!c) return;
    if (c.t === 'gather') { const q = st(); let k = 0; for (const [type, n] of Object.entries(c.items)) for (let i = 0; i <= n; i++) gnd.addGather(`${M2[q.m].id}_${type}${i}`, type, 22 * Math.cos(k * 1.3 + q.m) + (k % 2 ? 6 : -6), 22 * Math.sin(k++ * 1.3 + q.m)); }
  }
  function talkTo(npc) {
    const c = cur();
    if (c && c.t === 'talk' && c.npc === npc) { gnd.say(c.lines, advance); return true; }
    if (npc === 'ian') { gnd.say([I(allDone() ? '사슬 섬의 띠를 피한 뒤, 드러난 핵을 노려.' : '항로 기록을 맞춰 보는 중이야.')]); return true; }
    return false;
  }
  function onInteract(kind) {
    if (!started()) return false;
    const c = cur(), bag = gnd.world.bag;
    if (kind === 'sera') return talkTo('sera');
    if (!c) return false;
    if (kind === 'bench' && c.t === 'craft') {
      const miss = Object.entries(c.recipe).filter(([k, n]) => (bag[k] || 0) < n);
      if (miss.length) { ctx.banner('재료 부족', `${c.name}: ` + Object.entries(c.recipe).map(([k, n]) => `${ITEM[k] || k} ${n}`).join(' · '), 1.8); return true; }
      for (const [k, n] of Object.entries(c.recipe)) bag[k] -= n; bag[c.item] = (bag[c.item] || 0) + 1;
      ctx.burst(gnd.positions.bench.clone().add(v.set(0, 1.2, 0)), 0x9ff0ff, 40, 6, .5); ctx.sfx?.('levelup');
      if (c.lines) gnd.say(c.lines, advance); else advance(); gnd.save(); return true;
    }
    if (kind === 'tower' && c.t === 'install') {
      if (!(bag[c.item] > 0)) { ctx.banner('렌즈가 필요합니다', '작업대에서 바람맞춤 렌즈를 만드세요', 1.6); return true; }
      bag[c.item]--; ctx.burst(gnd.positions.tower.clone().add(v.set(0, 7.5, 0)), 0x9ff0ff, 80, 14, 1); ctx.sfx?.('skill_shield');
      gnd.say(c.lines, advance); gnd.save(); return true;
    }
    return false;
  }
  const ITEM = {branch: '나뭇가지', stone: '돌', shard: '숨결 파편', m2_signal_lens: '신호 렌즈', m2_wind_lens: '바람맞춤 렌즈'};
  function promptFor(kind) {
    if (!started()) return null; const c = cur();
    if (kind === 'sera' && c && c.t === 'talk' && c.npc === 'sera') return 'E — 세라와 대화 (임무)';
    if (kind === 'bench' && c && c.t === 'craft') return `E — ${c.name} 만들기 (` + Object.entries(c.recipe).map(([k, n]) => `${ITEM[k]} ${n}`).join(' · ') + ')';
    if (kind === 'tower' && c && c.t === 'install') return 'E — 바람맞춤 렌즈 설치';
    return null;
  }
  function onKill(e) { const t = e.userData.questTag; if (!t || t !== st().m + ':' + st().s) return; const c = cur(); st().n++; if (st().n >= c.count) advance(); else ctx.banner(c.hud, `${st().n} / ${c.count}`, .8); }

  // ---------- 웜 진화 '회피 시험' ----------
  const TR = {state: 'idle', t: 0, hits: 0, solved: new Set(), pi: 0, phase: '', pt: 0, band: null, core: null, coreHit: false, start: null, startRing: null};
  function trialAvailable() { const g = ctx.growth(); return allDone() && !g.trials.wyrm && ctx.level() === 19 && ctx.xp() >= ctx.xpToNext(19); }
  const bandMat = new T.MeshBasicMaterial({color: 0xff4a1a, transparent: true, opacity: .18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide});
  function makeBand(kind, origin, dir) {
    const g = new T.Group(), s = ctx.scale(), thick = 9 + 3 * s, L = 320, W = 140;
    const mk = (w, h) => { const m = new T.Mesh(new T.BoxGeometry(w, h, L), bandMat.clone()); g.add(m); return m; };
    if (kind === 'h' || kind === 'x') mk(W, thick); if (kind === 'v' || kind === 'x') mk(thick, W);
    g.position.copy(origin); g.lookAt(w.copy(origin).add(dir)); scene.add(g); g.userData = {kind, thick, W, L}; return g;
  }
  function inBand(b, p) {
    const local = b.worldToLocal(p.clone()), {kind, thick, W, L} = b.userData; if (Math.abs(local.z) > L / 2) return false;
    const inH = Math.abs(local.y) < thick / 2 && Math.abs(local.x) < W / 2, inV = Math.abs(local.x) < thick / 2 && Math.abs(local.y) < W / 2;
    return (kind === 'h' && inH) || (kind === 'v' && inV) || (kind === 'x' && (inH || inV));
  }
  function clearTrialFx() { for (const k of ['band', 'core']) if (TR[k]) { scene.remove(TR[k]); TR[k] = null; } }
  function failTrial(why) { clearTrialFx(); TR.state = 'idle'; ctx.banner('회피 시험 실패', why + ' — 시작 고리로 돌아가 다시 도전', 2.4); }
  function updateTrial(dt) {
    const avail = trialAvailable() && gnd.mode === 'air';
    if (!avail) { if (TR.startRing) TR.startRing.visible = false; if (TR.state !== 'idle') { clearTrialFx(); TR.state = 'idle'; } return; }
    const s = site(TRIAL_WYRM.site);
    if (!TR.startRing) { TR.start = markerPos([TRIAL_WYRM.site, -1, 0]); TR.startRing = new T.Mesh(new T.TorusGeometry(16, 1.2, 10, 40), new T.MeshBasicMaterial({color: 0xff9a4a, transparent: true, opacity: .85, blending: T.AdditiveBlending, depthWrite: false})); TR.startRing.position.copy(TR.start); scene.add(TR.startRing); }
    TR.startRing.visible = TR.state === 'idle'; TR.startRing.rotation.y += dt;
    const P = player.position;
    if (TR.state === 'idle') { if (P.distanceTo(TR.start) < 16 + 2.5 * ctx.scale()) { TR.state = 'count'; TR.t = 3; TR.hits = 0; TR.solved.clear(); TR.pi = 0; ctx.clearEnemiesNear?.(P, 600); ctx.banner('회피 시험', '3', .9); } return; }
    if (TR.state === 'count') { const before = Math.ceil(TR.t); TR.t -= dt; if (Math.ceil(TR.t) !== before && TR.t > 0) ctx.banner('회피 시험', String(Math.ceil(TR.t)), .9); if (TR.t <= 0) { TR.state = 'run'; TR.t = 0; TR.phase = 'gap'; TR.pt = .6; ctx.banner('시작', '띠가 뜨면 옆이나 위로 · 핵이 열리면 쏘세요', 2); } return; }
    // run
    TR.t += dt; if (TR.t > TRIAL_WYRM.limit) return failTrial('시간 초과');
    if (P.distanceTo(v.set(s.x, s.y, s.z)) > s.r + 520) return failTrial('시험 구역 이탈');
    if (ctx.hp() <= 0) return failTrial('쓰러짐');
    TR.pt -= dt; const dir = ctx.forward();
    if (TR.phase === 'gap' && TR.pt <= 0) { const kind = TRIAL_WYRM.patterns[TR.pi % 3]; TR.band = makeBand(kind, P.clone().addScaledVector(dir, 40), dir); TR.phase = 'tele'; TR.pt = TRIAL_WYRM.telegraph; ctx.sfx?.('boss_volley'); }
    else if (TR.phase === 'tele') { TR.band.children.forEach(m => m.material.opacity = .28 + .4 * (Math.sin(TR.pt * 18) * .5 + .5)); if (TR.pt <= 0) { TR.phase = 'fire'; TR.pt = TRIAL_WYRM.fire; TR.band.children.forEach(m => { m.material.color.set(0xfff1c1); m.material.opacity = .55; }); TR.wasHit = false; } }
    else if (TR.phase === 'fire') {
      if (!TR.wasHit && inBand(TR.band, P)) { TR.wasHit = true; TR.hits++; ctx.hurt(ctx.maxHp() * .06); ctx.banner('피격', `${TR.hits} / ${TRIAL_WYRM.hitsToFail}`, .8); if (TR.hits >= TRIAL_WYRM.hitsToFail) return failTrial('탄막 3회 피격'); }
      if (TR.pt <= 0) { scene.remove(TR.band); TR.band = null;
        if (TR.wasHit) { TR.phase = 'gap'; TR.pt = .8; }
        else { const c = new T.Mesh(new T.IcosahedronGeometry(5 + ctx.scale(), 1), new T.MeshBasicMaterial({color: 0xffd27a})); c.position.copy(P).addScaledVector(dir, 70).add(w.set(0, 8, 0)); scene.add(c); TR.core = c; TR.coreHit = false; TR.phase = 'core'; TR.pt = TRIAL_WYRM.core; ctx.banner('핵 노출', '4초 안에 맞히세요', 1.2); }
      }
    } else if (TR.phase === 'core') {
      TR.core.rotation.y += dt * 3; TR.core.scale.setScalar(1 + .15 * Math.sin(TR.t * 12));
      if (TR.coreHit || TR.pt <= 0) {
        const kind = TRIAL_WYRM.patterns[TR.pi % 3]; ctx.burst(TR.core.position, TR.coreHit ? 0xffd27a : 0x777777, TR.coreHit ? 80 : 10, 30, 1.2); scene.remove(TR.core); TR.core = null;
        if (TR.coreHit) { TR.solved.add(kind); TR.pi++; ctx.banner(`파동 해결 ${TR.solved.size} / 3`, '', 1.1); ctx.sfx?.('multikill'); }
        TR.phase = 'gap'; TR.pt = .8;
        if (TR.solved.size >= 3) { // 성공
          clearTrialFx(); TR.state = 'idle'; const g = ctx.growth(); g.trials.wyrm = true; const pend = g.pending; g.pending = 0;
          ctx.banner('회피 시험 통과', `${Math.round(TR.t)}초 · 웜으로 진화합니다`, 2.6); ctx.gainXp(1 + pend, 'quest', '회피 시험 통과'); ctx.markProgress(true);
        }
      }
    }
  }
  // 플레이어 탄이 핵에 맞았는지 (game.js updateBolts에서 호출)
  function boltHit(a, b, r, segDistSq) { if (!TR.core || TR.coreHit) return false; const rr = r + 5 + ctx.scale(); if (segDistSq(TR.core.position, a, b) < rr * rr) { TR.coreHit = true; return true; } return false; }

  // ---------- 매 프레임 ----------
  let inited = false;
  function update(dt) {
    if (!started()) return;
    if (!inited) { inited = true; setupStep(); }
    syncRings(); updateTrial(dt);
    const c0 = cur(); // 재료 확보는 땅에서 완료되므로 모드와 무관하게 확인
    if (c0 && c0.t === 'gather') { const bag = gnd.world.bag; if (Object.entries(c0.items).every(([k, n]) => (bag[k] || 0) >= n)) { advance(); return; } }
    const c = cur(); if (!c || gnd.mode !== 'air') { for (const r of rings) r.visible = gnd.mode === 'air'; return; }
    if (c.t === 'markers') {
      const q = st(); rings.forEach((r, i) => { r.visible = true; r.material.opacity = i === q.n ? .9 : i < q.n ? .05 : .2; if (i === q.n) r.rotation.z += dt * 1.4; });
      const r = rings[q.n]; if (r && r.position.distanceTo(player.position) < 14 + 2.5 * ctx.scale()) { ctx.burst(r.position, 0x9ff0ff, 40, 25, 1); ctx.sfx?.('ui_click'); q.n++; if (q.n >= c.points.length) advance(); else ctx.banner(c.hud, `표식 ${q.n} / ${c.points.length}`, .9); ctx.markProgress(); }
    }
    if (c.t === 'clear') ensureGroup(c);
  }
  function objective() {
    if (!started()) return '';
    if (allDone()) { const g = ctx.growth(); if (g.trials.wyrm) return ''; return trialAvailable() ? '회피 시험 · 등불 사슬 섬 바깥 주황 고리에서 시작' : '웜 경계(Lv20)까지 성장 · 전투·발견으로'; }
    const c = cur(), m = M2[st().m]; let extra = '';
    if (c.t === 'markers') { const r = rings[st().n]; if (r) extra = ` · ${Math.round(r.position.distanceTo(player.position))}m`; }
    if (c.t === 'clear') { const s = site(c.at); extra = ` · ${st().n}/${c.count} · ${Math.round(player.position.distanceTo(v.set(s.x, s.y, s.z)))}m`; }
    if (c.t === 'gather') extra = ' (공터 · 인간형)'; if (c.t === 'talk' || c.t === 'craft' || c.t === 'install') extra = ' (공터 · 인간형)';
    return `${m.title} · ${c.hud}${extra}`;
  }
  return {update, onInteract, promptFor, onKill, boltHit, objective, get ianPos() { return ian && ian.position; }, get trial() { return TR; }, get rings() { return rings; }, cur, get trialActive() { return TR.state !== 'idle'; }, get started() { return started(); }, get allDone() { return allDone(); }, state: st, trialAvailable};
}
