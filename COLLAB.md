# 드래곤 엠파이어 — 릴레이 개발 규칙 (Codex ⇄ Claude Code)

> 2026-11-20 사용자 결정으로 **역할 분담 방식 → 릴레이 방식**으로 변경.
> 두 에이전트 모두 코드·에셋·문서 전부를 다룬다. 토큰이 떨어진 쪽이 멈추고, 다른 쪽이 git에서 이어받는다.

## 저장소
- https://github.com/gittaeo/dragon-empire (main 브랜치)
- 로컬: D:/codex_civilization/dragon-empire

## 바통 터치 절차 (매 세션 필수)
1. **시작**: `git pull` → `docs/HANDOFF.md` 맨 위 항목 읽기 → `docs/TASKS_FOR_CODEX.md`(공용 작업 목록)에서 다음 미완 작업 선택.
2. **작업 중**: 작은 단위로 커밋. 커밋 메시지 접두어 `[codex]` 또는 `[claude]`.
3. **종료 전(토큰 소진 예상 시 미리)**: `docs/HANDOFF.md` 맨 위에 항목 추가 → 커밋 → `git push`.
   - 항목 형식: 날짜·작성자 / 한 일 / 진행 중이던 일(파일·함수) / 다음에 할 일 / 알려진 문제 / 테스트 여부
4. push 실패(충돌) 시 `git pull --rebase` 후 해결해서 다시 push. 상대 작업을 덮어쓰지 않는다.

## 확정된 방향
- 비주얼: **시네마틱 스타일라이즈드**. `concepts/realistic-dragon-review.glb`, `concepts/sky-realm.png`는 미승인.
- 타깃: 모바일(안드로이드 우선, Capacitor) — PC 조작은 개발용 유지.
- 설계 기준 문서: docs/SKILLS.md, docs/BALANCE.md, docs/WORLD.md, docs/VFX.md, docs/ROADMAP.md, docs/QA.md

## 에셋 규칙
- Higgsfield 에셋 URL은 `assets/remote-assets.json` 에 기록 → `node scripts/fetch-assets.mjs` 로 `assets/pending/` 에 다운로드.
  (Claude Code 클라우드 환경은 Higgsfield CDN 다운로드가 막혀 있어 URL만 기록하고, 다운로드는 로컬/Codex에서 실행)
- 사용자 승인된 에셋만 `assets/approved/` + `assets/manifest.json` 등록 → 게임에서 로드, 실패 시 도형 폴백.
- 큰 원본(>10MB)은 git에 올리지 말고 압축본만 커밋(.gitignore: assets/pending/models/*_raw.glb).
- 출처·사용조건은 assets/ASSETS.md 에 기록(Higgsfield 결과물: 상업적 이용 가능).
- 비밀키·토큰을 코드나 문서에 넣지 않는다.

## 금지
- 공개 배포·커뮤니티 게시, 뽑기·결제 구현(설계만), 테스트하지 않은 항목을 통과로 기록.
