param([switch]$NoBrowser, [switch]$Rebuild)

$project = if ($env:LIVE_NOTES_HOME) { $env:LIVE_NOTES_HOME } else { 'C:\Users\Administrator\Documents\Codex\2026-10-17\live-notes' }
$script = Join-Path $project 'scripts\start.ps1'
if (-not (Test-Path $script)) { throw "Live Notes project was not found: $project" }
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script)
if ($NoBrowser) { $arguments += '-NoBrowser' }
if ($Rebuild) { $arguments += '-Rebuild' }
& powershell.exe @arguments
