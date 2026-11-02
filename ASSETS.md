# Model and runtime provenance

No model was trained or retrained for this project.

| Asset | Version | Source | License |
| --- | --- | --- | --- |
| MediaPipe Tasks Vision JS + SIMD/non-SIMD WASM | `0.10.18` | https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.18.tgz | Apache-2.0 |
| Google Hand Landmarker task bundle | `hand_landmarker/float16/1` | https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task | Apache-2.0 |
| MediaPipe license | `v0.10.18` | https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.18/LICENSE | Apache-2.0 |

Official model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

`assets.lock.json` records exact per-file SHA256s, byte counts, URLs, and licenses. `scripts/setup_assets.py` downloads only missing/corrupt files and verifies them against that lock. Keep the lock when distributing or setting up the homework. Runtime and model files are served under `static/vendor` and `static/models`; no CDN is used during a game session. The upstream Apache license is bundled at `static/vendor/LICENSE`.

Canvas ships, drones, particles, stars, interface icons, and CSS graphics are original project artwork. All fonts are system fonts. Python dependencies use their upstream licenses (FastAPI MIT, Uvicorn BSD-3-Clause, HTTPX BSD-3-Clause); installed distributions include their notices.
