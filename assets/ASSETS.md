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
