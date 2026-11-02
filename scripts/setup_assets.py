"""Download pinned browser assets; verify committed SHA256s on every later setup."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
VERSION = "0.10.18"
NPM = f"https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-{VERSION}.tgz"
MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
LICENSE = "https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.18/LICENSE"
RUNTIME_FILES = ["vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.wasm", "wasm/vision_wasm_nosimd_internal.js", "wasm/vision_wasm_nosimd_internal.wasm"]


def download(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    lock_path = ROOT / "assets.lock.json"
    lock = json.loads(lock_path.read_text()) if lock_path.exists() else None
    expected = {f["path"]: f for f in lock["files"]} if lock else {}
    records = []
    archive = None

    def save(path, source, supplier):
        destination = STATIC / path
        record = expected.get(path)
        if record and destination.exists() and digest(destination.read_bytes()) == record["sha256"]:
            records.append(record)
            print("Verified", path)
            return
        data = supplier()
        sha = digest(data)
        if record and sha != record["sha256"]:
            raise RuntimeError(f"Hash mismatch for {path}; refusing changed asset")
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".download")
        temporary.write_bytes(data)
        temporary.replace(destination)
        records.append({"path": path, "source": source, "sha256": sha, "bytes": len(data), "license": "Apache-2.0"})
        print("Prepared", path, len(data), "bytes")

    def npm_file(name):
        nonlocal archive
        if archive is None:
            archive = tarfile.open(fileobj=io.BytesIO(download(NPM)), mode="r:gz")
        # Read only explicit members; never extract arbitrary archive paths.
        member = archive.extractfile("package/" + name)
        if member is None:
            raise RuntimeError("Missing npm asset: " + name)
        return member.read()

    for name in RUNTIME_FILES:
        save("vendor/" + name, NPM + "#package/" + name, lambda name=name: npm_file(name))
    save("models/hand_landmarker.task", MODEL, lambda: download(MODEL))
    save("vendor/LICENSE", LICENSE, lambda: download(LICENSE))
    if not lock or {f["path"] for f in records} != set(expected):
        lock_path.write_text(json.dumps({"runtime": VERSION, "model": "hand_landmarker float16 v1", "files": records}, indent=2) + "\n")
    print("All local browser assets ready. No CDN is used at runtime.")


if __name__ == "__main__":
    main()
