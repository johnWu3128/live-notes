$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $project '.live-notes.pid'
$candidateIds = @()

if (Test-Path $pidFile) {
    $candidateIds += [int](Get-Content $pidFile -Raw)
}

$listeners = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
$candidateIds += @($listeners | Select-Object -ExpandProperty OwningProcess)
$candidateIds = @($candidateIds | Sort-Object -Unique)

if (-not $candidateIds.Count) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Live Notes is not running.'
    exit 0
}

$stopped = $false
foreach ($candidateId in $candidateIds) {
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$candidateId" -ErrorAction SilentlyContinue
    if (-not $candidate) { continue }
    if (-not $candidate.CommandLine -or $candidate.CommandLine -notlike '*live-notes*server/index.ts*') {
        if ($listeners.OwningProcess -contains $candidateId) {
            throw "Refusing to stop PID $candidateId because port 8787 is not owned by Live Notes."
        }
        continue
    }
    & taskkill.exe /PID $candidateId /T /F | Out-Null
    $stopped = $true
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
if (-not $stopped) { throw 'No verified Live Notes server process was stopped.' }
Write-Host 'Live Notes stopped.'
