param(
    [switch]$NoBrowser,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $project '.live-notes.pid'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js 20 or newer.'
}

$major = [int]((node --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw "Node.js $(node --version) is too old. Version 20 or newer is required." }

try {
    $running = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 2
    if ($running.status -eq 'ok') {
        Write-Host 'Live Notes is already running: http://127.0.0.1:8787'
        if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8787' }
        exit 0
    }
} catch { }

if (-not (Test-Path (Join-Path $project 'node_modules'))) {
    & npm.cmd install --prefix $project
}
if ($Rebuild -or -not (Test-Path (Join-Path $project 'dist\index.html'))) {
    & npm.cmd run build --prefix $project
}

if (Test-Path $pidFile) {
    $oldPid = [int](Get-Content $pidFile -Raw)
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
        Write-Host 'Live Notes is already running: http://127.0.0.1:8787'
        if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8787' }
        exit 0
    }
}

$process = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $project -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
$health = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 2
        if ($health.status -eq 'ok') { break }
    } catch { Start-Sleep -Milliseconds 500 }
}

if (-not $health -or $health.status -ne 'ok') { throw 'Live Notes startup timed out. Run npm start to inspect logs.' }
Write-Host 'Live Notes started: http://127.0.0.1:8787'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8787' }
