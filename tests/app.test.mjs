// DOM and camera fakes test controller state rules. This is NOT real browser/webcam testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handPose } from './hand-fixtures.mjs';

let tick, now = 1000;
const gradient = { addColorStop() {} };
const context = new Proxy({}, {get: (_target,key) => key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient : () => {}, set: () => true});
class Element {
  constructor() { this.listeners={}; this.hidden=false; this.disabled=false; this.textContent=''; this.tagName='DIV'; this.classList={toggle(){},add(){},remove(){}}; this.attributes={}; }
  addEventListener(type, fn) { this.listeners[type]=fn; }
  setAttribute(k,v) { this.attributes[k]=v; }
  getContext() { return context; }
  click() { return this.listeners.click?.(); }
}
async function fixture() {
  const elements=new Map(), listeners={};
  globalThis.document={hidden:false, getElementById(id){if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id);}, addEventListener(type,fn){listeners[type]=fn;}};
  globalThis.window={Worker:class {},OffscreenCanvas:class {},createImageBitmap(){},addEventListener(type,fn){listeners[type]=fn;}};
  globalThis.matchMedia=()=>({matches:true}); globalThis.localStorage={getItem(){return '1234';},setItem(){}};
  globalThis.requestAnimationFrame=fn=>{tick=fn;}; globalThis.performance={now:()=>now};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{const error=new Error('denied'); error.name='NotAllowedError'; throw error;}}}});
  await import(`../static/app.js?fixture=${Math.random()}`);
  return {el:id=>elements.get(id), listeners, frame(){now+=16; tick(now);}, key(key){listeners.keydown({key,repeat:false,target:{tagName:'BODY'},preventDefault(){}});}};
}
test('title starts without camera, keyboard flight fires, pause/resume and restart work', async()=>{
  const f=await fixture();
  assert.equal(f.el('best').textContent,'001234');
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,true);
  f.frame(); f.key(' '); for(let i=0;i<30;i++) f.frame();
  f.key('p'); assert.equal(f.el('overlayTitle').textContent,'PAUSED'); assert.equal(f.el('overlay').hidden,false);
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,true);
  f.el('restartButton').click(); assert.equal(f.el('score').textContent,'000000'); assert.equal(f.el('lives').textContent,'◆ ◆ ◆');
});
test('hidden tab pauses and requires explicit resume; tracking mode cannot start without hand', async()=>{
  const f=await fixture(); f.el('startButton').click();
  document.hidden=true; f.listeners.visibilitychange(); assert.equal(f.el('overlayTitle').textContent,'PAUSED');
  document.hidden=false; f.listeners.visibilitychange(); assert.equal(f.el('overlay').hidden,false);
  f.el('startButton').click(); f.el('gestureMode').click();
  assert.equal(f.el('modeLabel').textContent,'GESTURE FLIGHT');
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,false);
  assert.match(f.el('overlayHint').textContent,/show one hand/);
  f.el('keyboardMode').click(); f.el('startButton').click(); assert.equal(f.el('overlay').hidden,true);
});
test('denied camera has actionable recovery and keyboard remains usable', async()=>{
  const f=await fixture(); await f.el('cameraButton').click();
  assert.match(f.el('cameraMessage').textContent,/permission was denied/);
  assert.match(f.el('cameraMessage').textContent,/localhost/);
  assert.equal(f.el('cameraButton').textContent,'◉ ENABLE CAMERA');
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,true);
});
test('unavailable camera API shows local-browser guidance', async()=>{
  const f=await fixture(); navigator.mediaDevices=null;
  await f.el('cameraButton').click(); assert.match(f.el('cameraMessage').textContent,/localhost/);
});
test('simulated tracking loss and model failure pause safely and release camera resources', async()=>{
  const f=await fixture(); let stopped=0, terminated=0, mockWorker;
  const track={stop(){stopped++;},onended:null};
  navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]});
  globalThis.Worker=class {constructor(){mockWorker=this;} postMessage(){} terminate(){terminated++;}};
  f.el('webcam').play=async()=>{}; f.el('webcam').videoWidth=640; f.el('webcam').videoHeight=480;
  await f.el('cameraButton').click();
  mockWorker.onmessage({data:{type:'ready'}});
  const points=handPose();
  mockWorker.onmessage({data:{type:'result',points,inferenceMs:20,timestamp:now}});
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,true);
  mockWorker.onmessage({data:{type:'result',points:null,inferenceMs:20,timestamp:now}});
  assert.equal(f.el('overlayTitle').textContent,'PAUSED'); assert.match(f.el('overlayText').textContent,/Hand signal lost/);
  // Mock error, not an actual model execution.
  const originalConsoleError=console.error; console.error=()=>{};
  try { mockWorker.onmessage({data:{type:'error',message:'simulated failure'}}); } finally {console.error=originalConsoleError;}
  assert.equal(stopped,1); assert.equal(terminated,1); assert.match(f.el('cameraMessage').textContent,/Model inference failed/);
  assert.equal(f.el('webcam').srcObject,null);
});

async function gestureFixture() {
  const f = await fixture(); let mockWorker;
  const track = {stop(){}, onended:null};
  navigator.mediaDevices.getUserMedia = async()=>({getTracks:()=>[track], getVideoTracks:()=>[track]});
  globalThis.Worker = class {constructor(){mockWorker=this;} postMessage(){} terminate(){}};
  f.el('webcam').play = async()=>{};
  f.el('webcam').videoWidth=640; f.el('webcam').videoHeight=480;
  // Results below are injected directly; do not start the real frame-transfer loop.
  f.el('webcam').readyState=0;
  await f.el('cameraButton').click();
  mockWorker.onmessage({data:{type:'ready'}});
  f.sample = (pose, delta=100) => {
    now += delta;
    mockWorker.onmessage({data:{type:'result', points:pose ? handPose(pose) : null, inferenceMs:20, timestamp:now}});
    f.frame();
  };
  f.hold = pose => {for(let i=0;i<11;i++) f.sample(pose);};
  f.sample('open'); f.el('startButton').click();
  return f;
}

test('fist hold pauses once; only a deliberate open-palm hold resumes it', async()=>{
  const f = await gestureFixture();
  f.sample('fist'); assert.equal(f.el('overlay').hidden,true);
  assert.match(f.el('cameraStatus').textContent,/fist to pause/);
  f.hold('fist'); assert.equal(f.el('overlayTitle').textContent,'PAUSED');
  assert.match(f.el('overlayText').textContent,/Fist pause/);
  f.hold('fist'); assert.equal(f.el('overlay').hidden,false);
  f.el('startButton').click(); assert.equal(f.el('overlay').hidden,false);
  f.sample('open'); assert.equal(f.el('overlay').hidden,false);
  assert.match(f.el('cameraStatus').textContent,/open palm to resume/);
  f.hold('open'); assert.equal(f.el('overlay').hidden,true);
  f.hold('open'); assert.equal(f.el('overlay').hidden,true);
  f.listeners.pagehide();
});

test('pinching, short fists, and interrupted fists do not pause gameplay', async()=>{
  const f = await gestureFixture();
  f.hold('pinch'); assert.equal(f.el('overlay').hidden,true);
  for(let i=0;i<5;i++) f.sample('fist');
  f.sample('open');
  for(let i=0;i<5;i++) f.sample('fist');
  assert.equal(f.el('overlay').hidden,true);
  f.listeners.pagehide();
});

test('open palm never resumes manual/hidden pauses; keyboard mode ignores fist holds', async()=>{
  const f = await gestureFixture();
  f.key('p'); f.hold('open'); assert.equal(f.el('overlay').hidden,false);
  f.el('startButton').click();
  document.hidden=true; f.listeners.visibilitychange(); document.hidden=false;
  f.hold('open'); assert.equal(f.el('overlay').hidden,false);
  f.el('keyboardMode').click(); f.el('startButton').click();
  f.hold('fist'); assert.equal(f.el('overlay').hidden,true);
  f.listeners.pagehide();
});
