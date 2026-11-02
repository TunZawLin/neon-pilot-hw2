const button = document.getElementById('runtimeCheck');
const output = document.getElementById('runtimeOutput');
button.addEventListener('click', () => {
  button.disabled = true; output.textContent = 'Loading pinned CPU runtime and model…';
  const worker = new Worker('/static/tracker-worker.js');
  const timeout = setTimeout(() => finish('FAILED: runtime timed out. Run scripts/setup_assets.py and retry.'), 45000);
  function finish(message) { clearTimeout(timeout); worker.terminate(); button.disabled = false; output.textContent = message; }
  worker.onerror = () => finish('FAILED: worker/runtime load error. Verify assets and use current Chrome or Edge.');
  worker.onmessage = async ({data}) => {
    if (data.type === 'ready') {
      output.textContent = 'Model initialized. Running inference on a blank synthetic frame…';
      const canvas = new OffscreenCanvas(640,480), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#808080'; ctx.fillRect(0,0,640,480);
      const bitmap = canvas.transferToImageBitmap();
      worker.postMessage({type:'frame', bitmap, timestamp:performance.now()}, [bitmap]);
    } else if (data.type === 'result') {
      finish(`PASSED: pretrained model initialized on CPU; blank-frame inference completed in ${data.inferenceMs.toFixed(1)} ms; ${data.points ? 1 : 0} hands detected. Synthetic frame only — this does not verify real webcam tracking.`);
    } else if (data.type === 'error') finish('FAILED: ' + data.message);
  };
  worker.postMessage({type:'init'});
});
