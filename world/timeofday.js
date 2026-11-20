// world/timeofday.js — 드래곤 엠파이어: 시간대 하늘·조명·대기 시스템
// three r180 / Sky.js(Preetham) 기반. 모바일 고려: 하늘 1 + 별 1 + 해/달 스프라이트 3 드로우콜.
//
// createTimeOfDay({ scene, renderer, camera, startHour=6, dayLengthSec=660, endHour=21 })
//   dayLengthSec: startHour → endHour 구간(한 판)을 몇 초에 흘려보낼지. 기본 660s 동안 06시→21시.
//   endHour 이후에도 같은 속도로 계속 흐름(24시에서 0시로 랩).
import * as THREE from '../vendor/three.module.js';
import { Sky } from '../vendor/addons/Sky.js';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- 팔레트 키프레임 (sRGB hex)
// sun: 방향광 색, si: 방향광 강도, hs/hg: 반구광 하늘/지면색, hi: 반구광 강도,
// fog: 안개 = 지평선 색, fd: 안개 밀도(FogExp2), ex: 노출, night: 밤 오버레이(0~1),
// tw: 박명 글로우 색(해 방위쪽 지평선), twi: 박명 강도, sg: Sky 산란 게인
const KEYS = [
  { h: 0.0,  sun: 0x9db6ff, si: 1.10, hs: 0x4a5f9c, hg: 0x22283c, hi: 2.10, fog: 0x1c2648, fd: 0.00026, ex: 1.00, night: 1.0, tw: 0x1a2550, twi: 0.0,  sg: 1.0 },
  { h: 4.3,  sun: 0x9db6ff, si: 1.00, hs: 0x4a5f9c, hg: 0x22283c, hi: 2.10, fog: 0x1e2648, fd: 0.00026, ex: 1.00, night: 1.0, tw: 0x3a2a60, twi: 0.15, sg: 1.0 },
  { h: 5.2,  sun: 0xa0a8e8, si: 0.35, hs: 0x4a5490, hg: 0x241e30, hi: 1.71, fog: 0x544470, fd: 0.00034, ex: 0.75, night: 0.8, tw: 0xff7a68, twi: 0.55, sg: 1.0 },
  { h: 5.9,  sun: 0xff9a78, si: 0.45, hs: 0x7a7fb8, hg: 0x463a44, hi: 1.80, fog: 0x9e7f86, fd: 0.00036, ex: 0.70, night: 0.35, tw: 0xff9068, twi: 0.70, sg: 1.0 },
  { h: 6.6,  sun: 0xffa86c, si: 1.70, hs: 0x98a8d4, hg: 0x6a5446, hi: 1.80, fog: 0xccb9af, fd: 0.00034, ex: 0.62, night: 0.0, tw: 0xffa070, twi: 0.25, sg: 1.0 },
  { h: 8.0,  sun: 0xffe6c8, si: 2.70, hs: 0xa8c4ea, hg: 0x6c6a56, hi: 1.80, fog: 0xc0cedd, fd: 0.00026, ex: 0.55, night: 0.0, tw: 0xffffff, twi: 0.0,  sg: 1.0 },
  { h: 12.0, sun: 0xfff6ea, si: 3.10, hs: 0xb2d0fa, hg: 0x707a5c, hi: 1.90, fog: 0xc8d9e8, fd: 0.00022, ex: 0.52, night: 0.0, tw: 0xffffff, twi: 0.0,  sg: 1.0 },
  { h: 15.5, sun: 0xffeccf, si: 2.90, hs: 0xaecaf2, hg: 0x737656, hi: 1.80, fog: 0xc6d3df, fd: 0.00024, ex: 0.54, night: 0.0, tw: 0xffffff, twi: 0.0,  sg: 1.0 },
  { h: 17.3, sun: 0xffbf72, si: 2.50, hs: 0xa0aed6, hg: 0x7c6044, hi: 1.71, fog: 0xd7c3a8, fd: 0.00028, ex: 0.58, night: 0.0, tw: 0xffb070, twi: 0.20, sg: 1.0 },
  { h: 18.4, sun: 0xff8848, si: 1.50, hs: 0x7c7cb0, hg: 0x5c3c34, hi: 1.71, fog: 0xac725d, fd: 0.00032, ex: 0.64, night: 0.0, tw: 0xff7a48, twi: 0.45, sg: 1.0 },
  { h: 19.1, sun: 0xe07a70, si: 0.60, hs: 0x6a6aa8, hg: 0x40344a, hi: 2.20, fog: 0x845e7d, fd: 0.00030, ex: 0.95, night: 0.55, tw: 0xff6a50, twi: 0.70, sg: 1.0 },
  { h: 20.0, sun: 0x9db0ff, si: 0.90, hs: 0x4a5a98, hg: 0x262a40, hi: 2.10, fog: 0x283060, fd: 0.00028, ex: 1.00, night: 0.9, tw: 0x6a3c70, twi: 0.30, sg: 1.0 },
  { h: 21.0, sun: 0x9db6ff, si: 1.10, hs: 0x4a5f9c, hg: 0x22283c, hi: 2.10, fog: 0x1c2648, fd: 0.00026, ex: 1.00, night: 1.0, tw: 0x1a2550, twi: 0.0,  sg: 1.0 },
];
const COLOR_KEYS = ['sun', 'hs', 'hg', 'fog', 'tw'];
const NUM_KEYS = ['si', 'hi', 'fd', 'ex', 'night', 'twi', 'sg'];
const _keyCols = KEYS.map(k => {
  const o = {};
  for (const c of COLOR_KEYS) o[c] = new THREE.Color(k[c]); // sRGB hex → 선형(ColorManagement)
  return o;
});

function smooth(t) { return t * t * (3 - 2 * t); }

function samplePalette(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  let i = KEYS.length - 1;
  for (let k = 0; k < KEYS.length; k++) { if (KEYS[k].h <= h) i = k; else break; }
  const j = (i + 1) % KEYS.length;
  const h0 = KEYS[i].h;
  let h1 = KEYS[j].h; if (h1 <= h0) h1 += 24;
  let hh = h; if (hh < h0) hh += 24;
  const t = smooth(THREE.MathUtils.clamp((hh - h0) / (h1 - h0), 0, 1));
  for (const c of COLOR_KEYS) out[c].copy(_keyCols[i][c]).lerp(_keyCols[j][c], t);
  for (const n of NUM_KEYS) out[n] = KEYS[i][n] + (KEYS[j][n] - KEYS[i][n]) * t;
  return out;
}

// ---------------------------------------------------------------- 해/달 궤도
// 6시 동쪽(+X) 일출 → 12시 남쪽(-Z) 하늘 고점(약 62°) → 18시 서쪽(-X) 일몰.
// 지평선 아래에서는 고도를 0.45배로 눌러 박명(여명/황혼)이 길게 이어지도록 함.
const SUN_TILT = 28 * DEG; // 천정에서 남쪽으로 기울어진 정도
export function sunDirectionAt(hour, target = new THREE.Vector3()) {
  const th = ((hour - 6) / 12) * Math.PI;
  const c = Math.cos(th), s = Math.sin(th);
  let y = s * Math.cos(SUN_TILT);
  const z = -s * Math.sin(SUN_TILT);
  if (y < 0) y *= 0.45;
  return target.set(c, y, z).normalize();
}
function moonDirectionAt(hour, target = new THREE.Vector3()) {
  // 해의 반대편, 약간 북쪽으로 치우쳐 해와 겹치지 않게
  sunDirectionAt(hour + 12, target);
  target.z += 0.18; target.y = target.y * 0.95 + 0.06;
  return target.normalize();
}

// ---------------------------------------------------------------- 캔버스 텍스처
function radialTexture(size, stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function moonTexture(size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const r = size * 0.22, c = size / 2;
  // 헤일로
  let grd = g.createRadialGradient(c, c, r * 0.9, c, c, size / 2);
  grd.addColorStop(0, 'rgba(170,190,255,0.35)'); grd.addColorStop(0.35, 'rgba(120,150,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // 원반
  grd = g.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r);
  grd.addColorStop(0, '#fbfbf2'); grd.addColorStop(1, '#d8dce8');
  g.fillStyle = grd; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
  // 바다(어두운 얼룩)
  g.fillStyle = 'rgba(140,150,175,0.35)';
  const spots = [[-0.3, -0.2, 0.32], [0.25, 0.1, 0.26], [-0.05, 0.38, 0.2], [0.35, -0.35, 0.14]];
  for (const [x, y, s] of spots) { g.beginPath(); g.arc(c + x * r, c + y * r, s * r, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- 하늘 셰이더(Sky.js + 밤/박명/지평선 안개 오버레이)
function makeSky() {
  const sky = new Sky();
  const mat = sky.material;
  Object.assign(mat.uniforms, {
    uSkyGain: { value: 1 },
    uNight: { value: 0 },
    uNightZenith: { value: new THREE.Color(0x070d24) },
    uNightHorizon: { value: new THREE.Color(0x1a2550) },
    uTwilight: { value: new THREE.Color(0xff8060) },
    uTwilightAmt: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uHorizonBlend: { value: 0.12 },
  });
  mat.fragmentShader = mat.fragmentShader
    .replace('void main() {', /* glsl */`
      uniform float uSkyGain; uniform float uNight; uniform float uTwilightAmt; uniform float uHorizonBlend;
      uniform vec3 uNightZenith; uniform vec3 uNightHorizon; uniform vec3 uTwilight; uniform vec3 uFogColor;
      void main() {`)
    .replace('gl_FragColor = vec4( retColor, 1.0 );', /* glsl */`
      float hy = direction.y;
      float up01 = clamp( hy, 0.0, 1.0 );
      retColor *= uSkyGain;
      // 밤하늘 그라디언트(검게 꺼지지 않도록 남색 바닥값)
      vec3 nightCol = mix( uNightHorizon, uNightZenith, pow( up01, 0.45 ) );
      retColor = mix( retColor, nightCol, uNight );
      // 박명 글로우: 해 방위쪽 지평선이 분홍/주황으로 달아오름
      vec3 sunFlat = normalize( vec3( vSunDirection.x, 0.0, vSunDirection.z ) + vec3( 1e-4 ) );
      vec3 dirFlat = normalize( vec3( direction.x, 0.0, direction.z ) + vec3( 1e-4 ) );
      float az = dot( dirFlat, sunFlat ) * 0.5 + 0.5;
      float band = exp( -max( hy, 0.0 ) * 5.0 );
      retColor += uTwilight * uTwilightAmt * band * ( 0.25 + 0.75 * pow( az, 3.0 ) );
      gl_FragColor = vec4( retColor, 1.0 );`)
    .replace('#include <colorspace_fragment>', /* glsl */`#include <colorspace_fragment>
      // 지평선 → 안개색 블렌드. three의 fog_fragment와 같은 위치(톤매핑/색공간 이후)에서 섞어
      // 지형 안개와 정확히 같은 색이 되게 함. 지평선 아래는 완전히 안개색.
      float hb = 1.0 - smoothstep( -0.03, uHorizonBlend, hy );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, uFogColor, hb );`);
  mat.fog = false;
  mat.needsUpdate = true;
  const u = mat.uniforms;
  u.turbidity.value = 4.5;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.82;
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  sky.name = 'TOD_Sky';
  return sky;
}

// ---------------------------------------------------------------- 별
function makeStars(count = 1400) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 상반구 위주(약간 아래까지 – 비행 고도에서 지평선 아래도 보임)
    const y = rnd() * 1.08 - 0.08;
    const a = rnd() * Math.PI * 2, r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    const m = rnd();
    size[i] = m < 0.92 ? 1.2 + rnd() * 1.6 : 2.8 + rnd() * 2.6;
    const t = rnd();
    tmp.setHSL(t < 0.5 ? 0.6 : (t < 0.8 ? 0.12 : 0.0), 0.35 * rnd(), 0.85);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
    seed[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uTime: { value: 0 }, uRadius: { value: 1000 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float size; attribute float seed; attribute vec3 color;
      uniform float uTime; uniform float uRadius; uniform float uPixelRatio;
      varying vec3 vColor; varying float vFade;
      void main() {
        vec4 wp = modelMatrix * vec4( position * uRadius, 1.0 );
        vec3 dir = normalize( wp.xyz - cameraPosition );
        vFade = smoothstep( -0.05, 0.25, dir.y );                      // 지평선 근처 소멸(대기)
        float tw = 0.75 + 0.25 * sin( uTime * ( 1.5 + fract( seed ) * 3.0 ) + seed );
        vColor = color * tw;
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w * 0.99999;                        // 원평면 근처에 고정
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying vec3 vColor; varying float vFade;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot( p, p );
        float a = exp( -d * 4.0 ) * uOpacity * vFade;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( vColor * a, a );
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -90;
  pts.name = 'TOD_Stars';
  return pts;
}

// ---------------------------------------------------------------- 본체
export function createTimeOfDay({ scene, renderer, camera, startHour = 6.0, dayLengthSec = 660, endHour = 21.0 } = {}) {
  const pal = { sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), fog: new THREE.Color(), tw: new THREE.Color() };

  let hour = startHour;
  let speed = 1;
  const span = Math.max(0.5, ((endHour - startHour) + 24) % 24 || 24);
  const hoursPerSec = span / dayLengthSec;
  let elapsed = 0;
  const hourCbs = [];
  let lastIntHour = Math.floor(hour);

  // 렌더러
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // 안개(없으면 생성; 있으면 색만 동기화, 우리가 만든 FogExp2면 밀도도 구동)
  let ownFog = false;
  if (!scene.fog) { scene.fog = new THREE.FogExp2(0xbcd3ec, 0.00025); ownFog = true; }

  // 조명
  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.name = 'TOD_SunLight';
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const SH = 300; // 포커스 주변 600m 박스
  Object.assign(sunLight.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 10, far: 2600 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.6;
  sunLight.shadow.camera.updateProjectionMatrix();
  scene.add(sunLight, sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xb2d0fa, 0x707a5c, 1);
  hemiLight.name = 'TOD_HemiLight';
  scene.add(hemiLight);

  // 하늘·별·해·달
  const sky = makeSky();
  scene.add(sky);
  const skyU = sky.material.uniforms;

  const stars = makeStars();
  scene.add(stars);

  const sunGlowTex = radialTexture(128, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,250,235,0.95)'], [0.22, 'rgba(255,220,170,0.35)'], [0.5, 'rgba(255,180,120,0.08)'], [1, 'rgba(255,160,100,0)']]);
  const sunHaloTex = radialTexture(128, [[0, 'rgba(255,230,190,0.55)'], [0.3, 'rgba(255,200,150,0.18)'], [1, 'rgba(255,160,100,0)']]);
  const mkSprite = (map, order, name) => {
    const m = new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, toneMapped: false });
    const sp = new THREE.Sprite(m); sp.renderOrder = order; sp.frustumCulled = false; sp.name = name; scene.add(sp); return sp;
  };
  const sunDisc = mkSprite(sunGlowTex, -80, 'TOD_SunDisc');
  const sunHalo = mkSprite(sunHaloTex, -81, 'TOD_SunHalo');
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), depthWrite: false, fog: false, transparent: true, toneMapped: false }));
  moon.renderOrder = -85; moon.frustumCulled = false; moon.name = 'TOD_Moon'; scene.add(moon);

  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _axis = new THREE.Vector3(0, Math.cos(SUN_TILT), -Math.sin(SUN_TILT)).cross(new THREE.Vector3(1, 0, 0)).normalize();

  const fogDisplay = new THREE.Color();
  const state = { nightFactor: 0, sunElevation: 0, palette: pal, exposure: 0.55 };

  function apply(camPos) {
    samplePalette(hour, pal);
    sunDirectionAt(hour, sunDirection);
    moonDirectionAt(hour, moonDirection);
    state.sunElevation = Math.asin(sunDirection.y);
    state.nightFactor = pal.night;

    // --- 하늘
    skyU.sunPosition.value.copy(sunDirection);
    // 저고도에서 탁도↑ → 골든아워 노을 강화
    const lowSun = 1 - THREE.MathUtils.smoothstep(sunDirection.y, 0.0, 0.35);
    skyU.turbidity.value = 3.2 + 4.0 * lowSun;
    skyU.rayleigh.value = 1.2 + 1.4 * lowSun;
    skyU.mieCoefficient.value = 0.004 + 0.004 * lowSun;
    skyU.uSkyGain.value = pal.sg;
    skyU.uNight.value = pal.night;
    skyU.uNightHorizon.value.copy(pal.fog).lerp(pal.hs, 0.15);
    skyU.uNightZenith.value.copy(pal.hs).multiplyScalar(0.45);
    skyU.uTwilight.value.copy(pal.tw);
    skyU.uTwilightAmt.value = pal.twi;
    // three의 안개는 톤매핑·sRGB 인코딩 이후에 섞이므로, 키프레임 hex가 화면에 그대로 보이도록 sRGB 값을 그대로 넣는다
    fogDisplay.copy(pal.fog).convertLinearToSRGB();
    skyU.uFogColor.value.copy(fogDisplay);

    // --- 안개 / 노출
    scene.fog.color.copy(fogDisplay);
    if (ownFog && scene.fog.isFogExp2) scene.fog.density = pal.fd;
    if (renderer) renderer.toneMappingExposure = pal.ex;
    state.exposure = pal.ex;

    // --- 방향광: 해가 충분히 낮아지면 달빛으로 전환(전환 지점은 강도가 바닥인 박명 구간)
    const useSun = sunDirection.y > -0.035;
    lightDir.copy(useSun ? sunDirection : moonDirection);
    // 수평에 너무 가까운 빛은 그림자가 무한히 길어지므로 최소 고도 확보
    if (lightDir.y < 0.12) { lightDir.y = 0.12; lightDir.normalize(); }
    sunLight.color.copy(pal.sun);
    sunLight.intensity = pal.si;
    hemiLight.color.copy(pal.hs);
    hemiLight.groundColor.copy(pal.hg);
    hemiLight.intensity = pal.hi;

    placeAround(camPos);
  }

  function placeAround(camPos) {
    // 그림자 카메라: 포커스 중심, 텍셀 스냅으로 떨림 방지
    const texel = (2 * SH) / sunLight.shadow.mapSize.x;
    _v.copy(focus);
    // 라이트 공간 기준 스냅 (라이트 방향 기준 직교 기저)
    const fwd = lightDir;
    const right = _tmpR.set(0, 1, 0).cross(fwd).normalize();
    const upv = _tmpU.copy(fwd).cross(right).normalize();
    const pr = Math.round(_v.dot(right) / texel) * texel;
    const pu = Math.round(_v.dot(upv) / texel) * texel;
    const pf = _v.dot(fwd);
    _v.copy(right).multiplyScalar(pr).addScaledVector(upv, pu).addScaledVector(fwd, pf);
    sunLight.target.position.copy(_v);
    sunLight.position.copy(_v).addScaledVector(lightDir, 1200);
    sunLight.target.updateMatrixWorld();

    // 하늘 요소: 카메라 중심(하늘 구에 고정)
    const far = camera ? camera.far : 10000;
    const cp = camPos || focus;
    sky.position.copy(cp);
    sky.scale.setScalar(far * 1.05);
    const R = far * 0.45;
    stars.position.copy(cp);
    stars.material.uniforms.uRadius.value = R;
    stars.material.uniforms.uPixelRatio.value = renderer ? renderer.getPixelRatio() : 1;
    // 별은 천구 회전(극축 기준)으로 시간 따라 천천히 돈다
    _q.setFromAxisAngle(_axis, (hour / 24) * Math.PI * 2);
    stars.quaternion.copy(_q);
    stars.material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(pal.night, 0.25, 1.0);
    stars.visible = stars.material.uniforms.uOpacity.value > 0.001;

    // 해 디스크/글로우
    const dS = R * 0.98;
    sunDisc.position.copy(cp).addScaledVector(sunDirection, dS);
    sunHalo.position.copy(sunDisc.position);
    const vis = THREE.MathUtils.smoothstep(sunDirection.y, -0.06, 0.02);
    const low = 1 - THREE.MathUtils.smoothstep(sunDirection.y, 0.0, 0.4);
    sunDisc.scale.setScalar(dS * (0.075 + 0.04 * low));
    sunHalo.scale.setScalar(dS * (0.32 + 0.2 * low));
    sunDisc.material.color.copy(pal.sun).lerp(_white, 0.55 - 0.35 * low).multiplyScalar(vis * 1.4);
    sunHalo.material.color.copy(pal.sun).multiplyScalar(vis * (0.25 + 0.3 * low));
    sunDisc.visible = sunHalo.visible = vis > 0.001;

    // 달
    moon.position.copy(cp).addScaledVector(moonDirection, dS * 0.97);
    moon.scale.setScalar(dS * 0.11);
    const mv = THREE.MathUtils.smoothstep(pal.night, 0.15, 0.8) * THREE.MathUtils.smoothstep(moonDirection.y, -0.03, 0.06);
    moon.material.opacity = mv;
    moon.visible = mv > 0.001;
  }
  const _tmpR = new THREE.Vector3(), _tmpU = new THREE.Vector3(), _white = new THREE.Color(1, 1, 1);

  function fireHour() {
    const ih = Math.floor(hour);
    if (ih !== lastIntHour) { lastIntHour = ih; for (const cb of hourCbs) cb(hour); }
  }

  const api = {
    paused: false,
    sunDirection,
    moonDirection,
    sunLight,
    hemiLight,
    sky,
    stars,
    state,
    get hour() { return hour; },
    get nightFactor() { return state.nightFactor; },
    get palette() { return pal; },
    setHour(h) { hour = ((h % 24) + 24) % 24; apply(camera ? camera.position : focus); fireHour(); },
    setSpeed(m) { speed = m; },
    get speed() { return speed; },
    onHourChange(cb) { hourCbs.push(cb); return () => { const i = hourCbs.indexOf(cb); if (i >= 0) hourCbs.splice(i, 1); }; },
    update(dt, focusPosition) {
      elapsed += dt;
      if (focusPosition) focus.copy(focusPosition);
      else if (camera) focus.copy(camera.position);
      if (!api.paused) {
        hour = (hour + dt * hoursPerSec * speed) % 24;
      }
      stars.material.uniforms.uTime.value = elapsed;
      apply(camera ? camera.position : focus);
      fireHour();
    },
    dispose() {
      scene.remove(sunLight, sunLight.target, hemiLight, sky, stars, sunDisc, sunHalo, moon);
      sky.geometry.dispose(); sky.material.dispose();
      stars.geometry.dispose(); stars.material.dispose();
      sunGlowTex.dispose(); sunHaloTex.dispose();
      sunDisc.material.dispose(); sunHalo.material.dispose();
      moon.material.map.dispose(); moon.material.dispose();
      sunLight.dispose(); hemiLight.dispose?.();
      if (ownFog) scene.fog = null;
      hourCbs.length = 0;
    },
  };
  apply(camera ? camera.position : focus);
  return api;
}
