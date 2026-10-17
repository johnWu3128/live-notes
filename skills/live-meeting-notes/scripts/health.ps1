$ErrorActionPreference = 'Stop'
try {
    $health = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 3
    if ($health.status -ne 'ok') { throw 'The service returned an unexpected status.' }
    Write-Output 'OK http://127.0.0.1:8787'
} catch {
    Write-Error "Live Notes is unavailable: $($_.Exception.Message)"
    exit 1
}
