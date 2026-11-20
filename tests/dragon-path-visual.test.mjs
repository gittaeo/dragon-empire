import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as T from '../vendor/three.module.js';
import { setDragonPathVisual } from '../assets-loader.js';

test('경로 색상이 보이고 반복 선택해도 누적되지 않으며 원본으로 복원된다', () => {
  const material = new T.MeshStandardMaterial({ color: 0x999999, emissive: 0x000000 });
  const scene = new T.Group();
  scene.add(new T.Mesh(new T.BoxGeometry(), material));
  const original = material.color.clone();
  setDragonPathVisual(scene, 'flame');
  const flame = material.color.clone();
  setDragonPathVisual(scene, 'flame');
  assert.ok(material.color.equals(flame));
  setDragonPathVisual(scene, 'storm');
  assert.notDeepEqual(material.color.toArray(), flame.toArray());
  setDragonPathVisual(scene, '');
  assert.ok(material.color.equals(original));
});
