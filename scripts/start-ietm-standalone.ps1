$ErrorActionPreference = "Stop"

$AppDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $AppDir "django_backend"
$Frontend= Join-Path $AppDir "frontend"
$Venv    = Join-Path $AppDir ".venv"
$Python  = Join-Path $Venv "Scripts\python.exe"
$Port    = 8000
$Url     = "http://localhost:$Port"

$LogDir = Join-Path $env:TEMP "IETMViewer"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$Log = Join-Path $LogDir "ietm-launch.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts $msg"
    Write-Host $line
    Add-Content -Path $Log -Value $line -ErrorAction SilentlyContinue
}

try {
    Log "=== IETM Viewer starting ==="
    Log "AppDir : $AppDir"
    Log "Python : $Python"
    Log "Log    : $Log"

    if (-not (Test-Path $AppDir))  { throw "AppDir not found: $AppDir" }
    if (-not (Test-Path $Backend)) { throw "Backend folder not found: $Backend" }
    if (-not (Test-Path $Python))  { throw "venv Python not found at $Python (setup-venv.ps1 likely failed during install - check $LogDir\setup.log)" }

    $ver = & $Python --version 2>&1
    Log "venv Python version: $ver"

    # Copy DB to user-writable location (C:\Program Files\ is read-only for non-admin)
    $UserData = Join-Path $env:APPDATA "IETMViewer"
    if (-not (Test-Path $UserData)) { New-Item -ItemType Directory -Path $UserData -Force | Out-Null }
    $UserDb   = Join-Path $UserData "db.sqlite3"
    $SourceDb = Join-Path $Backend "db.sqlite3"
    if (-not (Test-Path $UserDb)) {
        Log "Copying database to user folder: $UserDb"
        Copy-Item $SourceDb $UserDb
    } else {
        Log "Using existing user database: $UserDb"
    }

    $env:IETM_MODE              = "standalone"
    $env:IETM_STATIC_ROOT       = $Frontend
    $env:IETM_MEDIA_ROOT        = Join-Path $Backend "media"
    $env:IETM_DB_PATH           = $UserDb
    $env:DJANGO_SETTINGS_MODULE = "ietm_backend.settings"
    $env:SERVE_SPA              = "1"

    Log "Running migrations..."
    Set-Location $Backend
    $migrateOut = & $Python manage.py migrate --noinput --fake-initial 2>&1
    $migrateOut | ForEach-Object { Log "migrate: $_" }
    if ($LASTEXITCODE -ne 0) { throw "Migration failed (exit $LASTEXITCODE)" }

    Log "Opening browser at $Url"
    Start-Process $Url -ErrorAction SilentlyContinue

    Log "Starting Waitress server on $Url ..."
    & $Python -m waitress --host=127.0.0.1 --port=$Port ietm_backend.wsgi:application

} catch {
    Log "FATAL ERROR: $_"
    Log "ScriptStackTrace:"
    Log "$($_.ScriptStackTrace)"
    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host " IETM Viewer FAILED TO START" -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Log file: $Log" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Press Enter to close"
}
