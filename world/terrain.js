// 드래곤 엠파이어 — 월드 지형 모듈 (랜턴 해협)
// createTerrain({ scene, renderer, seed, size, textures, env, detail }) → { group, heightAt, waterLevel, spawnPoint, update, setSunDirection, applyEnv, dispose }
// - env: world/env-assets.js loadEnvAssets() 결과. 생성 후 terrain.applyEnv(env) 로 나중에 주입해도 됨(비동기 로드 → 시작 지연 없음).
// - detail: true 면 능선 침식 디테일 노이즈를 높이에 추가(기본 false = 기존 지형 그대로).
// - 조명/하늘/안개는 만들지 않음(timeofday.js 담당). 모든 머티리얼은 표준 라이팅 + fog 를 받음.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries, mergeVertices } from '../vendor/addons/BufferGeometryUtils.js';
import { createObstacleField } from './obstacles.js';

// ───────────────────────── 노이즈 ─────────────────────────
function mulberry32(a) {
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function makeSimplex2(rand) {
	const p = new Uint8Array(256);
	for (let i = 0; i < 256; i++) p[i] = i;
	for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
	const perm = new Uint8Array(512), pm = new Uint8Array(512);
	for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
	const gx = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0], gy = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];
	const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
	return function noise(xin, yin) {
		const s = (xin + yin) * F2;
		const i = Math.floor(xin + s), j = Math.floor(yin + s);
		const t = (i + j) * G2;
		const x0 = xin - (i - t), y0 = yin - (j - t);
		let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
		const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
		const ii = i & 255, jj = j & 255;
		let n = 0, tt, g;
		tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = pm[ii + perm[jj]]; tt *= tt; n += tt * tt * (gx[g] * x0 + gy[g] * y0); }
		tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = pm[ii + i1 + perm[jj + j1]]; tt *= tt; n += tt * tt * (gx[g] * x1 + gy[g] * y1); }
		tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = pm[ii + 1 + perm[jj + 1]]; tt *= tt; n += tt * tt * (gx[g] * x2 + gy[g] * y2); }
		return 70 * n;
	};
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const srgb = (r, g, b) => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];

// ───────────────────────── 메인 ─────────────────────────
export function createTerrain({ scene, renderer, seed = 7, size = 6000, textures = {}, clouds = true, env = null, detail = false } = {}) {
	const rand = mulberry32(seed * 9973 + 17);
	const N = makeSimplex2(rand);
	const half = size / 2;
	const K = size / 6000; // 스케일 계수(기본 6000m 기준으로 설계)
	const waterLevel = 10;
	const group = new THREE.Group();
	group.name = 'Terrain';
	scene.add(group);
	const disposables = [];
	const track = (o) => { disposables.push(o); return o; };

	const fbm = (x, z, oct) => { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * N(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
	const ridged = (x, z, oct) => {
		let s = 0, a = 1, f = 1, w = 1, n = 0;
		for (let i = 0; i < oct; i++) {
			let v = 1 - Math.abs(N(x * f + i * 13.7, z * f - i * 7.1)); v *= v; v *= w;
			w = clamp(v * 1.8, 0, 1); s += v * a; n += a; a *= 0.5; f *= 2.1;
		}
		return s / n;
	};

	// 계곡(해협) 중심선 — 남(+z)에서 북(-z)으로 굽이침
	const ph1 = rand() * 6.28, ph2 = rand() * 6.28;
	const valleyX = (z) => K * (380 * Math.sin(z / K * 0.00105 + ph1) + 170 * Math.sin(z / K * 0.0029 + ph2)) + 70 * K * N(z * 0.0019 / K, 7.3);
	const valleyW = (z) => K * (560 + 200 * N(z * 0.0007 / K, 3.1));

	// 고봉(구름 위로 솟은 봉우리)
	const spires = [];
	for (let tries = 0; spires.length < 6 && tries < 300; tries++) {
		const z = (rand() * 2 - 1) * half * 0.72, x = (rand() * 2 - 1) * half * 0.72;
		const d = Math.abs(x - valleyX(z));
		if (d < valleyW(z) * 1.25 || d > valleyW(z) * 2.6) continue;
		if (spires.some((s) => Math.hypot(s.x - x, s.z - z) < 1200 * K)) continue;
		spires.push({ x, z, R: (260 + rand() * 160) * K, H: 520 + rand() * 300 });
	}
	// 호수(해협 북쪽 수면)
	const lakeZ = -1150 * K, lakeX = valleyX(lakeZ);

	function edgeDist(x, z) {
		const cheb = Math.max(Math.abs(x), Math.abs(z)), r = Math.hypot(x, z);
		return (Math.max(cheb, r * 0.84) + 160 * K * N(x * 0.0011 / K + 3, z * 0.0011 / K)) / K;
	}

	// 원본 높이 함수(노이즈 직접 계산)
	function rawHeight(x, z) {
		const xs = x / K, zs = z / K;
		const wx = xs + 140 * N(xs * 0.0006, zs * 0.0006), wz = zs + 140 * N(xs * 0.0006 + 5.2, zs * 0.0006 + 1.3);
		const cx = valleyX(z), W = valleyW(z);
		const d = Math.abs(x - cx) / K, Ws = W / K;
		const ed = edgeDist(x, z);
		const e = smooth(1850, 2850, ed);
		const hills = fbm(wx * 0.0011, wz * 0.0011, 4);
		const rg = ridged(wx * 0.0007, wz * 0.0007, 5);
		const mass = 0.5 + 0.5 * fbm(wx * 0.00045 + 7, wz * 0.00045 - 3, 3);
		// 계곡 벽 (가장자리에선 닫힘)
		let t = smooth(Ws * 0.5, Ws * 1.55, d + 60 * hills);
		t = Math.max(t, e * 0.97);
		const floorH = 16 + 34 * Math.pow(clamp(d / Ws, 0, 1.4), 1.6) + 9 * fbm(xs * 0.004, zs * 0.004, 2);
		let mount = 80 + 90 * hills + 260 * mass * mass + Math.pow(rg, 2.0) * (260 + 560 * e) * (0.6 + 0.6 * mass) + e * 520;
		// 절벽 지층(테라스)
		const step = 38, q = mount / step, fq = q - Math.floor(q);
		const terr = (Math.floor(q) + smooth(0.35, 0.65, fq)) * step;
		mount = lerp(mount, terr, 0.35 * (1 - e));
		let h = lerp(floorH, mount, t);
		if (detail) {
			// 능선 침식 디테일(골짜기·암릉): 산지에만, 고도 높을수록 강하게
			const rd = ridged(wx * 0.0042 + 31, wz * 0.0042 - 17, 3);
			const gul = fbm(wx * 0.011 + 5, wz * 0.0035, 2);
			h += t * smooth(70, 300, h) * ((rd - 0.33) * 58 + gul * 14);
		}
		// 고봉
		for (let i = 0; i < spires.length; i++) {
			const s = spires[i];
			const r = Math.hypot(x - s.x, z - s.z) / s.R;
			if (r < 1) h += s.H * Math.pow(1 - r, 1.7) * (0.7 + 0.45 * rg);
		}
		// 바깥 산맥 → 구름바다로 내려감
		const fall = smooth(3300, 6200, ed);
		if (fall > 0) h = lerp(h, 120 + rg * 520 + hills * 80, fall);
		// 강(침식 골)
		const rw = 34 + 14 * N(zs * 0.003, 9.1);
		const rc = (1 - smooth(rw, rw + 70, d)) * (1 - e);
		h = lerp(h, waterLevel - 6, rc);
		// 호수
		const ld = Math.hypot((x - lakeX) / 1.0, (z - lakeZ) / 1.7) / K + 70 * N(xs * 0.004, zs * 0.004);
		const lc = 1 - smooth(260, 460, ld);
		if (lc > 0) h = Math.min(h, lerp(h, waterLevel - 16, lc));
		return h;
	}

	// ───────── 전역 높이 그리드(LOD0 해상도) ─────────
	const CH = 8;                 // 청크 8x8
	const SEG = 96;               // 청크당 LOD0 분할
	const G = CH * SEG;           // 768
	const cell = size / G;        // ≈7.8m
	const GV = G + 1;
	const H = new Float32Array(GV * GV);
	for (let j = 0; j < GV; j++) {
		const z = -half + j * cell;
		for (let i = 0; i < GV; i++) H[j * GV + i] = rawHeight(-half + i * cell, z);
	}

	function heightAt(x, z) {
		const fx = (x + half) / cell, fz = (z + half) / cell;
		if (fx < 0 || fz < 0 || fx >= G || fz >= G) return rawHeight(x, z);
		const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
		const a = H[j * GV + i], b = H[j * GV + i + 1], c = H[(j + 1) * GV + i], d = H[(j + 1) * GV + i + 1];
		// 메시 삼각형 분할과 동일한 보간(대각선 b-c)
		return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
	}

	// ───────── 지면 색/블렌드 ─────────
	const forestD = (x, z) => smooth(-0.05, 0.35, fbm(x * 0.0016 / K + 11, z * 0.0016 / K - 4, 3));
	const snowLineAt = (x, z) => 540 + 70 * N(x * 0.002, z * 0.002);
	const C = {
		grassA: srgb(0.42, 0.66, 0.24), grassB: srgb(0.28, 0.50, 0.17), dry: srgb(0.66, 0.66, 0.34),
		forest: srgb(0.20, 0.38, 0.15), alpine: srgb(0.52, 0.55, 0.32), sand: srgb(0.80, 0.74, 0.54),
		under: srgb(0.16, 0.40, 0.40), rockW: srgb(0.66, 0.55, 0.44), rockC: srgb(0.56, 0.55, 0.56),
		dirt: srgb(0.50, 0.42, 0.30), snow: srgb(0.94, 0.96, 1.0),
	};
	function shade(x, z, h, ny, outC, oi, outB) {
		const slope = 1 - ny;
		const n1 = N(x * 0.003, z * 0.003), n2 = N(x * 0.013 + 4, z * 0.013 - 2);
		// 초원
		let r = lerp(C.grassA[0], C.grassB[0], 0.5 + 0.5 * n1), g = lerp(C.grassA[1], C.grassB[1], 0.5 + 0.5 * n1), b = lerp(C.grassA[2], C.grassB[2], 0.5 + 0.5 * n1);
		const dry = smooth(0.35, 0.8, n2) * 0.5;
		r = lerp(r, C.dry[0], dry); g = lerp(g, C.dry[1], dry); b = lerp(b, C.dry[2], dry);
		const fd = forestD(x, z) * (1 - smooth(260, 420, h));
		r = lerp(r, C.forest[0], fd * 0.8); g = lerp(g, C.forest[1], fd * 0.8); b = lerp(b, C.forest[2], fd * 0.8);
		const alp = smooth(230, 460, h + 40 * n2);
		r = lerp(r, C.alpine[0], alp); g = lerp(g, C.alpine[1], alp); b = lerp(b, C.alpine[2], alp);
		// 흙 (중간 경사)
		const dirtW = smooth(0.12, 0.26, slope + 0.05 * n2) * 0.7;
		r = lerp(r, C.dirt[0], dirtW); g = lerp(g, C.dirt[1], dirtW); b = lerp(b, C.dirt[2], dirtW);
		// 바위 (지층 무늬)
		const rockW = smooth(0.24, 0.40, slope + 0.06 * n2);
		const band = 0.82 + 0.18 * Math.sin(h * 0.16 + n1 * 3.0);
		const rk = 0.5 + 0.5 * N(x * 0.0015 + 9, z * 0.0015);
		const rr = lerp(C.rockW[0], C.rockC[0], rk) * band, rgc = lerp(C.rockW[1], C.rockC[1], rk) * band, rb = lerp(C.rockW[2], C.rockC[2], rk) * band;
		r = lerp(r, rr, rockW); g = lerp(g, rgc, rockW); b = lerp(b, rb, rockW);
		// 눈
		const sl = snowLineAt(x, z);
		const snowW = smooth(sl - 50, sl + 30, h) * (1 - smooth(0.42, 0.62, slope)) + smooth(sl + 120, sl + 260, h) * 0.55;
		const sw = clamp(snowW, 0, 1);
		r = lerp(r, C.snow[0], sw); g = lerp(g, C.snow[1], sw); b = lerp(b, C.snow[2], sw);
		// 물가 모래 / 수중
		const sand = 1 - smooth(waterLevel + 1.0, waterLevel + 4.5 + 2 * n2, h);
		r = lerp(r, C.sand[0], sand); g = lerp(g, C.sand[1], sand); b = lerp(b, C.sand[2], sand);
		const uw = smooth(waterLevel - 0.5, waterLevel - 8, h);
		r = lerp(r, C.under[0], uw); g = lerp(g, C.under[1], uw); b = lerp(b, C.under[2], uw);
		outC[oi] = r; outC[oi + 1] = g; outC[oi + 2] = b;
		const other = Math.max(sand, uw);
		const wm = (1 - rockW) * (1 - sw) * (1 - other), wc = rockW * (1 - sw) * (1 - other), ws = sw * (1 - other);
		outB[oi] = wm; outB[oi + 1] = wc; outB[oi + 2] = ws;
	}

	// 전역 노멀/색
	const NRM = new Float32Array(GV * GV * 3), COL = new Float32Array(GV * GV * 3), BLD = new Float32Array(GV * GV * 3);
	for (let j = 0; j < GV; j++) {
		for (let i = 0; i < GV; i++) {
			const k = j * GV + i;
			const hl = H[j * GV + Math.max(i - 1, 0)], hr = H[j * GV + Math.min(i + 1, G)];
			const hd = H[Math.max(j - 1, 0) * GV + i], hu = H[Math.min(j + 1, G) * GV + i];
			let nx = (hl - hr), ny = 2 * cell, nz = (hd - hu);
			const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
			NRM[k * 3] = nx; NRM[k * 3 + 1] = ny; NRM[k * 3 + 2] = nz;
			shade(-half + i * cell, -half + j * cell, H[k], ny, COL, k * 3, BLD);
		}
	}

	// ───────── 지형 머티리얼(표준 PBR + 디테일 노이즈 + 선택적 텍스처) ─────────
	const white = track(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); white.needsUpdate = true;
	const terrainUniforms = {
		uMeadow: { value: white }, uCliff: { value: white }, uSnow: { value: white },
		uHas: { value: new THREE.Vector3(0, 0, 0) },
		uTexScale: { value: new THREE.Vector3(1 / 24, 1 / 40, 1 / 30) },
		// env 텍스처(ENV_TEX define 일 때만 사용)
		uEM: { value: white }, uEMn: { value: white }, uEC: { value: white }, uECn: { value: white },
		uES: { value: white }, uESn: { value: white }, uEP: { value: white }, uEPn: { value: white },
		uEScale: { value: new THREE.Vector4(1 / 6, 1 / 10, 1 / 8, 1 / 4) }, // meadow, cliff, snow, path (1/타일링m)
		uWaterY: { value: waterLevel },
	};
	const terrainMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 }));
	terrainMat.onBeforeCompile = (sh) => {
		Object.assign(sh.uniforms, terrainUniforms);
		sh.vertexShader = sh.vertexShader
			.replace('#include <common>', '#include <common>\nattribute vec3 blend;\nvarying vec3 vBlend;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
			.replace('#include <project_vertex>', '#include <project_vertex>\nvBlend = blend;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
		sh.fragmentShader = sh.fragmentShader
			.replace('#include <common>', `#include <common>
varying vec3 vBlend; varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D uMeadow; uniform sampler2D uCliff; uniform sampler2D uSnow; uniform vec3 uHas; uniform vec3 uTexScale;
#ifdef ENV_TEX
uniform sampler2D uEM; uniform sampler2D uEMn; uniform sampler2D uEC; uniform sampler2D uECn;
uniform sampler2D uES; uniform sampler2D uESn; uniform sampler2D uEP; uniform sampler2D uEPn;
uniform vec4 uEScale; uniform float uWaterY;
vec4 eW; float eFade; float eMac; // color → normal 단계 공유(meadow, cliff, snow, path 가중치)
#endif
float th_hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float th_vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  float a=th_hash(i), b=th_hash(i+vec2(1,0)), c=th_hash(i+vec2(0,1)), d=th_hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
#ifdef ENV_TEX
// 반복 숨김: 회전·축소한 두 번째 샘플을 매크로 노이즈로 섞음
vec2 e_rot(vec2 uv){ return vec2(uv.x*0.8 - uv.y*0.6, uv.x*0.6 + uv.y*0.8) * 0.43 + vec2(0.37, 0.71); }
vec3 e_tex2(sampler2D t, vec2 uv, float m){ return mix(texture2D(t, uv).rgb, texture2D(t, e_rot(uv)).rgb, m); }
vec2 e_nrm2(sampler2D t, vec2 uv, float m){ vec2 a = texture2D(t, uv).xy, b = texture2D(t, e_rot(uv)).xy; return mix(a, b, m)*2.0 - 1.0; }
// 절벽: 층리는 수평 유지, 두 번째 샘플은 비등방 스케일+오프셋
vec2 e_cl2(vec2 uv){ return uv*vec2(0.47, 0.61) + vec2(0.31, 0.17); }
vec3 e_texC(sampler2D t, vec2 uv, float m){ return mix(texture2D(t, uv).rgb, texture2D(t, e_cl2(uv)).rgb, m); }
vec2 e_nrmC(sampler2D t, vec2 uv, float m){ return mix(texture2D(t, uv).xy, texture2D(t, e_cl2(uv)).xy, m)*2.0 - 1.0; }
vec3 e_avg(sampler2D t){ return max(textureLod(t, vec2(0.5), 12.0).rgb, vec3(0.02)); }
#endif`)
			.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 base = diffuseColor.rgb;
  vec3 col = base;
  float wsum = vBlend.x + vBlend.y + vBlend.z;
  if (uHas.x + uHas.y + uHas.z > 0.5) {
    vec3 tm = base, tc = base, ts = base;
    if (uHas.x > 0.5) { vec3 a = texture2D(uMeadow, vWPos.xz*uTexScale.x).rgb; vec3 b = texture2D(uMeadow, vWPos.xz*uTexScale.x*0.27+0.37).rgb; tm = mix(a, b, 0.4) * (base / max(vec3(0.05), vec3(0.16, 0.36, 0.07))) * 0.5 + mix(a,b,0.4)*0.5; }
    if (uHas.y > 0.5) { vec3 w = pow(abs(vWNrm), vec3(4.0)); w /= (w.x+w.y+w.z);
      tc = texture2D(uCliff, vWPos.zy*uTexScale.y).rgb*w.x + texture2D(uCliff, vWPos.xz*uTexScale.y).rgb*w.y + texture2D(uCliff, vWPos.xy*uTexScale.y).rgb*w.z; }
    if (uHas.z > 0.5) { ts = texture2D(uSnow, vWPos.xz*uTexScale.z).rgb; }
    col = tm*vBlend.x + tc*vBlend.y + ts*vBlend.z + base*max(0.0, 1.0 - wsum);
  }
  float dist = length(vWPos - cameraPosition);
  float fine = 1.0 - smoothstep(250.0, 900.0, dist);
  float dn = th_vnoise(vWPos.xz*0.021)*0.45 + th_vnoise(vWPos.xz*0.09)*0.35*(0.4+0.6*fine) + th_vnoise(vWPos.xz*0.37)*0.2*fine;
  float rockness = vBlend.y;
  col *= 0.80 + 0.40*dn;
  // 바위면 세로 줄무늬(트라이플래너 근사)
  float hz = (vWPos.x + vWPos.z) * 0.7071;
  float streak = th_vnoise(vec2(hz*0.03, vWPos.y*0.18))*0.6 + th_vnoise(vec2(hz*0.12, vWPos.y*0.5))*0.4;
  float crack = smoothstep(0.62, 0.75, th_vnoise(vec2(hz*0.25, vWPos.y*0.04)));
  col *= 1.0 - rockness*(0.32*(streak-0.5) + 0.25*crack*fine);
#ifdef ENV_TEX
  {
    vec3 Nw = normalize(vWNrm);
    float slope = 1.0 - Nw.y;
    float mac = clamp(th_vnoise(vWPos.xz*0.0045)*0.7 + th_vnoise(vWPos.xz*0.021)*0.3, 0.0, 1.0);
    float fade = 1.0 - smoothstep(320.0, 1500.0, dist);
    float other = max(0.0, 1.0 - wsum);
    // 흙길: 강가·계곡 바닥 패치·중간 경사(절벽 기슭)
    float riv = (1.0 - smoothstep(uWaterY + 2.5, uWaterY + 8.0 + 10.0*mac, vWPos.y)) * (1.0 - smoothstep(0.12, 0.3, slope));
    float patchy = smoothstep(0.6, 0.74, th_vnoise(vWPos.xz*0.012 + 3.1)) * (1.0 - smoothstep(50.0, 140.0, vWPos.y));
    float dirtB = smoothstep(0.12, 0.22, slope + 0.1*(mac - 0.5)) * 0.6 * smoothstep(0.35, 0.65, th_vnoise(vWPos.xz*0.025 + 1.7));
    float wP = vBlend.x * clamp(max(max(riv, patchy*0.5), dirtB), 0.0, 1.0);
    eW = vec4(vBlend.x - wP, vBlend.y, vBlend.z, wP);
    eFade = fade; eMac = mac;
    if (fade > 0.001) {
      vec3 cE = base * other;
      if (eW.x > 0.005) { vec3 t = e_tex2(uEM, vWPos.xz*uEScale.x, mac); vec3 c = base * (t / e_avg(uEM)); c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), 0.18); cE += eW.x * c; }
      if (eW.w > 0.005) { vec3 t = e_tex2(uEP, vWPos.xz*uEScale.w, mac); cE += eW.w * mix(t*0.9, base * (t / e_avg(uEP)), 0.3); }
      if (eW.z > 0.005) { vec3 t = e_tex2(uES, vWPos.xz*uEScale.z, mac); cE += eW.z * mix(t, base * (t / e_avg(uES)), 0.25); }
      if (eW.y > 0.005) {
        vec3 tw = pow(abs(Nw), vec3(5.0)); tw /= (tw.x + tw.y + tw.z);
        float cs = uEScale.y;
        float warp = (th_vnoise(vWPos.xz*0.006) - 0.5)*16.0 + (th_vnoise(vWPos.xz*0.03) - 0.5)*3.0; // 지층 굴곡
        vec3 t = e_texC(uEC, vec2(vWPos.z, vWPos.y + warp)*cs, mac)*tw.x
               + texture2D(uEC, vWPos.xz*cs*0.7).rgb*tw.y
               + e_texC(uEC, vec2(vWPos.x, vWPos.y + warp)*cs, mac)*tw.z;
        vec3 ca = e_avg(uEC);
        // 바위 매크로 색(정점색: 지층 띠·따뜻/차가운 변화) × 텍스처 디테일
        vec3 cc = mix(base * (t / ca), t * dot(base, vec3(0.333)) / dot(ca, vec3(0.333)), 0.35);
        cE += eW.y * cc;
      }
      // 매크로 밝기 변화로 반복 추가 은폐
      cE *= 0.88 + 0.24*th_vnoise(vWPos.xz*0.009 + 7.0);
      col = mix(col, cE, fade);
    }
  }
#endif
  diffuseColor.rgb = col;
}`)
			.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef ENV_TEX
if (eFade > 0.001) {
  vec3 Nw = normalize(vWNrm);
  vec3 pert = vec3(0.0);
  float mac = eMac;
  if (eW.x > 0.005) { vec2 m = e_nrm2(uEMn, vWPos.xz*uEScale.x, mac); pert += eW.x * vec3(m.x, 0.0, m.y) * 0.8; }
  if (eW.w > 0.005) { vec2 m = e_nrm2(uEPn, vWPos.xz*uEScale.w, mac); pert += eW.w * vec3(m.x, 0.0, m.y); }
  if (eW.z > 0.005) { vec2 m = e_nrm2(uESn, vWPos.xz*uEScale.z, mac); pert += eW.z * vec3(m.x, 0.0, m.y) * 0.8; }
  if (eW.y > 0.005) {
    vec3 tw = pow(abs(Nw), vec3(5.0)); tw /= (tw.x + tw.y + tw.z);
    float cs = uEScale.y;
    float warp = (th_vnoise(vWPos.xz*0.006) - 0.5)*16.0 + (th_vnoise(vWPos.xz*0.03) - 0.5)*3.0;
    vec2 nx = e_nrmC(uECn, vec2(vWPos.z, vWPos.y + warp)*cs, mac);
    vec2 nz = e_nrmC(uECn, vec2(vWPos.x, vWPos.y + warp)*cs, mac);
    vec2 ny = texture2D(uECn, vWPos.xz*cs*0.7).xy*2.0 - 1.0;
    pert += eW.y * 0.9 * (vec3(0.0, nx.y, nx.x)*tw.x + vec3(ny.x, 0.0, ny.y)*tw.y + vec3(nz.x, nz.y, 0.0)*tw.z);
  }
  float nf = 1.0 - smoothstep(120.0, 750.0, length(vWPos - cameraPosition));
  Nw = normalize(Nw + pert * nf);
  normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
}
#endif`)
	};

	// 텍스처 로드(실패하면 절차적 그대로)
	const loader = new THREE.TextureLoader();
	const maxAniso = renderer && renderer.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
	[['meadow', 'uMeadow', 'x'], ['cliff', 'uCliff', 'y'], ['snow', 'uSnow', 'z']].forEach(([key, uni, comp]) => {
		const url = textures && textures[key];
		if (!url || typeof url !== 'string') return;
		loader.load(url, (tex) => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
			tex.colorSpace = THREE.SRGBColorSpace;
			tex.anisotropy = maxAniso;
			tex.needsUpdate = true;
			track(tex);
			terrainUniforms[uni].value = tex;
			terrainUniforms.uHas.value[comp] = 1;
		}, undefined, () => { /* 폴백: 절차적 색 유지 */ });
	});

	// ───────── 청크 메시 빌드(스커트 포함) ─────────
	function buildPatch(nx, getVert, skirtDepth) {
		// getVert(i, j, outPos, outNrm, outCol, outBld, o) for i,j in [0,nx]
		const nv = (nx + 1) * (nx + 1), ns = 4 * (nx + 1);
		const total = nv + ns;
		const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3), bld = new Float32Array(total * 3);
		for (let j = 0; j <= nx; j++) for (let i = 0; i <= nx; i++) getVert(i, j, pos, nrm, col, bld, (j * (nx + 1) + i) * 3);
		const idx = [];
		for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
			const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
			idx.push(a, c, b, b, c, d);
		}
		// 스커트: 가장자리 4변
		const edges = [];
		for (let i = 0; i <= nx; i++) edges.push([i, 0]);
		for (let j = 0; j <= nx; j++) edges.push([nx, j]);
		for (let i = nx; i >= 0; i--) edges.push([i, nx]);
		for (let j = nx; j >= 0; j--) edges.push([0, j]);
		let s = nv;
		const sideStart = [];
		for (let e = 0; e < 4; e++) {
			sideStart.push(s);
			for (let k = 0; k <= nx; k++) {
				const [i, j] = edges[e * (nx + 1) + k];
				const src = (j * (nx + 1) + i) * 3, dst = s * 3;
				pos[dst] = pos[src]; pos[dst + 1] = pos[src + 1] - skirtDepth; pos[dst + 2] = pos[src + 2];
				for (let c = 0; c < 3; c++) { nrm[dst + c] = nrm[src + c]; col[dst + c] = col[src + c] * 0.8; bld[dst + c] = bld[src + c]; }
				s++;
			}
		}
		for (let e = 0; e < 4; e++) {
			for (let k = 0; k < nx; k++) {
				const [i0, j0] = edges[e * (nx + 1) + k], [i1, j1] = edges[e * (nx + 1) + k + 1];
				const t0 = j0 * (nx + 1) + i0, t1 = j1 * (nx + 1) + i1, b0 = sideStart[e] + k, b1 = b0 + 1;
				idx.push(t0, t1, b0, t1, b1, b0); // 양면 렌더 대신 양방향 삼각형
				idx.push(t0, b0, t1, t1, b0, b1);
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
		geo.setAttribute('blend', new THREE.BufferAttribute(bld, 3));
		geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
		geo.computeBoundingBox(); geo.computeBoundingSphere();
		return track(geo);
	}

	const LODS = [1, 2, 4];         // stride
	const LOD_DIST = [850 * K, 2100 * K];
	const chunks = [];
	const chunkSize = size / CH;
	for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
		const levels = LODS.map((stride, li) => {
			const nx = SEG / stride;
			const geo = buildPatch(nx, (i, j, P, Nn, Cc, B, o) => {
				const gi = ci * SEG + i * stride, gj = cj * SEG + j * stride, k = gj * GV + gi;
				P[o] = -half + gi * cell; P[o + 1] = H[k]; P[o + 2] = -half + gj * cell;
				Nn[o] = NRM[k * 3]; Nn[o + 1] = NRM[k * 3 + 1]; Nn[o + 2] = NRM[k * 3 + 2];
				Cc[o] = COL[k * 3]; Cc[o + 1] = COL[k * 3 + 1]; Cc[o + 2] = COL[k * 3 + 2];
				B[o] = BLD[k * 3]; B[o + 1] = BLD[k * 3 + 1]; B[o + 2] = BLD[k * 3 + 2];
			}, 6 + stride * 6);
			const m = new THREE.Mesh(geo, terrainMat);
			m.receiveShadow = true; m.visible = li === 2; m.matrixAutoUpdate = false;
			m.name = `chunk_${ci}_${cj}_L${li}`;
			group.add(m);
			return m;
		});
		const bb = levels[0].geometry.boundingBox;
		chunks.push({ levels, box: bb.clone(), cur: 2 });
	}

	// 바깥 8타일(맵 밖 산맥 → 구름바다)
	const OSEG = 40;
	for (let tj = -1; tj <= 1; tj++) for (let ti = -1; ti <= 1; ti++) {
		if (ti === 0 && tj === 0) continue;
		const x0 = ti * size - half, z0 = tj * size - half, oc = size / OSEG;
		const geo = buildPatch(OSEG, (i, j, P, Nn, Cc, B, o) => {
			const x = x0 + i * oc, z = z0 + j * oc, h = rawHeight(x, z);
			const e = oc * 0.5;
			let nx = rawHeight(x - e, z) - rawHeight(x + e, z), nz = rawHeight(x, z - e) - rawHeight(x, z + e), ny = 2 * e;
			const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
			P[o] = x; P[o + 1] = h; P[o + 2] = z; Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz;
			shade(x, z, h, ny, Cc, o, B);
		}, 160);
		const m = new THREE.Mesh(geo, terrainMat);
		m.matrixAutoUpdate = false; m.name = `outer_${ti}_${tj}`;
		group.add(m);
	}

	// ───────── 물(해협/강/호수) ─────────
	const DT = 512;
	const depthData = new Uint8Array(DT * DT * 4);
	for (let j = 0; j < DT; j++) for (let i = 0; i < DT; i++) {
		const x = -half + (i + 0.5) / DT * size, z = -half + (j + 0.5) / DT * size;
		const dep = clamp((waterLevel - heightAt(x, z)) / 20, 0, 1);
		const o = (j * DT + i) * 4; depthData[o] = dep * 255; depthData[o + 1] = 0; depthData[o + 2] = 0; depthData[o + 3] = 255;
	}
	const depthTex = track(new THREE.DataTexture(depthData, DT, DT));
	depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;
	const waterUniforms = {
		uTime: { value: 0 }, uDepth: { value: depthTex }, uHalf: { value: half },
		uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() },
		uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
		uSkyColor: { value: new THREE.Color(0.62, 0.78, 0.95) },
	};
	const waterMat = track(new THREE.MeshStandardMaterial({ color: 0x1f8a8f, roughness: 0.12, metalness: 0.0, transparent: true, depthWrite: false }));
	waterMat.onBeforeCompile = (sh) => {
		Object.assign(sh.uniforms, waterUniforms);
		sh.vertexShader = sh.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
			.replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
		sh.fragmentShader = sh.fragmentShader
			.replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uTime; uniform sampler2D uDepth; uniform float uHalf;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor;
float w_hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float w_noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(w_hash(i), w_hash(i+vec2(1,0)), f.x), mix(w_hash(i+vec2(0,1)), w_hash(i+vec2(1,1)), f.x), f.y); }
vec2 w_grad(vec2 p){ float e=0.15; return vec2(w_noise(p+vec2(e,0))-w_noise(p-vec2(e,0)), w_noise(p+vec2(0,e))-w_noise(p-vec2(0,e)))/(2.0*e); }`)
			.replace('#include <color_fragment>', `#include <color_fragment>
float wDepth = texture2D(uDepth, (vWPos.xz + uHalf) / (2.0*uHalf)).r;
float wDist = length(vWPos - cameraPosition);
vec2 wp = vWPos.xz;
vec2 g = vec2(0.0);
g += 0.9*vec2(0.8,0.6)*cos(dot(wp, vec2(0.8,0.6))*0.11 + uTime*1.3);
g += 0.6*vec2(-0.5,0.85)*cos(dot(wp, vec2(-0.5,0.85))*0.19 + uTime*1.7);
g += w_grad(wp*0.06 + vec2(uTime*0.05, uTime*0.03))*0.9;
g += w_grad(wp*0.21 - vec2(uTime*0.09, -uTime*0.07))*0.45;
g *= (0.22 * (1.0 - smoothstep(300.0, 2500.0, wDist)) + 0.03);
vec3 wN = normalize(vec3(-g.x, 1.0, -g.y));
float shallow = smoothstep(0.0, 0.45, wDepth);
diffuseColor.rgb = mix(vec3(0.20, 0.72, 0.68), vec3(0.03, 0.22, 0.30), shallow);
float foamN = w_noise(wp*0.35 + uTime*0.4) * w_noise(wp*0.11 - uTime*0.2);
float foam = (1.0 - smoothstep(0.0, 0.05, wDepth)) * smoothstep(0.15, 0.45, foamN + (0.05 - wDepth)*4.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), foam*0.8);
diffuseColor.a = mix(0.35, 0.86, smoothstep(0.0, 0.3, wDepth)) + foam*0.4;`)
			.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
			.replace('#include <opaque_fragment>', `
{
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.03 + 0.97*pow(1.0 - max(dot(wN, V), 0.0), 5.0);
  vec3 R = reflect(-V, wN);
  vec3 sky = mix(uSkyColor*1.05, uSkyColor*0.75 + vec3(0.0,0.03,0.08), clamp(R.y*1.5, 0.0, 1.0));
  outgoingLight = mix(outgoingLight, sky, fres*0.85);
  float sd = max(dot(R, normalize(uSunDir)), 0.0);
  outgoingLight += uSunColor * (pow(sd, 600.0)*8.0 + pow(sd, 60.0)*0.35) * step(0.0, uSunDir.y);
  diffuseColor.a = clamp(max(diffuseColor.a, fres), 0.0, 1.0);
}
#include <opaque_fragment>`);
	};
	const water = new THREE.Mesh(track(new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2)), waterMat);
	water.position.y = waterLevel; water.renderOrder = 2; water.name = 'water';
	group.add(water);

	// ───────── 식생 / 바위 (인스턴스, 거리별 2단계) ─────────
	function colorize(geo, fn) {
		const p = geo.attributes.position, c = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
		geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
		return geo;
	}
	function foliageNormals(geo, cx, cy, cz, up = 0.6) {
		const p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3();
		for (let i = 0; i < p.count; i++) {
			v.set(p.getX(i) - cx, (p.getY(i) - cy) + up, p.getZ(i) - cz).normalize();
			const ox = n.getX(i), oy = n.getY(i), oz = n.getZ(i);
			v.set(lerp(ox, v.x, 0.7), lerp(oy, v.y, 0.7), lerp(oz, v.z, 0.7)).normalize();
			n.setXYZ(i, v.x, v.y, v.z);
		}
		return geo;
	}
	const strip = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
	const trunkC = srgb(0.36, 0.25, 0.17);
	// 침엽수(높이 1 기준)
	const coniferNear = (() => {
		const parts = [colorize(strip(new THREE.CylinderGeometry(0.025, 0.04, 0.25, 5, 1).translate(0, 0.12, 0)), () => trunkC)];
		const tiers = [[0.14, 0.42, 0.30, 0.0], [0.36, 0.38, 0.23, 0.5], [0.57, 0.43, 0.15, 1.0]];
		tiers.forEach(([y, h, r, k], ti) => {
			const g = strip(new THREE.ConeGeometry(r, h, 8, 1, false).translate(0, y + h / 2, 0));
			g.rotateY(ti * 0.4);
			foliageNormals(g, 0, y + h * 0.2, 0, 0.1);
			colorize(g, (x, yy) => { const t = clamp((yy - y) / h, 0, 1); return srgb(lerp(0.10, 0.26, t * 0.6 + k * 0.3), lerp(0.26, 0.47, t * 0.6 + k * 0.3), lerp(0.14, 0.22, t)); });
			parts.push(g);
		});
		return track(mergeGeometries(parts));
	})();
	const coniferFar = track(colorize(strip(new THREE.ConeGeometry(0.27, 0.92, 6, 1, true).translate(0, 0.54, 0)), (x, y) => srgb(lerp(0.11, 0.22, y), lerp(0.28, 0.42, y), 0.17)));
	const broadNear = (() => {
		const parts = [colorize(strip(new THREE.CylinderGeometry(0.035, 0.06, 0.5, 5, 1).translate(0, 0.25, 0)), () => trunkC)];
		const blobs = [[0, 0.62, 0, 0.36, 1], [0.2, 0.5, 0.12, 0.22, 0], [-0.16, 0.52, -0.14, 0.24, 0], [0.05, 0.82, -0.05, 0.22, 0]];
		blobs.forEach(([x, y, z, r, d]) => {
			const g = strip(new THREE.IcosahedronGeometry(r, d)).scale(1, 0.85, 1).translate(x, y, z);
			foliageNormals(g, 0, 0.55, 0, 0.15);
			colorize(g, (px, py) => { const t = clamp((py - 0.3) / 0.7, 0, 1); return srgb(lerp(0.20, 0.50, t), lerp(0.38, 0.66, t), lerp(0.12, 0.22, t)); });
			parts.push(g);
		});
		return track(mergeGeometries(parts));
	})();
	const broadFar = track(colorize(strip(new THREE.OctahedronGeometry(0.4, 0)).scale(1, 0.9, 1).translate(0, 0.62, 0), (x, y) => srgb(lerp(0.22, 0.42, y - 0.3), lerp(0.40, 0.58, y - 0.3), 0.17)));
	const rockGeo = (() => {
		let g = new THREE.DodecahedronGeometry(1, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv');
		g = mergeVertices(g);
		const p = g.attributes.position;
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
			const s = 1 + 0.28 * N(x * 1.7 + 3, z * 1.7 + y * 1.3);
			p.setXYZ(i, x * s, Math.max(y * s * 0.7, -0.3), z * s);
		}
		g = g.toNonIndexed(); g.computeVertexNormals();
		colorize(g, (x, y) => { const t = clamp(y + 0.3, 0, 1); return srgb(lerp(0.42, 0.62, t), lerp(0.40, 0.60, t * 0.9), lerp(0.38, 0.52, t * 0.8)); });
		return track(g);
	})();

	const vegMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
	const rockMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));

	// 인스턴스 데이터 (종류별)
	const kinds = [
		{ name: 'conifer', near: coniferNear, far: coniferFar, nearR: 700 * K, farR: 2800 * K, capN: 4500, capF: 16000, mat: vegMat, list: [] },
		{ name: 'broadleaf', near: broadNear, far: broadFar, nearR: 650 * K, farR: 2200 * K, capN: 3500, capF: 12000, mat: vegMat, list: [] },
		{ name: 'rock', near: rockGeo, far: null, nearR: 1100 * K, farR: 0, capN: 3000, capF: 0, mat: rockMat, list: [] },
	];
	const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
	function addInst(kind, x, y, z, sx, sy, rotY, r, g, b, tilt = 0) {
		_e.set(tilt * (rand() - 0.5), rotY, tilt * (rand() - 0.5)); _q.setFromEuler(_e);
		_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sx));
		kind.list.push({ x, y, z, m: _m.toArray(), c: [r, g, b], sx, sy, rotY, ex: _e.x, ez: _e.z });
	}
	const slopeAt = (x, z) => {
		const fx = clamp(Math.round((x + half) / cell), 0, G), fz = clamp(Math.round((z + half) / cell), 0, G);
		return NRM[(fz * GV + fx) * 3 + 1];
	};
	// 나무 배치(지터 그리드)
	const TS = 17 * K;
	for (let z = -half + TS; z < half - TS; z += TS) for (let x = -half + TS; x < half - TS; x += TS) {
		const px = x + (rand() - 0.5) * TS * 0.9, pz = z + (rand() - 0.5) * TS * 0.9;
		const h = heightAt(px, pz);
		if (h < waterLevel + 3.5) continue;
		const ny = slopeAt(px, pz);
		if (ny < (detail ? 0.8 : 0.86)) continue; // detail 지형은 경사가 거칠어 허용치 완화
		const fd = forestD(px, pz);
		const sl = snowLineAt(px, pz);
		if (h > sl - 60) continue;
		const pr = fd * 0.85 + 0.035;
		if (rand() > pr) continue;
		const v = rand();
		const lowland = 1 - smooth(120, 300, h);
		const broad = rand() < 0.15 + 0.55 * lowland * (1 - fd * 0.5);
		const sink = 1.5 + (1 - ny) * 20; // 경사면에서 뿌리 묻기
		if (broad) {
			const s = (11 + v * 9) * (0.85 + 0.3 * rand());
			addInst(kinds[1], px, h - sink, pz, s * (0.9 + rand() * 0.3), s, rand() * 6.28, 0.85 + rand() * 0.3, 0.85 + rand() * 0.3, 0.8 + rand() * 0.2, 0.1);
		} else {
			const s = (16 + v * 16) * (1 - smooth(300, 520, h) * 0.35);
			const t = rand();
			addInst(kinds[0], px, h - sink, pz, s * (0.75 + rand() * 0.25), s, rand() * 6.28, 0.8 + t * 0.35, 0.85 + t * 0.3, 0.85 + rand() * 0.2, 0.05);
		}
	}
	// 바위 배치
	for (let i = 0; i < 9000; i++) {
		const px = (rand() * 2 - 1) * (half - 40), pz = (rand() * 2 - 1) * (half - 40);
		const h = heightAt(px, pz); if (h < waterLevel - 2) continue;
		const ny = slopeAt(px, pz);
		if (ny < 0.62) continue;
		const onCliff = ny < 0.85, meadow = ny > 0.93 && h < 300;
		if (!(onCliff ? rand() < 0.45 : meadow ? rand() < 0.18 : rand() < 0.25)) continue;
		const s = onCliff ? 5 + rand() * 9 : 2 + rand() * 6 * (rand() < 0.1 ? 3 : 1);
		const sy = s * (onCliff ? 0.9 + rand() * 0.5 : 0.6 + rand() * 0.5);
		const sink = sy * 0.3 + (1 - ny) * s * 1.6;
		const t = 0.8 + rand() * 0.35;
		addInst(kinds[2], px, h - sink, pz, s * (0.8 + rand() * 0.4), sy, rand() * 6.28, t, t * (0.95 + rand() * 0.08), t * (0.9 + rand() * 0.1), 0.3);
	}

	// ───────── 랜드마크 ─────────
	const landParts = [];
	const stoneCol = (x, y, z, ny = 0) => {
		const n = N(x * 0.02, y * 0.05 + z * 0.02);
		const band = 0.85 + 0.15 * Math.sin(y * 0.2 + n * 2);
		const c = srgb((0.62 + 0.06 * n) * band, (0.55 + 0.05 * n) * band, (0.47 + 0.04 * n) * band);
		if (ny > 0.55) { const m = smooth(0.55, 0.8, ny); const g = srgb(0.36, 0.56, 0.22); return [lerp(c[0], g[0], m), lerp(c[1], g[1], m), lerp(c[2], g[2], m)]; }
		return c;
	};
	function finishStone(g, mossy = true) {
		g = g.index ? g.toNonIndexed() : g;
		g.computeVertexNormals();
		const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) { const v = stoneCol(p.getX(i), p.getY(i), p.getZ(i), mossy ? n.getY(i) : 0); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
		g.setAttribute('color', new THREE.BufferAttribute(c, 3));
		if (g.attributes.uv) g.deleteAttribute('uv');
		return g;
	}
	// 1) 계곡 입구의 거대 아치 바위
	const obstacleShapes = [];
	const archZ = 1250 * K, archCX = valleyX(archZ);
	const archSpan = 250 * K, archRise = 210;
	{
		const yl = heightAt(archCX - archSpan, archZ), yr = heightAt(archCX + archSpan, archZ);
		const pts = [];
		pts.push(new THREE.Vector3(archCX - archSpan * 1.04, yl - 40, archZ));
		for (let i = 0; i <= 16; i++) {
			const a = Math.PI * i / 16;
			const base = lerp(yl, yr, i / 16);
			pts.push(new THREE.Vector3(archCX - Math.cos(a) * archSpan, base + Math.sin(a) * archRise + 10, archZ + Math.sin(a * 2) * 18));
		}
		pts.push(new THREE.Vector3(archCX + archSpan * 1.04, yr - 40, archZ));
		const curve = new THREE.CatmullRomCurve3(pts);
		for (let i=0;i<36;i++) { const u=(i+.5)/36, foot=Math.pow(Math.abs(u-.5)*2,3); obstacleShapes.push({id:'arch',a:curve.getPointAt(i/36),b:curve.getPointAt((i+1)/36),radius:(26+34*foot)*1.15}); }
		const TUB = 72, RAD = 12;
		let g = new THREE.TubeGeometry(curve, TUB, 1, RAD, false);
		const p = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3(), cpt = new THREE.Vector3();
		for (let i = 0; i < p.count; i++) {
			const u = uv.getX(i), ang = uv.getY(i) * Math.PI * 2;
			curve.getPointAt(u, cpt);
			v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(cpt).normalize();
			const foot = Math.pow(Math.abs(u - 0.5) * 2, 3);
			let r = 26 + 34 * foot;
			r *= 1 + 0.22 * N(u * 14, Math.cos(ang) * 1.3 + 4) + 0.12 * N(u * 40, Math.sin(ang) * 2);
			const sy = v.y > 0 ? 1.0 : 0.85;
			p.setXYZ(i, cpt.x + v.x * r, cpt.y + v.y * r * sy, cpt.z + v.z * r * 1.3);
		}
		landParts.push(finishStone(g));
		// 발치의 낙석
		for (let i = 0; i < 14; i++) {
			const side = i % 2 ? 1 : -1, px = archCX + side * archSpan * (0.8 + rand() * 0.5), pz = archZ + (rand() - 0.5) * 140;
			const s = 10 + rand() * 18;
			addInst(kinds[2], px, heightAt(px, pz) - s * 0.2, pz, s, s * 0.8, rand() * 6, 1, 0.97, 0.92, 0.5);
		}
	}
	// 2) 등불이 걸린 절벽 탑 두 개 + 계곡을 가로지르는 등불 사슬
	const towerZ = -380 * K, tcx = valleyX(towerZ), tw = valleyW(towerZ);
	const towerTops = [];
	const lanterns = [];
	const chainPts = [];
	function placeTower(dir) {
		// 계곡 벽 위의 평평한 자리 탐색
		let best = null;
		for (let d = tw * 0.75; d < tw * 1.6; d += 20) {
			const x = tcx + dir * d, h = heightAt(x, towerZ);
			if (h > 110 && slopeAt(x, towerZ) > 0.7) { best = { x, h }; break; }
		}
		if (!best) best = { x: tcx + dir * tw * 1.1, h: heightAt(tcx + dir * tw * 1.1, towerZ) };
		const TH = 125, prof = [];
		const pr = [[30, -30], [26, 0], [22, 10], [24, 14], [19, 18], [17, 60], [20, 64], [15, 68], [13, 100], [17, 104], [17, 112], [0.1, 112]];
		pr.forEach(([r, y]) => prof.push(new THREE.Vector2(r, y)));
		let g = new THREE.LatheGeometry(prof, 10).translate(best.x, best.h, towerZ);
		landParts.push(finishStone(g, false));
		// 지붕(어두운 청록 기와)
		let roof = new THREE.ConeGeometry(24, 34, 10).translate(best.x, best.h + 112 + 17, towerZ).toNonIndexed();
		roof.computeVertexNormals(); roof.deleteAttribute('uv');
		colorize(roof, () => srgb(0.16, 0.30, 0.34));
		landParts.push(roof);
		towerTops.push(new THREE.Vector3(best.x, best.h + 100, towerZ));
		// 탑 주변 등불
		for (let i = 0; i < 10; i++) {
			const a = i / 10 * Math.PI * 2;
			lanterns.push(new THREE.Vector3(best.x + Math.cos(a) * 21, best.h + 60, towerZ + Math.sin(a) * 21));
		}
	}
	placeTower(-1); placeTower(1);
	for (const top of towerTops) obstacleShapes.push({id:'tower',a:{x:top.x,y:top.y-120,z:top.z},b:{x:top.x,y:top.y+29,z:top.z},radius:24});
	{
		const [A, B] = towerTops;
		for (let c = 0; c < 3; c++) {
			const sag = 70 + c * 45, zoff = (c - 1) * 16, yoff = c * -12;
			const span = A.distanceTo(B), nL = Math.floor(span / 22);
			let prev = null;
			for (let i = 0; i <= 60; i++) {
				const t = i / 60;
				const pt = new THREE.Vector3().lerpVectors(A, B, t);
				pt.y += yoff - sag * 4 * t * (1 - t); pt.z += zoff;
				if (prev) chainPts.push(prev.x, prev.y, prev.z, pt.x, pt.y, pt.z);
				prev = pt;
			}
			for (let i = 1; i < nL; i++) {
				const t = i / nL;
				const pt = new THREE.Vector3().lerpVectors(A, B, t);
				pt.y += yoff - sag * 4 * t * (1 - t) - 4; pt.z += zoff;
				lanterns.push(pt);
			}
		}
	}
	// 3) 떠다니는 섬들
	const islands = [];
	{
		const zs = [650, -150, -900, -1700, -2300];
		zs.forEach((zz, i) => {
			const z = zz * K, x = valleyX(z) + (i % 2 ? 1 : -1) * (120 + rand() * 220) * K;
			const R = 55 + rand() * 60, y = 190 + rand() * 170;
			const prof = [];
			const steps = 9;
			prof.push(new THREE.Vector2(0.01, 6));
			prof.push(new THREE.Vector2(R * 0.55, 5));
			prof.push(new THREE.Vector2(R * 0.95, 1));
			prof.push(new THREE.Vector2(R, -3));
			for (let s = 1; s <= steps; s++) { const t = s / steps; prof.push(new THREE.Vector2(R * (1 - t) * (0.9 + 0.1 * Math.cos(t * 9)), -3 - t * R * 1.5)); }
			prof[prof.length - 1].x = 0.01;
			let g = new THREE.LatheGeometry(prof, 16);
			g = mergeVertices(g.deleteAttribute('uv').deleteAttribute('normal'));
			const p = g.attributes.position;
			for (let k = 0; k < p.count; k++) {
				const px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
				const a = Math.atan2(pz, px);
				const s = 1 + 0.18 * N(Math.cos(a) * 1.5 + i * 7, py * 0.04) * (py < -4 ? 1 : 0.4);
				p.setXYZ(k, px * s, py + (py < -4 ? 6 * N(px * 0.05, pz * 0.05) : 0), pz * s);
			}
			g = g.toNonIndexed(); g.translate(x, y, z); g.computeVertexNormals();
			const n = g.attributes.normal, pp = g.attributes.position, c = new Float32Array(pp.count * 3);
			for (let k = 0; k < pp.count; k++) {
				const ly = pp.getY(k) - y;
				let v;
				if (ly > -1 && n.getY(k) > 0.3) v = srgb(0.40, 0.64, 0.24);
				else { const t = clamp(-ly / (R * 1.5), 0, 1); v = srgb(lerp(0.55, 0.42, t), lerp(0.44, 0.36, t), lerp(0.32, 0.34, t)); }
				c[k * 3] = v[0]; c[k * 3 + 1] = v[1]; c[k * 3 + 2] = v[2];
			}
			g.setAttribute('color', new THREE.BufferAttribute(c, 3));
			landParts.push(g);
			islands.push({ x, y, z, R });
			// 중첩된 구들로 섬의 납작한 윗면과 아래로 가늘어지는 형태를 근사한다.
			for (const [dy,r] of [[-0.15,0.85],[-0.55,0.62],[-1.0,0.34]]) { const c={x,y:y+dy*R,z}; obstacleShapes.push({id:'island',a:c,b:c,radius:r*R}); }
			// 섬 위 나무
			const nt = 3 + Math.floor(R / 18);
			for (let t = 0; t < nt; t++) {
				const a = rand() * 6.28, rr = Math.sqrt(rand()) * R * 0.6;
				const s = 14 + rand() * 10;
				addInst(kinds[0], x + Math.cos(a) * rr, y + 3, z + Math.sin(a) * rr, s * 0.8, s, rand() * 6, 1, 1, 1, 0.05);
			}
			// 섬 아래 매달린 등불
			for (let t = 0; t < 4; t++) {
				const a = t / 4 * 6.28 + rand();
				lanterns.push(new THREE.Vector3(x + Math.cos(a) * R * 0.8, y - 12 - rand() * 8, z + Math.sin(a) * R * 0.8));
			}
		});
	}
	const landGeo = track(mergeGeometries(landParts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; })));
	const landMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }));
	const landmarks = new THREE.Mesh(landGeo, landMat);
	landmarks.name = 'landmarks'; landmarks.castShadow = true; landmarks.receiveShadow = true;
	group.add(landmarks);

	// 등불(봉랍 등불) + 사슬
	const lanternMat = track(new THREE.MeshStandardMaterial({ color: 0xffb35a, emissive: 0xff8a2a, emissiveIntensity: 1.6, roughness: 0.6 }));
	const lanternGeo = track(new THREE.OctahedronGeometry(1, 0).scale(2.2, 3.4, 2.2));
	const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, lanterns.length);
	lanterns.forEach((p, i) => { _m.makeTranslation(p.x, p.y, p.z); lanternMesh.setMatrixAt(i, _m); });
	lanternMesh.computeBoundingSphere(); lanternMesh.name = 'lanterns';
	group.add(lanternMesh);
	const chainGeo = track(new THREE.BufferGeometry());
	chainGeo.setAttribute('position', new THREE.Float32BufferAttribute(chainPts, 3));
	const chainMat = track(new THREE.LineBasicMaterial({ color: 0x3a2a20 }));
	const chains = new THREE.LineSegments(chainGeo, chainMat); chains.name = 'lanternChains';
	group.add(chains);

	// ───────── 구름: 바깥 구름바다 + 봉우리 구름띠 ─────────
	let cloudSeaMat = null, cloudTex = null;
	if (clouds) {
		const CT = 256, cv = document.createElement('canvas'); cv.width = cv.height = CT;
		const ctx = cv.getContext('2d'), img = ctx.createImageData(CT, CT);
		for (let j = 0; j < CT; j++) for (let i = 0; i < CT; i++) {
			const v = fbm(i * 0.025, j * 0.025, 5);
			const a = clamp(smooth(-0.25, 0.35, v), 0, 1);
			const o = (j * CT + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = 255;
			img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.floor(70 + 185 * a);
		}
		ctx.putImageData(img, 0, 0);
		cloudTex = track(new THREE.CanvasTexture(cv));
		cloudTex.wrapS = cloudTex.wrapT = THREE.MirroredRepeatWrapping;
		cloudTex.repeat.set(6, 6);
		const inner = half * 1.12, outer = half * 7;
		const ring = new THREE.RingGeometry(inner, outer, 96, 6).rotateX(-Math.PI / 2);
		const rp = ring.attributes.position, rc = new Float32Array(rp.count * 4);
		for (let i = 0; i < rp.count; i++) {
			const r = Math.hypot(rp.getX(i), rp.getZ(i));
			rc[i * 4] = rc[i * 4 + 1] = rc[i * 4 + 2] = 1;
			rc[i * 4 + 3] = smooth(inner, inner + half * 0.5, r);
		}
		ring.setAttribute('color', new THREE.BufferAttribute(rc, 4));
		// uv를 월드 스케일로
		const ruv = ring.attributes.uv;
		for (let i = 0; i < rp.count; i++) ruv.setXY(i, rp.getX(i) / (half * 2), rp.getZ(i) / (half * 2));
		track(ring);
		cloudSeaMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc8d8ee, emissiveIntensity: 0.35, roughness: 1, transparent: true, vertexColors: true, alphaMap: cloudTex, depthWrite: false }));
		const sea = new THREE.Mesh(ring, cloudSeaMat);
		sea.position.y = 360; sea.renderOrder = 3; sea.name = 'cloudSea';
		group.add(sea);

		// 봉우리 허리의 뭉게 구름
		const puffs = [];
		const addCluster = (x, y, z, R, n) => {
			for (let i = 0; i < n; i++) {
				const a = rand() * 6.28, rr = R * (0.6 + rand() * 0.6);
				const s = 30 + rand() * 45;
				const up = rand();
				puffs.push([x + Math.cos(a) * rr, y + up * s * 0.6, z + Math.sin(a) * rr, s * (1.5 - up * 0.5), s * (0.7 + up * 0.35)]);
			}
		};
		spires.forEach((s) => addCluster(s.x, heightAt(s.x, s.z) * 0.62, s.z, s.R * 0.85, 14));
		for (let i = 0; i < 10; i++) {
			const x = (rand() * 2 - 1) * half * 0.8, z = (rand() * 2 - 1) * half * 0.8;
			addCluster(x, Math.max(heightAt(x, z) + 120, 520 + rand() * 120), z, 90, 7);
		}
		const puffGeo = track(new THREE.IcosahedronGeometry(1, 2));
		const puffMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd4e2f4, emissiveIntensity: 0.5, roughness: 1 }));
		const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, puffs.length);
		puffs.forEach(([x, y, z, sx, sy], i) => { _m.compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sx * (0.8 + rand() * 0.4))); puffMesh.setMatrixAt(i, _m); });
		puffMesh.computeBoundingSphere(); puffMesh.name = 'cloudPuffs';
		group.add(puffMesh);
	}

	// ───────── 인스턴스 메시(동적 재배치) ─────────
	// 각 kind 는 lods 배열(가까운 것부터)을 가짐: { geo, mat, r, cap, cast, mesh }. 거리 안 + cap 미만이면 해당 LOD, 아니면 다음 LOD.
	const CELL = 250 * K, CG = Math.ceil(size / CELL) + 2;
	function buildKind(k) {
		if (!k.lods) k.lods = [{ geo: k.near, mat: k.mat, r: k.nearR, cap: k.capN, cast: true }, { geo: k.far, mat: k.mat, r: k.farR, cap: k.capF, cast: false }];
		k.cells = new Map();
		k.list.forEach((t) => {
			const key = clamp(Math.floor((t.x + half) / CELL), 0, CG - 1) + clamp(Math.floor((t.z + half) / CELL), 0, CG - 1) * CG;
			if (!k.cells.has(key)) k.cells.set(key, []);
			k.cells.get(key).push(t);
		});
		k.lods.forEach((L, li) => {
			L.mesh = null;
			if (!L.geo || !L.cap) return;
			const im = new THREE.InstancedMesh(L.geo, L.mat, L.cap);
			im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(L.cap * 3), 3);
			im.instanceColor.setUsage(THREE.DynamicDrawUsage);
			im.count = 0; im.frustumCulled = false; im.castShadow = !!L.cast; im.receiveShadow = true;
			im.name = k.name + (k.lodNames ? '_' + k.lodNames[li] : li === 0 ? '_near' : '_far');
			group.add(im);
			L.mesh = im;
			// 그림자 프록시: 고폴리 L0 대신 저폴리 지오메트리로 그림자 패스만 렌더(같은 인스턴스 행렬 공유)
			if (L.shadowGeo) {
				im.castShadow = false;
				const px = new THREE.InstancedMesh(L.shadowGeo, shadowOnlyMat, L.cap);
				px.instanceMatrix = im.instanceMatrix;
				px.count = 0; px.frustumCulled = false; px.castShadow = true; px.receiveShadow = false;
				px.name = im.name + '_shadow';
				group.add(px);
				L.proxy = px;
			}
		});
		k.nearMesh = k.lods[0].mesh; k.farMesh = k.lods[1] ? k.lods[1].mesh : null;
	}
	const shadowOnlyMat = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
	kinds.forEach(buildKind);
	const lastPos = new THREE.Vector3(1e9, 0, 0);
	// env 모드 전용: 카메라 시야(수평 원뿔) 밖의 L1+ 인스턴스 생략 → 삼각형 절감. L0 는 그림자 위해 유지.
	let cullCam = null, lastYaw = 1e9;
	const _fw = new THREE.Vector3();
	function rebuildInstances(cam) {
		let cfx = 0, cfz = 0, cosH = -2, keepR2 = 0;
		if (cullCam) {
			cullCam.getWorldDirection(_fw);
			const l = Math.hypot(_fw.x, _fw.z);
			if (l > 0.2) {
				cfx = _fw.x / l; cfz = _fw.z / l;
				const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(cullCam.fov) / 2) * Math.max(cullCam.aspect, 0.6));
				cosH = Math.cos(Math.min(Math.PI * 0.95, hf + 0.32));
				const above = cam.y - heightAt(cam.x, cam.z);
				keepR2 = Math.pow(Math.max(90, above * 1.2), 2);
			}
		}
		const cx = Math.floor((cam.x + half) / CELL), cz = Math.floor((cam.z + half) / CELL);
		for (const k of kinds) {
			const lods = k.lods, nl = lods.length;
			let maxR = 0; for (const L of lods) if (L.mesh) maxR = Math.max(maxR, L.r);
			const rc = Math.ceil(maxR / CELL) + 1;
			const order = [];
			for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
				const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= CG || iz >= CG) continue;
				const arr = k.cells.get(ix + iz * CG); if (arr) order.push([dx * dx + dz * dz, arr]);
			}
			order.sort((a, b) => a[0] - b[0]);
			const cnt = k._cnt || (k._cnt = new Int32Array(nl)), r2 = k._r2 || (k._r2 = lods.map((L) => L.r * L.r));
			cnt.fill(0);
			for (const [, arr] of order) {
				for (const t of arr) {
					const dx = t.x - cam.x, dy = (t.y - cam.y) * 0.5, dz = t.z - cam.z, d2 = dx * dx + dy * dy + dz * dz;
					const hd2 = dx * dx + dz * dz;
					const behind = cosH > -1.5 && (dx * cfx + dz * cfz) < cosH * Math.sqrt(hd2);
					const outView = behind && hd2 > keepR2;
					const skipL0 = behind && hd2 > keepR2 * 0.2; // L0 슬롯은 시야 안 우선(뒤쪽은 가까운 것만)
					for (let li = 0; li < nl; li++) {
						const L = lods[li];
						if (outView) break; // 시야 밖(주변 keepR 원 제외: 그림자용 유지)
						if (li === 0 && skipL0) continue;
						if (!L.mesh || d2 >= r2[li] || cnt[li] >= L.cap) continue;
						const n = cnt[li]++;
						L.mesh.instanceMatrix.array.set(t.m, n * 16); L.mesh.instanceColor.array.set(t.c, n * 3);
						break;
					}
				}
			}
			for (let li = 0; li < nl; li++) {
				const M = lods[li].mesh; if (!M) continue;
				const n = cnt[li];
				M.count = n; M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
				if (lods[li].proxy) lods[li].proxy.count = n;
				M.instanceMatrix.clearUpdateRanges(); M.instanceColor.clearUpdateRanges();
				M.instanceMatrix.addUpdateRange(0, n * 16); M.instanceColor.addUpdateRange(0, n * 3);
			}
		}
	}

	// ───────── env(Higgsfield GLB/텍스처) 주입 ─────────
	// 나무·바위를 GLB 지오메트리 InstancedMesh 로 교체 + 지형 텍스처 블렌드. 실패 항목(null)은 기존 절차적 유지.
	// LOD: L0=GLB(텍스처, 가까움) → L1=정점색 단순화 메시(중거리) → L2=기존 저폴리(원거리, 종별 평균색으로 재채색)
	let envApplied = null;
	const blossomSpots = [];
	// 원거리 활엽 수관: 팔면체(8 tri) + 구형 노멀(recolorFar) — 삼각형 예산 유지
	const broadFarEnv = broadFar;
	function recolorFar(geo, col, lo = 0.95, hi = 1.5) {
		const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), v = new THREE.Vector3();
		for (let i = 0; i < p.count; i++) {
			const y = p.getY(i), k = lerp(lo, hi, clamp(y, 0, 1));
			c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k;
			// 구형 노멀(면 셰이딩 대신 둥근 수관)
			v.set(p.getX(i), (y - 0.45) * 0.8 + 0.25, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z);
		}
		g.setAttribute('color', new THREE.BufferAttribute(c, 3));
		return track(g);
	}
	function applyEnv(env, opt = {}) {
		if (!env || envApplied) return false;
		envApplied = env;
		const Q = Object.assign({ camera: null, treeNearR: 180 * K, treeMidR: 520 * K, treeFarR: 2800 * K, capTree0: 24, capTree1: 400, rockNearR: 150 * K, rockMidR: 1100 * K }, opt);
		if (Q.camera && Q.camera.isPerspectiveCamera) cullCam = Q.camera;
		const T = env.trees || {}, R = env.rocks || {}, TX = env.textures || {};
		// 1) 지형 텍스처
		const tm = TX.meadow, tc = TX.cliff, ts = TX.snow, tp = TX.path;
		if (tm && tc && ts && tp) {
			terrainUniforms.uEM.value = tm.map; terrainUniforms.uEMn.value = tm.normal || white;
			terrainUniforms.uEC.value = tc.map; terrainUniforms.uECn.value = tc.normal || white;
			terrainUniforms.uES.value = ts.map; terrainUniforms.uESn.value = ts.normal || white;
			terrainUniforms.uEP.value = tp.map; terrainUniforms.uEPn.value = tp.normal || white;
			const rules = env.rules && env.rules.terrain_textures;
			if (rules) {
				const til = (n, d) => { const r = rules.find((t) => t.file && t.file.includes('/' + n + '.')); return 1 / ((r && r.placement && r.placement.tiling_m) || d); };
				terrainUniforms.uEScale.value.set(til('meadow', 6), til('cliff', 10), til('snow', 8), til('path', 4));
			}
			// 6m 타일링은 비행 시점에서 너무 잘게 보여 1.6배 확대(시네마틱 스케일)
			terrainUniforms.uEScale.value.multiplyScalar(1 / 1.6);
			terrainUniforms.uEScale.value.y = 1 / 30; // 절벽은 산 스케일 층리가 보이도록 크게
			terrainMat.defines = Object.assign(terrainMat.defines || {}, { ENV_TEX: 1 });
			terrainMat.customProgramCacheKey = () => 'terrain_env';
			terrainMat.needsUpdate = true;
		}
		// 2) 식생/바위 재구성
		const oldK = kinds.slice();
		const byName = Object.fromEntries(oldK.map((k) => [k.name, k]));
		const snowN = (x, z, h) => clamp((h - waterLevel) / (snowLineAt(x, z) - waterLevel), 0, 1.2) * 0.85; // 정규화 고도(설선≈0.85)
		const mk = (name, A, list, lodCfg) => {
			const k = { name, list, lods: [], lodNames: [] };
			lodCfg.forEach(([tag, geo, mat, r, cap, cast, shadowGeo]) => { if (geo) { k.lods.push({ geo, mat, r, cap, cast, shadowGeo }); k.lodNames.push(tag); } });
			return k;
		};
		const mat4 = new THREE.Matrix4();
		const recompose = (t, sx, sy, sz = sx, y = t.y) => {
			_e.set(t.ex || 0, t.rotY || 0, t.ez || 0); _q.setFromEuler(_e);
			mat4.compose(_p.set(t.x, y, t.z), _q, _s.set(sx, sy, sz));
			return { x: t.x, y, z: t.z, m: mat4.toArray(), c: t.c };
		};
		const newKinds = [];
		const lists = { conifer: [], broadleaf: [], blossom: [], granite: [], cliff: [] };
		const treeSrc = [...(byName.conifer ? byName.conifer.list : []), ...(byName.broadleaf ? byName.broadleaf.list : [])];
		const treeR = mulberry32(seed * 31 + 5);
		// 종 배정: env_assets.json 고도대(conifer 0.45~0.85, broadleaf 0.1~0.5) + 노이즈 클러스터(활엽 3~5그루 군집 느낌)
		for (const t of treeSrc) {
			const h = heightAt(t.x, t.z), island = t.y > h + 30;
			const a = snowN(t.x, t.z, island ? t.y : h);
			const clump = N(t.x * 0.011 + 3.3, t.z * 0.011 - 1.7);
			// 저지대 활엽 우세(최대 75%), 정규화 고도 0.25~0.45 사이 침엽으로 전환
			let pB = 0.75 * (1 - smooth(0.22, 0.45, a + 0.1 * clump));
			pB = clamp(pB + 0.3 * clump, 0.03, 0.85);
			if (island) pB = 0.25;
			const isB = treeR() < pB && T.broadleaf;
			const sp = isB ? 'broadleaf' : 'conifer';
			const v = 0.8 + 0.4 * treeR(); // ±20%
			let s;
			// 권장 스케일(침엽 10~16m, 활엽 8~12m)을 비행 시점 가독성 위해 ~1.3배
			if (sp === 'conifer') s = lerp(14, 22, treeR()) * (1 - smooth(0.6, 0.85, a) * 0.3) * v;
			else s = lerp(11, 16, treeR()) * v;
			const sy = s, sx = s * (0.9 + 0.2 * treeR());
			const tint = 0.86 + 0.24 * treeR();
			const e = recompose(t, sx, sy, sx * (0.9 + 0.2 * treeR()));
			e.c = [tint * (0.95 + 0.1 * treeR()), tint, tint * (0.92 + 0.12 * treeR())];
			lists[sp].push(e);
		}
		// 벚나무 랜드마크: 평탄지·호숫가·섬 정상, 3~8그루, 군락 금지(서로 350m 이상)
		if (T.blossom) {
			const cands = [];
			islands.forEach((il) => cands.push({ x: il.x + il.R * 0.15, z: il.z - il.R * 0.1, y: il.y + 3, score: 2 }));
			for (let i = 0; i < 2600; i++) {
				const x = (treeR() * 2 - 1) * half * 0.8, z = (treeR() * 2 - 1) * half * 0.8, h = heightAt(x, z);
				if (h < waterLevel + 4) continue;
				const ny = slopeAt(x, z), a = snowN(x, z, h);
				if (ny < 0.975 || a < 0.06 || a > 0.55) continue;
				const nearLake = Math.hypot(x - lakeX, z - lakeZ) < 650 * K ? 1.5 : 0;
				const valley = Math.abs(x - valleyX(z)) < valleyW(z) * 0.9 ? 1 : 0;
				cands.push({ x, z, y: h - 0.6, score: nearLake + valley + treeR() });
			}
			cands.sort((p, q) => q.score - p.score);
			const pick = [];
			for (const c of cands) { if (pick.length >= 8) break; if (pick.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > 350 * K)) pick.push(c); }
			for (const c of pick) {
				blossomSpots.push(new THREE.Vector3(c.x, c.y, c.z));
				const s = lerp(11, 15, treeR());
				lists.blossom.push(recompose({ x: c.x, y: c.y, z: c.z, rotY: treeR() * 6.28 }, s * 1.1, s, s * 1.05));
				lists.blossom[lists.blossom.length - 1].c = [1, 1, 1];
			}
		}
		// 바위: 기존 바위 위치 → granite (권장 1.5~6m, 30% 묻기)
		if (byName.rock) for (const t of byName.rock.list) {
			const g = clamp(t.sy / 1.0, 1.5, 30);
			const sx = t.sx * 1.45, sy = g * 0.95;
			const e = recompose(t, sx, sy, sx * (0.85 + 0.3 * treeR()), t.y - sy * 0.05);
			e.c = t.c.map((v) => v * 1.15); lists.granite.push(e);
		}
		// 강가 바위 추가
		for (let i = 0; i < 2600; i++) {
			const x = (treeR() * 2 - 1) * (half - 60), z = (treeR() * 2 - 1) * (half - 60), h = heightAt(x, z);
			if (h < waterLevel + 0.5 || h > waterLevel + 7) continue;
			if (slopeAt(x, z) < 0.8) continue;
			const s = lerp(1.6, 5.5, Math.pow(treeR(), 1.6));
			const t = 0.85 + 0.25 * treeR();
			const e = recompose({ x, y: h - s * 0.3, z, rotY: treeR() * 6.28, ex: (treeR() - 0.5) * 0.4, ez: (treeR() - 0.5) * 0.4 }, s * (0.9 + 0.4 * treeR()), s * (0.6 + 0.3 * treeR()), s * (0.9 + 0.4 * treeR()));
			e.c = [t, t, t * 0.97]; lists.granite.push(e);
		}
		// 절벽 기슭의 암괴는 지형과 자연스럽게 섞이도록 작게 배치한다.
		if (R.cliff) {
			for (let i = 0; i < 60000 && lists.cliff.length < 300; i++) {
				const x = (treeR() * 2 - 1) * (half - 80), z = (treeR() * 2 - 1) * (half - 80), h = heightAt(x, z);
				if (h < waterLevel + 3) continue;
				const fx = clamp(Math.round((x + half) / cell), 0, G), fz = clamp(Math.round((z + half) / cell), 0, G), kk = (fz * GV + fx) * 3;
				const ny = NRM[kk + 1];
				if (ny < 0.7 || ny > 0.95) continue; // 발치는 완만(≤45°)
				const hl = Math.hypot(NRM[kk], NRM[kk + 2]) || 1, ux = -NRM[kk] / hl, uz = -NRM[kk + 2] / hl; // 오르막 방향
				const up = heightAt(x + ux * 40, z + uz * 40) - h;
				const rise = up / 40; // tan(경사)
				if (rise < 0.7 || rise > 2.75) continue; // 위쪽은 35~70°
				const a = snowN(x, z, h);
				if (a > 1.0) continue;
				const s = lerp(9, 18, Math.pow(treeR(), 1.3));
				const rot = Math.atan2(-ux, -uz) + (treeR() - 0.5) * 0.5;
				const t = 0.9 + 0.2 * treeR();
				// 오르막 쪽으로 반쯤 파묻어 절벽에 붙은 암괴처럼
				const px = x + ux * s * 0.25, pz = z + uz * s * 0.25;
				const e = recompose({ x: px, y: h - s * 0.45, z: pz, rotY: rot, ex: (treeR() - 0.5) * 0.12, ez: (treeR() - 0.5) * 0.12 }, s * lerp(0.8, 1.25, treeR()), s * (0.5 + 0.3 * treeR()), s * lerp(0.8, 1.25, treeR()));
				e.c = [t * 1.12, t * 1.1, t * 1.08]; lists.cliff.push(e);
			}
		}
		// kinds 구성
		const farOf = (name, geo, A) => (geo && A ? recolorFar(geo, A.avgColor) : null);
		const L1 = env.lod1Material;
		const treeKinds = [['conifer', coniferFar], ['broadleaf', broadFarEnv], ['blossom', broadFarEnv]];
		for (const [name, farGeo] of treeKinds) {
			const A = T[name];
			if (!A) { // 폴백: 기존 절차적 kind 유지(blossom 은 없음)
				if (byName[name]) newKinds.push(byName[name]);
				continue;
			}
			const blossom = name === 'blossom';
			newKinds.push(mk(name, A, lists[name], [
				['glb', A.geometry, A.material, blossom ? 420 * K : Q.treeNearR, blossom ? 8 : Q.capTree0, true, A.lod1],
				['mid', A.lod1, L1, blossom ? 3000 * K : Q.treeMidR, blossom ? 8 : Q.capTree1, true],
				['far', blossom ? null : farOf(name, farGeo, A), vegMat, Q.treeFarR, name === 'conifer' ? 16000 : 12000, false],
			]));
		}
		if (R.granite) newKinds.push(mk('rock', R.granite, lists.granite, [
			['glb', R.granite.geometry, R.granite.material, Q.rockNearR, 40, true, R.granite.lod1],
			['mid', R.granite.lod1, L1, Q.rockMidR, 2400, false],
		]));
		else if (byName.rock) newKinds.push(byName.rock);
		if (R.cliff) newKinds.push(mk('cliffRock', R.cliff, lists.cliff, [
			['glb', R.cliff.geometry, R.cliff.material, 320 * K, 16, true, R.cliff.lod1],
			['mid', R.cliff.lod1, L1, 2200 * K, 300, false],
		]));
		// 교체: 대체된 기존 kind 의 메시 제거
		for (const k of oldK) {
			if (newKinds.includes(k)) continue;
			for (const L of k.lods) if (L.mesh) { group.remove(L.mesh); L.mesh.dispose(); L.mesh = null; if (L.proxy) { group.remove(L.proxy); L.proxy = null; } }
		}
		kinds.length = 0;
		for (const k of newKinds) { if (!k.cells) buildKind(k); kinds.push(k); }
		lastPos.set(1e9, 0, 0);
		if (lastCam) update(lastCam, 0);
		return true;
	}

	// ───────── 스폰 ─────────
	const spZ = 2050 * K, spX = valleyX(spZ);
	const spawnPoint = new THREE.Vector3(spX, Math.max(heightAt(spX, spZ), waterLevel) + 110, spZ);

	// ───────── update ─────────
	let time = 0;
	const _bb = new THREE.Vector3();
	let lastCam = null;
	function update(cameraPosition, dt = 0.016) {
		time += dt;
		if (cameraPosition) lastCam = (lastCam || new THREE.Vector3()).copy(cameraPosition);
		waterUniforms.uTime.value = time;
		if (cloudTex) cloudTex.offset.set(time * 0.0015, time * 0.0008);
		const fogCol = scene.fog && scene.fog.color;
		if (fogCol) waterUniforms.uSkyColor.value.copy(fogCol);
		else if (scene.background && scene.background.isColor) waterUniforms.uSkyColor.value.copy(scene.background);
		if (!cameraPosition) return;
		for (const c of chunks) {
			c.box.clampPoint(cameraPosition, _bb);
			const d = _bb.distanceTo(cameraPosition);
			// 히스테리시스
			const h = 60;
			let L = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
			if (L !== c.cur) {
				if (L > c.cur && d < LOD_DIST[c.cur] + h) L = c.cur;
				if (L !== c.cur) { c.levels[c.cur].visible = false; c.levels[L].visible = true; c.cur = L; }
			}
		}
		let yawMoved = false;
		if (cullCam) {
			cullCam.getWorldDirection(_fw);
			const yaw = Math.atan2(_fw.x, _fw.z);
			let dy = Math.abs(yaw - lastYaw); if (dy > Math.PI) dy = 2 * Math.PI - dy;
			if (dy > 0.2) { yawMoved = true; }
		}
		if (yawMoved || lastPos.distanceToSquared(cameraPosition) > 45 * 45) {
			lastPos.copy(cameraPosition); rebuildInstances(cameraPosition);
			if (cullCam) { cullCam.getWorldDirection(_fw); lastYaw = Math.atan2(_fw.x, _fw.z); }
		}
	}

	function setSunDirection(v) { if (v) waterUniforms.uSunDir.value.copy(v).normalize(); }

	function dispose() {
		scene.remove(group);
		group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
		disposables.forEach((d) => d && d.dispose && d.dispose());
		disposables.length = 0;
	}

	const obstacleField = createObstacleField(obstacleShapes);
	update(spawnPoint, 0);
	if (env) applyEnv(env);

	return {
		group, heightAt, waterLevel, spawnPoint, update, setSunDirection, dispose,
		obstacleAt: obstacleField.obstacleAt, raycastObstacles: obstacleField.raycastObstacles,
		// 부가 정보(선택 사용)
		landmarks: { blossoms: blossomSpots, arch: new THREE.Vector3(archCX, heightAt(archCX, archZ) + archRise, archZ), towers: towerTops, islands, spires: spires.map((s) => new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z)) },
		lanternMaterial: lanternMat,
		valleyCenterX: valleyX,
		applyEnv,
		stats: () => Object.fromEntries(kinds.map((k) => [k.name, { total: k.list.length, near: k.nearMesh ? k.nearMesh.count : 0, far: k.lods.slice(1).reduce((a, L) => a + (L.mesh ? L.mesh.count : 0), 0), lods: k.lods.map((L) => (L.mesh ? L.mesh.count : 0)) }])),
	};
}
