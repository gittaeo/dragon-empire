// 드래곤 엠파이어 — 환경 에셋 로더 (Higgsfield 승인 GLB/텍스처)
// loadEnvAssets(base) → { trees:{conifer,broadleaf,blossom}, rocks:{granite,cliff}, textures:{meadow,cliff,snow,path}, rules }
//   각 모델: { geometry(병합·정규화: Y-up, 밑동=원점, 높이 1), material, lod1(정점색 단순화 지오메트리), lod1Material, avgColor(THREE.Color, linear), triangles }
//   각 텍스처: { map, normal }  (실패 항목은 null → terrain.js 가 절차적 폴백 유지)
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';

const MODELS = {
	trees: {
		conifer: { file: 'trees/conifer.glb', foliage: true, cells: 7 },
		broadleaf: { file: 'trees/broadleaf.glb', foliage: true, shard: 0.13, cells: 6 },
		blossom: { file: 'trees/blossom.glb', foliage: true, shard: 0.12, cells: 6 },
	},
	rocks: {
		granite: { file: 'rocks/granite.glb', foliage: false, cells: 4 },
		cliff: { file: 'rocks/cliff.glb', foliage: false, cells: 4 },
	},
};
const TEX = ['meadow', 'cliff', 'snow', 'path'];

// ───────── 픽셀 보정 ─────────
function rgb2hsv(r, g, b) {
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
	let h = 0;
	if (d > 1e-6) {
		if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
		h *= 60; if (h < 0) h += 360;
	}
	return [h, mx > 0 ? d / mx : 0, mx];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 에셋별 baseColor 보정 (sRGB 0..1 픽셀 단위)
const FIX = {
	// 너무 밝은 연두 → 어둡고 청록 쪽으로, 채도 낮춤
	conifer(r, g, b) {
		const l = 0.3 * r + 0.59 * g + 0.11 * b;
		r = l + (r - l) * 0.72; g = l + (g - l) * 0.72; b = l + (b - l) * 0.72;
		return [r * 0.62, g * 0.70, b * 0.74 + 0.02];
	},
	// 형광 라임 → 자연스러운 잎 녹색
	broadleaf(r, g, b) {
		const l = 0.3 * r + 0.59 * g + 0.11 * b;
		r = l + (r - l) * 0.78; g = l + (g - l) * 0.78; b = l + (b - l) * 0.78;
		return [r * 0.74, g * 0.80, b * 0.86 + 0.015];
	},
	// 수관 가운데 주황 덩어리 → 분홍 꽃잎 톤으로 색상 이동
	blossom(r, g, b) {
		const [h, s, v] = rgb2hsv(r, g, b);
		const o = smooth(4, 14, h) * (1 - smooth(55, 70, h)) * smooth(0.22, 0.42, s) * smooth(0.28, 0.5, v);
		if (o > 0) {
			const pr = 0.93 * v, pg = 0.50 * v, pb = 0.64 * v; // 분홍
			r += (pr - r) * o; g += (pg - g) * o; b += (pb - b) * o;
		}
		return [r * 0.95, g * 0.93, b * 0.95];
	},
	granite(r, g, b) { return [r * 0.92, g * 0.92, b * 0.92]; },
	// 주황빛 과다 → 회갈색 사암 톤으로 채도 낮춤
	cliff(r, g, b) {
		const l = 0.3 * r + 0.59 * g + 0.11 * b;
		r = l + (r - l) * 0.28; g = l + (g - l) * 0.28; b = l + (b - l) * 0.28;
		return [r * 0.9, g * 0.89, b * 0.9];
	},
};

function imageToCanvas(img, size) {
	const w = size || img.width, h = size || img.height;
	const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(img, 0, 0, w, h);
	return { cv, ctx, w, h, data: ctx.getImageData(0, 0, w, h) };
}

// 아틀라스 빈 공간(검정) 을 이웃 색으로 채워 밉맵/필터링 시 검은 테두리 제거
function dilateEmpty(px, w, h, isEmpty, passes = 6) {
	const d = px.data;
	let empty = new Uint8Array(w * h), n = 0;
	for (let i = 0; i < w * h; i++) if (isEmpty(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) { empty[i] = 1; n++; }
	if (!n) return;
	let sr = 0, sg = 0, sb = 0, sc = 0;
	for (let i = 0; i < w * h; i++) if (!empty[i]) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; sc++; }
	for (let p = 0; p < passes; p++) {
		const next = empty.slice();
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const i = y * w + x; if (!empty[i]) continue;
			let r = 0, g = 0, b = 0, c = 0;
			for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
				const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
				const j = yy * w + xx; if (empty[j]) continue;
				r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; c++;
			}
			if (c) { d[i * 4] = r / c; d[i * 4 + 1] = g / c; d[i * 4 + 2] = b / c; next[i] = 0; }
		}
		empty = next;
	}
	for (let i = 0; i < w * h; i++) if (empty[i]) { d[i * 4] = sr / sc; d[i * 4 + 1] = sg / sc; d[i * 4 + 2] = sb / sc; }
}

function processBaseColor(name, img, foliage) {
	const C = imageToCanvas(img);
	const { w, h, data } = C, d = data.data;
	// 빈 공간 판별용 원본 사본 (삼각형 제거에 사용)
	const orig = new Uint8ClampedArray(d);
	const fix = FIX[name];
	// 수목: 어두운 텍셀(아틀라스 가장자리 그늘 → 화면에서 검은 조각)을 잎 평균색 쪽으로 끌어올림
	let fr = 0, fg = 0, fb = 0, fc = 0;
	if (foliage) for (let i = 0; i < w * h; i++) { const o = i * 4, m = Math.max(d[o], d[o + 1], d[o + 2]); if (m > 90) { fr += d[o]; fg += d[o + 1]; fb += d[o + 2]; fc++; } }
	if (fc) { fr /= fc * 255; fg /= fc * 255; fb /= fc * 255; }
	for (let i = 0; i < w * h; i++) {
		const o = i * 4;
		let r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
		const mx = Math.max(r, g, b);
		if (mx < 0.1 && !foliage) continue;
		if (foliage && mx < 0.32) { const t = 1 - smooth(0.06, 0.32, mx); const k = 0.6 * t; r += (fr * 0.55 - r) * k; g += (fg * 0.55 - g) * k; b += (fb * 0.55 - b) * k; }
		const v = fix ? fix(r, g, b) : [r, g, b];
		d[o] = v[0] * 255; d[o + 1] = v[1] * 255; d[o + 2] = v[2] * 255;
	}
	dilateEmpty(data, w, h, (r, g, b) => Math.max(r, g, b) < 26, 8);
	C.ctx.putImageData(data, 0, 0);
	// 평균색(정점색 LOD/원경 틴트용) + 저해상 샘플러
	const SR = 256, S = imageToCanvas(C.cv, SR);
	const sd = S.data.data;
	let ar = 0, ag = 0, ab = 0;
	for (let i = 0; i < SR * SR; i++) { ar += sd[i * 4]; ag += sd[i * 4 + 1]; ab += sd[i * 4 + 2]; }
	const n = SR * SR * 255;
	return {
		canvas: C.cv,
		avg: new THREE.Color().setRGB(ar / n, ag / n, ab / n, THREE.SRGBColorSpace),
		// 원본 기준 "빈 공간" 판별
		isEmptyAt(u, v) {
			const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
			const o = (y * w + x) * 4; return Math.max(orig[o], orig[o + 1], orig[o + 2]) < 28;
		},
		lumAt(u, v) {
			const x = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
			const o = (y * w + x) * 4; return (orig[o] + orig[o + 1] + orig[o + 2]) / 765;
		},
		// 정점색 샘플(256 해상도, linear 반환)
		sampleLinear(u, v, out) {
			const x = Math.min(SR - 1, Math.max(0, Math.floor(u * SR))), y = Math.min(SR - 1, Math.max(0, Math.floor(v * SR)));
			const o = (y * SR + x) * 4;
			out.setRGB(sd[o] / 255, sd[o + 1] / 255, sd[o + 2] / 255, THREE.SRGBColorSpace);
			return out;
		},
	};
}

// ───────── 지오메트리 ─────────
// 위치 기준(UV 이음매 무시) 스무스 노멀 + 수목은 구형 노멀 블렌드(스타일라이즈드 수관 셰이딩)
function smoothNormals(geo, foliage) {
	const pos = geo.attributes.position, idx = geo.index.array, nv = pos.count;
	const key = new Map(), rep = new Int32Array(nv);
	for (let i = 0; i < nv; i++) {
		const k = Math.round(pos.getX(i) * 2e4) + '_' + Math.round(pos.getY(i) * 2e4) + '_' + Math.round(pos.getZ(i) * 2e4);
		let r = key.get(k); if (r === undefined) { r = i; key.set(k, i); } rep[i] = r;
	}
	const acc = new Float32Array(nv * 3);
	const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
	for (let t = 0; t < idx.length; t += 3) {
		const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
		a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
		n.subVectors(c, b).cross(a.clone().sub(b)); // 면적 가중
		for (const i of [i0, i1, i2]) { const r = rep[i] * 3; acc[r] += n.x; acc[r + 1] += n.y; acc[r + 2] += n.z; }
	}
	const out = new Float32Array(nv * 3), v = new THREE.Vector3(), s = new THREE.Vector3();
	for (let i = 0; i < nv; i++) {
		const r = rep[i] * 3;
		v.set(acc[r], acc[r + 1], acc[r + 2]).normalize();
		if (foliage) {
			const y = pos.getY(i);
			// 수관 중심(대략 0.6H)에서 바깥으로 향하는 구형 노멀
			s.set(pos.getX(i), (y - 0.55) * 0.9 + 0.12, pos.getZ(i)).normalize();
			const w = THREE.MathUtils.smoothstep(y, 0.12, 0.3) * 0.65; // 줄기는 원래 노멀
			v.lerp(s, w).normalize();
		}
		out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
	}
	geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

// 텍스처의 빈(검정) 영역만 샘플하는 삼각형 제거 (broadleaf 잎 끝 검은 조각)
function dropEmptyTriangles(geo, pix, shardLum = 0) {
	const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index.array, keep = [];
	// 삼각형 내부 바리센트릭 샘플(10점): UV 아일랜드 사이 빈 공간을 가로지르는 조각까지 판별
	const B = [[1 / 3, 1 / 3], [0.8, 0.1], [0.1, 0.8], [0.1, 0.1], [0.45, 0.45], [0.45, 0.1], [0.1, 0.45], [0.6, 0.25], [0.25, 0.6], [0.2, 0.2]];
	let dropped = 0;
	for (let t = 0; t < idx.length; t += 3) {
		const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
		const u0 = uv.getX(i0), v0 = uv.getY(i0), u1 = uv.getX(i1), v1 = uv.getY(i1), u2 = uv.getX(i2), v2 = uv.getY(i2);
		let empty = 0, lum = 0;
		for (const [a, b] of B) {
			const c = 1 - a - b, u = u0 * a + u1 * b + u2 * c, v = v0 * a + v1 * b + v2 * c;
			if (pix.isEmptyAt(u, v)) empty++;
			lum += pix.lumAt(u, v);
		}
		lum /= B.length;
		if (empty >= 3) { dropped++; continue; }
		// 수관 높이의 어두운 조각(잎 끝 검은 삼각형)
		if (shardLum > 0) {
			const py = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
			if (py > 0.35 && lum < shardLum) { dropped++; continue; }
		}
		keep.push(i0, i1, i2);
	}
	geo.setIndex(keep);
	return dropped;
}

// 정점 군집 단순화(LOD1) — 텍스처 대신 정점색. 위치 격자 + 법선 방향 버킷으로 군집.
export function clusterDecimate(geo, pix, cells, foliage) {
	const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index.array;
	geo.computeBoundingBox();
	const bb = geo.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz);
	const cs = Math.max(sz.x, sz.y, sz.z) / cells;
	const map = new Map(), cl = [];
	const vmap = new Int32Array(pos.count);
	const col = new THREE.Color();
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
		// 노멀 버킷(6방향) — 얇은 수관 앞뒤가 붙는 것 방지
		const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
		const nb = ax > ay && ax > az ? (nx > 0 ? 0 : 1) : ay > az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
		const k = Math.floor((x - bb.min.x) / cs) + ',' + Math.floor((y - bb.min.y) / cs) + ',' + Math.floor((z - bb.min.z) / cs) + ',' + (foliage ? 0 : nb);
		let c = map.get(k);
		if (c === undefined) { c = cl.length; map.set(k, c); cl.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); }
		const a = cl[c];
		a[0] += x; a[1] += y; a[2] += z; a[3] += nx; a[4] += ny; a[5] += nz; a[9]++;
		vmap[i] = c;
	}
	// 색: 삼각형 내부 샘플(중심+변 중점)을 군집에 누적 — 꼭짓점 UV 이음매 샘플 오류 방지
	const csum = new Float32Array(cl.length * 4);
	for (let t = 0; t < idx.length; t += 3) {
		const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
		const u0 = uv.getX(i0), v0 = uv.getY(i0), u1 = uv.getX(i1), v1 = uv.getY(i1), u2 = uv.getX(i2), v2 = uv.getY(i2);
		let r = 0, g = 0, b = 0;
		for (const [u, v] of [[(u0 + u1 + u2) / 3, (v0 + v1 + v2) / 3], [(u0 + u1) / 2, (v0 + v1) / 2], [(u1 + u2) / 2, (v1 + v2) / 2], [(u0 + u2) / 2, (v0 + v2) / 2]]) {
			pix.sampleLinear(u, v, col); r += col.r; g += col.g; b += col.b;
		}
		for (const i of [i0, i1, i2]) { const c = vmap[i] * 4; csum[c] += r; csum[c + 1] += g; csum[c + 2] += b; csum[c + 3] += 4; }
	}
	cl.forEach((a, i) => { const w = csum[i * 4 + 3] || 1; a[6] = csum[i * 4] / w * a[9]; a[7] = csum[i * 4 + 1] / w * a[9]; a[8] = csum[i * 4 + 2] / w * a[9]; });
	const P = new Float32Array(cl.length * 3), Nn = new Float32Array(cl.length * 3), Cc = new Float32Array(cl.length * 3);
	const v = new THREE.Vector3();
	cl.forEach((a, i) => {
		const n = a[9];
		P[i * 3] = a[0] / n; P[i * 3 + 1] = a[1] / n; P[i * 3 + 2] = a[2] / n;
		v.set(a[3], a[4], a[5]).normalize();
		Nn[i * 3] = v.x; Nn[i * 3 + 1] = v.y; Nn[i * 3 + 2] = v.z;
		Cc[i * 3] = a[6] / n; Cc[i * 3 + 1] = a[7] / n; Cc[i * 3 + 2] = a[8] / n;
	});
	const tri = [], seen = new Set();
	for (let t = 0; t < idx.length; t += 3) {
		const a = vmap[idx[t]], b = vmap[idx[t + 1]], c = vmap[idx[t + 2]];
		if (a === b || b === c || a === c) continue;
		const s = [a, b, c].sort((x, y) => x - y).join(',');
		if (seen.has(s)) continue; seen.add(s);
		tri.push(a, b, c);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(P, 3));
	g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
	g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
	g.setIndex(tri);
	g.computeBoundingSphere();
	return g;
}

function normalizeGeometry(geo) {
	geo.computeBoundingBox();
	const bb = geo.boundingBox, h = bb.max.y - bb.min.y || 1;
	const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
	geo.translate(-cx, -bb.min.y, -cz);
	geo.scale(1 / h, 1 / h, 1 / h);
	geo.computeBoundingBox(); geo.computeBoundingSphere();
	return geo;
}

async function loadModel(loader, url, name, cfg, renderer) {
	const gltf = await loader.loadAsync(url);
	gltf.scene.updateMatrixWorld(true);
	const meshes = [];
	gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
	if (!meshes.length) throw new Error('no mesh: ' + url);
	const src = meshes[0];
	let geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
	for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'uv') geo.deleteAttribute(k);
	if (!geo.index) { const a = new Uint32Array(geo.attributes.position.count); for (let i = 0; i < a.length; i++) a[i] = i; geo.setIndex(new THREE.BufferAttribute(a, 1)); }
	normalizeGeometry(geo);
	const sm = src.material;
	const maxAniso = renderer && renderer.capabilities ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
	let map = null, pix = null, dropped = 0;
	if (sm.map && sm.map.image) {
		pix = processBaseColor(name, sm.map.image, cfg.foliage);
		map = new THREE.CanvasTexture(pix.canvas);
		map.flipY = sm.map.flipY; map.colorSpace = THREE.SRGBColorSpace;
		map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; map.anisotropy = maxAniso;
		map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
		if (cfg.foliage) dropped = dropEmptyTriangles(geo, pix, cfg.shard || 0);
		sm.map.dispose();
	}
	smoothNormals(geo, cfg.foliage);
	geo.computeBoundingSphere();
	const material = new THREE.MeshStandardMaterial({
		map, normalMap: sm.normalMap || null, normalScale: new THREE.Vector2(cfg.foliage ? 0.6 : 1.0, cfg.foliage ? 0.6 : 1.0),
		roughnessMap: sm.roughnessMap || null, metalness: 0, roughness: cfg.foliage ? 0.85 : 0.95,
		side: THREE.FrontSide,
	});
	material.name = 'env_' + name;
	if (material.normalMap) material.normalMap.anisotropy = maxAniso;
	if (cfg.foliage) {
		// 수관 내부 AO 근사 + 역광 투과 느낌(시네마틱)
		material.onBeforeCompile = (sh) => {
			sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
			sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;')
				.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.55, 1.08, smoothstep(0.15, 0.95, vH));');
		};
		material.customProgramCacheKey = () => 'env_foliage';
	}
	const lod1 = pix ? clusterDecimate(geo, pix, cfg.cells || 6, cfg.foliage) : null;
	return {
		name, geometry: geo, material, lod1, avgColor: pix ? pix.avg : new THREE.Color(0.3, 0.4, 0.2),
		triangles: geo.index.count / 3, lod1Triangles: lod1 ? lod1.index.count / 3 : 0, droppedTriangles: dropped,
	};
}

function loadTex(loader, url, srgb, aniso) {
	return new Promise((res) => {
		loader.load(url, (t) => {
			t.wrapS = t.wrapT = THREE.RepeatWrapping;
			t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			t.anisotropy = aniso; t.needsUpdate = true;
			res(t);
		}, undefined, () => res(null));
	});
}

export async function loadEnvAssets(base = 'assets/approved/env/', { renderer = null } = {}) {
	if (!base.endsWith('/')) base += '/';
	const loader = new GLTFLoader();
	const tl = new THREE.TextureLoader();
	const aniso = renderer && renderer.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
	const out = { trees: {}, rocks: {}, textures: {}, rules: null };
	const jobs = [];
	jobs.push(fetch(base + 'env_assets.json').then((r) => (r.ok ? r.json() : null)).then((j) => { out.rules = j; }).catch(() => {}));
	for (const group of ['trees', 'rocks']) {
		for (const [name, cfg] of Object.entries(MODELS[group])) {
			jobs.push(loadModel(loader, base + cfg.file, name, cfg, renderer)
				.then((m) => { out[group][name] = m; })
				.catch((e) => { console.warn('[env-assets] 모델 실패', name, e && e.message); out[group][name] = null; }));
		}
	}
	for (const name of TEX) {
		jobs.push(Promise.all([loadTex(tl, base + `textures/${name}.jpg`, true, aniso), loadTex(tl, base + `textures/${name}_n.jpg`, false, aniso)])
			.then(([map, normal]) => { out.textures[name] = map ? { map, normal } : null; }));
	}
	await Promise.all(jobs);
	// 공용 정점색 머티리얼(LOD1)
	out.lod1Material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
	out.lod1Material.name = 'env_lod1';
	out.dispose = () => {
		for (const g of [out.trees, out.rocks]) for (const m of Object.values(g)) if (m) {
			m.geometry.dispose(); m.lod1 && m.lod1.dispose();
			for (const k of ['map', 'normalMap', 'roughnessMap']) m.material[k] && m.material[k].dispose();
			m.material.dispose();
		}
		for (const t of Object.values(out.textures)) if (t) { t.map.dispose(); t.normal && t.normal.dispose(); }
		out.lod1Material.dispose();
	};
	return out;
}
