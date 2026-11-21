# itch.io HTML5 출시 준비안 — 풍향탑의 세 밤

2026-11-21 · Codex → Claude · 체크리스트와 페이지 문안 초안. 공개 업로드는 아직 승인되지 않았으며 실행하지 않는다.

## 패키지와 검증

- [ ] 출시할 기능과 진입점을 고정한다. 현재 세 밤은 `?mode=nights`로 진입하므로 ZIP의 `index.html`에서 세 밤이 실제 기본 진입하는 빌드를 별도로 만들고 검증한다. 쿼리 전달을 itch 임베드가 보장한다고 가정하지 않는다. 탐험 모드 노출 여부는 사용자 결정에 따른다.
- [ ] HTML5 프로젝트의 ZIP 최상위에 `index.html`과 실행에 필요한 JS·CSS·vendor·월드·승인 에셋을 넣는다. 경로는 상대경로, 파일명 대소문자를 실제 배포 환경에서 검사한다. `assets/pending`, 미승인 에셋, 테스트·개발 문서, Git 메타데이터와 비밀정보는 제외한다.
- [ ] ZIP 압축 해제 후 파일 수 1,000개 이하, 총 용량 500MB 이하, 단일 파일 200MB 이하, 경로 포함 이름 240자 이하 및 UTF-8 이름인지 확인한다. 게시 직전 최신 [itch.io HTML5 공식 지침](https://itch.io/docs/creators/html5)을 재확인한다.
- [ ] 출시 후보 ZIP의 압축·압축 해제 용량, 실제 초기 네트워크 다운로드 양, GLB별 크기와 합계, 가장 큰 텍스처 및 로딩 시간을 측정해 기록한다. 참고: 현재 로컬 `assets/approved/` 전체 23개 파일 약 20.75MB는 **출시 ZIP 크기나 실제 다운로드량이 아니다**.
- [ ] 느린 네트워크에서 로딩 중 진행/안내, 실패 및 재시도, WebGL 미지원 시 안내를 확인한다. 기존 로딩 UI 유무와 진행률 정확성은 별도 확인. 무한 로딩·검은 화면은 출시 차단.
- [ ] `node --test tests/*.test.mjs`로 단위 테스트만 실행한다. Playwright `tests/nights-play.cjs`는 별도 서버·의존성·Chrome이 필요한 계측형 검증으로 따로 실행한다. `node --test tests/`는 자동 완주 `.cjs`까지 포함할 수 있다.

## 브라우저와 조작

- [ ] Windows Chrome·Edge에서 실제 itch 임베드의 첫 실행, 포커스, WASD·우클릭 시점, 브레스, 오디오 잠금 해제, 일시정지·재시작·전체화면을 확인한다. Firefox 및 macOS Safari도 가능한 장비에서 확인하고 미검증 환경은 지원 확약하지 않는다.
- [ ] 팝업/탭 전환/복귀, 창 크기 변경, 저사양 성능과 WebGL 문맥 손실, 로컬 저장 차단 및 저장 범위를 확인한다. itch iframe에서 저장과 오디오의 실제 동작은 별도 검증한다.
- [ ] 모바일 Android Chrome·iOS Safari는 실제 기기에서 가로/세로 UI, 터치 조작, 발열·FPS, 전체 3밤 완주가 통과하기 전까지 **지원 확약 금지**. 페이지에 'PC 키보드·마우스 권장, 모바일 실험 중'이라고 표시한다. 터치가 부족하면 PC 전용으로 한정한다.
- [ ] 사용자 동의 전 외부 공개하지 않는다. 비공개/제한 접근 검증이 가능한지 계정과 itch 현재 설정에서 직접 확인 후 사용한다. 업로드·공개는 별도 결정.

## 캡처 계획

실제 출시 후보 빌드에서 동일한 HUD·에셋으로 캡처한다. 사용자 인터페이스를 숨기거나 개발자 도구로 상태를 바꾼 장면은 설명에 밝힌다.

1. 낮: 여성 폴리모프가 채집하고 작업대 선택을 하는 장면.
2. 밤: 용의 비행과 예보 방향·습격자 경고가 읽히는 장면.
3. 방어막이 적을 막아내는 장면.
4. 루세르나의 탑 공격 예고와 주황 등불 요격 장면.
5. 3밤 승리 화면과 엠페러 장면. 짧은 GIF/WebP 또는 영상은 실제 플레이 기반으로 별도 제작한다.

## 게임 페이지 문구 초안

### 한국어

**드래곤 엠파이어: 풍향탑의 세 밤**

낮에는 인간의 모습으로 재료를 모아 풍향탑을 준비하고, 밤에는 용으로 하늘에 올라 등불 군단을 막아내세요. 세 번의 밤을 버티며 진화하고, 마지막에는 등불의 여왕 루세르나와 맞섭니다.

PC 브라우저에서 키보드와 마우스로 플레이하는 개발 중인 게임입니다. 모바일 지원은 검증 중입니다. 플레이 시간과 지원 환경은 출시 전 실제 테스트를 바탕으로 확정합니다.

### English

**Dragon Empire: Three Nights of the Wind Tower**

Gather resources in human form and prepare the Wind Tower by day. At night, take to the skies as a dragon and defend it from the Lantern Legion. Evolve across three nights and face Lucerna, the Lantern Queen.

This browser game is in development and is designed for keyboard and mouse on PC. Mobile support is still being tested. Playtime and supported environments will be confirmed after testing.

## 출시 직전 확인

- [ ] 인간형 모델 정면·W/S 조작, 채집 동선, 방어막 표시, 보스 예고 가독성을 사람 손으로 확인한다.
- [ ] 사용 승인된 에셋과 상업적 이용 조건·표기 요건을 각각 확인한다. 자동 생성 에셋의 이용 가능성을 미확인 상태로 단정하지 않는다.
- [ ] 캡처, 소개 문구, 출시 빌드의 기능 일치 여부를 검토한다. `[재현 seed]`·개발용 URL을 공개 제품 기능으로 오인하게 적지 않는다.
- [ ] 플랫폼 페이지 미리보기, 썸네일, 크레딧·지원 연락처, 가격/기부 및 공개 여부는 사용자가 결정한다. 플랫폼의 현재 결제 옵션은 [공식 문서](https://itch.io/docs/creators/html5)에서 확인한다.
