import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createAudio, SOUND_NAMES } from '../audio.js';

test('오디오 잠금 해제, 소리 제한, 음소거 저장 및 거리 감쇠', () => {
  const handlers = {}, store = new Map(), gains = [];
  class Param { constructor(){this.value=0} setValueAtTime(v){this.value=v} exponentialRampToValueAtTime(v){this.value=v} setTargetAtTime(v){this.value=v} }
  class Node { constructor(){this.gain=new Param();this.frequency=new Param();this.pan=new Param()} connect(){} start(){} stop(){} }
  class Context { constructor(){this.currentTime=0;this.sampleRate=100;this.destination={};Context.instances++} createGain(){let n=new Node();gains.push(n.gain);return n} createOscillator(){return new Node()} createStereoPanner(){return new Node()} createBiquadFilter(){return new Node()} createBufferSource(){return new Node()} createBuffer(){return {getChannelData:()=>new Float32Array(200)}} resume(){return Promise.resolve()} }
  Context.instances=0;
  const previous={document:globalThis.document,AudioContext:globalThis.AudioContext,localStorage:globalThis.localStorage};
  globalThis.document={addEventListener:(name,cb)=>{handlers[name]=cb}}; globalThis.AudioContext=Context;
  globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  try {
    const a=createAudio(); assert.equal(Context.instances,0); assert.equal(a.play('hit'),false);
    handlers.pointerdown(); assert.equal(Context.instances,1); assert.equal(a.play('missing'),false);
    assert.equal(a.play('ui_click'),true); for(let i=1;i<10;i++) assert.equal(a.play('ui_click'),true); assert.equal(a.play('ui_click'),false);
    assert.equal(a.play('hit',{x:10000}),false); a.setMaster(.4); a.mute(true); assert.equal(a.play('kill'),false);
    assert.deepEqual(JSON.parse(store.get('dragonEmpire.audio.v1')),{muted:true,master:.4});
    a.mute(false); a.startAmbience(3); a.stopAmbience();
    for(const name of SOUND_NAMES) assert.equal(typeof name,'string');
    for(const name of ['tower_hit','shield_block','assault_warn','assault_intercept','wave_rush','day_start','dusk','build_rise','hammer','wood_break']) {
      assert.ok(SOUND_NAMES.includes(name), `${name} is registered`);
      assert.equal(a.play(name),true,`${name} can be played after unlock`);
    }
  } finally { for(const [key,value] of Object.entries(previous)) { if(value===undefined) delete globalThis[key]; else globalThis[key]=value; } }
});

test('스토리지가 막혀도 오디오 객체가 생성된다', () => {
  const old=globalThis.localStorage; Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied')}});
  try { const audio=createAudio(); assert.doesNotThrow(()=>{audio.setMaster(.5);audio.mute(true)}); } finally { if(old===undefined) delete globalThis.localStorage; else Object.defineProperty(globalThis,'localStorage',{value:old,writable:true,configurable:true}); }
});

test('특정 소리만 중지하고 즉시 다시 재생할 수 있다', () => {
  const handlers = {}, sources = [];
  class Param { setValueAtTime(){} exponentialRampToValueAtTime(){} setTargetAtTime(){} }
  class Node { constructor(){this.gain=new Param();this.frequency=new Param();this.pan=new Param();this.stops=[]} connect(){} start(){} stop(t){this.stops.push(t)} }
  class Context { constructor(){this.currentTime=1;this.sampleRate=100;this.destination={}} createGain(){return new Node()} createOscillator(){const n=new Node();sources.push(n);return n} createStereoPanner(){return new Node()} resume(){return Promise.resolve()} }
  const old={document:globalThis.document,AudioContext:globalThis.AudioContext,localStorage:globalThis.localStorage};
  globalThis.document={addEventListener:(n,f)=>handlers[n]=f}; globalThis.AudioContext=Context; globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  try {
    const a=createAudio(); assert.equal(a.stop('assault_warn'),0); handlers.pointerdown();
    assert.equal(a.play('assault_warn'),true); assert.equal(sources.length,2);
    assert.equal(a.stop('assault_warn'),2); assert.ok(sources.every(n=>n.stops.at(-1)===1));
    assert.equal(a.stop('assault_warn'),0); assert.equal(a.play('assault_warn'),true,'rate limit reset allows immediate replay');
    sources[0].onended(); assert.equal(a.stop('assault_warn'),2,'old onended must not clear new sources');
  } finally { for(const [k,v] of Object.entries(old)) { if(v===undefined) delete globalThis[k]; else globalThis[k]=v; } }
});

test('건축 망치 소리는 세 번의 분리된 타격을 예약한다', () => {
  const handlers = {}, gains = [];
  class Param { constructor(){this.events=[]} setValueAtTime(v,t){this.events.push([v,t])} exponentialRampToValueAtTime(v,t){this.events.push([v,t])} setTargetAtTime(){} }
  class Node { constructor(){this.gain=new Param();this.frequency=new Param();this.pan=new Param()} connect(){} start(){} stop(){} }
  class Context { constructor(){this.currentTime=2;this.sampleRate=100;this.destination={}} createGain(){const n=new Node();gains.push(n.gain);return n} createOscillator(){return new Node()} createStereoPanner(){return new Node()} createBufferSource(){return new Node()} createBiquadFilter(){return new Node()} createBuffer(){return {getChannelData:()=>new Float32Array(200)}} resume(){return Promise.resolve()} }
  const old={document:globalThis.document,AudioContext:globalThis.AudioContext,localStorage:globalThis.localStorage};
  globalThis.document={addEventListener:(n,f)=>handlers[n]=f}; globalThis.AudioContext=Context; globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
  try { const a=createAudio(); handlers.pointerdown(); assert.equal(a.play('hammer'),true); const envelope=gains[1].events; const peaks=envelope.filter(([v])=>v>.001); assert.equal(peaks.length,3); assert.deepEqual(peaks.map(([,t])=>+t.toFixed(3)),[2.008,2.198,2.388]); }
  finally { for(const [k,v] of Object.entries(old)) { if(v===undefined) delete globalThis[k]; else globalThis[k]=v; } }
});
