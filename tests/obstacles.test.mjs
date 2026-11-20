import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { createObstacleField } from '../world/obstacles.js';
const field = createObstacleField([{id:'pillar',a:{x:0,y:0,z:0},b:{x:0,y:10,z:0},radius:2},{id:'island',a:{x:30,y:0,z:0},b:{x:30,y:0,z:0},radius:5}],10);
test('캡슐 겹침은 방향과 밀어낼 거리를 반환한다',()=>{const hit=field.obstacleAt(2.5,5,0,1);assert.equal(hit.hit,true);assert.equal(hit.obstacle,'pillar');assert.ok(Math.abs(hit.depth-.5)<1e-8);assert.equal(hit.normal.x,1);assert.equal(field.obstacleAt(10,5,0,1).hit,false)});
test('선분은 가장 가까운 장애물을 맞추고 범위 밖 장애물은 무시한다',()=>{const h=field.raycastObstacles({x:-10,y:5,z:0},{x:40,y:5,z:0});assert.equal(h.obstacle,'pillar');assert.ok(Math.abs(h.point.x+2)<1e-6);assert.equal(field.raycastObstacles({x:-10,y:20,z:0},{x:40,y:20,z:0}),null)});
test('시작점이 내부면 즉시 충돌이며 구에도 충돌한다',()=>{assert.equal(field.raycastObstacles({x:0,y:5,z:0},{x:5,y:5,z:0}).distance,0);assert.ok(Math.abs(field.raycastObstacles({x:20,y:0,z:0},{x:40,y:0,z:0}).point.x-25)<1e-6)});
test('수십 회 조회의 평균 시간을 측정한다',()=>{let sum=0;const start=performance.now();for(let i=0;i<10000;i++)sum+=field.obstacleAt(i%50,5,0,2).hit?1:0;const elapsed=performance.now()-start;assert.ok(sum>0);console.log(`obstacleAt 10000 calls: ${elapsed.toFixed(1)}ms (${(elapsed/10000).toFixed(4)}ms/call)`)});
