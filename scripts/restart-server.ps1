# Restart the production server on a known-free port.
#
#   powershell -File scripts/restart-server.ps1
#
# `next start` fails with EADDRINUSE if an older server is still bound, and the
# stale process keeps serving the PREVIOUS build. Every smoke run against it is
# then meaningless — routes 404 and CSS chunk hashes mismatch — while looking
# like a real failure. This kills whatever holds the port first.

$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }

Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Output "stopping PID $($_.OwningProcess) on port $port"
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Seconds 2

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Error "port $port is still bound"
  exit 1
}

Write-Output "port $port free"
