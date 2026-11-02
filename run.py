"""Launch with the installed Python; project-local packages, no virtual environment."""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.packages'))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='NEON PILOT local server')
    parser.add_argument('--test', action='store_true', help='run focused server and asset tests')
    args = parser.parse_args()
    if args.test:
        import unittest
        suite = unittest.defaultTestLoader.discover(str(ROOT / 'tests'), pattern='test_*.py')
        sys.exit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
    import uvicorn
    print(f'NEON PILOT | Python {sys.version.split()[0]} | http://127.0.0.1:8000', flush=True)
    uvicorn.run('app:app', host='127.0.0.1', port=8000, app_dir=str(ROOT), access_log=True)
