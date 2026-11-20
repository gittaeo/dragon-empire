// 모바일 터치 조작: 좌측 가상 조이스틱(이동), 우측 화면 드래그(시점), 우측 버튼(FIRE/BOOST/UP/DOWN) + 스킬(S1/S2/ULT).
// 멀티터치 지원. 키보드·마우스와 함께 동작하며, 터치 기기에서만 UI가 보인다.
export function createTouchControls({ onLook, onSkill }) {
  const state = { moveX: 0, moveY: 0, fire: false, boost: false, up: false, down: false, active: false };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.innerHTML = `
    <div class="tc-look"></div>
    <div class="tc-stick"><div class="tc-knob"></div></div>
    <div class="tc-buttons">
      <button data-k="up" aria-label="상승">▲</button>
      <button data-k="down" aria-label="하강">▼</button>
      <button data-k="boost" class="tc-boost" aria-label="가속">BOOST</button>
      <button data-k="fire" class="tc-fire" aria-label="브레스">FIRE</button>
    </div>
    <div class="tc-skills">
      <button data-s="skill1" aria-label="스킬1">S1</button>
      <button data-s="skill2" aria-label="스킬2">S2</button>
      <button data-s="ult" class="tc-ult" aria-label="궁극기">ULT</button>
    </div>`;
  document.body.appendChild(root);
  if (!isTouch) root.hidden = true;
  const stick = root.querySelector('.tc-stick'), knob = root.querySelector('.tc-knob'), look = root.querySelector('.tc-look');
  const R = 55; let stickId = null, sx = 0, sy = 0; const lookIds = new Map();

  // 조이스틱: 화면 왼쪽 아무 곳이나 누르면 그 자리에 스틱이 나타남
  look.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    try { look.setPointerCapture(e.pointerId); } catch {}
    if (e.clientX < innerWidth * 0.45 && stickId === null) {
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
      stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on');
    } else lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
    state.active = true;
  });
  look.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      state.moveX = dx / R; state.moveY = -dy / R;
    } else if (lookIds.has(e.pointerId)) {
      const p = lookIds.get(e.pointerId);
      onLook?.(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    }
  });
  const end = e => {
    if (e.pointerId === stickId) { stickId = null; state.moveX = state.moveY = 0; knob.style.transform = ''; stick.classList.remove('on'); }
    lookIds.delete(e.pointerId);
  };
  look.addEventListener('pointerup', end); look.addEventListener('pointercancel', end);

  for (const b of root.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} state[k] = true; b.classList.add('on'); state.active = true; });
    const off = () => { state[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
  // 스킬 버튼: 누르는 순간 1회 시전
  for (const b of root.querySelectorAll('[data-s]')) b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); onSkill?.(b.dataset.s); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); });
  return {
    state, isTouch,
    setVisible(v) { root.hidden = !v || !isTouch; },
    reset() { Object.assign(state, { moveX: 0, moveY: 0, fire: false, boost: false, up: false, down: false }); stickId = null; lookIds.clear(); knob.style.transform = ''; stick.classList.remove('on'); }
  };
}
