# Verification record

Date: 2026-11-02 (Asia/Seoul).

## Automated results

- 5 Python tests passed locally, including real asset SHA256/size integrity, readiness with missing/empty/present assets, entry/security headers, route behavior, and executable-asset MIME types under incorrect host MIME mappings.
- 16 Node tests passed for game rules, gesture geometry, pinch hysteresis, cooldowns, collision/life/score/restart behavior, continuous gesture holds, and mocked browser/camera controller behavior.
- HTTP checks confirmed the page, scripts, and stylesheet are served, with JavaScript served as text/javascript. This corrects the startup failure caused by Windows mapping JavaScript to text/plain.
- The CI workflow is configured to run service tests, Node tests, and script syntax checks without a webcam or large asset downloads. The first remote Linux GitHub Actions run passed: https://github.com/TunZawLin/neon-pilot-hw2/actions/runs/41428524477 (commit a7684f2882f82bcc3584f2c5b7f5456a2ce6cc34).

## User-confirmed manual results

The user reported that the game was working after the MIME fix. After the gesture controls were added, the user confirmed that fist pause and open-palm resume were working in their setup. These are user-reported manual results, distinct from the agent's automated tests.

## Boundaries

Synthetic landmarks and mocked DOM/camera responses test rules and controller state; they do not establish model accuracy. Real assets were checked for integrity, but this is not an accuracy benchmark. No quantitative detection accuracy, latency benchmark, or broad device/browser compatibility claim is made. The model is pretrained; no training or retraining was performed.

Automated browser evidence capture was unavailable in the authoring environment. Submission screenshots are captured separately from the real GitHub repository and working browser service; no screenshot or manual test result is fabricated.

## Environment

The user's documented launch uses installed Python 3.14 with project-local .packages and no virtual environment. The agent's current backend checks use bundled Python 3.12 with the identical pinned requirements in an isolated temporary directory because the original dependency files are unreadable to that tool context. The original Python installation and dependency directory were preserved. Node tests run with the available installed Node runtime.

No public hosting or automatic deployment is claimed. GitHub Actions provides automated testing once published.

## Clean upload verification

The explicit 25-file upload allowlist was copied into a fresh directory. Its pinned Python dependencies were freshly installed. Before asset setup, four service tests passed and the full checksum check explicitly skipped. The included setup script then downloaded and verified all seven pinned runtime/model/license files; afterward all five Python tests and all sixteen Node tests passed. This clean copy did not rely on the original project folder or its dependency/model files.

## Published source

Public repository: https://github.com/TunZawLin/neon-pilot-hw2 . Source-only main branch publication was verified through GitHub. Installed packages, runtime/model downloads, credentials, and submission evidence are excluded from the repository.
