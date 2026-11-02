"""Local-only NEON PILOT server. No camera frames are accepted or stored."""
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
app = FastAPI(title="NEON PILOT", version="1.0.0", docs_url=None, redoc_url=None)


class BrowserStaticFiles(StaticFiles):
    """Keep executable asset types independent of Windows registry mappings."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        media_type = {
            ".js": "text/javascript",
            ".mjs": "text/javascript",
            ".wasm": "application/wasm",
        }.get(Path(path).suffix.lower())
        if media_type and response.status_code in (200, 206):
            response.headers["Content-Type"] = media_type
        return response


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.update({
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
    })
    return response


@app.get("/health")
def health():
    manifest = ROOT / "assets.lock.json"
    assets = json.loads(manifest.read_text()) if manifest.exists() else {}
    entries = assets.get("files", [])
    ready = bool(entries) and all((STATIC / entry["path"]).is_file() for entry in entries)
    return {"status": "ok", "assets_ready": ready, "runtime": "@mediapipe/tasks-vision 0.10.18", "model": "hand_landmarker float16 v1"}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", media_type="text/html")


app.mount("/static", BrowserStaticFiles(directory=STATIC), name="static")
