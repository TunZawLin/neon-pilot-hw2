param([string]$Python = "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe")
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath $Python)) { throw "Python not found: $Python. Pass -Python with an installed interpreter's full path." }
& $Python -c "import sys; print('Interpreter:', sys.executable); print(sys.version); assert sys.prefix == sys.base_prefix, 'Select an interpreter outside a virtual environment'"
if ($LASTEXITCODE -ne 0) { throw 'Interpreter check failed' }
& $Python -m pip install --target .packages --upgrade --index-url https://pypi.org/simple --no-cache-dir -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
& $Python scripts/setup_assets.py
if ($LASTEXITCODE -ne 0) { throw 'Asset setup failed' }
Write-Output 'Ready. Use the same Python interpreter to launch uvicorn (see README.md).'
