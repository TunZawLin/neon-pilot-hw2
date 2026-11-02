# NEON PILOT

A local, gesture-controlled space arcade. Steer a spaceship with one hand, pinch to fire, and hold a closed fist to pause. Built for the Open Source Software Development Methods and Tools homework.

## Features

- Canvas space arena with lasers, particles, enemies, increasing difficulty, three lives, score, and local best score.
- Webcam hand tracking with mirrored preview and landmark overlay.
- Pinch to fire; hold a fist for one second to pause; hold an open palm for one second to resume a gesture pause.
- Keyboard alternative: arrows/WASD, Space, P/Escape, and R.
- Safe pauses for tracking loss, camera loss, tab changes, focus loss, and controller changes.
- Local CPU inference, model/version provenance, inference latency and tracking-rate display.
- FastAPI health endpoint and automated service/game/controller tests.

## Windows setup

Use an installed Python 3.12 or newer. No virtual environment, paid API, GPU, account, frontend build step, or public hosting is needed to run the game. Open PowerShell in this repository's folder.

```powershell
$Python = (Get-Command python -ErrorAction Stop).Source
& $Python -m pip install --target .packages --upgrade -r requirements.txt
& $Python scripts/setup_assets.py
& $Python run.py
```

If `python` is a Store shortcut or points to the wrong interpreter, set `$Python` to the full path of your installed interpreter first. On the original Windows machine, the selected Python 3.14 interpreter is:

```powershell
$Python = "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe"
```

Use the same interpreter for installation, asset setup, launch, and tests. An optional helper is `./setup.ps1 -Python $Python` when normal local-script policy permits it; no execution-policy change is needed for the direct commands above.

Open **http://127.0.0.1:8000** in a current Chrome or Edge browser. Stop the server with **Ctrl+C**. It listens on loopback only.

Setup downloads approximately 27 MB of pinned model/runtime assets. Later sessions serve these locally and need no CDN. Downloaded assets and installed dependencies are intentionally excluded from Git. Keep `assets.lock.json`: `scripts/setup_assets.py` recreates missing files and checks their SHA256 hashes. Sources and licenses are listed in [ASSETS.md](ASSETS.md).

## Controls

| Action | Hand control | Keyboard |
| --- | --- | --- |
| Move | Move your palm within the camera view | Arrows / WASD |
| Fire | Pinch thumb and index; hold for repeated shots | Hold Space |
| Pause | Hold a closed fist for 1 second | P / Escape or Pause button |
| Resume a gesture pause | Hold an open palm, thumb separated, for 1 second | P / Escape or Resume button |
| Restart | Restart button | R |

Click **Enable Camera** and grant camera permission. The model initializes on CPU and selects hand mode. Show one open hand, then start the game. Pinching only the thumb/index does not count as a fist. Hold progress appears in the camera status. A held fist cannot repeatedly toggle pause.

Opening your palm resumes only a gesture pause. Tracking/camera loss, hidden-tab/focus changes, manual pauses, and controller changes require an explicit button or P after recovery. Open your hand before resuming; release pinch/Space once to arm firing. Disabling the camera or leaving the page releases its resources.

Destroy drones for 100 points. Collisions cost one of three lives; a short grace period prevents stacked impact damage. Drones passing the ship leave without costing a life. The best score is stored locally at game over.

## What uses machine learning?

**Pretrained ML:** Google's Hand Landmarker float16 v1 predicts 21 hand landmarks. The browser uses pinned `@mediapipe/tasks-vision 0.10.18`, CPU inference, and a dedicated worker. One frame is in flight at a time, at up to approximately 15 tracking frames per second, independently of game rendering. **We did not train or retrain a model.**

**Ordinary rules:** palm-center steering, mirroring, smoothing, pinch hysteresis, fist/open-palm geometry, one-second gesture holds, shooting cooldowns, collisions, enemy motion, lives, and scoring. Pinch thresholds are 0.32/0.46 relative to palm size. Fist/palm rules compare tip, knuckle, and wrist distances with image-aspect correction. Tracking gaps over 400 ms reset gesture holds. These are handcrafted rules, not a trained gesture classifier.

## DevOps and MLOps

- **Versioning:** source control, pinned Python/runtime/model versions, asset URLs, checksums, and licenses.
- **CI:** `.github/workflows/ci.yml` runs service tests, Node game/controller tests, and script syntax checks on pushes and pull requests.
- **Evaluation:** synthetic tests validate gesture/game rules. Real detection quality requires webcam trials across lighting, backgrounds, hand sizes, left/right hands, camera angles, and CPU speeds.
- **Monitoring:** the local UI displays inference latency, tracking rate, pinch ratio, hand state, and gesture-hold progress. These are performance indicators, not accuracy scores.
- **Future work:** user calibration, a labeled evaluation set, model comparisons with latency/quality release gates, and rollback to previous model/config versions. Training/retraining and public deployment are not implemented.

## Tests

```powershell
& $Python run.py --test
node --test tests/game.test.mjs tests/app.test.mjs
```

Node 22 is used in CI; Node is optional for gameplay. The Python service tests use tiny temporary assets for HTTP/MIME checks, so CI needs neither a webcam nor large model downloads. The full real-asset checksum test runs after asset setup; it is explicitly skipped if the downloaded assets are absent. Mocked DOM/camera results and synthetic landmarks do not prove real model execution. See [VERIFICATION.md](VERIFICATION.md) for actual results and user-confirmed manual checks.

## Manual acceptance

1. Enable the camera; confirm mirrored video, landmarks, and tracking values.
2. Move the ship in all directions; pinch, release, and hold to fire.
3. Hold a fist for 1 second to pause; keep it closed and confirm it stays paused. Hold an open palm for 1 second to resume. Normal pinching and short fists should not pause.
4. Test keyboard controls, scoring, collisions, three lives, game over, restart, and best-score persistence.
5. Hide the hand or change tabs; recover and explicitly resume. Disable the camera and check that the browser camera indicator turns off.

The project-notes page includes a camera-free runtime check using a synthetic blank image. It can verify actual model initialization/inference, but not webcam tracking accuracy.

## Troubleshooting

- **Page loads but buttons do nothing:** restart the server after server-code changes, then hard-refresh with Ctrl+Shift+R. JavaScript must be served as `text/javascript`; the app overrides Windows MIME mappings while keeping `nosniff` enabled.
- **Camera denied/busy/missing:** check the browser's localhost camera permission, close other camera apps, or use keyboard mode.
- **Model load failure:** rerun `scripts/setup_assets.py`; keep checksum verification enabled. Use a current Chrome/Edge browser.
- **Unstable tracking:** improve lighting, keep one hand visible, avoid occlusion, and try a comfortable distance. No quantitative webcam accuracy claim is made.

Webcam frames are processed in browser memory and are not uploaded, recorded, or logged. There is no backend frame-upload route or external telemetry. Project artwork is original Canvas/CSS; only system fonts are used.

Project code is MIT licensed. MediaPipe runtime/model assets retain Apache-2.0 licensing; setup restores the upstream license alongside those assets.
