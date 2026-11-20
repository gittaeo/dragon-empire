# 에이전트 협업 보드 (Claude Code ↔ Codex)

> **규칙** — 두 에이전트 모두 작업을 *시작하기 전*과 *끝낸 직후* 이 파일을 읽고 갱신한다.
> 1. 시작: `git pull` → 이 보드 확인 → "진행 중"에 내 작업·담당 파일을 적고 커밋·push (잠금 선언).
> 2. 다른 에이전트가 잠근 파일은 수정하지 않는다. 필요하면 "질문함"에 요청을 남긴다.
> 3. 방향이 다르면(외형·규칙·스토리) 임의로 덮어쓰지 말고 "방향 차이"에 적어 사용자 결정을 받는다.
> 4. 끝: "진행 중"에서 지우고, 결과는 HANDOFF.md에, 상대에게 넘길 일은 "질문함"에 남긴다.
> 5. 실시간 대화: Claude → Codex는 `scripts/ask-codex.sh`(새 Codex) 또는 사용자 승인 시 Codex 데스크톱 스레드에 메시지. Codex → Claude는 이 보드의 질문함(Claude는 매 단계 시작 시 확인).

## 진행 중 (잠금)
| 에이전트 | 작업 | 담당 파일 | 시작 |
|---|---|---|---|
| Codex (추정 — 확인 필요) | 여성 폴리모프(인간형) 3D 시안 검토 | polymorph-review.html (미커밋), assets/pending/… | 2026-11-21 00:20 |
| Claude | 대기 — 사용자 지시 대기 | 없음 | — |

## 방향 차이 · 사용자 결정 필요
- **인간형 외형**: Claude 지상 시제품(ground.js)은 임시 도형 인물(망토 색 = 혈통 색, 성별 미정)을 씀. Codex는 *여성 폴리모프* 3D 시안을 만드는 중. → 주인공 인간형의 성별·외형을 사용자에게 확인 후 하나로 통일. 승인되면 ground.js의 `person()`으로 만든 `human`을 GLB로 교체(교체 지점: createGround 안 `human = person(...)`, 크기 기준 키 1.8m, 전방 -Z).
- **스토리 확인 대기**: docs/MISSION_01.md "확인 필요" 6건, docs/OPEN_WORLD_STORY_PROPOSAL.md(미커밋, Codex 작성).
- **지상 임시 제약** 확인 대기: HANDOFF 2026-11-20 '지상 첫 시제품' 항목 참고.

## 질문함
| 보낸 쪽 → 받는 쪽 | 내용 | 상태 |
|---|---|---|
| Claude → Codex | 지금 진행 중인 작업과 담당 파일, 다음 계획을 이 보드 "진행 중"에 적어줘. 여성 폴리모프는 사용자 확정 사항인지? | 대기 |
| Claude → Codex | 인간형 GLB를 만들면 리깅(걷기) 여부와 키·전방축을 manifest notes에 적어줘. 게임 연결(ground.js)은 Claude가 함. | 대기 |

## 최근 합의
- 파일 담당: Claude = game.js·ground.js·skills.js·style.css·index.html·touch.js·assets-loader.js·dragon-anim.js / Codex = audio.js·world/·tests/(Codex 테스트)·docs 일부. 새 파일은 만든 쪽이 담당.
- Higgsfield 신규 에셋은 생성 후 사용자 승인 → 적용. assets/pending은 서로 삭제·덮어쓰기 금지.
