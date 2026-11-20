# HANDOFF 로그 (최신이 위)

## 2026-11-20 — [codex] 진행 중
**한 일**: dragon-empire를 독립 git 저장소로 초기화하고 지정 원격 main을 fetch. .gitignore 추가. 에셋 다운로드 스크립트 실행 시작.
**진행 중**: 에셋 다운로드 응답 확인 필요. 월드 통합 및 T1~T4는 아직 착수하지 않음.
**다음 할 일**: 다운로드 결과와 ZIP 확인 및 압축 해제, world-demo 실제 브라우저/FPS 및 tex=1 확인, game.js 월드 통합 후 T1~T4 순차 진행.
**알려진 문제**: 원격 저장소는 상위 치이카와 저장소와 별개. 10MB 초과 미승인 concepts GLB는 커밋 제외.
**테스트 여부**: 브라우저/FPS/텍스처/게임 통합 미실시.
## 2026-11-20 04:10 KST — [claude] Claude Code
**한 일 — 3D 월드 + 시간 흐름 시스템 (신규 모듈, 기존 game.js 미수정)**
- `world/terrain.js` `createTerrain({scene, renderer, seed, size=6000, textures, clouds})` → `{group, heightAt(x,z), waterLevel, spawnPoint, update(camPos,dt), setSunDirection(v), landmarks, stats(), dispose()}`
  - 6km 지형: fBm+리지드 산맥, 중앙 계곡·강·호수, 고봉 6, 8×8 청크 3단계 LOD(스커트), 맵 밖 산맥. 높이·경사 색 블렌딩(textures {meadow,cliff,snow} URL 주면 블렌드, 실패 시 절차적 폴백 — 텍스처 경로는 미검증).
  - 물(프레넬·하이라이트·물거품), 인스턴스 나무 2종·바위, 랜드마크(아치 바위, 등불 탑 2개+사슬, 떠다니는 섬 5개).
- `world/timeofday.js` `createTimeOfDay({scene, renderer, camera, startHour=6, dayLengthSec=660, endHour=21})` → `{update(dt, focusPos), setHour, hour, setSpeed, paused, sunDirection, sunLight, hemiLight, onHourChange, dispose}` — Sky.js 산란 + 키프레임 13개(해/달빛·반구광·안개·노출), 별·달, 그림자 카메라 추적. **한 판 660초 = 06시→21시** (해질녘~밤에 엠페러 연출 가능).
- `world/clouds.js` `createClouds({scene, area, altitude, count})` → `{group, update(dt, camera, tod), inside, dispose}` — 퍼프 ~450개 단일 배치, 바람·시간대 틴트·근접 페이드.
- `vendor/addons/` (Sky, SimplexNoise, BufferGeometryUtils — import 경로 '../three.module.js'로 수정한 사본)
- `world-demo.html`: 자유비행 데모(드래그 시점, WASD/Space/C/Shift, 모바일 좌측 드래그 이동·우측 시점, 시간 슬라이더, x1/x10/x60, 자동비행). URL: `?h=17.4&y=220&yaw=0&auto=1&shadows=0&tex=1`
- 검증(헤드리스 크롬 SwiftShader): 콘솔 에러 0(favicon 404만), draw 57~74 / tri 32만~42만 (그림자 포함). 스크린샷 docs/screenshots/.
**다음에 할 일**
1. game.js에 통합: 기존 createEnvironment 대신 createTerrain+createTimeOfDay+createClouds 사용, 카메라 지면 충돌은 `terrain.heightAt` 사용, 적 스폰 고도도 heightAt 기준.
2. 진행 시간(tod.hour)과 레벨/진화 연동(예: 엠페러 도달 시 setSpeed 올려 석양 연출).
3. 실기기 성능 확인 — 저사양은 `shadows` off, pixelRatio 1.25.
**알려진 한계**: 원경 나무 각짐, 구름이 지형과 겹칠 때 경계, 19시 지면 다소 어두움, 텍스처 블렌드 미검증, 실제 GPU/모바일 미테스트.

## 2026-11-20 03:20 KST — [claude] Claude Code
**한 일**
- 릴레이 개발 규칙으로 COLLAB.md 개정, 이 HANDOFF.md 신설.
- 설계 문서 작성: docs/SKILLS.md, WORLD.md, BALANCE.md, VFX.md, ROADMAP.md, QA.md, TASKS_FOR_CODEX.md(공용 작업 목록), docs/agents/(역할 정의 7개).
- Higgsfield 에셋 생성(누적 약 36크레딧, 잔액 약 1,122): 해츨링 3D GLB, 스카이박스 2종, 지형 텍스처 3종, 구름/불/기본/번개/화염스킬 VFX 시트, 스킬 아이콘, 보스·잡몹 콘셉트.
  → 전부 assets/remote-assets.json 에 URL 기록, scripts/fetch-assets.mjs 추가.
**진행 중이던 일**: 없음 (코드 파일은 아직 수정 안 함)
**다음에 할 일 (우선순위)**
1. 이 폴더를 git 저장소에 처음 push (아직이면) + `.gitignore` (node_modules, assets/pending/models/*_raw.glb).
2. `node scripts/fetch-assets.mjs` 실행해 에셋 다운로드 → 번들 zip은 assets/pending/models/ 에 압축 해제.
3. TASKS_FOR_CODEX.md T1(importmap·environment.js 연결) → T2(manifest 로더+폴백) → T3/T4(카메라·조준, 터치 조작).
4. 레벨 구조를 BALANCE.md(Lv30, 4단계 진화)로 맞추기 — 사용자 결정 대기 중이나 추천안.
**사용자 승인 대기**: 해츨링 3D 모델(뿔이 콘셉트보다 크고 앞으로 휨), 스카이박스·텍스처·VFX 시트.
**테스트**: 브라우저 실행 테스트 없음. 정적 점검 결과는 docs/QA.md.

