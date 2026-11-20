# TASKS_FOR_CODEX — 드래곤 엠파이어 작업지시서 v1
작성: Claude (게임 디렉터 / 비행·전투 리뷰 / QA) · 2026-11-20
기준 코드: `game.js`(38줄, 13,325B), `environment.js`, `index.html`, `style.css`, `server.cjs` (2026-11-20 스테이징본)
관련 문서: `COLLAB.md`(분업·에셋 규약), `docs/SKILLS.md`(진화·스킬 수치), `docs/QA.md`(버그 근거), `docs/ROADMAP.md`

> 규칙: Codex는 이 문서의 **T1부터 순서대로** 진행합니다. 각 작업이 끝나면 `COLLAB.md` 작업 로그에 `T번호 완료 + 확인한 완료 기준`을 한 줄 남겨 주세요. 수치는 모두 초기값이며 `config.js` 한 곳에 모아 플레이테스트로 조정합니다.
> 이 문서에서 "현재"는 위 스테이징본 기준입니다. 브라우저 실행 검증은 아직 아무도 하지 않았습니다(정적 점검만 완료).

## 디렉터 결정 사항 (작업 전에 알아둘 것)
1. **모바일이 1순위**, PC 키보드/마우스는 개발용이지만 원래 요구사항(우클릭 드래그 회전·놓으면 고정, WASD, Space/C, Shift, 좌클릭, ESC)은 그대로 유지합니다.
2. **Shift = BOOST(화염 대시)** 로 통일합니다. 누르고 있는 동안 가속이던 기존 방식을 SKILLS.md의 쿨다운형 대시(1.2초 x2.2, 쿨 4초)로 바꿉니다. 대시 쿨다운 중 Shift를 누르고 있으면 x1.25 순항 가속만 적용합니다(PC 조작감 유지용).
3. **진화 단계는 SKILLS.md 기준 4단계·Lv30**으로 바꿉니다(현재 코드는 Lv3 분기, Lv5 종료). 분기(화염/폭풍)는 **Lv10, 2단계 진입 시** 선택합니다.
4. SKILLS.md의 궁극기 '선폴'은 4단계 해금인데 4단계 도달 = 판 종료라서 서로 맞지 않습니다. → **엠페러 도달 시 15초 '엠페러 피날레'** 를 넣고, 그 동안 ULT 게이지가 100%로 충전된 상태에서 남은 적을 소탕한 뒤 결과 화면으로 넘어갑니다.
5. 새 모듈은 ES module로 나눕니다(`config.js`, `assets.js`, `input.js`, `touch.js`, `skills.js`, `evolution.js`, `quality.js`, `save.js`, `ads.js`). game.js 한 줄에 2,880자짜리 루프(현재 37행)는 이번에 함수 단위로 풀어 주세요. 리뷰와 QA가 가능해집니다.

---

## T1. [P0] 부트스트랩 정리: importmap, environment.js 연결, 서버
**목표** GLTFLoader를 쓸 수 있게 만들고, 만들어 두고 쓰지 않는 `environment.js`(인스턴싱 지형)를 연결해 드로우콜을 줄입니다. 휴대폰에서 같은 Wi-Fi로 접속해 테스트할 수 있게 합니다.

**대상** `index.html`, `game.js` 1·9–13행, `environment.js`, `server.cjs`

**구현**
1. `index.html`의 `<script type="module" src="game.js">` **앞에** importmap 추가(검토용 HTML과 같은 형식):
   `{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/package/examples/jsm/"}}`
   game.js/environment.js의 import를 `import * as THREE from 'three'`로 통일합니다. `vendor/package/examples/jsm/loaders/GLTFLoader.js`가 내부에서 `'three'`를 bare import하므로 importmap이 없으면 T2 로더가 동작하지 않습니다.
2. game.js 9–13행(평면 지면, 직사각형 강, 산 원뿔 90개, 나무 360메시, 반투명 구름 140메시)을 삭제하고 `const env = createEnvironment(scene)`로 교체합니다. 산이 필요하면 environment.js 쪽에 InstancedMesh로 추가합니다(environment.js는 Codex 소유).
3. `env.heightAt(x,z)`를 전역 지형 쿼리로 씁니다. 플레이어 고도 제한을 `y = max(y, env.heightAt(x,z) + 6*stageScale)`, 상한 `min(y, 260)`으로 바꿉니다(현재 37행 고정값 8~170은 environment.js 외곽 림(r=800에서 높이 약 160)과 충돌).
4. 수평 이동 제한을 사각형 ±800에서 **원형 반경 900**으로 바꾸고, 경계에서 바깥으로 갈수록 이동 속도를 줄여 부드럽게 막습니다.
5. `server.cjs`: MIME 추가 `.json application/json`, `.glb model/gltf-binary`, `.png image/png`, `.jpg image/jpeg`, `.webp image/webp`, `.mp3 audio/mpeg`, `.ogg audio/ogg`, `.woff2 font/woff2`. 리슨 호스트를 `process.env.HOST || '127.0.0.1'`로 바꾸고, README에 `HOST=0.0.0.0 node server.cjs`(휴대폰 테스트용)를 적어 주세요.

**완료 기준**
- 콘솔에 모듈 해석 오류 없이 로드된다.
- 디버그 오버레이(T5) 또는 콘솔 `renderer.info.render.calls`로 **게임 중 드로우콜 150 이하**(적 20마리 포함). 현재 정적 추정치는 최대 약 800입니다.
- 지형 위 최저 고도로 날 때 드래곤이 지면/언덕을 뚫지 않는다. 외곽 림 쪽으로 날아가도 지형 속으로 들어가지 않는다.
- 휴대폰에서 `http://<PC IP>:4178` 로 접속된다.

---

## T2. [P0] assets/manifest.json 로더 + 실패 시 도형 폴백 (COLLAB.md §3 규약)
**목표** Claude가 승인한 에셋을 manifest만 보고 로드하고, 어떤 실패에도 게임이 멈추지 않습니다.

**대상** 신규 `assets.js`, `game.js`의 `dragon()`(14행) 호출부, `start()`(29행)

**구현**
1. `assets.js` export:
   ```js
   export async function loadManifest(url='./assets/manifest.json', timeoutMs=4000) // → Map<id, entry> (실패 시 빈 Map)
   export async function loadAsset(id, {timeoutMs=8000}={})  // → {ok:true, object3D, animations, entry} | {ok:false, reason}
   export function getAssetStatus() // 디버그용: [{id, state:'ok'|'fallback'|'missing', reason}]
   ```
2. manifest 형식은 COLLAB.md 그대로: `{id, file, type, rigged, animations, scale, forward, source, approvedAt}`. 최상위는 `{"version":1,"assets":[...]}` 또는 배열 둘 다 허용합니다. 경로는 `./assets/` + `file`. **`pending/`으로 시작하는 file은 로드하지 않습니다**(규약: 승인 전 에셋 로드 금지).
3. 모든 fetch/GLTFLoader.load를 `Promise.race([load, timeout])`로 감싸고 try/catch. 실패 원인(404, JSON 파싱, 타임아웃, GLB 파싱)을 `console.warn('[assets]', id, reason)`로 한 번만 남깁니다. **throw 금지**.
4. 게임은 **에셋을 기다리지 않고** 바로 도형 드래곤으로 시작합니다. 로드가 성공하면 T6의 `setDragonVisual()`로 교체합니다(로딩 중 시작 버튼을 막지 않음).
5. GLB 정규화 함수 `normalizeModel(obj, entry, targetLength)`:
   - Box3로 크기를 재서 가장 긴 수평 길이(x/z)를 `targetLength * entry.scale`로 맞춤
   - 바닥 중심을 원점으로 이동
   - `entry.forward === '+Z'`면 `rotation.y = Math.PI`(게임의 전방은 **-Z**. game.js 37행 `dir = (-sin yaw, …, -cos yaw)`)
   - 모든 메시 `castShadow=false`(T5 품질 단계에서 플레이어만 켬), `frustumCulled=true`
6. `rigged:false`면 `dragon-flight-review.html`의 onBeforeCompile 날갯짓 셰이더를 함수로 옮겨 적용(uniform `flapTime`, `flapAmp`)합니다. 정점 변형 결과가 어색하면 `entry.wingFlap:false`일 때 끄도록 합니다. `rigged:true`면 AnimationMixer로 `animations`의 첫 클립 재생.
7. 디버그 플래그 `?assets=off`면 manifest를 아예 읽지 않습니다(폴백 강제 테스트).

**완료 기준** (테스트 방법)
- 현재처럼 `assets/` 폴더가 없을 때: 콘솔 경고 1줄, 게임 정상 시작, 도형 드래곤 표시.
- `?assets=off`: 위와 동일.
- manifest에 존재하지 않는 GLB 경로가 있을 때: 해당 id만 폴백, 다른 에셋은 정상.
- manifest가 깨진 JSON일 때: 경고 1줄, 전체 폴백, 게임 진행.
- DevTools Network 'Slow 3G' + 큰 GLB: 시작 버튼을 바로 누를 수 있고, 로드 완료 후 모델이 교체된다(또는 8초 후 폴백 유지).
- 테스트용 manifest는 Claude가 `assets/manifest.json`으로 제공합니다(Codex는 assets/ 에 쓰지 않음). 필요하면 `?manifest=./docs/test-manifest.json` 같은 URL 파라미터로 경로를 바꿀 수 있게 해 주세요.

---

## T3. [P0] 카메라·조준 수정: 지형 충돌, 피치 제한, 조준점과 브레스 일치
**목표** 원래 요구사항의 "카메라가 지형 속으로 들어가지 않게", "조준 방향과 브레스 일치"를 충족합니다.

**대상** `game.js` 35행(mousemove), 37행(이동/발사), 38행(카메라), 32행 이하 적 `lookAt`

**구현**
1. **피치 제한**: 현재 35행은 pitch를 ±π로 감아서 뒤집힌 비행이 가능하고, 이를 보정하려고 yaw 부호를 뒤집는 꼼수를 씁니다. `pitch = clamp(pitch, -1.15, 1.15)`(약 ±66°)로 제한하고 yaw 부호 반전 코드를 제거합니다. `camera.up`은 항상 (0,1,0)으로 고정합니다.
2. **카메라 지형 충돌**: 원하는 카메라 위치 `desired`를 계산한 뒤
   - `minY = env.heightAt(desired.x, desired.z) + 3`, `desired.y = max(desired.y, minY)`
   - 플레이어→desired 선분을 6개 샘플로 나눠 `heightAt+2`보다 낮은 첫 지점이 있으면 그 직전 지점까지 카메라 거리를 줄임(스프링 암)
   - 거리 복귀는 천천히(아래 감쇠 사용), 줄어드는 쪽은 즉시
3. **프레임레이트 독립 감쇠**: 38행 `camera.position.lerp(..., .12)`와 37행 `rotation.z lerp .08`을 `const k = 1 - Math.exp(-rate*dt)` 형태로 바꿉니다(카메라 rate 10, 뱅크 rate 6). 30fps 모바일과 120Hz 기기에서 카메라 지연이 같아야 합니다.
4. **조준 일치**: 현재 37행은 플레이어 위치에서 `dir` 방향으로 발사하고, 카메라는 `player - 22*dir + 7*up`에서 `player + 14*dir + 2*up`을 봅니다. 그래서 화면 중앙 십자선 광선과 탄도는 약 28m 지점에서만 만나고, 먼 거리에서는 탄이 십자선 위쪽으로 지나갑니다(QA.md B-03).
   - 발사 시 `raycaster.setFromCamera({x:0,y:0}, camera)`
   - 적 바운딩 구(반경 = 3.5 × 적 스케일)와 교차하면 그 점, 아니면 `camera.position + ray.dir * 300`을 목표점으로 합니다
   - 발사 원점 = 플레이어 입 위치(`head` 앞 1.5m. GLB에서는 manifest `mouthOffset` 옵션, 없으면 전방 bbox 끝)
   - 탄 방향 = `normalize(target - muzzle)`
   - LOCK 중이면(T7) 목표점 = 락온 적 위치
5. **적 방향 버그**: 32행 이후 루프의 `e.lookAt(player.position)`은 Object3D의 **+Z**를 대상에 향하게 합니다. 도형 드래곤은 머리가 **-Z**(14행 head z=-2)라서 **적들이 꼬리를 플레이어 쪽으로 향합니다**. lookAt 후 `e.rotateY(Math.PI)`를 하거나 dragon 모델을 forward 보정 그룹으로 감싸 주세요.
6. 플레이어가 키 입력이 없을 때도 `rotation.y/x`가 카메라를 따라가도록(현재는 이동/발사 중에만 갱신) 선회 감쇠를 적용합니다. 단, 요구사항대로 **우클릭/드래그를 놓으면 yaw/pitch는 그대로 고정**(자동 복귀 없음).

**완료 기준**
- 지면 바로 위에서 시점을 최대한 위로 올려도(피치 -66°) 카메라가 지형 아래로 들어가지 않는다. 언덕 뒤로 카메라가 갈 때 지형을 뚫어 보이지 않는다.
- 정지 상태에서 십자선을 30m, 100m, 250m 거리의 적에 각각 맞추고 발사하면 모두 명중한다(디버그 모드에서 탄도 선 표시 권장).
- 적 와이번의 머리가 플레이어를 향한다.
- `?fps=30`(rAF 스로틀 디버그)과 기본 60fps에서 카메라 따라오는 느낌이 같다.

---

## T4. [P0] 입력 추상화 + 모바일 터치 조작 (조이스틱·버튼·드래그 카메라·멀티터치)
**목표** 모바일 터치만으로 비행, 전투, 카메라 조작을 모두 할 수 있게 합니다. PC 입력과 같은 게임 로직을 씁니다.

**대상** 신규 `input.js`, `touch.js`, `index.html`(`#touch-ui` DOM), `style.css`, `game.js` 33–35행(키/마우스 리스너), 37행(입력 사용부)

**구현**
1. `input.js`: 매 프레임 게임이 읽는 단일 상태
   ```js
   export const input = { moveX:0, moveY:0, up:0, down:0, fire:false, boostPressed:false, boostHeld:false,
     dodgePressed:false, lockPressed:false, skill1Pressed:false, skill2Pressed:false, ultPressed:false,
     lookDX:0, lookDY:0, pausePressed:false };
   export function endFrame() // *Pressed 플래그와 lookDX/DY를 0으로 리셋
   export function clearInput() // blur/일시정지/진화선택 시 전부 해제(현재 33행 기능 이전)
   ```
   키보드: W/S→moveY ±1, A/D→moveX ±1, Space→up, C→down, Shift(Left/Right 모두)→boost, 좌클릭/F→fire, Q→dodge, E→lock, 1/2/R→skill1/skill2/ult, Esc→pause. 우클릭 드래그→lookDX/DY(놓으면 고정). **게임 로직은 `keys.KeyW` 등을 직접 읽지 않습니다.**
2. `touch.js`: Pointer Events 기반(`pointerdown/move/up/cancel`, `setPointerCapture`). **pointerId별 역할 맵**을 유지해서 멀티터치를 처리합니다.
   - **가상 조이스틱**: 화면 왼쪽 45% 영역 어디든 첫 터치 지점이 원점(플로팅). 반경 64px(CSS px), 데드존 0.12, 출력은 moveX/moveY ∈ [-1,1](원형 정규화). 손가락 위치에 노브 표시, 놓으면 0으로 복귀.
   - **카메라 드래그**: 왼쪽 영역 밖, 버튼이 아닌 곳의 터치는 카메라. `lookDX = dx * sens`, 기본 sens 0.0055 rad/px(설정 0.5~2배), Y축 반전 옵션. 놓으면 시점 고정(PC와 동일).
   - **우측 버튼**(엄지 반경 안 원호 배치, 최소 64×64 CSS px, FIRE는 84px): `FIRE`(누르고 유지), `BOOST`, `DODGE`, `LOCK`. 해금 시 `SKILL1`, `SKILL2`, `ULT` 표시. 각 버튼에 쿨다운 원형 게이지(conic-gradient)를 표시합니다.
   - **상승/하강**: 모바일에서는 카메라 피치가 비행 방향이 됩니다(조이스틱 위로 + 카메라를 위로 = 상승). 보조로 FIRE 위에 작은 ▲/▼ 버튼(48px)을 둡니다.
   - **FIRE 중 카메라 조준**: FIRE를 누른 채 손가락을 밀면 그 포인터가 카메라 드래그도 합니다(슈터 모바일 표준). 구현: FIRE 버튼 pointermove의 dx/dy를 lookDX/DY에 0.7배로 더합니다.
   - 버튼 pointerdown에서 `preventDefault()`와 `stopPropagation()`을 해서 카메라/조이스틱으로 새지 않게 합니다.
   - 일시정지 버튼(우상단 44px), 진화 선택/결과 화면이 열리면 `#touch-ui` 비활성화 + `clearInput()`.
3. 표시 조건: `matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || ?touch=1`. PC에서 `?touch=1`이면 마우스로 터치 UI를 테스트할 수 있어야 합니다(Pointer Events를 쓰면 자동으로 됩니다).
4. `index.html` viewport: `width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover`.
   `style.css`: `html,body,canvas,#touch-ui{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none}`. 버튼과 HUD 위치에 `env(safe-area-inset-*)` 반영. 모바일에서 `.help`(PC 키 설명)는 숨깁니다.
5. 가로 화면 전용: 세로일 때 "가로로 돌려 주세요" 오버레이 표시(Capacitor에서는 T10에서 orientation 고정).

**완료 기준** (실기기 안드로이드 Chrome 필수, PC `?touch=1` 보조)
- 왼엄지 조이스틱 이동 + 오른엄지 카메라 드래그를 **동시에** 할 수 있다.
- 조이스틱 + FIRE 유지 + 카메라 드래그 3점 터치가 된다(FIRE 버튼에서 드래그).
- 버튼을 누른 손가락을 화면 밖으로 빼거나 알림창을 내려도(pointercancel) 입력이 눌린 채로 남지 않는다.
- 핀치 확대, 더블탭 확대, 길게 눌러 텍스트 선택/컨텍스트 메뉴, 당겨서 새로고침이 일어나지 않는다.
- PC 키보드/마우스 조작이 이전과 동일하게 동작한다(회귀 없음).

---

## T5. [P1] 모바일 성능 설정: 품질 단계, pixelRatio 제한, 그림자/후처리
**목표** 중급 안드로이드에서 30fps 이상(COLLAB.md §4).

**대상** 신규 `quality.js`, `game.js` 3–5행(renderer/scene/light 생성), `resize` 핸들러(36행), 파티클 풀(19행)

**구현**
1. 품질 프리셋(`config.js`):
   | 항목 | low | medium | high |
   |---|---|---|---|
   | pixelRatio 상한 | 1.0 | 1.25 | min(devicePixelRatio, 2) |
   | antialias | false | false | true |
   | 그림자 | 끔 | 플레이어만 castShadow, 지형 receive, 1024 맵, 카메라 주변 80m 프러스텀 | 2048 맵, 적도 cast |
   | 후처리 | 없음 | 없음 | UnrealBloom 절반 해상도(strength .6) — 로드 실패 시 없음으로 폴백 |
   | camera.far / fog density | 900 / .0042 | 1300 / .0034 | 1800 / .0028 |
   | 파티클 풀 | 300 | 600 | 900 |
   | 동시 적 수 | 10 | 14 | 20 |
   antialias는 렌더러 생성 시에만 정해지므로 품질 변경 시 "재시작 후 적용"으로 처리합니다.
2. 기본값: 터치 기기 = medium, PC = high. 저장된 설정이 있으면 그것을 씁니다(T8 save).
3. **자동 하향**: 시작 후 3초 대기 후 2초 동안 평균 프레임 시간을 재서 33ms 초과면 한 단계 하향(pixelRatio·그림자·후처리만 런타임 변경). 한 판에 최대 1회.
4. 현재 4행 `shadowMap.enabled=true`인데 castShadow가 있는 광원이 없습니다. low에서는 `enabled=false`로 명시합니다.
5. resize/orientationchange에서 `renderer.setPixelRatio(현재 프리셋 상한)`을 다시 호출합니다(현재 36행은 setSize만 합니다).
6. `?debug=1` 오버레이: FPS, frame ms, `renderer.info.render.calls`, triangles, 품질 단계, 에셋 상태(T2 `getAssetStatus`).
7. 매 프레임 할당 제거: 37행 적 루프의 `new T.Vector3()`, `spark()`의 `new T.Color(color)`(22행), 탄 꼬리 `new T.Vector3`를 모듈 스코프 임시 객체로 재사용합니다(모바일 GC 끊김 방지).
8. 일시정지 아이콘/설정 패널에 품질 선택(자동/낮음/보통/높음) UI를 넣습니다.

**완료 기준**
- `?debug=1`에서 low/medium 각각 드로우콜 ≤150, high ≤250.
- 중급 안드로이드 실기기(예: 갤럭시 A5x급) medium에서 전투 중 평균 30fps 이상. 기기명과 수치를 COLLAB.md 로그에 기록.
- Chrome DevTools Performance 10초 녹화에서 GC로 인한 16ms 이상 끊김이 전투 중 반복되지 않는다.

---

## T6. [P1] 진화 시스템 재구성: 4단계·분기·스케일·외형(GLB) 교체 구조
**목표** SKILLS.md의 4단계(해츨링 → 드레이크 → 웜 → 엠페러)와 Lv10 분기를 구현합니다. 단계별 GLB를 manifest id만으로 교체할 수 있게 합니다.

**대상** 신규 `evolution.js`, `config.js`, `game.js` `refresh()`(28행), 분기 버튼 핸들러(30행), `killEnemy()`(32행), `index.html` `#choice`

**구현**
1. 데이터 테이블(`config.js`):
   ```js
   export const STAGES = [
     { id:1, name:'불씨 해츨링', minLevel:1,  scale:1.0, visual:{ flame:'dragon_s1',        storm:'dragon_s1' } },
     { id:2, name:'마그마 드레이크', minLevel:10, scale:1.8, visual:{ flame:'dragon_s2_flame', storm:'dragon_s2_storm' } },
     { id:3, name:'인페르노 웜',   minLevel:20, scale:3.0, visual:{ flame:'dragon_s3_flame', storm:'dragon_s3_storm' } },
     { id:4, name:'드래곤 엠페러', minLevel:30, scale:4.5, visual:{ flame:'dragon_s4_flame', storm:'dragon_s4_storm' } },
   ];
   export const xpToNext = lv => 10 + 2*lv;   // 초기값. Lv1→30 누적 1,160 XP
   export const XP_PER_KILL = { 1:10, 2:20, 3:35 }; // 적 등급별
   ```
   목표 첫 완주 시간은 **8~12분**입니다. `?fast=1`이면 XP 5배(QA용).
   폭풍형 이름은 미정입니다. 임시로 '폭풍 드레이크/폭풍 웜'을 쓰고 Claude가 SKILLS.md에 확정하면 교체합니다.
2. `setDragonVisual(stageId, path)`:
   - 플레이어는 `playerRoot`(Group: 위치·회전·물리) 아래 `visualSlot`(Group) 1개를 둡니다. 교체는 visualSlot의 자식만 바꿉니다(위치/카메라/충돌 코드는 playerRoot만 참조).
   - manifest id가 로드되어 있으면 GLB 클론, 없으면 `dragon()` 도형 폴백 + 단계별 색/뿔 크기 변형(현재 30행의 색 변경 로직 이전)
   - 교체 시 이전 visual의 geometry/material dispose(공유 캐시 GLB는 dispose하지 않음)
   - 단계 스케일은 `playerRoot.scale`이 아니라 **visualSlot 스케일 트윈**(0.8초 easeOutBack)으로 적용하고, 게임플레이 반경 값은 `STAGES[i].scale`에서 따로 계산합니다(히트박스, 카메라 거리, 지면 최소고도, 탄 크기)
   - 카메라 거리 = `22 * (0.75 + 0.25*scale)`, 높이 오프셋도 비례
3. 진화 연출: 진화 순간 0.6초 슬로모(timeScale .3), 버스트 파티클, 화면 플래시, HUD 단계명 배너. 그 동안 무적.
4. 분기 UI: Lv10 도달 시 `#choice` 표시, 게임 일시정지, `clearInput()`. **터치에서도 누를 수 있는 큰 카드**로 표시합니다. 선택 결과는 `run.path`에 저장합니다. 현재 30행의 '폭풍 선택 시 HP+25 즉시 회복'은 '폭풍: 최대 HP +25%, 이동속도 +20%'(지속 효과)로 바꿉니다. 화염은 '연사 피해 +30%'.
5. 판 종료: Lv30 도달 → 4단계 진화 → **엠페러 피날레 15초**(디렉터 결정 4: ULT 100%, 적 추가 스폰) → `finish(true)`.
6. 적 웨이브: 현재는 20마리를 한 번 생성하고 끝이라 Lv30까지 XP가 부족합니다. `spawner`가 품질 프리셋의 동시 적 수를 유지하도록 플레이어 주변 120~250m 랜덤 위치(지형+30m 이상)에 리스폰합니다. 단계가 오르면 적 등급과 체력이 오릅니다(등급2: 스케일 1.6/HP 80, 등급3: 스케일 2.4/HP 200 — 초기값).

**완료 기준**
- `?fast=1`로 Lv10에서 분기 선택창, Lv20에서 3단계, Lv30에서 피날레 후 결과 화면이 순서대로 나온다.
- manifest가 없을 때 모든 단계가 도형으로 표시되고 크기가 1.0 → 1.8 → 3.0 → 4.5로 커진다.
- (Claude가 테스트 manifest 제공 후) `dragon_s2_flame`만 등록된 상태에서 2단계만 GLB, 나머지는 도형으로 표시된다.
- 진화 직후 카메라가 드래곤 몸 안으로 들어가지 않고, 4단계에서도 십자선 조준이 맞는다(T3 기준 재확인).

---

## T7. [P1] 스킬 시스템 (SKILLS.md 구현 순서)
**목표** 데이터 기반 스킬 시스템을 만들고 SKILLS.md 8개 스킬을 아래 순서로 넣습니다. 각 단계가 끝날 때마다 플레이 가능한 상태를 유지합니다.

**대상** 신규 `skills.js`, `config.js`(SKILLS 테이블), `game.js` 37행 발사/탄 처리 이전, `touch.js` 버튼

**공통 구조**
```js
// config.js
export const SKILLS = {
  ember_volley:{ button:'fire',  unlockStage:1, rate:6, dmg:10, speed:120, range:260 },
  flame_dash:  { button:'boost', unlockStage:1, dur:1.2, mult:2.2, trailDmg:5, cd:4 },
  barrel_roll: { button:'dodge', unlockStage:1, iframe:.4, lateral:12, cd:3 },
  lock_on:     { button:'lock',  unlockStage:1, screenRadius:.12, range:250, homingTurn:4 },
  magma_meteor:{ button:'skill1',unlockStage:2, radius:8, dmg:120, burnDps:10, burnDur:2, cd:8 },
  flame_shield:{ button:'skill2',unlockStage:3, dur:3, absorb:.7, contactBurn:2, cd:15 },
  fire_tornado:{ upgradeOf:'magma_meteor', unlockStage:3, dur:3, pull:18 },
  sunfall:     { button:'ult',   unlockStage:4, dur:4, gaugeMax:100 },
};
// skills.js
export class SkillSystem { constructor(ctx); update(dt, input); canCast(id); cast(id); cooldownRatio(id); }
```
적 체력 단위를 SKILLS.md에 맞춰 바꿉니다: 등급1 적 HP **40**(현재 health 4 → 10dmg 4발과 같은 감각 유지).

**구현 순서**
1. **불씨 연사(FIRE)**: 37행의 발사 로직 이전. 초당 6발(현재 0.19초 간격 ≈ 5.3발). 탄 풀링(Mesh 32개 재사용, scene.add/remove 반복 제거). 명중 판정을 "이전 위치→현재 위치 선분 vs 적 구" 스윕으로 바꾸고 반경은 적 스케일에 비례(현재 고정 5). 단계별 탄 외형: 불씨 → 용암 덩어리 → 화염 빔 → 황금 태양불(머티리얼 색·크기만 우선 바꾸고 VFX 에셋은 나중).
2. **타깃 락온(LOCK)**: 탭 = 토글. 화면 중앙 반경 12%(화면 짧은 변 기준) 안 + 250m 이내에서 중앙에 가장 가까운 적을 고정. 화면에 락온 링을 표시합니다. 연사 탄이 초당 4rad로 유도됩니다. 대상이 죽거나 300m 이상 멀어지거나 카메라 뒤로 가면 해제합니다.
3. **화염 대시(BOOST)**: 1.2초 속도 x2.2, FOV 60→70 트윈, 궤적 파티클, 궤적에 닿은 적에게 5dmg(적별 0.3초 간격). 쿨 4초. 디렉터 결정 2의 Shift 동작도 여기서 처리합니다.
4. **배럴롤 회피(DODGE)**: 0.4초 무적, 조이스틱 X 방향(0이면 오른쪽)으로 12m 측면 이동(easeOut), `visualSlot.rotation.z` 360° 롤. 쿨 3초. **회피가 의미 있도록 적 원거리 공격을 함께 추가**합니다: 적이 40~150m에서 3~5초마다 느린 화염구(35m/s, 8dmg, 0.8초 예고 발광) 발사. 현재는 접촉 피해만 있어 회피할 대상이 없습니다(37행 `d<23`).
5. **마그마 메테오(SKILL1, 2단계)**: 락온 대상 또는 십자선 지면 착탄점에 0.6초 낙하 후 반경 8m 120dmg + 화상 2초. 착탄 예고 원 표시.
6. **화염 방패(SKILL2, 3단계)**: 3초 피해 70% 흡수, 접촉 적 화상. 반투명 구 셰이더(프레넬) 1개.
7. **화염 토네이도(3단계, 메테오 강화)**: 3단계 해금 후 메테오 착탄 지점에 3초 토네이도, 반경 15m 적을 초당 18m로 중심으로 끌어당김. 별도 버튼 없음.
8. **선폴(ULT, 4단계/피날레)**: 게이지는 처치당 +4(3단계부터 누적)이며, 피날레 진입 시 100%로 충전합니다. 4초간 하늘에서 빛기둥 + 전방 원뿔(30°, 60m) 초당 80dmg.

- 폭풍 분기는 이번 범위에서 같은 스킬에 청록 색상 + 수치 보정(대시 쿨 -1초)만 적용합니다. 전용 스킬은 SKILLS.md 확정 후 추가합니다.

**완료 기준**
- 각 스킬: 버튼/키 1회 입력 → 효과 → 쿨다운 게이지 → 재사용 가능을 PC와 터치에서 모두 확인.
- 해금 전 스킬 버튼은 숨김 또는 잠금 표시.
- 락온 + 연사 시 측면으로 움직이는 적에 탄이 유도되어 명중한다.
- 배럴롤 무적 0.4초 동안 적 화염구 피해 0(디버그 로그로 확인).
- 30초 연사 중 `renderer.info.memory.geometries`가 계속 증가하지 않는다(탄 풀링 확인).

---

## T8. [P1] 결과 화면·재시작·저장 정리
**목표** 요구사항 "결과 화면(경로·성과·재화) → 재시작, 재화 저장"을 완성합니다.

**대상** 신규 `save.js`, `game.js` `finish()`(31행), 재시작(30행 `location.reload()`), 27행 `localStorage` 직접 접근, `index.html #result`

**구현**
1. `save.js`: 키 `dragonEmpire.save.v1`, `{version:1, crystals, bestStage, bestTimeSec, runs, settings:{quality, sens, invertY}}`. 모든 접근을 try/catch로 감싸고, 실패하면 메모리 저장으로 폴백합니다(개인정보 보호 모드, file://, 저장공간 가득 참). 최초 로드 시 구버전 키 `dragonEmpireCoins`를 이전하고 삭제합니다.
2. `run` 객체 하나로 판 상태를 관리합니다: `{startTime, path, stagesReached:[{stage, atSec}], kills, maxLevel, damageDealt, crystalsEarned, revived}`.
3. 결과 화면 표시 항목:
   - **진화 경로**(예: 불씨 해츨링 → 마그마 드레이크(화염) → 인페르노 웜 → 드래곤 엠페러). 단계 아이콘 자리는 비워 두고 텍스트 우선
   - 처치 수, 최고 레벨, 플레이 시간, 이번 판 획득 결정, 누적 결정, 최고 기록 갱신 표시
   - 버튼: `다시 비행하기`, (T9) `광고 보고 보상 2배`, 패배 시 `광고 보고 부활`
4. 재화 공식(초기값): 승리 100 + 처치×5 + 단계×20, 패배 15 + 처치×5 + 단계×20.
5. **재시작을 `location.reload()` 없이** `resetRun()`으로 처리합니다: 적·탄·파티클 초기화, 플레이어 1단계 visual, run 초기화, HUD 갱신. GLB 캐시는 유지합니다(Capacitor에서 리로드하면 에셋을 다시 로드해야 함).
6. 결과 화면이 뜨면 `#touch-ui` 숨김, `clearInput()`.

**완료 기준**
- 승리/패배 각각 결과 화면에 경로·처치·시간·획득·누적 결정이 표시된다.
- 결정 수가 새로고침 후에도 유지된다. 시크릿 창에서 저장이 막혀도 게임이 멈추지 않는다.
- 재시작을 5회 반복해도 `renderer.info.memory.geometries/textures`가 계속 늘지 않는다.
- 구버전 키에 저장된 결정이 새 저장으로 이전된다.

---

## T9. [P2] 보상형 광고 훅 — 빈 인터페이스만 (SDK 연동 금지)
**목표** 나중에 Capacitor AdMob 플러그인을 이 인터페이스 뒤에 붙일 수 있게 합니다. 지금은 **실제 SDK, 네트워크 요청, 광고 ID를 넣지 않습니다**.

**대상** 신규 `ads.js`, `game.js`(부활/보상 2배/ULT 충전 지점), 결과 화면

**구현**
```js
// ads.js
export const AdPlacement = { REVIVE:'revive', DOUBLE_REWARD:'double_reward', ULT_CHARGE:'ult_charge' };
/** provider 인터페이스: { name, init():Promise<void>, isAvailable(placement):boolean,
 *   show(placement):Promise<{rewarded:boolean, reason?:'unavailable'|'closed'|'error'|'timeout'}> } */
const NoAdsProvider  = { name:'none', async init(){}, isAvailable:()=>false, async show(){ return {rewarded:false, reason:'unavailable'}; } };
const MockAdsProvider = { /* ?ads=mock 일 때만: 2초 '테스트 광고' 오버레이 → 닫기/완료 버튼으로 rewarded true/false */ };
export function setAdsProvider(p) {}
export function isRewardedAvailable(placement) {}
export async function showRewarded(placement) {} // 동시에 2개 호출 방지, 15초 타임아웃
export function onAdLifecycle(cb) {} // 'start'|'end' — 게임 일시정지/재개, 오디오 음소거용
```
- 게임은 `showRewarded()`를 호출하기 전에 일시정지하고 `clearInput()`합니다. **보상은 `rewarded:true`일 때만 지급**합니다. 실패하거나 닫히면 원래 화면으로 돌아갑니다.
- 부활: 판당 1회, HP 60%, 3초 무적, 반경 30m 적 밀어내기. 보상 2배: 결과 화면에서 1회, 이번 판 획득분만 2배. ULT 충전: 3단계 이상, 판당 1회.
- 기본 provider는 `none`이고 이때 광고 버튼을 **숨깁니다**. `?ads=mock`에서만 버튼이 보입니다.
- 이후 AdMob 연동 시 `capacitor-admob-provider.js`만 추가하면 되도록 game.js는 `ads.js`만 import합니다.

**완료 기준**
- 기본 실행: 광고 버튼이 전혀 보이지 않고 콘솔 에러가 없다.
- `?ads=mock`: 부활 → 완료 시 부활, 닫기 시 결과 화면 유지, 보상 2배 → 결정 저장값이 정확히 2배(중복 지급 없음, 버튼 연타 테스트).
- 광고 중 게임 시간, 적, 쿨다운이 진행되지 않는다.

---

## T10. [P2] 앱 생명주기·오프라인·Capacitor 준비
**목표** Capacitor로 포장했을 때 문제가 생기지 않게 미리 정리합니다.

**대상** `style.css` 1행, `game.js` 35행(blur), `index.html`, 신규 `capacitor.config.json`(3주차, 이번에는 문서화만 해도 됨)

**구현**
1. `style.css` 1행의 Google Fonts `@import`(외부 네트워크)를 제거합니다. 오프라인 앱에서 폰트가 늦게 뜨거나 깨집니다. Noto Sans KR woff2 서브셋을 로컬(`fonts/`)에 두거나 시스템 폰트 스택을 씁니다. 라이선스(OFL) 파일을 함께 둡니다.
2. `document.visibilitychange`(hidden)에서 일시정지 + `clearInput()` + 오디오 정지를 합니다. 현재 35행은 `blur`만 처리하므로 모바일 앱 백그라운드 전환에서 누락될 수 있습니다. Capacitor `App.addListener('appStateChange')` 와 안드로이드 뒤로가기(`backButton` → 일시정지 메뉴, 일시정지 중이면 종료 확인)는 3주차에 연결 지점만 함수로 만들어 둡니다.
3. `webglcontextlost`에서 `preventDefault()` + 일시정지 + "그래픽을 복구하는 중" 표시, `webglcontextrestored`에서 재시작 안내를 띄웁니다.
4. 가로 화면 고정(Capacitor `screenOrientation` 또는 AndroidManifest `sensorLandscape`)은 3주차 문서에 기록합니다.
5. 시작 화면의 "PC 키보드와 마우스 권장" 문구와 `.instructions`를 터치 기기에서는 터치 조작 안내로 바꿉니다.

**완료 기준**
- 네트워크를 끊고(DevTools Offline) 새로고침해도 폰트 대기 없이 즉시 시작 화면이 뜬다(서버는 로컬).
- 안드로이드 Chrome에서 홈 버튼 → 복귀 시 일시정지 화면이고 입력이 눌린 채로 남지 않는다.
- DevTools `WEBGL_lose_context` 확장으로 컨텍스트 손실 시 페이지가 멈추지 않고 안내가 뜬다.

---

## T11. [P2] QA 지원 디버그 플래그
**목표** 사람 테스터와 QA가 빠르게 재현할 수 있게 합니다.

**구현** URL 파라미터 `?debug=1`(T5 오버레이), `?fast=1`(XP 5배), `?god=1`(무적), `?stage=N`(N단계로 시작, 분기는 `&path=flame|storm`), `?assets=off`, `?touch=1`, `?ads=mock`, `?fps=30`(rAF 스로틀), `?seed=N`(적 스폰 시드 고정). 릴리스 빌드에서는 `config.DEBUG=false`일 때 모두 무시합니다.

**완료 기준** 각 플래그가 단독/조합으로 동작하고, `DEBUG=false`일 때 모두 무시된다.

---

## 작업 순서 요약
T1 → T2 → T3 → T4 (= 이번 주: 휴대폰 브라우저에서 플레이 가능) → T5 → T6 → T7 → T8 (= 2주차) → T9 → T10 → T11 (= 3주차 초, Capacitor 전)
T11의 `?fast`, `?debug`는 T5/T6 작업 중에 먼저 만들어도 됩니다.
