"""Copy an explicit source allowlist; never copy models, credentials, or evidence."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'upload'
FILES = ['app.py', 'run.py', 'setup.ps1', 'requirements.txt', 'README.md',
         'VERIFICATION.md', 'ASSETS.md', 'assets.lock.json', 'LICENSE', '.gitignore',
         '.github/workflows/ci.yml']


def main():
    files = [ROOT / name for name in FILES]
    files += sorted((ROOT / 'static').glob('*.js'))
    files += sorted((ROOT / 'static').glob('*.html'))
    files += sorted((ROOT / 'static').glob('*.css'))
    files += sorted((ROOT / 'tests').glob('*.py'))
    files += sorted((ROOT / 'tests').glob('*.mjs'))
    files += sorted((ROOT / 'scripts').glob('*.py'))
    for source in files:
        if not source.is_file():
            raise FileNotFoundError(source)
        target = DESTINATION / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    allowed = {source.relative_to(ROOT).as_posix() for source in files}
    unexpected = [p.relative_to(DESTINATION).as_posix() for p in DESTINATION.rglob('*')
                  if p.is_file() and '.git' not in p.relative_to(DESTINATION).parts
                  and p.relative_to(DESTINATION).as_posix() not in allowed]
    if unexpected:
        raise RuntimeError('Review unexpected upload files before publishing: ' + ', '.join(unexpected))
    print(DESTINATION)
    for name in sorted(allowed):
        print(name)


if __name__ == '__main__':
    main()
