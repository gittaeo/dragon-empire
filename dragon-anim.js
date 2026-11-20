// dragon-anim.js — 리깅 없는 드래곤 GLB용 절차적 스켈레톤(버텍스 셰이더 스키닝) + 비행 자세 애니메이터
// 좌표: 원본 GLB 로컬(+Z 전방, +Y 위, X 좌우). 가중치는 정점 원위치에서 매끄러운 함수로 계산하므로
// UV 이음매로 복제된 정점도 같은 변형을 받아 찢어지지 않는다. 매 프레임 할당 없음(유니폼 값만 갱신).
//
// 관절: 날개(어깨 → 팔꿈치 2단, 비틀림, 접기), 꼬리(기부 피벗, 사인파 전파), 목 → 머리 2단, 앞/뒷다리 접기, 호흡.
// 상태 유니폼: uFlapPhase, uFlapAmp, uGlide, uTuck, uBank, uTurn, uTailSway (+ 보조: uTime, uNod, uLegTuck, uWingRest, uTailLift, uNeckLift, uBreath)
import * as T from './vendor/three.module.js';

export function createRigUniforms() {
  const u = {};
  for (const [k, v] of Object.entries({
    uFlapPhase: 0, uFlapAmp: 0.6, uGlide: 0, uTuck: 0, uBank: 0, uTurn: 0, uTailSway: 0.4,
    uTime: 0, uNod: 0, uLegTuck: 0.55, uWingRest: 0.85, uTailLift: 0.25, uNeckLift: 0.3, uBreath: 0,
  })) u[k] = { value: v };
  return u;
}

// 원본 좌표 랜드마크 (정점 분석: 날개 |x|>0.33 은 순수 날개, 손목 허브 (±0.42,0.32,0.2), 꼬리 z<-0.05, 목 y>0.05)
const RIG_GLSL = /* glsl */`
uniform float uFlapPhase, uFlapAmp, uGlide, uTuck, uBank, uTurn, uTailSway, uTime, uNod, uLegTuck, uWingRest, uTailLift, uNeckLift, uBreath;
mat3 rX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
void rotAbout(inout vec3 p, inout vec3 n, vec3 piv, mat3 m){ p = piv + m * (p - piv); n = m * n; }
vec3 rigP;
void dragonRig(inout vec3 p, inout vec3 n){
  vec3 p0 = p;
  float ax = abs(p0.x), sd = p0.x < 0. ? -1. : 1.;
  // ---------------- 날개 (좌우 대칭 공간에서 계산) ----------------
  float ww = smoothstep(0.27, 0.36, ax) * max(smoothstep(-0.30, -0.20, p0.y), smoothstep(0.40, 0.48, ax)) * (1. - smoothstep(0.30, 0.38, p0.z));
  if (ww > 0.0) {
    vec3 q = vec3(ax, p0.y, p0.z), m = vec3(n.x * sd, n.y, n.z);
    vec3 S = vec3(0.28, 0.12, 0.22);              // 어깨
    vec3 E = vec3(0.60, 0.30, 0.11);              // 팔꿈치(날개 중간 관절)
    float we = smoothstep(0.46, 0.74, ax);        // 바깥 날개 가중치
    float span = clamp((ax - 0.30) / 0.65, 0., 1.);
    // 비대칭 날갯짓: 내려칠 때(θ 0→π) 빠르고 올릴 때 느리게
    float ph = uFlapPhase;
    float th  = ph - 0.55 * cos(ph) + 0.55;
    float tho = th - 1.15 * we - 0.35 * span;     // 바깥쪽 위상 지연
    float A = uFlapAmp * (1. - uGlide);
    float up = max(0., -sin(th));                 // 올림 구간 (손 접기)
    float rest = (uWingRest * (1. - 0.2 * uTuck) + 0.1 * we) * ww;
    float bias = 0.10 + 0.06 * uGlide - 0.12 * uTuck - uBank * sd * 0.08;
    float shoulder = (A * cos(th) + bias) * ww;
    float sweep = (0.18 + 0.62 * uTuck + 0.16 * A * up - 0.06 * uGlide) * ww;
    float elbow = we * (A * 0.85 * cos(tho) - A * 0.35 * cos(th) - 0.05 * uGlide - 0.35 * uTuck);
    float fold  = we * (0.3 * A * up + 1.25 * uTuck);
    float st = sin(tho);
    float twist = we * (A * (st > 0. ? 0.38 : 0.12) * st + 0.08 * uGlide + 0.08) * (0.4 + 0.6 * span);
    q -= S;
    // 1) 막(membrane) 평면 안에서 접기: 손(바깥 날개)과 어깨를 뒤쪽(-y=날개 뒷전 방향)으로 스윕
    vec3 Er = E - S;
    q = Er + rZ(-fold) * (q - Er); m = rZ(-fold) * m;
    mat3 Rsw = rZ(-sweep);
    q = Rsw * q; m = Rsw * m; Er = Rsw * Er;
    // 2) 휴식 자세 보정: 세운 날개 → 비행 평면
    mat3 Rr = rX(rest);
    q = Rr * q; m = Rr * m; Er = Rr * Er;
    // 3) 팔꿈치(바깥 날개) 위상 지연 날갯짓 + 날개 끝 비틀림
    mat3 Ro = rZ(elbow) * rX(twist);
    q = Er + Ro * (q - Er); m = Ro * m;
    // 4) 어깨 날갯짓 (몸통 축 회전)
    mat3 Rs = rZ(shoulder);
    q = Rs * q; m = Rs * m;
    q += S;
    p = vec3(q.x * sd, q.y, q.z); n = vec3(m.x * sd, m.y, m.z);
  }
  float nw = 1. - ww;
  // ---------------- 꼬리 ----------------
  float tu = clamp((-0.04 - p0.z) / 0.64, 0., 1.);
  tu *= (1. - smoothstep(0.15, 0.22, ax) * (1. - smoothstep(0.2, 0.4, tu))) * nw;
  if (tu > 0.0) {
    float k = tu * tu * (3. - 2. * tu) * 0.65 + tu * 0.35;
    float wave = sin(uTime * 2.3 - tu * 3.4) * uTailSway + sin(uFlapPhase - 1.2 - tu * 2.) * 0.25 * uFlapAmp * (1. - uGlide);
    float yawA = -(wave * 0.55 + uTurn * 0.55) * k;
    float pitA = (uTailLift + 0.12 * sin(uFlapPhase - 1.8 - tu * 2.5) * uFlapAmp + 0.08 * uTuck) * k;
    rotAbout(p, n, vec3(0., -0.22, -0.04), rY(yawA) * rX(pitA));
  }
  // ---------------- 다리 접기 ----------------
  float wf = nw * (1. - smoothstep(-0.30, -0.18, p0.y)) * smoothstep(0.26, 0.34, p0.z);
  if (wf > 0.0) rotAbout(p, n, vec3(p0.x, -0.18, 0.42), rX(uLegTuck * 1.25 * wf));
  float wb = nw * (1. - smoothstep(-0.32, -0.20, p0.y)) * smoothstep(0.12, 0.18, ax) * (1. - smoothstep(0.12, 0.2, p0.z)) * smoothstep(-0.3, -0.18, p0.z);
  if (wb > 0.0) rotAbout(p, n, vec3(p0.x, -0.22, -0.02), rX(uLegTuck * 1.1 * wb));
  // ---------------- 목 → 머리 (머리가 먼저 돌아감) ----------------
  float hz = smoothstep(0.30, 0.38, p0.z);
  float wn = nw * smoothstep(0.0, 0.2, p0.y) * (1. - smoothstep(0.19 + 0.1 * hz, 0.27 + 0.08 * hz, ax)) * smoothstep(-0.05, 0.14, p0.z);
  if (wn > 0.0) {
    float wh = wn * max(smoothstep(0.30, 0.40, p0.z), smoothstep(0.32, 0.42, p0.y));
    float bob = sin(uFlapPhase - 2.2) * 0.07 * uFlapAmp * (1. - uGlide);
    float yawH = -uTurn * 0.42;
    rotAbout(p, n, vec3(0., 0.22, 0.36), rY(yawH * wh) * rX((-0.5 * bob + 0.4 * uNod - 0.3 * uNeckLift) * wh));
    rotAbout(p, n, vec3(0., 0.02, 0.24), rY(-uTurn * 0.28 * wn) * rX((-0.75 * uNeckLift + bob + uNod) * wn));
  }
  // ---------------- 호흡 (가슴 미세 팽창) ----------------
  float wc = nw * (1. - smoothstep(0.1, 0.3, ax)) * smoothstep(-0.2, 0.15, p0.z) * (1. - smoothstep(0.3, 0.5, p0.z)) * smoothstep(-0.45, -0.2, p0.y) * (1. - smoothstep(0.05, 0.2, p0.y));
  p.xy += vec2(p0.x, p0.y + 0.15) * (uBreath * 0.02 * wc);
}
`;

function inject(sh, U, withNormal) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = RIG_GLSL + sh.vertexShader;
  if (withNormal && sh.vertexShader.includes('#include <beginnormal_vertex>')) {
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n rigP = position; dragonRig(rigP, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = rigP;');
  } else {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n { vec3 dn = vec3(0.,1.,0.); dragonRig(transformed, dn); }');
  }
}

// 메시에 절차적 스켈레톤을 장착 (그림자용 깊이 재질 포함)
export function applyDragonRig(mesh, U) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) { m.onBeforeCompile = sh => inject(sh, U, true); m.customProgramCacheKey = () => 'dragonRig1'; m.needsUpdate = true; }
  const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
  depth.onBeforeCompile = sh => inject(sh, U, false); depth.customProgramCacheKey = () => 'dragonRigDepth1';
  mesh.customDepthMaterial = depth;
  mesh.frustumCulled = false;
}

// ---------------------------------------------------------------- 비행 애니메이터 (CPU, 스프링/감쇠)
const TAU = Math.PI * 2;
const exp1 = (k, dt) => 1 - Math.exp(-k * dt);
// 임계감쇠에 가까운 2차 스프링: s={x,v}
function spring(s, target, freq, damp, dt) {
  const w = TAU * freq, a = w * w * (target - s.x) - 2 * damp * w * s.v;
  s.v += a * dt; s.x += s.v * dt; return s.x;
}

// 상태별 목표값: [flapHz, amp, glide, tuck, bodyPitch(코 숙임, rad), tailSway]
const MODES = {
  hover: [1.05, 0.66, 0, 0, -0.30, 0.55],
  cruise: [1.35, 0.58, 0, 0, -0.58, 0.40],
  boost: [2.40, 0.30, 0, 0.75, -0.74, 0.22],
  dive: [0.60, 0.00, 1, 0.10, -0.78, 0.30],
  climb: [1.7, 0.72, 0, 0, -0.34, 0.45],
};

export class FlightAnimator {
  constructor() {
    this.rate = 1; // 몸 크기에 따른 날갯짓 속도 배수(큰 용은 느리고 묵직하게)
    this.phase = 0; this.hz = 1.05; this.amp = 0.8; this.glide = 0; this.tuck = 0; this.sway = 0.5;
    this.pitch = { x: -0.3, v: 0 }; this.bank = { x: 0, v: 0 }; this.heading = { x: 0, v: 0 };
    this.recoil = { x: 0, v: 0 }; this.turn = 0; this.lastYaw = null; this.yawRate = 0; this.time = 0;
    this.heave = 0; this.mode = 'hover'; this.wingUp = 0; this.bankAngle = 0;
  }
  fire() { this.recoil.v += 6; }
  // inp: {fwd, side, up, down, boost, yaw}
  update(dt, inp) {
    if (dt <= 0) return;
    this.time += dt;
    if (this.lastYaw === null) this.lastYaw = inp.yaw;
    let dy = inp.yaw - this.lastYaw; this.lastYaw = inp.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawRate += (dy / dt - this.yawRate) * exp1(8, dt);
    const moving = Math.abs(inp.fwd) + Math.abs(inp.side) > 0.05;
    const mode = inp.down ? 'dive' : inp.up ? 'climb' : inp.boost && moving ? 'boost' : moving ? 'cruise' : 'hover';
    this.mode = mode;
    const M = MODES[mode];
    const turning = T.MathUtils.clamp(-this.yawRate * 0.45 + inp.side * 0.75, -1, 1);
    this.hz += (M[0] + Math.abs(turning) * 0.25 - this.hz) * exp1(3, dt);
    this.amp += (M[1] - this.amp) * exp1(4, dt);
    this.glide += (M[2] - this.glide) * exp1(mode === 'dive' ? 2.5 : 4, dt);
    this.tuck += (M[3] - this.tuck) * exp1(mode === 'boost' ? 4 : 3, dt);
    this.sway += (M[5] - this.sway) * exp1(2, dt);
    this.phase = (this.phase + TAU * this.hz * this.rate * dt) % (TAU * 1000);
    this.turn += (turning - this.turn) * exp1(5, dt);
    const backPitch = inp.fwd < -0.05 ? 0.18 : 0;
    spring(this.pitch, M[4] + backPitch - this.recoil.x * 0.25, 1.2, 0.9, dt);
    // 뱅킹: 오른쪽 선회(yaw 감소, side>0) → 오른 날개 아래(rotation.z 음수)
    const bankT = T.MathUtils.clamp(this.yawRate * 0.28 - inp.side * 0.3, -0.52, 0.52);
    this.bankAngle = spring(this.bank, bankT, 1.1, 0.75, dt);
    const headT = moving ? -Math.atan2(inp.side * 0.7, Math.max(Math.abs(inp.fwd), 0.35)) * 0.55 : 0;
    spring(this.heading, headT, 1.3, 0.85, dt);
    spring(this.recoil, 0, 3.2, 0.55, dt);
    const th = this.phase - 0.55 * Math.cos(this.phase) + 0.55;
    const A = this.amp * (1 - this.glide);
    this.wingUp = A * Math.cos(th) + 0.1;
    this.heave = -A * Math.sin(th - 0.9); // 내려칠 때 몸이 살짝 떠오름
  }
  applyUniforms(U) {
    U.uFlapPhase.value = this.phase; U.uFlapAmp.value = this.amp; U.uGlide.value = this.glide; U.uTuck.value = this.tuck;
    U.uBank.value = T.MathUtils.clamp(this.bank.x / 0.52, -1, 1); U.uTurn.value = this.turn; U.uTailSway.value = this.sway;
    U.uTime.value = this.time; U.uNod.value = this.recoil.x * 0.35; U.uBreath.value = Math.sin(this.time * 1.7);
    U.uLegTuck.value = 0.75 + 0.3 * this.tuck + 0.15 * this.glide;
    U.uNeckLift.value = -0.8 * this.pitch.x - 0.02;
    U.uWingRest.value = T.MathUtils.clamp(1.4 + this.pitch.x, 0.55, 1.15); // 몸 기울기와 합쳐 날개 평면을 수평 근처로 유지
  }
  // 모델 래퍼에 몸 자세(앞으로 기울임·헤딩·상하 움직임·반동) 적용. base: 래퍼 원래 위치(y)
  applyPose(wrap, unit) {
    wrap.rotation.order = 'YXZ';
    wrap.rotation.x = this.pitch.x + Math.sin(this.time * 1.7) * 0.012;
    wrap.rotation.y = this.heading.x;
    wrap.rotation.z = -this.turn * 0.06;
    wrap.position.y = this.heave * 0.035 * unit + Math.sin(this.time * 1.7) * 0.01 * unit;
    wrap.position.z = this.recoil.x * 0.04 * unit;
  }
}
