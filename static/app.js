import { Game, GestureFilter, GestureHold, WIDTH, HEIGHT, clamp } from './game-core.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const video = $('webcam'), overlayCanvas = $('landmarks'), overlayCtx = overlayCanvas.getContext('2d');
const game = new Game(), filter = new GestureFilter(), gestureHold = new GestureHold(), keys = new Set();
let mode = 'keyboard', best = 0, last = performance.now(), pauseReason = '', armFire = false;
let worker = null, stream = null, cameraState = 'off', frameBusy = false, cameraGeneration = 0;
let gesture = null, lastSeen = 0, lastInference = 0, lastVideoTime = -1, lastResult = 0, inferenceEMA = 0, rateEMA = 0, startupTimer = null;
try { best = Number(localStorage.getItem('neon-pilot-best')) || 0; } catch { /* Storage may be unavailable in private mode. */ }
$('best').textContent = String(best).padStart(6, '0');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stars = Array.from({ length: 105 }, () => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, z: .25 + Math.random() * .75 }));
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

function status(text, kind = '') { $('cameraStatus').textContent = text; $('statusDot').className = 'status-dot ' + kind; }
function updateHUD() {
  $('score').textContent = String(game.score).padStart(6, '0');
  $('lives').textContent = Array.from({length: 3}, (_, i) => i < game.lives ? '◆' : '◇').join(' ');
  $('lives').setAttribute('aria-label', `${game.lives} lives`);
  $('sector').textContent = `SECTOR ${String(1 + Math.floor(game.time / 28)).padStart(2, '0')}`;
}
function showOverlay(tag, title, message, button, hint) {
  $('overlay').hidden = false; $('overlayTag').textContent = tag;
  $('overlayTitle').textContent = title; $('overlayText').textContent = message;
  $('startButton').textContent = button; $('overlayHint').textContent = hint;
  $('result').hidden = true;
}
function pause(reason = 'manual') {
  if (game.state !== 'playing') return;
  game.state = 'paused'; pauseReason = reason; keys.clear(); armFire = false; gestureHold.reset();
  const message = { gesture: 'Fist pause engaged. Hold an open palm for 1 second to resume, or use the Resume button / P.', tracking: 'Hand signal lost. Show one open hand, then resume when ready.', hidden: 'Your flight is safe. Return to the game and resume when ready.', camera: 'Camera disconnected. Reconnect it or choose Keyboard to continue.', mode: 'Controller changed. Get comfortable, then resume.', manual: 'Take a breath. The galaxy can wait.' }[reason];
  showOverlay('FLIGHT ON HOLD', 'PAUSED', message, 'RESUME FLIGHT ↗', reason === 'gesture' ? 'Open palm · hold 1 second to resume' : 'Progress is saved for this run');
  $('pauseButton').textContent = '▷ RESUME'; $('flightStatus').textContent = 'FLIGHT PAUSED';
}
function begin() {
  if (document.hidden) return;
  if (mode === 'gesture' && (cameraState !== 'ready' || !gesture || performance.now() - lastSeen > 400)) {
    $('overlayHint').textContent = 'Enable your camera and show one hand, or choose Keyboard.'; return;
  }
  if (mode === 'gesture' && gesture.fist) {
    $('overlayHint').textContent = 'Open your hand before starting or resuming.'; return;
  }
  if (game.state !== 'paused') game.start(); else game.state = 'playing';
  pauseReason = ''; keys.clear(); armFire = false; gestureHold.reset();
  $('overlay').hidden = true; $('pauseButton').disabled = false; $('restartButton').disabled = false;
  $('pauseButton').textContent = 'Ⅱ PAUSE'; $('flightStatus').textContent = 'FLIGHT ACTIVE';
  updateHUD(); last = performance.now();
}
function gameOver() {
  gestureHold.reset();
  if (game.score > best) { best = game.score; try { localStorage.setItem('neon-pilot-best', String(best)); } catch {} }
  $('best').textContent = String(best).padStart(6, '0');
  showOverlay('MISSION COMPLETE', 'FLIGHT ENDED', `${game.kills} drones destroyed · ${Math.floor(game.time)}s survived`, 'FLY AGAIN ↗', 'Every great pilot starts with another flight');
  $('result').hidden = false; $('result').textContent = `${String(game.score).padStart(6, '0')} POINTS\nBEST ${String(best).padStart(6, '0')}`;
  $('pauseButton').disabled = true; $('flightStatus').textContent = 'MISSION COMPLETE';
}
function setMode(next) {
  if (next === mode) return;
  pause('mode'); mode = next; keys.clear(); armFire = false; gestureHold.reset();
  // Changing controls must never allow a previous gesture pause to auto-resume.
  if (game.state === 'paused') pauseReason = 'mode';
  $('gestureMode').classList.toggle('selected', next === 'gesture'); $('keyboardMode').classList.toggle('selected', next === 'keyboard');
  $('gestureMode').setAttribute('aria-pressed', String(next === 'gesture')); $('keyboardMode').setAttribute('aria-pressed', String(next === 'keyboard'));
  $('modeLabel').textContent = next === 'gesture' ? 'GESTURE FLIGHT' : 'KEYBOARD FLIGHT';
}
$('gestureMode').addEventListener('click', () => setMode('gesture'));
$('keyboardMode').addEventListener('click', () => setMode('keyboard'));
$('startButton').addEventListener('click', begin);
$('pauseButton').addEventListener('click', () => game.state === 'paused' ? begin() : pause());
$('restartButton').addEventListener('click', () => { if (game.state !== 'title') { game.state = 'over'; begin(); } });
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && event.target.tagName !== 'BUTTON') event.preventDefault();
  if (event.target.tagName === 'BUTTON' && [' ', 'enter'].includes(key)) return;
  if (!event.repeat && (key === 'p' || key === 'escape')) { if (game.state === 'playing') pause(); else if (game.state === 'paused') begin(); }
  if (!event.repeat && key === 'r' && game.state !== 'title') { game.state = 'over'; begin(); }
  keys.add(key);
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('hidden'); });
window.addEventListener('blur', () => { keys.clear(); pause('hidden'); });

function clearTracking() {
  gesture = null; lastSeen = 0; filter.reset(); gestureHold.reset(); armFire = false;
  overlayCtx.clearRect(0, 0, 640, 480); $('trackingLight').classList.remove('active'); $('pinchValue').textContent = '—';
}
function stopCamera(message = 'Camera offline · keyboard ready', kind = '') {
  cameraGeneration++; clearTimeout(startupTimer); startupTimer = null;
  if (mode === 'gesture') pause('camera');
  if (stream) stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
  stream = null; video.srcObject = null; worker?.terminate(); worker = null;
  cameraState = 'off'; frameBusy = false; lastVideoTime = -1; lastResult = 0; inferenceEMA = 0; rateEMA = 0;
  clearTracking(); $('cameraEmpty').hidden = false; $('cameraButton').disabled = false;
  $('cameraButton').textContent = '◉ ENABLE CAMERA'; $('inference').textContent = '— ms'; $('trackingRate').textContent = '— fps'; status(message, kind);
}
function failCamera(message) { stopCamera('Camera unavailable', 'error'); $('cameraMessage').textContent = message; }
function drawLandmarks(points) {
  overlayCtx.clearRect(0, 0, 640, 480);
  if (!points) return;
  overlayCtx.lineWidth = 2; overlayCtx.strokeStyle = gesture?.pinched ? '#ed6fc2' : '#5bf5e0';
  for (const [a,b] of connections) { overlayCtx.beginPath(); overlayCtx.moveTo(points[a].x * 640, points[a].y * 480); overlayCtx.lineTo(points[b].x * 640, points[b].y * 480); overlayCtx.stroke(); }
  overlayCtx.fillStyle = '#efffff';
  for (const p of points) { overlayCtx.beginPath(); overlayCtx.arc(p.x * 640, p.y * 480, 3, 0, Math.PI * 2); overlayCtx.fill(); }
}
async function enableCamera() {
  if (cameraState !== 'off') { stopCamera(); $('cameraMessage').textContent = ''; return; }
  if (!navigator.mediaDevices?.getUserMedia) { failCamera('Camera access needs localhost and a current Chrome or Edge browser. Keyboard mode is ready.'); return; }
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) { failCamera('This browser lacks worker video support. Use current Chrome/Edge, or play with Keyboard.'); return; }
  const generation = ++cameraGeneration;
  cameraState = 'loading'; $('cameraButton').textContent = '✕ CANCEL CAMERA'; $('cameraMessage').textContent = '';
  status('Requesting camera permission…');
  try {
    const requested = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30, max: 30 } }, audio: false });
    if (generation !== cameraGeneration) { requested.getTracks().forEach(t => t.stop()); return; }
    stream = requested; video.srcObject = stream;
    stream.getVideoTracks()[0].onended = () => failCamera('The camera disconnected. Check the device, then enable it again. Keyboard is available.');
    await video.play();
    if (generation !== cameraGeneration) return;
    $('cameraEmpty').hidden = true; status('Loading local hand model · CPU…');
    worker = new Worker('/static/tracker-worker.js');
    startupTimer = setTimeout(() => { if (generation === cameraGeneration) failCamera('Model initialization timed out. Run scripts/setup_assets.py, reload the page, and try again.'); }, 45000);
    worker.onerror = () => { if (generation === cameraGeneration) failCamera('Hand runtime could not start. Run scripts/setup_assets.py and reload. Use current Chrome/Edge.'); };
    worker.onmessage = ({ data }) => {
      if (generation !== cameraGeneration) return;
      if (data.type === 'ready') {
        clearTimeout(startupTimer); cameraState = 'ready'; $('cameraButton').textContent = '✕ DISABLE CAMERA';
        status('Camera ready · show one hand'); setMode('gesture');
      } else if (data.type === 'error') {
        console.error('Local tracking:', data.message); failCamera('Model inference failed. Disable other camera apps, run scripts/setup_assets.py, and reload. Keyboard remains available.');
      } else if (data.type === 'result') {
        frameBusy = false;
        const now = performance.now();
        inferenceEMA = inferenceEMA ? inferenceEMA * .8 + data.inferenceMs * .2 : data.inferenceMs;
        if (lastResult) rateEMA = rateEMA ? rateEMA * .8 + (1000 / (now - lastResult)) * .2 : 1000 / (now - lastResult);
        lastResult = now;
        $('inference').textContent = `${inferenceEMA.toFixed(0)} ms`; $('trackingRate').textContent = `${rateEMA.toFixed(0)} fps`;
        // Discard old results rather than steering from stale frames after a suspended tab.
        gesture = now - data.timestamp < 500 ? filter.update(data.points, video.videoWidth / video.videoHeight) : null;
        if (gesture) {
          lastSeen = now; $('trackingLight').classList.add('active');
          $('pinchValue').textContent = gesture.ratio.toFixed(2);
          const action = mode === 'gesture' && !document.hidden
            ? (game.state === 'playing' && gesture.fist ? 'pause'
              : game.state === 'paused' && pauseReason === 'gesture' && gesture.openPalm ? 'resume' : null)
            : null;
          const hold = gestureHold.update(action, now);
          if (gesture.fist) armFire = false;
          if (hold.triggered) { if (action === 'pause') pause('gesture'); else begin(); }
          if (action && !hold.triggered) status(`Hold ${action === 'pause' ? 'fist to pause' : 'open palm to resume'} · ${Math.round(hold.progress * 100)}%`, 'good');
          else if (game.state === 'paused' && pauseReason === 'gesture') status('Paused · hold an open palm for 1s to resume', 'good');
          else status(gesture.fist ? 'Fist detected · release to fly' : gesture.pinched ? 'Hand locked · pinch firing' : 'Hand locked · ready to fly', 'good');
        } else {
          clearTracking(); status('No hand · show your open palm'); if (mode === 'gesture') pause('tracking');
        }
        drawLandmarks(gesture ? data.points : null);
      }
    };
    worker.postMessage({ type: 'init' });
  } catch (error) {
    if (generation !== cameraGeneration) return;
    const messages = { NotAllowedError: 'Camera permission was denied. Allow camera for localhost in your browser site settings, then retry. Keyboard works without camera.', NotFoundError: 'No camera was found. Connect a webcam and retry, or use Keyboard.', NotReadableError: 'Camera is busy or unavailable. Close other camera apps and retry, or use Keyboard.', OverconstrainedError: 'This camera cannot provide a compatible video stream. Try another webcam or Keyboard.' };
    failCamera(messages[error.name] || 'Could not open the camera. Check the connection and browser permissions, then retry or use Keyboard.');
  }
}
$('cameraButton').addEventListener('click', enableCamera);
window.addEventListener('pagehide', () => stopCamera());

async function sendFrame(now) {
  if (cameraState !== 'ready' || frameBusy || document.hidden || video.readyState < 2 || now - lastInference < 66 || video.currentTime === lastVideoTime) return;
  frameBusy = true; lastInference = now; lastVideoTime = video.currentTime;
  const generation = cameraGeneration;
  try {
    const width = Math.min(640, video.videoWidth);
    const bitmap = await createImageBitmap(video, { resizeWidth: width, resizeHeight: Math.round(width * video.videoHeight / video.videoWidth) });
    if (generation !== cameraGeneration || !worker) { bitmap.close(); return; }
    worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
  } catch { if (generation === cameraGeneration) failCamera('Could not read camera frames. Reconnect your camera, then enable it again.'); }
}

function ship(x, y, time) {
  ctx.save(); ctx.translate(x, y);
  if (game.state === 'playing' && game.invincible > 0 && Math.floor(time / 90) % 2) ctx.globalAlpha = .4;
  ctx.shadowColor = '#5bf5e0'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#12384b'; ctx.strokeStyle = '#70ffee'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(0,-27); ctx.lineTo(24,20); ctx.lineTo(9,14); ctx.lineTo(0,20); ctx.lineTo(-9,14); ctx.lineTo(-24,20); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d6fffb'; ctx.beginPath(); ctx.moveTo(0,-15); ctx.lineTo(6,9); ctx.lineTo(-6,9); ctx.closePath(); ctx.fill();
  ctx.shadowColor = '#ed6fc2'; ctx.fillStyle = '#ed6fc2'; ctx.beginPath(); ctx.moveTo(-6,23); ctx.lineTo(0,35 + Math.sin(time / 60) * 7); ctx.lineTo(6,23); ctx.fill(); ctx.restore();
}
function draw(now, dt) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const bg = ctx.createRadialGradient(490,280,30,480,350,650); bg.addColorStop(0,'#10192e'); bg.addColorStop(.5,'#0a1020'); bg.addColorStop(1,'#060a14'); ctx.fillStyle = bg; ctx.fillRect(0,0,WIDTH,HEIGHT);
  for (const star of stars) {
    if (!reducedMotion && game.state !== 'paused') star.y = (star.y + dt * (9 + star.z * (game.state === 'playing' ? 35 : 10))) % HEIGHT;
    ctx.fillStyle = `rgba(154,199,228,${star.z * .65})`; ctx.fillRect(star.x,star.y,star.z * 1.8,star.z * 1.8);
  }
  ctx.strokeStyle = '#4a8a9c0e'; ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 80) { ctx.beginPath(); ctx.moveTo(x,100); ctx.lineTo(x,HEIGHT); ctx.stroke(); }
  for (let y = 140; y < HEIGHT; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WIDTH,y); ctx.stroke(); }
  ctx.strokeStyle = '#5bf5e027'; ctx.beginPath(); ctx.arc(WIDTH * .51,HEIGHT * .5,190,0,Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(WIDTH * .51,HEIGHT * .5,205,-.5,1.2); ctx.stroke();
  for (const laser of game.lasers) {
    ctx.shadowBlur = 14; ctx.shadowColor = '#5bf5e0';
    const gradient = ctx.createLinearGradient(0,laser.y,0,laser.y+35); gradient.addColorStop(0,'#d9fff8'); gradient.addColorStop(1,'#5bf5e000');
    ctx.fillStyle = gradient; ctx.fillRect(laser.x-2,laser.y,4,35);
  }
  ctx.shadowBlur = 0;
  for (const enemy of game.enemies) {
    ctx.save(); ctx.translate(enemy.x,enemy.y); ctx.rotate(Math.sin(now / 700 + enemy.phase) * .2);
    const color = enemy.drift ? '#ed6fc2' : '#91a0ff'; ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.strokeStyle = color; ctx.fillStyle = enemy.hp > 1 ? '#443851' : '#20223a'; ctx.lineWidth = 1.8;
    const r = enemy.r; ctx.beginPath(); ctx.moveTo(-r,-r*.5); ctx.lineTo(-r*.5,r*.55); ctx.lineTo(0,r*.2); ctx.lineTo(r*.5,r*.55); ctx.lineTo(r,-r*.5); ctx.lineTo(0,-r*.15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(-4,-5,8,6); ctx.restore();
  }
  for (const p of game.particles) { ctx.globalAlpha = clamp(p.life * 2,0,1); ctx.fillStyle = p.color; ctx.fillRect(p.x,p.y,3,3); }
  ctx.globalAlpha = 1;
  if (game.state !== 'title' && game.state !== 'over') ship(game.player.x,game.player.y,now);
}
function frame(now) {
  const dt = Math.min((now - last) / 1000,.05); last = now;
  sendFrame(now);
  if (mode === 'gesture' && game.state === 'playing' && (!gesture || now - lastSeen > 450)) { clearTracking(); pause('tracking'); }
  const stateBefore = game.state;
  if (game.state === 'playing') {
    const fire = mode === 'gesture' ? !!gesture?.pinched && !gesture.fist : keys.has(' ');
    if (!fire) armFire = true;
    const input = mode === 'gesture' ? { target: gesture, fire: fire && armFire } : {
      dx: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
      dy: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')),
      fire: fire && armFire,
    };
    game.update(dt,input); updateHUD();
  }
  if (stateBefore === 'playing' && game.state === 'over') gameOver();
  draw(now,dt); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
