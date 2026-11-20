// assets/manifest.json 로더 (COLLAB.md 규약). 승인된 에셋만 manifest에 등록된다.
// 로딩 실패·누락 시 null을 돌려주고 게임은 기존 절차적 도형으로 계속 진행한다.
import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/addons/GLTFLoader.js';
import { createRigUniforms, applyDragonRig } from './dragon-anim.js';

let manifest = null;
export async function loadManifest(url = 'assets/manifest.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    manifest = Object.fromEntries((j.assets || []).map(a => [a.id, a]));
  } catch (e) {
    console.info('[assets] manifest 없음 → 절차적 에셋 사용', e.message);
    manifest = {};
  }
  return manifest;
}

const gltf = new GLTFLoader();
// 승인된 GLB를 로드해 목표 크기(길이 m)로 정규화하고 전방을 -Z로 맞춘 Group을 돌려준다.
export async function loadModel(id, { length = 4.5, flap = false, rig = false } = {}) {
  const a = manifest?.[id];
  if (!a || a.type !== 'glb') return null;
  try {
    const g = await gltf.loadAsync('assets/' + a.file);
    const root = g.scene;
    const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    // 리깅 없는 GLB: 절차적 스켈레톤(버텍스 셰이더 스키닝, dragon-anim.js)으로 날개·꼬리·목·다리를 움직인다
    const rigU = (rig || flap) ? createRigUniforms() : null;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (rigU) applyDragonRig(o, rigU);
    });
    root.position.sub(center);
    const wrap = new T.Group(); wrap.add(root);
    // manifest forward가 '+Z'이면 게임 기준(-Z 전방)으로 돌린다
    if ((a.forward || '+Z') === '+Z') root.rotation.y = Math.PI;
    wrap.scale.setScalar((length / Math.max(size.x, size.z)) * (a.scale || 1));
    wrap.userData = { fromManifest: id, rigged: !!a.rigged, animations: g.animations, rig: rigU, unit: length };
    return wrap;
  } catch (e) {
    console.warn('[assets] 로드 실패 → 폴백', id, e.message);
    return null;
  }
}
