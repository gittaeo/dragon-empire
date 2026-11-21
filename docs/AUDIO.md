# 절차적 오디오 연결

`audio.js`는 파일이나 네트워크 요청 없이 Web Audio로 소리를 합성합니다. 첫 키보드·포인터·터치 입력에서 AudioContext를 만들고 재개합니다. 브라우저의 자동재생 제한에 따라 입력 전의 효과음은 재생하지 않습니다.

```js
import { createAudio } from './audio.js';
const audio = createAudio();
// 적 위치는 플레이어(청취자)를 기준으로 한 상대 좌표(m)입니다.
audio.play('hit', { x: enemy.x - player.x, y: enemy.y - player.y,
  z: enemy.z - player.z, volume: 0.8 });
audio.play('breath_flame');
audio.stop('assault_warn'); // 해당 이름의 재생 중인 인스턴스 전부 즉시 중단
audio.startAmbience(stage); // 1~4, 단계가 바뀌면 교체
audio.setMaster(0.7);      // 0~1, 음소거와 별도로 유지
audio.mute(true);          // 마스터 설정과 음소거는 로컬에 저장
audio.stopAmbience();      // 일시정지 또는 판 종료
```

`play()`는 재생을 시작하면 `true`, 잠김·음소거·이름 오류·초당 제한·실패 시 `false`를 반환합니다. 같은 소리는 종류별 초당 제한이 있고 소리마다 최대 1~12회입니다. 소스 위치를 생략하면 청취자 위치에서 들립니다. 거리가 커질수록 감쇠하며 X축 상대 좌표로 좌우 팬을 적용합니다. 현재 카메라 회전에 따른 팬 변환은 호출자가 처리해야 합니다. `localStorage` 사용이 막히면 메모리 설정만 유지합니다.

`stop(name)`은 해당 효과음의 활성 오디오 소스를 즉시 정지하고 정지된 소스 수를 돌려줍니다(없으면 0). 같은 이름의 빈도 제한은 초기화됩니다. 다른 효과음·환경음은 건드리지 않고, 중단된 소리는 자동 재개하지 않습니다. `assault_warn`은 일시정지 때 중지한 후 무음으로 남기거나 게임 경고의 남은 시간에 맞춘 별도 재개 처리가 필요합니다.

청음: 로컬 서버 실행 후 `/audio-test.html`을 열고 버튼을 누릅니다. 이어폰/기기와 음량에 따라 소리가 다르므로 실제 기기에서 검사하세요. 개발용 청음 UI는 저장된 볼륨 설정을 시각적으로 불러오지 않으므로 슬라이더를 움직이기 전에도 저장값이 적용될 수 있습니다.
