import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createArmy, SOLDIER} from '../army.js';
import {BUILD, padLayout} from '../base.js';
import {DIRS} from '../nights.js';

test('M1 layout and construction tables match director starting contract', () => {
  const pads=padLayout(DIRS);
  assert.equal(pads.length,12);
  assert.equal(new Set(pads.map(p=>p.id)).size,12);
  assert.deepEqual(pads.filter(p=>p.type==='gate').map(p=>p.id),['gate_n','gate_e','gate_s','gate_w']);
  assert.deepEqual(BUILD.barracks.levels.map(l=>l.cap),[4,6]);
  assert.deepEqual(BUILD.gate.levels.map(l=>l.hp),[300,700]);
  assert.deepEqual(BUILD.house.levels.map(l=>l.pop),[2,3]);
});

test('injured soldiers stay down during night and return once next morning', () => {
  const scene=new T.Scene(), army=createArmy({scene,groundAt:()=>0,towerPos:new T.Vector3(),hitEnemy:()=>{},burst:()=>{},sfx:()=>{}});
  const origin=new T.Vector3(); army.setSoldiers(2,SOLDIER.hp,origin);
  const before=[...army.soldiers]; army.hurt(before[0],SOLDIER.hp);
  assert.equal(before[0].state,'down'); assert.equal(army.alive,1);
  army.update(5,{ground:[],night:true}); assert.equal(before[0].state,'down');
  army.morning(); army.morning();
  assert.equal(army.soldiers.length,2); assert.equal(army.alive,2);
  assert.equal(army.soldiers[0],before[0]); assert.equal(army.soldiers[0].hp,SOLDIER.hp);
});
