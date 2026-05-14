$ErrorActionPreference = "Stop"
$AppDir = $args[0]
$Log = Join-Path $AppDir "ietm-install.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $Log -Value "$ts $msg"
}

try {
    Log "=== Setup starting ==="
    Log "AppDir: $AppDir"

    Log "Looking for Python 3.11 specifically..."
    # ONLY accept 3.11 — wheels are cp311, won't work on 3.12+
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Python311\python.exe",
        "C:\Program Files\Python311\python.exe"
    )
    $python311 = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $python311) {
        throw "Python 3.11 not found at any expected location. Wheels are cp311-specific and will not work with other Python versions."
    }

    # Verify it actually IS Python 3.11
    $version = & $python311 --version 2>&1
    Log "Found Python at: $python311"
    Log "Version reported: $version"
    if ($version -notmatch "3\.11\.") {
        throw "Expected Python 3.11 but got: $version"
    }

    Log "Creating venv with Python 3.11..."
    & $python311 -m venv "$AppDir\.venv" 2>&1 | ForEach-Object { Log "venv: $_" }

    Log "Installing wheels (offline)..."
    $pipOutput = & "$AppDir\.venv\Scripts\pip.exe" install --no-index --find-links "$AppDir\wheels" -r "$AppDir\django_backend\requirements.txt" 2>&1
    $pipOutput | ForEach-Object { Log "pip: $_" }

    if ($LASTEXITCODE -ne 0) {
        throw "pip install failed with exit code $LASTEXITCODE"
    }

    Log "=== Setup complete ==="
} catch {
    Log "ERROR: $_"
    Log "Stack: $($_.ScriptStackTrace)"
    exit 1
}
