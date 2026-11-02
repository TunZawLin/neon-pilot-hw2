import hashlib
import json
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient
from app import app

ROOT = Path(__file__).resolve().parents[1]


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.temporary = TemporaryDirectory(prefix='neon-pilot-test-')
        self.addCleanup(self.temporary.cleanup)
        self.fixture_root = Path(self.temporary.name)
        self.fixture_static = self.fixture_root / 'static'
        # Tiny fixtures test HTTP/MIME behavior, never model inference. This
        # makes the service tests runnable in CI before downloading any assets.
        for name in ['app.js', 'game-core.js', 'tracker-worker.js', 'diagnostics.js',
                     'vendor/vision_bundle.mjs', 'vendor/wasm/vision_wasm_internal.js',
                     'vendor/wasm/vision_wasm_internal.wasm']:
            file = self.fixture_static / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b'fixture')
        mount = next(route for route in app.routes if route.name == 'static')
        directories = patch.object(mount.app, 'all_directories', [str(self.fixture_static)])
        directories.start()
        self.addCleanup(directories.stop)

    def test_health_and_assets(self):
        with patch('app.ROOT', self.fixture_root), patch('app.STATIC', self.fixture_static):
            response = self.client.get('/health')
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()['assets_ready'])
            self.assertEqual(response.json()['status'], 'ok')
            manifest = self.fixture_root / 'assets.lock.json'
            manifest.write_text(json.dumps({'files': []}))
            self.assertFalse(self.client.get('/health').json()['assets_ready'])
            manifest.write_text(json.dumps({'files': [{'path': 'app.js'}]}))
            self.assertTrue(self.client.get('/health').json()['assets_ready'])
            manifest.write_text(json.dumps({'files': [{'path': 'missing.task'}]}))
            self.assertFalse(self.client.get('/health').json()['assets_ready'])

    def test_entry_and_security(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('NEON PILOT', response.text)
        self.assertIn("connect-src 'self'", response.headers['content-security-policy'])
        self.assertEqual(response.headers['permissions-policy'], 'camera=(self), microphone=(), geolocation=()')

    def test_static_wasm_mime_and_no_camera_upload_route(self):
        response = self.client.get('/static/vendor/wasm/vision_wasm_internal.wasm')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'application/wasm')
        self.assertEqual(self.client.post('/health', content=b'not-a-frame').status_code, 405)
        self.assertEqual(self.client.post('/upload', content=b'not-a-frame').status_code, 404)
        self.assertEqual(self.client.get('/static/../app.py').status_code, 404)

    def test_executable_asset_types_ignore_windows_mime_mappings(self):
        # Some Windows registries map JavaScript to text/plain. Browsers reject
        # ES modules and nosniff workers with that otherwise-successful response.
        with patch('mimetypes.guess_type', return_value=('text/plain', None)):
            for path, expected_type in [
                ('app.js', 'text/javascript'),
                ('game-core.js', 'text/javascript'),
                ('tracker-worker.js', 'text/javascript'),
                ('diagnostics.js', 'text/javascript'),
                ('vendor/vision_bundle.mjs', 'text/javascript'),
                ('vendor/wasm/vision_wasm_internal.js', 'text/javascript'),
                ('vendor/wasm/vision_wasm_internal.wasm', 'application/wasm'),
            ]:
                with self.subTest(asset=path):
                    response = self.client.get('/static/' + path)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers['content-type'], expected_type)
                    self.assertEqual(response.headers['x-content-type-options'], 'nosniff')

    def test_asset_integrity(self):
        lock = json.loads((ROOT / 'assets.lock.json').read_text())
        self.assertEqual(lock['runtime'], '0.10.18')
        if not all((ROOT / 'static' / entry['path']).is_file() for entry in lock['files']):
            self.skipTest('Model/runtime assets absent; run scripts/setup_assets.py for the full checksum check')
        for entry in lock['files']:
            with self.subTest(asset=entry['path']):
                content = (ROOT / 'static' / entry['path']).read_bytes()
                self.assertEqual(len(content), entry['bytes'])
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry['sha256'])


if __name__ == '__main__':
    unittest.main()
