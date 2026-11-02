// A classic worker is required: the pinned WASM loader uses importScripts.
// Dynamic import loads the official ESM runtime without converting this worker to a module.

let tracker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/wasm', self.location.href).href);
      tracker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
  }
  if (data.type === 'frame') {
    try {
      const start = performance.now();
      const result = tracker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', points: result.landmarks[0] || null, inferenceMs: performance.now() - start, timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
    finally { data.bitmap.close(); }
  }
};
