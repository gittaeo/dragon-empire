# 드래곤 엠파이어 — 3D 에셋 목록
관리: 3D 아트/VFX 리드 (Claude) · 2026-11-20

## 에셋 표
| id | 파일 | 출처 (Higgsfield 모델 / job id) | 상업적 이용 | rigged | 삼각형 | 용량 | 전방축 | 승인 |
|---|---|---|---|---|---|---|---|---|
| dragon_hatchling | assets/pending/dragon_hatchling.glb (**아직 PC에 없음, 아래 참고**) | 3D: `image_to_3d`(Meshy) job 564c7d41-a30a-4506-9ec2-8744df3262aa · 소스 이미지: `gpt_image_2_6` job cb86d5e1-c7bc-4578-827d-2f3f4f31bc88 (기준 콘셉트 b88aaf9a) | 가능 (Higgsfield 약관상 결과물 소유권 사용자, 상업 이용 제한 없음) | 아니오 (스킨/애니메이션 0) | 25,729 (정점 33,807) | 2.07 MB (1024² 텍스처 최적화본) / 원본 14.2 MB (2048²) | +Z (위 +Y, 날개 ±X) | 대기 |

### dragon_hatchling 상세
- 메시 1개, 노드 1개, 머티리얼 1개(`Material_0`, OPAQUE, doubleSided): baseColor + metallicRoughness + normal + emissive 텍스처 4장. emissiveFactor [1,1,1] — 용암 균열이 emissive 맵으로 들어 있어 블룸과 잘 맞음.
- 바운딩 박스(원점 중심): 폭 X 1.90 × 높이 Y 1.16 × 길이 Z 1.41 (단위 m 가정). 게임 배율 1.0 기준이면 `scale ≈ 1.0`.
- 최적화본은 텍스처만 2048→1024 JPEG(q88)로 재인코딩, 지오메트리 동일.
- 생성기 표기: Khronos glTF Blender I/O. Draco/meshopt 압축 없음(추가 압축 시 ~1MB 이하 가능).
- 비고: 소스 이미지의 뿔이 기준 콘셉트(짧은 뒤로 넘긴 뿔)보다 크고 앞으로 휘어 있음 → 승인 시 확인 필요. 꼬리가 측면으로 말려 있어 비행 포즈에서는 꼬리를 뒤로 펴는 보정이 없음.

### 파일 전달 상태 (중요)
작업 컨테이너에서 Higgsfield CDN(cloudfront) 다운로드가 네트워크 정책으로 차단되어 GLB/PNG를 PC에 직접 쓰지 못함. 아래 번들을 수동으로 받아 `assets/pending/`에 풀어 주세요.
- 번들 ZIP (16.6 MB): https://d2ol7oe51mr4n9.cloudfront.net/user_3JaPZqTOTki2EO4zteaZiI4qGMy/2177d581-bc90-4682-90c4-0d92d6f1a1b1.zip
  - `dragon_hatchling.glb`(1k 최적화본, 2.07MB) · `dragon_hatchling_2k_original.glb` · `dragon_hatchling_source.png` · `previews/{front,side,top,three_quarter}.png` · `inspect_report.json`
- 원본 GLB: https://d8j0ntlcm91z4.cloudfront.net/user_3JaPZqTOTki2EO4zteaZiI4qGMy/hf_20261119_174311_564c7d41-a30a-4506-9ec2-8744df3262aa.glb
- 소스 이미지: https://d8j0ntlcm91z4.cloudfront.net/user_3JaPZqTOTki2EO4zteaZiI4qGMy/hf_20261119_173845_cb86d5e1-c7bc-4578-827d-2f3f4f31bc88.png

## Codex용: 리깅 없이 날갯짓 (Three.js)
1. 날개는 메시 분리가 안 되어 있으므로 **버텍스 셰이더 방식** 권장: `material.onBeforeCompile`에서 `transformed`에 대해 `float s = smoothstep(0.25, 0.95, abs(position.x));` (몸통 반폭≈0.25, 날개끝≈0.95)로 날개 가중치를 구함.
2. 날개 회전: `float a = sin(uTime*uFlapSpeed) * 0.6 * s;` → 몸통 축(X=±0.25) 기준으로 `y' = y + (abs(x)-0.25)*sin(a)`, `x' = sign(x)*(0.25 + (abs(x)-0.25)*cos(a))` 적용, `y > 0.0`(등 위쪽) 영역만 가중해 다리 흔들림 방지.
3. 노멀도 같은 각도로 회전(`objectNormal`)해야 조명이 맞음. `uFlapSpeed`: 활공 2.0, 상승 7.0 rad/s, 대시 시 진폭 0.3로 축소.
4. 대안(정밀): Blender에서 x>0.25 & y>0 영역을 별도 오브젝트 `Wing_L/Wing_R`로 분리하고 피벗을 어깨로 옮겨 GLB 재내보내기 → 런타임에 `wing.rotation.z = ±sin(t)*0.6`.
5. 전방축 +Z이므로 비행 방향 정렬 시 `dragon.lookAt(pos + velocity)` 그대로 사용 가능(Three.js `lookAt`은 Object3D의 +Z를 목표로 향함).

## 적·보스 (2026-11-20 사용자 승인)
| id | 파일 | 출처 (Higgsfield Meshy 7 image_to_3d job) | 상업적 이용 | rigged | 삼각형 | 용량(1024 JPEG) | 전방축 |
|---|---|---|---|---|---|---|---|
| enemy_lantern_moth | assets/approved/enemies/lantern_moth.glb | 904eace7-b2e6-4787-a3dd-df193feb9b8c | 가능 | 아니오 | 4,949 | 0.62 MB | +Z |
| enemy_lantern_rider | assets/approved/enemies/lantern_rider.glb | e9064cba-14fe-4e5b-ad0d-ce7fc7021324 | 가능 | 아니오 | 8,302 | 0.82 MB | +Z |
| enemy_chain_knight | assets/approved/enemies/chain_knight.glb | 53b6dade-1b21-476e-a105-737da7e01091 | 가능 | 아니오 | 8,224 | 0.94 MB | +Z |
| boss_lucerna | assets/approved/enemies/boss_lucerna.glb | 29d5a0bf-c17f-457c-a200-cd85cd7a3030 | 가능 | 아니오 | 25,826 | 2.34 MB | +Z |
- 소스: assets/pending/concepts/lantern_minions.png, boss_lucerna.png 에서 정면 1장씩 크롭(뒷면은 AI 추정). 원본 2048 GLB는 assets/pending/models/enemies(git 제외).
- 압축: `node scripts/shrink-glb.mjs in.glb out.glb 1024` (sharp, 지오메트리 동일).
- 게임 연출: 리깅 없음 → 롤·나방 scale 날갯짓, 텍스처 emissive 0.35(보스 0.45)로 등불 발광. 적 크기 단계별 ×1/1.3/1.65/2.

## 단계별 드래곤 (2026-11-20 사용자 승인)
| id | 파일 | 출처 | 삼각형 | 용량(1024 JPEG, PBR 3장) | 전방축 |
|---|---|---|---|---|---|
| dragon_drake | assets/approved/dragon_drake.glb | gpt_image_2_6 d8761c1f → Meshy7 d5340204 | 25.9k | 2.22 MB | +Z |
| dragon_wyrm | assets/approved/dragon_wyrm.glb | gpt_image_2_6 3f2cdaa6 → Meshy7 47b96edf | 25.9k | 2.35 MB | +Z |
| dragon_emperor | assets/approved/dragon_emperor.glb | gpt_image_2_6 0bab74c4 → Meshy7 e4f6f3a8 | 25.9k | 2.54 MB | +Z |
- 소스: assets/pending/concepts/evolution_lineup.png + dragon_hatchling_source.png 참고로 단계별 정면 3/4·날개 펼친 이미지 생성 후 3D화. 원본 GLB는 assets/pending/models/evolution.
- 발광 맵 없음 → game.js에서 색 텍스처를 emissiveMap으로 약하게(0.16~0.34) 사용. 날갯짓은 dragon-anim.js 셰이더 리그(단계별 프레임 확인).
- 사용자 피드백(머리 잔가시 과다 → 매끈한 머리 + 큰 뿔 2개)으로 웜·엠페러 재생성 진행 중(61e49281/585ec2c4 이미지 → 3D 7254b9e3/a5296fd8).
