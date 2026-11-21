// Procedural sound effects. AudioContext is created only after a user gesture.
const STORAGE_KEY = 'dragonEmpire.audio.v1';
const SOUND_NAMES = ['breath_flame','breath_storm','hit','kill','multikill','levelup','evolve','coronation','skill_meteor','skill_tornado','skill_lightning','skill_shield','ult_flame','ult_storm','boss_roar','boss_volley','elite_spawn','player_hurt','dive_shockwave','ui_click','tower_hit','shield_block','assault_warn','assault_intercept','wave_rush','day_start','dusk'];
export { SOUND_NAMES };

const SPECS = {
  breath_flame:{f:130,end:65,d:.22,type:'sawtooth',noise:.75,rate:8},
  breath_storm:{f:520,end:180,d:.17,type:'square',noise:.48,rate:8},
  hit:{f:290,end:105,d:.12,type:'triangle',noise:.45,rate:12},
  kill:{f:280,end:620,d:.28,type:'triangle',noise:.22,rate:5},
  multikill:{f:390,end:820,d:.46,type:'sine',harm:1.5,rate:3},
  levelup:{f:440,end:880,d:.55,type:'sine',harm:1.5,rate:2},
  evolve:{f:150,end:710,d:1.15,type:'triangle',harm:2,noise:.16,rate:1},
  coronation:{f:220,end:660,d:1.8,type:'triangle',harm:1.5,noise:.12,rate:1},
  skill_meteor:{f:480,end:42,d:.8,type:'sawtooth',noise:.75,rate:2},
  skill_tornado:{f:100,end:240,d:1.15,type:'sawtooth',noise:.8,rate:2},
  skill_lightning:{f:1000,end:180,d:.35,type:'square',noise:.7,rate:4},
  skill_shield:{f:390,end:820,d:.65,type:'sine',harm:2,rate:2},
  ult_flame:{f:110,end:55,d:1.5,type:'sawtooth',noise:.85,rate:1},
  ult_storm:{f:800,end:120,d:1.35,type:'square',noise:.8,rate:1},
  boss_roar:{f:105,end:48,d:1.5,type:'sawtooth',noise:.65,rate:1},
  boss_volley:{f:240,end:65,d:.48,type:'sawtooth',noise:.65,rate:4},
  elite_spawn:{f:85,end:220,d:.9,type:'triangle',noise:.25,rate:1},
  player_hurt:{f:220,end:70,d:.22,type:'triangle',noise:.35,rate:4},
  dive_shockwave:{f:130,end:35,d:.7,type:'sine',noise:.8,rate:2},
  ui_click:{f:720,end:480,d:.06,type:'sine',rate:10},
  // Three Nights: use distinct pitch contours/timbres for tower, shield and phase cues.
  tower_hit:{f:105,end:38,d:.7,type:'triangle',noise:.65,rate:3},
  shield_block:{f:750,end:1150,d:.24,type:'sine',harm:2,rate:6},
  assault_warn:{f:240,end:960,d:4,attack:2.8,type:'sine',harm:1.5,rate:1},
  assault_intercept:{f:850,end:320,d:.4,type:'triangle',harm:2,noise:.12,rate:3},
  wave_rush:{f:120,end:500,d:.8,type:'sawtooth',noise:.35,rate:1},
  day_start:{f:330,end:660,d:.9,type:'sine',harm:1.5,rate:1},
  dusk:{f:500,end:160,d:1.15,type:'triangle',harm:1.5,rate:1},
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));

export function createAudio() {
  let context = null, master = null, ambience = null, ambienceStage = null, muted = false, masterValue = 0.7, unlocked = false, noiseBuffer = null;
  const recent = new Map();
  try { const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null'); if (saved) { muted = !!saved.muted; masterValue = clamp(saved.master,0,1); } } catch {}
  const save = () => { try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({muted,master:masterValue})); } catch {} };
  function applyMaster() { if (master && context) master.gain.setTargetAtTime(muted ? 0 : masterValue, context.currentTime, .025); }
  function ensureContext() {
    if (context) return context;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try { context = new Ctor(); master = context.createGain(); master.connect(context.destination); applyMaster(); return context; } catch { context = null; return null; }
  }
  function noise() {
    if (noiseBuffer) return noiseBuffer;
    const n = Math.floor(context.sampleRate * 2); noiseBuffer = context.createBuffer(1,n,context.sampleRate);
    const data = noiseBuffer.getChannelData(0); for (let i=0;i<n;i++) data[i] = Math.random()*2-1;
    return noiseBuffer;
  }
  function stopAmbience() { ambienceStage = null; if (!ambience || !context) return; const a=ambience; ambience=null; try { a.gain.gain.setTargetAtTime(.0001,context.currentTime,.15); a.source.stop(context.currentTime+.8); } catch {} }
  function startAmbience(stage=1) {
    ambienceStage = Math.max(1,Math.min(4,Number(stage)||1));
    if (!unlocked || !ensureContext()) return;
    const nextStage=ambienceStage; if (ambience) { if (ambience.stage===nextStage) return; stopAmbience(); ambienceStage=nextStage; }
    try { const source=context.createBufferSource(), filter=context.createBiquadFilter(), gain=context.createGain(); source.buffer=noise(); source.loop=true; filter.type='lowpass'; filter.frequency.value=250+nextStage*90; gain.gain.setValueAtTime(.0001,context.currentTime); gain.gain.exponentialRampToValueAtTime(.035+nextStage*.008,context.currentTime+1); source.connect(filter); filter.connect(gain); gain.connect(master); source.start(); ambience={source,gain,stage:nextStage}; } catch {}
  }
  function unlock() {
    unlocked=true; const ctx=ensureContext(); if (!ctx) return;
    try { const pending=ctx.resume(); if (pending?.catch) pending.catch(()=>{}); } catch {}
    if (ambienceStage!==null) startAmbience(ambienceStage);
  }
  if (typeof document !== 'undefined') for (const event of ['pointerdown','keydown','touchstart']) document.addEventListener(event,unlock,{capture:true,passive:true,once:true});
  function play(name, options={}) {
    const spec=SPECS[name]; if (!spec || !unlocked || muted || !ensureContext()) return false;
    const now=context.currentTime, entries=(recent.get(name)||[]).filter(t=>now-t<1);
    if (entries.length>=spec.rate) { recent.set(name,entries); return false; }
    const x=Number(options.x)||0,y=Number(options.y)||0,z=Number(options.z)||0, distance=Math.hypot(x,y,z), attenuation=1/(1+(distance/75)**2), volume=clamp(options.volume ?? 1,0,1)*attenuation;
    if (volume<.001) return false;
    try {
      const gain=context.createGain(); gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.14),now+(spec.attack || .012)); gain.gain.exponentialRampToValueAtTime(.0001,now+spec.d);
      if (context.createStereoPanner) { const pan=context.createStereoPanner(); pan.pan.value=clamp(x/100,-1,1); gain.connect(pan); pan.connect(master); } else gain.connect(master);
      const osc=context.createOscillator(); osc.type=spec.type; osc.frequency.setValueAtTime(spec.f,now); osc.frequency.exponentialRampToValueAtTime(spec.end,now+spec.d); osc.connect(gain); osc.start(now); osc.stop(now+spec.d+.03);
      if (spec.harm) { const overtone=context.createOscillator(), sub=context.createGain(); overtone.type='sine'; overtone.frequency.setValueAtTime(spec.f*spec.harm,now); overtone.frequency.exponentialRampToValueAtTime(spec.end*spec.harm,now+spec.d); sub.gain.value=.26; overtone.connect(sub); sub.connect(gain); overtone.start(now); overtone.stop(now+spec.d+.03); }
      if (spec.noise) { const source=context.createBufferSource(), filter=context.createBiquadFilter(), ng=context.createGain(); source.buffer=noise(); filter.type='lowpass'; filter.frequency.value=Math.max(350,spec.f*3); ng.gain.value=spec.noise; source.connect(filter); filter.connect(ng); ng.connect(gain); source.start(now); source.stop(now+spec.d+.03); }
      entries.push(now); recent.set(name,entries); return true;
    } catch { return false; }
  }
  return {play,setMaster(v){masterValue=clamp(v,0,1);applyMaster();save()},mute(v){muted=!!v;applyMaster();save()},startAmbience,stopAmbience};
}
