$ErrorActionPreference = "Stop"
$AppDir = $args[0]
$Log = Join-Path $AppDir "ietm-migrate.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $Log -Value "$ts $msg"
}

try {
    Log "=== Migration starting ==="
    $env:IETM_MODE              = "standalone"
    $env:DJANGO_SETTINGS_MODULE = "ietm_backend.settings"
    $env:IETM_STATIC_ROOT       = Join-Path $AppDir "frontend"
    $env:IETM_MEDIA_ROOT        = Join-Path $AppDir "django_backend\media"

    Set-Location (Join-Path $AppDir "django_backend")
    # --fake-initial: skip CREATE TABLE if table already exists with matching schema
    # (the shipped db.sqlite3 has bookmarks/notes/etc. tables from old managed=False era)
    $out = & "$AppDir\.venv\Scripts\python.exe" manage.py migrate --noinput --fake-initial 2>&1
    $out | ForEach-Object { Log "migrate: $_" }
    if ($LASTEXITCODE -ne 0) { throw "migrate failed: exit $LASTEXITCODE" }
    Log "=== Migration complete ==="
} catch {
    Log "ERROR: $_"
    exit 1
}
