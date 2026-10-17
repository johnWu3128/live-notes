$project = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $project '.live-notes.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host 'No Live Notes process started by this script was found.'
    exit 0
}

$processId = [int](Get-Content $pidFile -Raw)
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($process) { Stop-Process -Id $processId -Force }
Remove-Item -LiteralPath $pidFile -Force
Write-Host 'Live Notes stopped.'
