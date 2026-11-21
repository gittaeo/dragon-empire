# 승인 에셋 출처·라이선스 확인 대장

2026-11-21 · 조사 대상 `assets/approved/`(GLB 14개, 텍스처 8개). 게임 적용 승인과 상업적 이용 권리 확인은 별개다. 이 문서는 출시 승인이 아니다.

근거: `assets/manifest.json`, `assets/approved/env/env_assets.json`, `assets/ASSETS.md`. 저장소의 일부 오래된 기록은 교체 전 버전일 수 있으므로 아래 job은 현재 매니페스트 우선. 각 GLB에 내장된 재질 텍스처는 해당 GLB와 동일한 생성 경로로 기록하며 세부 구성·제3자 권리·출력별 약관은 미확인.

[Higgsfield 공식 안내](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)는 생성 결과의 상업적 사용을 제한하지 않는다고 설명한다. 적용 계정·당시 서비스/모델 조건·입력 이미지 권리·모델별 별도 조건은 아래 모든 항목에서 **개별 확인 필요**. 저장소의 '상업 이용 가능' 표기만으로 제3자 권리까지 확정하지 않는다. [OpenAI 개인 서비스 약관](https://openai.com/policies/row-terms-of-use/)은 OpenAI와 사용자 간 결과물 권리를 규정하지만, Higgsfield 경유 생성물의 실제 계약을 대신 확인하지 않는다.

| 파일 (`assets/approved/` 기준) | 출처 기록 | 상업 이용 조건·입력 권리 |
|---|---|---|
| dragon_hatchling.glb | Higgsfield Meshy 564c7d41, 소스 이미지 cb86d5e1 | 공통 개별 확인 필요 |
| dragon_drake.glb | Higgsfield gpt_image_2_6 → Meshy 7 d5340204 | 공통 개별 확인 필요 |
| dragon_wyrm.glb | Higgsfield gpt_image_2_6 61e49281 → Meshy 7 7254b9e3 | 공통 개별 확인 필요 |
| dragon_emperor.glb | Higgsfield gpt_image_2_6 585ec2c4 → Meshy 7 a5296fd8 | 공통 개별 확인 필요 |
| polymorph_female.glb | Codex 이미지 콘셉트 → Higgsfield image_to_3d·인간형 리깅. 매니페스트와 원본 콘셉트의 실제 생성 이력 대조 필요 | 공통 개별 확인 필요; 참고 이미지 권리·유사성 검토 필요 |
| enemies/lantern_moth.glb | Higgsfield Meshy 7 904eace7, 콘셉트 크롭 | 공통 개별 확인 필요 |
| enemies/lantern_rider.glb | Higgsfield Meshy 7 e9064cba, 콘셉트 크롭 | 공통 개별 확인 필요 |
| enemies/chain_knight.glb | Higgsfield Meshy 7 53b6dade, 콘셉트 크롭 | 공통 개별 확인 필요 |
| enemies/boss_lucerna.glb | Higgsfield Meshy 7 29d5a0bf, 콘셉트 크롭 | 공통 개별 확인 필요 |
| env/trees/conifer.glb | Higgsfield gpt_image_2_6 → Meshy ceaab71f | 공통 개별 확인 필요 |
| env/trees/broadleaf.glb | Higgsfield gpt_image_2_6 → Meshy c6329b16 | 공통 개별 확인 필요 |
| env/trees/blossom.glb | Higgsfield gpt_image_2_6 → Meshy c5525371 | 공통 개별 확인 필요 |
| env/rocks/granite.glb | Higgsfield gpt_image_2_6 → Meshy f38ac12e | 공통 개별 확인 필요 |
| env/rocks/cliff.glb | Higgsfield gpt_image_2_6 → Meshy c12d5336 | 공통 개별 확인 필요 |
| env/textures/meadow.jpg | gpt_image_2_6 226b9fea, 이음새 보정 | 공통 개별 확인 필요 |
| env/textures/meadow_n.jpg | meadow 이미지에서 생성한 노멀맵(환경 메타데이터) | 파생 입력 및 가공 도구 조건 미확인 |
| env/textures/cliff.jpg | gpt_image_2_6 3664b965, 이음새 보정 | 공통 개별 확인 필요 |
| env/textures/cliff_n.jpg | cliff 이미지에서 생성한 노멀맵 | 파생 입력 및 가공 도구 조건 미확인 |
| env/textures/snow.jpg | gpt_image_2_6 dc07a82d, 이음새 보정 | 공통 개별 확인 필요 |
| env/textures/snow_n.jpg | snow 이미지에서 생성한 노멀맵 | 파생 입력 및 가공 도구 조건 미확인 |
| env/textures/path.jpg | gpt_image_2_6 1170bf8b, 이음새 보정 | 공통 개별 확인 필요 |
| env/textures/path_n.jpg | path 이미지에서 생성한 노멀맵 | 파생 입력 및 가공 도구 조건 미확인 |

환경 텍스처의 모델·ID는 `env_assets.json` 기록이며 실제 생성 계정·경유 서비스는 별도 확인. 메타데이터의 원본 bytes는 현재 압축 파일 크기와 다를 수 있다. `env/env_assets.json` 자체도 배포에 포함되므로 텍스트 출처와 민감 정보 여부 확인.

## 출시 전 확인할 증빙

- [ ] 각 생성 job의 계정·원본·적용 약관·플랜과 제3자 모델 추가 조건을 보존한다.
- [ ] 사용자 제공 캐릭터 참고 이미지와 다른 콘셉트 입력의 사용 권리 및 최종 모델과의 유사성을 검토한다.
- [ ] 3D·텍스처 변환에 사용한 도구 및 폰트, Three.js와 addons의 라이선스·고지 의무를 별도로 확인한다. `vendor/THREE-LICENSE.txt`는 빌드에 포함된다.
- [ ] 실제 배포 ZIP에 포함된 파일과 이 대장을 대조하고 미확인 항목의 상태 및 확인 날짜를 갱신한다.
