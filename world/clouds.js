// world/clouds.js — 드래곤 엠파이어: 소프트 빌보드 적운 (단일 드로우콜)
// 모든 구름 퍼프를 InstancedBufferGeometry 한 개로 그린다. 퍼프마다 카메라를 향하는 쿼드,
// 셰이더에서 구체 임포스터 노멀로 해 방향 램버트 + 전방산란(실버 라이닝) + 아래면 그늘 처리.
// 바람으로 흐르며 플레이어 주변 area×area 영역에서 토러스 랩(가장자리에선 페이드).
//
// createClouds({ scene, area=6000, altitude=[250,700], count=40 }) → { group, update(dt, camera, timeOfDay), dispose(), inside }
import * as THREE from '../vendor/three.module.js';
import { SimplexNoise } from '../vendor/addons/SimplexNoise.js';

// ---------------------------------------------------------------- 절차적 구름 텍스처 아틀라스(2×2)
function makeCloudAtlas(cell = 256) {
  const size = cell * 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const noise = new SimplexNoise({ random: mulberry(77) });
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    const sx = k * 17.3, sy = k * 5.1;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const u = (x + 0.5) / cell * 2 - 1, v = (y + 0.5) / cell * 2 - 1;
        // 아래가 약간 평평한 덩어리 모양
        const vy = v > 0 ? v * 1.25 : v; // canvas y 아래쪽(+)이 화면 아래
        const r = Math.sqrt(u * u + vy * vy);
        let n = 0, amp = 0.5, f = 2.2;
        for (let o = 0; o < 4; o++) { n += amp * noise.noise(u * f + sx, v * f + sy); amp *= 0.5; f *= 2.1; }
        const base = 1 - smooth(0.15, 1.0, r + n * 0.28);
        let a = base * 1.35 - 0.1 + n * 0.25 * base;
        a = Math.max(0, Math.min(1, a));
        a = a * a * (3 - 2 * a);
        // 가장자리 절대 보장(각진 경계 방지)
        a *= 1 - smooth(0.82, 0.99, r);
        const i = ((oy + y) * size + ox + x) * 4;
        // RGB: 내부 밀도(안쪽 밝음/바깥 얇음 구분용) → 셰이더에서 두께로 사용
        const dens = Math.max(0, Math.min(1, base + n * 0.3));
        d[i] = 255; d[i + 1] = Math.round(dens * 255); d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
      }
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERT = /* glsl */`
  attribute vec3 iCenter;   // 구름 덩어리 중심(바람/랩 전)
  attribute vec3 iLocal;    // 덩어리 안 퍼프 오프셋
  attribute vec4 iParams;   // size, rotation, atlas index, top(0 아래~1 위)
  uniform vec2 uWind; uniform vec3 uCam; uniform float uArea;
  varying vec2 vUv; varying vec2 vQuad; varying float vFade; varying float vTop;
  varying vec3 vNormalV; varying float vForward;
  uniform vec3 uSunDirW;
  #include <fog_pars_vertex>
  void main() {
    vec3 c = iCenter; c.xz += uWind;
    c.xz = mod( c.xz - uCam.xz + 0.5 * uArea, uArea ) - 0.5 * uArea + uCam.xz;
    vec3 wp = c + iLocal;
    vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
    float s = iParams.x, rot = iParams.y;
    float cr = cos( rot ), sr = sin( rot );
    vec2 q = vec2( position.x * cr - position.y * sr, position.x * sr + position.y * cr );
    vQuad = q * 2.0;                                  // -1..1 view-space 쿼드 좌표(임포스터 노멀용)
    mvPosition.xy += q * s;
    gl_Position = projectionMatrix * mvPosition;
    float idx = iParams.z;
    vUv = ( uv + vec2( mod( idx, 2.0 ), floor( idx / 2.0 ) ) ) * 0.5;
    vTop = iParams.w;
    // 덩어리 중심 기준 퍼프 노멀(위로 부풀린 형태)
    vec3 nW = normalize( iLocal + vec3( 0.0, s * 0.35, 0.0 ) );
    vNormalV = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
    vec3 V = normalize( wp - cameraPosition );
    vForward = max( dot( V, uSunDirW ), 0.0 );
    // 카메라 근접 페이드(구름 속 통과) + 랩 가장자리 페이드
    float dist = length( mvPosition.xyz );
    float near = smoothstep( s * 0.12, s * 0.75, dist );
    vec2 rel = abs( c.xz - uCam.xz );
    float edge = 1.0 - smoothstep( 0.36 * uArea, 0.49 * uArea, max( rel.x, rel.y ) );
    vFade = near * edge;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uMap; uniform float uOpacity;
  uniform vec3 uSunDirV; uniform vec3 uSunCol; uniform vec3 uAmbTop; uniform vec3 uAmbBot; uniform vec3 uRimCol;
  varying vec2 vUv; varying vec2 vQuad; varying float vFade; varying float vTop;
  varying vec3 vNormalV; varying float vForward;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D( uMap, vUv );
    float a = t.a * vFade * uOpacity;
    if ( a < 0.01 ) discard;
    float dens = t.g;
    // 구체 임포스터 노멀 + 덩어리 노멀 혼합 → 볼륨감
    vec2 p = clamp( vQuad, -1.0, 1.0 );
    vec3 nImp = vec3( p.x, p.y, sqrt( max( 0.0, 1.0 - dot( p, p ) ) ) );
    vec3 n = normalize( nImp * 0.35 + vNormalV );
    float lam = dot( n, uSunDirV );
    float wrap = clamp( lam * 0.5 + 0.5, 0.0, 1.0 );
    // 아래면일수록, 두께(밀도)가 클수록 그늘 — 덩어리 단위로 부드럽게
    float h = clamp( vTop * 0.75 + 0.25 + n.y * 0.15, 0.0, 1.0 );
    float self = mix( 1.0, 0.8, dens * ( 1.0 - wrap ) );
    vec3 amb = mix( uAmbBot, uAmbTop, h );
    vec3 col = amb + uSunCol * ( 0.35 + 0.65 * wrap ) * mix( 0.55, 1.0, h ) * self;
    // 실버 라이닝: 해를 등진 얇은 가장자리가 빛남
    float thin = 1.0 - dens;
    col += uRimCol * pow( vForward, 5.0 ) * ( 0.25 + 1.4 * thin );
    gl_FragColor = vec4( col, a );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createClouds({ scene, area = 6000, altitude = [250, 700], count = 40, seed = 9 } = {}) {
  const rnd = mulberry(seed);
  // ---- 덩어리/퍼프 생성
  const puffs = []; // {ci, lx,ly,lz, size, rot, idx, top}
  const clumps = [];
  for (let c = 0; c < count; c++) {
    const W = 160 + rnd() * 300;                         // 덩어리 폭(m)
    const cx = (rnd() - 0.5) * area, cz = (rnd() - 0.5) * area;
    const cy = altitude[0] + rnd() * (altitude[1] - altitude[0]);
    clumps.push({ x: cx, y: cy, z: cz, w: W });
    const n = 7 + Math.floor(rnd() * 8);
    const stretch = 1 + rnd() * 0.8, ang = rnd() * Math.PI;
    const local = [];
    for (let i = 0; i < n; i++) {
      // 중심에 큰 퍼프, 바깥은 작게. 바닥은 평평(아래 오프셋 제한)
      const r = Math.pow(rnd(), 0.8);
      const th = rnd() * Math.PI * 2;
      let lx = Math.cos(th) * r * W * 0.5 * stretch, lz = Math.sin(th) * r * W * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      [lx, lz] = [lx * ca - lz * sa, lx * sa + lz * ca];
      const hump = (1 - r) * W * 0.32;
      const ly = Math.max(-W * 0.06, hump * (0.4 + rnd() * 0.8) - W * 0.05);
      const size = W * (0.45 + (1 - r) * 0.45) * (0.8 + rnd() * 0.4);
      local.push({ lx, ly, lz, size });
    }
    let minY = Infinity, maxY = -Infinity;
    for (const p of local) { minY = Math.min(minY, p.ly); maxY = Math.max(maxY, p.ly); }
    for (const p of local) {
      puffs.push({ ci: c, lx: p.lx, ly: p.ly, lz: p.lz, size: p.size, rot: rnd() * Math.PI * 2, idx: Math.floor(rnd() * 4), top: (p.ly - minY) / Math.max(1, maxY - minY) });
    }
  }
  const N = puffs.length;

  // ---- 지오메트리
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const aCenter = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aLocal = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aParams = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iCenter', aCenter);
  geo.setAttribute('iLocal', aLocal);
  geo.setAttribute('iParams', aParams);
  geo.instanceCount = N;

  const atlas = makeCloudAtlas(256);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uMap: { value: null }, uOpacity: { value: 0.92 },
    uWind: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector3() }, uArea: { value: area },
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) }, uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmbTop: { value: new THREE.Color(0.6, 0.7, 0.9) },
    uAmbBot: { value: new THREE.Color(0.4, 0.45, 0.55) }, uRimCol: { value: new THREE.Color(1, 0.9, 0.7) },
  }]);
  uniforms.uMap.value = atlas;
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'Clouds';
  const group = new THREE.Group();
  group.name = 'CloudLayer';
  group.add(mesh);
  scene.add(group);

  // ---- 정렬(뒤→앞) : 0.12초마다
  const order = new Uint32Array(N); for (let i = 0; i < N; i++) order[i] = i;
  const depth = new Float32Array(N);
  const wind = new THREE.Vector2(7, 2.5);      // m/s
  const windOff = new THREE.Vector2();
  let sortTimer = 0;
  const camPos = new THREE.Vector3(), camFwd = new THREE.Vector3();
  const _c = new THREE.Color(), _c2 = new THREE.Color();
  const wrapC = (v, cam) => ((((v - cam + 0.5 * area) % area) + area) % area) - 0.5 * area + cam;

  function writeSorted() {
    const C = aCenter.array, L = aLocal.array, P = aParams.array;
    for (let k = 0; k < N; k++) {
      const p = puffs[order[k]], cl = clumps[p.ci];
      C[k * 3] = cl.x; C[k * 3 + 1] = cl.y; C[k * 3 + 2] = cl.z;
      L[k * 3] = p.lx; L[k * 3 + 1] = p.ly; L[k * 3 + 2] = p.lz;
      P[k * 4] = p.size; P[k * 4 + 1] = p.rot; P[k * 4 + 2] = p.idx; P[k * 4 + 3] = p.top;
    }
    aCenter.needsUpdate = aLocal.needsUpdate = aParams.needsUpdate = true;
  }
  function sort() {
    for (let i = 0; i < N; i++) {
      const p = puffs[i], cl = clumps[p.ci];
      const x = wrapC(cl.x + windOff.x, camPos.x) + p.lx - camPos.x;
      const y = cl.y + p.ly - camPos.y;
      const z = wrapC(cl.z + windOff.y, camPos.z) + p.lz - camPos.z;
      depth[i] = x * camFwd.x + y * camFwd.y + z * camFwd.z;
    }
    order.sort((a, b) => depth[b] - depth[a]);
    writeSorted();
  }
  writeSorted();

  const api = {
    group,
    mesh,
    wind,
    inside: 0, // 0~1: 카메라가 구름 덩어리 안에 있는 정도(화면 화이트아웃 등에 사용 가능)
    update(dt, camera, tod) {
      windOff.addScaledVector(wind, dt);
      windOff.x %= area; windOff.y %= area;
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camFwd);
      uniforms.uWind.value.copy(windOff);
      uniforms.uCam.value.copy(camPos);

      sortTimer -= dt;
      if (sortTimer <= 0) { sortTimer = 0.12; sort(); }

      // 카메라 내부 판정
      let ins = 0;
      for (const cl of clumps) {
        const dx = wrapC(cl.x + windOff.x, camPos.x) - camPos.x, dz = wrapC(cl.z + windOff.y, camPos.z) - camPos.z;
        const dy = (cl.y + cl.w * 0.1 - camPos.y) * 2.2;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / (cl.w * 0.5);
        ins = Math.max(ins, 1 - smooth(0.35, 1.0, d));
      }
      api.inside = ins;

      // 시간대 색
      if (tod) {
        const pal = tod.palette, sd = tod.sunDirection;
        const night = tod.nightFactor ?? 0;
        const sunUp = smooth(-0.05, 0.12, sd.y);
        uniforms.uSunDirW.value.copy(sd);
        // 밤에는 달 방향으로 조명
        const ld = sunUp > 0.01 || !tod.moonDirection ? sd : tod.moonDirection;
        uniforms.uSunDirV.value.copy(ld).transformDirection(camera.matrixWorldInverse);
        const li = Math.min(pal.si, 3.2) / 3.2;
        // 직사광: 해 색 × 강도 (저고도는 진한 주황/분홍 그대로)
        uniforms.uSunCol.value.copy(pal.sun).multiplyScalar((0.2 + 1.3 * li) * (1 - 0.85 * night));
        // 환경광: 반구 하늘색 + 지평선(안개)색
        _c.copy(pal.hs).lerp(pal.fog, 0.35).multiplyScalar(0.42 * pal.hi * (1 - 0.55 * night));
        uniforms.uAmbTop.value.copy(_c);
        _c2.copy(pal.hg).lerp(pal.hs, 0.45).lerp(pal.fog, 0.2).multiplyScalar(0.36 * pal.hi * (1 - 0.55 * night));
        uniforms.uAmbBot.value.copy(_c2);
        // 노을/박명 틴트: 박명색으로 아랫면 물들이기
        if (pal.twi > 0) uniforms.uAmbBot.value.lerp(pal.tw, pal.twi * 0.25 * (1 - night));
        uniforms.uRimCol.value.copy(pal.sun).multiplyScalar(sunUp * (0.6 + 0.6 * (1 - smooth(0.0, 0.4, sd.y))));
        // 밤엔 약간 더 얇게(별이 비치게)
        uniforms.uOpacity.value = 0.92 - 0.12 * night;
      }
    },
    dispose() {
      scene.remove(group);
      geo.dispose(); base.dispose(); mat.dispose(); atlas.dispose();
    },
  };
  return api;
}
