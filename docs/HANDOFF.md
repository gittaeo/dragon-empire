# HANDOFF 로그 (최신이 위)

## 2026-11-20 12:55 KST — [claude] 해츨링 3D 모델 적용 (사용자 승인)
- 사용자가 해츨링 GLB 승인 → `assets/approved/dragon_hatchling.glb`(2.07MB, 텍스처 1024) + `assets/manifest.json` 등록.
- `assets-loader.js` `loadModel(id,{length,flap})`: 리깅 없는 GLB용 **버텍스 셰이더 날갯짓**(몸통 폭 바깥 정점을 날개 뿌리 축으로 회전, `userData.flap.uFlapTime/uFlapAmp`). game.js에서 평소 5.5, 가속 시 9 속도로 날갯짓. 플레이어 크기 날개폭 9m.
- 헤드리스 크롬 확인: 모델 로드·뒤에서 본 방향(머리 전방) 정상, 날갯짓 동작, 콘솔 에러 없음.
**남은 점**: 모델이 서 있는 자세라 비행 시 몸이 세워져 보임(필요하면 root.rotation.x로 앞으로 기울이기), 진화 경로(화염/폭풍) 선택 시 색 변화는 도형에만 적용됨 → 모델엔 emissive 틴트 등으로 대응 필요. 커밋·push 필요.

## 2026-11-20 12:40 KST — [claude] Claude Code
**한 일** (git 커밋/push는 아직 안 함 → 다음 Codex가 `[claude]` 접두어로 커밋·push 해 주세요)
- **T4 모바일 터치 조작** `touch.js`(신규): 화면 왼쪽 누른 자리에 나타나는 가상 조이스틱(이동), 오른쪽 드래그(시점, 상하 무제한 유지), 버튼 ▲상승/▼하강/BOOST/FIRE, 멀티터치. 터치 기기에서만 표시, 일시정지·진화선택·결과 화면에선 숨김. `style.css` 하단에 터치 UI + 가로 모드 소형 화면 HUD 축소.
- **T2 manifest 로더** `assets-loader.js`(신규) + `assets/manifest.json`(빈 목록) + `vendor/addons/GLTFLoader.js`(import 경로 수정 사본; vendor/package는 git 제외라서). 승인 에셋 `dragon_hatchling`(glb) 등록 시 자동으로 플레이어 외형 교체(크기 정규화, +Z→-Z 전방 보정), 실패·미등록이면 기존 도형 유지.
- **T3 조준/카메라 일부** `game.js`: 브레스가 화면 십자선 방향(카메라 광선, 적 근접 판정)으로 발사, 사거리 600m(속도 140, 수명 4.5s). 적이 꼬리를 보이던 문제 수정(lookAt 후 180° 회전). 카메라 far 1800→12000(먼 산·하늘 잘림 수정), 하늘·안개 덮어쓰던 코드 제거(timeofday가 관리).
- 월드 정합: 플레이어 시작 = `terrain.spawnPoint`, 적 스폰을 시작점 기준으로, 이동 제한 ±800 → ±2700m.
- 디버그 훅 `window.__game` (player, enemies, terrain, tod, touch, start).
**테스트**: `node --check` 통과(game/touch/assets-loader). 헤드리스 크롬(SwiftShader): 데스크톱 시작→W 이동·F 발사 3초 정상, 콘솔 에러 없음(favicon 404·GL 성능 경고만). 모바일 에뮬(844×390 터치): 터치 UI 표시, FIRE 버튼 상태 동작 확인. **실기기·실제 GPU·실제 손가락 조작은 미검증.**
**다음 할 일**
1. 이 변경 커밋·push.
2. 실제 휴대폰에서 조작감 확인(감도: touch.js `R=55`, game.js onLook 계수 .005/.004).
3. 레벨 구조를 BALANCE.md(Lv30·4단계 진화)로 전환 + SKILLS.md 스킬(BOOST 쿨다운, DODGE, SKILL1/2, ULT) 버튼 추가.
4. 해츨링 GLB 사용자 승인 후 assets/approved/ 로 옮기고 manifest 등록 → 날갯짓은 ASSETS.md 방법대로.
5. 실패한 에셋 5개(스카이박스2·지형텍스처3) 재다운로드.

## 2026-11-20 — [codex] 월드 연결 진행
**한 일**: 게임에 terrain/timeofday/clouds를 연결하고 플레이어·적 스폰 및 카메라 최저 고도에 heightAt을 적용. 에셋 다운로드 11개 성공, 5개 실패(스카이박스 2, 지형 텍스처 3). 드래곤 ZIP 압축 해제. 미승인 에셋 게임에 미적용.
**진행 중**: game.js 월드 통합은 기본 연결만 완료. T1 전체, T2/T3/T4 미완료. vendor/package는 크기 때문에 git 제외되어 검토 HTML의 loader 의존성을 복구해야 함.
**다음 할 일**: 실패한 에셋 재다운로드, 실제 GPU/브라우저에서 데모와 게임 조작 및 FPS 검증, tex=1 텍스처 블렌드 확인, 지형 충돌 완성 및 T1→T2→T3/T4. 사용자의 상하 무제한 시점 요청은 T3 문서의 pitch 제한보다 우선.
**알려진 문제**: 최초 push HTTP 408 실패; push 재시도 확인 필요. ZIP 안 2k 원본은 git 제외. 미승인 파일 유지.
**테스트 여부**: node --check game.js 통과. Chrome headless SwiftShader 월드 데모 tex=1에서 draw 69 / 390k triangles 렌더 확인, 텍스처 3종 부재로 블렌드 및 FPS 미검증. 실제 브라우저 조작 미검증.
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


